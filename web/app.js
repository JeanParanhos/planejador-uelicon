/* Planejador do Uélicon: tela única com rotas por hash.
   #inicio · #semana/<seg> · #hoje/<dia> · #assuntos/<aba>/<topico> · #andamento · #config/<pessoas|receitas>/<id> */
(function () {
  'use strict';

  var B = { eu: null, formatos: [], fmap: {}, frentes: [], fr: {}, hoje: '' };
  var S = { semana: null, receitas: [], assuntos: [], confirmar: false, dia: null, vids: {}, faltam: 0 };
  var DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  var CURTO = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  var ST_NOME = { a_gravar: 'A gravar', gravado: 'Gravado', editado: 'Editado', postado: 'Postado', pulado: 'Pulado' };
  var PAPEL = { super: 'Tudo (administrador)', equipe: 'Equipe: planeja e acompanha', gravador: 'Gravação: só a folha do dia' };
  var app = document.getElementById('app');

  var IC = {
    inicio: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
    semana: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    hoje: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    assuntos: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    andamento: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
    config: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    imprimir: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>', esq: '<path d="m15 18-6-6 6-6"/>', dir: '<path d="m9 18 6-6-6-6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>', mais: '<path d="M12 5v14M5 12h14"/>', lapis: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>'
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
  function quando(s) { return s === B.hoje ? 'Hoje' : s === soma(B.hoje, 1) ? 'Amanhã' : CURTO[diaSem(s)] + ' ' + dm(s); }
  function hora(s) { return s ? s.slice(8, 10) + '/' + s.slice(5, 7) + ' ' + s.slice(11) : ''; }
  function feito(st) { return st === 'gravado' || st === 'editado' || st === 'postado'; }
  function atrasado(v) { return v.status === 'a_gravar' && v.data < B.hoje; }
  function plural(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }
  function situacao(v) { return atrasado(v) ? '<span class="st atrasado">Atrasado</span>' : '<span class="st ' + v.status + '">' + ST_NOME[v.status] + '</span>'; }
  function frente(k, txt) { var f = B.fr[k] || { nome: k, cor: '#3f3f46' }; return '<span class="frente" style="--c:' + h(f.cor) + '">' + h(txt || f.nome) + '</span>'; }
  function fmOptions(sel, vazio) {
    var out = vazio ? '<option value="">' + vazio + '</option>' : '';
    B.frentes.forEach(function (fr) {
      var fs = B.formatos.filter(function (f) { return f.frente === fr.id; }); if (!fs.length) return;
      out += '<optgroup label="' + h(fr.nome) + '">' + fs.map(function (f) { return '<option value="' + f.id + '"' + (f.id === sel ? ' selected' : '') + '>' + h(f.nome) + '</option>'; }).join('') + '</optgroup>';
    });
    return out;
  }
  function equipe() { return B.eu && B.eu.papel !== 'gravador'; }
  function guarda(lista) { lista.forEach(function (v) { S.vids[v.id] = v; }); return lista; }
  function recarregaBase() {
    return api('GET', '/api/eu').then(function (j) {
      B.eu = j.usuario; B.hoje = j.hoje; B.frentes = j.frentes; B.formatos = j.formatos.filter(function (f) { return f.ativo !== 0; });
      B.fr = {}; j.frentes.forEach(function (f) { B.fr[f.id] = f; });
      B.fmap = {}; j.formatos.forEach(function (f) { B.fmap[f.id] = f; });
    });
  }
  function carregaAssuntos(forcar) {
    if (S.assuntos.length && !forcar) return Promise.resolve(S.assuntos);
    return api('GET', '/api/assuntos').then(function (a) {
      S.assuntos = a; S.faltam = a.filter(function (x) { return x.ativo && !x.completo; }).length; return a;
    });
  }

  // ---------- entrada ----------
  function telaEntrar(msg) {
    fecharGaveta();
    app.innerHTML = '<div class="entrar"><form id="fEntrar"><div><p class="fraca">Instagram do Uélicon</p><h1>Planejador do Uélicon</h1></div>' +
      '<div class="campo"><label for="eLogin">E-mail ou usuário</label><input id="eLogin" autocomplete="username" required></div>' +
      '<div class="campo"><label for="eSenha">Senha</label><input id="eSenha" type="password" autocomplete="current-password" required></div>' +
      '<p class="erro-txt" id="eErro">' + h(msg || '') + '</p><button class="btn btn-principal" type="submit">Entrar</button></form></div>';
    document.getElementById('fEntrar').addEventListener('submit', function (e) {
      e.preventDefault();
      api('POST', '/api/entrar', { login: document.getElementById('eLogin').value, senha: document.getElementById('eSenha').value })
        .then(iniciar).catch(function (er) { document.getElementById('eErro').textContent = er.message; });
    });
  }
  function iniciar() {
    return recarregaBase().then(function () {
      return (equipe() ? Promise.all([carregaAssuntos(true), api('GET', '/api/usuarios').then(function (u) { S.pessoas = u; })]) : Promise.resolve()).then(function () {
        if (!location.hash) location.hash = equipe() ? '#inicio' : '#hoje'; else rota();
      });
    }).catch(function (e) { if (e.message !== 'sessao') telaEntrar(); });
  }

  // ---------- moldura: menu lateral como o da mesa da Verônica ----------
  var PAPEL_CURTO = { super: 'admin', equipe: 'equipe', gravador: 'grava' };
  function lerLocal(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function gravarLocal(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento: só não lembra */ } }
  if (lerLocal('planejador.menuRecolhido') === '1') document.body.classList.add('menu-recolhido');
  function moldura(atual, corpo) {
    var itens = equipe()
      ? [['inicio', 'Início'], ['semana', 'Semana'], ['hoje', 'Folha do dia'], ['assuntos', 'Assuntos'], ['andamento', 'Andamento']]
      : [['hoje', 'Folha do dia']];
    var sub = (location.hash || '').split('/')[1] || '';
    var nav = itens.map(function (i) {
      var n = i[0] === 'assuntos' && S.faltam ? '<span class="n alerta">' + S.faltam + '</span>' : '';
      return '<a href="#' + i[0] + '" class="' + (i[0] === atual ? 'on' : '') + '" data-dica="' + i[1] + '">' + ic(i[0]) + '<span>' + i[1] + '</span>' + n + '</a>';
    }).join('');
    if (equipe() && S.pessoas) {
      nav += '<div class="cap">Equipe</div>' + S.pessoas.filter(function (u) { return u.ativo; }).map(function (u) {
        var cls = u.papel === 'gravador' ? 'grava' : u.papel === 'super' ? 'super' : '';
        return '<a href="#config/pessoas/' + u.id + '" data-dica="' + h(u.nome) + '"><span class="av ' + cls + '">' + h(u.nome.charAt(0).toUpperCase()) + '</span><span>' + h(u.nome) + '</span><span class="papel">' + PAPEL_CURTO[u.papel] + '</span></a>';
      }).join('') + '<a href="#config/pessoas/nova" class="mais" data-dica="Nova pessoa">' + ic('mais') + '<span>Nova pessoa</span></a>';
    }
    var cfgAberta = atual === 'config';
    var cfg = equipe()
      ? '<button class="cfg" type="button" data-act="cfg" aria-expanded="' + cfgAberta + '" data-dica="Configuração">' + ic('config') + '<span>Configuração</span><span class="seta"><svg class="ic" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></span></button>' +
        '<div class="sub-cfg" id="subCfg"' + (cfgAberta ? '' : ' hidden') + '><a href="#config/pessoas" class="' + (atual === 'config' && (sub === 'pessoas' || !sub) ? 'on' : '') + '" data-dica="Pessoas"><span>Pessoas</span></a>' +
        '<a href="#config/receitas" class="' + (atual === 'config' && sub === 'receitas' ? 'on' : '') + '" data-dica="Receitas"><span>Receitas</span></a>' +
        '<button type="button" data-act="sair" data-dica="Sair"><span>Sair</span></button></div>'
      : '<button type="button" data-act="sair" data-dica="Sair">' + ic('sair') + '<span>Sair</span></button>';
    app.innerHTML = '<div class="app"><aside aria-label="Menu"><div class="marca"><i>P</i><b>Planejador</b>' +
      '<button class="recolher" type="button" data-act="recolher" aria-label="Recolher o menu" data-dica="Abrir o menu"><svg class="ic" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg></button></div>' +
      '<nav>' + nav + '</nav><div class="config">' + cfg + '</div><div class="rodape"><span>' + h(B.eu.nome) + '</span><span>Uélicon</span></div></aside>' +
      '<div class="fundo-menu" data-act="fechar-menu"></div><main><div class="conteudo">' + corpo + '</div></main></div>';
    var cab = app.querySelector('.cabecalho');
    if (cab) cab.insertAdjacentHTML('afterbegin', '<button class="btn btn-icone btn-fantasma abrir-menu" type="button" data-act="abrir-menu" aria-label="Abrir o menu"><svg class="ic" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>');
    document.body.classList.remove('menu-aberto');
  }
  function rota() {
    fecharGaveta();
    var r = (location.hash || '#inicio').slice(1).split('/');
    if (!equipe() && r[0] !== 'hoje') { location.hash = '#hoje'; return; }
    if (r[0] === 'hoje') return telaHoje(r[1]);
    if (r[0] === 'semana') return telaSemana(r[1]);
    if (r[0] === 'assuntos') return telaAssuntos(r[1], r[2]);
    if (r[0] === 'andamento') return telaAndamento();
    if (r[0] === 'config') return telaConfig(r[1], r[2]);
    return telaInicio();
  }
  window.addEventListener('hashchange', rota);
  function irPara(hs) { if (location.hash === hs) rota(); else location.hash = hs; }
  function rotaAtual() { return (location.hash || '#inicio').slice(1).split('/')[0]; }
  function redesenha() { if (rotaAtual() === 'semana' && S.semana) return recarregaSemana(); rota(); return Promise.resolve(); }

  // ---------- Início ----------
  function telaInicio() {
    Promise.all([api('GET', '/api/inicio'), carregaAssuntos(true)]).then(function (rs) { desenhaInicio(rs[0]); }).catch(falha);
  }
  function tarefa(v, extra) {
    return '<div class="tarefa" data-act="video" data-id="' + v.id + '"><span class="d' + (v.data === B.hoje ? ' hoje' : '') + '">' + quando(v.data) + '</span>' +
      '<div class="q"><b>' + h(v.abertura || v.prova || 'Assunto ainda sem frase') + '</b><span>' + frente(v.frente) + h(v.formato_nome) + (extra ? ' · ' + extra : '') + '</span></div>' + situacao(v) + '</div>';
  }
  function desenhaInicio(j) {
    guarda(j.videos_hoje); guarda(j.preencher); guarda(j.atrasados); guarda(j.sem_post);
    var s = j.semana, okHoje = j.videos_hoje.filter(function (v) { return feito(v.status); }).length;
    var corpo = '<div class="cabecalho"><div><h1>' + longa(j.hoje) + '</h1><p class="estado">' +
      (j.videos_hoje.length ? 'Hoje o Uélicon grava ' + plural(j.videos_hoje.length, 'vídeo', 'vídeos') + ' (' + plural(okHoje, 'já gravado', 'já gravados') + ').' : 'Hoje não tem vídeo marcado.') + '</p></div>' +
      '<div class="acoes"><a class="btn" href="#hoje">Ver a folha de hoje</a><a class="btn btn-principal" href="#semana">Abrir a semana</a></div></div>' +
      '<div class="regua"><div><span class="r">Gravados na semana</span><span class="v">' + s.gravados + ' de ' + s.total + '</span><span class="c">' + plural(s.postados, 'postado', 'postados') + '</span></div>' +
      '<div><span class="r">Para preencher</span><span class="v' + (j.preencher.length ? ' erro' : ' ok') + '">' + j.preencher.length + '</span><span class="c">vídeos dos próximos 3 dias</span></div>' +
      '<div><span class="r">Atrasados</span><span class="v' + (j.atrasados.length ? ' erro' : ' ok') + '">' + j.atrasados.length + '</span><span class="c">o dia passou e não gravou</span></div>' +
      '<div><span class="r">Falta postar</span><span class="v">' + j.sem_post.length + '</span><span class="c">já gravados</span></div></div>';
    if (!j.proxima_semana_montada) corpo += '<div class="vazio"><span><b>A semana que vem ainda não foi montada.</b> Monte com a receita e preencha os assuntos antes de segunda.</span><a class="btn btn-principal" href="#semana/' + j.proxima_inicio + '">Montar a semana que vem</a></div>';
    function bloco(titulo, ajuda, itens, vazio, extra) {
      return '<div class="bloco"><div class="bloco-cab"><h2>' + titulo + '</h2>' + ajuda + '</div>' +
        (itens.length ? '<div class="tarefas">' + itens.map(function (v) { return tarefa(v, extra && extra(v)); }).join('') + '</div>' : '<div class="vazio"><span>' + vazio + '</span></div>') + '</div>';
    }
    corpo += '<div class="duas">' +
      bloco('1. Preencher antes de gravar', '<span class="fraca">o que o Uélicon vai falar</span>', j.preencher, 'Tudo dos próximos 3 dias está pronto para gravar.',
        function (v) { return v.assunto_id ? (v.abertura ? 'falta o que falar' : 'falta a frase') : 'sem assunto'; }) +
      bloco('2. Gravar hoje', '<a href="#hoje">Folha do dia</a>', j.videos_hoje, 'Nada para gravar hoje.') + '</div><div class="duas">' +
      bloco('3. Atrasados', '<span class="fraca">mude o dia ou marque como pulado</span>', j.atrasados, 'Nada atrasado.') +
      bloco('4. Postar', '<span class="fraca">cole o link do post</span>', j.sem_post, 'Tudo que foi gravado já foi postado.') + '</div>';
    moldura('inicio', corpo);
  }

  // ---------- Semana ----------
  function telaSemana(inicio) {
    var seg = semanaDe(inicio || (S.semana && S.semana.inicio) || B.hoje);
    Promise.all([api('GET', '/api/semana?inicio=' + seg), api('GET', '/api/receitas')]).then(function (rs) {
      S.semana = rs[0]; guarda(rs[0].videos); S.receitas = rs[1]; desenhaSemana();
    }).catch(falha);
  }
  function recarregaSemana() {
    return api('GET', '/api/semana?inicio=' + S.semana.inicio).then(function (j) { S.semana = j; guarda(j.videos); if (rotaAtual() === 'semana') desenhaSemana(); });
  }
  function desenhaSemana() {
    var s = S.semana, vs = s.videos, ativos = vs.filter(function (v) { return v.status !== 'pulado'; });
    var nf = ativos.filter(function (v) { return feito(v.status); }).length, np = ativos.filter(function (v) { return v.status === 'postado'; }).length;
    var nat = ativos.filter(atrasado).length, nfalta = ativos.filter(function (v) { return !v.completo && !feito(v.status); }).length;
    var esta = semanaDe(B.hoje) === s.inicio;
    var corpo = '<div class="cabecalho"><div><h1>Semana de ' + dm(s.inicio) + ' a ' + dm(soma(s.inicio, 5)) + (esta ? ' <span class="selo selo-escuro">Esta semana</span>' : '') + '</h1><p class="estado">' +
      (vs.length ? plural(ativos.length, 'vídeo', 'vídeos') + ' no plano, ' + plural(nf, 'gravado', 'gravados') + (nat ? ', ' + plural(nat, 'atrasado', 'atrasados') : '') + (nfalta ? ', ' + nfalta + ' sem assunto pronto' : '') + '.' : 'Semana sem plano.') + '</p></div>' +
      '<div class="acoes"><div class="linha" style="gap:4px"><a class="btn btn-icone" href="#semana/' + soma(s.inicio, -7) + '" aria-label="Semana anterior">' + ic('esq') + '</a>' +
      (esta ? '' : '<a class="btn" href="#semana/' + semanaDe(B.hoje) + '">Esta semana</a>') + '<a class="btn btn-icone" href="#semana/' + soma(s.inicio, 7) + '" aria-label="Próxima semana">' + ic('dir') + '</a></div>' +
      '<select class="sel" id="selReceita" aria-label="Receita">' + S.receitas.map(function (r) { return '<option value="' + r.id + '">' + h(r.nome) + '</option>'; }).join('') + '</select>' +
      '<button class="btn ' + (vs.length ? '' : 'btn-principal') + '" type="button" data-act="montar">' + (vs.length ? 'Remontar com a receita' : 'Montar a semana') + '</button></div></div>';
    if (S.confirmar) corpo += '<div class="confirma"><span>Os vídeos "a gravar" serão trocados pelos da receita. O que já foi gravado fica.</span><button class="btn btn-principal btn-mini" type="button" data-act="montar-sim">Trocar</button><button class="btn btn-mini" type="button" data-act="montar-nao">Cancelar</button></div>';
    if (!vs.length) corpo += '<div class="vazio"><span>Esta semana ainda não tem vídeos. Escolha uma receita e monte: cada vídeo já vem com um assunto do banco.</span><button class="btn btn-principal" type="button" data-act="montar">Montar a semana</button></div>';
    else corpo += '<div class="regua"><div><span class="r">Gravados</span><span class="v">' + nf + ' de ' + ativos.length + '</span><span class="c">' + plural(np, 'postado', 'postados') + '</span></div>' +
      B.frentes.map(function (fr) {
        var d = ativos.filter(function (v) { return v.frente === fr.id; }); if (!d.length) return '';
        return '<div><span class="r">' + h(fr.nome) + '</span><span class="v">' + d.length + '</span><span class="c">' + plural(d.filter(function (v) { return feito(v.status); }).length, 'gravado', 'gravados') + '</span></div>';
      }).join('') +
      '<div><span class="r">Sem assunto pronto</span><span class="v' + (nfalta ? ' erro' : ' ok') + '">' + nfalta + '</span><span class="c">' + (nfalta ? 'clique no vídeo e preencha' : 'tudo pronto') + '</span></div></div>';
    corpo += '<div class="quadro">' + [0, 1, 2, 3, 4, 5].map(function (i) {
      var d = soma(s.inicio, i), doDia = vs.filter(function (v) { return v.data === d; });
      var at = doDia.filter(function (v) { return v.status !== 'pulado'; }), ok = at.filter(function (v) { return feito(v.status); }).length;
      return '<section class="dia' + (d === B.hoje ? ' hoje' : '') + '" aria-label="' + DIAS[i] + '"><div class="dia-cab"><div class="nome"><b>' + DIAS[i] + '</b><span>' + dm(d) + (d === B.hoje ? ' · hoje' : '') + '</span></div>' +
        (at.length ? '<span class="conta' + (ok === at.length ? ' todo' : '') + '">' + ok + '/' + at.length + '</span>' : '') + '</div>' +
        (doDia.length ? doDia.map(cartao).join('') : '<p class="livre">Dia livre</p>') +
        '<div class="mais"><select data-add="' + d + '" aria-label="Pôr vídeo em ' + DIAS[i] + '">' + fmOptions('', '+ Vídeo') + '</select></div></section>';
    }).join('') + '</div>';
    moldura('semana', corpo);
  }
  function cartao(v) {
    var txt = v.abertura || v.prova || '';
    var falta = !v.assunto_id ? '<span class="falta">Escolher assunto</span>' : (!v.completo && !feito(v.status) ? '<span class="falta atencao">' + (v.abertura ? 'Falta o que falar' : 'Falta a frase') + '</span>' : '');
    return '<button type="button" class="cartao-video' + (feito(v.status) || v.status === 'pulado' ? ' feito' : '') + '" data-act="video" data-id="' + v.id + '">' +
      '<span class="topo-c">' + frente(v.frente) + situacao(v) + '</span>' +
      '<span class="ab' + (txt ? '' : ' vazia') + '">' + h(txt || 'Sem frase ainda') + '</span>' +
      '<span class="fm">' + h(v.formato_nome) + '</span>' + falta + '</button>';
  }

  // ---------- Gaveta ----------
  function abrirGaveta(html) { document.getElementById('painel').innerHTML = html; document.getElementById('gaveta').hidden = false; }
  function fecharGaveta() { var g = document.getElementById('gaveta'); if (g) g.hidden = true; }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fecharGaveta(); });
  function cabGaveta(rot, titulo) {
    return '<header><div><p class="rot">' + rot + '</p><h2>' + titulo + '</h2></div><button class="btn btn-fantasma btn-icone" type="button" data-act="fechar" aria-label="Fechar">' + ic('x') + '</button></header>';
  }
  function rodape(esq, acao, id, rotulo, extra) {
    return '<footer>' + (esq || '<span></span>') + '<div class="linha"><button class="btn" type="button" data-act="fechar">Cancelar</button><button class="btn btn-principal" type="button" data-act="' + acao + '" data-id="' + h(id || '') + '"' + (extra || '') + '>' + (rotulo || 'Salvar') + '</button></div></footer>';
  }

  function gavetaVideo(id) {
    var v = S.vids[id]; if (!v) return;
    carregaAssuntos().then(function (lista) {
      var doFm = lista.filter(function (a) { return a.formato === v.formato && (a.ativo || a.id === v.assunto_id); });
      var fm = B.fmap[v.formato];
      abrirGaveta(cabGaveta(frente(v.frente) + ' ' + h(longa(v.data)), h(fm.nome)) + '<div class="corpo-gaveta">' +
        '<div class="secao"><div class="sc"><h3>Situação</h3>' + situacao(v) + '</div><div class="segmentos">' + ['a_gravar', 'gravado', 'editado', 'postado', 'pulado'].map(function (k) {
          return '<button type="button" data-act="status" data-id="' + v.id + '" data-st="' + k + '" aria-pressed="' + (v.status === k) + '">' + ST_NOME[k] + '</button>';
        }).join('') + '</div>' + (atrasado(v) ? '<span class="falta">O dia passou e não foi gravado. Mude o dia ou marque como pulado.</span>' : '') + '</div>' +
        '<div class="secao"><div class="sc"><h3>O que o Uélicon vai falar</h3>' + (v.assunto_id ? (v.completo ? '<span class="selo selo-ok">Pronto</span>' : '<span class="selo selo-atencao">Falta preencher</span>') : '') + '</div>' +
        '<div class="campo"><label for="gAs">Assunto do banco</label><select id="gAs" data-vid="' + v.id + '"><option value="">Escolher assunto</option>' +
        doFm.map(function (a) {
          return '<option value="' + a.id + '"' + (a.id === v.assunto_id ? ' selected' : '') + '>' + String(a.numero).padStart(2, '0') + ' · ' + h(a.abertura || a.prova || 'sem frase') +
            (a.completo ? '' : ' (falta preencher)') + (a.ultimo_uso && a.id !== v.assunto_id ? ' · usado ' + dm(a.ultimo_uso) : '') + '</option>';
        }).join('') + '</select>' + (doFm.length ? '' : '<span class="ajuda">Este tópico não tem assunto. <a href="#assuntos/' + v.frente + '/' + v.formato + '">Criar no banco</a>.</span>') + '</div>' +
        (v.assunto_id ? '<div class="campo"><label for="aAb">Frase de abertura</label><textarea id="aAb" placeholder="O que ele fala nos 3 primeiros segundos">' + h(v.abertura) + '</textarea></div>' +
          '<div class="campo"><label for="aPo">O que falar</label><textarea id="aPo" style="min-height:100px" placeholder="A explicação em 2 ou 3 frases simples, com um exemplo do dia a dia">' + h(v.pontos) + '</textarea></div>' +
          '<div class="campo"><label for="aPr">Prova ou exemplo</label><input id="aPr" value="' + h(v.prova) + '" placeholder="Ex.: de 2.500 para 55 mil de limite"><span class="ajuda">Muda o assunto no banco também: vale para as próximas vezes que ele for usado.</span></div>' : '') +
        '<div class="campo"><label>Como gravar</label><ol class="passos">' + fm.passos.map(function (p) { return '<li>' + h(p) + '</li>'; }).join('') + '</ol></div></div>' +
        '<div class="secao"><h3>Post</h3><div class="campo"><label for="gLink">Link do post no Instagram</label><input id="gLink" type="url" inputmode="url" placeholder="https://www.instagram.com/p/..." value="' + h(v.link) + '"></div>' +
        '<div class="campo"><label for="gPal">Palavra para comentar</label><input id="gPal" value="' + h(v.palavra_final) + '"><span class="ajuda">Gatilho do ManyChat.</span></div></div>' +
        '<div class="secao"><h3>Plano</h3><div class="grade-campos"><div class="campo"><label for="gFm">Tópico</label><select id="gFm" data-vid="' + v.id + '">' + fmOptions(v.formato) + '</select></div>' +
        '<div class="campo"><label for="gData">Dia</label><input id="gData" type="date" value="' + v.data + '"></div></div>' +
        '<div class="campo"><label for="gNota">Nota</label><textarea id="gNota" placeholder="Ex.: gravar com o print do cliente">' + h(v.nota) + '</textarea></div></div>' +
        (v.atualizado_por ? '<p class="fraca">Última mudança: ' + h(v.atualizado_por) + ', ' + hora(v.atualizado_em) + '</p>' : '') +
        '</div>' + rodape('<button class="btn btn-fantasma btn-perigo" type="button" data-act="apagar-video" data-id="' + v.id + '">Tirar da semana</button>', 'salvar-video', v.id));
    }).catch(falha);
  }

  // ---------- Folha do dia ----------
  function telaHoje(d) { return api('GET', '/api/dia?data=' + (d || B.hoje)).then(function (j) { S.dia = j; guarda(j.videos); desenhaHoje(); }).catch(falha); }
  function desenhaHoje() {
    var j = S.dia, vs = j.videos, ok = vs.filter(function (v) { return feito(v.status); }).length;
    var corpo = '<div class="cabecalho"><div><h1>' + (j.data === B.hoje ? 'Hoje, ' : '') + longa(j.data) + '</h1><p class="estado">' +
      (vs.length ? '<b>' + ok + ' de ' + vs.length + '</b> ' + (vs.length === 1 ? 'vídeo gravado' : 'vídeos gravados') + (ok === vs.length ? '. Dia completo.' : '.') : 'Nenhum vídeo para este dia.') + '</p></div>' +
      '<div class="acoes nao-imprime"><div class="linha" style="gap:4px"><a class="btn btn-icone" href="#hoje/' + soma(j.data, -1) + '" aria-label="Dia anterior">' + ic('esq') + '</a>' +
      (j.data !== B.hoje ? '<a class="btn" href="#hoje">Hoje</a>' : '') + '<a class="btn btn-icone" href="#hoje/' + soma(j.data, 1) + '" aria-label="Próximo dia">' + ic('dir') + '</a></div>' +
      '<button class="btn" type="button" data-act="imprimir">' + ic('imprimir') + 'Imprimir</button></div></div><div class="folha">';
    if (!vs.length) corpo += '<div class="vazio"><span>Nada para gravar neste dia.' + (j.proximo ? ' O próximo é ' + longa(j.proximo).toLowerCase() + '.' : '') + '</span>' + (j.proximo ? '<a class="btn" href="#hoje/' + j.proximo + '">Ver o próximo</a>' : '') + '</div>';
    vs.forEach(function (v, i) {
      var fm = B.fmap[v.formato], f = feito(v.status);
      corpo += '<article class="video-folha' + (f ? ' feito' : '') + '"><div class="cab-v"><div class="linha"><span class="n">Vídeo ' + (i + 1) + '</span>' + frente(v.frente) + '<span class="fraca">' + h(fm.nome) + '</span></div>' + situacao(v) + '</div><div class="c">' +
        '<div><p class="rot-folha">Comece com</p>' + (v.abertura ? '<p class="abre">“' + h(v.abertura) + '”</p>' : '<p class="falta atencao">A frase ainda vai ser preenchida.</p>') + '</div>' +
        (v.pontos ? '<div><p class="rot-folha">Depois fale</p><p class="falar">' + h(v.pontos) + '</p></div>' : '') +
        (v.prova ? '<div><p class="rot-folha">Mostre a prova</p><p>' + h(v.prova) + '</p></div>' : '') +
        '<div><p class="rot-folha">Como gravar</p><ol>' + fm.passos.map(function (p) { return '<li>' + h(p) + '</li>'; }).join('') + '</ol></div>' +
        (v.nota ? '<p class="tinta-2"><b>Nota:</b> ' + h(v.nota) + '</p>' : '') +
        '<div class="fecha"><span>' + (v.palavra_final ? 'No fim: “Comenta <span class="palavra">' + h(v.palavra_final) + '</span> que eu te mando.”' : '') + '</span>' +
        '<button type="button" class="btn ' + (f ? '' : 'btn-principal') + ' nao-imprime" data-act="gravei" data-id="' + v.id + '" data-st="' + v.status + '">' + (f ? ic('check') + 'Gravado' : 'Marcar como gravado') + '</button></div></div></article>';
    });
    corpo += '<div class="lembretes"><span>Celular em pé, rosto perto, lugar claro</span><span>A frase de abertura nos 3 primeiros segundos</span><span>Um assunto por vídeo</span><span>Sem nome nem CPF de cliente na tela</span></div></div>';
    moldura('hoje', corpo);
  }

  // ---------- Assuntos: abas de produto, subabas de tópico ----------
  function telaAssuntos(aba, top) { carregaAssuntos(true).then(function () { desenhaAssuntos(aba, top); }).catch(falha); }
  function faltaEm(filtro) { return S.assuntos.filter(function (a) { return a.ativo && !a.completo && filtro(a); }).length; }
  function desenhaAssuntos(aba, top) {
    var fr = B.fr[aba] || B.frentes[0];
    var topicos = B.formatos.filter(function (f) { return f.frente === fr.id; });
    var fm = B.fmap[top] && B.fmap[top].frente === fr.id && B.fmap[top].ativo !== 0 ? B.fmap[top] : topicos[0];
    var corpo = '<div class="cabecalho"><div><h1>Assuntos</h1><p class="estado">Cada assunto vira um vídeo: a frase de abertura e o que falar. A semana puxa daqui o que está há mais tempo sem uso.</p></div>' +
      '<div class="acoes">' + (S.faltam ? '<span class="selo selo-atencao">' + S.faltam + ' para preencher</span>' : '<span class="selo selo-ok">Tudo preenchido</span>') + '</div></div>' +
      '<div class="abas" role="tablist">' + B.frentes.map(function (f) {
        var n = faltaEm(function (a) { return B.fmap[a.formato] && B.fmap[a.formato].frente === f.id; });
        return '<a href="#assuntos/' + f.id + '" class="' + (f.id === fr.id ? 'ativo' : '') + '" style="--c:' + h(f.cor) + '"><span class="bola"></span>' + h(f.nome) + (n ? '<span class="cont">' + n + '</span>' : '') + '</a>';
      }).join('') + '<button type="button" class="nova" data-act="nova-aba">' + ic('mais') + 'Nova aba</button></div>';
    corpo += '<div class="bloco-cab"><div class="subabas">' + topicos.map(function (t) {
      var n = S.assuntos.filter(function (a) { return a.formato === t.id && a.ativo; }).length;
      var f = faltaEm(function (a) { return a.formato === t.id; });
      return '<a href="#assuntos/' + fr.id + '/' + t.id + '" class="' + (fm && t.id === fm.id ? 'ativo' : '') + '">' + h(t.nome) + ' <span class="n">' + n + '</span>' + (f ? '<span class="cont">' + f + '</span>' : '') + '</a>';
    }).join('') + '<button type="button" class="nova" data-act="novo-topico" data-fr="' + fr.id + '">' + ic('mais') + 'Novo tópico</button></div>' +
      '<button class="btn btn-fantasma btn-mini" type="button" data-act="editar-aba" data-fr="' + fr.id + '">' + ic('lapis') + 'Editar a aba</button></div>';
    if (!fm) {
      corpo += '<div class="vazio"><span>A aba ' + h(fr.nome) + ' ainda não tem tópicos. Crie o primeiro, por exemplo "Caixinha de perguntas" ou "Depoimento".</span><button class="btn btn-principal" type="button" data-act="novo-topico" data-fr="' + fr.id + '">Novo tópico</button></div>';
      return moldura('assuntos', corpo);
    }
    var lista = S.assuntos.filter(function (a) { return a.formato === fm.id; }).sort(function (a, b) { return (b.ativo - a.ativo) || (a.numero - b.numero); });
    corpo += '<div class="topico"><div class="t"><h2>' + h(fm.nome) + '</h2><span class="tinta-2">' + h(fm.dica || 'Sem descrição.') + ' Palavra: <span class="palavra">' + h(fm.palavra) + '</span></span>' +
      (fm.passos.length ? '<ol>' + fm.passos.map(function (p) { return '<li>' + h(p) + '</li>'; }).join('') + '</ol>' : '') + '</div>' +
      '<div class="linha"><button class="btn" type="button" data-act="editar-topico" data-fm="' + fm.id + '">' + ic('lapis') + 'Editar tópico</button><button class="btn btn-principal" type="button" data-act="novo-assunto" data-fm="' + fm.id + '">' + ic('mais') + 'Novo assunto</button></div></div>';
    if (!lista.length) corpo += '<div class="vazio"><span>Nenhum assunto neste tópico. Cada um vira um vídeo.</span><button class="btn btn-principal" type="button" data-act="novo-assunto" data-fm="' + fm.id + '">Novo assunto</button></div>';
    else corpo += '<div class="tabela-caixa"><table class="tabela"><thead><tr><th>Nº</th><th>Frase de abertura</th><th>Situação</th><th class="num">Usado</th><th class="num">Última vez</th></tr></thead><tbody>' +
      lista.map(function (a) {
        return '<tr data-act="editar-assunto" data-id="' + a.id + '" class="' + (a.ativo ? '' : 'apagado') + '"><td class="curto fraca">' + String(a.numero).padStart(2, '0') + '</td>' +
          '<td class="forte">' + (a.abertura ? h(a.abertura) : '<span class="fraca">' + h(a.prova || 'Sem frase de abertura') + '</span>') + '</td>' +
          '<td class="curto">' + (!a.ativo ? '<span class="selo">Arquivado</span>' : a.completo ? '<span class="selo selo-ok">Pronto</span>' : '<span class="falta atencao">Falta ' + (!(a.abertura || '').trim() ? 'a frase' : 'o que falar') + '</span>') + '</td>' +
          '<td class="num">' + (a.vezes ? plural(a.vezes, 'vez', 'vezes') : 'nunca') + '</td><td class="num fraca">' + (a.ultimo_uso ? dm(a.ultimo_uso) : 'sem uso') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    moldura('assuntos', corpo);
  }
  function gavetaAssunto(id) {
    carregaAssuntos().then(function (lista) {
      var a = lista.filter(function (x) { return x.id === id; })[0]; if (!a) return;
      var fm = B.fmap[a.formato];
      abrirGaveta(cabGaveta(frente(fm.frente) + ' ' + h(fm.nome) + ' · nº ' + String(a.numero).padStart(2, '0'), a.abertura ? 'Editar assunto' : 'Novo assunto') + '<div class="corpo-gaveta">' +
        '<div class="campo"><label for="aAb">Frase de abertura</label><textarea id="aAb" placeholder="Ex.: Meu nome tá limpo e o banco negou. Por quê?">' + h(a.abertura) + '</textarea><span class="ajuda">O que o Uélicon fala nos 3 primeiros segundos.</span></div>' +
        '<div class="campo"><label for="aPo">O que falar</label><textarea id="aPo" style="min-height:120px" placeholder="A explicação em 2 ou 3 frases simples, com um exemplo do dia a dia.">' + h(a.pontos) + '</textarea></div>' +
        '<div class="campo"><label for="aPr">Prova ou exemplo</label><input id="aPr" placeholder="Ex.: de 2.500 para 55 mil de limite" value="' + h(a.prova) + '"><span class="ajuda">Opcional. Número ou caso real, sem nome nem CPF.</span></div>' +
        '<div class="campo"><label for="aPa">Palavra para comentar</label><input id="aPa" value="' + h(a.palavra) + '"></div>' +
        '<div class="campo"><label>Como gravar (vem do tópico)</label><ol class="passos">' + fm.passos.map(function (p) { return '<li>' + h(p) + '</li>'; }).join('') + '</ol></div>' +
        '<p class="fraca">' + (a.vezes ? 'Usado ' + plural(a.vezes, 'vez', 'vezes') + ', a última em ' + dm(a.ultimo_uso) + (a.postados ? ', ' + plural(a.postados, 'postado', 'postados') : '') + '.' : 'Ainda não foi usado.') + '</p></div>' +
        rodape('<button class="btn btn-fantasma' + (a.ativo ? ' btn-perigo' : '') + '" type="button" data-act="arquivar-assunto" data-id="' + a.id + '" data-ativo="' + (a.ativo ? 0 : 1) + '">' + (a.ativo ? 'Arquivar' : 'Voltar a usar') + '</button>', 'salvar-assunto', a.id));
      var f = document.getElementById('aAb'); if (f && !a.abertura) f.focus();
    }).catch(falha);
  }
  function gavetaAba(id) {
    var f = B.fr[id] || { nome: '', para: '', palavra: '' };
    abrirGaveta(cabGaveta('Aba de produto', id ? 'Editar ' + h(f.nome) : 'Nova aba') + '<div class="corpo-gaveta">' +
      '<div class="campo"><label for="frNome">Nome</label><input id="frNome" value="' + h(f.nome) + '" placeholder="Ex.: Mentoria"></div>' +
      '<div class="campo"><label for="frPara">Para quem é</label><input id="frPara" value="' + h(f.para) + '" placeholder="Ex.: quem já é consultor e quer mais clientes"></div>' +
      '<div class="campo"><label for="frPal">Palavra padrão para comentar</label><input id="frPal" value="' + h(f.palavra) + '"><span class="ajuda">Cada tópico novo desta aba começa com ela.</span></div></div>' +
      rodape(id ? '<button class="btn btn-fantasma btn-perigo" type="button" data-act="apagar-aba" data-fr="' + id + '">Esconder a aba</button>' : '', 'salvar-aba', id, id ? 'Salvar' : 'Criar aba'));
    document.getElementById('frNome').focus();
  }
  function gavetaTopico(fid, frId) {
    var t = B.fmap[fid] || { nome: '', dica: '', passos: [], palavra: (B.fr[frId] || {}).palavra || '', frente: frId };
    abrirGaveta(cabGaveta(frente(t.frente), fid ? 'Editar tópico' : 'Novo tópico') + '<div class="corpo-gaveta">' +
      '<div class="campo"><label for="tNome">Nome do tópico</label><input id="tNome" value="' + h(t.nome) + '" placeholder="Ex.: Caixinha de perguntas"></div>' +
      '<div class="campo"><label for="tDica">O que é</label><input id="tDica" value="' + h(t.dica) + '" placeholder="Ex.: pergunta de quem quer trabalhar com crédito"></div>' +
      '<div class="campo"><label for="tPassos">Como gravar (um passo por linha)</label><textarea id="tPassos" style="min-height:110px">' + h(t.passos.join('\n')) + '</textarea><span class="ajuda">Aparece na folha do dia de todo vídeo deste tópico.</span></div>' +
      '<div class="campo"><label for="tPal">Palavra para comentar</label><input id="tPal" value="' + h(t.palavra) + '"></div></div>' +
      rodape(fid ? '<button class="btn btn-fantasma btn-perigo" type="button" data-act="apagar-topico" data-fm="' + fid + '">Esconder o tópico</button>' : '', 'salvar-topico', fid || '', fid ? 'Salvar' : 'Criar tópico', ' data-fr="' + h(t.frente) + '"'));
    document.getElementById('tNome').focus();
  }

  // ---------- Andamento ----------
  function telaAndamento() { api('GET', '/api/andamento').then(desenhaAndamento).catch(falha); }
  function desenhaAndamento(j) {
    guarda(j.atrasados); guarda(j.sem_post);
    var atual = j.semanas.filter(function (s) { return s.atual; })[0];
    var at = atual.total - atual.pulados, pct = function (a, b) { return b ? Math.round(100 * a / b) : 0; };
    var ant = j.semanas[j.semanas.length - 3], antAt = ant ? ant.total - ant.pulados : 0;
    var df = j.dias_frente || {};
    var usadas = B.frentes.filter(function (f) { return Object.keys(df).some(function (d) { return df[d][f.id]; }); });
    var corpo = '<div class="cabecalho"><div><h1>Andamento</h1><p class="estado">' + (at ? '<b>' + pct(atual.gravados, at) + '%</b> do planejado desta semana está gravado' + (j.atrasados.length ? ' e ' + plural(j.atrasados.length, 'vídeo está atrasado', 'vídeos estão atrasados') : '') + '.' : 'Esta semana ainda não tem plano.') + '</p></div>' +
      '<div class="acoes"><a class="btn" href="#semana">Abrir a semana</a></div></div>' +
      '<div class="regua"><div><span class="r">Gravados esta semana</span><span class="v">' + atual.gravados + ' de ' + at + '</span><span class="c">' + (antAt ? 'semana passada: ' + ant.gravados + ' de ' + antAt : 'semana passada sem plano') + '</span></div>' +
      '<div><span class="r">Postados</span><span class="v">' + atual.postados + '</span><span class="c">' + pct(atual.postados, at) + '% do planejado</span></div>' +
      '<div><span class="r">Atrasados</span><span class="v' + (j.atrasados.length ? ' erro' : ' ok') + '">' + j.atrasados.length + '</span><span class="c">últimas 3 semanas</span></div>' +
      '<div><span class="r">Falta postar</span><span class="v">' + j.sem_post.length + '</span><span class="c">já gravados</span></div>' +
      '<div><span class="r">Assuntos a preencher</span><span class="v' + (j.assuntos_incompletos ? ' erro' : ' ok') + '">' + j.assuntos_incompletos + '</span><span class="c">' + (j.assuntos_incompletos ? '<a href="#assuntos">Preencher</a>' : 'banco em dia') + '</span></div></div>';
    corpo += '<div class="bloco"><h2>Dia a dia desta semana</h2><div class="tabela-caixa"><table class="tabela"><thead><tr><th>Dia</th>' + usadas.map(function (f) { return '<th>' + h(f.nome) + '</th>'; }).join('') +
      '<th class="num">Gravados</th><th class="num">Postados</th><th>Situação</th></tr></thead><tbody>' + [0, 1, 2, 3, 4, 5].map(function (i) {
        var d = soma(atual.inicio, i), x = j.dias.filter(function (y) { return y.data === d; })[0] || { tot: 0, grav: 0, post: 0 }, pf = df[d] || {};
        var st = !x.tot ? '<span class="fraca">sem vídeo</span>' : x.grav >= x.tot ? '<span class="st postado">Completo</span>' : d < j.hoje ? '<span class="st atrasado">Faltou gravar</span>' : d === j.hoje ? '<span class="st a_gravar">Hoje</span>' : '<span class="fraca">pela frente</span>';
        return '<tr data-href="#hoje/' + d + '"><td class="curto forte">' + DIAS[i] + ' ' + dm(d) + '</td>' + usadas.map(function (f) { var p = pf[f.id]; return '<td class="tinta-2">' + (p ? p.grav + ' de ' + p.tot : '') + '</td>'; }).join('') +
          '<td class="num forte">' + (x.grav || 0) + ' de ' + x.tot + '</td><td class="num">' + (x.post || 0) + '</td><td>' + st + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    corpo += '<div class="duas"><div class="bloco"><h2>Atrasados</h2>' + (j.atrasados.length ? '<div class="tarefas">' + j.atrasados.map(function (v) { return tarefa(v); }).join('') + '</div>' : '<div class="vazio"><span>Nada atrasado.</span></div>') + '</div>' +
      '<div class="bloco"><h2>Gravados, falta postar</h2>' + (j.sem_post.length ? '<div class="tarefas">' + j.sem_post.map(function (v) { return tarefa(v); }).join('') + '</div>' : '<div class="vazio"><span>Tudo que foi gravado já foi postado.</span></div>') + '</div></div>';
    corpo += '<div class="bloco"><h2>Semana a semana</h2><div class="tabela-caixa"><table class="tabela"><thead><tr><th>Semana</th><th>Gravados e postados</th><th class="num">No plano</th><th class="num">Gravados</th><th class="num">Postados</th></tr></thead><tbody>' +
      j.semanas.slice().reverse().map(function (s) {
        var a = s.total - s.pulados;
        return '<tr data-href="#semana/' + s.inicio + '"><td class="curto forte">' + dm(s.inicio) + (s.atual ? ' <span class="selo selo-escuro">Esta</span>' : '') + '</td>' +
          '<td><div class="trilho"><i class="p" style="width:' + pct(s.postados, a) + '%"></i><i class="g" style="width:' + pct(s.gravados - s.postados, a) + '%"></i></div></td>' +
          '<td class="num">' + (a || 'sem plano') + '</td><td class="num">' + s.gravados + '</td><td class="num">' + s.postados + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="fraca">Na barra: verde é postado, azul é gravado e ainda não postado.</p></div>';
    corpo += '<details class="recolhido"><summary>Últimas mudanças</summary>' + (j.historico.length ? '<div class="tabela-caixa"><table class="tabela"><tbody>' + j.historico.map(function (x) {
      return '<tr data-href="#semana/' + semanaDe(x.data) + '"><td>' + h(x.quem) + ' marcou <span class="st ' + x.para + '">' + ST_NOME[x.para] + '</span></td><td class="tinta-2">' + dm(x.data) + ' · ' + h(x.formato_nome) + '</td><td class="num fraca">' + hora(x.quando) + '</td></tr>';
    }).join('') + '</tbody></table></div>' : '<p class="fraca" style="padding:0 16px 12px">Ainda nada.</p>') + '</details>';
    moldura('andamento', corpo);
  }

  // ---------- Configurações ----------
  function telaConfig(aba, id) {
    aba = aba === 'receitas' ? 'receitas' : 'pessoas';
    if (aba === 'pessoas') return api('GET', '/api/usuarios').then(function (us) {
      desenhaPessoas(us);
      if (id === 'nova') gavetaPessoa(null); else if (id) gavetaPessoa(+id);
    }).catch(falha);
    return api('GET', '/api/receitas').then(function (r) { S.receitas = r; desenhaReceitas(id ? +id : (r[0] && r[0].id)); }).catch(falha);
  }
  function cabConfig(aba) {
    return '<div class="cabecalho"><div><h1>' + (aba === 'pessoas' ? 'Pessoas' : 'Receitas') + '</h1><p class="estado">' + (aba === 'pessoas' ? 'Quem entra no sistema e o que cada um pode fazer.' : 'Quantos vídeos tem cada dia e de que tópico. A semana é montada a partir daqui.') + '</p></div></div>' +
      '';
  }
  function desenhaPessoas(us) {
    S.pessoas = us;
    var corpo = cabConfig('pessoas') + '<div class="bloco-cab"><p class="tinta-2">' + plural(us.filter(function (u) { return u.ativo; }).length, 'pessoa com acesso', 'pessoas com acesso') + '.</p>' +
      '<button class="btn btn-principal" type="button" data-act="nova-pessoa">' + ic('mais') + 'Nova pessoa</button></div>' +
      '<div class="tabela-caixa"><table class="tabela"><thead><tr><th>Nome</th><th>E-mail ou usuário</th><th>Acesso</th><th>Situação</th></tr></thead><tbody>' +
      us.map(function (u) {
        return '<tr data-act="editar-pessoa" data-id="' + u.id + '" class="' + (u.ativo ? '' : 'apagado') + '"><td class="forte">' + h(u.nome) + (u.id === B.eu.id ? ' <span class="selo">você</span>' : '') + '</td><td>' + h(u.login) + '</td><td>' + h(PAPEL[u.papel]) + '</td>' +
          '<td>' + (u.ativo ? '<span class="selo selo-ok">Com acesso</span>' : '<span class="selo">Sem acesso</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    moldura('config', corpo);
  }
  function gavetaPessoa(id) {
    var u = (S.pessoas || []).filter(function (x) { return x.id === id; })[0] || { nome: '', login: '', papel: 'gravador', ativo: 1 };
    var papeis = B.eu.papel === 'super' ? ['super', 'equipe', 'gravador'] : ['equipe', 'gravador'];
    var travado = u.papel === 'super' && B.eu.papel !== 'super';
    abrirGaveta(cabGaveta('Pessoas', id ? h(u.nome) : 'Nova pessoa') + '<div class="corpo-gaveta">' +
      '<div class="campo"><label for="pNome">Nome</label><input id="pNome" value="' + h(u.nome) + '"></div>' +
      '<div class="campo"><label for="pLogin">E-mail ou usuário</label><input id="pLogin" value="' + h(u.login) + '"' + (id ? ' disabled' : '') + ' autocomplete="off"><span class="ajuda">' + (id ? 'Para trocar o e-mail, crie a pessoa de novo.' : 'É o que ela digita para entrar.') + '</span></div>' +
      '<div class="campo"><label for="pPapel">Acesso</label><select id="pPapel"' + (travado ? ' disabled' : '') + '>' + (papeis.indexOf(u.papel) < 0 ? '<option value="' + u.papel + '" selected>' + PAPEL[u.papel] + '</option>' : '') +
      papeis.map(function (p) { return '<option value="' + p + '"' + (p === u.papel ? ' selected' : '') + '>' + PAPEL[p] + '</option>'; }).join('') + '</select></div>' +
      '<div class="campo"><label for="pSenha">' + (id ? 'Nova senha (em branco mantém a atual)' : 'Senha') + '</label><input id="pSenha" type="text" autocomplete="new-password" placeholder="6 letras ou mais"></div></div>' +
      rodape(id && id !== B.eu.id && !travado ? '<button class="btn btn-fantasma' + (u.ativo ? ' btn-perigo' : '') + '" type="button" data-act="acesso-pessoa" data-id="' + id + '" data-ativo="' + (u.ativo ? 0 : 1) + '">' + (u.ativo ? 'Tirar o acesso' : 'Devolver o acesso') + '</button>' : '', 'salvar-pessoa', id || '', id ? 'Salvar' : 'Criar acesso'));
    document.getElementById('pNome').focus();
  }
  function desenhaReceitas(id) {
    var r = S.receitas.filter(function (x) { return x.id === id; })[0] || S.receitas[0], n = 0, tot = {};
    if (r) r.dias.forEach(function (d) { d.forEach(function (fid) { var f = B.fmap[fid]; if (!f) return; tot[f.frente] = (tot[f.frente] || 0) + 1; n++; }); });
    var corpo = cabConfig('receitas') + '<div class="bloco-cab"><div class="linha"><select class="sel" id="selRec" aria-label="Receita">' + S.receitas.map(function (x) { return '<option value="' + x.id + '"' + (r && x.id === r.id ? ' selected' : '') + '>' + h(x.nome) + '</option>'; }).join('') + '</select>' +
      (r ? '<button class="btn" type="button" data-act="duplicar-receita" data-id="' + r.id + '">Duplicar</button>' : '') + '</div><button class="btn btn-principal" type="button" data-act="nova-receita">' + ic('mais') + 'Nova receita</button></div>';
    if (r) {
      corpo += '<div class="regua"><div><span class="r">Vídeos na semana</span><span class="v">' + n + '</span><span class="c">de segunda a sábado</span></div>' +
        B.frentes.filter(function (f) { return tot[f.id]; }).map(function (f) { return '<div><span class="r">' + h(f.nome) + '</span><span class="v">' + tot[f.id] + '</span><span class="c">' + Math.round(100 * tot[f.id] / n) + '% da semana</span></div>'; }).join('') + '</div>' +
        '<div class="campo" style="max-width:360px"><label for="recNome">Nome da receita</label><input id="recNome" value="' + h(r.nome) + '" data-id="' + r.id + '"></div>' +
        '<div class="quadro">' + r.dias.map(function (d, i) {
          return '<section class="dia"><div class="dia-cab"><div class="nome"><b>' + DIAS[i] + '</b></div><span class="conta">' + d.length + '</span></div>' +
            d.map(function (fid, j) { var fm = B.fmap[fid]; if (!fm) return ''; return '<div class="receita-chip">' + frente(fm.frente, fm.nome) + '<button class="btn btn-fantasma btn-icone btn-mini" type="button" data-act="rec-tira" data-id="' + r.id + '" data-d="' + i + '" data-j="' + j + '" aria-label="Tirar ' + h(fm.nome) + '">' + ic('x') + '</button></div>'; }).join('') +
            '<div class="mais"><select data-rec="' + r.id + '" data-d="' + i + '" aria-label="Pôr tópico em ' + DIAS[i] + '">' + fmOptions('', '+ Tópico') + '</select></div></section>';
        }).join('') + '</div><div><button class="btn btn-fantasma btn-perigo" type="button" data-act="apagar-receita" data-id="' + r.id + '">Apagar esta receita</button></div>';
    }
    moldura('config', corpo);
  }
  function salvaReceita(r) { return api('PUT', '/api/receitas/' + r.id, { dias: r.dias }).then(function () { desenhaReceitas(r.id); }).catch(falha); }

  // ---------- ações ----------
  function val(id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; }
  function recarregaVideo(id) {
    var v = S.vids[id];
    return api('GET', '/api/semana?inicio=' + semanaDe(v.data)).then(function (j) { guarda(j.videos); if (S.semana && S.semana.inicio === j.inicio) S.semana = j; });
  }
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
    if (act === 'recolher') { var r0 = document.body.classList.toggle('menu-recolhido'); gravarLocal('planejador.menuRecolhido', r0 ? '1' : '0'); return; }
    if (act === 'abrir-menu') return document.body.classList.add('menu-aberto');
    if (act === 'fechar-menu') return document.body.classList.remove('menu-aberto');
    if (act === 'cfg') { var sc = document.getElementById('subCfg'); sc.hidden = !sc.hidden; t.setAttribute('aria-expanded', !sc.hidden); return; }
    if (act === 'sair') return api('POST', '/api/sair').then(function () { location.hash = ''; telaEntrar(); });
    if (act === 'imprimir') return window.print();
    if (act === 'montar') { if (S.semana.videos.length) { S.confirmar = true; return desenhaSemana(); } return montar(false); }
    if (act === 'montar-sim') { S.confirmar = false; return montar(true); }
    if (act === 'montar-nao') { S.confirmar = false; return desenhaSemana(); }
    if (act === 'video') return gavetaVideo(id);
    if (act === 'status') {
      var v = S.vids[id]; if (!v || v.status === t.dataset.st) return;
      return mudaStatus(id, t.dataset.st, v.status, function () {
        return recarregaVideo(id).then(function () { var aberta = !document.getElementById('gaveta').hidden; return redesenha().then(function () { if (aberta) gavetaVideo(id); }); });
      });
    }
    if (act === 'salvar-video') {
      var v2 = S.vids[id], nova = val('gData'), passos = [];
      if (v2.assunto_id && document.getElementById('aAb')) {
        var ab = val('aAb'), po = val('aPo'), pr = val('aPr');
        if (ab !== (v2.abertura || '') || po !== (v2.pontos || '') || pr !== (v2.prova || '')) passos.push(api('PATCH', '/api/assuntos/' + v2.assunto_id, { abertura: ab, pontos: po, prova: pr }));
      }
      passos.push(api('PATCH', '/api/videos/' + id, { link: val('gLink'), palavra: val('gPal').toUpperCase(), nota: document.getElementById('gNota').value, data: nova }));
      return Promise.all(passos).then(function () {
        aviso('Vídeo salvo'); fecharGaveta();
        return carregaAssuntos(true).then(function () {
          if (rotaAtual() === 'semana' && semanaDe(nova) !== S.semana.inicio) { location.hash = '#semana/' + semanaDe(nova); return; }
          return redesenha();
        });
      }).catch(falha);
    }
    if (act === 'apagar-video') {
      if (t.dataset.certo !== '1') { t.dataset.certo = '1'; t.textContent = 'Clique de novo: some da semana'; return; }
      return api('DELETE', '/api/videos/' + id).then(function () { aviso('Vídeo tirado da semana'); fecharGaveta(); return redesenha(); }).catch(falha);
    }
    if (act === 'gravei') {
      var antes = t.dataset.st, novo = feito(antes) ? 'a_gravar' : 'gravado';
      return mudaStatus(id, novo, antes, function () { return telaHoje(S.dia.data); });
    }
    if (act === 'editar-assunto') return gavetaAssunto(id);
    if (act === 'novo-assunto') return api('POST', '/api/assuntos', { formato: t.dataset.fm }).then(function (r) { return carregaAssuntos(true).then(function () { rota(); setTimeout(function () { gavetaAssunto(r.id); }, 120); }); }).catch(falha);
    if (act === 'salvar-assunto') {
      return api('PATCH', '/api/assuntos/' + id, { abertura: val('aAb'), pontos: val('aPo'), prova: val('aPr'), palavra: val('aPa').toUpperCase() }).then(function () { depoisAssunto('Assunto salvo'); }).catch(falha);
    }
    if (act === 'arquivar-assunto') {
      var ativo = +t.dataset.ativo;
      return api('PATCH', '/api/assuntos/' + id, { ativo: ativo }).then(function () {
        depoisAssunto(ativo ? 'Assunto de volta ao banco' : 'Assunto arquivado', ativo ? null : function () { api('PATCH', '/api/assuntos/' + id, { ativo: 1 }).then(function () { depoisAssunto('Assunto de volta ao banco'); }); });
      }).catch(falha);
    }
    if (act === 'nova-aba') return gavetaAba(null);
    if (act === 'editar-aba') return gavetaAba(t.dataset.fr);
    if (act === 'salvar-aba') {
      var dados = { nome: val('frNome'), para: val('frPara'), palavra: val('frPal').toUpperCase() };
      if (!dados.nome) return aviso('Dê um nome para a aba.', null, true);
      var fr = t.dataset.id;
      var p = fr ? api('PATCH', '/api/frentes/' + fr, dados).then(function () { return { id: fr }; }) : api('POST', '/api/frentes', dados);
      return p.then(function (r) { return recarregaBase().then(function () { aviso(fr ? 'Aba salva' : 'Aba criada. Agora crie os tópicos dela.'); fecharGaveta(); location.hash = '#assuntos/' + r.id; rota(); }); }).catch(falha);
    }
    if (act === 'apagar-aba') {
      if (t.dataset.certo !== '1') { t.dataset.certo = '1'; t.textContent = 'Clique de novo: a aba some'; return; }
      return api('PATCH', '/api/frentes/' + t.dataset.fr, { ativo: 0 }).then(recarregaBase).then(function () { aviso('Aba escondida'); fecharGaveta(); location.hash = '#assuntos'; rota(); }).catch(falha);
    }
    if (act === 'novo-topico') return gavetaTopico(null, t.dataset.fr);
    if (act === 'editar-topico') return gavetaTopico(t.dataset.fm);
    if (act === 'salvar-topico') {
      var fid = t.dataset.id, frId = t.dataset.fr;
      var corpo = { nome: val('tNome'), dica: val('tDica'), passos: document.getElementById('tPassos').value.split('\n'), palavra: val('tPal').toUpperCase() };
      if (!corpo.nome) return aviso('Dê um nome para o tópico.', null, true);
      var pr2 = fid ? api('PATCH', '/api/formatos/' + fid, corpo).then(function () { return { id: fid }; })
        : api('POST', '/api/formatos', { frente: frId, nome: corpo.nome, dica: corpo.dica }).then(function (r) { return api('PATCH', '/api/formatos/' + r.id, corpo).then(function () { return r; }); });
      return pr2.then(function (r) { return recarregaBase().then(function () { aviso(fid ? 'Tópico salvo' : 'Tópico criado. Agora cadastre os assuntos.'); fecharGaveta(); location.hash = '#assuntos/' + frId + '/' + r.id; rota(); }); }).catch(falha);
    }
    if (act === 'apagar-topico') {
      if (t.dataset.certo !== '1') { t.dataset.certo = '1'; t.textContent = 'Clique de novo: o tópico some'; return; }
      var ff = B.fmap[t.dataset.fm];
      return api('PATCH', '/api/formatos/' + t.dataset.fm, { ativo: 0 }).then(recarregaBase).then(function () { aviso('Tópico escondido'); fecharGaveta(); location.hash = '#assuntos/' + ff.frente; rota(); }).catch(falha);
    }
    if (act === 'nova-pessoa') return gavetaPessoa(null);
    if (act === 'editar-pessoa') return gavetaPessoa(id);
    if (act === 'salvar-pessoa') {
      var dp = { nome: val('pNome') }, papel = document.getElementById('pPapel');
      if (!papel.disabled) dp.papel = papel.value;
      if (val('pSenha')) dp.senha = val('pSenha');
      var pp = t.dataset.id ? api('PATCH', '/api/usuarios/' + t.dataset.id, dp) : api('POST', '/api/usuarios', Object.assign(dp, { login: val('pLogin') }));
      return pp.then(function () { aviso(t.dataset.id ? 'Pessoa salva' : 'Acesso criado. Passe o e-mail e a senha para a pessoa.'); fecharGaveta(); irPara('#config/pessoas'); }).catch(falha);
    }
    if (act === 'acesso-pessoa') {
      var at2 = +t.dataset.ativo;
      if (!at2 && t.dataset.certo !== '1') { t.dataset.certo = '1'; t.textContent = 'Clique de novo: ela não entra mais'; return; }
      return api('PATCH', '/api/usuarios/' + id, { ativo: at2 }).then(function () { aviso(at2 ? 'Acesso devolvido' : 'Acesso tirado'); fecharGaveta(); irPara('#config/pessoas'); }).catch(falha);
    }
    if (act === 'nova-receita') return api('POST', '/api/receitas', { nome: 'Receita nova' }).then(function (r) { location.hash = '#config/receitas/' + r.id; }).catch(falha);
    if (act === 'duplicar-receita') {
      var base = S.receitas.filter(function (x) { return x.id === id; })[0];
      return api('POST', '/api/receitas', { nome: base.nome + ' (cópia)', dias: base.dias }).then(function (r) { location.hash = '#config/receitas/' + r.id; aviso('Receita duplicada'); }).catch(falha);
    }
    if (act === 'apagar-receita') {
      if (t.dataset.certo !== '1') { t.dataset.certo = '1'; t.textContent = 'Clique de novo: a receita some (as semanas montadas ficam)'; return; }
      return api('PUT', '/api/receitas/' + id, { apagar: true }).then(function () { aviso('Receita apagada'); location.hash = '#config/receitas'; }).catch(falha);
    }
    if (act === 'rec-tira') { var r = S.receitas.filter(function (x) { return x.id === id; })[0]; r.dias[+t.dataset.d].splice(+t.dataset.j, 1); return salvaReceita(r); }
  });
  function depoisAssunto(msg, desfazer) {
    aviso(msg, desfazer); fecharGaveta();
    return carregaAssuntos(true).then(function () { redesenha(); });
  }
  function montar(substituir) {
    return api('POST', '/api/semana/montar', { inicio: S.semana.inicio, receita: +document.getElementById('selReceita').value, substituir: substituir })
      .then(function (r) { aviso(plural(r.criados, 'vídeo posto', 'vídeos postos') + ' na semana'); return recarregaSemana(); }).catch(falha);
  }
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.add) { if (!t.value) return; return api('POST', '/api/videos', { data: t.dataset.add, formato: t.value }).then(function () { aviso('Vídeo posto no dia'); return recarregaSemana(); }).catch(falha); }
    if (t.id === 'gFm' || t.id === 'gAs') {
      var vid = +t.dataset.vid, corpo = t.id === 'gFm' ? { formato: t.value } : { assunto_id: t.value ? +t.value : null, palavra: null };
      return api('PATCH', '/api/videos/' + vid, corpo).then(function () { return recarregaVideo(vid); }).then(function () { gavetaVideo(vid); if (rotaAtual() === 'semana') desenhaSemana(); }).catch(falha);
    }
    if (t.id === 'selRec') { location.hash = '#config/receitas/' + t.value; return; }
    if (t.id === 'recNome') return api('PUT', '/api/receitas/' + t.dataset.id, { nome: t.value.trim() }).then(function () { aviso('Nome salvo'); telaConfig('receitas', t.dataset.id); }).catch(falha);
    if (t.dataset.rec) { var r = S.receitas.filter(function (x) { return x.id === +t.dataset.rec; })[0]; if (!t.value) return; r.dias[+t.dataset.d].push(t.value); return salvaReceita(r); }
  });

  iniciar();
})();
