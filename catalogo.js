/* catalogo.js - todas las pantallas del movil, una por una, para hacerles foto.
   Se carga con index.html?catalogo=ID (ID de la lista de abajo). Como maqueta.js,
   sustituye al WebSocket, pero no juega: manda UN estado fijo, el que tendria
   el movil en ese momento. Los textos son los que monta MesaJuego.h (copiados
   de cada snprintf), con datos de ejemplo.
   Lo usa tools/capturas.py para el grafico de flujo (DOCS). index.html?catalogo
   sin numero lista los ID en la consola. */
(function () {
  var HERO = {
    n: 'ELIA', r: 'Elfo', c: 'Mago', l: 2, hp: 14, hm: 18, o: 42, xp: 150, xs: 110, xn: 240, p: 0,
    col: '#e6a400', sk: [8, 14, 10, 17, 12, 9, 11, 14, 13, 10],
    skn: ['Fuerza', 'Destreza', 'Constitución', 'Inteligencia', 'Sabiduría', 'Carisma', 'Sigilo', 'Percepción', 'Arcanos', 'Suerte'],
    inv: ['Poción', 'Espada'], ia: ['ItemPocion', 'ItemEspada'], ar: 'RazaElfo', ac: 'ClaseMago', fg: 1
  };
  var NUEVO = { n: 'ELIA', r: 'Elfo', c: 'Mago', l: 1, hp: 18, hm: 18, o: 30, xp: 0, xs: 0, xn: 110, p: 10,
    col: '#e6a400', sk: [7, 12, 8, 18, 13, 10, 10, 13, 17, 9], skn: HERO.skn, inv: ['Poción'], ia: ['ItemPocion'],
    ar: 'RazaElfo', ac: 'ClaseMago', fg: 2 };
  var ME = [{ n: 'ELIA', e: 'tocado', c: '#e6a400', on: 1, tu: 0, yo: 1 },
            { n: 'BRAN', e: 'entero', c: '#00c5e6', on: 1, tu: 0, yo: 0 },
            { n: 'CORA', e: 'herido', c: '#e600c5', on: 0, tu: 0, yo: 0 }];
  var LG = [[1, 7, 'Nuevo heroe'], [2, 1, 'Turno de BRAN'], [3, 4, 'Prueba superada'], [4, 5, 'Encargo cobrado'], [5, 2, 'Te golpean']];

  // Mapa: [q, r, color, nombre, banderas (1 tu, 4 combate, 8 salida, 16 puedes ir, 32 viva), [otros]]
  function mapa(o) {
    o = o || {};
    var t = [
      [0, 0, '#73e691', 'Aldea', 8 | 32, []],
      [1, 0, '#65e67c', 'Bosque', 32, ['#00c5e6']],
      [0, 1, '', '', 32, []],
      [-1, 1, '#e6b060', 'Taberna', 32, []],
      [-1, 0, '', '', 32, []],
      [0, -1, '#e6d18b', 'Ruinas', 32, []],
      [1, -1, '', '', 32, []],
      [2, -1, '', '', 32, []],
      [2, 0, '', '', 0, []]
    ];
    if (o.sinPartida) return t.map(function (x) { return [x[0], x[1], '', '', x[4] & 32, []]; });
    var yo = o.yo === undefined ? 0 : o.yo;
    if (yo >= 0) t[yo][4] |= 1;
    if (o.mover) [1, 2, 3, 4, 5, 6].forEach(function (i) { if (i !== yo) t[i][4] |= 16; });
    if (o.combate !== undefined) t[o.combate][4] |= 4;
    if (o.descubre !== undefined) { t[o.descubre][2] = o.color; t[o.descubre][3] = o.nombre; }
    return t;
  }

  // El arte que manda el cerebro con el cartel (ar) y con cada boton (oa)
  function X(a, c) { for (var k in a) c[k] = a[k]; return c; }
  function ca(ti, tx, op, k, s) { return { s: s || 7, k: k === undefined ? 1 : k, w: 0, ti: ti, tx: tx, op: op || [] }; }
  // Titulo de los botones ("Elige tu raza") y si lleva el nombre del heroe
  function pr(c, t, nombre) { c.pr = t; if (nombre) c['in'] = 1; return c; }
  // Cartel de espera (rueda): w 1 = a los demas, 2 = a tu figura
  function esp(ti, tx, w, k, s) { var c = ca(ti, tx, [], k, s); c.w = w; return c; }
  // Estado con heroe. o: h, ca, j, m, lg, tab
  function con(o) {
    var st = { tk: 'demo1234', v: 1, h: o.h === undefined ? HERO : o.h, lg: o.lg || LG, me: o.me || ME, m: o.m || mapa(o.mapa),
               mn: o.mn === undefined ? 1 : o.mn };
    if (o.ca) st.ca = o.ca;
    if (o.j !== null) st.j = o.j || { f: 'por turnos', d: 2, tu: 'BRAN', mt: 0 };
    if (!st.h) delete st.h;
    return st;
  }
  var SIN = null;                                     // j: sin partida
  var MI_TURNO = { f: 'por turnos', d: 2, tu: 'ELIA', mt: 1 };
  var A_LA_VEZ = { f: 'a la vez: mover', d: 2 };

  // Configurar la mesa
  var TP = ['Aldea', 'Bosque', 'Mazmorra', 'Ruinas', 'Cueva', 'Altar', 'Taberna', 'Cripta', 'Tesoro', 'Emboscada'];
  var OB = ['Espada', 'Escudo', 'Poción', 'Gema', 'Llave', 'Anillo', 'Pergamino', 'Moneda', 'Montura', 'Arco', 'Cota', 'Amuleto', 'Capa', 'Catalejo', 'Elixir'];
  var LS = [[1, 1, 1, 0, 0, 0, 'Aldea'], [2, 1, 1, 1, 0, 0, ''], [3, 1, 1, 0, 1, 1, ''], [4, 1, 1, -1, 1, 0, ''],
            [5, 1, 0, 0, 0, 0, ''], [6, 0, 0, 0, 0, 0, ''], [7, 1, 0, 0, 0, 1, '']];
  function cfg(o) {
    return { tk: 'demo1234', v: 0, cfg: { bus: 1, fj: 0, ul: 0, us: 0, ls: o.ls || LS, rc: o.rc || 0, rv: o.rv || 0,
      np: [1, 3, 1, 1, 1, 0, 1, 1, 0, 0], nc: [2, 1, 3, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], tp: TP, ob: OB, msg: o.msg || '' } };
  }

  var TURNO_OTRO = { f: 'por turnos', d: 2, tu: 'BRAN', mt: 0 };
  var P = {
    // ---- A. Entrar ----
    A1: { st: 'nada' },
    A2: { st: { tk: 'demo1234', v: 0 } },
    A3: { st: { tk: 'demo1234', v: 0, bu: 72 } },
    A4: { st: { tk: 'demo1234', v: 0, ot: 'otro jugador' } },
    A5: { st: { tk: 'demo1234', v: 0, msg: 'Pulsa otra vez y pon la figura en una loseta antes de 90 s.' } },
    A6: { st: { lleno: 1 } },
    A7: { st: { tk: 'demo1234', v: 0 }, aj: 1 },
    // Ronda 4: figura encontrada (de A3, escaneando, a C1: el mismo estado). Dura 2,8 s
    A8: { antes: { tk: 'demo1234', v: 0, bu: 72 }, st: null },
    // ---- B. Configurar la mesa (nuevo) ----
    B1: { st: cfg({ ls: [] }) },
    B2: { st: cfg({ msg: '6 losetas contestan, 1 no. Faltan 3 por colocar en el dibujo.' }) },
    B3: { st: cfg({}), sel: 5 },
    B4: { st: cfg({ ls: LS.map(function (l) { return l[0] === 5 ? [5, 1, 1, 1, -1, 0, ''] : l; }), msg: 'Loseta 5 colocada. Guardado en el cerebro.' }), sel: 5 },
    B5: { st: cfg({ rc: 1, rv: 2 }) },
    B6: { st: cfg({ ls: LS.map(function (l) { return [l[0], l[1], 0, 0, 0, l[5], l[6]]; }), msg: 'Dibujo borrado. Coloca cada loseta: pon una figura encima y toca su hueco.' }) },
    // ---- C. Crear el heroe ----
    C1: { st: con({ h: null, j: SIN, mn: 0, mapa: { sinPartida: 1 }, lg: [], ca: pr(X({ oa: ['RazaHumano', 'RazaElfo', 'RazaEnano'] }, ca('NUEVO HEROE', 'Esta figura todavia no tiene heroe.', ['Humano', 'Elfo', 'Enano'], 7)), 'Elige tu raza', 1) }) },
    // Ronda 4: el nombre es el paso 1 (C1, en la pagina); C7 es la raza con el nombre ya puesto
    C7: { st: null, nom: 'ELIA' },
    C2: { st: con({ h: null, j: SIN, mn: 0, mapa: { sinPartida: 1 }, lg: [], ca: pr(X({ oa: ['ClaseGuerrero', 'ClaseMago', 'ClaseLadron', 'ClaseCaballero'] }, ca('NUEVO HEROE', 'Raza: Elfo.', ['Guerrero', 'Mago', 'Ladrón', 'Caballero'], 7)), 'Elige tu clase') }) , nom: 'ELIA' },
    C3: { st: con({ h: NUEVO, j: SIN, mapa: { sinPartida: 1 }, lg: [[1, 7, 'Nuevo heroe']], ca: ca('HEROE CREADO', 'ELIA, Elfo Mago. Tienes 10 puntos para repartir en Heroe > Mejorar.', ['Seguir'], 7) }), toast: 1 },
    C4: { st: con({ h: NUEVO, j: SIN, mapa: { sinPartida: 1 }, lg: [[1, 7, 'Nuevo heroe']], ca: ca('SIN PARTIDA', 'No hay partida en marcha. Cuando esten todos los heroes, empezadla.', ['Empezar partida']) }) },
    C5: { st: con({ h: HERO, j: SIN, mapa: { sinPartida: 1 }, lg: [], ca: ca('SIN PARTIDA', 'ELIA, listo para la aventura. No hay partida en marcha. Cuando esten todos los heroes, empezadla.', ['Empezar partida']) }) },
    C6: { st: con({ h: HERO, j: { f: 'por turnos', d: 2, tu: 'BRAN', mt: 0 }, mapa: { yo: -1 }, lg: [], ca: esp('VINCULADA', 'ELIA, listo. Pon tu figura en la loseta que parpadea.', 2) }) },
    // ---- D. Empezar una partida ----
    D1: { st: con({ h: NUEVO, j: SIN, mapa: { sinPartida: 1 }, lg: [], ca: ca('TU HEROE', 'Tienes puntos para mejorar.', ['Mochila', 'Misiones', 'Mejorar (10)', 'Volver']) }) },
    D2: { st: con({ h: NUEVO, j: SIN, mapa: { sinPartida: 1 }, lg: [], ca: ca('LA MESA', 'No hay partida en marcha. Lo de aqui cambia para todos.', ['Empezar partida', 'Ajustes', 'Volver']) }) },
    D5: { st: con({ h: NUEVO, j: { f: 'reunion en la salida', d: 1 }, mapa: { yo: -1 }, lg: [], ca: esp('NUEVA PARTIDA', 'Pon tu figura en la aldea de salida: la loseta que parpadea en dorado.', 2) }) },
    D6: { st: con({ h: NUEVO, j: { f: 'reunion en la salida', d: 1 }, mapa: { yo: -1 }, lg: [], ca: esp('AHI NO', 'Tu figura va en la loseta que parpadea.', 2, 2) }) },
    D7: { antes: con({ h: NUEVO, j: { f: 'reunion en la salida', d: 1 }, mapa: { yo: -1 }, lg: [], ca: esp('NUEVA PARTIDA', 'Pon tu figura en la aldea de salida: la loseta que parpadea en dorado.', 2, 1, 6) }),
          st: con({ h: NUEVO, j: { f: 'reunion en la salida', d: 1 }, lg: [], ca: esp('EN LA MESA', 'ELIA esta en Aldea. Cuando esten todos, empieza el dia 1.', 1) }) },
    // ---- E. Tu turno ----
    E1: { st: con({ j: TURNO_OTRO, lg: LG.slice(0, 2), ca: esp('ESPERA', 'Dia 2. Juega BRAN.', 1) }), toast: 1 },
    E2: { st: con({ j: MI_TURNO, mapa: { mover: 1 }, ca: X({ ar: 'LocAldea' }, ca('TU TURNO', 'Dia 2. Estas en Aldea.', ['Quedarme'], 4)) }) },
    E3: { st: con({ j: MI_TURNO, mapa: { mover: 1 }, ca: esp('MOVIMIENTO', 'Esa loseta no es vecina. Vuelve a poner la figura en Aldea, de donde salio.', 2, 2) }) },
    E4: { st: con({ j: MI_TURNO, ca: esp('VUELVE', 'Tu figura tiene que estar en Aldea, la loseta de la que salio.', 2, 2) }) },
    E5: { st: con({ j: MI_TURNO, mapa: { yo: 1, mover: 1 }, ca: X({ ar: 'LocBosque' }, ca('TU TURNO', 'Pasas por Bosque. Te queda 1 paso: sigue a una vecina o para aqui.', ['Parar aqui'], 4)) }) },
    E6: { st: con({ j: MI_TURNO, mapa: { yo: 2 }, ca: esp('SIN EXPLORAR', 'Dale la vuelta a la placa de esta loseta para ver que hay.', 2) }) },
    E7: { st: con({ j: MI_TURNO, mapa: { yo: 2, descubre: 2, color: '#65e67c', nombre: 'Bosque' },
          ca: X({ ar: 'LocBosque' }, ca('Bosque', 'Has descubierto: Bosque. Bosque. PV 14/18, 42 de oro.', ['Registrar', 'Acampar', 'Fin del turno'])) }) },
    E8: { st: con({ j: MI_TURNO, ca: X({ ar: 'LocAldea' }, ca('Aldea', 'Aldea. PV 14/18, 42 de oro.', ['Hablar: Mara', 'Mercado', 'Dormir (15)', 'Fin del turno'])) }) },
    E10: { st: con({ j: MI_TURNO, mn: 0, mapa: { yo: 2, descubre: 2, color: '#65e67c', nombre: 'Bosque' },
           ca: X({ ar: 'LocBosque' }, ca('Porton atrancado', 'Un portón de roble cerrado por dentro bloquea el paso. La madera cruje. Prueba de FUE, CD 12 (tu -1).', ['Intentarlo', 'Dejarlo'])) }) },
    E11: { st: con({ j: MI_TURNO, mn: 0, mapa: { yo: 2, descubre: 2, color: '#65e67c', nombre: 'Bosque' },
           ca: X({ ar: 'LocBosque' }, ca('Porton atrancado', 'Prueba de FUE, CD 12. Pulsa Tirar para el d20.', ['Tirar'])) }) },
    E12: { st: con({ j: MI_TURNO, mapa: { yo: 2, descubre: 2, color: '#65e67c', nombre: 'Bosque' }, lg: LG.concat([[6, 4, 'Prueba superada']]),
           ca: X({ ar: 'LocBosque' }, ca('EXITO', 'd20 15 -1 = 14 contra 12. El portón cede de golpe y cae hacia dentro. Dentro, entre astillas, brilla algo. +40 XP. +30 de oro. Consigues: Llave.', ['Seguir'], 4)) }), toast: 1 },
    E13: { st: con({ j: MI_TURNO, mapa: { yo: 2, descubre: 2, color: '#65e67c', nombre: 'Bosque' },
           ca: X({ ar: 'LocBosque' }, ca('FRACASO', 'd20 6 -1 = 5 contra 12. La madera aguanta y te destrozas el hombro. -4 PV.', ['Seguir'], 2)) }) },
    E14: { st: con({ j: MI_TURNO, mn: 0, ca: X({ ar: 'npc/Aldeana' }, ca('Mara', 'Los lobos del bosque no dejan dormir a nadie. Si vas hacia alla, ten cuidado.', ['Encargo', 'Rumores', 'Curarme', 'Adios'])) }) },
    E15: { st: con({ j: MI_TURNO, mn: 0, ca: X({ ar: 'npc/Aldeana' }, ca('ENCARGO', 'Limpieza de caminos: Derrota a 3 criaturas que acechan la comarca. Paga 60 XP y 25 de oro, aqui.', ['Aceptar', 'Ahora no'])) }) },
    E16: { st: con({ j: MI_TURNO, mn: 0, ca: X({ ar: 'LocAldea' }, ca('RUMORES', 'Dicen que en las ruinas del norte alguien enciende fuego por las noches.', ['Seguir'])) }) },
    E17: { st: con({ j: MI_TURNO, mn: 0, ca: X({ ar: 'Mercado' }, ca('MERCADO', 'Feria de tres dias. Viene medio valle: hay de todo. Tienes 42 de oro.', ['Comprar', 'Vender', 'Salir'], 5)) }) },
    E18: { st: con({ j: MI_TURNO, mn: 0, ca: X({ ar: 'Mercado', oa: ['ItemPocion', 'ItemEspada', 'ItemCapa', 'ItemEscudo', 'ItemArco', 'ItemElixir', ''] }, ca('COMPRAR', 'Tienes 42 de oro. Elige que comprar.', ['Poción 25', 'Espada 50', 'Capa 70', 'Escudo 60', 'Arco 45', 'Elixir 40', 'Volver'], 5)) }) },
    E19: { st: con({ j: MI_TURNO, ca: X({ ar: 'LocAldea' }, ca('DESCANSO', 'Pagas 15 y duermes de un tiron: +4 PV.', ['Seguir'], 3)) }) },
    E20: { st: con({ j: TURNO_OTRO, ca: esp('FIN DEL TURNO', 'Le toca al siguiente. Cuando vuelva a ser tu turno, te avisa.', 1) }) },
    // ---- F. Combate ----
    F1: { st: con({ j: MI_TURNO, mn: 0, mapa: { yo: 2, descubre: 2, color: '#bdbde6', nombre: 'Cueva', combate: 2 },
          ca: X({ ar: 'MonLobo' }, ca('RONDA 1', 'Has descubierto: Cueva. Lobo Huargo! Bestia veloz que ataca en jauría. 22 PV, CA 13. BRAN (d20 14) acierta: 7 de dano. Lobo Huargo golpea a BRAN: -4 PV. Lobo Huargo 15/22 PV. Tu: 14/18 PV. Que haces?',
             ['Atacar', 'Defenderse', 'Bola de Fuego', 'Beber', 'Cubrir a...', 'Huir'], 2)) }) },
    F4: { st: con({ j: MI_TURNO, mn: 0, mapa: { yo: 2, descubre: 2, color: '#bdbde6', nombre: 'Cueva', combate: 2 },
          ca: esp('Lobo Huargo', 'ELIA (d20 14) acierta: 9 de dano. Turno de BRAN.', 1, 2) }) },
    F5: { st: con({ j: MI_TURNO, mn: 0, mapa: { yo: 2, descubre: 2, color: '#bdbde6', nombre: 'Cueva', combate: 2 },
          ca: X({ ar: 'MonLobo' }, ca('ATAQUE', 'Tira para atacar. Tira el d20 en la bandeja del lector.', ['Tirar aqui'])) }) },
    F6: { st: con({ j: MI_TURNO, mapa: { yo: 2, descubre: 2, color: '#bdbde6', nombre: 'Cueva' }, lg: LG.concat([[6, 4, 'Victoria']]),
          ca: X({ ar: 'LocCueva' }, ca('VICTORIA', 'ELIA (d20 17) acierta: 11 de dano. Lobo Huargo cae. +22 XP, +6 de oro.', ['Seguir'], 4)) }), toast: 1 },
    F7: { st: con({ j: MI_TURNO, mapa: { yo: 2, descubre: 2, color: '#bdbde6', nombre: 'Cueva', combate: 2 },
          ca: X({ ar: 'MonLobo' }, ca('DERROTA', 'Lobo Huargo golpea a ELIA: -6 PV (cae). No queda nadie en pie. Despiertas con 1 PV y sin la mitad del oro. Lobo Huargo sigue aqui.', ['Seguir'], 2)) }) },
    F8: { st: con({ j: MI_TURNO, mn: 0, mapa: { yo: 2, descubre: 2, color: '#bdbde6', nombre: 'Cueva', combate: 2 },
          ca: esp('EN EL SUELO', 'Lobo Huargo golpea a ELIA: -6 PV (cae). Estas en el suelo. Si los demas ganan, te levantas.', 1, 2) }) },
    F9: { st: con({ j: MI_TURNO, mapa: { yo: 2, descubre: 2, color: '#bdbde6', nombre: 'Cueva', combate: 2 },
          ca: X({ ar: 'MonLobo' }, ca('HUIDA', 'ELIA intenta huir (d20 16): lo consigue. Huyes del combate. Sal de esta loseta cuando puedas.', ['Seguir'])) }) },
    // ---- G. Tus menus ----
    G1: { st: con({ ca: X({ oa: ['ItemPocion', 'ItemEspada', ''] }, ca('MOCHILA', 'Elige un objeto.', ['Poción', 'Espada', 'Volver'], 6)) }) },
    G2: { st: con({ ca: X({ ar: 'ItemPocion' }, ca('Pocion', 'Poción. Restaura 15 puntos de vida.', ['Beber', 'Tirar', 'Volver'], 6)) }) },
    G3: { st: con({ ca: X({ ar: 'LocAldea' }, ca('MISIONES', 'Limpieza de caminos: Derrota a 3 criaturas que acechan la comarca. (1/3)', ['Seguir'])) }) },
    G4: { st: con({ h: NUEVO, ca: ca('MEJORAR', 'Tienes 10 puntos. Entre parentesis, lo que cuesta subir cada una.',
          ['FUE 7 (1)', 'DES 12 (1)', 'CON 8 (1)', 'INT 18 (2)', 'SAB 13 (1)', 'CAR 10 (1)', 'SIG 10 (1)', 'PER 13 (1)', 'ARC 17 (2)', 'SUE 9 (1)', 'Volver'], 7) }) },
    G5: { st: con({ ca: ca('AJUSTES', 'Cada opcion cambia al pulsarla. El modo cuenta desde la ronda siguiente.', ['Modo: turnos', 'Dados: auto', 'Placas: virtual', 'Volver']) }) },
    G6: { st: con({ ca: ca('PARTIDA', 'Dia 2, modo por turnos. Empezar otra borra el mapa y los encargos (no los heroes).', ['Nueva partida', 'Terminar', 'Volver']) }) },
    G7: { st: con({ j: TURNO_OTRO, ca: esp('ESPERA', 'Dia 2. Juega BRAN.', 1) }), tab: 'hoja' },
    G8: { st: con({ j: TURNO_OTRO, ca: esp('ESPERA', 'Dia 2. Juega BRAN.', 1) }), tab: 'diario' },
    // ---- H. Modo "a la vez" ----
    H1: { st: con({ j: A_LA_VEZ, mapa: { mover: 1 }, ca: X({ ar: 'LocAldea' }, ca('A MOVER', 'Dia 2. Todos mueven a la vez: lleva tu figura a una vecina o quedate en Aldea, y pulsa Listo.', ['Listo'], 4)) }) },
    H2: { st: con({ j: A_LA_VEZ, ca: esp('ESPERA', 'Listo. Esperando a que muevan los demas.', 1) }) },
    H3: { st: con({ j: { f: 'a la vez: resolver', d: 2 }, ca: esp('HECHO', 'Has terminado lo tuyo. Esperando a los demas.', 1) }) },
    // ---- V. En vertical ----
    V2: { st: null, nom: 'ELIA', tab: 'juego' },
    V3: { st: null, nom: 'ELIA', tab: 'juego' },
    V1: { st: con({ j: MI_TURNO, mapa: { mover: 1 }, ca: X({ ar: 'LocAldea' }, ca('TU TURNO', 'Dia 2. Estas en Aldea.', ['Quedarme'], 4)) }), tab: 'juego' }
  };
  P.A8.st = P.C1.st;
  P.C7.st = P.C1.st;
  P.V2.st = P.C1.st;
  P.V3.st = P.C2.st;
  window.CATALOGO = P;

  var id = (location.search.match(/catalogo=([A-Z0-9]+)/) || [])[1];
  if (!id) { console.log('catalogo: ' + Object.keys(P).join(' ')); return; }
  var p = P[id];
  // Las fotos se sacan sirviendo la carpeta del repo entera: el arte esta en SD/korum/movil
  window.ARTE_BASE = '/SD/korum/movil/';
  document.documentElement.className += ' foto';
  try {
    localStorage.setItem('korum_movil_tab', p.tab || 'mapa');
    localStorage.setItem('korum_fs_no', '1');
  } catch (e) {}

  function Fake() {
    var me = this;
    me.readyState = 0;
    setTimeout(function () { me.readyState = 1; if (me.onopen) me.onopen(); }, 50);
  }
  Fake.prototype.send = function (txt) {
    var o = JSON.parse(txt), me = this;
    if (o.t === 'ping') { setTimeout(function () { if (me.onmessage) me.onmessage({ data: '{"t":"pong"}' }); }, 10); return; }
    if (o.t !== 'hello' || p.st === 'nada') return;
    setTimeout(function () {
      if (p.sel) window.cfgSel = p.sel;
      if (p.aj) window.ajAbierto = true;
      if (p.nom) { window.nombreListo = true; window.nombreHeroe = p.nom; window.nombreH = p.nom; }
      if (p.antes) me.onmessage({ data: JSON.stringify(p.antes) });   // un cartel que el siguiente pisa
      if (p.toast && p.st.lg && p.st.lg.length) {      // primero sin el ultimo suceso: asi sale su aviso
        var antes = JSON.parse(JSON.stringify(p.st));
        antes.lg.pop();
        me.onmessage({ data: JSON.stringify(antes) });
      }
      me.onmessage({ data: JSON.stringify(p.st) });
    }, 50);
  };
  Fake.prototype.close = function () {};
  window.WebSocket = Fake;
})();
