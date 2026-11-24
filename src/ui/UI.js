/**
 * DOM overlay management: title screen, HUD (score/combo/multiplier), combo
 * celebrations, game-over screen, mute toggle. All text lives here so
 * tone/copy is easy to tweak.
 */

const GAMEOVER_MESSAGES = [
  { min: 0,  lines: ['強欲が仇になった。', 'ハマグリをひとつ多く盗みすぎた。', 'ハマグリは最初から餌だった。'] },
  { min: 3,  lines: ['調子に乗りすぎた。', '漁師はガチだった。', 'あと一歩なのに、網。'] },
  { min: 7,  lines: ['それで逃げ切れると思ってた?', '漁師は一日中これを待っていた。', '桟橋は強欲なアヒルを忘れない。'] },
  { min: 12, lines: ['{n}回の盗みに成功。しかし漁師は激怒していた。', '{n}個のハマグリ。罪悪感ゼロ。網、一枚。'] },
  { min: 20, lines: ['{n}回の盗み!!この伝説は語り継がれる。', '強欲の伝説、ついに網にかかる。'] },
];

export class UI {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      scoreValue: document.getElementById('score-value'),
      bestValue: document.getElementById('best-value'),
      bestComboValue: document.getElementById('best-combo-value'),
      holdPanel: document.getElementById('hold-panel'),
      multiplier: document.getElementById('multiplier'),
      roundPoints: document.getElementById('round-points'),
      holdTime: document.getElementById('hold-time'),
      hint: document.getElementById('hint'),
      comboBox: document.getElementById('combo-badge'),
      comboValue: document.getElementById('combo-value'),
      comboBurst: document.getElementById('combo-burst'),
      titleScreen: document.getElementById('title-screen'),
      titleBest: document.getElementById('title-best'),
      titleBestValue: document.getElementById('title-best-value'),
      titleBestCombo: document.getElementById('title-best-combo'),
      startBtn: document.getElementById('start-btn'),
      resultScreen: document.getElementById('result-screen'),
      resultIcon: document.getElementById('result-icon'),
      resultTitle: document.getElementById('result-title'),
      resultMessage: document.getElementById('result-message'),
      resultScore: document.getElementById('result-score'),
      resultScoreLabel: document.getElementById('result-score-label'),
      resultTime: document.getElementById('result-time'),
      resultTimeLabel: document.getElementById('result-time-label'),
      resultMult: document.getElementById('result-mult'),
      resultMultLabel: document.getElementById('result-mult-label'),
      resultBest: document.getElementById('result-best'),
      retryBtn: document.getElementById('retry-btn'),
      muteBtn: document.getElementById('mute-btn'),
      flash: document.getElementById('flash'),
      vignette: document.getElementById('vignette'),
    };

    // diffed values so per-frame updates only touch changed DOM
    this._shown = { score: -1, round: -1, best: -1, bestCombo: -1, combo: -1 };
    this._bindButtons();
  }

  _bindButtons() {
    // Buttons must not leak presses into the game canvas input.
    for (const btn of [this.el.startBtn, this.el.retryBtn, this.el.muteBtn]) {
      btn.addEventListener('pointerdown', e => e.stopPropagation());
      btn.addEventListener('pointerup', e => e.stopPropagation());
    }
  }

  showTitle(bestScore, bestCombo) {
    this.el.titleScreen.classList.remove('hidden');
    this.el.resultScreen.classList.add('hidden');
    this.el.hud.classList.add('hidden');
    if (bestScore > 0 || bestCombo > 0) {
      this.el.titleBest.classList.remove('hidden');
      this.el.titleBestValue.textContent = bestScore.toLocaleString();
      this.el.titleBestCombo.textContent = bestCombo;
    }
  }

  hideTitle() {
    this.el.titleScreen.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
  }

  /** Game-over screen — the endless run ends here. */
  showGameOver({ total, steals, runTime, best, newBestRun, newBestComboRun }) {
    this.el.resultScreen.classList.remove('hidden');
    this.el.holdPanel.classList.add('hidden');

    this.el.resultIcon.textContent = '🎣';
    this.el.resultTitle.textContent = '御用だ!';
    this.el.resultMessage.textContent = pickMessageFor(GAMEOVER_MESSAGES, steals);

    this.el.resultScore.textContent = total.toLocaleString();
    this.el.resultScoreLabel.textContent = '合計スコア';
    this.el.resultScore.classList.remove('lost');
    this.el.resultMult.textContent = steals;
    this.el.resultMultLabel.textContent = '盗んだ回数';
    this.el.resultTime.textContent = `${runTime.toFixed(1)}秒`;
    this.el.resultTimeLabel.textContent = '生存時間';

    const bestMsg = newBestRun ? 'ハイスコア更新!' : newBestComboRun ? 'コンボ記録更新!' : null;
    this.el.resultBest.classList.toggle('hidden', !bestMsg);
    if (bestMsg) this.el.resultBest.textContent = bestMsg;
    this.el.bestValue.textContent = best.toLocaleString();
  }

  hideResult() {
    this.el.resultScreen.classList.add('hidden');
  }

  showHUD() {
    this.el.hud.classList.remove('hidden');
    this.el.hint.classList.remove('gone');
  }

  fadeHint() {
    this.el.hint.classList.add('gone');
  }

  setHoldVisible(v) {
    this.el.holdPanel.classList.toggle('hidden', !v);
  }

  /** Per-frame HUD refresh (values are diffed internally). */
  updateHUD({ total, round, best, bestCombo, combo, multiplier, holdTime }) {
    const s = Math.floor(total);
    if (s !== this._shown.score) {
      this._shown.score = s;
      this.el.scoreValue.textContent = s.toLocaleString();
    }
    const r = Math.floor(round);
    if (r !== this._shown.round) {
      this._shown.round = r;
      this.el.roundPoints.textContent = `+${r.toLocaleString()}`;
    }
    if (best !== this._shown.best) {
      this._shown.best = best;
      this.el.bestValue.textContent = best.toLocaleString();
    }
    if (bestCombo !== this._shown.bestCombo) {
      this._shown.bestCombo = bestCombo;
      this.el.bestComboValue.textContent = bestCombo;
    }
    if (combo !== this._shown.combo) {
      this._shown.combo = combo;
      this.el.comboValue.textContent = combo;
    }
    this.el.multiplier.textContent = `×${multiplier.toFixed(1)}`;
    this.el.holdTime.textContent = `${holdTime.toFixed(1)}秒`;
    // multiplier pumps as it grows
    const pump = Math.min(1.18, 1 + Math.max(0, multiplier - 1) * 0.06);
    this.el.multiplier.style.transform = `scale(${pump})`;
    // HUD heats up subtly as the streak climbs
    this.el.hud.classList.toggle('heat', combo >= 5);
    this.el.hud.classList.toggle('blaze', combo >= 10);
    this.el.vignette.classList.toggle('heat', combo >= 10);
  }

  /**
   * Combo celebration: badge pops (bigger for bigger combos), a burst label
   * announces it, and milestone tiers escalate the treatment. All quick —
   * gameplay never stops.
   */
  showCombo(combo) {
    const badge = this.el.comboBox;
    badge.classList.remove('hidden', 't3', 't5', 't10', 't20', 'pop');
    const tier = combo >= 20 ? 't20' : combo >= 10 ? 't10' : combo >= 5 ? 't5' : combo >= 3 ? 't3' : null;
    if (tier) badge.classList.add(tier);
    void badge.offsetWidth; // restart animation
    badge.classList.add('pop');

    const burst = this.el.comboBurst;
    burst.textContent = `${combo}コンボ!`;
    burst.classList.remove('show', 'b3', 'b5', 'b10', 'b20');
    const btier = combo >= 20 ? 'b20' : combo >= 10 ? 'b10' : combo >= 5 ? 'b5' : combo >= 3 ? 'b3' : null;
    if (btier) burst.classList.add(btier);
    void burst.offsetWidth;
    burst.classList.add('show');
  }

  clearCombo() {
    this.el.comboBox.classList.add('hidden');
    this.el.comboBurst.classList.remove('show');
    this._shown.combo = -1;
  }

  /** Brief highlight on the total when a round banks. */
  pulseScore() {
    const el = this.el.scoreValue;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  flash() {
    const f = this.el.flash;
    f.classList.remove('pop');
    void f.offsetWidth; // restart animation
    f.classList.add('pop');
  }

  setMuteIcon(muted) {
    this.el.muteBtn.textContent = muted ? '🔇' : '🔊';
  }

  onMuteToggle(handler) {
    this.el.muteBtn.addEventListener('click', () => handler());
  }

  onStart(handler) {
    this.el.startBtn.addEventListener('click', handler);
  }

  onRetry(handler) {
    this.el.retryBtn.addEventListener('click', handler);
  }
}

function pickMessageFor(tiers, n) {
  let msg = tiers[0];
  for (const tier of tiers) {
    if (n >= tier.min) msg = tier;
  }
  const line = msg.lines[Math.floor(Math.random() * msg.lines.length)];
  return line.replace('{n}', n);
}
