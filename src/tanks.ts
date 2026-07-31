/**
 * Chassis types. Every field is a multiplier applied to the shared baseline,
 * so a loadout is a set of trade-offs rather than a power level — the totals
 * are deliberately close to even across all six.
 */
export interface TankAttrs {
  hp: number;       // max hull points
  fuel: number;     // max fuel
  drive: number;    // ground speed
  damage: number;   // outgoing damage
  armor: number;    // incoming damage taken (lower is tougher)
  blast: number;    // own explosion radius
  velocity: number; // muzzle velocity
  wind: number;     // wind influence on own shells (lower is steadier)
  xp: number;       // match XP earn rate
}

export interface TankType {
  id: string;
  name: string;
  role: string;
  brief: string;
  attrs: TankAttrs;
}

/**
 * Balance note: `hp` and `armor` multiply, so effective hull (hp / armor) is
 * the number that actually matters. These are tuned to keep that spread inside
 * roughly 77–139 against a 100 baseline — wide enough to feel distinct, narrow
 * enough that no chassis simply out-stats another.
 */
export const TANK_TYPES: TankType[] = [
  {
    id: "vanguard", name: "Vanguard", role: "All-round",
    brief: "No weaknesses and no tricks. Hits slightly harder than standard.",
    attrs: { hp: 1, fuel: 1, drive: 1, damage: 1.05, armor: 1, blast: 1, velocity: 1, wind: 1, xp: 1 },
  },
  {
    id: "scout", name: "Scout", role: "Skirmisher",
    brief: "Crosses half the map in a turn to break any firing solution.",
    attrs: { hp: 0.85, fuel: 1.7, drive: 1.5, damage: 0.95, armor: 1.05, blast: 0.95, velocity: 1.05, wind: 1.05, xp: 1.2 },
  },
  {
    id: "bulwark", name: "Bulwark", role: "Assault",
    brief: "Soaks punishment and cracks terrain wide. Barely moves.",
    attrs: { hp: 1.25, fuel: 0.65, drive: 0.72, damage: 0.92, armor: 0.9, blast: 1.1, velocity: 0.92, wind: 1, xp: 0.9 },
  },
  {
    id: "howitzer", name: "Howitzer", role: "Marksman",
    brief: "Flat, fast, wind-steady shells for cross-map work. Thin armour.",
    attrs: { hp: 0.9, fuel: 0.8, drive: 0.85, damage: 1.08, armor: 1.05, blast: 0.9, velocity: 1.28, wind: 0.5, xp: 1 },
  },
  {
    id: "sapper", name: "Sapper", role: "Engineer",
    brief: "Enormous blast radius reshapes the map. Weak direct damage.",
    attrs: { hp: 1.05, fuel: 1.2, drive: 1.05, damage: 0.85, armor: 0.98, blast: 1.4, velocity: 0.95, wind: 1, xp: 1.25 },
  },
  {
    id: "reaver", name: "Reaver", role: "Glass cannon",
    brief: "Highest damage in the field. Takes a sixth more in return.",
    attrs: { hp: 0.88, fuel: 0.9, drive: 1, damage: 1.3, armor: 1.15, blast: 1, velocity: 1, wind: 1.1, xp: 1 },
  },
];

export function typeById(id: string): TankType {
  return TANK_TYPES.find((t) => t.id === id) ?? TANK_TYPES[0];
}

/** Primary hull colours offered in the selector. */
export const TANK_COLORS: string[] = [
  "#28c7f0", "#f04da0", "#9df04d", "#f0a52d",
  "#b44df0", "#4df0b4", "#f0654d", "#e8e8f0",
  "#4d7cf0", "#f0d84d",
];

export interface Loadout {
  type: string;  // TankType id
  color: number; // index into TANK_COLORS
}

export interface TankPalette {
  primary: string;
  secondary: string;
  glow: string;
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/** Scale a hex colour toward black (amt < 0) or white (amt > 0). */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt < 0) {
    const k = 1 + amt;
    r *= k; g *= k; b *= k;
  } else {
    r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt;
  }
  return `#${((clamp255(r) << 16) | (clamp255(g) << 8) | clamp255(b)).toString(16).padStart(6, "0")}`;
}

export function paletteFor(colorIndex: number): TankPalette {
  const primary = TANK_COLORS[((colorIndex % TANK_COLORS.length) + TANK_COLORS.length) % TANK_COLORS.length];
  return { primary, secondary: shade(primary, -0.55), glow: shade(primary, 0.3) };
}

/**
 * Draws a chassis silhouette. Shared by the live tank renderer and the
 * selector preview so what you pick is exactly what you drive.
 * Origin is the ground contact point; the hull sits above it.
 */
