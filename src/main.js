import { FrameSource, describeCameraError } from './source.js';
import { HandSlots, CONFIG } from './tracking.js';
import { DebugOverlay } from './debug.js';
import { Stage } from './stage.js';
import { SteelBall } from './ball.js';
import { Sound } from './audio.js';
import { Experience, STATE_RANK, TUNE } from './experience.js';
import { Calibration } from './calibration.js';
import { GyroHat, HeadTracker } from './hat.js';

const q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const MAX_HANDS = 2;
const source = new FrameSource(), slots = new HandSlots(MAX_HANDS), tracker = slots.trackers[0], sound = new Sound();
const debug = new DebugOverlay($('overlay'));
debug.enabled = q.has('debug');
// one ball (and one performance) per hand slot; ball/exp/hand are slot 0, the first hand
let stage, balls = [], exps = [], hands = [], ball, exp, calib, hand = null, running = false, leadIdx = 0;
const headTracker = new HeadTracker(), hat = new GyroHat();
let head = null;

const HINTS = {
  idle: 'Show an open palm to the camera', summon: 'Hold it…', ready: 'Keep your palm open · snap toward the camera to throw',
  throw: '', impact: '', dissolve: '',
};

// The ball doing the most gets the screen-wide effects (grade, speed lines, flash, shake).
function pickLead() {
  exps.forEach((e, i) => { if (STATE_RANK[e.state] > STATE_RANK[exps[leadIdx].state]) leadIdx = i; });
  exps.forEach((e, i) => { e.lead = i === leadIdx; });
  return exps[leadIdx];
}

// Both balls thrown together: the lens effects are shared and centred between them.
function shareDouble() {
  const [a, b] = exps;
  const flying = (e) => e.double && (e.state === 'throw' || e.state === 'impact');
  if (!flying(a) || !flying(b)) return;
  const po = stage.postU, bg = stage.bgU;
  const fx = (k) => Math.max(a.fx[k], b.fx[k]), imp = (k) => Math.max(a.imp[k], b.imp[k]);
  if (a.state === 'throw' || b.state === 'throw') po.uCenter.value.set((a.sx + b.sx) / 2, (a.sy + b.sy) / 2);
  po.uBlur.value = fx('blur'); po.uLines.value = fx('lines'); po.uVig.value = fx('vig');
  po.uLinesInner.value = 0.16 + 0.5 * fx('blur');
  po.uCA.value = fx('ca') + imp('ca');
  po.uFlash.value = Math.min(1, imp('flash'));
  po.uShockAmt.value = Math.min(1.5, a.imp.shockAmt + b.imp.shockAmt * 0.5);
  const sh = imp('shake');
  po.uShake.value.set((Math.random() - 0.5) * 0.03 * sh, (Math.random() - 0.5) * 0.03 * sh);
  bg.uGrade.value = fx('grade'); bg.uGold.value = fx('gold'); bg.uBloom.value = fx('bloom');
}

