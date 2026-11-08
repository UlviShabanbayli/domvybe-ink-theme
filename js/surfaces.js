// DV76 · the page's text-free surfaces, painted with Canvas 2D for one theme: paper or night, the hairline under the
// nav, the feature card, its chip and the landscape art (sun by day, moon by night). Positions come from the live DOM
// ([data-surface] boxes), so the canvas always lines up with the real layout. Words are never painted here: all type
// is DOM above the canvas (mix-blend-mode: difference), which keeps it sharp and lets it invert under the ink.

export const THEMES = {
  light: { page: [243, 239, 230], card: [253, 251, 247], cardLine: 'rgba(22,22,26,.10)', chip: '#e9e3d6', line: 'rgba(22,22,26,.13)', shadow: 'rgba(60,40,20,.10)' },
  dark: { page: [11, 14, 26], card: [20, 26, 44], cardLine: 'rgba(236,235,230,.09)', chip: '#1e2640', line: 'rgba(236,235,230,.12)', shadow: 'rgba(0,0,0,.45)' },
};

let grainTile = null;
function grain() {
  if (grainTile) return grainTile;
  const n = 192, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), im = g.createImageData(n, n);
  let s = 1234567;
  const r = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  // paper: fine grain plus a few longer fibres
  for (let i = 0; i < n * n; i++) { const v = 128 + (r() - .5) * 70; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
  g.putImageData(im, 0, 0);
  g.globalAlpha = .18; g.lineWidth = .6;
  for (let i = 0; i < 70; i++) {
    const x = r() * n, y = r() * n, a = r() * Math.PI, l = 6 + r() * 18;
    g.strokeStyle = r() > .5 ? '#fff' : '#000'; g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * l * .5 + (r() - .5) * 4, y + Math.sin(a) * l * .5 + (r() - .5) * 4, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  grainTile = c; return c;
}

const rgb = (a, k = 1) => `rgb(${a.map((v) => Math.round(v * k)).join(',')})`;
function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }

function hills(g, x, y, w, h, cols, seed, dark) {
  cols.forEach((c, i) => {
    const base = y + h * (.6 + i * .095);
    g.fillStyle = c; g.beginPath(); g.moveTo(x - 2, y + h + 2);
    for (let k = 0; k <= 64; k++) {
      const u = k / 64;
      g.lineTo(x + u * w, base - Math.sin(u * (2.6 + i * .9) + i * 1.7 + seed) * h * .05 - Math.sin(u * 8.5 + i * 2.1) * h * .014 - Math.sin(u * 21 + i) * h * .004);
    }
    g.lineTo(x + w + 2, y + h + 2); g.closePath(); g.fill();
    // atmospheric haze sitting in each valley
    const hz = g.createLinearGradient(0, base - h * .07, 0, base + h * .07);
    hz.addColorStop(0, 'rgba(0,0,0,0)');
    hz.addColorStop(.55, dark ? `rgba(120,135,210,${.10 - i * .02})` : `rgba(255,214,180,${.22 - i * .045})`);
    hz.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = hz; g.fillRect(x, base - h * .07, w, h * .14);
  });
}

