# Development log

Newest entry first. Each entry: what changed, what was checked and how, what is still wrong.

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
