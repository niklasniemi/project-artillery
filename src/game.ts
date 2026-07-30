import { Terrain } from "./terrain";
import { Tank, Projectile, Crate, CrateKind, TANK_PALETTES, TANK_RADIUS, GRAVITY } from "./entities";
import { Particles, ScreenShake } from "./particles";
import { WEAPONS, levelForXp } from "./weapons";
import { UI, MatchSettings } from "./ui";
import { planShot, AiPlan, POWER_TO_VELOCITY } from "./ai";
import { sfx } from "./audio";
import { clamp, dist, seededRandom, rngRange, rngPick, TAU } from "./util";

export const WORLD_W = 1600;
export const WORLD_H = 900;

type Phase = "idle" | "input" | "projectiles" | "settle" | "sync" | "gameover";

const WIND_RANGES = { none: 0, low: 35, realistic: 95, chaotic: 190 } as const;

interface PendingBlast {
  delay: number;
  x: number; y: number;
  radius: number; damage: number;
  owner: Tank;
  healFrac?: number;
}

interface PendingSpawn {
  delay: number;
  make: () => Projectile;
}

interface Beam {
  x1: number; y1: number; x2: number; y2: number;
  life: number; maxLife: number;
  color: string;
}

export interface FireMsg {
  x: number; y: number;
  angle: number; power: number;
  weapon: number;
}

export interface SplitMsg {
  x: number; y: number; vx: number; vy: number;
}

export interface Snapshot {
  tanks: {
    seat: number; x: number; y: number;
    hp: number; maxHp: number; fuel: number; alive: boolean;
    xp: number; level: number; up: number; tiers: number[];
    kills: number; dmg: number; turns: number;
  }[];
  crates: { kind: CrateKind; x: number; y: number; landed: boolean; collected: boolean }[];
}

export interface TurnEndMsg {
  snapshot: Snapshot;
  nextSeat: number;
  gameOver: boolean;
}

/** Wiring for online play. `send` posts to the Colyseus room; incoming
 * messages call the Game.remote* / advanceTurn methods. */
export interface OnlineContext {
  mySeat: number;
  send: (type: string, payload?: unknown) => void;
}

interface WinResult {
  over: boolean;
  winner: Tank | null;
  title?: string;
}

export class Game {
  private terrain = new Terrain(WORLD_W, WORLD_H);
  private tanks: Tank[] = [];
  private projectiles: Projectile[] = [];
  private pendingBlasts: PendingBlast[] = [];
  private pendingSpawns: PendingSpawn[] = [];
  private beams: Beam[] = [];
  private crates: Crate[] = [];
  private particles = new Particles();
  private shake = new ScreenShake();
  private bg: HTMLCanvasElement;
  private rng: () => number = Math.random;

  private phase: Phase = "idle";
  private settings!: MatchSettings;
  private currentIndex = 0;
  private wind = 0;
  private turnTimeLeft = 0;
  private settleTime = 0;

  online: OnlineContext | null = null;
  private awaitingAdvance = false;
  private netAccum = 0;
  private aimDirty = false;
  private driveDirty = false;

  // AI turn choreography
  private aiTimer = 0;
  private aiPlan: AiPlan | null = null;
  private aiFired = false;

