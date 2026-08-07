import { seededRandom, TAU } from "./util";

export type WeatherKind = "none" | "snow" | "ash" | "sand" | "spore";

/**
 * Colour ramp used when rasterizing the terrain mask. The surface is built as
 * three soft bands — lit crest, topsoil, then body — rather than a hard lip,
 * which is what used to read as an outline.
 */
export interface TerrainPaint {
  /** Sunlit crest, the top few pixels. */
  lip: [number, number, number];
  /** Topsoil / grass layer sitting under the crest. */
  soil: [number, number, number];
  /** Body colour just below the soil band. */
  base: [number, number, number];
  /** Amount subtracted from `base` at full depth. */
  depth: [number, number, number];
  noise: number;
  /** Thickness in pixels of the crest + soil banding. */
  crest: number;
  soilBand: number;
}

export interface MapTheme {
  id: string;
  name: string;
  blurb: string;
  sky: { at: number; color: string }[];
  starCount: number;
  starColors: [string, string];
  /** Glow sitting on the horizon line, or null for none. */
  horizon: { color: string; strength: number } | null;
  ridges: [string, string];
  orb: { fill: string; stroke: string; xf: number; yf: number; r: number } | null;
  terrain: TerrainPaint;
  /** Bottom-of-world hazard: outer glow then hot core. */
  voidGlow: [string, string];
  weather: WeatherKind;
  weatherColor: string;
}

