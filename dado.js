/* dado.js - un d20 de verdad: un icosaedro de 20 caras en CSS 3D que cae, rebota,
   rueda y se para con el numero que ha salido mirando al jugador.

     Dado.monta(caja, n, { a: 40, rapido: false, alto: 220,
                           alLanzar(), alRebote(i), alFinal(d20) })

   caja  el sitio donde va (korum.js le pone data-fx para que el morph no lo toque)
   n     el resultado (1..20): esa cara acaba de frente y derecha
   a     el lado de cada triangulo en px (el dado mide ~1,9 a)
   rapido  sin animacion: el dado ya parado (fotos, "reducir movimiento", un cartel
           que ya se ha visto)
   alto  desde cuanto mas arriba cae, en px

   Todo se mueve con un requestAnimationFrame: cada frame se calcula la rotacion
   (matriz 3x3), se pone en el cuerpo con matrix3d y se sombrea cada cara segun lo
   que mira a la luz (opacidad de una capa negra: barato en un iPhone). Dura DUR ms. */
(function () {
  var DUR = 1300;
  var PHI = (1 + Math.sqrt(5)) / 2;
  var V = [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI],
           [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]];
  var F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2],
           [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5],
           [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];     // arista = 2

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cruz(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function pp(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function nor(a) { var l = Math.sqrt(pp(a, a)); return [a[0] / l, a[1] / l, a[2] / l]; }
  // matrices 3x3 por filas, en un array de 9
  function mul(A, B) {
    var C = [];
    for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++)
      C.push(A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]);
    return C;
  }
  function giro(k, t) {     // Rodrigues: eje unitario k, angulo t
    var c = Math.cos(t), s = Math.sin(t), v = 1 - c, x = k[0], y = k[1], z = k[2];
    return [c + x * x * v, x * y * v - z * s, x * z * v + y * s,
            y * x * v + z * s, c + y * y * v, y * z * v - x * s,
            z * x * v - y * s, z * y * v + x * s, c + z * z * v];
  }

  // Cada cara: centro m, normal n (hacia fuera) y su base (e1 a la derecha, e2 hacia
  // abajo en la cara), con e1 x e2 = n para que el numero no salga en espejo
  var CARAS = F.map(function (f) {
    var a = V[f[0]], b = V[f[1]], c = V[f[2]];
    var m = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    var n = nor(m), u = nor(sub(a, m)), e2 = [-u[0], -u[1], -u[2]];
    return { m: m, n: n, e1: cruz(e2, n), e2: e2 };
  });
  // Numeros: las caras opuestas suman 21, como en un d20 de verdad
  var NUM = [], k = 1;
  CARAS.forEach(function (c, i) {
    if (NUM[i]) return;
    for (var j = 0; j < 20; j++) if (j !== i && pp(c.n, CARAS[j].n) < -0.99) { NUM[i] = k; NUM[j] = 21 - k; k++; return; }
  });
  var LUZ = nor([-0.35, -0.8, 0.55]);    // de arriba a la izquierda, por delante
  // de reposo, un poco inclinado: se ven las caras de alrededor y se nota que es un dado
  var INCLINA = mul(giro([1, 0, 0], -0.17), giro([0, 1, 0], 0.13));

  function f4(x) { return Math.abs(x) < 1e-6 ? '0' : x.toFixed(5); }
  function m3d(M, tx, ty) {
    return 'translate3d(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px,0) matrix3d(' +
      f4(M[0]) + ',' + f4(M[3]) + ',' + f4(M[6]) + ',0,' + f4(M[1]) + ',' + f4(M[4]) + ',' + f4(M[7]) + ',0,' +
      f4(M[2]) + ',' + f4(M[5]) + ',' + f4(M[8]) + ',0,0,0,0,1)';
  }

  function monta(caja, n, o) {
    o = o || {};
    var a = o.a || 40, s = a / 2;
    n = Math.max(1, Math.min(20, Math.round(n) || 1));
    var cual = NUM.indexOf(n), cf = CARAS[cual];
    // la rotacion final: la cara "cual" de frente (su normal a +z, su e2 hacia abajo)
    var FIN = mul(INCLINA, [cf.e1[0], cf.e1[1], cf.e1[2], cf.e2[0], cf.e2[1], cf.e2[2], cf.n[0], cf.n[1], cf.n[2]]);

    var raiz = document.createElement('div');
    raiz.className = 'd20';
    raiz.setAttribute('data-fx', '');
    raiz.style.setProperty('--a', a + 'px');
    var h = '<div class="d20-sombra"></div><div class="d20-cuerpo">';
    CARAS.forEach(function (c, i) {
      var t = 'matrix3d(' + [c.e1[0], c.e1[1], c.e1[2], 0, c.e2[0], c.e2[1], c.e2[2], 0, c.n[0], c.n[1], c.n[2], 0,
        c.m[0] * s, c.m[1] * s, c.m[2] * s, 1].map(f4).join(',') + ')';
      var v = NUM[i];
      h += '<div class="f' + (i === cual ? ' frente' : '') + '" style="transform:' + t + '"><b' + (v === 6 || v === 9 ? ' class="raya"' : '') +
        '>' + v + '</b><i></i></div>';
    });
    raiz.innerHTML = h + '</div>';
    caja.appendChild(raiz);
    var cuerpo = raiz.querySelector('.d20-cuerpo'), sombra = raiz.querySelector('.d20-sombra');
    var sombras = [].map.call(raiz.querySelectorAll('.f i'), function (e) { return e; });

    function pose(R, x, y, sx, sy) {
      var M = sx === 1 && sy === 1 ? R : [R[0] * sx, R[1] * sx, R[2] * sx, R[3] * sy, R[4] * sy, R[5] * sy, R[6], R[7], R[8]];
      cuerpo.style.transform = m3d(M, x, y);
      for (var i = 0; i < 20; i++) {
        var nn = CARAS[i].n;
        var w = [R[0] * nn[0] + R[1] * nn[1] + R[2] * nn[2], R[3] * nn[0] + R[4] * nn[1] + R[5] * nn[2], R[6] * nn[0] + R[7] * nn[1] + R[8] * nn[2]];
        var d = pp(w, LUZ);
        sombras[i].style.opacity = (0.08 + 0.62 * (1 - Math.max(0, d))).toFixed(2);
      }
      var alto = Math.min(1, -y / 260);
      sombra.style.transform = 'translate3d(' + (x * 0.8).toFixed(1) + 'px,0,0) scale(' + (1 - 0.55 * alto).toFixed(3) + ')';
      sombra.style.opacity = (0.75 - 0.6 * alto).toFixed(2);
    }

    function fin() {
      pose(FIN, 0, 0, 1, 1);
      raiz.classList.add('quieto');
      if (o.alFinal) try { o.alFinal(raiz); } catch (e) {}
    }
    if (o.rapido || !window.requestAnimationFrame) { fin(); return raiz; }

    // El lanzamiento: cae de arriba a la derecha, rebota tres veces cada vez menos y
    // el giro se va frenando hasta quedarse en FIN
    var H0 = o.alto || 220, X0 = Math.min(90, a * 2.2);
    var rnd = Math.random;
    var eje = nor([0.75 + rnd() * 0.3, -0.45 + rnd() * 0.9, -0.3 + rnd() * 0.6]);
    var eje2 = nor([rnd() - 0.5, 1, rnd() - 0.5]);
    var VUELTAS = Math.PI * 2 * (2.2 + rnd() * 0.8), VUELTAS2 = Math.PI * (0.6 + rnd() * 0.8);
    // contactos con la mesa (fraccion de DUR) y altura del bote que sigue a cada uno
    var BOTES = [[0.30, 0.58, 0.22], [0.58, 0.76, 0.075], [0.76, 0.87, 0.022]];
    var t0 = 0, ultimoBote = -1;
    function y(t) {
      if (t < BOTES[0][0]) { var q = t / BOTES[0][0]; return -H0 * (1 - q * q); }
      for (var i = 0; i < BOTES.length; i++) {
        var b = BOTES[i];
        if (t < b[1]) { var u = (t - b[0]) / (b[1] - b[0]); return -H0 * b[2] * 4 * u * (1 - u); }
      }
      return 0;
    }
    function aplasta(t) {     // al tocar la mesa se chafa un poco
      for (var i = 0; i < BOTES.length; i++) {
        var dt = Math.abs(t - BOTES[i][0]) * DUR;
        if (dt < 45) return (1 - dt / 45) * [0.14, 0.08, 0.04][i];
      }
      return 0;
    }
    function frame(ahora) {
      if (!t0) t0 = ahora;
      if (!raiz.isConnected) return;          // el cartel se ha ido mientras caia
      var t = Math.min(1, (ahora - t0) / DUR);
      for (var i = ultimoBote + 1; i < BOTES.length; i++) if (t >= BOTES[i][0]) {
        ultimoBote = i;
        if (o.alRebote) try { o.alRebote(i); } catch (e) {}
      }
      var g = Math.pow(1 - Math.min(1, t / 0.92), 2.4);      // lo que queda de giro
      var R = mul(giro(eje, VUELTAS * g), mul(giro(eje2, VUELTAS2 * g * g), FIN));
      var x = X0 * Math.pow(1 - Math.min(1, t / 0.85), 2), ap = aplasta(t);
      pose(R, x, y(t), 1 + ap * 0.6, 1 - ap);
      if (t < 1) requestAnimationFrame(frame); else fin();
    }
    pose(mul(giro(eje, VUELTAS), mul(giro(eje2, VUELTAS2), FIN)), X0, -H0, 1, 1);
    if (o.alLanzar) try { o.alLanzar(); } catch (e) {}
    requestAnimationFrame(frame);
    return raiz;
  }

  window.Dado = { monta: monta, DUR: DUR };
})();