export function drawChassis(
  ctx: CanvasRenderingContext2D,
  typeId: string,
  palette: TankPalette,
  x: number, y: number,
  facing: 1 | -1,
  angle: number,
  radius: number,
): void {
  const { primary, secondary } = palette;
  const r = radius;

  // Barrel first so the hull overlaps its root.
  const barrelLen = typeId === "howitzer" ? r * 2.5 : typeId === "scout" ? r * 1.5 : r * 1.85;
  const barrelW = typeId === "bulwark" ? 6.5 : typeId === "scout" ? 3.5 : typeId === "reaver" ? 6 : 5;
  ctx.strokeStyle = secondary;
  ctx.lineWidth = barrelW;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.72);
  ctx.lineTo(x + Math.cos(angle) * barrelLen, y - r * 0.72 + Math.sin(angle) * barrelLen);
  ctx.stroke();
  if (typeId === "howitzer") {
    // Muzzle brake
    ctx.lineWidth = barrelW + 3;
    const mx = x + Math.cos(angle) * barrelLen, my = y - r * 0.72 + Math.sin(angle) * barrelLen;
    ctx.beginPath();
    ctx.moveTo(mx - Math.cos(angle) * 4, my - Math.sin(angle) * 4);
    ctx.lineTo(mx, my);
    ctx.stroke();
  }

  // Treads / running gear
  ctx.fillStyle = secondary;
  switch (typeId) {
    case "scout":
      ctx.beginPath();
      ctx.roundRect(x - r * 0.95, y - r * 0.42, r * 1.9, r * 0.5, 3);
      ctx.fill();
      ctx.fillStyle = shade(secondary, 0.18);
      for (const o of [-0.6, 0, 0.6]) {
        ctx.beginPath();
        ctx.arc(x + o * r, y - r * 0.16, r * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "bulwark":
      ctx.beginPath();
      ctx.roundRect(x - r * 1.18, y - r * 0.62, r * 2.36, r * 0.68, 3);
      ctx.fill();
      ctx.fillStyle = shade(secondary, 0.15);
      ctx.fillRect(x - r * 1.05, y - r * 0.5, r * 2.1, r * 0.16); // skirt plate
      break;
    case "howitzer":
      ctx.beginPath();
      ctx.roundRect(x - r * 0.85, y - r * 0.46, r * 1.7, r * 0.5, 3);
      ctx.fill();
      // Recoil outriggers
      ctx.strokeStyle = secondary;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.5, y - r * 0.2);
      ctx.lineTo(x - r * 1.35, y);
      ctx.moveTo(x + r * 0.5, y - r * 0.2);
      ctx.lineTo(x + r * 1.35, y);
      ctx.stroke();
      break;
    default:
      ctx.beginPath();
      ctx.roundRect(x - r, y - r * 0.5, r * 2, r * 0.58, 4);
      ctx.fill();
  }

  // Hull
  ctx.fillStyle = primary;
  ctx.beginPath();
  switch (typeId) {
    case "scout": // low wedge
      ctx.moveTo(x - r * 0.85, y - r * 0.42);
      ctx.lineTo(x + r * 0.5, y - r * 0.42);
      ctx.lineTo(x + r * 0.85, y - r * 0.85);
      ctx.lineTo(x - r * 0.6, y - r * 0.85);
      ctx.closePath();
      break;
    case "bulwark": // tall box with a chamfer
      ctx.moveTo(x - r * 1.05, y - r * 0.6);
      ctx.lineTo(x + r * 1.05, y - r * 0.6);
      ctx.lineTo(x + r * 1.05, y - r * 1.05);
      ctx.lineTo(x + r * 0.75, y - r * 1.3);
      ctx.lineTo(x - r * 0.75, y - r * 1.3);
      ctx.lineTo(x - r * 1.05, y - r * 1.05);
      ctx.closePath();
      break;
    case "howitzer": // compact, sloped rear
      ctx.moveTo(x - r * 0.75, y - r * 0.44);
      ctx.lineTo(x + r * 0.7, y - r * 0.44);
      ctx.lineTo(x + r * 0.55, y - r * 0.95);
      ctx.lineTo(x - r * 0.45, y - r * 0.95);
      ctx.closePath();
      break;
    case "sapper": // hull plus dozer blade
      ctx.moveTo(x - r * 0.9, y - r * 0.48);
      ctx.lineTo(x + r * 0.9, y - r * 0.48);
      ctx.lineTo(x + r * 0.9, y - r * 1.02);
      ctx.lineTo(x - r * 0.9, y - r * 1.02);
      ctx.closePath();
      break;
    case "reaver": // angular, aggressive
      ctx.moveTo(x - r * 0.95, y - r * 0.48);
      ctx.lineTo(x + r * 0.95, y - r * 0.48);
      ctx.lineTo(x + r * 0.7, y - r * 1.15);
      ctx.lineTo(x - r * 0.2, y - r * 1.32);
      ctx.lineTo(x - r * 0.85, y - r * 0.95);
      ctx.closePath();
      break;
    default: // vanguard
      ctx.moveTo(x - r * 0.9, y - r * 0.46);
      ctx.lineTo(x + r * 0.9, y - r * 0.46);
      ctx.lineTo(x + r * 0.75, y - r * 1.0);
      ctx.lineTo(x - r * 0.75, y - r * 1.0);
      ctx.closePath();
  }
  ctx.fill();

  if (typeId === "sapper") {
    // Dozer blade on the facing side
    ctx.strokeStyle = shade(primary, 0.25);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + facing * r * 1.0, y - r * 0.1);
    ctx.lineTo(x + facing * r * 1.32, y - r * 0.62);
    ctx.stroke();
  }
  if (typeId === "reaver") {
    ctx.fillStyle = shade(primary, 0.35);
    ctx.beginPath();
    ctx.moveTo(x - r * 0.2, y - r * 1.32);
    ctx.lineTo(x + r * 0.05, y - r * 1.62);
    ctx.lineTo(x + r * 0.22, y - r * 1.22);
    ctx.closePath();
    ctx.fill();
  }

  // Turret ring — reads as a hatch, so it sits darker than the hull.
  ctx.fillStyle = shade(primary, -0.3);
  ctx.beginPath();
  ctx.arc(x, y - r * 0.72, typeId === "bulwark" ? r * 0.3 : r * 0.24, 0, Math.PI * 2);
  ctx.fill();
}
