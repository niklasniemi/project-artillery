import { Client, Room } from "colyseus.js";
import { MatchSettings, LobbyView } from "./ui";
import { FireMsg, SplitMsg, Snapshot } from "./game";
import { Loadout } from "./tanks";

const SERVER_KEY = "pa-server-url";

/** Accepts bare hosts and http(s):// forms; returns a ws(s):// origin. */
export function normalizeServerUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^wss?:\/\//i.test(trimmed)) return trimmed;
  if (/^https:\/\//i.test(trimmed)) return `wss://${trimmed.slice(8)}`;
  if (/^http:\/\//i.test(trimmed)) return `ws://${trimmed.slice(7)}`;
  // Bare host: assume TLS unless it is clearly local.
  const local = /^(localhost|127\.0\.0\.1)(:|$)/i.test(trimmed);
  return `${local ? "ws" : "wss"}://${trimmed}`;
}

export function storedServerUrl(): string {
  try {
    return localStorage.getItem(SERVER_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setStoredServerUrl(raw: string): string {
  const url = normalizeServerUrl(raw);
  try {
    if (url) localStorage.setItem(SERVER_KEY, url);
    else localStorage.removeItem(SERVER_KEY);
  } catch {
    /* private mode — fall through to the in-memory value */
  }
  return url;
}

/**
 * Where to reach the Colyseus server, most specific source first:
 *   1. ?server= query param (one-off testing)
 *   2. localStorage, set from the NETWORK panel (no rebuild needed)
 *   3. VITE_SERVER_URL baked in at build time (the deploy path)
 *   4. localhost, but only when the page itself is local
 * A page served over HTTPS can never reach ws://localhost, so returning ""
 * there lets the UI explain the problem instead of failing silently.
 */
export function resolveServerUrl(): string {
  const param = new URLSearchParams(location.search).get("server");
  if (param) return normalizeServerUrl(param);

  const stored = storedServerUrl();
  if (stored) return stored;

  const built = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? "";
  if (built) return normalizeServerUrl(built);

  const isLocalPage = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname);
  return isLocalPage ? "ws://localhost:2567" : "";
}

export interface PublicRoom {
  id: string;
  players: number;
  maxPlayers: number;
  host: string;
  mode: string;
  map: string;
  terrain: string;
}

export interface SelectState {
  picked: number;
  total: number;
  names: string[];
}

export interface StartPayload {
  seed: number;
  settings: MatchSettings;
  seats: { seat: number; name: string; loadout?: Loadout }[];
  mySeat: number;
}

interface LobbyMsg {
  code: string;
  hostId: string;
  players: {
    sessionId: string; name: string; seat: number;
    ready: boolean; host: boolean; loadout?: Loadout;
  }[];
  settings: MatchSettings | null;
}

/**
 * Thin Colyseus wrapper. The server is a lockstep relay: it owns seats, turn
 * order, and timeouts; every client runs the identical seeded simulation.
 */
export class Net {
  private client: Client | null = null;
  private clientUrl = "";
  room: Room | null = null;
  lastLobby: LobbyView | null = null;

  /** Built lazily so a server URL entered in the UI takes effect immediately. */
  private clientFor(): Client {
    const url = resolveServerUrl();
    if (!url) {
      throw new Error(
        "No multiplayer server configured. Paste your server URL in the SERVER field " +
        "(or set VITE_SERVER_URL at build time).",
      );
    }
    if (!this.client || this.clientUrl !== url) {
      this.client = new Client(url);
      this.clientUrl = url;
    }
    return this.client;
  }

  onLobby: (view: LobbyView) => void = () => {};
  onStart: (payload: StartPayload) => void = () => {};
  onSelecting: (state: SelectState) => void = () => {};
  onSelectState: (state: SelectState) => void = () => {};
  onAim: (seat: number, angle: number, power: number) => void = () => {};
  onDrive: (seat: number, x: number, y: number, fuel: number, facing: 1 | -1) => void = () => {};
  onFire: (seat: number, msg: FireMsg) => void = () => {};
  onSplit: (seat: number, msg: SplitMsg) => void = () => {};
  onDeploy: (seat: number, msg: SplitMsg) => void = () => {};
  onUpgrade: (seat: number, weaponIndex: number) => void = () => {};
  onCrate: (seat: number, index: number) => void = () => {};
  onAdvance: (nextSeat: number, snapshot: Snapshot | null, gameOver: boolean) => void = () => {};
  onDropped: (reason: string) => void = () => {};

  get connected(): boolean {
    return this.room !== null;
  }

  async create(name: string, settings: MatchSettings): Promise<void> {
    this.room = await this.clientFor().create("artillery", {
      name, settings, visibility: settings.visibility ?? "public",
    });
    this.wire();
  }

  /**
   * Open public rooms. Colyseus 0.16 dropped client-side room listing, so the
   * server exposes its own `/rooms` endpoint next to the websocket transport.
   */
  async listRooms(): Promise<PublicRoom[]> {
    const ws = resolveServerUrl();
    if (!ws) throw new Error("No server configured");
    const httpBase = ws.replace(/^ws/, "http");
    const res = await fetch(`${httpBase}/rooms`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Room list failed (${res.status})`);
    const body = (await res.json()) as { rooms?: PublicRoom[] };
    return body.rooms ?? [];
  }

  async join(name: string, code: string): Promise<void> {
    this.room = await this.clientFor().joinById(code.trim(), { name });
    this.wire();
  }

  leave(): void {
    const room = this.room;
    this.room = null;
    this.lastLobby = null;
    room?.leave();
  }

  send(type: string, payload?: unknown): void {
    this.room?.send(type, payload);
  }

  private wire(): void {
    const room = this.room!;
    room.onMessage("lobby", (msg: LobbyMsg) => {
      const view: LobbyView = {
        code: msg.code,
        players: msg.players
          .sort((a, b) => a.seat - b.seat)
          .map((p) => ({
            name: p.name,
            seat: p.seat,
            ready: p.ready,
            isHost: p.host,
            isMe: p.sessionId === room.sessionId,
            loadout: p.loadout,
          })),
        iAmHost: msg.hostId === room.sessionId,
        settings: msg.settings,
      };
      this.lastLobby = view;
      this.onLobby(view);
    });
    room.onMessage("selecting", (s: SelectState) => this.onSelecting(s));
    room.onMessage("selectState", (s: SelectState) => this.onSelectState(s));
    room.onMessage("start", (payload: StartPayload) => this.onStart(payload));
    room.onMessage("aim", (m: { seat: number; angle: number; power: number }) => this.onAim(m.seat, m.angle, m.power));
    room.onMessage("drive", (m: { seat: number; x: number; y: number; fuel: number; facing: 1 | -1 }) =>
      this.onDrive(m.seat, m.x, m.y, m.fuel, m.facing));
    room.onMessage("fire", (m: FireMsg & { seat: number }) => this.onFire(m.seat, m));
    room.onMessage("split", (m: SplitMsg & { seat: number }) => this.onSplit(m.seat, m));
    room.onMessage("deploy", (m: SplitMsg & { seat: number }) => this.onDeploy(m.seat, m));
    room.onMessage("upgrade", (m: { seat: number; weaponIndex: number }) => this.onUpgrade(m.seat, m.weaponIndex));
    room.onMessage("crate", (m: { seat: number; index: number }) => this.onCrate(m.seat, m.index));
    room.onMessage("advance", (m: { nextSeat: number; snapshot: Snapshot | null; gameOver: boolean }) =>
      this.onAdvance(m.nextSeat, m.snapshot, m.gameOver));
    room.onMessage("skipTurn", (m: { nextSeat: number }) => this.onAdvance(m.nextSeat, null, false));
    room.onLeave((code) => {
      if (this.room === room) {
        this.room = null;
        this.onDropped(`Disconnected from room (code ${code})`);
      }
    });
    room.onError((code, message) => this.onDropped(message ?? `Room error ${code}`));
  }
}
