"""Cria o banco, põe os formatos, os assuntos de partida e as receitas, e cuida dos usuários.

    python base.py criar                                  # banco novo (não mexe se já existe)
    python base.py usuario <login> "<Nome>" <papel> <senha>   # cria ou troca a senha (papel: super, equipe, gravador)
"""
import json
import sqlite3
import sys

from app import DB, agora, hash_senha

ESQUEMA = """
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY, login TEXT UNIQUE NOT NULL, nome TEXT NOT NULL,
  papel TEXT NOT NULL CHECK (papel IN ('super','equipe','gravador')), senha TEXT NOT NULL, ativo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS frentes (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, para TEXT NOT NULL DEFAULT '', palavra TEXT NOT NULL DEFAULT '',
  cor TEXT NOT NULL DEFAULT '#3f3f46', ordem INTEGER NOT NULL DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS formatos (
  id TEXT PRIMARY KEY, frente TEXT NOT NULL, nome TEXT NOT NULL, dica TEXT NOT NULL DEFAULT '',
  passos TEXT NOT NULL, palavra TEXT NOT NULL, ordem INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS assuntos (
  id INTEGER PRIMARY KEY, formato TEXT NOT NULL REFERENCES formatos(id), numero INTEGER NOT NULL,
  abertura TEXT NOT NULL DEFAULT '', pontos TEXT NOT NULL DEFAULT '', prova TEXT NOT NULL DEFAULT '',
  palavra TEXT NOT NULL DEFAULT '', ativo INTEGER NOT NULL DEFAULT 1, criado_por TEXT, atualizado_em TEXT,
  UNIQUE (formato, numero)
);
CREATE TABLE IF NOT EXISTS receitas (
  id INTEGER PRIMARY KEY, nome TEXT NOT NULL, dias TEXT NOT NULL, ativo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY, data TEXT NOT NULL, ordem INTEGER NOT NULL DEFAULT 0,
  formato TEXT NOT NULL REFERENCES formatos(id), assunto_id INTEGER REFERENCES assuntos(id) ON DELETE SET NULL,
  palavra TEXT, status TEXT NOT NULL DEFAULT 'a_gravar', link TEXT NOT NULL DEFAULT '', nota TEXT NOT NULL DEFAULT '',
  gravado_em TEXT, postado_em TEXT, criado_por TEXT, atualizado_por TEXT, atualizado_em TEXT
);
CREATE INDEX IF NOT EXISTS videos_data ON videos(data);
CREATE TABLE IF NOT EXISTS historico (
  id INTEGER PRIMARY KEY, video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  de TEXT, para TEXT, quem TEXT, quando TEXT
);
"""

# id, frente, nome, dica, passos, palavra
FORMATOS = [
    ("F-CX", "f", "Caixinha de perguntas", "Pergunta de quem quer trabalhar com crédito.",
     ["Mostra a pergunta na tela e lê em voz alta", "Responde com um caso real da sua operação", "Diz o que muda para quem trabalha com isso"], "FORMAÇÃO"),
    ("F-DP", "f", "Depoimento de aluno", "Aluno real contando o resultado. Precisa da autorização dele.",
     ["Mostra o aluno, o vídeo ou o print dele", "Conta como ele estava antes e o que conseguiu", "Diz que dá para seguir o mesmo caminho"], "FORMAÇÃO"),
    ("C-RE", "c", "React de consulta (tela verde)", "Relatório atrás do Uélicon, sem nome nem CPF.",
     ["Põe o relatório atrás de você, sem nome nem CPF", "Aponta o que o banco está vendo", "Explica com um exemplo do dia a dia"], "CONSULTA"),
    ("C-RT", "c", "Análise de rating", "Rating e score lado a lado.",
     ["Mostra o rating e o score lado a lado", "Explica por que um é alto e o outro não", "Diz o que derruba e o que sobe o rating"], "CONSULTA"),
    ("C-AD", "c", "Antes e depois", "Caso com número de antes e de depois.",
     ["Começa pelo número de antes", "Conta o que a consulta mostrou", "Fecha com o número de depois"], "CONSULTA"),
    ("C-CX", "c", "Caixinha de dúvidas do público", "Pergunta de quem quer crédito.",
     ["Mostra a pergunta na tela e lê em voz alta", "Uma frase: eu vejo isso toda semana nas consultas", "Explica com um exemplo do dia a dia"], "CONSULTA"),
    ("G-NT", "g", "Notícia do dia", "Fato do dia puxado para o crédito de quem assiste.",
     ["Lê a manchete", "Explica como isso mexe no crédito de quem assiste", "Diz o que a pessoa deve fazer agora"], "CONSULTA"),
    ("G-PL", "g", "Corte de palestra", "Trecho de até 1 minuto de palestra ou imersão.",
     ["Escolhe um trecho de até 1 minuto", "Põe a frase forte na tela no começo", "Termina chamando para a próxima imersão"], "IMERSÃO"),
    ("G-CR", "g", "Crença sobre negócios", "Posicionamento do Uélicon numa frase.",
     ["Fala a crença numa frase só", "Conta de onde ela vem, com um caso seu", "Diz como ela guia o seu trabalho"], "FORMAÇÃO"),
]

