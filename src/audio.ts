/** Synthesized SFX via WebAudio — no asset files needed. */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  /** Must be called from a user gesture to satisfy autoplay policy. */
  unlock(): void {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  private noiseBuffer(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  fire(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(0.18);
    const nf = ctx.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.setValueAtTime(1400, t);
    nf.frequency.exponentialRampToValueAtTime(300, t + 0.16);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.7, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    noise.connect(nf).connect(ng).connect(this.master);
    noise.start(t);

    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.14);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.25, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(og).connect(this.master);
    osc.start(t); osc.stop(t + 0.16);
  }

  explosion(size: number): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const dur = 0.35 + size * 0.5;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(dur);
    const nf = ctx.createBiquadFilter();
    nf.type = "lowpass";
    nf.frequency.setValueAtTime(2500, t);
    nf.frequency.exponentialRampToValueAtTime(80, t + dur);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.55 + size * 0.4, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.connect(nf).connect(ng).connect(this.master);
    noise.start(t);

    const thump = ctx.createOscillator();
    thump.type = "sine";
    thump.frequency.setValueAtTime(110, t);
    thump.frequency.exponentialRampToValueAtTime(28, t + 0.3);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.8, t);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    thump.connect(tg).connect(this.master);
    thump.start(t); thump.stop(t + 0.4);
  }

  bounce(): void {
    this.blip(520, 0.06, "triangle", 0.2);
  }

  split(): void {
    this.blip(880, 0.08, "square", 0.18);
    this.blip(1320, 0.08, "square", 0.14, 0.05);
  }

  ui(): void {
    this.blip(700, 0.04, "sine", 0.12);
  }

  levelUp(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.blip(f, 0.12, "triangle", 0.2, i * 0.07));
  }

  pickup(): void {
    this.blip(660, 0.08, "sine", 0.2);
    this.blip(990, 0.1, "sine", 0.2, 0.07);
  }

  private blip(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }
}

export const sfx = new AudioEngine();
