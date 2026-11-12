// Synthetic hand for testing without a camera (?sim=1).
// Produces MediaPipe-shaped results plus a drawn stand-in "camera frame", so the whole
// pipeline (translation solve, gestures, state machine, rendering) runs unchanged.
import { CONFIG } from './tracking.js';

// Physical right hand, raw MediaPipe frame (x right, y down, z away), palm toward the camera, metres.
const OPEN = [
  [0, 0, 0],
  [0.026, -0.022, -0.006], [0.047, -0.046, -0.012], [0.062, -0.07, -0.016], [0.072, -0.092, -0.019],
  [0.026, -0.092, 0], [0.031, -0.132, -0.003], [0.033, -0.157, -0.005], [0.034, -0.178, -0.006],
  [0.005, -0.097, 0], [0.005, -0.142, -0.003], [0.005, -0.17, -0.005], [0.005, -0.193, -0.006],
  [-0.014, -0.09, 0], [-0.017, -0.13, -0.003], [-0.019, -0.155, -0.005], [-0.02, -0.175, -0.006],
  [-0.031, -0.077, 0], [-0.037, -0.107, -0.003], [-0.04, -0.126, -0.005], [-0.042, -0.142, -0.006],
];
const FIST = OPEN.map((p, i) => {
  if (i === 0 || i % 4 === 1) return p;                       // wrist + knuckles stay
  const f = Math.floor((i - 1) / 4), j = (i - 1) % 4, m = OPEN[f * 4 + 1];
  if (f === 0) return [[0.03, -0.05, -0.022], [0.012, -0.065, -0.03], [-0.004, -0.07, -0.032]][j - 1];
  return [[m[0], m[1] - 0.012, m[2] - 0.034], [m[0], m[1] + 0.018, m[2] - 0.036], [m[0], m[1] + 0.03, m[2] - 0.02]][j - 1];
});

const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Scripted performance, loops every PERIOD seconds.
export const PERIOD = 11;
function pose(time) {
  const t = time % PERIOD;
  const open = smooth(0.9, 1.4, t) * (1 - smooth(9.6, 10.1, t));
  const present = t > 0.3 && t < 10.6;
  // gentle sway while holding
  let x = 0.1 + 0.035 * Math.sin(t * 1.3), y = 0.03 + 0.02 * Math.sin(t * 0.9 + 1), z = 0.55 + 0.02 * Math.sin(t * 0.7);
  // tilt the palm from facing the lens to half "palm up" and back
  let pitch = -0.75 * smooth(3.2, 4.4, t) * (1 - smooth(5.6, 6.3, t));
  let yaw = 0.35 * Math.sin(t * 0.8) * smooth(1.5, 2.5, t);
  const roll = 0.12 * Math.sin(t * 0.6);
  // throw: wind back, then whip toward the lens
  const wind = smooth(6.9, 7.2, t) * (1 - smooth(7.2, 7.38, t));
  const thr = smooth(7.2, 7.38, t) * (1 - smooth(8.2, 9.0, t));
  z += 0.06 * wind - 0.27 * thr; y += 0.02 * wind - 0.05 * thr; pitch += 0.25 * wind - 0.3 * thr;
  return { present, open, x, y, z, pitch, yaw, roll };
}

