import { Room, Client } from "colyseus";

interface Loadout {
  type: string;
  color: number;
}

interface PlayerInfo {
  name: string;
  seat: number;
  ready: boolean;
  connected: boolean;
  loadout: Loadout;
}

/**
 * Lockstep relay room. The server owns membership, seats, turn order, and
 * timeouts. Gameplay is simulated identically on every client from a shared
 * seed; the acting client reports a state snapshot at the end of each turn
 * which the server relays as the authoritative sync point.
 */
export class ArtilleryRoom extends Room {
  maxClients = 8;

  private players = new Map<string, PlayerInfo>();
  private hostId = "";
  private phase: "lobby" | "playing" = "lobby";
  private settings: { turnSeconds?: number } | null = null;
  private currentSeat = 0;
  private turnTimeout: ReturnType<typeof setTimeout> | null = null;

  onCreate(options: { name?: string; settings?: { turnSeconds?: number } }): void {
    this.settings = options?.settings ?? null;

    this.onMessage("settings", (client, s: { turnSeconds?: number }) => {
      if (client.sessionId !== this.hostId || this.phase !== "lobby") return;
      this.settings = s;
      this.broadcastLobby();
    });

    this.onMessage("loadout", (client, l: Loadout) => {
      const p = this.players.get(client.sessionId);
      if (!p || this.phase !== "lobby" || !l) return;
      p.loadout = {
        type: String(l.type ?? "vanguard").slice(0, 24),
        color: Number.isFinite(l.color) ? Math.max(0, Math.floor(l.color)) : p.seat,
      };
      this.broadcastLobby();
    });

    this.onMessage("ready", (client) => {
      const p = this.players.get(client.sessionId);
      if (!p || this.phase !== "lobby") return;
      p.ready = !p.ready;
      this.broadcastLobby();
    });

    this.onMessage("start", (client) => this.startMatch(client));

    // Live-input relays, gated to the seat whose turn it is.
    for (const type of ["aim", "drive", "split", "crate"]) {
      this.onMessage(type, (client, msg: object) => {
        const p = this.players.get(client.sessionId);
        if (!p || this.phase !== "playing" || p.seat !== this.currentSeat) return;
        this.broadcast(type, { seat: p.seat, ...(msg ?? {}) }, { except: client });
      });
    }

    // Upgrades can be spent any time (deterministic on all clients).
    this.onMessage("upgrade", (client, msg: object) => {
      const p = this.players.get(client.sessionId);
      if (!p || this.phase !== "playing") return;
      this.broadcast("upgrade", { seat: p.seat, ...(msg ?? {}) }, { except: client });
    });

    this.onMessage("fire", (client, msg: object) => {
      const p = this.players.get(client.sessionId);
      if (!p || this.phase !== "playing" || p.seat !== this.currentSeat) return;
      this.broadcast("fire", { seat: p.seat, ...(msg ?? {}) }, { except: client });
      // Resolution watchdog: if no turnEnd arrives, force the game onward.
      this.armTimeout(45_000);
    });

    this.onMessage("turnEnd", (client, msg: { nextSeat?: number; snapshot?: unknown; gameOver?: boolean }) => {
      const p = this.players.get(client.sessionId);
      if (!p || this.phase !== "playing" || p.seat !== this.currentSeat) return;
      this.advance(msg?.nextSeat ?? this.seatAfter(this.currentSeat), msg?.snapshot ?? null, !!msg?.gameOver);
    });
  }

  onJoin(client: Client, options: { name?: string }): void {
    if (this.phase !== "lobby") throw new Error("Match already in progress");
    const taken = new Set([...this.players.values()].map((p) => p.seat));
    let seat = 0;
    while (taken.has(seat)) seat++;
    const name = String(options?.name ?? "Pilot").slice(0, 14) || "Pilot";
    this.players.set(client.sessionId, {
      name, seat, ready: false, connected: true,
      loadout: { type: "vanguard", color: seat },
    });
    if (!this.hostId) this.hostId = client.sessionId;
    this.broadcastLobby();
  }

