import http from "http";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ArtilleryRoom } from "./room";
import { listPublicRooms } from "./registry";

const port = Number(process.env.PORT ?? 2567);

/**
 * Plain HTTP alongside the websocket transport, purely to serve the room
 * browser. CORS is open because the client is hosted on a different origin
 * (Vercel) from the server (Render).
 */
const app = http.createServer((req, res) => {
  const url = (req.url ?? "").split("?")[0];

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url === "/rooms") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ rooms: listPublicRooms() }));
    return;
  }

  if (url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404);
  res.end();
});

const gameServer = new Server({ transport: new WebSocketTransport({ server: app }) });
gameServer.define("artillery", ArtilleryRoom);

gameServer.listen(port).then(() => {
  console.log(`[artillery-server] listening on :${port}`);
});
