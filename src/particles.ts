import { randRange, TAU } from "./util";

type Kind = 0 | 1 | 2; // 0 = spark/debris, 1 = smoke, 2 = ember (additive)

interface Particle {
  active: boolean;
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number;
  color: string;
  gravity: number;
  drag: number;
  spin: number;
  kind: Kind;
}

interface Ring {
  active: boolean;
  x: number; y: number;
  r: number; maxR: number;
  life: number; maxLife: number;
  width: number;
  color: string;
}

/**
 * Radial-glow sprites, built once per colour and reused. Blitting a cached
 * sprite is far cheaper than constructing an arc path per particle, which
 * dominated the frame at high particle counts.
 */
const spriteCache = new Map<string, HTMLCanvasElement>();

function glowSprite(color: string): HTMLCanvasElement {
  let s = spriteCache.get(color);
  if (s) return s;
  const size = 32;
  s = document.createElement("canvas");
  s.width = size; s.height = size;
  const c = s.getContext("2d")!;
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, color);
  g.addColorStop(0.45, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  spriteCache.set(color, s);
  return s;
}

/**
 * Pooled particle system — fixed capacity, zero allocation during play.
 * `quality` scales spawn counts so heavy frames can shed work without
 * changing any gameplay behaviour.
 */
export class Particles {
  private pool: Particle[] = [];
  private rings: Ring[] = [];
  private cursor = 0;
  private ringCursor = 0;
  quality = 1;

  /** Additive white-out driven by nearby detonations; decays every frame. */
  flash = 0;

  constructor(capacity = 1600, ringCapacity = 24) {
    for (let i = 0; i < capacity; i++) {
      this.pool.push({
        active: false, x: 0, y: 0, vx: 0, vy: 0,
        life: 0, maxLife: 1, size: 2, color: "#fff",
        gravity: 0, drag: 0, spin: 0, kind: 0,
      });
    }
    for (let i = 0; i < ringCapacity; i++) {
      this.rings.push({ active: false, x: 0, y: 0, r: 0, maxR: 0, life: 0, maxLife: 1, width: 2, color: "#fff" });
    }
  }

  spawn(
    x: number, y: number, vx: number, vy: number,
    life: number, size: number, color: string,
    gravity = 0, kind: Kind = 0, drag = 0,
  ): void {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.length;
    p.active = true;
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.maxLife = life;
    p.size = size; p.color = color;
    p.gravity = gravity; p.drag = drag;
    p.kind = kind;
    p.spin = randRange(-6, 6);
  }

  ring(x: number, y: number, maxR: number, life: number, color: string, width = 3): void {
    const r = this.rings[this.ringCursor];
    this.ringCursor = (this.ringCursor + 1) % this.rings.length;
    r.active = true;
    r.x = x; r.y = y;
    r.r = maxR * 0.12; r.maxR = maxR;
    r.life = life; r.maxLife = life;
    r.color = color; r.width = width;
  }