// One spin voice: the loudest ball sets pitch and approach; a second spinning ball thickens it.
function mixSpin() {
  const o = exps.map((e) => e.spinOut).sort((a, b) => b.level * (1 + b.approach) - a.level * (1 + a.approach));
  const a = o[0], b = o[1] ?? { level: 0, pan: 0 };
  const sum = a.level + b.level;
  sound.spin(Math.min(1, a.level + b.level * 0.35), a.rate, sum > 0 ? (a.pan * a.level + b.pan * b.level) / sum : 0, a.approach);
}

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
  slots.mirror = q.get('mirror') !== '0';
  stage = new Stage($('gl'), source.frame);
  for (let i = 0; i < MAX_HANDS; i++) {
    const b = new SteelBall(stage.envTex);
    b.setLook(TUNE.look);
    stage.scene.add(b.group);
    balls.push(b); exps.push(new Experience(stage, b, sound));
  }
  [ball] = balls; [exp] = exps;
  exps[0].partner = exps[1]; exps[1].partner = exps[0];
  if (source.sim && q.has('simoffset')) source.sim.offset = Number(q.get('simoffset'));
  await setHands(slots.count);
  stage.scene.add(hat.group);
  setHat(hat.on);
  calib = new Calibration({ source, tracker, stage, panel: $('calib'), out: $('cOut'), preset: $('cPreset'), diam: $('cDiam'), capture: $('cCapture'), reset: $('cReset') });
  calib.load();

  source.onFrame = (result, t, face) => {
    hands = slots.update(result, t, source.aspect); [hand] = hands;
    head = hat.on ? headTracker.update(face?.faceLandmarks?.[0], source.width, source.height, slots.mirror, t) : null;
    stage.frameUpdated(slots.mirror);
    if (calib.active) calib.onFrame(hand);
  };
  $('start').style.display = 'none'; $('bar').hidden = false;
  running = true;
  let last = performance.now() / 1000, fpsT = last, fpsN = 0, fps = 0;
  const frame = (now, dt) => {
    stage.bgU.uMirror.value = slots.mirror ? 1 : 0;
    for (const b of balls) b.u.uMirror.value = slots.mirror ? 1 : 0;
    if (calib.active) for (const e of exps) { if (e.state !== 'idle') e._enter('idle'); e.appear = 0; e.cooldown = 0.3; }   // real ball only while calibrating
    const lead = pickLead();
    stage.bgU.uBloom2.value = 0;
    exps.forEach((e, i) => e.update(hands[i] ?? null, dt, now));
    shareDouble();
    mixSpin();
    hat.update(head, stage.light, dt);
    stage.render();
    debug.resize(stage.w, stage.h);
    debug.draw(hands.slice(0, slots.count), [
      ...exps.slice(0, slots.count).map((e, i) => [slots.count > 1 ? `ball ${i + 1}` : 'state', `${e.state}  t=${e.t.toFixed(2)}  throws=${e.throws}  ${(e.omega / 6.283).toFixed(1)} rev/s${slots.count > 1 && e === lead ? '  (lead)' : ''}`]),
      ['ball', `r=${(exp.radius * 1000).toFixed(0)} mm`],
      ['render', `${fps.toFixed(0)} fps  camera ${source.fps.toFixed(0)} fps`],
      ['detect', `${source.detectMs.toFixed(1)} ms (${source.delegate})  ${source.kind} ${source.width}x${source.height}`],
      ['calib', `hand x${CONFIG.handScale.toFixed(2)}  ball x${TUNE.radiusFactor.toFixed(2)}  fov ${CONFIG.hfovDeg}°`],
    ]);
    if (calib.active) calib.draw(debug.ctx, stage.w, stage.h);
    let txt = calib.active ? '' : HINTS[lead.state];
    if (!calib.active && slots.count > 1) {
      const active = exps.slice(0, 2).map((e) => e.state);
      if (active.every((s) => s === 'idle')) txt = 'Show one or both open palms to the camera';
      else if (active.includes('ready') && active.includes('idle')) txt = 'Open your other palm for a second ball · snap a hand toward the camera to throw';
      else if (active.every((s) => s === 'ready')) txt = 'Two balls · throw them one at a time, or both together';
    }
    const h = $('hint');
    if (h.textContent !== txt) h.textContent = txt;
  };
  if (q.has('manual')) {
    // Test mode: the synthetic hand and the whole pipeline are stepped at a fixed rate on demand.
    let simT = 0;
    const states = () => exps.slice(0, slots.count).map((e) => e.state);
    window.__app.advance = (seconds, step = 1 / 60) => {
      for (let n = Math.round(seconds / step); n > 0; n--) { simT += step; source._tick(simT); frame(simT, step); }
      return { t: +simT.toFixed(3), state: exp.state, states: states() };
    };
    // Same, for a video file: seek frame by frame so every frame is detected and rendered exactly once.
    window.__app.play = async (from, to, fps = 30) => {
      const v = source.video; let seenHand = 0, seenBoth = 0, n = 0;
      for (let t = from; t <= to; t += 1 / fps) {
        await new Promise((res) => { v.onseeked = res; v.currentTime = t; });
        simT += 1 / fps; source._tick(simT); frame(simT, 1 / fps); n++;
        if (hand?.present) seenHand++;
        if (hands.filter((x) => x?.present).length > 1) seenBoth++;
      }
      return { frames: n, seenHand, seenBoth, state: exp.state, states: states(), videoT: +v.currentTime.toFixed(2) };
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
const LOOKS = ['new', 'classic', 'sbr'], LOOK_LABEL = { new: 'new', classic: 'classic', sbr: 'SBR' };
// Gyro's hat: switching it on loads the face model the first time
async function setHat(on) {
  hat.on = on; $('bHat').setAttribute('aria-pressed', on); $('hatPanel').style.display = on ? 'block' : 'none';
  if (!on || !running && !stage) return;
  try { await source.enableFace(true); } catch (e) { console.warn('hat: face model failed to load', e); hat.on = false; $('bHat').setAttribute('aria-pressed', false); }
}
// One or two hands, a ball on each
async function setHands(n) {
  slots.count = n; $('bHands').setAttribute('aria-pressed', n > 1);
  if (!stage) return;
  // a ball whose hand is no longer tracked puts itself away
  try { await source.setNumHands(n); } catch (e) { console.warn('could not switch the number of hands', e); }
}
// style, look, hat and hands are remembered between visits
const PREFS = 'steelball.prefs.v1';
try {
  const p = JSON.parse(localStorage.getItem(PREFS) || '{}');
  if (STYLE_ORDER.includes(p.style)) TUNE.style = p.style;
  if (LOOKS.includes(p.look)) TUNE.look = p.look;
  if (p.sound === 'sbr') sound.bank = 'sbr';
  hat.on = !!p.hat; for (const k of ['size', 'height', 'depth', 'tilt']) if (Number.isFinite(p.fit?.[k])) hat[k] = p.fit[k];
  if (p.hands === 2) slots.count = 2;
} catch { /* ignore */ }
if (q.has('hat')) hat.on = q.get('hat') !== '0';
if (q.has('hands')) slots.count = q.get('hands') === '2' ? 2 : 1;
if (STYLE_ORDER.includes(q.get('style'))) TUNE.style = q.get('style');
if (LOOKS.includes(q.get('look'))) TUNE.look = q.get('look');
if (q.has('sound')) sound.bank = q.get('sound') === 'sbr' ? 'sbr' : 'synth';
const showPrefs = (save = true) => {
  $('bStyle').firstChild.textContent = `Style: ${TUNE.style}`; $('bLook').firstChild.textContent = `Look: ${LOOK_LABEL[TUNE.look]}`;
  $('bSound').firstChild.textContent = `Sound: ${sound.bank === 'sbr' ? 'SBR' : 'synth'}`;
  $('bHands').setAttribute('aria-pressed', slots.count > 1);
  if (save) { try { localStorage.setItem(PREFS, JSON.stringify({ style: TUNE.style, look: TUNE.look, sound: sound.bank, hat: hat.on, hands: slots.count, fit: { size: hat.size, height: hat.height, depth: hat.depth, tilt: hat.tilt } })); } catch { /* private mode */ } }
};
showPrefs(false);
// hat fit sliders
const FIT = [['hSize', 'size', (v) => `${Math.round(v * 100)}%`], ['hHeight', 'height', (v) => `${(v * 100).toFixed(1)} cm`], ['hDepth', 'depth', (v) => `${(v * 100).toFixed(1)} cm`], ['hTilt', 'tilt', (v) => `${Math.round((v * 180) / Math.PI)}°`]];
const showFit = () => { for (const [id, key, fmt] of FIT) { $(id).value = hat[key]; $(`${id}O`).textContent = fmt(hat[key]); } };
for (const [id, key] of FIT) $(id).oninput = (e) => { hat[key] = Number(e.target.value); showFit(); showPrefs(); };
$('hReset').onclick = () => { hat.size = 1; hat.height = 0; hat.depth = 0; hat.tilt = 0; showFit(); showPrefs(); };
$('hClose').onclick = () => { $('hatPanel').style.display = 'none'; };
showFit();
const actions = {
  d: () => { debug.enabled = !debug.enabled; $('bDebug').setAttribute('aria-pressed', debug.enabled); },
  s: () => { TUNE.style = STYLE_ORDER[(STYLE_ORDER.indexOf(TUNE.style) + 1) % 3]; showPrefs(); },
  g: () => { setHat(!hat.on); showPrefs(); },
  l: () => { TUNE.look = LOOKS[(LOOKS.indexOf(TUNE.look) + 1) % LOOKS.length]; for (const b of balls) b.setLook(TUNE.look); showPrefs(); },
  v: () => { sound.setBank(sound.bank === 'sbr' ? 'synth' : 'sbr'); showPrefs(); },
  2: () => { setHands(slots.count > 1 ? 1 : 2); showPrefs(); },
  c: () => { if (!calib) return; calib.toggle(); $('bCalib').setAttribute('aria-pressed', calib.active); },
  m: () => { slots.mirror = !slots.mirror; slots.reset(); $('bMirror').setAttribute('aria-pressed', slots.mirror); },
  o: () => { if (!exp) return; const on = !exp.occlusion; for (const e of exps) e.occlusion = on; $('bOcc').setAttribute('aria-pressed', on); },
  p: () => { for (const e of exps) e.showProxy = !e.showProxy; },                          // show the finger proxy (debug)
  h: () => { CONFIG.swapHands = !CONFIG.swapHands; },                                      // ball on the wrong side of the hand
  n: () => { sound.setMuted(!sound.muted); $('bMute').setAttribute('aria-pressed', sound.muted); },
  f: () => { document.body.classList.toggle('fill'); $('bFill').setAttribute('aria-pressed', document.body.classList.contains('fill')); },
};
addEventListener('keydown', (e) => {
  if (e.target?.matches?.('input, select') || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  actions[e.key.toLowerCase()]?.();
});
for (const [id, key] of [['bDebug', 'd'], ['bStyle', 's'], ['bLook', 'l'], ['bSound', 'v'], ['bHands', '2'], ['bHat', 'g'], ['bCalib', 'c'], ['bMirror', 'm'], ['bOcc', 'o'], ['bMute', 'n'], ['bFill', 'f']]) $(id).onclick = actions[key];
$('bDebug').setAttribute('aria-pressed', debug.enabled);
$('go').onclick = start;
if (q.has('sim') || q.has('video')) start();

// handles for testing from the console
window.__app = {
  get exp() { return exp; }, get exps() { return exps; }, get hand() { return hand; }, get hands() { return hands; },
  get stage() { return stage; }, get ball() { return ball; }, get balls() { return balls; }, get head() { return head; },
  hat, source, slots, tracker, sound, TUNE, CONFIG, setHands,
};
