# Development log

Newest entry first. Each entry: what changed, what was checked and how, what is still wrong.

## 2026-11-12 — two-hand mode (demo)

`2` (or **Two hands**) tracks two hands, each with its own ball.

- **Tracking.** MediaPipe is switched to two hands at runtime. Each detected hand keeps its
  slot from frame to frame (nearest to where that slot's hand was last seen); a new hand
  takes the slot for its side, right hand first. Duplicate detections of one hand (MediaPipe
  produced 6 in a 7 s one-hand clip) are dropped by box overlap, so they cannot summon a
  ghost ball.
- **Balls.** One ball and one state machine per hand. The ball doing the most (impact >
  throw > summon > ready) drives the screen-wide effects; the other one lights the camera
  image round its own hand. Spin sound is mixed into one voice: the louder ball sets the
  pitch, the second thickens it. Finger stand-ins from both hands hide both balls.
- **Checked** on the synthetic scene, which now has a mirrored left hand running 1.6 s
  behind the right: both summon, spin together and throw independently; toggling on and
  off mid-run works. On real footage, two-hand mode detects a single hand as well as
  one-hand mode (39 of 46 frames vs 38). The only two-hand reference clip shows hands
  wrapped round balls, which MediaPipe does not detect.
- **Confirmed by you on the live webcam:** both hands are tracked.
- **Demo video** made from the app's own frames: `captures/demo-two-hands.mp4`. The dev
  server gained an opt-in `--captures` flag for this.

Open: throwing both balls at the same instant shows only the first one's screen effects;
the two thrown balls converge on the same point at the lens.

## 2026-11-12 — Gyro's hat

A **Hat** toggle (`G`) puts Gyro's hat on the tracked head.

- **References.** The anime frames (`WhrRNqDzias @ 55, 125`, `MClSzMJY-bY @ 15, 113`) and
  the ArtStation piece "Gyro Zeppeli hat" by Frizzarin. That page shows renders only and
  offers no file, so it was used as a visual reference; the geometry here is built from
  scratch. From the model: flat-topped round crown with window slots, wide flat brim with
  radial slots, strap with two slotted goggles and side knobs. From the anime: the brown
  leather colour and grey strap and goggles (the model itself is tan).
- **Head tracking.** MediaPipe Face Landmarker, loaded only when the hat is first switched
  on. Pose comes from four landmarks (forehead top, chin, both cheek edges); distance from
  an assumed 14.5 cm face width.
- **Occlusion.** The brim slots are real holes. A depth-only stand-in for the head hides
  the far side of the brim; the existing finger stand-ins put a raised hand in front of
  the hat.
- **Checked** on the synthetic scene and on the first second of the real-hand clip, where
  the hat sat on the person's head and followed its tilt. Not checked on a live webcam.
- **Bug found on the way:** the hat's colours came out dark orange because they were
  created before colour management was switched off.

Still rough: the goggles are plain boxes, there is no brim shadow on the face, the head
stand-in leaves a hard curved edge on the brim behind the head, and hat size is fixed to
an average head (`size` and `height` on the hat object are there for trimming).

## 2026-11-11 — both looks kept

You like the current ball and the previous one, so both stay.

- `L` (or the **Look** button) switches between **new** and **classic**. Classic is the
  ball shader exactly as committed in the first complete pass (git tag `look-v1`), kept in
  `src/ball-classic.js`. New is the second pass (tag `look-v2`).
- Each look works with all three styles; style and look are remembered in the browser.
- The ball lab takes `?look=classic`.
- Not carried into classic: the two bug fixes from the second pass that are not part of
  the ball's surface (glow clipped by the finger stand-ins, coarse reflection image) stay
  fixed for both looks.
- The very first build you tried, before the first commit, was never saved and is not
  recoverable exactly. Classic is the earliest version in git.

Checked: classic renders in the ball lab; the button and the `L` key both switch the
shader and the choice is saved.

## 2026-11-11 — ball look, second pass

You asked for the ball look to be refined first.

### Added

`prototypes/c-ball-lab.html`: the ball on its own, large, in all three styles at three spin
speeds (nearly still, resting, thrown). This is now the place to judge the look; add
`?bg=bright` for a bright room.

### Changes

| Problem seen | Change |
|---|---|
| Spin streaks read as watermelon stripes: long zigzag lines right round the ball | Streaks are now finite horizontal strokes whose ends break into pointed teeth, as in `3GACRm9WXFc @ 20.4`. Dark marks are short and sparse |
| Anime style was not really cel shaded | Ink outline at the silhouette, one large hard-edged highlight patch with a hot core, soft speculars removed, channel drawn as a mid-green floor between inked walls |
| Channel edges were blocky under highlights | Wall normals now come from finite differences on the sphere, not from screen-space derivatives |
| Channels too thin against the references | Widened by about a sixth |
| Ball looked like glass on real footage | Its reflection sampled the camera frame directly behind it. It now samples the frame flipped and from the frame's centre, with more contrast |
| Glow was cut into polygons on the hand | The glow no longer depth-tests against the finger stand-ins |
| Reflections were visibly pixelated | Reflection image is 160×90 and blurred, up from 64×36 |
| Spinning metal looked plain | Added the pole-to-pole highlight streak seen on the real spinning props |
| Thrown metal ball went flat yellow | Gold energy is now a rim, not a fill |

### Checked

Ball lab screenshots of all nine cells, and the real-hand clip in hybrid, anime and metal.
Not checked on a live webcam by me.

### Still open

- Hybrid streaks are closer to the references but still busier than the anime's.
- The thrown metal ball has little surface detail.
- The reflection is a stand-in (the flipped camera frame); a webcam cannot see what is
  really behind it.

## 2026-11-11 — first complete pass (prototypes A–F)

### How things were checked

I cannot see the live webcam, so nothing here was verified on it by me. Checks used:

- a **synthetic hand** (`?sim=1&manual=1`) stepped frame by frame through the whole
  sequence, with screenshots at each stage;
- a **real-hand clip** cut from the reference video `i9GQte8sg44` (a person holding a
  real prop ball), stepped frame by frame through MediaPipe and the full renderer.

Real-time frame rate was **not measured**: the preview pane was hidden, which stalls
animation timers. Sound was **not heard** by me at any point.

You confirmed on your own webcam that the ball appears on your palm.

### References added

The 20 clips in `videos/best`. Findings are in `reference-analysis.md`.

### What works

- **Tracking.** MediaPipe Hand Landmarker runs locally (GPU delegate). Landmarks are
  turned into a metric 3D hand by solving for the translation that reprojects MediaPipe's
  world landmarks onto the image. On the synthetic hand the solve recovers the true
  distance (0.556 m against 0.55 m).
- **Frame sync.** Each camera frame is copied once to a canvas; detection and rendering
  both use that copy, so the ball is drawn on the same pixels the landmarks came from.
- **Gestures.** Open palm (finger straightness with hysteresis), palm facing the camera,
  throw (speed over 1.5 m/s or over 0.85 m/s toward the lens for two frames; also fires
  if the hand is lost mid-swing).
- **Ball.** Hexagon-and-slot engraving, rotational blur computed along the swept arc,
  zigzag streaks and orbit rings stepped at 12 fps, reflections taken from the camera
  frame, key light estimated from the frame.
- **Placement.** On the real-hand clip the virtual ball landed where the real prop sat in
  the palm, at a similar size.
- **Sequence.** Idle → summon (1.5 s) → ready → throw (0.5–0.66 s) → impact → idle.
- **Calibration.** Finds the real ball on the clip, reports distance, hand scale and
  resting offset, captures and saves.

### Experiments

| Tried | Result |
|---|---|
| Soccer-ball (truncated icosahedron) engraving | Dropped before building: stationary anime shots and all three Sketchfab models show hexagon caps with slots instead |
| Cutting sound effects out of the reference clips | Dropped: every clip is a full mix; no clean effect exists. Synthesised from measurements instead |
| A 2D sprite sequence extracted from the anime (the suggested "approach B") | Dropped: no clean, isolated ball sequence exists in the clips, a fixed drawing cannot follow the palm or fly at the lens, and it would mean copying the animation. The anime look is rebuilt procedurally on the 3D ball instead; the `S` key compares metal, hybrid and anime |
| Per-row random jitter for jagged streak edges | Failed: looked blocky and low-resolution. Replaced by two triangle waves displacing latitude |
| Streaks painted over the lit surface | Failed: flat, and the ball read as a watermelon. Streaks now repaint the surface underneath the lighting, are paler and broken into finite lengths |
| Bright additive glow on the palm | Failed: clipped a well-lit hand to white. Now a screen-style blend that cannot clip, at lower strength |
| Trusting MediaPipe's left/right label alone for which side is the palm | Risky: documentation and observed behaviour disagree. Now the label and finger-curl anatomy vote, with `H` as a manual swap |
| Flight of 0.9 s with a slow start | Failed: the hand overtook the ball and the finger stand-ins hid it. Flight shortened; occlusion is off once the ball is released |
| Twelve fixed blur samples | Failed: grooves combed into ribs. Sample count now follows the arc and each sample's edge is widened to the spacing |

### What still looks unnatural or is unproven

- **Finger occlusion in a real overlap** (a finger actually in front of the ball) has not
  been exercised. The stand-in capsules line up with the synthetic hand, but real fingers
  will show a hard, slightly wrong edge.
- **Throw thresholds** are tuned on a synthetic motion only.
- **Metal style** is plain while spinning: a physically blurred engraving collapses into
  faint bands, as on the real props. It may want a brushed-metal anisotropic highlight.
- **Gold comet tail** is mostly hidden behind the ball when it flies straight at the lens.
- **Summon glow** on very bright skin may still be strong.
- **Calibration** lost the ball in one of three clip segments while the hand was turning.
- **Sound** is unheard; levels and character are guesses built on measured pitch and
  pulse rate.
- **No 3D model integrated**; see `model-comparison.md`.

### Test next

1. Live webcam: does the ball stay glued to the palm when the hand moves and tilts?
2. Throw: read the peak speed values in the debug panel for a real throw and a normal
   hand move, and set the thresholds between them.
3. Curl fingers in front of the ball with `P` on, to see how well the stand-ins match.
4. Listen to all five sound cues.
5. Frame rate in the debug panel on your hardware.
