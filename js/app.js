// DV76 · Inkwell app: the theme switch, persistence, input, the no-WebGL fallback and the test hook.
import { InkFX } from './ink.js';
import { paint, measure } from './surfaces.js';

const KEY = 'dv76.v1.theme';
const root = document.documentElement;
const btn = document.getElementById('theme');
const canvas = document.querySelector('.fx');
const art = document.querySelector('.art');
const Q = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

let theme = root.dataset.theme === 'dark' ? 'dark' : 'light';
let fx = null, mode = 'webgl';
let readyResolve; const ready = new Promise((r) => (readyResolve = r));

// ---------- the CSS fallback: two painted canvases, the new theme revealed by a circular clip from the toggle ----------
class FallbackFX {
  constructor() { this.el = document.querySelector('.fallback'); this.cv = { light: this.el.querySelector('.fb-light'), dark: this.el.querySelector('.fb-dark') }; this.anim = null; this.theme = 'light'; this.onDone = this.onBusy = null; }
  get busy() { return !!this.anim; }
  layout(t) {
    if (this.anim) this.anim.finish();
    this.theme = t;
    const W = root.clientWidth, H = Math.max(root.scrollHeight, innerHeight), dpr = Math.min(devicePixelRatio || 1, 2);
    this.W = W; this.H = H; this.el.style.height = H + 'px';
    const boxes = measure();
    for (const k of ['light', 'dark']) {
      const c = this.cv[k]; c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = W + 'px'; c.style.height = H + 'px';
      paint(c.getContext('2d'), k, boxes, W, H, dpr);
    }
    this._stack();
  }
  _stack() { this.cv[this.theme].style.zIndex = 1; this.cv[this.theme === 'dark' ? 'light' : 'dark'].style.zIndex = 0; this.cv[this.theme].style.clipPath = 'none'; this.cv[this.theme].style.opacity = 1; }
  pour(to, o) {
    if (this.anim) this.anim.finish();
    if (to === this.theme) return;
    const c = this.cv[to], other = this.cv[this.theme];
    other.style.zIndex = 0; c.style.zIndex = 1; this.theme = to;
    const R = Math.max(...[[0, 0], [this.W, 0], [0, this.H], [this.W, this.H]].map(([x, y]) => Math.hypot(x - o.x, y - o.y))) + 10;
    this.onBusy && this.onBusy(true);
    this.anim = reduced.matches
      ? c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: 'ease' })
      : c.animate([{ clipPath: `circle(0px at ${o.x}px ${o.y}px)` }, { clipPath: `circle(${R}px at ${o.x}px ${o.y}px)` }], { duration: 950, easing: 'cubic-bezier(.6,.05,.3,1)' });
    this.anim.onfinish = () => { this.anim = null; this._stack(); this.onBusy && this.onBusy(false); this.onDone && this.onDone(to); };
  }
  tease() {} stir() {} hold() {}
  state() { return { theme: this.theme, busy: this.busy, looping: false, frames: 0, draws: 0 }; }
}

