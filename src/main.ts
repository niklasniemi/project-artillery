import { Game, WORLD_W, WORLD_H } from "./game";
import { UI } from "./ui";

const canvas = document.getElementById("game") as HTMLCanvasElement;
canvas.width = WORLD_W;
canvas.height = WORLD_H;
const ctx = canvas.getContext("2d")!;

function resize(): void {
  const scale = Math.min(window.innerWidth / WORLD_W, window.innerHeight / WORLD_H);
  canvas.style.width = `${WORLD_W * scale}px`;
  canvas.style.height = `${WORLD_H * scale}px`;
}
window.addEventListener("resize", resize);
resize();

let game: Game;
const ui = new UI({
  onStart: (settings) => game.start(settings),
  onFire: () => game.fire(),
  onSelectWeapon: (i) => game.selectWeapon(i),
  onUpgrade: (i) => game.upgradeWeapon(i),
  onPlayAgain: () => {
    ui.clearHud();
    ui.showMenu();
  },
});
game = new Game(canvas, ctx, ui);
ui.showMenu();

if (import.meta.env.DEV) {
  // Debug handle for driving the sim from the console / test tooling.
  (window as unknown as { __game: Game }).__game = game;
}

// Fixed-timestep simulation (60 Hz) with rAF rendering.
const STEP = 1 / 60;
let last = performance.now();
let accumulator = 0;

function frame(now: number): void {
  accumulator += Math.min(0.25, (now - last) / 1000);
  last = now;
  while (accumulator >= STEP) {
    game.update(STEP);
    accumulator -= STEP;
  }
  game.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
