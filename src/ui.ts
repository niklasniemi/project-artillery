import { Tank } from "./entities";
import { WEAPONS, XP_LEVELS } from "./weapons";
import { TerrainType } from "./terrain";
import { formatDeg } from "./util";
import { sfx } from "./audio";

export type GameMode = "deathmatch" | "points" | "juggernaut" | "assassination";

export interface MatchSettings {
  players: { name: string; isAI: boolean }[];
  mode: GameMode;
  rounds: number;      // points mode: turns per tank
  startHp: number;
  startFuel: number;
  windMode: "none" | "low" | "realistic" | "chaotic";
  turnSeconds: number; // 0 = no timer
  terrainType: TerrainType;
  crates: boolean;
}

export interface LobbyPlayer {
  name: string;
  seat: number;
  ready: boolean;
  isHost: boolean;
  isMe: boolean;
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
  // Online
  onCreateRoom: (name: string, settings: MatchSettings) => void;
  onJoinRoom: (name: string, code: string) => void;
  onReadyToggle: () => void;
  onStartOnline: () => void;
  onLeaveRoom: () => void;
}

const MODE_DESCRIPTIONS: Record<GameMode, string> = {
  deathmatch: "Last tank standing wins.",
  points: "Respawns on. Most damage + kills after the round limit wins.",
  juggernaut: "One boss tank with triple HP and brutal damage vs everyone.",
  assassination: "2v2 teams. Kill the enemy VIP ♛ — protect your own.",
};

