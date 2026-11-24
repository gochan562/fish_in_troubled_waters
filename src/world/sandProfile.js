/**
 * Shared shape of the sandbar, used by the beach mesh builder AND the
 * ocean shader (so the foam line hugs the shore exactly).
 *
 * The sandbar is an organic blob centered near the bird, stretched toward
 * the camera, with a soft underwater skirt.
 */

export const SAND_CENTER = { x: 3.1, z: 0.85 };

/** Stretch factors applied before measuring radius (elongates the blob). */
const STRETCH_X = 1.22;
const STRETCH_Z = 0.92;

/** Edge radius of the blob for a given angle (radians). */
export function sandEdgeRadius(angle) {
  return (
    4.35 +
    0.62 * Math.sin(2.1 * angle + 1.15) +
    0.38 * Math.cos(3.3 * angle - 0.7) +
    0.18 * Math.sin(5.2 * angle + 0.4)
  );
}

/** Normalized radial parameter t: 0 = center, 1 = waterline, >1 = underwater. */
export function sandT(x, z) {
  const dx = (x - SAND_CENTER.x) / STRETCH_X;
  const dz = (z - SAND_CENTER.z) / STRETCH_Z;
  const d = Math.sqrt(dx * dx + dz * dz);
  const ang = Math.atan2(dz, dx);
  return d / sandEdgeRadius(ang);
}

/** Ground height of the sandbar at a world position (water level = 0). */
export function sandHeight(x, z) {
  const t = sandT(x, z);
  if (t >= 1.35) return -0.34;
  // Soft dome that dips under the waterline.
  const s = Math.min(1, Math.max(0, (t - 0.18) / (1.0 - 0.18)));
  const dome = 1 - s * s * (3 - 2 * s);       // smoothstep falloff, peak 1
  const outer = Math.max(0, (t - 1.0)) * 1.4; // keeps sinking past the edge
  return 0.46 * dome - outer - 0.02;
}
