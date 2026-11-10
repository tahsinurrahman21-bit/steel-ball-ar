// The Steel Ball and everything attached to it in 3D: halo, orbit rings, contact shadow,
// comet tail, star flare, sparks, and depth-only stand-ins for the fingers (occlusion).
import * as THREE from 'three';
import { classicFrag } from './ball-classic.js';

const PREMULT = { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };

const NOISE = /* glsl */`
float hash1(float n){ return fract(sin(n*127.1)*43758.5453); }
float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(hash2(i), hash2(i+vec2(1,0)), f.x), mix(hash2(i+vec2(0,1)), hash2(i+vec2(1,1)), f.x), f.y);
}`;

const BALL_VERT = /* glsl */`
uniform vec3 uWobbleAxis; uniform float uWobble;
varying vec3 vN; varying vec3 vPos;
void main(){
  vec3 p = position;
  float a = dot(p, uWobbleAxis);
  p += uWobbleAxis * a * uWobble - (p - uWobbleAxis * a) * uWobble * 0.5;   // stretch along one axis, keep volume
  vN = normalize(mat3(modelViewMatrix) * normal);
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  vPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const BALL_FRAG = /* glsl */`
precision highp float;
uniform mat3 uRotInv;       // view space -> engraving space
uniform vec3 uAxis;         // spin axis, view space
uniform float uBlurArc;     // radians the surface sweeps during one exposure
uniform float uStreak;      // anime streak amount 0..1
uniform float uStep;        // counter that advances 12x per second ("on twos")
uniform float uAppear;      // materialisation 0..1
uniform float uToon;        // 0 = physical metal, 1 = cel shaded
uniform float uGlow;        // gold energy 0..1
uniform float uRadius;      // metres
uniform sampler2D uEnv;     // small blurred copy of the camera frame
uniform vec2 uScreen;       // ball centre, screen uv (y up)
uniform float uMirror;
uniform vec3 uLightDir;     // estimated key light, view space
uniform vec3 uLightCol;
uniform float uExposure;
varying vec3 vN; varying vec3 vPos;
const float PI = 3.14159265;
${NOISE}

vec3 rotAxis(vec3 v, vec3 k, float a){ float c = cos(a), s = sin(a); return v*c + cross(k, v)*s + k*dot(k, v)*(1.-c); }

// Engraving: a hexagonal groove round each pole and a slot from each hexagon corner toward
// the equator, ending in a rounded tip. Returns 1 on the groove floor, 0 on the surface.
float groove(vec3 d, float soft){
  const float R = 0.56, T2 = 1.30, W = 0.072, SEG = PI/3.;
  float th = acos(clamp(abs(d.y), 0., 1.));
  float ph = atan(d.z, d.x) + (d.y < 0. ? PI/6. : 0.);
  float a = mod(ph, SEG) - SEG*0.5;                  // 0 at an edge midpoint, +-30deg at corners
  float hexR = R*cos(PI/6.)/cos(a);
  float dHex = abs(th - hexR)*cos(a);
  float av = PI/6. - abs(a);                         // angle to the nearest corner meridian
  float dSlot = length(vec2(sin(th)*av, th - clamp(th, R, T2)));
  return 1. - smoothstep(W*0.5 - soft, W + soft, min(dHex, dSlot));
}

// Engraving depth at a surface direction, averaged along the arc it sweeps in one exposure
// (rotational motion blur).
float heightAt(vec3 dir){
  if (uBlurArc <= 0.02) return groove(uRotInv * dir, 0.);
  float taps = clamp(ceil(uBlurArc/0.035), 2., 28.);
  float soft = uBlurArc/(taps - 1.)*0.75;                    // widen each tap's edge to its spacing so taps never comb
  float h = 0.;
  for (int i = 0; i < 28; i++) {
    if (float(i) >= taps) break;
    h += groove(uRotInv * rotAxis(dir, uAxis, (float(i)/(taps - 1.) - 0.5)*uBlurArc), soft);
  }
  return h/taps;
}

