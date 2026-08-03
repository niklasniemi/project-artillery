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
 * Hull and barrel are rasterized once per (type, colour, size) and then
 * blitted. The barrel lives in its own sprite because it rotates, and it is
 * drawn first so the turret overlaps its root.
 */
const bodyCache = new Map<string, HTMLCanvasElement>();
const barrelCache = new Map<string, HTMLCanvasElement>();
const SS = 2; // supersample factor — keeps edges clean when scaled

function bodyBox(r: number): { w: number; h: number; ox: number; oy: number } {
  return { w: r * 4, h: r * 3.4, ox: r * 2, oy: r * 2.4 };
}

function barrelBox(r: number): { w: number; h: number; ox: number; oy: number } {
  return { w: r * 3.6, h: r * 1.4, ox: r * 0.3, oy: r * 0.7 };
}

function makeCanvas(w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = Math.ceil(w * SS);
  c.height = Math.ceil(h * SS);
  const ctx = c.getContext("2d")!;
  ctx.scale(SS, SS);
  return { c, ctx };
}

function bodySprite(typeId: string, palette: TankPalette, r: number): HTMLCanvasElement {
  const key = `${typeId}|${palette.primary}|${r}`;
  const hit = bodyCache.get(key);
  if (hit) return hit;
  const box = bodyBox(r);
  const { c, ctx } = makeCanvas(box.w, box.h);
  drawBody(ctx, typeId, palette, box.ox, box.oy, r);
  bodyCache.set(key, c);
  return c;
}

function barrelSprite(typeId: string, palette: TankPalette, r: number): HTMLCanvasElement {
  const key = `${typeId}|${palette.primary}|${r}`;
  const hit = barrelCache.get(key);
  if (hit) return hit;
  const box = barrelBox(r);
  const { c, ctx } = makeCanvas(box.w, box.h);
  drawBarrel(ctx, typeId, palette, box.ox, box.oy, r);
  barrelCache.set(key, c);
  return c;
}

/** Barrel drawn pointing right from the pivot, ready to be rotated. */
function drawBarrel(
  ctx: CanvasRenderingContext2D, typeId: string, palette: TankPalette,
  px: number, py: number, r: number,
): void {
  const len = typeId === "howitzer" ? r * 2.9 : typeId === "scout" ? r * 1.8 : r * 2.15;
  const th = typeId === "bulwark" ? r * 0.34 : typeId === "scout" ? r * 0.2 : r * 0.26;
  const steel = shade(palette.secondary, -0.15);

  // Recoil sleeve at the root
  const sleeveL = len * 0.3;
  const g0 = ctx.createLinearGradient(0, py - th, 0, py + th);
  g0.addColorStop(0, shade(steel, 0.3));
  g0.addColorStop(0.5, steel);
  g0.addColorStop(1, shade(steel, -0.35));
  ctx.fillStyle = g0;
  ctx.beginPath();
  ctx.roundRect(px, py - th * 0.85, sleeveL, th * 1.7, th * 0.3);
  ctx.fill();

  // Tapered tube
  const g1 = ctx.createLinearGradient(0, py - th * 0.6, 0, py + th * 0.6);
  g1.addColorStop(0, shade(steel, 0.4));
  g1.addColorStop(0.45, steel);
  g1.addColorStop(1, shade(steel, -0.4));
  ctx.fillStyle = g1;
  ctx.beginPath();
  ctx.moveTo(px + sleeveL * 0.6, py - th * 0.6);
  ctx.lineTo(px + len - th * 0.6, py - th * 0.45);
  ctx.lineTo(px + len - th * 0.6, py + th * 0.45);
  ctx.lineTo(px + sleeveL * 0.6, py + th * 0.6);
  ctx.closePath();
  ctx.fill();

  // Muzzle: brake on the howitzer, plain collar elsewhere
  ctx.fillStyle = shade(steel, -0.1);
  if (typeId === "howitzer") {
    ctx.beginPath();
    ctx.roundRect(px + len - th * 1.5, py - th * 0.95, th * 1.9, th * 1.9, th * 0.25);
    ctx.fill();
    ctx.fillStyle = shade(steel, -0.55);
    ctx.fillRect(px + len - th * 1.0, py - th * 0.95, th * 0.28, th * 1.9);
  } else {
    ctx.beginPath();
    ctx.roundRect(px + len - th * 0.8, py - th * 0.72, th * 1.0, th * 1.44, th * 0.2);
    ctx.fill();
  }
  // Bore
  ctx.fillStyle = "rgba(8,7,6,0.85)";
  ctx.beginPath();
  ctx.arc(px + len + th * 0.05, py, th * 0.28, 0, Math.PI * 2);
  ctx.fill();
}

