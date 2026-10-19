/* Planejador do Uélicon: tela única com rotas por hash (#semana, #hoje, #assuntos, #receitas, #andamento).
   Visual: Design da Central, pele Roxo (estilo.css). */
(function () {
  'use strict';

  var B = { eu: null, formatos: [], fmap: {}, frentes: {}, hoje: '' };
  var S = { semana: null, receitas: [], assuntos: [], confirmar: false, dia: null, filtro: 'falta', faltam: 0 };
  var DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  var CURTO = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  var ST_NOME = { a_gravar: 'A gravar', gravado: 'Gravado', editado: 'Editado', postado: 'Postado', pulado: 'Pulado' };
  var ST_COR = { a_gravar: '', gravado: 'info', editado: 'info', postado: 'ok', pulado: '' };
  var app = document.getElementById('app');

  // Lucide, 16 px, traço 1,8
  var IC = {
    semana: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    hoje: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    assuntos: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    receitas: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
    andamento: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
    sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    imprimir: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    esq: '<path d="m15 18-6-6 6-6"/>', dir: '<path d="m9 18 6-6-6-6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>', mais: '<path d="M12 5v14M5 12h14"/>'
  };
  function ic(n) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + IC[n] + '</svg>'; }

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
  function aviso(txt, desfazer, erro) {
    var el = document.getElementById('aviso');
    el.innerHTML = '<span>' + h(txt) + '</span>' + (desfazer ? '<button type="button" id="avDesfazer">Desfazer</button>' : '');
    el.className = 'aviso' + (erro ? ' erro' : ''); el.hidden = false;
    if (desfazer) document.getElementById('avDesfazer').onclick = function () { el.hidden = true; desfazer(); };
    clearTimeout(aviso.t); aviso.t = setTimeout(function () { el.hidden = true; }, desfazer ? 6000 : 2600);
  }
  function falha(e) { if (e && e.message !== 'sessao') aviso(e.message, null, true); }
  function dt(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function soma(s, n) { var d = dt(s); d.setDate(d.getDate() + n); return iso(d); }
  function dm(s) { var p = s.split('-'); return p[2] + '/' + p[1]; }
  function semanaDe(s) { var d = dt(s); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return iso(d); }
  function diaSem(s) { return (dt(s).getDay() + 6) % 7; }
  function longa(s) { return DIAS[diaSem(s)] + ', ' + dt(s).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' }); }
  function cod(fm, n) { return fm + ' ' + String(n).padStart(2, '0'); }
  function feito(st) { return st === 'gravado' || st === 'editado' || st === 'postado'; }
  function atrasado(v) { return v.status === 'a_gravar' && v.data < B.hoje; }
  function plural(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }
  function situacao(v) {
    if (atrasado(v)) return '<span class="ponto erro">Atrasado</span>';
    return '<span class="ponto ' + ST_COR[v.status] + '">' + ST_NOME[v.status] + '</span>';
  }
  function frente(k) { return '<span class="frente ' + k + '">' + h(B.frentes[k].nome) + '</span>'; }
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
  function carregaAssuntos(forcar) {
    if (S.assuntos.length && !forcar) return Promise.resolve(S.assuntos);
    return api('GET', '/api/assuntos').then(function (a) {
      S.assuntos = a; S.faltam = a.filter(function (x) { return x.ativo && !x.completo; }).length; return a;
    });
  }

  // ---------- entrada ----------
  function telaEntrar(msg) {
    fecharGaveta();
    app.innerHTML = '<div class="entrar"><form id="fEntrar"><div><p class="rotulo">Instagram do Uélicon</p><h1>Planejador do Uélicon</h1></div>' +
      '<div class="campo"><label for="eLogin">Usuário ou e-mail</label><input id="eLogin" autocomplete="username" required></div>' +
      '<div class="campo"><label for="eSenha">Senha</label><input id="eSenha" type="password" autocomplete="current-password" required></div>' +
      '<p class="erro-txt" id="eErro">' + h(msg || '') + '</p><button class="btn btn-principal" type="submit">Entrar</button></form></div>';
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
      var pronto = equipe() ? carregaAssuntos() : Promise.resolve();
      return pronto.then(function () {
        if (!location.hash) location.hash = equipe() ? '#semana' : '#hoje'; else rota();
      });
    }).catch(function (e) { if (e.message !== 'sessao') telaEntrar(); });
  }

  // ---------- moldura ----------
  function moldura(atual, corpo) {
    var itens = equipe()
      ? [['semana', 'Semana'], ['hoje', 'Folha do dia'], ['assuntos', 'Assuntos'], ['receitas', 'Receitas'], ['andamento', 'Andamento']]
      : [['hoje', 'Folha do dia']];
    app.innerHTML = '<div class="casca"><nav class="lateral" aria-label="Menu"><div class="marca-sis"><i>P</i><span>Planejador do Uélicon</span></div>' +
      itens.map(function (i) {
        var cont = i[0] === 'assuntos' && S.faltam ? '<span class="cont">' + S.faltam + '</span>' : '';
        return '<a href="#' + i[0] + '" class="' + (i[0] === atual ? 'ativo' : '') + '">' + ic(i[0]) + '<span class="rot-menu">' + i[1] + '</span>' + cont + '</a>';
      }).join('') +
      '<div class="pe"><span class="nome">' + h(B.eu.nome) + '</span><button class="btn btn-fantasma btn-mini" data-act="sair" type="button">' + ic('sair') + 'Sair</button></div></nav>' +
      '<main class="conteudo">' + corpo + '</main></div>';
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
  function rotaAtual() { return (location.hash || '#semana').slice(1).split('/')[0]; }

  // ---------- Semana ----------
  function telaSemana(inicio) {
    var seg = semanaDe(inicio || (S.semana && S.semana.inicio) || B.hoje);
    Promise.all([api('GET', '/api/semana?inicio=' + seg), api('GET', '/api/receitas')]).then(function (rs) {
      S.semana = rs[0]; S.receitas = rs[1]; desenhaSemana();
    }).catch(falha);
  }
  function recarregaSemana() {
    return api('GET', '/api/semana?inicio=' + S.semana.inicio).then(function (j) { S.semana = j; if (rotaAtual() === 'semana') desenhaSemana(); });
  }
  function desenhaSemana() {
    var s = S.semana, vs = s.videos, ativos = vs.filter(function (v) { return v.status !== 'pulado'; });
    var nf = ativos.filter(function (v) { return feito(v.status); }).length;
    var np = ativos.filter(function (v) { return v.status === 'postado'; }).length;
    var nat = ativos.filter(atrasado).length;
    var nfalta = ativos.filter(function (v) { return !v.completo && !feito(v.status); }).length;
    var esta = semanaDe(B.hoje) === s.inicio;
    var estado = !vs.length ? 'Semana sem plano.' : plural(ativos.length, 'vídeo planejado', 'vídeos planejados') + ', ' + plural(nf, 'gravado', 'gravados') + (nat ? ', ' + plural(nat, 'atrasado', 'atrasados') : '') + '.';
    var corpo = '<div class="cabecalho"><div><h1>Semana de ' + dm(s.inicio) + ' a ' + dm(soma(s.inicio, 5)) + '</h1><p class="estado">' + estado + '</p></div>' +
      '<div class="acoes"><div class="linha" style="gap:4px"><a class="btn btn-icone" href="#semana/' + soma(s.inicio, -7) + '" aria-label="Semana anterior">' + ic('esq') + '</a>' +
      (esta ? '' : '<a class="btn" href="#semana/' + semanaDe(B.hoje) + '">Esta semana</a>') +
      '<a class="btn btn-icone" href="#semana/' + soma(s.inicio, 7) + '" aria-label="Próxima semana">' + ic('dir') + '</a></div>' +
      '<select class="sel" id="selReceita" aria-label="Receita">' + S.receitas.map(function (r) { return '<option value="' + r.id + '">' + h(r.nome) + '</option>'; }).join('') + '</select>' +
      '<button class="btn ' + (vs.length ? '' : 'btn-principal') + '" type="button" data-act="montar">' + (vs.length ? 'Remontar com a receita' : 'Montar a semana') + '</button></div></div>';
    if (S.confirmar) corpo += '<div class="confirma"><span>Os vídeos que ainda estão "a gravar" serão trocados pelos da receita. O que já foi gravado fica.</span>' +
      '<button class="btn btn-principal btn-mini" type="button" data-act="montar-sim">Trocar</button><button class="btn btn-mini" type="button" data-act="montar-nao">Cancelar</button></div>';
    if (!vs.length) {
      corpo += '<div class="vazio"><span>Esta semana ainda não tem vídeos. Escolha uma receita e monte: cada vídeo já vem com um assunto do banco.</span>' +
        '<button class="btn btn-principal" type="button" data-act="montar">Montar a semana</button></div>';
    } else {
      corpo += '<div class="regua"><div><span class="r">Gravados</span><span class="v">' + nf + ' de ' + ativos.length + '</span><span class="c">' + plural(np, 'postado', 'postados') + '</span></div>' +
        ['f', 'c', 'g'].map(function (k) {
          var d = ativos.filter(function (v) { return v.frente === k; });
          return '<div><span class="r">' + B.frentes[k].nome + '</span><span class="v">' + d.length + '</span><span class="c">' + plural(d.filter(function (v) { return feito(v.status); }).length, 'gravado', 'gravados') + '</span></div>';
        }).join('') +
        '<div><span class="r">Sem assunto pronto</span><span class="v' + (nfalta ? ' erro' : '') + '">' + nfalta + '</span><span class="c">' + (nfalta ? '<a href="#assuntos">Preencher assuntos</a>' : 'tudo pronto para gravar') + '</span></div></div>';
    }
    corpo += '<div class="quadro">' + [0, 1, 2, 3, 4, 5].map(function (i) {
      var d = soma(s.inicio, i), doDia = vs.filter(function (v) { return v.data === d; });
      var at = doDia.filter(function (v) { return v.status !== 'pulado'; }), ok = at.filter(function (v) { return feito(v.status); }).length;
      return '<section class="dia' + (d === B.hoje ? ' hoje' : '') + '" aria-label="' + DIAS[i] + '"><div class="dia-cab"><span><b>' + CURTO[i] + '</b><span class="data">' + dm(d) + '</span></span>' +
        (at.length ? '<span class="conta' + (ok === at.length ? ' todo' : '') + '">' + ok + ' de ' + at.length + '</span>' : '') + '</div>' +
        (doDia.length ? doDia.map(cartao).join('') : '<p class="livre">Dia livre</p>') +
        '<div class="mais"><select data-add="' + d + '" aria-label="Pôr vídeo em ' + DIAS[i] + '">' + fmOptions('', '+ Vídeo') + '</select></div></section>';
    }).join('') + '</div>';
    moldura('semana', corpo);
  }
  function cartao(v) {
    var txt = v.abertura || v.prova || '';
    var aviso = !v.assunto_id ? '<span class="selo selo-erro">Sem assunto</span>' : (!v.completo && !feito(v.status) ? '<span class="selo selo-atencao">Falta preencher</span>' : '');
    return '<button type="button" class="cartao-video' + (feito(v.status) || v.status === 'pulado' ? ' feito' : '') + '" data-act="video" data-id="' + v.id + '">' +
      '<span class="topo-c">' + frente(v.frente) + situacao(v) + '</span>' +
      '<span class="fm">' + h(v.formato_nome) + '</span>' +
      (txt ? '<span class="ab">' + h(txt) + '</span>' : '') + aviso + '</button>';
  }

  // ---------- Gaveta ----------
  function abrirGaveta(html) {
    document.getElementById('painel').innerHTML = html; document.getElementById('gaveta').hidden = false;
    var f = document.querySelector('#painel .corpo-gaveta select, #painel .corpo-gaveta textarea, #painel .corpo-gaveta input'); if (f) f.focus();
  }
  function fecharGaveta() { var g = document.getElementById('gaveta'); if (g) g.hidden = true; }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fecharGaveta(); });
  function cabGaveta(rot, titulo) {
    return '<header><div><p class="rotulo">' + rot + '</p><h2>' + titulo + '</h2></div><button class="btn btn-fantasma btn-icone" type="button" data-act="fechar" aria-label="Fechar">' + ic('x') + '</button></header>';
  }

  function gavetaVideo(id) {
    var v = S.semana.videos.filter(function (x) { return x.id === id; })[0]; if (!v) return;
    carregaAssuntos().then(function (lista) {
      var doFm = lista.filter(function (a) { return a.formato === v.formato && (a.ativo || a.id === v.assunto_id); });
      var fm = B.fmap[v.formato];
      abrirGaveta(cabGaveta(longa(v.data), h(fm.nome)) + '<div class="corpo-gaveta">' +
        '<div class="campo"><label>Situação</label><div class="segmentos">' + ['a_gravar', 'gravado', 'editado', 'postado', 'pulado'].map(function (k) {
          return '<button type="button" data-act="status" data-id="' + v.id + '" data-st="' + k + '" aria-pressed="' + (v.status === k) + '">' + ST_NOME[k] + '</button>';
        }).join('') + '</div>' + (atrasado(v) ? '<span class="ajuda" style="color:var(--erro)">O dia já passou e este vídeo não foi gravado.</span>' : '') + '</div>' +
        '<div class="campo"><label for="gAs">Assunto</label><select id="gAs" data-vid="' + v.id + '"><option value="">Escolher assunto</option>' +
        doFm.map(function (a) {
          return '<option value="' + a.id + '"' + (a.id === v.assunto_id ? ' selected' : '') + '>' + String(a.numero).padStart(2, '0') + ' · ' + h(a.abertura || a.prova || 'sem frase') +
            (a.completo ? '' : ' (falta preencher)') + (a.ultimo_uso && a.id !== v.assunto_id ? ' · usado em ' + dm(a.ultimo_uso) : '') + '</option>';
        }).join('') + '</select></div>' +
        (v.assunto_id ? '<div class="roteiro">' +
          (v.abertura ? '<p class="abre">“' + h(v.abertura) + '”</p>' : '<p class="ponto erro">Falta a frase de abertura</p>') +
          (v.pontos ? '<p class="tinta-2">' + h(v.pontos) + '</p>' : '<p class="ponto atencao">Falta o que falar</p>') +
          (v.prova ? '<p class="fraca">Prova: ' + h(v.prova) + '</p>' : '') +
          '<div><button class="btn btn-mini" type="button" data-act="editar-assunto" data-id="' + v.assunto_id + '">Preencher o assunto</button></div></div>' : '') +
        '<div class="campo"><label for="gLink">Link do post no Instagram</label><input id="gLink" type="url" inputmode="url" placeholder="https://www.instagram.com/p/..." value="' + h(v.link) + '"></div>' +
        '<div class="campo"><label for="gPal">Palavra para comentar</label><input id="gPal" value="' + h(v.palavra_final) + '"><span class="ajuda">Gatilho do ManyChat. Formação e imersão vão para o Daniel.</span></div>' +
        '<div class="campo"><label for="gFm">Formato</label><select id="gFm" data-vid="' + v.id + '">' + fmOptions(v.formato) + '</select><span class="ajuda">' + h(fm.dica) + '</span></div>' +
        '<div class="campo"><label for="gData">Dia</label><input id="gData" type="date" value="' + v.data + '"></div>' +
        '<div class="campo"><label for="gNota">Nota</label><textarea id="gNota" placeholder="Ex.: gravar com o print do cliente">' + h(v.nota) + '</textarea></div>' +
        (v.atualizado_por ? '<p class="fraca">Última mudança: ' + h(v.atualizado_por) + ', ' + h(v.atualizado_em.slice(8, 10) + '/' + v.atualizado_em.slice(5, 7) + ' ' + v.atualizado_em.slice(11)) + '</p>' : '') +
        '</div><footer><button class="btn btn-fantasma btn-perigo" type="button" data-act="apagar-video" data-id="' + v.id + '">Tirar da semana</button>' +
        '<div class="linha"><button class="btn" type="button" data-act="fechar">Cancelar</button><button class="btn btn-principal" type="button" data-act="salvar-video" data-id="' + v.id + '">Salvar</button></div></footer>');
    }).catch(falha);
  }

  // ---------- Folha do dia ----------
  function telaHoje(d) {
    api('GET', '/api/dia?data=' + (d || B.hoje)).then(function (j) { S.dia = j; desenhaHoje(); }).catch(falha);
  }
  function desenhaHoje() {
    var j = S.dia, vs = j.videos, ok = vs.filter(function (v) { return feito(v.status); }).length;
    var corpo = '<div class="cabecalho"><div><h1>' + (j.data === B.hoje ? 'Hoje, ' : '') + longa(j.data) + '</h1><p class="estado">' +
      (vs.length ? ok + ' de ' + plural(vs.length, 'vídeo gravado', 'vídeos gravados') + (ok === vs.length ? '. Dia completo.' : '.') : 'Nenhum vídeo para este dia.') + '</p></div>' +
      '<div class="acoes nao-imprime"><div class="linha" style="gap:4px"><a class="btn btn-icone" href="#hoje/' + soma(j.data, -1) + '" aria-label="Dia anterior">' + ic('esq') + '</a>' +
      (j.data !== B.hoje ? '<a class="btn" href="#hoje">Hoje</a>' : '') + '<a class="btn btn-icone" href="#hoje/' + soma(j.data, 1) + '" aria-label="Próximo dia">' + ic('dir') + '</a></div>' +
      '<button class="btn" type="button" data-act="imprimir">' + ic('imprimir') + 'Imprimir</button></div></div><div class="folha">';
    if (!vs.length) corpo += '<div class="vazio"><span>Nada para gravar neste dia.' + (j.proximo ? ' O próximo dia com vídeo é ' + longa(j.proximo).toLowerCase() + '.' : '') + '</span>' +
      (j.proximo ? '<a class="btn" href="#hoje/' + j.proximo + '">Ver o próximo</a>' : '') + '</div>';
    vs.forEach(function (v, i) {
      var fm = B.fmap[v.formato], f = feito(v.status);
      corpo += '<article class="video-folha' + (f ? ' feito' : '') + '"><span class="n">' + (f ? ic('check') : i + 1) + '</span><div class="c">' +
        '<div class="linha">' + frente(v.frente) + '<span class="fraca">' + h(fm.nome) + (v.assunto_id ? ' · ' + cod(v.formato, v.a_numero) : '') + '</span></div>' +
        (v.abertura ? '<p class="abre">“' + h(v.abertura) + '”</p>' : '<p class="ponto atencao">A frase de abertura ainda vai ser preenchida.</p>') +
        (v.pontos ? '<p class="falar">' + h(v.pontos) + '</p>' : '') +
        (v.prova ? '<p class="tinta-2"><b>Prova:</b> ' + h(v.prova) + '</p>' : '') +
        '<ol>' + fm.passos.map(function (p) { return '<li>' + h(p) + '</li>'; }).join('') + '</ol>' +
        (v.nota ? '<p class="fraca">Nota: ' + h(v.nota) + '</p>' : '') +
        '<div class="rodape"><span>' + (v.palavra_final ? 'No fim: “Comenta <span class="palavra">' + h(v.palavra_final) + '</span> que eu te mando.”' : '') + '</span>' +
        '<button type="button" class="btn ' + (f ? '' : 'btn-principal') + ' nao-imprime" data-act="gravei" data-id="' + v.id + '" data-st="' + v.status + '">' +
        (f ? ic('check') + 'Gravado' : 'Marcar como gravado') + '</button></div></div></article>';
    });
    corpo += '<p class="lembretes"><span>Celular em pé, rosto perto, lugar claro.</span><span>A frase de abertura nos 3 primeiros segundos.</span><span>Um assunto por vídeo.</span><span>Sem nome nem CPF de cliente na tela.</span></p></div>';
    moldura('hoje', corpo);
  }

  // ---------- Assuntos ----------
  function telaAssuntos() { carregaAssuntos(true).then(desenhaAssuntos).catch(falha); }
  function desenhaAssuntos() {
    var lista = S.assuntos, prontos = lista.filter(function (a) { return a.ativo && a.completo; }).length;
    var f = S.filtro;
    var visiveis = lista.filter(function (a) {
      if (f === 'falta') return a.ativo && !a.completo;
      if (f === 'todos') return a.ativo;
      if (f === 'arquivados') return !a.ativo;
      return a.formato === f && a.ativo;
    });
    var ordem = {}; B.formatos.forEach(function (x, i) { ordem[x.id] = i; });
    visiveis.sort(function (a, b) { return (ordem[a.formato] - ordem[b.formato]) || (a.numero - b.numero); });
    var corpo = '<div class="cabecalho"><div><h1>Assuntos</h1><p class="estado">' + plural(prontos, 'assunto pronto', 'assuntos prontos') + ', ' + S.faltam + ' para preencher. A semana puxa daqui o que está há mais tempo sem uso.</p></div>' +
      '<div class="acoes"><select class="sel" id="selFiltro" aria-label="Mostrar">' +
      '<option value="falta"' + (f === 'falta' ? ' selected' : '') + '>Falta preencher (' + S.faltam + ')</option>' +
      '<option value="todos"' + (f === 'todos' ? ' selected' : '') + '>Todos os assuntos</option>' +
      ['f', 'c', 'g'].map(function (k) {
        return '<optgroup label="' + h(B.frentes[k].nome) + '">' + B.formatos.filter(function (x) { return x.frente === k; }).map(function (x) {
          return '<option value="' + x.id + '"' + (f === x.id ? ' selected' : '') + '>' + h(x.nome) + '</option>'; }).join('') + '</optgroup>';
      }).join('') + '<option value="arquivados"' + (f === 'arquivados' ? ' selected' : '') + '>Arquivados</option></select>' +
      '<select class="sel" id="selNovo" aria-label="Novo assunto">' + fmOptions('', 'Novo assunto em...') + '</select></div></div>';
    if (!visiveis.length) {
      corpo += '<div class="vazio"><span>' + (f === 'falta' ? 'Todos os assuntos estão prontos para gravar.' : 'Nenhum assunto aqui ainda.') + '</span>' +
        (f === 'falta' ? '<button class="btn" type="button" data-act="filtro" data-v="todos">Ver todos</button>' : '') + '</div>';
    } else {
      var linhas = '', grupo = '';
      visiveis.forEach(function (a) {
        var fm = B.fmap[a.formato];
        if (fm.id !== grupo) { grupo = fm.id; linhas += '<tr class="grupo-linha"><td colspan="5">' + frente(fm.frente) + ' · ' + h(fm.nome) + '</td></tr>'; }
        linhas += '<tr data-act="editar-assunto" data-id="' + a.id + '" class="' + (a.ativo ? '' : 'apagado') + '"><td class="curto fraca">' + String(a.numero).padStart(2, '0') + '</td>' +
          '<td>' + (a.abertura ? h(a.abertura) : '<span class="fraca">' + h(a.prova || 'Sem frase de abertura') + '</span>') + '</td>' +
          '<td class="curto">' + (a.completo ? '<span class="selo selo-ok">Pronto</span>' : '<span class="selo selo-atencao">Falta ' + (!(a.abertura || '').trim() ? 'a frase' : 'o que falar') + '</span>') + '</td>' +
          '<td class="num">' + (a.vezes ? plural(a.vezes, 'vez', 'vezes') : 'Nunca') + '</td><td class="num fraca">' + (a.ultimo_uso ? dm(a.ultimo_uso) : 'sem uso') + '</td></tr>';
      });
      corpo += '<div class="tabela-caixa"><table class="tabela"><thead><tr><th>Nº</th><th>Frase de abertura</th><th>Situação</th><th class="num">Usado</th><th class="num">Última vez</th></tr></thead><tbody>' + linhas + '</tbody></table></div>';
    }
    moldura('assuntos', corpo);
  }
  function gavetaAssunto(id) {
    carregaAssuntos().then(function (lista) {
      var a = lista.filter(function (x) { return x.id === id; })[0]; if (!a) return;
      var fm = B.fmap[a.formato];
      abrirGaveta(cabGaveta(h(B.frentes[fm.frente].nome) + ' · ' + cod(a.formato, a.numero), h(fm.nome)) + '<div class="corpo-gaveta">' +
        '<div class="roteiro"><p class="tinta-2">' + h(fm.dica) + '</p><ol>' + fm.passos.map(function (p) { return '<li>' + h(p) + '</li>'; }).join('') + '</ol></div>' +
        '<div class="campo"><label for="aAb">Frase de abertura</label><textarea id="aAb" placeholder="Ex.: Meu nome tá limpo e o banco negou. Por quê?">' + h(a.abertura) + '</textarea><span class="ajuda">É o que o Uélicon fala nos 3 primeiros segundos.</span></div>' +
        '<div class="campo"><label for="aPo">O que falar</label><textarea id="aPo" style="min-height:120px" placeholder="A explicação em 2 ou 3 frases simples, com um exemplo do dia a dia.">' + h(a.pontos) + '</textarea></div>' +
        '<div class="campo"><label for="aPr">Prova ou exemplo</label><input id="aPr" placeholder="Ex.: de 2.500 para 55 mil de limite" value="' + h(a.prova) + '"><span class="ajuda">Opcional. Número ou caso real, sem nome nem CPF.</span></div>' +
        '<div class="campo"><label for="aPa">Palavra para comentar</label><input id="aPa" value="' + h(a.palavra) + '"></div>' +
        '<p class="fraca">' + (a.vezes ? 'Usado ' + plural(a.vezes, 'vez', 'vezes') + ', a última em ' + dm(a.ultimo_uso) + (a.postados ? ', ' + plural(a.postados, 'postado', 'postados') : '') + '.' : 'Ainda não foi usado.') + '</p>' +
        '</div><footer><button class="btn btn-fantasma' + (a.ativo ? ' btn-perigo' : '') + '" type="button" data-act="arquivar-assunto" data-id="' + a.id + '" data-ativo="' + (a.ativo ? 0 : 1) + '">' + (a.ativo ? 'Arquivar' : 'Voltar a usar') + '</button>' +
        '<div class="linha"><button class="btn" type="button" data-act="fechar">Cancelar</button><button class="btn btn-principal" type="button" data-act="salvar-assunto" data-id="' + a.id + '">Salvar</button></div></footer>');
    }).catch(falha);
  }

  // ---------- Receitas ----------
  function telaReceitas(id) {
    api('GET', '/api/receitas').then(function (r) { S.receitas = r; desenhaReceitas(id ? +id : (r[0] && r[0].id)); }).catch(falha);
  }
  function desenhaReceitas(id) {
    var r = S.receitas.filter(function (x) { return x.id === id; })[0] || S.receitas[0];
    var tot = { f: 0, c: 0, g: 0 }, n = 0;
    if (r) r.dias.forEach(function (d) { d.forEach(function (fid) { tot[B.fmap[fid].frente]++; n++; }); });
    var corpo = '<div class="cabecalho"><div><h1>Receitas</h1><p class="estado">A receita diz quantos vídeos tem cada dia e de que tipo. A semana é montada a partir dela.</p></div>' +
      '<div class="acoes"><select class="sel" id="selRec" aria-label="Receita">' + S.receitas.map(function (x) { return '<option value="' + x.id + '"' + (r && x.id === r.id ? ' selected' : '') + '>' + h(x.nome) + '</option>'; }).join('') + '</select>' +
      (r ? '<button class="btn" type="button" data-act="duplicar-receita" data-id="' + r.id + '">Duplicar</button>' : '') +
      '<button class="btn" type="button" data-act="nova-receita">' + ic('mais') + 'Nova receita</button></div></div>';
    if (r) {
      corpo += '<div class="regua"><div><span class="r">Vídeos na semana</span><span class="v">' + n + '</span><span class="c">de segunda a sábado</span></div>' +
        ['f', 'c', 'g'].map(function (k) { return '<div><span class="r">' + B.frentes[k].nome + '</span><span class="v">' + tot[k] + '</span><span class="c">' + (n ? Math.round(100 * tot[k] / n) : 0) + '% da semana</span></div>'; }).join('') + '</div>' +
        '<div class="campo" style="max-width:360px"><label for="recNome">Nome da receita</label><input id="recNome" value="' + h(r.nome) + '" data-id="' + r.id + '"></div>' +
        '<div class="quadro">' + r.dias.map(function (d, i) {
          return '<section class="dia"><div class="dia-cab"><b>' + CURTO[i] + '</b><span class="conta">' + plural(d.length, 'vídeo', 'vídeos') + '</span></div>' +
            d.map(function (fid, j) { var fm = B.fmap[fid]; return '<div class="receita-chip"><span class="frente ' + fm.frente + '">' + h(fm.nome) + '</span><button class="btn btn-fantasma btn-icone btn-mini" type="button" data-act="rec-tira" data-id="' + r.id + '" data-d="' + i + '" data-j="' + j + '" aria-label="Tirar ' + h(fm.nome) + '">' + ic('x') + '</button></div>'; }).join('') +
            '<div class="mais"><select data-rec="' + r.id + '" data-d="' + i + '" aria-label="Pôr formato em ' + DIAS[i] + '">' + fmOptions('', '+ Formato') + '</select></div></section>';
        }).join('') + '</div>' +
        '<div><button class="btn btn-fantasma btn-perigo" type="button" data-act="apagar-receita" data-id="' + r.id + '">Apagar esta receita</button></div>';
    }
    moldura('receitas', corpo);
  }
  function salvaReceita(r) { return api('PUT', '/api/receitas/' + r.id, { dias: r.dias }).then(function () { desenhaReceitas(r.id); }).catch(falha); }

  // ---------- Andamento ----------
  function telaAndamento() { api('GET', '/api/andamento').then(desenhaAndamento).catch(falha); }
  function desenhaAndamento(j) {
    var atual = j.semanas.filter(function (s) { return s.atual; })[0];
    var at = atual.total - atual.pulados, pct = function (a, b) { return b ? Math.round(100 * a / b) : 0; };
    var ant = j.semanas[j.semanas.length - 3];
    var antAt = ant ? ant.total - ant.pulados : 0;
    var corpo = '<div class="cabecalho"><div><h1>Andamento</h1><p class="estado">' + (at ? pct(atual.gravados, at) + '% do planejado desta semana está gravado' + (j.atrasados.length ? ' e ' + plural(j.atrasados.length, 'vídeo está atrasado', 'vídeos estão atrasados') : '') + '.' : 'Esta semana ainda não tem plano.') + '</p></div>' +
      '<div class="acoes"><a class="btn" href="#semana">Abrir a semana</a></div></div>' +
      '<div class="regua"><div><span class="r">Gravados esta semana</span><span class="v">' + atual.gravados + ' de ' + at + '</span><span class="c">' + (antAt ? 'semana passada: ' + ant.gravados + ' de ' + antAt : 'semana passada sem plano') + '</span></div>' +
      '<div><span class="r">Postados</span><span class="v">' + atual.postados + '</span><span class="c">' + pct(atual.postados, at) + '% do planejado</span></div>' +
      '<div><span class="r">Atrasados</span><span class="v' + (j.atrasados.length ? ' erro' : '') + '">' + j.atrasados.length + '</span><span class="c">últimas 3 semanas</span></div>' +
      '<div><span class="r">Gravados sem post</span><span class="v">' + j.sem_post.length + '</span><span class="c">esperando edição ou post</span></div>' +
      '<div><span class="r">Assuntos a preencher</span><span class="v' + (j.assuntos_incompletos ? ' erro' : '') + '">' + j.assuntos_incompletos + '</span><span class="c">' + (j.assuntos_incompletos ? '<a href="#assuntos">Preencher</a>' : 'banco em dia') + '</span></div></div>';
    corpo += '<div class="bloco"><h2>Dia a dia desta semana</h2><div class="tabela-caixa"><table class="tabela"><thead><tr><th>Dia</th>' +
      ['f', 'c', 'g'].map(function (k) { return '<th>' + B.frentes[k].nome + '</th>'; }).join('') + '<th class="num">Gravados</th><th class="num">Postados</th><th>Situação</th></tr></thead><tbody>' +
      [0, 1, 2, 3, 4, 5].map(function (i) {
        var d = soma(atual.inicio, i), x = j.dias.filter(function (y) { return y.data === d; })[0] || { tot: 0, grav: 0, post: 0 };
        var st = !x.tot ? '<span class="fraca">sem vídeo</span>' : x.grav >= x.tot ? '<span class="ponto ok">Completo</span>' : d < j.hoje ? '<span class="ponto erro">Faltou gravar</span>' : d === j.hoje ? '<span class="ponto atencao">Hoje</span>' : '<span class="ponto">Pela frente</span>';
        var pf = (j.dias_frente || {})[d] || {};
        return '<tr data-href="#hoje/' + d + '"><td class="curto">' + CURTO[i] + ' ' + dm(d) + '</td>' +
          ['f', 'c', 'g'].map(function (k) { var p = pf[k]; return '<td class="fraca">' + (p ? p.grav + ' de ' + p.tot : 'sem vídeo') + '</td>'; }).join('') +
          '<td class="num">' + (x.grav || 0) + ' de ' + x.tot + '</td><td class="num">' + (x.post || 0) + '</td><td>' + st + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    corpo += '<div class="duas"><div class="bloco"><h2>Atrasados</h2>' + (j.atrasados.length ? listaVideos(j.atrasados, true) : '<div class="vazio"><span>Nada atrasado.</span></div>') + '</div>' +
      '<div class="bloco"><h2>Gravados, falta postar</h2>' + (j.sem_post.length ? listaVideos(j.sem_post) : '<div class="vazio"><span>Tudo que foi gravado já foi postado.</span></div>') + '</div></div>';
    corpo += '<div class="bloco"><h2>Semana a semana</h2><div class="tabela-caixa"><table class="tabela"><thead><tr><th>Semana</th><th>Gravados e postados</th><th class="num">Planejados</th><th class="num">Gravados</th><th class="num">Postados</th></tr></thead><tbody>' +
      j.semanas.slice().reverse().map(function (s) {
        var a = s.total - s.pulados;
        return '<tr data-href="#semana/' + s.inicio + '"><td class="curto">' + dm(s.inicio) + (s.atual ? ' <span class="selo selo-info">Esta</span>' : '') + '</td>' +
          '<td><div class="trilho" aria-label="' + s.postados + ' postados e ' + (s.gravados - s.postados) + ' gravados sem post"><i class="p" style="width:' + pct(s.postados, a) + '%"></i><i class="g" style="width:' + pct(s.gravados - s.postados, a) + '%"></i></div></td>' +
          '<td class="num">' + (a || 'sem plano') + '</td><td class="num">' + s.gravados + '</td><td class="num">' + s.postados + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="fraca">Na barra: verde é postado, azul é gravado e ainda não postado.</p></div>';
    corpo += '<details class="recolhido"><summary>Últimas mudanças</summary>' + (j.historico.length ? '<div class="tabela-caixa"><table class="tabela"><tbody>' + j.historico.map(function (x) {
      return '<tr data-href="#semana/' + semanaDe(x.data) + '"><td>' + h(x.quem) + ' marcou <b>' + ST_NOME[x.para] + '</b></td><td class="fraca">' + dm(x.data) + ' · ' + h(x.formato_nome) + '</td><td class="num fraca">' + h(x.quando.slice(8, 10) + '/' + x.quando.slice(5, 7) + ' ' + x.quando.slice(11)) + '</td></tr>';
    }).join('') + '</tbody></table></div>' : '<p class="fraca" style="padding:0 16px 12px">Ainda nada.</p>') + '</details>';
    moldura('andamento', corpo);
  }
  function listaVideos(vs, comDia) {
    return '<div class="tabela-caixa"><table class="tabela"><tbody>' + vs.map(function (v) {
      return '<tr data-href="#semana/' + semanaDe(v.data) + '"><td class="curto">' + CURTO[diaSem(v.data)] + ' ' + dm(v.data) + '</td><td>' + frente(v.frente) + ' <span class="tinta-2">' + h(v.formato_nome) + '</span>' +
        (v.abertura ? '<br><span class="fraca">' + h(v.abertura) + '</span>' : '') + '</td><td class="curto">' + situacao(v) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }

  // ---------- ações ----------
  function mudaStatus(id, novo, antes, depois) {
    return api('PATCH', '/api/videos/' + id, { status: novo }).then(function () {
      aviso('Marcado como ' + ST_NOME[novo].toLowerCase(), function () { api('PATCH', '/api/videos/' + id, { status: antes }).then(depois).catch(falha); });
      return depois();
    }).catch(falha);
  }
  document.addEventListener('click', function (e) {
    var linha = e.target.closest('tr[data-href]');
    if (linha && !e.target.closest('a,button')) { location.hash = linha.dataset.href; return; }
    var t = e.target.closest('[data-act]'); if (!t) return;
    var act = t.dataset.act, id = +t.dataset.id;
    if (act === 'fechar') return fecharGaveta();
    if (act === 'sair') return api('POST', '/api/sair').then(function () { location.hash = ''; telaEntrar(); });
    if (act === 'imprimir') return window.print();
    if (act === 'montar') { if (S.semana.videos.length) { S.confirmar = true; return desenhaSemana(); } return montar(false); }
    if (act === 'montar-sim') { S.confirmar = false; return montar(true); }
    if (act === 'montar-nao') { S.confirmar = false; return desenhaSemana(); }
    if (act === 'video') return gavetaVideo(id);
    if (act === 'status') {
      var v = S.semana.videos.filter(function (x) { return x.id === id; })[0];
      if (!v || v.status === t.dataset.st) return;
      return mudaStatus(id, t.dataset.st, v.status, function () { return recarregaSemana().then(function () { if (!document.getElementById('gaveta').hidden) gavetaVideo(id); }); });
    }
    if (act === 'salvar-video') {
      var nova = document.getElementById('gData').value;
      return api('PATCH', '/api/videos/' + id, { link: document.getElementById('gLink').value.trim(), palavra: document.getElementById('gPal').value.trim().toUpperCase(), nota: document.getElementById('gNota').value, data: nova })
        .then(function () { aviso('Vídeo salvo'); fecharGaveta(); if (semanaDe(nova) !== S.semana.inicio) { location.hash = '#semana/' + semanaDe(nova); return; } return recarregaSemana(); }).catch(falha);
    }
    if (act === 'apagar-video') {
      if (t.dataset.certo !== '1') { t.dataset.certo = '1'; t.textContent = 'Clique de novo: some da semana e do andamento'; return; }
      return api('DELETE', '/api/videos/' + id).then(function () { aviso('Vídeo tirado da semana'); fecharGaveta(); return recarregaSemana(); }).catch(falha);
    }
    if (act === 'gravei') {
      var antes = t.dataset.st, novo = feito(antes) ? 'a_gravar' : 'gravado';
      return mudaStatus(id, novo, antes, function () { return telaHoje(S.dia.data); });
    }
    if (act === 'editar-assunto') return gavetaAssunto(id);
    if (act === 'salvar-assunto') {
      return api('PATCH', '/api/assuntos/' + id, { abertura: document.getElementById('aAb').value.trim(), pontos: document.getElementById('aPo').value.trim(), prova: document.getElementById('aPr').value.trim(), palavra: document.getElementById('aPa').value.trim().toUpperCase() })
        .then(function () { depoisAssunto('Assunto salvo'); }).catch(falha);
    }
    if (act === 'arquivar-assunto') {
      var ativo = +t.dataset.ativo;
      return api('PATCH', '/api/assuntos/' + id, { ativo: ativo }).then(function () {
        depoisAssunto(ativo ? 'Assunto de volta ao banco' : 'Assunto arquivado', ativo ? null : function () { api('PATCH', '/api/assuntos/' + id, { ativo: 1 }).then(function () { depoisAssunto('Assunto de volta ao banco'); }); });
      }).catch(falha);
    }
    if (act === 'filtro') { S.filtro = t.dataset.v; return desenhaAssuntos(); }
    if (act === 'nova-receita') return api('POST', '/api/receitas', { nome: 'Receita nova' }).then(function (r) { location.hash = '#receitas/' + r.id; }).catch(falha);
    if (act === 'duplicar-receita') {
      var base = S.receitas.filter(function (x) { return x.id === id; })[0];
      return api('POST', '/api/receitas', { nome: base.nome + ' (cópia)', dias: base.dias }).then(function (r) { location.hash = '#receitas/' + r.id; aviso('Receita duplicada'); }).catch(falha);
    }
    if (act === 'apagar-receita') {
      if (t.dataset.certo !== '1') { t.dataset.certo = '1'; t.textContent = 'Clique de novo: a receita some da lista (as semanas já montadas ficam)'; return; }
      return api('PUT', '/api/receitas/' + id, { apagar: true }).then(function () { aviso('Receita apagada'); location.hash = '#receitas'; telaReceitas(); }).catch(falha);
    }
    if (act === 'rec-tira') {
      var r = S.receitas.filter(function (x) { return x.id === id; })[0];
      r.dias[+t.dataset.d].splice(+t.dataset.j, 1); return salvaReceita(r);
    }
  });
  function depoisAssunto(msg, desfazer) {
    aviso(msg, desfazer); fecharGaveta();
    return carregaAssuntos(true).then(function () {
      if (rotaAtual() === 'assuntos') desenhaAssuntos(); else if (rotaAtual() === 'semana' && S.semana) recarregaSemana();
    });
  }
  function montar(substituir) {
    return api('POST', '/api/semana/montar', { inicio: S.semana.inicio, receita: +document.getElementById('selReceita').value, substituir: substituir })
      .then(function (r) { aviso(plural(r.criados, 'vídeo posto', 'vídeos postos') + ' na semana'); return recarregaSemana(); }).catch(falha);
  }
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.add) { if (!t.value) return; return api('POST', '/api/videos', { data: t.dataset.add, formato: t.value }).then(function () { aviso('Vídeo posto no dia'); return recarregaSemana(); }).catch(falha); }
    if (t.id === 'gFm') return api('PATCH', '/api/videos/' + t.dataset.vid, { formato: t.value }).then(recarregaSemana).then(function () { gavetaVideo(+t.dataset.vid); }).catch(falha);
    if (t.id === 'gAs') return api('PATCH', '/api/videos/' + t.dataset.vid, { assunto_id: t.value ? +t.value : null, palavra: null }).then(recarregaSemana).then(function () { gavetaVideo(+t.dataset.vid); }).catch(falha);
    if (t.id === 'selFiltro') { S.filtro = t.value; return desenhaAssuntos(); }
    if (t.id === 'selNovo') {
      if (!t.value) return;
      return api('POST', '/api/assuntos', { formato: t.value }).then(function (r) { return carregaAssuntos(true).then(function () { desenhaAssuntos(); gavetaAssunto(r.id); }); }).catch(falha);
    }
    if (t.id === 'selRec') { location.hash = '#receitas/' + t.value; return; }
    if (t.id === 'recNome') return api('PUT', '/api/receitas/' + t.dataset.id, { nome: t.value.trim() }).then(function () { aviso('Nome salvo'); telaReceitas(+t.dataset.id); }).catch(falha);
    if (t.dataset.rec) {
      var r = S.receitas.filter(function (x) { return x.id === +t.dataset.rec; })[0];
      if (!t.value) return; r.dias[+t.dataset.d].push(t.value); return salvaReceita(r);
    }
  });

  iniciar();
})();
