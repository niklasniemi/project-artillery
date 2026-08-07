# 🎯 Project Artillery

A web-based, turn-based tactical artillery game inspired by ShellShock Live — with **zero account grinding**. Every weapon, tank, and cosmetic is unlocked from minute one. Progression happens *inside* each match.

## Features

- **Animated title screen** with two clean paths — Local Game and Online Game — and match settings collapsed into Theatre / Rules / Armory modals
- **One-way energy shields** — anyone inside can shoot out, everyone outside bounces off, including whoever placed it. Full spheres, so they work anchored in mid-air (`SPACE` mid-flight) or half-buried. Two impacts collapse one
- **HELLSTORM special** — a meter charged by damage dealt unlocks a marker shot that triggers a shared cinematic: the cannon spins up, fires skyward, then lances rain down on the marked ground (`X`)
- **Ammo limits** — the host can cap rounds per weapon (1/2/3/unlimited); the basic Shell always stays stocked
- **Supply crates** parachute in between turns; drive over one or shoot it to claim the heal
- **Six themed theatres** — Nightfall, Dune Sea, Frostbite, Ashlands, Verdant and Orbital, each with its own sky, rock palette, hazard colour and weather, picked from rendered map cards
- **Six tank chassis** with real trade-offs — Vanguard, Scout, Bulwark, Howitzer, Sapper, Reaver; pick chassis and livery before every match
- **Cinematics** — a roll-call cutscene introduces every tank at the open, and a kill cam replays the shot that destroyed someone
- **Online multiplayer** — Colyseus lockstep server, room codes, up to 8 players, ready-up lobby
- **Trick-shot bonuses** — direct hits, long shots, bank shots, multi-kills, void kills and revenge kills all pay bonus XP
- **Weapon bans** — the host can strike any ordnance out of the match from the armory grid
- **Fully destructible terrain** — every explosion carves the map; tanks can be buried or dropped into the void
- **22 weapons** with in-match Tier 1 → 3 upgrades: Shell, Mortar, Splitter, Digger, Sniper, Bouncer, Roller, Shielder, Cluster, MIRV, Airstrike, Napalm, Nuke, Twins, Homing, Grenade, Railstrike, Quake, Leech, **Terraformer** (grows permanent ground, in the air or on it, lifting anyone it would bury), **Medbay** (repair field that mends for two rounds), Teleport
- **4 game modes** — Deathmatch, Points (respawns + score), Juggernaut (one 3×-HP boss vs all), Assassination (2v2, protect your VIP ♛)
- **Physics-driven combat** — gravity, per-turn dynamic wind, bounces, homing, hitscan beams
- **In-match XP** — deal damage, level up, and upgrade your arsenal mid-game; resets every match
- **Local play** — hotseat multiplayer (up to 4 tanks) and AI opponents with ballistic shot planning
- **Granular lobby settings** — mode, map, terrain shape, HP, fuel, wind, turn timer, crate drops, round count, gravity, shell pace, aim-guide detail, fall damage, friendly fire, starting level, ammo limits, fuel resupply, special-charge rate, bot skill, weapon bans and cinematics
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

Then choose **Online Game**, enter your name and pick one of two paths:

- **Host a game** — choose the rules and whether the room is listed publicly or
  reachable by code only, then share the code shown in your lobby.
- **Join a game** — pick a room straight from the open-games list, or enter a
  code if your friend is hosting privately.

The connection settings row is collapsed unless no server is configured. The
client connects to `ws://localhost:2567` by default; set `VITE_SERVER_URL` to
point elsewhere.

**Room browser.** Colyseus 0.16 removed client-side room listing, so the server
serves its own `GET /rooms` endpoint alongside the websocket transport, backed
by an in-process registry ([server/src/registry.ts](server/src/registry.ts)).
Rooms are listed only while public, waiting in the lobby and not full, and they
drop out of the list for the duration of a match. This is single-process by
design, matching how the game is deployed; a multi-node setup would need shared
presence instead.

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
2. **In-game field, no rebuild.** Open **Online Game → Connection settings** and paste the
   Render host into **Server**. It is normalized (`your-service.onrender.com` →
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
| Space / click | Fire |
| Space mid-air | Split a Splitter · anchor a Shielder or Terraformer where it is |
| 1–0, Q / E, or click | Select weapon (Q/E cycles all 20, skipping bans and empties) |
| Mouse wheel | Zoom the scouting camera (1×–4×) |
| Drag the ground | Look around (while zoomed in; right-drag works at any zoom) |
| C | Recentre the camera |
| X | Fire the HELLSTORM special (when charged) |
| U | Open upgrade panel (when you have points) |
| Esc | Pause / quit menu, or step back one level in menus |
| Space / click | Skip a cutscene or kill cam |
| M | Mute audio |
| F3 | Frame-rate / quality readout |

## Roadmap

- **Phase 1 — Prototype** ✅ terrain generation + destruction, aiming, weapons, local play
- **Phase 2 — Multiplayer** ✅ Colyseus lockstep server (Render-ready), room-code lobbies, up to 8 players
- **Phase 3 — Full arsenal** ✅ all 20 weapons with tier upgrades, Points / Juggernaut / Assassination modes
- **Phase 4 — AAA polish** ✅ art direction overhaul, VFX pass, layered audio, 60 FPS work, weapon bans, trick-shot XP
- **Phase 5 — Refit** ✅ animated menu + modal config, one-way shields, ammo limits, wind-free short trajectory, HP crates, bold wind readout, ESC/pause navigation, terrain surface overhaul, online chassis selection for every seat
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

## Design notes

**Bots have three levels.** Skill controls how hard the AI searches for a
solution *and* how much error it adds on top, so the tiers are genuinely
different rather than the same shot with noise. Measured median miss distance
against a target ~750px away: **easy ~295px, medium ~86px, hard ~34px**.

**Hulls sit parallel to the ground.** Slope is averaged across three sample
pairs spanning the hull footprint — a single pair either side picks up every
pebble and makes the tank twitch — and capped at ~26°, roughly the steepest a
tracked vehicle actually rests on. The barrel pivot rides with the tilted hull
while the barrel itself stays at its absolute aim angle, and the firing code
uses the same pivot so shells always leave the muzzle that is drawn.


**Shields are objects, not terrain.** The old dome stamped solid ground, which
by definition blocks everything. Making shields real entities allows the
one-way rule, and it is implemented by *crossing direction* rather than
proximity: a shot moving outside→inside is stopped, inside→outside passes. That
also makes tunnelling impossible for fast shells, since the test is on the
segment rather than the current position.

**The trajectory preview is deliberately not a solution.** It is short and it
ignores wind entirely, so it shows the launch vector rather than the landing
point — reading the wind is the skill the game is about. Length is configurable
(off / minimal / short / long) for players who want more or less help.

**Ammo never softlocks a turn.** When the host caps rounds, the basic Shell
stays unlimited, so a tank can always fire and the turn order can never stall.

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

Terrain is rasterized from the destructible mask as three soft bands — lit
crest, topsoil, body — with coverage-based alpha along the silhouette
(gamma-curved 3×3 tap, interior pixels early-out). That is what removes the hard
stair-stepped outline; the mask itself remains the untouched physics truth, so
softening the edge visually never changes a collision.

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
