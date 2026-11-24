/**
 * Central tuning file — every balance-sensitive number lives here.
 */

export const CONFIG = {
  // ---- fisherman attack (fixed constants) ----
  attack: {
    netFlight: 0.62,           // seconds for the net to travel to the bird
    stillnessBefore: 0.45,     // fallback tell timing (per-round schedules override)
  },

  // ---- endless mode: combo scoring & escalating chaos ----
  endless: {
    combo: {
      multiplierStep: 0.5,     // multiplier = 1 + (combo - 1) * step
      multiplierMax: 8,        // hard cap so late runs stay readable
    },

    difficulty: {
      // Chaos ramp: params lerp from their early value to their peak value
      // between combo 1 and chaosCombo, then hold (never a linear
      // shrink-to-instant-attack; the *distribution* widens instead).
      chaosCombo: 12,

      // Attack-wait profiles (seconds of hold time before the fisherman throws).
      //   w      = [weight at combo 1, weight at chaos peak]  (normalized per round)
      //   wait   = [min, max] wait early in a run
      //   waitEnd= [min, max] wait at the chaos peak
      // High combos mix "he attacked instantly!" rounds with agonizingly long
      // waits — the tension comes from the contrast, not from pure speed.
      profiles: {
        quick:    { w: [0.06, 0.32], wait: [2.6, 3.6],  waitEnd: [1.6, 2.4] },
        normal:   { w: [0.60, 0.20], wait: [4.2, 5.8],  waitEnd: [3.0, 5.2] },
        long:     { w: [0.16, 0.22], wait: [8.0, 11.5], waitEnd: [7.0, 12.0] },
        ambush:   { w: [0.00, 0.16], wait: [2.2, 2.8],  waitEnd: [0.95, 1.5] },
        patience: { w: [0.00, 0.18], wait: [13.0, 16.0], waitEnd: [12.0, 19.0] },
      },

      // Warning-cue timing: [early combo, chaos peak] seconds before the throw.
      // Cues get tighter (never absent — the game must stay readable).
      suspiciousBefore: [3.2, 1.7],
      preparingBefore: [1.5, 0.95],
      stillnessBefore: [0.45, 0.28],

      // Fisherman performance at the chaos peak.
      intensityGain: 0.6,      // animation energy multiplier (hunch/tremble/taps)
      throwSpeedGain: 0.3,     // windup/whip tempo multiplier

      // Seconds between an escape and the next round: [combo 1, chaos peak].
      roundReset: [1.15, 0.85],
      // Bird escape-flight duration: [combo 1, chaos peak] (snappier getaways
      // at high combos keep the loop feeling faster).
      escapeFlight: [1.6, 1.05],
    },
  },

  // ---- scoring curve (per-second hold rate, before combo multiplier) ----
  score: {
    baseRate: 6.0,        // points per second at t=0
    linearRate: 2.6,      // extra points/sec added per second held
    quadraticRate: 0.38,  // accelerating greed bonus
  },

  // ---- gameplay timings ----
  timing: {
    grabDuration: 0.38,   // bird lean-in before hold scoring starts
    escapeGrace: 0.0,     // input processed before net throw resolves (fairness)
    caughtSequence: 2.4,  // net capture drama before the game-over screen
    hintFadeAfter: 1.6,   // hide control hint after first hold
  },

  // ---- layout (world units) ----
  layout: {
    birdPosition: [3.35, 0.45, 1.15],
    birdFacingY: -1.69,               // model faces +Z; aim at the fisherman
    clamPosition: [2.28, 0.44, 0.62],  // in front of the bird's beak
    fishermanPosition: [-4.2, 1.72, 0.1],
    bobberPosition: [-2.85, 0, 1.95],
    netRestPosition: [-5.35, 1.98, -0.55],
  },

  camera: {
    fov: 36,
    position: [0.6, 4.7, 13.4],
    lookAt: [-0.1, 1.35, 0],
    // portrait screens pull back so the whole diorama stays visible
    portraitFov: 47,
    portraitOffsetZ: 6.8,
  },

  storage: {
    bestKey: 'fitw_best_score',
    bestComboKey: 'fitw_best_combo',
    mutedKey: 'fitw_muted',
  },
};
