#!/bin/bash
# NAS 배포 스크립트 — 변경된 파일을 SSH로 업로드하고 컨테이너를 재시작합니다.
# 사용법: bash deploy.sh
# 비밀번호를 여러 번 물어볼 수 있습니다.

NAS="kenca@kenca.synology.me"
PORT=2288
REMOTE_DIR="/volume2/docker/jarvis"
SSH="ssh -p $PORT $NAS"

echo "=== Jarvis 배포 시작 ==="

upload() {
  local src="$1"
  local dst="$2"
  echo "  업로드: $src → $dst"
  cat "$src" | $SSH "cat > $dst"
}

# 백엔드 파일 업로드
upload "app/modules/knowledge/wiki.py"        "$REMOTE_DIR/app/modules/knowledge/wiki.py"
upload "app/main.py"                           "$REMOTE_DIR/app/main.py"

# 프론트엔드 dist 업로드
echo "  프론트엔드 static 파일 업로드 중..."
$SSH "rm -rf $REMOTE_DIR/static && mkdir -p $REMOTE_DIR/static/assets"

for f in frontend/dist/assets/*; do
  fname=$(basename "$f")
  cat "$f" | $SSH "cat > $REMOTE_DIR/static/assets/$fname"
  echo "  업로드: assets/$fname"
done
cat frontend/dist/index.html | $SSH "cat > $REMOTE_DIR/static/index.html"
echo "  업로드: index.html"

# 컨테이너 재시작
echo "=== 컨테이너 재시작 ==="
$SSH "cd $REMOTE_DIR && docker compose restart jarvis 2>/dev/null || docker-compose restart jarvis"

echo "=== 배포 완료 ==="