void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(-vPos);
  float H = heightAt(N);

  // --- bump: the channel walls lean toward the channel
  vec3 Nb;
  float bumpK = 1. - 0.6*smoothstep(0.4, 1.6, uBlurArc);
  if (uBlurArc < 0.9) {
    // finite differences on the sphere: smooth, per-pixel wall normals
    vec3 t1 = normalize(cross(N, abs(N.y) < 0.95 ? vec3(0, 1, 0) : vec3(1, 0, 0))), t2 = cross(N, t1);
    const float e = 0.014;
    vec3 g = ((heightAt(normalize(N + t1*e)) - H)*t1 + (heightAt(normalize(N + t2*e)) - H)*t2)/e;
    Nb = normalize(N + g*0.03*bumpK);
  } else {
    // very fast spin: the engraving is a blur, screen-space derivatives are enough
    vec3 dpdx = dFdx(vPos), dpdy = dFdy(vPos);
    vec3 r1 = cross(dpdy, N), r2 = cross(N, dpdx);
    float det = dot(dpdx, r1);
    vec3 grad = sign(det)*(dFdx(H)*r1 + dFdy(H)*r2);
    Nb = normalize(abs(det)*N + grad*uRadius*0.055*bumpK);
  }
  float NoV = max(dot(Nb, V), 0.);

  // --- anime streaks: horizontal streaks round the spin axis with pointed, comb-like ends,
  // redrawn every step. They repaint the surface itself; lighting and reflections go on top.
  // (longitude is measured from the side facing the viewer, so its wrap-around seam is hidden)
  vec3 e1 = V - uAxis*dot(V, uAxis);
  e1 = dot(e1, e1) > 1e-4 ? normalize(e1) : normalize(cross(uAxis, vec3(1, 0, 0)));
  vec3 e2 = cross(uAxis, e1);
  float lat = dot(N, uAxis), lon = atan(dot(N, e2), dot(N, e1));
  // each thin row of latitude is pushed sideways by its own amount, tapering to nothing at the
  // row's edges; wherever a streak ends, that turns the end into a row of horizontal teeth
  float rows = lat*17. + hash1(uStep + 3.)*5.;
  float row = floor(rows), tooth = 1. - abs(fract(rows) - 0.5)*2.;
  float push = (hash1(row*1.37 + uStep*5.) - 0.5)*tooth;
  float lonW = lon + push*0.75, lonD = lon + push*1.1;
  float nA = vnoise(vec2(lat*4.2 + uStep*3.7, lonW*1.35 + uStep*1.3))*0.72 + vnoise(vec2(lat*9. - uStep*2.1, lonW*2.4 + 5.))*0.28;
  float nB = vnoise(vec2(lat*21. + uStep*9.1, lonD*3.2 - uStep*2.3));
  float polar = 1. - smoothstep(0.72, 0.97, abs(lat));       // streaks thin out toward the poles of the spin
  float white = smoothstep(0.555, 0.575, nA)*polar*uStreak;   // pale streaks of finite length
  float dark = smoothstep(0.80, 0.815, nB)*polar*uStreak;     // sparse, short dark dashes

  // --- material. Metal: deep emerald, dark channels. Cel: the anime's paler lime, with a
  // mid-green channel floor between inked walls.
  float wall = H*(1. - H)*4.;
  float gk = 1. - 0.5*uStreak;                                // the engraving fades under the streaks
  vec3 metalCol = mix(vec3(0.13, 0.56, 0.05), vec3(0.42, 0.74, 0.14), uToon);
  vec3 floorCol = mix(vec3(0.02, 0.13, 0.02), vec3(0.10, 0.36, 0.06), uToon);
  vec3 base = mix(metalCol, floorCol, H*0.92*gk);
  base = mix(base, vec3(0.015, 0.09, 0.02), wall*uToon*0.85*gk);
  base = mix(base, vec3(0.03, 0.17, 0.03), dark*0.85);
  base = mix(base, mix(vec3(0.45, 0.82, 0.30), vec3(0.80, 0.94, 0.62), uToon), white*0.85);
  vec3 L = normalize(uLightDir);
  float nl = dot(Nb, L)*0.5 + 0.5;
  float tone = mix(nl*nl, floor(nl*3. + 0.4)/3., uToon);
  float under = 0.62 + 0.38*smoothstep(-0.9, 0.35, Nb.y);          // darker underside, where the hand blocks the light
  vec3 body = base*(0.30 + 1.0*tone)*under;

  vec3 R = reflect(-V, Nb);
  // Reflection lookup into the blurred camera frame. The frame is flipped left-right and
  // addressed from its centre, not from the ball's own position: sampling what lies directly
  // behind the ball would make it look like glass instead of a mirror.
  vec2 euv = vec2(0.5 - R.x*0.42, 0.5 + R.y*0.42);
  vec3 env = pow(texture2D(uEnv, vec2(mix(euv.x, 1.-euv.x, uMirror), euv.y)).rgb, vec3(2.2));
  env = mix(env, env*env*2.2, 0.45);                              // more contrast: reads as polished metal
  float fres = pow(1. - NoV, 5.);
  vec3 F0 = min(base*1.25, vec3(0.95));
  vec3 F = F0 + (1. - F0)*fres;
  vec3 Hh = normalize(L + V);
  float nh = max(dot(Nb, Hh), 0.);
  float tight = pow(nh, 120.), broad = pow(nh, 18.);
  vec3 spec = env*F*mix(1.15, 0.3, uToon)*under;
  spec += uLightCol*(tight*3.0 + broad*1.1)*mix(F, vec3(1.), 0.55)*(1. - uToon);
  // spinning metal: micro-detail smears into rings round the axis, which stretches the highlight
  // into a streak from pole to pole (seen on the real spinning props)
  vec3 Tg = cross(uAxis, N); Tg /= max(length(Tg), 1e-4);
  float tH = dot(Tg, Hh);
  float aniso = pow(max(1. - tH*tH, 0.), 90.)*pow(nh, 3.)*smoothstep(0.25, 1.2, uBlurArc)*(1. - uToon);
  spec += uLightCol*aniso*0.9*mix(F, vec3(1.), 0.4);
  // a second, dimmer highlight low on the opposite side keeps the form readable
  vec3 L2 = normalize(vec3(-L.x, -0.6, 0.5));
  spec += F*pow(max(dot(Nb, normalize(L2 + V)), 0.), 40.)*0.35*(1. - 0.7*uToon);

  vec3 col = (body*0.72 + spec*0.62)*uExposure;
  col += fres*vec3(0.35, 0.8, 0.3)*0.22*uExposure*(1. - uToon);
  // cel: one large hard-edged highlight patch with a hot core, and an ink outline
  col = mix(col, vec3(0.86, 0.97, 0.72)*uExposure, smoothstep(0.925, 0.94, nh)*uToon*0.75);
  col = mix(col, vec3(1.08)*uExposure, smoothstep(0.985, 0.99, nh)*uToon*0.9);
  float outline = (1. - smoothstep(0.16, 0.30, max(dot(N, V), 0.)))*smoothstep(0.15, 0.75, uToon);
  col = mix(col, vec3(0.012, 0.07, 0.02), outline*0.9);

  // --- gold energy while accelerating (a rim, so the form stays readable)
  col += uGlow*vec3(1.0, 0.78, 0.22)*(0.05 + fres*0.9);

  // --- materialisation: the surface condenses out of noise behind a bright edge
  float nz = vnoise(N.xy*3.1 + N.z*2.3 + 11.);
  float th = uAppear*1.3 - 0.15;
  float vis = smoothstep(nz - 0.07, nz + 0.07, th);
  float edge = vis*(1. - smoothstep(0.0, 0.09, th - nz))*(1. - smoothstep(0.85, 1., uAppear));
  col += edge*vec3(1.0, 0.85, 0.35)*1.6;
  if (vis < 0.01) discard;

  col = col/(1. + col*0.22);                                      // soft shoulder
  gl_FragColor = vec4(pow(max(col, 0.), vec3(1./2.2)), vis);
}`;

const QUAD_VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv*2. - 1.; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;

const fxMaterial = (frag, uniforms, extra = {}) => new THREE.ShaderMaterial({
  vertexShader: QUAD_VERT, fragmentShader: `precision highp float; varying vec2 vUv;\n${NOISE}\n${frag}`,
  uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, ...PREMULT, ...extra,
});

export class SteelBall {
  constructor(envTexture) {
    this.group = new THREE.Group();
    const U = (v) => ({ value: v });

    // ---- ball
    this.u = {
      uRotInv: U(new THREE.Matrix3()), uAxis: U(new THREE.Vector3(0, 1, 0)), uBlurArc: U(0), uStreak: U(0), uStep: U(0),
      uAppear: U(0), uToon: U(0.45), uGlow: U(0), uRadius: U(0.035), uEnv: U(envTexture), uScreen: U(new THREE.Vector2(0.5, 0.5)),
      uMirror: U(1), uLightDir: U(new THREE.Vector3(-0.4, 0.7, 0.6).normalize()), uLightCol: U(new THREE.Vector3(1, 1, 1)), uExposure: U(1),
      uWobbleAxis: U(new THREE.Vector3(0, 1, 0)), uWobble: U(0),
    };
    // two looks share one set of uniforms; setLook() swaps between them
    const ballMat = (fragmentShader) => new THREE.ShaderMaterial({ vertexShader: BALL_VERT, fragmentShader, uniforms: this.u, transparent: true });
    this.looks = { new: ballMat(BALL_FRAG), classic: ballMat(classicFrag(NOISE)) };
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), this.looks.new);
    this.mesh.renderOrder = 10;
    this.group.add(this.mesh);

    // ---- halo behind the ball
    this.haloU = { uAmt: U(0), uGold: U(0) };
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fxMaterial(/* glsl */`
      uniform float uAmt, uGold;
      void main(){
        float r = length(vUv);
        float g = exp(-r*r*6.5)*0.5 + exp(-r*r*2.2)*0.12;
        vec3 c = mix(vec3(0.45, 1.0, 0.35), vec3(1.0, 0.8, 0.25), uGold);
        gl_FragColor = vec4(c*g*uAmt*(1. - smoothstep(0.85, 1., r)), 0.);
      }`, this.haloU, { depthTest: false }));
    this.halo.renderOrder = 5;
    this.group.add(this.halo);

    // ---- orbit rings
    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const u = { uAmt: U(0), uPhase: U(Math.random() * 6.28), uSeed: U(i * 3.1 + 1), uArcs: U(2 + (i % 2)) };
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fxMaterial(/* glsl */`
        uniform float uAmt, uPhase, uSeed, uArcs;
        void main(){
          float r = length(vUv), ang = atan(vUv.y, vUv.x);
          float s = fract((ang + uPhase)/6.2831853*uArcs);
          float arc = smoothstep(0.0, 0.5, s)*(1. - smoothstep(0.62, 0.7, s));      // tapered tail, sharp head
          float wob = 0.012*sin(ang*3. + uSeed);
          float line = 1. - smoothstep(0.0, 0.05*(0.3 + arc), abs(r - 0.86 - wob));
          float a = min(1., line*arc*1.2)*uAmt;
          gl_FragColor = vec4(mix(vec3(0.50, 0.56, 0.92), vec3(1.0), smoothstep(0.25, 0.8, line))*a, a);
        }`, u, { depthTest: true }));
      m.renderOrder = 12;
      this.group.add(m); this.rings.push({ mesh: m, u, tilt: new THREE.Quaternion(), height: (i - 1) * 0.42, speed: 13 + i * 4 });
    }

    // ---- contact shadow + green bounce light on the palm
    this.shadowU = { uShadow: U(0), uBounce: U(0), uOffset: U(new THREE.Vector2()) };
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fxMaterial(/* glsl */`
      uniform float uShadow, uBounce; uniform vec2 uOffset;
      void main(){
        float r = length(vUv - uOffset), r0 = length(vUv);
        float dark = exp(-r*r*7.)*uShadow;
        float glow = exp(-r0*r0*3.2)*uBounce*(1. - smoothstep(0.8, 1., r0));
        gl_FragColor = vec4(vec3(0.35, 0.95, 0.3)*glow*(1. - dark), dark);
      }`, this.shadowU, { depthTest: false }));
    this.shadow.renderOrder = 4;
    this.group.add(this.shadow);

    // ---- comet tail (thrown ball)
    this.tailU = { uAmt: U(0), uTime: U(0) };
    const cone = new THREE.CylinderGeometry(1, 0.03, 1, 40, 1, true);
    cone.translate(0, -0.5, 0);                                    // wide end at the origin, tip at -Y
    this.tail = new THREE.Mesh(cone, new THREE.ShaderMaterial({
      uniforms: this.tailU, transparent: true, depthWrite: false, side: THREE.DoubleSide, ...PREMULT,
      vertexShader: /* glsl */`varying vec2 vUv; varying vec3 vN; varying vec3 vP;
        void main(){ vUv = uv; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position, 1.); vP = mv.xyz; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: /* glsl */`precision highp float; uniform float uAmt, uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vP;
        ${NOISE}
        void main(){
          float along = vUv.y;                                      // 1 at the ball, 0 at the tip
          float streak = 0.6 + 0.4*vnoise(vec2(vUv.x*38., along*3. - uTime*9.));
          float facing = abs(dot(normalize(vN), normalize(-vP)));
          float a = pow(along, 1.6)*streak*(0.35 + 0.65*facing)*uAmt;
          vec3 c = mix(vec3(1.0, 0.55, 0.08), vec3(1.0, 0.95, 0.6), along);
          gl_FragColor = vec4(c*a*0.9, 0.);
        }`,
    }));
    this.tail.renderOrder = 8; this.tail.visible = false;
    this.group.add(this.tail);

    // ---- four-point star flare
    this.flareU = { uAmt: U(0), uRot: U(0.6) };
    this.flare = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fxMaterial(/* glsl */`
      uniform float uAmt, uRot;
      void main(){
        float c = cos(uRot), s = sin(uRot); vec2 p = mat2(c, -s, s, c)*vUv;
        float r = length(p);
        float star = exp(-abs(p.x)*38.)*exp(-abs(p.y)*2.6) + exp(-abs(p.y)*38.)*exp(-abs(p.x)*2.6);
        float core = exp(-r*r*40.);
        gl_FragColor = vec4(vec3(1.0, 0.97, 0.8)*(star*1.1 + core*0.9)*uAmt*(1. - smoothstep(0.8, 1., r)), 0.);
      }`, this.flareU, { depthTest: false }));
    this.flare.renderOrder = 20;
    this.group.add(this.flare);

    // ---- sparks
    this.N = 110;
    this.pPos = new Float32Array(this.N * 3); this.pVel = new Float32Array(this.N * 3);
    this.pLife = new Float32Array(this.N); this.pMax = new Float32Array(this.N).fill(1); this.pKind = new Uint8Array(this.N);
    this.pAttr = new Float32Array(this.N * 2);       // alpha, gold
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    pg.setAttribute('aInfo', new THREE.BufferAttribute(this.pAttr, 2));
    this.points = new THREE.Points(pg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, ...PREMULT, uniforms: { uSize: U(1) },
      vertexShader: /* glsl */`attribute vec2 aInfo; uniform float uSize; varying vec2 vInfo;
        void main(){ vInfo = aInfo; vec4 mv = modelViewMatrix*vec4(position, 1.); gl_Position = projectionMatrix*mv; gl_PointSize = uSize*(0.5 + aInfo.x)/max(0.05, -mv.z); }`,
      fragmentShader: /* glsl */`precision highp float; varying vec2 vInfo;
        void main(){ vec2 p = gl_PointCoord*2. - 1.; float r = dot(p, p); float a = exp(-r*4.5)*vInfo.x;
          vec3 c = mix(vec3(0.6, 1.0, 0.5), vec3(1.0, 0.85, 0.35), vInfo.y); gl_FragColor = vec4(c*a, 0.); }`,
    }));
    this.points.frustumCulled = false; this.points.renderOrder = 15;
    this.group.add(this.points);
    this.pNext = 0;

    // ---- depth-only hand proxy: capsules for the fingers and a sheet for the palm
    const occ = new THREE.MeshBasicMaterial({ colorWrite: false });
    this.occMat = occ;
    this.occJoints = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), occ, 21);
    this.occBones = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true), occ, 20);
    this.palmGeo = new THREE.BufferGeometry();
    this.palmGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(7 * 3), 3));
    this.palmGeo.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5, 0, 5, 6]);
    this.occPalm = new THREE.Mesh(this.palmGeo, new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
    for (const m of [this.occJoints, this.occBones, this.occPalm]) { m.renderOrder = 1; m.frustumCulled = false; this.group.add(m); }
    this.occluders = [this.occJoints, this.occBones, this.occPalm];

    this.rot = new THREE.Quaternion();             // accumulated engraving orientation
    this.axis = new THREE.Vector3(0, 1, 0);
    this.center = new THREE.Vector3(0, 0, -0.5);
    this.radius = 0.035;
    this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3();
  }

  setLook(name) { this.mesh.material = this.looks[name] ?? this.looks.new; }

  setOcclusion(on, showProxy = false) {
    for (const m of this.occluders) { m.visible = on; m.material.colorWrite = showProxy; m.material.color?.set(0xff3df2); m.material.transparent = showProxy; m.material.opacity = 0.45; }
  }

  // Finger capsules and palm sheet from the 21 display-space landmarks.
  updateHand(pts, palmWidth) {
    const P = (i, out) => out.set(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), mid = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3();
    const rFinger = palmWidth * 0.125;                 // slightly under real size so the proxy never cuts into the ball edge
    for (let i = 0; i < 21; i++) {
      const rr = i === 0 ? rFinger * 1.6 : i % 4 === 0 ? rFinger * 0.85 : rFinger * (i < 5 ? 1.15 : 1);
      this._m4.compose(P(i, a), this._q.identity(), s.setScalar(rr));
      this.occJoints.setMatrixAt(i, this._m4);
    }
    let k = 0;
    for (let f = 0; f < 5; f++) for (let j = 0; j < 4; j++) {
      const i0 = j === 0 ? 0 : f * 4 + j, i1 = f * 4 + j + 1;
      P(i0, a); P(i1, b);
      const L = a.distanceTo(b);
      mid.addVectors(a, b).multiplyScalar(0.5);
      this._q.setFromUnitVectors(up, b.sub(a).normalize());
      const rr = j === 0 ? rFinger * 1.3 : rFinger * (f === 0 ? 1.1 : 0.95);
      this._m4.compose(mid, this._q, s.set(rr, L, rr));
      this.occBones.setMatrixAt(k++, this._m4);
    }
    this.occJoints.instanceMatrix.needsUpdate = true; this.occBones.instanceMatrix.needsUpdate = true;
    const pa = this.palmGeo.attributes.position.array;
    [0, 1, 2, 5, 9, 13, 17].forEach((i, n) => { pa[n * 3] = pts[i * 3]; pa[n * 3 + 1] = pts[i * 3 + 1]; pa[n * 3 + 2] = pts[i * 3 + 2]; });
    this.palmGeo.attributes.position.needsUpdate = true;
  }

  // p: {center, radius, axis, omega, dt, time, appear, streak, toon, glow, rings, halo, gold,
  //     palm:{center, normal}|null, shadow, bounce, light, flare, wobble}
  update(p) {
    const dt = p.dt;
    this.center.copy(p.center); this.radius = p.radius;
    this.axis.copy(p.axis).normalize();
    // integrate the spin, plus a slow precession so the engraving does not sit aligned with the axis
    this._q.setFromAxisAngle(this.axis, p.omega * dt); this.rot.premultiply(this._q);
    this._q.setFromAxisAngle(this._v.set(0.3, 0.2, 0.93).normalize(), 0.35 * dt); this.rot.premultiply(this._q).normalize();
    this._m4.makeRotationFromQuaternion(this._q.copy(this.rot).invert());
    this.u.uRotInv.value.setFromMatrix4(this._m4);
    this.u.uAxis.value.copy(this.axis);
    this.u.uBlurArc.value = Math.min(5.5, Math.abs(p.omega) * p.shutter);
    const step = Math.floor(p.time * 12);
    this.u.uStep.value = step; this.u.uStreak.value = p.streak; this.u.uAppear.value = p.appear; this.u.uToon.value = p.toon;
    this.u.uGlow.value = p.glow; this.u.uRadius.value = p.radius;
    // silhouette wobble, re-rolled every step
    const h = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
    this.u.uWobbleAxis.value.set(h(step) - 0.5, h(step + 7) - 0.5, (h(step + 13) - 0.5) * 0.3).normalize();
    this.u.uWobble.value = p.wobble * (0.4 + 0.6 * h(step + 3));

    this.mesh.position.copy(this.center); this.mesh.scale.setScalar(p.radius * p.scale);
    this.mesh.visible = p.appear > 0.001;

    this.halo.position.copy(this.center); this.halo.scale.setScalar(p.radius * 4.2);
    this.haloU.uAmt.value = p.halo; this.haloU.uGold.value = p.gold; this.halo.visible = p.halo > 0.002;

    // rings: stacked along the axis, hugging the sphere, each slightly tilted and re-tilted every few steps
    const qAxis = this._q.setFromUnitVectors(this._v.set(0, 0, 1), this.axis).clone();
    this.rings.forEach((r, i) => {
      const s2 = Math.floor(p.time * 6) + i * 17;
      r.tilt.setFromEuler(new THREE.Euler((h(s2) - 0.5) * 0.34, (h(s2 + 5) - 0.5) * 0.34, 0));
      r.mesh.quaternion.copy(qAxis).multiply(r.tilt);
      const hh = r.height + (h(s2 + 9) - 0.5) * 0.18;
      r.mesh.position.copy(this.center).addScaledVector(this.axis, hh * p.radius);
      const ringR = (Math.sqrt(Math.max(0.05, 1 - hh * hh)) * 1.28 + 0.12) * p.ringScale;
      r.mesh.scale.setScalar((p.radius * ringR) / 0.86);
      r.u.uPhase.value -= r.speed * dt * (0.6 + p.omega / 40);
      r.u.uAmt.value = p.rings * (0.65 + 0.35 * h(s2 + 2));
      r.mesh.visible = p.rings > 0.01;
    });

    if (p.palm && (p.shadow > 0.005 || p.bounce > 0.005)) {
      this.shadow.visible = true;
      const n = this._v.fromArray(p.palm.normal);
      this.shadow.quaternion.setFromUnitVectors(this._v2.set(0, 0, 1), n);
      this.shadow.position.fromArray(p.palm.center).addScaledVector(n, p.palm.lift);
      this.shadow.scale.setScalar(p.radius * 1.9);
      this.shadowU.uShadow.value = p.shadow; this.shadowU.uBounce.value = p.bounce;
      // shadow falls away from the light, measured in the palm plane
      const l = this._v2.copy(this.u.uLightDir.value); l.addScaledVector(n, -l.dot(n));
      const loc = l.applyQuaternion(this._q.copy(this.shadow.quaternion).invert());
      this.shadowU.uOffset.value.set(-loc.x * 0.22, -loc.y * 0.22);
    } else this.shadow.visible = false;

    if (p.tail > 0.01 && p.tailFrom) {
      this.tail.visible = true; this.tailU.uAmt.value = p.tail; this.tailU.uTime.value = p.time;
      const dir = this._v.copy(p.tailFrom).sub(this.center); const L = dir.length() || 1e-4; dir.multiplyScalar(1 / L);
      this.tail.position.copy(this.center);
      this.tail.quaternion.setFromUnitVectors(this._v2.set(0, -1, 0), dir);
      this.tail.scale.set(p.radius * 1.05, L, p.radius * 1.05);
    } else this.tail.visible = false;

    this.flare.position.copy(this.center); this.flare.scale.setScalar(p.radius * 4.6 * (0.6 + p.flare * 0.6));
    this.flareU.uAmt.value = p.flare; this.flare.visible = p.flare > 0.01;

    this._particles(dt);
  }

  spawn(kind, count, origin, radius) {
    for (let n = 0; n < count; n++) {
      const i = this.pNext; this.pNext = (this.pNext + 1) % this.N;
      const u = Math.random() * 2 - 1, a = Math.random() * 6.283, s = Math.sqrt(1 - u * u);
      const dir = [s * Math.cos(a), u, s * Math.sin(a)];
      this.pKind[i] = kind;
      if (kind === 0) {                              // converge: start on a shell, fall in on a spiral
        const R = radius * (2.6 + Math.random() * 2.2);
        for (let k = 0; k < 3; k++) { this.pPos[i * 3 + k] = origin.getComponent(k) + dir[k] * R; this.pVel[i * 3 + k] = 0; }
        this.pMax[i] = this.pLife[i] = 0.45 + Math.random() * 0.35;
      } else {                                       // burst outward
        const sp = radius * (14 + Math.random() * 26);
        for (let k = 0; k < 3; k++) { this.pPos[i * 3 + k] = origin.getComponent(k) + dir[k] * radius; this.pVel[i * 3 + k] = dir[k] * sp; }
        this.pMax[i] = this.pLife[i] = 0.3 + Math.random() * 0.4;
      }
    }
  }

  _particles(dt) {
    const c = this.center;
    for (let i = 0; i < this.N; i++) {
      if (this.pLife[i] <= 0) { this.pAttr[i * 2] = 0; continue; }
      this.pLife[i] -= dt;
      const t = 1 - Math.max(0, this.pLife[i]) / this.pMax[i];
      const x = this.pPos[i * 3] - c.x, y = this.pPos[i * 3 + 1] - c.y, z = this.pPos[i * 3 + 2] - c.z;
      if (this.pKind[i] === 0) {
        const pull = 1 - Math.exp(-dt * (3 + 14 * t)), sw = dt * 9;         // inward pull + swirl round the spin axis
        const ax = this.axis, cx = ax.y * z - ax.z * y, cy = ax.z * x - ax.x * z, cz = ax.x * y - ax.y * x;
        this.pPos[i * 3] = c.x + x * (1 - pull) + cx * sw; this.pPos[i * 3 + 1] = c.y + y * (1 - pull) + cy * sw; this.pPos[i * 3 + 2] = c.z + z * (1 - pull) + cz * sw;
        this.pAttr[i * 2] = Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.9; this.pAttr[i * 2 + 1] = 0.25 + 0.5 * t;
      } else {
        const drag = Math.exp(-dt * 3.5);
        for (let k = 0; k < 3; k++) { this.pVel[i * 3 + k] *= drag; this.pPos[i * 3 + k] += this.pVel[i * 3 + k] * dt; }
        this.pAttr[i * 2] = (1 - t) * (1 - t); this.pAttr[i * 2 + 1] = 1;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aInfo.needsUpdate = true;
  }
}
