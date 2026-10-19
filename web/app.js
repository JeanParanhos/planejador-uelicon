/* Planejador do Uélicon: tela única com rotas por hash (#semana, #hoje, #assuntos, #receitas, #andamento). */
(function () {
  'use strict';

  var B = { eu: null, formatos: [], fmap: {}, frentes: {}, hoje: '' };
  var S = { semana: null, receitas: [], assuntos: [], confirmar: false, dia: null, assFiltro: 'todos', assFrente: 'todas' };
  var DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  var CURTO = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  var ST_NOME = { a_gravar: 'A gravar', gravado: 'Gravado', editado: 'Editado', postado: 'Postado', pulado: 'Pulado' };
  var app = document.getElementById('app');

  // ---------- utilidades ----------
  function h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function api(met, url, corpo) {
    var op = { method: met, headers: { 'x-planejador': '1' }, credentials: 'same-origin' };
    if (corpo !== undefined) { op.headers['content-type'] = 'application/json'; op.body = JSON.stringify(corpo); }
    return fetch(url, op).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && url !== '/api/entrar') { telaEntrar(); throw new Error('sessao'); }
        if (!r.ok) throw new Error(j.detail || 'Não deu certo. Tente de novo.');
        return j;
      });
    });
  }
  function aviso(txt, erro) {
    var el = document.getElementById('aviso');
    el.textContent = txt; el.className = 'aviso' + (erro ? ' erro' : ''); el.hidden = false;
    clearTimeout(aviso.t); aviso.t = setTimeout(function () { el.hidden = true; }, 2600);
  }
  function falha(e) { if (e && e.message !== 'sessao') aviso(e.message, true); }
  function dt(iso) { var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function soma(isoD, n) { var d = dt(isoD); d.setDate(d.getDate() + n); return iso(d); }
  function dm(isoD) { var p = isoD.split('-'); return p[2] + '/' + p[1]; }
  function semanaDe(isoD) { var d = dt(isoD); var w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return iso(d); }
  function diaSem(isoD) { return (dt(isoD).getDay() + 6) % 7; }
  function longa(isoD) { return DIAS[diaSem(isoD)] + ', ' + dt(isoD).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' }); }
  function cod(fm, n) { return fm + ' ' + String(n).padStart(2, '0'); }
  function feito(st) { return st === 'gravado' || st === 'editado' || st === 'postado'; }
  function atrasado(v) { return v.status === 'a_gravar' && v.data < B.hoje; }
  function stTag(v) { return atrasado(v) ? '<span class="st atrasado">Atrasado</span>' : '<span class="st ' + v.status + '">' + ST_NOME[v.status] + '</span>'; }
  function fmOptions(sel, vazio) {
    var out = vazio ? '<option value="">' + vazio + '</option>' : '';
    ['f', 'c', 'g'].forEach(function (k) {
      out += '<optgroup label="' + h(B.frentes[k].nome) + '">';
      B.formatos.filter(function (f) { return f.frente === k; }).forEach(function (f) {
        out += '<option value="' + f.id + '"' + (f.id === sel ? ' selected' : '') + '>' + h(f.nome) + '</option>';
      });
      out += '</optgroup>';
    });
    return out;
  }
  function equipe() { return B.eu && B.eu.papel !== 'gravador'; }

  // ---------- entrada ----------
  function telaEntrar(msg) {
    fecharGaveta();
    app.innerHTML = '<div class="entrar"><form id="fEntrar"><div><span class="rot">Instagram do Uélicon</span><h1>Planejador do Uélicon</h1></div>' +
      '<div class="campo"><label for="eLogin">Usuário ou e-mail</label><input id="eLogin" autocomplete="username" required></div>' +
      '<div class="campo"><label for="eSenha">Senha</label><input id="eSenha" type="password" autocomplete="current-password" required></div>' +
      '<p class="erro-txt" id="eErro">' + h(msg || '') + '</p><button class="bt pri" type="submit">Entrar</button></form></div>';
    document.getElementById('fEntrar').addEventListener('submit', function (e) {
      e.preventDefault();
      api('POST', '/api/entrar', { login: document.getElementById('eLogin').value, senha: document.getElementById('eSenha').value })
        .then(iniciar).catch(function (er) { document.getElementById('eErro').textContent = er.message; });
    });
  }

  function iniciar() {
    return api('GET', '/api/eu').then(function (j) {
      B.eu = j.usuario; B.hoje = j.hoje; B.frentes = j.frentes; B.formatos = j.formatos;
      B.fmap = {}; j.formatos.forEach(function (f) { B.fmap[f.id] = f; });
      if (!location.hash) location.hash = equipe() ? '#semana' : '#hoje';
      rota();
    }).catch(function (e) { if (e.message !== 'sessao') telaEntrar(); });
  }

  // ---------- moldura ----------
  function moldura(atual, corpo) {
    var itens = equipe()
      ? [['semana', 'Semana'], ['hoje', 'Folha do dia'], ['assuntos', 'Assuntos'], ['receitas', 'Receitas'], ['andamento', 'Andamento']]
      : [['hoje', 'Folha do dia']];
    app.innerHTML = '<header class="topo"><div class="in"><span class="marca">Planejador <span>do Uélicon</span></span><nav class="menu">' +
      itens.map(function (i) { return '<a href="#' + i[0] + '" class="' + (i[0] === atual ? 'on' : '') + '">' + i[1] + '</a>'; }).join('') +
      '</nav><div class="quem">' + h(B.eu.nome) + ' <button class="bt mini" data-act="sair" type="button">Sair</button></div></div></header>' +
      '<main class="pagina">' + corpo + '</main>';
  }

  function rota() {
    fecharGaveta();
    var r = (location.hash || '#semana').slice(1).split('/');
    if (!equipe() && r[0] !== 'hoje') { location.hash = '#hoje'; return; }
    if (r[0] === 'hoje') return telaHoje(r[1]);
    if (r[0] === 'assuntos') return telaAssuntos();
    if (r[0] === 'receitas') return telaReceitas(r[1]);
    if (r[0] === 'andamento') return telaAndamento();
    return telaSemana(r[1]);
  }
  window.addEventListener('hashchange', rota);

  // ---------- Semana ----------
  function telaSemana(inicio) {
    var seg = semanaDe(inicio || (S.semana && S.semana.inicio) || B.hoje);
    Promise.all([api('GET', '/api/semana?inicio=' + seg), api('GET', '/api/receitas')]).then(function (rs) {
      S.semana = rs[0]; S.receitas = rs[1];
      desenhaSemana();
    }).catch(falha);
  }
  function recarregaSemana() {
    return api('GET', '/api/semana?inicio=' + S.semana.inicio).then(function (j) { S.semana = j; desenhaSemana(); });
  }
  function desenhaSemana() {
    var s = S.semana, vs = s.videos;
    var tot = { f: 0, c: 0, g: 0 }, nf = 0, np = 0, nat = 0, nfalta = 0;
    vs.forEach(function (v) { if (v.status === 'pulado') return; tot[v.frente]++; if (feito(v.status)) nf++; if (v.status === 'postado') np++; if (atrasado(v)) nat++; if (!v.completo) nfalta++; });
    var total = tot.f + tot.c + tot.g;
    var recOpt = S.receitas.map(function (r) { return '<option value="' + r.id + '">' + h(r.nome) + '</option>'; }).join('');
    var corpo = '<div class="barra"><div class="grupo"><div class="semana-nav">' +
      '<a class="ib" href="#semana/' + soma(s.inicio, -7) + '" aria-label="Semana anterior">‹</a><b class="num">' + dm(s.inicio) + ' a ' + dm(soma(s.inicio, 5)) + '</b>' +
      '<a class="ib" href="#semana/' + soma(s.inicio, 7) + '" aria-label="Próxima semana">›</a></div>' +
      (semanaDe(B.hoje) !== s.inicio ? '<a class="bt mini" href="#semana/' + semanaDe(B.hoje) + '">Esta semana</a>' : '') + '</div>' +
      '<div class="grupo"><select class="sel" id="selReceita" aria-label="Receita">' + recOpt + '</select>' +
      '<button class="bt pri" type="button" data-act="montar">' + (vs.length ? 'Remontar a semana' : 'Montar a semana') + '</button></div></div>' +
      (S.confirmar ? '<div class="confirma"><span>Trocar os vídeos que ainda não foram gravados por esta receita? O que já foi gravado fica.</span>' +
        '<button class="bt pri mini" type="button" data-act="montar-sim">Trocar</button><button class="bt mini" type="button" data-act="montar-nao">Cancelar</button></div>' : '') +
      '<div class="pilulas"><span class="pil escura">' + total + ' vídeos</span>' +
      ['f', 'c', 'g'].map(function (k) { return '<span class="pil ' + k + '"><i></i>' + tot[k] + ' ' + B.frentes[k].nome.toLowerCase() + '</span>'; }).join('') +
      '<span class="pil">' + nf + ' gravado' + (nf === 1 ? '' : 's') + ' · ' + np + ' postado' + (np === 1 ? '' : 's') + '</span>' +
      (nat ? '<span class="pil erro">' + nat + ' atrasado' + (nat > 1 ? 's' : '') + '</span>' : '') +
      (nfalta ? '<span class="pil erro">' + nfalta + ' sem assunto pronto</span>' : '') + '</div>' +
      '<div class="dias">' + [0, 1, 2, 3, 4, 5].map(function (i) {
        var d = soma(s.inicio, i), doDia = vs.filter(function (v) { return v.data === d; });
        var ativos = doDia.filter(function (v) { return v.status !== 'pulado'; });
        var ok = ativos.filter(function (v) { return feito(v.status); }).length;
        return '<div class="dia' + (d === B.hoje ? ' hoje' : '') + '"><div class="dia-topo"><div class="n"><b>' + CURTO[i] + '</b><span class="num">' + dm(d) + (d === B.hoje ? ' · hoje' : '') + '</span></div>' +
          (ativos.length ? '<span class="feito num' + (ok === ativos.length ? ' todo' : '') + '">' + ok + '/' + ativos.length + '</span>' : '') + '</div>' +
          (doDia.length ? doDia.map(cartao).join('') : '<p class="vazio">Nenhum vídeo</p>') +
          '<div class="add"><select data-add="' + d + '" aria-label="Pôr vídeo em ' + DIAS[i] + '">' + fmOptions('', '+ vídeo') + '</select></div></div>';
      }).join('') + '</div>' +
      '<p class="suave" style="font-size:12px">Clique num vídeo para trocar o assunto, marcar se foi gravado ou postado e colar o link do post.</p>';
    moldura('semana', corpo);
  }
  function cartao(v) {
    var txt = v.abertura || (v.prova ? v.prova : '');
    return '<button type="button" class="cartao ' + v.frente + (feito(v.status) || v.status === 'pulado' ? ' feito' : '') + '" data-act="video" data-id="' + v.id + '">' +
      '<span class="k"><span class="fr">' + h(B.frentes[v.frente].nome) + '</span>' + stTag(v) + '</span>' +
      '<span class="fm">' + h(v.formato_nome) + '</span>' +
      (v.assunto_id ? (txt ? '<span class="ab">' + h(txt) + '</span>' : '') : '<span class="falta">Escolher assunto</span>') +
      (v.assunto_id && !v.completo ? '<span class="falta">Assunto incompleto</span>' : '') + '</button>';
  }

  // ---------- Gaveta do vídeo ----------
  function abrirGaveta(html) {
    var g = document.getElementById('gaveta'); document.getElementById('painel').innerHTML = html; g.hidden = false;
    var f = document.querySelector('#painel button, #painel select, #painel input'); if (f) f.focus();
  }
  function fecharGaveta() { var g = document.getElementById('gaveta'); if (g) g.hidden = true; }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fecharGaveta(); });

  function gavetaVideo(id) {
    var v = S.semana.videos.filter(function (x) { return x.id === id; })[0]; if (!v) return;
    var carregar = S.assuntos.length ? Promise.resolve(S.assuntos) : api('GET', '/api/assuntos').then(function (a) { S.assuntos = a; return a; });
    carregar.then(function (lista) {
      var doFm = lista.filter(function (a) { return a.formato === v.formato && (a.ativo || a.id === v.assunto_id); });
      var fm = B.fmap[v.formato];
      abrirGaveta('<div class="cab"><div><span class="rot">' + longa(v.data) + '</span><h2>' + h(fm.nome) + '</h2></div><button class="ib" type="button" data-act="fechar" aria-label="Fechar">×</button></div>' +
        '<div class="campo"><label for="gFm">Formato</label><select id="gFm" data-vid="' + v.id + '">' + fmOptions(v.formato) + '</select><span class="dica">' + h(fm.dica) + '</span></div>' +
        '<div class="campo"><label for="gAs">Assunto</label><select id="gAs" data-vid="' + v.id + '"><option value="">Escolher…</option>' +
        doFm.map(function (a) {
          return '<option value="' + a.id + '"' + (a.id === v.assunto_id ? ' selected' : '') + '>' + cod(a.formato, a.numero) + ' · ' + h(a.abertura || a.prova || '(sem frase)') +
            (a.completo ? '' : ' · falta preencher') + (a.ultimo_uso && a.id !== v.assunto_id ? ' · usado ' + dm(a.ultimo_uso) : '') + '</option>';
        }).join('') + '</select></div>' +
        (v.assunto_id ? '<div class="quadro-ab">' + (v.abertura ? '<q>' + h(v.abertura) + '</q>' : '<span class="falta">Falta a frase de abertura</span>') +
          (v.pontos ? '<p class="linha">' + h(v.pontos) + '</p>' : '<span class="falta">Falta o que falar</span>') +
          (v.prova ? '<p class="linha suave">Prova: ' + h(v.prova) + '</p>' : '') +
          '<div><button class="bt mini" type="button" data-act="editar-assunto" data-id="' + v.assunto_id + '">Preencher este assunto</button></div></div>' : '') +
        '<div class="campo"><label>Situação</label><div class="seg">' + ['a_gravar', 'gravado', 'editado', 'postado', 'pulado'].map(function (k) {
          return '<button type="button" data-act="status" data-id="' + v.id + '" data-st="' + k + '" aria-pressed="' + (v.status === k) + '">' + ST_NOME[k] + '</button>';
        }).join('') + '</div></div>' +
        '<div class="campo"><label for="gLink">Link do post no Instagram</label><input id="gLink" type="url" placeholder="https://www.instagram.com/p/…" value="' + h(v.link) + '"></div>' +
        '<div class="campo"><label for="gPal">Palavra para comentar</label><input id="gPal" value="' + h(v.palavra_final) + '"><span class="dica">É o gatilho do ManyChat. Formação e imersão vão para o Daniel.</span></div>' +
        '<div class="campo"><label for="gNota">Nota</label><textarea id="gNota" placeholder="Ex.: gravar com o print do cliente">' + h(v.nota) + '</textarea></div>' +
        '<div class="campo"><label for="gData">Dia</label><input id="gData" type="date" value="' + v.data + '"></div>' +
        '<div class="acoes"><button class="bt pri" type="button" data-act="salvar-video" data-id="' + v.id + '">Salvar</button>' +
        '<button class="bt perigo" type="button" data-act="apagar-video" data-id="' + v.id + '">Tirar da semana</button></div>' +
        (v.atualizado_por ? '<p class="suave" style="font-size:12px">Última mudança: ' + h(v.atualizado_por) + ', ' + h(v.atualizado_em) + '</p>' : ''));
    }).catch(falha);
  }

  // ---------- Folha do dia ----------
  function telaHoje(d) {
    var dia = d || B.hoje;
    api('GET', '/api/dia?data=' + dia).then(function (j) { S.dia = j; desenhaHoje(); }).catch(falha);
  }
  function desenhaHoje() {
    var j = S.dia, vs = j.videos, ok = vs.filter(function (v) { return feito(v.status); }).length;
    var corpo = '<div class="folha-nav"><div class="semana-nav"><a class="ib" href="#hoje/' + soma(j.data, -1) + '" aria-label="Dia anterior">‹</a>' +
      '<b>' + (j.data === B.hoje ? 'Hoje' : dm(j.data)) + '</b><a class="ib" href="#hoje/' + soma(j.data, 1) + '" aria-label="Próximo dia">›</a>' +
      (j.data !== B.hoje ? '<a class="bt mini" href="#hoje">Hoje</a>' : '') + '</div>' +
      '<button class="bt" type="button" data-act="imprimir">Imprimir a folha</button></div>' +
      '<article class="folha"><div class="folha-topo"><div><span class="rot">Pedido do dia</span><h1>' + longa(j.data) + '</h1></div>' +
      '<div class="suave" style="text-align:right">Para: Uélicon<br>' + (vs.length ? ok + ' de ' + vs.length + ' gravados' : 'Nada marcado') + '</div></div>' +
      (vs.length ? vs.map(function (v, i) {
        var fm = B.fmap[v.formato];
        return '<section class="vid"><span class="vn ' + (feito(v.status) ? 'ok' : v.frente) + '">' + (feito(v.status) ? '✓' : (i + 1)) + '</span><div class="vcorpo">' +
          '<div class="cab"><span class="pil ' + v.frente + '"><i></i>' + h(B.frentes[v.frente].nome) + '</span><h2>' + h(fm.nome) + '</h2>' +
          (v.assunto_id ? '<span class="suave" style="font-size:12px">' + cod(v.formato, v.a_numero) + '</span>' : '') + '</div>' +
          (v.abertura ? '<blockquote>“' + h(v.abertura) + '”</blockquote>' : '<p class="falta">O Arlindo ainda vai mandar a frase de abertura.</p>') +
          (v.pontos ? '<p class="falar">' + h(v.pontos) + '</p>' : '') +
          (v.prova ? '<p class="prova"><b>Prova:</b> ' + h(v.prova) + '</p>' : '') +
          '<ol class="passos">' + fm.passos.map(function (p) { return '<li>' + h(p) + '</li>'; }).join('') + '</ol>' +
          (v.palavra_final ? '<p class="cta">No fim: “Comenta <b>' + h(v.palavra_final) + '</b> que eu te mando.”</p>' : '') +
          (v.nota ? '<p class="suave">Nota: ' + h(v.nota) + '</p>' : '') +
          '<button type="button" class="gravei' + (feito(v.status) ? ' on' : '') + '" data-act="gravei" data-id="' + v.id + '" data-st="' + v.status + '">' +
          (feito(v.status) ? '✓ Gravado' : 'Marcar como gravado') + '</button></div></section>';
      }).join('') : '<p class="suave">Nenhum vídeo para este dia.' + (j.proximo ? ' O próximo é em <a href="#hoje/' + j.proximo + '">' + dm(j.proximo) + '</a>.' : '') + '</p>') +
      '<div class="dicas"><span>Celular em pé, rosto perto, lugar claro</span><span>A frase de abertura nos 3 primeiros segundos</span><span>Um assunto por vídeo</span><span>Sem nome nem CPF de cliente na tela</span></div>' +
      '</article>';
    moldura('hoje', corpo);
  }

  // ---------- Assuntos ----------
  function telaAssuntos() {
    api('GET', '/api/assuntos').then(function (a) { S.assuntos = a; desenhaAssuntos(); }).catch(falha);
  }
  function desenhaAssuntos() {
    var lista = S.assuntos, falta = lista.filter(function (a) { return a.ativo && !a.completo; }).length;
    var corpo = '<div class="barra"><div><h1>Assuntos</h1><p class="suave">Cada assunto é um vídeo pronto para gravar: a frase de abertura e o que falar. A semana puxa daqui sozinha, sempre o que está há mais tempo sem uso.</p></div>' +
      '<div class="grupo"><div class="seg" style="grid-template-columns:repeat(2,auto)">' +
      '<button type="button" data-act="ass-filtro" data-v="todos" aria-pressed="' + (S.assFiltro === 'todos') + '">Todos</button>' +
      '<button type="button" data-act="ass-filtro" data-v="falta" aria-pressed="' + (S.assFiltro === 'falta') + '">Falta preencher (' + falta + ')</button></div></div></div>' +
      '<div class="colunas">' + ['f', 'c', 'g'].map(function (k) {
        return '<div class="col"><div><span class="pil ' + k + '"><i></i>' + h(B.frentes[k].nome) + '</span> <span class="suave" style="font-size:12px">para ' + h(B.frentes[k].para) + '</span></div>' +
          B.formatos.filter(function (f) { return f.frente === k; }).map(function (fm) {
            var itens = lista.filter(function (a) { return a.formato === fm.id && (S.assFiltro === 'todos' ? true : (a.ativo && !a.completo)); });
            var prontos = lista.filter(function (a) { return a.formato === fm.id && a.ativo && a.completo; }).length;
            return '<div class="grupo-fm"><div class="cab"><div><h3>' + h(fm.nome) + '</h3><span class="suave" style="font-size:12px">' + prontos + ' pronto' + (prontos === 1 ? '' : 's') + '</span></div>' +
              '<button class="bt mini" type="button" data-act="novo-assunto" data-fm="' + fm.id + '">+ Assunto</button></div>' +
              (itens.length ? '<ul class="lista">' + itens.map(function (a) {
                return '<li class="' + (a.ativo ? '' : 'arquivado') + '"><button type="button" data-act="editar-assunto" data-id="' + a.id + '"><code>' + String(a.numero).padStart(2, '0') + '</code>' +
                  '<span>' + (a.abertura ? h(a.abertura) : '<span class="vazia">' + h(a.prova || 'sem frase ainda') + '</span>') + ' ' +
                  (a.completo ? '<span class="selo ok">Pronto</span>' : '<span class="selo falta">Falta preencher</span>') + '</span>' +
                  '<span class="uso">' + (a.vezes ? a.vezes + 'x · ' + dm(a.ultimo_uso) : 'nunca usado') + '</span></button></li>';
              }).join('') + '</ul>' : '<p class="vazio">Nada aqui.</p>') + '</div>';
          }).join('') + '</div>';
      }).join('') + '</div>';
    moldura('assuntos', corpo);
  }
  function gavetaAssunto(id) {
    var carregar = S.assuntos.length ? Promise.resolve(S.assuntos) : api('GET', '/api/assuntos').then(function (a) { S.assuntos = a; return a; });
    carregar.then(function (lista) {
      var a = lista.filter(function (x) { return x.id === id; })[0]; if (!a) return;
      var fm = B.fmap[a.formato];
      abrirGaveta('<div class="cab"><div><span class="rot">' + h(B.frentes[fm.frente].nome) + ' · ' + cod(a.formato, a.numero) + '</span><h2>' + h(fm.nome) + '</h2></div><button class="ib" type="button" data-act="fechar" aria-label="Fechar">×</button></div>' +
        '<p class="suave">' + h(fm.dica) + '</p><ol class="passos">' + fm.passos.map(function (p) { return '<li>' + h(p) + '</li>'; }).join('') + '</ol>' +
        '<div class="campo"><label for="aAb">Frase de abertura (os 3 primeiros segundos)</label><textarea id="aAb" placeholder="Ex.: Meu nome tá limpo e o banco negou. Por quê?">' + h(a.abertura) + '</textarea></div>' +
        '<div class="campo"><label for="aPo">O que falar</label><textarea id="aPo" style="min-height:110px" placeholder="A explicação em 2 ou 3 frases simples, com exemplo do dia a dia.">' + h(a.pontos) + '</textarea></div>' +
        '<div class="campo"><label for="aPr">Prova ou exemplo (opcional)</label><input id="aPr" placeholder="Ex.: de 2.500 para 55 mil de limite" value="' + h(a.prova) + '"></div>' +
        '<div class="campo"><label for="aPa">Palavra para comentar</label><input id="aPa" value="' + h(a.palavra) + '"></div>' +
        '<div class="acoes"><button class="bt pri" type="button" data-act="salvar-assunto" data-id="' + a.id + '">Salvar</button>' +
        '<button class="bt' + (a.ativo ? ' perigo' : '') + '" type="button" data-act="arquivar-assunto" data-id="' + a.id + '" data-ativo="' + (a.ativo ? 0 : 1) + '">' + (a.ativo ? 'Arquivar' : 'Voltar a usar') + '</button></div>' +
        '<p class="suave" style="font-size:12px">' + (a.vezes ? 'Usado ' + a.vezes + 'x, a última em ' + dm(a.ultimo_uso) + (a.postados ? ', ' + a.postados + ' postado' + (a.postados > 1 ? 's' : '') : '') + '.' : 'Ainda não foi usado.') + '</p>');
    }).catch(falha);
  }

  // ---------- Receitas ----------
  function telaReceitas(id) {
    api('GET', '/api/receitas').then(function (r) { S.receitas = r; desenhaReceitas(id ? +id : (r[0] && r[0].id)); }).catch(falha);
  }
  function desenhaReceitas(id) {
    var r = S.receitas.filter(function (x) { return x.id === id; })[0] || S.receitas[0];
    var corpo = '<div class="barra"><div><h1>Receitas</h1><p class="suave">A receita diz quantos vídeos tem cada dia e de que tipo. A semana é montada a partir dela.</p></div>' +
      '<div class="grupo"><select class="sel" id="selRec" aria-label="Receita">' + S.receitas.map(function (x) { return '<option value="' + x.id + '"' + (r && x.id === r.id ? ' selected' : '') + '>' + h(x.nome) + '</option>'; }).join('') + '</select>' +
      '<button class="bt" type="button" data-act="nova-receita">Nova receita</button>' + (r ? '<button class="bt" type="button" data-act="duplicar-receita" data-id="' + r.id + '">Duplicar</button>' : '') + '</div></div>';
    if (r) {
      var tot = { f: 0, c: 0, g: 0 }; r.dias.forEach(function (d) { d.forEach(function (fid) { tot[B.fmap[fid].frente]++; }); });
      corpo += '<div class="barra"><div class="campo" style="max-width:360px;flex:1"><label for="recNome">Nome</label><input id="recNome" value="' + h(r.nome) + '" data-id="' + r.id + '"></div>' +
        '<div class="pilulas"><span class="pil escura">' + (tot.f + tot.c + tot.g) + ' vídeos na semana</span>' + ['f', 'c', 'g'].map(function (k) { return '<span class="pil ' + k + '"><i></i>' + tot[k] + ' ' + B.frentes[k].nome.toLowerCase() + '</span>'; }).join('') + '</div></div>' +
        '<div class="receita-dias">' + r.dias.map(function (d, i) {
          return '<div class="rdia"><div class="dia-topo"><div class="n"><b>' + CURTO[i] + '</b></div><span class="feito">' + d.length + '</span></div>' +
            d.map(function (fid, j) { var fm = B.fmap[fid]; return '<div class="chip ' + fm.frente + '"><span>' + h(fm.nome) + '</span><button type="button" data-act="rec-tira" data-id="' + r.id + '" data-d="' + i + '" data-j="' + j + '" aria-label="Tirar">×</button></div>'; }).join('') +
            '<div class="add"><select data-rec="' + r.id + '" data-d="' + i + '" aria-label="Pôr formato em ' + DIAS[i] + '">' + fmOptions('', '+ formato') + '</select></div></div>';
        }).join('') + '</div>' +
        '<div><button class="bt perigo mini" type="button" data-act="apagar-receita" data-id="' + r.id + '">Apagar esta receita</button></div>';
    }
    moldura('receitas', corpo);
  }
  function salvaReceita(r) { return api('PUT', '/api/receitas/' + r.id, { dias: r.dias }).then(function () { desenhaReceitas(r.id); }).catch(falha); }

  // ---------- Andamento ----------
  function telaAndamento() {
    api('GET', '/api/andamento').then(desenhaAndamento).catch(falha);
  }
  function desenhaAndamento(j) {
    var atual = j.semanas.filter(function (s) { return s.atual; })[0];
    var ativos = atual.total - atual.pulados;
    var pct = function (a, b) { return b ? Math.round(100 * a / b) : 0; };
    var seg = atual.inicio;
    var corpo = '<div><h1>Andamento</h1><p class="suave">O que foi planejado, gravado e postado. Atrasado é vídeo de dia que já passou e não foi gravado.</p></div>' +
      '<div class="numeros"><div class="caixa"><span class="rot">Esta semana</span><b class="num">' + ativos + '</b><span class="suave">vídeos planejados</span></div>' +
      '<div class="caixa"><span class="rot">Gravados</span><b class="num">' + atual.gravados + '</b><span class="suave">' + pct(atual.gravados, ativos) + '% do planejado</span></div>' +
      '<div class="caixa"><span class="rot">Postados</span><b class="num">' + atual.postados + '</b><span class="suave">' + pct(atual.postados, ativos) + '% do planejado</span></div>' +
      '<div class="caixa' + (j.atrasados.length ? ' erro' : '') + '"><span class="rot">Atrasados</span><b class="num">' + j.atrasados.length + '</b><span class="suave">nas últimas 3 semanas</span></div></div>' +
      '<div class="caixa" style="display:flex;flex-direction:column;gap:10px"><h2>Dia a dia desta semana</h2><div class="tira">' + [0, 1, 2, 3, 4, 5].map(function (i) {
        var d = soma(seg, i), x = j.dias.filter(function (y) { return y.data === d; })[0] || { tot: 0, grav: 0, post: 0 };
        var cls = x.tot && x.grav >= x.tot ? 'todo' : (d < j.hoje && x.grav < x.tot ? 'atras' : '');
        return '<div class="' + cls + '"><span>' + CURTO[i] + ' ' + dm(d) + '</span><b class="num">' + (x.grav || 0) + '/' + x.tot + '</b><span class="suave">' + (x.post || 0) + ' postados</span></div>';
      }).join('') + '</div>' +
      '<div class="pilulas">' + ['f', 'c', 'g'].map(function (k) { var p = atual.por_frente[k] || { tot: 0, grav: 0, post: 0 }; return '<span class="pil ' + k + '"><i></i>' + B.frentes[k].nome + ': ' + (p.grav || 0) + ' de ' + p.tot + ' gravados</span>'; }).join('') + '</div></div>' +
      '<div class="duas"><div class="caixa"><h2>Atrasados</h2>' + (j.atrasados.length ? '<ul class="itens">' + j.atrasados.map(function (v) {
        return '<li><a href="#semana/' + semanaDe(v.data) + '">' + dm(v.data) + ' · ' + h(v.formato_nome) + (v.abertura ? ': ' + h(v.abertura) : '') + '</a><span class="st atrasado">' + CURTO[diaSem(v.data)] + '</span></li>';
      }).join('') + '</ul>' : '<p class="suave">Nada atrasado.</p>') + '</div>' +
      '<div class="caixa"><h2>Gravados, falta postar</h2>' + (j.sem_post.length ? '<ul class="itens">' + j.sem_post.map(function (v) {
        return '<li><a href="#semana/' + semanaDe(v.data) + '">' + dm(v.data) + ' · ' + h(v.formato_nome) + (v.abertura ? ': ' + h(v.abertura) : '') + '</a>' + stTag(v) + '</li>';
      }).join('') + '</ul>' : '<p class="suave">Tudo que foi gravado já foi postado.</p>') + '</div></div>' +
      '<div class="caixa" style="display:flex;flex-direction:column;gap:10px"><h2>Semana a semana</h2><div class="semanas">' + j.semanas.map(function (s) {
        var at = s.total - s.pulados;
        return '<div class="ln' + (s.atual ? ' atual' : '') + '"><b class="num">' + dm(s.inicio) + (s.atual ? ' · esta' : '') + '</b>' +
          '<div class="trilho" title="gravados e postados"><i class="p" style="width:' + pct(s.postados, at) + '%"></i><i class="gr" style="width:' + pct(s.gravados - s.postados, at) + '%"></i></div>' +
          '<span class="q suave num">' + (at ? s.gravados + ' de ' + at + ' gravados · ' + s.postados + ' postados' : 'sem plano') + '</span></div>';
      }).join('') + '</div><p class="suave" style="font-size:12px">Verde: postado. Azul: gravado e ainda não postado.</p></div>' +
      (j.assuntos_incompletos ? '<p class="confirma">' + j.assuntos_incompletos + ' assuntos ainda estão sem a frase de abertura ou sem o que falar. <a href="#assuntos">Preencher</a></p>' : '') +
      '<div class="caixa"><h2>Últimas mudanças</h2>' + (j.historico.length ? '<ul class="itens">' + j.historico.map(function (x) {
        return '<li><span>' + h(x.quem) + ' marcou <b>' + ST_NOME[x.para] + '</b> · ' + dm(x.data) + ' ' + h(x.formato_nome) + '</span><span class="suave num">' + h(x.quando.slice(8, 10) + '/' + x.quando.slice(5, 7) + ' ' + x.quando.slice(11)) + '</span></li>';
      }).join('') + '</ul>' : '<p class="suave">Ainda nada.</p>') + '</div>';
    moldura('andamento', corpo);
  }

  // ---------- ações ----------
  function mudaVideo(id, campos) {
    return api('PATCH', '/api/videos/' + id, campos);
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]'); if (!t) return;
    var act = t.dataset.act, id = +t.dataset.id;
    if (act === 'fechar') return fecharGaveta();
    if (act === 'sair') return api('POST', '/api/sair').then(function () { telaEntrar(); location.hash = ''; });
    if (act === 'imprimir') return window.print();
    if (act === 'montar') {
      if (S.semana.videos.length) { S.confirmar = true; return desenhaSemana(); }
      return montar(false);
    }
    if (act === 'montar-sim') { S.confirmar = false; return montar(true); }
    if (act === 'montar-nao') { S.confirmar = false; return desenhaSemana(); }
    if (act === 'video') return gavetaVideo(id);
    if (act === 'status') {
      return mudaVideo(id, { status: t.dataset.st }).then(function () { aviso('Marcado: ' + ST_NOME[t.dataset.st]); return recarregaSemana(); }).then(function () { gavetaVideo(id); }).catch(falha);
    }
    if (act === 'salvar-video') {
      var nova = document.getElementById('gData').value;
      return mudaVideo(id, { link: document.getElementById('gLink').value.trim(), palavra: document.getElementById('gPal').value.trim().toUpperCase(), nota: document.getElementById('gNota').value, data: nova })
        .then(function () { aviso('Salvo'); fecharGaveta(); if (semanaDe(nova) !== S.semana.inicio) location.hash = '#semana/' + semanaDe(nova); return recarregaSemana(); }).catch(falha);
    }
    if (act === 'apagar-video') {
      if (t.dataset.certo !== '1') { t.dataset.certo = '1'; t.textContent = 'Clique de novo para tirar'; return; }
      return api('DELETE', '/api/videos/' + id).then(function () { aviso('Tirado da semana'); fecharGaveta(); return recarregaSemana(); }).catch(falha);
    }
    if (act === 'gravei') {
      var st = feito(t.dataset.st) ? 'a_gravar' : 'gravado';
      return mudaVideo(id, { status: st }).then(function () { aviso(st === 'gravado' ? 'Gravado. Valeu!' : 'Voltou para a gravar'); telaHoje(S.dia.data); }).catch(falha);
    }
    if (act === 'editar-assunto') return gavetaAssunto(id);
    if (act === 'novo-assunto') {
      return api('POST', '/api/assuntos', { formato: t.dataset.fm }).then(function (r) { return api('GET', '/api/assuntos').then(function (a) { S.assuntos = a; desenhaAssuntos(); gavetaAssunto(r.id); }); }).catch(falha);
    }
    if (act === 'salvar-assunto') {
      return api('PATCH', '/api/assuntos/' + id, { abertura: document.getElementById('aAb').value.trim(), pontos: document.getElementById('aPo').value.trim(), prova: document.getElementById('aPr').value.trim(), palavra: document.getElementById('aPa').value.trim().toUpperCase() })
        .then(depoisAssunto).catch(falha);
    }
    if (act === 'arquivar-assunto') return api('PATCH', '/api/assuntos/' + id, { ativo: +t.dataset.ativo }).then(depoisAssunto).catch(falha);
    if (act === 'ass-filtro') { S.assFiltro = t.dataset.v; return desenhaAssuntos(); }
    if (act === 'nova-receita') return api('POST', '/api/receitas', { nome: 'Receita nova' }).then(function (r) { location.hash = '#receitas/' + r.id; telaReceitas(r.id); }).catch(falha);
    if (act === 'duplicar-receita') {
      var base = S.receitas.filter(function (x) { return x.id === id; })[0];
      return api('POST', '/api/receitas', { nome: base.nome + ' (cópia)', dias: base.dias }).then(function (r) { telaReceitas(r.id); }).catch(falha);
    }
    if (act === 'apagar-receita') {
      if (t.dataset.certo !== '1') { t.dataset.certo = '1'; t.textContent = 'Clique de novo para apagar'; return; }
      return api('PUT', '/api/receitas/' + id, { apagar: true }).then(function () { telaReceitas(); }).catch(falha);
    }
    if (act === 'rec-tira') {
      var r = S.receitas.filter(function (x) { return x.id === id; })[0];
      r.dias[+t.dataset.d].splice(+t.dataset.j, 1); return salvaReceita(r);
    }
  });
  function depoisAssunto() {
    aviso('Assunto salvo'); fecharGaveta();
    return api('GET', '/api/assuntos').then(function (a) {
      S.assuntos = a;
      var r = (location.hash || '').slice(1).split('/')[0];
      if (r === 'assuntos') desenhaAssuntos(); else if (S.semana) recarregaSemana();
    });
  }
  function montar(substituir) {
    var rec = document.getElementById('selReceita').value;
    return api('POST', '/api/semana/montar', { inicio: S.semana.inicio, receita: +rec, substituir: substituir })
      .then(function (r) { aviso(r.criados + ' vídeos na semana'); return recarregaSemana(); }).catch(falha);
  }
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.add) {
      var fm = t.value; if (!fm) return;
      return api('POST', '/api/videos', { data: t.dataset.add, formato: fm }).then(recarregaSemana).catch(falha);
    }
    if (t.id === 'gFm') return mudaVideo(+t.dataset.vid, { formato: t.value }).then(recarregaSemana).then(function () { gavetaVideo(+t.dataset.vid); }).catch(falha);
    if (t.id === 'gAs') return mudaVideo(+t.dataset.vid, { assunto_id: t.value ? +t.value : null, palavra: null }).then(recarregaSemana).then(function () { gavetaVideo(+t.dataset.vid); }).catch(falha);
    if (t.id === 'selRec') { location.hash = '#receitas/' + t.value; return; }
    if (t.id === 'recNome') return api('PUT', '/api/receitas/' + t.dataset.id, { nome: t.value.trim() }).then(function () { aviso('Nome salvo'); telaReceitas(+t.dataset.id); }).catch(falha);
    if (t.dataset.rec) {
      var r = S.receitas.filter(function (x) { return x.id === +t.dataset.rec; })[0];
      if (!t.value) return; r.dias[+t.dataset.d].push(t.value); return salvaReceita(r);
    }
  });

  iniciar();
})();
