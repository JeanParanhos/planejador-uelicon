"""Planejador do Uélicon: semana de conteúdo do Instagram, banco de assuntos, folha do dia e andamento.

FastAPI + SQLite, sem build de front. A tela é web/ (um HTML, um CSS, um JS).
"""
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

AQUI = Path(__file__).resolve().parent
DB = Path(os.environ.get("PLANEJADOR_DB", AQUI / "dados" / "planejador.db"))
SEGREDO = os.environ.get("PLANEJADOR_SEGREDO", "troque-isto-no-env")
COOKIE_SEGURO = os.environ.get("COOKIE_SEGURO", "1") == "1"
FUSO = ZoneInfo("America/Sao_Paulo")
SESSAO_DIAS = 30

STATUS = ["a_gravar", "gravado", "editado", "postado", "pulado"]


def frentes():
    with con() as c:
        return linhas(c.execute("SELECT * FROM frentes WHERE ativo=1 ORDER BY ordem, nome"))


def hoje() -> date:
    return datetime.now(FUSO).date()


def agora() -> str:
    return datetime.now(FUSO).strftime("%Y-%m-%d %H:%M")


def con():
    c = sqlite3.connect(DB, timeout=10)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    return c


def linhas(cur):
    return [dict(r) for r in cur.fetchall()]


# ---------- senha e sessão ----------

def hash_senha(senha: str) -> str:
    sal = secrets.token_hex(16)
    h = hashlib.scrypt(senha.encode(), salt=bytes.fromhex(sal), n=2**14, r=8, p=1).hex()
    return f"scrypt${sal}${h}"


def confere_senha(senha: str, guardado: str) -> bool:
    try:
        _, sal, h = guardado.split("$")
        novo = hashlib.scrypt(senha.encode(), salt=bytes.fromhex(sal), n=2**14, r=8, p=1).hex()
        return hmac.compare_digest(novo, h)
    except Exception:
        return False


def assina(uid: int) -> str:
    venc = int(time.time()) + SESSAO_DIAS * 86400
    corpo = f"{uid}.{venc}"
    mac = hmac.new(SEGREDO.encode(), corpo.encode(), hashlib.sha256).hexdigest()
    return f"{corpo}.{mac}"


def le_sessao(valor: str | None):
    if not valor:
        return None
    try:
        uid, venc, mac = valor.split(".")
        corpo = f"{uid}.{venc}"
        certo = hmac.new(SEGREDO.encode(), corpo.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(certo, mac) or int(venc) < time.time():
            return None
        with con() as c:
            r = c.execute("SELECT id, login, nome, papel FROM usuarios WHERE id=? AND ativo=1", (int(uid),)).fetchone()
        return dict(r) if r else None
    except Exception:
        return None


TENTATIVAS: dict[str, list[float]] = {}


def usuario(req: Request, papeis=("super", "equipe", "gravador")):
    u = le_sessao(req.cookies.get("sessao"))
    if not u:
        raise HTTPException(401, "Entre de novo para continuar.")
    if u["papel"] not in papeis:
        raise HTTPException(403, "Seu acesso não permite isso.")
    return u


def equipe(req: Request):
    return usuario(req, ("super", "equipe"))


# ---------- app ----------

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")
async def cabecalhos(req: Request, chamar):
    # Escrita só com o cabeçalho que a nossa tela manda (barra pedido vindo de outro site).
    if req.method in ("POST", "PATCH", "PUT", "DELETE") and req.url.path.startswith("/api/"):
        if req.headers.get("x-planejador") != "1":
            return JSONResponse({"detail": "Pedido recusado."}, status_code=403)
    resp = await chamar(req)
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'"
    )
    resp.headers["X-Content-Type-Options"] = "nosniff"
    if req.url.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


@app.get("/saude")
def saude():
    with con() as c:
        c.execute("SELECT 1")
    return {"ok": True}


