// Renderer and compositing.
//   pass 1  camera frame + local grade/light around the palm      -> render target
//   pass 2  3D scene (ball, rings, shadow, finger proxies)         -> same target, depth tested
//   pass 3  lens effects (radial blur, chromatic aberration, speed lines, shockwave, flash) -> screen
// Colour is handled display-referred end to end: the camera frame passes through untouched
// unless an effect is active; the ball shader does its own linear lighting and gamma.
import * as THREE from 'three';
import { CONFIG } from './tracking.js';

const EW = 160, EH = 90;        // size of the blurred frame copy used for reflections and light estimation

const FS_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;

const BG_FRAG = /* glsl */`
precision highp float;
uniform sampler2D uVideo; uniform float uMirror, uAspect, uGrade, uBloom, uRingAmt, uRingPhase, uGold;
uniform vec2 uPalm, uPalm2;      // uPalm2: a second ball's hand (two-hand mode)
uniform float uBloom2;
varying vec2 vUv;
void main(){
  vec2 uv = vUv;
  vec2 d = (uv - uPalm)*vec2(uAspect, 1.);
  float r = length(d);
  vec2 dir = d/(r + 1e-5)/vec2(uAspect, 1.);
  // expanding energy rings: a thin refraction ripple with a light edge
  float ripple = 0.;
  for (int i = 0; i < 2; i++) {
    float ph = fract(uRingPhase + float(i)*0.5);
    ripple += exp(-pow((r - ph*0.6)/0.022, 2.))*(1. - ph)*uRingAmt;
  }
  uv -= dir*ripple*0.014;
  vec3 c = texture2D(uVideo, vec2(mix(uv.x, 1. - uv.x, uMirror), uv.y)).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  float near = exp(-r*r*9.), wide = exp(-r*r*1.7);
  // grade: cooler, greener shadows and a background that steps back; skin near the palm is left alone
  vec3 g = mix(vec3(l), c, 1.12);
  g *= mix(vec3(0.78, 0.97, 0.90), vec3(1.0), smoothstep(0.0, 0.65, l));
  g *= 1. - 0.30*(1. - wide);
  c = mix(c, g, uGrade*(1. - near*0.7));
  // light thrown by the ball: scaled by what is already there, so it reads as light on surfaces
  vec3 tint = mix(vec3(0.42, 1.0, 0.36), vec3(1.0, 0.80, 0.30), uGold);
  // (screen-style blend: it can brighten but never clip the picture to white)
  vec3 light = tint*(near*0.26 + wide*0.07)*uBloom*(0.35 + 0.65*l);
  vec2 e2 = (vUv - uPalm2)*vec2(uAspect, 1.);
  float q2 = dot(e2, e2);
  light += vec3(0.42, 1.0, 0.36)*(exp(-q2*9.)*0.26 + exp(-q2*1.7)*0.07)*uBloom2*(0.35 + 0.65*l);
  c += light*(1. - c);
  c += ripple*(tint*0.16 + 0.06)*(1. - c);
  gl_FragColor = vec4(c, 1.);
}`;

const POST_FRAG = /* glsl */`
precision highp float;
uniform sampler2D uScene; uniform vec2 uCenter, uShake; uniform vec3 uFlashCol;
uniform float uAspect, uCA, uBlur, uFlash, uLines, uLinesInner, uShock, uShockAmt, uTime, uVig;
varying vec2 vUv;
float hash1(float n){ return fract(sin(n*127.1)*43758.5453); }
void main(){
  vec2 uv = vUv + uShake;
  vec2 da = (uv - uCenter)*vec2(uAspect, 1.);
  float r = length(da);
  vec2 dir = da/(r + 1e-5)/vec2(uAspect, 1.);
  // shockwave: a refracting ring with a rainbow fringe
  float sw = exp(-pow((r - uShock)/0.07, 2.))*uShockAmt;
  uv -= dir*sw*0.06;
  float ca = uCA + sw*0.012;
  vec3 col;
  if (uBlur > 0.001 || ca > 0.0005) {
    col = vec3(0.);
    for (int i = 0; i < 8; i++) {
      float t = float(i)/7.;
      vec2 p = uv - dir*t*uBlur*r*0.5;                // pull samples toward the ball
      col.r += texture2D(uScene, p + dir*ca*(0.4 + r)).r;
      col.g += texture2D(uScene, p).g;
      col.b += texture2D(uScene, p - dir*ca*(0.4 + r)).b;
    }
    col /= 8.;
  } else col = texture2D(uScene, uv).rgb;
  col += sw*vec3(0.9, 0.95, 1.0)*0.25;
  // speed lines converging on the ball, re-drawn 24x per second
  if (uLines > 0.001) {
    float ang = atan(da.y, da.x)/6.2831853 + 0.5;
    float fr = floor(uTime*24.);
    float bins = 260.;
    float id = floor(ang*bins), f = fract(ang*bins);
    float on = step(0.80, hash1(id + fr*17.3));
    float start = uLinesInner + 0.12 + 0.45*hash1(id*1.7 + fr);
    float line = on*smoothstep(start, start + 0.3, r)*pow(1. - abs(f - 0.5)*2., 1.5);
    col *= 1. - uLines*0.38*smoothstep(uLinesInner, 0.95, r);
    col += line*uLines*vec3(0.86, 0.95, 1.0)*0.7;
  }
  col = mix(col, uFlashCol, uFlash);
  vec2 q = vUv - 0.5; col *= 1. - uVig*dot(q, q)*1.6;
  gl_FragColor = vec4(col, 1.);
}`;

