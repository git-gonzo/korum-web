/* maqueta.js - un cerebro de mentira para ver la pagina del movil sin placa.
   Se carga con index.html?maqueta (y siempre en la maqueta publicada, ver
   tools/maqueta_artifact.py). Sustituye a WebSocket y contesta como MovilWeb.h,
   con los carteles y textos de catalogo.js (copiados de MesaJuego.h).

   NO es el juego: las tiradas y el combate son de juguete, el mapa es fijo
   (Aldea, Bosque, Cueva con un lobo) y los demas heroes no juegan. Sirve para
   recorrer las pantallas en orden: vincular, crear el heroe (nombre, raza,
   clase), empezar partida, tu turno, la aldea (hablar, mercado, dormir), una
   prueba, un combate, los menus Heroe y Mesa, y Configurar la mesa.

   Lo que en la mesa se hace con la figura, aqui lo hacen solas al rato o desde
   la consola (en la maqueta publicada, la pestana MAQUETA):
     maqueta.figura()   pone la figura (al vincular, en la salida, de vuelta)
     maqueta.mover()    la lleva a una loseta vecina (en tu turno)
     maqueta.noLlega()  al vincular, la figura no llega (A5)
     maqueta.otro()     otro movil esta vinculando (A4)
     maqueta.encima(3)  Configurar: figura encima de la loseta 3
     maqueta.suceso('Recibes 5 de oro', 5)                                    */
