import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from './config.js';
import { makeAttackSchedule, roundResetDelay, escapeFlightDuration } from '../systems/Difficulty.js';
import { SceneSetup } from '../world/SceneSetup.js';
import { Ocean } from '../world/Ocean.js';
import { Sandbar } from '../world/Sandbar.js';
import { Pier } from '../world/Pier.js';
import { Sky } from '../world/Sky.js';
import { Particles } from '../world/Particles.js';
import { Bird } from '../characters/Bird.js';
import { Clam } from '../characters/Clam.js';
import { Fisherman } from '../characters/Fisherman.js';
import { NetThrow } from '../characters/NetThrow.js';
import { Score } from '../systems/Score.js';
import { Audio } from '../systems/Audio.js';
import { Input } from '../systems/Input.js';
import { UI } from '../ui/UI.js';

/**
 * Game orchestration: asset loading, endless round loop, per-frame update.
 *
 * Phases:
 *   title → idle → grabbing → holding → escape → idle → grabbing → …
 *                                   ↓
 *                                caught → result (game over) → idle …
 *
 * Escapes bank the round into the run total, bump the combo, and flow
 * straight into the next steal — the run only ends when the net lands.
 */
export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.phase = 'title';
    this.schedule = null;
    this.time = 0;
    this.roundId = 0;          // increments per steal attempt (stale-callback guard)
    this._transitionTimer = null; // frame-driven escape → next-round countdown

    this.setup = new SceneSetup(canvas);
    this.particles = new Particles(this.setup.scene);
    this.sky = new Sky(this.setup.scene);
    this.ocean = new Ocean(this.setup.scene);
    this.sandbar = new Sandbar(this.setup.scene);
    this.pier = new Pier(this.setup.scene);
    this.score = new Score();
    this.audio = new Audio();
    this.input = new Input(canvas);
    this.ui = new UI();

    this.bird = new Bird(this.setup.scene, this.particles);
    this.clam = new Clam(this.setup.scene, this.particles);
    this.fisherman = new Fisherman(this.setup.scene, this.particles);
    this.net = null; // built after the net asset loads

    this._bindUI();
    this.ui.showTitle(this.score.best, this.score.bestCombo);
    this._loadAssets();
  }

  // ---------------------------------------------------------- loading ----

  _loadAssets() {
    const loader = new GLTFLoader();
    const base = import.meta.env.BASE_URL || '/';

    Promise.all([
      loader.loadAsync(`${base}models/bird.glb`),
      loader.loadAsync(`${base}models/clam.glb`),
      loader.loadAsync(`${base}models/net.glb`),
    ]).then(([birdGltf, clamGltf, netGltf]) => {
      this.bird.load(birdGltf.scene);
      this.clam.load(clamGltf.scene);
      this.net = new NetThrow(this.setup.scene, this.particles, netGltf.scene);
      this._layoutScene();
      this._enterIdle();
    }).catch(err => {
      console.error('Asset loading failed:', err);
    });
  }

  _layoutScene() {
    const L = CONFIG.layout;
    // Seat the bird and clam on the sand's actual surface height.
    const birdPos = new THREE.Vector3(...L.birdPosition);
    birdPos.y = Sandbar.groundAt(birdPos.x, birdPos.z) + 0.02;
    const clamPos = new THREE.Vector3(...L.clamPosition);
    clamPos.y = Sandbar.groundAt(clamPos.x, clamPos.z) + 0.02;
    this._birdHome = birdPos;
    this._clamHome = clamPos;

    this.bird.setFacing(L.birdFacingY);
    this.bird.resetTo(birdPos);
    this.clam.resetTo(clamPos);
    this.clam.root.rotation.y = Math.PI * 0.15;

    // Fisherman sits on the pier looking toward the bird.
    const fPos = new THREE.Vector3(...L.fishermanPosition);
    const yaw = Math.atan2(birdPos.x - fPos.x, birdPos.z - fPos.z);
    this.fisherman.place([fPos.x, fPos.y, fPos.z], yaw);

    this.ocean.setRippleCenter(clamPos.x, clamPos.z);
  }

  // -------------------------------------------------------------- ui ----

  _bindUI() {
    this.ui.onStart(() => this._startGame());
    this.ui.onRetry(() => this._retry());
    this.ui.onMuteToggle(() => {
      this.audio.init();
      this.audio.setMuted(!this.audio.muted);
      this.ui.setMuteIcon(this.audio.muted);
    });
    this.ui.setMuteIcon(this.audio.muted);

    this.input.onPress = () => this._onGrab();
    this.input.onRelease = () => this._onRelease();

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyR' && this.phase === 'result') this._retry();
    });
  }

  _startGame() {
    this.audio.init();
    this.audio._resume();
    this.ui.hideTitle();
    this.ui.showHUD();
    this.score.resetRun();
    this._enterIdle();
  }

  // ---------------------------------------------------- round control ----

  /** Full reset into the steal-ready state (new run or retry). */
  _enterIdle() {
    this.phase = 'idle';
    this.schedule = null;
    this._transitionTimer = null;
    this.score.resetRound();
    this.bird.setState('idle');
    this.bird.resetTo(this._birdHome || new THREE.Vector3(...CONFIG.layout.birdPosition));
    this.clam.resetTo(this._clamHome || new THREE.Vector3(...CONFIG.layout.clamPosition));
    this.clam.root.rotation.y = Math.PI * 0.15;
    this.fisherman.reset();
    if (this.net) this.net.reset();
    this.ui.setHoldVisible(false);
    this.ui.clearCombo();
    this.input.reset();
    this.input.setEnabled(true);
  }

  _onGrab() {
    if (this.phase !== 'idle') return;
    this.phase = 'grabbing';
    this.roundId += 1;
    this.bird.setState('grab');
    this.audio.grab();
    this.ui.fadeHint();
    this.ui.setHoldVisible(true);
    // Fresh randomized attack timing for THIS hold only — derived from the
    // current combo, never a repeating sequence.
    this.schedule = makeAttackSchedule(this.score.combo);
    this.score.resetRound();
    // grab completes → holding (handled in update via grabDuration)
    this._grabElapsed = 0;
  }

  _onRelease() {
    if (this.phase === 'grabbing') {
      // Released before the beak even closed — back to idle.
      this.phase = 'idle';
      this.bird.setState('idle');
      this.schedule = null;
      this.ui.setHoldVisible(false);
      return;
    }
    if (this.phase !== 'holding') return;
    this._doEscape();
  }

  _doEscape() {
    if (this.phase !== 'holding') return; // guard: bank exactly once per round
    this.phase = 'escape';
    this.bird.escapeDuration = escapeFlightDuration(this.score.combo);
    this.bird.setState('escape');
    this.clam.setState('dropped');
    this.clam.dropTo(this._clamHome.clone());
    this.audio.flap();
    this.audio.escapeSuccess();
    this.audio.splash();
    this.particles.splash(this._clamHome.clone().add(new THREE.Vector3(0, 0.2, 0)), 10, 0.8);
    this.schedule = null;
    this.ui.setHoldVisible(false);

    // fisherman reacts to the miss
    window.setTimeout(() => this.fisherman.playMiss(), 350);

    // Bank the round, bump the combo (exactly once), celebrate, loop.
    this.score.bank();
    this.audio.combo(this.score.combo);
    this.ui.showCombo(this.score.combo);
    this.ui.pulseScore();

    // Seamless transition: bird vanishes into the sky, then pops back home
    // and the next steal begins immediately (a touch faster at high combos).
    this._transitionTimer = roundResetDelay(this.score.combo);
  }

  /** Escape finished — reset the stage and start the next steal right away. */
  _beginNextRound() {
    this._transitionTimer = null;
    this.phase = 'idle';
    this.score.resetRound();
    this.bird.setState('idle');
    this.bird.resetTo(this._birdHome || new THREE.Vector3(...CONFIG.layout.birdPosition));
    this.particles.puff(this.bird.root.position.clone().add(new THREE.Vector3(0, 0.05, 0)), 5, 0.6);
    this.clam.resetTo(this._clamHome || new THREE.Vector3(...CONFIG.layout.clamPosition));
    this.clam.root.rotation.y = Math.PI * 0.15;
    this.fisherman.reset(); // idle pose again; difficulty derives from combo
    if (this.net) this.net.reset();
    this.input.reset();
    this.input.setEnabled(true);
  }

  _onNetLanded(round) {
    // Net reached the bird. If it's still this round and the bird still holds
    // the clam → caught. Otherwise the bird already flew: dramatic near miss.
    if (round === this.roundId && this.phase === 'holding') {
      this.phase = 'caught';
      this.bird.setState('caught');
      this.audio.netLand();
      this.audio.caughtJingle();
      this.setup.addShake(0.5);
      this.ui.flash();
      this.fisherman.celebrate();
      this.particles.feathers(this.bird.root.position.clone().add(new THREE.Vector3(0, 0.4, 0)), 14);
      this.particles.splash(this._birdHome.clone(), 8, 0.6);

      // the round in progress was lost — its unbanked points are gone
      this.score.resetRound();
      window.setTimeout(() => {
        this.phase = 'result';
        this.input.setEnabled(true);
        this.ui.showGameOver({
          total: this.score.total,
          steals: this.score.combo,
          runTime: this.score.runTime,
          best: this.score.best,
          newBestRun: this.score.newBestRun,
          newBestComboRun: this.score.newBestComboRun,
        });
      }, CONFIG.timing.caughtSequence * 1000);
    } else {
      // Bird already flew — dramatic near miss.
      this.audio.netLand();
      this.audio.splash();
      this.particles.puff(this.bird.root.position, 12, 1.4);
      this.fisherman.playMiss();
    }
  }

  _retry() {
    if (this.phase !== 'result') return;
    this.phase = 'resetting';
    this.ui.hideResult();
    this.score.resetRun(); // combo, totals and difficulty restart fresh
    this._enterIdle();
  }

  // ------------------------------------------------------------ loop ----

  start() {
    this._running = true;
    this.clock.start();
    const loop = () => {
      if (!this._running) return;
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, this.clock.getDelta());
      this.update(dt);
    };
    requestAnimationFrame(loop);
  }

  stop() {
    this._running = false;
  }

  update(dt) {
    this.time += dt;

    // ---- phase progression ----
    if (this.phase === 'grabbing') {
      this._grabElapsed += dt;
      if (this._grabElapsed >= CONFIG.timing.grabDuration) {
        this.phase = 'holding';
        this.bird.setState('hold');
        this.clam.attachTo();
        this.audio.shellSnap();
      }
    }

    const holding = this.phase === 'holding';
    if (holding) {
      this.score.tick(dt);
      // pearl sparkle milestone
      if (Math.floor(this.score.holdTime) !== Math.floor(this.score.holdTime - dt) && Math.floor(this.score.holdTime) % 3 === 0) {
        this.audio.pearl();
      }
    }

    // escape → next round countdown (frame-driven; no stale timers)
    if (this.phase === 'escape' && this._transitionTimer != null) {
      this._transitionTimer -= dt;
      if (this._transitionTimer <= 0) this._beginNextRound();
    }

    // ---- characters ----
    const birdPos = this.bird.root.position;
    this.fisherman.update(dt, {
      time: this.time,
      schedule: holding ? this.schedule : null,
      holdTime: holding ? this.score.holdTime : null,
      birdPos,
      onThrow: (from, to) => this._launchNet(from, to),
    });

    if (this.net) this.net.update(dt, this.time);

    this.bird.update(dt, {
      time: this.time,
      fishermanDanger: this.fisherman.dangerLevel(),
      fishermanPos: this.fisherman.root.position,
    });

    // Keep the held clam locked onto the beak: hung just under the bill tip
    // (nudged forward along the duck's facing so the tip sits between the
    // shells), with a gentle sway.
    if (holding) {
      const fwd = new THREE.Vector3(
        Math.sin(this.bird.root.rotation.y), 0, Math.cos(this.bird.root.rotation.y)
      );
      const anchor = this.bird.beakWorldPos()
        .addScaledVector(fwd, 0.13)
        .add(new THREE.Vector3(
          Math.sin(this.time * 4.1) * 0.035,
          -0.21,
          Math.cos(this.time * 3.3) * 0.025
        ));
      this.clam.root.position.lerp(anchor, Math.min(1, dt * 18));
      // The clam's gape opens toward its local +Z: turn it half a lap so it
      // faces back at the duck (plus a hair of askew for a natural grip).
      this.clam.root.rotation.y = this.bird.root.rotation.y + Math.PI + 0.08;
      this.clam.root.rotation.z = Math.sin(this.time * 2.7) * 0.1;
    }

    this.clam.update(dt, {
      time: this.time,
      onSnap: () => this.audio.shellSnap(),
    });

    // ---- environment ----
    this.ocean.update(dt);
    this.ocean.setRippleStrength(holding ? 0.5 + Math.min(1, this.score.holdTime / 6) * 0.5 : 0.0);
    this.ocean.setBobberAgitate(this.fisherman.dangerLevel());
    this.sky.update(dt);
    this.sandbar.update(dt, this.time);
    this.pier.update(dt, this.time);
    this.particles.update(dt);

    // ---- audio & camera ----
    this.audio.update(dt);
    this.audio.setDanger(this.fisherman.dangerLevel());
    this.setup.update(dt, holding || this.phase === 'grabbing');

    // ---- HUD ----
    this.ui.updateHUD({
      total: this.score.total,
      round: this.score.round,
      best: this.score.best,
      bestCombo: this.score.bestCombo,
      combo: this.score.combo,
      multiplier: this.score.multiplier,
      holdTime: this.score.holdTime,
    });

    // ---- render ----
    this.setup.renderer.render(this.setup.scene, this.setup.camera);
  }

  _launchNet(from) {
    if (!this.net) return;
    // Land the net directly over the bird AND the clam in its beak,
    // centered on the pair, rim down at the bird's feet so the mesh
    // shrouds them.
    const bird = this.bird.root.position;
    const clam = this.clam.root.position;
    const target = new THREE.Vector3(
      (bird.x + clam.x) / 2,
      bird.y + 0.08,
      (bird.z + clam.z) / 2
    );
    this.audio.netSwoosh();
    this.audio.rodTension();
    // Capture the round id: if the game moves on before the net lands, the
    // callback must not count as a catch.
    this.net.throw(from, target, () => this._onNetLanded(this.roundId));
  }

  dispose() {
    this.stop();
    this.setup.dispose();
    this.ocean.dispose();
    this.sandbar.dispose();
    this.pier.dispose();
    this.sky.dispose();
    this.particles.dispose();
    this.fisherman.dispose();
    if (this.net) this.net.dispose();
    this.audio.dispose();
  }
}