/** DOM-based HUD + menus. The canvas stays purely for the game world. */
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
  private weaponSlots: HTMLElement[] = [];
  private weaponNameEl!: HTMLElement;
  private fireBtn!: HTMLButtonElement;
  private xpFill!: HTMLElement;
  private xpLvl!: HTMLElement;
  private upgradeHint!: HTMLElement;
  private upgradeOverlay: HTMLElement | null = null;
  private lobbyOverlay: HTMLElement | null = null;

  constructor(private cb: UICallbacks) {}

  // ---------- Main menu ----------

  private settingsGridHtml(): string {
    return `
      <div class="settings-grid">
        <div class="setting">
          <label>GAME MODE</label>
          <select id="s-mode">
            <option value="deathmatch">Deathmatch</option>
            <option value="points">Points</option>
            <option value="juggernaut">Juggernaut</option>
            <option value="assassination">Assassination</option>
          </select>
        </div>
        <div class="setting">
          <label>TERRAIN</label>
          <select id="s-terrain">
            <option value="hilly">Hilly</option>
            <option value="flat">Flat</option>
            <option value="cavern">Cavern</option>
            <option value="islands">Floating Islands</option>
          </select>
        </div>
        <div class="setting">
          <label>WIND</label>
          <select id="s-wind">
            <option value="realistic">Realistic</option>
            <option value="none">None</option>
            <option value="low">Low</option>
            <option value="chaotic">Chaotic</option>
          </select>
        </div>
        <div class="setting">
          <label>TURN TIMER</label>
          <select id="s-timer">
            <option value="30">30 seconds</option>
            <option value="15">15 seconds</option>
            <option value="45">45 seconds</option>
            <option value="0">No timer</option>
          </select>
        </div>
        <div class="setting">
          <label>STARTING HP <span class="range-val" id="s-hp-val">100</span></label>
          <input type="range" id="s-hp" min="50" max="200" step="10" value="100" />
        </div>
        <div class="setting">
          <label>STARTING FUEL <span class="range-val" id="s-fuel-val">100</span></label>
          <input type="range" id="s-fuel" min="0" max="250" step="10" value="100" />
        </div>
        <div class="setting">
          <label>CRATE DROPS</label>
          <select id="s-crates">
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </div>
        <div class="setting">
          <label>ROUNDS (POINTS MODE)</label>
          <select id="s-rounds">
            <option value="8">8 per tank</option>
            <option value="5">5 per tank</option>
            <option value="12">12 per tank</option>
          </select>
        </div>
      </div>
      <div class="mode-desc" id="s-mode-desc">${MODE_DESCRIPTIONS.deathmatch}</div>`;
  }

  private readSettings(root: HTMLElement, players: MatchSettings["players"]): MatchSettings {
    return {
      players,
      mode: root.querySelector<HTMLSelectElement>("#s-mode")!.value as GameMode,
      rounds: parseInt(root.querySelector<HTMLSelectElement>("#s-rounds")!.value, 10),
      startHp: parseInt(root.querySelector<HTMLInputElement>("#s-hp")!.value, 10),
      startFuel: parseInt(root.querySelector<HTMLInputElement>("#s-fuel")!.value, 10),
      windMode: root.querySelector<HTMLSelectElement>("#s-wind")!.value as MatchSettings["windMode"],
      turnSeconds: parseInt(root.querySelector<HTMLSelectElement>("#s-timer")!.value, 10),
      terrainType: root.querySelector<HTMLSelectElement>("#s-terrain")!.value as TerrainType,
      crates: root.querySelector<HTMLSelectElement>("#s-crates")!.value === "on",
    };
  }

  private wireSettingsGrid(root: HTMLElement): void {
    const hp = root.querySelector<HTMLInputElement>("#s-hp")!;
    const fuel = root.querySelector<HTMLInputElement>("#s-fuel")!;
    hp.oninput = () => (root.querySelector("#s-hp-val")!.textContent = hp.value);
    fuel.oninput = () => (root.querySelector("#s-fuel-val")!.textContent = fuel.value);
    const mode = root.querySelector<HTMLSelectElement>("#s-mode")!;
    mode.onchange = () => {
      root.querySelector("#s-mode-desc")!.textContent = MODE_DESCRIPTIONS[mode.value as GameMode];
    };
  }

  showMenu(): void {
    const savedName = localStorage.getItem("pa-name") ?? `Pilot-${Math.floor(Math.random() * 900 + 100)}`;
    this.menu.innerHTML = `
      <div class="overlay">
        <div class="panel wide">
          <h1>PROJECT ARTILLERY</h1>
          <div class="subtitle">Turn-based tactical artillery · zero grinding · all skill</div>
          <div class="tabs">
            <button class="tab-btn active" data-tab="local">LOCAL PLAY</button>
            <button class="tab-btn" data-tab="online">ONLINE</button>
          </div>
          <div class="tab-pane" id="tab-local">
            <div class="settings-grid" style="margin-bottom:0">
              <div class="setting">
                <label>MATCH SETUP</label>
                <select id="s-players">
                  <option value="1v1ai">You vs AI</option>
                  <option value="1v2ai">You vs 2 AI</option>
                  <option value="1v3ai">You vs 3 AI</option>
                  <option value="2p">2P Hotseat</option>
                  <option value="3p">3P Hotseat</option>
                  <option value="4p">4P Hotseat</option>
                </select>
              </div>
            </div>
            ${this.settingsGridHtml()}
            <button class="btn primary" id="s-start">DEPLOY ▸</button>
          </div>
          <div class="tab-pane" id="tab-online" style="display:none">
            <div class="settings-grid" style="margin-bottom:14px">
              <div class="setting">
                <label>CALLSIGN</label>
                <input type="text" id="o-name" maxlength="14" value="${savedName}" />
              </div>
              <div class="setting">
                <label>JOIN CODE</label>
                <input type="text" id="o-code" maxlength="12" placeholder="ROOM CODE" />
              </div>
            </div>
            <div class="row-buttons">
              <button class="btn" id="o-join">JOIN ROOM ▸</button>
            </div>
            <div class="divider">— or host a new room with these settings —</div>
            ${this.settingsGridHtml()}
            <button class="btn primary" id="o-create">CREATE ROOM ▸</button>
            <div class="net-status" id="o-status"></div>
          </div>
        </div>
      </div>`;

    // Tab switching
    this.menu.querySelectorAll<HTMLButtonElement>(".tab-btn").forEach((btn) => {
      btn.onclick = () => {
        sfx.unlock(); sfx.ui();
        this.menu.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.menu.querySelector<HTMLElement>("#tab-local")!.style.display = btn.dataset.tab === "local" ? "" : "none";
        this.menu.querySelector<HTMLElement>("#tab-online")!.style.display = btn.dataset.tab === "online" ? "" : "none";
      };
    });

    const localPane = this.menu.querySelector<HTMLElement>("#tab-local")!;
    const onlinePane = this.menu.querySelector<HTMLElement>("#tab-online")!;
    this.wireSettingsGrid(localPane);
    this.wireSettingsGrid(onlinePane);

    this.menu.querySelector<HTMLButtonElement>("#s-start")!.onclick = () => {
      sfx.unlock(); sfx.ui();
      const modeSel = this.menu.querySelector<HTMLSelectElement>("#s-players")!.value;
      const players: MatchSettings["players"] = [{ name: "Player 1", isAI: false }];
      if (modeSel === "1v1ai") players.push({ name: "Vector", isAI: true });
      else if (modeSel === "1v2ai") players.push({ name: "Vector", isAI: true }, { name: "Torque", isAI: true });
      else if (modeSel === "1v3ai") players.push({ name: "Vector", isAI: true }, { name: "Torque", isAI: true }, { name: "Parabola", isAI: true });
      else {
        const humans = parseInt(modeSel, 10);
        for (let i = 2; i <= humans; i++) players.push({ name: `Player ${i}`, isAI: false });
      }
      const settings = this.readSettings(localPane, players);
      this.menu.innerHTML = "";
      this.cb.onStart(settings);
    };

    const nameOf = (): string => {
      const name = (this.menu.querySelector<HTMLInputElement>("#o-name")!.value.trim() || "Pilot").slice(0, 14);
      localStorage.setItem("pa-name", name);
      return name;
    };
    this.menu.querySelector<HTMLButtonElement>("#o-create")!.onclick = () => {
      sfx.unlock(); sfx.ui();
      this.netStatus("Creating room…");
      this.cb.onCreateRoom(nameOf(), this.readSettings(onlinePane, []));
    };
    this.menu.querySelector<HTMLButtonElement>("#o-join")!.onclick = () => {
      sfx.unlock(); sfx.ui();
      const code = this.menu.querySelector<HTMLInputElement>("#o-code")!.value.trim();
      if (!code) { this.netStatus("Enter a room code first."); return; }
      this.netStatus("Joining…");
      this.cb.onJoinRoom(nameOf(), code);
    };
  }

  netStatus(text: string): void {
    const el = this.menu.querySelector("#o-status") ?? this.lobbyOverlay?.querySelector(".net-status");
    if (el) el.textContent = text;
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
        <span class="swatch" style="background:${["#28c7f0", "#f04da0", "#9df04d", "#f0a52d", "#b44df0", "#4df0b4", "#f0654d", "#e8e8f0"][p.seat % 8]}"></span>
        <span class="sname">${p.name}${p.isMe ? " (you)" : ""}</span>
        <span class="sval">${p.isHost ? "HOST" : p.ready ? "READY ✔" : "waiting…"}</span>
      </div>`).join("");
    const s = view.settings;
    const summary = s
      ? `${s.mode.toUpperCase()} · ${s.terrainType} · wind ${s.windMode} · ${s.turnSeconds ? s.turnSeconds + "s turns" : "no timer"} · HP ${s.startHp}${s.mode === "points" ? ` · ${s.rounds} rounds` : ""}`
      : "";
    overlay.innerHTML = `
      <div class="panel">
        <h2>ROOM <span class="room-code">${view.code}</span></h2>
        <div class="subtitle">Share the code — up to 8 players. ${summary}</div>
        ${rows}
        <div style="height:14px"></div>
        <div class="row-buttons">
          ${view.iAmHost
            ? `<button class="btn primary" id="l-start" ${allReady ? "" : "disabled"}>START MATCH ▸</button>`
            : `<button class="btn" id="l-ready">${me?.ready ? "UNREADY" : "READY UP"}</button>`}
          <button class="btn small" id="l-leave">LEAVE</button>
        </div>
        <div class="net-status"></div>
      </div>`;
    overlay.querySelector<HTMLButtonElement>("#l-leave")!.onclick = () => { sfx.ui(); this.cb.onLeaveRoom(); };
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

  buildHud(): void {
    this.closeLobby();
    this.hud.innerHTML = `
      <div class="topbar">
        <span class="turn-name" id="t-name">—</span>
        <span class="timer" id="t-timer">30</span>
        <span class="wind" id="t-wind"><span>WIND</span><span class="arrow">→</span><span id="t-wind-val">0</span></span>
        <span class="mode-info" id="t-mode"></span>
      </div>
      <div class="xp-strip">
        <span class="lvl" id="x-lvl">LV 0</span>
        <div class="bar"><i id="x-fill" style="width:0%"></i></div>
        <span class="upgrade-hint" id="x-hint" style="display:none">UPGRADE READY [U]</span>
      </div>
      <div class="bottombar">
        <div class="aim-readout">
          <div class="row"><span>ANGLE</span><span class="val" id="a-angle">45°</span></div>
          <div class="row"><span>POWER</span><span class="val" id="a-power">62</span></div>
          <div class="power-bar"><i id="a-power-fill" style="width:62%"></i></div>
          <div class="row"><span>FUEL</span><span class="val" id="a-fuel">100</span></div>
          <div class="fuel-bar"><i id="a-fuel-fill" style="width:100%"></i></div>
          <div class="wname-current" id="w-current">Shell</div>
        </div>
        <div class="weapon-bar" id="w-bar"></div>
        <button class="fire-btn" id="fire">FIRE</button>
      </div>
      <div class="controls-hint">
        <kbd>←→</kbd> drive · <kbd>↑↓</kbd> aim · <kbd>W/S</kbd> power · <kbd>Space</kbd> fire / split<br/>
        <kbd>1–0</kbd> or wheel: weapon · <kbd>U</kbd> upgrade · drag from tank to aim
      </div>`;

    this.turnName = this.hud.querySelector("#t-name")!;
    this.timerEl = this.hud.querySelector("#t-timer")!;
    this.windEl = this.hud.querySelector("#t-wind")!;
    this.modeInfoEl = this.hud.querySelector("#t-mode")!;
    this.angleVal = this.hud.querySelector("#a-angle")!;
    this.powerVal = this.hud.querySelector("#a-power")!;
    this.powerFill = this.hud.querySelector("#a-power-fill")!;
    this.fuelFill = this.hud.querySelector("#a-fuel-fill")!;
    this.xpFill = this.hud.querySelector("#x-fill")!;
    this.xpLvl = this.hud.querySelector("#x-lvl")!;
    this.upgradeHint = this.hud.querySelector("#x-hint")!;
    this.weaponNameEl = this.hud.querySelector("#w-current")!;
    this.fireBtn = this.hud.querySelector<HTMLButtonElement>("#fire")!;
    this.fireBtn.onclick = () => this.cb.onFire();
    this.upgradeHint.onclick = () => this.cb.onUpgrade(-1);

    const bar = this.hud.querySelector("#w-bar")!;
    this.weaponSlots = WEAPONS.map((w, i) => {
      const slot = document.createElement("div");
      slot.className = "weapon-slot compact";
      const key = i < 10 ? `${(i + 1) % 10}` : "";
      slot.innerHTML = `<span class="key">${key}</span><span class="tier" style="display:none"></span><span class="icon">${w.icon}</span>`;
      slot.title = `${w.name} — ${w.desc}`;
      slot.onclick = () => this.cb.onSelectWeapon(i);
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
    this.turnName.textContent = `${tank.name}'s turn`;
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
    this.timerEl.textContent = String(s);
    this.timerEl.classList.toggle("low", s <= 5);
  }

  updateWind(wind: number): void {
    const arrow = this.windEl.querySelector(".arrow")!;
    const val = this.windEl.querySelector("#t-wind-val")!;
    const strength = Math.abs(Math.round(wind / 4));
    arrow.textContent = wind > 2 ? "→" : wind < -2 ? "←" : "·";
    val.textContent = String(strength);
  }

  updateAim(tank: Tank): void {
    this.angleVal.textContent = formatDeg(tank.angle);
    this.powerVal.textContent = String(Math.round(tank.power));
    this.powerFill.style.width = `${tank.power}%`;
    this.fuelFill.style.width = `${(tank.fuel / Math.max(1, tank.maxFuel)) * 100}%`;
    (this.hud.querySelector("#a-fuel")!).textContent = String(Math.round(tank.fuel));
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
    this.xpLvl.textContent = `LV ${tank.level}`;
    this.upgradeHint.style.display = tank.upgradePoints > 0 && !tank.isAI ? "" : "none";
  }

  banner(text: string, color: string): void {
    const el = document.createElement("div");
    el.className = "banner";
    el.style.color = color;
    el.textContent = text;
    this.hud.appendChild(el);
    setTimeout(() => el.remove(), 2300);
  }

  // ---------- Upgrade panel ----------

  showUpgradePanel(tank: Tank): void {
    this.closeUpgradePanel();
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    const rows = WEAPONS.map((w, i) => {
      const tier = tank.weaponTiers[i];
      const maxed = tier >= 2;
      const nextLabel = maxed ? "MAX" : `▶ T${tier + 2}`;
      return `
        <div class="upgrade-row">
          <span class="icon">${w.icon}</span>
          <div class="info">
            <b>${w.tiers[tier].label}</b>
            <div class="desc">${w.desc}</div>
          </div>
          <div class="tier-pips">
            ${[0, 1, 2].map((p) => `<span class="pip ${p <= tier ? "on" : ""}"></span>`).join("")}
          </div>
          <button class="btn small" data-idx="${i}" ${maxed ? "disabled" : ""}>${nextLabel}</button>
        </div>`;
    }).join("");
    overlay.innerHTML = `
      <div class="panel wide">
        <h2>⬆ UPGRADE ARSENAL — ${tank.upgradePoints} point${tank.upgradePoints === 1 ? "" : "s"}</h2>
        <div class="upgrade-list grid2">${rows}</div>
        <button class="btn" id="u-close">CLOSE [U]</button>
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

  // ---------- Game over ----------

  showGameOver(tanks: Tank[], winner: Tank | null, title?: string, pointsMode = false): void {
    const sorted = [...tanks].sort((a, b) =>
      pointsMode ? b.score - a.score : Number(b.alive) - Number(a.alive) || b.damageDealt - a.damageDealt);
    const rows = sorted.map((t) => `
      <div class="score-row ${t === winner ? "winner" : ""}">
        <span class="swatch" style="background:${t.palette.primary}"></span>
        <span class="sname">${t.isVIP ? "♛ " : ""}${t.isJuggernaut ? "☠ " : ""}${t.name}</span>
        <span class="sval">${pointsMode ? `${t.score} pts · ` : ""}LV ${t.level} · ${Math.round(t.damageDealt)} dmg · ${t.kills} kills</span>
      </div>`).join("");
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.innerHTML = `
      <div class="panel">
        <h1>${title ?? (winner ? `${winner.name.toUpperCase()} WINS` : "MUTUAL DESTRUCTION")}</h1>
        <div class="subtitle">Progression resets — every match is a level playing field.</div>
        ${rows}
        <div style="height:14px"></div>
        <button class="btn primary" id="g-again">PLAY AGAIN ▸</button>
      </div>`;
    overlay.querySelector<HTMLButtonElement>("#g-again")!.onclick = () => {
      sfx.ui();
      overlay.remove();
      this.cb.onPlayAgain();
    };
    this.hud.appendChild(overlay);
  }
}
