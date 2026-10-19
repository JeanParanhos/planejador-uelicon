# Planejador do Uélicon

O planejamento do Instagram do Uélicon: a semana de vídeos, o banco de assuntos por produto (Formação, Consulta,
Imersão, Vivendo de Rating, Geral), a folha do dia que o Uélicon grava e marca, e o andamento (planejado, gravado,
postado, atrasado).

No ar em https://planejador.vpsjean.com (o acesso cada um recebe do Jean).

## Para o Arlindo: como mexer e devolver

Você pode mudar o que quiser: textos, telas, tópicos de partida, regras. Para devolver:

1. Crie um *fork* deste repositório (botão **Fork** no GitHub) ou baixe o zip.
2. Faça as mudanças e rode na sua máquina (abaixo) para ver funcionando.
3. Abra um *Pull Request* para este repositório contando o que mudou e por quê, ou mande o zip para o Jean.

Quem coloca no ar é o Jean. Nada que você mudar no seu computador mexe no sistema que está no ar.

Se for usar o Claude para mexer, peça para ele ler o `CLAUDE.md` e o `docs/design/LINGUAGEM.md` primeiro.

## Rodar na sua máquina

Precisa de Python 3.11 ou mais novo.

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
export PLANEJADOR_DB=./dados/teste.db COOKIE_SEGURO=0
.venv/bin/python base.py criar
.venv/bin/python base.py usuario eu@teste.com "Arlindo" super 123456
.venv/bin/uvicorn app:app --port 8797 --reload
```

Abra http://127.0.0.1:8797 e entre com `eu@teste.com` / `123456`. O banco de teste fica em `dados/` e não vai para o GitHub.

## Onde fica cada coisa

| Arquivo | O quê |
|---|---|
| `app.py` | O servidor: login, regras de quem pode o quê, montar a semana, andamento |
| `base.py` | O banco: tabelas, abas de produto, tópicos e assuntos de partida, receitas |
| `web/index.html`, `web/app.js`, `web/estilo.css` | A tela inteira (sem build: salvou, recarregou) |
| `docs/design/LINGUAGEM.md` | O visual: segue a mesa da Verônica |

## Como funciona

- **Aba** (produto) → **tópico** (formato do vídeo, com os passos de como gravar) → **assunto** (a frase de abertura e o que falar).
- **Receita**: quantos vídeos cada dia tem e de que tópico. "Montar a semana" cria os vídeos e escolhe sozinho o assunto pronto que está há mais tempo sem uso.
- **Situação** de cada vídeo: a gravar, gravado, editado, postado, pulado. Atrasado é "a gravar" com o dia já passado.
- **Acessos**: administrador (tudo), equipe (planeja e acompanha), gravação (só a folha do dia e o botão de gravado).
