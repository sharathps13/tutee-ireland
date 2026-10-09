/* ==========================================================================
   Tutee Connect — Ireland: living hero photo
   --------------------------------------------------------------------------
   Turns the still Cliffs of Moher sunset photo into a cinemagraph with a
   WebGL shader. Only what moves in real life moves:
     - the sea swells towards the shore in perspective and glitters where the
       sun hits it; foam along the cliff foot breathes
     - the clouds drift and slowly change shape
     - the foreground grass sways in gusts of wind
     - the low sun glows a little brighter and dimmer
   The cliffs, the sea stack and the beach stay rock-still.

   Region masks (sea / sky / grass) are computed at load time from the
   photo's own colours inside hand-placed outlines of each region, so they
   follow the real edges of the cliffs. The original photo is the only
   picture used; nothing is generated.

   Without WebGL, with reduced motion or with data saver on, nothing here
   runs and the plain photo already in the page stays.
   ========================================================================== */
(function () {
  'use strict';

  var host = document.querySelector('[data-hero-fx]');
  if (!host) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var conn = navigator.connection || {};
  if (reduce || conn.saveData) return;

  // Same URLs as the fallback <img>'s srcset, so the browser reuses its download.
  var PHOTO = 'https://images.unsplash.com/photo-1591387091135-1bd5a83d27ab?auto=format&fit=crop&q=80&w=';
  var WIDTHS = [1280, 1920, 2560, 3400];
  var ASPECT = 6219 / 4147;
  var POS = [0.62, 0.5];      // matches the CSS object-position of the fallback
  var FOCUS = [0.74, 0.36];   // the slow camera push drifts towards the sun

  /* ------------------------------------------------------------------ *
   * Region masks
   * ------------------------------------------------------------------ */
  // Outlines in image coordinates (0..1, origin top-left). Deliberately
  // generous: the colour tests decide the real edges.
  var SEA = [[0.50, 0.352], [1.0, 0.345], [1.0, 0.600], [0.80, 0.690], [0.64, 0.800], [0.46, 0.900],
             [0.30, 0.975], [0.22, 1.0], [0.085, 1.0], [0.06, 0.82], [0.065, 0.67], [0.11, 0.59],
             [0.20, 0.535], [0.31, 0.505], [0.42, 0.493], [0.50, 0.493]];
  var GRASS = [[1.0, 0.555], [1.0, 1.0], [0.16, 1.0], [0.34, 0.935], [0.52, 0.845], [0.68, 0.745],
               [0.82, 0.665], [0.92, 0.605]];
  var GRASS_EDGE = [[0.16, 1.0], [0.34, 0.935], [0.52, 0.845], [0.68, 0.745], [0.82, 0.665], [0.92, 0.605], [1.0, 0.555]];
  var STACK = [0.555, 0.375, 0.625, 0.505];
  var TOWER = [0.392, 0.195, 0.430, 0.262]; // O'Brien's Tower on the cliff top

  function inPoly(x, y, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function edgeY(x, pts) {
    if (x <= pts[0][0]) return pts[0][1];
    for (var i = 1; i < pts.length; i++) {
      if (x <= pts[i][0]) {
        var t = (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]);
        return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t;
      }
    }
    return pts[pts.length - 1][1];
  }
  function sstep(a, b, v) { var t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); }
  function horizon(x) { return 0.345 + (1 - x) * 0.012; }

  function buildMask(rgba, w, h) {
    var n = w * h;
    var sea = new Float32Array(n), sky = new Float32Array(n), grass = new Float32Array(n);
    for (var py = 0; py < h; py++) {
      var y = (py + 0.5) / h;
      for (var px = 0; px < w; px++) {
        var x = (px + 0.5) / w, k = py * w + px, i = k * 4;
        var r = rgba[i] / 255, g = rgba[i + 1] / 255, b = rgba[i + 2] / 255;
        var lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        var hz = horizon(x);
        if (y < hz) {
          // sky is everything above the horizon that is not dark rock
          sky[k] = sstep(0.16, 0.30, lum) * (1 - sstep(hz - 0.03, hz, y) * (x < 0.82 ? 1 : 0.6));
          if (x > TOWER[0] && x < TOWER[2] && y > TOWER[1] && y < TOWER[3]) sky[k] = 0;
        }
        if (inPoly(x, y, SEA) && y > hz + 0.006) {
          // water is blue-violet, or bright (foam, sun glitter); rock is dark green/brown
          var s = Math.max(sstep(-0.04, 0.05, b - g), sstep(0.45, 0.65, lum));
          if (x > STACK[0] && x < STACK[2] && y > STACK[1] && y < STACK[3]) s *= sstep(0.20, 0.30, lum);
          sea[k] = s;
        }
        if (inPoly(x, y, GRASS)) {
          // grass is greener than it is blue; well inside the bank it is all grass
          var gr = Math.max(sstep(-0.02, 0.06, g - b), sstep(0.03, 0.08, y - edgeY(x, GRASS_EDGE)));
          grass[k] = gr;
          sea[k] *= 1 - gr;
        }
      }
    }
    // Close small holes (shadows in the grass, dark troughs in the water),
    // then soften every edge.
    close(sea, w, h, 3); close(grass, w, h, 3);
    // Pull the moving sky back from the cliff tops so the sunlit rim of rock
    // never shimmers.
    sky.set(pass(pass(sky, w, h, 5, true, 'min'), w, h, 5, false, 'min'));
    [sea, sky, grass].forEach(function (c) { boxBlur(c, w, h, 2); boxBlur(c, w, h, 2); });
    var out = new Uint8Array(n * 4);
    for (var j = 0; j < n; j++) {
      out[j * 4] = Math.round(sea[j] * 255);
      out[j * 4 + 1] = Math.round(sky[j] * 255);
      out[j * 4 + 2] = Math.round(grass[j] * 255);
      out[j * 4 + 3] = 255;
    }
    return out;
  }

  function pass(src, w, h, rad, horiz, pick) {
    var dst = new Float32Array(src.length);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var v = pick === 'max' ? 0 : 1;
      for (var k = -rad; k <= rad; k++) {
        var xx = horiz ? x + k : x, yy = horiz ? y : y + k;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        var s = src[yy * w + xx];
        v = pick === 'max' ? Math.max(v, s) : Math.min(v, s);
      }
      dst[y * w + x] = v;
    }
    return dst;
  }
  function close(c, w, h, rad) {
    var t = pass(pass(c, w, h, rad, true, 'max'), w, h, rad, false, 'max');
    t = pass(pass(t, w, h, rad, true, 'min'), w, h, rad, false, 'min');
    c.set(t);
  }
  function boxBlur(c, w, h, rad) {
    var tmp = new Float32Array(c.length), x, y, k, s, n;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      s = 0; n = 0;
      for (k = -rad; k <= rad; k++) { var xx = x + k; if (xx >= 0 && xx < w) { s += c[y * w + xx]; n++; } }
      tmp[y * w + x] = s / n;
    }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      s = 0; n = 0;
      for (k = -rad; k <= rad; k++) { var yy = y + k; if (yy >= 0 && yy < h) { s += tmp[yy * w + x]; n++; } }
      c[y * w + x] = s / n;
    }
  }

  /* ------------------------------------------------------------------ *
   * Shader
   * ------------------------------------------------------------------ */
  var VS = 'attribute vec2 aPos; varying vec2 vUv;' +
    'void main(){ vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5); gl_Position = vec4(aPos, 0.0, 1.0); }';

  var FS = [
    'precision highp float;',
    'uniform sampler2D uImg; uniform sampler2D uMask;',
    'uniform vec2 uRes; uniform float uTime; uniform float uAspect; uniform vec2 uPos; uniform vec2 uFocus; uniform float uZoom;',
    'varying vec2 vUv;',
    // 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT)
    'vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}',
    'vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}',
    'float snoise(vec3 v){',
    ' const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);',
    ' vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);',
    ' vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);',
    ' vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;',
    ' i=mod289(i);',
    ' vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));',
    ' float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;',
    ' vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);',
    ' vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);',
    ' vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);',
    ' vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));',
    ' vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;',
    ' vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);',
    ' vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));',
    ' p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;',
    ' vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;',
    ' return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));',
    '}',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
    'vec2 coverUv(vec2 uv){',
    ' float ca = uRes.x / uRes.y;',
    ' vec2 s = ca > uAspect ? vec2(1.0, uAspect / ca) : vec2(ca / uAspect, 1.0);',
    ' vec2 p = uv * s + (1.0 - s) * uPos;',
    ' return (p - uFocus) / uZoom + uFocus;',
    '}',
    'void main(){',
    ' vec2 uv = coverUv(vUv);',
    ' vec4 m = texture2D(uMask, uv);',
    ' float t = uTime;',
    ' vec3 col = texture2D(uImg, uv).rgb;',
    ' float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));',

    // ---- Sea: a gentle swell on a perspective ground plane, rolling shorewards.
    // Seen from a cliff top, waves read as slow; detail shrinks towards the horizon.
    ' if (m.r > 0.002) {',
    '  float dy = max(uv.y - 0.345, 0.0035);',
    '  vec2 w = vec2((uv.x - 0.62) / dy, 1.0 / dy);',
    '  float n1 = snoise(vec3(w.x * 0.35, w.y * 1.15 + t * 0.20, t * 0.10));',
    '  float n2 = snoise(vec3(w.x * 0.9 + 3.7, w.y * 2.6 + t * 0.34, t * 0.16));',
    '  float n3 = snoise(vec3(w.x * 2.2 - 1.3, w.y * 5.5 + t * 0.52, t * 0.24));',
    '  vec2 seaOff = vec2(n1 * 0.55 + n2 * 0.30 + n3 * 0.15, (n1 * 0.6 - n2 * 0.25 + n3 * 0.15) * 0.65);',
    '  seaOff *= 0.0055 * dy * smoothstep(0.0, 0.03, dy);',
    // never pull rock into the water: scale by the mask where we would sample from
    '  seaOff *= texture2D(uMask, uv + seaOff).r * m.r;',
    '  col = texture2D(uImg, uv + seaOff).rgb;',
    // crests catch a touch more light than troughs
    '  col *= 1.0 + n2 * 0.035 * m.r * smoothstep(0.0, 0.08, dy);',
    // sun glitter: sharp sparkles only where the water is already lit
    '  float sp = snoise(vec3(w.x * 4.5, w.y * 9.0, t * 1.4));',
    '  sp = smoothstep(0.58, 0.93, sp) * smoothstep(0.42, 0.78, lum) * smoothstep(0.012, 0.06, dy);',
    '  col += sp * m.r * vec3(1.0, 0.86, 0.62) * 0.5;',
    // foam along the cliff foot swells and fades with the sets of waves
    '  float foam = m.r * smoothstep(0.55, 0.8, lum) * (1.0 - smoothstep(0.30, 0.45, uv.x));',
    '  col += foam * 0.06 * (0.5 + 0.5 * sin(t * 0.8 + w.y * 0.9 + n1 * 2.0));',
    ' }',

    // ---- Sky: clouds drift right and slowly reshape. Two-phase flow so the
    // drift never jumps; distant clouds near the horizon barely move.
    ' if (m.g > 0.002) {',
    '  float far = smoothstep(0.30, 0.13, uv.y);',
    '  float ph = fract(t / 34.0); float phB = fract(ph + 0.5);',
    '  float wA = 1.0 - abs(1.0 - 2.0 * ph);',
    '  vec2 morph = vec2(snoise(vec3(uv * vec2(2.4, 3.2), t * 0.025)), snoise(vec3(uv * vec2(2.4, 3.2) + 9.0, t * 0.025))) * 0.0032;',
    '  vec2 cdir = vec2(1.0, 0.06) * 0.010;',
    '  vec2 skyA = uv + (-cdir * ph + morph) * far;',
    '  vec2 skyB = uv + (-cdir * phB + morph) * far;',
    '  float kA = texture2D(uMask, skyA).g; float kB = texture2D(uMask, skyB).g;',
    '  vec3 skyCol = mix(texture2D(uImg, skyB).rgb, texture2D(uImg, skyA).rgb, wA);',
    // only use displaced sky where the source is sky too, so cliffs never smear upward
    '  float ok = min(kA, kB);',
    '  col = mix(col, skyCol, smoothstep(0.35, 1.0, m.g) * ok * ok);',
    ' }',

    // ---- Grass: gusts roll across the bank, blades flutter within them
    ' if (m.b > 0.002) {',
    '  float gust = 0.5 + 0.5 * snoise(vec3(uv.x * 1.6 - t * 0.32, uv.y * 1.6, t * 0.08));',
    '  float sway = sin(t * 1.9 + uv.x * 11.0 + uv.y * 5.0 + snoise(vec3(uv * 7.0, t * 0.35)) * 2.2);',
    '  float flutter = snoise(vec3(uv * vec2(60.0, 40.0), t * 1.6));',
    '  vec2 gOff = vec2(sway * (0.0011 + 0.0016 * gust) + flutter * 0.00035, abs(sway) * 0.00025);',
    '  gOff *= texture2D(uMask, uv + gOff).b * m.b;',
    '  col = mix(col, texture2D(uImg, uv + gOff).rgb, step(0.002, m.b));',
    ' }',

    // the low sun breathes, very slightly
    ' vec2 sd = (uv - vec2(0.965, 0.29)) * vec2(1.0, 1.6);',
    ' float sun = exp(-dot(sd, sd) * 28.0);',
    ' col += vec3(1.0, 0.70, 0.40) * sun * (0.04 + 0.025 * sin(t * 0.55)) * (m.g + 0.5 * m.r);',
    // fine film grain hides any banding from the displacement
    ' col += (hash(gl_FragCoord.xy + fract(t) * 91.0) - 0.5) * 0.016;',
    ' gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  /* ------------------------------------------------------------------ *
   * Setup
   * ------------------------------------------------------------------ */
  var canvas = document.createElement('canvas');
  canvas.className = 'hero__fx';
  canvas.setAttribute('aria-hidden', 'true');
  var gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, powerPreference: 'low-power' }) ||
           canvas.getContext('experimental-webgl');
  if (!gl) return;

  function shader(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { if (window.console) console.warn(gl.getShaderInfoLog(s)); return null; }
    return s;
  }
  var vs = shader(gl.VERTEX_SHADER, VS), fs = shader(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return;
  var prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  var aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  var U = {};
  ['uImg', 'uMask', 'uRes', 'uTime', 'uAspect', 'uPos', 'uFocus', 'uZoom'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
  gl.uniform1i(U.uImg, 0); gl.uniform1i(U.uMask, 1);
  gl.uniform1f(U.uAspect, ASPECT);
  gl.uniform2f(U.uPos, POS[0], POS[1]);
  gl.uniform2f(U.uFocus, FOCUS[0], FOCUS[1]);

  function texture(unit) {
    var tx = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tx);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tx;
  }

  var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  function size() {
    var w = Math.max(1, Math.round(host.clientWidth * dpr));
    var h = Math.max(1, Math.round(host.clientHeight * dpr));
    // keep the pixel budget sane on very large screens
    var scale = Math.min(1, Math.sqrt(2400000 / (w * h)));
    w = Math.round(w * scale); h = Math.round(h * scale);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(U.uRes, w, h);
    }
    return { w: w, h: h };
  }

  // Pick a photo width that keeps the visible crop sharp.
  var dims = size();
  var ca = dims.w / dims.h;
  var visibleFrac = ca > ASPECT ? 1 : ca / ASPECT;
  var need = dims.w / visibleFrac * 1.1;
  var width = WIDTHS[WIDTHS.length - 1];
  for (var i = 0; i < WIDTHS.length; i++) { if (WIDTHS[i] >= need) { width = WIDTHS[i]; break; } }

  var img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.src = PHOTO + width;
  img.onload = function () {
    try {
      texture(0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      var mw = 600, mh = Math.round(600 / ASPECT);
      var c = document.createElement('canvas'); c.width = mw; c.height = mh;
      var cx = c.getContext('2d');
      cx.drawImage(img, 0, 0, mw, mh);
      var mask = buildMask(cx.getImageData(0, 0, mw, mh).data, mw, mh);
      texture(1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, mw, mh, 0, gl.RGBA, gl.UNSIGNED_BYTE, mask);
    } catch (e) {
      // cross-origin or GPU trouble: keep the still photo
      return;
    }
    host.appendChild(canvas);
    start();
  };

  var running = false, visible = true, raf = 0, t0 = performance.now();
  function draw(t) {
    // slow 70s push in and out, like a locked-off camera on a long lens
    var zoom = 1.025 + 0.045 * (0.5 - 0.5 * Math.cos(t * 2 * Math.PI / 70));
    gl.uniform1f(U.uZoom, zoom);
    gl.uniform1f(U.uTime, t);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  var last = 0;
  function frame(now) {
    raf = 0;
    if (!running) return;
    // 30 fps is plenty for slow natural motion and halves the GPU work
    if (now - last < 32) { raf = requestAnimationFrame(frame); return; }
    last = now;
    size();
    draw((now - t0) / 1000);
    if (!canvas.classList.contains('is-on')) canvas.classList.add('is-on');
    raf = requestAnimationFrame(frame);
  }
  // Inspection hook: render a given moment and read it back (used to verify
  // that only sea, sky and grass move). Costs nothing unless called.
  window.TC_heroFx = {
    snapshot: function (t) {
      var d = size();
      draw(t);
      var px = new Uint8Array(d.w * d.h * 4);
      gl.readPixels(0, 0, d.w, d.h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return { w: d.w, h: d.h, data: px };
    }
  };
  function play() { if (running || !visible || document.hidden) return; running = true; raf = requestAnimationFrame(frame); }
  function pause() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
  function start() {
    play();
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; visible ? play() : pause(); }).observe(host);
    }
    document.addEventListener('visibilitychange', function () { document.hidden ? pause() : play(); });
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); pause(); canvas.remove(); });
  }
})();