export const MAP_THEMES: MapTheme[] = [
  {
    id: "nightfall", name: "Nightfall", blurb: "Dusk over a burning front line.",
    sky: [
      { at: 0, color: "#05060a" }, { at: 0.42, color: "#0b1020" },
      { at: 0.72, color: "#1d1a2a" }, { at: 0.9, color: "#3d2418" },
      { at: 1, color: "#5c2f16" },
    ],
    starCount: 240, starColors: ["#dce6f5", "#ffd9b8"],
    horizon: { color: "255,120,45", strength: 0.34 },
    ridges: ["rgba(9,10,18,0.55)", "rgba(5,6,12,0.72)"],
    orb: { fill: "#171d2e", stroke: "rgba(236,228,210,0.32)", xf: 0.83, yf: 0.17, r: 54 },
    terrain: { lip: [176, 150, 108], soil: [96, 78, 62], base: [56, 48, 62], depth: [24, 22, 28], noise: 12, crest: 5, soilBand: 16 },
    voidGlow: ["255, 128, 40", "255, 226, 178"],
    weather: "none", weatherColor: "#ffffff",
  },
  {
    id: "dunes", name: "Dune Sea", blurb: "Endless ochre under a bleached sun.",
    sky: [
      { at: 0, color: "#2a1c10" }, { at: 0.35, color: "#6b4520" },
      { at: 0.62, color: "#b9762f" }, { at: 0.85, color: "#e0a251" },
      { at: 1, color: "#f0c079" },
    ],
    starCount: 0, starColors: ["#ffe9c4", "#fff4de"],
    horizon: { color: "255, 214, 140", strength: 0.5 },
    ridges: ["rgba(120,74,32,0.45)", "rgba(74,44,20,0.6)"],
    orb: { fill: "#ffe6b0", stroke: "rgba(255,240,200,0.55)", xf: 0.24, yf: 0.22, r: 46 },
    terrain: { lip: [242, 214, 156], soil: [196, 146, 82], base: [138, 96, 50], depth: [58, 42, 24], noise: 14, crest: 6, soilBand: 20 },
    voidGlow: ["222, 160, 70", "255, 238, 196"],
    weather: "sand", weatherColor: "#e8c48a",
  },
  {
    id: "frost", name: "Frostbite", blurb: "Aurora light on a frozen shelf.",
    sky: [
      { at: 0, color: "#03060f" }, { at: 0.35, color: "#07182c" },
      { at: 0.6, color: "#0d3a46" }, { at: 0.82, color: "#154f52" },
      { at: 1, color: "#2b6f68" },
    ],
    starCount: 300, starColors: ["#e8f6ff", "#b8f0e0"],
    horizon: { color: "90, 240, 210", strength: 0.28 },
    ridges: ["rgba(16,40,58,0.6)", "rgba(8,22,36,0.75)"],
    orb: { fill: "#0f2436", stroke: "rgba(190,240,255,0.4)", xf: 0.78, yf: 0.15, r: 50 },
    terrain: { lip: [238, 248, 255], soil: [186, 208, 226], base: [104, 126, 150], depth: [46, 52, 58], noise: 10, crest: 7, soilBand: 18 },
    voidGlow: ["80, 210, 255", "226, 250, 255"],
    weather: "snow", weatherColor: "#eaf6ff",
  },
  {
    id: "ash", name: "Ashlands", blurb: "Cinder fall over cooling magma.",
    sky: [
      { at: 0, color: "#0a0506" }, { at: 0.4, color: "#1c0d0c" },
      { at: 0.7, color: "#35140f" }, { at: 0.88, color: "#5e2110" },
      { at: 1, color: "#8a3410" },
    ],
    starCount: 40, starColors: ["#ffb08a", "#ff8a5a"],
    horizon: { color: "255, 80, 20", strength: 0.46 },
    ridges: ["rgba(24,10,10,0.6)", "rgba(12,5,5,0.78)"],
    orb: null,
    terrain: { lip: [176, 96, 62], soil: [98, 62, 52], base: [58, 42, 40], depth: [24, 18, 16], noise: 15, crest: 4, soilBand: 14 },
    voidGlow: ["255, 70, 20", "255, 210, 150"],
    weather: "ash", weatherColor: "#c9b7a8",
  },
  {
    id: "verdant", name: "Verdant", blurb: "Mist and spores in a deep canopy.",
    sky: [
      { at: 0, color: "#04100c" }, { at: 0.38, color: "#0a2418" },
      { at: 0.66, color: "#154028" }, { at: 0.86, color: "#245c33" },
      { at: 1, color: "#3d7d42" },
    ],
    starCount: 70, starColors: ["#d8ffd0", "#f0ffc0"],
    horizon: { color: "150, 255, 150", strength: 0.24 },
    ridges: ["rgba(10,32,22,0.6)", "rgba(5,18,12,0.76)"],
    orb: { fill: "#12301f", stroke: "rgba(200,255,190,0.3)", xf: 0.72, yf: 0.19, r: 44 },
    terrain: { lip: [138, 190, 92], soil: [92, 132, 62], base: [66, 84, 54], depth: [30, 38, 26], noise: 13, crest: 7, soilBand: 18 },
    voidGlow: ["120, 240, 120", "230, 255, 210"],
    weather: "spore", weatherColor: "#c8ff9a",
  },
  {
    id: "orbital", name: "Orbital", blurb: "Hard vacuum above a shattered ring.",
    sky: [
      { at: 0, color: "#010208" }, { at: 0.45, color: "#04081a" },
      { at: 0.75, color: "#081228" }, { at: 0.92, color: "#0d1b38" },
      { at: 1, color: "#12284c" },
    ],
    starCount: 420, starColors: ["#ffffff", "#a8d8ff"],
    horizon: { color: "80, 180, 255", strength: 0.2 },
    ridges: ["rgba(8,14,30,0.5)", "rgba(4,8,18,0.7)"],
    orb: { fill: "#16263f", stroke: "rgba(140,210,255,0.45)", xf: 0.8, yf: 0.2, r: 68 },
    terrain: { lip: [150, 186, 214], soil: [104, 122, 148], base: [72, 82, 100], depth: [30, 34, 42], noise: 9,  crest: 5, soilBand: 16 },
    voidGlow: ["70, 170, 255", "210, 240, 255"],
    weather: "none", weatherColor: "#ffffff",
  },
];