/** Hull, running gear and turret, drawn with the ground contact at (gx, gy). */
function drawBody(
  ctx: CanvasRenderingContext2D, typeId: string, palette: TankPalette,
  gx: number, gy: number, r: number,
): void {
  const { primary, secondary } = palette;
  const dark = shade(secondary, -0.3);
  const trackW = typeId === "bulwark" ? r * 1.22 : typeId === "howitzer" ? r * 0.92 : r;

  // ---- Running gear -------------------------------------------------
  const wheelY = gy - r * 0.24;
  const trackTop = gy - r * 0.56;
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.roundRect(gx - trackW, trackTop, trackW * 2, r * 0.6, r * 0.28);
  ctx.fill();

  // Track link ticks
  ctx.strokeStyle = shade(dark, -0.35);
  ctx.lineWidth = Math.max(0.6, r * 0.055);
  const links = Math.max(5, Math.round(trackW * 0.9));
  for (let i = 0; i <= links; i++) {
    const lx = gx - trackW + (i / links) * trackW * 2;
    ctx.beginPath();
    ctx.moveTo(lx, trackTop + r * 0.06);
    ctx.lineTo(lx, trackTop + r * 0.54);
    ctx.stroke();
  }

  // Road wheels, with a larger sprocket at each end
  const wheelCount = typeId === "scout" ? 3 : typeId === "bulwark" ? 5 : 4;
  ctx.fillStyle = shade(secondary, 0.1);
  for (let i = 0; i < wheelCount; i++) {
    const f = i / (wheelCount - 1);
    const wx = gx - trackW * 0.74 + f * trackW * 1.48;
    const rad = r * 0.17;
    ctx.beginPath();
    ctx.arc(wx, wheelY, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = shade(secondary, 0.28);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(gx + side * trackW * 0.86, wheelY - r * 0.02, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- Hull ---------------------------------------------------------
  const hullTop = gy - r * (typeId === "bulwark" ? 1.3 : typeId === "scout" ? 0.92 : 1.06);
  const hullBot = trackTop + r * 0.1;
  const hullW = typeId === "bulwark" ? r * 1.06 : typeId === "scout" ? r * 0.88 : r * 0.95;

  const hg = ctx.createLinearGradient(0, hullTop, 0, hullBot);
  hg.addColorStop(0, shade(primary, 0.28));
  hg.addColorStop(0.45, primary);
  hg.addColorStop(1, shade(primary, -0.4));
  ctx.fillStyle = hg;

  ctx.beginPath();
  switch (typeId) {
    case "scout": // low wedge, sloped glacis
      ctx.moveTo(gx - hullW, hullBot);
      ctx.lineTo(gx + hullW, hullBot);
      ctx.lineTo(gx + hullW * 0.96, hullTop + r * 0.1);
      ctx.lineTo(gx - hullW * 0.35, hullTop);
      ctx.lineTo(gx - hullW * 0.98, hullTop + r * 0.34);
      break;
    case "bulwark": // tall casemate with chamfers
      ctx.moveTo(gx - hullW, hullBot);
      ctx.lineTo(gx + hullW, hullBot);
      ctx.lineTo(gx + hullW, hullTop + r * 0.34);
      ctx.lineTo(gx + hullW * 0.72, hullTop);
      ctx.lineTo(gx - hullW * 0.72, hullTop);
      ctx.lineTo(gx - hullW, hullTop + r * 0.34);
      break;
    case "howitzer": // compact box, sloped rear deck
      ctx.moveTo(gx - hullW, hullBot);
      ctx.lineTo(gx + hullW, hullBot);
      ctx.lineTo(gx + hullW * 0.82, hullTop + r * 0.06);
      ctx.lineTo(gx - hullW * 0.62, hullTop);
      ctx.lineTo(gx - hullW, hullTop + r * 0.3);
      break;
    case "reaver": // aggressive raked prow
      ctx.moveTo(gx - hullW, hullBot);
      ctx.lineTo(gx + hullW, hullBot);
      ctx.lineTo(gx + hullW * 0.88, hullTop + r * 0.22);
      ctx.lineTo(gx + hullW * 0.1, hullTop - r * 0.12);
      ctx.lineTo(gx - hullW * 0.82, hullTop + r * 0.2);
      break;
    default: // vanguard / sapper
      ctx.moveTo(gx - hullW, hullBot);
      ctx.lineTo(gx + hullW, hullBot);
      ctx.lineTo(gx + hullW * 0.9, hullTop + r * 0.08);
      ctx.lineTo(gx - hullW * 0.9, hullTop + r * 0.08);
  }
  ctx.closePath();
  ctx.fill();

  // Top-edge highlight sells the light direction.
  ctx.strokeStyle = shade(primary, 0.5);
  ctx.lineWidth = Math.max(0.7, r * 0.06);
  ctx.beginPath();
  ctx.moveTo(gx - hullW * 0.8, hullTop + r * 0.09);
  ctx.lineTo(gx + hullW * 0.8, hullTop + r * 0.09);
  ctx.stroke();

  // Panel line + rivets
  ctx.strokeStyle = shade(primary, -0.5);
  ctx.lineWidth = Math.max(0.5, r * 0.04);
  ctx.beginPath();
  ctx.moveTo(gx - hullW * 0.9, hullBot - r * 0.2);
  ctx.lineTo(gx + hullW * 0.9, hullBot - r * 0.2);
  ctx.stroke();
  ctx.fillStyle = shade(primary, -0.55);
  for (let i = 0; i < 4; i++) {
    const rx = gx - hullW * 0.66 + (i / 3) * hullW * 1.32;
    ctx.beginPath();
    ctx.arc(rx, hullBot - r * 0.34, Math.max(0.5, r * 0.045), 0, Math.PI * 2);
    ctx.fill();
  }

  // Side skirt on the heavy chassis
  if (typeId === "bulwark") {
    ctx.fillStyle = shade(secondary, 0.05);
    ctx.beginPath();
    ctx.roundRect(gx - trackW * 0.98, trackTop - r * 0.12, trackW * 1.96, r * 0.3, r * 0.06);
    ctx.fill();
  }

  // ---- Turret -------------------------------------------------------
  const turretY = hullTop - r * 0.12;
  const turretW = typeId === "bulwark" ? r * 0.62 : typeId === "scout" ? r * 0.4 : r * 0.5;
  const turretH = typeId === "scout" ? r * 0.3 : r * 0.4;

  const tg = ctx.createLinearGradient(0, turretY - turretH, 0, turretY + turretH * 0.4);
  tg.addColorStop(0, shade(primary, 0.38));
  tg.addColorStop(0.6, shade(primary, 0.04));
  tg.addColorStop(1, shade(primary, -0.3));
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.roundRect(gx - turretW, turretY - turretH, turretW * 2, turretH * 1.5, turretH * 0.42);
  ctx.fill();

  // Mantlet where the barrel meets the turret
  ctx.fillStyle = shade(secondary, 0.05);
  ctx.beginPath();
  ctx.roundRect(gx + turretW * 0.5, turretY - turretH * 0.7, turretW * 0.8, turretH * 1.1, turretH * 0.25);
  ctx.fill();

  // Commander's hatch + vision block
  ctx.fillStyle = shade(primary, -0.42);
  ctx.beginPath();
  ctx.ellipse(gx - turretW * 0.25, turretY - turretH * 0.72, turretW * 0.34, turretH * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palette.glow;
  ctx.globalAlpha = 0.75;
  ctx.fillRect(gx + turretW * 0.05, turretY - turretH * 0.34, turretW * 0.3, turretH * 0.14);
  ctx.globalAlpha = 1;

  // ---- Per-type greebles --------------------------------------------
  if (typeId === "sapper") {
    // Dozer blade and hydraulic arm
    ctx.strokeStyle = shade(secondary, 0.2);
    ctx.lineWidth = Math.max(1, r * 0.1);
    ctx.beginPath();
    ctx.moveTo(gx + hullW * 0.8, hullBot - r * 0.1);
    ctx.lineTo(gx + trackW * 1.24, gy - r * 0.42);
    ctx.stroke();
    const bg2 = ctx.createLinearGradient(0, gy - r * 0.78, 0, gy);
    bg2.addColorStop(0, shade(primary, 0.35));
    bg2.addColorStop(1, shade(primary, -0.2));
    ctx.fillStyle = bg2;
    ctx.beginPath();
    ctx.moveTo(gx + trackW * 1.16, gy - r * 0.8);
    ctx.lineTo(gx + trackW * 1.5, gy - r * 0.66);
    ctx.lineTo(gx + trackW * 1.44, gy - r * 0.02);
    ctx.lineTo(gx + trackW * 1.1, gy - r * 0.08);
    ctx.closePath();
    ctx.fill();
  }
  if (typeId === "howitzer") {
    // Recoil spades dug in behind
    ctx.strokeStyle = shade(secondary, 0.1);
    ctx.lineWidth = Math.max(1, r * 0.11);
    ctx.beginPath();
    ctx.moveTo(gx - hullW * 0.5, gy - r * 0.4);
    ctx.lineTo(gx - trackW * 1.5, gy - r * 0.02);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(gx - trackW * 1.5, gy - r * 0.16);
    ctx.lineTo(gx - trackW * 1.66, gy + r * 0.04);
    ctx.stroke();
  }
  if (typeId === "reaver") {
    // Blade fin on the deck
    ctx.fillStyle = shade(primary, 0.42);
    ctx.beginPath();
    ctx.moveTo(gx - hullW * 0.15, hullTop - r * 0.1);
    ctx.lineTo(gx + hullW * 0.08, hullTop - r * 0.56);
    ctx.lineTo(gx + hullW * 0.26, hullTop - r * 0.06);
    ctx.closePath();
    ctx.fill();
  }
  if (typeId === "scout") {
    // Whip antenna
    ctx.strokeStyle = shade(secondary, 0.35);
    ctx.lineWidth = Math.max(0.6, r * 0.05);
    ctx.beginPath();
    ctx.moveTo(gx - hullW * 0.6, hullTop);
    ctx.quadraticCurveTo(gx - hullW * 1.0, hullTop - r * 0.7, gx - hullW * 0.7, hullTop - r * 1.15);
    ctx.stroke();
  }

  // Exhaust stack (everything but the scout)
  if (typeId !== "scout") {
    ctx.fillStyle = shade(secondary, -0.2);
    ctx.beginPath();
    ctx.roundRect(gx - hullW * 0.92, hullTop - r * 0.02, r * 0.16, r * 0.26, r * 0.05);
    ctx.fill();
  }
}

/**
 * Draws a chassis. Shared by the live tank renderer and the selector preview
 * so what you pick is exactly what you drive.
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
  const r = radius;
  const bBox = barrelBox(r);
  const barrel = barrelSprite(typeId, palette, r);
  const body = bodySprite(typeId, palette, r);
  const bodyB = bodyBox(r);

  // Barrel pivots at the turret trunnion, and goes down first so the
  // turret casting overlaps its root.
  const pivotY = y - r * (typeId === "bulwark" ? 1.3 : typeId === "scout" ? 0.98 : 1.1);
  ctx.save();
  ctx.translate(x, pivotY);
  ctx.rotate(angle);
  ctx.drawImage(barrel, -bBox.ox, -bBox.oy, bBox.w, bBox.h);
  ctx.restore();

  ctx.drawImage(body, x - bodyB.ox, y - bodyB.oy, bodyB.w, bodyB.h);
  void facing;
}