  private keys = new Set<string>();
  private aiming = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private ctx: CanvasRenderingContext2D,
    private ui: UI,
  ) {
    this.bg = this.buildBackground();
    this.bindInput();
  }

  get currentTank(): Tank {
    return this.tanks[this.currentIndex];
  }

  isMyTurn(): boolean {
    const t = this.currentTank;
    if (!t) return false;
    if (this.online) return t.seat === this.online.mySeat;
    return !t.isAI;
  }

  // ---------- Match lifecycle ----------

  start(settings: MatchSettings, opts?: { seed?: number; online?: OnlineContext }): void {
    this.settings = settings;
    this.online = opts?.online ?? null;
    const seed = opts?.seed ?? Math.floor(Math.random() * 1e9);
    this.rng = seededRandom(seed);
    this.terrain.generate(settings.terrainType, Math.floor(this.rng() * 1e9));
    this.projectiles = [];
    this.pendingBlasts = [];
    this.pendingSpawns = [];
    this.beams = [];
    this.crates = [];
    this.tanks = [];
    this.awaitingAdvance = false;

    let players = settings.players;
    if (settings.mode === "assassination") {
      // Assassination needs two teams of two: pad with AI locally.
      players = [...players];
      const padNames = ["Vector", "Torque", "Parabola", "Cosine"].filter(
        (name) => !players.some((p) => p.name === name),
      );
      while (players.length < 4 && !this.online) {
        players.push({ name: padNames.shift() ?? `Bot ${players.length}`, isAI: true });
      }
      if (players.length % 2 === 1) players.pop();
    }

    const n = players.length;
    for (let i = 0; i < n; i++) {
      const p = players[i];
      const x = WORLD_W * ((i + 0.5) / n) + rngRange(this.rng, -40, 40);
      let surface = this.terrain.surfaceY(x);
      let spawnX = x;
      for (let tries = 0; surface < 0 && tries < 60; tries++) {
        spawnX = clamp(x + (tries % 2 === 0 ? 1 : -1) * (tries * 14), TANK_RADIUS, WORLD_W - TANK_RADIUS);
        surface = this.terrain.surfaceY(spawnX);
      }
      const tank = new Tank(
        p.name, TANK_PALETTES[i % TANK_PALETTES.length], p.isAI,
        spawnX, surface >= 0 ? surface : WORLD_H * 0.5,
        settings.startHp, settings.startFuel,
      );
      tank.seat = i;
      this.tanks.push(tank);
    }

    // Mode roles (all RNG here is seeded → identical on every client)
    if (settings.mode === "assassination") {
      for (const t of this.tanks) {
        t.team = t.seat % 2;
        if (t.seat < 2) {
          t.isVIP = true;
          t.maxHp = Math.round(t.maxHp * 1.5);
          t.hp = t.maxHp;
        }
      }
    } else if (settings.mode === "juggernaut") {
      const jug = this.tanks[Math.floor(this.rng() * n)];
      jug.isJuggernaut = true;
      jug.maxHp *= 3;
      jug.hp = jug.maxHp;
      for (const t of this.tanks) t.team = t === jug ? 1 : 0;
    }

    this.ui.buildHud();
    this.currentIndex = -1;
    this.nextTurn();
  }

  /** Mode-aware end-of-match check. */
  private evaluateWinner(): WinResult {
    const mode = this.settings.mode;
    const alive = this.tanks.filter((t) => t.alive);

    if (mode === "points") {
      const rounds = this.settings.rounds;
      if (this.tanks.every((t) => t.turnsTaken >= rounds)) {
        const winner = [...this.tanks].sort((a, b) => b.score - a.score)[0];
        return { over: true, winner, title: `${winner.name.toUpperCase()} WINS ${winner.score} PTS` };
      }
      return { over: false, winner: null };
    }
    if (mode === "juggernaut") {
      const jug = this.tanks.find((t) => t.isJuggernaut)!;
      if (!jug.alive) return { over: true, winner: null, title: "THE HUNTERS WIN" };
      if (alive.every((t) => t.isJuggernaut)) return { over: true, winner: jug, title: `THE JUGGERNAUT WINS` };
      return { over: false, winner: null };
    }
    if (mode === "assassination") {
      for (const team of [0, 1]) {
        const vip = this.tanks.find((t) => t.team === team && t.isVIP);
        if (vip && !vip.alive) {
          const other = 1 - team;
          const winner = this.tanks.find((t) => t.team === other && t.isVIP) ?? null;
          return { over: true, winner, title: `TEAM ${other === 0 ? "A" : "B"} WINS` };
        }
      }
      return { over: false, winner: null };
    }
    // deathmatch
    if (alive.length <= 1) return { over: true, winner: alive[0] ?? null };
    return { over: false, winner: null };
  }

  private finishGame(result: WinResult): void {
    this.phase = "gameover";
    this.ui.showGameOver(this.tanks, result.winner, result.title, this.settings.mode === "points");
  }

  private computeNextIndex(): number {
    let idx = this.currentIndex;
    for (let i = 0; i < this.tanks.length; i++) {
      idx = (idx + 1) % this.tanks.length;
      const t = this.tanks[idx];
      if (t.alive || this.settings.mode === "points") return idx;
    }
    return (this.currentIndex + 1) % this.tanks.length;
  }

  /** Local-mode turn advance. Online turns advance via advanceTurn(). */
  private nextTurn(): void {
    const result = this.evaluateWinner();
    if (result.over) { this.finishGame(result); return; }
    this.beginTurn(this.computeNextIndex());
  }

  private beginTurn(index: number): void {
    this.currentIndex = index;
    const t = this.currentTank;

    if (!t.alive && this.settings.mode === "points") this.respawn(t);

    t.turnsTaken++;
    this.rollWind();
    this.maybeDropCrate();
    this.turnTimeLeft = this.settings.turnSeconds;
    this.phase = "input";
    this.awaitingAdvance = false;
    this.aiTimer = 0;
    this.aiPlan = null;
    this.aiFired = false;

    // Point the barrel at the nearest enemy so turns start naturally.
    const foe = this.tanks.filter((e) => e.alive && e.isEnemyOf(t))
      .sort((a, b) => Math.abs(a.x - t.x) - Math.abs(b.x - t.x))[0];
    if (foe && Math.sign(foe.x - t.x) !== Math.sign(Math.cos(t.angle))) {
      t.angle = -Math.PI - t.angle;
    }
    this.ui.updateTurn(t, this.isMyTurn());
    this.ui.updateWeapons(t);
    this.ui.updateXp(t);
    this.ui.updateModeInfo(this.modeInfoText());
    this.ui.banner(`${t.name}'s turn`, t.palette.glow);
  }

  private respawn(t: Tank): void {
    t.alive = true;
    t.hp = t.maxHp;
    t.fuel = t.maxFuel;
    t.vy = 0;
    t.fallFrom = -1;
    let x = rngRange(this.rng, 60, WORLD_W - 60);
    let surface = this.terrain.surfaceY(x);
    for (let tries = 0; surface < 0 && tries < 80; tries++) {
      x = rngRange(this.rng, 60, WORLD_W - 60);
      surface = this.terrain.surfaceY(x);
    }
    t.x = x;
    t.y = surface >= 0 ? surface : WORLD_H * 0.4;
    this.particles.burst(t.x, t.y - 10, 20, 200, [t.palette.glow, "#ffffff"], 0.8, 3, 150);
    this.ui.banner(`${t.name} REDEPLOYED`, t.palette.glow);
  }

  private modeInfoText(): string {
    const mode = this.settings.mode;
    if (mode === "points") {
      const leader = [...this.tanks].sort((a, b) => b.score - a.score)[0];
      return `ROUND ${Math.min(this.currentTank.turnsTaken, this.settings.rounds)}/${this.settings.rounds} · ★ ${leader.name} ${leader.score}`;
    }
    if (mode === "juggernaut") {
      const jug = this.tanks.find((t) => t.isJuggernaut)!;
      return `☠ ${jug.name} ${Math.max(0, jug.hp)} HP`;
    }
    if (mode === "assassination") return "PROTECT YOUR VIP ♛";
    return "";
  }

  private rollWind(): void {
    const range = WIND_RANGES[this.settings.windMode];
    this.wind = range === 0 ? 0 : rngRange(this.rng, -range, range);
    this.ui.updateWind(this.wind);
  }

  private maybeDropCrate(): void {
    if (!this.settings.crates) return;
    const roll = this.rng();
    if (this.crates.filter((c) => !c.collected).length >= 3) return;
    if (roll > 0.28) return;
    const kind = rngPick<CrateKind>(this.rng, ["health", "fuel", "xp"]);
    this.crates.push(new Crate(kind, rngRange(this.rng, 60, WORLD_W - 60)));
  }

  // ---------- Firing ----------

  fire(fromNet = false): void {
    if (this.phase !== "input") return;
    const t = this.currentTank;
    if (!fromNet && this.online && this.isMyTurn()) {
      const msg: FireMsg = { x: t.x, y: t.y, angle: t.angle, power: t.power, weapon: t.selectedWeapon };
      this.online.send("fire", msg);
    }
    const def = t.weaponDef;
    const stats = t.weaponStats;
    const tip = t.barrelTip;

    if (def.behavior === "railstrike") {
      this.fireRailstrike(t);
    } else {
      const count = def.behavior === "twins" ? (stats.count ?? 2) : 1;
      for (let i = 0; i < count; i++) {
        const spread = count > 1 ? (i - (count - 1) / 2) * 0.055 : 0;
        const v = t.power * POWER_TO_VELOCITY * def.speedMul;
        this.projectiles.push(new Projectile({
          x: tip.x, y: tip.y,
          vx: Math.cos(t.angle + spread) * v,
          vy: Math.sin(t.angle + spread) * v,
          def, stats, owner: t,
        }));
      }
    }
    sfx.fire();
    this.particles.sparks(tip.x, tip.y, 10);
    this.shake.add(0.12);
    this.phase = "projectiles";
    this.ui.updateTurn(t, false);
    this.ui.closeUpgradePanel();
  }

  private fireRailstrike(t: Tank): void {
    const stats = t.weaponStats;
    const tip = t.barrelTip;
    const dx = Math.cos(t.angle), dy = Math.sin(t.angle);
    let x = tip.x, y = tip.y;
    let pen = stats.pen ?? 150;
    const hit = new Set<Tank>();
    let steps = 0;
    while (steps++ < 700 && pen > 0) {
      x += dx * 3; y += dy * 3;
      if (x < -20 || x > WORLD_W + 20 || y < -400 || y > WORLD_H + 20) break;
      if (this.terrain.solid(x, y)) {
        pen -= 3;
        if (steps % 2 === 0) this.terrain.carve(x, y, stats.radius);
      }
      for (const tank of this.tanks) {
        if (!tank.alive || tank === t || hit.has(tank)) continue;
        if (dist(x, y, tank.x, tank.y - 8) < TANK_RADIUS + 4) {
          hit.add(tank);
          this.applyDamage(tank, stats.damage, t);
          this.particles.explosion(tank.x, tank.y - 8, 30);
        }
      }
    }
    this.beams.push({ x1: tip.x, y1: tip.y, x2: x, y2: y, life: 0.4, maxLife: 0.4, color: "#4de8ff" });
    this.particles.sparks(x, y, 16);
    sfx.explosion(0.5);
    this.shake.add(0.4);
  }

  private requestSplit(): void {
    if (this.online && !this.isMyTurn()) return;
    for (const p of this.projectiles) {
      if (p.alive && p.def.behavior === "splitter" && !p.hasSplit) {
        if (this.online) {
          const msg: SplitMsg = { x: p.x, y: p.y, vx: p.vx, vy: p.vy };
          this.online.send("split", msg);
        }
        p.splitRequested = true;
      }
    }
  }

  private split(p: Projectile): void {
    p.hasSplit = true;
    p.alive = false;
    sfx.split();
    this.particles.sparks(p.x, p.y, 14);
    const count = p.stats.count ?? 5;
    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) / count;
      const child = new Projectile({
        x: p.x, y: p.y,
        vx: p.vx + spread * 220,
        vy: p.vy + rngRange(this.rng, -40, 10),
        def: p.def, stats: p.stats, owner: p.owner,
      });
      child.hasSplit = true;
      this.projectiles.push(child);
    }
  }

  // ---------- Explosions & damage ----------

  /** Core detonation: carve + FX + radial damage. Returns damage dealt to enemies. */
  private blastAt(
    x: number, y: number, radius: number, damage: number, owner: Tank,
    opts: { direct?: Tank | null; splashMul?: number; healFrac?: number } = {},
  ): number {
    this.terrain.carve(x, y, radius);
    this.particles.explosion(x, y, radius);
    sfx.explosion(clamp(radius / 90, 0.2, 1));
    this.shake.add(clamp(radius / 110, 0.12, 0.8));

    let enemyDamage = 0;
    for (const tank of this.tanks) {
      if (!tank.alive) continue;
      let dmg = 0;
      if (tank === opts.direct) {
        dmg = damage;
      } else {
        const d = dist(x, y, tank.x, tank.y - 8);
        const reach = radius + TANK_RADIUS;
        if (d < reach) dmg = damage * (1 - d / reach) * (opts.splashMul ?? 1);
      }
      if (dmg < 1) continue;
      if (tank.isEnemyOf(owner)) enemyDamage += Math.round(dmg);
      this.applyDamage(tank, dmg, owner);
    }

    if (opts.healFrac && enemyDamage > 0 && owner.alive) {
      const heal = Math.round(enemyDamage * opts.healFrac);
      owner.hp = Math.min(owner.maxHp, owner.hp + heal);
      this.particles.burst(owner.x, owner.y - 10, 12, 120, ["#6bff7e", "#b6ff4d"], 0.7, 3, -60);
    }

    for (const crate of this.crates) {
      if (!crate.collected && dist(x, y, crate.x, crate.y) < radius + 12) {
        crate.collected = true;
        this.particles.sparks(crate.x, crate.y, 12);
      }
    }
    return enemyDamage;
  }

  private explode(p: Projectile, directHit: Tank | null): void {
    p.alive = false;
    const stats = p.stats;
    const behavior = p.def.behavior;

    if (behavior === "shielder") {
      this.terrain.addDome(p.x, p.y, stats.radius);
      this.particles.sparks(p.x, p.y, 24);
      sfx.bounce();
      this.shake.add(0.1);
      return;
    }

    if (behavior === "teleport") {
      const owner = p.owner;
      if (owner.alive) {
        this.particles.burst(owner.x, owner.y - 10, 20, 180, ["#b44df0", "#ffffff"], 0.7, 3, 0);
        owner.x = clamp(p.x, TANK_RADIUS, WORLD_W - TANK_RADIUS);
        const surface = this.terrain.surfaceY(owner.x, Math.max(0, (p.y - 80) | 0));
        owner.y = surface >= 0 ? surface : p.y;
        owner.vy = 0;
        owner.fallFrom = -1;
        if (stats.damage > 0) owner.hp = Math.min(owner.maxHp, owner.hp + stats.damage);
        this.particles.burst(owner.x, owner.y - 10, 26, 220, ["#b44df0", "#4de8ff", "#ffffff"], 0.9, 3.5, 0);
        sfx.pickup();
        this.shake.add(0.15);
      }
      return;
    }

    if (behavior === "quake") {
      const r = stats.radius;
      this.terrain.carveEllipse(p.x, p.y + r * 0.2, r * 1.7, r * 0.55);
      this.terrain.carveEllipse(p.x, p.y + r * 0.7, r * 1.2, r * 0.4);
      this.particles.burst(p.x, p.y, 50, 200, ["#c9a06a", "#7a5c3a", "#5a4428"], 1.3, 5, 420);
      sfx.explosion(0.9);
      this.shake.add(1);
      for (const tank of this.tanks) {
        if (!tank.alive) continue;
        const dx = Math.abs(tank.x - p.x);
        const dy = Math.abs(tank.y - p.y);
        if (dx < r * 1.7 && dy < r * 1.4) {
          const dmg = stats.damage * (1 - dx / (r * 1.7));
          if (dmg >= 1) this.applyDamage(tank, dmg, p.owner);
        }
      }
      return;
    }

    if (behavior === "cluster" && !p.isChild) {
      this.blastAt(p.x, p.y, 26, 14, p.owner, { direct: directHit });
      const count = stats.count ?? 4;
      for (let i = 0; i < count; i++) {
        const child = new Projectile({
          x: p.x, y: p.y - 6,
          vx: rngRange(this.rng, -190, 190),
          vy: rngRange(this.rng, -380, -180),
          def: p.def, stats, owner: p.owner,
        });
        child.isChild = true;
        this.projectiles.push(child);
      }
      return;
    }

    if (behavior === "airstrike" && !p.isChild) {
      this.blastAt(p.x, p.y, 20, 10, p.owner, { direct: directHit });
      const count = stats.count ?? 4;
      const dir = p.vx >= 0 ? 1 : -1;
      for (let i = 0; i < count; i++) {
        const bx = clamp(p.x + (i - (count - 1) / 2) * 60 + rngRange(this.rng, -12, 12), 20, WORLD_W - 20);
        this.pendingSpawns.push({
          delay: 0.3 + i * 0.13,
          make: () => {
            const bomb = new Projectile({
              x: bx, y: -20,
              vx: dir * 40, vy: 160,
              def: p.def, stats, owner: p.owner,
            });
            bomb.isChild = true;
            return bomb;
          },
        });
      }
      return;
    }

    if (behavior === "napalm" && !p.isChild) {
      this.blastAt(p.x, p.y, stats.radius * 0.9, stats.damage, p.owner, { direct: directHit });
      const count = stats.count ?? 6;
      for (let i = 0; i < count; i++) {
        this.pendingBlasts.push({
          delay: 0.14 + i * 0.15,
          x: clamp(p.x + rngRange(this.rng, -stats.radius * 2.4, stats.radius * 2.4), 10, WORLD_W - 10),
          y: p.y + rngRange(this.rng, -10, 26),
          radius: stats.radius * 0.75,
          damage: stats.damage,
          owner: p.owner,
        });
      }
      return;
    }

    let damage = stats.damage;
    if (behavior === "bouncer") damage *= 1 + (stats.bounceBonus ?? 0.3) * p.bounces;

    this.blastAt(p.x, p.y, stats.radius, damage, p.owner, {
      direct: directHit,
      splashMul: behavior === "sniper" ? 0.4 : 1,
      healFrac: behavior === "leech" ? 0.55 : 0,
    });
  }

  private applyDamage(tank: Tank, rawDmg: number, source: Tank): void {
    let dmg = Math.round(rawDmg);
    if (source.isJuggernaut && tank !== source) dmg = Math.round(dmg * 1.4);
    tank.hp = Math.max(0, tank.hp - dmg);
    if (tank.isEnemyOf(source)) {
      source.damageDealt += dmg;
      this.grantXp(source, dmg);
    }
    if (tank.hp <= 0 && tank.alive) this.killTank(tank, source);
  }

  private killTank(tank: Tank, killer?: Tank): void {
    tank.alive = false;
    if (killer && killer.isEnemyOf(tank)) killer.kills++;
    this.particles.explosion(tank.x, tank.y - 8, 55);
    this.particles.burst(tank.x, tank.y - 8, 26, 320, [tank.palette.primary, tank.palette.glow, "#ffffff"], 1.4, 4, 380);
    sfx.explosion(1);
    this.shake.add(0.8);
    this.ui.banner(`${tank.name} DESTROYED`, tank.palette.glow);
  }

  private grantXp(tank: Tank, amount: number): void {
    tank.xp += amount;
    const newLevel = levelForXp(tank.xp);
    if (newLevel > tank.level) {
      tank.upgradePoints += newLevel - tank.level;
      tank.level = newLevel;
      sfx.levelUp();
      if (!tank.isAI) {
        this.ui.banner("LEVEL UP!", "#b6ff4d");
      } else {
        // AI spends immediately on a weapon it actually uses.
        while (tank.upgradePoints > 0) {
          const candidates = ["shell", "mortar", "sniper", "cluster"]
            .map((id) => WEAPONS.findIndex((w) => w.id === id))
            .filter((i) => tank.weaponTiers[i] < 2);
          if (candidates.length === 0) break;
          tank.weaponTiers[rngPick(this.rng, candidates)]++;
          tank.upgradePoints--;
        }
      }
    }
    if (tank === this.currentTank || !tank.isAI) this.ui.updateXp(tank);
  }

  upgradeWeapon(weaponIndex: number, fromNet = false, seat?: number): void {
    const t = fromNet && seat !== undefined
      ? this.tanks.find((tk) => tk.seat === seat)
      : this.currentTank;
    if (!t) return;
    if (!fromNet) {
      if (this.online ? !this.isMyTurn() : t.isAI) return;
      if (weaponIndex < 0) { this.ui.showUpgradePanel(t); return; }
    }
    if (t.upgradePoints <= 0 || t.weaponTiers[weaponIndex] >= 2) return;
    t.weaponTiers[weaponIndex]++;
    t.upgradePoints--;
    if (!fromNet && this.online) this.online.send("upgrade", { weaponIndex });
    sfx.levelUp();
    if (!fromNet) {
      this.ui.updateWeapons(t);
      this.ui.updateXp(t);
      if (t.upgradePoints > 0) this.ui.showUpgradePanel(t);
      else this.ui.closeUpgradePanel();
    }
  }

  selectWeapon(index: number): void {
    if (this.phase !== "input" || !this.isMyTurn()) return;
    this.currentTank.selectedWeapon = clamp(index, 0, WEAPONS.length - 1);
    sfx.ui();
    this.ui.updateWeapons(this.currentTank);
  }

  // ---------- Online: remote inputs & turn sync ----------

  remoteAim(seat: number, angle: number, power: number): void {
    const t = this.tanks.find((tk) => tk.seat === seat);
    if (!t || t !== this.currentTank) return;
    t.angle = angle;
    t.power = clamp(power, 1, 100);
  }

  remoteDrive(seat: number, x: number, y: number, fuel: number, facing: 1 | -1): void {
    const t = this.tanks.find((tk) => tk.seat === seat);
    if (!t || t !== this.currentTank) return;
    t.x = clamp(x, TANK_RADIUS, WORLD_W - TANK_RADIUS);
    t.y = y;
    t.fuel = fuel;
    t.facing = facing;
  }

  remoteFire(seat: number, msg: FireMsg): void {
    const t = this.tanks.find((tk) => tk.seat === seat);
    if (!t || t !== this.currentTank || this.phase !== "input") return;
    t.x = msg.x; t.y = msg.y;
    t.angle = msg.angle;
    t.power = clamp(msg.power, 1, 100);
    t.selectedWeapon = clamp(msg.weapon, 0, WEAPONS.length - 1);
    this.ui.updateWeapons(t);
    this.fire(true);
  }

  remoteSplit(seat: number, msg: SplitMsg): void {
    const t = this.tanks.find((tk) => tk.seat === seat);
    if (!t) return;
    let p = this.projectiles.find((pr) => pr.alive && pr.def.behavior === "splitter" && !pr.hasSplit);
    if (!p) {
      // Our sim raced ahead — recreate the shell at the reported state.
      p = new Projectile({ x: msg.x, y: msg.y, vx: msg.vx, vy: msg.vy, def: t.weaponDef, stats: t.weaponStats, owner: t });
      this.projectiles.push(p);
      if (this.phase !== "projectiles") this.phase = "projectiles";
    }
    p.x = msg.x; p.y = msg.y; p.vx = msg.vx; p.vy = msg.vy;
    p.splitRequested = true;
  }

  remoteCrate(seat: number, index: number): void {
    const t = this.tanks.find((tk) => tk.seat === seat);
    const crate = this.crates[index];
    if (!t || !crate || crate.collected) return;
    this.applyCrate(t, crate);
  }

  /** Server-driven turn advance (also handles skip when snapshot is null). */
  advanceTurn(nextSeat: number, snapshot: Snapshot | null, gameOver: boolean): void {
    // Catch up if our sim is mid-flight (hidden tab, lag, missed frames).
    let guard = 0;
    while ((this.phase === "projectiles" || this.phase === "settle") && guard++ < 5400) {
      this.update(1 / 60, true);
    }
    if (snapshot) this.applySnapshot(snapshot);
    if (gameOver) {
      const result = this.evaluateWinner();
      this.finishGame(result.over ? result : { over: true, winner: null });
      return;
    }
    const idx = this.tanks.findIndex((t) => t.seat === nextSeat);
    this.beginTurn(idx >= 0 ? idx : this.computeNextIndex());
  }

  buildSnapshot(): Snapshot {
    return {
      tanks: this.tanks.map((t) => ({
        seat: t.seat, x: t.x, y: t.y,
        hp: t.hp, maxHp: t.maxHp, fuel: t.fuel, alive: t.alive,
        xp: t.xp, level: t.level, up: t.upgradePoints, tiers: [...t.weaponTiers],
        kills: t.kills, dmg: t.damageDealt, turns: t.turnsTaken,
      })),
      crates: this.crates.map((c) => ({ kind: c.kind, x: c.x, y: c.y, landed: c.landed, collected: c.collected })),
    };
  }

  private applySnapshot(s: Snapshot): void {
    for (const ts of s.tanks) {
      const t = this.tanks.find((tk) => tk.seat === ts.seat);
      if (!t) continue;
      t.x = ts.x; t.y = ts.y;
      t.hp = ts.hp; t.maxHp = ts.maxHp; t.fuel = ts.fuel;
      t.alive = ts.alive;
      t.xp = ts.xp; t.level = ts.level; t.upgradePoints = ts.up;
      t.weaponTiers = [...ts.tiers];
      t.kills = ts.kills; t.damageDealt = ts.dmg; t.turnsTaken = ts.turns;
    }
    this.crates = s.crates.map((cs) => {
      const c = new Crate(cs.kind, cs.x, cs.y);
      c.landed = cs.landed;
      c.collected = cs.collected;
      return c;
    });
  }

  // ---------- Input ----------

  private bindInput(): void {
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.key.toLowerCase());
      if (e.key === " ") {
        e.preventDefault();
        if (this.phase === "input" && this.isMyTurn()) this.fire();
        else if (this.phase === "projectiles") this.requestSplit();
      }
      if (this.phase === "input" && this.isMyTurn()) {
        const num = e.key === "0" ? 10 : parseInt(e.key, 10);
        if (num >= 1 && num <= 10) this.selectWeapon(num - 1);
        if (e.key.toLowerCase() === "u") {
          if (this.ui.upgradePanelOpen) this.ui.closeUpgradePanel();
          else if (this.currentTank.upgradePoints > 0) this.ui.showUpgradePanel(this.currentTank);
        }
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => this.keys.clear());

    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (this.phase !== "input" || !this.isMyTurn()) return;
      const dir = e.deltaY > 0 ? 1 : -1;
      this.selectWeapon((this.currentTank.selectedWeapon + dir + WEAPONS.length) % WEAPONS.length);
    }, { passive: false });

    this.canvas.addEventListener("pointerdown", (e) => {
      if (this.phase !== "input" || !this.isMyTurn()) return;
      this.aiming = true;
      this.aimFromPointer(e);
    });
    window.addEventListener("pointermove", (e) => {
      if (this.aiming) this.aimFromPointer(e);
    });
    window.addEventListener("pointerup", () => (this.aiming = false));
  }

  private aimFromPointer(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * WORLD_W;
    const y = ((e.clientY - rect.top) / rect.height) * WORLD_H;
    const t = this.currentTank;
    t.angle = Math.atan2(y - (t.y - 10), x - t.x);
    t.power = clamp(dist(t.x, t.y - 10, x, y) * 0.28, 1, 100);
    this.aimDirty = true;
  }

  private handleHeldKeys(dt: number): void {
    if (this.phase !== "input" || !this.isMyTurn() || this.ui.upgradePanelOpen) return;
    const t = this.currentTank;
    const aimSpeed = (this.keys.has("shift") ? 0.25 : 0.9) * dt;
    if (this.keys.has("arrowup")) { t.angle -= aimSpeed; this.aimDirty = true; }
    if (this.keys.has("arrowdown")) { t.angle += aimSpeed; this.aimDirty = true; }
    if (this.keys.has("w")) { t.power = clamp(t.power + 34 * dt, 1, 100); this.aimDirty = true; }
    if (this.keys.has("s")) { t.power = clamp(t.power - 34 * dt, 1, 100); this.aimDirty = true; }
    if (this.keys.has("arrowleft") || this.keys.has("a")) { if (t.drive(-1, this.terrain, dt)) this.driveDirty = true; }
    if (this.keys.has("arrowright") || this.keys.has("d")) { if (t.drive(1, this.terrain, dt)) this.driveDirty = true; }
  }

  private flushNet(dt: number): void {
    if (!this.online || !this.isMyTurn() || this.phase !== "input") return;
    this.netAccum += dt;
    if (this.netAccum < 0.12) return;
    this.netAccum = 0;
    const t = this.currentTank;
    if (this.aimDirty) {
      this.online.send("aim", { angle: t.angle, power: t.power });
      this.aimDirty = false;
    }
    if (this.driveDirty) {
      this.online.send("drive", { x: t.x, y: t.y, fuel: t.fuel, facing: t.facing });
      this.driveDirty = false;
    }
  }

  // ---------- Simulation ----------

  update(dt: number, catchUp = false): void {
    if (this.phase === "idle" || this.phase === "gameover") {
      this.particles.update(dt);
      this.shake.update(dt);
      return;
    }

    if (!catchUp) this.handleHeldKeys(dt);
    this.particles.update(dt);
    this.shake.update(dt);
    this.flushNet(dt);
    for (const b of this.beams) b.life -= dt;
    this.beams = this.beams.filter((b) => b.life > 0);
    for (const crate of this.crates) crate.update(this.terrain, dt);

    // Tanks always settle (terrain may vanish beneath anyone at any time).
    for (const tank of this.tanks) {
      if (!tank.alive) continue;
      const fallDmg = tank.settle(this.terrain, dt);
      if (fallDmg > 0) {
        this.applyDamage(tank, fallDmg, tank);
        this.particles.sparks(tank.x, tank.y, 6);
      }
      if (tank.y > WORLD_H - 2 && tank.alive) {
        this.killTank(tank, this.phase === "projectiles" || this.phase === "settle" ? this.currentTank : undefined);
        this.particles.burst(tank.x, WORLD_H - 10, 30, 260, ["#4de8ff", "#ffffff", tank.palette.glow], 1.2, 4, -80);
        this.ui.banner(`${tank.name} FELL INTO THE VOID`, "#4de8ff");
      }
      this.collectCrates(tank);
    }

    if (this.phase === "input") this.updateInputPhase(dt);
    else if (this.phase === "projectiles") this.updateProjectiles(dt);
    else if (this.phase === "settle") this.updateSettle(dt);

    // Mid-turn deaths (void, fall damage) can end the match outside settle.
    if (this.phase === "input" && this.evaluateWinner().over) {
      this.phase = "settle";
      this.settleTime = 0.8;
    }

    // HUD refresh
    const t = this.currentTank;
    if (t && !catchUp) {
      this.ui.updateAim(t);
      this.ui.updateTimer(this.turnTimeLeft, this.settings.turnSeconds > 0 && this.phase === "input");
    }
  }

  private updateInputPhase(dt: number): void {
    const t = this.currentTank;
    if (!t.alive) {
      if (this.online) return; // server will skip
      this.nextTurn();
      return;
    }

    if (!this.online && t.isAI) {
      this.aiTimer += dt;
      if (this.aiTimer > 0.9 && !this.aiPlan) {
        this.aiPlan = planShot(t, this.tanks, this.terrain, this.wind);
        t.selectedWeapon = this.aiPlan.weaponIndex;
        this.ui.updateWeapons(t);
      }
      if (this.aiPlan && !this.aiFired) {
        const ease = Math.min(1, (this.aiTimer - 0.9) / 1.1);
        t.angle += (this.aiPlan.angle - t.angle) * ease * 0.2;
        t.power += (this.aiPlan.power - t.power) * ease * 0.2;
        if (ease >= 1) {
          t.angle = this.aiPlan.angle;
          t.power = this.aiPlan.power;
          this.aiFired = true;
          this.fire();
        }
      }
      return;
    }

    if (this.settings.turnSeconds > 0 && !(this.ui.upgradePanelOpen && !this.online)) {
      this.turnTimeLeft -= dt;
      if (this.turnTimeLeft <= 0 && this.isMyTurn()) {
        this.ui.banner("TIME'S UP", "#ff4dd8");
        this.fire();
      }
    }
  }

  private updateProjectiles(dt: number): void {
    for (const pb of this.pendingBlasts) {
      pb.delay -= dt;
      if (pb.delay <= 0) {
        this.blastAt(pb.x, pb.y, pb.radius, pb.damage, pb.owner, { healFrac: pb.healFrac });
      }
    }
    this.pendingBlasts = this.pendingBlasts.filter((pb) => pb.delay > 0);

    for (const ps of this.pendingSpawns) {
      ps.delay -= dt;
      if (ps.delay <= 0) this.projectiles.push(ps.make());
    }
    this.pendingSpawns = this.pendingSpawns.filter((ps) => ps.delay > 0);

    const substeps = 4;
    const h = dt / substeps;

    for (const p of this.projectiles) {
      if (!p.alive) continue;
      p.age += dt;

      if (p.splitRequested && !p.hasSplit) {
        this.split(p);
        continue;
      }

      for (let s = 0; s < substeps && p.alive; s++) {
        this.stepProjectile(p, h);
      }

      if (p.alive && !p.resting) {
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 26) p.trail.shift();
      }
    }

    this.projectiles = this.projectiles.filter((p) => p.alive);
    if (this.projectiles.length === 0 && this.pendingBlasts.length === 0 && this.pendingSpawns.length === 0) {
      this.phase = "settle";
      this.settleTime = 0.9;
    }
  }

  private stepProjectile(p: Projectile, h: number): void {
    const b = p.def.behavior;

    if (p.rolling) {
      this.stepRoller(p, h);
      return;
    }

    if (p.resting) {
      // Grenade parked on the ground, fuse burning.
      if (p.age >= (p.stats.fuse ?? 2.2)) this.explode(p, null);
      else if (!this.terrain.solid(p.x, p.y + 2)) p.resting = false; // ground gone
      return;
    }

    if (p.digging) {
      p.digElapsed += h;
      p.x += p.vx * h * 0.4;
      p.y += p.vy * h * 0.4;
      p.vy += GRAVITY * p.def.gravityMul * h * 0.4;
      this.terrain.carve(p.x, p.y, (p.stats.radius ?? 30) * 0.45);
      if (Math.random() < 0.5) this.particles.spawn(p.x, p.y, rngRange(Math.random, -60, 60), rngRange(Math.random, -120, -30), 0.5, 3, "#b68d5c", 300);
      const hitTank = this.findTankHit(p);
      if (hitTank) { this.explode(p, hitTank); return; }
      if (p.digElapsed >= (p.stats.digTime ?? 1)) { this.explode(p, null); return; }
      if (p.y > WORLD_H + 40) { p.alive = false; }
      return;
    }

    // MIRV pops at apex.
    if (b === "mirv" && !p.hasSplit && p.age > 0.25 && p.vy >= 0) {
      p.hasSplit = true;
      sfx.split();
      this.particles.sparks(p.x, p.y, 12);
      const count = p.stats.count ?? 4;
      for (let i = 0; i < count; i++) {
        const child = new Projectile({
          x: p.x, y: p.y,
          vx: p.vx + (i - (count - 1) / 2) * 85,
          vy: p.vy,
          def: p.def, stats: p.stats, owner: p.owner,
        });
        child.hasSplit = true;
        child.isChild = true;
        this.projectiles.push(child);
      }
      p.alive = false;
      return;
    }

    // Homing steers toward the nearest enemy once armed.
    if (b === "homing" && p.age > 0.45) {
      let target: Tank | null = null;
      let bestD = Infinity;
      for (const tank of this.tanks) {
        if (!tank.alive || !tank.isEnemyOf(p.owner)) continue;
        const d = dist(p.x, p.y, tank.x, tank.y);
        if (d < bestD) { bestD = d; target = tank; }
      }
      if (target) {
        const desired = Math.atan2(target.y - 8 - p.y, target.x - p.x);
        const cur = Math.atan2(p.vy, p.vx);
        let diff = desired - cur;
        while (diff > Math.PI) diff -= TAU;
        while (diff < -Math.PI) diff += TAU;
        const maxTurn = (p.stats.turnRate ?? 2) * h;
        const na = cur + clamp(diff, -maxTurn, maxTurn);
        const speed = Math.hypot(p.vx, p.vy);
        p.vx = Math.cos(na) * speed;
        p.vy = Math.sin(na) * speed;
        if (Math.random() < 0.6) this.particles.spawn(p.x, p.y, -p.vx * 0.1, -p.vy * 0.1, 0.3, 2.5, "#ff4d6b", 0);
      }
      if (p.age > 5) { this.explode(p, null); return; }
    }

    p.vx += this.wind * p.def.windMul * h;
    p.vy += GRAVITY * p.def.gravityMul * h;
    p.x += p.vx * h;
    p.y += p.vy * h;

    if (p.x < -500 || p.x > WORLD_W + 500 || p.y > WORLD_H + 60) {
      p.alive = false;
      return;
    }

    const hitTank = this.findTankHit(p);
    if (hitTank) {
      this.explode(p, hitTank);
      return;
    }

    if (this.terrain.solid(p.x, p.y)) {
      if (b === "digger") {
        p.digging = true;
        return;
      }
      if (b === "bouncer" && p.bounces < 4) {
        this.bounceProjectile(p, 0.72, true);
        return;
      }
      if (b === "grenade") {
        if (Math.hypot(p.vx, p.vy) > 110) {
          this.bounceProjectile(p, 0.5, false);
        } else {
          // Come to rest just above the surface and wait for the fuse.
          let guard = 0;
          while (this.terrain.solid(p.x, p.y) && guard++ < 40) p.y--;
          p.vx = 0; p.vy = 0;
          p.resting = true;
        }
        return;
      }
      if (b === "roller") {
        p.rolling = true;
        p.rollDir = p.vx >= 0 ? 1 : -1;
        while (this.terrain.solid(p.x, p.y) && p.y > 0) p.y--;
        return;
      }
      this.explode(p, null);
    }
  }

  private bounceProjectile(p: Projectile, restitution: number, explodeWhenSlow: boolean): void {
    // Estimate the surface normal from the solid-mask gradient.
    let nx = 0, ny = 0;
    const r = 4;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (this.terrain.solid(p.x + dx, p.y + dy)) { nx -= dx; ny -= dy; }
      }
    }
    const len = Math.hypot(nx, ny) || 1;
    nx /= len; ny /= len;
    let guard = 0;
    while (this.terrain.solid(p.x, p.y) && guard++ < 40) { p.x += nx; p.y += ny; }
    const dot = p.vx * nx + p.vy * ny;
    p.vx = (p.vx - 2 * dot * nx) * restitution;
    p.vy = (p.vy - 2 * dot * ny) * restitution;
    p.bounces++;
    sfx.bounce();
    this.particles.sparks(p.x, p.y, 6);
    if (explodeWhenSlow && Math.hypot(p.vx, p.vy) < 60) this.explode(p, null);
  }

  private stepRoller(p: Projectile, h: number): void {
    p.rollElapsed += h;
    const speed = 150;
    const nextX = p.x + p.rollDir * speed * h;
    const surface = this.terrain.surfaceY(nextX, Math.max(0, p.y - 20) | 0);
    if (surface < 0) {
      p.rolling = false;
      p.vx = p.rollDir * speed;
      p.vy = 0;
      return;
    }
    if (p.y - surface > 24) {
      this.explode(p, null);
      return;
    }
    p.x = nextX;
    p.y = surface - 2;
    if (Math.random() < 0.4) this.particles.spawn(p.x, p.y, rngRange(Math.random, -30, 30), rngRange(Math.random, -80, -20), 0.35, 2.5, p.def.trailColor, 250);
    const hitTank = this.findTankHit(p);
    if (hitTank) { this.explode(p, hitTank); return; }
    if (p.rollElapsed > 2.4 || p.x < 6 || p.x > WORLD_W - 6) this.explode(p, null);
  }

  private findTankHit(p: Projectile): Tank | null {
    for (const tank of this.tanks) {
      if (!tank.alive) continue;
      if (tank === p.owner && p.age < 0.35) continue;
      if (dist(p.x, p.y, tank.x, tank.y - 8) < TANK_RADIUS + 5) return tank;
    }
    return null;
  }

  private updateSettle(dt: number): void {
    this.settleTime -= dt;
    const anyFalling = this.tanks.some((t) => t.alive && t.fallFrom >= 0);
    if (this.settleTime > 0 || anyFalling) return;

    if (this.online) {
      if (this.awaitingAdvance) return;
      this.phase = "sync";
      // The acting client reports the outcome; the server relays the advance.
      if (this.isMyTurn()) {
        const result = this.evaluateWinner();
        const msg: TurnEndMsg = {
          snapshot: this.buildSnapshot(),
          nextSeat: this.tanks[this.computeNextIndex()].seat,
          gameOver: result.over,
        };
        this.online.send("turnEnd", msg);
      }
      this.awaitingAdvance = true;
      return;
    }
    this.nextTurn();
  }

  private collectCrates(tank: Tank): void {
    if (!tank.alive) return;
    if (this.online && tank.seat !== this.online.mySeat) return; // owner's client reports pickups
    for (let i = 0; i < this.crates.length; i++) {
      const crate = this.crates[i];
      if (crate.collected || !crate.landed) continue;
      if (dist(tank.x, tank.y, crate.x, crate.y) < 30) {
        if (this.online) this.online.send("crate", { index: i });
        this.applyCrate(tank, crate);
      }
    }
  }

  private applyCrate(tank: Tank, crate: Crate): void {
    crate.collected = true;
    sfx.pickup();
    this.particles.sparks(crate.x, crate.y, 14);
    if (crate.kind === "health") tank.hp = Math.min(tank.maxHp, tank.hp + 30);
    else if (crate.kind === "fuel") tank.fuel = Math.min(tank.maxFuel + 100, tank.fuel + 60);
    else this.grantXp(tank, 40);
  }

  // ---------- Rendering ----------

  private buildBackground(): HTMLCanvasElement {
    const bg = document.createElement("canvas");
    bg.width = WORLD_W;
    bg.height = WORLD_H;
    const c = bg.getContext("2d")!;
    const grad = c.createLinearGradient(0, 0, 0, WORLD_H);
    grad.addColorStop(0, "#07070f");
    grad.addColorStop(0.5, "#10142e");
    grad.addColorStop(0.85, "#1d1440");
    grad.addColorStop(1, "#2b1050");
    c.fillStyle = grad;
    c.fillRect(0, 0, WORLD_W, WORLD_H);
    for (let i = 0; i < 220; i++) {
      const x = Math.random() * WORLD_W;
      const y = Math.random() * WORLD_H * 0.7;
      const s = Math.random() * 1.8 + 0.4;
      c.globalAlpha = Math.random() * 0.7 + 0.15;
      c.fillStyle = Math.random() < 0.85 ? "#cfe4ff" : "#ffd9f2";
      c.fillRect(x, y, s, s);
    }
    c.globalAlpha = 1;
    c.beginPath();
    c.arc(WORLD_W * 0.82, WORLD_H * 0.2, 60, 0, TAU);
    c.fillStyle = "#1a2c5c";
    c.fill();
    c.beginPath();
    c.arc(WORLD_W * 0.82, WORLD_H * 0.2, 60, 0, TAU);
    c.strokeStyle = "rgba(77,232,255,0.5)";
    c.lineWidth = 2;
    c.stroke();
    return bg;
  }

  draw(): void {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, WORLD_W, WORLD_H);
    ctx.translate(this.shake.offsetX, this.shake.offsetY);

    ctx.drawImage(this.bg, 0, 0);
    this.terrain.draw(ctx);

    const glow = 0.5 + 0.3 * Math.sin(performance.now() / 300);
    ctx.fillStyle = `rgba(77, 232, 255, ${glow * 0.55})`;
    ctx.fillRect(0, WORLD_H - 5, WORLD_W, 5);

    for (const crate of this.crates) crate.draw(ctx);

    for (let i = 0; i < this.tanks.length; i++) {
      this.tanks[i].draw(ctx, i === this.currentIndex && this.phase === "input");
    }

    if (this.phase === "input" && this.currentTank?.alive) {
      this.drawAimGuide(ctx, this.currentTank);
    }

    for (const b of this.beams) {
      const t = b.life / b.maxLife;
      ctx.save();
      ctx.globalAlpha = t;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 5 * t + 1;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
      ctx.restore();
    }

    for (const p of this.projectiles) p.draw(ctx);
    this.particles.draw(ctx);
  }

  private drawAimGuide(ctx: CanvasRenderingContext2D, t: Tank): void {
    const def = t.weaponDef;
    const v = t.power * POWER_TO_VELOCITY * def.speedMul;
    let x = t.barrelTip.x, y = t.barrelTip.y;
    let vx = Math.cos(t.angle) * v;
    let vy = Math.sin(t.angle) * v;
    const dt = 1 / 60;
    ctx.save();
    ctx.fillStyle = t.palette.glow;
    for (let i = 0; i < 38; i++) {
      vx += this.wind * def.windMul * dt;
      vy += GRAVITY * def.gravityMul * dt;
      x += vx * dt;
      y += vy * dt;
      if (this.terrain.solid(x, y)) break;
      if (i % 3 === 0) {
        ctx.globalAlpha = 0.75 * (1 - i / 38);
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
