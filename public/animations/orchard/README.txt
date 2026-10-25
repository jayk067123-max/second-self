Orchard loading animation

Source: HTML supplied by the project owner on 2026-10-25.
The original p5/p5.brush drawing engine, palette, stroke functions, 600x600
canvas, 9000ms drawing and 1500ms hold are retained. No substitute SVG artwork.
Integration changes: local script URLs; responsive host CSS; hidden duplicate
English status; pixelDensity(1); ?motion=still freezes the completed original
painting for reduced-motion users. ?motion=play runs the original loop.
The host adds lng=en to use p5's bundled diagnostic language without a CDN fetch.

Bundled dependencies, unmodified:
p5 2.3.3: https://cdn.jsdelivr.net/npm/p5@2.3.3/lib/p5.js
License: LGPL-2.1; see LICENSE-p5.txt and the p5.js source headers.
Source repository: https://github.com/processing/p5.js
p5.brush 2.2.2: https://cdn.jsdelivr.net/npm/p5.brush@2.2.2/dist/p5.brush.min.js
License: MIT; see LICENSE-p5.brush.txt.
Source repository: https://github.com/acamposuribe/p5.brush

Animation runtime uses WebGL. Both dependencies are served from this folder;
no CDN network connection is needed while viewing the animation.
