export type WeaponBehavior =
  | "standard"   // explode on impact
  | "splitter"   // splits into sub-shells on Space press
  | "digger"     // drills through terrain, carving a tunnel
  | "sniper"     // fast, wind-immune, flat arc, direct-hit damage
  | "bouncer"    // bounces off terrain, damage grows per bounce
  | "roller"     // rolls along the terrain surface after landing
  | "shielder"   // builds a protective terrain dome, no damage
  | "cluster"    // impact spawns bomblets that scatter and explode
  | "mirv"       // auto-splits at apex into falling warheads
  | "airstrike"  // impact calls in a bombing run from the sky
  | "napalm"     // impact scatters lingering fire blasts
  | "twins"      // fires multiple shells in a tight fan
  | "homing"     // steers toward the nearest enemy after arming
  | "grenade"    // bounces, detonates on a fuse or tank contact
  | "railstrike" // instant hitscan beam that pierces terrain
  | "quake"      // collapses a wide seam of terrain, little blast
  | "leech"      // damage dealt heals the shooter
  | "teleport"   // relocates the shooter to the impact point
  | "terraform"  // grows permanent terrain, in the air or on the ground
  | "medbay"     // drops a healing zone that ticks for two rounds
  | "hellstorm"; // special: marks an area for an orbital barrage

