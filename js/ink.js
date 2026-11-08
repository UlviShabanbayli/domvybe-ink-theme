// DV76 · InkFX: the WebGL layer under the page's type. It owns two painted surfaces (light and dark, from
// surfaces.js), a stable-fluids sim, and one composite pass that pours one theme into the other:
//   · a heavy jet of pigment leaves the toggle (ink on the way to dark, milk on the way back), curls and sinks;
//   · wherever the pigment body has gathered, and behind a wet front that the pigment leads across the page, the
//     page underneath IS the new theme; thin wisps still refract and stain the old page in front of it;
//   · the run always completes (the front reaches the farthest corner), the residue settles out, the sim is cleared
//     and the loop sleeps on a clean, static page.
// Type is never drawn here. It is DOM above this canvas with mix-blend-mode: difference.
import { Fluid } from './fluid.js';
import { paint, measure } from './surfaces.js';

const VS = `#version 300 es
in vec2 p; out vec2 v; void main(){ v = p*.5+.5; gl_Position = vec4(p,0.,1.); }`;
const FS = `#version 300 es
precision highp float; in vec2 v; out vec4 o;
uniform sampler2D uOld, uNew, uDye;
uniform vec2 uDyeTx, uDoc, uOrigin;
uniform float uFront, uFeather, uSettle, uPig, uMix, uT, uStatic, uSquash, uSig;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ return vn(p)*.5 + vn(p*2.07 + 7.1)*.3 + vn(p*4.3 + 3.3)*.2; }
float D(vec2 p){ vec2 a = texture(uDye, p).rg; return max(a.r, 0.) + max(a.g, 0.); }
float DL(vec2 p, float l){ vec2 a = textureLod(uDye, p, l).rg; return max(a.r, 0.) + max(a.g, 0.); }
vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
vec3 srgb(vec3 c){ return pow(max(c, 0.), vec3(1./2.2)); }
void main(){
  if (uStatic > .5) { o = vec4(texture(uNew, v).rgb, 1.); return; }
  float dB = DL(v, 1.4);
  float d = max(D(v), dB * .82 * smoothstep(1.3, 2.3, dB));   // closes pin-holes inside the dense jet only; wisps stay sharp
  vec2 e = uDyeTx * 2.5;
  float dl = D(v - vec2(e.x, 0.)), dr = D(v + vec2(e.x, 0.)), db = D(v - vec2(0., e.y)), dt = D(v + vec2(0., e.y));
  vec2 gr = vec2(dr - dl, dt - db);
  float wide = (D(v + vec2(e.x*4., 0.)) + D(v - vec2(e.x*4., 0.)) + D(v + vec2(0., e.y*4.)) + D(v - vec2(0., e.y*4.))) * .25;
  // pigment pools at the rim of every plume: the dark filament edge of real ink in water
  float rim = clamp((d - wide) * 1.6, 0., 1.5);
  float sm = DL(v, 4.5), sm2 = DL(v, 3.);
  float body = sm*.6 + sm2*.4;
  // the wet front: an expanding, noise-warped edge from the toggle that the pigment leads
  vec2 px = vec2(v.x, 1. - v.y) * uDoc;
  vec2 q = px - uOrigin; q.y *= uSquash;
  // large warp (the flood is never a circle) + fine fray (ink bleeding along paper fibre); ink pulls the front with it
  float dist = length(q) + (fbm(px * .0042) - .5) * uFeather * 3. + (vn(px * .011 + 5.) - .5) * 34. + (vn(px * .09) - .5) * 6.
             - min(d, 2.) * 26.;                           // the edge follows every wisp of pigment that reaches it
  float f = clamp((uFront + min(body, 2.) * uFeather * .9 - dist) / 16., -1.2, 4.);
  // alone, only the densest settled ink turns the page; the front does the rest
  float m = smoothstep(.0, .9, f + smoothstep(1.4, 2.3, body) * 1.6 - .2);
  m = max(m, uMix);
  vec2 off = clamp(gr, -1.5, 1.5) * .0035 * (1. - m);
  vec3 Oc = lin(texture(uOld, v + off).rgb), Nc = lin(texture(uNew, v).rgb);
  float dd = max(0., d * 1.06 - .05) + rim * .8;
  float ink = step(0., uPig);
  vec3 sig = mix(vec3(1.65, 1.98, 2.64), vec3(3.62, 3.12, 2.06) * uSig, ink);
  vec3 pigC = mix(vec3(.80, .79, .75), vec3(.006, .008, .022), ink);
  vec3 Tr = exp(-dd * sig);
  vec3 col = Oc * Tr + pigC * (1. - Tr);
  float thin = smoothstep(.02, .25, d) * (1. - smoothstep(.4, 1.2, d));
  col += mix(vec3(.05, .075, .16) * .32, vec3(.05, .08, .16) * .18, ink) * thin;  // thin ink: blue sheen; thin milk: cold glow
  // inside the turned region: the new page, the pigment's structure still faintly in it until it settles out
  float deep = smoothstep(1.0, 2.2, sm*.5 + sm2*.5);
  float band = (1. - deep) * (1. - uSettle);
  vec3 res = mix(Nc, pigC, clamp(rim * .32 + d * .035, 0., .45) * band);
  col = mix(col, res, m);
  float edge = m * (1. - m) * 4. * (1. - uSettle) * (1. - uMix);
  col = mix(col, pigC, edge * .4);
  col = mix(col, pigC * .6, smoothstep(.5, .95, m) * (1. - smoothstep(.95, 1., m)) * (1. - uSettle) * .5);  // a crisp darker tide line
  col = srgb(col);
  col += (h21(gl_FragCoord.xy + fract(uT) * 61.) - .5) / 255.;
  o = vec4(col, 1.);
}`;