# formato: [(abertura, pontos, prova)]. Ponto de partida para o Arlindo completar.
ASSUNTOS = {
    "F-CX": [
        ("Quero trabalhar com você. Por onde eu começo?", "", ""),
        ("Preciso ter empresa aberta para ser consultor de crédito?", "", ""),
        ("Dá para fazer isso junto com o meu emprego de hoje?", "", ""),
        ("Como o consultor acha cliente no começo?", "", ""),
        ("Preciso entender de banco para começar?", "", ""),
        ("Quanto tempo leva para fechar o primeiro contrato?", "", ""),
    ],
    "F-DP": [("", "", "[nome do aluno] fechou o primeiro contrato no primeiro mês"),
             ("", "", "[nome do aluno] da imersão presencial conta o que mudou")],
    "C-RE": [
        ("Nome limpo e negado em todo lugar. Olha o que o relatório mostra.", "", ""),
        ("Você ganha 10 mil e o banco acha que você ganha 3.", "Renda presumida errada no sistema. A parcela de 3 mil não cabe na renda que o banco vê, e ele nega.", "Parcela de 3 mil, renda de 4 no sistema"),
        ("Pediu crédito em vários lugares no mesmo mês? O banco trava tudo.", "", ""),
    ],
    "C-RT": [
        ("Score 850 e o banco negou. Por quê?", "O banco não olha só o score. Ele tem uma nota por dentro, o rating, e nunca te mostra.", ""),
        ("Cartão sempre no limite derruba o seu rating.", "", ""),
    ],
    "C-AD": [
        ("Ela tinha 2.500 de limite. Hoje tem 55 mil.", "Nome limpo, limite baixo. A consulta mostrou o que travava e o que corrigir.", "De 2.500 para 55 mil de limite"),
        ("O banco achava que ele ganhava 4 mil. Ele ganha 12.", "Corrigimos a renda que o banco via e o financiamento saiu.", "Renda de 4 mil no sistema para 12 mil"),
        ("Negado em 3 bancos. Olha o que a consulta mostrou.", "", ""),
    ],
    "C-CX": [
        ("Uélicon, meu score está em 850 e o banco negou. Por quê?", "", ""),
        ("Uélicon, limpei o nome e paguei tudo. Por que o crédito não voltou?", "", ""),
        ("Uélicon, não tenho nome sujo e meu limite é baixo. O que está acontecendo?", "", ""),
        ("Uélicon, fui negado em 3 bancos no mesmo dia. Isso é possível?", "", ""),
        ("Uélicon, por que o banco me oferece empréstimo caro e nunca um cartão bom?", "", ""),
        ("Uélicon, pedi aumento de limite e negou. Quando peço de novo?", "", ""),
        ("Uélicon, eu movimento 40 mil por mês e o banco acha que eu ganho 4.500. Por quê?", "", ""),
        ("Uélicon, tenho conta no mesmo banco há 15 anos e ele não me dá nada. Mudo?", "", ""),
    ],
    "G-NT": [("", "", "[notícia do dia]")],
    "G-PL": [("O banco te dá uma nota e nunca te mostra.", "", "[trecho da última palestra]"),
             ("Como o consultor de crédito ganha dinheiro.", "", "")],
    "G-CR": [("Por que eu nunca prometo limpar nome.", "", ""),
             ("Crédito bem usado faz o negócio crescer.", "", ""),
             ("Por que eu ensino o que eu faço.", "", "")],
}

# Seg a Sáb. Rampa da call: 3, 4, 5, 6 e a semana fecha mais leve.
RECEITAS = [
    ("Rampa da call (3 a 6 por dia)", [
        ["F-CX", "C-RT", "G-NT"],
        ["F-DP", "C-AD", "G-NT", "C-CX"],
        ["F-CX", "C-RE", "G-PL", "C-CX", "C-AD"],
        ["F-DP", "C-RT", "G-NT", "C-CX", "F-CX", "G-CR"],
        ["F-CX", "C-AD", "G-NT", "C-RE"],
        ["G-PL", "C-CX"],
    ]),
    ("Mínimo viável (3 por dia)", [
        ["F-CX", "C-RT", "G-NT"], ["F-DP", "C-AD", "G-NT"], ["F-CX", "C-RE", "G-PL"],
        ["F-DP", "C-CX", "G-NT"], ["F-CX", "C-AD", "G-CR"], ["C-CX"],
    ]),
]


