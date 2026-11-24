import * as THREE from 'three';
import { splitMeshByGroups } from './meshUtils.js';

/**
 * The thieving seabird — the player's avatar, built from the provided duck
 * model. The model is a single rigid mesh (bill/eyes may split off as
 * separate primitives), so all expression comes from procedural body
 * motion: squash & stretch, leans, hops, jitters and wing-burst whooshes.
 *
 * States driven by Game: 'idle' | 'grab' | 'hold' | 'escape' | 'caught'
 */
export class Bird {
  constructor(scene, particles) {
    this.scene = scene;
    this.particles = particles;
    this.root = new THREE.Group();
    this.body = new THREE.Group();     // animated visual container
    this.root.add(this.body);
    scene.add(this.root);

    this.state = 'idle';
    this.holdTime = 0;
    this.glanceTimer = 0;
    this.glanceTarget = 0;
    this.hopT = 0;
    this.nextBlinkTailTwitch = 2 + Math.random() * 2;
    this.escapeDuration = 2.1;  // per-round getaway speed (endless mode)
    this._spawnT = 0;           // pop-in timer after landing back home

    // procedural targets (lerped for smoothness)
    this.lean = 0;          // forward lean when grabbing/holding
    this.crouch = 0;        // squash amount
    this.yawOffset = 0;     // nervous glances
    this.escapeData = null;
  }

  /** Build from the loaded GLTF scene. */
  load(gltfScene) {
    const model = gltfScene.clone(true);
    model.traverse(m => {
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });

    // This duck is a single merged mesh: its bill shares a primitive with
    // its feet, so the bill cannot rotate on its own. Instead we compute a
    // beak-tip anchor from the bill vertices so the clam can hang there.
    let meshes = [];
    model.traverse(m => {
      if (m.isMesh) meshes.push(...splitMeshByGroups(m));
    });

    // Normalize: feet at y=0, centered in x/z. This model faces +Z.
    const bbox = new THREE.Box3().setFromObject(model);
    const centerZ = (bbox.min.z + bbox.max.z) / 2;
    const centerX = (bbox.min.x + bbox.max.x) / 2;

    this.bodyGroup = new THREE.Group();
    this.modelScale = 0.42;

    // Identify parts by bounding box in model space.
    const parts = [];
    for (const m of meshes) {
      const b = new THREE.Box3().setFromObject(m);
      const size = new THREE.Vector3();
      b.getSize(size);
      parts.push({ mesh: m, size, center: new THREE.Vector3() });
      b.getCenter(parts[parts.length - 1].center);
    }
    // The bill shares a primitive with the feet (same material). Find the
    // active part by most-positive Z center, then locate bill vertices high
    // up in that part.
    let billPart = parts[0];
    for (const p of parts) if (p.center.z > billPart.center.z) billPart = p;

    for (const p of parts) {
      const m = p.mesh;
      // Remove model origin: recenter around x/z center, feet at y=0.
      m.position.sub(new THREE.Vector3(centerX, bbox.min.y, centerZ));
      this.bodyGroup.add(m);
    }

    // Beak tip in model units: highest-Z vertex among the bill part's upper
    // vertices (feet are far below and near the body center).
    const attr = billPart.mesh.geometry.attributes.position;
    const mPos = billPart.mesh.position;
    let bestZ = -Infinity;
    const best = new THREE.Vector3();
    for (let i = 0; i < attr.count; i++) {
      const y = attr.getY(i);
      const z = attr.getZ(i);
      if (y > 1.6 && z > bestZ) {
        bestZ = z;
        best.set(attr.getX(i), y, z);
      }
    }
    if (bestZ === -Infinity) {
      // fallback: front-top of the whole model
      best.set(0, 2.2, bbox.max.z);
    }
    // Convert to bodyGroup space (mesh offset + recentre), nudged to the
    // very tip and slightly below so the clam dangles from the bill.
    this.beakLocal = new THREE.Vector3(
      best.x + mPos.x,
      best.y + mPos.y - 0.12,
      best.z + mPos.z + 0.25
    );

    this.body.add(this.bodyGroup);

    // Stylize: freshen up the materials for the soft-cartoon look.
    this.bodyGroup.traverse(m => {
      if (m.isMesh && m.material) {
        const mat = m.material.clone();
        mat.roughness = Math.max(0.55, mat.roughness ?? 0.8);
        mat.metalness = 0;
        m.material = mat;
      }
    });

    this.bodyGroup.scale.setScalar(this.modelScale);
    return this;
  }

