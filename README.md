# 🎯 Project Artillery

A web-based, turn-based tactical artillery game inspired by ShellShock Live — with **zero account grinding**. Every weapon, tank, and cosmetic is unlocked from minute one. Progression happens *inside* each match.

## Features (current prototype)

- **Fully destructible terrain** — every explosion carves the map; tanks can be buried or dropped into the void
- **Physics-driven combat** — gravity, per-turn dynamic wind, bounces, terrain collision
- **8 distinct weapons** with in-match Tier 1 → 3 upgrades (Splitter, Digger, Sniper, Bouncer, Shielder, and more)
- **In-match XP** — deal damage, level up, and upgrade your arsenal mid-game; resets every match
- **Local play** — hotseat multiplayer (up to 4 tanks) and AI opponents
- **Granular lobby settings** — HP, fuel, wind variability, turn timer, terrain type (Hilly / Flat / Cavern / Floating Islands), crate drops
- **Neon sci-fi visuals** — particles, screen shake, projectile trails, synthesized audio (no assets required)

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Controls

| Input | Action |
|---|---|
| ← / → or A / D | Drive tank (uses fuel) |
| ↑ / ↓ or mouse drag from tank | Aim angle |
| W / S or mouse drag distance | Power |
| Space / click | Fire (hold nothing — instant) |
| Space mid-air | Trigger Splitter split |
| 1–8 / mouse wheel | Select weapon |
| U | Open upgrade panel (when you have points) |

## Roadmap

- **Phase 1 — Prototype** ✅ terrain generation + destruction, aiming, weapons, local play
- **Phase 2 — Multiplayer** ⏳ Colyseus authoritative server on Render, lobbies, matchmaking (1v1 → 8-FFA)
- **Phase 3 — Full arsenal** ⏳ all 20 weapons, complete upgrade trees, trick-shot XP bonuses
- **Phase 4 — AAA polish** ⏳ VFX pass, 60 FPS lock across browsers, audio pass, game modes (Points, Juggernaut, Assassination)

## Stack

- [Vite](https://vitejs.dev) + TypeScript
- Custom Canvas 2D engine — fixed-timestep loop, pixel-mask terrain physics, pooled particles
- Planned: Node.js + Colyseus backend (Render), Next.js lobby frontend (Vercel)