  onLeave(client: Client): void {
    const p = this.players.get(client.sessionId);
    if (!p) return;
    if (this.phase === "lobby") {
      this.players.delete(client.sessionId);
      if (this.hostId === client.sessionId) {
        this.hostId = this.players.keys().next().value ?? "";
      }
      this.broadcastLobby();
      return;
    }
    // In-game: the tank stays as a sitting duck; skip their turns.
    p.connected = false;
    if (p.seat === this.currentSeat) this.forceSkip();
    if ([...this.players.values()].every((pl) => !pl.connected)) this.disconnect();
  }

  onDispose(): void {
    this.clearTimer();
  }

  // ---------- Match flow ----------

  private startMatch(client: Client): void {
    if (client.sessionId !== this.hostId || this.phase !== "lobby") return;
    const list = [...this.players.values()];
    if (list.length < 2) return;
    const nonHostReady = [...this.players.entries()]
      .filter(([sid]) => sid !== this.hostId)
      .every(([, p]) => p.ready);
    if (!nonHostReady) return;

    this.phase = "playing";
    this.lock();
    const seed = Math.floor(Math.random() * 1e9);
    const seats = list
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({ seat: p.seat, name: p.name, loadout: p.loadout }));
    for (const c of this.clients) {
      const p = this.players.get(c.sessionId)!;
      c.send("start", { seed, settings: this.settings, seats, mySeat: p.seat });
    }
    this.currentSeat = seats[0].seat;
    this.armTimeout(this.turnMs());
  }

  private advance(nextSeat: number, snapshot: unknown, gameOver: boolean): void {
    if (gameOver) {
      this.broadcast("advance", { nextSeat, snapshot, gameOver: true });
      this.phase = "lobby";
      this.clearTimer();
      this.unlock();
      // Drop players who disconnected mid-match; reset ready for a rematch.
      for (const [sid, p] of [...this.players.entries()]) {
        if (!p.connected) this.players.delete(sid);
        else p.ready = false;
      }
      this.broadcastLobby();
      return;
    }
    let seat = nextSeat;
    let guard = 0;
    while (guard++ < 16 && !this.isSeatConnected(seat)) seat = this.seatAfter(seat);
    this.currentSeat = seat;
    this.broadcast("advance", { nextSeat: seat, snapshot, gameOver: false });
    this.armTimeout(this.turnMs());
  }

  private forceSkip(): void {
    if (this.phase !== "playing") return;
    let seat = this.seatAfter(this.currentSeat);
    let guard = 0;
    while (guard++ < 16 && !this.isSeatConnected(seat)) seat = this.seatAfter(seat);
    this.currentSeat = seat;
    this.broadcast("skipTurn", { nextSeat: seat });
    this.armTimeout(this.turnMs());
  }

  // ---------- Helpers ----------

  private turnMs(): number {
    const s = this.settings?.turnSeconds ?? 30;
    // Generous grace over the client timer: cutscenes and kill-cam replays
    // sit between turns without the watchdog firing.
    return (s > 0 ? s : 120) * 1000 + 25_000;
  }

  private seatAfter(seat: number): number {
    const seats = [...this.players.values()].map((p) => p.seat).sort((a, b) => a - b);
    if (seats.length === 0) return 0;
    const idx = seats.indexOf(seat);
    return seats[(idx + 1) % seats.length];
  }

  private isSeatConnected(seat: number): boolean {
    return [...this.players.values()].some((p) => p.seat === seat && p.connected);
  }

  private armTimeout(ms: number): void {
    this.clearTimer();
    this.turnTimeout = setTimeout(() => this.forceSkip(), ms);
  }

  private clearTimer(): void {
    if (this.turnTimeout) clearTimeout(this.turnTimeout);
    this.turnTimeout = null;
  }

  private broadcastLobby(): void {
    this.broadcast("lobby", {
      code: this.roomId,
      hostId: this.hostId,
      settings: this.settings,
      players: [...this.players.entries()].map(([sessionId, p]) => ({
        sessionId,
        name: p.name,
        seat: p.seat,
        ready: p.ready,
        host: sessionId === this.hostId,
        loadout: p.loadout,
      })),
    });
  }
}
