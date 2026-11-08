// DV76 · stable-fluids solver (WebGL2, half float), grown from the round-6 prototype.
// Semi-Lagrangian advection, vorticity confinement, Jacobi pressure projection, dye-driven buoyancy (ink is heavy).
// Production changes: every splat is scissored to its own footprint (the prototype ran each one over the whole
// texture), dye is RG (r = the pour, g = the hover tease) with its own dissipation per channel, and reset() clears
// the whole state so the loop can sleep on a clean page. Coordinates: uv 0..1, y up.

const VS = `#version 300 es
in vec2 p; out vec2 vUv, vL, vR, vT, vB; uniform vec2 tx;
void main(){ vUv = p*.5+.5; vL = vUv - vec2(tx.x,0.); vR = vUv + vec2(tx.x,0.); vT = vUv + vec2(0.,tx.y); vB = vUv - vec2(0.,tx.y); gl_Position = vec4(p,0.,1.); }`;
const H = `#version 300 es
precision highp float; precision highp sampler2D; in vec2 vUv, vL, vR, vT, vB; out vec4 o; uniform vec2 tx;
`;
const SH = {
  copy: H + `uniform sampler2D s; uniform float k; void main(){ o = texture(s, vUv)*k; }`,
  advect: H + `uniform sampler2D vel, src; uniform float dt; uniform vec4 diss;
    void main(){ vec2 c = vUv - dt * texture(vel, vUv).xy * tx; o = texture(src, c) / (1. + diss*dt); }`,
  div: H + `uniform sampler2D v; void main(){
    float L = texture(v, vL).x, R = texture(v, vR).x, T = texture(v, vT).y, B = texture(v, vB).y; vec2 C = texture(v, vUv).xy;
    if (vL.x < 0.) L = -C.x; if (vR.x > 1.) R = -C.x; if (vT.y > 1.) T = -C.y; if (vB.y < 0.) B = -C.y;
    o = vec4(.5*(R - L + T - B), 0., 0., 1.); }`,
  curl: H + `uniform sampler2D v; void main(){
    float L = texture(v, vL).y, R = texture(v, vR).y, T = texture(v, vT).x, B = texture(v, vB).x;
    o = vec4(.5*(R - L - T + B), 0., 0., 1.); }`,
  vort: H + `uniform sampler2D v, c; uniform float k, dt; void main(){
    float L = texture(c, vL).x, R = texture(c, vR).x, T = texture(c, vT).x, B = texture(c, vB).x, C = texture(c, vUv).x;
    vec2 f = .5*vec2(abs(T) - abs(B), abs(R) - abs(L)); f /= length(f) + 1e-4; f *= k*C; f.y *= -1.;
    vec2 vel = texture(v, vUv).xy + f*dt; o = vec4(clamp(vel, -1000., 1000.), 0., 1.); }`,
  press: H + `uniform sampler2D p, d; void main(){
    float L = texture(p, vL).x, R = texture(p, vR).x, T = texture(p, vT).x, B = texture(p, vB).x;
    o = vec4((L + R + B + T - texture(d, vUv).x)*.25, 0., 0., 1.); }`,
  grad: H + `uniform sampler2D p, v; void main(){
    float L = texture(p, vL).x, R = texture(p, vR).x, T = texture(p, vT).x, B = texture(p, vB).x;
    vec2 vel = texture(v, vUv).xy - vec2(R - L, T - B); o = vec4(vel, 0., 1.); }`,
  splat: H + `uniform sampler2D s; uniform vec2 pt; uniform vec3 col; uniform float r, asp;
    void main(){ vec2 q = vUv - pt; q.x *= asp; vec3 sp = exp(-dot(q,q)/r)*col; o = vec4(texture(s, vUv).xyz + sp, 1.); }`,
  buoy: H + `uniform sampler2D v, d; uniform float k, dt; uniform vec2 g;
    void main(){ vec4 dy = texture(d, vUv); float m = dy.r + dy.g*.6; o = vec4(texture(v, vUv).xy + g*k*m*dt, 0., 1.); }`,
  noise: H + `uniform sampler2D s; uniform float seed, amp, scale; uniform vec2 asp2;
    float h(vec2 p){ p = fract(p*vec2(123.34,456.21)+seed); p += dot(p, p+45.32); return fract(p.x*p.y); }
    float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
    void main(){ vec2 p = vUv*asp2*scale; vec2 a = vec2(n(p), n(p+17.3)) - .5; o = vec4(texture(s, vUv).xy + a*amp, 0., 1.); }`,
};

