// Hand tracking: MediaPipe landmarks -> metric 3D hand in camera space + gestures.
//
// Conventions
//   "raw"     MediaPipe camera frame: x right, y down, z away from camera (unmirrored image).
//   "display" Three.js camera frame:  x right, y up,   z toward the viewer, metres.
//             When the view is mirrored (selfie), display x is flipped as well.
import { FaceLandmarker, FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

export const CONFIG = {
  hfovDeg: 62,            // assumed horizontal field of view of the webcam
  handScale: 1,           // real hand size / MediaPipe's assumed hand size (set by calibration)
  swapHands: false,       // flip left/right interpretation (for drivers that pre-mirror the feed)
  // gesture thresholds
  openEnter: 0.72, openExit: 0.5,       // mean finger extension
  facingEnter: 0.25, facingExit: 0.02,  // cos(angle between palm normal and direction to camera)
  throwSpeed: 1.5,        // m/s, any direction
  throwToward: 0.85,      // m/s, component toward the camera
  throwFrames: 2,         // consecutive frames over threshold
};

const FINGERS = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
export const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

// One-Euro filter over a Float32Array (Casiez et al.): low lag when moving, low jitter at rest.
export class OneEuro {
  constructor(n, minCutoff, beta, dCutoff = 1.5) {
    this.n = n; this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff;
    this.x = null; this.dx = new Float32Array(n);
  }
  static alpha(cutoff, dt) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
  reset() { this.x = null; this.dx.fill(0); }
  filter(v, dt) {
    if (!this.x) { this.x = Float32Array.from(v); return this.x; }
    const ad = OneEuro.alpha(this.dCutoff, dt);
    for (let i = 0; i < this.n; i++) {
      const d = (v[i] - this.x[i]) / dt;
      this.dx[i] += ad * (d - this.dx[i]);
      const a = OneEuro.alpha(this.minCutoff + this.beta * Math.abs(this.dx[i]), dt);
      this.x[i] += a * (v[i] - this.x[i]);
    }
    return this.x;
  }
}

const sub = (a, i, j) => [a[i * 3] - a[j * 3], a[i * 3 + 1] - a[j * 3 + 1], a[i * 3 + 2] - a[j * 3 + 2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export async function createFaceLandmarker() {
  const fileset = await FilesetResolver.forVisionTasks('/node_modules/@mediapipe/tasks-vision/wasm');
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: '/assets/mediapipe/face_landmarker.task', delegate },
    runningMode: 'VIDEO', numFaces: 1,
  });
  try { return await FaceLandmarker.createFromOptions(fileset, opts('GPU')); }
  catch (e) { console.warn('GPU delegate unavailable for the face model, using CPU', e); return FaceLandmarker.createFromOptions(fileset, opts('CPU')); }
}

export async function createLandmarker() {
  const fileset = await FilesetResolver.forVisionTasks('/node_modules/@mediapipe/tasks-vision/wasm');
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: '/assets/mediapipe/hand_landmarker.task', delegate },
    runningMode: 'VIDEO', numHands: 1,
    minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  });
  try { return { landmarker: await HandLandmarker.createFromOptions(fileset, opts('GPU')), delegate: 'GPU' }; }
  catch (e) {
    console.warn('GPU delegate unavailable, using CPU', e);
    return { landmarker: await HandLandmarker.createFromOptions(fileset, opts('CPU')), delegate: 'CPU' };
  }
}

export class HandTracker {
  constructor() {
    this.mirror = true;
    this.fShape = new OneEuro(63, 2.0, 60);     // hand-relative landmarks (metres)
    this.fTrans = new OneEuro(3, 1.6, 9);       // hand translation (metres)
    this.fImg = new OneEuro(42, 2.5, 3);        // image landmarks (normalised)
    this.lastT = 0; this.prevCenter = null;
    this.vel = [0, 0, 0]; this.overFrames = 0; this.open = false; this.facingOk = false;
    this.peakSpeed = 0; this.peakToward = 0; this.lastSeen = -1e9;
    this.rightBelief = 0;
    this.state = null;
  }

