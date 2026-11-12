// The performance: idle -> summon -> ready -> throw -> impact -> idle.
// Turns the hand state into a ball pose, effect levels and sound cues every frame.
import * as THREE from 'three';

export const TUNE = {
  radiusFactor: 0.62,   // ball radius as a fraction of palm width (index knuckle to pinky knuckle)
  lift: 0.17,           // palm skin above the landmark plane, in palm widths
  anchor: [0, 0],       // offset of the resting point across the palm (side, up), in palm widths
  idleRev: 5,           // revolutions per second while resting
  throwRev: 22,
  shutter: 1 / 50,      // simulated exposure for rotational blur, seconds
  summonTime: 1.5,
  dwell: 0.22,          // seconds the open palm must hold before the ball starts to appear
  style: 'hybrid',      // 'metal' | 'hybrid' | 'anime'
  look: 'new',          // 'new' | 'classic' (the first version of the ball shader)
};
export const STYLES = { metal: { toon: 0, streak: 0, wobble: 0 }, hybrid: { toon: 0.45, streak: 0.8, wobble: 0.02 }, anime: { toon: 1, streak: 1, wobble: 0.045 } };

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const backOut = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

// Which ball gets the screen when two are active: the one doing the most.
// Two throws this close together (seconds) count as one double throw.
export const DOUBLE_WINDOW = 0.3;

export const STATE_RANK = { idle: 0, dissolve: 1, ready: 2, summon: 3, throw: 4, impact: 5 };

export class Experience {
  constructor(stage, ball, sound) {
    this.stage = stage; this.ball = ball; this.sound = sound;
    this.state = 'idle'; this.t = 0; this.dwell = 0; this.cooldown = 0;
    this.fx = { grade: 0, bloom: 0, gold: 0, halo: 0, rings: 0, streak: 0, glow: 0, blur: 0, lines: 0, ca: 0, shadow: 0, bounce: 0, ringAmt: 0, vig: 0 };
    this.imp = { flash: 0, flare: 0, ca: 0, shake: 0, shock: 9, shockAmt: 0 };
    this.appear = 0; this.scale = 1; this.omega = 0; this.ringScale = 1;
    this.anchor = new THREE.Vector3(0, 0, -0.5); this.radius = 0.035; this.palm = null;
    this.axis = new THREE.Vector3(0, 1, 0);
    this.pos = new THREE.Vector3(0, 0, -0.5);
    this.p0 = new THREE.Vector3(); this.pT = new THREE.Vector3(); this.tailFrom = new THREE.Vector3(); this.flightDir = new THREE.Vector3();
    this.T = 0.8; this.closedFor = 0; this.lostFor = 0; this.recentSpeed = 0; this.recentVel = [0, 0, 0];
    this.fired = {}; this.occlusion = true; this.throws = 0;
    // With two balls, only the 'lead' one drives the screen-wide effects; the other lights its own hand.
    // Each ball reports its spin sound here and the app mixes them into one voice.
    this.lead = true; this.spinOut = { level: 0, rate: 0, pan: 0, approach: 0 };
    // Double throw: the other hand's ball, and whether both were thrown together
    this.partner = null; this.double = false; this.launchedAt = -1e9; this.now = 0; this.sx = 0.5; this.sy = 0.5;
    this.aim = new THREE.Vector3(); this.aimTarget = new THREE.Vector3(); this._aimed = new THREE.Vector3();
    this._s = new THREE.Vector3(); this._v = new THREE.Vector3();
  }

  _enter(state) { this.state = state; this.t = 0; this.fired = {}; if (state === 'idle') this.double = false; }