(function () {
  // Mapa como en catalogo.js: [q, r]. 0 Aldea (salida), 1 Bosque, 2 Cueva; 8 no contesta
  var MAPA = [[0, 0], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1], [2, -1], [2, 0]];
  var LUGAR = { 0: ['Aldea', '#73e691', 'LocAldea'], 1: ['Bosque', '#65e67c', 'LocBosque'], 2: ['Cueva', '#bdbde6', 'LocCueva'] };
  var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  var RAZAS = ['Humano', 'Elfo', 'Enano'];
  var CLASES = ['Guerrero', 'Mago', 'Ladrón', 'Caballero'];
  var ARTE_CLASE = ['ClaseGuerrero', 'ClaseMago', 'ClaseLadron', 'ClaseCaballero'];
  var HABIL = ['Golpe Brutal', 'Bola de Fuego', 'Puñalada', 'Carga'];
  var SKN = ['Fuerza', 'Destreza', 'Constitución', 'Inteligencia', 'Sabiduría', 'Carisma', 'Sigilo', 'Percepción', 'Arcanos', 'Suerte'];
  var SKC = ['FUE', 'DES', 'CON', 'INT', 'SAB', 'CAR', 'SIG', 'PER', 'ARC', 'SUE'];
  var MAS_RAZA = [[0, 0, 1, 0, 0, 1, 0, 0, 0, 1], [0, 2, -1, 1, 0, 0, 1, 1, 1, 0], [2, -1, 2, 0, 1, -1, 0, 0, 0, 0]];
  var MAS_CLASE = [[4, 1, 2, -2, 0, 0, 0, 0, -2, 0], [-2, 1, -1, 6, 2, 0, 0, 2, 5, -1], [0, 4, 0, 0, 0, 1, 4, 2, 0, 1], [3, 0, 3, -1, 1, 3, -2, 0, -2, 0]];
  var PV_CLASE = [22, 14, 16, 20];
  var AZAR = ['ELIA', 'DUNA', 'ORIN', 'TESS', 'KAEL', 'MIRA'];
  var TIENDA = [['Poción', 25, 'ItemPocion'], ['Espada', 50, 'ItemEspada'], ['Capa', 70, 'ItemCapa'],
                ['Escudo', 60, 'ItemEscudo'], ['Arco', 45, 'ItemArco'], ['Elixir', 40, 'ItemElixir']];
  function arteItem(n) { for (var i = 0; i < TIENDA.length; i++) if (TIENDA[i][0] === n) return TIENDA[i][2]; return ''; }
  function d(n) { return 1 + Math.floor(Math.random() * n); }
  function mod(v) { return Math.floor((v - 10) / 2); }
  function sg(n) { return (n >= 0 ? '+' : '') + n; }

  var S, sock = null, guardado = null;       // guardado: el heroe "en la flash del cerebro"
  function nuevo() {
    S = { tk: 'demo1234', v: 0, bu: 0, t0: 0, vinc: 0, ot: 0, msg: '', h: null, ca: null, tipo: '', seq: 0,
          lg: [], lgSeq: 0, mn: 1, j: null, pos: 0, explor: { 0: 1 }, mover: false, nombre: '', raza: 0,
          vuelta: null, mon: null, mis: [], habil: false, prueba: false, modo: 'turnos', dados: 'auto' };
  }
  nuevo();

  /* ── Carteles ── */
  function cartel(tipo, ti, tx, op, k, extra) {
    S.tipo = tipo;
    S.ca = { s: ++S.seq, k: k === undefined ? 1 : k, w: 0, ti: ti, tx: tx, op: op || [] };
    for (var x in extra || {}) S.ca[x] = extra[x];
  }
  function espera(tipo, ti, tx, w, k) { cartel(tipo, ti, tx, [], k, { w: w }); }
  function suceso(t, k) { S.lg.push([++S.lgSeq, k || 1, t]); if (S.lg.length > 6) S.lg.shift(); }
  function lugar() { return (LUGAR[S.pos] || ['?'])[0]; }
  function pv() { return 'PV ' + S.h.hp + '/' + S.h.hm + ', ' + S.h.o + ' de oro.'; }
  // Lo que la mesa haria sola al rato (los demas ponen su figura, juega BRAN...).
  // Solo si sigue el mismo cartel; si estas en Heroe o Mesa, espera a que salgas
  function luego(ms, fn) {
    var tipo = S.tipo, ti = S.ca && S.ca.ti, id = S.timer = (S.timer || 0) + 1, yo = S;
    function f() {
      if (S !== yo || S.timer !== id) return;
      if (MENUS.indexOf(S.tipo) >= 0) { setTimeout(f, 1000); return; }
      if (S.tipo === tipo && S.ca && S.ca.ti === ti) { fn(); manda(); }
    }
    setTimeout(f, ms);
  }

  /* ── Lo que se manda al movil (como MovilWeb.h) ── */
  function estado() {
    if (C.on) return cfgEstado();
    var o = { tk: S.tk, v: S.v };
    if (!S.v) {
      if (S.bu) o.bu = Math.max(1, 90 - Math.floor((Date.now() - S.t0) / 1000));
      if (S.ot) o.ot = 'otro jugador';
      if (S.msg) o.msg = S.msg;
      return o;
    }
    if (S.h) o.h = S.h;
    if (S.ca) o.ca = S.ca;
    o.lg = S.lg;
    o.mn = S.mn;
    if (S.j) o.j = S.j;
    var tuyo = S.j && S.j.mt;
    o.me = [{ n: 'BRAN', e: 'entero', c: '#00c5e6', on: 1, tu: S.j && !tuyo && S.j.tu ? 1 : 0, yo: 0 },
            { n: 'CORA', e: 'herido', c: '#e600c5', on: 0, tu: 0, yo: 0 }];
    if (S.h) o.me.unshift({ n: S.h.n, e: S.h.hp < S.h.hm / 2 ? 'herido' : S.h.hp < S.h.hm ? 'tocado' : 'entero',
                            c: S.h.col, on: 1, tu: tuyo ? 1 : 0, yo: 1 });
    o.m = MAPA.map(function (p, i) {
      var l = S.j && S.explor[i] ? LUGAR[i] : null, fl = 32;
      if (i === 0) fl |= 8;
      if (S.j && i === S.pos) fl |= 1;
      if (S.mover && i !== S.pos && vecinas(S.pos, i) && i !== 8) fl |= 16;
      if (S.mon && S.mon.hp > 0 && i === 2 && S.explor[2]) fl |= 4;
      if (i === 8) fl = 0;                    // una loseta que no contesta
      return [p[0], p[1], l ? l[1] : '', l ? l[0] : '', fl, S.j && i === 1 ? ['#00c5e6'] : []];
    });
    return o;
  }
  function vecinas(a, b) {
    if (a < 0) return false;
    var dq = MAPA[b][0] - MAPA[a][0], dr = MAPA[b][1] - MAPA[a][1];
    return DIRS.some(function (x) { return x[0] === dq && x[1] === dr; });
  }
  function manda() { if (sock && sock.onmessage) sock.onmessage({ data: JSON.stringify(estado()) }); }

  /* ── Vincular (A3, A4, A5) y crear el heroe (C1-C3) ── */
  function vincular() {
    if (S.ot) return;
    S.bu = 1; S.t0 = Date.now(); S.msg = '';
    var n = ++S.vinc;
    setTimeout(function () { if (S.bu && S.vinc === n) { llegaFigura(); manda(); } }, 3500);
  }
  function llegaFigura() {
    S.bu = 0; S.v = 1;
    if (guardado) {               // ya tenia heroe (en el cerebro o en su chip): C5 / C6
      S.h = guardado;
      if (S.j) { S.pos = -1; espera('vuelve', 'VINCULADA', S.h.n + ', listo. Pon tu figura en la loseta que parpadea.', 2);
                 luego(4000, function () { S.pos = 0; turno(); }); }
      else sinPartida(S.h.n + ', listo para la aventura. ');
      return;
    }
    S.mn = 0;
    cartel('raza', 'NUEVO HEROE', 'Esta figura todavia no tiene heroe.', RAZAS, 7,
           { pr: 'Elige tu raza', 'in': 1, oa: ['RazaHumano', 'RazaElfo', 'RazaEnano'] });
  }
  function crear(cl) {
    var r = S.raza, n = S.nombre || AZAR[d(AZAR.length) - 1];
    var sk = SKN.map(function (_, i) { return 10 + MAS_RAZA[r][i] + MAS_CLASE[cl][i]; });
    var hm = PV_CLASE[cl] + mod(sk[2]);
    S.h = guardado = { n: n, r: RAZAS[r], c: CLASES[cl], cl: cl, l: 1, hp: hm, hm: hm, o: 30, xp: 0, xs: 0, xn: 110, p: 10,
      col: '#e6a400', sk: sk, skn: SKN, inv: ['Poción'], ia: ['ItemPocion'], ar: 'Raza' + RAZAS[r], ac: ARTE_CLASE[cl], fg: 2 };
    S.mn = 1;
    suceso('Nuevo heroe', 7);
    cartel('creado', 'HEROE CREADO', n + ', ' + RAZAS[r] + ' ' + CLASES[cl] + '. Tienes 10 puntos para repartir en Heroe > Mejorar.', ['Seguir'], 7);
    // Como el cerebro: con la figura quieta 5 s, se graba en su chip
    setTimeout(function () { if (S.h) { S.h.fg = 1; manda(); } }, 5000);
  }
  function sinPartida(antes) {
    S.j = null; S.mover = false;
    cartel('sinpartida', 'SIN PARTIDA', (antes || '') + 'No hay partida en marcha. Cuando esten todos los heroes, empezadla.', ['Empezar partida']);
  }

  /* ── Empezar (D5, D7) y los turnos (E1, E2, E20) ── */
  function empezar() {
    S.j = { f: 'reunion en la salida', d: 1 }; S.pos = -1; S.mover = false;
    S.explor = { 0: 1 }; S.mon = { n: 'Lobo Huargo', hp: 22, hm: 22, ca: 13 }; S.mis = [];
    espera('reunion', 'NUEVA PARTIDA', 'Pon tu figura en la aldea de salida: la loseta que parpadea en dorado.', 2);
    luego(5000, enSalida);
  }
  function enSalida() {
    S.pos = 0;
    espera('enmesa', 'EN LA MESA', S.h.n + ' esta en Aldea. Cuando esten todos, empieza el dia 1.', 1);
    luego(3500, turno);
  }
  function turno() {
    S.j = { f: 'por ' + S.modo, d: S.j && S.j.d ? S.j.d : 1, tu: S.h.n, mt: 1 };
    S.mover = true; S.mn = 1;
    cartel('turno', 'TU TURNO', 'Dia ' + S.j.d + '. Estas en ' + lugar() + '.', ['Quedarme'], 4, { ar: LUGAR[S.pos][2] });
  }
  function finTurno() {
    S.mover = false; S.mn = 1;
    S.j = { f: 'por ' + S.modo, d: S.j.d, tu: 'BRAN', mt: 0 };
    espera('espera', 'FIN DEL TURNO', 'Le toca al siguiente. Cuando vuelva a ser tu turno, te avisa.', 1);
    luego(3000, function () {
      suceso('Turno de BRAN', 1);
      espera('espera', 'ESPERA', 'Dia ' + S.j.d + '. Juega BRAN.', 1);
      luego(4000, function () { S.j.d++; turno(); });
    });
  }
  function mover() {
    if (!S.mover) return 'no te toca moverte';
    var dest = S.pos === 0 ? 1 : S.pos === 1 ? 2 : 0;
    S.pos = dest; S.mover = false;
    if (!S.explor[dest]) {
      S.explor[dest] = 1;
      if (dest === 2) { combate('Has descubierto: Cueva. '); return 'a la Cueva'; }
      cartel('loseta', LUGAR[dest][0], 'Has descubierto: ' + LUGAR[dest][0] + '. ' + LUGAR[dest][0] + '. ' + pv(),
             ['Registrar', 'Acampar', 'Fin del turno'], 1, { ar: LUGAR[dest][2] });
      return 'al ' + LUGAR[dest][0];
    }
    if (dest === 2 && S.mon.hp > 0) { combate(''); return 'a la Cueva'; }
    loseta();
    return 'a ' + LUGAR[dest][0];
  }

  /* ── Las losetas (E7, E8) y lo que hay en ellas ── */
  function loseta() {
    S.mn = 1;
    if (S.pos === 0) cartel('loseta', 'Aldea', 'Aldea. ' + pv(), ['Hablar: Mara', 'Mercado', 'Dormir (15)', 'Fin del turno'], 1, { ar: 'LocAldea' });
    else cartel('loseta', lugar(), lugar() + '. ' + pv(), ['Registrar', 'Acampar', 'Fin del turno'], 1, { ar: LUGAR[S.pos][2] });
  }
  function npc() { S.mn = 0; cartel('npc', 'Mara', 'Los lobos del bosque no dejan dormir a nadie. Si vas hacia alla, ten cuidado.', ['Encargo', 'Rumores', 'Curarme', 'Adios'], 1, { ar: 'npc/Aldeana' }); }
  function mercado() { S.mn = 0; cartel('mercado', 'MERCADO', 'Feria de tres dias. Viene medio valle: hay de todo. Tienes ' + S.h.o + ' de oro.', ['Comprar', 'Vender', 'Salir'], 5, { ar: 'Mercado' }); }
  function comprar() {
    S.mn = 0;
    cartel('comprar', 'COMPRAR', 'Tienes ' + S.h.o + ' de oro. Elige que comprar.',
           TIENDA.map(function (t) { return t[0] + ' ' + t[1]; }).concat(['Volver']), 5,
           { ar: 'Mercado', oa: TIENDA.map(function (t) { return t[2]; }).concat(['']) });
  }
  function vender() {
    S.mn = 0;
    cartel('vender', 'VENDER', S.h.inv.length ? 'Te dan la mitad de lo que vale.' : 'No llevas nada que vender.',
           S.h.inv.map(function (n) { return n; }).concat(['Volver']), 5, { ar: 'Mercado', oa: S.h.ia.concat(['']) });
  }
  function quitaObjeto(i) { S.h.inv.splice(i, 1); S.h.ia.splice(i, 1); }
  function daObjeto(n) { S.h.inv.push(n); S.h.ia.push(arteItem(n)); }
  function prueba() {
    S.mn = 0;
    var m = mod(S.h.sk[0]);
    cartel('prueba', 'Porton atrancado', 'Un portón de roble cerrado por dentro bloquea el paso. La madera cruje. Prueba de FUE, CD 12 (tu ' + sg(m) + ').',
           ['Intentarlo', 'Dejarlo'], 1, { ar: LUGAR[S.pos][2] });
  }
  function subeXp(xp, oro) {
    S.h.xp += xp; S.h.o += oro;
    if (S.h.xp >= S.h.xn) {
      S.h.l++; S.h.xs = S.h.xn; S.h.xn += 130; S.h.p += 2; S.h.hm += 4; S.h.hp += 4;
      suceso('Subes a nivel ' + S.h.l, 7);
    }
  }

  /* ── Combate (F1, F6, F7, F9) ── */
  function combate(antes) {
    S.mn = 0; S.habil = false;
    var m = S.mon;
    var txt = antes + (m.hp === m.hm ? 'Lobo Huargo! Bestia veloz que ataca en jauría. ' + m.hm + ' PV, CA ' + m.ca + '. ' : '') +
      'Lobo Huargo ' + m.hp + '/' + m.hm + ' PV. Tu: ' + S.h.hp + '/' + S.h.hm + ' PV. Que haces?';
    rondaCartel(1, txt);
  }
  function rondaCartel(n, txt) {
    S.ronda = n;
    cartel('combate', 'RONDA ' + n, txt, ['Atacar', 'Defenderse', HABIL[S.h.cl], 'Beber', 'Cubrir a...', 'Huir'], 2, { ar: 'MonLobo' });
  }
  function accion(op) {
    var m = S.mon, h = S.h, t = '', defensa = 0;
    if (op === 0) {
      var r = d(20), ataque = r + mod(Math.max(h.sk[0], h.sk[1]));
      if (ataque >= m.ca) { var dn = d(8) + 2; m.hp -= dn; t = h.n + ' (d20 ' + r + ') acierta: ' + dn + ' de dano. '; }
      else t = h.n + ' (d20 ' + r + ') falla. ';
    } else if (op === 1) { defensa = 5; t = h.n + ' se cubre. '; }
    else if (op === 2) {
      if (S.habil) t = 'Ya has usado ' + HABIL[h.cl] + ' en este combate. ';
      else { S.habil = true; var dh = d(6) + d(6) + 3; m.hp -= dh; t = HABIL[h.cl] + ': ' + dh + ' de dano. '; }
    } else if (op === 3) {
      var p = h.inv.indexOf('Poción');
      if (p < 0) t = 'No te quedan pociones. ';
      else { quitaObjeto(p); h.hp = Math.min(h.hm, h.hp + 15); t = 'Bebes una poción: +15 PV. '; }
    } else if (op === 4) { t = 'Cubres a BRAN. '; }
    else {
      var rh = d(20);
      if (rh >= 8) { S.pos = 1; S.mover = false;
        cartel('fincombate', 'HUIDA', h.n + ' intenta huir (d20 ' + rh + '): lo consigue. Huyes del combate. Vuelves al Bosque.', ['Seguir'], 1, { ar: 'MonLobo' });
        return; }
      t = h.n + ' intenta huir (d20 ' + rh + '): no puede. ';
    }
    if (m.hp <= 0) {
      m.hp = 0; subeXp(22, 6); suceso('Victoria', 4);
      cartel('fincombate', 'VICTORIA', t + 'Lobo Huargo cae. +22 XP, +6 de oro.', ['Seguir'], 4, { ar: 'LocCueva' });
      return;
    }
    if (d(20) + 3 >= 12 + defensa) { var dl = d(6) + 1; h.hp -= dl; t += 'Lobo Huargo golpea a ' + h.n + ': -' + dl + ' PV. '; suceso('Te golpean', 2); }
    else t += 'Lobo Huargo falla. ';
    if (h.hp <= 0) {
      h.hp = 1; h.o = Math.floor(h.o / 2); S.pos = 1;
      cartel('fincombate', 'DERROTA', t + '(cae). No queda nadie en pie. Despiertas con 1 PV y sin la mitad del oro. Lobo Huargo sigue aqui.', ['Seguir'], 2, { ar: 'MonLobo' });
      return;
    }
    rondaCartel(S.ronda + 1, t + 'Lobo Huargo ' + m.hp + '/' + m.hm + ' PV. Tu: ' + h.hp + '/' + h.hm + ' PV. Que haces?');
  }

  /* ── Menus Heroe (D1, G1-G4) y Mesa (D2, G5, G6) ── */
  var MENUS = ['menu', 'mochila', 'objeto', 'misiones', 'mejorar', 'mesa', 'ajustes', 'partida'];
  function guardaVuelta() {
    if (MENUS.indexOf(S.tipo) < 0) S.vuelta = { ca: S.ca, tipo: S.tipo, mn: S.mn };
  }
  function volver() {
    var v = S.vuelta; S.vuelta = null;
    if (!v) { if (S.j) loseta(); else sinPartida(); return; }
    S.tipo = v.tipo; S.mn = v.mn; S.ca = JSON.parse(JSON.stringify(v.ca)); S.ca.s = ++S.seq;
  }
  function menuHeroe() {
    guardaVuelta(); S.mn = 1;
    cartel('menu', 'TU HEROE', S.h.p ? 'Tienes puntos para mejorar.' : S.h.n + ', ' + S.h.r + ' ' + S.h.c + ' de nivel ' + S.h.l + '.',
           ['Mochila', 'Misiones', 'Mejorar' + (S.h.p ? ' (' + S.h.p + ')' : ''), 'Volver']);
  }
  function mochila() {
    cartel('mochila', 'MOCHILA', S.h.inv.length ? 'Elige un objeto.' : 'La mochila esta vacia.', S.h.inv.concat(['Volver']), 6, { oa: S.h.ia.concat(['']) });
  }
  function mejorar() {
    cartel('mejorar', 'MEJORAR', 'Tienes ' + S.h.p + ' puntos. Entre parentesis, lo que cuesta subir cada una.',
           S.h.sk.map(function (v, i) { return SKC[i] + ' ' + v + ' (' + (v >= 15 ? 2 : 1) + ')'; }).concat(['Volver']), 7);
  }
  function menuMesa() {
    guardaVuelta(); S.mn = 1;
    if (S.j) cartel('mesa', 'LA MESA', 'Dia ' + S.j.d + ', por ' + S.modo + '. Lo de aqui cambia para todos.', ['Partida', 'Ajustes', 'Volver']);
    else cartel('mesa', 'LA MESA', 'No hay partida en marcha. Lo de aqui cambia para todos.', ['Empezar partida', 'Ajustes', 'Volver']);
  }
  function ajustes() {
    cartel('ajustes', 'AJUSTES', 'Cada opcion cambia al pulsarla. El modo cuenta desde la ronda siguiente.',
           ['Modo: ' + S.modo, 'Dados: ' + S.dados, 'Placas: virtual', 'Volver']);
  }

  /* ── Un boton del cartel ── */
  function boton(op) {
    var t = S.tipo, h = S.h;
    if (t === 'raza') { S.raza = op; cartel('clase', 'NUEVO HEROE', 'Raza: ' + RAZAS[op] + '.', CLASES, 7, { pr: 'Elige tu clase', oa: ARTE_CLASE }); }
    else if (t === 'clase') crear(op);
    else if (t === 'creado') sinPartida();
    else if (t === 'sinpartida') empezar();
    else if (t === 'turno') { S.mover = false; loseta(); }
    else if (t === 'loseta' && S.pos === 0) {
      if (op === 0) npc();
      else if (op === 1) mercado();
      else if (op === 2) {
        if (h.o < 15) cartel('descanso', 'DESCANSO', 'No te llega: dormir cuesta 15 de oro.', ['Seguir']);
        else { h.o -= 15; var c = Math.min(4, h.hm - h.hp); h.hp += c; cartel('descanso', 'DESCANSO', 'Pagas 15 y duermes de un tiron: +' + c + ' PV.', ['Seguir'], 3, { ar: 'LocAldea' }); }
      } else finTurno();
    }
    else if (t === 'loseta') {
      if (op === 0) { if (S.pos === 1 && !S.prueba) prueba(); else cartel('descanso', 'REGISTRAR', 'Buscas un buen rato: aqui no queda nada.', ['Seguir']); }
      else if (op === 1) { var g = d(20); if (g >= 6) { var cu = Math.min(2, h.hm - h.hp); h.hp += cu; cartel('descanso', 'DESCANSO', 'Acampas (guardia d20 ' + g + '): noche tranquila, +' + cu + ' PV.', ['Seguir'], 3, { ar: LUGAR[S.pos][2] }); }
                           else cartel('descanso', 'DESCANSO', 'Acampas (guardia d20 ' + g + '): algo ronda, no pegas ojo.', ['Seguir'], 2, { ar: LUGAR[S.pos][2] }); }
      else finTurno();
    }
    else if (t === 'npc') {
      if (op === 0) { S.mn = 0; cartel('encargo', 'ENCARGO', S.mis.length ? 'Ya llevas mi encargo. Vuelve cuando lo hayas cumplido.' :
                      'Limpieza de caminos: Derrota a 3 criaturas que acechan la comarca. Paga 60 XP y 25 de oro, aqui.',
                      S.mis.length ? ['Seguir'] : ['Aceptar', 'Ahora no'], 1, { ar: 'npc/Aldeana' }); }
      else if (op === 1) { S.mn = 0; cartel('rumores', 'RUMORES', 'Dicen que en las ruinas del norte alguien enciende fuego por las noches.', ['Seguir'], 1, { ar: 'LocAldea' }); }
      else if (op === 2) { var cc = h.hm - h.hp; h.hp = h.hm; if (cc) suceso('+' + cc + ' PV', 3); npc(); S.ca.tx = cc ? 'Mara te venda las heridas: +' + cc + ' PV.' : 'No tienes heridas que curar.'; }
      else loseta();
    }
    else if (t === 'encargo') { if (op === 0 && !S.mis.length) { S.mis.push('Limpieza de caminos'); suceso('Encargo aceptado', 1); } npc(); }
    else if (t === 'rumores' || t === 'descanso' || t === 'resultado' || t === 'fincombate') loseta();
    else if (t === 'mercado') { if (op === 0) comprar(); else if (op === 1) vender(); else loseta(); }
    else if (t === 'comprar') {
      if (op >= TIENDA.length) { mercado(); }
      else { var it = TIENDA[op]; if (h.o < it[1]) { comprar(); S.ca.tx = 'No te llega: ' + it[0] + ' cuesta ' + it[1] + ' y tienes ' + h.o + '.'; }
             else { h.o -= it[1]; daObjeto(it[0]); suceso('+ ' + it[0], 6); comprar(); } }
    }
    else if (t === 'vender') {
      if (op >= h.inv.length) mercado();
      else { var vn = h.inv[op], pr = 0; TIENDA.forEach(function (x) { if (x[0] === vn) pr = Math.floor(x[1] / 2); });
             quitaObjeto(op); h.o += pr; suceso('+' + pr + ' oro', 5); vender(); }
    }
    else if (t === 'prueba') { if (op === 0) cartel('tirada', 'Porton atrancado', 'Prueba de FUE, CD 12. Pulsa Tirar para el d20.', ['Tirar'], 1, { ar: LUGAR[S.pos][2] }); else loseta(); }
    else if (t === 'tirada') {
      var r = d(20), m = mod(h.sk[0]), tot = r + m;
      S.prueba = true; S.mn = 1;
      if (tot >= 12) { subeXp(40, 30); daObjeto('Llave'); suceso('Prueba superada', 4);
        cartel('resultado', 'EXITO', 'd20 ' + r + ' ' + sg(m) + ' = ' + tot + ' contra 12. El portón cede de golpe y cae hacia dentro. Dentro, entre astillas, brilla algo. +40 XP. +30 de oro. Consigues: Llave.', ['Seguir'], 4, { ar: LUGAR[S.pos][2] }); }
      else { h.hp = Math.max(1, h.hp - 4); suceso('-4 PV', 2);
        cartel('resultado', 'FRACASO', 'd20 ' + r + ' ' + sg(m) + ' = ' + tot + ' contra 12. La madera aguanta y te destrozas el hombro. -4 PV.', ['Seguir'], 2, { ar: LUGAR[S.pos][2] }); }
    }
    else if (t === 'combate') accion(op);
    else if (t === 'menu') { if (op === 0) mochila(); else if (op === 1) cartel('misiones', 'MISIONES', S.mis.length ? 'Limpieza de caminos: Derrota a 3 criaturas que acechan la comarca. (' + (S.mon && S.mon.hp <= 0 ? 1 : 0) + '/3)' : 'No tienes encargos. Los dan los NPC de las aldeas.', ['Seguir'], 1, { ar: 'LocAldea' });
                             else if (op === 2) mejorar(); else volver(); }
    else if (t === 'mochila') { if (op >= h.inv.length) menuHeroe(); else { S.obj = op; var n = h.inv[op];
                                cartel('objeto', n, n + (n === 'Poción' ? '. Restaura 15 puntos de vida.' : n === 'Elixir' ? '. Restaura 25 puntos de vida.' : '.'),
                                       (n === 'Poción' || n === 'Elixir' ? ['Beber'] : []).concat(['Tirar', 'Volver']), 6, { ar: h.ia[op] }); } }
    else if (t === 'objeto') {
      var bebe = h.inv[S.obj] === 'Poción' || h.inv[S.obj] === 'Elixir', acc = bebe ? op : op + 1;
      if (acc === 0) { var cura = h.inv[S.obj] === 'Elixir' ? 25 : 15, c2 = Math.min(cura, h.hm - h.hp); h.hp += c2; quitaObjeto(S.obj); suceso('+' + c2 + ' PV', 3); mochila(); }
      else if (acc === 1) { suceso('Tiras: ' + h.inv[S.obj], 6); quitaObjeto(S.obj); mochila(); }
      else mochila();
    }
    else if (t === 'misiones') volver();
    else if (t === 'mejorar') {
      if (op >= 10) menuHeroe();
      else { var cost = h.sk[op] >= 15 ? 2 : 1;
             if (h.p >= cost) { h.p -= cost; h.sk[op]++; if (op === 2) { h.hm++; h.hp++; } }
             mejorar(); if (h.p < cost && h.p >= 0) S.ca.tx = h.p ? S.ca.tx : 'No te quedan puntos.'; }
    }
    else if (t === 'mesa') { if (op === 0) { if (S.j) cartel('partida', 'PARTIDA', 'Dia ' + S.j.d + ', modo por ' + S.modo + '. Empezar otra borra el mapa y los encargos (no los heroes).', ['Nueva partida', 'Terminar', 'Volver']);
                                             else { S.vuelta = null; empezar(); } }
                             else if (op === 1) ajustes(); else volver(); }
    else if (t === 'ajustes') {
      if (op === 0) S.modo = S.modo === 'turnos' ? 'a la vez' : 'turnos';
      else if (op === 1) S.dados = S.dados === 'auto' ? 'lector' : 'auto';
      if (op === 3) menuMesa(); else ajustes();
    }
    else if (t === 'partida') { if (op === 0) { S.vuelta = null; empezar(); } else if (op === 1) { S.vuelta = null; sinPartida(); } else menuMesa(); }
  }

  /* ── Configurar la mesa: 7 losetas, 4 ya colocadas, la 6 no contesta ── */
  var C = { on: false, msg: '', ul: 0, us: 0, rc: 0, rv: 0,
    ls: [[1,1,1,0,0,0,''],[2,1,1,1,0,0,'Bosque'],[3,1,1,0,1,1,''],[4,1,1,-1,1,0,''],[5,1,0,0,0,0,''],[6,0,0,0,0,0,''],[7,1,0,0,0,0,'']],
    np: [1,3,1,1,1,0,1,1,0,0], nc: [2,1,3,0,1,0,0,0,0,0,0,0,0,0,0] };
  var TP = ['Aldea','Bosque','Mazmorra','Ruinas','Cueva','Altar','Taberna','Cripta','Tesoro','Emboscada'];
  var OB = ['Espada','Escudo','Poción','Gema','Llave','Anillo','Pergamino','Moneda','Montura','Arco','Cota','Amuleto','Capa','Catalejo','Elixir'];
  function cfgEstado() {
    return { tk: S.tk, v: S.v, cfg: { bus: 1, fj: S.j ? 1 : 0, ul: C.ul, us: C.us, ls: C.ls, rc: C.rc, rv: C.rv,
      np: C.np, nc: C.nc, tp: TP, ob: OB, msg: C.msg } };
  }
  function cfgOrden(o) {
    var l = null;
    C.ls.forEach(function (x) { if (x[0] === o.d) l = x; });
    if (o.t === 'cfg') { C.on = !!o.s; C.msg = ''; }
    else if (o.t === 'buscar') {
      if (!C.ls.length) C.ls = [[1,1,0,0,0,0,''],[2,1,0,0,0,0,''],[3,1,0,0,0,0,''],[4,1,0,0,0,0,''],[5,1,0,0,0,0,''],[6,0,0,0,0,0,''],[7,1,0,0,0,0,'']];
      var sin = C.ls.filter(function (x) { return !x[2]; }).length;
      C.msg = '6 losetas contestan, 1 no. Faltan ' + sin + ' por colocar en el dibujo.';
    }
    else if (o.t === 'pos' && l) {
      var otra = C.ls.filter(function (x) { return x[2] && x[3] === o.q && x[4] === o.r && x !== l; })[0];
      if (otra) C.msg = 'Ese hueco ya es la loseta ' + otra[0] + '.';
      else { l[2] = 1; l[3] = o.q; l[4] = o.r; C.msg = 'Loseta ' + l[0] + ' colocada. Guardado en el cerebro.'; }
    }
    else if (o.t === 'sinpos' && o.d === 0) {      // Mapa nuevo: borrar el dibujo entero
      C.ls.forEach(function (x) { x[2] = 0; });
      C.msg = 'Dibujo borrado. Coloca cada loseta: pon una figura encima y toca su hueco.';
    }
    else if (o.t === 'sinpos' && l) { l[2] = 0; C.msg = 'Loseta ' + l[0] + ' quitada del dibujo.'; }
    else if (o.t === 'registrar') { C.rc = o.s === 1 || o.s === 2 ? o.s : 0; C.rv = o.q; C.msg = ''; }
    else if (o.t === 'borrartags') { C.np = C.np.map(function () { return 0; }); C.nc = C.nc.map(function () { return 0; }); C.msg = 'Placas y cartas olvidadas.'; }
    else if (o.t === 'olvidar') { C.ls = []; C.msg = 'Todas las losetas olvidadas. Pulsa Buscar losetas para empezar de nuevo.'; }
  }

  /* ── Lo que en la mesa se hace con la figura ── */
  window.maqueta = {
    figura: function () {
      if (C.on) return 'en Configurar: usa encima()';
      if (S.bu) { llegaFigura(); manda(); return 'figura vinculada'; }
      if (S.tipo === 'reunion') { enSalida(); manda(); return 'figura en la salida'; }
      if (S.tipo === 'vuelve') { S.pos = 0; turno(); manda(); return 'figura en su loseta'; }
      return S.v ? 'ahora no hace falta la figura' : 'pulsa antes Vincular mi figura';
    },
    mover: function () { var r = mover(); manda(); return r; },
    noLlega: function () {
      if (!S.bu) return 'pulsa antes Vincular mi figura';
      S.bu = 0; S.msg = 'Pulsa otra vez y pon la figura en una loseta antes de 90 s.'; manda(); return 'la figura no ha llegado';
    },
    otro: function () {
      if (S.v) return 'este movil ya tiene figura';
      S.ot = 1; S.bu = 0; manda();
      setTimeout(function () { S.ot = 0; manda(); }, 6000);
      return 'otro movil vinculando (6 s)';
    },
    suceso: function (t, k) { suceso(t, k); manda(); return 'suceso enviado'; },
    // Configurar: como si se pusiera una figura encima de la loseta d
    encima: function (d) { if (!C.on) return 'abre antes Configurar la mesa'; C.ul = d; C.us++; manda(); return 'figura sobre la loseta ' + d; },
    olvidar: function () { guardado = null; nuevo(); manda(); return 'mesa vacia'; }
  };

  function Fake() {
    var me = this;
    sock = me;
    me.readyState = 0;
    setTimeout(function () { me.readyState = 1; if (me.onopen) me.onopen(); }, 600);
  }
  Fake.prototype.send = function (txt) {
    var o = JSON.parse(txt), me = this;
    if (o.t === 'ping') { setTimeout(function () { if (me.onmessage) me.onmessage({ data: '{"t":"pong"}' }); }, 30); return; }
    setTimeout(function () {
      if (['cfg', 'buscar', 'ver', 'pos', 'sinpos', 'registrar', 'borrartags', 'olvidar'].indexOf(o.t) >= 0) { cfgOrden(o); manda(); return; }
      if (o.t === 'hello') {}
      else if (o.t === 'vincular') vincular();
      else if (o.t === 'cancelar') { S.bu = 0; }
      else if (o.t === 'nombre') S.nombre = o.n || '';
      else if (o.t === 'op') boton(o.s);
      else if (o.t === 'cerrar') { if (S.j) loseta(); else if (S.h) sinPartida(); }
      else if (o.t === 'menu' && S.h) menuHeroe();
      else if (o.t === 'mesa' && S.h) menuMesa();
      else if (o.t === 'chip') { if (S.h) S.h.fg = 1; }
      else if (o.t === 'soltar') { var g = guardado, j = S.j; nuevo(); guardado = g; S.j = j; }
      manda();
    }, 120);
  };
  Fake.prototype.close = function () {};
  window.WebSocket = Fake;
  setInterval(function () { if (S.bu) manda(); }, 1000);
})();
