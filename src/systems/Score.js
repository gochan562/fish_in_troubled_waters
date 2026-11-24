import { CONFIG } from '../core/config.js';

/**
 * Combo → score multiplier. Configurable curve, clamped to [1, max]:
 * combo 1 → ×1.0, combo 2 → ×1.5, combo 3 → ×2.0 … (step 0.5 by default).
 */
export function multiplierFor(combo) {
  const s = CONFIG.endless.combo;
  if (combo < 2) return 1;
  return Math.min(s.multiplierMax, 1 + (combo - 1) * s.multiplierStep);
}

/**
 * Endless-run scoring: each round accrues points by the greed curve
 * (base + linear + quadratic hold rate) multiplied by the current combo
 * multiplier, and is banked into the run total on a successful escape.
 * Records persist via localStorage.
 */
export class Score {
  constructor() {
    this.total = 0;      // banked run score
    this.round = 0;      // accruing round score
    this.holdTime = 0;   // seconds held this round
    this.runTime = 0;    // seconds held across the whole run
    this.combo = 0;      // consecutive successful escapes
    this.newBestRun = false;
    this.newBestComboRun = false;
    this.best = this._load(CONFIG.storage.bestKey);
    this.bestCombo = this._load(CONFIG.storage.bestComboKey);
  }

  /** Fresh run (also on retry): clears combo, totals and stale records flags. */
  resetRun() {
    this.total = 0;
    this.round = 0;
    this.holdTime = 0;
    this.runTime = 0;
    this.combo = 0;
    this.newBestRun = false;
    this.newBestComboRun = false;
  }

  /** Fresh round within the same run. */
  resetRound() {
    this.round = 0;
    this.holdTime = 0;
  }

  get multiplier() {
    return multiplierFor(this.combo);
  }

  /**
   * Advance the hold timer and accrue round points. Early seconds are cheap;
   * the rate accelerates the longer you dare, and the combo multiplier
   * compounds everything.
   */
  tick(dt) {
    this.holdTime += dt;
    this.runTime += dt;
    const s = CONFIG.score;
    const rate = s.baseRate + s.linearRate * this.holdTime + s.quadraticRate * this.holdTime * this.holdTime;
    this.round += rate * this.multiplier * dt;
  }

  /**
   * Bank the round on a successful escape. Bumps the combo exactly once and
   * persists records immediately (so a browser close never loses a best).
   */
  bank() {
    const points = Math.round(this.round);
    this.total += points;
    this.round = 0;
    this.holdTime = 0;
    this.combo += 1;

    const newBest = this.total > this.best;
    if (newBest) {
      this.best = this.total;
      this._save(CONFIG.storage.bestKey, this.total);
      this.newBestRun = true;
    }
    const newBestCombo = this.combo > this.bestCombo;
    if (newBestCombo) {
      this.bestCombo = this.combo;
      this._save(CONFIG.storage.bestComboKey, this.combo);
      this.newBestComboRun = true;
    }
    return { points, total: this.total, combo: this.combo, newBest, newBestCombo };
  }

  _load(key) {
    try {
      return parseInt(localStorage.getItem(key) || '0', 10) || 0;
    } catch {
      return 0;
    }
  }

  _save(key, v) {
    try {
      localStorage.setItem(key, String(v));
    } catch { /* private mode — records just won't persist */ }
  }
}
