// The ball drawn the way the anime's Spin montage draws it (look "sbr", from
// videos/special/InShot_20261112_133246086.mp4). Flat colour, no gloss:
//   - three hard tones of pale lime, a jagged ink outline, hard white highlight patches
//   - spinning: brush-stroke streaks in cream and dark green, cut into rows round the spin
//     axis, with serrated ends; short dark vertical ticks (the slots, smeared); all redrawn
//     12 times a second
//   - thrown toward the viewer: the streaks swirl into a pinwheel round the near pole
// Colours are display values (no lighting maths in linear space, unlike the other looks).
export const sbrFrag = (NOISE) => /* glsl */`
precision highp float;
uniform mat3 uRotInv; uniform vec3 uAxis;
uniform float uBlurArc, uStreak, uStep, uAppear, uToon, uGlow, uRadius, uTwist;
uniform sampler2D uEnv; uniform vec2 uScreen; uniform float uMirror;
uniform vec3 uLightDir, uLightCol; uniform float uExposure;
varying vec3 vN; varying vec3 vPos;
const float PI = 3.14159265;
${NOISE}

vec3 rotAxis(vec3 v, vec3 k, float a){ float c = cos(a), s = sin(a); return v*c + cross(k, v)*s + k*dot(k, v)*(1.-c); }

float groove(vec3 d, float soft){
  const float R = 0.56, T2 = 1.30, W = 0.075, SEG = PI/3.;
  float th = acos(clamp(abs(d.y), 0., 1.));
  float ph = atan(d.z, d.x) + (d.y < 0. ? PI/6. : 0.);
  float a = mod(ph, SEG) - SEG*0.5;
  float dHex = abs(th - R*cos(PI/6.)/cos(a))*cos(a);
  float av = PI/6. - abs(a);
  float dSlot = length(vec2(sin(th)*av, th - clamp(th, R, T2)));
  return 1. - smoothstep(W*0.5 - soft, W + soft, min(dHex, dSlot));
}

void main(){
  vec3 N = normalize(vN), V = normalize(-vPos), L = normalize(uLightDir);
  float NoV = max(dot(N, V), 0.);

  // engraving, averaged along the arc it sweeps in one exposure
  float H = 0.;
  if (uBlurArc > 0.02) {
    float taps = clamp(ceil(uBlurArc/0.05), 2., 20.), soft = uBlurArc/(taps - 1.)*0.75;
    for (int i = 0; i < 20; i++) { if (float(i) >= taps) break; H += groove(uRotInv*rotAxis(N, uAxis, (float(i)/(taps - 1.) - 0.5)*uBlurArc), soft); }
    H /= taps;
  } else H = groove(uRotInv*N, 0.);

  // the montage's palette
  const vec3 LIGHT = vec3(0.76, 0.91, 0.54), BASE = vec3(0.63, 0.84, 0.41), SHADE = vec3(0.44, 0.66, 0.29);
  const vec3 INK = vec3(0.09, 0.25, 0.08), CREAM = vec3(0.95, 0.98, 0.86), DARK = vec3(0.17, 0.38, 0.15);

  // three hard tones
  float nl = dot(N, L);
  vec3 col = nl > 0.38 ? LIGHT : (nl > -0.22 ? BASE : SHADE);

  // still: inked channel walls, mid-green floor; fades out as the spin smears it
  float still = 1. - smoothstep(0.15, 0.6, uBlurArc);
  float wall = H*(1. - H)*4.;
  col = mix(col, SHADE, H*0.8*still);
  col = mix(col, INK, wall*0.85*still);

  // spin streaks, in rows round the axis (longitude measured from the viewer: no visible seam)
  vec3 e1 = V - uAxis*dot(V, uAxis);
  e1 = dot(e1, e1) > 1e-4 ? normalize(e1) : normalize(cross(uAxis, vec3(1, 0, 0)));
  vec3 e2 = cross(uAxis, e1);
  float lat = dot(N, uAxis), lon = atan(dot(N, e2), dot(N, e1));
  lon += uTwist*(1. - abs(lat))*4.5;                              // pinwheel when the axis points at the viewer
  // rows of streaks; the row boundaries zigzag along the spin direction (saw-toothed band edges)
  float zz = (abs(fract(lon*6.5 + hash1(uStep*1.7)*3.) - 0.5)*2. - 0.5)*(0.3 + 0.9*vnoise(vec2(lon*3.1, lat*5. + uStep*4.)))
           + (abs(fract(lon*15.3 + hash1(uStep*2.9)*5.) - 0.5)*2. - 0.5)*0.3*vnoise(vec2(lon*5.3 + 7., lat*9. - uStep*3.));   // irregular teeth
  float y = (lat*0.5 + 0.5)*16. + zz*0.55 + (vnoise(vec2(lon*1.7, uStep*3.1)) - 0.5)*1.2;
  float row = floor(y), fy = fract(y), sub = floor(fy*3.);
  float cx = (lon/(2.*PI) + 0.5)*3.2 + hash1(row*3.7 + uStep*11.)*7.;
  float cell = floor(cx), fx = fract(cx);
  float hs = hash1(cell*7.3 + row*13.1 + uStep*5.7);
  float a = 0.03 + 0.25*hash1(hs*91.), b = a + 0.4 + 0.55*hash1(hs*47.);
  float teeth = (hash1(row*5.1 + sub*1.7 + uStep*2.3 + cell) - 0.5)*0.22;   // serrated ends, different per third of a row
  float stroke = step(a + teeth, fx)*step(fx, b - teeth);
  float cream = stroke*step(hs, 0.58);
  // dark marks: thin zigzag scribbles inside a row
  float dz = abs(fy - 0.5 + (vnoise(vec2(lon*9., row*3. + uStep)) - 0.5)*0.6 + (abs(fract(lon*21. + row) - 0.5) - 0.25)*0.25);
  float dark = stroke*step(0.58, hs)*step(hs, 0.82)*step(dz, 0.2);                 // bold ragged brush strokes
  float tx = lon*9.;
  float tick = step(0.8, hash1(floor(tx) + row*0.37 + uStep*3.))*(1. - step(0.19, abs(fract(tx) - 0.5)))
             *step(abs(lon), 1.1)*step(0.45, hash1(row*1.3 + uStep));
  float sk = uStreak*(1. - smoothstep(0.76, 0.97, abs(lat)));
  col = mix(col, CREAM, cream*sk*0.95);
  col = mix(col, DARK, max(dark, tick)*sk);

  // hard white highlight patch toward the light, a smaller one opposite
  vec3 Hh = normalize(L + V);
  float nh = max(dot(N, Hh), 0.);
  float hl = smoothstep(0.935, 0.948, nh) + smoothstep(0.985, 0.99, max(dot(N, normalize(vec3(-L.x, -0.5, 0.6) + V)), 0.))*0.6;
  col = mix(col, vec3(0.97, 1.0, 0.9), clamp(hl, 0., 1.)*(1. - uStreak));          // no highlight once it spins

  // shaded rim and a jagged ink outline (the edge breaks up while spinning)
  col = mix(col, SHADE*0.85, (1. - smoothstep(0.12, 0.42, NoV))*0.5);
  float jag = hash1(floor(atan(dot(N, e2), dot(N, cross(e2, V)))*14.) + uStep)*0.07*uStreak;
  col = mix(col, INK, 1. - smoothstep(0.09, 0.17 + jag, NoV));

  // sit in the room: take a little of the scene's light colour and brightness
  col *= mix(vec3(1.), uLightCol, 0.3)*mix(1., uExposure, 0.45);

  // gold energy: the ball yellows and gets a hot rim
  col = mix(col, vec3(0.93, 0.92, 0.5), uGlow*0.35);
  col += uGlow*vec3(1.0, 0.72, 0.18)*pow(1. - NoV, 2.)*0.7;

  // materialisation: same condensing edge as the other looks
  float nz = vnoise(N.xy*3.1 + N.z*2.3 + 11.);
  float th = uAppear*1.3 - 0.15;
  float vis = smoothstep(nz - 0.07, nz + 0.07, th);
  float edge = vis*(1. - smoothstep(0.0, 0.09, th - nz))*(1. - smoothstep(0.85, 1., uAppear));
  col += edge*vec3(1.0, 0.85, 0.35)*0.9;
  if (vis < 0.01) discard;
  gl_FragColor = vec4(clamp(col, 0., 1.), vis);
}`;