  setFacing(radY) {
    this.baseRotY = radY;
    this.root.rotation.y = radY;
  }

  setState(s) {
    this.state = s;
    this.holdTime = 0;
    if (s === 'escape') this._beginEscape();
    if (s === 'grab') this._beginGrab();
  }

  _beginGrab() {
    this.grabT = 0;
    this.particles.puff(this.root.position, 4, 0.5);
  }

  _beginEscape() {
    const start = this.root.position.clone();
    this.escapeData = {
      t: 0,
      dur: this.escapeDuration,
      start,
      // Fly up and away from the fisherman (world +X), with an arc.
      ctrl: new THREE.Vector3(start.x + 1.6, start.y + 2.6, start.z + 0.8),
      end: new THREE.Vector3(start.x + 8.5, start.y + 5.2, start.z + 1.4),
    };
    this.particles.feathers(this.root.position, 8);
  }

  /**
   * @param dt      delta time
   * @param ctx     { time, fishermanDanger (0..1), fishermanPos }
   */
  update(dt, ctx) {
    if (!this.bodyGroup) return; // model not loaded yet
    const t = ctx.time;
    this.holdTime += dt;

    // ------- targets per state -------
    let targetLean = 0, targetCrouch = 0, targetYaw = 0;
    let bobSpeed = 2.0, bobAmp = 0.032;

    switch (this.state) {
      case 'idle': {
        // Look toward the clam, occasional curious tilt.
        this.nextBlinkTailTwitch -= dt;
        if (this.nextBlinkTailTwitch <= 0) {
          this.nextBlinkTailTwitch = 1.8 + Math.random() * 2.6;
          this._tiltImpulse = 0.14 + Math.random() * 0.1;
        }
        if (this._tiltImpulse) {
          this._tiltImpulse *= Math.exp(-3 * dt);
          targetYaw = this._tiltImpulse * Math.sin(t * 6);
        }
        break;
      }
      case 'grab': {
        this.grabT = (this.grabT ?? 0) + dt;
        const k = Math.min(1, this.grabT / 0.38);
        targetLean = Math.sin(k * Math.PI * 0.5) * 0.55;
        targetCrouch = k * 0.18;
        break;
      }
      case 'hold': {
        targetLean = 0.34;
        targetCrouch = 0.1;
        bobSpeed = 4.2; bobAmp = 0.02;
        // Nervous: quick glances toward the fisherman, more often as danger rises.
        this.glanceTimer -= dt;
        if (this.glanceTimer <= 0) {
          const danger = ctx.fishermanDanger ?? 0;
          this.glanceTimer = 0.9 + Math.random() * 2.2 - danger * 0.6;
          this.glanceTarget = (Math.random() < 0.6 ? -1 : 1) * (0.25 + Math.random() * 0.35);
          if (Math.random() < 0.5 + danger * 0.3 && ctx.fishermanPos) {
            // actually aim a glance at the fisherman (+Z facing convention)
            const dx = ctx.fishermanPos.x - this.root.position.x;
            const dz = ctx.fishermanPos.z - this.root.position.z;
            const worldAng = Math.atan2(dx, dz);
            this.glanceTarget = worldAng - this.baseRotY;
            // wrap to shortest
            while (this.glanceTarget > Math.PI) this.glanceTarget -= Math.PI * 2;
            while (this.glanceTarget < -Math.PI) this.glanceTarget += Math.PI * 2;
            this.glanceTarget = THREE.MathUtils.clamp(this.glanceTarget, -0.7, 0.7);
          }
        }
        this.glanceTarget *= Math.exp(-2.6 * dt); // glances decay back
        targetYaw += this.glanceTarget;
        // clam struggles shake the bird slightly at higher times
        const struggle = Math.min(1, this.holdTime / 8);
        targetYaw += Math.sin(t * 23 * (1 + struggle)) * 0.02 * struggle;
        break;
      }
      case 'escape': {
        this._updateEscape(dt);
        return; // escape handles its own transforms
      }
      case 'caught': {
        // Frantic wiggle inside the net.
        this.body.rotation.z = Math.sin(t * 26) * 0.12 * Math.exp(-this.holdTime * 0.7);
        this.body.rotation.x = Math.cos(t * 21) * 0.08 * Math.exp(-this.holdTime * 0.7);
        this.body.position.y = Math.sin(t * 30) * 0.02 * Math.exp(-this.holdTime);
        this.root.rotation.y = this.baseRotY + Math.sin(t * 8) * 0.2 * Math.exp(-this.holdTime * 0.5);
        return;
      }
    }

    // ------- smooth procedural blend -------
    const lerpK = Math.min(1, dt * 8);
    this.lean += (targetLean - this.lean) * lerpK;
    this.crouch += (targetCrouch - this.crouch) * lerpK;
    this.yawOffset += (targetYaw - this.yawOffset) * Math.min(1, dt * 10);

    const bob = Math.sin(t * bobSpeed) * bobAmp;
    const breathing = Math.sin(t * bobSpeed * 0.5) * 0.5 + 0.5;

    this.body.position.y = bob;
    // This model faces +Z: pitching the bill downward = positive X rotation.
    this.body.rotation.x = this.lean * 0.7 + Math.sin(t * 1.7) * 0.02 + this.lean * 0.08;
    this.body.rotation.z = Math.sin(t * 1.3) * 0.02; // gentle roll
    this.root.rotation.y = this.baseRotY + this.yawOffset;

    // squash & stretch: crouch flattens, breathing rounds
    const sx = 1 + this.crouch * 0.14 + (1 - breathing) * 0.015;
    const sy = 1 - this.crouch * 0.2 + breathing * 0.02;
    const sz = 1 + this.crouch * 0.14 + (1 - breathing) * 0.015;
    const s = this.modelScale;
    // pop-in after a round transition (ease-out overshoot feel)
    let spawn = 1;
    if (this._spawnT > 0) {
      this._spawnT = Math.max(0, this._spawnT - dt);
      const k = 1 - this._spawnT / 0.25;
      spawn = 0.15 + 0.85 * (1 - (1 - k) * (1 - k));
    }
    this.bodyGroup.scale.set(s * sx * spawn, s * sy * spawn, s * sz * spawn);
  }

