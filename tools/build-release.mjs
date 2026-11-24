// Assemble the self-contained release folder: dist/SteelBallAR-<version>-win-x64/
// Usage:  npm ci  &&  npm run build:release
//
// Copies only what the app loads at runtime (no videos, captures, test clips or
// anime audio). The GitHub Actions workflow then adds SteelBallAR.exe and zips it.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const name = process.argv[2] || "SteelBallAR-win-x64";
const out = join(root, 'dist', name);

const need = [
  'index.html',
  'src',
  'prototypes',
  'assets/mediapipe/hand_landmarker.task',
  'assets/mediapipe/face_landmarker.task',
  'assets/audio/README.md',
  'assets/audio/manifest.json',
  'node_modules/three/LICENSE',
  'node_modules/three/package.json',
  'node_modules/three/build/three.module.min.js',
  'node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js',
  'node_modules/@mediapipe/tasks-vision/package.json',
  'node_modules/@mediapipe/tasks-vision/vision_bundle.mjs',
  'node_modules/@mediapipe/tasks-vision/wasm',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
];

for (const p of need) {
  if (!existsSync(join(root, p))) {
    console.error(`Missing ${p}.${p.startsWith("node_modules") ? " Run \"npm ci\" first." : ""}`);
    process.exit(1);
  }
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const p of need) cpSync(join(root, p), join(out, p), { recursive: true });
mkdirSync(join(out, 'assets/audio/sbr'), { recursive: true });

writeFileSync(join(out, 'README.txt'), `Steel Ball AR ${version}
=======================

HOW TO PLAY (Windows 10/11)
1. Unzip this whole folder somewhere (for example your Desktop). Do not run it from inside the zip.
2. Double-click SteelBallAR.exe.
   - If Windows shows "Windows protected your PC", click "More info" then "Run anyway".
     (The exe is not code-signed; the source is public on GitHub.)
   - If Windows Firewall asks, you can click Cancel: the app only talks to your own computer.
3. Your browser opens at http://localhost:5173/. Use Chrome or Edge.
4. Click "Start camera" and allow camera access.
5. Hold an open palm toward the camera. Snap your hand toward the camera to throw.

Keep the black SteelBallAR window open while you play. Close it to stop.

Everything runs on your computer. No video is uploaded anywhere.

Full instructions and troubleshooting: see README.md on the GitHub page.
Licences: LICENSE (this project) and THIRD_PARTY_NOTICES.md (libraries and models).
Fan project. Not affiliated with Hirohiko Araki, Shueisha, David Production or Netflix.
`.replace(/\n/g, '\r\n'));

console.log(`Release folder ready: ${out}`);
