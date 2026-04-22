import paramiko
import os

LOCAL_ROOT = r'C:\Users\user\workspace\jarvis'
REMOTE_ROOT = '/volume2/docker/jarvis'
EXCLUDE = {'.git', 'data', '__pycache__', '.env', 'node_modules', 'dist'}

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('kenca.synology.me', port=2288, username='admin_nas', password='Tksdjqdusrndnjs@123', timeout=10)

dirs_to_create = []
files_to_upload = []

for root, dirs, files in os.walk(LOCAL_ROOT):
    dirs[:] = [d for d in dirs if d not in EXCLUDE and not d.startswith('__')]
    rel = os.path.relpath(root, LOCAL_ROOT).replace(os.sep, '/')
    remote_dir = REMOTE_ROOT if rel == '.' else REMOTE_ROOT + '/' + rel
    dirs_to_create.append(remote_dir)
    for f in files:
        if f not in EXCLUDE and f != 'upload_to_nas.py':
            files_to_upload.append((os.path.join(root, f), remote_dir + '/' + f))

# 디렉토리를 하나씩 생성 (완료 확인 후 다음 단계)
for d in dirs_to_create:
    chan = client.get_transport().open_session()
    chan.exec_command('mkdir -p ' + "'" + d + "'")
    chan.recv_exit_status()

# 파일 업로드
sftp = client.open_sftp()
for local_path, remote_path in files_to_upload:
    sftp.put(local_path, remote_path)
    print('  up ' + remote_path.replace(REMOTE_ROOT, ''))

sftp.close()
client.close()
print('\n완료: ' + str(len(files_to_upload)) + '개 파일')
