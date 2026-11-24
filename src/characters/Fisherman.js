import * as THREE from 'three';
import { CONFIG } from '../core/config.js';

/**
 * The fisherman — built entirely from Three.js primitives. He sits on the
 * pier, rod in hand, folded net on his lap, and gives the player a chain of
 * subtle, learnable warning cues before hurling the net:
 *
 *   RELAXED → SUSPICIOUS → PREPARING → (stillness) → ATTACK
 *
 * All timings come from a schedule supplied by Game (randomized per hold).
 */
export class Fisherman {
  constructor(scene, particles) {
    this.scene = scene;
    this.particles = particles;
    this.root = new THREE.Group();

    this.phase = 'RELAXED';           // RELAXED | SUSPICIOUS | PREPARING | ATTACK | RESET
    this.stillness = 0;               // 0..1 — creepy frozen intensity
    this.throwT = -1;                 // active throw timeline, -1 = idle
    this.thrown = false;
    this.grumpy = 0;                  // head-shake after a miss

    this._headYaw = 0;
    this._headYawTarget = 0;
    this._headPitch = 0;
    this._wanderTimer = 2;
    this._tapTimer = 0;
    this._breath = 0;

    // Per-round behaviour (fed by the attack schedule each hold):
    this._intensity = 1;      // animation energy (hunch/tremble/taps)
    this._throwSpeed = 1;     // windup/whip tempo
    this._pattern = 0;        // 0..3 animation variant seed
    this._feign = false;      // feigns disinterest during long SUSPICIOUS waits
    this._feignTimer = 0;
    this._feignWatch = true;
    this._celebrateT = 0;     // gleeful bounce after a catch

    this._build();
    scene.add(this.root);
  }

  // ------------------------------------------------------------- build ----