@app.post("/api/entrar")
async def entrar(req: Request, resp: Response):
    ip = req.headers.get("x-forwarded-for", req.client.host if req.client else "?").split(",")[0].strip()
    janela = [t for t in TENTATIVAS.get(ip, []) if t > time.time() - 900]
    if len(janela) >= 10:
        raise HTTPException(429, "Muitas tentativas. Espere 15 minutos.")
    d = await req.json()
    login = str(d.get("login", "")).strip().lower()
    with con() as c:
        r = c.execute("SELECT id, senha FROM usuarios WHERE lower(login)=? AND ativo=1", (login,)).fetchone()
    if not r or not confere_senha(str(d.get("senha", "")), r["senha"]):
        TENTATIVAS[ip] = janela + [time.time()]
        raise HTTPException(401, "Usuário ou senha não conferem.")
    TENTATIVAS.pop(ip, None)
    resp.set_cookie("sessao", assina(r["id"]), max_age=SESSAO_DIAS * 86400, httponly=True,
                    secure=COOKIE_SEGURO, samesite="strict")
    return {"ok": True}


@app.post("/api/sair")
def sair(resp: Response):
    resp.delete_cookie("sessao")
    return {"ok": True}


@app.get("/api/eu")
def eu(req: Request):
    u = usuario(req)
    return {"usuario": u, "hoje": hoje().isoformat(), "frentes": frentes(), "status": STATUS,
            "formatos": formatos()}


def formatos():
    with con() as c:
        fs = linhas(c.execute("SELECT * FROM formatos ORDER BY ordem"))
    for f in fs:
        f["passos"] = json.loads(f["passos"])
    return fs


# ---------- assuntos ----------

CAMPOS_ASSUNTO = ("formato", "abertura", "pontos", "prova", "palavra", "ativo")


def completo(a) -> bool:
    return bool((a.get("abertura") or "").strip()) and bool((a.get("pontos") or "").strip())


@app.get("/api/assuntos")
def assuntos(req: Request):
    equipe(req)
    with con() as c:
        rs = linhas(c.execute("""
            SELECT a.*, (SELECT max(v.data) FROM videos v WHERE v.assunto_id=a.id) AS ultimo_uso,
                   (SELECT count(*) FROM videos v WHERE v.assunto_id=a.id) AS vezes,
                   (SELECT count(*) FROM videos v WHERE v.assunto_id=a.id AND v.status='postado') AS postados
            FROM assuntos a ORDER BY a.formato, a.numero"""))
    for a in rs:
        a["completo"] = completo(a)
    return rs


@app.post("/api/assuntos")
async def novo_assunto(req: Request):
    u = equipe(req)
    d = await req.json()
    fm = d.get("formato")
    with con() as c:
        if not c.execute("SELECT 1 FROM formatos WHERE id=?", (fm,)).fetchone():
            raise HTTPException(400, "Formato não existe.")
        n = c.execute("SELECT coalesce(max(numero),0)+1 FROM assuntos WHERE formato=?", (fm,)).fetchone()[0]
        palavra = d.get("palavra") or c.execute("SELECT palavra FROM formatos WHERE id=?", (fm,)).fetchone()[0]
        cur = c.execute("""INSERT INTO assuntos (formato, numero, abertura, pontos, prova, palavra, criado_por, atualizado_em)
                           VALUES (?,?,?,?,?,?,?,?)""",
                        (fm, n, d.get("abertura", ""), d.get("pontos", ""), d.get("prova", ""), palavra, u["nome"], agora()))
        return {"id": cur.lastrowid}


@app.patch("/api/assuntos/{aid}")
async def muda_assunto(aid: int, req: Request):
    equipe(req)
    d = await req.json()
    sets = {k: d[k] for k in CAMPOS_ASSUNTO if k in d and k != "formato"}
    if not sets:
        return {"ok": True}
    sets["atualizado_em"] = agora()
    with con() as c:
        c.execute(f"UPDATE assuntos SET {', '.join(k + '=?' for k in sets)} WHERE id=?", (*sets.values(), aid))
    return {"ok": True}


# ---------- receitas ----------

@app.get("/api/receitas")
def receitas(req: Request):
    equipe(req)
    with con() as c:
        rs = linhas(c.execute("SELECT * FROM receitas WHERE ativo=1 ORDER BY id"))
    for r in rs:
        r["dias"] = json.loads(r["dias"])
    return rs


