// All painting waits run at 2x; a completed picture is held before release.
const PLAYBACK_RATE = 2;
let previousFrame = null, completedCycle = false;
function notify(type) { parent.postMessage({ channel: 'second-self:painting', type }, '*'); }
window.addEventListener('error', () => notify('error'), true);
window.addEventListener('unhandledrejection', () => notify('error'));
document.addEventListener('visibilitychange', () => { previousFrame = null; });
function setup() {
  engine.setup();
  document.querySelector('canvas')?.addEventListener('webglcontextlost', () => notify('error'));
}
function draw() {
  const now = performance.now();
  const delta = !document.hidden && previousFrame !== null ? Math.min(now - previousFrame, 100) * PLAYBACK_RATE : 0;
  previousFrame = document.hidden ? null : now;
  if (engine.draw(delta) && !completedCycle) { completedCycle = true; notify('cycle-complete'); }
}
