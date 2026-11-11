// Gyro's hat, worn on the tracked head.
//
// Design follows the anime and the ArtStation reference model ("Gyro Zeppeli hat" by Frizzarin,
// used as a visual reference only; this geometry is built here from scratch):
//   - low, flat-topped round crown with window slots round its lower half
//   - wide flat brim, slightly drooping, pierced by radial slots (real holes: the camera
//     image shows through them)
//   - a strap round the base of the crown carrying two slotted goggles at the front
import * as THREE from 'three';
import { CONFIG, OneEuro } from './tracking.js';

THREE.ColorManagement.enabled = false;   // colours below are display values, used as written (see stage.js)

const FACE_WIDTH = 0.145;      // metres between the cheek-edge landmarks of an average adult

// ---------------------------------------------------------------- head pose from 4 landmarks
export class HeadTracker {
  constructor() { this.fPos = new OneEuro(3, 1.5, 6); this.fAx = new OneEuro(6, 1.2, 4); this.lastT = 0; this.state = { present: false }; this.lost = 0; }

  // lm: MediaPipe face landmarks (unmirrored frame), W/H: frame size, t: seconds
  update(lm, W, H, mirror, t) {
    const dt = Math.min(0.1, Math.max(1 / 120, t - this.lastT)); this.lastT = t;
    if (!lm || !lm[10] || !lm[152] || !lm[234] || !lm[454]) {
      this.lost += dt;
      if (this.lost > 0.4) { this.fPos.reset(); this.fAx.reset(); this.state = { present: false }; }
      return this.state;
    }
    this.lost = 0;
    const f = W / 2 / Math.tan((CONFIG.hfovDeg * Math.PI) / 360);
    // landmark -> pixels (z uses the same scale as x), then to metres via the known face width
    const px = (p) => [p.x * W, p.y * H, p.z * W];
    const R = px(lm[454]), L = px(lm[234]), T = px(lm[10]), B = px(lm[152]);
    const wPx = Math.hypot(R[0] - L[0], R[1] - L[1], R[2] - L[2]) || 1;
    const m = FACE_WIDTH / wPx, Zc = f * m;                                // metres per pixel at the face, face distance
    const cam = (p) => { const z = Zc + p[2] * m; return [((p[0] - W / 2) / f) * z, ((p[1] - H / 2) / f) * z, z]; };
    const mx = mirror ? -1 : 1, disp = (v) => [mx * v[0], -v[1], -v[2]];
    const r = disp(cam(R)), l = disp(cam(L)), top = disp(cam(T)), bot = disp(cam(B));
    let X = [r[0] - l[0], r[1] - l[1], r[2] - l[2]]; if (mirror) X = X.map((v) => -v);
    const Y = [top[0] - bot[0], top[1] - bot[1], top[2] - bot[2]];
    const c = [(r[0] + l[0]) / 2, (r[1] + l[1]) / 2, (r[2] + l[2]) / 2];
    const fp = this.fPos.filter(c, dt), fa = this.fAx.filter([...X, ...Y], dt);
    const x = new THREE.Vector3(fa[0], fa[1], fa[2]).normalize();
    const y = new THREE.Vector3(fa[3], fa[4], fa[5]); y.addScaledVector(x, -y.dot(x)).normalize();
    const z = new THREE.Vector3().crossVectors(x, y);
    const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    const center = new THREE.Vector3(fp[0], fp[1], fp[2]);
    // how far the top of the forehead sits above the cheek line, along the head's own up axis
    const forehead = new THREE.Vector3(top[0], top[1], top[2]).sub(new THREE.Vector3(c[0], c[1], c[2])).dot(y);
    this.state = { present: true, center, quat, x, y, z, forehead, distance: center.length() };
    return this.state;
  }
}

// ---------------------------------------------------------------- materials
const VERT = /* glsl */`
varying vec3 vN; varying vec3 vL; varying vec2 vUv; varying vec3 vV;
void main(){ vL = position; vUv = uv; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position, 1.); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }`;