def valida_dias(dias):
    ids = {f["id"] for f in formatos()}
    if not isinstance(dias, list) or len(dias) != 6:
        raise HTTPException(400, "A receita precisa dos 6 dias.")
    for dia in dias:
        if not isinstance(dia, list) or any(x not in ids for x in dia):
            raise HTTPException(400, "Formato desconhecido na receita.")
    return dias


@app.post("/api/receitas")
async def nova_receita(req: Request):
    equipe(req)
    d = await req.json()
    dias = valida_dias(d.get("dias") or [[] for _ in range(6)])
    with con() as c:
        cur = c.execute("INSERT INTO receitas (nome, dias) VALUES (?,?)", (d.get("nome") or "Receita nova", json.dumps(dias)))
        return {"id": cur.lastrowid}


@app.put("/api/receitas/{rid}")
async def muda_receita(rid: int, req: Request):
    equipe(req)
    d = await req.json()
    with con() as c:
        if "dias" in d:
            c.execute("UPDATE receitas SET dias=? WHERE id=?", (json.dumps(valida_dias(d["dias"])), rid))
        if "nome" in d:
            c.execute("UPDATE receitas SET nome=? WHERE id=?", (d["nome"] or "Receita", rid))
        if d.get("apagar"):
            c.execute("UPDATE receitas SET ativo=0 WHERE id=?", (rid,))
    return {"ok": True}


# ---------- vídeos ----------

def segunda(d: date) -> date:
    return d - timedelta(days=d.weekday())


def le_data(s) -> date:
    try:
        return date.fromisoformat(str(s))
    except Exception:
        raise HTTPException(400, "Data inválida.")


SQL_VIDEO = """
    SELECT v.*, a.numero AS a_numero, a.abertura, a.pontos, a.prova, a.palavra AS a_palavra,
           f.frente, f.nome AS formato_nome
    FROM videos v JOIN formatos f ON f.id=v.formato LEFT JOIN assuntos a ON a.id=v.assunto_id
"""


def video_saida(v):
    v["palavra_final"] = v.get("palavra") or v.get("a_palavra") or ""
    v["completo"] = bool(v.get("assunto_id")) and completo(v)
    return v


def escolhe_assunto(c, formato, ja_usados: set):
    """Assunto pronto do formato, o que está há mais tempo sem uso, sem repetir na semana."""
    rs = c.execute("""
        SELECT a.id, a.abertura, a.pontos, (SELECT max(v.data) FROM videos v WHERE v.assunto_id=a.id) AS ult
        FROM assuntos a WHERE a.formato=? AND a.ativo=1 ORDER BY ult IS NOT NULL, ult, a.numero""", (formato,)).fetchall()
    prontos = [r for r in rs if completo(dict(r))]
    for lista in (prontos, rs):
        for r in lista:
            if r["id"] not in ja_usados:
                return r["id"]
    return None


@app.get("/api/semana")
def semana(req: Request, inicio: str | None = None):
    equipe(req)
    seg = segunda(le_data(inicio) if inicio else hoje())
    fim = seg + timedelta(days=5)
    with con() as c:
        vs = linhas(c.execute(SQL_VIDEO + " WHERE v.data BETWEEN ? AND ? ORDER BY v.data, v.ordem, v.id",
                              (seg.isoformat(), fim.isoformat())))
    return {"inicio": seg.isoformat(), "videos": [video_saida(v) for v in vs]}


@app.post("/api/semana/montar")
async def montar(req: Request):
    u = equipe(req)
    d = await req.json()
    seg = segunda(le_data(d.get("inicio")))
    with con() as c:
        r = c.execute("SELECT dias FROM receitas WHERE id=? AND ativo=1", (d.get("receita"),)).fetchone()
        if not r:
            raise HTTPException(400, "Escolha uma receita.")
        dias = json.loads(r["dias"])
        fim = (seg + timedelta(days=5)).isoformat()
        if d.get("substituir"):
            # Só some o que ainda não foi gravado; o que já andou fica.
            c.execute("DELETE FROM videos WHERE data BETWEEN ? AND ? AND status='a_gravar'", (seg.isoformat(), fim))
        usados = {x[0] for x in c.execute("SELECT assunto_id FROM videos WHERE data BETWEEN ? AND ? AND assunto_id IS NOT NULL",
                                          (seg.isoformat(), fim))}
        criados = 0
        for i, fms in enumerate(dias):
            dia = (seg + timedelta(days=i)).isoformat()
            ja = c.execute("SELECT count(*) FROM videos WHERE data=?", (dia,)).fetchone()[0]
            if ja and not d.get("substituir"):
                continue
            fms = list(fms)
            for (ficou,) in c.execute("SELECT formato FROM videos WHERE data=?", (dia,)).fetchall():
                if ficou in fms:  # o que já foi gravado conta como parte da receita do dia
                    fms.remove(ficou)
            for j, fm in enumerate(fms):
                aid = escolhe_assunto(c, fm, usados)
                if aid:
                    usados.add(aid)
                c.execute("INSERT INTO videos (data, ordem, formato, assunto_id, status, criado_por, atualizado_em) VALUES (?,?,?,?,?,?,?)",
                          (dia, ja + j, fm, aid, "a_gravar", u["nome"], agora()))
                criados += 1
    return {"criados": criados}


