#!/bin/bash
LOG=/d/.workbuddy/2026-10-13-19-46-11/note-ai/docker_wait.log
echo "开始等待 Docker daemon 就绪（最多约 7 分钟）..." > "$LOG"
READY=0
for i in $(seq 1 42); do
  if docker info >/dev/null 2>&1; then
    echo "Docker 就绪（第 $i 次检测）" >> "$LOG"
    READY=1
    break
  fi
  sleep 10
done
if [ "$READY" -ne 1 ]; then
  echo "超时：Docker 仍未就绪，请确认已打开 Docker Desktop" >> "$LOG"
  exit 1
fi
echo "=== 容器列表（含已停止）===" >> "$LOG"
docker ps -a --format "{{.Names}} | {{.Image}} | {{.Status}}" >> "$LOG" 2>&1
echo "=== 本地镜像 ===" >> "$LOG"
docker images --format "{{.Repository}}:{{.Tag}}" >> "$LOG" 2>&1
echo "DONE" >> "$LOG"
