/** Synthesized SFX via WebAudio — no asset files, everything generated. */

export type FireVoice = "standard" | "heavy" | "energy" | "launch";

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;

  /** Must be called from a user gesture to satisfy autoplay policy. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;

    // Compressor keeps a wall of simultaneous detonations from clipping.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 22;
    comp.ratio.value = 7;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    this.comp = comp;

    const master = ctx.createGain();
    master.gain.value = 0.55;
    this.master = master;

    comp.connect(master).connect(ctx.destination);

    // Two seconds of reusable noise — avoids reallocating per explosion.
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;

    this.startAmbience();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }

  /** Faint wind bed + distant rumble so silence never feels dead. */
  private startAmbience(): void {
    const ctx = this.ctx!;
    if (!this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 320;
    lp.Q.value = 0.6;

    const gain = ctx.createGain();
    gain.gain.value = 0.05;

    // Slow LFO makes the wind swell rather than sit flat.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain).connect(gain.gain);
    lfo.start();

    src.connect(lp).connect(gain).connect(this.comp!);
    src.start();
  }

  private noiseSource(): AudioBufferSourceNode | null {
    if (!this.ctx || !this.noise) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    return src;
  }

  fire(voice: FireVoice = "standard"): void {
    if (!this.ctx || !this.comp) return;
    const ctx = this.ctx, t = ctx.currentTime;

    if (voice === "energy") {
      // Rising capacitor whine into a snap.
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(420, t);
      osc.frequency.exponentialRampToValueAtTime(2600, t + 0.13);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.11);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1800;
      bp.Q.value = 3;
      osc.connect(bp).connect(g).connect(this.comp);
      osc.start(t); osc.stop(t + 0.3);
      this.blip(3200, 0.05, "square", 0.16, 0.1);
      return;
    }

    if (voice === "launch") {
      // Rocket motor: filtered noise ramping up.
      const src = this.noiseSource();
      if (src) {
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.setValueAtTime(600, t);
        bp.frequency.exponentialRampToValueAtTime(2200, t + 0.5);
        bp.Q.value = 1.4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.34, t + 0.06);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
        src.connect(bp).connect(g).connect(this.comp);
        src.start(t); src.stop(t + 0.65);
      }
      return;
    }

    const heavy = voice === "heavy";
    // Body: band-passed noise crack.
    const src = this.noiseSource();
    if (src) {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(heavy ? 900 : 1500, t);
      bp.frequency.exponentialRampToValueAtTime(heavy ? 160 : 300, t + 0.2);
      bp.Q.value = 0.9;
      const g = ctx.createGain();
      g.gain.setValueAtTime(heavy ? 0.85 : 0.62, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (heavy ? 0.34 : 0.2));
      src.connect(bp).connect(g).connect(this.comp);
      src.start(t); src.stop(t + 0.4);
    }
    // Punch: pitched drop.
    const osc = ctx.createOscillator();
    osc.type = heavy ? "sine" : "square";
    osc.frequency.setValueAtTime(heavy ? 190 : 300, t);
    osc.frequency.exponentialRampToValueAtTime(heavy ? 42 : 70, t + (heavy ? 0.22 : 0.14));
    const og = ctx.createGain();
    og.gain.setValueAtTime(heavy ? 0.5 : 0.26, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + (heavy ? 0.3 : 0.16));
    osc.connect(og).connect(this.comp);
    osc.start(t); osc.stop(t + 0.34);
  }

  /** size 0..1 — layered sub, body, crack and tail. */
  explosion(size: number): void {
    if (!this.ctx || !this.comp) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const dur = 0.4 + size * 1.1;

    // Sub-bass thump
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(90 + size * 40, t);
    sub.frequency.exponentialRampToValueAtTime(24, t + 0.3 + size * 0.2);
    const subG = ctx.createGain();
    subG.gain.setValueAtTime(0.7 + size * 0.5, t);
    subG.gain.exponentialRampToValueAtTime(0.0001, t + 0.45 + size * 0.3);
    sub.connect(subG).connect(this.comp);
    sub.start(t); sub.stop(t + 0.8 + size * 0.4);

    // Body: noise through a sweeping lowpass
    const body = this.noiseSource();
    if (body) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(3200, t);
      lp.frequency.exponentialRampToValueAtTime(90, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.6 + size * 0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      body.connect(lp).connect(g).connect(this.comp);
      body.start(t); body.stop(t + dur + 0.05);
    }

    // Initial crack — brief highpassed transient
    const crack = this.noiseSource();
    if (crack) {
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 2200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5 + size * 0.3, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      crack.connect(hp).connect(g).connect(this.comp);
      crack.start(t); crack.stop(t + 0.12);
    }

    // Distant tail for the big ones
    if (size > 0.55) {
      const tail = this.noiseSource();
      if (tail) {
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 220;
        bp.Q.value = 0.5;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + 0.12);
        g.gain.exponentialRampToValueAtTime(0.3 * size, t + 0.3);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
        tail.connect(bp).connect(g).connect(this.comp);
        tail.start(t); tail.stop(t + 1.7);
      }
    }
  }

  bounce(): void {
    if (!this.ctx || !this.comp) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(760, t);
    osc.frequency.exponentialRampToValueAtTime(320, t + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    osc.connect(g).connect(this.comp);
    osc.start(t); osc.stop(t + 0.13);
  }

  split(): void {
    this.blip(880, 0.08, "square", 0.18);
    this.blip(1320, 0.08, "square", 0.14, 0.05);
  }

  ui(): void { this.blip(1400, 0.022, "square", 0.05); }

  levelUp(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.blip(f, 0.12, "triangle", 0.16, i * 0.07));
  }

  /** Trick-shot sting — a bright ascending fifth. */
  award(): void {
    this.blip(1046, 0.09, "square", 0.11);
    this.blip(1568, 0.14, "square", 0.1, 0.07);
  }

  pickup(): void {
    this.blip(660, 0.08, "sine", 0.18);
    this.blip(990, 0.1, "sine", 0.18, 0.07);
  }

  private blip(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0): void {
    if (!this.ctx || !this.comp) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.comp);
    osc.start(t); osc.stop(t + dur + 0.02);
  }
}

export const sfx = new AudioEngine();
