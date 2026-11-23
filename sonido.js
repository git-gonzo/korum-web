/* sonido.js - los sonidos de la interfaz de Korum, hechos con WebAudio (sin ficheros).

   Uso:  Sonido.toca('golpe')
   Nombres: toque, abrir, decide, turno, dado, exito, fracaso, golpe, cura, oro,
            objeto, nivel, combate, figura, conecta, error, bloqueado, agita,
            lanzar, rebote, rebote2, asienta, critico, pifia, tajo
   Son provisionales (sintetizados, pesan 0 KB). Para poner uno definitivo, deja el
   fichero en sonidos/ y apuntalo en FICHEROS (abajo): si esta ahi, se usa el
   fichero; si falla al cargar, se vuelve al sintetizado. Mejor .mp3 o .m4a (AAC):
   Safari en iPhone no lee .ogg. Lista y duracion de cada uno en DOCS/10-ARTE-WEB.md.

   iPhone: el audio arranca callado hasta el primer toque (lo exige Safari); aqui se
   desbloquea solo con el primer toque en cualquier sitio. El boton "silencio" de
   lado del iPhone apaga estos sonidos (WebAudio va por el canal de "timbre").
   Se puede apagar desde la rueda de ajustes (se guarda en el movil). */
(function () {
  var FICHEROS = {
    // golpe: 'sonidos/golpe.mp3',
  };
  var ctx = null, maestro = null, buffers = {}, ruido = null;
  var activo = true;
  try { activo = localStorage.getItem('korum_sonido') !== 'no'; } catch (e) {}

  function abre() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    maestro = ctx.createGain();
    maestro.gain.value = 0.55;
    // un compresor suave: que los golpes no saturen el altavoz del movil
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    maestro.connect(comp); comp.connect(ctx.destination);
    // ruido blanco de 1 s para golpes, dados y rafagas
    ruido = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    var d = ruido.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    for (var n in FICHEROS) carga(n, FICHEROS[n]);
    return ctx;
  }
  function carga(n, url) {
    try {
      fetch(url).then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); })
        .then(function (b) { return new Promise(function (ok, ko) { ctx.decodeAudioData(b, ok, ko); }); })
        .then(function (buf) { buffers[n] = buf; }).catch(function () {});
    } catch (e) {}
  }
  // Safari: el contexto nace suspendido; se despierta dentro de un toque
  function desbloquea() {
    var c = abre();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    var b = c.createBuffer(1, 1, 22050), s = c.createBufferSource();
    s.buffer = b; s.connect(c.destination); try { s.start(0); } catch (e) {}
  }
  ['pointerdown', 'touchend', 'click'].forEach(function (ev) {
    document.addEventListener(ev, desbloquea, { capture: true, passive: true });
  });

  /* ── Piezas ── */
  // Un tono con envolvente: tipo, frecuencia (o [de, a]), cuando, duracion, volumen
  function tono(tipo, f, t, dur, vol, ataque) {
    var o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime + (t || 0);
    o.type = tipo;
    if (f.length) { o.frequency.setValueAtTime(f[0], t0); o.frequency.exponentialRampToValueAtTime(f[1], t0 + dur); }
    else o.frequency.setValueAtTime(f, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t0 + (ataque || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(maestro);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  // Ruido filtrado: golpes, dados, rafagas
  function rafaga(t, dur, vol, filtro, f, q, fFin) {
    var s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(), t0 = ctx.currentTime + (t || 0);
    s.buffer = ruido;
    fl.type = filtro || 'bandpass'; fl.frequency.setValueAtTime(f || 1200, t0); fl.Q.value = q || 1;
    if (fFin) fl.frequency.exponentialRampToValueAtTime(fFin, t0 + dur);
    g.gain.setValueAtTime(vol || 0.4, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(fl); fl.connect(g); g.connect(maestro);
    s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.05);
  }
  // Campana: fundamental mas parciales inarmonicos
  function campana(f, t, dur, vol) {
    tono('sine', f, t, dur, vol);
    tono('sine', f * 2.76, t, dur * 0.5, vol * 0.35);
    tono('sine', f * 5.4, t, dur * 0.25, vol * 0.15);
  }

  var RECETAS = {
    toque: function () { tono('triangle', [1100, 700], 0, 0.045, 0.09); rafaga(0, 0.02, 0.05, 'highpass', 4000, 0.7); },
    // un boton bloqueado: un "tunk" sordo, sin brillo
    bloqueado: function () { tono('sine', [180, 120], 0, 0.12, 0.22); tono('square', 90, 0, 0.05, 0.04); },
    // agitar el dado en la mano (al pulsar Tirar)
    agita: function () { for (var i = 0; i < 4; i++) rafaga(i * 0.045, 0.035, 0.22, 'bandpass', 3200 + Math.random() * 1200, 4); },
    // el dado sale de la mano: un siseo que cae
    lanzar: function () { rafaga(0, 0.32, 0.1, 'bandpass', 4200, 1.2, 1200); },
    // el dado contra la mesa: el primero fuerte y con rodadura, luego toquecitos
    rebote: function () {
      tono('sine', [420, 160], 0, 0.07, 0.35); rafaga(0, 0.05, 0.4, 'bandpass', 2600, 2.5);
      for (var i = 1; i < 6; i++) rafaga(i * 0.05 + Math.random() * 0.02, 0.03, 0.18 - i * 0.025, 'bandpass', 2800 + Math.random() * 1500, 4);
    },
    rebote2: function () { tono('sine', [520, 240], 0, 0.05, 0.16); rafaga(0, 0.03, 0.2, 'bandpass', 3000, 3); },
    // el dado se para sin veredicto
    asienta: function () { campana(880, 0, 0.5, 0.1); },
    // 20 natural: fanfarria con campanas y chispas
    critico: function () {
      [523, 659, 784, 1046, 1318].forEach(function (f, i) { tono('triangle', f, i * 0.07, 0.6, 0.15); });
      campana(2093, 0.32, 1.6, 0.12); campana(2637, 0.42, 1.4, 0.08); rafaga(0.3, 1, 0.08, 'highpass', 6000, 0.5);
    },
    // 1 natural: un acorde que se hunde y un golpe seco
    pifia: function () {
      tono('sawtooth', [200, 70], 0, 0.9, 0.14); tono('sawtooth', [212, 74], 0.02, 0.9, 0.1);
      tono('sine', [110, 40], 0, 0.5, 0.45); rafaga(0, 0.25, 0.3, 'lowpass', 900, 0.7, 120);
    },
    // le das al bicho: un tajo (rafaga que baja) y un golpe carnoso
    tajo: function () { rafaga(0, 0.16, 0.5, 'bandpass', 5000, 1.4, 900); tono('sine', [220, 70], 0.04, 0.2, 0.4); },
    abrir: function () { rafaga(0, 0.35, 0.12, 'bandpass', 600, 0.8, 2400); tono('sine', [440, 660], 0.02, 0.25, 0.08); },
    decide: function () { campana(660, 0, 0.9, 0.16); campana(990, 0.12, 0.9, 0.12); },
    turno: function () { campana(523, 0, 1.2, 0.18); campana(784, 0.14, 1.2, 0.15); campana(1046, 0.28, 1.6, 0.14); },
    dado: function () {
      for (var i = 0; i < 7; i++) rafaga(i * 0.07 + Math.random() * 0.03, 0.05, 0.35 - i * 0.03, 'bandpass', 2500 + Math.random() * 1500, 3);
      tono('square', 180, 0.55, 0.06, 0.08);
    },
    exito: function () { [523, 659, 784, 1046].forEach(function (f, i) { tono('triangle', f, i * 0.09, 0.5, 0.16); }); campana(1568, 0.36, 1.2, 0.08); },
    fracaso: function () { tono('sawtooth', [220, 110], 0, 0.6, 0.12); tono('sawtooth', [233, 116], 0.05, 0.6, 0.08); },
    golpe: function () { rafaga(0, 0.18, 0.7, 'lowpass', 1800, 0.7, 200); tono('sine', [140, 50], 0, 0.25, 0.5); },
    cura: function () { [784, 988, 1175, 1568].forEach(function (f, i) { tono('sine', f, i * 0.07, 0.6, 0.09); }); },
    oro: function () { campana(1975, 0, 0.35, 0.12); campana(2637, 0.07, 0.5, 0.1); },
    objeto: function () { rafaga(0, 0.2, 0.15, 'highpass', 3000, 0.7); campana(1318, 0.05, 0.6, 0.12); },
    nivel: function () {
      [392, 523, 659, 784, 1046].forEach(function (f, i) { tono('triangle', f, i * 0.1, 0.7, 0.15); });
      campana(2093, 0.5, 1.8, 0.1); rafaga(0.45, 1.2, 0.08, 'highpass', 5000, 0.5);
    },
    combate: function () { tono('sine', [90, 40], 0, 0.6, 0.6); rafaga(0, 0.5, 0.4, 'lowpass', 600, 0.7, 80); tono('sawtooth', [180, 175], 0.05, 0.8, 0.06); },
    figura: function () { tono('sine', [520, 1040], 0, 0.18, 0.15); campana(1046, 0.16, 0.9, 0.14); },
    conecta: function () { tono('sine', 660, 0, 0.12, 0.1); tono('sine', 880, 0.1, 0.2, 0.1); },
    error: function () { tono('square', 200, 0, 0.12, 0.08); tono('square', 160, 0.14, 0.2, 0.08); }
  };

  window.Sonido = {
    toca: function (n) {
      if (!activo) return;
      var c = abre();
      if (!c || c.state !== 'running') return;     // aun sin desbloquear: callado
      try {
        if (buffers[n]) {
          var s = c.createBufferSource(); s.buffer = buffers[n]; s.connect(maestro); s.start(0);
        } else if (RECETAS[n]) RECETAS[n]();
      } catch (e) {}
    },
    get activo() { return activo; },
    pon: function (si) {
      activo = !!si;
      try { localStorage.setItem('korum_sonido', si ? 'si' : 'no'); } catch (e) {}
      if (si) { desbloquea(); this.toca('toque'); }
    },
    nombres: Object.keys(RECETAS)
  };
})();
