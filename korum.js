/* korum.js - KORUM, el movil como ficha de personaje (KorumWeb, la web de GitHub Pages).

   Viene de CerebroMovil/web/index.html (ronda 5) con la misma logica y el mismo
   contrato con el cerebro; lo nuevo es como se ve:
   - pon() ya no reescribe la pantalla entera: compara y cambia solo lo que cambia
     (morph). Asi las imagenes no se recargan, las barras se deslizan y las
     animaciones no vuelven a empezar con cada estado que llega. Cada pantalla
     tiene una clave; si cambia la clave, la vieja se funde y entra la nueva.
     Los elementos con data-k distinto se sustituyen (y hacen su animacion de
     entrada): el cartel lleva data-k con su numero, la escena con su imagen.
   - Escena a sangre con la ilustracion del cartel; d20 que rueda cuando el texto
     trae una tirada; vida del bicho en combate; mapa con las caras de las losetas.
   - Efectos (capa #fx) y sonidos (sonido.js) cuando bajan o suben la vida o el oro,
     subes de nivel o empieza tu turno.

   EL CONTRATO (no romperlo, ver DOCS/10-ARTE-WEB.md):
   - Todo pasa por conecta() y manda(), al final de este fichero. conecta() hace
     new WebSocket(...) cada vez: maqueta.js, catalogo.js y el transporte BLE
     (ble.js, otra sesion) cambian window.WebSocket por uno suyo antes.
   - El JSON es el de webEstado() (CerebroMovil/MovilWeb.h). Lo que se deduce del
     texto (tirada, vida del bicho) es provisional: ver "Datos que pide la pagina".
   - Sin conexion y con window.bleNecesitaToque, un boton grande llama a
     window.bleConectar(). Si bleNecesitaToque cambia, llamar a pinta() o lanzar
     el evento 'korum-ble' en window. */

var app = document.getElementById('app');
var fxCapa = document.getElementById('fx');
var ws = null, st = null, vivo = false;
var tk = '';
try { tk = localStorage.getItem('korum_movil_tk') || ''; } catch (e) {}
var tab = 'juego';
try { tab = localStorage.getItem('korum_movil_tab') || 'juego'; } catch (e) {}
var vistoLog = -1;          // ultimo suceso del diario que ya se ha avisado
var mapaNuevo = false;
var ultimoLugar = '';       // el arte del ultimo sitio (de fondo cuando hablas con un PNJ)

// Colores de cada tipo de suceso (MesaSuceso: nada, info, dano, cura, xp, oro, objeto, nivel)
var COL = ['#d9ae45', '#d9ae45', '#e0654f', '#7cb86a', '#a08fe0', '#e8b84a', '#55a9d0', '#df94e6'];

function esc(s) {
  return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) {
    return c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&amp;';
  });
}
function $(id) { return scrEl ? scrEl.querySelector('#' + id) : null; }
function $$(sel) { return scrEl ? [].slice.call(scrEl.querySelectorAll(sel)) : []; }

/* ── Iconos (trazo, del color del texto) ── */
function svg(d, vb) {
  return '<svg class="ic" viewBox="' + (vb || '0 0 24 24') + '" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
}
var ICO = {
  punto: svg('<circle cx="12" cy="12" r="3.5" fill="currentColor"/>'),
  dano: svg('<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z" fill="currentColor" fill-opacity=".35"/>'),
  espada: svg('<path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/>'),
  escudo: svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  cura: svg('<path d="M12 21s-7.5-4.6-9.5-9.4C1.2 8.4 3.3 4.5 7 4.5c2.1 0 3.6 1.2 5 3 1.4-1.8 2.9-3 5-3 3.7 0 5.8 3.9 4.5 7.1C19.5 16.4 12 21 12 21z"/>'),
  xp: svg('<path d="M12 2l2.9 6.9L22 9.6l-5.4 4.8L18.2 22 12 18.1 5.8 22l1.6-7.6L2 9.6l7.1-.7z"/>'),
  oro: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 9.5c0-1 1.3-1.8 3-1.8s3 .8 3 1.8-1.3 1.6-3 1.9-3 .9-3 2 1.3 1.9 3 1.9 3-.8 3-1.8"/>'),
  gema: svg('<path d="M6 3h12l4 6-10 13L2 9z M2 9h20 M12 22 8 9l4-6 4 6z"/>'),
  corona: svg('<path d="M2 18h20M3 18 2 6l6 5 4-7 4 7 6-5-1 12"/>'),
  huir: svg('<path d="M13 4a2 2 0 1 0 0 .1M7 21l3-6 3 2v5M5 12l3-3 4 1 3 3 3 1M10 15l1-5"/>'),
  pocion: svg('<path d="M9 2h6M10 2v6L5 17a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 17l-5-9V2M7 14h10"/>'),
  cubrir: svg('<path d="M9 21s6-3 6-8V7l-6-2-6 2v6c0 5 6 8 6 8zM16 5l5 2v5c0 2-.8 3.6-2 5"/>'),
  chispa: svg('<path d="M12 2v6M12 16v6M2 12h6M16 12h6M5 5l3.5 3.5M15.5 15.5 19 19M19 5l-3.5 3.5M8.5 15.5 5 19"/>'),
  dado: svg('<path d="M12 2 21 7v10l-9 5-9-5V7z M12 2 7.5 14.5h9z M3 7l4.5 7.5M21 7l-4.5 7.5M12 22v-7.5"/>'),
  enlace: '<svg class="eslabon" viewBox="0 0 80 80" fill="none" stroke="#e0654f" stroke-width="4" stroke-linecap="round">' +
    '<path d="M34 46l-8 8a9 9 0 0 1-13-13l8-8M46 34l8-8a9 9 0 0 0-13-13l-8 8"/><path d="M52 52l8 8M58 46h8M46 58v8M28 28l-8-8M22 34h-8M34 22v-8" stroke-width="3" opacity=".7"/></svg>'
};
var ICO_SUCESO = [ICO.punto, ICO.punto, ICO.dano, ICO.cura, ICO.xp, ICO.oro, ICO.gema, ICO.corona];

/* ── Pantalla completa (ver CerebroKorum: Android si, iOS solo instalandola) ── */
var esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
var instalada = window.navigator.standalone === true ||
  (window.matchMedia && (window.matchMedia('(display-mode: fullscreen)').matches ||
                         window.matchMedia('(display-mode: standalone)').matches));
function puedeFS() { return !!document.fullscreenEnabled && !instalada; }
function enFS() { return !!document.fullscreenElement; }
var pidiendoFS = false;
function entrarFS() {
  var e = document.documentElement;
  if (!e.requestFullscreen) { toast('Este navegador no tiene pantalla completa', 1); return; }
  if (pidiendoFS) return;
  pidiendoFS = true;
  setTimeout(function () { pidiendoFS = false; }, 1500);
  var p;
  try { p = e.requestFullscreen({ navigationUI: 'hide' }); }
  catch (x) { pidiendoFS = false; toast('Pantalla completa: ' + (x && (x.name || x.message)), 1); return; }
  if (p && p.then) p.then(function () {
    pidiendoFS = false;
    try {
      if (screen.orientation && screen.orientation.lock)
        screen.orientation.lock('landscape').catch(function () { toast('No deja girarla sola: gira el movil', 1); });
    } catch (x) {}
  }).catch(function (x) {
    pidiendoFS = false;
    toast('Pantalla completa: ' + (x && (x.message || x.name) || 'no'), 1);
  });
  else pidiendoFS = false;
}
var autoFS = true;
try { autoFS = localStorage.getItem('korum_fs_no') !== '1'; } catch (e) {}
function toggleFS() {
  if (enFS()) {
    autoFS = false;
    try { localStorage.setItem('korum_fs_no', '1'); } catch (e) {}
    document.exitFullscreen();
    return;
  }
  autoFS = true;
  try { localStorage.removeItem('korum_fs_no'); } catch (e) {}
  entrarFS();
}
// El primer toque en cualquier sitio pone la pantalla completa (Android). Menos en
// "Conectar con la mesa": ese toque es para que el movil deje elegir el Bluetooth
var avisadoSinFS = false;
function toqueFS(ev) {
  if (!autoFS || enFS() || instalada) return;
  if (ev.target && ev.target.closest && ev.target.closest('#fs,#bleConectar,.maq')) return;
  if (!document.fullscreenEnabled) {
    if (!avisadoSinFS && !esIOS) { avisadoSinFS = true; toast('Este navegador no deja la pantalla completa: abrela en Chrome', 1); }
    return;
  }
  entrarFS();
}
document.addEventListener('pointerup', toqueFS, true);
document.addEventListener('click', toqueFS, true);
document.addEventListener('fullscreenchange', function () {
  if (!enFS()) { try { screen.orientation.unlock(); } catch (x) {} }
  pinta();
});

// Dos columnas cuando el movil esta girado (y la pantalla es ancha)
var mqHoriz = window.matchMedia ? window.matchMedia('(orientation: landscape) and (min-width: 560px)') : null;
function horizontal() { return !!(mqHoriz && mqHoriz.matches); }
function alGirar() { if (typeof pinta === 'function') pinta(); }
window.addEventListener('resize', alGirar);
window.addEventListener('orientationchange', function () { setTimeout(alGirar, 150); });
if (mqHoriz) {
  if (mqHoriz.addEventListener) mqHoriz.addEventListener('change', alGirar);
  else if (mqHoriz.addListener) mqHoriz.addListener(alGirar);
}

/* ── El arte: ruta relativa art/<nombre>.webp (la web vive en .../korum-web/).
   Una imagen que falla no se vuelve a pedir (y no se pinta mas) ── */
var ARTE = window.ARTE_BASE || 'art/';
var arteMal = {};
window.arteFalla = function (img, n) { arteMal[n] = 1; if (img && img.parentNode) img.parentNode.removeChild(img); };
function arte(n, cls, extra) {
  if (!n || arteMal[n]) return '';
  return '<img class="' + (cls || '') + '" src="' + ARTE + esc(n) + '.webp" alt="" draggable="false" decoding="async" ' +
    'onerror="arteFalla(this,\'' + esc(n) + '\')"' + (extra || '') + '>';
}
function sinTilde(t) {
  t = String(t || '').toLowerCase();
  return t.normalize ? t.normalize('NFD').replace(/[̀-ͯ]/g, '') : t;
}
// La cara de cada loseta (art/loseta/) a partir del nombre que manda el mapa
// (provisional: ver "Datos que pide la pagina")
var LOSETA = { aldea: 'aldea', village: 'aldea', bosque: 'bosque', forest: 'bosque', mazmorra: 'mazmorra', dungeon: 'mazmorra',
  ruinas: 'ruinas', ruins: 'ruinas', cueva: 'cueva', cave: 'cueva', altar: 'altar', taberna: 'taberna', tavern: 'taberna',
  inn: 'taberna', cripta: 'cripta', crypt: 'cripta', tesoro: 'tesoro', treasure: 'tesoro', emboscada: 'emboscada', ambush: 'emboscada' };
function losetaDe(nombre) { return LOSETA[sinTilde(nombre).trim()] || ''; }
function lugarDe(nombre) { var l = losetaDe(nombre); return l ? 'Loc' + l.charAt(0).toUpperCase() + l.slice(1) : ''; }
// La cara recortada de una lamina de raza o clase (art/cara/, tools/arte_web.py); si no esta, la lamina
function caraDe(a) { return a && /^(Raza|Clase)/.test(a) && !arteMal['cara/' + a] ? 'cara/' + a : a; }
function esLucha(a) { return !!a && (a.indexOf('Mon') === 0 || a === 'Combate'); }

/* ── Ajustes (la rueda de arriba): sonido y configurar la mesa ── */
var ajAbierto = false;
function topHtml() {
  var yo = st && st.h ? '<span class="yo"><span class="color" style="background:' + st.h.col +
    '"></span>tu color</span>' : '';
  var pills = st && st.v && !st.cfg && !creando() && horizontal() ?
    '<span class="pills">' + menusHtml() + '</span>' : '';
  var son = window.Sonido && Sonido.activo;
  return '<div class="top' + (vivo ? '' : ' caido') + '">' +
    '<span class="dot ' + (vivo ? '' : 'off') + '"></span>' +
    '<span>' + (!vivo ? 'sin conexión con la mesa' :
                st && st.v && horizontal() ? juegoTxt() : 'conectado a la mesa') + '</span>' + pills + yo +
    '<span class="dcha">' +
    (puedeFS() ? '<button class="fs" id="fs" aria-label="Pantalla completa">' + (enFS() ? '&#10005;' : '&#9974;') + '</button>' : '') +
    '<button class="fs aj' + (ajAbierto ? ' on' : '') + '" id="ajustes" aria-label="Ajustes">&#9881;</button></span>' +
    (ajAbierto ? '<div class="ajmenu">' +
      '<button id="sonidoAj" class="sec interruptor" role="switch" aria-checked="' + (son ? 'true' : 'false') + '">' +
        '<span>Sonido</span><span class="pista-i"><i></i></span></button>' +
      '<button id="cfgEntrar" class="sec"' + bAt('cfgEntrar') + '>Configurar la mesa (losetas)</button>' +
      '<div class="nota">Para quien monta la mesa: qué losetas hay y dónde está cada una.</div>' +
      // la pagina no hace scroll (es una app): en Bluefy no hay "tirar para recargar"
      '<button id="recargar" class="sec">Recargar la página</button></div>' : '') +
    '</div>';
}