export class Stage {
  constructor(canvas, frameCanvas) {
    THREE.ColorManagement.enabled = false;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.autoClear = false;
    this.frameCanvas = frameCanvas;

    this.videoTex = new THREE.CanvasTexture(frameCanvas);
    this.videoTex.minFilter = this.videoTex.magFilter = THREE.LinearFilter; this.videoTex.generateMipmaps = false;

    // small blurred copy of the frame: environment for the ball's reflections + light estimate
    this.envCanvas = document.createElement('canvas'); this.envCanvas.width = EW; this.envCanvas.height = EH;
    this.envCtx = this.envCanvas.getContext('2d', { willReadFrequently: true });
    this.envTex = new THREE.CanvasTexture(this.envCanvas);
    this.envTex.minFilter = this.envTex.magFilter = THREE.LinearFilter; this.envTex.generateMipmaps = false;
    this.light = { dir: new THREE.Vector3(-0.4, 0.7, 0.6).normalize(), col: new THREE.Vector3(1, 1, 1), exposure: 1 };
    this._lightN = 0;

    const tri = new THREE.BufferGeometry();                       // one triangle covering the screen
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    tri.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    const U = (v) => ({ value: v });
    this.bgU = { uVideo: U(this.videoTex), uMirror: U(1), uAspect: U(16 / 9), uGrade: U(0), uBloom: U(0), uRingAmt: U(0), uRingPhase: U(0), uGold: U(0), uPalm: U(new THREE.Vector2(0.5, 0.5)), uPalm2: U(new THREE.Vector2(0.5, 0.5)), uBloom2: U(0) };
    this.postU = { uScene: U(null), uCenter: U(new THREE.Vector2(0.5, 0.5)), uShake: U(new THREE.Vector2()), uFlashCol: U(new THREE.Vector3(1, 0.97, 0.85)), uAspect: U(16 / 9), uCA: U(0), uBlur: U(0), uFlash: U(0), uLines: U(0), uLinesInner: U(0.2), uShock: U(0), uShockAmt: U(0), uTime: U(0), uVig: U(0) };
    const fs = (frag, uniforms) => { const m = new THREE.Mesh(tri, new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false })); m.frustumCulled = false; const s = new THREE.Scene(); s.add(m); return s; };
    this.bgScene = fs(BG_FRAG, this.bgU); this.postScene = fs(POST_FRAG, this.postU);
    this.flat = new THREE.Camera();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.01, 20);
    this.rt = null;
    this.setSize(frameCanvas.width || 1280, frameCanvas.height || 720);
  }

  setSize(w, h) {
    if (this.w === w && this.h === h) return;
    this.w = w; this.h = h;
    this.renderer.setPixelRatio(1); this.renderer.setSize(w, h, false);
    this.rt?.dispose();
    this.rt = new THREE.WebGLRenderTarget(w, h, { samples: 4, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.postU.uScene.value = this.rt.texture;
    this.updateCamera();
  }

  updateCamera() {
    const aspect = this.w / this.h;
    this.camera.aspect = aspect;
    this.camera.fov = (2 * Math.atan(Math.tan((CONFIG.hfovDeg * Math.PI) / 360) / aspect) * 180) / Math.PI;
    this.camera.updateProjectionMatrix();
    this.bgU.uAspect.value = aspect; this.postU.uAspect.value = aspect;
  }

  // Call once per new camera frame.
  frameUpdated(mirror) {
    const fc = this.frameCanvas;
    if (fc.width !== this.w || fc.height !== this.h) { this.videoTex.dispose(); this.setSize(fc.width, fc.height); }
    this.videoTex.needsUpdate = true;
    this.envCtx.filter = 'blur(2px)';                           // soft reflections; ignored where unsupported
    this.envCtx.drawImage(fc, 0, 0, EW, EH);
    this.envTex.needsUpdate = true;
    if (this._lightN++ % 8 === 0) this._estimateLight(mirror);
  }

  // Rough key-light estimate from the frame: where the brightness sits, how bright, what colour.
  _estimateLight(mirror) {
    const d = this.envCtx.getImageData(0, 0, EW, EH).data;
    let sum = 0, sx = 0, sy = 0, r = 0, g = 0, b = 0, w = 0, n = 0;
    for (let y = 0; y < EH; y += 2) for (let x = 0; x < EW; x += 2) {
      const i = (y * EW + x) * 4, l = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
      sum += l; const ww = l * l * l; w += ww; n++; sx += ww * (x / (EW - 1) - 0.5); sy += ww * (0.5 - y / (EH - 1));
      r += ww * d[i]; g += ww * d[i + 1]; b += ww * d[i + 2];
    }
    const mean = sum / n;
    let lx = (sx / (w || 1)) * 3.2, ly = (sy / (w || 1)) * 3.2 + 0.45;
    if (mirror) lx = -lx;
    const target = new THREE.Vector3(lx, ly, 0.75).normalize();
    this.light.dir.lerp(target, 0.25).normalize();
    const m = Math.max(r, g, b, 1);
    this.light.col.lerp(new THREE.Vector3(0.75 + 0.25 * r / m, 0.75 + 0.25 * g / m, 0.75 + 0.25 * b / m), 0.25);
    this.light.exposure += (Math.min(1.05, Math.max(0.6, 0.55 + mean * 0.9)) - this.light.exposure) * 0.25;
  }

  // 3D point (display space) -> screen uv, y up.
  toScreen(v, out) {
    const p = out.copy(v).project(this.camera);
    return out.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5, p.z);
  }

  render() {
    const r = this.renderer;
    r.setRenderTarget(this.rt); r.clear();
    r.render(this.bgScene, this.flat);
    r.render(this.scene, this.camera);
    r.setRenderTarget(null);
    r.render(this.postScene, this.flat);
  }
}