  launch(vel) {
    this._enter('throw'); this.throws++;
    const speed = Math.hypot(vel[0], vel[1], vel[2]);
    this.T = clamp(0.66 - 0.06 * (speed - 1.5), 0.5, 0.66);
    this.p0.copy(this.pos);
    this.pT.set(this.p0.x * 0.08, this.p0.y * 0.08 - 0.004, -0.072);        // straight at the lens
    this.flightDir.copy(this.pT).sub(this.p0).normalize();
    this.spinDir = this.flightDir.clone().add(new THREE.Vector3(0.25, 0.55, 0)).normalize();   // rifling, tipped so the swirl sits off-centre
    this.aim.set(0, 0, 0); this.aimTarget.set(0, 0, 0); this.double = false;
    const p = this.partner;
    if (p && p.state === 'throw' && this.now - p.launchedAt < DOUBLE_WINDOW) {
      // both hands threw together: arrive at the lens at the same moment, either side of centre
      this.double = p.double = true;
      this.T = Math.max(0.35, p.T - p.t);
      const side = Math.sign(this.p0.x - p.p0.x) || 1;
      this.aimTarget.set(side * 0.03, 0.005, 0); p.aimTarget.set(-side * 0.03, -0.005, 0);
    }
    this.launchedAt = this.now;
    this.ball.spawn(1, 26, this.p0, this.radius);
    this.imp.flare = 1; this.imp.ca = 0.005;
    this.sound.throwBall(this.T);
  }

