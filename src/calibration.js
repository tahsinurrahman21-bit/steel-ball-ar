// Optional real-object calibration.
// Hold a real ball in your open palm: the ball is found in the camera frame (colour region
// grown from where the palm says a ball should be, then a circle fit that ignores the parts
// hidden by fingers). Its known diameter gives its true distance, which corrects:
//   - hand scale   (your hand vs. the average hand MediaPipe assumes -> true distances/speeds)
//   - resting point (where a ball really sits across your palm)
//   - optionally the virtual ball's size.
// Saved in localStorage; the app works the same without it.
import { CONFIG, project } from './tracking.js';
import { TUNE } from './experience.js';

const KEY = 'steelball.calibration.v1';
const N = 96;

export class Calibration {
  constructor(ui) {
    Object.assign(this, ui);
    this.active = false; this.fit = null; this.samples = null; this.saved = null; this.matchSize = false;
    this.roi = document.createElement('canvas'); this.roi.width = this.roi.height = N;
    this.rctx = this.roi.getContext('2d', { willReadFrequently: true });
    this.preset.onchange = () => { if (this.preset.value !== 'custom') this.diam.value = this.preset.value; };
    this.diam.oninput = () => { this.preset.value = 'custom'; };
    this.capture.onclick = () => { this.samples = []; this.done = null; this.out.textContent = 'Capturing… hold still'; };
    this.reset.onclick = () => { localStorage.removeItem(KEY); this.saved = null; this.done = null; CONFIG.handScale = 1; TUNE.anchor = [0, 0]; TUNE.radiusFactor = 0.62; this.out.textContent = 'Calibration cleared. Defaults restored.'; };
    const lab = document.createElement('label');
    lab.innerHTML = '<input type="checkbox" id="cMatch"> Make the virtual ball the same size as this one';
    lab.style.cssText = 'display:flex;gap:6px;align-items:center;font-size:12px;opacity:.85;margin-top:10px';
    this.diam.after(lab);
    lab.firstChild.onchange = (e) => { this.matchSize = e.target.checked; };
  }

