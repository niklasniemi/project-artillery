/**
 * Weapon glyphs. Inline SVG rather than emoji so they inherit the UI colour,
 * stay legible at 22px, and render identically on every platform.
 * All are authored on a 24×24 grid with a 1.6 stroke.
 */

const OPEN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`;

const PATHS: Record<string, string> = {
  // Artillery shell: ogive nose, body, driving band, fins.
  shell: `
    <path d="M12 2.5c1.9 1.8 2.9 4 2.9 6.2v6.9H9.1V8.7c0-2.2 1-4.4 2.9-6.2Z"/>
    <path d="M9.1 11.6h5.8M9.1 13.4h5.8"/>
    <path d="M9.1 15.6 6.6 21h3.3l1-3.4M14.9 15.6 17.4 21h-3.3l-1-3.4"/>`,

  // Mortar bomb on a lobbed arc.
  mortar: `
    <path d="M3 20c2.4-8.2 7-12.4 13.8-12.7"/>
    <circle cx="17" cy="15.5" r="4.2"/>
    <path d="M17 11.3V8.6M17 8.6l2.2-2.4M14.4 12.7l-1.9-1.5"/>`,

  // One shell breaking into three.
  splitter: `
    <path d="M12 21V13"/>
    <path d="M12 13 6 6.5M12 13l6-6.5"/>
    <circle cx="12" cy="22" r="1.3" fill="currentColor" stroke="none"/>
    <path d="M5 3.4 6 6.5l3.1.6M19 3.4 18 6.5l-3.1.6"/>
    <path d="M12 8.6V3"/>`,

  // Drill bit boring downward.
  digger: `
    <path d="M9 2.5h6"/>
    <path d="M9.6 6h4.8M8.8 9.5h6.4M9.6 13h4.8"/>
    <path d="M15 2.5c0 5.6-3 8.6-3 12.4M9 2.5c0 5.6 3 8.6 3 12.4"/>
    <path d="M12 14.9 10.2 21h3.6L12 14.9Z" fill="currentColor" stroke="none"/>`,

  // Long-range reticle with range ticks.
  sniper: `
    <circle cx="12" cy="12" r="7.2"/>
    <path d="M12 1.4v4.2M12 18.4v4.2M1.4 12h4.2M18.4 12h4.2"/>
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>
    <path d="M9.6 12h1.2M13.2 12h1.2M12 9.6v1.2M12 13.2v1.2"/>`,

  // Ball tracing a ricochet.
  bouncer: `
    <path d="M2.5 19.5c2-4.4 4.2-4.4 6.2 0 2-4.4 4.2-4.4 6.2 0"/>
    <circle cx="18" cy="7.4" r="4.4"/>
    <path d="M13.6 7.4h8.8M18 3v8.8"/>
    <path d="M14.9 4.3c2 1.4 4.2 1.4 6.2 0M14.9 10.5c2-1.4 4.2-1.4 6.2 0"/>`,

  // Heavy wheel with motion streaks.
  roller: `
    <circle cx="13.5" cy="12" r="7.4"/>
    <circle cx="13.5" cy="12" r="2.6"/>
    <path d="M13.5 4.6v2.8M13.5 16.6v2.8M6.1 12h2.8M18.1 12h2.8"/>
    <path d="M4 7.4H1.4M3.2 12H1M4 16.6H1.4"/>`,

  // Protective dome over ground.
  shielder: `
    <path d="M3.6 18a8.4 8.4 0 0 1 16.8 0"/>
    <path d="M7.2 18a4.8 4.8 0 0 1 9.6 0"/>
    <path d="M2 21h20"/>
    <path d="M12 5.4V2.6"/>
    <path d="M6.2 7.6 4.8 5.6M17.8 7.6l1.4-2"/>`,

  // Canister shedding bomblets.
  cluster: `
    <path d="M9.4 2.6h5.2l1 6.4a3.6 3.6 0 0 1-7.2 0Z"/>
    <path d="M12 12.6v2"/>
    <circle cx="6.4" cy="18.4" r="2" fill="currentColor" stroke="none"/>
    <circle cx="12" cy="20.4" r="2" fill="currentColor" stroke="none"/>
    <circle cx="17.6" cy="18.4" r="2" fill="currentColor" stroke="none"/>
    <path d="M10.6 14.4 7.6 16.8M13.4 14.4l3 2.4"/>`,

  // Bus splitting into re-entry warheads.
  mirv: `
    <path d="M12 2.4c1.5 1.4 2.3 3 2.3 4.7v3H9.7v-3c0-1.7.8-3.3 2.3-4.7Z"/>
    <path d="M4 21.4l1.8-5.2M9.3 21.4l1.2-5.6M14.7 21.4l-1.2-5.6M20 21.4l-1.8-5.2"/>
    <path d="M10.4 10.8 6 15.4M13.6 10.8 18 15.4M12 10.8v4.6"/>`,

  // Bomber releasing a stick of bombs.
  airstrike: `
    <path d="M2.4 8.6 21.6 5.2l-3.2 4.2-11 2.2Z"/>
    <path d="M9.6 11.2 8 15.4l3.4-1.6"/>
    <path d="M7 17.6v3M12 18.4v3M17 16.6v3"/>
    <path d="M6.2 16.2h1.6M11.2 17h1.6M16.2 15.2h1.6"/>`,

  // Flame tongue.
  napalm: `
    <path d="M12 21.4c3.5 0 6-2.3 6-5.5 0-4.6-4.3-5.9-3.4-11.6-2.6 1.3-4 3.5-4 5.6 0 1.5.6 2.4.6 3.3 0 1-.8 1.7-1.7 1.7-1.1 0-1.8-.9-1.8-2.3-1.1 1.3-1.7 2.9-1.7 4.5 0 2.7 2.5 4.3 6 4.3Z"/>
    <path d="M12 18.4c1.3 0 2.2-.9 2.2-2.1 0-1.6-1.6-2.3-1.3-4.3-1.4.9-2 2-2 3 0 1.3.4 1.5.4 2.1 0 .7-.5 1.3-1.3 1.3.4 0 .7 0 2 0Z" fill="currentColor" stroke="none"/>`,

  // Mushroom cloud.
  nuke: `
    <path d="M4.6 8.2c0-2.9 3.3-5.2 7.4-5.2s7.4 2.3 7.4 5.2c0 1.6-1 3-2.6 3.9H7.2C5.6 11.2 4.6 9.8 4.6 8.2Z"/>
    <path d="M8.6 12.1c0 2.4-.7 4.2-2 5.6h10.8c-1.3-1.4-2-3.2-2-5.6"/>
    <path d="M4.8 21h14.4"/>
    <path d="M9.4 6.6c1.5-1 3.7-1 5.2 0"/>`,

  // Paired shells.
  twins: `
    <path d="M7.6 3.4c1.3 1.2 2 2.7 2 4.2v8.2H5.6V7.6c0-1.5.7-3 2-4.2Z"/>
    <path d="M16.4 3.4c1.3 1.2 2 2.7 2 4.2v8.2h-4V7.6c0-1.5.7-3 2-4.2Z"/>
    <path d="M5.6 15.8 4 20.6h3.2M9.6 15.8l1.6 4.8H8M14.4 15.8l-1.6 4.8H16M18.4 15.8l1.6 4.8h-3.2"/>
    <path d="M5.6 11h4M14.4 11h4"/>`,

  // Guided missile locked on.
  homing: `
    <path d="M5.4 14.6c4-8 8.6-11.4 13.8-11.8.4 5.2-3 9.8-11 13.8"/>
    <path d="M5.4 14.6 3 19.4l4.8-2.4"/>
    <path d="M8.4 11.6 6 9.2l3.4-.6M12.4 15.6l2.4 2.4.6-3.4"/>
    <circle cx="15.6" cy="8.4" r="1.5" fill="currentColor" stroke="none"/>`,

  // Fragmentation grenade.
  grenade: `
    <rect x="6.6" y="8.2" width="10.8" height="12.2" rx="3.4"/>
    <path d="M9.6 8.2V6.4h4.8v1.8"/>
    <path d="M14.4 6.4 18 3.6l1.6 2.2"/>
    <path d="M6.6 12.4h10.8M6.6 16.2h10.8M12 8.2v12.2M9.3 8.4v11.9M14.7 8.4v11.9"/>`,

  // Energy lance piercing a plate.
  railstrike: `
    <path d="M2 12h6.4M15.6 12H22"/>
    <path d="M11.4 2.6 8.6 11h3.2l-1.4 10.4 5-11.4h-3.4l2-7.4Z" fill="currentColor" stroke="none"/>
    <path d="M5.6 8.4 3.4 6.2M5.6 15.6l-2.2 2.2M18.4 8.4l2.2-2.2M18.4 15.6l2.2 2.2"/>`,

  // Fractured ground.
  quake: `
    <path d="M2 9.4h5.4l2.2 3 2.6-5.4 2.4 4 2-1.6H22"/>
    <path d="M2 14.6h20"/>
    <path d="M7 14.6 5.4 21M12 14.6l1 6.4M17 14.6l1.8 6.4"/>
    <path d="M9.6 17.8h3.2"/>`,

  // Drained life returning to the shooter.
  leech: `
    <path d="M12 2.6c3.2 4.2 5 7 5 9.4a5 5 0 0 1-10 0c0-2.4 1.8-5.2 5-9.4Z"/>
    <path d="M9.6 12.4a2.4 2.4 0 0 0 2.4 2.4"/>
    <path d="M4 19.4c2.6 1.8 5.4 2.6 8 2.6s5.4-.8 8-2.6"/>
    <path d="M4 19.4l3-.8M4 19.4l.6 3" />`,

  // Rising landmass with an upward arrow.
  terraform: `
    <path d="M2 19.5h20"/>
    <path d="M2.5 16.5c3-4.5 5-4.5 7.5 0M11 16.5c2.5-3.5 4.5-3.5 7 0"/>
    <path d="M12 12.4V3.4"/>
    <path d="M8.4 6.8 12 3.2l3.6 3.6"/>
    <path d="M5.2 13.4h2M17 13.4h1.9"/>`,

  // Repair cross inside a field ring.
  medbay: `
    <circle cx="12" cy="12" r="9.2" stroke-dasharray="3.4 3"/>
    <path d="M12 7.2v9.6M7.2 12h9.6"/>
    <path d="M4.6 4.6 6.4 6.4M19.4 4.6 17.6 6.4M4.6 19.4l1.8-1.8M19.4 19.4l-1.8-1.8"/>`,

  // Barrage raining onto a marked zone.
  hellstorm: `
    <path d="M4 2.6v6M8.6 2v7.6M13.4 2v7.6M18 2.6v6"/>
    <path d="M2.6 14.6h18.8"/>
    <path d="M6 12.4l-1 2.2M11 11.8l-1 2.8M16 12.4l-1 2.2"/>
    <path d="M8 18.2c1.4-1.6 2.6-1.6 4 0 1.4 1.6 2.6 1.6 4 0"/>
    <path d="M12 20.4v1.4"/>`,

  // Portal with a body passing through.
  teleport: `
    <ellipse cx="12" cy="12" rx="4.4" ry="8.4"/>
    <ellipse cx="12" cy="12" rx="1.8" ry="4"/>
    <path d="M2.6 12c1.6-1.4 3.2-2.2 4.6-2.6M2.6 12c1.6 1.4 3.2 2.2 4.6 2.6"/>
    <path d="M21.4 12c-1.6-1.4-3.2-2.2-4.6-2.6M21.4 12c-1.6 1.4-3.2 2.2-4.6 2.6"/>
    <path d="M6 6.4 4.4 4.4M18 6.4l1.6-2M6 17.6l-1.6 2M18 17.6l1.6 2"/>`,
};

/** SVG markup for a weapon id; falls back to a neutral shell. */
export function weaponIcon(id: string): string {
  return `${OPEN}${PATHS[id] ?? PATHS.shell}</svg>`;
}