  reset() {
    this.fShape.reset(); this.fTrans.reset(); this.fImg.reset();
    this.prevCenter = null; this.vel = [0, 0, 0]; this.overFrames = 0; this.open = false; this.facingOk = false;
    this.rightBelief = 0;
  }

  // result: MediaPipe HandLandmarkerResult, t: seconds, aspect: image width / height
  update(result, t, aspect) {
    const lm = result?.landmarks?.[0], wl = result?.worldLandmarks?.[0];
    if (!lm || !wl) {
      const lostFor = t - this.lastSeen;
      const prev = this.state;
      if (lostFor > 0.25) this.reset();
      this.state = { present: false, t, lostFor, last: prev?.present ? prev : prev?.last ?? null };
      return this.state;
    }
    let dt = Math.min(0.1, Math.max(1 / 120, t - this.lastT));
    if (t - this.lastSeen > 0.25) { this.reset(); dt = 1 / 30; }
    this.lastT = t; this.lastSeen = t;

    // --- translation solve: find t so that (world + t) projects onto the image landmarks.
    const tanH = Math.tan((CONFIG.hfovDeg * Math.PI) / 360);
    const s = CONFIG.handScale;
    let su = 0, sv = 0, suu = 0, b1 = 0, b2 = 0, b3 = 0;
    const shape = new Float32Array(63), img = new Float32Array(42);
    for (let i = 0; i < 21; i++) {
      const X = wl[i].x * s, Y = wl[i].y * s, Z = wl[i].z * s;
      shape[i * 3] = X; shape[i * 3 + 1] = Y; shape[i * 3 + 2] = Z;
      img[i * 2] = lm[i].x; img[i * 2 + 1] = lm[i].y;
      const u = (lm[i].x - 0.5) * 2 * tanH, v = ((lm[i].y - 0.5) * 2 * tanH) / aspect;
      const r1 = u * Z - X, r2 = v * Z - Y;
      su += u; sv += v; suu += u * u + v * v; b1 += r1; b2 += r2; b3 += -u * r1 - v * r2;
    }
    // normal equations [[n,0,-su],[0,n,-sv],[-su,-sv,suu]] * [tx,ty,tz] = [b1,b2,b3]
    const n = 21, det = n * (n * suu - sv * sv) - su * (n * su);
    let tz = (n * n * b3 + n * su * b1 + n * sv * b2) / (det || 1e-9);
    tz = Math.min(3, Math.max(0.12, tz));
    const tx = (b1 + su * tz) / n, ty = (b2 + sv * tz) / n;

    const fs = this.fShape.filter(shape, dt), ft = this.fTrans.filter([tx, ty, tz], dt), fi = this.fImg.filter(img, dt);

    // --- palm frame in raw coordinates
    // Which side of the hand is the palm? cross(index - wrist, pinky - wrist) points out of the palm
    // for a right hand and out of the back for a left hand, so the answer hinges on handedness.
    // Two sources vote: MediaPipe's label (on the unmirrored frame it matched the hand's true
    // appearance in testing) and anatomy: fingertips and thumb only ever curl toward the palm side.
    // Anatomy wins when the curl is clear; the label decides for a flat hand.
    const label = result.handednesses?.[0]?.[0]?.categoryName ?? result.handedness?.[0]?.[0]?.categoryName ?? 'Right';
    const a = sub(fs, 5, 0), b = sub(fs, 17, 0);
    const n0 = norm(cross(a, b));
    let curl = 0;
    for (const [m, , , tip] of FINGERS) curl += dot(norm(sub(fs, tip, m)), n0) / 5;
    const vote = Math.abs(curl) > 0.15 ? Math.sign(curl) : label === 'Right' ? 1 : -1;
    this.rightBelief += 0.25 * (vote - this.rightBelief);
    const physicalRight = (this.rightBelief >= 0) !== CONFIG.swapHands;
    const nRaw = physicalRight ? n0 : [-n0[0], -n0[1], -n0[2]];
    const upRaw = norm(sub(fs, 9, 0));
    const sideRaw = norm(cross(upRaw, nRaw));
    const cRaw = [0, 0, 0];
    for (const i of [0, 5, 9, 13, 17]) { cRaw[0] += fs[i * 3] / 5; cRaw[1] += fs[i * 3 + 1] / 5; cRaw[2] += fs[i * 3 + 2] / 5; }
    // nudge toward the hollow of the palm (a little toward the fingers from the 5-point mean)
    const m9 = [fs[27], fs[28], fs[29]];
    for (let k = 0; k < 3; k++) cRaw[k] += (m9[k] - cRaw[k]) * 0.18;
    const width = len(sub(fs, 5, 17));

    // --- gestures (on the shape, independent of position)
    const ext = FINGERS.map(([m, p, d, tip], f) => {
      const v1 = norm(sub(fs, p, m)), v2 = norm(sub(fs, tip, p));
      const straight = dot(v1, v2);                       // 1 = straight, <0 = folded back
      const lo = f === 0 ? 0.35 : 0.3, hi = f === 0 ? 0.8 : 0.85;
      return Math.min(1, Math.max(0, (straight - lo) / (hi - lo)));
    });
    const openness = (ext[0] * 0.6 + ext[1] + ext[2] + ext[3] + ext[4]) / 4.6;
    const fingersUp = ext.map((e) => e > 0.55);
    this.open = this.open ? openness > CONFIG.openExit : openness > CONFIG.openEnter && fingersUp.slice(1).filter(Boolean).length >= 3;

    const cCam = [cRaw[0] + ft[0], cRaw[1] + ft[1], cRaw[2] + ft[2]];
    const toCam = norm([-cCam[0], -cCam[1], -cCam[2]]);
    const facing = dot(nRaw, toCam);
    this.facingOk = this.facingOk ? facing > CONFIG.facingExit : facing > CONFIG.facingEnter;

    // --- to display space
    const mx = this.mirror ? -1 : 1;
    const toDisp = (v) => [mx * v[0], -v[1], -v[2]];
    const pts = new Float32Array(63);
    for (let i = 0; i < 21; i++) {
      pts[i * 3] = mx * (fs[i * 3] + ft[0]); pts[i * 3 + 1] = -(fs[i * 3 + 1] + ft[1]); pts[i * 3 + 2] = -(fs[i * 3 + 2] + ft[2]);
    }
    const imgD = new Float32Array(42);
    for (let i = 0; i < 21; i++) { imgD[i * 2] = this.mirror ? 1 - fi[i * 2] : fi[i * 2]; imgD[i * 2 + 1] = fi[i * 2 + 1]; }
    const center = toDisp(cCam);

    // --- velocity (display space) and throw detection
    if (this.prevCenter) {
      const k = 1 - Math.exp(-dt / 0.045);
      for (let i = 0; i < 3; i++) this.vel[i] += k * ((center[i] - this.prevCenter[i]) / dt - this.vel[i]);
    }
    this.prevCenter = center;
    const speed = len(this.vel);
    const toward = dot(this.vel, norm([-center[0], -center[1], -center[2]]));   // + = approaching the lens
    const over = speed > CONFIG.throwSpeed || toward > CONFIG.throwToward;
    this.overFrames = over ? this.overFrames + 1 : 0;
    this.peakSpeed = Math.max(this.peakSpeed * 0.97, speed);
    this.peakToward = Math.max(this.peakToward * 0.97, toward);

    this.state = {
      present: true, t, dt, lostFor: 0,
      pts, img: imgD, handedness: physicalRight ? 'Right' : 'Left',
      score: result.handednesses?.[0]?.[0]?.score ?? 1,
      palm: { center, normal: toDisp(nRaw), up: toDisp(upRaw), side: toDisp(sideRaw), width },
      distance: len(center), facing, facingOk: this.facingOk,
      ext, fingersUp, openness, isOpen: this.open, summonPose: this.open && this.facingOk,
      vel: [...this.vel], speed, toward, throwing: this.overFrames >= CONFIG.throwFrames,
      peakSpeed: this.peakSpeed, peakToward: this.peakToward,
    };
    return this.state;
  }
}

