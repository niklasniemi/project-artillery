# 🎯 Project Artillery

A web-based, turn-based tactical artillery game inspired by ShellShock Live — with **zero account grinding**. Every weapon, tank, and cosmetic is unlocked from minute one. Progression happens *inside* each match.

## Features

- **Six themed theatres** — Nightfall, Dune Sea, Frostbite, Ashlands, Verdant and Orbital, each with its own sky, rock palette, hazard colour and weather, picked from rendered map cards
- **Six tank chassis** with real trade-offs — Vanguard, Scout, Bulwark, Howitzer, Sapper, Reaver; pick chassis and livery before every match
- **Cinematics** — a roll-call cutscene introduces every tank at the open, and a kill cam replays the shot that destroyed someone
- **Online multiplayer** — Colyseus lockstep server, room codes, up to 8 players, ready-up lobby
- **Trick-shot bonuses** — direct hits, long shots, bank shots, multi-kills, void kills and revenge kills all pay bonus XP
- **Weapon bans** — the host can strike any ordnance out of the match from the armory grid
- **Fully destructible terrain** — every explosion carves the map; tanks can be buried or dropped into the void
- **All 20 weapons** with in-match Tier 1 → 3 upgrades: Shell, Mortar, Splitter, Digger, Sniper, Bouncer, Roller, Shielder, Cluster, MIRV, Airstrike, Napalm, Nuke, Twins, Homing, Grenade, Railstrike, Quake, Leech, Teleport
- **4 game modes** — Deathmatch, Points (respawns + score), Juggernaut (one 3×-HP boss vs all), Assassination (2v2, protect your VIP ♛)
- **Physics-driven combat** — gravity, per-turn dynamic wind, bounces, homing, hitscan beams
- **In-match XP** — deal damage, level up, and upgrade your arsenal mid-game; resets every match
- **Local play** — hotseat multiplayer (up to 4 tanks) and AI opponents with ballistic shot planning
- **Granular lobby settings** — mode, map, terrain shape, HP, fuel, wind, turn timer, crate drops, round count, gravity, shell pace, aim-guide detail, fall damage, friendly fire, starting level, weapon bans and cinematics
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

Then open **§2 Online Play**, enter your name and pick one of two paths:
**Host a game** (choose the rules, get a room code to share) or **Join a game**
(paste the code a friend sent you). The connection settings row is collapsed
unless no server is configured. The client connects to `ws://localhost:2567` by
default; set `VITE_SERVER_URL` to point elsewhere.

### Deploy the server to Render

The repo ships a [render.yaml](render.yaml) blueprint. Either:

