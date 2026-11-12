// Sound. Synthesised with the Web Audio API from measurements of the reference clips:
// the Spin carries a steady ~848 Hz tone, pulsed about 3.5 times a second, with weaker
// partials near 376 / 493 / 625 Hz; activation is a wide noise burst over a falling thump;
// the throw is a rising whoosh. If you add your own files (see assets/audio/README.md) they
// are used instead of the synthesised version for that event.
//
// Two sound banks:
//   synth  the above
//   sbr    sounds lifted from the Spin montage (videos/special): the real pulsed tone, isolated
//          from the mix (assets/audio/sbr/spin_loop.wav), the gold-comet roar with the music
//          removed (throw.wav), and the activation shimmer (activate.wav). The tone's measured
//          onset is kept: its 626 Hz partial sounds first, then the 848 Hz tone takes over.
//          From the best clips: the ball's hit in episode 1 (impact.wav) and the star-flash clink
//          of episode 3 (materialize.wav). Only the dissolve stays synthesised.
const SAMPLE_NAMES = ['activate', 'materialize', 'spin_loop', 'throw', 'impact'];

export class Sound {
  constructor() { this.ctx = null; this.muted = false; this.samples = {}; this.sbr = {}; this.bank = 'synth'; this.last = {}; this.spinOn = false; this.roar = null; }

  async init() {
    if (this.ctx) return;
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain(); this.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.pan = ctx.createStereoPanner(); this.pan.connect(this.master);

    // one second of white noise, reused everywhere
    const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;

    // --- continuous spin voice
    const g = this.spinGain = ctx.createGain(); g.gain.value = 0;
    const trem = this.trem = ctx.createGain(); trem.gain.value = 0.62;
    this.lfo = ctx.createOscillator(); this.lfo.frequency.value = 3.5;
    const lfoDepth = this.lfoDepth = ctx.createGain(); lfoDepth.gain.value = 0.38;
    this.lfo.connect(lfoDepth).connect(trem.gain); this.lfo.start();
    this.partials = [[848, 1], [625, 0.26], [493, 0.14], [376, 0.2], [1696, 0.07]].map(([f, a]) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = a * 0.16;
      o.connect(og).connect(trem); o.start();
      return { o, f };
    });
    // airy whirr: band-passed noise fluttering at the rotation rate
    const n = ctx.createBufferSource(); n.buffer = nb; n.loop = true;
    this.whirrBP = ctx.createBiquadFilter(); this.whirrBP.type = 'bandpass'; this.whirrBP.frequency.value = 2400; this.whirrBP.Q.value = 1.1;
    const flutter = ctx.createGain(); flutter.gain.value = 0.05;
    this.flutterLfo = ctx.createOscillator(); this.flutterLfo.frequency.value = 6;
    const fd = ctx.createGain(); fd.gain.value = 0.035;
    this.flutterLfo.connect(fd).connect(flutter.gain); this.flutterLfo.start();
    // the two banks' spin voices run side by side; setBank() crossfades between them
    this.synthBus = ctx.createGain(); this.synthBus.gain.value = this.bank === 'synth' ? 1 : 0;
    this.sbrBus = ctx.createGain(); this.sbrBus.gain.value = this.bank === 'sbr' ? 1 : 0;
    n.connect(this.whirrBP).connect(flutter).connect(this.synthBus); n.start();
    trem.connect(this.synthBus); this.synthBus.connect(g); this.sbrBus.connect(g); g.connect(this.pan);