const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

export class InkFX {
  constructor(canvas) {
    this.cv = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    const mk = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pr = gl.createProgram(); gl.attachShader(pr, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    this.pr = pr; this.U = {};
    for (const n of ['uOld', 'uNew', 'uDye', 'uDyeTx', 'uDoc', 'uOrigin', 'uFront', 'uFeather', 'uSettle', 'uPig', 'uMix', 'uT', 'uStatic', 'uSquash', 'uSig']) this.U[n] = gl.getUniformLocation(pr, n);
    this.vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.fluid = null; this.tex = {}; this.snaps = null;
    this.theme = 'light'; this.run = null; this.tz = { on: false, at: { x: 0, y: 0 }, t: 0, acc: 0, alive: 0 };
    this.raf = 0; this.last = 0; this.held = false; this.frames = 0; this.draws = 0; this.lost = false;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
    this.onDone = null; this.onBusy = null; this.onLost = null;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; cancelAnimationFrame(this.raf); this.raf = 0; this.onLost && this.onLost(); });
    this.seed = 20261105; const QS = new URLSearchParams(location.search); this.inkK = +(QS.get('ink') || .7); this.fling = +(QS.get('fling') || .3); this.sig = +(QS.get('sig') || 1.5);
  }
  get busy() { return !!this.run; }
  rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }

  // ---------- layout: canvas covers the whole document; surfaces painted from the live DOM ----------
  layout(theme) {
    if (this.run) this._finish();
    const gl = this.gl;
    const W = document.documentElement.clientWidth, H = Math.max(document.documentElement.scrollHeight, innerHeight);
    const vh = innerHeight, phone = W < 700;
    // ≤2× and ≤ ~8.3 MP (a 4K frame): on a 2560×1440@2 screen the composite would otherwise shade 14.7 MP a frame
    const dpr = Math.min(devicePixelRatio || 1, 2, Math.sqrt(8.3e6 / (W * H)));
    const DW = Math.round(W * dpr), DH = Math.round(H * dpr);
    this.W = W; this.H = H; this.dpr = dpr; this.phone = phone; this.DW = DW; this.DH = DH; this.theme = theme;
    this.cv.width = DW; this.cv.height = DH; this.cv.style.width = W + 'px'; this.cv.style.height = H + 'px';
    const boxes = measure();
    const c = document.createElement('canvas'); c.width = DW; c.height = DH; const g = c.getContext('2d');
    for (const t of ['light', 'dark']) {
      paint(g, t, boxes, W, H, dpr);
      if (!this.tex[t]) this.tex[t] = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.tex[t]); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); this._params();
    }
    c.width = c.height = 0;
    // the snapshot target (a pour reversed mid-way starts from the frame on screen)
    // (two of them: a second reversal reads the first snapshot while writing the other)
    if (this.snaps) for (const s of this.snaps) { gl.deleteTexture(s.t); gl.deleteFramebuffer(s.fb); }
    this.snaps = [0, 1].map(() => {
      const st = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, st);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, DW, DH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); this._params();
      const sf = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, sf); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, st, 0);
      return { t: st, fb: sf };
    });
    this.snapI = 0;
    // sim: one cell ≈ vh/210 CSS px; dye at ~1/1.5 of device res, capped
    const cell = Math.max(3, Math.min(6, vh / (phone ? 220 : 205)));
    const sim = [Math.max(32, Math.round(W / cell)), Math.max(32, Math.round(H / cell))];
    let dw = DW / 1.5, dh = DH / 1.5; const cap = Math.min(1, Math.sqrt(2.4e6 / (dw * dh))); dw = Math.round(dw * cap); dh = Math.round(dh * cap);
    if (!this.fluid) this.fluid = new Fluid(gl, { sim, dye: [dw, dh] }); else this.fluid.resize(sim, [dw, dh]);
    this.k = sim[1] / H;                                         // CSS px/s → sim texels/s
    this.feather = phone ? 64 : 92;
    this.drawStatic();
  }
  _params() {
    const gl = this.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  uv(x, y) { return [x / this.W, 1 - y / this.H]; }
  r2(px) { return (px / this.H) ** 2 * 100; }                    // CSS px radius → the solver's splat radius

  // ---------- the pour ----------
  pour(to, origin, { pre = 0 } = {}) {
    if (to === this.theme && !this.run) return;
    let from = this.tex[this.theme];
    if (this.run) {                                              // reversed mid-way: start from what is on screen
      const s = this.snaps[this.snapI]; this.snapI ^= 1;
      this._composite(s.fb); this._clearDye(); from = s.t;
    }
    const corners = [[0, 0], [this.W, 0], [0, this.H], [this.W, this.H]];
    const squash = .82;
    const far = Math.max(...corners.map(([x, y]) => Math.hypot(x - origin.x, (y - origin.y) * squash)));
    const T1 = this.phone ? 2.7 : 2.7;
    this.run = {
      to, old: from, origin, ts: 0, acc: 0, bacc: 0, T1, settle: .5,
      rmax: far + this.feather * 1.8 + 60, squash, noised: 0, F0: this.phone ? .8 : .55,
      reduced: this.reduced.matches,
    };
    this.theme = to;
    this.seed = 20261105 + (to === 'dark' ? 0 : 7);
    this.onBusy && this.onBusy(true);
    if (this.run.reduced) { this.run.T1 = .25; this.run.settle = 0; this.run.F0 = 0; }
    for (let s = 0; s < pre; s += 1 / 60) this._step(1 / 60);
    this._wake();
  }
  _clearDye() {
    const gl = this.gl, f = this.fluid; gl.clearColor(0, 0, 0, 0);
    for (const b of f.dye.all) { gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb); gl.viewport(0, 0, b.w, b.h); gl.clear(gl.COLOR_BUFFER_BIT); }
    // the dye is sampled with mipmaps (_composite): clear its mips too, or the advection reads the old pigment back
    gl.bindTexture(gl.TEXTURE_2D, f.dye.r.t); gl.generateMipmap(gl.TEXTURE_2D);
  }
  _emit(dt) {
    const R = this.run, f = this.fluid, ts = R.ts, o = R.origin, k = this.k, ph = this.phone;
    // 1 · the jet out of the toggle: down, then sweeping left, heavy drops
    const STREAM = 1.2;
    if (ts < STREAM) {
      R.acc += dt * (ph ? 105 : 190);
      while (R.acc >= 1) {
        R.acc -= 1;
        const a = Math.PI * (.5 + .72 * (ts / STREAM)) + (this.rnd() - .5) * .9;      // y-down: π/2 is straight down
        const sp = (ph ? 2100 : 5200) + (ph ? 1300 : 4200) * this.rnd();
        const x = o.x + (this.rnd() - .5) * 10, y = o.y + 6 + this.rnd() * 10;
        const [u, w] = this.uv(x, y);
        f.splatVel(u, w, Math.cos(a) * sp * k, -Math.sin(a) * sp * k, this.r2(10 + 9 * this.rnd()));
        f.splatDye(u, w, [((ph ? 1.7 : 2.2) + this.rnd()) * this.inkK, 0, 0], this.r2((ph ? 7 : 9) + (ph ? 7 : 9) * this.rnd()));
      }
    }
    // turbulence: the water is never still, so the jet breaks into curls and filaments quickly
    // 1b · a flung arc along the top: it crosses the nav, then sinks as curtains through the headline
    if (!ph && ts > .12 && ts < .5) {
      R.facc = (R.facc || 0) + dt * 70;
      while (R.facc >= 1) {
        R.facc -= 1;
        const a = Math.PI * (1.03 + (this.rnd() - .5) * .1), sp = this.fling * (8200 + 3800 * this.rnd());
        const x = o.x - 14 + (this.rnd() - .5) * 8, y = o.y + 4 + this.rnd() * 8;
        const [u, w] = this.uv(x, y);
        f.splatVel(u, w, Math.cos(a) * sp * k, -Math.sin(a) * sp * k, this.r2(26 + 14 * this.rnd()));
        f.splatDye(u, w, [(1.2 + .8 * this.rnd()) * this.inkK, 0, 0], this.r2(7 + 7 * this.rnd()));
      }
    }
    if (R.noised === 0 && ts > .03) { R.noised = 1; f.noiseVel(105, 26, 3.7); }
    if (R.noised === 1 && ts > .35) { R.noised = 2; f.noiseVel(80, 11, 8.1); }
    if (R.noised === 2 && ts > .8) { R.noised = 3; f.noiseVel(70, 18, 1.9); }
    // 2 · blooms riding the front: the pigment leads the edge across the page
    if (ts > R.F0 && ts < R.T1 - .3) {
      R.bacc += dt * (ph ? 30 : 46);
      const rad = this.front();
      while (R.bacc >= 1) {
        R.bacc -= 1;
        for (let tries = 0; tries < 5; tries++) {
          const th = this.rnd() * Math.PI * 2;
          const rr = rad + this.feather * (-.2 + .7 * this.rnd()), x = o.x + Math.cos(th) * rr, y = o.y + Math.sin(th) * rr / R.squash;
          if (x < -20 || x > this.W + 20 || y < -20 || y > this.H + 20) continue;
          // a jet with the pigment at its tail: it rolls up into the mushroom plume of real ink, never a round drop
          const sp = (ph ? 520 : 820) + (ph ? 380 : 620) * this.rnd(), a = th + (this.rnd() - .5) * 1.1;
          const cx = Math.cos(a), cy = Math.sin(a);
          const [u, w] = this.uv(x, y), [u2, w2] = this.uv(x - cx * 12, y - cy * 12);
          f.splatVel(u, w, cx * sp * k, -cy * sp * k, this.r2(20 + 12 * this.rnd()));
          f.splatDye(u2, w2, [(1.1 + 1.0 * this.rnd()) * this.inkK, 0, 0], this.r2(8 + 7 * this.rnd()));
          break;
        }
      }
    }
  }
  front() { const R = this.run; if (!R || R.reduced) return -1e5; const u = (R.ts - R.F0) / (R.T1 - R.F0); return u <= 0 ? -400 - 600 * (-u) : R.rmax * (u < 1 ? u * u * (2.2 - 1.2 * u) : 1); }
  _tease(dt) {
    const T = this.tz, f = this.fluid;
    if (T.on && !this.run) {
      T.acc += dt * 26;
      while (T.acc >= 1) {
        T.acc -= 1;
        const x = T.at.x + (this.rnd() - .5) * 26, y = T.at.y + this.rnd() * 6;
        const [u, w] = this.uv(x, y), a = Math.PI * (.5 + (this.rnd() - .5) * .7), sp = 160 + 240 * this.rnd();
        f.splatVel(u, w, Math.cos(a) * sp * this.k, -Math.sin(a) * sp * this.k, this.r2(7 + 5 * this.rnd()));
        f.splatDye(u, w, [0, .32 + .3 * this.rnd(), 0], this.r2(5 + 5 * this.rnd()));
      }
      T.alive = 3.4;
    } else T.alive = Math.max(0, T.alive - dt);
  }
  _step(dt) {
    if (this.run) { this._emit(dt); this.run.ts += dt; }
    this._tease(dt);
    if (!this.run || !this.run.reduced) this.fluid.step(dt);
  }

  // ---------- hover tease and stirring ----------
  tease(on, at) {
    if (this.reduced.matches) return;
    this.tz.on = on; if (at) this.tz.at = at;
    if (on) this._wake();
  }
  stir(x, y, dx, dy) {
    if (!this.run || this.run.reduced) return;
    const [u, w] = this.uv(x, y), k = this.k;
    const vx = Math.max(-60, Math.min(60, dx)) * 210 * k, vy = -Math.max(-60, Math.min(60, dy)) * 210 * k;
    this.fluid.splatVel(u, w, vx, vy, this.r2(34));
  }

  // ---------- frames ----------
  _wake() { if (!this.raf && !this.lost) { this.last = 0; this.raf = requestAnimationFrame((t) => this._frame(t)); } }
  _frame(now) {
    this.raf = 0; if (this.lost) return;
    const dt = this.last ? Math.min(1 / 30, Math.max(1 / 240, (now - this.last) / 1000)) : 1 / 120;
    this.last = now;
    if (!this.held) this._step(dt);
    this.frames++;
    const R = this.run;
    if (R && !this.held && R.ts >= R.T1 + R.settle + .05) { this._finish(); return; }
    this._composite(null, now / 1000);
    if (this.run || this.tz.on || this.tz.alive > 0 || this.held) this.raf = requestAnimationFrame((t) => this._frame(t));
    else { this.fluid.reset(); this.drawStatic(); }
  }
  _finish() {
    this.run = null; this.fluid.reset(); this.tz.alive = 0; this.tz.on = false; this.drawStatic();
    this.onBusy && this.onBusy(false); this.onDone && this.onDone(this.theme);
  }
  hold(on) { this.held = on; if (on) this._wake(); }
  // deterministic advance for stills: step the sim by `s` seconds at 60 Hz and draw
  advance(s) { for (let t = 0; t < s; t += 1 / 60) this._step(1 / 60); this._composite(null, 0); }
  drawStatic() {
    const gl = this.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.DW, this.DH);
    this._use(); gl.uniform1f(this.U.uStatic, 1);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tex[this.theme]); gl.uniform1i(this.U.uNew, 1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex[this.theme]); gl.uniform1i(this.U.uOld, 0);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.tex[this.theme]); gl.uniform1i(this.U.uDye, 2);
    gl.drawArrays(gl.TRIANGLES, 0, 3); this.draws++;
    this.cv.style.visibility = 'visible';
  }
  _use() { const gl = this.gl; gl.useProgram(this.pr); gl.bindBuffer(gl.ARRAY_BUFFER, this.vb); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); }
  _composite(fb, t = 0) {
    const gl = this.gl, f = this.fluid, R = this.run, U = this.U;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, this.DW, this.DH);
    gl.bindTexture(gl.TEXTURE_2D, f.dye.r.t); gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    this._use();
    const cur = this.tex[this.theme];
    const old = R ? R.old : cur;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, old); gl.uniform1i(U.uOld, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, cur); gl.uniform1i(U.uNew, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, f.dye.r.t); gl.uniform1i(U.uDye, 2);
    gl.uniform1f(U.uStatic, 0);
    gl.uniform2f(U.uDyeTx, 1 / f.dyeRes[0], 1 / f.dyeRes[1]); gl.uniform2f(U.uDoc, this.W, this.H);
    const o = R ? R.origin : this.tz.at;
    gl.uniform2f(U.uOrigin, o.x, o.y);
    gl.uniform1f(U.uFront, R ? this.front() : -1e5); gl.uniform1f(U.uFeather, this.feather);
    gl.uniform1f(U.uSquash, R ? R.squash : 1);
    const settle = R && R.settle > 0 ? Math.min(1, Math.max(0, (R.ts - R.T1) / R.settle)) : 0;
    gl.uniform1f(U.uSettle, settle);
    // pigment: ink on the way to dark, milk on the way to light; at rest the tease shows the pigment a click would pour
    const goingDark = R ? R.to === 'dark' : this.theme === 'light';
    gl.uniform1f(U.uPig, goingDark ? 1 : -1);
    gl.uniform1f(U.uMix, R && R.reduced ? ease(R.ts / R.T1) : 0);
    gl.uniform1f(U.uT, t); gl.uniform1f(U.uSig, this.sig);
    gl.drawArrays(gl.TRIANGLES, 0, 3); this.draws++;
  }
  state() {
    const R = this.run;
    return { theme: this.theme, busy: !!R, ts: R ? R.ts : 0, front: R ? this.front() : 0, rmax: R ? R.rmax : 0, tease: this.tz.on, alive: this.tz.alive, looping: !!this.raf, frames: this.frames, draws: this.draws, dpr: this.dpr, sim: this.fluid && this.fluid.sim, dye: this.fluid && this.fluid.dyeRes };
  }
}