export function themeById(id: string): MapTheme {
  return MAP_THEMES.find((t) => t.id === id) ?? MAP_THEMES[0];
}

/**
 * Paints a theme's sky, stars, horizon haze, orb and ridge silhouettes.
 * Shared by the world background and the selector thumbnails, so a card
 * always matches the map it launches.
 */
export function paintSky(
  ctx: CanvasRenderingContext2D,
  theme: MapTheme,
  w: number, h: number,
  seed = 7,
): void {
  const rand = seededRandom(seed);

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  for (const s of theme.sky) grad.addColorStop(s.at, s.color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const scale = w / 1600;

  if (theme.starCount > 0) {
    const n = Math.max(8, Math.round(theme.starCount * scale));
    for (let i = 0; i < n; i++) {
      const x = rand() * w;
      const y = rand() * h * 0.62;
      const s = (rand() * 1.7 + 0.4) * Math.max(0.5, scale);
      ctx.globalAlpha = rand() * 0.65 + 0.12;
      ctx.fillStyle = rand() < 0.85 ? theme.starColors[0] : theme.starColors[1];
      ctx.fillRect(x, y, s, s);
    }
    ctx.globalAlpha = 1;
  }

  if (theme.orb) {
    const r = theme.orb.r * Math.max(0.35, scale);
    ctx.beginPath();
    ctx.arc(w * theme.orb.xf, h * theme.orb.yf, r, 0, TAU);
    ctx.fillStyle = theme.orb.fill;
    ctx.fill();
    ctx.strokeStyle = theme.orb.stroke;
    ctx.lineWidth = Math.max(1, 1.5 * scale);
    ctx.stroke();
  }

  if (theme.horizon) {
    const haze = ctx.createRadialGradient(w * 0.5, h * 1.02, 20 * scale, w * 0.5, h * 1.02, w * 0.62);
    haze.addColorStop(0, `rgba(${theme.horizon.color},${theme.horizon.strength})`);
    haze.addColorStop(1, `rgba(${theme.horizon.color},0)`);
    ctx.fillStyle = haze;
    ctx.fillRect(0, h * 0.5, w, h * 0.5);
  }

  for (let layer = 0; layer < 2; layer++) {
    ctx.beginPath();
    const baseY = h * (0.66 + layer * 0.08);
    ctx.moveTo(0, h);
    ctx.lineTo(0, baseY);
    const step = Math.max(6, 40 * scale);
    for (let x = 0; x <= w; x += step) {
      const wx = x / scale;
      const amp = 46 * scale, amp2 = 22 * scale;
      const hh = Math.sin(wx * 0.0031 + layer * 2.2) * amp + Math.sin(wx * 0.0087 + layer) * amp2;
      ctx.lineTo(x, baseY - hh);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = theme.ridges[layer];
    ctx.fill();
  }
}

/** Small preview used by the map cards: sky plus a token terrain profile. */
export function paintThumbnail(canvas: HTMLCanvasElement, theme: MapTheme): void {
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  paintSky(ctx, theme, w, h, 11);

  // Terrain profile in the theme's own rock colour, with its lit top edge.
  const [br, bg, bb] = theme.terrain.base;
  const [lr, lg, lb] = theme.terrain.lip;
  ctx.beginPath();
  ctx.moveTo(0, h);
  const baseY = h * 0.7;
  for (let x = 0; x <= w; x += 3) {
    const y = baseY - Math.sin(x * 0.055) * h * 0.1 - Math.sin(x * 0.021 + 1.3) * h * 0.07;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = `rgb(${br},${bg},${bb})`;
  ctx.fill();

  ctx.beginPath();
  for (let x = 0; x <= w; x += 3) {
    const y = baseY - Math.sin(x * 0.055) * h * 0.1 - Math.sin(x * 0.021 + 1.3) * h * 0.07;
    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = `rgb(${lr},${lg},${lb})`;
  ctx.lineWidth = 2;
  ctx.stroke();
}
