# Planejador do Uélicon

Planejamento do Instagram do Uélicon: a semana de vídeos (formação, consulta, geral), o banco de assuntos que o Arlindo preenche, a folha do dia que o Uélicon grava e marca, e o andamento (planejado, gravado, postado, atrasado). Nasceu da call Jean + Arlindo de 19/10/2026.

## Onde roda
- https://planejador.vpsjean.com · **VPS JEAN** `/opt/planejador-uelicon`, serviço systemd `planejador-uelicon` (127.0.0.1:8761), bloco próprio no `/etc/caddy/Caddyfile`, registro A `planejador` na zona `vpsjean.com` (Hostinger, conta 1).
- Acessos: `Cofre/PLANEJADORUELICON/acessos.md`. Papéis: `super` e `equipe` veem tudo; `gravador` (Uélicon) só a folha do dia e o botão de gravado.

## Stack
Python 3.12 + FastAPI + SQLite (`dados/planejador.db`, só na VPS). Front sem build: `web/index.html`, `web/estilo.css`, `web/app.js` (rotas por hash). Sem dependência além de fastapi e uvicorn.

| Arquivo | O quê |
|---|---|
| `app.py` | API, login (scrypt + cookie assinado), regras de quem pode o quê, escolha automática de assunto |
| `base.py` | Esquema, formatos, assuntos de partida, receitas; `python base.py usuario <login> "<Nome>" <papel> <senha>` |
| `deploy/` | systemd, bloco do Caddy, `subir.sh` |
| `docs/design/LINGUAGEM.md` | Visual: base do Design da Central + pele Roxo; ler antes de mexer em tela |

## Regras do produto
- Frente (f, c, g) → formato (`F-CX`, `C-RT`...) → assunto numerado. Assunto "pronto" = frase de abertura + o que falar.
- Montar a semana: a receita diz os formatos de cada dia; cada vídeo recebe o assunto pronto do formato que está há mais tempo sem uso, sem repetir na semana. Remontar troca só o que está "a gravar".
- Situação: a gravar, gravado, editado, postado, pulado. Toda troca vai para `historico`. Atrasado = a gravar com data passada.
- Escrita só com o cabeçalho `x-planejador: 1` (a tela manda); sem ele, 403.

## Rodar, testar, subir
- Local: `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`, `PLANEJADOR_DB=/tmp/t.db COOKIE_SEGURO=0 .venv/bin/python base.py criar`, criar usuário, `.venv/bin/uvicorn app:app --port 8797`.
- Subir: `bash deploy/subir.sh` (rsync sem apagar + restart). Banco e `.env` só existem na VPS.

## Próximos passos combinados
- Notícias do dia caindo sozinhas no formato Notícia (hoje é assunto em branco para preencher).
- Ler do Instagram/ManyChat o que foi postado e quantos comentaram a palavra (respeitar a regra de limite da Meta do CLAUDE.md da central).
