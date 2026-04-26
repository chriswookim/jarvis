#!/bin/bash
# NAS 배포 스크립트
# 사용법: bash deploy.sh

NAS="admin_nas@kenca.synology.me"
PORT=2288
REMOTE_DIR="/volume2/docker/jarvis"
SSH="ssh -p $PORT $NAS"
SCP="scp -P $PORT"

echo "=== Jarvis 배포 시작 ==="

upload() {
  local src="$1"
  local dst="$2"
  echo "  업로드: $src"
  cat "$src" | $SSH "cat > $dst"
}

# docker-compose.yml
upload "docker-compose.yml" "$REMOTE_DIR/docker-compose.yml"

# app/ 전체 Python 파일
$SSH "mkdir -p \
  $REMOTE_DIR/app/modules/ingestion \
  $REMOTE_DIR/app/modules/knowledge \
  $REMOTE_DIR/app/modules/memory \
  $REMOTE_DIR/app/modules/notification"

for f in $(find app -name "*.py"); do
  upload "$f" "$REMOTE_DIR/$f"
done

# 프론트엔드 static
echo "  프론트엔드 static 삭제 후 재업로드..."
$SSH "rm -rf $REMOTE_DIR/static && mkdir -p $REMOTE_DIR/static/assets"

for f in frontend/dist/assets/*; do
  fname=$(basename "$f")
  cat "$f" | $SSH "cat > $REMOTE_DIR/static/assets/$fname"
  echo "    assets/$fname"
done
cat frontend/dist/index.html | $SSH "cat > $REMOTE_DIR/static/index.html"

# 컨테이너 재시작 (app/ 볼륨 마운트로 코드 변경 즉시 반영)
echo "=== 컨테이너 재시작 ==="
$SSH "cd $REMOTE_DIR && sudo docker compose up -d 2>/dev/null || sudo docker-compose up -d"

echo "=== 배포 완료 ==="
echo "접속: http://kenca.synology.me:8089"
