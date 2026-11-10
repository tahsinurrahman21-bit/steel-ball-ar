# Steel Ball AR

A real-time webcam experience: show an open palm and a spinning Steel Ball materialises
on it; snap your hand toward the camera and the ball flies at the lens.

Everything runs locally in the browser. No video leaves the computer.

## Run it

Requires Node.js 18 or newer and a recent Chrome or Edge.

```bash
npm install
```

```bash
npm start
```

Then open `http://localhost:5173/` and click **Start camera**. The camera only works on
`localhost` or over https.

`npm install` fetches Three.js and MediaPipe Tasks Vision. The hand-tracking model
(`assets/mediapipe/hand_landmarker.task`, 7.8 MB) is already in the folder; if it is ever
missing, download it from
`https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`.

## How to perform it

1. Hold an open palm toward the camera for a moment. The ball condenses on it.
2. Keep the palm open; the ball stays and spins. Closing your hand puts it away.
3. Throw: snap the hand toward the camera. The ball leaves the hand and comes at the lens.
4. Open your palm again for another ball.

## Controls

| Key | Button | What it does |
|---|---|---|
| `D` | Debug | Landmarks, skeleton, palm axes, gesture and timing readouts |
| `S` | Style | Cycles hybrid → anime → metal |
| `L` | Look | Switches between the current ball (new) and the first version (classic) |
| `C` | Calibrate | Real-object calibration panel |
| `M` | Mirror | Selfie mirroring on/off |
| `O` | Finger occlusion | Fingers in front of the ball hide it |
| `N` | Mute | Sound on/off |
| `F` | Fill | Fill the window (crops the edges) |
| `H` | – | Swap left/right hand. Use it if the ball appears *behind* your hand |
| `P` | – | Show the finger stand-ins used for occlusion |

**Styles.** *Metal* is a physical render: deep green reflective metal, real rotational
blur, no drawn streaks. *Anime* is cel shaded with pale lime, zigzag spin streaks and a
wobbling outline. *Hybrid* (default) sits between them.

**Looks.** Both versions of the ball are kept. *New* is solid and mirror-like, with short
comb-ended spin streaks and an ink outline in the anime style. *Classic* is the first
version: glassier reflections, zigzag-edged streak bands, thinner channels. Each look works
with all three styles. Your style and look are remembered between visits.

## Calibration with a real ball (optional)

Press `C`, hold any ball in your open palm facing the camera, pick its size, and press
**Capture** once the yellow ring sits on the ball. This corrects the scale of your hand
(so distances and throw speeds are true), moves the virtual ball's resting spot to where
a real ball sits in your palm, and can optionally match the virtual ball's size. The
dashed green ring shows where the virtual ball would be drawn, for comparison. The result
is saved in the browser; **Reset** clears it.

The detector needs a ball whose colour differs from your skin and from what is behind it.

## Your own sounds

Sound is synthesised by default. To use recordings, see `assets/audio/README.md`.

## If something is off

| Symptom | Try |
|---|---|
| Nothing appears on an open palm | Press `D`. "open palm" and "facing cam" must both read YES. If "facing cam" is no while your palm faces the lens, press `H` |
| Ball sits behind the hand | Press `H` |
| Throw does not trigger | Press `D` and watch "speed" and "toward cam" peak values against the thresholds on the last line. Thresholds are `throwSpeed` and `throwToward` in `src/tracking.js` |
| Throw triggers by accident | Raise the same two thresholds |
| Ball too big or small | `radiusFactor` in `src/experience.js`, or calibrate with "same size" ticked |
| Low frame rate | Close other camera apps; the debug panel shows render and camera fps and detection time |

## Layout

```
index.html                 the experience
prototypes/                A: hand tracking only · C: ball lab (every style and spin speed, no camera)
src/tracking.js            landmarks -> metric 3D hand, filters, gestures
src/source.js              webcam / test video / synthetic hand -> frames
src/ball.js                ball shader, rings, shadow, tail, sparks, finger stand-ins
src/stage.js               renderer, camera grade, lens effects
src/experience.js          state machine and choreography; tuning values at the top
src/audio.js               sound
src/calibration.js         real-object calibration
src/sim.js, src/debug.js   synthetic test hand, debug overlay
docs/                      reference analysis, model comparison, development log
assets/                    hand model, audio, 3D models (see docs/model-comparison.md)
tools/serve.mjs            static server
```

## Testing without a camera

- `/?sim=1` runs a scripted synthetic hand through the whole sequence.
- `/?video=/path/to/clip.mp4` uses a video file instead of the webcam.
- Add `&manual=1` and drive frames from the console with `__app.advance(seconds)` (sim)
  or `await __app.play(from, to)` (video). This is how the build was checked.
- `&debug=1` starts with the overlay on, `&mute=1` starts silent, `&mirror=0` unmirrored.
