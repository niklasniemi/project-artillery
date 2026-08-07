import { Terrain } from "./terrain";
import { WEAPONS, WeaponDef, WeaponTierStats } from "./weapons";
import { clamp, TAU } from "./util";
import { Loadout, TankType, TankAttrs, TankPalette, typeById, paletteFor, drawChassis } from "./tanks";
import { physics } from "./physics";

export const TANK_RADIUS = 14;
const CLIMB_LIMIT = 14;       // max pixels of slope a tank can climb per step
const FALL_DAMAGE_START = 90; // free-fall pixels before damage

export type { TankPalette };

export class Tank {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  fuel: number;
  maxFuel: number;
  angle = -Math.PI / 3; // radians; 0 = right, negative = up
  power = 62;           // 1..100
  alive = true;
  vy = 0;
  fallFrom = -1;
  facing: 1 | -1 = 1;

  readonly type: TankType;
  readonly attrs: TankAttrs;
  readonly palette: TankPalette;

  // Game-mode roles
  seat = 0;         // stable index; equals array index locally, server seat online
  team = -1;        // -1 = free-for-all
  isVIP = false;    // assassination
  isJuggernaut = false;
  kills = 0;
  turnsTaken = 0;
  lastDamagedBy: Tank | null = null;

  // In-match progression (resets every game — the whole point).
  xp = 0;
  level = 0;
  upgradePoints = 0;
  weaponTiers: number[] = WEAPONS.map(() => 0);
  selectedWeapon = 0;
  damageDealt = 0;
  /** Rounds left per weapon; Infinity when the host set no limit. */
  ammo: number[] = WEAPONS.map(() => Infinity);

  hasAmmo(index: number): boolean {
    return (this.ammo[index] ?? 0) > 0;
  }

  constructor(
    public readonly name: string,
    public readonly loadout: Loadout,
    public readonly isAI: boolean,
    x: number, y: number,
    baseHp: number, baseFuel: number,
  ) {
    this.x = x; this.y = y;
    this.type = typeById(loadout.type);
    this.attrs = this.type.attrs;
    this.palette = paletteFor(loadout.color);
    this.maxHp = Math.max(1, Math.round(baseHp * this.attrs.hp));
    this.hp = this.maxHp;
    this.maxFuel = Math.round(baseFuel * this.attrs.fuel);
    this.fuel = this.maxFuel;
  }

  get weaponDef(): WeaponDef { return WEAPONS[this.selectedWeapon]; }
  get weaponStats(): WeaponTierStats {
    return WEAPONS[this.selectedWeapon].tiers[this.weaponTiers[this.selectedWeapon]];
  }

  /** Points-mode score. */
  get score(): number {
    return Math.round(this.damageDealt) + this.kills * 50;
  }

  isEnemyOf(other: Tank): boolean {
    if (other === this) return false;
    return this.team < 0 || other.team < 0 || this.team !== other.team;
  }

  /** Drive along terrain. Returns true if any movement happened. */
  drive(dir: -1 | 1, terrain: Terrain, dt: number): boolean {
    if (this.fuel <= 0 || !this.alive) return false;
    const speed = 85 * this.attrs.drive;
    const step = dir * speed * dt;
    const newX = clamp(this.x + step, TANK_RADIUS, terrain.width - TANK_RADIUS);
    if (newX === this.x) return false;
    const surface = terrain.surfaceY(newX, Math.max(0, this.y - CLIMB_LIMIT - 4));
    if (surface < 0) {
      // Void ahead — allow driving off the edge (player's funeral).
      this.x = newX;
    } else {
      const rise = this.y - surface;
      if (rise > CLIMB_LIMIT) return false; // too steep
      this.x = newX;
      this.y = surface;
    }
    this.facing = dir;
    this.fuel = Math.max(0, this.fuel - Math.abs(step) * 0.55);
    return true;
  }

  /** Gravity settle. Returns fall damage taken this frame (0 if none). */
  settle(terrain: Terrain, dt: number): number {
    if (!this.alive) return 0;
    const support = terrain.solid(this.x, this.y + 1)
      || terrain.solid(this.x - TANK_RADIUS * 0.6, this.y + 1)
      || terrain.solid(this.x + TANK_RADIUS * 0.6, this.y + 1);
    if (support) {
      // If terrain was added on top of us (dome edge), pop up gently.
      let pops = 0;
      while (terrain.solid(this.x, this.y - 1) && pops < 26) { this.y--; pops++; }
      if (this.fallFrom >= 0) {
        const fall = this.y - this.fallFrom;
        this.fallFrom = -1;
        this.vy = 0;
        if (fall > FALL_DAMAGE_START) return Math.min(45, Math.round((fall - FALL_DAMAGE_START) * 0.28));
      }
      this.vy = 0;
      return 0;
    }
    if (this.fallFrom < 0) this.fallFrom = this.y;
    this.vy += physics.gravity * dt;
    this.y += this.vy * dt;
    const surface = terrain.surfaceY(this.x, Math.max(0, this.y - 2) | 0);
    if (surface >= 0 && this.y >= surface) this.y = surface;
    return 0;
  }

