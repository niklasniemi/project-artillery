import { MAP_THEMES, paintSky } from "./themes";
import { paletteFor, drawChassis } from "./tanks";
import { randRange, TAU } from "./util";

/** Horizontal placement of the hero tank, clear of the menu column. */
const TANK_X = 0.63;

interface Puff { x: number; y: number; r: number; life: number; max: number; drift: number }
interface Streak { x: number; y: number; vx: number; vy: number; life: number; max: number }

/**
 * Looping title-screen vignette: a tank idling on a ridge, exhaust smoke,
 * rolling treads and the occasional artillery flash on the horizon.
 * Self-contained so the menu can start and stop it freely.
 */
export class TitleScene {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private t = 0;
  private sky: HTMLCanvasElement;
  private puffs: Puff[] = [];
  private streaks: Streak[] = [];
  private flash = 0;
  private nextFlash = 2.5;
  private w: number;
  private h: number;

  constructor(canvas: HTMLCanvasElement) {
    this.w = canvas.width;
    this.h = canvas.height;
    this.ctx = canvas.getContext("2d")!;
    // Nightfall reads best behind the bone-and-orange UI.
    const theme = MAP_THEMES[0];
    this.sky = document.createElement("canvas");
    this.sky.width = this.w;
    this.sky.height = this.h;
    paintSky(this.sky.getContext("2d")!, theme, this.w, this.h, 4);
  }

  start(): void {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (now: number): void => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private groundY(x: number): number {
    // Gentle ridge the tank sits on.
    return this.h * 0.78 - Math.sin(x * 0.004) * 16 - Math.sin(x * 0.011 + 1.2) * 7;
  }

  private update(dt: number): void {
    this.t += dt;

    // Exhaust
    if (Math.random() < dt * 14) {
      const tx = this.w * TANK_X;
      this.puffs.push({
        x: tx - 26, y: this.groundY(tx) - 30,
        r: randRange(3, 6), life: 0, max: randRange(1.6, 2.8),
        drift: randRange(6, 20),
      });
    }
    for (const p of this.puffs) {
      p.life += dt;
      p.y -= dt * 16;
      p.x += dt * p.drift;
      p.r += dt * 7;
    }
    this.puffs = this.puffs.filter((p) => p.life < p.max);

    // Distant artillery
    this.nextFlash -= dt;
    if (this.nextFlash <= 0) {
      this.nextFlash = randRange(2.2, 5.5);
      this.flash = 1;
      const fx = randRange(this.w * 0.78, this.w * 0.98);
      const fy = this.groundY(fx) - 4;
      for (let i = 0; i < 12; i++) {
        const a = -Math.PI / 2 + randRange(-0.7, 0.7);
        const s = randRange(90, 240);
        this.streaks.push({
          x: fx, y: fy,
          vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          life: 0, max: randRange(0.5, 1.1),
        });
      }
    }
    this.flash = Math.max(0, this.flash - dt * 2.6);
    for (const s of this.streaks) {
      s.life += dt;
      s.vy += 150 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    this.streaks = this.streaks.filter((s) => s.life < s.max);
  }

  private draw(): void {
    const ctx = this.ctx;
    const { w, h } = this;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.sky, 0, 0);

    // Horizon flash from the distant guns.
    if (this.flash > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(w * 0.78, h * 0.74, 10, w * 0.78, h * 0.74, w * 0.4);
      g.addColorStop(0, `rgba(255,170,90,${0.32 * this.flash})`);
      g.addColorStop(1, "rgba(255,170,90,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, h * 0.4, w, h * 0.6);
      ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const s of this.streaks) {
      const t = 1 - s.life / s.max;
      ctx.globalAlpha = t * 0.8;
      ctx.fillStyle = "#ffc06a";
      ctx.fillRect(s.x, s.y, 2, 2);
    }
    ctx.restore();

    // Ridge
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, this.groundY(0));
    for (let x = 0; x <= w; x += 6) ctx.lineTo(x, this.groundY(x));
    ctx.lineTo(w, h);
    ctx.closePath();
    const gg = ctx.createLinearGradient(0, h * 0.7, 0, h);
    gg.addColorStop(0, "#4a3f34");
    gg.addColorStop(0.12, "#2e2822");
    gg.addColorStop(1, "#14110e");
    ctx.fillStyle = gg;
    ctx.fill();

    // Lit crest
    ctx.beginPath();
    for (let x = 0; x <= w; x += 6) {
      const y = this.groundY(x);
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "rgba(196,150,96,0.65)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Smoke behind the tank
    ctx.save();
    for (const p of this.puffs) {
      const t = 1 - p.life / p.max;
      ctx.globalAlpha = t * 0.3;
      ctx.fillStyle = "#6d6255";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // The tank: idle bob, breathing barrel, rolling treads.
    const tx = this.w * TANK_X;
    const ty = this.groundY(tx) + Math.sin(this.t * 2.1) * 0.8;
    const barrel = -0.62 + Math.sin(this.t * 0.55) * 0.07;
    ctx.save();
    // Contact shadow
    ctx.translate(tx, ty + 2);
    ctx.scale(1, 0.28);
    const sh = ctx.createRadialGradient(0, 0, 2, 0, 0, 74);
    sh.addColorStop(0, "rgba(0,0,0,0.5)");
    sh.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.arc(0, 0, 74, 0, TAU);
    ctx.fill();
    ctx.restore();

    drawChassis(ctx, "vanguard", paletteFor(0), tx, ty, 1, barrel, 40);

    // Tread motion: ticks scrolling under the hull.
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = "#0f0d0b";
    ctx.lineWidth = 2;
    const scroll = (this.t * 26) % 12;
    for (let i = -4; i < 8; i++) {
      const lx = tx - 40 + i * 12 + scroll;
      if (lx < tx - 40 || lx > tx + 40) continue;
      ctx.beginPath();
      ctx.moveTo(lx, ty - 22);
      ctx.lineTo(lx, ty - 8);
      ctx.stroke();
    }
    ctx.restore();

    // Vignette so the UI reads over the top.
    const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.95);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(8,7,5,0.78)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }
}