var ayudaAbierta = false;
function ayudaHtml() {
  if (instalada || enFS()) return '';
  if (!ayudaAbierta)
    return '<div class="ayuda"><button id="ayuda" class="mas">¿Cómo se pone a pantalla completa?</button></div>';
  // Bluefy (la web por Bluetooth): iOS no deja pantalla completa a un navegador que
  // no sea Safari; llegara con la app de Korum
  var pasos = esIOS && navigator.bluetooth
    ? '<b>iPhone (Bluefy)</b><p style="margin:6px 0">La pantalla completa de verdad llegará con la app de Korum. ' +
      'Mientras, gira el móvil para jugar en horizontal: se ve más grande.</p>'
    : esIOS
    ? '<b>iPhone / iPad</b><ol>' +
      '<li>En el navegador, busca <b>Añadir a pantalla de inicio</b> (en Bluefy, en su menú).</li>' +
      '<li>Ábrelo desde el icono nuevo y gira el móvil: ahí ya no hay barras.</li></ol>'
    : '<b>Android</b><ol>' +
      '<li>Toca la pantalla en cualquier sitio: se pone a pantalla completa y en horizontal.</li>' +
      '<li>Si no pasa, no estás en Chrome. Abre <b>Chrome</b> y entra en <b>' + esc(location.host) + '</b>.</li>' +
      '<li>Para salir de la pantalla completa, la <b>X</b> de arriba.</li></ol>';
  return '<div class="ayuda abierta">' + pasos + '<button id="ayuda" class="mas">Cerrar</button></div>';
}

/* ── Pintar: morph en vez de innerHTML ── */
var ultimoHtml = '', scrClave = '', scrEl = null;
function mismoNodo(a, b) {
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType !== 1) return true;
  return a.nodeName === b.nodeName && a.getAttribute('data-k') === b.getAttribute('data-k');
}
function morphAttrs(v, n) {
  var i, a;
  for (i = v.attributes.length - 1; i >= 0; i--) {
    a = v.attributes[i].name;
    if (!n.hasAttribute(a)) v.removeAttribute(a);
  }
  for (i = 0; i < n.attributes.length; i++) {
    a = n.attributes[i];
    if (v.getAttribute(a.name) !== a.value) v.setAttribute(a.name, a.value);
  }
  if (v.nodeName === 'INPUT' && v !== document.activeElement && v.value !== (n.getAttribute('value') || ''))
    v.value = n.getAttribute('value') || '';
}
// Lo que mete el JS dentro de la pantalla (el dado 3D, las ondas) lleva data-fx: el
// morph no lo cuenta ni lo quita
function esFx(n) { return n.nodeType === 1 && n.hasAttribute('data-fx'); }
function morphHijos(viejo, nuevo) {
  var ns = [].slice.call(nuevo.childNodes), vs = [].filter.call(viejo.childNodes, function (x) { return !esFx(x); });
  for (var i = 0; i < ns.length; i++) {
    var n = ns[i], v = vs[i];
    if (!v) viejo.appendChild(n);
    else if (!mismoNodo(v, n)) viejo.replaceChild(n, v);
    else if (v.nodeType === 1) { morphAttrs(v, n); morphHijos(v, n); }
    else if (v.nodeValue !== n.nodeValue) v.nodeValue = n.nodeValue;
  }
  for (var j = ns.length; j < vs.length; j++) viejo.removeChild(vs[j]);
}
function pon(clave, html) {
  if (clave === scrClave && scrEl) {
    if (html === ultimoHtml) return;
    var tpl = document.createElement('template');
    tpl.innerHTML = html;
    morphHijos(scrEl, tpl.content);
  } else {
    var viejo = scrEl;
    scrEl = document.createElement('div');
    scrEl.className = 'scr';
    scrEl.setAttribute('data-scr', clave);
    scrEl.innerHTML = html;
    app.appendChild(scrEl);
    scrClave = clave;
    if (viejo) {
      viejo.classList.add('sale');
      [].forEach.call(viejo.querySelectorAll('[id]'), function (e) { e.removeAttribute('id'); });
      setTimeout(function () { if (viejo.parentNode) viejo.parentNode.removeChild(viejo); }, 320);
    }
  }
  ultimoHtml = html;
  ata();
  arrancaDados();
}

/* ── Los botones: estados y respuesta al toque ───────────────────────────────
   Una sola regla en toda la pagina (DOCS/10-ARTE-WEB.md, "Estados de los botones"):
   - oro macizo (sin clase): la accion principal de una pantalla sin cartel
     (Vincular, Conectar, Seguir). Una por pantalla.
   - .op: una respuesta al cartel. Todas iguales, sean una o seis: panel oscuro con
     filo de oro. En el juego nunca hay oro macizo hasta que tocas.
   - .sec / .ghost: cosas de menos peso (menus, ajustes, cancelar).
   - pulsado (.pulsa): se hunde y sale una onda desde el dedo, con sonido, en el
     mismo pointerdown, sin esperar a la mesa (el Bluetooth tarda 45-100 ms).
   - enviando (aria-busy="true"): lo que has tocado, en oro con un check y una
     barrita que corre mientras la mesa contesta. Las demas opciones, .apagada.
   - bloqueado (aria-disabled="true"): gris, borde a rayas y candado. Tocarlo lo
     sacude y dice por que (data-por).
   Ni los "enviando" ni los bloqueados usan disabled: un boton disabled no recibe
   el toque y no podria explicar nada. El clic se para aqui abajo. */
var pend = null;             // {id, t}: el boton que espera a la mesa
function espera(id, ms, callado) {
  var p = pend = { id: id, t: Date.now() };
  setTimeout(function () {
    if (pend !== p) return;
    pend = null;
    if (!callado && $(id)) { toast('La mesa no ha contestado. Vuelve a tocar.', 2); suena('error'); }
    pinta();
  }, ms || 5000);
  pinta();
}
function bAt(id) { return pend && pend.id === id ? ' aria-busy="true"' : ''; }
function bloq(por) { return ' aria-disabled="true"' + (por ? ' data-por="' + esc(por) + '"' : ''); }
var reducido = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
function fotoModo() { return document.documentElement.className.indexOf('foto') >= 0; }
function quieto() { return reducido || fotoModo(); }

var PULSABLE = 'button,[data-pulsa]';
function noVale(b) {
  return b.getAttribute('aria-disabled') === 'true' || b.getAttribute('aria-busy') === 'true' || b.classList.contains('apagada');
}
function sacude(el, fuerte) {
  if (!el || !el.animate || quieto()) return;
  var d = fuerte ? 8 : 5;
  el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(' + -d + 'px) rotate(' + (fuerte ? -1.2 : 0) + 'deg)' },
    { transform: 'translateX(' + d * 0.8 + 'px) rotate(' + (fuerte ? 1 : 0) + 'deg)' }, { transform: 'translateX(' + -d * 0.5 + 'px)' },
    { transform: 'translateX(' + d * 0.25 + 'px)' }, { transform: 'none' }], { duration: fuerte ? 460 : 340, easing: 'ease-out' });
}
// La onda desde el dedo: va en la capa #fx (encima del boton, recortada a su forma),
// asi sigue aunque el cerebro conteste y el boton se cambie por otro
function onda(el, x, y) {
  if (quieto()) return;
  var r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;
  var caja = document.createElement('div');
  caja.className = 'onda-caja';
  caja.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;border-radius:' +
    (el instanceof HTMLElement ? getComputedStyle(el).borderRadius : '50%');
  var d = Math.max(r.width, r.height) * 2.3;
  caja.innerHTML = '<i style="left:' + (x - r.left) + 'px;top:' + (y - r.top) + 'px;width:' + d + 'px;height:' + d + 'px"></i>';
  fxCapa.appendChild(caja);
  setTimeout(function () { if (caja.parentNode) caja.parentNode.removeChild(caja); }, 700);
}
var pulsado = null;
function suelta() {
  if (!pulsado) return;
  var b = pulsado; pulsado = null;
  setTimeout(function () { b.classList.remove('pulsa'); }, 90);
}
document.addEventListener('pointerdown', function (ev) {
  var b = ev.target && ev.target.closest && ev.target.closest(PULSABLE);
  if (!b || b.closest('.maq')) return;
  if (noVale(b)) {
    if (b.getAttribute('aria-disabled') === 'true') {
      sacude(b); suena('bloqueado'); zumba(20, 'bloqueado');
      var por = b.getAttribute('data-por');
      if (por) toast(por, 1);
    }
    return;
  }
  suelta();
  pulsado = b;
  b.classList.add('pulsa');
  onda(b, ev.clientX, ev.clientY);
  suena(b.getAttribute('data-son') || 'toque');
  zumba(8, 'toque');
}, true);
['pointerup', 'pointercancel'].forEach(function (e) { document.addEventListener(e, suelta, true); });
// iOS solo pinta :active si hay algun touchstart escuchando
document.addEventListener('touchstart', function () {}, { passive: true });
document.addEventListener('click', function (ev) {
  var b = ev.target && ev.target.closest && ev.target.closest(PULSABLE);
  if (b && !b.closest('.maq') && noVale(b)) { ev.preventDefault(); ev.stopImmediatePropagation(); }
  // tocar fuera de los ajustes los cierra
  if (ajAbierto && !(ev.target.closest && ev.target.closest('.ajmenu,#ajustes'))) { ajAbierto = false; pinta(); }
}, true);

/* Preguntar antes de algo que no tiene vuelta atras. No es confirm(): en Bluefy un
   confirm() puede no salir (y devolver "no"), y asi ademas se ve como el resto */
function pide(tit, txt, si, fn) {
  var d = document.createElement('div');
  d.className = 'pide';
  d.innerHTML = '<div class="pide-fondo"></div><div class="pide-caja" role="dialog"><h3>' + esc(tit) + '</h3><p>' + esc(txt) + '</p>' +
    '<div class="fila"><button class="ghost" data-no>Cancelar</button><button class="sec peligro" data-si>' + esc(si) + '</button></div></div>';
  document.body.appendChild(d);
  suena('abrir');
  function cierra() { d.classList.add('fuera'); setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 260); }
  d.querySelector('[data-no]').onclick = cierra;
  d.querySelector('.pide-fondo').onclick = cierra;
  d.querySelector('[data-si]').onclick = function () { cierra(); fn(); };
}

/* Numeros que cuentan hasta el valor nuevo (vida, oro) */
function cuentaNum(el, de, a, ms) {
  if (!el || de === a || quieto()) return;
  var t0 = 0, fmt = el.getAttribute('data-fmt') || '';
  function paso(t) {
    if (!t0) t0 = t;
    var u = Math.min(1, (t - t0) / ms), v = Math.round(de + (a - de) * (1 - Math.pow(1 - u, 3)));
    el.textContent = fmt ? fmt.replace('#', v) : v;
    if (u < 1 && el.isConnected) requestAnimationFrame(paso);
  }
  requestAnimationFrame(paso);
}

/* ── Sucesos: la cinta de arriba ── */
function toast(txt, tipo) {
  var t = document.getElementById('toast');
  var c = COL[tipo] || COL[1];
  t.innerHTML = '<i>' + (ICO_SUCESO[tipo] || ICO.punto) + '</i><span>' + esc(txt) + '</span>';
  t.style.setProperty('--tc', c);
  t.className = 'toast';
  clearTimeout(toast.h);
  toast.h = setTimeout(function () { t.className = 'toast fuera'; }, 2800);
}

// Vibrar: Android si; iPhone no tiene navigator.vibrate. La app nativa (DOCS/09)
// puede poner window.korumHaptic(tipo) y aqui se usa
function zumba(ms, tipo) {
  try { if (window.korumHaptic) { window.korumHaptic(tipo || 'toque'); return; } } catch (e) {}
  // Chrome se queja en la consola si se vibra antes del primer toque
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
}
function suena(n, ms) {
  if (!window.Sonido) return;
  if (ms) setTimeout(function () { Sonido.toca(n); }, ms); else Sonido.toca(n);
}

