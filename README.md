<div align="center">

# 🌀 Steel Ball AR

**Perform Gyro Zeppeli's Steel Ball technique in front of your webcam.**
Show an open palm and a spinning Steel Ball materialises on it. Snap your hand toward the
camera and the ball flies at the lens.

### [▶ Play in your browser](https://tahsinurrahman21-bit.github.io/steel-ball-ar/) &nbsp;·&nbsp; [⬇ Download for Windows](../../releases/latest/download/SteelBallAR-win-x64.zip)

No account and no install. Runs entirely on your computer, and **no video ever leaves it**.

*Unofficial fan project. Not affiliated with Hirohiko Araki, Shueisha, David Production or Netflix.*

</div>

---

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Install and play](#install-and-play): browser, Windows download, or from source
- [How to perform it](#how-to-perform-it)
- [Controls](#controls)
- [Troubleshooting](#troubleshooting)
- [Limitations](#limitations)
- [For developers](#for-developers)
- [Privacy](#privacy)
- [Licence and credits](#licence-and-credits)

## Features

- **Real-time hand tracking** (MediaPipe) turned into a metric 3D hand with gesture detection:
  open palm, closed hand, throw.
- **A spinning Steel Ball drawn in WebGL** (three.js) with spin streaks, rings, glow, shadow, a comet tail and sparks.
- **Summon, spin and throw**: the ball condenses on your palm, spins while you hold it, and
  comes at the lens when you snap your hand forward.
- **Three ball looks** (*new*, *classic*, *SBR*-style) and **three render styles** (*hybrid*, *anime*, *metal*).
- **Two-hand mode**: a ball on each hand, plus a double throw.
- **Gyro's hat**, tracked to your head, with a fit panel for size, height, position and tilt.
- **Sound effects** built with the Web Audio API, or your own recordings.
- **Real-ball calibration**: hold a real ball to correct scale and placement.
- **Finger occlusion**, mirror mode, fill-screen mode and a full debug overlay.

## Requirements

| | Minimum |
|---|---|
| Computer | Windows 10 or 11 (the browser version also works on macOS, Linux and ChromeOS) |
| Browser | A recent **Google Chrome** or **Microsoft Edge** |
| Camera | Any webcam (built-in laptop cameras work) |
| Graphics | Any GPU that supports WebGL 2 (almost every computer from the last 8 years) |
| Space | A clear view of your hand and decent lighting |

Only option C (running from source) needs Node.js.

## Install and play

Pick **one** of these three options. A is the easiest.

### Option A: Play in your browser (no install)

1. Open **[tahsinurrahman21-bit.github.io/steel-ball-ar](https://tahsinurrahman21-bit.github.io/steel-ball-ar/)** in Chrome or Edge.
2. Click **Start camera**.
3. When the browser asks *"Use your camera?"*, click **Allow**.

The first load downloads about 20 MB (the tracking models). After that it starts quickly.

### Option B: Windows download (works offline)

1. Click **[Download for Windows](../../releases/latest/download/SteelBallAR-win-x64.zip)**.
   You can also open the [Releases page](../../releases/latest) and click `SteelBallAR-win-x64.zip`.
2. Open your **Downloads** folder, right-click `SteelBallAR-win-x64.zip` and choose **Extract All…**,
   then **Extract**.
   > Don't run it from inside the zip. Windows needs the files extracted first.
3. Open the extracted `SteelBallAR-win-x64` folder and double-click **`SteelBallAR.exe`**.
4. If a blue box says **"Windows protected your PC"**, click **More info**, then **Run anyway**.
   This appears because the program isn't code-signed. The program is built by GitHub
   from this repository's public source code (see [`.github/workflows/release.yml`](.github/workflows/release.yml)).
5. If **Windows Firewall** asks about network access, you can click **Cancel**. The app only
   talks to your own computer.
6. Your browser opens at `http://localhost:5173/`. Click **Start camera**, then **Allow**.

Keep the small black **SteelBallAR** window open while you play. Close it to stop.
To uninstall, delete the folder. Nothing else is installed on your computer.

### Option C: Run from the source code

Use this option if you want to change the code.

1. Install **Node.js LTS** from <https://nodejs.org/>. Run the installer and keep clicking
   **Next** with the default settings.
2. On this page, click the green **Code** button, then **Download ZIP**. Extract it.
   *(If you use Git: `git clone https://github.com/tahsinurrahman21-bit/steel-ball-ar.git`.)*
3. Open the extracted folder and double-click **`start.bat`**.
   The first run downloads the libraries (about 50 MB), then your browser opens.

On macOS or Linux, or if you prefer a terminal:

```bash
npm install
npm start
```

Then open <http://localhost:5173/>. The camera only works on `localhost` or over `https`, so
opening `index.html` directly as a file will **not** work.

## How to perform it

1. Hold an **open palm** toward the camera for a moment. The ball condenses on it.
2. Keep the palm open and the ball stays and spins. **Close your hand** to put it away.
3. **Throw**: snap your hand toward the camera. The ball leaves your hand and comes at the lens.
4. Open your palm again for another ball.

Tips: sit 40–80 cm from the camera, keep your whole hand in frame and face a light source.

## Controls

Every control has a keyboard shortcut and a button on the bar at the bottom of the screen.

| Key | Button | What it does |
|---|---|---|
| `D` | Debug | Landmarks, skeleton, palm axes, gesture and timing readouts |
| `S` | Style | Cycles hybrid → anime → metal |
| `2` | Two hands | A ball on each hand, each summoned and thrown on its own. Snap both hands forward together for a double throw |
| `L` | Look | Cycles the ball: new → classic → SBR |
| `V` | Sound | Switches the sound bank: synth ↔ SBR (the SBR bank needs your own sound files, see [Sounds](#sounds)) |
| `G` | Hat | Gyro's hat on your head (loads a face-tracking model the first time). A **Hat fit** panel lets you adjust size, height, forward/back and tilt; the fit is saved |
| `C` | Calibrate | Real-object calibration panel |
| `M` | Mirror | Selfie mirroring on/off |
| `O` | Finger occlusion | Fingers in front of the ball hide it |
| `N` | Mute | Sound on/off |
| `F` | Fill | Fill the window (crops the edges) |
| `H` | – | Swap left/right hand. Use it if the ball appears *behind* your hand |
| `P` | – | Show the finger stand-ins used for occlusion |

**Styles.** *Metal* is a physical render: deep green reflective metal with real rotational
blur. *Anime* is cel shaded with pale lime, zigzag spin streaks and a wobbling outline.
*Hybrid* (the default) sits between them.

**Looks.** *SBR* imitates the anime's Spin scenes: flat pale lime, brush-stroke spin streaks,
white rings with lavender edges and, on a throw, a pinwheel swirl, gold aura, flame tail and
star sparks. *New* is solid and mirror-like with an ink outline. *Classic* is the first
version, with glassier reflections. Your style, look and settings are remembered between visits.

### Calibration with a real ball (optional)

Press `C`, hold any ball in your open palm facing the camera, pick its size and press
**Capture** once the yellow ring sits on the ball. This corrects the scale of your hand, so
distances and throw speeds are true. It also moves the virtual ball to where a real ball sits
in your palm and can match its size. **Reset** clears it. The ball's colour must differ from
your skin and from the background.

### Sounds

- **synth** (the default): sound effects generated live in the browser.
- **Your own recordings**: drop audio files into `assets/audio/` and list them in
  `assets/audio/manifest.json`. See [`assets/audio/README.md`](assets/audio/README.md).
- **SBR bank**: plays `spin_loop.wav`, `throw.wav`, `activate.wav`, `materialize.wav`
  and `impact.wav` from `assets/audio/sbr/`. **These files are not included**, because sounds
  taken from the anime are copyrighted. If the folder is empty, the SBR bank is silent and
  the synth bank works as normal.

## Troubleshooting

| Problem | Fix |
|---|---|
| **"Camera blocked" / nothing happens after Start camera** | Click the camera icon in the address bar, choose **Allow**, and reload. In Windows: **Settings → Privacy & security → Camera**, turn on *Camera access* and *Let desktop apps access your camera* |
| **Camera is in use** | Close Zoom, Teams, Discord, OBS or any other app using the webcam, then reload |
| **Page is blank or says the browser isn't supported** | Use an up-to-date Chrome or Edge. Check WebGL at <https://get.webgl.org/> |
| **"Windows protected your PC"** | Click **More info → Run anyway** (see Option B) |
| **SteelBallAR.exe closes immediately / "Cannot find the app files"** | You ran it from inside the zip or moved it out of its folder. Extract the whole zip and run the exe inside the extracted folder |
| **Browser didn't open by itself** | Open <http://localhost:5173/> yourself. The black window shows the exact address (it uses 5174, 5175 … if 5173 is busy) |
| **Antivirus quarantined SteelBallAR.exe** | Unsigned programs sometimes get flagged. Restore it, or use Option A (browser) instead |
| **Nothing appears on an open palm** | Press `D`. *open palm* and *facing cam* must both read YES. If *facing cam* is no while your palm faces the lens, press `H`. Improve lighting and keep your whole hand in view |
| **Ball sits behind the hand** | Press `H` |
| **Throw doesn't trigger** | Snap faster and more directly toward the lens. With `D` on, compare the *speed* and *toward cam* peaks with the thresholds on the last line |
| **Throw triggers by accident** | Move more slowly, or raise `throwSpeed` / `throwToward` in `src/tracking.js` |
| **Ball too big or small** | Calibrate with a real ball (`C`) and tick *same size*, or change `radiusFactor` in `src/experience.js` |
| **Low frame rate** | Close other camera or GPU-heavy apps, plug in your laptop, and turn off two-hand mode and the hat. The debug panel shows render fps, camera fps and detection time |
| **`start.bat` says Node.js is not installed** | Install Node.js LTS from <https://nodejs.org/>, then **restart** your computer or open a new window, and try again. Or use Option A or B |
| **`npm install` fails** | Check your internet connection and run `start.bat` again |

## Limitations

- **Chrome and Edge only.** Firefox and Safari may work but aren't tested.
- **One webcam, one person.** Tracking works best with a plain background, good front lighting
  and the hand 40–80 cm from the camera. Fast motion blur, gloves or very dark scenes reduce accuracy.
- **Not a 3D scan.** Depth is estimated from a single camera, so the ball can briefly appear
  in front of or behind fingers incorrectly.
- **Performance depends on your GPU.** Integrated graphics on older laptops may run below 30 fps.
- **The Windows exe is unsigned**, so SmartScreen and some antivirus programs warn about it.
- **The Windows download is Windows-only.** On macOS or Linux, use the browser version or run from source.
- **The SBR sound bank ships empty** (see [Sounds](#sounds)).
- Settings are stored in the browser (`localStorage`). Clearing site data resets them.

## For developers

### Project layout

```
index.html                 the experience
prototypes/                A: hand tracking only · C: ball lab (every style and spin speed, no camera)
src/tracking.js            landmarks -> metric 3D hand, filters, gestures
src/source.js              webcam / test video / synthetic hand -> frames
src/ball.js                ball shader, rings, shadow, tail, sparks, finger stand-ins
src/ball-classic.js        the "classic" look
src/ball-sbr.js            the "SBR" look
src/stage.js               renderer, camera grade, lens effects
src/experience.js          state machine and choreography; tuning values at the top
src/audio.js               sound
src/calibration.js         real-object calibration
src/hat.js                 Gyro's hat and the head tracking it rides on
src/sim.js, src/debug.js   synthetic test hand, debug overlay
docs/                      reference analysis, model comparison, development log
assets/mediapipe/          hand and face landmarker models (Apache 2.0, Google)
assets/audio/              optional user sounds (manifest.json)
tools/serve.mjs            development server (npm start)
tools/launcher.cjs         end-user launcher; becomes SteelBallAR.exe
tools/build-release.mjs    assembles the release folder
tools/build-pages.mjs      adapts that folder for GitHub Pages
tools/extract_sbr_audio.py developer DSP tool (needs Python, numpy, scipy, ffmpeg)
start.bat                  one-click start from source on Windows
```

### Testing without a camera

- `/?sim=1` runs a scripted synthetic hand through the whole sequence.
- `/?video=/path/to/clip.mp4` uses a video file instead of the webcam.
- Add `&manual=1` and drive frames from the console with `__app.advance(seconds)` (sim)
  or `await __app.play(from, to)` (video).
- `&hands=2` starts in two-hand mode. With `?sim=1`, a second mirrored test hand joins
  1.6 s behind the first, and `&simoffset=0.1` makes it a double throw.
- `&debug=1` starts with the overlay on, `&mute=1` starts silent, `&mirror=0` unmirrored.

### Recording a demo

`node tools/serve.mjs 5174 --captures` lets pages post rendered frames to `captures/`.
That folder is git-ignored because it contains your face.

### Making a release

The Windows download and the website are built automatically by GitHub Actions:

- **Website**: every push to `main` runs [`pages.yml`](.github/workflows/pages.yml). One-time
  setup: **Settings → Pages → Source: GitHub Actions**.
- **Windows download**: push a tag that starts with `v` (for example `v0.1.0`) and
  [`release.yml`](.github/workflows/release.yml) builds `SteelBallAR.exe` (a Node.js single executable),
  zips it with the app, smoke-tests it and attaches `SteelBallAR-win-x64.zip` to a new GitHub Release.
  In GitHub Desktop: **History** → right-click the latest commit → **Create Tag…** → `v0.1.0`
  → **Push origin**. Edit [`RELEASE_NOTES.md`](RELEASE_NOTES.md) first.

To build the release folder locally: `npm ci && npm run build:release` → `dist/SteelBallAR-win-x64/`.

## Privacy

Everything runs locally in your browser. Camera frames are processed on your computer and
never uploaded, stored or sent anywhere. The app has no analytics, accounts or tracking.
The only network requests load the app's own files (from GitHub Pages, or from your own
computer with the Windows download).

## Licence and credits

- **Code**: [MIT](LICENSE) © Steel Ball AR contributors. This covers the original code and
  docs in this repository only.
- **Third-party libraries and models**: [three.js](https://threejs.org/) (MIT) and
  [MediaPipe](https://ai.google.dev/edge/mediapipe) Tasks Vision with its hand and face
  landmarker models (Apache 2.0, Google). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- ***JoJo's Bizarre Adventure: Steel Ball Run*** and Gyro Zeppeli are © Hirohiko Araki /
  LUCKY LAND COMMUNICATIONS / Shueisha. This is an unofficial, non-commercial fan tribute.
  No footage, artwork or audio from the series is included; the ball, hat and effects are drawn in code.