// Project a display-space point to normalised screen coordinates (0..1, y down).
export function project(p, aspect) {
  const tanH = Math.tan((CONFIG.hfovDeg * Math.PI) / 360);
  const z = -p[2];
  return [0.5 + p[0] / (z * 2 * tanH), 0.5 - (p[1] * aspect) / (z * 2 * tanH)];
}

// Several hands at once. Each detected hand keeps its slot from frame to frame (the slot
// whose hand was last seen nearest to it), so a ball stays with the hand that summoned it.
// A newly seen hand goes to the slot for its side: slot 0 the right hand, slot 1 the left.
export class HandSlots {
  constructor(n = 2) {
    this.trackers = Array.from({ length: n }, () => new HandTracker());
    this.lastPos = new Array(n).fill(null); this.lastT = new Array(n).fill(-1e9);
    this.count = 1;                                   // how many slots are in use
  }

  get mirror() { return this.trackers[0].mirror; }
  set mirror(m) { for (const t of this.trackers) t.mirror = m; }
  reset() { for (const t of this.trackers) t.reset(); this.lastPos.fill(null); }

  update(result, t, aspect) {
    const L = result?.landmarks ?? [], labels = result?.handednesses ?? result?.handedness ?? [];
    let dets = L.map((lm, i) => {
      let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
      for (const p of lm) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
      return { i, x: (lm[0].x + lm[9].x) / 2, y: (lm[0].y + lm[9].y) / 2, box: [x0, y0, x1, y1], score: labels[i]?.[0]?.score ?? 0, label: labels[i]?.[0]?.categoryName ?? 'Right' };
    });
    // MediaPipe sometimes reports one hand twice; drop the weaker of two heavily overlapping detections
    const iou = (a, b) => {
      const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
      if (w <= 0 || h <= 0) return 0;
      const inter = w * h, area = (r) => (r[2] - r[0]) * (r[3] - r[1]);
      return inter / Math.min(area(a), area(b));
    };
    dets = dets.filter((d) => !dets.some((e) => e !== d && iou(d.box, e.box) > 0.5 && (e.score > d.score || (e.score === d.score && e.i < d.i))));
    this.duplicates = L.length - dets.length;
    const slotOf = new Array(this.trackers.length).fill(-1), used = new Set();
    // 1. hands that were already being tracked stay in their slot
    const pairs = [];
    for (let s = 0; s < this.count; s++) {
      const p = this.lastPos[s];
      if (p && t - this.lastT[s] < 0.6) for (const d of dets) pairs.push([Math.hypot(d.x - p[0], (d.y - p[1]) / aspect), s, d.i]);
    }
    pairs.sort((a, b) => a[0] - b[0]);
    for (const [dist, s, i] of pairs) if (dist < 0.25 && slotOf[s] < 0 && !used.has(i)) { slotOf[s] = i; used.add(i); }
    // 2. new hands take the slot for their side if it is free, otherwise any free slot
    for (const d of dets) {
      if (used.has(d.i)) continue;
      const pref = d.label === 'Left' ? 1 : 0;
      const s = [pref, ...this.trackers.keys()].find((k) => k < this.count && slotOf[k] < 0);
      if (s !== undefined) { slotOf[s] = d.i; used.add(d.i); }
    }
    return this.trackers.map((tr, s) => {
      const i = slotOf[s];
      if (i < 0) return tr.update(null, t, aspect);
      const d = dets.find((e) => e.i === i);
      this.lastPos[s] = [d.x, d.y]; this.lastT[s] = t;
      return tr.update({ landmarks: [L[i]], worldLandmarks: [result.worldLandmarks[i]], handednesses: [labels[i] ?? []] }, t, aspect);
    });
  }
}