  burst(
    x: number, y: number, count: number, speed: number, colors: string[],
    life = 0.8, size = 3, gravity = 300, kind: Kind = 0,
  ): void {
    const n = Math.max(1, Math.round(count * this.quality));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.spawn(
        x, y,
        Math.cos(a) * s, Math.sin(a) * s - speed * 0.25,
        life * randRange(0.5, 1.2),
        size * randRange(0.5, 1.4),
        colors[Math.floor(Math.random() * colors.length)],
        gravity, kind,
      );
    }
  }

  /** Layered detonation: core flash, fire, embers, smoke column, shockwave. */
  explosion(x: number, y: number, radius: number): void {
    const scale = radius / 40;

    this.ring(x, y, radius * 2.6, 0.42, "rgba(255,190,110,0.9)", 3.5);
    if (radius > 60) this.ring(x, y, radius * 4.2, 0.7, "rgba(255,120,50,0.5)", 2);

    // Fire core
    this.burst(x, y, Math.min(70, 34 * scale), 250 * scale,
      ["#fff3c4", "#ffd166", "#ff9a3c"], 0.42, 5, 120, 2);
    // Embers arcing out
    this.burst(x, y, Math.min(46, 22 * scale), 320 * scale,
      ["#ffb347", "#ff6b2c", "#ffe08a"], 1.1, 2.6, 420, 2);
    // Debris
    this.burst(x, y, Math.min(34, 16 * scale), 210 * scale,
      ["#6b6250", "#4a4437", "#8a8070"], 1.3, 3, 520, 0);
    // Smoke column
    const smokeN = Math.max(1, Math.round(Math.min(26, 13 * scale) * this.quality));
    for (let i = 0; i < smokeN; i++) {
      this.spawn(
        x + randRange(-radius * 0.4, radius * 0.4),
        y + randRange(-radius * 0.3, radius * 0.2),
        randRange(-40, 40), randRange(-90, -25) * scale * 0.5,
        randRange(1.1, 2.3), randRange(9, 20) * Math.min(2, scale),
        "#3a352c", -14, 1, 0.7,
      );
    }

    this.flash = Math.min(1, this.flash + Math.min(0.5, scale * 0.17));
  }

  sparks(x: number, y: number, count = 8): void {
    this.burst(x, y, count, 180, ["#ffd166", "#ff9a3c", "#ffffff"], 0.4, 2, 200, 2);
  }

  /** Muzzle flash cone along the barrel direction. */
  muzzle(x: number, y: number, angle: number, color: string): void {
    this.ring(x, y, 46, 0.2, color, 2.5);
    const n = Math.max(3, Math.round(16 * this.quality));
    for (let i = 0; i < n; i++) {
      const a = angle + randRange(-0.34, 0.34);
      const s = randRange(180, 430);
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s,
        randRange(0.14, 0.34), randRange(2, 4.6), i % 3 === 0 ? "#ffffff" : color, 60, 2, 2.4);
    }
    for (let i = 0; i < Math.round(5 * this.quality); i++) {
      this.spawn(x, y, randRange(-30, 30), randRange(-40, -10),
        randRange(0.5, 1), randRange(6, 11), "#4a4438", -12, 1, 1.2);
    }
    this.flash = Math.min(1, this.flash + 0.06);
  }

  update(dt: number): void {
    this.flash = Math.max(0, this.flash - dt * 3.4);
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.vy += p.gravity * dt;
      if (p.drag > 0) {
        const d = Math.max(0, 1 - p.drag * dt);
        p.vx *= d; p.vy *= d;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 1) p.size += dt * 14; // smoke billows
    }
    for (const r of this.rings) {
      if (!r.active) continue;
      r.life -= dt;
      if (r.life <= 0) { r.active = false; continue; }
      const t = 1 - r.life / r.maxLife;
      r.r = r.maxR * (0.12 + 0.88 * (1 - (1 - t) * (1 - t))); // ease-out
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    // Smoke first (normal blend, behind the fire), blitted as sprites.
    ctx.save();
    for (const p of this.pool) {
      if (!p.active || p.kind !== 1) continue;
      const t = p.life / p.maxLife;
      ctx.globalAlpha = Math.min(0.42, t * 0.55);
      const s = p.size * 2;
      ctx.drawImage(glowSprite(p.color), p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.restore();

    // Debris squares — fillRect is already the cheap path.
    ctx.save();
    for (const p of this.pool) {
      if (!p.active || p.kind !== 0) continue;
      const t = p.life / p.maxLife;
      ctx.globalAlpha = t < 0.4 ? t * 2.5 : 1;
      ctx.fillStyle = p.color;
      const s = p.size * (0.5 + t * 0.5);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.restore();

    // Embers + fire, additive.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.pool) {
      if (!p.active || p.kind !== 2) continue;
      const t = p.life / p.maxLife;
      ctx.globalAlpha = t;
      const s = p.size * (0.35 + t * 0.65) * 3;
      ctx.drawImage(glowSprite(p.color), p.x - s / 2, p.y - s / 2, s, s);
    }
    // Shockwave rings — few enough that stroked arcs stay cheap.
    for (const r of this.rings) {
      if (!r.active) continue;
      const t = r.life / r.maxLife;
      ctx.globalAlpha = t * t;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = Math.max(0.5, r.width * t);
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Decaying screen-shake spring with a directional kick component. */
export class ScreenShake {
  private trauma = 0;
  private kickX = 0;
  private kickY = 0;
  offsetX = 0;
  offsetY = 0;

  add(amount: number, dirX = 0, dirY = 0): void {
    this.trauma = Math.min(1, this.trauma + amount);
    this.kickX += dirX * amount * 26;
    this.kickY += dirY * amount * 26;
  }

  update(dt: number): void {
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.kickX *= Math.max(0, 1 - dt * 9);
    this.kickY *= Math.max(0, 1 - dt * 9);
    const shake = this.trauma * this.trauma;
    this.offsetX = (Math.random() * 2 - 1) * 26 * shake + this.kickX;
    this.offsetY = (Math.random() * 2 - 1) * 18 * shake + this.kickY;
  }
}
