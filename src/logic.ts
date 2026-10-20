// Pure game rules ported from the Construct 2 event sheet, kept separate so they can be tested.

export const SPEED = 200; // sideways speed right after a tap
export const ACCEL = 500; // Bullet behaviour acceleration: speeds up until the next tap
export const SCROLL = 300; // how fast the bars fall
export const SPAWN_MS = 1000;
export const GAP_OFFSET = 770; // right bar sits this far from the left bar's centre (604 wide → 166px gap)

/** Speed keeps its direction and grows by ACCEL every second. */
export function accelerate(vx: number, dt: number): number {
  return vx + Math.sign(vx) * ACCEL * dt;
}

/** Screen wrap from the original: leave on one side, come back on the other. */
export function wrapX(x: number): number {
  if (x < -15) return 410;
  if (x > 418) return -18;
  return x;
}

/** Returns the new best score, given whatever is in storage (string or null). */
export function bestScore(score: number, stored: string | null): number {
  return Math.max(score, Number(stored) || 0);
}