  _updateEscape(dt) {
    const e = this.escapeData;
    e.t += dt;
    const dur = e.dur ?? 2.1;
    const k = Math.min(1, e.t / dur);
    // Quadratic bezier with ease-in (bird hesitates then bolts).
    const ek = k * k * (3 - 2 * k) * k;
    const p = new THREE.Vector3()
      .addScaledVector(e.start, (1 - ek) * (1 - ek))
      .addScaledVector(e.ctrl, 2 * (1 - ek) * ek)
      .addScaledVector(e.end, ek * ek);
    this.root.position.copy(p);

    // Shrink into the distance during the fastest stretch of the flight, so
    // the round transition can whisk the bird home without a visible teleport.
    const away = THREE.MathUtils.clamp((e.t - dur * 0.42) / (dur * 0.26), 0, 1);
    const shrink = 1 - away * away;
    if (away >= 1 && !e.gone) {
      e.gone = true;
      this.particles.puff(this.root.position.clone().add(new THREE.Vector3(0, 0.2, 0)), 4, 0.5);
    }

    // Flap frenzy: violent squash-stretch oscillation reads as wingbeats.
    const flap = Math.sin(e.t * 34) * (1 - k * 0.5);
    this.body.rotation.x = -0.5 - flap * 0.25;      // pitched upward
    const s = this.modelScale;
    this.bodyGroup.scale.set(
      s * (1 + flap * 0.13) * shrink,
      s * (1 - flap * 0.13) * shrink,
      s * shrink
    );
    this.root.rotation.y = this.baseRotY + k * 0.9; // banks away
    this.root.rotation.z = Math.sin(e.t * 10) * 0.06;

    // Whoosh puffs at the start.
    if (e.t < 0.5 && Math.random() < dt * 30) {
      this.particles.foam(this.root.position.clone().add(new THREE.Vector3(0, -0.2, 0)), 1, 0.6);
    }
    // Sand puff at takeoff.
    if (e.t < 0.12 && !e.puffed) {
      e.puffed = true;
      this.particles.puff(e.start, 10, 1.2);
    }
  }

  /** Instantly place the bird (used on round reset, with a little entrance). */
  resetTo(pos) {
    this.root.position.copy(pos);
    this.root.rotation.set(0, this.baseRotY, 0);
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
    this.state = 'idle';
    this.escapeData = null;
    this.lean = 0;
    this.crouch = 0;
    this.yawOffset = 0;
    this._spawnT = 0.25; // pop-in: reads as the bird touching back down
  }

  /** World position of the beak tip (grab anchor). */
  beakWorldPos() {
    if (!this.bodyGroup) return this.root.position.clone();
    // beakLocal is in bodyGroup (model) space; localToWorld includes the
    // bob, lean and squash applied above.
    this.bodyGroup.updateWorldMatrix(true, false);
    return this.bodyGroup.localToWorld(this.beakLocal.clone());
  }
}