@app.post("/api/videos")
async def novo_video(req: Request):
    u = equipe(req)
    d = await req.json()
    dia = le_data(d.get("data"))
    fm = d.get("formato")
    with con() as c:
        if not c.execute("SELECT 1 FROM formatos WHERE id=?", (fm,)).fetchone():
            raise HTTPException(400, "Formato não existe.")
        seg = segunda(dia)
        usados = {x[0] for x in c.execute("SELECT assunto_id FROM videos WHERE data BETWEEN ? AND ? AND assunto_id IS NOT NULL",
                                          (seg.isoformat(), (seg + timedelta(days=5)).isoformat()))}
        ordem = c.execute("SELECT coalesce(max(ordem)+1,0) FROM videos WHERE data=?", (dia.isoformat(),)).fetchone()[0]
        cur = c.execute("INSERT INTO videos (data, ordem, formato, assunto_id, status, criado_por, atualizado_em) VALUES (?,?,?,?,?,?,?)",
                        (dia.isoformat(), ordem, fm, escolhe_assunto(c, fm, usados), "a_gravar", u["nome"], agora()))
        return {"id": cur.lastrowid}


@app.patch("/api/videos/{vid}")
async def muda_video(vid: int, req: Request):
    u = usuario(req)
    d = await req.json()
    permitidos = ("status",) if u["papel"] == "gravador" else ("formato", "assunto_id", "palavra", "status", "link", "nota", "data")
    sets = {k: d[k] for k in permitidos if k in d}
    if "status" in sets and sets["status"] not in STATUS:
        raise HTTPException(400, "Situação inválida.")
    if u["papel"] == "gravador" and sets.get("status") not in (None, "a_gravar", "gravado"):
        raise HTTPException(403, "Você marca só se gravou.")
    if "data" in sets:
        sets["data"] = le_data(sets["data"]).isoformat()
    with con() as c:
        v = c.execute("SELECT * FROM videos WHERE id=?", (vid,)).fetchone()
        if not v:
            raise HTTPException(404, "Vídeo não encontrado.")
        if "formato" in sets and sets["formato"] != v["formato"]:
            seg = segunda(date.fromisoformat(v["data"]))
            usados = {x[0] for x in c.execute("SELECT assunto_id FROM videos WHERE data BETWEEN ? AND ? AND assunto_id IS NOT NULL AND id<>?",
                                              (seg.isoformat(), (seg + timedelta(days=5)).isoformat(), vid))}
            sets.setdefault("assunto_id", escolhe_assunto(c, sets["formato"], usados))
            sets.setdefault("palavra", None)
        if "status" in sets and sets["status"] != v["status"]:
            marca = {"gravado": "gravado_em", "postado": "postado_em"}.get(sets["status"])
            if marca:
                sets[marca] = agora()
            c.execute("INSERT INTO historico (video_id, de, para, quem, quando) VALUES (?,?,?,?,?)",
                      (vid, v["status"], sets["status"], u["nome"], agora()))
        if not sets:
            return {"ok": True}
        sets["atualizado_em"] = agora()
        sets["atualizado_por"] = u["nome"]
        c.execute(f"UPDATE videos SET {', '.join(k + '=?' for k in sets)} WHERE id=?", (*sets.values(), vid))
    return {"ok": True}