  _mat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts });
  }

  _build() {
    const SKIN = '#eeb68a';
    const SWEATER = '#3d5a75';
    const SWEATER_DARK = '#324a61';
    const BOOT = '#4c3a2b';
    const HAT = '#d9a441';
    const BEARD = '#efece3';

    const M = {
      skin: this._mat(SKIN),
      sweater: this._mat(SWEATER),
      sweaterDark: this._mat(SWEATER_DARK),
      boot: this._mat(BOOT, { roughness: 0.6 }),
      hat: this._mat(HAT, { roughness: 0.9 }),
      beard: this._mat(BEARD, { roughness: 1 }),
      wood: this._mat('#8a6d4c'),
      eye: this._mat('#26333c', { roughness: 0.4 }),
      rod: this._mat('#7a4b2e', { roughness: 0.5 }),
      net: this._mat('#cdd3c6', { roughness: 0.9 }),
      metal: this._mat('#9aa5aa', { roughness: 0.35, metalness: 0.7 }),
    };
    this.M = M;

    const castAll = (g) => g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });

    // ---- crate he sits on ----
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.55, 0.78), this._mat('#97795a'));
    crate.position.y = 0.275;
    const crateEdge = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.08, 0.82), this._mat('#84684a'));
    crateEdge.position.y = 0.51;
    this.root.add(crate, crateEdge);

    // ---- hips/torso ----
    this.torso = new THREE.Group();
    this.torso.position.y = 0.62; // hip height on the crate
    this.root.add(this.torso);

    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), M.sweater);
    belly.scale.set(1.05, 1.15, 0.9);
    belly.position.y = 0.18;
    this.torso.add(belly);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), M.sweater);
    chest.scale.set(1.0, 0.9, 0.85);
    chest.position.y = 0.52;
    this.torso.add(chest);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.055, 8, 16), M.sweaterDark);
    collar.position.y = 0.74;
    collar.rotation.x = Math.PI / 2;
    this.torso.add(collar);
    this.breathTarget = chest; // scaled when breathing

    // ---- head ----
    this.headGroup = new THREE.Group();
    this.headGroup.position.y = 0.98;
    this.torso.add(this.headGroup);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 14), M.skin);
    head.scale.set(1, 1.05, 0.95);
    this.headGroup.add(head);

    // beard — a squashed sphere hugging the lower face
    const beard = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), M.beard);
    beard.scale.set(1.05, 0.8, 0.9);
    beard.position.set(0, -0.11, 0.07);
    this.headGroup.add(beard);
    // mustache — two little slabs
    for (const s of [-1, 1]) {
      const mus = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.035, 0.06), M.beard);
      mus.position.set(s * 0.055, -0.02, 0.235);
      mus.rotation.z = s * -0.35;
      this.headGroup.add(mus);
    }
    // nose
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), M.skin);
    nose.position.set(0, 0.02, 0.25);
    nose.scale.set(1, 1.2, 1.3);
    this.headGroup.add(nose);
    // eyes + bushy brows
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), M.eye);
      eye.position.set(s * 0.095, 0.06, 0.225);
      this.headGroup.add(eye);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.03), M.beard);
      brow.position.set(s * 0.095, 0.115, 0.22);
      brow.rotation.z = s * 0.25;
      this.headGroup.add(brow);
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), M.skin);
      ear.position.set(s * 0.25, 0.0, 0);
      ear.scale.set(0.6, 1, 0.8);
      this.headGroup.add(ear);
    }
    // sou'wester hat — wide brim + tall dome
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.05, 18), M.hat);
    brim.position.y = 0.17;
    brim.scale.z = 1.15;
    this.headGroup.add(brim);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.hat);
    dome.position.y = 0.17;
    dome.scale.set(1.05, 1.25, 1.2);
    this.headGroup.add(dome);
    const hatBand = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.29, 0.06, 16), this._mat('#b3822e'));
    hatBand.position.y = 0.2;
    this.headGroup.add(hatBand);

    // ---- legs & boots (planted, feet forward) ----
    this.legs = new THREE.Group();
    this.torso.add(this.legs);
    for (const s of [-1, 1]) {
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.5, 10), M.sweaterDark);
      thigh.position.set(s * 0.17, -0.28, 0.12);
      thigh.rotation.x = Math.PI / 2 - 0.35;
      this.legs.add(thigh);
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.3, 8), M.sweaterDark);
      shin.position.set(s * 0.17, -0.5, 0.3);
      shin.rotation.x = 0.5;
      this.legs.add(shin);
      const boot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), M.boot);
      boot.scale.set(0.9, 0.65, 1.5);
      boot.position.set(s * 0.17, -0.6, 0.42);
      this.legs.add(boot);
      if (s === -1) this.bootTap = boot;
    }

    // ---- arms ----
    // Right arm (screen-left when facing +Z) — holds the rod.
    this.armR = new THREE.Group();
    this.armR.position.set(-0.33, 0.6, 0.05);
    this.torso.add(this.armR);
    const upperR = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.34, 10), M.sweater);
    upperR.position.y = -0.17;
    this.armR.add(upperR);
    const foreR = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.3, 10), M.skin);
    foreR.position.y = -0.46;
    this.armR.add(foreR);
    this.handR = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), M.skin);
    this.handR.position.y = -0.63;
    this.handR.scale.set(1, 1.15, 1);
    this.armR.add(this.handR);
    this.armR.rotation.x = -0.9; // resting forward on knee

    // Rod in right hand.
    this.rod = new THREE.Group();
    this.rod.position.y = -0.6;
    const rodShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.03, 1.65, 8), M.rod);
    rodShaft.position.y = 0.55;
    rodShaft.rotation.x = 0.0;
    this.rod.add(rodShaft);
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10), M.metal);
    reel.rotation.z = Math.PI / 2;
    reel.position.set(0, 0.28, 0.05);
    this.rod.add(reel);
    this.rod.rotation.x = 1.92; // cumulative with arm angle: tip up & out over the water
    this.rod.rotation.z = -0.15;
    this.handR.add(this.rod);
    // rod tip anchor for the line
    this.rodTip = new THREE.Object3D();
    this.rodTip.position.y = 1.38;
    this.rod.add(this.rodTip);

    // Left arm — rests on lap, cradling the folded net.
    this.armL = new THREE.Group();
    this.armL.position.set(0.33, 0.6, 0.05);
    this.torso.add(this.armL);
    const upperL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.34, 10), M.sweater);
    upperL.position.y = -0.17;
    this.armL.add(upperL);
    const foreL = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.3, 10), M.skin);
    foreL.position.y = -0.46;
    this.armL.add(foreL);
    this.handL = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), M.skin);
    this.handL.position.y = -0.63;
    this.handL.scale.set(1, 1.15, 1);
    this.armL.add(this.handL);
    this.armL.rotation.x = -1.1;
    this.armL.rotation.z = -0.5; // reaching across the lap

    // Folded net bundle in the left hand — harmless-looking foreshadowing.
    this.netBundle = new THREE.Group();
    const bundle = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), M.net);
    bundle.scale.set(1, 0.8, 1.35);
    this.netBundle.add(bundle);
    // Rope wraps make it read as bundled netting rather than a plain blob.
    const ropeMat = this._mat('#848b80', { roughness: 0.95 });
    for (const z of [-0.075, 0.075]) {
      const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.113, 0.011, 5, 16), ropeMat);
      wrap.position.z = z;
      wrap.scale.y = 0.82;
      this.netBundle.add(wrap);
    }
    const longWrap = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.011, 5, 18), ropeMat);
    longWrap.rotation.x = Math.PI / 2;
    longWrap.scale.y = 1.35;
    this.netBundle.add(longWrap);
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.017, 6, 10), ropeMat);
    tie.rotation.x = Math.PI / 2;
    tie.position.y = 0.075;
    this.netBundle.add(tie);
    this.netBundle.position.set(0.02, -0.66, 0.12);
    this.armL.add(this.netBundle);

    castAll(this.root);

    // ---- fishing line (dynamic, rod tip → bobber) ----
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.lineMat = new THREE.LineBasicMaterial({ color: '#e8ecef', transparent: true, opacity: 0.65 });
    this.line = new THREE.Line(lineGeo, this.lineMat);
    this.scene.add(this.line);

    // ---- bobber ----
    this.bobber = new THREE.Group();
    const bobTop = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), this._mat('#e05545'));
    bobTop.position.y = 0.02;
    const bobBottom = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), this._mat('#f3ede2'));
    bobBottom.position.y = -0.04;
    bobBottom.scale.y = 0.6;
    this.bobber.add(bobTop, bobBottom);
    this.bobber.traverse(m => { if (m.isMesh) m.castShadow = true; });
    this.bobber.position.set(CONFIG.layout.bobberPosition[0], 0.02, CONFIG.layout.bobberPosition[2]);
    this.scene.add(this.bobber);
  }

  // -------------------------------------------------------- placement ----

  place(pos, yaw) {
    this.root.position.set(...pos);
    this.root.rotation.y = yaw;
  }

  // ------------------------------------------------------------ update ----

  /**
   * @param dt delta seconds
   * @param ctx { time, schedule: null | {suspiciousAt, preparingAt, attackAt},
   *              holdTime: seconds held (null when not holding),
   *              birdPos: THREE.Vector3,
   *              onThrow: (handWorldPos, targetPos) => void,
   *              onMiss: () => void }
   */
  update(dt, ctx) {
    const { time } = ctx;
    this._breath += dt;

    // ------- per-round behaviour from the attack schedule -------
    if (ctx.schedule) {
      this._intensity = ctx.schedule.intensity ?? 1;
      this._throwSpeed = ctx.schedule.throwSpeed ?? 1;
      this._pattern = ctx.schedule.pattern ?? 0;
      this._feign = !!ctx.schedule.feign;
    }

    // ------- phase selection from the hold schedule -------
    if (ctx.schedule && ctx.holdTime != null) {
      const h = ctx.holdTime;
      if (h >= ctx.schedule.attackAt) this._setPhase('ATTACK');
      else if (h >= ctx.schedule.preparingAt) this._setPhase('PREPARING');
      else if (h >= ctx.schedule.suspiciousAt) this._setPhase('SUSPICIOUS');
      else this._setPhase('RELAXED');
    } else {
      this._setPhase(this.throwT >= 0 && !this.thrown ? 'ATTACK' : 'RELAXED');
    }

    // Stillness ramps in at the tail of PREPARING (the key tell).
    if (this.phase === 'PREPARING' && ctx.schedule && ctx.holdTime != null) {
      const remain = ctx.schedule.attackAt - ctx.holdTime;
      const stillWindow = ctx.schedule.stillnessBefore ?? CONFIG.attack.stillnessBefore;
      this.stillness = THREE.MathUtils.clamp(1 - remain / stillWindow, 0, 1);
    } else {
      this.stillness = Math.max(0, this.stillness - dt * 2.5);
    }

    // ------- throw timeline -------
    if (this.throwT >= 0) {
      this.throwT += dt * this._throwSpeed;
      const T = this.throwT;
      // windup 0→0.14, whip 0.14→0.26, release at 0.26, follow-through →0.5
      if (T < 0.14) {
        const k = T / 0.14;
        this.armL.rotation.x = -1.1 - k * 1.3;
        this.armL.rotation.z = -0.5 - k * 0.7;
        this.torso.rotation.y = k * 0.45;
        this.torso.rotation.x = k * 0.12;
      } else if (T < 0.26) {
        const k = (T - 0.14) / 0.12;
        this.armL.rotation.x = -2.4 + k * 3.6;
        this.armL.rotation.z = -1.2 + k * 1.6;
        this.torso.rotation.y = 0.45 - k * 0.95;
        this.torso.rotation.x = 0.12 - k * 0.3;
        if (!this.thrown && k > 0.55) {
          this.thrown = true;
          this.netBundle.visible = false;
          const handPos = new THREE.Vector3();
          this.handL.getWorldPosition(handPos);
          ctx.onThrow(handPos, ctx.birdPos.clone());
          this.particles.foam(handPos, 3, 0.5);
        }
      } else if (T < 0.6) {
        const k = (T - 0.26) / 0.34;
        this.armL.rotation.x = 1.2 - k * 0.8;
        this.torso.rotation.y = -0.5 + k * 0.2;
      }
      // stay in pose until reset
    } else {
      // ------- idle behaviour per phase -------
      this._idleAnim(dt, ctx);
    }

    // gleeful bounce after finally catching the thief
    if (this._celebrateT > 0) {
      this._celebrateT -= dt;
      const k = Math.max(0, Math.min(1, this._celebrateT / 2.4));
      this.torso.position.y = 0.62 + Math.abs(Math.sin(time * 9)) * 0.09 * k;
      this.headGroup.rotation.z = Math.sin(time * 14) * 0.14 * k;
      this.rod.rotation.x += (2.4 - this.rod.rotation.x) * Math.min(1, dt * 5);
    } else if (this.grumpy > 0) {
      // grumpy head shake after a miss
      this.grumpy -= dt;
      this.headGroup.rotation.z = Math.sin(time * 18) * 0.12 * Math.min(1, this.grumpy * 2);
    } else {
      this.headGroup.rotation.z *= Math.exp(-8 * dt);
    }

    this._updateLineAndBobber(dt, ctx);
  }

  _setPhase(p) {
    if (this.phase === p) return;
    this.phase = p;
    if (p === 'ATTACK' && this.throwT < 0) {
      this.throwT = 0;
      this.thrown = false;
    }
  }

  _idleAnim(dt, ctx) {
    const { time } = ctx;
    const danger = this.dangerLevel();

    // ---- breathing (fades out as he goes still) ----
    const breathAmp = (1 - this.stillness) * 0.028;
    this.breathTarget.scale.y = 0.9 + Math.sin(this._breath * 2.1) * breathAmp;
    this.torso.position.y = 0.62 + Math.sin(this._breath * 2.1) * breathAmp * 0.4;

    // ---- head: wander when relaxed, lock onto bird when suspicious+ ----
    // Long-wait rounds may feign disinterest: he glances away in bursts, then
    // snaps back onto the bird (always locked during PREPARING — the real tell).
    const watching = this.phase === 'SUSPICIOUS' || this.phase === 'PREPARING';
    let lockOn = watching;
    if (this._feign && this.phase === 'SUSPICIOUS') {
      this._feignTimer -= dt;
      if (this._feignTimer <= 0) {
        this._feignWatch = !this._feignWatch;
        this._feignTimer = this._feignWatch ? 1.0 + Math.random() * 0.9 : 1.3 + Math.random() * 1.4;
      }
      lockOn = this._feignWatch;
    }
    if (lockOn && ctx.birdPos) {
      const dx = ctx.birdPos.x - this.root.position.x;
      const dz = ctx.birdPos.z - this.root.position.z;
      const worldAng = Math.atan2(dx, dz);
      let local = worldAng - this.root.rotation.y;
      while (local > Math.PI) local -= Math.PI * 2;
      while (local < -Math.PI) local += Math.PI * 2;
      this._headYawTarget = THREE.MathUtils.clamp(local, -1.2, 1.2) * 0.75;
      this._headPitch = -0.12 - this.stillness * 0.1;
    } else {
      this._wanderTimer -= dt;
      if (this._wanderTimer <= 0) {
        this._wanderTimer = 2.5 + Math.random() * 3.5;
        this._headYawTarget = (Math.random() - 0.5) * 0.7;
      }
      this._headPitch = Math.sin(this._breath * 0.6) * 0.05;
    }
    const headK = Math.min(1, dt * (watching ? 4.5 : 2));
    this._headYaw += (this._headYawTarget - this._headYaw) * headK;
    // sharp little double-takes on some rounds (varied warning flavour)
    const twitch = watching && this._pattern % 2 === 1
      ? Math.pow(Math.max(0, Math.sin(time * 8.7)), 8) * 0.12 * this._intensity * (this._pattern === 1 ? 1 : -1)
      : 0;
    this.headGroup.rotation.y = this._headYaw + twitch;
    this.headGroup.rotation.x = this._headPitch + Math.sin(this._breath * 1.3) * 0.02 * (1 - this.stillness);

    // ---- posture: hunch slightly forward as suspicion grows ----
    const hunch = (this.phase === 'PREPARING' ? 0.22 : this.phase === 'SUSPICIOUS' ? 0.1 : 0) * this._intensity;
    this.torso.rotation.x += (hunch - this.torso.rotation.x) * Math.min(1, dt * 3);
    this.torso.rotation.y *= Math.exp(-4 * dt);

    // ---- rod: idle drift; lifts + trembles while preparing ----
    const rodLift = this.phase === 'PREPARING' ? 0.55 : 0;
    this.rod.rotation.x += ((1.92 + rodLift * 0.45) - this.rod.rotation.x) * Math.min(1, dt * 3.5);
    const tremble = this.phase === 'PREPARING' ? (1 - this.stillness) * 0.02 * this._intensity : 0;
    this.rod.rotation.z = -0.15 + Math.sin(time * (13 + this._pattern * 4)) * tremble;
    this.armR.rotation.x += ((-0.9 - rodLift * 0.5) - this.armR.rotation.x) * Math.min(1, dt * 3.5);

    // ---- arm/fidget details ----
    // relaxed: occasional rod tap / adjustment
    if (this.phase === 'RELAXED') {
      const fidget = Math.sin(time * 0.7) > 0.96 ? Math.sin(time * 20) * 0.06 : 0;
      this.armR.rotation.z = fidget;
    } else {
      this.armR.rotation.z *= Math.exp(-5 * dt);
    }

    // suspicious: boot tap + hand drums on knee
    if (this.phase === 'SUSPICIOUS') {
      this._tapTimer += dt * this._intensity * (1 + this._pattern * 0.35);
      this.bootTap.position.y = -0.6 + Math.abs(Math.sin(this._tapTimer * 7)) * 0.05;
      this.armL.rotation.x = -1.1 + Math.sin(this._tapTimer * 7) * 0.06;
    } else if (this.throwT < 0) {
      this.bootTap.position.y += (-0.6 - this.bootTap.position.y) * Math.min(1, dt * 6);
      this.armL.rotation.x += (-1.1 - this.armL.rotation.x) * Math.min(1, dt * 4);
      this.armL.rotation.z += (-0.5 - this.armL.rotation.z) * Math.min(1, dt * 4);
    }

    // ---- net bundle: idle squeeze while suspicious (tells the story) ----
    if (this.netBundle.visible) {
      const squeeze = this.phase === 'SUSPICIOUS' || this.phase === 'PREPARING'
        ? 1 + Math.sin(time * (9 + this._pattern * 3)) * 0.05 * this._intensity
        : 1;
      this.netBundle.scale.setScalar(squeeze);
    }
  }

  /** 0 = harmless, 1 = about to throw. Drives ambience/other characters. */
  dangerLevel() {
    switch (this.phase) {
      case 'SUSPICIOUS': return 0.35;
      case 'PREPARING': return 0.55 + this.stillness * 0.45;
      case 'ATTACK': return 1;
      default: return 0;
    }
  }

  _updateLineAndBobber(dt, ctx) {
    const time = ctx.time;
    const tip = new THREE.Vector3();
    this.rodTip.getWorldPosition(tip);

    const agit = this.dangerLevel();
    // Bobber: gentle bob normally; twitches upward & jitters when tense.
    const bobY = 0.02 + Math.sin(time * 1.7) * 0.05 + Math.sin(time * 3.3) * 0.02;
    const lift = agit * 0.25;
    const jitter = agit > 0.5 ? (Math.random() - 0.5) * agit * 0.05 : 0;
    this.bobber.position.x += (CONFIG.layout.bobberPosition[0] + jitter - this.bobber.position.x) * Math.min(1, dt * 8);
    this.bobber.position.y += (Math.max(0.0, bobY + lift) - this.bobber.position.y) * Math.min(1, dt * 6);

    const pts = this.line.geometry.attributes.position;
    pts.setXYZ(0, tip.x, tip.y, tip.z);
    pts.setXYZ(1, this.bobber.position.x, this.bobber.position.y, this.bobber.position.z);
    pts.needsUpdate = true;
    this.lineMat.opacity = 0.4 + agit * 0.4;
  }

  /** Called when the round resets: bundle returns, pose relaxes. */
  reset() {
    this.throwT = -1;
    this.thrown = false;
    this.grumpy = 0;
    this.stillness = 0;
    this.phase = 'RELAXED';
    this._intensity = 1;
    this._throwSpeed = 1;
    this._pattern = 0;
    this._feign = false;
    this._feignTimer = 0;
    this._feignWatch = true;
    this._celebrateT = 0;
    this.netBundle.visible = true;
    this.armL.rotation.set(-1.1, 0, -0.5);
    this.armR.rotation.set(-0.9, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    this.headGroup.rotation.set(0, 0, 0);
    this.rod.rotation.set(1.92, 0, -0.15);
  }

  /** Play a disappointed slump (net missed). */
  playMiss() {
    this.grumpy = 1.6;
  }

  /** Gleeful bounce — he finally caught the thief. */
  celebrate() {
    this._celebrateT = 2.4;
  }

  dispose() {
    this.scene.remove(this.line, this.bobber);
    this.line.geometry.dispose();
    this.lineMat.dispose();
    this.root.traverse(m => {
      if (m.geometry) m.geometry.dispose();
      if (m.material) m.material.dispose();
    });
  }
}
