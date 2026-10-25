function createEngine(styleConfig, opts = {}) {
  let cfg = styleConfig;
  let buf, paint, canvasEl;
  let strokes = [], idx = 0;
  let currentCycle = -1, phaseIndex = -1, fadeTimer = null;
  let drawingElapsed = 0, holdElapsed = 0, paintingComplete = false, nextCycle = false;
  let statusEl = opts.statusEl || null;
  const freeze = typeof opts.freeze === 'number' ? clamp01(opts.freeze) : null;
  const nextConfig = opts.nextConfig || (() => cfg);

  function setup() {
    pixelDensity(1);
    W = cfg.canvasSize; H = cfg.canvasSize; m = Math.min(W, H);
    const cnv = createCanvas(W, H, WEBGL);
    canvasEl = cnv.elt || cnv.canvas || document.querySelector('canvas');
    if (opts.mount) mount(opts.mount);

    ensureBrushes(3 * m / 600);

    // `paint` holds everything finished so far; `buf` is paint plus the stroke
    // being drawn. Drawing each stroke over a copy of the painting lets its wet
    // edges mix with the real colours underneath, and every copy between the
    // three surfaces is opaque (no fringes).
    paint = createGraphics(W, H, WEBGL);
    buf = createGraphics(W, H, WEBGL);
    paint.imageMode(CORNER); buf.imageMode(CORNER);
    brush.load(buf);
    // pre-warm the fill shaders into the buffer, then wipe it
    buf.push(); buf.translate(-W / 2, -H / 2);
    fillStyle('#7a86bd', 200, 0.3, 0.5, 0.3); brush.circle(W / 2, H / 2, 12);
    buf.pop(); buf.clear();
    imageMode(CORNER);
    background(cfg.palette.ground);
  }

  /* Move the one canvas into a new parent. Used by the gallery to hand the
     live canvas from card to card. */
  function mount(el) {
    if (canvasEl && el && canvasEl.parentElement !== el) el.appendChild(canvasEl);
  }

  /* Point the engine at a different style and start it from the first stroke. */
  function load(nextCfg) {
    cfg = nextCfg || cfg;
    // The canvas and the scaled brushes are both fixed at setup, so every style
    // sharing a page has to share its size. Say so rather than paint at the
    // wrong coordinates.
    if (cfg.canvasSize !== W) {
      console.warn(`engine: "${cfg.label}" wants canvasSize ${cfg.canvasSize} but the canvas is ${W}. ` +
                   'Painting at ' + W + '. All styles on one page must share a canvasSize.');
    }
    brush.load(buf);                       // brush.load is a global retarget
    randomSeed(cfg.palette.seed); noiseSeed(cfg.palette.seed);
    strokes = cfg.strokes(cfg.palette);
    // give every stroke its own seed, then lay the timeline out end to end
    // and fit it to loopMs
    let cursor = 0;
    for (const s of strokes) { s.seed = Math.floor(random() * 1e9); s.begun = false; s.rev = null; s.start = cursor; cursor += s.dur + s.gap; }
    const k = cfg.loopMs / cursor;
    for (const s of strokes) { s.start *= k; s.dur *= k; s.end = s.start + s.dur; }
    idx = 0; phaseIndex = -1;
    paint.background(cfg.palette.ground);
    background(cfg.palette.ground);
  }

  function beginStroke(s) {
    buf.clear();
    buf.push(); buf.translate(-W / 2, -H / 2);
    buf.image(paint, 0, 0, W, H);          // start from the painting so far
    randomSeed(s.seed); noiseSeed(s.seed);
    s.fn();
    flushWash();
    buf.pop();
    s.begun = true; s.p = 0;
  }
  // a finished stroke becomes part of the painting
  function foldStroke() {
    paint.push(); paint.translate(-W / 2, -H / 2);
    paint.image(buf, 0, 0, W, H);
    paint.pop();
  }
  // draw the revealed part of the stroke in progress: a slice of its box,
  // growing along its direction
  function revealSlice(s) {
    const [x0, y0, x1, y1] = s.bb;
    if (x1 <= x0 || y1 <= y0 || s.p <= 0) return;
    if (s.axis === 'x') {
      const w = Math.round((x1 - x0) * s.p); if (w <= 0) return;
      const a = s.dir > 0 ? x0 : x1 - w;
      image(buf, a, y0, w, y1 - y0, a, y0, w, y1 - y0);
    } else {
      const h = Math.round((y1 - y0) * s.p); if (h <= 0) return;
      const a = s.dir > 0 ? y0 : y1 - h;
      image(buf, x0, a, x1 - x0, h, x0, a, x1 - x0, h);
    }
  }
  function paintUpTo(t) {
    while (idx < strokes.length && strokes[idx].start <= t) {
      const s = strokes[idx];
      if (!s.begun) beginStroke(s);
      s.p = Math.min(1, (t - s.start) / s.dur);
      if (s.p >= 1) { foldStroke(); idx++; } else break;
    }
  }
  function drawFrame(t) {
    paintUpTo(t);
    image(paint, 0, 0, W, H);
    const s = strokes[idx];
    if (s && s.begun) revealSlice(s);
  }

  // deltaMs is a visible-frame clock supplied by player.js, already scaled to 2x.
  function draw(deltaMs = 0) {
    translate(-W / 2, -H / 2);
    if (currentCycle < 0 || nextCycle) {
      currentCycle++; load(nextConfig(currentCycle));
      drawingElapsed = 0; holdElapsed = 0; paintingComplete = false; nextCycle = false;
      deltaMs = 0;
    }
    if (!paintingComplete) {
      drawingElapsed = Math.min(cfg.loopMs, drawingElapsed + deltaMs);
      drawFrame(drawingElapsed);
      updateStatus(drawingElapsed / cfg.loopMs);
      if (drawingElapsed >= cfg.loopMs && idx === strokes.length) {
        paintingComplete = true; holdElapsed = 0;
      }
    } else {
      drawFrame(cfg.loopMs);
      holdElapsed += deltaMs;
      if (holdElapsed >= cfg.holdMs) { nextCycle = true; return true; }
    }
    return false;
  }

  function restart() { currentCycle = -1; nextCycle = false; }

  /* Paint up to t on demand, outside the animation loop. drawFrame is already
     incremental — paintUpTo resumes from where it left off — so the caller can
     walk t up over several frames to paint a whole picture without blocking.
     The gallery uses this to render each card's finished still at load. */
  function renderTo(t) { push(); translate(-W / 2, -H / 2); drawFrame(t); pop(); }

  /* Point at a different style and restart. The strokes are not rebuilt here —
     the next draw() does that once, via nextConfig. Used by the gallery when
     the live canvas moves to another card. */
  function switchTo(nextCfg, nextStatusEl) {
    cfg = nextCfg || cfg;
    if (nextStatusEl !== undefined) {
      if (statusEl && statusEl !== nextStatusEl) { clearTimeout(fadeTimer); statusEl.textContent = ''; }
      statusEl = nextStatusEl;
    }
    restart();
  }

  function updateStatus(progress) {
    if (!statusEl) return;
    const list = cfg.palette.phrases;
    if (!list || !list.length) return;
    let i;
    if (progress >= 1) i = list.length - 1;
    else { const active = Math.max(list.length - 1, 1); i = Math.min(Math.floor(progress * active), active - 1); }
    if (i === phaseIndex) return;
    const fresh = phaseIndex === -1;
    phaseIndex = i;
    clearTimeout(fadeTimer);
    if (fresh) { statusEl.classList.remove('fade'); statusEl.textContent = list[i]; return; }
    statusEl.classList.add('fade');
    fadeTimer = setTimeout(() => { statusEl.textContent = list[i]; statusEl.classList.remove('fade'); }, 250);
  }

  return {
    setup, draw, load, mount, restart, switchTo, renderTo,
    get config() { return cfg; },
    get canvas() { return canvasEl; },
    get playback() { return { cycle: currentCycle, drawingElapsed, holdElapsed, paintingComplete, completedStrokes: idx, totalStrokes: strokes.length }; },
  };
}
