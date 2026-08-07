import { clamp, seededRandom, TAU } from "./util";
import { TerrainPaint } from "./themes";

export type TerrainType = "hilly" | "flat" | "cavern" | "islands";

const DEFAULT_PAINT: TerrainPaint = {
  lip: [176, 150, 108], soil: [96, 78, 62], base: [56, 48, 62],
  depth: [24, 22, 28], noise: 12, crest: 5, soilBand: 16,
};

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
  private paint: TerrainPaint = DEFAULT_PAINT;

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

  generate(
    type: TerrainType,
    seed = Math.floor(Math.random() * 1e9),
    paint: TerrainPaint = DEFAULT_PAINT,
  ): void {
    this.paint = paint;
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
    // Named depthRamp to avoid shadowing the per-column depth counter below.
    const { lip, soil, base, depth: depthRamp, noise: noiseAmt, crest, soilBand } = this.paint;
    const w = this.width, h = this.height;
    const mask = this.mask;

    for (let x = 0; x < w; x++) {
      let depth = -1;
      for (let y = 0; y < h; y++) {
        const mi = y * w + x;
        if (mask[mi] === 1) {
          depth = depth < 0 ? 0 : depth + 1;
        } else {
          depth = -1;
          continue;
        }

        const i = mi * 4;
        const n = rand() * noiseAmt;

        let r: number, g: number, b: number;
        if (depth < crest) {
          // Lit crest, easing into the soil rather than stopping dead.
          const t = depth / crest;
          r = lip[0] + (soil[0] - lip[0]) * t * t;
          g = lip[1] + (soil[1] - lip[1]) * t * t;
          b = lip[2] + (soil[2] - lip[2]) * t * t;
        } else if (depth < crest + soilBand) {
          // Topsoil fading into the body.
          const t = (depth - crest) / soilBand;
          r = soil[0] + (base[0] - soil[0]) * t;
          g = soil[1] + (base[1] - soil[1]) * t;
          b = soil[2] + (base[2] - soil[2]) * t;
          // Ambient occlusion just under the surface reads as depth.
          const ao = 1 - 0.16 * Math.sin(t * Math.PI);
          r *= ao; g *= ao; b *= ao;
        } else {
          const t = Math.min(1, (depth - crest - soilBand) / 260);
          r = base[0] - t * depthRamp[0];
          g = base[1] - t * depthRamp[1];
          b = base[2] - t * depthRamp[2];
          // Faint horizontal strata so the body is not a flat wash.
          const strata = Math.sin(y * 0.055 + x * 0.004) * 3.5;
          r += strata; g += strata * 0.8; b += strata * 0.9;
        }

        d[i] = r + n;
        d[i + 1] = g + n * 0.7;
        d[i + 2] = b + n * 0.9;
        // Coverage-based alpha: interior stays opaque, edges soften. This is
        // what removes the hard jagged outline the binary mask produced.
        d[i + 3] = 255;
      }
    }

    this.antialiasEdges(d);
    this.ctx.putImageData(img, 0, 0);
  }

  /**
   * Softens the silhouette by setting edge alpha from local mask coverage.
   * Interior pixels early-out, so only the thin boundary pays for the 3×3 tap.
   */
  private antialiasEdges(d: Uint8ClampedArray): void {
    const w = this.width, h = this.height;
    const mask = this.mask;
    for (let y = 0; y < h; y++) {
      const up = y > 0 ? -w : 0;
      const dn = y < h - 1 ? w : 0;
      for (let x = 0; x < w; x++) {
        const mi = y * w + x;
        if (mask[mi] === 0) continue;
        const lf = x > 0 ? -1 : 0;
        const rt = x < w - 1 ? 1 : 0;
        // Fully surrounded? Leave it opaque — the common case.
        if (mask[mi + up] === 1 && mask[mi + dn] === 1 &&
            mask[mi + lf] === 1 && mask[mi + rt] === 1) continue;
        let cover = 0;
        for (let oy = -1; oy <= 1; oy++) {
          const yy = y + oy;
          if (yy < 0 || yy >= h) continue;
          for (let ox = -1; ox <= 1; ox++) {
            const xx = x + ox;
            if (xx < 0 || xx >= w) continue;
            cover += mask[yy * w + xx];
          }
        }
        // Gamma-curved coverage: slivers fade out cleanly while mostly-covered
        // pixels stay solid, which reads as a smooth edge rather than a haze.
        // Only the visual alpha changes — the mask remains the physics truth.
        d[mi * 4 + 3] = Math.min(255, Math.pow(cover / 9, 0.7) * 255);
      }
    }
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
    // Scorch: a soft radial falloff on the surviving ground rather than a
    // hard ring, so craters blend into the terrain instead of outlining it.
    ctx.globalCompositeOperation = "source-atop";
    const scorch = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.75);
    scorch.addColorStop(0, "rgba(18, 10, 8, 0.62)");
    scorch.addColorStop(0.45, "rgba(40, 22, 14, 0.3)");
    scorch.addColorStop(1, "rgba(40, 22, 14, 0)");
    ctx.fillStyle = scorch;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.75, 0, TAU);
    ctx.fill();
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
    const seam = ctx.createRadialGradient(cx, cy, Math.min(rx, ry) * 0.8, cx, cy, Math.max(rx, ry) * 1.3);
    seam.addColorStop(0, "rgba(26, 16, 10, 0.5)");
    seam.addColorStop(1, "rgba(26, 16, 10, 0)");
    ctx.fillStyle = seam;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 1.4, ry * 1.5, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Grows a permanent blob of ground. Behaves exactly like generated terrain
   * afterwards — solid, diggable, destructible — so it is painted with the
   * same crest/soil/body ramp instead of a flat colour patch.
   * Returns the new surface height at the centre.
   */
  addBlob(cx: number, cy: number, r: number): number {
    this.stampEllipse(cx, cy, r, r * 0.78, 1);

    const ctx = this.ctx;
    const top = cy - r * 0.78;
    const { lip, soil, base, crest, soilBand } = this.paint;
    const rgb = (c: [number, number, number]): string => `rgb(${c[0]},${c[1]},${c[2]})`;

    ctx.save();
    const g = ctx.createLinearGradient(0, top, 0, cy + r * 0.78);
    g.addColorStop(0, rgb(lip));
    g.addColorStop(Math.min(0.4, crest / (r * 1.56)), rgb(lip));
    g.addColorStop(Math.min(0.6, (crest + soilBand) / (r * 1.56)), rgb(soil));
    g.addColorStop(1, rgb(base));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.78, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    return this.surfaceY(cx, Math.max(0, (top - 4) | 0));
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
    ctx.beginPath();
    ctx.arc(cx, cy, r - thickness / 2, Math.PI, TAU);
    ctx.stroke();
    ctx.restore();
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.drawImage(this.canvas as CanvasImageSource, 0, 0);
  }
}