  get barrelTip(): { x: number; y: number } {
    const len = this.type.id === "howitzer" ? 36 : 26;
    return {
      x: this.x + Math.cos(this.angle) * len,
      y: this.y - 10 + Math.sin(this.angle) * len,
    };
  }

  draw(ctx: CanvasRenderingContext2D, isCurrent: boolean): void {
    if (!this.alive) return;
    const { x, y, palette } = this;
    ctx.save();

    if (this.isJuggernaut) {
      ctx.translate(x, y);
      ctx.scale(1.3, 1.3);
      ctx.translate(-x, -y);
      ctx.beginPath();
      ctx.arc(x, y - 9, TANK_RADIUS + 7, 0, TAU);
      ctx.strokeStyle = "#ff3b3b";
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (isCurrent) {
      ctx.beginPath();
      ctx.arc(x, y - 8, TANK_RADIUS + 10, 0, TAU);
      ctx.strokeStyle = palette.glow;
      ctx.globalAlpha = 0.35 + 0.2 * Math.sin(performance.now() / 200);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Soft contact shadow so the tank sits in the ground rather than on it.
    const shadowW = TANK_RADIUS * 2.2;
    const sg = ctx.createRadialGradient(x, y + 1, 1, x, y + 1, shadowW);
    sg.addColorStop(0, "rgba(0,0,0,0.42)");
    sg.addColorStop(0.6, "rgba(0,0,0,0.16)");
    sg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.translate(x, y + 1);
    ctx.scale(1, 0.3);
    ctx.translate(-x, -(y + 1));
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(x, y + 1, shadowW, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Drawn a little larger than the collision radius so the chassis detail
    // is readable. Purely cosmetic — TANK_RADIUS still governs hits.
    drawChassis(ctx, this.type.id, palette, x, y, this.facing, this.angle, TANK_RADIUS * 1.3);

    // HP bar + name
    const w = 40;
    const frac = clamp(this.hp / this.maxHp, 0, 1);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x - w / 2, y - 40, w, 5);
    ctx.fillStyle = frac > 0.5 ? "#9df04d" : frac > 0.25 ? "#ffc44d" : "#ff5a5a";
    ctx.fillRect(x - w / 2, y - 40, w * frac, 5);

    ctx.font = "700 11px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = palette.glow;
    const label = this.team >= 0 ? `${this.name} [${this.team === 0 ? "A" : "B"}]` : this.name;
    ctx.fillText(this.isJuggernaut ? `☠ ${this.name}` : label, x, y - 46);

    if (this.isVIP) {
      ctx.fillStyle = "#ffd700";
      ctx.beginPath();
      ctx.moveTo(x - 8, y - 56);
      ctx.lineTo(x - 8, y - 64);
      ctx.lineTo(x - 4, y - 59);
      ctx.lineTo(x, y - 65);
      ctx.lineTo(x + 4, y - 59);
      ctx.lineTo(x + 8, y - 64);
      ctx.lineTo(x + 8, y - 56);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }
}

/**
 * A deployed energy dome. Unlike the old terrain dome this is a real object,
 * which is what makes one-way protection possible: shots crossing *inward*
 * from outside are stopped, shots crossing *outward* from inside pass freely.
 */
export class Shield {
  hits: number;
  turnsLeft: number;
  /** Flash timer so a blocked hit reads visually. */
  flash = 0;

  constructor(
    public x: number,
    public y: number,
    public radius: number,
    public ownerSeat: number,
    public team: number,
    public color: string,
    hits = 3,
    turns = 3,
  ) {
    this.hits = hits;
    this.turnsLeft = turns;
  }

  get dead(): boolean {
    return this.hits <= 0 || this.turnsLeft <= 0;
  }

  /** Shots are only stopped by the dome itself, never below its base line. */
  coversPoint(px: number, py: number): boolean {
    if (py > this.y) return false;
    const dx = px - this.x, dy = py - this.y;
    return dx * dx + dy * dy <= this.radius * this.radius;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const life = clamp(this.turnsLeft / 3, 0.25, 1);
    const shimmer = 0.5 + 0.5 * Math.sin(performance.now() / 260 + this.x * 0.01);
    ctx.save();

    // Body: faint energy fill inside the dome.
    const g = ctx.createRadialGradient(this.x, this.y, this.radius * 0.2, this.x, this.y, this.radius);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.78, `rgba(120, 235, 255, ${0.05 * life})`);
    g.addColorStop(1, `rgba(120, 235, 255, ${0.16 * life})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, Math.PI, TAU);
    ctx.closePath();
    ctx.fill();

    // Rim, brighter right after absorbing a hit.
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = this.color;
    ctx.globalAlpha = clamp(0.35 * life + shimmer * 0.18 + this.flash, 0, 1);
    ctx.lineWidth = 2.5 + this.flash * 4;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, Math.PI, TAU);
    ctx.stroke();

    // Remaining-charge ticks along the crown.
    ctx.globalAlpha = 0.55 * life;
    ctx.lineWidth = 3;
    for (let i = 0; i < this.hits; i++) {
      const a = Math.PI + (i + 1) * (Math.PI / (this.hits + 1));
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius - 7, a - 0.06, a + 0.06);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export type CrateKind = "health" | "fuel" | "xp";

export class Crate {
  y: number;
  landed = false;
  collected = false;

  constructor(public readonly kind: CrateKind, public readonly x: number, startY = -30) {
    this.y = startY;
  }

  update(terrain: Terrain, dt: number): void {
    if (this.landed || this.collected) return;
    this.y += 65 * dt; // parachute descent
    const surface = terrain.surfaceY(this.x, Math.max(0, this.y | 0));
    if (surface >= 0 && this.y >= surface - 8) {
      this.y = surface - 8;
      this.landed = true;
    } else if (this.y > terrain.height + 40) {
      this.collected = true; // drifted into the void
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.collected) return;
    const { x, y } = this;
    ctx.save();
    if (!this.landed) {
      ctx.strokeStyle = "rgba(236,228,210,0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y - 16, 14, Math.PI * 1.1, Math.PI * 1.9);
      ctx.moveTo(x - 12, y - 22); ctx.lineTo(x - 6, y - 6);
      ctx.moveTo(x + 12, y - 22); ctx.lineTo(x + 6, y - 6);
      ctx.stroke();
    }
    const color = this.kind === "health" ? "#9df04d" : this.kind === "fuel" ? "#ffc44d" : "#4de8ff";
    ctx.fillStyle = "#1c1913";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(x - 9, y - 8, 18, 16);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = "700 10px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillText(this.kind === "health" ? "+" : this.kind === "fuel" ? "F" : "XP", x, y + 4);
    ctx.restore();
  }
}

export interface ProjectileSpawn {
  x: number; y: number; vx: number; vy: number;
  def: WeaponDef;
  stats: WeaponTierStats;
  owner: Tank;
}

export class Projectile {
  x: number; y: number; vx: number; vy: number;
  readonly def: WeaponDef;
  readonly stats: WeaponTierStats;
  readonly owner: Tank;
  alive = true;
  age = 0;
  bounces = 0;
  digging = false;
  digElapsed = 0;
  rolling = false;
  rollDir: 1 | -1 = 1;
  rollElapsed = 0;
  splitRequested = false;
  hasSplit = false;
  isChild = false;   // sub-munition (cluster bomblet, MIRV warhead, airstrike bomb)
  resting = false;   // grenade sitting still, waiting on its fuse
  trail: { x: number; y: number }[] = [];

  constructor(spawn: ProjectileSpawn) {
    this.x = spawn.x; this.y = spawn.y;
    this.vx = spawn.vx; this.vy = spawn.vy;
    this.def = spawn.def;
    this.stats = spawn.stats;
    this.owner = spawn.owner;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.alive) return;
    ctx.save();
    // Trail: two polylines (faint tail, brighter head) instead of one stroke
    // per segment — same look, a fraction of the draw calls.
    const n = this.trail.length;
    if (n > 1) {
      ctx.strokeStyle = this.def.trailColor;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.trail[0].x, this.trail[0].y);
      for (let i = 1; i < n; i++) ctx.lineTo(this.trail[i].x, this.trail[i].y);
      ctx.stroke();

      const headFrom = Math.max(0, n - 8);
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(this.trail[headFrom].x, this.trail[headFrom].y);
      for (let i = headFrom + 1; i < n; i++) ctx.lineTo(this.trail[i].x, this.trail[i].y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    const r = this.rolling ? 7 : 4.5;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = this.def.trailColor;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r * 2.4, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}
