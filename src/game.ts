import { Terrain } from "./terrain";
import { Tank, Projectile, Crate, CrateKind, TANK_PALETTES, TANK_RADIUS, GRAVITY } from "./entities";
import { Particles, ScreenShake } from "./particles";
import { WEAPONS, levelForXp } from "./weapons";
import { UI, MatchSettings } from "./ui";
import { planShot, AiPlan, POWER_TO_VELOCITY } from "./ai";
import { sfx } from "./audio";
import { clamp, dist, randRange, TAU, pick } from "./util";

export const WORLD_W = 1600;
export const WORLD_H = 900;

type Phase = "idle" | "input" | "projectiles" | "settle" | "gameover";

const WIND_RANGES = { none: 0, low: 35, realistic: 95, chaotic: 190 } as const;

export class Game {
  private terrain = new Terrain(WORLD_W, WORLD_H);
  private tanks: Tank[] = [];
  private projectiles: Projectile[] = [];
  private crates: Crate[] = [];
  private particles = new Particles();
  private shake = new ScreenShake();
  private bg: HTMLCanvasElement;

  private phase: Phase = "idle";
  private settings!: MatchSettings;
  private currentIndex = 0;
  private wind = 0;
  private turnTimeLeft = 0;
  private settleTime = 0;

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

  // ---------- Match lifecycle ----------

  start(settings: MatchSettings): void {
    this.settings = settings;
    this.terrain.generate(settings.terrainType);
    this.projectiles = [];
    this.crates = [];
    this.tanks = [];

    const n = settings.players.length;
    for (let i = 0; i < n; i++) {
      const p = settings.players[i];
      const x = WORLD_W * ((i + 0.5) / n) + randRange(-40, 40);
      let surface = this.terrain.surfaceY(x);
      let spawnX = x;
      // On island maps a column can be pure void — walk sideways to land.
      for (let tries = 0; surface < 0 && tries < 60; tries++) {
        spawnX = clamp(x + (tries % 2 === 0 ? 1 : -1) * (tries * 14), TANK_RADIUS, WORLD_W - TANK_RADIUS);
        surface = this.terrain.surfaceY(spawnX);
      }
      this.tanks.push(new Tank(
        p.name, TANK_PALETTES[i % TANK_PALETTES.length], p.isAI,
        spawnX, surface >= 0 ? surface : WORLD_H * 0.5,
        settings.startHp, settings.startFuel,
      ));
    }

    this.ui.buildHud();
    this.currentIndex = -1;
    this.nextTurn();
  }

  private nextTurn(): void {
    const alive = this.tanks.filter((t) => t.alive);
    if (alive.length <= 1) {
      this.phase = "gameover";
      this.ui.showGameOver(this.tanks, alive[0] ?? null);
      return;
    }
    do {
      this.currentIndex = (this.currentIndex + 1) % this.tanks.length;
    } while (!this.tanks[this.currentIndex].alive);

    this.rollWind();
    this.maybeDropCrate();
    this.turnTimeLeft = this.settings.turnSeconds;
    this.phase = "input";
    this.aiTimer = 0;
    this.aiPlan = null;
    this.aiFired = false;

    const t = this.currentTank;
    // Point the barrel at the nearest enemy so turns start naturally.
    const foe = this.tanks.filter((e) => e.alive && e !== t)
      .sort((a, b) => Math.abs(a.x - t.x) - Math.abs(b.x - t.x))[0];
    if (foe && Math.sign(foe.x - t.x) !== Math.sign(Math.cos(t.angle))) {
      t.angle = -Math.PI - t.angle;
    }
    this.ui.updateTurn(t, true);
    this.ui.updateWeapons(t);
    this.ui.updateXp(t);
    this.ui.banner(`${t.name}'s turn`, t.palette.glow);
  }

  private rollWind(): void {
    const range = WIND_RANGES[this.settings.windMode];
    this.wind = range === 0 ? 0 : randRange(-range, range);
    this.ui.updateWind(this.wind);
  }

  private maybeDropCrate(): void {
    if (!this.settings.crates || this.crates.filter((c) => !c.collected).length >= 3) return;
    if (Math.random() > 0.28) return;
    const kind = pick<CrateKind>(["health", "fuel", "xp"]);
    this.crates.push(new Crate(kind, randRange(60, WORLD_W - 60)));
  }

