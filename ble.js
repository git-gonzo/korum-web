/* ble.js — el cerebro de la mesa por Bluetooth (Web Bluetooth), con forma de WebSocket.
 *
 * La pagina habla con el cerebro con un WebSocket (conecta() / manda() en index.html).
 * Igual que maqueta.js, este fichero sustituye window.WebSocket por otra cosa con la
 * misma forma (readyState, send, close, onopen, onmessage, onclose), asi que la
 * pagina no cambia. Lo que viaja es el mismo JSON (CerebroMovil/MovilBLE.h).
 *
 * Funciona en Chrome (Android, PC) y en Bluefy (iPhone). Safari no tiene Web Bluetooth.
 *
 * Elegir el cerebro la primera vez exige un toque del jugador: mientras haga falta,
 * window.bleNecesitaToque es true y window.bleConectar() abre la lista. Si la pagina
 * pone window.bleBotonPropio = true pinta ella el boton; si no, sale uno de aqui.
 * Despues, al cortarse, se reconecta solo al mismo aparato (sin toque).
 *
 * Lo que manda el cerebro llega en trozos: [banderas][id][datos...], con
 * bit0 = primer trozo y bit1 = ultimo. Aqui se juntan.
 */
(function () {
  if (/maqueta|catalogo/.test(location.search)) return;   // la maqueta trae su cerebro de mentira

  var SERV = '6b6f7275-6d00-4000-8000-000000000001';
  var ESTADO = '6b6f7275-6d00-4000-8000-000000000002';
  var ORDEN = '6b6f7275-6d00-4000-8000-000000000003';
  var MAX_ESCRITURA = 180;           // lo que cabe seguro en una escritura (MTU del iPhone)

  window.bleNecesitaToque = false;

  // ── El boton propio (si la pagina no pone el suyo) ──
  var capa = null;
  function pintaCapa(modo) {
    if (window.bleBotonPropio && modo !== 'sin') { quitaCapa(); return; }
    if (!document.body) { document.addEventListener('DOMContentLoaded', function () { pintaCapa(modo); }); return; }
    if (!capa) {
      capa = document.createElement('div');
      capa.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9999;padding:16px 16px calc(16px + env(safe-area-inset-bottom));' +
        'background:linear-gradient(transparent,rgba(10,8,14,.92) 30%);display:flex;flex-direction:column;align-items:center;gap:8px;' +
        'font:16px/1.35 system-ui,sans-serif;color:#ece7f2;text-align:center';
      document.body.appendChild(capa);
    }
    if (modo === 'sin') {
      capa.innerHTML = '<div style="max-width:420px">Este navegador no tiene Bluetooth.<br>' +
        'En <b>iPhone</b>, abre esta página con la app <b>Bluefy</b>. En <b>Android</b>, con <b>Chrome</b>.</div>';
      return;
    }
    capa.innerHTML = '<button type="button" style="font:600 18px system-ui,sans-serif;padding:14px 28px;border:0;border-radius:12px;' +
      'background:#d9b45a;color:#1a1407;min-width:260px">Conectar con la mesa</button>' +
      '<div style="font-size:13px;opacity:.75">Sale una lista: elige <b>Korum</b></div>';
    capa.querySelector('button').onclick = function () { window.bleConectar(); };
  }
  function quitaCapa() { if (capa) { capa.remove(); capa = null; } }

  function pideToque(si) {
    window.bleNecesitaToque = si;
    if (si) pintaCapa('toque'); else quitaCapa();
    if (typeof window.pinta === 'function') { try { window.pinta(); } catch (e) {} }
  }

  if (!navigator.bluetooth) {
    window.bleSinBluetooth = true;
    pintaCapa('sin');
    return;                          // se queda el WebSocket de siempre (no llegara a nada)
  }

  var disp = null;                   // el cerebro elegido (BluetoothDevice)
  var chOrden = null;
  var actual = null;                 // el "socket" que esta en uso
  var fallos = 0;
  var cola = Promise.resolve();      // Web Bluetooth no deja dos escrituras a la vez
  var enc = new TextEncoder(), dec = new TextDecoder();
  var trozos = [], trozoId = -1;

  function cierra(ws) {
    if (ws.readyState === 3) return;
    ws.readyState = 3;
    if (ws.onclose) { try { ws.onclose({ code: 1006 }); } catch (e) { console.error(e); } }
  }

  function alTrozo(ev) {
    var dv = ev.target.value;
    if (dv.byteLength < 2) return;
    var b = dv.getUint8(0), id = dv.getUint8(1);
    var datos = new Uint8Array(dv.buffer.slice(dv.byteOffset + 2, dv.byteOffset + dv.byteLength));
    if (b & 1) { trozos = []; trozoId = id; }
    else if (id !== trozoId) { trozos = []; trozoId = -1; return; }   // se perdio el principio
    trozos.push(datos);
    if (!(b & 2)) return;
    var n = 0, i;
    for (i = 0; i < trozos.length; i++) n += trozos[i].length;
    var todo = new Uint8Array(n), o = 0;
    for (i = 0; i < trozos.length; i++) { todo.set(trozos[i], o); o += trozos[i].length; }
    trozos = []; trozoId = -1;
    if (actual && actual.readyState === 1 && actual.onmessage) {
      try { actual.onmessage({ data: dec.decode(todo) }); } catch (e) { console.error(e); }
    }
  }

  function alCortar() {
    if (actual && actual.readyState === 1) cierra(actual);
  }

  function abrir(ws) {
    if (ws !== actual || ws.readyState !== 0) return;
    disp.gatt.connect().then(function (srv) {
      return srv.getPrimaryService(SERV);
    }).then(function (s) {
      return Promise.all([s.getCharacteristic(ESTADO), s.getCharacteristic(ORDEN)]);
    }).then(function (ch) {
      if (ws !== actual || ws.readyState !== 0) throw new Error('sustituido');
      chOrden = ch[1];
      if (!ch[0]._korum) { ch[0]._korum = 1; ch[0].addEventListener('characteristicvaluechanged', alTrozo); }
      return ch[0].startNotifications();
    }).then(function () {
      if (ws !== actual || ws.readyState !== 0) return;
      fallos = 0;
      ws.readyState = 1;
      pideToque(false);
      if (ws.onopen) ws.onopen({});
    }).catch(function (e) {
      if (String(e && e.message) === 'sustituido') return;
      console.warn('[ble] no conecta:', e && e.message);
      // Tres seguidas sin conectar: que se pueda volver a elegir (otro cerebro, o
      // uno que se ha reiniciado y el movil ya no reconoce)
      if (++fallos >= 3) pideToque(true);
      cierra(ws);                    // la pagina vuelve a intentarlo sola
    });
  }

  function KorumBLE(url) {
    this.url = url;
    this.readyState = 0;
    this.onopen = this.onmessage = this.onclose = this.onerror = null;
    if (actual && actual !== this && actual.readyState < 2) actual.readyState = 3;
    actual = this;
    var yo = this;
    if (disp) { setTimeout(function () { abrir(yo); }, 0); return; }
    // Un cerebro que ya se eligio antes (Chrome lo recuerda; Bluefy puede que no)
    var antes = navigator.bluetooth.getDevices ? navigator.bluetooth.getDevices() : Promise.resolve([]);
    antes.then(function (lista) {
      var d = (lista || []).filter(function (x) { return x.name === 'Korum'; })[0];
      if (d && !disp) { usa(d); abrir(yo); }
      else if (!disp) pideToque(true);
    }).catch(function () { if (!disp) pideToque(true); });
  }
  KorumBLE.CONNECTING = 0; KorumBLE.OPEN = 1; KorumBLE.CLOSING = 2; KorumBLE.CLOSED = 3;

  KorumBLE.prototype.send = function (txt) {
    if (this.readyState !== 1 || !chOrden) return;
    var b = enc.encode(txt);
    if (b.length > MAX_ESCRITURA) console.warn('[ble] mensaje de ' + b.length + ' B: puede no llegar entero');
    var ch = chOrden;
    cola = cola.then(function () {
      return ch.writeValueWithoutResponse ? ch.writeValueWithoutResponse(b) : ch.writeValue(b);
    }).catch(function (e) { console.warn('[ble] no sale:', e && e.message); });
  };

  KorumBLE.prototype.close = function () {
    if (this.readyState >= 2) return;
    var era = this === actual && this.readyState === 1;
    this.readyState = 3;
    // Solo se suelta la radio si este era el que estaba en uso (el latido de la
    // pagina cierra un socket "mudo" para abrir otro)
    if (era) { try { if (disp && disp.gatt.connected) disp.gatt.disconnect(); } catch (e) {} }
  };

  function usa(d) {
    disp = d;
    d.addEventListener('gattserverdisconnected', alCortar);
  }

  // Tiene que llamarse desde un toque (lo exige el navegador)
  window.bleConectar = function () {
    return navigator.bluetooth.requestDevice({
      filters: [{ services: [SERV] }, { name: 'Korum' }],
      optionalServices: [SERV]
    }).then(function (d) {
      if (disp && disp !== d) { try { disp.removeEventListener('gattserverdisconnected', alCortar); if (disp.gatt.connected) disp.gatt.disconnect(); } catch (e) {} }
      if (disp !== d) usa(d);
      fallos = 0;
      pideToque(false);
      if (actual && actual.readyState === 0) abrir(actual);
      else if (actual && actual.readyState === 1) cierra(actual);   // estaba con otro: de nuevo
    }).catch(function (e) {
      console.warn('[ble] no se ha elegido:', e && e.message);
      pideToque(true);
    });
  };

  window.WebSocket = KorumBLE;
})();
