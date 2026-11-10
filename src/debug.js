// Debug overlay: landmarks, skeleton, palm frame, gesture and timing readouts.
import { BONES, CONFIG, project } from './tracking.js';

export class DebugOverlay {
  constructor(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.enabled = true; this.lines = []; }

  resize(w, h) { if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; } }

  draw(hand, info) {
    const g = this.ctx, W = this.canvas.width, H = this.canvas.height;
    g.clearRect(0, 0, W, H);
    if (!this.enabled) return;
    const k = W / 1280;
    if (hand?.present) {
      const P = (i) => [hand.img[i * 2] * W, hand.img[i * 2 + 1] * H];
      g.lineWidth = 2.5 * k; g.strokeStyle = 'rgba(120,255,160,0.9)';
      g.beginPath(); for (const [a, b] of BONES) { g.moveTo(...P(a)); g.lineTo(...P(b)); } g.stroke();
      for (let i = 0; i < 21; i++) {
        const tip = i % 4 === 0 && i > 0;
        g.fillStyle = i === 0 ? '#ffd24a' : tip ? '#ff5a7a' : '#ffffff';
        g.beginPath(); g.arc(...P(i), (tip ? 5 : 3.5) * k, 0, 7); g.fill();
      }
      // palm centre + axes, projected from the 3D reconstruction (checks the 3D solve against the image)
      const aspect = W / H, c = hand.palm.center, L = hand.palm.width * 0.9;
      const S = (p) => { const s = project(p, aspect); return [s[0] * W, s[1] * H]; };
      const tipOf = (d) => S([c[0] + d[0] * L, c[1] + d[1] * L, c[2] + d[2] * L]);
      const c2 = S(c);
      const arrow = (to, col) => { g.strokeStyle = col; g.lineWidth = 3 * k; g.beginPath(); g.moveTo(...c2); g.lineTo(...to); g.stroke(); g.fillStyle = col; g.beginPath(); g.arc(...to, 4 * k, 0, 7); g.fill(); };
      arrow(tipOf(hand.palm.up), '#4aa8ff'); arrow(tipOf(hand.palm.side), '#ff9f43'); arrow(tipOf(hand.palm.normal), '#ff3df2');
      g.strokeStyle = '#ffd24a'; g.lineWidth = 2 * k;
      g.beginPath(); g.arc(...c2, 9 * k, 0, 7); g.stroke();
      // velocity vector
      const v = hand.vel, vt = S([c[0] + v[0] * 0.12, c[1] + v[1] * 0.12, c[2] + v[2] * 0.12]);
      g.strokeStyle = hand.throwing ? '#ff3030' : 'rgba(255,255,255,0.7)'; g.lineWidth = 2 * k;
      g.beginPath(); g.moveTo(...c2); g.lineTo(...vt); g.stroke();
    }
    // readout panel
    const yes = (b) => (b ? 'YES' : 'no');
    const L = [];
    if (hand?.present) {
      L.push(`hand        ${hand.handedness}  (${(hand.score * 100).toFixed(0)}%)`);
      L.push(`distance    ${(hand.distance * 100).toFixed(0)} cm   palm ${(hand.palm.width * 100).toFixed(1)} cm`);
      L.push(`fingers     ${hand.fingersUp.map((u, i) => (u ? 'TIMRP'[i] : '·')).join(' ')}   open ${hand.openness.toFixed(2)}`);
      L.push(`open palm   ${yes(hand.isOpen)}`);
      L.push(`facing cam  ${yes(hand.facingOk)}  (${hand.facing.toFixed(2)})`);
      L.push(`speed       ${hand.speed.toFixed(2)} m/s   peak ${hand.peakSpeed.toFixed(2)}`);
      L.push(`toward cam  ${hand.toward.toFixed(2)} m/s   peak ${hand.peakToward.toFixed(2)}`);
      L.push(`gesture     ${hand.throwing ? 'THROW' : hand.summonPose ? 'OPEN PALM' : hand.isOpen ? 'open (turned away)' : 'none'}`);
    } else L.push('hand        not detected');
    for (const [a, b] of info ?? []) L.push(`${a.padEnd(11)} ${b}`);
    L.push(`thresholds  speed>${CONFIG.throwSpeed}  toward>${CONFIG.throwToward}`);
    g.font = `${13 * Math.max(1, k)}px ui-monospace, Consolas, monospace`;
    const lh = 17 * Math.max(1, k), pw = 330 * Math.max(1, k);
    g.fillStyle = 'rgba(8,12,16,0.72)'; g.fillRect(10, 10, pw, lh * L.length + 14);
    g.fillStyle = '#d9ffe6'; L.forEach((s, i) => g.fillText(s, 20, 28 + i * lh));
  }
}
