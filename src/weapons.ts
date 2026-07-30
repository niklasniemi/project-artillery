export type WeaponBehavior =
  | "standard"   // explode on impact
  | "splitter"   // splits into sub-shells on Space / at apex
  | "digger"     // drills through terrain, carving a tunnel
  | "sniper"     // fast, wind-immune, flat arc, direct-hit damage
  | "bouncer"    // bounces off terrain, damage grows per bounce
  | "roller"     // rolls along the terrain surface after landing
  | "shielder";  // builds a protective terrain dome, no damage

export interface WeaponTierStats {
  damage: number;
  radius: number;       // explosion / effect radius
  count?: number;       // splitter sub-shell count
  bounceBonus?: number; // bouncer: damage multiplier added per bounce
  digTime?: number;     // digger: seconds of tunneling
  label: string;        // tier flavor name
}

export interface WeaponDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  behavior: WeaponBehavior;
  speedMul: number;    // muzzle velocity multiplier
  gravityMul: number;
  windMul: number;
  trailColor: string;
  tiers: [WeaponTierStats, WeaponTierStats, WeaponTierStats];
}

export const WEAPONS: WeaponDef[] = [
  {
    id: "shell", name: "Shell", icon: "🎯", behavior: "standard",
    desc: "Reliable all-rounder. The baseline of destruction.",
    speedMul: 1, gravityMul: 1, windMul: 1, trailColor: "#ffd24d",
    tiers: [
      { label: "Shell", damage: 32, radius: 36 },
      { label: "Heavy Shell", damage: 42, radius: 45 },
      { label: "Mega Shell", damage: 55, radius: 56 },
    ],
  },
  {
    id: "mortar", name: "Mortar", icon: "💣", behavior: "standard",
    desc: "Slow, heavy arc. Massive blast radius.",
    speedMul: 0.88, gravityMul: 1.25, windMul: 1.2, trailColor: "#ff8c4d",
    tiers: [
      { label: "Mortar", damage: 44, radius: 58 },
      { label: "Siege Mortar", damage: 56, radius: 72 },
      { label: "Doomsday Mortar", damage: 72, radius: 88 },
    ],
  },
  {
    id: "splitter", name: "Splitter", icon: "🎆", behavior: "splitter",
    desc: "Press SPACE mid-air to split into a shell storm.",
    speedMul: 1, gravityMul: 1, windMul: 1, trailColor: "#ff4dd8",
    tiers: [
      { label: "Splitter ×5", damage: 15, radius: 24, count: 5 },
      { label: "Splitter ×7", damage: 17, radius: 26, count: 7 },
      { label: "Shell Storm ×9", damage: 19, radius: 28, count: 9 },
    ],
  },
  {
    id: "digger", name: "Digger", icon: "⛏️", behavior: "digger",
    desc: "Drills deep, shredding terrain. Bury them alive.",
    speedMul: 1.05, gravityMul: 1, windMul: 0.8, trailColor: "#b68d5c",
    tiers: [
      { label: "Digger", damage: 20, radius: 30, digTime: 0.9 },
      { label: "Excavator", damage: 26, radius: 38, digTime: 1.2 },
      { label: "Planet Cracker", damage: 34, radius: 46, digTime: 1.6 },
    ],
  },
  {
    id: "sniper", name: "Sniper", icon: "⚡", behavior: "sniper",
    desc: "Hyper-velocity, wind-immune. Devastating direct hits.",
    speedMul: 1.9, gravityMul: 0.55, windMul: 0, trailColor: "#4de8ff",
    tiers: [
      { label: "Sniper", damage: 58, radius: 13 },
      { label: "Railgun", damage: 74, radius: 14 },
      { label: "Annihilator Beam", damage: 95, radius: 16 },
    ],
  },
  {
    id: "bouncer", name: "Bouncer", icon: "🏀", behavior: "bouncer",
    desc: "Ricochets off terrain — damage grows with every bounce.",
    speedMul: 1, gravityMul: 1, windMul: 1, trailColor: "#b6ff4d",
    tiers: [
      { label: "Bouncer", damage: 24, radius: 32, bounceBonus: 0.3 },
      { label: "Super Ball", damage: 28, radius: 36, bounceBonus: 0.45 },
      { label: "Chaos Sphere", damage: 32, radius: 40, bounceBonus: 0.6 },
    ],
  },
  {
    id: "roller", name: "Roller", icon: "🌀", behavior: "roller",
    desc: "Lands, then rolls along the terrain hunting for tanks.",
    speedMul: 0.95, gravityMul: 1, windMul: 1, trailColor: "#c44dff",
    tiers: [
      { label: "Roller", damage: 36, radius: 40 },
      { label: "Boulder", damage: 46, radius: 50 },
      { label: "Juggernaut Wheel", damage: 58, radius: 62 },
    ],
  },
  {
    id: "shielder", name: "Shielder", icon: "🛡️", behavior: "shielder",
    desc: "Builds a hardened terrain dome. Pure defense.",
    speedMul: 0.9, gravityMul: 1, windMul: 0.5, trailColor: "#38f0c8",
    tiers: [
      { label: "Shielder", damage: 0, radius: 70 },
      { label: "Bunker Dome", damage: 0, radius: 92 },
      { label: "Aegis Fortress", damage: 0, radius: 115 },
    ],
  },
];

export const XP_LEVELS = [60, 150, 270, 420, 600, 810, 1050];

export function levelForXp(xp: number): number {
  let lvl = 0;
  for (const threshold of XP_LEVELS) {
    if (xp >= threshold) lvl++;
    else break;
  }
  return lvl;
}