@app.delete("/api/videos/{vid}")
def apaga_video(vid: int, req: Request):
    equipe(req)
    with con() as c:
        c.execute("DELETE FROM videos WHERE id=?", (vid,))
    return {"ok": True}


@app.get("/api/dia")
def dia(req: Request, data: str | None = None):
    usuario(req)
    d = le_data(data) if data else hoje()
    with con() as c:
        vs = linhas(c.execute(SQL_VIDEO + " WHERE v.data=? AND v.status<>'pulado' ORDER BY v.ordem, v.id", (d.isoformat(),)))
        prox = c.execute("SELECT min(data) FROM videos WHERE data>? AND status='a_gravar'", (d.isoformat(),)).fetchone()[0]
        ant = c.execute("SELECT max(data) FROM videos WHERE data<?", (d.isoformat(),)).fetchone()[0]
    return {"data": d.isoformat(), "videos": [video_saida(v) for v in vs], "proximo": prox, "anterior": ant}


# ---------- andamento ----------

@app.get("/api/andamento")
def andamento(req: Request):
    equipe(req)
    h = hoje()
    seg = segunda(h)
    semanas = []
    with con() as c:
        for k in range(5, -2, -1):
            s = seg - timedelta(weeks=k)
            f = s + timedelta(days=5)
            r = c.execute("""SELECT count(*) tot,
                 sum(status IN ('gravado','editado','postado')) grav,
                 sum(status='postado') post, sum(status='pulado') pul,
                 sum(status='a_gravar' AND data<?) atras
                 FROM videos WHERE data BETWEEN ? AND ?""", (h.isoformat(), s.isoformat(), f.isoformat())).fetchone()
            por = linhas(c.execute("""SELECT fm.frente, count(*) tot, sum(v.status IN ('gravado','editado','postado')) grav,
                 sum(v.status='postado') post FROM videos v JOIN formatos fm ON fm.id=v.formato
                 WHERE v.data BETWEEN ? AND ? GROUP BY fm.frente""", (s.isoformat(), f.isoformat())))
            semanas.append({"inicio": s.isoformat(), "total": r["tot"] or 0, "gravados": r["grav"] or 0,
                            "postados": r["post"] or 0, "pulados": r["pul"] or 0, "atrasados": r["atras"] or 0,
                            "por_frente": {p["frente"]: p for p in por}, "atual": s == seg})
        atrasados = linhas(c.execute(SQL_VIDEO + " WHERE v.status='a_gravar' AND v.data<? AND v.data>=? ORDER BY v.data, v.ordem",
                                     (h.isoformat(), (h - timedelta(days=21)).isoformat())))
        sem_post = linhas(c.execute(SQL_VIDEO + " WHERE v.status IN ('gravado','editado') ORDER BY v.data, v.ordem"))
        dias = linhas(c.execute("""SELECT data, count(*) tot, sum(status IN ('gravado','editado','postado')) grav, sum(status='postado') post
             FROM videos WHERE data BETWEEN ? AND ? AND status<>'pulado' GROUP BY data""", (seg.isoformat(), (seg + timedelta(days=5)).isoformat())))
        df = {}
        for r in c.execute("""SELECT v.data, fm.frente, count(*) tot, sum(v.status IN ('gravado','editado','postado')) grav
             FROM videos v JOIN formatos fm ON fm.id=v.formato WHERE v.data BETWEEN ? AND ? AND v.status<>'pulado'
             GROUP BY v.data, fm.frente""", (seg.isoformat(), (seg + timedelta(days=5)).isoformat())):
            df.setdefault(r["data"], {})[r["frente"]] = {"tot": r["tot"], "grav": r["grav"] or 0}
        falta = c.execute("SELECT count(*) FROM assuntos WHERE ativo=1 AND (trim(abertura)='' OR trim(pontos)='')").fetchone()[0]
        hist = linhas(c.execute("""SELECT h.*, f.nome formato_nome, v.data FROM historico h JOIN videos v ON v.id=h.video_id
             JOIN formatos f ON f.id=v.formato ORDER BY h.id DESC LIMIT 15"""))
    return {"hoje": h.isoformat(), "semanas": semanas, "atrasados": [video_saida(v) for v in atrasados],
            "sem_post": [video_saida(v) for v in sem_post], "dias": dias, "dias_frente": df, "assuntos_incompletos": falta, "historico": hist}