function rot(p, { pitch, yaw, roll }) {
  let [x, y, z] = p;
  let c = Math.cos(roll), s = Math.sin(roll); [x, y] = [x * c - y * s, x * s + y * c];
  c = Math.cos(pitch); s = Math.sin(pitch); [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(yaw); s = Math.sin(yaw); [x, z] = [x * c + z * s, -x * s + z * c];
  return [x, y, z];
}

export class SimHand {
  constructor(width = 1280, height = 720) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width; this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');
    this.videoWidth = width; this.videoHeight = height;
    this.time = 0; this.hands = 1;
  }

  // Returns a MediaPipe-like result for time t (seconds) and paints the stand-in frame.
  // With hands = 2, a mirrored left hand runs the same script 1.6 s behind the right one,
  // so the two balls are summoned and thrown at different moments.
  step(t) {
    this.time = t;
    const W = this.canvas.width, H = this.canvas.height, aspect = W / H;
    const tanH = Math.tan((CONFIG.hfovDeg * Math.PI) / 360);
    const pivot = [0.005, -0.06, 0];                      // centre the rotation on mid-palm so the hand turns in place
    const specs = this.hands > 1
      ? [{ p: pose(t), side: 1, base: -0.13 }, { p: pose(t - 1.6), side: -1, base: 0.13 }]
      : [{ p: pose(t), side: 1, base: null }];
    const out = { landmarks: [], worldLandmarks: [], handednesses: [] }, drawn = [];
    for (const { p, side, base } of specs) {
      const x = base === null ? p.x : base + side * (p.x - 0.1);
      const world = OPEN.map((o, i) => {
        const r = rot([0, 1, 2].map((k) => lerp(FIST[i][k], o[k], p.open) - pivot[k]), p);
        return [r[0] * side, r[1], r[2]];                 // side -1 mirrors a right hand into a left hand
      });
      const cam = world.map((w) => [w[0] + x, w[1] - p.y, w[2] + p.z]);
      const lm = cam.map((c) => ({ x: 0.5 + c[0] / (c[2] * 2 * tanH), y: 0.5 + (c[1] * aspect) / (c[2] * 2 * tanH), z: 0 }));
      if (!p.present) continue;
      drawn.push({ lm, cam });
      const cx = world.reduce((a, w) => a + w[0], 0) / 21, cy = world.reduce((a, w) => a + w[1], 0) / 21, cz = world.reduce((a, w) => a + w[2], 0) / 21;
      out.landmarks.push(lm);
      out.worldLandmarks.push(world.map((w) => ({ x: w[0] - cx, y: w[1] - cy, z: w[2] - cz })));
      out.handednesses.push([{ categoryName: side > 0 ? 'Right' : 'Left', score: 0.98 }]);
    }
    this.paintRoom();
    for (const d of drawn) this.paintHand(d.lm, d.cam);
    return out;
  }

  // The four face landmarks the hat needs (top of forehead, chin, both cheek edges), matching the painted head.
  face() {
    const f = [];
    f[10] = { x: 0.5, y: 0.52 - 0.15, z: 0 }; f[152] = { x: 0.5, y: 0.52 + 0.17, z: 0 };
    f[234] = { x: 0.5 - 0.072, y: 0.5, z: 0.02 }; f[454] = { x: 0.5 + 0.072, y: 0.5, z: 0.02 };
    return { faceLandmarks: [f] };
  }

  paintRoom() {
    const g = this.ctx, W = this.canvas.width, H = this.canvas.height;
    // a plain "room": wall gradient, window light on the left, desk line
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#6f7f8a'); bg.addColorStop(0.5, '#4a5560'); bg.addColorStop(1, '#2c3238');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const win = g.createRadialGradient(W * 0.86, H * 0.25, 10, W * 0.86, H * 0.25, H * 0.6);
    win.addColorStop(0, 'rgba(255,244,214,0.85)'); win.addColorStop(1, 'rgba(255,244,214,0)');
    g.fillStyle = win; g.fillRect(0, 0, W, H);
    g.fillStyle = '#3a2f2a'; g.fillRect(0, H * 0.86, W, H * 0.14);
    g.fillStyle = '#243447'; g.beginPath(); g.ellipse(W * 0.5, H * 1.02, W * 0.2, H * 0.34, 0, 0, 7); g.fill(); // shoulders
    g.fillStyle = '#c99a7c'; g.beginPath(); g.ellipse(W * 0.5, H * 0.52, W * 0.075, H * 0.17, 0, 0, 7); g.fill();  // head
  }

  paintHand(lm, cam) {
    const g = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const P = (i) => [lm[i].x * W, lm[i].y * H];
    const px = (m) => (m / cam[9][2]) * (W / (2 * Math.tan((CONFIG.hfovDeg * Math.PI) / 360)));  // metres -> pixels at hand depth
    const skin = '#d9a585', shade = '#b98463';
    g.lineCap = 'round'; g.lineJoin = 'round';
    // forearm
    const w0 = P(0), w9 = P(9), dx = w0[0] - w9[0], dy = w0[1] - w9[1], dl = Math.hypot(dx, dy) || 1;
    g.strokeStyle = shade; g.lineWidth = px(0.055);
    g.beginPath(); g.moveTo(...w0); g.lineTo(w0[0] + (dx / dl) * px(0.3), w0[1] + (dy / dl) * px(0.3)); g.stroke();
    // palm
    g.fillStyle = skin; g.strokeStyle = skin; g.lineWidth = px(0.02);
    g.beginPath(); [0, 1, 2, 5, 9, 13, 17].forEach((i, k) => (k ? g.lineTo(...P(i)) : g.moveTo(...P(i)))); g.closePath(); g.fill(); g.stroke();
    // fingers, far ones first
    const order = [[17, 18, 19, 20], [13, 14, 15, 16], [9, 10, 11, 12], [5, 6, 7, 8], [1, 2, 3, 4]]
      .sort((a, b) => cam[b[3]][2] - cam[a[3]][2]);
    for (const f of order) {
      g.strokeStyle = shade; g.lineWidth = px(0.019);
      g.beginPath(); f.forEach((i, k) => (k ? g.lineTo(...P(i)) : g.moveTo(...P(i)))); g.stroke();
      g.strokeStyle = skin; g.lineWidth = px(0.016);
      g.beginPath(); f.forEach((i, k) => (k ? g.lineTo(...P(i)) : g.moveTo(...P(i)))); g.stroke();
    }
  }
}