/* ── Efectos sobre todo: velo, numeros que flotan, cinta, estallido ── */
function fxPon(html, ms) {
  var d = document.createElement('div');
  d.innerHTML = html;
  var e = d.firstChild;
  fxCapa.appendChild(e);
  setTimeout(function () { if (e.parentNode) e.parentNode.removeChild(e); }, ms || 2000);
  return e;
}
function fxSobre(sel, txt, color) {
  var el = scrEl && scrEl.querySelector(sel), r = el ? el.getBoundingClientRect() : null;
  var x = r ? r.left + r.width / 2 : innerWidth / 2, y = r ? r.top : innerHeight / 3;
  fxPon('<div class="flota" style="left:' + x + 'px;top:' + (y - 6) + 'px;color:' + color + '">' + txt + '</div>', 1400);
}
function q(sel) { return scrEl ? scrEl.querySelector(sel) : null; }
function destella(el, color, ms) {
  if (!el || !el.animate || quieto()) return;
  el.animate([{ boxShadow: '0 0 0 2px ' + color + ', 0 0 26px ' + color }, { boxShadow: '0 0 0 0 transparent, 0 0 0 transparent' }],
    { duration: ms || 700, easing: 'ease-out' });
}
function fx(tipo, n, de) {
  // primero se suelta lo retenido, para que la barra baje justo ahora
  if (tipo === 'golpe' || tipo === 'cura') { vidaRetenida = null; pinta(); }
  if (tipo === 'oro') { oroVisto = null; pinta(); }
  if (fotoModo()) return;
  var h = st && st.h;
  if (tipo === 'golpe') {
    fxPon('<div class="velo golpe"></div>', 800);
    app.classList.remove('tiembla'); void app.offsetWidth; app.classList.add('tiembla');
    setTimeout(function () { app.classList.remove('tiembla'); }, 450);
    var bar = q('.vida .bar');
    sacude(bar, true);
    destella(bar, 'rgba(255,90,60,.9)', 650);
    if (bar && bar.animate) bar.animate([{ filter: 'brightness(2.2) saturate(1.4)' }, { filter: 'brightness(1)' }], { duration: 420 });
    destella(q('.med'), 'rgba(255,70,50,.85)', 800);
    if (h) cuentaNum(q('.n-hp'), de, h.hp, 700);
    fxSobre('.vida .bar', '&minus;' + n, '#ff8a70');
    suena('golpe'); zumba(90, 'golpe');
  } else if (tipo === 'cura') {
    fxPon('<div class="velo cura"></div>', 800);
    destella(q('.vida .bar'), 'rgba(140,230,120,.85)', 900);
    if (h) cuentaNum(q('.n-hp'), de, h.hp, 800);
    fxSobre('.vida .bar', '+' + n, '#a9e094');
    suena('cura');
  } else if (tipo === 'oro') {
    if (h) cuentaNum(q('.n-oro'), de, h.o, 700);
    var oro = q('.heroe .oro img');
    if (oro && oro.animate) oro.animate([{ transform: 'scale(1.5) rotate(-20deg)' }, { transform: 'none' }], { duration: 500, easing: 'cubic-bezier(.3,1.6,.5,1)' });
    fxSobre('.heroe .oro', (n > 0 ? '+' : '&minus;') + Math.abs(n) + ' ' + arte('ItemMoneda', ''), n > 0 ? '#f6dc8c' : '#b8a78a');
    if (n > 0) { fxPon('<div class="velo oro"></div>', 800); suena('oro'); }
  } else if (tipo === 'nivel') {
    fxPon('<div class="estallido"></div>', 1900);
    fxPon('<div class="cinta"><span>NIVEL ' + n + '<small>' + (st.h && st.h.p ? 'tienes puntos para mejorar' : 'tu héroe es más fuerte') + '</small></span></div>', 2000);
    suena('nivel'); zumba([40, 60, 40, 60, 120], 'nivel');
  } else if (tipo === 'turno') {
    fxPon('<div class="cinta"><span>TU TURNO<small>' + (st.j && st.j.d ? 'día ' + st.j.d : '') + '</small></span></div>', 2000);
    suena('turno'); zumba([60, 60, 60], 'turno');
  }
}

/* ── Sin figura ─────────────────────────────────────────────────────────── */
var FIGURA = '<svg class="fig" viewBox="0 0 64 64" fill="none" stroke="#d9ae45" stroke-width="3" stroke-linecap="round">' +
  '<circle cx="32" cy="17" r="8"/><path d="M20 52 C20 36 24 29 32 29 C40 29 44 36 44 52"/>' +
  '<path d="M14 56 H50"/></svg>';
var RUNAS = (function () {
  var s = '<svg class="runas" viewBox="0 0 168 168" fill="none" stroke="#d9ae45">' +
    '<circle cx="84" cy="84" r="81" stroke-width="1" opacity=".5"/><circle cx="84" cy="84" r="74" stroke-width="1" opacity=".35"/>';
  for (var i = 0; i < 36; i++) {
    var a = i * Math.PI / 18, l = i % 3 ? 3 : 7;
    s += '<path d="M' + (84 + 77.5 * Math.cos(a)).toFixed(1) + ' ' + (84 + 77.5 * Math.sin(a)).toFixed(1) + 'L' +
      (84 + (77.5 - l) * Math.cos(a)).toFixed(1) + ' ' + (84 + (77.5 - l) * Math.sin(a)).toFixed(1) + '" stroke-width="1.4"/>';
  }
  for (var k = 0; k < 8; k++) {
    var b = k * Math.PI / 4 + Math.PI / 8, x = 84 + 77.5 * Math.cos(b), y = 84 + 77.5 * Math.sin(b);
    s += '<path d="M' + x.toFixed(1) + ' ' + (y - 4).toFixed(1) + 'l3 4-3 4-3-4z" fill="#d9ae45" stroke="none"/>';
  }
  return s + '</svg>';
})();
function rueda(peq) { return '<div class="rueda' + (peq ? ' peq' : '') + '"></div>'; }
var CRUZ = '<svg class="cruz" viewBox="0 0 80 80"><circle cx="40" cy="40" r="36"/>' +
  '<path d="M27 27 L53 53"/><path d="M53 27 L27 53"/></svg>';
function portada() { return '<div class="portada">' + arte('MenuFondo', '') + '<div class="niebla"></div>' + motas('portada') + '</div>'; }

function pintaSinFigura() {
  var c, clave, inicio = false;
  if (st.bu) {
    clave = 'busca';
    c = '<div class="espera">' + RUNAS + rueda() + FIGURA + '</div>' +
      '<div class="estado">Escaneando</div>' +
      '<h1>Pon tu figura en el mapa</h1>' +
      '<div class="sub">En cualquier loseta. Si ya estaba encima, levántala y vuelve a ponerla.</div>' +
      '<div class="cuenta">' + st.bu + '<small>SEGUNDOS</small></div>' +
      '<button id="cancelar" class="ghost" style="max-width:240px"' + bAt('cancelar') + '>Cancelar</button>';
  } else if (st.ot) {
    clave = 'otro';
    c = '<div class="espera">' + RUNAS + rueda() + FIGURA + '</div>' +
      '<div class="estado">Esperando</div>' +
      '<h1>Un momento</h1>' +
      '<div class="sub">Otro jugador está vinculando su figura. Luego te toca.</div>';
  } else if (st.msg) {
    clave = 'nollega';
    c = CRUZ + '<h1 class="mal">Figura no encontrada</h1>' +
      '<div class="sub">' + esc(st.msg) + '</div>' +
      '<button id="vincular" class="grande" data-son="abrir"' + bAt('vincular') + '>Volver a intentarlo</button>';
  } else {
    clave = 'inicio';
    c = '<div class="logo">KORUM</div>' +
      '<div class="lema">Este móvil es tu ficha. Aquí verás a tu héroe, lo que pasa en cada loseta y tus opciones.</div>' +
      '<button id="vincular" class="grande" data-son="abrir"' + bAt('vincular') + '>Vincular mi figura</button>';
    inicio = true;
  }
  pon('sinfig-' + clave, portada() + topHtml() + '<div class="mid">' + c + '</div>' + (inicio ? ayudaHtml() : '') + caidaHtml());
}

/* La figura ha llegado: el aro se pone verde y se cierra, la figura se cambia por
   un check, el aro late y a los 2,8 s pasa a lo siguiente */
var EXITO_MS = 2800, exitoHasta = 0;
var CHECK = '<svg class="check" viewBox="0 0 64 64" fill="none" stroke="#7cb86a" stroke-width="6" ' +
  'stroke-linecap="round" stroke-linejoin="round"><path d="M17 33 L28 44 L48 22"/></svg>';
function pintaExito() {
  var h = st && st.h;
  pon('exito', portada() + topHtml() + '<div class="mid"><div class="espera ok">' +
    '<div class="brillo"></div><div class="late"></div>' +
    '<svg class="aro" viewBox="0 0 136 136"><circle cx="68" cy="68" r="64.5"/></svg>' +
    FIGURA + CHECK + '</div>' +
    '<div class="estado ok">Detectada</div>' +
    '<h1>Figura encontrada</h1>' +
    '<div class="sub">' + (h ? esc(h.n) + ' vuelve a la mesa.' : 'Ahora vas a crear su héroe.') + '</div></div>');
}

/* ── Sin conexion: un velo encima de la pantalla que haya, con el boton del
   Bluetooth cuando hace falta un toque para elegir la mesa ── */
var caidoDesde = 0;
function bleToque() { return !!(window.bleNecesitaToque && typeof window.bleConectar === 'function'); }
function bleBoton() {
  return '<button id="bleConectar" class="grande" data-son="abrir"' + bAt('bleConectar') + '>' + (pend && pend.id === 'bleConectar' ? 'Buscando la mesa…' : 'Conectar con la mesa') + '</button>' +
    '<div class="sub" style="font-size:14px;margin-top:4px">El móvil abrirá una lista: elige la mesa de Korum.</div>';
}
function caidaHtml() {
  if (vivo || !st) return '';
  if (!bleToque() && Date.now() - caidoDesde < 2500) return '';
  return '<div class="caida">' + ICO.enlace +
    '<h1>Sin conexión con la mesa</h1>' +
    (bleToque() ? bleBoton() : rueda(true) + '<div class="sub">Volviendo a conectar…<br>Acércate a la mesa si estás lejos.</div>') +
    '</div>';
}

/* ── Con figura ─────────────────────────────────────────────────────────── */
/* Mientras el dado rueda, la vida y el oro se quedan como estaban: el golpe se ve
   cuando el dado cae, no antes (efectos() los suelta a su hora) */
var vidaRetenida = null, oroVisto = null, bichoRetenido = null;
function vidaVista(h) { return vidaRetenida != null ? vidaRetenida : h.hp; }
function peligro() { var h = st && st.h; return !!(h && h.hm && vidaVista(h) / h.hm <= 0.3 && vidaVista(h) > 0); }
function heroeHtml(h) {
  if (!h) return '<div class="heroe"><div class="hinfo" style="padding:6px"><div class="nombre">Figura sin héroe</div>' +
    '<div class="oficio">Elige su raza y su clase</div></div></div>';
  var hp = vidaVista(h), o = oroVisto != null ? oroVisto : h.o;
  var pct = h.hm ? Math.max(0, Math.min(100, 100 * hp / h.hm)) : 0;
  var xpPct = h.xn > h.xs ? Math.max(0, Math.min(100, 100 * (h.xp - h.xs) / (h.xn - h.xs))) : 100;
  return '<div class="heroe" style="--col:' + esc(h.col) + '">' +
    '<div class="med"><div class="cara">' + arte(caraDe(h.ar), '') + '</div>' + (h.p ? '<span class="pts">+' + h.p + '</span>' : '') + '</div>' +
    '<div class="hinfo"><div class="hfila"><span class="nombre">' + esc(h.n) + '</span>' +
    '<span class="oro">' + arte('ItemMoneda', '') + '<em class="n-oro">' + o + '</em></span></div>' +
    '<div class="oficio">' + esc(h.r) + ' &middot; ' + esc(h.c) + ' &middot; nivel ' + h.l + '</div>' +
    '<div class="vida"><div class="bar' + (pct <= 30 ? ' low' : '') + '"><b style="width:' + pct.toFixed(1) + '%"></b>' +
    '<i style="width:' + pct.toFixed(1) + '%"></i><span class="izq">Vida</span><span><em class="n-hp">' + hp + '</em> / ' + h.hm + '</span></div></div>' +
    '<div class="xp"><i style="width:' + xpPct.toFixed(1) + '%"></i></div>' +
    '<div class="xptxt">' + h.xp + ' / ' + h.xn + ' de experiencia</div>' +
    '</div></div>';
}

function juegoTxt() {
  var j = st.j;
  if (!j || !j.f) return 'Sin partida.';
  var t = 'Día ' + j.d + ', ' + esc(j.f);
  if (j.tu) t += '. ' + (j.mt ? '<b class="gold">Te toca a ti</b>' : 'Juega ' + esc(j.tu));
  return t + '.';
}
function diaHtml() {
  var j = st.j;
  if (!j || !j.f) return '<div class="dia">Sin partida</div>';
  return '<div class="dia">Día ' + j.d + ' &middot; ' + esc(j.f) +
    (j.tu ? (j.mt ? ' <span class="tuyo">te toca</span>' : ' &middot; juega <b style="color:var(--tinta)">' + esc(j.tu) + '</b>') : '') + '</div>';
}

function pintaJuego() { return cartelHtml(false) + diarioHtml(false); }

