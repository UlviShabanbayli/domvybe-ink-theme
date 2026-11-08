# Ink theme — UI component

**[Live demo](https://domvybe.com/components/ink-theme/)** · [Step-by-step tutorial](https://domvybe.com/library/ink-theme/) · [Download the ZIP](https://github.com/UlviShabanbayli/domvybe-ink-theme/releases/latest/download/ink-theme-source.zip)

A dark mode switch that pours real ink: turn it on and ink curls out of the switch through the page, and wherever it settles the page is dark; turn it off and milk pours back.

Open `index.html` through any local static server (for example `python3 -m http.server`) and try it with a mouse,
a finger or the keyboard. Plain HTML, CSS and JavaScript; no build step, no libraries.

- `index.html` — the journal page: the skip link, the two canvases (the ink, and the fallback for no WebGL), the nav with the logo, the links, Subscribe and the role=switch toggle with its sun and crescent knob, the hero, the feature card, the hint, and a pre-paint script (the saved theme, never the OS, old keys, the first-visit pour)
- `css` — ink.css: the type layer in white and grey with mix-blend-mode difference over the canvas, the toggle (gloss pill, sun to crescent knob, hover, focus, busy), the desktop frame on the 1600 x 1000 grid scaled by --s, the stacked phone and tablet layouts, reduced motion
- `js` — app.js (the switch, the stored theme, the first-visit pour, stirring, the fallback that reveals the new theme in a circle from the switch, the test hook), ink.js (the pour: the jet, the plumes on the wet front, ink and milk, the composite over the painted pages), fluid.js (the stable-fluids solver, WebGL 2), surfaces.js (the paper and night pages painted with Canvas 2D from the live layout)

Inkwell is made up and its links go nowhere. Everything is made in code: the paper, the night page and the card's sun
and moon landscapes are painted with Canvas 2D from the live layout, the ink and the milk are a stable-fluids simulation
in WebGL 2, and every word and the switch are HTML (the type inverts over the ink with `mix-blend-mode: difference`);
no AI pictures. The switch is a real `role=switch` button. The theme is applied before the first paint from
`localStorage` (`dv76.v1.theme`, the only key kept), never from the system setting, so read it there or hook your own
theme into `js/app.js`. A first visit opens on a showcase pour (`?static` skips it). Without WebGL 2 (or with `?nofx`, or
when the context is lost, even mid-pour) the new theme is revealed in a circle growing out of the switch. The page reads
Google Fonts (Instrument Serif, Manrope).

It respects `prefers-reduced-motion`. Made by Ulvi (Code with Ulvi) · domvybe.com

## Licence

MIT — see [LICENSE](LICENSE). Use it in your own projects, commercial ones included.