  load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!s) return;
      this.saved = s; CONFIG.handScale = s.handScale; TUNE.anchor = s.anchor; if (s.radiusFactor) TUNE.radiusFactor = s.radiusFactor;
    } catch { /* ignore a corrupt entry */ }
  }

  toggle() { this.active = !this.active; this.panel.style.display = this.active ? 'block' : 'none'; this.fit = null; this.samples = null; }

  // Find the real ball near the palm. Works in raw (unmirrored) frame pixels.
  onFrame(hand) {
    if (!hand?.present) { this.fit = null; this.out.textContent = this.samples ? 'Lost the hand — keep it in view' : 'Waiting for a hand…'; return; }
    const W = this.source.width, H = this.source.height, aspect = W / H, mir = this.tracker.mirror;
    const f = W / 2 / Math.tan((CONFIG.hfovDeg * Math.PI) / 360);
    const pc = hand.palm.center, n = hand.palm.normal, w = hand.palm.width;
    const guessR = 0.5 * w;
    const g3 = [0, 1, 2].map((k) => pc[k] + n[k] * (TUNE.lift * w + guessR));
    const gs = project(g3, aspect);
    const cx = (mir ? 1 - gs[0] : gs[0]) * W, cy = gs[1] * H;
    const side = Math.max(48, ((w * 4.4) / hand.distance) * f);
    this.rctx.drawImage(this.source.frame, cx - side / 2, cy - side / 2, side, side, 0, 0, N, N);
    const px = this.rctx.getImageData(0, 0, N, N).data;
    const ycc = (i) => { const r = px[i], g = px[i + 1], b = px[i + 2]; return [0.299 * r + 0.587 * g + 0.114 * b, b - g, r - g]; };
    // Grow a colour region from a seed and fit a circle to its outline. Hue counts far more than
    // brightness (a glossy ball has highlights and shaded bands); points lying inside the fitted
    // circle are dropped and the fit repeated, so fingers and highlights do not pull it inward.
    const tryGrow = (sx0, sy0) => {
      let s = [0, 0, 0], c = 0;
      for (let y = sy0 - 3; y <= sy0 + 3; y++) for (let x = sx0 - 3; x <= sx0 + 3; x++) { const v = ycc((y * N + x) * 4); s[0] += v[0]; s[1] += v[1]; s[2] += v[2]; c++; }
      s = s.map((v) => v / c);
      const mask = new Uint8Array(N * N), stack = [sy0 * N + sx0];
      mask[stack[0]] = 1; let area = 0, border = 0;
      while (stack.length) {
        const p = stack.pop(), x = p % N, y = (p / N) | 0; area++;
        if (x === 0 || y === 0 || x === N - 1 || y === N - 1) { border++; continue; }
        for (const qn of [p - 1, p + 1, p - N, p + N]) {
          if (mask[qn]) continue;
          const v = ycc(qn * 4), d = Math.hypot((v[0] - s[0]) * 0.18, v[1] - s[1], v[2] - s[2]);
          if (d < 34) { mask[qn] = 1; stack.push(qn); }
        }
      }
      const frac = area / (N * N);
      if (frac < 0.02 || frac > 0.7 || border > N) return null;
      let pts = [];
      for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) { const p = y * N + x; if (mask[p] && !(mask[p - 1] && mask[p + 1] && mask[p - N] && mask[p + N])) pts.push([x, y]); }
      let f = kasa(pts);
      for (let it = 0; it < 4 && f; it++) {
        const keep = pts.filter(([x, y]) => Math.hypot(x - f.x, y - f.y) - f.r > -0.08 * f.r);
        if (keep.length < 12) break;
        pts = keep; f = kasa(pts);
      }
      if (!f || f.r < 5 || f.r > N * 0.6) return null;
      // score: how much of the circle's circumference is supported by outline points
      const bins = new Uint8Array(24); let inl = 0;
      for (const [x, y] of pts) if (Math.abs(Math.hypot(x - f.x, y - f.y) - f.r) < 0.1 * f.r) { inl++; bins[Math.floor(((Math.atan2(y - f.y, x - f.x) + Math.PI) / (2 * Math.PI)) * 23.999)] = 1; }
      f.score = (bins.reduce((u, v) => u + v, 0) / 24) * (inl / pts.length);
      return f;
    };
    let fit = null;
    const h = N / 2, o = Math.round(N * 0.11);
    for (const [dx, dy] of [[0, 0], [0, -o], [0, o], [-o, 0], [o, 0], [-o, -o], [o, -o], [-o, o], [o, o]]) {
      const f = tryGrow(h + dx, h + dy);
      if (f && (!fit || f.score > fit.score)) fit = f;
    }
    if (!fit || fit.score < 0.4) { this.fit = null; this.out.textContent = 'No ball found in the palm yet.\nUse a ball whose colour differs from your skin and the background.'; return; }
    const k = side / N;
    const raw = { x: cx - side / 2 + fit.x * k, y: cy - side / 2 + fit.y * k, r: fit.r * k };
    this.fit = this.fit ? { x: this.fit.x + (raw.x - this.fit.x) * 0.4, y: this.fit.y + (raw.y - this.fit.y) * 0.4, r: this.fit.r + (raw.r - this.fit.r) * 0.3 } : raw;

    // metric position of the real ball from its known size
    const R = Number(this.diam.value) / 2000;
    const Z = R * Math.sqrt(1 + (f / this.fit.r) ** 2);
    const ray = [(this.fit.x - W / 2) / f, -(this.fit.y - H / 2) / f, -1];
    const rl = Math.hypot(...ray);
    const B = ray.map((v) => (v / rl) * Z); if (mir) B[0] = -B[0];
    // what hand scale would put the palm exactly one ball-radius (plus skin) behind the ball centre?
    const cur = CONFIG.handScale, d1 = hand.distance / cur, w1 = w / cur, face = Math.max(0.3, hand.facing);
    const scale = (Z + R * face) / (d1 - TUNE.lift * w1 * face);
    const ws = w1 * scale, pcs = pc.map((v) => (v / cur) * scale);
    const rel = [0, 1, 2].map((i) => B[i] - pcs[i]);
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const m = { handScale: scale, anchor: [dot(rel, hand.palm.side) / ws, dot(rel, hand.palm.up) / ws], ratio: R / ws, Z, facing: hand.facing };
    this.live = m;
    if (this.samples) {
      if (hand.facing > 0.3) this.samples.push(m);
      if (this.samples.length >= 24) this._finish(R);
    } else {
      this.out.textContent = (this.done ? `${this.done}\n\nlive:\n` : '') + `ball      ${(Z * 100).toFixed(0)} cm away, ${(this.fit.r * 2).toFixed(0)} px wide\n` +
        `hand      x${scale.toFixed(2)} of average size\nsits at   ${m.anchor.map((v) => v.toFixed(2)).join(', ')} palm widths from centre\n` +
        `ball/palm ${m.ratio.toFixed(2)} (virtual: ${TUNE.radiusFactor.toFixed(2)})\n` + (hand.facing < 0.3 ? 'Turn your palm more toward the camera.' : 'Looks good — press Capture.');
    }
  }

  _finish(R) {
    const med = (arr) => { const a = [...arr].sort((x, y) => x - y); return a[a.length >> 1]; };
    const S = this.samples; this.samples = null;
    const result = {
      handScale: Math.min(1.6, Math.max(0.6, med(S.map((s) => s.handScale)))),
      anchor: [med(S.map((s) => s.anchor[0])), med(S.map((s) => s.anchor[1]))].map((v) => Math.min(0.35, Math.max(-0.35, v))),
      radiusFactor: this.matchSize ? med(S.map((s) => s.ratio)) : TUNE.radiusFactor,
      diameterMm: R * 2000, savedAt: new Date().toISOString(),
    };
    CONFIG.handScale = result.handScale; TUNE.anchor = result.anchor; TUNE.radiusFactor = result.radiusFactor;
    localStorage.setItem(KEY, JSON.stringify(result)); this.saved = result;
    this.out.textContent = this.done = `Saved.\nhand scale   x${result.handScale.toFixed(2)}\nresting spot ${result.anchor.map((v) => v.toFixed(2)).join(', ')}\nball/palm    ${result.radiusFactor.toFixed(2)}\nPut the real ball down and press C to compare.`;
  }

  // Overlay: solid ring = detected real ball, dashed ring = where the virtual ball would be drawn.
  draw(g, W, H) {
    const mir = this.tracker.mirror, k = W / 1280;
    if (this.fit) {
      g.strokeStyle = '#ffd24a'; g.lineWidth = 3 * k; g.setLineDash([]);
      g.beginPath(); g.arc(mir ? W - this.fit.x : this.fit.x, this.fit.y, this.fit.r, 0, 7); g.stroke();
    }
    const hand = this.tracker.state;
    if (hand?.present) {
      const w = hand.palm.width, r = TUNE.radiusFactor * w, pc = hand.palm.center, n = hand.palm.normal;
      const c = [0, 1, 2].map((i) => pc[i] + hand.palm.side[i] * TUNE.anchor[0] * w + hand.palm.up[i] * TUNE.anchor[1] * w + n[i] * (TUNE.lift * w + r * 1.03));
      const s = project(c, W / H), f = W / 2 / Math.tan((CONFIG.hfovDeg * Math.PI) / 360), Z = Math.hypot(...c);
      g.strokeStyle = '#9fd65a'; g.lineWidth = 2 * k; g.setLineDash([8 * k, 6 * k]);
      g.beginPath(); g.arc(s[0] * W, s[1] * H, (f * r) / Math.sqrt(Math.max(1e-6, Z * Z - r * r)), 0, 7); g.stroke(); g.setLineDash([]);
    }
  }
}

// Least-squares circle through points (Kasa).
function kasa(pts) {
  if (pts.length < 8) return null;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0; const n = pts.length;
  for (const [x, y] of pts) { const z = x * x + y * y; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z; }
  // solve [sxx sxy sx; sxy syy sy; sx sy n] [a b c]^T = [sxz syz sz]
  const A = [[sxx, sxy, sx, sxz], [sxy, syy, sy, syz], [sx, sy, n, sz]];
  for (let i = 0; i < 3; i++) {
    let p = i; for (let r = i + 1; r < 3; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; if (Math.abs(A[i][i]) < 1e-9) return null;
    for (let r = 0; r < 3; r++) if (r !== i) { const m = A[r][i] / A[i][i]; for (let cc = i; cc < 4; cc++) A[r][cc] -= m * A[i][cc]; }
  }
  const a = A[0][3] / A[0][0], b = A[1][3] / A[1][1], c = A[2][3] / A[2][2];
  const x = a / 2, y = b / 2, r2 = c + x * x + y * y;
  return r2 > 0 ? { x, y, r: Math.sqrt(r2) } : null;
}