// uKind: 0 plain, 1 crown (window slots), 2 brim (radial holes), 3 goggle (slotted lens on its front face)
const FRAG = /* glsl */`
precision highp float;
uniform vec3 uColor, uDark, uLightDir; uniform float uExposure, uKind, uAlpha;
varying vec3 vN; varying vec3 vL; varying vec2 vUv; varying vec3 vV;
const float TAU = 6.2831853;
void main(){
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 col = uColor;
  float shade = 1.;
  if (uKind > 1.5 && uKind < 2.5) {
    // brim: radial slots are real holes
    float r = length(vL.xz), a = atan(vL.x, vL.z);
    float cell = (fract(a/TAU*12. + 0.5) - 0.5)*TAU/12.;
    float d = length(vec2(cell*r, r - clamp(r, 0.122, 0.180)));
    if (d < 0.0065) discard;
    col = mix(col, uDark, (1. - smoothstep(0.0065, 0.011, d))*0.6);       // darkened slot rim
    if (!gl_FrontFacing) shade *= 0.7;                                   // underside sits in its own shadow
    shade *= 0.8 + 0.2*smoothstep(0.09, 0.14, r);                         // contact shadow where it meets the crown
  } else if (uKind > 0.5 && uKind < 1.5) {
    // crown: window slots round the lower half, and stitched seam at the top edge
    float a = atan(vL.x, vL.z);
    float cell = abs(fract(a/TAU*10. + 0.5) - 0.5);
    float win = (1. - smoothstep(0.25, 0.27, cell))*smoothstep(0.026, 0.029, vL.y)*(1. - smoothstep(0.058, 0.061, vL.y));
    col = mix(col, uDark, win*0.85);
  } else if (uKind > 2.5) {
    // goggle: a metal plate with a darker rim and one dark horizontal slot, on the face pointing forward
    vec2 p = vUv*2. - 1.;
    float front = step(0.0095, vL.z);
    float rim = smoothstep(0.74, 0.86, max(abs(p.x), abs(p.y)));
    float slot = (1. - smoothstep(0.13, 0.17, abs(p.y)))*(1. - smoothstep(0.56, 0.62, abs(p.x)));
    col = mix(col, col*0.62, rim*front);
    col = mix(col, uDark, slot*front);
  }
  vec3 L = normalize(uLightDir);
  float nl = dot(N, L)*0.5 + 0.5;
  float tone = floor(nl*3. + 0.45)/3.;                                    // cel steps
  float rim = pow(1. - max(dot(N, normalize(vV)), 0.), 3.);
  col *= (0.46 + 0.56*tone)*shade*uExposure;
  col *= 1. - rim*0.35;                                                    // darker toward the silhouette, like an inked edge
  gl_FragColor = vec4(col, uAlpha);
}`;

const sRGB = (hex) => new THREE.Color(hex);     // colour management is off: values are used as written