function diarioHtml(solo) {
  if (!st.lg || !st.lg.length)
    return solo ? '<div class="calma"><b>Nada todavía</b>Aquí saldrá lo que le pase a tu héroe.</div>' : '';
  return '<h2>Lo último</h2><ul class="diario">' + st.lg.slice().reverse().map(function (l) {
    return '<li data-k="l' + l[0] + '"><i style="--c:' + (COL[l[1]] || COL[1]) + '">' + (ICO_SUCESO[l[1]] || ICO.punto) + '</i>' + esc(l[2]) + '</li>';
  }).join('') + '</ul>';
}

function puedesMover() {
  return (st.m || []).some(function (t) { return t[4] & 16; });
}
var MANO = '<svg viewBox="0 0 30 30" fill="none" stroke="#f0e5cd" stroke-width="2" stroke-linejoin="round">' +
  '<path d="M15 3 L25 8.5 V19.5 L15 25 L5 19.5 V8.5 Z" stroke-dasharray="3 2.5"/>' +
  '<circle cx="15" cy="11" r="3.2" fill="#d9ae45" stroke="none"/><path d="M10.5 21 C10.5 16.5 12.5 14.8 15 14.8 C17.5 14.8 19.5 16.5 19.5 21" stroke="#d9ae45"/></svg>';

var pisado = null, cartelInfo = null;

/* Lo que se saca del texto del cartel mientras el cerebro no lo mande aparte
   (DOCS/10-ARTE-WEB.md, "Datos que pide la pagina") */