export class Fluid {
  constructor(gl, { sim = [256, 160], dye = [1024, 640] } = {}) {
    this.gl = gl;
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float missing');
    gl.getExtension('OES_texture_float_linear');
    this.P = {}; for (const k in SH) this.P[k] = this._prog(SH[k]);
    this.vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.opts = { curl: +(new URLSearchParams(location.search).get('curl') || 34), pressureIters: 36, velDiss: .05, dyeDiss: [0, 1.1], buoy: 46, g: [0, -1] };
    this._alloc(sim, dye);
  }
  _prog(fs) {
    const gl = this.gl;
    const mk = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pr = gl.createProgram(); gl.attachShader(pr, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    const u = {}; const n = gl.getProgramParameter(pr, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(pr, i); u[a.name] = gl.getUniformLocation(pr, a.name); }
    return { pr, u };
  }
  _fbo(w, h, fmt) {
    const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    const [ifmt, f] = fmt === 'r' ? [gl.R16F, gl.RED] : [gl.RG16F, gl.RG];
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, f, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { t, fb, w, h };
  }
  _dbl(w, h, fmt) { const a = this._fbo(w, h, fmt), b = this._fbo(w, h, fmt); return { r: a, w: b, all: [a, b], swap() { const t = this.r; this.r = this.w; this.w = t; } }; }
  _alloc(sim, dye) {
    this.sim = sim; this.dyeRes = dye;
    this.vel = this._dbl(sim[0], sim[1], 'rg'); this.prs = this._dbl(sim[0], sim[1], 'r');
    this.dv = this._fbo(sim[0], sim[1], 'r'); this.cu = this._fbo(sim[0], sim[1], 'r');
    this.dye = this._dbl(dye[0], dye[1], 'rg');
    this.reset();
  }
  dispose() {
    const gl = this.gl;
    for (const f of [...this.vel.all, ...this.prs.all, ...this.dye.all, this.dv, this.cu]) { gl.deleteTexture(f.t); gl.deleteFramebuffer(f.fb); }
  }
  resize(sim, dye) { this.dispose(); this._alloc(sim, dye); }
  reset() {
    const gl = this.gl; gl.disable(gl.SCISSOR_TEST); gl.clearColor(0, 0, 0, 0);
    for (const f of [...this.vel.all, ...this.prs.all, ...this.dye.all, this.dv, this.cu]) { gl.bindFramebuffer(gl.FRAMEBUFFER, f.fb); gl.viewport(0, 0, f.w, f.h); gl.clear(gl.COLOR_BUFFER_BIT); }
  }
  _run(name, target, uni, txs, box) {
    const gl = this.gl, P = this.P[name];
    gl.useProgram(P.pr); gl.bindBuffer(gl.ARRAY_BUFFER, this.vb); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb); gl.viewport(0, 0, target.w, target.h);
    gl.uniform2f(P.u.tx, 1 / (txs ? txs[0] : target.w), 1 / (txs ? txs[1] : target.h));
    let unit = 0;
    for (const [k, v] of Object.entries(uni)) {
      const loc = P.u[k]; if (loc == null) continue;
      if (v && v.t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, v.t); gl.uniform1i(loc, unit++); }
      else if (Array.isArray(v)) (v.length === 2 ? gl.uniform2fv : v.length === 3 ? gl.uniform3fv : gl.uniform4fv).call(gl, loc, v);
      else gl.uniform1f(loc, v);
    }
    if (box) { gl.enable(gl.SCISSOR_TEST); gl.scissor(box[0], box[1], box[2], box[3]); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (box) gl.disable(gl.SCISSOR_TEST);
  }
  get aspect() { return this.sim[0] / this.sim[1]; }
  // a splat touches exp(-d²/r) > 1/400: d < sqrt(r·6) in aspect-corrected uv
  _box(t, x, y, r) {
    const R = Math.sqrt(r * 6), rx = R / this.aspect, ry = R;
    const x0 = Math.max(0, Math.floor((x - rx) * t.w) - 1), y0 = Math.max(0, Math.floor((y - ry) * t.h) - 1);
    const x1 = Math.min(t.w, Math.ceil((x + rx) * t.w) + 1), y1 = Math.min(t.h, Math.ceil((y + ry) * t.h) + 1);
    return [x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0)];
  }
  // a splat renders its scissor box into the spare buffer, then copies that box back into the live one, so the
  // two ping-pong buffers never disagree outside the box and no full-texture pass is spent on a 20 px splat
  _splat(pair, x, y, col, r) {
    const rr = r / 100, box = this._box(pair.r, x, y, rr);
    if (!box[2] || !box[3]) return;
    this._run('splat', pair.w, { s: pair.r, pt: [x, y], col, r: rr, asp: this.aspect }, null, box);
    this._run('copy', pair.r, { s: pair.w, k: 1 }, null, box);
  }
  splatVel(x, y, dx, dy, r) { this._splat(this.vel, x, y, [dx, dy, 0], r); }
  splatDye(x, y, c, r) { this._splat(this.dye, x, y, c, r); }
  noiseVel(amp, scale, seed) { this._run('noise', this.vel.w, { s: this.vel.r, amp, scale, seed, asp2: [this.aspect, 1] }); this.vel.swap(); }
  step(dt) {
    const o = this.opts, S = this.sim;
    if (o.buoy) { this._run('buoy', this.vel.w, { v: this.vel.r, d: this.dye.r, k: o.buoy, dt, g: o.g }); this.vel.swap(); }
    this._run('curl', this.cu, { v: this.vel.r });
    this._run('vort', this.vel.w, { v: this.vel.r, c: this.cu, k: o.curl, dt }); this.vel.swap();
    this._run('div', this.dv, { v: this.vel.r });
    this._run('copy', this.prs.w, { s: this.prs.r, k: .8 }); this.prs.swap();
    for (let i = 0; i < o.pressureIters; i++) { this._run('press', this.prs.w, { p: this.prs.r, d: this.dv }); this.prs.swap(); }
    this._run('grad', this.vel.w, { p: this.prs.r, v: this.vel.r }); this.vel.swap();
    this._run('advect', this.vel.w, { vel: this.vel.r, src: this.vel.r, dt, diss: [o.velDiss, o.velDiss, 0, 0] }); this.vel.swap();
    this._run('advect', this.dye.w, { vel: this.vel.r, src: this.dye.r, dt, diss: [o.dyeDiss[0], o.dyeDiss[1], 0, 0] }, S); this.dye.swap();
  }
}
