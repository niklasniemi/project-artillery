import { randRange, TAU } from "./util";

interface Particle {
  active: boolean;
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number;
  color: string;
  gravity: number;
  fade: boolean;
}

/** Fixed-size pooled particle system — zero allocation during play. */
export class Particles {
  private pool: Particle[] = [];
  private cursor = 0;

  constructor(capacity = 1200) {
    for (let i = 0; i < capacity; i++) {
      this.pool.push({
        active: false, x: 0, y: 0, vx: 0, vy: 0,
        life: 0, maxLife: 1, size: 2, color: "#fff", gravity: 0, fade: true,
      });
    }
  }

  spawn(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, gravity = 0): void {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.length;
    p.active = true;
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.maxLife = life;
    p.size = size; p.color = color; p.gravity = gravity;
  }

  burst(x: number, y: number, count: number, speed: number, colors: string[], life = 0.8, size = 3, gravity = 300): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.spawn(
        x, y,
        Math.cos(a) * s, Math.sin(a) * s - speed * 0.25,
        life * randRange(0.5, 1.2),
        size * randRange(0.5, 1.4),
        colors[Math.floor(Math.random() * colors.length)],
        gravity,
      );
    }
  }

  explosion(x: number, y: number, radius: number): void {
    const scale = radius / 40;
    this.burst(x, y, Math.min(90, 40 * scale), 260 * scale, ["#ffdf6b", "#ff9d3c", "#ff5a3c", "#fff7d6"], 0.9, 4, 260);
    this.burst(x, y, Math.min(40, 22 * scale), 120 * scale, ["#5a5470", "#3a3450", "#7a7490"], 1.6, 5, 420);
    this.spawn(x, y, 0, -30, 0.35, radius * 0.9, "rgba(255,240,200,0.9)", 0);
  }

  sparks(x: number, y: number, count = 8): void {
    this.burst(x, y, count, 180, ["#4de8ff", "#b6ff4d", "#ffffff"], 0.4, 2, 200);
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const p of this.pool) {
      if (!p.active) continue;
      const t = p.life / p.maxLife;
      ctx.globalAlpha = t < 0.5 ? t * 2 : 1;
      ctx.fillStyle = p.color;
      const s = p.size * (0.5 + t * 0.5);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.restore();
  }
}

/** Decaying screen-shake spring. */
export class ScreenShake {
  private trauma = 0;
  offsetX = 0;
  offsetY = 0;

  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number): void {
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const shake = this.trauma * this.trauma;
    this.offsetX = (Math.random() * 2 - 1) * 26 * shake;
    this.offsetY = (Math.random() * 2 - 1) * 18 * shake;
  }
}
