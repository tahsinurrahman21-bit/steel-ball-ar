# Third-party notices

Steel Ball AR uses the following third-party components. They are **not** covered by this
project's MIT licence; each keeps its own licence and copyright.

| Component | Used for | Licence | Where it comes from |
|---|---|---|---|
| [three.js](https://github.com/mrdoob/three.js) 0.170 | WebGL rendering | MIT, © 2010–2024 three.js authors | `npm install` (`node_modules/three`); bundled in the Windows download |
| [MediaPipe Tasks Vision](https://www.npmjs.com/package/@mediapipe/tasks-vision) 0.10.18 | Hand and face tracking runtime (JS + WebAssembly) | Apache License 2.0, © Google LLC | `npm install` (`node_modules/@mediapipe/tasks-vision`); bundled in the Windows download |
| [MediaPipe Hand Landmarker model](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker) (`assets/mediapipe/hand_landmarker.task`) | Hand landmarks | Apache License 2.0, © Google LLC | Unmodified copy of `storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task` |
| [MediaPipe Face Landmarker model](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) (`assets/mediapipe/face_landmarker.task`) | Head tracking for the hat | Apache License 2.0, © Google LLC | Unmodified copy of the official MediaPipe face landmarker model |
| [Node.js](https://nodejs.org/) runtime | Inside `SteelBallAR.exe` in the Windows download only | MIT and others, see [Node.js LICENSE](https://github.com/nodejs/node/blob/main/LICENSE) | Built by GitHub Actions from the official Node.js binary |

The Apache License 2.0 text is at <https://www.apache.org/licenses/LICENSE-2.0>.
The MIT licence text for three.js is in `node_modules/three/LICENSE`.

## Not included

- **Anime footage and sound.** The development reference clips (`videos/`) and the sounds
  cut from them (`assets/audio/sbr/`) are copyrighted by their owners. They are not in this
  repository or in any release.
- **Third-party 3D models.** `docs/model-comparison.md` links to fan-made Steel Ball models on
  Sketchfab, MakerWorld and Cults3D for reference only. None are included; check each model's
  own licence before using it.

## Trademarks and characters

*JoJo's Bizarre Adventure*, *Steel Ball Run*, Gyro Zeppeli and related names and designs
belong to Hirohiko Araki / LUCKY LAND COMMUNICATIONS / Shueisha and their licensees
(the anime is produced by David Production). Steel Ball AR is an unofficial, non-commercial
fan project and is not affiliated with or endorsed by any of them. The ball, hat and effects
are drawn procedurally in code.