export interface WeaponTierStats {
  damage: number;
  radius: number;        // explosion / effect radius
  count?: number;        // sub-munition count (splitter/cluster/mirv/airstrike/napalm/twins)
  bounceBonus?: number;  // bouncer: damage multiplier added per bounce
  digTime?: number;      // digger: seconds of tunneling
  fuse?: number;         // grenade: seconds until detonation
  heal?: number;         // medbay: hull restored per round inside the zone
  rounds?: number;       // medbay: how many rounds the zone persists
  turnRate?: number;     // homing: steering rate, rad/s
  pen?: number;          // railstrike: pixels of terrain penetration
  label: string;         // tier flavor name
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
  {
    id: "cluster", name: "Cluster", icon: "💥", behavior: "cluster",
    desc: "Impact scatters bomblets across the area.",
    speedMul: 1, gravityMul: 1, windMul: 1, trailColor: "#ffab3c",
    tiers: [
      { label: "Cluster Bomb", damage: 15, radius: 24, count: 4 },
      { label: "Frag Storm", damage: 17, radius: 26, count: 6 },
      { label: "Saturation Strike", damage: 19, radius: 28, count: 8 },
    ],
  },
  {
    id: "mirv", name: "MIRV", icon: "☄️", behavior: "mirv",
    desc: "Splits at the top of its arc into raining warheads.",
    speedMul: 1, gravityMul: 1, windMul: 1, trailColor: "#ff6b6b",
    tiers: [
      { label: "MIRV ×4", damage: 16, radius: 26, count: 4 },
      { label: "MIRV ×5", damage: 18, radius: 28, count: 5 },
      { label: "Meteor Shower ×6", damage: 20, radius: 30, count: 6 },
    ],
  },
  {
    id: "airstrike", name: "Airstrike", icon: "✈️", behavior: "airstrike",
    desc: "Marks the target — bombers carpet the area from above.",
    speedMul: 1.1, gravityMul: 0.9, windMul: 0.5, trailColor: "#e8e84d",
    tiers: [
      { label: "Airstrike", damage: 20, radius: 30, count: 4 },
      { label: "Bombing Run", damage: 24, radius: 34, count: 5 },
      { label: "Carpet Bombing", damage: 28, radius: 38, count: 6 },
    ],
  },
  {
    id: "napalm", name: "Napalm", icon: "🔥", behavior: "napalm",
    desc: "Splashes burning fire that scorches the impact zone.",
    speedMul: 0.95, gravityMul: 1, windMul: 1.1, trailColor: "#ff5a3c",
    tiers: [
      { label: "Napalm", damage: 9, radius: 26, count: 6 },
      { label: "Firestorm", damage: 11, radius: 30, count: 8 },
      { label: "Inferno", damage: 13, radius: 34, count: 10 },
    ],
  },
  {
    id: "nuke", name: "Nuke", icon: "☢️", behavior: "standard",
    desc: "The big one. Slow, heavy, apocalyptic.",
    speedMul: 0.72, gravityMul: 1.15, windMul: 1.3, trailColor: "#d0ff4d",
    tiers: [
      { label: "Tactical Nuke", damage: 70, radius: 105 },
      { label: "Strategic Nuke", damage: 85, radius: 130 },
      { label: "Tsar Bomba", damage: 105, radius: 155 },
    ],
  },
  {
    id: "twins", name: "Twins", icon: "🎭", behavior: "twins",
    desc: "Fires a tight fan of shells in one shot.",
    speedMul: 1, gravityMul: 1, windMul: 1, trailColor: "#4dffd2",
    tiers: [
      { label: "Twins ×2", damage: 26, radius: 30, count: 2 },
      { label: "Triplets ×3", damage: 26, radius: 30, count: 3 },
      { label: "Quadruplets ×4", damage: 27, radius: 32, count: 4 },
    ],
  },
  {
    id: "homing", name: "Homing", icon: "🚀", behavior: "homing",
    desc: "Arms mid-flight and steers toward the nearest enemy.",
    speedMul: 1.15, gravityMul: 0.3, windMul: 0, trailColor: "#ff4d6b",
    tiers: [
      { label: "Homing Missile", damage: 34, radius: 26, turnRate: 2.0 },
      { label: "Seeker", damage: 42, radius: 30, turnRate: 2.7 },
      { label: "Widowmaker", damage: 50, radius: 34, turnRate: 3.5 },
    ],
  },
  {
    id: "grenade", name: "Grenade", icon: "🍍", behavior: "grenade",
    desc: "Bounces and rolls, then detonates on a timed fuse.",
    speedMul: 0.95, gravityMul: 1.05, windMul: 0.9, trailColor: "#9df04d",
    tiers: [
      { label: "Grenade", damage: 40, radius: 34, fuse: 2.2 },
      { label: "Impact Charge", damage: 50, radius: 40, fuse: 2.2 },
      { label: "Demolition Core", damage: 62, radius: 46, fuse: 2.2 },
    ],
  },
  {
    id: "railstrike", name: "Railstrike", icon: "🎇", behavior: "railstrike",
    desc: "Instant energy lance that pierces straight through terrain.",
    speedMul: 1, gravityMul: 0, windMul: 0, trailColor: "#4de8ff",
    tiers: [
      { label: "Railstrike", damage: 45, radius: 8, pen: 140 },
      { label: "Photon Lance", damage: 60, radius: 9, pen: 210 },
      { label: "Singularity Beam", damage: 78, radius: 10, pen: 300 },
    ],
  },
  {
    id: "quake", name: "Quake", icon: "🌋", behavior: "quake",
    desc: "Collapses a wide seam of ground. Gravity does the killing.",
    speedMul: 0.9, gravityMul: 1.1, windMul: 1, trailColor: "#c9a06a",
    tiers: [
      { label: "Tremor", damage: 15, radius: 70 },
      { label: "Earthquake", damage: 20, radius: 85 },
      { label: "Tectonic Rip", damage: 25, radius: 100 },
    ],
  },
  {
    id: "leech", name: "Leech", icon: "🩸", behavior: "leech",
    desc: "Damage dealt flows back to you as health.",
    speedMul: 1, gravityMul: 1, windMul: 1, trailColor: "#f04da0",
    tiers: [
      { label: "Leech", damage: 30, radius: 34 },
      { label: "Vampire Round", damage: 38, radius: 40 },
      { label: "Soul Siphon", damage: 46, radius: 46 },
    ],
  },
  {
    id: "terraform", name: "Terraformer", icon: "⛰", behavior: "terraform",
    desc: "Grows solid ground where it lands — mid-air too. Lifts anyone buried.",
    speedMul: 0.95, gravityMul: 1, windMul: 0.8, trailColor: "#a9d18e",
    tiers: [
      { label: "Terraformer", damage: 0, radius: 52 },
      { label: "Landshaper", damage: 0, radius: 68 },
      { label: "Continent Forge", damage: 0, radius: 86 },
    ],
  },
  {
    id: "medbay", name: "Medbay", icon: "✚", behavior: "medbay",
    desc: "Deploys a repair field that mends anything inside it for two rounds.",
    speedMul: 0.95, gravityMul: 1, windMul: 0.9, trailColor: "#4dffa8",
    tiers: [
      { label: "Medbay", damage: 0, radius: 90, heal: 14, rounds: 2 },
      { label: "Field Hospital", damage: 0, radius: 110, heal: 20, rounds: 2 },
      { label: "Regeneration Field", damage: 0, radius: 130, heal: 27, rounds: 2 },
    ],
  },
  {
    id: "teleport", name: "Teleport", icon: "🕳️", behavior: "teleport",
    desc: "No damage — relocates YOU to wherever it lands.",
    speedMul: 1, gravityMul: 0.9, windMul: 0.6, trailColor: "#b44df0",
    tiers: [
      { label: "Blink", damage: 0, radius: 26 },
      { label: "Phase Shift", damage: 12, radius: 26 },
      { label: "Quantum Jump", damage: 24, radius: 26 },
    ],
  },
];

/**
 * Ordnance that is not selected from the bar: the special is unlocked by the
 * charge meter and fired with its own key.
 */
export const HELLSTORM: WeaponDef = {
  id: "hellstorm", name: "Hellstorm", icon: "☄", behavior: "hellstorm",
  desc: "Marks a target for an orbital barrage. Charges from damage dealt.",
  speedMul: 1, gravityMul: 1, windMul: 0.4, trailColor: "#ff2e4d",
  tiers: [
    { label: "Hellstorm", damage: 26, radius: 62, count: 9 },
    { label: "Hellstorm", damage: 26, radius: 62, count: 9 },
    { label: "Hellstorm", damage: 26, radius: 62, count: 9 },
  ],
};

export const XP_LEVELS = [60, 150, 270, 420, 600, 810, 1050];

export function levelForXp(xp: number): number {
  let lvl = 0;
  for (const threshold of XP_LEVELS) {
    if (xp >= threshold) lvl++;
    else break;
  }
  return lvl;
}