  // hand: latest tracker state (may be stale between camera frames), dt/time in seconds.
  update(hand, dt, time) {
    this.now = time;
    const present = !!hand?.present;
    this.lostFor = present ? 0 : this.lostFor + dt;
    const S = STYLES[TUNE.style], fx = this.fx, T = {};
    for (const k in fx) T[k] = 0;

    if (present) {
      const w = hand.palm.width, pc = hand.palm.center, n = hand.palm.normal, up = hand.palm.up, side = hand.palm.side;
      this.radius = TUNE.radiusFactor * w;
      const lift = TUNE.lift * w;
      for (let k = 0; k < 3; k++) this._v.setComponent(k, pc[k] + side[k] * TUNE.anchor[0] * w + up[k] * TUNE.anchor[1] * w + n[k] * (lift + this.radius * 1.03));
      this.anchor.copy(this._v);
      this.anchor.y += Math.sin(time * Math.PI * 2 * 3.5) * this.radius * 0.018;       // faint hover, in step with the sound's pulse
      this.palm = { center: pc, normal: n, lift };
      this.closedFor = hand.isOpen ? 0 : this.closedFor + dt;
      this.recentSpeed = Math.max(this.recentSpeed * Math.exp(-dt / 0.15), Math.max(hand.speed / 1.5, hand.toward / 0.85));
      this.recentVel = hand.vel;
      this.ball.updateHand(hand.pts, w);
    }
    this.ball.setOcclusion(this.occlusion && present && this.state !== 'throw', this.showProxy);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.t += dt;
    const idle = TUNE.idleRev * Math.PI * 2;
    let follow = false, tail = 0, approach = 0, level = 0;

    switch (this.state) {
      case 'idle': {
        this.appear = 0; this.omega = 0;
        this.dwell = present && hand.summonPose && this.cooldown <= 0 ? this.dwell + dt : 0;
        T.bloom = clamp(this.dwell / TUNE.dwell, 0, 1) * 0.15;
        if (present) this.pos.copy(this.anchor);
        if (this.dwell >= TUNE.dwell) { this.dwell = 0; this._enter('summon'); this.sound.activate(TUNE.summonTime * 0.8); this.axis.set(0, 1, 0); }
        break;
      }
      case 'summon': {
        const u = this.t / TUNE.summonTime; follow = true;
        this.appear = sm(0.1, 0.78, u);
        this.scale = 0.55 + 0.45 * backOut(sm(0.08, 0.8, u));
        this.omega = idle * Math.pow(sm(0.28, 1, u), 2);
        const bell = Math.sin(Math.PI * Math.min(1, u * 1.08));
        T.streak = S.streak * sm(0.6, 1, u); T.rings = sm(0.72, 1, u); T.halo = 0.2 + bell * 0.5; T.bloom = 0.25 + bell * 0.4;
        T.grade = 0.25 + bell * 0.6; T.ringAmt = sm(0, 0.2, u) * (1 - sm(0.8, 1, u)); T.shadow = 0.5 * this.appear; T.bounce = 0.4 + bell * 0.5;
        T.gold = bell * 0.45;
        if (this.lead) this.stage.bgU.uRingPhase.value = 1 - ((this.t * 1.15) % 1);                    // rings close in on the palm
        if (u < 0.7 && Math.random() < dt * 55) this.ball.spawn(0, 1, this.anchor, this.radius);
        if (u >= 0.78 && !this.fired.arrive) {
          this.fired.arrive = true; this.imp.flare = 0.9; this.imp.ca = 0.004; this.imp.flash = 0.12;
          this.ball.spawn(1, 12, this.anchor, this.radius * 0.6); this.sound.materialize();
        }
        level = sm(0.3, 1, u);
        if (this.lostFor > 0.4 || this.closedFor > 0.35) { this._enter('dissolve'); this.sound.dissolve(); }
        else if (u >= 1) this._enter('ready');
        break;
      }
      case 'ready': {
        follow = true; this.appear = 1; this.scale = 1; level = 1;
        const drift = 1 + 0.08 * Math.sin(time * 0.7) + 0.05 * Math.sin(time * 1.9 + 1);
        const target = idle * drift + (present ? hand.speed * 2 * Math.PI * 2 : 0);
        this.omega += (target - this.omega) * (1 - Math.exp(-dt / 0.25));
        const pulse = 0.5 + 0.5 * Math.sin(time * Math.PI * 2 * 3.5);
        T.streak = S.streak; T.rings = 0.9; T.halo = 0.26 + 0.07 * pulse; T.bloom = 0.3 + 0.07 * pulse; T.grade = 0.22;
        T.shadow = 0.55; T.bounce = 0.5; T.glow = clamp(this.recentSpeed - 0.35, 0, 1) * 0.5; T.gold = T.glow;
        const windUp = this.recentSpeed > 0.7;
        if (this.t > 0.35 && ((present && hand.throwing) || (!present && this.lostFor > 0.05 && windUp))) this.launch(this.recentVel);
        else if (this.lostFor > 0.45 || this.closedFor > 0.5) { this._enter('dissolve'); this.sound.dissolve(); }
        break;
      }
      case 'throw': {
        const u = Math.min(1, this.t / this.T), s = Math.pow(u, 1.15);
        this.aim.lerp(this.aimTarget, 1 - Math.exp(-dt / 0.08));
        const target = this._aimed.copy(this.pT).add(this.aim);
        this.pos.lerpVectors(this.p0, target, s);
        this.pos.y += Math.sin(Math.PI * s) * 0.028;                                    // slight rise
        this.tailFrom.lerpVectors(this.p0, target, Math.max(0, s - 0.42));
        this.omega += (TUNE.throwRev * Math.PI * 2 - this.omega) * (1 - Math.exp(-dt / 0.1));
        this.axis.lerp(this.spinDir, 1 - Math.exp(-dt / 0.12)).normalize();
        this.appear = 1; this.scale = 1; level = 1; approach = u; tail = sm(0.02, 0.2, u);
        T.streak = S.streak; T.rings = 1; T.glow = sm(0, 0.3, u) * 0.85; T.gold = 1; T.halo = 0.5 + 0.5 * u;
        T.bloom = 0.5; T.grade = 0.65; T.blur = 0.7 * u * u; T.lines = sm(0.08, 0.45, u); T.ca = 0.007 * u; T.vig = 0.5 * u;
        this.ringScale = 1 + 0.5 * u;
        if (u >= 1) {
          this._enter('impact'); this.sound.impact();
          this.imp.flash = 1; this.imp.shock = 0; this.imp.shockAmt = 1; this.imp.shake = this.double ? 1.5 : 1; this.imp.ca = this.double ? 0.016 : 0.012;
          this.pos.set(0, 0, -0.3); this.ball.spawn(1, 40, this.pos, 0.03);
        }
        break;
      }
      case 'impact': {
        this.appear = 0; this.omega = 0; this.ringScale = 1;
        T.lines = this.t < 0.12 ? 0.6 : 0; T.grade = 0.3 * (1 - sm(0, 0.8, this.t)); T.gold = 1;
        if (this.t > 0.95) { this._enter('idle'); this.cooldown = 0.35; this.dwell = 0; this.recentSpeed = 0; }
        break;
      }
      case 'dissolve': {
        follow = present;
        this.appear = Math.max(0, this.appear - dt / 0.35); this.omega *= Math.exp(-dt / 0.2);
        T.halo = 0.4 * this.appear; T.streak = S.streak * this.appear;
        if (this.appear <= 0) { this._enter('idle'); this.cooldown = 0.3; }
        break;
      }
    }

    if (follow && present) {
      this.pos.copy(this.anchor);
      // spin axis: mostly upright, leaning toward the palm normal, with a slow precession
      const n = hand.palm.normal;
      this._v.set(n[0] * 0.38 + 0.07 * Math.sin(time * 1.1), 1 + n[1] * 0.38, n[2] * 0.38 + 0.07 * Math.cos(time * 0.9)).normalize();
      this.axis.lerp(this._v, 1 - Math.exp(-dt / 0.2)).normalize();
      this.ringScale = 1;
    }

    // ease effect levels toward their targets; impulses decay on their own
    const k = 1 - Math.exp(-dt / 0.07);
    for (const key in fx) fx[key] += (T[key] - fx[key]) * k;
    const imp = this.imp;
    imp.flash *= Math.exp(-dt / 0.14); imp.flare *= Math.exp(-dt / 0.16); imp.ca *= Math.exp(-dt / 0.2); imp.shake *= Math.exp(-dt / 0.13);
    imp.shock += dt * 1.9; imp.shockAmt *= Math.exp(-dt / 0.3);

    const visible = this.appear > 0.001;
    this.ball.update({
      center: this.pos, radius: this.radius, scale: this.scale, axis: this.axis, omega: this.omega, shutter: TUNE.shutter, dt, time,
      appear: this.appear, streak: fx.streak * sm(TUNE.idleRev * 2, TUNE.idleRev * 5.5, this.omega) * (visible ? 1 : 0), toon: S.toon, glow: fx.glow,
      rings: visible ? fx.rings * this.appear : 0, ringScale: this.ringScale, halo: fx.halo, gold: fx.gold,
      palm: follow && present ? this.palm : null, shadow: fx.shadow, bounce: fx.bounce,
      tail, tailFrom: this.tailFrom, flare: imp.flare, wobble: S.wobble * sm(0, idle, this.omega),
    });
    const L = this.stage.light, bu = this.ball.u;
    bu.uLightDir.value.copy(L.dir); bu.uLightCol.value.copy(L.col); bu.uExposure.value = L.exposure;

    // screen-space anchors for the 2D passes
    const sc = this.stage.toScreen(this.pos, this._s);
    const cx = clamp(sc.x, -0.2, 1.2), cy = clamp(sc.y, -0.2, 1.2);
    bu.uScreen.value.set(cx, cy);
    this.sx = cx; this.sy = cy;
    const bg = this.stage.bgU, po = this.stage.postU;
    const so = this.spinOut;
    so.level = level * this.appear; so.rate = this.omega / (Math.PI * 2); so.pan = (cx - 0.5) * 1.5; so.approach = approach;
    if (!this.lead) { bg.uPalm2.value.set(cx, cy); bg.uBloom2.value = Math.max(bg.uBloom2.value, fx.bloom); return; }
    if (this.state !== 'impact') { bg.uPalm.value.set(cx, cy); po.uCenter.value.set(cx, cy); }
    else { po.uCenter.value.lerp(new THREE.Vector2(0.5, 0.5), 0.3); }
    bg.uGrade.value = fx.grade; bg.uBloom.value = fx.bloom; bg.uGold.value = fx.gold; bg.uRingAmt.value = fx.ringAmt;
    po.uCA.value = fx.ca + imp.ca; po.uBlur.value = fx.blur; po.uLines.value = fx.lines; po.uVig.value = fx.vig;
    po.uLinesInner.value = 0.16 + 0.5 * fx.blur;
    po.uFlash.value = Math.min(1, imp.flash); po.uShock.value = imp.shock; po.uShockAmt.value = imp.shockAmt; po.uTime.value = time;
    po.uShake.value.set((Math.random() - 0.5) * 0.03 * imp.shake, (Math.random() - 0.5) * 0.03 * imp.shake);
  }
}
