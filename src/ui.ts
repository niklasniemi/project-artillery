import { Tank } from "./entities";
import { WEAPONS, XP_LEVELS } from "./weapons";
import { TerrainType } from "./terrain";
import { formatDeg } from "./util";
import { sfx } from "./audio";

export interface MatchSettings {
  players: { name: string; isAI: boolean }[];
  startHp: number;
  startFuel: number;
  windMode: "none" | "low" | "realistic" | "chaotic";
  turnSeconds: number; // 0 = no timer
  terrainType: TerrainType;
  crates: boolean;
}

interface UICallbacks {
  onFire: () => void;
  onSelectWeapon: (index: number) => void;
  onUpgrade: (weaponIndex: number) => void;
  onStart: (settings: MatchSettings) => void;
  onPlayAgain: () => void;
}

/** DOM-based HUD + menus. The canvas stays purely for the game world. */
export class UI {
  private hud = document.getElementById("hud")!;
  private menu = document.getElementById("menu")!;
  private turnName!: HTMLElement;
  private timerEl!: HTMLElement;
  private windEl!: HTMLElement;
  private angleVal!: HTMLElement;
  private powerVal!: HTMLElement;
  private powerFill!: HTMLElement;
  private fuelFill!: HTMLElement;
  private weaponSlots: HTMLElement[] = [];
  private fireBtn!: HTMLButtonElement;
  private xpFill!: HTMLElement;
  private xpLvl!: HTMLElement;
  private upgradeHint!: HTMLElement;
  private upgradeOverlay: HTMLElement | null = null;

  constructor(private cb: UICallbacks) {}

  // ---------- Main menu ----------

  showMenu(): void {
    this.menu.innerHTML = `
      <div class="overlay">
        <div class="panel">
          <h1>PROJECT ARTILLERY</h1>
          <div class="subtitle">Turn-based tactical artillery · zero grinding · all skill</div>
          <div class="settings-grid">
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
          </div>
          <button class="btn primary" id="s-start">DEPLOY ▸</button>
        </div>
      </div>`;

    const hp = this.menu.querySelector<HTMLInputElement>("#s-hp")!;
    const fuel = this.menu.querySelector<HTMLInputElement>("#s-fuel")!;
    hp.oninput = () => (this.menu.querySelector("#s-hp-val")!.textContent = hp.value);
    fuel.oninput = () => (this.menu.querySelector("#s-fuel-val")!.textContent = fuel.value);

    this.menu.querySelector<HTMLButtonElement>("#s-start")!.onclick = () => {
      sfx.unlock();
      sfx.ui();
      const mode = this.menu.querySelector<HTMLSelectElement>("#s-players")!.value;
      const players: MatchSettings["players"] = [{ name: "Player 1", isAI: false }];
      if (mode === "1v1ai") players.push({ name: "Vector", isAI: true });
      else if (mode === "1v2ai") players.push({ name: "Vector", isAI: true }, { name: "Torque", isAI: true });
      else if (mode === "1v3ai") players.push({ name: "Vector", isAI: true }, { name: "Torque", isAI: true }, { name: "Parabola", isAI: true });
      else {
        const humans = parseInt(mode, 10);
        for (let i = 2; i <= humans; i++) players.push({ name: `Player ${i}`, isAI: false });
      }
      const settings: MatchSettings = {
        players,
        startHp: parseInt(hp.value, 10),
        startFuel: parseInt(fuel.value, 10),
        windMode: this.menu.querySelector<HTMLSelectElement>("#s-wind")!.value as MatchSettings["windMode"],
        turnSeconds: parseInt(this.menu.querySelector<HTMLSelectElement>("#s-timer")!.value, 10),
        terrainType: this.menu.querySelector<HTMLSelectElement>("#s-terrain")!.value as TerrainType,
        crates: this.menu.querySelector<HTMLSelectElement>("#s-crates")!.value === "on",
      };
      this.menu.innerHTML = "";
      this.cb.onStart(settings);
    };
  }

