/**
 * Live index of joinable public rooms.
 *
 * Colyseus 0.16 exposes no room-listing endpoint (the old
 * `GET /matchmake/:room` is gone and the client dropped
 * `getAvailableRooms`), so the room browser is served from this small
 * in-process registry instead. Single-process only, which matches how this
 * game is deployed; a multi-node setup would need shared presence.
 */
export interface PublicRoomInfo {
  id: string;
  host: string;
  players: number;
  maxPlayers: number;
  mode: string;
  map: string;
  terrain: string;
}

const rooms = new Map<string, PublicRoomInfo>();

/** Adds or updates a room. Called whenever the lobby changes. */
export function publish(info: PublicRoomInfo): void {
  rooms.set(info.id, info);
}

/** Removes a room from the browser (private, in-match, or disposed). */
export function unpublish(id: string): void {
  rooms.delete(id);
}

export function listPublicRooms(): PublicRoomInfo[] {
  return [...rooms.values()].filter((r) => r.players < r.maxPlayers);
}
