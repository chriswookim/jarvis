import paramiko
import os

LOCAL_ROOT   = r'C:\Users\user\workspace\jarvis'
REMOTE_ROOT  = '/volume2/docker/jarvis'
NAS_PASSWORD = 'Tksdjqdusrndnjs@123'
EXCLUDE = {'.git', 'data', '__pycache__', '.env', 'node_modules', 'dist', 'graphify-out'}

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('kenca.synology.me', port=2288, username='admin_nas',
               password='Tksdjqdusrndnjs@123', timeout=10)

def ssh(cmd: str):
    chan = client.get_transport().open_session()
    chan.exec_command(cmd)
    chan.recv_exit_status()
    chan.close()

def upload(local: str, remote: str):
    """deploy.sh 방식: cat > remote (SFTP 미사용, chroot 우회)"""
    with open(local, 'rb') as f:
        content = f.read()
    chan = client.get_transport().open_session()
    chan.exec_command(f"cat > '{remote}'")
    chan.sendall(content)
    chan.shutdown_write()
    chan.recv_exit_status()
    chan.close()
    print(f'  up {remote.replace(REMOTE_ROOT, "")}')

# ── 1. 파일/디렉토리 목록 수집 ────────────────────────────────────────────────
dirs_to_create = []
files_to_upload = []

for root, subdirs, fnames in os.walk(LOCAL_ROOT):
    subdirs[:] = [d for d in subdirs if d not in EXCLUDE and not d.startswith('__')]
    rel = os.path.relpath(root, LOCAL_ROOT).replace(os.sep, '/')
    remote_dir = REMOTE_ROOT if rel == '.' else f'{REMOTE_ROOT}/{rel}'
    dirs_to_create.append(remote_dir)
    for f in fnames:
        if f not in EXCLUDE and f != 'upload_to_nas.py':
            files_to_upload.append((os.path.join(root, f), f'{remote_dir}/{f}'))

# frontend/dist → static
dist_dir = os.path.join(LOCAL_ROOT, 'frontend', 'dist')
if os.path.exists(dist_dir):
    for root, _, fnames in os.walk(dist_dir):
        rel = os.path.relpath(root, dist_dir).replace(os.sep, '/')
        remote_dir = f'{REMOTE_ROOT}/static' if rel == '.' else f'{REMOTE_ROOT}/static/{rel}'
        dirs_to_create.append(remote_dir)
        for f in fnames:
            files_to_upload.append((os.path.join(root, f), f'{remote_dir}/{f}'))

# ── 2. 디렉토리 생성 ──────────────────────────────────────────────────────────
print(f'=== 디렉토리 생성 ({len(dirs_to_create)}개) ===')
for d in dirs_to_create:
    ssh(f"mkdir -p '{d}'")

# ── 3. 파일 업로드 (SSH exec cat, deploy.sh 방식) ────────────────────────────
print(f'=== 파일 업로드 ({len(files_to_upload)}개) ===')
for local_path, remote_path in files_to_upload:
    upload(local_path, remote_path)

# ── 4. 컨테이너 재시작 (sudo -S 로 비밀번호 파이프) ──────────────────────────
print('\n=== 컨테이너 재시작 ===')
restart_cmd = (
    f"echo '{NAS_PASSWORD}' | sudo -S sh -c "
    f"'cd {REMOTE_ROOT} && /usr/local/bin/docker compose up --build -d 2>&1 "
    f"|| /usr/local/bin/docker-compose up --build -d 2>&1 "
    f"|| /usr/bin/docker compose up --build -d 2>&1'"
)
chan = client.get_transport().open_session()
chan.exec_command(restart_cmd)
out = chan.makefile('r').read()
chan.recv_exit_status()
chan.close()
print(out or '(출력 없음)')

client.close()
print(f'\n=== 배포 완료: {len(files_to_upload)}개 파일 ===')
print('접속: http://kenca.synology.me:8088')
