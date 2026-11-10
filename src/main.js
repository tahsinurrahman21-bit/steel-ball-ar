import { FrameSource, describeCameraError } from './source.js';
import { HandTracker, CONFIG } from './tracking.js';
import { DebugOverlay } from './debug.js';
import { Stage } from './stage.js';
import { SteelBall } from './ball.js';
import { Sound } from './audio.js';
import { Experience, TUNE } from './experience.js';
import { Calibration } from './calibration.js';

const q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const source = new FrameSource(), tracker = new HandTracker(), sound = new Sound();
const debug = new DebugOverlay($('overlay'));
debug.enabled = q.has('debug');
let stage, ball, exp, calib, hand = null, running = false;

const HINTS = {
  idle: 'Show an open palm to the camera', summon: 'Hold it…', ready: 'Keep your palm open · snap toward the camera to throw',
  throw: '', impact: '', dissolve: '',
};

async function start() {
  $('err').textContent = ''; $('go').disabled = true; $('go').textContent = 'Starting…';
  try { await sound.init(); } catch (e) { console.warn('audio unavailable', e); }
  if (q.has('mute')) sound.setMuted(true);
  try {
    await source.start({ sim: q.has('sim'), videoUrl: q.get('video'), manual: q.has('manual') });
  } catch (e) {
    $('err').textContent = describeCameraError(e); $('go').disabled = false; $('go').textContent = 'Try again';
    return;
  }
  tracker.mirror = q.get('mirror') !== '0';
  stage = new Stage($('gl'), source.frame);
  ball = new SteelBall(stage.envTex);
  stage.scene.add(ball.group);
  exp = new Experience(stage, ball, sound);
  ball.setLook(TUNE.look);
  calib = new Calibration({ source, tracker, stage, panel: $('calib'), out: $('cOut'), preset: $('cPreset'), diam: $('cDiam'), capture: $('cCapture'), reset: $('cReset') });
  calib.load();

  source.onFrame = (result, t) => {
    hand = tracker.update(result, t, source.aspect);
    stage.frameUpdated(tracker.mirror);
    if (calib.active) calib.onFrame(hand);
  };
  $('start').style.display = 'none'; $('bar').hidden = false;
  running = true;
  let last = performance.now() / 1000, fpsT = last, fpsN = 0, fps = 0;
  const frame = (now, dt) => {
    stage.bgU.uMirror.value = tracker.mirror ? 1 : 0; ball.u.uMirror.value = tracker.mirror ? 1 : 0;
    if (calib.active) { if (exp.state !== 'idle') exp._enter('idle'); exp.appear = 0; exp.cooldown = 0.3; }   // real ball only while calibrating
    exp.update(hand, dt, now);
    stage.render();
    debug.resize(stage.w, stage.h);
    debug.draw(hand, [
      ['state', `${exp.state}  t=${exp.t.toFixed(2)}  throws=${exp.throws}`],
      ['ball', `r=${(exp.radius * 1000).toFixed(0)} mm  ${(exp.omega / 6.283).toFixed(1)} rev/s`],
      ['render', `${fps.toFixed(0)} fps  camera ${source.fps.toFixed(0)} fps`],
      ['detect', `${source.detectMs.toFixed(1)} ms (${source.delegate})  ${source.kind} ${source.width}x${source.height}`],
      ['calib', `hand x${CONFIG.handScale.toFixed(2)}  ball x${TUNE.radiusFactor.toFixed(2)}  fov ${CONFIG.hfovDeg}°`],
    ]);
    if (calib.active) calib.draw(debug.ctx, stage.w, stage.h);
    const h = $('hint'), txt = calib.active ? '' : HINTS[exp.state];
    if (h.textContent !== txt) h.textContent = txt;
  };
  if (q.has('manual')) {
    // Test mode: the synthetic hand and the whole pipeline are stepped at a fixed rate on demand.
    let simT = 0;
    window.__app.advance = (seconds, step = 1 / 60) => {
      for (let n = Math.round(seconds / step); n > 0; n--) { simT += step; source._tick(simT); frame(simT, step); }
      return { t: +simT.toFixed(3), state: exp.state };
    };
    // Same, for a video file: seek frame by frame so every frame is detected and rendered exactly once.
    window.__app.play = async (from, to, fps = 30) => {
      const v = source.video; let seenHand = 0, n = 0;
      for (let t = from; t <= to; t += 1 / fps) {
        await new Promise((res) => { v.onseeked = res; v.currentTime = t; });
        simT += 1 / fps; source._tick(simT); frame(simT, 1 / fps); n++; if (hand?.present) seenHand++;
      }
      return { frames: n, seenHand, state: exp.state, videoT: +v.currentTime.toFixed(2) };
    };
    return;
  }
  const loop = () => {
    if (!running) return;
    const now = performance.now() / 1000, dt = Math.min(0.05, Math.max(0.001, now - last)); last = now;
    fpsN++; if (now - fpsT > 0.5) { fps = fpsN / (now - fpsT); fpsT = now; fpsN = 0; }
    frame(now, dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

const STYLE_ORDER = ['hybrid', 'anime', 'metal'];
// style and look are remembered between visits
const PREFS = 'steelball.prefs.v1';
try { const p = JSON.parse(localStorage.getItem(PREFS) || '{}'); if (STYLE_ORDER.includes(p.style)) TUNE.style = p.style; if (p.look === 'classic' || p.look === 'new') TUNE.look = p.look; } catch { /* ignore */ }
if (STYLE_ORDER.includes(q.get('style'))) TUNE.style = q.get('style');
if (q.get('look') === 'classic' || q.get('look') === 'new') TUNE.look = q.get('look');
const showPrefs = (save = true) => {
  $('bStyle').firstChild.textContent = `Style: ${TUNE.style}`; $('bLook').firstChild.textContent = `Look: ${TUNE.look}`;
  if (save) { try { localStorage.setItem(PREFS, JSON.stringify({ style: TUNE.style, look: TUNE.look })); } catch { /* private mode */ } }
};
showPrefs(false);
const actions = {
  d: () => { debug.enabled = !debug.enabled; $('bDebug').setAttribute('aria-pressed', debug.enabled); },
  s: () => { TUNE.style = STYLE_ORDER[(STYLE_ORDER.indexOf(TUNE.style) + 1) % 3]; showPrefs(); },
  l: () => { TUNE.look = TUNE.look === 'new' ? 'classic' : 'new'; ball?.setLook(TUNE.look); showPrefs(); },
  c: () => { if (!calib) return; calib.toggle(); $('bCalib').setAttribute('aria-pressed', calib.active); },
  m: () => { tracker.mirror = !tracker.mirror; tracker.reset(); $('bMirror').setAttribute('aria-pressed', tracker.mirror); },
  o: () => { if (!exp) return; exp.occlusion = !exp.occlusion; $('bOcc').setAttribute('aria-pressed', exp.occlusion); },
  p: () => { if (exp) exp.showProxy = !exp.showProxy; },                                   // show the finger proxy (debug)
  h: () => { CONFIG.swapHands = !CONFIG.swapHands; },                                      // ball on the wrong side of the hand
  n: () => { sound.setMuted(!sound.muted); $('bMute').setAttribute('aria-pressed', sound.muted); },
  f: () => { document.body.classList.toggle('fill'); $('bFill').setAttribute('aria-pressed', document.body.classList.contains('fill')); },
};
addEventListener('keydown', (e) => {
  if (e.target?.matches?.('input, select') || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  actions[e.key.toLowerCase()]?.();
});
for (const [id, key] of [['bDebug', 'd'], ['bStyle', 's'], ['bLook', 'l'], ['bCalib', 'c'], ['bMirror', 'm'], ['bOcc', 'o'], ['bMute', 'n'], ['bFill', 'f']]) $(id).onclick = actions[key];
$('bDebug').setAttribute('aria-pressed', debug.enabled);
$('go').onclick = start;
if (q.has('sim') || q.has('video')) start();

// handles for testing from the console
window.__app = { get exp() { return exp; }, get hand() { return hand; }, get stage() { return stage; }, get ball() { return ball; }, source, tracker, sound, TUNE, CONFIG };
