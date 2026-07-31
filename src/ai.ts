import { Tank, GRAVITY, TANK_RADIUS } from "./entities";
import { Terrain } from "./terrain";
import { WEAPONS } from "./weapons";
import { clamp, dist, pick } from "./util";

export interface AiPlan {
  weaponIndex: number;
  angle: number;
  power: number;
}

/**
 * Shared with game.ts firing code. Paired with the reduced GRAVITY in
 * entities.ts (v·k / g·k²) so range per power setting is unchanged while
 * shells stay in the air noticeably longer.
 */
export const POWER_TO_VELOCITY = 7.7;

/**
 * Cheap ballistic sim against the terrain mask. Returns the impact point,
 * or the point where the shot left the world.
 */
function simulateImpact(
  terrain: Terrain,
  startX: number, startY: number,
  angle: number, power: number,
  speedMul: number, gravityMul: number, windMul: number, wind: number,
): { x: number; y: number } {
  const v = power * POWER_TO_VELOCITY * speedMul;
  // Longer flights need more integration headroom than the old fast shells.
  let x = startX, y = startY;
  let vx = Math.cos(angle) * v;
  let vy = Math.sin(angle) * v;
  const dt = 1 / 60;
  for (let i = 0; i < 1400; i++) {
    vx += wind * windMul * dt;
    vy += GRAVITY * gravityMul * dt;
    x += vx * dt;
    y += vy * dt;
    if (terrain.solid(x, y)) return { x, y };
    if (y > terrain.height + 60 || x < -400 || x > terrain.width + 400) return { x, y };
  }
  return { x, y };
}

/** Lowest achievable impact error when firing from (x, y). */
function bestErrorFrom(
  x: number, y: number, target: Tank, terrain: Terrain, wind: number,
  def: { speedMul: number; gravityMul: number; windMul: number },
  shooter: Tank, samples: number,
): number {
  const towards = target.x > x ? 1 : -1;
  let best = Infinity;
  for (let i = 0; i < samples; i++) {
    const elevation = 0.12 + Math.random() * 1.35;
    const angle = towards === 1 ? -elevation : -Math.PI + elevation;
    const power = 22 + Math.random() * 78;
    const impact = simulateImpact(
      terrain, x, y, angle, power,
      def.speedMul * shooter.attrs.velocity, def.gravityMul,
      def.windMul * shooter.attrs.wind, wind,
    );
    const err = dist(impact.x, impact.y, target.x, target.y);
    if (err < best) best = err;
  }
  return best;
}

/**
 * Picks a firing position. The AI probes a few spots within its fuel range and
 * moves only when the new spot is clearly better — which is what gives the
 * mobile chassis their value.
 */
export function planMove(
  shooter: Tank, tanks: Tank[], terrain: Terrain, wind: number,
  banned: ReadonlySet<number> = new Set(),
): number {
  if (shooter.fuel <= 5) return shooter.x;
  const enemies = tanks.filter((t) => t.alive && t.isEnemyOf(shooter));
  if (enemies.length === 0) return shooter.x;

  let target = enemies[0];
  let bestScore = Infinity;
  for (const e of enemies) {
    const score = e.hp * 2 + dist(shooter.x, shooter.y, e.x, e.y) * 0.1 - (e.isVIP ? 60 : 0);
    if (score < bestScore) { bestScore = score; target = e; }
  }

  const idx = WEAPONS.findIndex((w, i) => w.id === "shell" && !banned.has(i));
  const def = WEAPONS[idx >= 0 ? idx : 0];

  // Fuel burns at 0.55 per pixel travelled.
  const reach = Math.min(150, shooter.fuel / 0.55);
  if (reach < 25) return shooter.x;

  const here = bestErrorFrom(shooter.x, shooter.y - 10, target, terrain, wind, def, shooter, 70);
  let bestX = shooter.x;
  let bestErr = here;

  for (const frac of [-1, -0.5, 0.5, 1]) {
    const x = clamp(shooter.x + reach * frac, TANK_RADIUS, terrain.width - TANK_RADIUS);
    const surface = terrain.surfaceY(x);
    if (surface < 0) continue;                       // void — not a firing position
    if (Math.abs(surface - shooter.y) > 90) continue; // cliff we could not drive
    const err = bestErrorFrom(x, surface - 10, target, terrain, wind, def, shooter, 70);
    if (err < bestErr) { bestErr = err; bestX = x; }
  }

  // Only commit when the move is a real improvement, so tanks don't jitter.
  return bestErr < here * 0.75 ? bestX : shooter.x;
}

/**
 * Sample candidate shots and keep the one landing closest to the chosen
 * target, then blur the result so the AI stays beatable.
 */
export function planShot(
  shooter: Tank, tanks: Tank[], terrain: Terrain, wind: number,
  banned: ReadonlySet<number> = new Set(),
): AiPlan {
  const enemies = tanks.filter((t) => t.alive && t.isEnemyOf(shooter));
  if (enemies.length === 0) {
    // Everyone's dead or friendly (points-mode respawn gap) — fire far off to the side.
    const safe = Math.max(0, WEAPONS.findIndex((_, i) => !banned.has(i)));
    return { weaponIndex: safe, angle: shooter.x < 800 ? -Math.PI / 4 : -Math.PI * 0.75, power: 100 };
  }
  // Prefer wounded targets, with a distance tiebreak. VIPs are priority prey.
  let target = enemies[0];
  let bestScore = Infinity;
  for (const e of enemies) {
    const score = e.hp * 2 + dist(shooter.x, shooter.y, e.x, e.y) * 0.1 - (e.isVIP ? 60 : 0);
    if (score < bestScore) { bestScore = score; target = e; }
  }

  // AI sticks to predictable-arc weapons; nuke comes out for wounded prey.
  const pool = ["shell", "shell", "mortar", "sniper", "cluster"];
  if (target.hp < 45) pool.push("nuke");
  const allowed = pool
    .map((id) => WEAPONS.findIndex((w) => w.id === id))
    .filter((i) => i >= 0 && !banned.has(i));
  // If the host banned everything the AI likes, spread across whatever is
  // left rather than hammering the same fallback gun every turn.
  const fallback = WEAPONS.map((_, i) => i).filter((i) => !banned.has(i));
  const weaponIndex = allowed.length ? pick(allowed) : (fallback.length ? pick(fallback) : 0);
  const def = WEAPONS[weaponIndex];

  const startX = shooter.x;
  const startY = shooter.y - 10;
  let best: AiPlan = { weaponIndex, angle: -Math.PI / 3, power: 60 };
  let bestErr = Infinity;

  const towards = target.x > shooter.x ? 1 : -1;
  for (let i = 0; i < 160; i++) {
    // Bias angles into the upper arc facing the target.
    const elevation = 0.12 + Math.random() * 1.35; // radians above horizontal
    const angle = towards === 1 ? -elevation : -Math.PI + elevation;
    const power = 22 + Math.random() * 78;
    const impact = simulateImpact(
      terrain, startX, startY, angle, power,
      def.speedMul * shooter.attrs.velocity, def.gravityMul,
      def.windMul * shooter.attrs.wind, wind,
    );
    const err = dist(impact.x, impact.y, target.x, target.y);
    if (err < bestErr) {
      bestErr = err;
      best = { weaponIndex, angle, power };
    }
  }

  // Humanizing error: worse when the best found shot was already poor.
  const wobble = bestErr < TANK_RADIUS * 2 ? 0.035 : 0.015;
  best.angle += (Math.random() - 0.5) * wobble * 2;
  best.power = clamp(best.power + (Math.random() - 0.5) * 5, 1, 100);
  return best;
}