  // ---------- Firing ----------

  fire(): void {
    if (this.phase !== "input") return;
    const t = this.currentTank;
    const tip = t.barrelTip;
    const v = t.power * POWER_TO_VELOCITY * t.weaponDef.speedMul;
    this.projectiles.push(new Projectile({
      x: tip.x, y: tip.y,
      vx: Math.cos(t.angle) * v,
      vy: Math.sin(t.angle) * v,
      def: t.weaponDef,
      stats: t.weaponStats,
      owner: t,
    }));
    sfx.fire();
    this.particles.sparks(tip.x, tip.y, 10);
    this.shake.add(0.12);
    this.phase = "projectiles";
    this.ui.updateTurn(t, false);
    this.ui.closeUpgradePanel();
  }

  private requestSplit(): void {
    for (const p of this.projectiles) {
      if (p.alive && p.def.behavior === "splitter" && !p.hasSplit) p.splitRequested = true;
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
      this.projectiles.push(new Projectile({
        x: p.x, y: p.y,
        vx: p.vx + spread * 220,
        vy: p.vy + randRange(-40, 10),
        def: p.def,
        stats: p.stats,
        owner: p.owner,
      }));
      // Sub-shells are already split — mark so they can't split again.
      this.projectiles[this.projectiles.length - 1].hasSplit = true;
    }
  }

  // ---------- Explosions & damage ----------

  private explode(p: Projectile, directHit: Tank | null): void {
    p.alive = false;
    const { radius } = p.stats;
    const behavior = p.def.behavior;

    if (behavior === "shielder") {
      this.terrain.addDome(p.x, p.y, radius);
      this.particles.sparks(p.x, p.y, 24);
      sfx.bounce();
      this.shake.add(0.1);
      return;
    }

    let damage = p.stats.damage;
    if (behavior === "bouncer") {
      damage *= 1 + (p.stats.bounceBonus ?? 0.3) * p.bounces;
    }

    this.terrain.carve(p.x, p.y, radius);
    this.particles.explosion(p.x, p.y, radius);
    sfx.explosion(clamp(radius / 90, 0.2, 1));
    this.shake.add(clamp(radius / 110, 0.15, 0.75));

    for (const tank of this.tanks) {
      if (!tank.alive) continue;
      let dmg = 0;
      if (tank === directHit) {
        dmg = damage;
      } else {
        const d = dist(p.x, p.y, tank.x, tank.y - 8);
        const reach = radius + TANK_RADIUS;
        if (d < reach) dmg = damage * (1 - d / reach) * (behavior === "sniper" ? 0.4 : 1);
      }
      if (dmg < 1) continue;
      this.applyDamage(tank, dmg, p.owner);
    }

    // Explosions destroy crates too.
    for (const crate of this.crates) {
      if (!crate.collected && dist(p.x, p.y, crate.x, crate.y) < radius + 12) {
        crate.collected = true;
        this.particles.sparks(crate.x, crate.y, 12);
      }
    }
  }

  private applyDamage(tank: Tank, rawDmg: number, source: Tank): void {
    const dmg = Math.round(rawDmg);
    tank.hp = Math.max(0, tank.hp - dmg);
    if (source !== tank) {
      source.damageDealt += dmg;
      this.grantXp(source, dmg);
    }
    if (tank.hp <= 0 && tank.alive) this.killTank(tank);
  }