function tiradaDe(tx) {
  var m = /d20\s*(\d+)\)?(?:\s*([+-]\s*\d+)\s*=\s*(\d+))?(?:\s*(?:contra|vs\.?|against)\s*(\d+))?/i.exec(tx || '');
  if (!m) return null;
  return { r: +m[1], mo: m[2] ? m[2].replace(/\s/g, '') : '', tot: m[3] ? +m[3] : +m[1], cd: m[4] ? +m[4] : 0 };
}
function bichoDe(tx) {
  var re = /([A-Za-zÀ-ÿ' ]{2,40}?)\s+(\d+)\s*\/\s*(\d+)\s*(?:PV|HP)/g, m;
  while ((m = re.exec(tx || ''))) {
    var n = m[1].trim().split(/\s+/).slice(-3).join(' ');
    if (n && !/^(tu|you|tú)$/i.test(n)) return { n: n, hp: +m[2], hm: +m[3] };
  }
  return null;
}
/* La tirada: un d20 en 3D (dado.js) que cae, rebota y se para en el numero; al
   pararse, ondas del color del resultado (dentro del cartel y por toda la pantalla)
   y el veredicto que cae como un sello. Colores (tambien en DOCS/10):
   critico (20 natural) oro, exito verde, fallo rojo, pifia (1 natural) granate,
   sin veredicto azul */
var RES = {
  crit: { c: '#ffd36a', t: '¡Crítico!', son: 'critico' },
  si: { c: '#74d98a', t: 'Éxito', son: 'exito' },
  no: { c: '#ff6550', t: 'Fallo', son: 'fracaso' },
  pifia: { c: '#e0305a', t: 'Pifia', son: 'pifia' },
  neutro: { c: '#8cc4ff', t: '', son: 'asienta' }
};
// exito o fallo: la CD si la hay, si no el color del cartel o lo que dice el texto
function veredictoDe(c, t) {
  // (en combate el color del cartel es el de la ronda entera, no el de la tirada:
  // por eso el texto va antes que el color)
  if (t.cd) return t.tot >= t.cd;
  var tx = String(c.tx || ''), tras = sinTilde(tx.slice(Math.max(0, tx.search(/d20/i))));
  if (/^[^.]*\b(acierta|aciertas|hits?|lo consigue|lo logras|consigues|succeeds?)\b/.test(tras)) return true;
  if (/^[^.]*\b(falla|fallas|miss(es)?|no puede|no lo consigue|fails?)\b/.test(tras)) return false;
  if (c.k === 4) return true;
  if (c.k === 2) return false;
  return null;
}
function resDe(c, t) {
  var ok = veredictoDe(c, t);
  if (t.r === 20 && ok !== false) return 'crit';
  if (t.r === 1 && ok !== true) return 'pifia';
  return ok === true ? 'si' : ok === false ? 'no' : 'neutro';
}
function tiradaHtml(c) {
  var t = tiradaDe(c.tx);
  if (!t) return '';
  var r = resDe(c, t), R = RES[r];
  return '<div class="tirada res-' + r + '" data-k="ti' + c.s + '" style="--rc:' + R.c + '">' +
    '<div class="dado" data-dado="' + c.s + '" data-n="' + t.r + '"></div>' +
    '<div class="cuentas">' + (t.mo ? 'd20 ' + t.r + ' ' + t.mo + ' = <b>' + t.tot + '</b>' : 'd20 = <b>' + t.r + '</b>') +
    (t.cd ? '<span class="cd">contra ' + t.cd + '</span>' : '') +
    (R.t ? '<span class="veredicto">' + R.t + '</span>' : '') + '</div></div>';
}
var dadosVistos = {};
function cartelSeVe() { return horizontal() || tabActual() === 'juego'; }
// Busca los dados nuevos de la pantalla y los lanza (o los pone ya parados si ese
// cartel ya se vio, o en las fotos, o con "reducir movimiento")
function arrancaDados() {
  $$('.dado[data-dado]').forEach(function (d) {
    if (d.querySelector('.d20') || !window.Dado) return;
    var s = d.getAttribute('data-dado'), visto = !!dadosVistos[s] || quieto();
    dadosVistos[s] = 1;
    var tir = d.parentNode, h = horizontal();
    // que se vea caer: si la tirada esta fuera de la vista, se desliza hasta ella
    if (!visto && tir.scrollIntoView) try { tir.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
    Dado.monta(d, +d.getAttribute('data-n'), {
      a: h ? 32 : 46, rapido: visto, alto: h ? 150 : 230,
      alLanzar: function () { suena('lanzar'); },
      alRebote: function (i) { suena(i ? 'rebote2' : 'rebote'); if (!i) zumba(12, 'rebote'); },
      alFinal: function (dd) { resultadoTirada(tir, d, dd, !visto); }
    });
  });
}
function resultadoTirada(tir, caja, dd, animar) {
  var r = (/res-(\w+)/.exec(tir.className) || [])[1] || 'neutro', R = RES[r];
  dd.classList.add('brilla');
  var cu = tir.querySelector('.cuentas'), ve = tir.querySelector('.veredicto');
  if (!animar || !cu || !cu.animate) { if (cu) cu.animate ? cu.animate([{ opacity: 1 }, { opacity: 1 }], { duration: 1, fill: 'forwards' }) : 0; return; }
  cu.animate([{ opacity: 0, transform: 'translateX(-10px)' }, { opacity: 1, transform: 'none' }],
    { duration: 320, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
  if (ve) ve.animate([{ opacity: 0, transform: 'scale(2.2) rotate(-8deg)', filter: 'blur(4px)' },
    { opacity: 1, transform: 'scale(.92) rotate(-3deg)', filter: 'blur(0)', offset: 0.7 }, { opacity: 1, transform: 'rotate(-3deg)', filter: 'blur(0)' }],
    { duration: 420, delay: 140, easing: 'cubic-bezier(.3,1.4,.5,1)', fill: 'both' });
  var b = cu.querySelector('b');
  if (b) b.animate([{ transform: 'scale(1.6)', color: R.c }, { transform: 'none' }], { duration: 500, easing: 'cubic-bezier(.3,1.5,.5,1)' });
  // las ondas: dentro del dado y una grande por toda la pantalla
  var n = r === 'crit' ? 5 : r === 'neutro' ? 2 : 3, o = '';
  for (var i = 0; i < n; i++) o += '<i style="animation-delay:' + (i * 0.16) + 's"></i>';
  var ondas = document.createElement('div');
  ondas.className = 'ondas';
  ondas.setAttribute('data-fx', '');
  ondas.innerHTML = o + (r === 'crit' ? chispas() : '');
  caja.appendChild(ondas);
  setTimeout(function () { if (ondas.parentNode) ondas.parentNode.removeChild(ondas); }, 2400);
  var rc = caja.getBoundingClientRect(), x = rc.left + rc.width / 2, y = rc.top + rc.height / 2;
  fxPon('<div class="onda-g" style="left:' + x + 'px;top:' + y + 'px;--rc:' + R.c + '"></div>', 1500);
  if (r === 'crit') { fxPon('<div class="velo crit"></div>', 900); fxPon('<div class="estallido" style="top:' + y + 'px"></div>', 1900); }
  if (r === 'pifia') { fxPon('<div class="velo golpe"></div>', 800); app.classList.remove('tiembla'); void app.offsetWidth; app.classList.add('tiembla'); }
  suena(R.son);
  zumba(r === 'crit' ? [30, 50, 30, 50, 90] : r === 'pifia' ? [80, 40, 120] : 25, 'dado-' + r);
}
function chispas() {
  var o = '';
  for (var i = 0; i < 14; i++) o += '<b style="--g:' + (i * 360 / 14 + (i % 2) * 9) + 'deg;--l:' + (60 + (i * 37) % 50) + 'px"></b>';
  return o;
}
/* Capas vivas encima de cada ilustracion (solo transform/opacity, y fusiones):
   tinte del color del cartel (soft-light), niebla que se desliza (screen), rayos de
   luz (lugares), motas o brasas que suben (screen) y grano de pelicula (overlay) */
function motas(tipo) {
  var m = '', n = tipo === 'lucha' ? 12 : 9;
  for (var i = 0; i < n; i++)
    m += '<i style="--x:' + (4 + (i * 61) % 92) + '%;--d:' + (4.5 + (i * 37) % 6 + (tipo === 'lucha' ? -1.5 : 1)).toFixed(1) + 's;--r:-' +
      ((i * 53) % 50 / 10).toFixed(1) + 's;--s:' + (0.6 + (i * 29) % 10 / 10).toFixed(1) + '"></i>';
  return '<div class="motas ' + tipo + '">' + m + '</div>';
}
function vivas(tipo) {
  return '<div class="tinte"></div><div class="niebla"></div>' + (tipo === 'lugar' ? '<div class="haces"></div>' : '') +
    motas(tipo) + '<div class="grano"></div>';
}
function vidaBHtml(b, dk) {
  var hp = bichoRetenido && bichoRetenido.n === b.n ? bichoRetenido.hp : b.hp;
  var pct = b.hm ? Math.max(0, Math.min(100, 100 * hp / b.hm)) : 0;
  return '<div class="vidaB"' + (dk ? ' data-k="vb-' + esc(b.n) + '"' : '') + '><span>' + esc(b.n) + '</span><div class="bar"><b style="width:' +
    pct.toFixed(1) + '%"></b><i style="width:' + pct.toFixed(1) + '%"></i></div><span><em class="n-hpb">' + hp + '</em>/' + b.hm + '</span></div>';
}
// La escena (vertical): la ilustracion a sangre encima del texto. Devuelve [html, titulo ya puesto]
function escenaHtml(c) {
  var a = c.ar, k = COL[c.k] || COL[1];
  if (!a || c.w || arteMal[a]) return ['', false];
  // con tirada o muchas opciones la escena es mas baja: que quepa el dado y el texto
  var baja = tiradaDe(c.tx) || (c.op && c.op.length > 3) ? ' baja' : '';
  var tt = '<div class="esc-tt" data-k="t' + c.s + '">' + esc(c.ti) + '</div>';
  if (a.indexOf('npc/') === 0) {
    var fondo = ultimoLugar || 'LocAldea';
    return ['<div class="escena pnj" data-k="e-' + esc(a) + '" style="--k:' + k + '">' + arte(fondo, 'kb') + vivas('pnj') +
      '<div class="retrato">' + arte(a, '') + '</div></div>', false];
  }
  if (a.indexOf('Item') === 0)
    return ['<div class="escena cosa" data-k="e-' + esc(a) + '" style="--k:' + k + '"><div class="rayos"></div>' + motas('cosa') + arte(a, 'obj') + '</div>', false];
  if (esLucha(a)) {
    var b = bichoDe(c.tx);
    return ['<div class="escena lucha' + baja + '" data-k="e-' + esc(a) + '" style="--k:' + k + '">' + arte(a, 'borroso') + vivas('lucha') + arte(a, 'bicho') +
      (b ? vidaBHtml(b) : '') + tt + '</div>', true];
  }
  return ['<div class="escena' + baja + '" data-k="e-' + esc(a) + '" style="--k:' + k + '">' + arte(a, 'kb') + vivas('lugar') + tt + '</div>', true];
}
// Horizontal: la ilustracion va de fondo de toda la columna derecha
function fondoHtml(c) {
  if (!c || !c.ar || c.w) return '';
  var a = c.ar.indexOf('npc/') === 0 ? ultimoLugar : c.ar.indexOf('Item') === 0 ? '' : c.ar;
  if (!a || arteMal[a]) return '';
  var l = esLucha(a);
  return '<div class="fondo' + (l ? ' lucha' : '') + '" data-k="f-' + esc(a) + '" style="--k:' + (COL[c.k] || COL[1]) + '">' + arte(a, '') +
    vivas(l ? 'lucha' : 'lugar') + '</div>';
}

function cartelHtml(horiz) {
  var c = st.ca, h = '';
  if (pisado && Date.now() < pisado.hasta && (!c || c.s !== pisado.s))
    h += '<div class="pisado" id="pisado" data-pulsa style="border-left-color:' + (COL[pisado.k] || COL[1]) + '"><b style="color:' +
      (COL[pisado.k] || COL[1]) + '">' + esc(pisado.ti) + '</b>' + esc(pisado.tx) + '</div>';
  if (c) {
    var k = COL[c.k] || COL[1], esc0 = horiz ? ['', false] : escenaHtml(c);
    var conTitulo = esc0[1], solo = !esc0[0];
    var mini = '';
    if (horiz && c.ar && !c.w) {
      if (c.ar.indexOf('npc/') === 0) mini = arte(c.ar, 'cara');
      else if (c.ar.indexOf('Item') === 0) mini = arte(c.ar, 'cosa');
    }
    // en horizontal la vida del bicho va fuera del cartel, para que se deslice de una ronda a otra
    var b = horiz && esLucha(c.ar) ? bichoDe(c.tx) : null;
    h += esc0[0] + (b ? vidaBHtml(b, true) : '') +
      '<div class="cartel' + (solo && !horiz ? ' solo' : '') + (c.w ? ' esperando' : '') + '" data-k="c' + c.s + '" style="--k:' + k + '">' +
      (c.w ? rueda(true) + '<div class="estado" style="margin-bottom:6px">' + (c.w === 2 ? 'Escaneando' : 'Esperando a los demás') + '</div>' :
             solo && !horiz ? '<span class="linea-k"></span>' : '') +
      mini +
      (conTitulo ? '' : '<div class="tt">' + esc(c.ti) + '</div>') +
      tiradaHtml(c) +
      '<div class="tx">' + esc(c.tx) + '</div>' +
      (c.op && c.op.length && puedesMover() ? '<div class="mover">' + MANO +
        '<span>Para moverte, <b>levanta tu figura y ponla en una loseta marcada</b>. Si no, pulsa ' + esc(c.op[0]) + '.</span></div>' : '') +
      '</div>';
  } else {
    h += '<div class="calma">' + rueda(true) + '<b>Un momento</b>' + juegoTxt() +
      '<button id="queToca" class="sec"' + bAt('queToca') + '>Ver qué toca</button></div>';
  }
  if (c && !horiz) h += diaHtml();
  return h;
}
/* Si el heroe esta tambien en el chip de la figura (como CHF_* en MovilWeb.h) */
function enFiguraHtml(fg) {
  var t = [null,
    ['ok', '<b>Guardado en la figura.</b> Puedes llevarla a otra mesa.'],
    ['pend', '<b>Pendiente de guardar en la figura:</b> se hace solo con ella quieta unos segundos.'],
    ['mal', '<b>No se guarda en la figura:</b> la loseta donde está tiene el programa viejo.'],
    ['mal', '<b>La figura trae otro héroe</b>, más nuevo, y no se pisa. Para usarlo: suelta la figura y vuelve a vincularla.'],
    ['mal', '<b>Esta figura no puede guardar el héroe:</b> su chip no es NTAG. Queda en la mesa.'],
    ['mal', '<b>No se ha podido guardar en la figura.</b> Se vuelve a intentar sola.']][fg];
  if (!t) return '';
  var o = '<div class="enfig ' + t[0] + '"><span class="pto"></span><span>' + t[1] + '</span></div>';
  if (fg === 2 || fg === 6) o += '<button id="chipya" class="ghost"' + bAt('chipya') + '>Guardar en la figura ahora</button>';
  return o;
}

function pintaHoja() {
  var h = st.h, o = '';
  if (h) {
    if (h.p) o += '<div class="aviso">Tienes <b class="gold">' + h.p + '</b> punto' + (h.p > 1 ? 's' : '') +
      ' para mejorar: Héroe &rarr; Mejorar.</div>';
    o += '<h2>Atributos</h2><div class="skills">' + h.sk.map(function (v, i) {
      return '<div class="sk"><span>' + esc(h.skn[i]) + '</span><b>' + v + '</b></div>';
    }).join('') + '</div>';
    o += '<h2>Mochila</h2><div class="mochila">' + (h.inv.length ? h.inv.map(function (n, i) {
      return '<div class="it">' + arte((h.ia || [])[i], '') + esc(n) + '</div>';
    }).join('') : '<div class="it vacio">Vacía</div>') + '</div>';
    o += enFiguraHtml(h.fg);
  }
  var otros = (st.me || []).filter(function (m) { return !m.yo; });
  o += '<h2>En la mesa</h2>' + (otros.length ? otros.map(function (m) {
    return '<div class="compa' + (m.on ? '' : ' off') + '"><span class="ficha" style="--c:' + esc(m.c) + '"></span>' +
      '<span>' + esc(m.n) + (m.tu ? '<span class="tu">juega</span>' : '') + '</span>' +
      '<span class="e">' + esc(m.e) + (m.on ? '' : ' &middot; sin móvil') + '</span></div>';
  }).join('') : '<div class="sub">Nadie más todavía.</div>');
  o += '<button id="soltar" class="ghost" style="margin-top:28px">Soltar la figura de este móvil</button>';
  return o;
}

/* El mapa: hexagonos de lado plano arriba, en columnas, como en la mesa.
   Coordenadas axiales (q, r). Cada loseta con su cara (art/loseta/) */
function pintaMapa() {
  var m = st.m || [];
  if (!m.length) return '<div class="calma"><b>Sin mapa</b>Las losetas aún no tienen posición en el dibujo. Quien monta la mesa las coloca en ' +
    '<b style="display:inline;color:#d9ae45">&#9881;</b> &gt; Configurar la mesa.</div>';
  var R = 30, S3 = Math.sqrt(3), minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  var hex = m.map(function (t) {
    var x = R * 1.5 * t[0], y = R * S3 * (t[1] + t[0] / 2);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    return { x: x, y: y, t: t };
  });
  function pts(o, rr) {
    var p = [];
    for (var k = 0; k < 6; k++) { var a = Math.PI / 3 * k; p.push((o.x + rr * Math.cos(a)).toFixed(1) + ',' + (o.y + rr * Math.sin(a)).toFixed(1)); }
    return p.join(' ');
  }
  var pad = R + 8, w = maxX - minX + 2 * pad, hgt = maxY - minY + 2 * pad;
  var col = st.h ? st.h.col : '#d9ae45';
  var s = '<svg viewBox="' + (minX - pad).toFixed(1) + ' ' + (minY - pad).toFixed(1) + ' ' + w.toFixed(1) + ' ' + hgt.toFixed(1) + '">' +
    '<defs><clipPath id="clipCirc" clipPathUnits="objectBoundingBox"><circle cx=".5" cy=".5" r=".5"/></clipPath>' +
    '<radialGradient id="sombra"><stop offset="60%" stop-color="#000" stop-opacity=".55"/><stop offset="100%" stop-color="#000" stop-opacity="0"/></radialGradient></defs>';
  var r2 = R - 1.4, wi = 2 * r2, hi = S3 * r2;
  hex.forEach(function (o) {     // las caras
    var f = o.t[4], tex = o.t[3] ? losetaDe(o.t[3]) : 'no_explorada';
    if (!(f & 32)) {
      s += '<polygon points="' + pts(o, R - 2) + '" fill="#120e0c" stroke="#3b2f25" stroke-width="1.2" stroke-dasharray="3 3"/>';
      return;
    }
    if (tex && !arteMal['loseta/' + tex])
      s += '<image href="' + ARTE + 'loseta/' + tex + '.webp" x="' + (o.x - r2).toFixed(1) + '" y="' + (o.y - hi / 2).toFixed(1) +
        '" width="' + wi.toFixed(1) + '" height="' + hi.toFixed(1) + '" preserveAspectRatio="none"' + (o.t[3] ? '' : ' opacity=".5"') + '/>';
    else s += '<polygon points="' + pts(o, r2) + '" fill="' + (o.t[2] || '#2b2520') + '"/>';
    if (!o.t[3]) s += '<polygon points="' + pts(o, r2) + '" fill="#0c090b" fill-opacity=".35"/>';
  });
  hex.forEach(function (o) {     // bordes, nombres, fichas
    var f = o.t[4];
    if (!(f & 32)) return;
    if (f & 16) s += '<polygon class="va" points="' + pts(o, R - 2.5) + '" fill="#f6dc8c" fill-opacity=".12" stroke="#f6dc8c" stroke-width="3"/>';
    if (f & 4) {
      s += '<polygon points="' + pts(o, R - 2.5) + '" fill="#a01e10" fill-opacity=".25" stroke="#e0654f" stroke-width="3"/>';
      s += arteMal.Combate ? '' : '<image href="' + ARTE + 'Combate.webp" x="' + (o.x - 9) + '" y="' + (o.y - R * .72) + '" width="18" height="18"/>';
    }
    if (o.t[3]) s += '<text class="tx-l" x="' + o.x.toFixed(1) + '" y="' + (o.y + R * .66).toFixed(1) + '" text-anchor="middle">' + esc(o.t[3]) + '</text>';
    if (f & 8) s += '<g transform="translate(' + (o.x + R * .52).toFixed(1) + ' ' + (o.y - R * .5).toFixed(1) + ')"><circle r="6.5" fill="#0c090b" stroke="#d9ae45"/>' +
      '<text y="3.6" font-size="10" text-anchor="middle" fill="#f6dc8c">&#9733;</text></g>';
    if (o.t[5]) o.t[5].forEach(function (c, i) {
      var cx = o.x - 10 + i * 10, cy = o.y + 6;
      s += '<circle cx="' + cx + '" cy="' + (cy + 2) + '" r="6" fill="url(#sombra)"/><circle cx="' + cx + '" cy="' + cy + '" r="4.6" fill="' + esc(c) + '" stroke="#0c090b" stroke-width="1.2"/>' +
        '<circle cx="' + (cx - 1.4) + '" cy="' + (cy - 1.6) + '" r="1.4" fill="#fff" fill-opacity=".5"/>';
    });
    if (f & 1) {
      var tr = 11;
      s += '<circle class="yo-pulso" cx="' + o.x + '" cy="' + (o.y - 2) + '" r="' + tr + '" fill="none" stroke="' + esc(col) + '" stroke-width="2"/>' +
        '<circle cx="' + o.x + '" cy="' + (o.y + 1) + '" r="' + (tr + 2) + '" fill="url(#sombra)"/>' +
        '<circle cx="' + o.x + '" cy="' + (o.y - 2) + '" r="' + (tr + 1.5) + '" fill="' + esc(col) + '"/>';
      var cara = st.h ? caraDe(st.h.ar) : '';
      if (cara && !arteMal[cara])
        s += '<image href="' + ARTE + esc(cara) + '.webp" x="' + (o.x - tr) + '" y="' + (o.y - 2 - tr) + '" width="' + 2 * tr + '" height="' + 2 * tr +
          '" preserveAspectRatio="xMidYMin slice" clip-path="url(#clipCirc)"/>';
    }
  });
  s += '</svg>';
  return '<div class="mapa">' + s + '</div><div class="leyenda">' +
    '<span><span class="color" style="background:' + esc(col) + '"></span>tú</span>' +
    '<span style="color:#f6dc8c">&#9733; salida</span>' +
    '<span><span class="color" style="background:0;border:2px solid #f6dc8c"></span>puedes ir</span>' +
    '<span><span class="color" style="background:0;border:2px solid #e0654f"></span>combate</span>' +
    '<span style="opacity:.7">oscuras = sin explorar</span></div>';
}

function tabActual() {
  if (horizontal()) return tab === 'hoja' || tab === 'diario' ? tab : 'mapa';
  return tab === 'diario' ? 'juego' : tab;
}
function tabsHtml() {
  var t = horizontal() ? [['mapa', 'Mapa'], ['hoja', 'Hoja'], ['diario', 'Lo último']]
                       : [['juego', 'Juego'], ['hoja', 'Hoja'], ['mapa', 'Mapa']];
  var actual = tabActual(), idx = 0;
  return '<div class="tabs">' + t.map(function (x, i) {
    if (actual === x[0]) idx = i;
    var badge = x[0] === 'juego' && actual !== 'juego' && st.ca && st.ca.op && st.ca.op.length;
    return '<button data-tab="' + x[0] + '" class="' + (actual === x[0] ? 'on' : '') + '">' + x[1] +
      (badge ? '<span class="badge"></span>' : '') + '</button>';
  }).join('') + '<i class="ind" style="transform:translateX(' + idx * 100 + '%)"></i></div>';
}

/* La franja de abajo: las opciones del cartel, "Vale" si solo informa, nada si
   es una espera. Y debajo Heroe y Mesa. mn = 0 si el cartel no se puede dejar */
function menusHtml() {
  var no = st && st.mn === 0 ? bloq('Ahora no: termina antes lo que tienes delante') : '';
  return '<button id="menu" class="sec"' + (no || bAt('menu')) + '><b>&#9733;</b>Héroe</button>' +
    '<button id="mesa" class="sec"' + (no || bAt('mesa')) + '><b>&#11041;</b>Mesa</button>';
}
var nombreH = '';
function limpiaNombre(t) {
  t = String(t || '');
  if (t.normalize) t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return t.toUpperCase().replace(/[^A-Z ]/g, '').replace(/ +/g, ' ').replace(/^ /, '').slice(0, 12);
}
// La opcion tocada se queda marcada (y las demas apagadas) hasta que llega el cartel siguiente
var opElegida = -1, opElegidaS = -1;
function icoOpcion(c, x, n) {
  var t = sinTilde(x);
  if (n === 1 && /^(tirar|roll)\b/.test(t)) return ICO.dado;
  if (!esLucha(c.ar)) return '';
  if (/^(atacar|attack)/.test(t)) return ICO.espada;
  if (/^(defender|defend)/.test(t)) return ICO.escudo;
  if (/^(huir|flee|run)/.test(t)) return ICO.huir;
  if (/^(beber|drink)/.test(t)) return ICO.pocion;
  if (/^(cubrir|cover|proteger)/.test(t)) return ICO.cubrir;
  if (/^(tirar|roll)/.test(t)) return ICO.dado;
  return ICO.chispa;
}
function accionesHtml() {
  var c = st.ca, o = '', n = c && c.op ? c.op.length : 0;
  var tres = n === 3 && !!c.pr;
  var eleg = c && opElegidaS === c.s ? opElegida : -1;
  if (n) {
    if (c.pr) o += '<div class="pregunta">' + esc(c.pr) + '</div>';
    o += c.op.map(function (x, i) {
      var sola = !tres && n % 2 === 1 && i === n - 1 && n > 1;
      var a = (c.oa || [])[i], grande = a && !/^Item/.test(a);
      var cls = 'op' + (n === 1 ? ' unica' : '') + (eleg < 0 || i === eleg ? '' : ' apagada');
      return '<button data-op="' + i + '" data-k="o' + c.s + '-' + i + '" class="' + cls + '"' + (i === eleg ? ' aria-busy="true"' : '') +
        (/^(tirar|roll)\b/.test(sinTilde(x)) ? ' data-son="agita"' : '') +
        (sola ? ' style="grid-column:1/-1"' : '') + '>' + (a ? arte(a, grande ? 'mini' : 'mini') : icoOpcion(c, x, n)) + '<span>' + esc(x) + '</span></button>';
    }).join('');
  } else if (c && !c.w) {
    o = '<button id="vale" class="op unica" data-k="v' + c.s + '"' + bAt('vale') + '><span>Vale</span></button>';
  }
  var barra = !horizontal() ? '<div class="barra">' + menusHtml() + '</div>' : '';
  if (!o && !barra) return '';
  return '<div class="acciones' + (tres ? ' tres' : n > 1 ? ' dos' : '') + (n > 4 ? ' muchas' : '') + '">' + o +
    (barra ? '<div style="grid-column:1/-1">' + barra + '</div>' : '') + '</div>';
}

/* Crear el heroe: pantalla propia. Paso 1 el nombre (se manda con "nombre"),
   paso 2 la raza, paso 3 la clase. Las laminas enteras y ninguna preseleccionada */
var nombreListo = false, nombreHeroe = '';
function creando() { return !!(st.v && !st.h && st.ca && (st.ca['in'] || st.ca.pr)); }
function pasos3(n) {
  return '<div class="pasos3">' + [1, 2, 3].map(function (i) { return '<i class="' + (i <= n ? 'on' : '') + '"></i>'; }).join('') +
    '<span>&nbsp;Nuevo héroe</span></div>';
}
function pintaCreacion() {
  var c = st.ca, o, paso;
  if (c['in'] && !nombreListo) {
    paso = 1;
    var ok = limpiaNombre(nombreH).trim().length >= 2;
    o = pasos3(1) + '<h1>¿Cómo se llama tu héroe?</h1>' +
      '<input id="nombreH" class="nombreIn" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" ' +
      'enterkeyhint="next" placeholder="Escribe su nombre" value="' + esc(nombreH) + '">' +
      '<div class="sub" style="font-size:14px">Hasta 12 letras, sin tildes ni eñe: es lo que cabe en el chip de la figura.</div>' +
      '<button id="nombreOk"' + (ok ? '' : bloq('Escribe antes su nombre: al menos 2 letras')) + '>Seguir</button>';
  } else {
    paso = c['in'] ? 2 : 3;
    var n = c.op.length, quien = esc(nombreHeroe || limpiaNombre(nombreH).trim());
    var eleg = opElegidaS === c.s ? opElegida : -1;
    o = pasos3(paso) + '<h1>' + esc(c.pr || c.ti) + '</h1>' +
      '<div class="sub">' + (quien ? '<b class="gold">' + quien + '</b>' : '') +
      (c['in'] ? ' &middot; <button id="nombreOtra" class="mas">cambiar el nombre</button>' :
                 (quien ? ' &middot; ' : '') + esc(c.tx)) + '</div>' +
      '<div class="cartas' + (n > 3 ? ' cuatro' : '') + '" data-k="cartas' + c.s + '">' + c.op.map(function (x, i) {
        var a = (c.oa || [])[i];
        return '<button data-op="' + i + '" data-son="abrir" class="' + (eleg < 0 || i === eleg ? '' : 'apagada') + '"' + (i === eleg ? ' aria-busy="true"' : '') + '>' +
          (a ? arte(a, 'lamina') : '') + '<span>' + esc(x) + '</span></button>';
      }).join('') + '</div>';
  }
  pon('crear' + paso + (horizontal() ? 'h' : 'v'), portadaTenue() + topHtml() + '<div class="crear' + (horizontal() ? ' h' : '') + '">' + o + '</div>' + caidaHtml());
}
function portadaTenue() { return '<div class="portada" style="opacity:.45">' + arte('MenuFondo', '') + '<div class="niebla"></div>' + '</div>'; }

function pintaConFigura() {
  if (creando()) { pintaCreacion(); return; }
  var t = tabActual();
  if (horizontal()) {
    var izq = t === 'hoja' ? pintaHoja() : t === 'diario' ? diarioHtml(true) : pintaMapa();
    pon('juego-h', topHtml() + '<div class="horiz">' +
      '<div class="izq">' + tabsHtml() + '<div class="main' + (tabDir ? ' entra-' + tabDir : '') + '" data-k="iz-' + t + '">' + izq + '</div></div>' +
      '<div class="der">' + fondoHtml(st.ca) + '<div class="main">' + heroeHtml(st.h) + cartelHtml(true) + '</div>' + accionesHtml() + '</div>' +
      '</div>' + (peligro() ? '<div class="peligro-v"></div>' : '') + caidaHtml());
    return;
  }
  var cuerpo = t === 'hoja' ? pintaHoja() : t === 'mapa' ? pintaMapa() : pintaJuego();
  pon('juego-v', topHtml() + tabsHtml() + '<div class="main' + (tabDir ? ' entra-' + tabDir : '') + '" data-k="m-' + t + '">' + heroeHtml(st.h) + cuerpo + '</div>' +
    accionesHtml() + (peligro() ? '<div class="peligro-v"></div>' : '') + caidaHtml());
}

/* ── Configurar la mesa (igual que en la ronda 5; solo cambia el aspecto) ── */
var cfgSel = 0, cfgUs = -1, cfgTipo = 2, cfgObj = 2;
var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
function cfgLoseta(d) {
  var ls = st.cfg.ls;
  for (var i = 0; i < ls.length; i++) if (ls[i][0] === d) return ls[i];
  return null;
}
function cfgDibujo(c) {
  var R = 30, S3 = Math.sqrt(3);
  var puestas = c.ls.filter(function (l) { return l[2]; });
  var ocup = {}, huecos = [], visto = {};
  puestas.forEach(function (l) { ocup[l[3] + ',' + l[4]] = 1; });
  if (!puestas.length) huecos.push([0, 0]);
  puestas.forEach(function (l) {
    DIRS.forEach(function (dd) {
      var q = l[3] + dd[0], r = l[4] + dd[1], k = q + ',' + r;
      if (!ocup[k] && !visto[k]) { visto[k] = 1; huecos.push([q, r]); }
    });
  });
  var celdas = puestas.map(function (l) { return { q: l[3], r: l[4], l: l }; })
    .concat(huecos.map(function (h) { return { q: h[0], r: h[1], l: null }; }));
  var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  celdas.forEach(function (o) {
    o.x = R * 1.5 * o.q; o.y = R * S3 * (o.r + o.q / 2);
    minX = Math.min(minX, o.x); maxX = Math.max(maxX, o.x); minY = Math.min(minY, o.y); maxY = Math.max(maxY, o.y);
  });
  var pad = R + 4, sel = cfgSel ? cfgLoseta(cfgSel) : null;
  var s = '<svg viewBox="' + (minX - pad) + ' ' + (minY - pad) + ' ' + (maxX - minX + 2 * pad) + ' ' + (maxY - minY + 2 * pad) + '">';
  function hexPts(o, rr) {
    var p = [];
    for (var k = 0; k < 6; k++) { var a = Math.PI / 3 * k; p.push((o.x + rr * Math.cos(a)).toFixed(1) + ',' + (o.y + rr * Math.sin(a)).toFixed(1)); }
    return p.join(' ');
  }
  celdas.forEach(function (o) {
    if (o.l) return;
    var activo = !!sel;
    s += '<g class="hueco" data-pulsa data-q="' + o.q + '" data-r="' + o.r + '"' + (activo ? '' : ' opacity=".35"') + '>' +
      '<polygon points="' + hexPts(o, R - 3) + '" fill="' + (activo ? '#211a15' : 'none') + '" stroke="#d9ae45" stroke-width="1.3" stroke-dasharray="4 3"/>' +
      '<text x="' + o.x + '" y="' + (o.y + 7) + '" font-size="20" text-anchor="middle" fill="#d9ae45">+</text></g>';
  });
  celdas.forEach(function (o) {
    if (!o.l) return;
    var l = o.l, esSel = l[0] === cfgSel, tex = l[6] ? losetaDe(l[6]) : '';
    s += '<g class="lt" data-pulsa data-d="' + l[0] + '">' +
      '<polygon points="' + hexPts(o, R - 2) + '" fill="' + (l[1] ? '#3a2f24' : '#241d17') + '"/>' +
      (tex && !arteMal['loseta/' + tex] ? '<image href="' + ARTE + 'loseta/' + tex + '.webp" x="' + (o.x - R + 2) + '" y="' + (o.y - S3 * (R - 2) / 2).toFixed(1) +
        '" width="' + (2 * R - 4) + '" height="' + (S3 * (R - 2)).toFixed(1) + '" preserveAspectRatio="none" opacity=".55"/>' : '') +
      '<polygon points="' + hexPts(o, R - 2) + '" fill="none" stroke="' +
      (esSel ? '#d9ae45' : l[1] ? '#6d5e4b' : '#e0654f') + '" stroke-width="' + (esSel ? 3.5 : 1.5) + '"' +
      (l[1] ? '' : ' stroke-dasharray="3 3"') + '/>' +
      '<text x="' + o.x + '" y="' + (o.y + 7) + '" font-size="19" font-weight="700" text-anchor="middle" fill="' +
      (esSel ? '#f6dc8c' : '#f0e5cd') + '" style="paint-order:stroke;stroke:#000;stroke-width:3px">' + l[0] + '</text>';
    if (l[5]) s += '<circle cx="' + (o.x + 13) + '" cy="' + (o.y - 13) + '" r="4" fill="#7cb86a"/>';
    if (l[6]) s += '<text x="' + o.x + '" y="' + (o.y + R * .62) + '" font-size="8" text-anchor="middle" fill="#c2b293">' + esc(l[6]) + '</text>';
    s += '</g>';
  });
  return '<div class="mapa cfg">' + s + '</svg></div><div class="leyenda">' +
    '<span><b style="color:#f0e5cd">7</b>&nbsp;loseta colocada</span>' +
    '<span style="color:#d9ae45">+ hueco libre</span>' +
    '<span><span class="color" style="background:#7cb86a"></span>algo encima</span>' +
    '<span style="color:#e0654f">rojo = no contesta</span></div>';
}

function cfgPanel(c) {
  var o = '';
  if (c.rc) {
    var cual = c.rc === 1 ? 'placas de ' + ((c.tp || [])[c.rv - 1] || '?') : 'cartas de ' + ((c.ob || [])[c.rv] || '?');
    var van = c.rc === 1 ? (c.np[c.rv - 1] || 0) : (c.nc[c.rv] || 0);
    o += '<div class="sel" style="margin-top:0"><div class="n" style="font-size:17px">Registrando ' + esc(cual) + '</div>' +
      '<div class="pista">Pon cada una encima de cualquier loseta, de una en una. Llevas <b class="gold">' + van + '</b>.</div>' +
      '<button id="cfgRegNada">Parar</button></div>';
  }
  if (!c.bus) o += '<div class="aviso malo">El mapa no contesta: la línea de datos está a 0. Falta la resistencia de pull-up o hay un corto.</div>';
  if (c.fj) o += '<div class="aviso">Hay una partida en marcha. Si cambias el mapa ahora, la partida puede liarse.</div>';
  if (c.msg) o += '<div class="aviso">' + esc(c.msg) + '</div>';
  if (!c.ls.length) {
    o += '<h2>Losetas</h2><ol class="pasos">' +
      '<li><span>Monta las losetas en la mesa, conectadas entre sí y al cerebro.</span></li>' +
      '<li><span>Pulsa <b>Buscar losetas</b>. El cerebro les da un número y las guarda.</span></li></ol>';
  } else {
    var sin = c.ls.filter(function (l) { return !l[2]; });
    var sel = cfgSel ? cfgLoseta(cfgSel) : null;
    if (sel) {
      var est = [sel[1] ? 'contesta' : 'NO contesta', sel[2] ? 'colocada' : 'sin colocar'];
      if (sel[5]) est.push(sel[5] + ' cosa' + (sel[5] > 1 ? 's' : '') + ' encima');
      if (sel[6]) est.push('placa de ' + sel[6]);
      o += '<div class="sel"><div class="n">Loseta ' + sel[0] + '</div><div class="e">' + est.join(' &middot; ') + '</div>' +
        '<div class="pista">' + (sel[2] ? 'Para moverla, toca otro hueco <b class="gold">+</b> del dibujo.'
                                        : 'Ahora toca en el dibujo el hueco <b class="gold">+</b> donde está en la mesa.') + '</div>' +
        '<div class="fila"><button id="cfgVer" class="sec"' + (sel[1] ? '' : bloq('Esta loseta no contesta: no se puede encender')) + '>Encenderla</button>' +
        (sel[2] ? '<button id="cfgSinPos" class="ghost">Quitar del dibujo</button>' : '') +
        '<button id="cfgDesel" class="ghost">Ninguna</button></div></div>';
    } else {
      o += '<ol class="pasos" style="margin-top:12px">' +
        '<li><span>Elige una loseta: <b>tócala</b> en el dibujo o en la lista (se enciende en blanco en la mesa), o <b>pon una figura encima</b>.</span></li>' +
        '<li><span>Toca en el dibujo el <b>hueco +</b> donde está. Se guarda sola.</span></li></ol>';
    }
    o += '<h2>Sin colocar (' + sin.length + ')</h2>' + (sin.length ? '<div class="lista">' + sin.map(function (l) {
      return '<button data-cd="' + l[0] + '" class="sec' + (l[0] === cfgSel ? ' on' : '') + (l[1] ? '' : ' muda') + '"' +
        (l[0] === cfgSel ? ' aria-pressed="true"' : '') + '>' + l[0] + '</button>';
    }).join('') + '</div>' : '<div class="sub">Todas las losetas están en el dibujo.</div>');
  }
  o += '<button id="cfgBuscar"' + (c.ls.length ? ' class="sec"' : '') + bAt('cfgBuscar') + '>' + (pend && pend.id === 'cfgBuscar' ? 'Buscando…' : 'Buscar losetas') + '</button>';
  var tp = c.tp || [], ob = c.ob || [];
  var np = (c.np || []).reduce(function (a, b) { return a + b; }, 0), nc = (c.nc || []).reduce(function (a, b) { return a + b; }, 0);
  o += '<h2>Placas y cartas</h2>';
  if (c.rc) {
    o += '<div class="sub">Registrando: el cartel de arriba.</div>';
  } else {
    o += '<div class="sub">Registradas: ' + np + ' placa' + (np === 1 ? '' : 's') + ' y ' + nc + ' carta' + (nc === 1 ? '' : 's') + '.</div>' +
      '<select id="cfgTipo">' + tp.map(function (n, i) {
        return '<option value="' + (i + 1) + '"' + (i + 1 === cfgTipo ? ' selected' : '') + '>Placa: ' + esc(n) +
          (c.np[i] ? ' (' + c.np[i] + ')' : '') + '</option>';
      }).join('') + '</select><button id="cfgRegPlaca" class="sec" style="margin-top:8px">Registrar placas de este tipo</button>' +
      '<select id="cfgObj">' + ob.map(function (n, i) {
        return '<option value="' + i + '"' + (i === cfgObj ? ' selected' : '') + '>Carta: ' + esc(n) +
          (c.nc[i] ? ' (' + c.nc[i] + ')' : '') + '</option>';
      }).join('') + '</select><button id="cfgRegCarta" class="sec" style="margin-top:8px">Registrar cartas de este objeto</button>';
  }
  if (c.ls.some(function (l) { return l[2]; }))
    o += '<h2>Mapa nuevo</h2><div class="sub">Si hoy las losetas están en otro orden: borra el dibujo y vuelve a ' +
      'colocarlas. Siguen siendo las mismas, no hay que buscarlas otra vez.</div>' +
      '<button id="cfgMapaNuevo" class="sec" style="margin-top:8px">Borrar el dibujo y colocarlas de nuevo</button>';
  o += '<h2>Cuidado</h2><div class="fila">' +
    '<button id="cfgBorrarTags" class="ghost peligro">Olvidar placas y cartas</button>' +
    '<button id="cfgOlvidar" class="ghost peligro">Olvidar las losetas</button></div>';
  return o;
}

function pintaCfg() {
  var c = st.cfg;
  var top = '<div class="top' + (vivo ? '' : ' caido') + '"><span class="dot ' + (vivo ? '' : 'off') + '"></span>' +
    '<span>' + (vivo ? '<b>Configurar la mesa</b>' : 'sin conexión con la mesa') + '</span>' +
    '<span class="dcha"><button class="fs" id="cfgSalir" style="font-size:15px">Salir &#10005;</button></span></div>';
  var dib = c.ls.length ? cfgDibujo(c) : '<div class="calma"><b>Todavía no hay losetas</b>Pulsa Buscar losetas.</div>';
  if (horizontal()) {
    pon('cfg-h', top + '<div class="horiz"><div class="izq"><div class="main">' + dib + '</div></div>' +
      '<div class="der"><div class="main">' + cfgPanel(c) + '</div></div></div>' + caidaHtml());
  } else {
    pon('cfg-v', top + '<div class="main">' + dib + cfgPanel(c) + '</div>' + caidaHtml());
  }
}

function ataCfg() {
  function por(id, fn) { var e = $(id); if (e) e.onclick = fn; }
  function elige(d) {
    cfgSel = d;
    var l = cfgLoseta(d);
    if (l && l[1]) manda({ t: 'ver', d: d });
    pinta();
  }
  por('cfgSalir', function () { cfgSel = 0; manda({ t: 'cfg', s: 0 }); });
  por('cfgBuscar', function () { manda({ t: 'buscar' }); espera('cfgBuscar', 15000, true); });
  por('cfgVer', function () { manda({ t: 'ver', d: cfgSel }); });
  por('cfgSinPos', function () { manda({ t: 'sinpos', d: cfgSel }); });
  por('cfgDesel', function () { cfgSel = 0; pinta(); });
  por('cfgRegPlaca', function () { manda({ t: 'registrar', s: 1, q: cfgTipo }); });
  por('cfgRegCarta', function () { manda({ t: 'registrar', s: 2, q: cfgObj }); });
  por('cfgRegNada', function () { manda({ t: 'registrar', s: 0, q: 0 }); });
  por('cfgMapaNuevo', function () {
    pide('¿Borrar el dibujo?', 'Se borra dónde está cada loseta en el dibujo. Luego, pon una figura en cada una y toca su hueco.',
      'Borrar el dibujo', function () { cfgSel = 0; manda({ t: 'sinpos', d: 0 }); });
  });
  por('cfgBorrarTags', function () {
    pide('¿Olvidar placas y cartas?', 'El cerebro olvidará todas las placas y cartas registradas. Habrá que registrarlas otra vez.',
      'Olvidarlas', function () { manda({ t: 'borrartags' }); });
  });
  por('cfgOlvidar', function () {
    pide('¿Olvidar las losetas?', 'El cerebro olvidará todas las losetas y dónde está cada una. Habrá que buscarlas y colocarlas otra vez.',
      'Olvidarlas', function () { cfgSel = 0; manda({ t: 'olvidar' }); });
  });
  var ti = $('cfgTipo');
  if (ti) ti.onchange = function () { cfgTipo = +ti.value; };
  var oj = $('cfgObj');
  if (oj) oj.onchange = function () { cfgObj = +oj.value; };
  $$('[data-cd]').forEach(function (b) { b.onclick = function () { elige(+b.getAttribute('data-cd')); }; });
  $$('.cfg [data-d]').forEach(function (g) { g.onclick = function () { elige(+g.getAttribute('data-d')); }; });
  $$('.cfg .hueco').forEach(function (g) {
    g.onclick = function () {
      if (!cfgSel) { toast('Elige antes una loseta', 1); suena('bloqueado'); sacude(g); return; }
      manda({ t: 'pos', d: cfgSel, q: +g.getAttribute('data-q'), r: +g.getAttribute('data-r') });
    };
  });
  ataComun();
}

function pinta() {
  if (!vivo && !caidoDesde) { caidoDesde = Date.now(); setTimeout(pinta, 2600); }
  if (vivo) caidoDesde = 0;
  if (!st) {
    pon('conectando', portada() + topHtml() + '<div class="mid"><div class="logo">KORUM</div>' +
      (bleToque() && !vivo ? '<div class="lema">Para jugar, conecta este móvil con la mesa.</div>' + bleBoton() :
        rueda() + '<div class="estado">Conectando</div><div class="sub">Buscando la mesa…</div>') + '</div>');
    return;
  }
  if (st.lleno) { pon('lleno', portada() + topHtml() + '<div class="mid"><h1>Mesa llena</h1><div class="sub">Ya hay seis móviles jugando.</div></div>'); return; }
  if (st.cfg) { pintaCfg(); return; }
  if (exitoHasta && Date.now() < exitoHasta) { pintaExito(); return; }
  if (!st.v) { pintaSinFigura(); return; }
  pintaConFigura();
}
window.korumPinta = pinta;
window.addEventListener('korum-ble', function () { if (pend && pend.id === 'bleConectar') pend = null; pinta(); });

// Lo que hay en casi todas las pantallas: ajustes, pantalla completa, Bluetooth
function ataComun() {
  var b = $('fs');
  if (b) b.onclick = toggleFS;
  var aj = $('ajustes');
  if (aj) aj.onclick = function (e) { e.stopPropagation(); ajAbierto = !ajAbierto; pinta(); };
  var ce = $('cfgEntrar');
  if (ce) ce.onclick = function () { cfgUs = -1; manda({ t: 'cfg', s: 1 }); espera('cfgEntrar'); };
  var so = $('sonidoAj');
  if (so) so.onclick = function () { if (window.Sonido) Sonido.pon(!Sonido.activo); pinta(); };
  var rc = $('recargar');
  if (rc) rc.onclick = function () { location.reload(); };
  var bl = $('bleConectar');
  if (bl) bl.onclick = function () {
    var pr;
    try { pr = window.bleConectar(); } catch (e) { toast('No se ha podido abrir el Bluetooth', 2); return; }
    espera('bleConectar', 12000, true);
    // si cierran la lista sin elegir, ble.js sigue pidiendo el toque: el boton vuelve a estar listo
    if (pr && pr.then) pr.then(function () {
      if (pend && pend.id === 'bleConectar' && window.bleNecesitaToque) { pend = null; pinta(); }
    }, function () {});
  };
}

function ata() {
  if (st && st.cfg) { ataCfg(); return; }
  ataComun();
  var nh = $('nombreH');
  if (nh) nh.oninput = function () {
    var l = limpiaNombre(nh.value);
    if (l !== nh.value.toUpperCase()) nh.value = l;
    nombreH = l;
    var bo = $('nombreOk');
    if (bo) {
      if (l.trim().length < 2) { bo.setAttribute('aria-disabled', 'true'); bo.setAttribute('data-por', 'Escribe antes su nombre: al menos 2 letras'); }
      else { bo.removeAttribute('aria-disabled'); bo.removeAttribute('data-por'); }
    }
  };
  var nok = $('nombreOk');
  if (nok) nok.onclick = function () {
    var n = limpiaNombre(nombreH).trim();
    if (n.length < 2) return;
    nombreListo = true; nombreHeroe = n;
    manda({ t: 'nombre', n: n });
    pinta();
  };
  if (nh && nok) nh.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); nok.click(); } };
  var nco = $('nombreOtra');
  if (nco) nco.onclick = function () { nombreListo = false; nombreH = nombreHeroe; pinta(); };
  var ay = $('ayuda');
  if (ay) ay.onclick = function () { ayudaAbierta = !ayudaAbierta; pinta(); };
  var v = $('vincular');
  if (v) v.onclick = function () { manda({ t: 'vincular' }); espera('vincular'); };
  var ca = $('cancelar');
  if (ca) ca.onclick = function () { manda({ t: 'cancelar' }); espera('cancelar'); };
  var so = $('soltar');
  if (so) so.onclick = function () {
    pide('¿Soltar la figura?', 'Este móvil dejará de ser la ficha de ' + (st.h ? st.h.n : 'esta figura') +
      '. El héroe queda guardado en la mesa (y en la figura, si está en una loseta): vuelve a vincularla cuando quieras.',
      'Soltar la figura', function () { manda({ t: 'soltar' }); });
  };
  var cy = $('chipya');
  if (cy) cy.onclick = function () { manda({ t: 'chip' }); espera('chipya'); };
  var me = $('menu');
  if (me) me.onclick = function () { cartelInfo = null; manda({ t: 'menu', q: st.ca ? st.ca.s : 0 }); espera('menu'); };
  var ms = $('mesa');
  if (ms) ms.onclick = function () { cartelInfo = null; manda({ t: 'mesa', q: st.ca ? st.ca.s : 0 }); espera('mesa'); };
  var qt = $('queToca');
  if (qt) qt.onclick = function () { manda({ t: 'cerrar', q: 0 }); espera('queToca'); };
  var pi = $('pisado');
  if (pi) pi.onclick = function () { pisado = null; pinta(); };
  var va = $('vale');
  if (va) va.onclick = function () { cartelInfo = null; manda({ t: 'cerrar', q: st.ca.s }); espera('vale'); };
  $$('button[data-op]').forEach(function (x) {
    x.onclick = function () {
      if (opElegidaS === st.ca.s) return;
      opElegida = +x.getAttribute('data-op'); opElegidaS = st.ca.s;
      var s = st.ca.s;
      // si el cerebro no contesta, que se pueda volver a tocar
      setTimeout(function () {
        if (opElegidaS === s && st.ca && st.ca.s === s) {
          opElegidaS = -1; toast('La mesa no ha contestado. Vuelve a tocar.', 2); suena('error'); pinta();
        }
      }, 5000);
      if (st.ca['in']) { manda({ t: 'nombre', n: limpiaNombre(nombreH).trim() }); nombreH = ''; }
      manda({ t: 'op', q: st.ca.s, s: opElegida });
      pinta();
    };
  });
  $$('button[data-tab]').forEach(function (t) {
    t.onclick = function () { ponTab(t.getAttribute('data-tab')); };
  });
  // deslizar el dedo a los lados cambia de pestana (vertical)
  var mn = !horizontal() && $$('.main')[0];
  if (mn && st && st.v && !creando()) {
    var x0 = 0, y0 = 0, t0 = 0;
    mn.ontouchstart = function (e) { var p = e.touches[0]; x0 = p.clientX; y0 = p.clientY; t0 = Date.now(); };
    mn.ontouchend = function (e) {
      var p = e.changedTouches[0], dx = p.clientX - x0, dy = p.clientY - y0;
      if (Date.now() - t0 > 600 || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
      var orden = ['juego', 'hoja', 'mapa'], i = orden.indexOf(tabActual()) + (dx < 0 ? 1 : -1);
      if (i < 0 || i >= orden.length) { sacude(mn); return; }
      suena('toque'); ponTab(orden[i]);
    };
  }
}
var tabDir = '';
function ponTab(nueva) {
  var orden = horizontal() ? ['mapa', 'hoja', 'diario'] : ['juego', 'hoja', 'mapa'];
  var a = orden.indexOf(tabActual()), b = orden.indexOf(nueva);
  if (a === b) return;
  tabDir = b > a ? 'dch' : 'izq';
  tab = nueva;
  try { localStorage.setItem('korum_movil_tab', tab); } catch (e) {}
  pinta();
}

/* ── Lo que cambia entre un estado y el siguiente: efectos y sonidos ──
   Si el cartel nuevo trae una tirada, primero cae el dado y despues se ve lo que
   ha hecho: el golpe al bicho y luego el tuyo. Hasta entonces las barras se
   quedan como estaban (vidaRetenida, bichoRetenido) */
var tiempos = [];
function aLas(ms, fn) { tiempos.push(setTimeout(fn, ms)); }
function efectos(antes) {
  var h0 = antes && antes.h, h = st.h;
  var c = st.ca, c0 = antes && antes.ca, nuevo = c && (!c0 || c0.s !== c.s) && antes;
  var t = nuevo ? tiradaDe(c.tx) : null;
  var espera0 = t && !dadosVistos[c.s] && cartelSeVe() && !quieto() && window.Dado ? Dado.DUR + 250 : 0;
  var turno = false, base = espera0;
  // el bicho
  if (nuevo && c0 && esLucha(c.ar) && esLucha(c0.ar)) {
    var b0 = bichoDe(c0.tx), b1 = bichoDe(c.tx);
    if (b0 && b1 && b0.n === b1.n && b1.hp < b0.hp) {
      if (espera0) bichoRetenido = { n: b0.n, hp: b0.hp };
      aLas(base, function () { golpeBicho(b0.hp - b1.hp, b0.hp, b1.hp); });
      base += 650;
    }
  }
  if (h0 && h && h0.n === h.n) {
    if (h.hp < h0.hp) {
      if (base) vidaRetenida = h0.hp;
      aLas(base, function () { fx('golpe', h0.hp - h.hp, h0.hp); });
    } else if (h.hp > h0.hp && h.hm === h0.hm) {
      if (base) vidaRetenida = h0.hp;
      aLas(base, function () { fx('cura', h.hp - h0.hp, h0.hp); });
    }
    if (h.o !== h0.o) { oroVisto = h0.o; aLas(base + 250, function () { fx('oro', h.o - h0.o, h0.o); }); }
    if (h.l > h0.l) aLas(base + 400, function () { fx('nivel', h.l); });
  }
  if (antes && st.j && st.j.mt && !(antes.j && antes.j.mt)) { turno = true; aLas(200, function () { fx('turno'); }); }
  if (nuevo) {
    if (t) {
      // suena el dado mismo (dado.js): lanzar, rebotes y el resultado
    } else if (turno) {
      // la cinta de "tu turno" ya suena
    } else if (esLucha(c.ar) && !(c0 && esLucha(c0.ar))) suena('combate');
    else if (c.k === 4 || c.k === 7) suena('exito');
    else if (c.op && c.op.length > 1) suena('decide');
    else suena('abrir');
  }
}
// Al bicho le quitan vida: la barra cae y tiembla, un tajo cruza la escena, el
// bicho se ilumina y retrocede, y el numero sale flotando
function golpeBicho(n, de, a) {
  bichoRetenido = null;
  pinta();
  var esc = scrEl && scrEl.querySelector('.escena.lucha'), bar = scrEl && scrEl.querySelector('.vidaB .bar');
  sacude(bar, true);
  if (bar && bar.animate) bar.animate([{ filter: 'brightness(2.4)' }, { filter: 'brightness(1)' }], { duration: 380 });
  cuentaNum(scrEl && scrEl.querySelector('.n-hpb'), de, a, 600);
  var bi = esc && esc.querySelector('.bicho');
  if (bi && bi.animate && !quieto()) {
    bi.animate([{ filter: 'brightness(2.6) saturate(0)', transform: 'translateX(-50%) scale(.95)' },
      { filter: 'brightness(1)', transform: 'translateX(-50%) scale(1)' }], { duration: 420, easing: 'ease-out' });
  }
  var zona = esc || (scrEl && scrEl.querySelector('.horiz .der'));
  if (zona && !quieto()) {
    var r = zona.getBoundingClientRect();
    fxPon('<div class="tajo" style="left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px"><i></i></div>', 700);
  }
  fxSobre('.vidaB .bar', '&minus;' + n, '#ffcf9a');
  suena('tajo'); zumba(30, 'golpe');
}
/* ── El socket, con el latido de CerebroKorum (el WebSocket de un movil que se
   ha dormido se queda "abierto" y mudo: sin latido no hay forma de saberlo) ── */
function manda(o) {
  if (!ws || ws.readyState !== 1) return;
  o.tk = tk;
  ws.send(JSON.stringify(o));
}
var ultimoRaw = '', ultimoLatido = 0, reconectando = false;
var LATIDO_MS = 3000, MUERTO_MS = 11000;

function reconectaPronto(ms) {
  if (reconectando) return;
  reconectando = true;
  setTimeout(conecta, ms);
}

function recibe(raw) {
  if (raw === ultimoRaw) return;
  ultimoRaw = raw;
  var antes = st, nuevo;
  try { nuevo = JSON.parse(raw); } catch (e) { return; }
  st = nuevo;
  // la mesa ha contestado: lo que esperaba deja de esperar (y se cuadra con lo que llega)
  if (pend && pend.id !== 'bleConectar') pend = null;
  if (st.cfg) {
    if (cfgUs >= 0 && st.cfg.us !== cfgUs && st.cfg.ul) { cfgSel = st.cfg.ul; zumba(40); suena('toque'); }
    cfgUs = st.cfg.us;
    if (cfgSel && !cfgLoseta(cfgSel)) cfgSel = 0;
  }
  if (st.h || !st.v) nombreListo = false;
  if (st.tk && st.tk !== tk) {
    tk = st.tk;
    try { localStorage.setItem('korum_movil_tk', tk); } catch (e) {}
  }
  // El sitio donde estas: para el fondo de los PNJ
  if (st.ca && st.ca.ar && st.ca.ar.indexOf('Loc') === 0) ultimoLugar = st.ca.ar;
  else if (st.m) st.m.forEach(function (t) { if ((t[4] & 1) && t[3] && lugarDe(t[3]) && !ultimoLugar) ultimoLugar = lugarDe(t[3]); });
  if (st.lg && st.lg.length) {
    var ult = st.lg[st.lg.length - 1];
    if (vistoLog >= 0 && ult[0] !== vistoLog) { toast(ult[2], ult[1]); if (ult[1] === 6) suena('objeto', 300); }
    vistoLog = ult[0];
  }
  var ahora = Date.now();
  if (st.ca && (!cartelInfo || cartelInfo.s !== st.ca.s)) {
    if (cartelInfo && ahora - cartelInfo.t < 3000)
      pisado = { s: cartelInfo.s, ti: cartelInfo.ti, tx: cartelInfo.tx, k: cartelInfo.k, hasta: ahora + 8000 };
    cartelInfo = st.ca.op && st.ca.op.length ? null :
      { s: st.ca.s, ti: st.ca.ti, tx: st.ca.tx, k: st.ca.k, t: ahora };
    if (pisado) setTimeout(function () { if (pisado && Date.now() >= pisado.hasta) { pisado = null; pinta(); } }, 8100);
  }
  if (st.ca && st.ca.op && st.ca.op.length && (!antes || !antes.ca || antes.ca.s !== st.ca.s)) {
    if (!horizontal() && tab !== 'juego') { tab = 'juego'; }
    if (!(st.j && st.j.mt && !(antes && antes.j && antes.j.mt))) zumba(50, 'cartel');
  }
  if (antes && antes.bu && !antes.v && st.v && !st.cfg) {
    exitoHasta = Date.now() + EXITO_MS;
    setTimeout(pinta, EXITO_MS + 50);
    zumba([30, 70, 30, 70, 90], 'figura');
    suena('figura');
  } else if (!st.cfg) efectos(antes);
  pinta();
}

function conecta() {
  reconectando = false;
  try { if (ws) { ws.onclose = null; ws.onerror = null; ws.onmessage = null; ws.close(); } } catch (e) {}
  ws = new WebSocket('ws://' + location.host + '/ws');
  ultimoLatido = Date.now();
  ws.onopen = function () {
    vivo = true;
    if (pend && pend.id === 'bleConectar') pend = null;
    ultimoRaw = '';
    ultimoLatido = Date.now();
    manda({ t: 'hello' });
    pinta();
  };
  ws.onmessage = function (e) {
    ultimoLatido = Date.now();
    if (!vivo) { vivo = true; pinta(); }
    if (e.data.indexOf('"pong"') >= 0) return;
    recibe(e.data);
  };
  ws.onclose = function () { vivo = false; pinta(); reconectaPronto(700); };
  ws.onerror = function () { try { ws.close(); } catch (e) {} };
}

setInterval(function () {
  if (!ws) { reconectaPronto(0); return; }
  if (ws.readyState === 1) {
    if (Date.now() - ultimoLatido > MUERTO_MS) { vivo = false; pinta(); try { ws.close(); } catch (e) {} }
    else { try { ws.send('{"t":"ping"}'); } catch (e) {} }
  } else if (ws.readyState === 3) reconectaPronto(0);
}, LATIDO_MS);

function despierta() {
  if (document.visibilityState === 'hidden') return;
  if (!ws || ws.readyState !== 1) { reconectaPronto(0); return; }
  var marca = ultimoLatido;
  try { ws.send('{"t":"ping"}'); } catch (e) { reconectaPronto(0); return; }
  setTimeout(function () {
    if (ultimoLatido === marca) { vivo = false; pinta(); try { ws.close(); } catch (e2) {} reconectaPronto(0); }
  }, 2000);
}
document.addEventListener('visibilitychange', despierta);
window.addEventListener('pageshow', despierta);
window.addEventListener('focus', despierta);
window.addEventListener('online', despierta);

pinta();
conecta();
