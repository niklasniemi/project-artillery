import { Client, Room } from "colyseus.js";
import { MatchSettings, LobbyView } from "./ui";
import { FireMsg, SplitMsg, Snapshot } from "./game";

export const SERVER_URL: string =
  (import.meta.env.VITE_SERVER_URL as string | undefined) || "ws://localhost:2567";

export interface StartPayload {
  seed: number;
  settings: MatchSettings;
  seats: { seat: number; name: string }[];
  mySeat: number;
}

interface LobbyMsg {
  code: string;
  hostId: string;
  players: { sessionId: string; name: string; seat: number; ready: boolean; host: boolean }[];
  settings: MatchSettings | null;
}

/**
 * Thin Colyseus wrapper. The server is a lockstep relay: it owns seats, turn
 * order, and timeouts; every client runs the identical seeded simulation.
 */
export class Net {
  private client = new Client(SERVER_URL);
  room: Room | null = null;
  lastLobby: LobbyView | null = null;

  onLobby: (view: LobbyView) => void = () => {};
  onStart: (payload: StartPayload) => void = () => {};
  onAim: (seat: number, angle: number, power: number) => void = () => {};
  onDrive: (seat: number, x: number, y: number, fuel: number, facing: 1 | -1) => void = () => {};
  onFire: (seat: number, msg: FireMsg) => void = () => {};
  onSplit: (seat: number, msg: SplitMsg) => void = () => {};
  onUpgrade: (seat: number, weaponIndex: number) => void = () => {};
  onCrate: (seat: number, index: number) => void = () => {};
  onAdvance: (nextSeat: number, snapshot: Snapshot | null, gameOver: boolean) => void = () => {};
  onDropped: (reason: string) => void = () => {};

  get connected(): boolean {
    return this.room !== null;
  }

  async create(name: string, settings: MatchSettings): Promise<void> {
    this.room = await this.client.create("artillery", { name, settings });
    this.wire();
  }

  async join(name: string, code: string): Promise<void> {
    this.room = await this.client.joinById(code.trim(), { name });
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
          })),
        iAmHost: msg.hostId === room.sessionId,
        settings: msg.settings,
      };
      this.lastLobby = view;
      this.onLobby(view);
    });
    room.onMessage("start", (payload: StartPayload) => this.onStart(payload));
    room.onMessage("aim", (m: { seat: number; angle: number; power: number }) => this.onAim(m.seat, m.angle, m.power));
    room.onMessage("drive", (m: { seat: number; x: number; y: number; fuel: number; facing: 1 | -1 }) =>
      this.onDrive(m.seat, m.x, m.y, m.fuel, m.facing));
    room.onMessage("fire", (m: FireMsg & { seat: number }) => this.onFire(m.seat, m));
    room.onMessage("split", (m: SplitMsg & { seat: number }) => this.onSplit(m.seat, m));
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