# ---------- início: o que fazer agora ----------

@app.get("/api/inicio")
def inicio(req: Request):
    equipe(req)
    h = hoje()
    seg = segunda(h)
    with con() as c:
        def vids(onde, *args):
            return [video_saida(v) for v in linhas(c.execute(SQL_VIDEO + " WHERE " + onde + " ORDER BY v.data, v.ordem, v.id", args))]
        hoje_v = vids("v.data=? AND v.status<>'pulado'", h.isoformat())
        # Próximos 3 dias com assunto faltando: é o que o Arlindo precisa preencher primeiro.
        preencher = [v for v in vids("v.data BETWEEN ? AND ? AND v.status='a_gravar'", h.isoformat(), (h + timedelta(days=3)).isoformat())
                     if not v["completo"]]
        atrasados = vids("v.status='a_gravar' AND v.data<? AND v.data>=?", h.isoformat(), (h - timedelta(days=21)).isoformat())
        sem_post = vids("v.status IN ('gravado','editado')")
        r = c.execute("""SELECT count(*) tot, sum(status IN ('gravado','editado','postado')) grav, sum(status='postado') post
             FROM videos WHERE data BETWEEN ? AND ? AND status<>'pulado'""", (seg.isoformat(), (seg + timedelta(days=5)).isoformat())).fetchone()
        prox = c.execute("SELECT count(*) FROM videos WHERE data BETWEEN ? AND ?",
                         ((seg + timedelta(days=7)).isoformat(), (seg + timedelta(days=12)).isoformat())).fetchone()[0]
    return {"hoje": h.isoformat(), "videos_hoje": hoje_v, "preencher": preencher, "atrasados": atrasados, "sem_post": sem_post,
            "semana": {"inicio": seg.isoformat(), "total": r["tot"] or 0, "gravados": r["grav"] or 0, "postados": r["post"] or 0},
            "proxima_semana_montada": prox > 0, "proxima_inicio": (seg + timedelta(days=7)).isoformat()}


# ---------- configurações: pessoas e formatos ----------

PAPEIS = ("super", "equipe", "gravador")


@app.get("/api/usuarios")
def lista_usuarios(req: Request):
    equipe(req)
    with con() as c:
        return linhas(c.execute("SELECT id, login, nome, papel, ativo FROM usuarios ORDER BY ativo DESC, nome"))


@app.post("/api/usuarios")
async def novo_usuario(req: Request):
    u = equipe(req)
    d = await req.json()
    login, nome, papel, senha = (str(d.get(k, "")).strip() for k in ("login", "nome", "papel", "senha"))
    if not login or not nome or len(senha) < 6:
        raise HTTPException(400, "Preencha nome, usuário e uma senha de 6 letras ou mais.")
    if papel not in PAPEIS or (papel == "super" and u["papel"] != "super"):
        raise HTTPException(403, "Esse acesso só o Jean dá.")
    with con() as c:
        if c.execute("SELECT 1 FROM usuarios WHERE lower(login)=?", (login.lower(),)).fetchone():
            raise HTTPException(400, "Já existe alguém com esse usuário.")
        cur = c.execute("INSERT INTO usuarios (login, nome, papel, senha) VALUES (?,?,?,?)", (login.lower(), nome, papel, hash_senha(senha)))
        return {"id": cur.lastrowid}


@app.patch("/api/usuarios/{uid}")
async def muda_usuario(uid: int, req: Request):
    u = equipe(req)
    d = await req.json()
    with con() as c:
        alvo = c.execute("SELECT * FROM usuarios WHERE id=?", (uid,)).fetchone()
        if not alvo:
            raise HTTPException(404, "Pessoa não encontrada.")
        if u["papel"] != "super" and (alvo["papel"] == "super" or d.get("papel") == "super"):
            raise HTTPException(403, "Esse acesso só o Jean muda.")
        if uid == u["id"] and (d.get("ativo") == 0 or ("papel" in d and d["papel"] != u["papel"])):
            raise HTTPException(400, "Você não pode tirar o seu próprio acesso.")
        sets = {}
        for k in ("nome", "papel", "ativo"):
            if k in d:
                sets[k] = d[k]
        if "papel" in sets and sets["papel"] not in PAPEIS:
            raise HTTPException(400, "Papel inválido.")
        if d.get("senha"):
            if len(d["senha"]) < 6:
                raise HTTPException(400, "A senha precisa de 6 letras ou mais.")
            sets["senha"] = hash_senha(d["senha"])
        if sets:
            c.execute(f"UPDATE usuarios SET {', '.join(k + '=?' for k in sets)} WHERE id=?", (*sets.values(), uid))
    return {"ok": True}


