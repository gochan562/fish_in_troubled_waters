/**
 * Unified press-and-hold input: mouse, touch and spacebar.
 * Consumers get onPress/onRelease callbacks; UI buttons are ignored.
 */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = false;
    this.onPress = null;
    this.onRelease = null;
    this._enabled = true;

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      this._press(e);
    });
    window.addEventListener('pointerup', () => this._release());
    window.addEventListener('pointercancel', () => this._release());
    window.addEventListener('blur', () => this._release());
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        this._press(e);
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this._release();
    });
  }

  setEnabled(v) {
    this._enabled = v;
    if (!v) this.held = false;
  }

  /** Clear any stuck press state (safe between rounds). */
  reset() {
    this.held = false;
  }

  _press(e) {
    if (!this._enabled) return;
    // Only pointer events need the target check (UI buttons never bubble
    // into the canvas, but be safe); keyboard presses have no element target.
    if (e && e.type === 'pointerdown' && e.target !== this.canvas) return;
    if (this.held) return;
    this.held = true;
    if (this.onPress) this.onPress();
  }

  _release() {
    if (!this.held) return;
    this.held = false;
    if (this.onRelease) this.onRelease();
  }
}