1. **Blueprint**: [dashboard.render.com/blueprints](https://dashboard.render.com/blueprints) → New Blueprint Instance → pick this repo, or
2. **Manual**: New Web Service → this repo → root dir `server`, build `npm install && npm run build`, start `npm start`.

### Pointing the deployed client at the deployed server

**This is the one piece deploying-from-Git alone does not wire up.** A page served
over HTTPS cannot open a `ws://localhost` socket, so the client needs to be told
where the relay lives. Either:

1. **Vercel env var (recommended).** In the Vercel project → Settings → Environment
   Variables add `VITE_SERVER_URL = wss://your-service.onrender.com`, then redeploy.
   Vite inlines it at build time.
2. **In-game field, no rebuild.** Open **§2 Network Op** and paste the Render host
   into **Relay Server**. It is normalized (`your-service.onrender.com` →
   `wss://your-service.onrender.com`) and remembered in `localStorage`.
3. **Query string, for a one-off test.** `?server=wss://your-service.onrender.com`.

If none is set and the page isn't on localhost, the Network panel says so
explicitly rather than hanging on a connection that can never succeed.

Note: Render's free tier sleeps when idle — the first room you open after a quiet
spell can take ~30s to spin up.

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
| 1–0, Q / E, or click | Select weapon (Q/E cycles all 20, skipping bans) |
| Mouse wheel | Zoom the scouting camera (1×–4×) |
| Right-drag | Look around the battlefield |
| C | Recentre the camera |
| M | Mute audio |
| F3 | Frame-rate / quality readout |
| Space / Esc / click | Skip a cutscene or kill cam |
| U | Open upgrade panel (when you have points) |

## Roadmap

- **Phase 1 — Prototype** ✅ terrain generation + destruction, aiming, weapons, local play
- **Phase 2 — Multiplayer** ✅ Colyseus lockstep server (Render-ready), room-code lobbies, up to 8 players
- **Phase 3 — Full arsenal** ✅ all 20 weapons with tier upgrades, Points / Juggernaut / Assassination modes
- **Phase 4 — AAA polish** ✅ art direction overhaul, VFX pass, layered audio, 60 FPS work, weapon bans, trick-shot XP
- **Next** ⏳ simultaneous-turn mode, spectator view, per-weapon balance pass

## Art direction

The interface is built as an **ordnance field manual** rather than a typical game
menu: a printed document with a masthead rail, section tabs, and machined cut
corners. Bone stock and ink, hazard orange for anything live, acid yellow for
readouts. Type is condensed stencil for display and monospace for instrumentation;
nothing is rounded and nothing glows. Native `<select>` and `<input type=range>`
controls are replaced with segmented switch banks and notched dials so the whole
surface reads as equipment. In-game, the HUD continues the same system, so the
chrome stays legible against the world without competing with it.

## Chassis balance

Each chassis multiplies a shared baseline. `hp` and `armor` compound, so
**effective hull is `hp / armor`** — that is the number tuned, and it is kept
inside roughly 77–139 against a 100 baseline.

| Chassis | Role | Leans on | Pays for it with |
|---|---|---|---|
| Vanguard | All-round | Slightly higher damage | Nothing special |
| Scout | Skirmisher | 1.7× fuel, 1.5× drive | Thin hull |
| Bulwark | Assault | Toughest hull, wide blast | Slow, low fuel, soft muzzle |
| Howitzer | Marksman | 1.28× muzzle, half wind drift | Thin hull, small blast |
| Sapper | Engineer | 1.4× blast, 1.25× XP | Weakest direct damage |
| Reaver | Glass cannon | 1.3× damage | Takes 15% more |

Balance is measured, not asserted: a 120-game AI round-robin (every pair, seats
alternated, three terrain types) lands every chassis between **45% and 57.5%**
win rate — inside one standard error of even at that sample size. The AI
repositions with its fuel before firing, which is what gives the mobile chassis
their value; without that, mobility stats are worth nothing in a duel.

## Rendering notes

Tank art is authored once and cached: hull and barrel rasterize to sprites keyed
by `(chassis, colour, size)`, with the barrel in its own sprite because it
rotates. A steady-state chassis draw costs **~3.7µs** (about 0.03ms for eight
tanks) against **~78µs** to build a sprite, which happens at most a few dozen
times per session. That is what makes the road wheels, track links, panel lines,
mantlets and per-type greebles essentially free. Tanks render at 1.3× their
collision radius so the detail is legible — cosmetic only, hitboxes are unchanged.

Map themes drive one shared `paintSky` routine, used for both the world
background and the selector thumbnails, so a map card always looks like the map
it launches.

## Performance notes

The renderer holds frame budget through a few deliberate choices: `shadowBlur` is
avoided entirely (it was the single largest cost), glow particles are blitted from
per-colour cached sprites instead of building arc paths, projectile trails draw as
two polylines rather than one stroke per segment, and the vignette is pre-rasterized.
Particle spawn counts scale from a rolling frame-time average, so a heavy volley
sheds effects instead of dropping frames — gameplay is never affected, only VFX
density.

## Stack

- [Vite](https://vitejs.dev) + TypeScript + colyseus.js client
- Custom Canvas 2D engine — fixed-timestep loop, pixel-mask terrain physics, pooled particles
- Node.js + [Colyseus](https://colyseus.io) server in [server/](server) (deployable to Render via [render.yaml](render.yaml))