// ---------- theme state ----------
function origin() {
  const r = btn.querySelector('.tg-pill').getBoundingClientRect();
  return { x: r.left + r.width / 2 + scrollX, y: r.top + r.height / 2 + scrollY, bottom: r.bottom + scrollY };
}
function reflect() {
  const dark = theme === 'dark';
  root.dataset.theme = theme;
  btn.setAttribute('aria-checked', String(dark));
  document.querySelector('meta[name=color-scheme]').content = dark ? 'dark' : 'light';
  document.querySelector('meta[name=theme-color]').content = dark ? '#0b0e1a' : '#f3efe6';
  art.setAttribute('aria-label', dark ? 'A full moon rising over dark hills' : 'A warm sun setting over layered hills');
}
function save() { try { localStorage.setItem(KEY, theme); } catch (e) {} }
function setTheme(t, { store = true } = {}) {
  if (btn.disabled) return;
  theme = t; reflect(); if (store) save();
  fx.pour(t, origin());
}
function wire(f) {
  f.onBusy = (b) => { if (b) btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy'); };
  // no live region: the switch's own aria-checked change is what assistive tech announces (a live region update also
  // cost a measured 30 ms frame the first time it filled)
  f.onDone = null;
}
function toFallback() {
  const was = fx, busy = was && was.busy;
  mode = 'fallback'; root.classList.add('no-fx');
  fx = new FallbackFX(); wire(fx);
  if (busy) { fx.layout(theme === 'dark' ? 'light' : 'dark'); fx.pour(theme, origin()); } else fx.layout(theme);
}

btn.addEventListener('click', () => setTheme(theme === 'dark' ? 'light' : 'dark'));
// hover / focus: a bead of the pigment a click would pour trembles out of the toggle
const teaseAt = () => { const o = origin(); return { x: o.x, y: o.bottom - 4 }; };
btn.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && !btn.disabled) fx && fx.tease(true, teaseAt()); });
btn.addEventListener('pointerleave', () => fx && fx.tease(false));
btn.addEventListener('focus', () => { if (btn.matches(':focus-visible') && !btn.disabled) fx && fx.tease(true, teaseAt()); });
btn.addEventListener('blur', () => fx && fx.tease(false));
// stirring: while the ink moves, any pointer moving through it pushes the fluid
const last = new Map();
addEventListener('pointermove', (e) => {
  const p = last.get(e.pointerId); last.set(e.pointerId, [e.pageX, e.pageY]);
  if (!p || !fx || !fx.busy) return;
  fx.stir(e.pageX, e.pageY, e.pageX - p[0], e.pageY - p[1]);
}, { passive: true });
addEventListener('pointerup', (e) => last.delete(e.pointerId), { passive: true });
addEventListener('pointercancel', (e) => last.delete(e.pointerId), { passive: true });

// ---------- start ----------
async function start() {
  try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]); } catch (e) {}
  const intro = root.dataset.intro === '1' && !reduced.matches;
  if (Q.has('nofx')) toFallback();
  else {
    try { fx = new InkFX(canvas); wire(fx); fx.onLost = () => toFallback(); fx.layout(theme); }
    catch (e) { fx = null; toFallback(); }
  }
  reflect();
  const still = Q.get('still');
  if (still !== null && mode === 'webgl') {
    // a held frame of the showcase pour, for stills: ?still=1.2 (seconds into the pour)
    // (&back: the return pour, milk clearing the night back to paper)
    const back = Q.has('back');
    if (back) { theme = 'dark'; fx.layout('dark'); }
    theme = back ? 'light' : 'dark'; reflect(); fx.hold(true); fx.pour(theme, origin(), { pre: Math.max(0, parseFloat(still) || 1.2) });
  } else if (intro) {
    // first visit: open on the showcase, the ink already leaving the toggle in the first frame
    theme = 'dark'; reflect();
    fx.pour('dark', origin(), { pre: mode === 'webgl' ? .3 : 0 });
  }
  // relayout when the layout really changes (width, or document height), never mid-scroll for the URL bar
  let lw = root.clientWidth, lh = root.scrollHeight, tm = 0;
  new ResizeObserver(() => {
    clearTimeout(tm);
    tm = setTimeout(() => {
      const w = root.clientWidth, h = root.scrollHeight;
      if (w === lw && Math.abs(h - lh) < 2) return;
      lw = w; lh = h; fx.layout(theme);
    }, 140);
  }).observe(document.body);
  readyResolve();
}
start();

window.__ink = {
  ready, KEY,
  get fx() { return fx; }, get mode() { return mode; }, get theme() { return theme; },
  toggle: () => btn.click(),
  state: () => ({ mode, theme, checked: btn.getAttribute('aria-checked'), ...(fx ? fx.state() : {}) }),
  loseContext: () => { const ext = fx && fx.gl && fx.gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); return !!ext; },
};
