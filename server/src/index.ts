import { Server } from "colyseus";
import { ArtilleryRoom } from "./room";

const port = Number(process.env.PORT ?? 2567);

const gameServer = new Server();
gameServer.define("artillery", ArtilleryRoom);

gameServer.listen(port).then(() => {
  console.log(`[artillery-server] listening on :${port}`);
});