// ---------------------------------------------------------------- the hat
export class GyroHat {
  constructor() {
    this.group = new THREE.Group(); this.group.visible = false;
    this.hat = new THREE.Group(); this.group.add(this.hat);
    this.mats = [];
    const mat = (color, dark, kind, side = THREE.FrontSide) => {
      const m = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG, side, transparent: true,
        uniforms: { uColor: { value: sRGB(color) }, uDark: { value: sRGB(dark) }, uKind: { value: kind }, uAlpha: { value: 1 }, uExposure: { value: 1 }, uLightDir: { value: new THREE.Vector3(0, 1, 0.5) } },
      });
      this.mats.push(m); return m;
    };
    const leather = 0xa06c40, leatherDark = 0x46291a, strap = 0x7d848d, metal = 0xa9b0b6, lens = 0x23272c;
    const RC = 0.092;                                               // crown radius (side to side)

    // crown: flat top with a soft shoulder
    const prof = [[RC * 1.0, 0], [RC * 1.0, 0.066], [RC * 0.985, 0.076], [RC * 0.94, 0.084], [RC * 0.84, 0.089], [RC * 0.5, 0.091], [0.0001, 0.0915]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    this.hat.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 64), mat(leather, leatherDark, 1, THREE.DoubleSide)));

    // brim: flat ring with a slight droop and a gentle wave
    const RO = 0.212, seg = 96, rings = 8, pos = [], idx = [], uv = [];
    for (let j = 0; j <= rings; j++) for (let i = 0; i <= seg; i++) {
      const t = j / rings, a = (i / seg) * Math.PI * 2, r = RC * 0.985 + (RO - RC * 0.985) * t;
      const y = -0.002 - 0.02 * Math.pow(t, 1.6) + 0.005 * t * Math.sin(a * 3 + 0.6) + 0.004 * t * Math.sin(a * 5);
      pos.push(Math.sin(a) * r, y, Math.cos(a) * r); uv.push(i / seg, t);
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const p = j * (seg + 1) + i; idx.push(p, p + 1, p + seg + 1, p + 1, p + seg + 2, p + seg + 1); }
    const brim = new THREE.BufferGeometry();
    brim.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); brim.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    brim.setIndex(idx); brim.computeVertexNormals();
    this.hat.add(new THREE.Mesh(brim, mat(leather, leatherDark, 2, THREE.DoubleSide)));

    // strap round the base of the crown
    const band = new THREE.Mesh(new THREE.CylinderGeometry(RC * 1.02, RC * 1.02, 0.02, 64, 1, true), mat(strap, 0x3a3f45, 0));
    band.position.y = 0.014; this.hat.add(band);

    // goggles: two slotted lenses on the strap at the front, a bridge between them, a knob at the side
    const gMat = mat(metal, lens, 3), plain = mat(metal, lens, 0);
    for (const s of [-1, 1]) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.034, 0.02), gMat);
      g.position.set(s * 0.031, 0.028, RC - 0.001); g.rotation.set(-0.08, s * 0.34, 0);
      this.hat.add(g);
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 20), plain);
      knob.position.set(s * (RC + 0.004), 0.016, 0.03); knob.rotation.z = Math.PI / 2; this.hat.add(knob);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.012, 0.012), plain);
    bridge.position.set(0, 0.028, RC + 0.006); this.hat.add(bridge);

    this.hat.scale.set(1, 1, 1.13);                                 // heads are longer front to back than side to side
    this.hat.rotation.x = -0.1;                                     // worn tipped slightly back

    // depth-only stand-in for the head, so the far side of the brim hides behind the face
    this.head = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ colorWrite: false }));
    this.head.scale.set(0.074, 0.105, 0.09); this.head.renderOrder = 1; this.group.add(this.head);
    for (const o of this.hat.children) o.renderOrder = 3;

    this.on = false; this.amount = 0;                               // 0..1 pop-in
    this.size = 1; this.height = 0;                                 // user trim: overall size, extra height (metres)
  }

  // head: HeadTracker state; light: {dir, exposure}
  update(head, light, dt) {
    const want = this.on && head?.present ? 1 : 0;
    this.amount += (want - this.amount) * (1 - Math.exp(-dt / 0.09));
    this.group.visible = this.amount > 0.01;
    if (!this.group.visible || !head?.present) return;
    this.group.quaternion.copy(head.quat);
    // head centre: a little behind the cheek line. The brim rests just below the top of the forehead.
    this.group.position.copy(head.center).addScaledVector(head.z, -0.02);
    this.head.position.set(0, -0.012, 0);
    const k = this.amount, pop = 1 + 0.18 * Math.sin(Math.PI * k) * (1 - k);
    this.hat.position.set(0, head.forehead * 0.86 + this.height + (1 - k) * 0.06, 0.004);
    this.hat.scale.set(this.size * pop, this.size * pop, this.size * 1.13 * pop);
    for (const m of this.mats) { m.uniforms.uLightDir.value.copy(light.dir); m.uniforms.uExposure.value = Math.min(1.08, 0.72 + light.exposure * 0.3); m.uniforms.uAlpha.value = Math.min(1, k * 1.6); }
  }
}
