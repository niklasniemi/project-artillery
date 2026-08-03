import { Tank } from "./entities";
import { WEAPONS, XP_LEVELS } from "./weapons";
import { TerrainType } from "./terrain";
import { formatDeg } from "./util";
import { sfx } from "./audio";
import { storedServerUrl, setStoredServerUrl, resolveServerUrl } from "./net";
import { TANK_TYPES, TANK_COLORS, Loadout, typeById, paletteFor, drawChassis } from "./tanks";
import { MAP_THEMES, paintThumbnail } from "./themes";
import { GravityMode, PaceMode } from "./physics";
import { weaponIcon } from "./icons";

export type GameMode = "deathmatch" | "points" | "juggernaut" | "assassination";

export interface MatchPlayer {
  name: string;
  isAI: boolean;
  loadout?: Loadout;
}

export interface CinematicCard {
  name: string;
  type: string;
  role: string;
  color: string;
  index: number;
  total: number;
}

export interface MatchSettings {
  players: MatchPlayer[];
  mode: GameMode;
  rounds: number;      // points mode: turns per tank
  startHp: number;
  startFuel: number;
  windMode: "none" | "low" | "realistic" | "chaotic";
  turnSeconds: number; // 0 = no timer
  terrainType: TerrainType;
  crates: boolean;
  bannedWeapons: number[];
  cinematics: boolean;
  mapTheme: string;
  gravity: GravityMode;
  pace: PaceMode;
  aimGuide: "off" | "short" | "full";
  fallDamage: boolean;
  friendlyFire: boolean;
  startLevel: number;
  fuelResupply: "off" | "partial" | "full";
}

export interface LobbyPlayer {
  name: string;
  seat: number;
  ready: boolean;
  isHost: boolean;
  isMe: boolean;
  loadout?: Loadout;
}

export interface LobbyView {
  code: string;
  players: LobbyPlayer[];
  iAmHost: boolean;
  settings: MatchSettings | null;
}

interface UICallbacks {
  onFire: () => void;
  onSelectWeapon: (index: number) => void;
  onUpgrade: (weaponIndex: number) => void;
  onStart: (settings: MatchSettings) => void;
  onPlayAgain: () => void;
  onCreateRoom: (name: string, settings: MatchSettings) => void;
  onJoinRoom: (name: string, code: string) => void;
  onReadyToggle: () => void;
  onStartOnline: () => void;
  onLeaveRoom: () => void;
  onLoadout: (loadout: Loadout) => void;
}

const MODES: { id: GameMode; num: string; name: string; brief: string }[] = [
  { id: "deathmatch", num: "01", name: "Deathmatch", brief: "Last tank rolling takes the field." },
  { id: "points", num: "02", name: "Points", brief: "Respawns on. Damage and kills score." },
  { id: "juggernaut", num: "03", name: "Juggernaut", brief: "One armoured boss against all guns." },
  { id: "assassination", num: "04", name: "Assassination", brief: "2v2. Kill their VIP, shield yours." },
];

const PALETTE_HEX = ["#28c7f0", "#f04da0", "#9df04d", "#f0a52d", "#b44df0", "#4df0b4", "#f0654d", "#e8e8f0"];

interface Opt { value: string; label: string }

/** Segmented switch bank — replaces a native <select>. */
function bank(id: string, label: string, opts: Opt[], selected: string): string {
  const cells = opts.map((o) =>
    `<button type="button" class="bank-opt" data-val="${o.value}" aria-pressed="${o.value === selected}">${o.label}</button>`,
  ).join("");
  return `
    <div class="bank" data-bank="${id}" data-value="${selected}">
      <span class="label">${label}</span>
      <div class="bank-opts">${cells}</div>
    </div>`;
}

/** Notched dial — a range input dressed as an instrument. */
function dial(id: string, label: string, min: number, max: number, step: number, value: number): string {
  const ticks = Array.from({ length: 21 }, () => "<i></i>").join("");
  return `
    <div class="dial" data-dial="${id}">
      <span class="label">${label}</span>
      <div class="track-wrap">
        <div class="ticks">${ticks}</div>
        <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" />
      </div>
      <span class="readout" data-readout>${value}</span>
    </div>`;
}

function opsGrid(selected: GameMode): string {
  return `<div class="ops" data-ops>` + MODES.map((m) => `
    <button type="button" class="op" data-mode="${m.id}" aria-pressed="${m.id === selected}">
      <span class="num">${m.num}</span>
      <span class="nm">${m.name}</span>
      <span class="br">${m.brief}</span>
    </button>`).join("") + `</div>`;
}

function armoryGrid(): string {
  return `<div class="armory" data-armory>` + WEAPONS.map((w, i) =>
    `<button type="button" class="arm" data-idx="${i}" title="${w.name} — click to ban">${weaponIcon(w.id)}</button>`,
  ).join("") + `</div>`;
}

/** Map cards with rendered previews, so a card always looks like its map. */
function mapGrid(selected: string): string {
  return `<div class="maps" data-maps="${selected}">` + MAP_THEMES.map((m) => `
    <button type="button" class="mapcard" data-map="${m.id}" aria-pressed="${m.id === selected}">
      <canvas class="mapthumb" width="200" height="112" data-thumb="${m.id}"></canvas>
      <span class="mp-name">${m.name}</span>
      <span class="mp-blurb">${m.blurb}</span>
    </button>`).join("") + `</div>`;
}