# Abas de produto (19/10, pedido do Jean: as mesmas do Everpages, mais Geral).
FRENTES = [
    ("f", "Formação", "quem quer trabalhar com crédito", "FORMAÇÃO", "#be185d", 1),
    ("c", "Consulta", "quem tem nome limpo, quer crédito e ouve não do banco", "CONSULTA", "#047857", 2),
    ("i", "Imersão", "quem quer o evento presencial ou online", "IMERSÃO", "#0e7490", 3),
    ("v", "Vivendo de Rating", "quem quer a mentoria de rating", "RATING", "#6d28d9", 4),
    ("g", "Geral", "notícia do dia e posicionamento", "CONSULTA", "#b45309", 5),
]
FORMATOS_NOVOS = [
    ("I-CH", "i", "Chamada para a imersão", "Convite direto para a próxima imersão, com data e lugar.",
     ["Diz a data e o lugar", "Conta o que a pessoa sai sabendo", "Chama para garantir a vaga"], "IMERSÃO"),
    ("I-DP", "i", "Depoimento de quem foi", "Aluno da imersão contando o que mudou.",
     ["Mostra quem foi", "Conta o antes e o depois", "Chama para a próxima turma"], "IMERSÃO"),
    ("V-AU", "v", "Trecho da mentoria", "Um minuto de um encontro do Vivendo de Rating.",
     ["Escolhe um trecho forte", "Põe a frase na tela no começo", "Chama para a mentoria"], "RATING"),
    ("V-RS", "v", "Resultado de mentorado", "Mentorado contando o resultado com número.",
     ["Começa pelo número", "Conta o que mudou no rating", "Chama para a mentoria"], "RATING"),
]


def migrar(c):
    """Idempotente: roda em banco novo e no que já está no ar."""
    c.executescript(ESQUEMA)
    if "ativo" not in [r[1] for r in c.execute("PRAGMA table_info(formatos)")]:
        c.execute("ALTER TABLE formatos ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1")
    if not c.execute("SELECT 1 FROM frentes").fetchone():
        c.executemany("INSERT INTO frentes (id, nome, para, palavra, cor, ordem) VALUES (?,?,?,?,?,?)", FRENTES)
        c.execute("UPDATE formatos SET frente='i' WHERE id='G-PL'")  # corte de palestra vende a imersão
        base = c.execute("SELECT coalesce(max(ordem),0) FROM formatos").fetchone()[0]
        for i, (fid, fr, nome, dica, passos, palavra) in enumerate(FORMATOS_NOVOS, 1):
            c.execute("INSERT OR IGNORE INTO formatos (id, frente, nome, dica, passos, palavra, ordem) VALUES (?,?,?,?,?,?,?)", (fid, fr, nome, dica, json.dumps(passos, ensure_ascii=False), palavra, base + i))
    c.execute("INSERT OR IGNORE INTO frentes (id, nome) SELECT DISTINCT frente, frente FROM formatos")


def criar():
    DB.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB)
    c.executescript(ESQUEMA)
    if not c.execute("SELECT 1 FROM formatos").fetchone():
        for i, (fid, fr, nome, dica, passos, palavra) in enumerate(FORMATOS):
            c.execute("INSERT INTO formatos (id, frente, nome, dica, passos, palavra, ordem) VALUES (?,?,?,?,?,?,?)", (fid, fr, nome, dica, json.dumps(passos, ensure_ascii=False), palavra, i))
        for fid, itens in ASSUNTOS.items():
            palavra = next(f[5] for f in FORMATOS if f[0] == fid)
            for n, (ab, po, pr) in enumerate(itens, 1):
                c.execute("INSERT INTO assuntos (formato, numero, abertura, pontos, prova, palavra, criado_por, atualizado_em) VALUES (?,?,?,?,?,?,?,?)",
                          (fid, n, ab, po, pr, palavra, "Claude", agora()))
        for nome, dias in RECEITAS:
            c.execute("INSERT INTO receitas (nome, dias) VALUES (?,?)", (nome, json.dumps(dias)))
    migrar(c)
    c.commit()
    print("banco pronto em", DB)


def usuario(login, nome, papel, senha):
    c = sqlite3.connect(DB)
    c.execute("""INSERT INTO usuarios (login, nome, papel, senha) VALUES (?,?,?,?)
                 ON CONFLICT(login) DO UPDATE SET nome=excluded.nome, papel=excluded.papel, senha=excluded.senha, ativo=1""",
              (login.lower(), nome, papel, hash_senha(senha)))
    c.commit()
    print("usuário", login, "pronto")


if __name__ == "__main__":
    if sys.argv[1:2] == ["criar"]:
        criar()
    elif sys.argv[1:2] == ["usuario"] and len(sys.argv) == 6:
        usuario(*sys.argv[2:])
    else:
        print(__doc__)
