import { Tank, GRAVITY, TANK_RADIUS } from "./entities";
import { Terrain } from "./terrain";
import { WEAPONS } from "./weapons";
import { clamp, dist, pick } from "./util";

export interface AiPlan {
  weaponIndex: number;
  angle: number;
  power: number;
}

export const POWER_TO_VELOCITY = 10.4; // shared with game.ts firing code

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
  let x = startX, y = startY;
  let vx = Math.cos(angle) * v;
  let vy = Math.sin(angle) * v;
  const dt = 1 / 60;
  for (let i = 0; i < 900; i++) {
    vx += wind * windMul * dt;
    vy += GRAVITY * gravityMul * dt;
    x += vx * dt;
    y += vy * dt;
    if (terrain.solid(x, y)) return { x, y };
    if (y > terrain.height + 60 || x < -400 || x > terrain.width + 400) return { x, y };
  }
  return { x, y };
}

/**
 * Sample candidate shots and keep the one landing closest to the chosen
 * target, then blur the result so the AI stays beatable.
 */
export function planShot(shooter: Tank, tanks: Tank[], terrain: Terrain, wind: number): AiPlan {
  const enemies = tanks.filter((t) => t.alive && t !== shooter);
  // Prefer wounded targets, with a distance tiebreak.
  let target = enemies[0];
  let bestScore = Infinity;
  for (const e of enemies) {
    const score = e.hp * 2 + dist(shooter.x, shooter.y, e.x, e.y) * 0.1;
    if (score < bestScore) { bestScore = score; target = e; }
  }

  // AI keeps it simple: standard shells, mortar, or sniper.
  const chosenId = pick(["shell", "mortar", "sniper"]);
  const weaponIndex = WEAPONS.findIndex((w) => w.id === chosenId);
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
      def.speedMul, def.gravityMul, def.windMul, wind,
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