    await this._loadSamples();
    await this._loadSbr();
  }

  async _loadSamples() {
    let manifest = {};
    try { const r = await fetch('/assets/audio/manifest.json'); if (r.ok) manifest = await r.json(); } catch { /* none provided */ }
    for (const name of SAMPLE_NAMES) {
      if (!manifest[name]) continue;
      try {
        const buf = await (await fetch(`/assets/audio/${manifest[name]}`)).arrayBuffer();
        this.samples[name] = await this.ctx.decodeAudioData(buf);
      } catch (e) { console.warn(`audio: could not load ${name}`, e); }
    }
    if (this.samples.spin_loop) {                       // replace the synthesised tone with the supplied loop
      const s = this.loopSrc = this.ctx.createBufferSource(); s.buffer = this.samples.spin_loop; s.loop = true;
      this.trem.disconnect(); this.lfoDepth.gain.value = 0;
      const lg = this.ctx.createGain(); lg.gain.value = 0.9; s.connect(lg).connect(this.spinGain); s.start();
    }
  }

  async _loadSbr() {
    for (const name of ['spin_loop', 'throw', 'activate', 'materialize', 'impact']) {
      try { this.sbr[name] = await this.ctx.decodeAudioData(await (await fetch(`/assets/audio/sbr/${name}.wav`)).arrayBuffer()); }
      catch (e) { console.warn(`audio: sbr ${name} missing`, e); }
    }
    if (this.sbr.spin_loop) {
      const s = this.sbrLoop = this.ctx.createBufferSource(); s.buffer = this.sbr.spin_loop; s.loop = true;
      const lg = this.ctx.createGain(); lg.gain.value = 1.15; s.connect(lg).connect(this.sbrBus); s.start();
    }
  }

  setBank(name) {
    this.bank = name === 'sbr' ? 'sbr' : 'synth';
    if (!this.ctx) return;
    const t = this.ctx.currentTime, sbr = this.bank === 'sbr';
    this.synthBus.gain.setTargetAtTime(sbr ? 0 : 1, t, 0.05); this.sbrBus.gain.setTargetAtTime(sbr ? 1 : 0, t, 0.05);
  }

  _play(buf, gain = 1, when = 0) {
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = gain; s.connect(g).connect(this.pan); s.start(this.ctx.currentTime + when);
    return { s, g };
  }

  setMuted(m) { this.muted = m; if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.03); }

  _cool(name, seconds) {                                // one-shot guard: never retrigger inside the cooldown
    const now = this.ctx.currentTime;
    if (now - (this.last[name] ?? -99) < seconds) return false;
    this.last[name] = now; return true;
  }

  _sample(name, gain = 1) {
    const b = this.samples[name]; if (!b) return false;
    const s = this.ctx.createBufferSource(); s.buffer = b;
    const g = this.ctx.createGain(); g.gain.value = gain; s.connect(g).connect(this.pan); s.start();
    return true;
  }

  _noise(t, dur, type, f0, f1, q, peak, attack = 0.01) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.pan); s.start(t); s.stop(t + dur + 0.05);
  }

  _sweep(t, dur, f0, f1, peak, type = 'sine', attack = 0.01) {
    const c = this.ctx, o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.pan); o.start(t); o.stop(t + dur + 0.05);
  }

  // Palm recognised: a quiet shimmer that climbs into the Spin tone over the materialisation.
  activate(duration = 1.2) {
    if (!this.ctx || !this._cool('activate', 0.8)) return;
    if (this._sample('activate', 0.8)) return;
    const t = this.ctx.currentTime;
    if (this.bank === 'sbr') {
      if (this.sbr.activate) this._play(this.sbr.activate, 0.9);
      // the tone's lower partial swells first; the spin loop (848 Hz) fades in under it as the ball forms
      const o = this.ctx.createOscillator(); o.frequency.value = 626;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + duration * 0.4); g.gain.setValueAtTime(0.07, t + duration * 0.55);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duration * 1.05);
      o.connect(g).connect(this.pan); o.start(t); o.stop(t + duration * 1.1);
      return;
    }
    this._sweep(t, duration, 424, 848, 0.05, 'sine', duration * 0.7);
    this._sweep(t, duration, 212, 424, 0.03, 'triangle', duration * 0.7);
    this._noise(t, duration, 'bandpass', 900, 5200, 2.5, 0.045, duration * 0.8);
  }

  // The ball arrives: thump + wide noise burst decaying over about a second.
  materialize() {
    if (!this.ctx || !this._cool('materialize', 0.8)) return;
    if (this._sample('materialize')) return;
    if (this.bank === 'sbr' && this.sbr.materialize) { this._play(this.sbr.materialize, 0.9); return; }   // the star-flash clink
    const t = this.ctx.currentTime;
    this._sweep(t, 0.16, 500, 50, 0.5);
    this._noise(t, 1.3, 'highpass', 600, 2500, 0.7, 0.16, 0.005);
    this._sweep(t, 1.4, 848, 848, 0.08, 'sine', 0.004);          // struck-metal ring into the sustained tone
    this._sweep(t, 0.9, 2262, 2262, 0.03, 'sine', 0.004);
  }

  // Continuous spin. level 0..1, rate in revolutions per second, pan -1..1, approach 0..1 (thrown, nearing the lens).
  spin(level, rate, pan = 0, approach = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, k = Math.max(0.2, rate / 5);
    const pitch = Math.pow(k, 0.32) * (1 + approach * 0.35);     // rises with spin, and Doppler-like on approach
    for (const p of this.partials) p.o.frequency.setTargetAtTime(p.f * pitch, t, 0.05);
    this.lfo.frequency.setTargetAtTime(3.5 * Math.pow(k, 0.6), t, 0.08);
    this.flutterLfo.frequency.setTargetAtTime(Math.min(40, rate * 1.2 + 1), t, 0.08);
    this.whirrBP.frequency.setTargetAtTime(2400 * Math.pow(k, 0.45), t, 0.08);
    if (this.loopSrc) this.loopSrc.playbackRate.setTargetAtTime(pitch, t, 0.05);
    if (this.sbrLoop) this.sbrLoop.playbackRate.setTargetAtTime(Math.pow(k, 0.08) * (1 + approach * 0.25), t, 0.05);
    this.spinGain.gain.setTargetAtTime(level * (0.55 + approach * 0.9), t, level > 0 ? 0.06 : 0.12);
    this.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.05);
  }

  // Release: sharp rising whoosh.
  throwBall(duration = 0.8) {
    if (!this.ctx || !this._cool('throw', 0.15)) return;
    if (this._sample('throw')) return;
    const t = this.ctx.currentTime;
    if (this.bank === 'sbr' && this.sbr.throw) {
      this._noise(t, 0.1, 'highpass', 3000, 6000, 0.7, 0.25, 0.003);           // snap of the release
      this._stopRoar(0.03);
      this.roar = this._play(this.sbr.throw, 1.0);                             // the comet roar, cut off at impact
      return;
    }
    this._noise(t, 0.12, 'highpass', 3000, 6000, 0.7, 0.3, 0.003);            // snap of the release
    this._noise(t, duration, 'bandpass', 700, 3200, 1.4, 0.3, duration * 0.75);
    for (const [f0, f1] of [[300, 1000], [380, 1300], [220, 760]]) this._sweep(t, duration * 0.6, f0, f1, 0.05, 'sawtooth', duration * 0.4);
  }

  _stopRoar(tau = 0.05) {
    if (!this.roar) return;
    const t = this.ctx.currentTime;
    this.roar.g.gain.setTargetAtTime(0, t, tau); this.roar.s.stop(t + tau * 8);
    this.roar = null;
  }

  // Ball reaches the lens.
  impact() {
    if (!this.ctx) return;
    this._stopRoar(0.04);
    if (!this._cool('impact', 0.5)) return;
    if (this._sample('impact')) return;
    if (this.bank === 'sbr' && this.sbr.impact) { this._play(this.sbr.impact, 1.0); return; }               // the episode 1 hit
    const t = this.ctx.currentTime;
    this._sweep(t, 0.6, 130, 32, 0.9, 'sine', 0.004);
    this._noise(t, 0.35, 'lowpass', 6000, 300, 0.7, 0.5, 0.002);
    this._noise(t + 0.02, 0.9, 'bandpass', 2500, 900, 0.8, 0.12, 0.01);
    for (const [f, a, d] of [[848, 0.1, 1.1], [1357, 0.05, 0.8], [2290, 0.035, 0.6]]) this._sweep(t, d, f, f * 0.985, a, 'sine', 0.003);
  }

  // Ball put away / lost.
  dissolve() {
    if (!this.ctx || !this._cool('dissolve', 0.5)) return;
    const t = this.ctx.currentTime;
    this._sweep(t, 0.45, 848, 380, 0.05);
    this._noise(t, 0.4, 'bandpass', 3000, 800, 2, 0.04, 0.02);
  }
}
