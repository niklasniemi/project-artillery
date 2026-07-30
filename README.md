# 🎯 Project Artillery

A web-based, turn-based tactical artillery game inspired by ShellShock Live — with **zero account grinding**. Every weapon, tank, and cosmetic is unlocked from minute one. Progression happens *inside* each match.

## Features

- **Online multiplayer** — Colyseus lockstep server, room codes, up to 8 players, ready-up lobby
- **Fully destructible terrain** — every explosion carves the map; tanks can be buried or dropped into the void
- **All 20 weapons** with in-match Tier 1 → 3 upgrades: Shell, Mortar, Splitter, Digger, Sniper, Bouncer, Roller, Shielder, Cluster, MIRV, Airstrike, Napalm, Nuke, Twins, Homing, Grenade, Railstrike, Quake, Leech, Teleport
- **4 game modes** — Deathmatch, Points (respawns + score), Juggernaut (one 3×-HP boss vs all), Assassination (2v2, protect your VIP ♛)
- **Physics-driven combat** — gravity, per-turn dynamic wind, bounces, homing, hitscan beams
- **In-match XP** — deal damage, level up, and upgrade your arsenal mid-game; resets every match
- **Local play** — hotseat multiplayer (up to 4 tanks) and AI opponents with ballistic shot planning
- **Granular lobby settings** — mode, HP, fuel, wind variability, turn timer, terrain type (Hilly / Flat / Cavern / Floating Islands), crate drops, round count
- **Neon sci-fi visuals** — particles, screen shake, projectile trails, synthesized audio (no assets required)

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173 — Local Play works immediately.

### Online multiplayer (local test)

```bash
cd server && npm install && npm run dev
```

Then in the game menu: **ONLINE → CREATE ROOM**, share the room code, friends **JOIN ROOM**. The client connects to `ws://localhost:2567` by default; set `VITE_SERVER_URL` to point elsewhere.

### Deploy the server to Render

The repo ships a [render.yaml](render.yaml) blueprint. Either:

1. **Blueprint**: [dashboard.render.com/blueprints](https://dashboard.render.com/blueprints) → New Blueprint Instance → pick this repo, or
2. **Manual**: New Web Service → this repo → root dir `server`, build `npm install && npm run build`, start `npm start`.

Then build the client with the server's URL and host it anywhere static (Vercel):

```bash
VITE_SERVER_URL=wss://your-service.onrender.com npm run build
```

### Multiplayer architecture

The server is a **lockstep relay**: it owns rooms, seats, turn order, and timeouts, and relays inputs. Every client runs the identical deterministic simulation from a shared seed (all gameplay RNG — wind, crates, spawns, sub-munitions — flows through one seeded generator). Fire/split messages carry exact projectile state, and the acting client's end-of-turn snapshot (HP, positions, XP) is relayed as a per-turn hard sync point; clients that fall behind fast-forward their sim to catch up.

## Controls

| Input | Action |
|---|---|
| ← / → or A / D | Drive tank (uses fuel) |
| ↑ / ↓ or mouse drag from tank | Aim angle |
| W / S or mouse drag distance | Power |
| Space / click | Fire (hold nothing — instant) |
| Space mid-air | Trigger Splitter split |
| 1–0 / mouse wheel / click | Select weapon (wheel cycles all 20) |
| U | Open upgrade panel (when you have points) |

## Roadmap

- **Phase 1 — Prototype** ✅ terrain generation + destruction, aiming, weapons, local play
- **Phase 2 — Multiplayer** ✅ Colyseus lockstep server (Render-ready), room-code lobbies, up to 8 players
- **Phase 3 — Full arsenal** ✅ all 20 weapons with tier upgrades, Points / Juggernaut / Assassination modes
- **Phase 4 — AAA polish** ⏳ VFX pass, 60 FPS lock across browsers, audio pass, weapon bans, simultaneous-turn mode, trick-shot XP bonuses

## Stack

- [Vite](https://vitejs.dev) + TypeScript + colyseus.js client
- Custom Canvas 2D engine — fixed-timestep loop, pixel-mask terrain physics, pooled particles
- Node.js + [Colyseus](https://colyseus.io) server in [server/](server) (deployable to Render via [render.yaml](render.yaml))
