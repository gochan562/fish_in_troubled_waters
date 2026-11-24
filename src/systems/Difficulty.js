import { CONFIG } from '../core/config.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

/**
 * Chaos ramp for a combo: 0 at combo 1 → 1 at chaosCombo (then holds).
 * Everything about the fisherman's unpredictability derives from this.
 */
export function chaosT(combo) {
  const peak = CONFIG.endless.difficulty.chaosCombo;
  return clamp((Math.max(1, combo) - 1) / (peak - 1), 0, 1);
}

/** Tunable difficulty parameters for a given combo (smooth, no level jumps). */
export function difficultyFor(combo) {
  const d = CONFIG.endless.difficulty;
  const t = chaosT(combo);
  return {
    t,
    suspiciousBefore: lerp(d.suspiciousBefore[0], d.suspiciousBefore[1], t),
    preparingBefore: lerp(d.preparingBefore[0], d.preparingBefore[1], t),
    stillnessBefore: lerp(d.stillnessBefore[0], d.stillnessBefore[1], t),
    intensity: 1 + t * d.intensityGain,
    throwSpeed: 1 + t * d.throwSpeedGain,
  };
}

/**
 * Fresh randomized attack schedule for ONE hold. Sampled independently every
 * round from a mixture of timing profiles whose weights shift as the combo
 * climbs — so high runs genuinely mix "he attacked instantly!" rounds with
 * "why is he waiting so long?" rounds, and no two rounds feel scripted.
 *
 * Shape (all times in seconds of hold time):
 *   { attackAt, suspiciousAt, preparingAt, stillnessBefore,
 *     intensity, throwSpeed, profile, pattern, feign }
 */
export function makeAttackSchedule(combo) {
  const d = CONFIG.endless.difficulty;
  const t = chaosT(combo);
  const base = difficultyFor(combo);

  // Sample the timing profile (weights + wait ranges lerp toward the peak).
  const entries = Object.entries(d.profiles).map(([name, p]) => ({
    name,
    w: lerp(p.w[0], p.w[1], t),
    lo: lerp(p.wait[0], p.waitEnd[0], t),
    hi: lerp(p.wait[1], p.waitEnd[1], t),
  }));
  const totalW = entries.reduce((s, e) => s + e.w, 0);
  let roll = Math.random() * totalW;
  let profile = entries[entries.length - 1];
  for (const e of entries) {
    roll -= e.w;
    if (roll <= 0) { profile = e; break; }
  }

  const attackAt = rand(profile.lo, profile.hi);

  // Warning windows: tighter as chaos rises; ambushes cut the cues hardest,
  // while long waits get an extended creepy stare-down instead.
  let suspiciousBefore = base.suspiciousBefore;
  let preparingBefore = base.preparingBefore;
  if (profile.name === 'ambush') { suspiciousBefore *= 0.45; preparingBefore *= 0.7; }
  else if (profile.name === 'quick') { suspiciousBefore *= 0.75; }
  else if (profile.name === 'long') { suspiciousBefore *= 1.25; }
  else if (profile.name === 'patience') { suspiciousBefore *= 1.6; }

  // Playability floor: there is always a readable tell before the throw.
  suspiciousBefore = Math.min(suspiciousBefore, Math.max(0.6, attackAt - 0.55));
  preparingBefore = Math.min(preparingBefore, suspiciousBefore * 0.8);

  return {
    attackAt,
    suspiciousAt: Math.max(0.25, attackAt - suspiciousBefore),
    preparingAt: Math.max(0.25, attackAt - preparingBefore),
    stillnessBefore: base.stillnessBefore,
    intensity: base.intensity,
    throwSpeed: base.throwSpeed,
    profile: profile.name,
    pattern: Math.floor(Math.random() * 4),   // per-round animation variant
    // Long waits may include feigned disinterest — he glances away, then
    // snaps back onto the bird right before committing.
    feign: (profile.name === 'patience' || profile.name === 'long') && Math.random() < 0.6,
  };
}

/** Seconds between an escape and the next round (faster as combo climbs). */
export function roundResetDelay(combo) {
  const [a, b] = CONFIG.endless.difficulty.roundReset;
  return lerp(a, b, chaosT(combo));
}

/** Bird escape-flight duration (snappier getaways at high combos). */
export function escapeFlightDuration(combo) {
  const [a, b] = CONFIG.endless.difficulty.escapeFlight;
  return lerp(a, b, chaosT(combo));
}