/** Ballistic-arc decoration for the masthead rail. */
function arcSvg(): string {
  const pts: string[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const x = 20 + t * 250;
    const y = 210 - (Math.sin(t * Math.PI) * 150 - t * 18);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  const grid = Array.from({ length: 6 }, (_, i) =>
    `<line class="arc-grid" x1="0" y1="${40 + i * 34}" x2="320" y2="${40 + i * 34}"/>`).join("");
  return `
    <svg class="rail-arc" viewBox="0 0 320 260" aria-hidden="true">
      ${grid}
      <polyline class="arc-path" points="${pts.join(" ")}"/>
      <circle class="arc-dot" cx="20" cy="210" r="3"/>
      <circle class="arc-dot" cx="270" cy="192" r="3"/>
    </svg>`;
}

export class UI {
  private hud = document.getElementById("hud")!;
  private menu = document.getElementById("menu")!;
  private turnName!: HTMLElement;
  private timerEl!: HTMLElement;
  private windEl!: HTMLElement;
  private modeInfoEl!: HTMLElement;
  private angleVal!: HTMLElement;
  private powerVal!: HTMLElement;
  private powerFill!: HTMLElement;
  private fuelFill!: HTMLElement;
  private fuelVal!: HTMLElement;
  private weaponSlots: HTMLElement[] = [];
  private weaponNameEl!: HTMLElement;
  private fireBtn!: HTMLButtonElement;
  private xpFill!: HTMLElement;
  private xpLvl!: HTMLElement;
  private upgradeHint!: HTMLElement;
  private awardsEl!: HTMLElement;
  private fpsEl!: HTMLElement;
  private upgradeOverlay: HTMLElement | null = null;
  private lobbyOverlay: HTMLElement | null = null;
  private banned = new Set<number>();

  constructor(private cb: UICallbacks) {}

  // ---------- Control-surface helpers ----------

  private wireBanks(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>("[data-bank]").forEach((el) => {
      el.querySelectorAll<HTMLButtonElement>(".bank-opt").forEach((btn) => {
        btn.onclick = () => {
          el.dataset.value = btn.dataset.val!;
          el.querySelectorAll(".bank-opt").forEach((b) =>
            b.setAttribute("aria-pressed", String(b === btn)));
          sfx.ui();
          this.syncConditionalRows(root);
        };
      });
    });
    root.querySelectorAll<HTMLElement>("[data-dial]").forEach((el) => {
      const input = el.querySelector<HTMLInputElement>("input")!;
      const out = el.querySelector<HTMLElement>("[data-readout]")!;
      input.oninput = () => (out.textContent = input.value);
    });
    root.querySelectorAll<HTMLElement>("[data-ops]").forEach((el) => {
      el.querySelectorAll<HTMLButtonElement>(".op").forEach((btn) => {
        btn.onclick = () => {
          el.dataset.mode = btn.dataset.mode!;
          el.querySelectorAll(".op").forEach((b) =>
            b.setAttribute("aria-pressed", String(b === btn)));
          sfx.ui();
          this.syncConditionalRows(root);
        };
      });
      el.dataset.mode = el.dataset.mode || "deathmatch";
    });
    root.querySelectorAll<HTMLElement>("[data-maps]").forEach((el) => {
      el.querySelectorAll<HTMLCanvasElement>("[data-thumb]").forEach((cv) => {
        const theme = MAP_THEMES.find((m) => m.id === cv.dataset.thumb);
        if (theme) paintThumbnail(cv, theme);
      });
      el.querySelectorAll<HTMLButtonElement>(".mapcard").forEach((btn) => {
        btn.onclick = () => {
          el.dataset.maps = btn.dataset.map!;
          el.querySelectorAll(".mapcard").forEach((b) =>
            b.setAttribute("aria-pressed", String(b === btn)));
          sfx.ui();
        };
      });
    });
    root.querySelectorAll<HTMLElement>("[data-armory]").forEach((el) => {
      el.querySelectorAll<HTMLButtonElement>(".arm").forEach((btn) => {
        const idx = parseInt(btn.dataset.idx!, 10);
        btn.classList.toggle("banned", this.banned.has(idx));
        btn.onclick = () => {
          if (this.banned.has(idx)) this.banned.delete(idx);
          else if (this.banned.size < WEAPONS.length - 1) this.banned.add(idx);
          btn.classList.toggle("banned", this.banned.has(idx));
          sfx.ui();
        };
      });
    });
    this.syncConditionalRows(root);
  }

  /** Rounds only matters in Points — grey it out elsewhere. */
  private syncConditionalRows(root: HTMLElement): void {
    const mode = root.querySelector<HTMLElement>("[data-ops]")?.dataset.mode;
    const rounds = root.querySelector<HTMLElement>('[data-bank="rounds"]');
    if (rounds) rounds.classList.toggle("disabled", mode !== "points");
  }

  private readSettings(root: HTMLElement, players: MatchSettings["players"]): MatchSettings {
    const bankVal = (id: string): string =>
      root.querySelector<HTMLElement>(`[data-bank="${id}"]`)!.dataset.value!;
    const dialVal = (id: string): number =>
      parseInt(root.querySelector<HTMLInputElement>(`#${id}`)!.value, 10);
    return {
      players,
      mode: (root.querySelector<HTMLElement>("[data-ops]")!.dataset.mode ?? "deathmatch") as GameMode,
      rounds: parseInt(bankVal("rounds"), 10),
      startHp: dialVal(`${root.id}-hp`),
      startFuel: dialVal(`${root.id}-fuel`),
      windMode: bankVal("wind") as MatchSettings["windMode"],
      turnSeconds: parseInt(bankVal("timer"), 10),
      terrainType: bankVal("terrain") as TerrainType,
      crates: bankVal("crates") === "on",
      bannedWeapons: [...this.banned],
      cinematics: bankVal("cine") === "on",
      mapTheme: root.querySelector<HTMLElement>("[data-maps]")?.dataset.maps ?? "nightfall",
      gravity: bankVal("gravity") as GravityMode,
      pace: bankVal("pace") as PaceMode,
      aimGuide: bankVal("guide") as MatchSettings["aimGuide"],
      fallDamage: bankVal("falldmg") === "on",
      friendlyFire: bankVal("ff") === "on",
      startLevel: parseInt(bankVal("startlvl"), 10),
      fuelResupply: bankVal("resupply") as MatchSettings["fuelResupply"],
    };
  }

  private controlSurface(prefix: string): string {
    return `
      ${opsGrid("deathmatch")}
      <div class="section-break"><span>Theatre</span></div>
      ${mapGrid("nightfall")}
      <div class="section-break"><span>Rules</span></div>
      ${bank("terrain", "Terrain", [
        { value: "hilly", label: "Hilly" },
        { value: "flat", label: "Flat" },
        { value: "cavern", label: "Cavern" },
        { value: "islands", label: "Islands" },
      ], "hilly")}
      ${bank("wind", "Wind", [
        { value: "none", label: "None" },
        { value: "low", label: "Low" },
        { value: "realistic", label: "Real" },
        { value: "chaotic", label: "Chaos" },
      ], "realistic")}
      ${bank("timer", "Turn Clock", [
        { value: "15", label: "15s" },
        { value: "30", label: "30s" },
        { value: "45", label: "45s" },
        { value: "0", label: "Off" },
      ], "30")}
      ${bank("crates", "Airdrops", [
        { value: "on", label: "On" },
        { value: "off", label: "Off" },
      ], "on")}
      ${bank("rounds", "Rounds", [
        { value: "5", label: "5" },
        { value: "8", label: "8" },
        { value: "12", label: "12" },
      ], "8")}
      ${bank("cine", "Cinematics", [
        { value: "on", label: "On" },
        { value: "off", label: "Off" },
      ], "on")}
      ${bank("gravity", "Gravity", [
        { value: "low", label: "Low" },
        { value: "normal", label: "Normal" },
        { value: "high", label: "High" },
      ], "normal")}
      ${bank("pace", "Shell Pace", [
        { value: "cinematic", label: "Cinematic" },
        { value: "normal", label: "Normal" },
        { value: "fast", label: "Fast" },
      ], "normal")}
      ${bank("guide", "Aim Guide", [
        { value: "full", label: "Full" },
        { value: "short", label: "Short" },
        { value: "off", label: "Off" },
      ], "full")}
      ${bank("falldmg", "Fall Damage", [
        { value: "on", label: "On" },
        { value: "off", label: "Off" },
      ], "on")}
      ${bank("ff", "Friendly Fire", [
        { value: "on", label: "On" },
        { value: "off", label: "Off" },
      ], "on")}
      ${bank("startlvl", "Start Level", [
        { value: "0", label: "0" },
        { value: "1", label: "1" },
        { value: "2", label: "2" },
      ], "0")}
      ${bank("resupply", "Fuel Resupply", [
        { value: "off", label: "None" },
        { value: "partial", label: "+40%/turn" },
        { value: "full", label: "Full/turn" },
      ], "off")}
      ${dial(`${prefix}-hp`, "Hull Points", 50, 200, 10, 100)}
      ${dial(`${prefix}-fuel`, "Fuel Load", 0, 250, 10, 100)}
      <div class="section-break"><span>Armory · click to ban</span></div>
      ${armoryGrid()}`;
  }

  // ---------- Main menu ----------

  showMenu(): void {
    const savedName = localStorage.getItem("pa-name") ?? `Gunner-${Math.floor(Math.random() * 900 + 100)}`;
    const savedServer = storedServerUrl();
    this.menu.innerHTML = `
      <div class="doc">
        <aside class="doc-rail">
          <div class="stamp">MK·IV / LIVE FIRE</div>
          <h1 class="masthead">Project<em>Artillery</em></h1>
          <div class="rail-meta">
            <div>DOC. <b>PA-2050/ORD</b></div>
            <div>FIRE CONTROL MANUAL</div>
            <div>ISSUE <b>04</b> · UNRESTRICTED</div>
          </div>
          ${arcSvg()}
          <div class="rail-foot">NO RANKS · NO GRIND<br/>EVERY GUN UNLOCKED</div>
        </aside>
        <main class="doc-body">
          <nav class="folder-tabs">
            <button class="ftab active" data-tab="local">§1 · Local Range</button>
            <button class="ftab" data-tab="online">§2 · Online Play</button>
          </nav>
          <div class="sheet" id="local">
            <div class="sheet-head">
              <h2>Range Configuration</h2>
              <span class="hint">Host sets the rules</span>
            </div>
            ${bank("roster", "Roster", [
              { value: "1v1ai", label: "1 Bot" },
              { value: "1v2ai", label: "2 Bots" },
              { value: "1v3ai", label: "3 Bots" },
              { value: "2p", label: "2P Seat" },
              { value: "3p", label: "3P Seat" },
              { value: "4p", label: "4P Seat" },
            ], "1v1ai")}
            ${this.controlSurface("local")}
            <button class="btn fire-key" id="s-start">Commence Fire ▸</button>
          </div>
          <div class="sheet" id="online" style="display:none">
            <div class="sheet-head">
              <h2>Online Play</h2>
              <span class="hint">Play with friends · up to 8</span>
            </div>

            <div class="field">
              <span class="label">Your name</span>
              <input type="text" id="o-name" maxlength="14" value="${savedName}" />
            </div>

            <!-- Step 1: one clear choice, nothing else on screen yet. -->
            <div class="choice" id="o-choice">
              <button type="button" class="choice-card" data-flow="host">
                <span class="ch-num">1</span>
                <span class="ch-title">Host a game</span>
                <span class="ch-desc">Set the rules and get a room code to share with your friends.</span>
                <span class="ch-go">Choose ▸</span>
              </button>
              <button type="button" class="choice-card" data-flow="join">
                <span class="ch-num">2</span>
                <span class="ch-title">Join a game</span>
                <span class="ch-desc">Already have a room code from a friend? Enter it here.</span>
                <span class="ch-go">Choose ▸</span>
              </button>
            </div>

            <!-- Step 2a: join -->
            <div class="flow" id="o-flow-join" style="display:none">
              <button type="button" class="backlink" data-back>◂ Back</button>
              <h3 class="flow-title">Join a game</h3>
              <p class="flow-help">Ask the host for their room code — it appears at the
                top of their lobby screen. Type or paste it below.</p>
              <div class="field">
                <span class="label">Room code</span>
                <input type="text" id="o-code" maxlength="14" placeholder="e.g. A4VRp30s2" />
              </div>
              <button class="btn fire-key" id="o-join">Join game ▸</button>
            </div>

            <!-- Step 2b: host -->
            <div class="flow" id="o-flow-host" style="display:none">
              <button type="button" class="backlink" data-back>◂ Back</button>
              <h3 class="flow-title">Host a game</h3>
              <p class="flow-help">Pick your rules, then share the room code with your
                friends. You can still change your tank in the lobby.</p>
              ${this.controlSurface("online")}
              <button class="btn fire-key" id="o-create">Create room ▸</button>
            </div>

            <div class="net-status" id="o-status"></div>

            <!-- Connection details, hidden unless something is wrong or asked for. -->
            <details class="conn" id="o-conn">
              <summary>Connection settings</summary>
              <div class="field" style="margin-top:10px">
                <span class="label">Server</span>
                <input type="text" id="o-server" placeholder="your-service.onrender.com" value="${savedServer}" />
              </div>
              <div class="note" id="o-serverhint"></div>
            </details>
          </div>
        </main>
      </div>`;

    const localPane = this.menu.querySelector<HTMLElement>("#local")!;
    const onlinePane = this.menu.querySelector<HTMLElement>("#online")!;

    this.menu.querySelectorAll<HTMLButtonElement>(".ftab").forEach((btn) => {
      btn.onclick = () => {
        sfx.unlock(); sfx.ui();
        this.menu.querySelectorAll(".ftab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        localPane.style.display = btn.dataset.tab === "local" ? "" : "none";
        onlinePane.style.display = btn.dataset.tab === "online" ? "" : "none";
      };
    });

    this.wireBanks(localPane);
    this.wireBanks(onlinePane);

    this.menu.querySelector<HTMLButtonElement>("#s-start")!.onclick = () => {
      sfx.unlock(); sfx.ui();
      const roster = localPane.querySelector<HTMLElement>('[data-bank="roster"]')!.dataset.value!;
      const players: MatchSettings["players"] = [{ name: "Player 1", isAI: false }];
      if (roster === "1v1ai") players.push({ name: "Vector", isAI: true });
      else if (roster === "1v2ai") players.push({ name: "Vector", isAI: true }, { name: "Torque", isAI: true });
      else if (roster === "1v3ai") players.push({ name: "Vector", isAI: true }, { name: "Torque", isAI: true }, { name: "Parabola", isAI: true });
      else {
        const humans = parseInt(roster, 10);
        for (let i = 2; i <= humans; i++) players.push({ name: `Player ${i}`, isAI: false });
      }
      const settings = this.readSettings(localPane, players);
      // Each human picks a chassis in turn before the match opens.
      const humans = players.filter((p) => !p.isAI);
      const runPick = (i: number): void => {
        if (i >= humans.length) {
          this.menu.innerHTML = "";
          this.cb.onStart(settings);
          return;
        }
        const p = humans[i];
        this.showTankSelect(`${p.name} · select chassis`, this.loadStoredLoadout(i), (l) => {
          p.loadout = l;
          this.storeLoadout(i, l);
          runPick(i + 1);
        });
      };
      runPick(0);
    };

    // Step 1 → step 2 navigation.
    const choice = this.menu.querySelector<HTMLElement>("#o-choice")!;
    const flowHost = this.menu.querySelector<HTMLElement>("#o-flow-host")!;
    const flowJoin = this.menu.querySelector<HTMLElement>("#o-flow-join")!;
    const showFlow = (which: "none" | "host" | "join"): void => {
      choice.style.display = which === "none" ? "" : "none";
      flowHost.style.display = which === "host" ? "" : "none";
      flowJoin.style.display = which === "join" ? "" : "none";
      this.netStatus("");
      if (which === "join") {
        this.menu.querySelector<HTMLInputElement>("#o-code")?.focus();
      }
    };
    choice.querySelectorAll<HTMLButtonElement>(".choice-card").forEach((btn) => {
      btn.onclick = () => {
        sfx.unlock(); sfx.ui();
        showFlow(btn.dataset.flow as "host" | "join");
      };
    });
    this.menu.querySelectorAll<HTMLButtonElement>("[data-back]").forEach((b) => {
      b.onclick = () => { sfx.ui(); showFlow("none"); };
    });

    const serverInput = this.menu.querySelector<HTMLInputElement>("#o-server")!;
    const serverHint = this.menu.querySelector<HTMLElement>("#o-serverhint")!;
    const conn = this.menu.querySelector<HTMLDetailsElement>("#o-conn")!;
    const refreshHint = (): void => {
      const url = resolveServerUrl();
      if (url) {
        serverHint.textContent = `Connecting to ${url}`;
      } else {
        // Nothing configured — surface it instead of letting a join hang.
        serverHint.textContent = "No server set. Enter your server address above to play online.";
        conn.open = true;
      }
    };
    serverInput.onchange = () => {
      const normalized = setStoredServerUrl(serverInput.value);
      serverInput.value = normalized;
      refreshHint();
    };
    refreshHint();

    const nameOf = (): string => {
      const name = (this.menu.querySelector<HTMLInputElement>("#o-name")!.value.trim() || "Gunner").slice(0, 14);
      localStorage.setItem("pa-name", name);
      setStoredServerUrl(serverInput.value);
      return name;
    };
    this.menu.querySelector<HTMLButtonElement>("#o-create")!.onclick = () => {
      sfx.unlock(); sfx.ui();
      this.netStatus("Creating your room…");
      this.cb.onCreateRoom(nameOf(), this.readSettings(onlinePane, []));
    };
    const doJoin = (): void => {
      sfx.unlock(); sfx.ui();
      const code = this.menu.querySelector<HTMLInputElement>("#o-code")!.value.trim();
      if (!code) { this.netStatus("Enter the room code your friend gave you."); return; }
      this.netStatus("Joining…");
      this.cb.onJoinRoom(nameOf(), code);
    };
    this.menu.querySelector<HTMLButtonElement>("#o-join")!.onclick = doJoin;
    // Enter submits, which is what anyone pasting a code expects.
    this.menu.querySelector<HTMLInputElement>("#o-code")!.onkeydown = (e) => {
      if (e.key === "Enter") { e.preventDefault(); doJoin(); }
    };
  }

  // ---------- Tank selector ----------

  /** Remembers each seat's last loadout so repeat matches are one click. */
  loadStoredLoadout(slot: number): Loadout {
    try {
      const raw = localStorage.getItem(`pa-loadout-${slot}`);
      if (raw) {
        const parsed = JSON.parse(raw) as Loadout;
        if (typeof parsed.type === "string" && typeof parsed.color === "number") {
          return { type: typeById(parsed.type).id, color: parsed.color };
        }
      }
    } catch {
      /* corrupt or unavailable storage — fall through to the default */
    }
    return { type: TANK_TYPES[0].id, color: slot % TANK_COLORS.length };
  }

  storeLoadout(slot: number, l: Loadout): void {
    try {
      localStorage.setItem(`pa-loadout-${slot}`, JSON.stringify(l));
    } catch {
      /* non-fatal */
    }
  }

  /**
   * Chassis + livery picker. Runs modally; `onDone` receives the loadout.
   * Used for each local human in turn and from the online lobby.
   */
  showTankSelect(title: string, initial: Loadout, onDone: (l: Loadout) => void): void {
    const pick: Loadout = { ...initial };
    const host = this.menu.innerHTML ? this.menu : this.hud;
    const overlay = document.createElement("div");
    overlay.className = "overlay";

    const typeRows = TANK_TYPES.map((t) => `
      <button type="button" class="chassis" data-type="${t.id}">
        <span class="cx-name">${t.name}</span>
        <span class="cx-role">${t.role}</span>
      </button>`).join("");

    const swatches = TANK_COLORS.map((c, i) => `
      <button type="button" class="swatch-btn" data-color="${i}" style="--sw:${c}"></button>`).join("");

    overlay.innerHTML = `
      <div class="panel wide select-panel">
        <div class="subtitle" style="margin:0 0 2px">Chassis assignment</div>
        <h2 id="ts-title">${title}</h2>
        <div class="select-grid">
          <div class="chassis-list">${typeRows}</div>
          <div class="preview-col">
            <canvas class="preview" id="ts-preview" width="460" height="290"></canvas>
            <div class="preview-brief" id="ts-brief"></div>
            <div class="swatches">${swatches}</div>
          </div>
          <div class="stats" id="ts-stats"></div>
        </div>
        <button class="btn fire-key" id="ts-confirm" style="margin-top:16px">Confirm ▸</button>
      </div>`;

    host.appendChild(overlay);

    const canvas = overlay.querySelector<HTMLCanvasElement>("#ts-preview")!;
    const pctx = canvas.getContext("2d")!;
    const brief = overlay.querySelector<HTMLElement>("#ts-brief")!;
    const statsEl = overlay.querySelector<HTMLElement>("#ts-stats")!;

    const STAT_ROWS: { label: string; get: (a: Record<string, number>) => number }[] = [
      { label: "Hull", get: (a) => a.hp },
      { label: "Fuel", get: (a) => a.fuel },
      { label: "Speed", get: (a) => a.drive },
      { label: "Damage", get: (a) => a.damage },
      // Armour is stored as damage taken — invert so longer bars read better.
      { label: "Armour", get: (a) => 2 - a.armor },
      { label: "Blast", get: (a) => a.blast },
      { label: "Muzzle", get: (a) => a.velocity },
      { label: "Wind hold", get: (a) => 2 - a.wind },
    ];

    const render = (): void => {
      const type = typeById(pick.type);
      const pal = paletteFor(pick.color);

      overlay.querySelectorAll<HTMLElement>(".chassis").forEach((b) =>
        b.classList.toggle("on", b.dataset.type === pick.type));
      overlay.querySelectorAll<HTMLElement>(".swatch-btn").forEach((b) =>
        b.classList.toggle("on", Number(b.dataset.color) === pick.color));

      brief.textContent = type.brief;

      const a = type.attrs as unknown as Record<string, number>;
      statsEl.innerHTML = STAT_ROWS.map((r) => {
        const v = r.get(a);
        // 0.55–1.6 spans the full range of values any chassis uses.
        const pct = Math.max(4, Math.min(100, ((v - 0.55) / 1.05) * 100));
        const cls = v > 1.04 ? "up" : v < 0.96 ? "down" : "";
        return `
          <div class="stat">
            <span class="label">${r.label}</span>
            <div class="stat-bar"><i class="${cls}" style="width:${pct}%"></i></div>
          </div>`;
      }).join("");

      pctx.clearRect(0, 0, canvas.width, canvas.height);
      const groundY = 218;
      // Ground line so the chassis has something to sit on.
      pctx.strokeStyle = "rgba(139,130,112,0.55)";
      pctx.lineWidth = 1.5;
      pctx.beginPath();
      pctx.moveTo(40, groundY);
      pctx.lineTo(420, groundY);
      pctx.stroke();
      drawChassis(pctx, type.id, pal, 215, groundY, 1, -0.62, 52);
    };

    overlay.querySelectorAll<HTMLButtonElement>(".chassis").forEach((btn) => {
      btn.onclick = () => { pick.type = btn.dataset.type!; sfx.ui(); render(); };
    });
    overlay.querySelectorAll<HTMLButtonElement>(".swatch-btn").forEach((btn) => {
      btn.onclick = () => { pick.color = Number(btn.dataset.color); sfx.ui(); render(); };
    });
    overlay.querySelector<HTMLButtonElement>("#ts-confirm")!.onclick = () => {
      sfx.ui();
      overlay.remove();
      onDone(pick);
    };

    render();
  }

  netStatus(text: string, ok = false): void {
    const el = this.menu.querySelector<HTMLElement>("#o-status")
      ?? this.lobbyOverlay?.querySelector<HTMLElement>(".net-status");
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("ok", ok);
  }

  // ---------- Online lobby ----------

  showLobby(view: LobbyView): void {
    this.closeLobby();
    this.menu.innerHTML = "";
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    const me = view.players.find((p) => p.isMe);
    const allReady = view.players.length >= 2 && view.players.every((p) => p.ready || p.isHost);
    const rows = view.players.map((p) => `
      <div class="score-row">
        <span class="rank">${String(p.seat + 1).padStart(2, "0")}</span>
        <span class="swatch" style="background:${p.loadout ? TANK_COLORS[p.loadout.color % TANK_COLORS.length] : PALETTE_HEX[p.seat % 8]}"></span>
        <span class="sname">${p.name}${p.isMe ? " ·you" : ""}</span>
        <span class="sval">${p.loadout ? typeById(p.loadout.type).name + " · " : ""}${p.isHost ? "HOST" : p.ready ? "READY" : "standby"}</span>
      </div>`).join("");
    const s = view.settings;
    const summary = s
      ? `${s.mode} · ${s.terrainType} · wind ${s.windMode} · ${s.turnSeconds ? s.turnSeconds + "s clock" : "no clock"} · ${s.startHp} hp${s.bannedWeapons?.length ? ` · ${s.bannedWeapons.length} banned` : ""}`
      : "";
    overlay.innerHTML = `
      <div class="panel">
        <h2>Room <span class="room-code">${view.code}</span></h2>
        <div class="subtitle">Share the code · ${summary}</div>
        ${rows}
        <div style="height:16px"></div>
        <div class="row-buttons">
          ${view.iAmHost
            ? `<button class="btn fire-key" id="l-start" style="margin-top:0" ${allReady ? "" : "disabled"}>Launch Operation ▸</button>`
            : `<button class="btn" id="l-ready">${me?.ready ? "Stand Down" : "Ready Up"}</button>`}
          <button class="btn small" id="l-tank">Chassis</button>
          <button class="btn small" id="l-leave">Withdraw</button>
        </div>
        <div class="net-status"></div>
      </div>`;
    overlay.querySelector<HTMLButtonElement>("#l-leave")!.onclick = () => { sfx.ui(); this.cb.onLeaveRoom(); };
    overlay.querySelector<HTMLButtonElement>("#l-tank")!.onclick = () => {
      sfx.ui();
      const current = me?.loadout ?? this.loadStoredLoadout(0);
      this.showTankSelect("Select chassis", current, (l) => {
        this.storeLoadout(0, l);
        this.cb.onLoadout(l);
      });
    };
    overlay.querySelector<HTMLButtonElement>("#l-ready")?.addEventListener("click", () => { sfx.ui(); this.cb.onReadyToggle(); });
    overlay.querySelector<HTMLButtonElement>("#l-start")?.addEventListener("click", () => { sfx.ui(); this.cb.onStartOnline(); });
    this.hud.appendChild(overlay);
    this.lobbyOverlay = overlay;
  }

  closeLobby(): void {
    this.lobbyOverlay?.remove();
    this.lobbyOverlay = null;
  }

  // ---------- In-game HUD ----------

  buildHud(bannedWeapons: number[] = []): void {
    // Owning this here means no entry path can leave the menu over a live match.
    this.menu.innerHTML = "";
    this.closeLobby();
    const bannedSet = new Set(bannedWeapons);
    this.hud.innerHTML = `
      <div class="topbar">
        <span class="turn-name" id="t-name">—</span>
        <span class="timer" id="t-timer">30</span>
        <span class="wind" id="t-wind">
          <span>WIND</span>
          <span class="arrow">·</span>
          <span class="bars"><i></i><i></i><i></i><i></i><i></i></span>
        </span>
        <span class="mode-info" id="t-mode"></span>
      </div>
      <div class="fps" id="t-fps" style="display:none"></div>
      <div class="awards" id="t-awards"></div>
      <div class="xp-strip">
        <span class="lvl" id="x-lvl">LV0</span>
        <div class="bar"><i id="x-fill" style="width:0%"></i></div>
        <span class="upgrade-hint" id="x-hint" style="display:none">UPGRADE [U]</span>
      </div>
      <div class="bottombar">
        <div class="aim-readout">
          <div class="row"><span>Elev</span><span class="val" id="a-angle">45°</span></div>
          <div class="row"><span>Chg</span><span class="val hot" id="a-power">62</span></div>
          <div class="meter power"><i id="a-power-fill" style="width:62%"></i></div>
          <div class="row"><span>Fuel</span><span class="val" id="a-fuel">100</span></div>
          <div class="meter fuel"><i id="a-fuel-fill" style="width:100%"></i></div>
          <div class="wname-current" id="w-current">Shell</div>
        </div>
        <div class="weapon-bar" id="w-bar"></div>
        <button class="fire-btn" id="fire">Fire</button>
      </div>
      <div class="scout-view" id="t-scout" style="display:none"></div>
      <div class="controls-hint">
        <kbd>←→</kbd> drive · <kbd>↑↓</kbd> elev · <kbd>W/S</kbd> charge · <kbd>Space</kbd> fire<br/>
        <kbd>1–0</kbd> or <kbd>Q/E</kbd> ordnance · <kbd>U</kbd> upgrade · <kbd>M</kbd> mute<br/>
        <kbd>wheel</kbd> zoom · <kbd>right-drag</kbd> look around · <kbd>C</kbd> recentre
      </div>`;

    this.turnName = this.hud.querySelector("#t-name")!;
    this.timerEl = this.hud.querySelector("#t-timer")!;
    this.windEl = this.hud.querySelector("#t-wind")!;
    this.modeInfoEl = this.hud.querySelector("#t-mode")!;
    this.angleVal = this.hud.querySelector("#a-angle")!;
    this.powerVal = this.hud.querySelector("#a-power")!;
    this.powerFill = this.hud.querySelector("#a-power-fill")!;
    this.fuelFill = this.hud.querySelector("#a-fuel-fill")!;
    this.fuelVal = this.hud.querySelector("#a-fuel")!;
    this.xpFill = this.hud.querySelector("#x-fill")!;
    this.xpLvl = this.hud.querySelector("#x-lvl")!;
    this.upgradeHint = this.hud.querySelector("#x-hint")!;
    this.weaponNameEl = this.hud.querySelector("#w-current")!;
    this.awardsEl = this.hud.querySelector("#t-awards")!;
    this.fpsEl = this.hud.querySelector("#t-fps")!;
    this.fireBtn = this.hud.querySelector<HTMLButtonElement>("#fire")!;
    this.fireBtn.onclick = () => this.cb.onFire();
    this.upgradeHint.onclick = () => this.cb.onUpgrade(-1);

    const bar = this.hud.querySelector("#w-bar")!;
    this.weaponSlots = WEAPONS.map((w, i) => {
      const slot = document.createElement("div");
      const isBanned = bannedSet.has(i);
      slot.className = `weapon-slot${isBanned ? " banned" : ""}`;
      const key = i < 10 ? `${(i + 1) % 10}` : "";
      slot.innerHTML = `<span class="key">${key}</span><span class="tier" style="display:none"></span><span class="icon">${weaponIcon(w.id)}</span>`;
      slot.title = isBanned ? `${w.name} — BANNED` : `${w.name} — ${w.desc}`;
      if (!isBanned) slot.onclick = () => this.cb.onSelectWeapon(i);
      bar.appendChild(slot);
      return slot;
    });
  }

  clearHud(): void {
    this.hud.innerHTML = "";
    this.weaponSlots = [];
    this.upgradeOverlay = null;
    this.lobbyOverlay = null;
  }

  updateTurn(tank: Tank, isMyTurn: boolean): void {
    this.turnName.textContent = tank.name;
    this.turnName.style.color = tank.palette.glow;
    this.fireBtn.disabled = !isMyTurn;
  }

  updateModeInfo(text: string): void {
    this.modeInfoEl.textContent = text;
    this.modeInfoEl.style.display = text ? "" : "none";
  }

  updateTimer(seconds: number, enabled: boolean): void {
    this.timerEl.style.display = enabled ? "" : "none";
    if (!enabled) return;
    const s = Math.max(0, Math.ceil(seconds));
    this.timerEl.textContent = String(s).padStart(2, "0");
    this.timerEl.classList.toggle("low", s <= 5);
  }

  updateWind(wind: number): void {
    const arrow = this.windEl.querySelector(".arrow")!;
    arrow.textContent = wind > 2 ? "▶" : wind < -2 ? "◀" : "·";
    const strength = Math.min(5, Math.round(Math.abs(wind) / 38));
    this.windEl.querySelectorAll<HTMLElement>(".bars i").forEach((bar, i) => {
      bar.style.height = `${4 + i * 2}px`;
      bar.classList.toggle("on", i < strength);
    });
  }

  updateAim(tank: Tank): void {
    this.angleVal.textContent = formatDeg(tank.angle);
    this.powerVal.textContent = String(Math.round(tank.power));
    this.powerFill.style.width = `${tank.power}%`;
    this.fuelFill.style.width = `${(tank.fuel / Math.max(1, tank.maxFuel)) * 100}%`;
    this.fuelVal.textContent = String(Math.round(tank.fuel));
  }

  updateWeapons(tank: Tank): void {
    this.weaponSlots.forEach((slot, i) => {
      slot.classList.toggle("selected", i === tank.selectedWeapon);
      const tier = tank.weaponTiers[i];
      const tierEl = slot.querySelector<HTMLElement>(".tier")!;
      tierEl.style.display = tier > 0 ? "" : "none";
      tierEl.textContent = "★".repeat(tier);
    });
    const def = WEAPONS[tank.selectedWeapon];
    this.weaponNameEl.textContent = def.tiers[tank.weaponTiers[tank.selectedWeapon]].label;
  }

  updateXp(tank: Tank): void {
    const prev = tank.level === 0 ? 0 : XP_LEVELS[tank.level - 1];
    const next = XP_LEVELS[Math.min(tank.level, XP_LEVELS.length - 1)];
    const frac = tank.level >= XP_LEVELS.length ? 1 : (tank.xp - prev) / (next - prev);
    this.xpFill.style.width = `${Math.min(100, frac * 100)}%`;
    this.xpLvl.textContent = `LV${tank.level}`;
    this.upgradeHint.style.display = tank.upgradePoints > 0 && !tank.isAI ? "" : "none";
  }

  updateFps(fps: number, degraded: boolean): void {
    if (!this.fpsEl || this.fpsEl.style.display === "none") return;
    this.fpsEl.textContent = `${fps} FPS${degraded ? " · ECO" : ""}`;
    this.fpsEl.classList.toggle("warn", fps < 50);
  }

  /** Shows the current scout zoom, or hides the badge when passed 0. */
  setScoutView(zoom: number): void {
    const el = this.hud.querySelector<HTMLElement>("#t-scout");
    if (!el) return;
    if (zoom <= 1.02) { el.style.display = "none"; return; }
    el.style.display = "";
    el.innerHTML = `SCOUT VIEW ×${zoom.toFixed(1)} · <b>C</b> to recentre`;
  }

  /** F3 toggles the perf readout — off by default. */
  toggleFps(): boolean {
    if (!this.fpsEl) return false;
    const showing = this.fpsEl.style.display === "none";
    this.fpsEl.style.display = showing ? "" : "none";
    return showing;
  }

  // ---------- Cinematic overlay ----------

  /** Letterbox bars + label. Hides the playing HUD while a cut runs. */
  setCinematic(on: boolean, label = ""): void {
    let el = this.hud.querySelector<HTMLElement>(".cine");
    if (on) {
      if (!el) {
        el = document.createElement("div");
        el.className = "cine";
        el.innerHTML = `
          <div class="cine-bar top"><span class="cine-label"></span><span class="cine-skip">Space · skip</span></div>
          <div class="cine-card" style="display:none"></div>
          <div class="cine-bar bottom"></div>`;
        this.hud.appendChild(el);
      }
      el.querySelector<HTMLElement>(".cine-label")!.textContent = label;
      this.hud.classList.add("cinematic");
    } else {
      el?.remove();
      this.hud.classList.remove("cinematic");
    }
  }

  setCinematicCard(card: CinematicCard | null): void {
    const el = this.hud.querySelector<HTMLElement>(".cine-card");
    if (!el) return;
    if (!card) { el.style.display = "none"; return; }
    el.style.display = "";
    el.style.setProperty("--accent", card.color);
    const counter = card.total > 0
      ? `<span class="cc-count">${String(card.index).padStart(2, "0")}/${String(card.total).padStart(2, "0")}</span>`
      : "";
    el.innerHTML = `
      ${counter}
      <div class="cc-body">
        <div class="cc-name">${card.name}</div>
        <div class="cc-meta"><b>${card.type}</b> · ${card.role}</div>
      </div>`;
  }

  banner(text: string, color: string): void {
    const el = document.createElement("div");
    el.className = "banner";
    el.style.color = color;
    el.textContent = text;
    this.hud.appendChild(el);
    setTimeout(() => el.remove(), 2300);
  }

  /** Trick-shot ticker — stacks under the banner line. */
  award(text: string, xp: number): void {
    if (!this.awardsEl) return;
    const el = document.createElement("div");
    el.className = "award";
    el.innerHTML = `<b>${text}</b> +${xp} XP`;
    this.awardsEl.appendChild(el);
    setTimeout(() => el.remove(), 1900);
  }

  // ---------- Upgrade sheet ----------

  showUpgradePanel(tank: Tank): void {
    this.closeUpgradePanel();
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    const rows = WEAPONS.map((w, i) => {
      const tier = tank.weaponTiers[i];
      const maxed = tier >= 2;
      return `
        <div class="upgrade-row ${maxed ? "maxed" : ""}">
          <span class="icon">${weaponIcon(w.id)}</span>
          <div class="info"><b>${w.tiers[tier].label}</b></div>
          <div class="tier-pips">
            ${[0, 1, 2].map((p) => `<span class="pip ${p <= tier ? "on" : ""}"></span>`).join("")}
          </div>
          <button class="btn small" data-idx="${i}" ${maxed ? "disabled" : ""}>${maxed ? "Max" : "Uprate"}</button>
        </div>`;
    }).join("");
    overlay.innerHTML = `
      <div class="panel wide">
        <h2>Ordnance Uprating</h2>
        <div class="subtitle">${tank.upgradePoints} requisition point${tank.upgradePoints === 1 ? "" : "s"} · resets at match end</div>
        <div class="upgrade-list">${rows}</div>
        <button class="btn" id="u-close">Close [U]</button>
      </div>`;
    overlay.querySelectorAll<HTMLButtonElement>("button[data-idx]").forEach((btn) => {
      btn.onclick = () => this.cb.onUpgrade(parseInt(btn.dataset.idx!, 10));
    });
    overlay.querySelector<HTMLButtonElement>("#u-close")!.onclick = () => this.closeUpgradePanel();
    this.hud.appendChild(overlay);
    this.upgradeOverlay = overlay;
  }

  closeUpgradePanel(): void {
    this.upgradeOverlay?.remove();
    this.upgradeOverlay = null;
  }

  get upgradePanelOpen(): boolean {
    return this.upgradeOverlay !== null;
  }

  // ---------- After-action report ----------

  showGameOver(tanks: Tank[], winner: Tank | null, title?: string, pointsMode = false): void {
    const sorted = [...tanks].sort((a, b) =>
      pointsMode ? b.score - a.score : Number(b.alive) - Number(a.alive) || b.damageDealt - a.damageDealt);
    const rows = sorted.map((t, i) => `
      <div class="score-row ${t === winner ? "winner" : ""}">
        <span class="rank">${String(i + 1).padStart(2, "0")}</span>
        <span class="swatch" style="background:${t.palette.primary}"></span>
        <span class="sname">${t.isVIP ? "♛ " : ""}${t.isJuggernaut ? "☠ " : ""}${t.name}</span>
        <span class="sval">${pointsMode ? `${t.score} pts · ` : ""}lv${t.level} · ${Math.round(t.damageDealt)} dmg · ${t.kills} kill${t.kills === 1 ? "" : "s"}</span>
      </div>`).join("");
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.innerHTML = `
      <div class="panel">
        <div class="subtitle" style="margin:0 0 4px">After-Action Report</div>
        <h1>${title ?? (winner ? `${winner.name} holds the field` : "Mutual destruction")}</h1>
        <div class="subtitle">All progression resets · every match starts level</div>
        ${rows}
        <div style="height:14px"></div>
        <button class="btn fire-key" id="g-again">Reload &amp; Redeploy ▸</button>
      </div>`;
    overlay.querySelector<HTMLButtonElement>("#g-again")!.onclick = () => {
      sfx.ui();
      overlay.remove();
      this.cb.onPlayAgain();
    };
    this.hud.appendChild(overlay);
  }
}
