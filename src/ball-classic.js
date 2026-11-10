// The ball's first look (git tag look-v1), kept selectable next to the current one.
// Differences from the current shader: softer, glassier reflections taken from behind the
// ball, zigzag-edged streak bands, thinner channels, no ink outline.
export const classicFrag = (NOISE) => /* glsl */`
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
  const float R = 0.56, T2 = 1.30, W = 0.062, SEG = PI/3.;
  float th = acos(clamp(abs(d.y), 0., 1.));
  float ph = atan(d.z, d.x) + (d.y < 0. ? PI/6. : 0.);
  float a = mod(ph, SEG) - SEG*0.5;                  // 0 at an edge midpoint, +-30deg at corners
  float hexR = R*cos(PI/6.)/cos(a);
  float dHex = abs(th - hexR)*cos(a);
  float av = PI/6. - abs(a);                         // angle to the nearest corner meridian
  float dSlot = length(vec2(sin(th)*av, th - clamp(th, R, T2)));
  return 1. - smoothstep(W*0.5 - soft, W + soft, min(dHex, dSlot));
}

void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(-vPos);

  // --- rotational motion blur: average the engraving along the arc it sweeps in one exposure
  float H = 0.;
  if (uBlurArc > 0.02) {
    float n = clamp(ceil(uBlurArc/0.035), 2., 28.);
    float soft = uBlurArc/(n - 1.)*0.75;                      // widen each tap's edge to its spacing so taps never comb
    for (int i = 0; i < 28; i++) {
      if (float(i) >= n) break;
      H += groove(uRotInv * rotAxis(N, uAxis, (float(i)/(n - 1.) - 0.5)*uBlurArc), soft);
    }
    H /= n;
  } else H = groove(uRotInv * N, 0.);

  // --- bump from the blurred height (screen-space derivatives)
  vec3 dpdx = dFdx(vPos), dpdy = dFdy(vPos);
  vec3 r1 = cross(dpdy, N), r2 = cross(N, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det)*(dFdx(H)*r1 + dFdy(H)*r2);
  vec3 Nb = normalize(abs(det)*N + grad*uRadius*0.055*(1. - 0.6*smoothstep(0.4, 1.6, uBlurArc)));
  float NoV = max(dot(Nb, V), 0.);

  // --- anime streaks: saw-toothed streaks round the spin axis, redrawn every step.
  // They repaint the surface itself; lighting and reflections are applied on top of them.
  // (longitude is measured from the side facing the viewer, so its wrap-around seam is hidden)
  vec3 e1 = V - uAxis*dot(V, uAxis);
  e1 = dot(e1, e1) > 1e-4 ? normalize(e1) : normalize(cross(uAxis, vec3(1, 0, 0)));
  vec3 e2 = cross(uAxis, e1);
  float lat = dot(N, uAxis), lon = atan(dot(N, e2), dot(N, e1));
  float ph = hash1(uStep)*6.283;
  float tri1 = abs(fract(lon*2.9 + ph) - 0.5)*2. - 0.5, tri2 = abs(fract(lon*6.7 - ph*1.7) - 0.5)*2. - 0.5;
  float amp = 0.04 + 0.05*vnoise(vec2(lat*4. + uStep, 3.));
  float l2 = lat + tri1*amp + tri2*amp*0.45;                 // zigzag edges
  float nA = vnoise(vec2(l2*5.0 + uStep*3.7, lon*1.5 + uStep*1.3))*0.7 + vnoise(vec2(l2*11. - uStep*2.1, lon*2.6 + 5.))*0.3;
  float nB = vnoise(vec2(l2*27. + uStep*9.1, lon*3.6 - uStep*2.3));
  float polar = 1. - smoothstep(0.72, 0.97, abs(lat));       // streaks thin out toward the poles of the spin
  float white = smoothstep(0.565, 0.595, nA)*polar*uStreak;   // pale streaks of finite length
  float dark = smoothstep(0.77, 0.79, nB)*polar*uStreak;      // short dark dashes

  // --- material: lime-green metal, darker in the channels
  // deep emerald when rendered as metal, paler lime (the anime's colour) when cel shaded
  vec3 metalCol = mix(vec3(0.13, 0.56, 0.05), vec3(0.40, 0.72, 0.13), uToon);
  vec3 base = mix(metalCol, vec3(0.02, 0.13, 0.02), H*(0.92 - 0.5*uStreak));
  base = mix(base, vec3(0.03, 0.17, 0.03), dark*0.85);
  base = mix(base, mix(vec3(0.45, 0.82, 0.30), vec3(0.76, 0.92, 0.58), uToon), white*0.8);
  vec3 L = normalize(uLightDir);
  float nl = dot(Nb, L)*0.5 + 0.5;
  float tone = mix(nl*nl, floor(nl*3. + 0.4)/3., uToon);
  float under = 0.62 + 0.38*smoothstep(-0.9, 0.35, Nb.y);          // darker underside, where the hand blocks the light
  vec3 body = base*(0.30 + 1.0*tone)*under;

  vec3 R = reflect(-V, Nb);
  vec2 euv = uScreen + R.xy*0.34;
  vec3 env = pow(texture2D(uEnv, vec2(mix(euv.x, 1.-euv.x, uMirror), euv.y)).rgb, vec3(2.2));
  float fres = pow(1. - NoV, 5.);
  vec3 F0 = min(base*1.25, vec3(0.95));
  vec3 F = F0 + (1. - F0)*fres;
  vec3 Hh = normalize(L + V);
  float nh = max(dot(Nb, Hh), 0.);
  float tight = pow(nh, 120.), broad = pow(nh, 18.);
  tight = mix(tight, smoothstep(0.35, 0.45, tight), uToon);       // hard-edged highlight patch when cel shaded
  vec3 spec = env*F*mix(1.15, 0.6, uToon)*under + uLightCol*(tight*3.0 + broad*mix(1.1, 0.5, uToon))*mix(F, vec3(1.), 0.55);
  // a second, dimmer highlight low on the opposite side keeps the form readable
  vec3 L2 = normalize(vec3(-L.x, -0.6, 0.5));
  spec += F*pow(max(dot(Nb, normalize(L2 + V)), 0.), 40.)*0.35;

  vec3 col = (body*0.72 + spec*0.62)*uExposure;
  col += fres*vec3(0.35, 0.8, 0.3)*0.22*uExposure;

  // --- gold energy while accelerating
  col += uGlow*vec3(1.0, 0.78, 0.22)*(0.18 + fres*1.1);

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