  // ---------- In-game HUD ----------

  buildHud(): void {
    this.hud.innerHTML = `
      <div class="topbar">
        <span class="turn-name" id="t-name">—</span>
        <span class="timer" id="t-timer">30</span>
        <span class="wind" id="t-wind"><span>WIND</span><span class="arrow">→</span><span id="t-wind-val">0</span></span>
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
        </div>
        <div class="weapon-bar" id="w-bar"></div>
        <button class="fire-btn" id="fire">FIRE</button>
      </div>
      <div class="controls-hint">
        <kbd>←→</kbd> drive · <kbd>↑↓</kbd> aim · <kbd>W/S</kbd> power · <kbd>Space</kbd> fire / split<br/>
        <kbd>1–8</kbd> or wheel: weapon · <kbd>U</kbd> upgrade · drag from tank to aim
      </div>`;

    this.turnName = this.hud.querySelector("#t-name")!;
    this.timerEl = this.hud.querySelector("#t-timer")!;
    this.windEl = this.hud.querySelector("#t-wind")!;
    this.angleVal = this.hud.querySelector("#a-angle")!;
    this.powerVal = this.hud.querySelector("#a-power")!;
    this.powerFill = this.hud.querySelector("#a-power-fill")!;
    this.fuelFill = this.hud.querySelector("#a-fuel-fill")!;
    this.xpFill = this.hud.querySelector("#x-fill")!;
    this.xpLvl = this.hud.querySelector("#x-lvl")!;
    this.upgradeHint = this.hud.querySelector("#x-hint")!;
    this.fireBtn = this.hud.querySelector<HTMLButtonElement>("#fire")!;
    this.fireBtn.onclick = () => this.cb.onFire();
    this.upgradeHint.onclick = () => this.cb.onUpgrade(-1);

    const bar = this.hud.querySelector("#w-bar")!;
    this.weaponSlots = WEAPONS.map((w, i) => {
      const slot = document.createElement("div");
      slot.className = "weapon-slot";
      slot.innerHTML = `<span class="key">${i + 1}</span><span class="tier" style="display:none"></span><span class="icon">${w.icon}</span><span class="wname">${w.name}</span>`;
      slot.title = w.desc;
      slot.onclick = () => this.cb.onSelectWeapon(i);
      bar.appendChild(slot);
      return slot;
    });
  }

  clearHud(): void {
    this.hud.innerHTML = "";
    this.weaponSlots = [];
  }

  updateTurn(tank: Tank, isInputPhase: boolean): void {
    this.turnName.textContent = `${tank.name}'s turn`;
    this.turnName.style.color = tank.palette.glow;
    this.fireBtn.disabled = !isInputPhase || tank.isAI;
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
      const nextLabel = maxed ? "MAXED" : `▶ ${w.tiers[tier + 1].label}`;
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
      <div class="panel">
        <h2>⬆ UPGRADE ARSENAL — ${tank.upgradePoints} point${tank.upgradePoints === 1 ? "" : "s"}</h2>
        <div class="upgrade-list">${rows}</div>
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

  showGameOver(tanks: Tank[], winner: Tank | null): void {
    const sorted = [...tanks].sort((a, b) => Number(b.alive) - Number(a.alive) || b.damageDealt - a.damageDealt);
    const rows = sorted.map((t) => `
      <div class="score-row ${t === winner ? "winner" : ""}">
        <span class="swatch" style="background:${t.palette.primary}"></span>
        <span class="sname">${t.name}</span>
        <span class="sval">LV ${t.level} · ${Math.round(t.damageDealt)} dmg dealt</span>
      </div>`).join("");
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.innerHTML = `
      <div class="panel">
        <h1>${winner ? `${winner.name.toUpperCase()} WINS` : "MUTUAL DESTRUCTION"}</h1>
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
