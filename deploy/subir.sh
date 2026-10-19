#!/bin/bash
# Atualiza o código na VPS JEAN e reinicia. Rodar do Mac, na pasta PLANEJADORUELICON/:  bash deploy/subir.sh
# Sem --delete: .env e dados/ ficam intactos.
set -euo pipefail
cd "$(dirname "$0")/.."
rsync -rlptz --exclude .venv --exclude dados --exclude .env --exclude __pycache__ --exclude .git ./ vps-jean:/opt/planejador-uelicon/
ssh vps-jean 'cd /opt/planejador-uelicon && chown -R root:planejador . && chown -R planejador:planejador dados && venv/bin/pip install -q -r requirements.txt && systemctl restart planejador-uelicon && sleep 2 && systemctl is-active planejador-uelicon && curl -s -o /dev/null -w "saude %{http_code}\n" http://127.0.0.1:8761/saude'
