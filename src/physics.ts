/**
 * Per-match physics constants. These are settings-driven, so they live in a
 * mutable module rather than as `const`s. Every client configures them from
 * the shared match settings, which keeps online play deterministic.
 */

export type GravityMode = "low" | "normal" | "high";
export type PaceMode = "cinematic" | "normal" | "fast";

const BASE_GRAVITY = 350;
const BASE_POWER_TO_VELOCITY = 7.7;

const GRAVITY_MUL: Record<GravityMode, number> = { low: 0.7, normal: 1, high: 1.4 };
/**
 * Pace scales muzzle velocity by k and gravity by k², which stretches or
 * compresses flight time while leaving range-per-power untouched.
 */
const PACE_K: Record<PaceMode, number> = { cinematic: 0.8, normal: 1, fast: 1.3 };

export const physics = {
  gravity: BASE_GRAVITY,
  powerToVelocity: BASE_POWER_TO_VELOCITY,
};

export function configurePhysics(gravity: GravityMode = "normal", pace: PaceMode = "normal"): void {
  const k = PACE_K[pace] ?? 1;
  physics.gravity = BASE_GRAVITY * (GRAVITY_MUL[gravity] ?? 1) * k * k;
  physics.powerToVelocity = BASE_POWER_TO_VELOCITY * k;
}