@app.patch("/api/formatos/{fid}")
async def muda_formato(fid: str, req: Request):
    equipe(req)
    d = await req.json()
    sets = {k: d[k] for k in ("nome", "dica", "palavra", "ativo") if k in d}
    if "passos" in d:
        passos = [str(p).strip() for p in d["passos"] if str(p).strip()]
        sets["passos"] = json.dumps(passos, ensure_ascii=False)
    if not sets:
        return {"ok": True}
    with con() as c:
        c.execute(f"UPDATE formatos SET {', '.join(k + '=?' for k in sets)} WHERE id=?", (*sets.values(), fid))
    return {"ok": True}


@app.post("/api/formatos")
async def novo_formato(req: Request):
    equipe(req)
    d = await req.json()
    fr = d.get("frente")
    with con() as c:
        frente = c.execute("SELECT * FROM frentes WHERE id=?", (fr,)).fetchone()
        if not frente or not str(d.get("nome", "")).strip():
            raise HTTPException(400, "Escolha a aba e dê um nome ao tópico.")
        n = c.execute("SELECT count(*) FROM formatos WHERE frente=?", (fr,)).fetchone()[0] + 1
        fid = f"{fr.upper()}-{n:02d}"
        while c.execute("SELECT 1 FROM formatos WHERE id=?", (fid,)).fetchone():
            n += 1
            fid = f"{fr.upper()}-{n:02d}"
        ordem = c.execute("SELECT coalesce(max(ordem),0)+1 FROM formatos").fetchone()[0]
        c.execute("INSERT INTO formatos (id, frente, nome, dica, passos, palavra, ordem) VALUES (?,?,?,?,?,?,?)",
                  (fid, fr, d["nome"].strip(), str(d.get("dica", "")).strip(), "[]", frente["palavra"], ordem))
    return {"id": fid}


CORES = ["#be185d", "#047857", "#0e7490", "#6d28d9", "#b45309", "#4d7c0f", "#9f1239", "#1e3a8a"]


@app.post("/api/frentes")
async def nova_frente(req: Request):
    equipe(req)
    d = await req.json()
    nome = str(d.get("nome", "")).strip()
    if not nome:
        raise HTTPException(400, "Dê um nome para a aba.")
    with con() as c:
        n = c.execute("SELECT count(*) FROM frentes").fetchone()[0]
        fid = f"p{n + 1}"
        while c.execute("SELECT 1 FROM frentes WHERE id=?", (fid,)).fetchone():
            n += 1
            fid = f"p{n + 1}"
        ordem = c.execute("SELECT coalesce(max(ordem),0)+1 FROM frentes").fetchone()[0]
        c.execute("INSERT INTO frentes (id, nome, para, palavra, cor, ordem) VALUES (?,?,?,?,?,?)",
                  (fid, nome, str(d.get("para", "")).strip(), (str(d.get("palavra", "")).strip() or nome).upper(), CORES[n % len(CORES)], ordem))
    return {"id": fid}


@app.patch("/api/frentes/{fid}")
async def muda_frente(fid: str, req: Request):
    equipe(req)
    d = await req.json()
    sets = {k: d[k] for k in ("nome", "para", "palavra", "ativo") if k in d}
    if sets:
        with con() as c:
            c.execute(f"UPDATE frentes SET {', '.join(k + '=?' for k in sets)} WHERE id=?", (*sets.values(), fid))
    return {"ok": True}


# ---------- tela ----------

WEB = AQUI / "web"
app.mount("/web", StaticFiles(directory=WEB), name="web")


@app.get("/")
def raiz():
    return FileResponse(WEB / "index.html", headers={"Cache-Control": "no-cache"})