function art(g, b, dark, k) {
  const { x, y, w, h, r } = b;
  g.save(); rr(g, x, y, w, h, r); g.clip();
  const sky = g.createLinearGradient(0, y, 0, y + h);
  if (dark) { sky.addColorStop(0, '#0b1230'); sky.addColorStop(.5, '#1c2858'); sky.addColorStop(.78, '#363c78'); sky.addColorStop(1, '#2a2f66'); }
  else { sky.addColorStop(0, '#f7dcb8'); sky.addColorStop(.45, '#f4b48a'); sky.addColorStop(.75, '#e88a6c'); sky.addColorStop(1, '#d9735e'); }
  g.fillStyle = sky; g.fillRect(x, y, w, h);
  const cx = x + w * .66, cy = y + h * .42, R = Math.min(h * .17, w * .14);
  if (dark) {
    let s = 7; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < Math.round(w * h / 1500 / k / k + 40); i++) {
      const sx = x + rnd() * w, sy = y + rnd() * h * .62, a = .18 + rnd() * .7, sz = (rnd() > .93 ? 2.2 : 1.2) * k;
      g.fillStyle = `rgba(235,238,255,${a * (1 - (sy - y) / (h * .7))})`; g.beginPath(); g.arc(sx, sy, sz * .6, 0, 7); g.fill();
    }
  } else {
    // soft cloud bands across the warm sky
    g.globalAlpha = .35;
    for (let i = 0; i < 4; i++) {
      const cy2 = y + h * (.16 + i * .1), gr = g.createLinearGradient(0, cy2 - 8 * k, 0, cy2 + 8 * k);
      gr.addColorStop(0, 'rgba(255,240,225,0)'); gr.addColorStop(.5, 'rgba(255,240,225,.8)'); gr.addColorStop(1, 'rgba(255,240,225,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(x + w * (.2 + i * .19), cy2, w * (.22 + i * .03), 7 * k, 0, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  }
  const halo = g.createRadialGradient(cx, cy, R * .7, cx, cy, R * 4);
  halo.addColorStop(0, dark ? 'rgba(220,226,255,.38)' : 'rgba(255,242,215,.85)');
  halo.addColorStop(.35, dark ? 'rgba(160,170,240,.12)' : 'rgba(255,214,170,.35)');
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = halo; g.fillRect(x, y, w, h);
  const disc = g.createRadialGradient(cx - R * .3, cy - R * .3, R * .1, cx, cy, R);
  if (dark) { disc.addColorStop(0, '#f6f7ff'); disc.addColorStop(1, '#d9ddf6'); } else { disc.addColorStop(0, '#fffaf0'); disc.addColorStop(1, '#ffe9c8'); }
  g.fillStyle = disc; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
  if (dark) {
    g.fillStyle = 'rgba(150,160,205,.32)';
    [[-.3, -.2, .22], [.25, .1, .16], [-.05, .38, .12], [.38, -.34, .07]].forEach(([a, bb, c]) => { g.beginPath(); g.arc(cx + a * R, cy + bb * R, c * R, 0, 7); g.fill(); });
  }
  hills(g, x, y, w, h, dark ? ['#2b3268', '#1e2452', '#13183a', '#0b0e24'] : ['#e6906f', '#cb6c57', '#9e5049', '#6e3b3f'], 0, dark);
  // a still lake catching the disc
  const ly = y + h * .9;
  const lake = g.createLinearGradient(0, ly, 0, y + h);
  lake.addColorStop(0, dark ? 'rgba(80,92,170,.35)' : 'rgba(255,200,160,.35)'); lake.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = lake; g.fillRect(x, ly, w, y + h - ly);
  g.fillStyle = dark ? 'rgba(235,238,255,.5)' : 'rgba(255,240,215,.7)';
  for (let i = 0; i < 4; i++) g.fillRect(cx - R * (.8 - i * .18), ly + (3 + i * 5) * k, R * (1.6 - i * .36), 1.3 * k);
  // inner vignette
  const vg = g.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * .3, x + w / 2, y + h / 2, Math.max(w, h) * .75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, dark ? 'rgba(0,0,10,.35)' : 'rgba(80,30,20,.12)');
  g.fillStyle = vg; g.fillRect(x, y, w, h);
  g.restore();
}

// boxes: { rule:{x,y,w}, card:{x,y,w,h,r}, art:{...}, chips:[{x,y,w,h,r}] } in CSS px; k = CSS px → canvas px
export function paint(g, theme, boxes, W, H, k) {
  const T = THEMES[theme], dark = theme === 'dark';
  g.save(); g.setTransform(k, 0, 0, k, 0, 0);
  g.fillStyle = rgb(T.page); g.fillRect(0, 0, W, H);
  // a soft light falloff so the page reads as a lit sheet, not a flat fill
  const lf = g.createRadialGradient(W * .3, H * .1, 0, W * .3, H * .1, Math.hypot(W, H) * .9);
  lf.addColorStop(0, dark ? 'rgba(40,52,96,.22)' : 'rgba(255,253,246,.55)'); lf.addColorStop(1, dark ? 'rgba(0,0,0,.25)' : 'rgba(150,120,80,.08)');
  g.fillStyle = lf; g.fillRect(0, 0, W, H);
  g.restore();
  // grain at device resolution (one tile per 192 device px)
  g.save(); g.globalAlpha = dark ? .05 : .075; g.globalCompositeOperation = dark ? 'screen' : 'multiply';
  if (!dark) g.globalCompositeOperation = 'overlay';
  g.fillStyle = g.createPattern(grain(), 'repeat'); g.fillRect(0, 0, g.canvas.width, g.canvas.height); g.restore();

  g.save(); g.setTransform(k, 0, 0, k, 0, 0);
  if (boxes.rule) { g.fillStyle = T.line; g.fillRect(boxes.rule.x, boxes.rule.y, boxes.rule.w, 1); }
  const c = boxes.card;
  if (c && c.w > 0) {
    g.save(); g.shadowColor = T.shadow; g.shadowBlur = 40; g.shadowOffsetY = 18;
    g.fillStyle = rgb(T.card); rr(g, c.x, c.y, c.w, c.h, c.r); g.fill(); g.restore();
    const cg = g.createLinearGradient(0, c.y, 0, c.y + c.h);
    cg.addColorStop(0, dark ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.6)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = cg; rr(g, c.x, c.y, c.w, c.h, c.r); g.fill();
    g.strokeStyle = T.cardLine; g.lineWidth = 1; rr(g, c.x + .5, c.y + .5, c.w - 1, c.h - 1, c.r); g.stroke();
  }
  if (boxes.art && boxes.art.w > 0) art(g, boxes.art, dark, 1);
  for (const ch of boxes.chips || []) { g.fillStyle = T.chip; rr(g, ch.x, ch.y, ch.w, ch.h, ch.r); g.fill(); }
  g.restore();
}

// read the layout from the DOM, in document coordinates
export function measure() {
  const sx = scrollX, sy = scrollY;
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); if (!r.width) return null; const cs = getComputedStyle(el); return { x: r.left + sx, y: r.top + sy, w: r.width, h: r.height, r: parseFloat(cs.borderTopLeftRadius) || 0 }; };
  return {
    rule: box(document.querySelector('[data-surface=rule]')),
    card: box(document.querySelector('[data-surface=card]')),
    art: box(document.querySelector('[data-surface=art]')),
    chips: [...document.querySelectorAll('[data-surface=chip]')].map(box).filter(Boolean),
  };
}
