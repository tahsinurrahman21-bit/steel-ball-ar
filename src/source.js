// Frame source: webcam, a video file (?video=path) or the synthetic hand (?sim=1).
// Every new frame is copied into `frame` (a canvas). Detection and rendering both read that
// same canvas, so the pixels on screen always match the landmarks drawn over them.
import { createFaceLandmarker, createLandmarker } from './tracking.js';
import { SimHand } from './sim.js';

export class FrameSource {
  constructor() {
    this.frame = document.createElement('canvas');
    this.ctx = this.frame.getContext('2d', { alpha: false, desynchronized: true });
    this.kind = 'camera'; this.video = null; this.sim = null; this.landmarker = null; this.delegate = '-';
    this.detectMs = 0; this.frameCount = 0; this.fps = 0; this._fpsT = 0; this._fpsN = 0;
    this.onFrame = null; this._lastTs = -1; this._running = false;
    this.faceOn = false; this.faceLandmarker = null; this._faceLoading = null;
  }

  get width() { return this.frame.width; }
  get height() { return this.frame.height; }
  get aspect() { return this.frame.width / this.frame.height; }

  async start({ sim = false, videoUrl = null, deviceId = null, manual = false } = {}) {
    if (sim) {
      this.kind = 'sim'; this.sim = new SimHand(1280, 720);
      this.frame.width = 1280; this.frame.height = 720;
      if (manual) return;                       // frames are stepped by hand (tests)
    } else {
      const v = document.createElement('video');
      v.playsInline = true; v.muted = true;
      if (videoUrl) {
        this.kind = 'video'; v.src = videoUrl; v.loop = true; v.crossOrigin = 'anonymous';
      } else {
        this.kind = 'camera';
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('This browser cannot open a camera here. Use http://localhost or https.'), { name: 'Insecure' });
        v.srcObject = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60, min: 24 }, facingMode: 'user' },
        });
      }
      await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('Could not load the video source.')); });
      await v.play();
      this.video = v;
      this.frame.width = v.videoWidth; this.frame.height = v.videoHeight;
      const lm = await createLandmarker();
      this.landmarker = lm.landmarker; this.delegate = lm.delegate;
      if (manual) { v.pause(); return; }
    }
    this._running = true;
    this._schedule();
  }

  // Head tracking is only needed for the hat, so its model loads the first time it is switched on.
  async enableFace(on) {
    this.faceOn = on;
    if (on && this.kind !== 'sim' && !this.faceLandmarker) {
      this._faceLoading ??= createFaceLandmarker().then((f) => { this.faceLandmarker = f; });
      await this._faceLoading;
    }
  }

  stop() {
    this._running = false;
    this.video?.srcObject?.getTracks().forEach((t) => t.stop());
  }

  _schedule() {
    if (!this._running) return;
    if (this.video?.requestVideoFrameCallback) this.video.requestVideoFrameCallback(() => { this._tick(); this._schedule(); });
    else requestAnimationFrame(() => { this._tick(); this._schedule(); });
  }

  _tick(manualTime) {
    const now = manualTime !== undefined ? manualTime * 1000 : performance.now();
    let result, face = null;
    if (this.kind === 'sim') {
      result = this.sim.step(now / 1000);
      if (this.faceOn) face = this.sim.face();
      this.ctx.drawImage(this.sim.canvas, 0, 0);
    } else {
      const v = this.video;
      if (v.readyState < 2) return;
      if (!v.requestVideoFrameCallback && v.currentTime === this._lastTs) return;   // no new frame yet
      this._lastTs = v.currentTime;
      if (this.frame.width !== v.videoWidth) { this.frame.width = v.videoWidth; this.frame.height = v.videoHeight; }
      this.ctx.drawImage(v, 0, 0);
      const t0 = performance.now();
      try { result = this.landmarker.detectForVideo(this.frame, now); } catch (e) { console.warn('detect failed', e); result = null; }
      if (this.faceOn && this.faceLandmarker) { try { face = this.faceLandmarker.detectForVideo(this.frame, now); } catch (e) { console.warn('face detect failed', e); } }
      this.detectMs += (performance.now() - t0 - this.detectMs) * 0.1;
    }
    this.frameCount++; this._fpsN++;
    if (now - this._fpsT > 500) { this.fps = (this._fpsN * 1000) / (now - this._fpsT); this._fpsT = now; this._fpsN = 0; }
    this.onFrame?.(result, now / 1000, face);
  }
}

export function describeCameraError(e) {
  switch (e?.name) {
    case 'NotAllowedError': case 'SecurityError':
      return 'Camera permission was denied. Allow camera access for this page in the address bar, then reload.';
    case 'NotFoundError': case 'OverconstrainedError':
      return 'No camera was found. Plug one in (or close the app that is using it) and reload.';
    case 'NotReadableError': case 'AbortError':
      return 'The camera is busy. Close other apps that use it (Teams, Zoom, OBS) and reload.';
    default: return e?.message || String(e);
  }
}