  private killTank(tank: Tank): void {
    tank.alive = false;
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
          const candidates = ["shell", "mortar", "sniper"]
            .map((id) => WEAPONS.findIndex((w) => w.id === id))
            .filter((i) => tank.weaponTiers[i] < 2);
          if (candidates.length === 0) break;
          tank.weaponTiers[pick(candidates)]++;
          tank.upgradePoints--;
        }
      }
    }
    if (tank === this.currentTank || !tank.isAI) this.ui.updateXp(tank);
  }

  upgradeWeapon(weaponIndex: number): void {
    const t = this.currentTank;
    if (t.isAI) return;
    if (weaponIndex < 0) { this.ui.showUpgradePanel(t); return; }
    if (t.upgradePoints <= 0 || t.weaponTiers[weaponIndex] >= 2) return;
    t.weaponTiers[weaponIndex]++;
    t.upgradePoints--;
    sfx.levelUp();
    this.ui.updateWeapons(t);
    this.ui.updateXp(t);
    if (t.upgradePoints > 0) this.ui.showUpgradePanel(t);
    else this.ui.closeUpgradePanel();
  }

  selectWeapon(index: number): void {
    if (this.phase !== "input" || this.currentTank.isAI) return;
    this.currentTank.selectedWeapon = clamp(index, 0, WEAPONS.length - 1);
    sfx.ui();
    this.ui.updateWeapons(this.currentTank);
  }

  // ---------- Input ----------

  private bindInput(): void {
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.key.toLowerCase());
      if (e.key === " ") {
        e.preventDefault();
        if (this.phase === "input" && !this.currentTank.isAI) this.fire();
        else if (this.phase === "projectiles") this.requestSplit();
      }
      if (this.phase === "input" && !this.currentTank.isAI) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= WEAPONS.length) this.selectWeapon(num - 1);
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
      if (this.phase !== "input" || this.currentTank.isAI) return;
      const dir = e.deltaY > 0 ? 1 : -1;
      this.selectWeapon((this.currentTank.selectedWeapon + dir + WEAPONS.length) % WEAPONS.length);
    }, { passive: false });

    this.canvas.addEventListener("pointerdown", (e) => {
      if (this.phase !== "input" || this.currentTank.isAI) return;
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
  }

  private handleHeldKeys(dt: number): void {
    if (this.phase !== "input" || this.currentTank.isAI || this.ui.upgradePanelOpen) return;
    const t = this.currentTank;
    const aimSpeed = (this.keys.has("shift") ? 0.25 : 0.9) * dt;
    if (this.keys.has("arrowup")) t.angle -= aimSpeed;
    if (this.keys.has("arrowdown")) t.angle += aimSpeed;
    if (this.keys.has("w")) t.power = clamp(t.power + 34 * dt, 1, 100);
    if (this.keys.has("s")) t.power = clamp(t.power - 34 * dt, 1, 100);
    if (this.keys.has("arrowleft") || this.keys.has("a")) t.drive(-1, this.terrain, dt);
    if (this.keys.has("arrowright") || this.keys.has("d")) t.drive(1, this.terrain, dt);
  }

  // ---------- Simulation ----------

  update(dt: number): void {
    if (this.phase === "idle" || this.phase === "gameover") {
      this.particles.update(dt);
      this.shake.update(dt);
      return;
    }

    this.handleHeldKeys(dt);
    this.particles.update(dt);
    this.shake.update(dt);
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
        tank.alive = false;
        this.particles.burst(tank.x, WORLD_H - 10, 30, 260, ["#4de8ff", "#ffffff", tank.palette.glow], 1.2, 4, -80);
        sfx.explosion(0.8);
        this.shake.add(0.6);
        this.ui.banner(`${tank.name} FELL INTO THE VOID`, "#4de8ff");
      }
      this.collectCrates(tank);
    }

    if (this.phase === "input") this.updateInputPhase(dt);
    else if (this.phase === "projectiles") this.updateProjectiles(dt);
    else if (this.phase === "settle") this.updateSettle(dt);

    // Mid-turn deaths (void, fall damage) can end the match outside settle.
    if (this.phase === "input" && this.tanks.filter((t) => t.alive).length <= 1) {
      this.phase = "settle";
      this.settleTime = 0.8;
    }

    // HUD refresh
    const t = this.currentTank;
    if (t) {
      this.ui.updateAim(t);
      this.ui.updateTimer(this.turnTimeLeft, this.settings.turnSeconds > 0 && this.phase === "input");
    }
  }

  private updateInputPhase(dt: number): void {
    const t = this.currentTank;
    if (!t.alive) { this.nextTurn(); return; }

    if (t.isAI) {
      this.aiTimer += dt;
      if (this.aiTimer > 0.9 && !this.aiPlan) {
        this.aiPlan = planShot(t, this.tanks, this.terrain, this.wind);
        t.selectedWeapon = this.aiPlan.weaponIndex;
        this.ui.updateWeapons(t);
      }
      if (this.aiPlan && !this.aiFired) {
        // Ease the barrel toward the planned shot so the player can read it.
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

    if (this.settings.turnSeconds > 0 && !this.ui.upgradePanelOpen) {
      this.turnTimeLeft -= dt;
      if (this.turnTimeLeft <= 0) {
        this.ui.banner("TIME'S UP", "#ff4dd8");
        this.fire();
      }
    }
  }

  private updateProjectiles(dt: number): void {
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

      if (p.alive) {
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 26) p.trail.shift();
      }
    }

    this.projectiles = this.projectiles.filter((p) => p.alive);
    if (this.projectiles.length === 0) {
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

    if (p.digging) {
      // Grind through the ground at reduced speed, carving as we go.
      p.digElapsed += h;
      p.x += p.vx * h * 0.4;
      p.y += p.vy * h * 0.4;
      p.vy += GRAVITY * p.def.gravityMul * h * 0.4;
      this.terrain.carve(p.x, p.y, (p.stats.radius ?? 30) * 0.45);
      if (Math.random() < 0.5) this.particles.spawn(p.x, p.y, randRange(-60, 60), randRange(-120, -30), 0.5, 3, "#b68d5c", 300);
      const hitTank = this.findTankHit(p);
      if (hitTank) { this.explode(p, hitTank); return; }
      if (p.digElapsed >= (p.stats.digTime ?? 1)) { this.explode(p, null); return; }
      if (p.y > WORLD_H + 40) { p.alive = false; }
      return;
    }

    p.vx += this.wind * p.def.windMul * h;
    p.vy += GRAVITY * p.def.gravityMul * h;
    p.x += p.vx * h;
    p.y += p.vy * h;

    // Out of world (sides/top are open sky; bottom is the void)
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
        this.bounceProjectile(p);
        return;
      }
      if (b === "roller") {
        p.rolling = true;
        p.rollDir = p.vx >= 0 ? 1 : -1;
        // Pop above the surface before rolling starts.
        while (this.terrain.solid(p.x, p.y) && p.y > 0) p.y--;
        return;
      }
      this.explode(p, null);
    }
  }

  private bounceProjectile(p: Projectile): void {
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
    // Move out of the ground, then reflect with restitution.
    let guard = 0;
    while (this.terrain.solid(p.x, p.y) && guard++ < 40) { p.x += nx; p.y += ny; }
    const dot = p.vx * nx + p.vy * ny;
    p.vx = (p.vx - 2 * dot * nx) * 0.72;
    p.vy = (p.vy - 2 * dot * ny) * 0.72;
    p.bounces++;
    sfx.bounce();
    this.particles.sparks(p.x, p.y, 6);
    if (Math.hypot(p.vx, p.vy) < 60) this.explode(p, null);
  }

  private stepRoller(p: Projectile, h: number): void {
    p.rollElapsed += h;
    const speed = 150;
    const nextX = p.x + p.rollDir * speed * h;
    const surface = this.terrain.surfaceY(nextX, Math.max(0, p.y - 20) | 0);
    if (surface < 0) {
      // Rolled off a cliff — back to free flight.
      p.rolling = false;
      p.vx = p.rollDir * speed;
      p.vy = 0;
      return;
    }
    if (p.y - surface > 24) {
      // Wall ahead: detonate against it.
      this.explode(p, null);
      return;
    }
    p.x = nextX;
    p.y = surface - 2;
    if (Math.random() < 0.4) this.particles.spawn(p.x, p.y, randRange(-30, 30), randRange(-80, -20), 0.35, 2.5, p.def.trailColor, 250);
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
    if (this.settleTime <= 0 && !anyFalling) {
      this.nextTurn();
    }
  }

  private collectCrates(tank: Tank): void {
    if (!tank.alive) return;
    for (const crate of this.crates) {
      if (crate.collected || !crate.landed) continue;
      if (dist(tank.x, tank.y, crate.x, crate.y) < 30) {
        crate.collected = true;
        sfx.pickup();
        this.particles.sparks(crate.x, crate.y, 14);
        if (crate.kind === "health") tank.hp = Math.min(tank.maxHp, tank.hp + 30);
        else if (crate.kind === "fuel") tank.fuel = Math.min(tank.maxFuel + 100, tank.fuel + 60);
        else this.grantXp(tank, 40);
      }
    }
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
    // Distant neon planet
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

    // Void plasma line at the map's bottom edge
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

    for (const p of this.projectiles) p.draw(ctx);
    this.particles.draw(ctx);
  }

  /** Short dotted arc previewing the first fraction of the trajectory. */
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
