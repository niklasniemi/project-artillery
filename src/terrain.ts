import { clamp, seededRandom, TAU } from "./util";

export type TerrainType = "hilly" | "flat" | "cavern" | "islands";

/**
 * Pixel-mask destructible terrain. `mask` is the physics source of truth
 * (1 = solid); the offscreen canvas mirrors it for rendering. Both are
 * mutated together by carve/addDome so they never drift apart.
 */
export class Terrain {
  readonly width: number;
  readonly height: number;
  readonly mask: Uint8Array;
  readonly canvas: OffscreenCanvas | HTMLCanvasElement;
  private readonly ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.mask = new Uint8Array(width * height);
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext("2d")!;
  }

  solid(x: number, y: number): boolean {
    const xi = x | 0, yi = y | 0;
    if (xi < 0 || xi >= this.width || yi < 0 || yi >= this.height) return false;
    return this.mask[yi * this.width + xi] === 1;
  }

  /** First solid y at column x scanning down from fromY, or -1 (void below). */
  surfaceY(x: number, fromY = 0): number {
    const xi = clamp(x | 0, 0, this.width - 1);
    for (let y = Math.max(0, fromY | 0); y < this.height; y++) {
      if (this.mask[y * this.width + xi] === 1) return y;
    }
    return -1;
  }

  generate(type: TerrainType, seed = Math.floor(Math.random() * 1e9)): void {
    const rand = seededRandom(seed);
    this.mask.fill(0);

    if (type === "islands") {
      this.generateIslands(rand);
    } else {
      const heights = this.buildHeightmap(type, rand);
      for (let x = 0; x < this.width; x++) {
        const top = heights[x] | 0;
        for (let y = top; y < this.height; y++) this.mask[y * this.width + x] = 1;
      }
      if (type === "cavern") this.carveCaverns(rand);
    }
    this.paintFromMask();
  }

  private buildHeightmap(type: TerrainType, rand: () => number): Float64Array {
    const h = new Float64Array(this.width);
    const base = this.height * (type === "flat" ? 0.72 : 0.62);
    const layers: { amp: number; freq: number; phase: number }[] = [];
    const layerCount = type === "flat" ? 2 : 5;
    const ampScale = type === "flat" ? 14 : type === "cavern" ? 150 : 120;
    for (let i = 0; i < layerCount; i++) {
      layers.push({
        amp: (ampScale / (i + 1)) * (0.6 + rand() * 0.8),
        freq: ((i + 1) * (1.5 + rand() * 2)) / this.width,
        phase: rand() * TAU,
      });
    }
    for (let x = 0; x < this.width; x++) {
      let y = base;
      for (const l of layers) y += Math.sin(x * l.freq * TAU + l.phase) * l.amp;
      h[x] = clamp(y, this.height * 0.18, this.height * 0.9);
    }
    return h;
  }

  private carveCaverns(rand: () => number): void {
    const tunnels = 3 + Math.floor(rand() * 3);
    for (let t = 0; t < tunnels; t++) {
      let x = rand() * this.width;
      let y = this.height * (0.55 + rand() * 0.3);
      let dir = rand() * TAU;
      const steps = 40 + Math.floor(rand() * 40);
      for (let i = 0; i < steps; i++) {
        this.stampCircle(x, y, 22 + rand() * 18, 0);
        dir += (rand() - 0.5) * 0.9;
        x += Math.cos(dir) * 24;
        y = clamp(y + Math.sin(dir) * 14, this.height * 0.4, this.height * 0.92);
        if (x < 0 || x > this.width) break;
      }
    }
  }

  private generateIslands(rand: () => number): void {
    const count = 4 + Math.floor(rand() * 3);
    for (let i = 0; i < count; i++) {
      const cx = this.width * ((i + 0.5) / count) + (rand() - 0.5) * this.width * 0.12;
      const cy = this.height * (0.35 + rand() * 0.3);
      const rx = this.width * (0.07 + rand() * 0.05);
      const ry = rx * (0.45 + rand() * 0.25);
      this.stampEllipse(cx, cy, rx, ry, 1);
    }
    // One wider central island so there is always somewhere to fight over.
    this.stampEllipse(this.width / 2, this.height * 0.68, this.width * 0.14, 60, 1);
  }

  private stampCircle(cx: number, cy: number, r: number, value: 0 | 1): void {
    const x0 = Math.max(0, (cx - r) | 0), x1 = Math.min(this.width - 1, (cx + r) | 0);
    const y0 = Math.max(0, (cy - r) | 0), y1 = Math.min(this.height - 1, (cy + r) | 0);
    const r2 = r * r;
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        if (dx * dx + dy * dy <= r2) this.mask[y * this.width + x] = value;
      }
    }
  }

  private stampEllipse(cx: number, cy: number, rx: number, ry: number, value: 0 | 1): void {
    const x0 = Math.max(0, (cx - rx) | 0), x1 = Math.min(this.width - 1, (cx + rx) | 0);
    const y0 = Math.max(0, (cy - ry) | 0), y1 = Math.min(this.height - 1, (cy + ry) | 0);
    for (let y = y0; y <= y1; y++) {
      const ny = (y - cy) / ry;
      for (let x = x0; x <= x1; x++) {
        const nx = (x - cx) / rx;
        if (nx * nx + ny * ny <= 1) this.mask[y * this.width + x] = value;
      }
    }
  }

  /** Rasterize the visual layer from the mask: depth gradient + noise + glowing top edge. */
  private paintFromMask(): void {
    const img = this.ctx.createImageData(this.width, this.height);
    const d = img.data;
    const rand = seededRandom(1337);
    // Precompute per-column depth-from-surface for shading.
    for (let x = 0; x < this.width; x++) {
      let depth = -1;
      for (let y = 0; y < this.height; y++) {
        const mi = y * this.width + x;
        if (this.mask[mi] === 1) {
          depth = depth < 0 ? 0 : depth + 1;
        } else {
          depth = -1;
          continue;
        }
        const i = mi * 4;
        const noise = rand() * 14;
        if (depth < 3) {
          // glowing surface lip
          d[i] = 120; d[i + 1] = 240; d[i + 2] = 255; d[i + 3] = 255;
        } else {
          const t = Math.min(1, depth / 260);
          d[i] = 46 - t * 22 + noise;
          d[i + 1] = 38 - t * 20 + noise * 0.6;
          d[i + 2] = 92 - t * 40 + noise;
          d[i + 3] = 255;
        }
      }
    }
    this.ctx.putImageData(img, 0, 0);
  }

  /** Remove a disc of terrain (explosion crater) with a scorched rim. */
  carve(cx: number, cy: number, r: number): void {
    this.stampCircle(cx, cy, r, 0);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
    // Scorch the crater rim on remaining terrain.
    ctx.globalCompositeOperation = "source-atop";
    ctx.strokeStyle = "rgba(255, 120, 40, 0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 1, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = "rgba(10, 6, 14, 0.7)";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 5, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  /** Remove a wide elliptical seam (Quake): collapses ground with little blast. */
  carveEllipse(cx: number, cy: number, rx: number, ry: number): void {
    this.stampEllipse(cx, cy, rx, ry, 0);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = "source-atop";
    ctx.strokeStyle = "rgba(120, 80, 40, 0.6)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx + 2, ry + 2, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  /** Add a protective terrain dome (Shielder): a ring of solid matter. */
  addDome(cx: number, cy: number, r: number): void {
    const thickness = 13;
    const x0 = Math.max(0, (cx - r) | 0), x1 = Math.min(this.width - 1, (cx + r) | 0);
    const y0 = Math.max(0, (cy - r) | 0), y1 = Math.min(this.height - 1, (cy) | 0);
    const rOut2 = r * r, rIn = r - thickness, rIn2 = rIn * rIn;
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const d2 = dx * dx + dy * dy;
        if (d2 <= rOut2 && d2 >= rIn2) this.mask[y * this.width + x] = 1;
      }
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = "#38f0c8";
    ctx.lineWidth = thickness;
    ctx.lineCap = "round";
    ctx.shadowColor = "#38f0c8";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, r - thickness / 2, Math.PI, TAU);
    ctx.stroke();
    ctx.restore();
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.drawImage(this.canvas as CanvasImageSource, 0, 0);
  }
}
