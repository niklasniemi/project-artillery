import { Game, WORLD_W, WORLD_H } from "./game";
import { UI, MatchSettings } from "./ui";
import { Net, StartPayload } from "./net";

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
let net: Net | null = null;

function ensureNet(): Net {
  if (net) return net;
  net = new Net();
  net.onLobby = (view) => ui.showLobby(view);
  net.onStart = (payload: StartPayload) => {
    const settings: MatchSettings = {
      ...payload.settings,
      players: payload.seats.map((s) => ({ name: s.name, isAI: false, loadout: s.loadout })),
    };
    ui.closeLobby();
    game.start(settings, {
      seed: payload.seed,
      online: {
        mySeat: payload.mySeat,
        send: (type, msg) => net?.send(type, msg),
      },
    });
  };
  net.onAim = (seat, angle, power) => game.remoteAim(seat, angle, power);
  net.onDrive = (seat, x, y, fuel, facing) => game.remoteDrive(seat, x, y, fuel, facing);
  net.onFire = (seat, msg) => game.remoteFire(seat, msg);
  net.onSplit = (seat, msg) => game.remoteSplit(seat, msg);
  net.onUpgrade = (seat, weaponIndex) => game.upgradeWeapon(weaponIndex, true, seat);
  net.onCrate = (seat, index) => game.remoteCrate(seat, index);
  net.onAdvance = (nextSeat, snapshot, gameOver) => game.advanceTurn(nextSeat, snapshot, gameOver);
  net.onDropped = (reason) => {
    game.online = null;
    ui.clearHud();
    ui.showMenu();
    ui.netStatus(reason);
  };
  return net;
}

const ui = new UI({
  onStart: (settings) => game.start(settings),
  onFire: () => game.fire(),
  onSelectWeapon: (i) => game.selectWeapon(i),
  onUpgrade: (i) => game.upgradeWeapon(i),
  onPlayAgain: () => {
    ui.clearHud();
    if (net?.connected && net.lastLobby) {
      ui.showLobby(net.lastLobby);
    } else {
      ui.showMenu();
    }
  },
  onCreateRoom: async (name, settings) => {
    try {
      await ensureNet().create(name, settings);
    } catch (err) {
      ui.netStatus(`Could not reach server at ${(err as Error).message ?? "?"} — is it running?`);
    }
  },
  onJoinRoom: async (name, code) => {
    try {
      await ensureNet().join(name, code);
    } catch {
      ui.netStatus("Join failed — check the code (room may be full or already playing).");
    }
  },
  onReadyToggle: () => net?.send("ready"),
  onLoadout: (loadout) => net?.send("loadout", loadout),
  onStartOnline: () => net?.send("start"),
  onLeaveRoom: () => {
    net?.leave();
    ui.closeLobby();
    ui.showMenu();
  },
});
game = new Game(canvas, ctx, ui);
ui.showMenu();

if (import.meta.env.DEV) {
  // Debug handle for driving the sim from the console / test tooling.
  (window as unknown as { __game: Game }).__game = game;
  (window as unknown as { __net: () => Net }).__net = ensureNet;
}

// Fixed-timestep simulation (60 Hz) with rAF rendering.
const STEP = 1 / 60;
const MAX_STEPS = 5; // never spiral: drop sim time rather than stall the frame
let last = performance.now();
let accumulator = 0;

// Frame telemetry: a slow rolling average drives particle budget so a heavy
// 8-tank volley sheds effects instead of dropping below 60 FPS.
let avgFrameMs = 16.7;
let quality = 1;
let fpsAccum = 0;
let fpsFrames = 0;
let shownFps = 60;

function frame(now: number): void {
  const rawDt = (now - last) / 1000;
  last = now;

  const frameMs = Math.min(100, rawDt * 1000);
  avgFrameMs += (frameMs - avgFrameMs) * 0.06;

  fpsAccum += rawDt;
  fpsFrames++;
  if (fpsAccum >= 0.5) {
    shownFps = Math.round(fpsFrames / fpsAccum);
    fpsAccum = 0;
    fpsFrames = 0;
    ui.updateFps(shownFps, quality < 0.99);
  }

  // Hysteresis so quality doesn't oscillate on the boundary.
  if (avgFrameMs > 19.5 && quality > 0.35) quality = Math.max(0.35, quality - 0.06);
  else if (avgFrameMs < 15.2 && quality < 1) quality = Math.min(1, quality + 0.02);
  game.setQuality(quality);

  accumulator += Math.min(0.25, rawDt * game.timeScale);
  let steps = 0;
  while (accumulator >= STEP && steps < MAX_STEPS) {
    game.update(STEP);
    accumulator -= STEP;
    steps++;
  }
  if (steps === MAX_STEPS) accumulator = 0;

  game.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
