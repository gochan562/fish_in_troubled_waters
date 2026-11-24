import * as THREE from 'three';
import { splitGeometryByYPlane } from './meshUtils.js';

/**
 * The coveted clam. The source model is one merged mesh; its geometry is
 * split into top/bottom shell halves along the Y plane and re-parented so
 * the top shell can hinge open. A procedural "meat" blob and a shiny pearl
 * live inside for when the shell parts.
 *
 * States: 'idle' | 'held' | 'dropped' (brief recover) — 'stolen' while away.
 */
export class Clam {
  constructor(scene, particles) {
    this.scene = scene;
    this.particles = particles;
    this.root = new THREE.Group();
    // Yaw must compose before pitch: with 'YXZ', rotation.x tips the gape up
    // in the clam's own facing plane (default 'XYZ' would pitch it about the
    // world X axis, which barely moves a mouth pointing sideways).
    this.root.rotation.order = 'YXZ';
    this.body = new THREE.Group(); // animated container
    this.root.add(this.body);
    scene.add(this.root);

    this.state = 'idle';
    this.holdTime = 0;
    this.openAmount = 0;    // render: 0 = open gape, 1 = clamped shut (see update)
    this.openTarget = 0;
    this.idleTimer = 1.5;
    this.snapTimer = 0;
    this.baseScale = 0.0155;
    this.dropData = null;
  }

  load(gltfScene) {
    let mesh = null;
    gltfScene.traverse(m => {
      if (m.isMesh && !mesh) mesh = m;
    });
    if (!mesh) throw new Error('Clam model contains no mesh');

    const { top, bottom } = splitGeometryByYPlane(mesh.geometry, 0.2);

    const mat = mesh.material.clone();
    mat.roughness = 0.65;
    mat.metalness = 0.05;

    // Hinge pivot at the back edge so the top shell tips open toward camera.
    this.topPivot = new THREE.Group();
    this.topShell = new THREE.Mesh(top, mat);
    this.topShell.castShadow = true;
    // Shift shell so rotation happens around the hinge line (back in +Z... 
    // hinge along X at the far edge). We pivot at z = -60% of depth.
    this.topPivot.position.set(0, 0, -5.5);
    this.topShell.position.set(0, 0, 5.5);
    this.topPivot.add(this.topShell);

    this.bottomShell = new THREE.Mesh(bottom, mat);
    this.bottomShell.castShadow = true;

    this.body.add(this.bottomShell);
    this.body.add(this.topPivot);

    // ---- meat & pearl (procedural, inside the shells) ----
    this.meat = new THREE.Mesh(
      new THREE.SphereGeometry(7.5, 14, 10),
      new THREE.MeshStandardMaterial({ color: '#f2a68c', roughness: 0.5 })
    );
    this.meat.scale.set(1.25, 0.55, 1.0);
    this.meat.position.y = -1;
    this.body.add(this.meat);

    this.pearl = new THREE.Mesh(
      new THREE.SphereGeometry(2.6, 12, 9),
      new THREE.MeshStandardMaterial({
        color: '#fdfdfa',
        roughness: 0.15,
        metalness: 0.35,
        emissive: '#cfe8e2',
        emissiveIntensity: 0.12,
      })
    );
    this.pearl.position.set(2.5, 0.5, 4);
    this.body.add(this.pearl);

    this.body.scale.setScalar(this.baseScale);
    return this;
  }

  setState(s) {
    this.state = s;
    this.holdTime = 0;
    this.dropData = null;
  }

  /**
   * @param ctx { time, held (bird has it in beak), worldAnchor }
   */
  update(dt, ctx) {
    if (!this.topPivot) return; // model not loaded yet
    const t = ctx.time;
    this.holdTime += dt;

    let targetOpen = 0;
    let shake = 0;

    switch (this.state) {
      case 'idle': {
        // Calm: occasional slow open-and-close to show the pearl.
        this.idleTimer -= dt;
        if (this.idleTimer <= 0) {
          this.idleTimer = 2.4 + Math.random() * 3.2;
          this._idleOpenT = 1.6;
        }
        if (this._idleOpenT > 0) {
          this._idleOpenT -= dt;
          const k = 1 - this._idleOpenT / 1.6; // 0..1
          targetOpen = Math.sin(Math.min(1, k) * Math.PI) * 0.8;
        }
        // gentle breathing
        this.body.rotation.x = Math.sin(t * 1.3) * 0.02;
        break;
      }
      case 'held': {
        // Struggling: snaps shut repeatedly, shakes, gets frantic over time.
        const fatigue = Math.min(1, this.holdTime / 7);
        this.snapTimer -= dt;
        if (this.snapTimer <= 0) {
          this.snapTimer = 0.55 - fatigue * 0.3 + Math.random() * 0.3;
          this._snap = true;
          // shell snap SFX handled via ctx.onSnap callback
          if (ctx.onSnap) ctx.onSnap();
        }
        if (this._snap) {
          // openAmount renders as "closedness" (positive top-pivot rotation
          // swings the shell down), so a high value clamps the shells onto
          // the bill — the clam biting back, in sync with the snap SFX.
          targetOpen = 0.8;
          this._snapPower = (this._snapPower ?? 1) - dt * 2.2;
          if (this._snapPower <= 0) { this._snap = false; this._snapPower = 1; }
        } else {
          targetOpen = 0.45 + Math.sin(t * 6) * 0.25 * (1 - fatigue * 0.5);
        }
        shake = (0.02 + fatigue * 0.05);
        this.body.rotation.z = Math.sin(t * 26) * shake;
        this.body.rotation.x = Math.cos(t * 21) * shake * 0.7;

        // angry droplets occasionally
        if (Math.random() < dt * (1 + fatigue * 3)) {
          this.particles.droplets(this.root.position.clone().add(new THREE.Vector3(0, 0.25, 0)), 1);
        }
        break;
      }
      case 'dropped': {
        // Falling/bounce handled via dropData; settle closed with a squash.
        const d = this.dropData;
        d.t += dt;
        const k = Math.min(1, d.t / 0.5);
        this.root.position.y = d.y0 - 0.55 * k * k;
        if (k >= 1 && !d.landed) {
          d.landed = true;
          this.root.position.y = d.y1;
          this.particles.puff(this.root.position.clone().add(new THREE.Vector3(0, 0.05, 0)), 6, 0.7);
          this._squash = 0.35;
        }
        if (this._squash > 0) {
          this._squash *= Math.exp(-6 * dt);
          const s = this._squash;
          this.body.scale.set(
            this.baseScale * (1 + s * 0.5),
            this.baseScale * (1 - s * 0.6),
            this.baseScale * (1 + s * 0.5)
          );
        } else {
          this.body.scale.setScalar(this.baseScale);
          if (d.landed && d.t > 0.7) this.state = 'idle';
        }
        targetOpen = 0.3 * k; // snaps shut as it lands
        break;
      }
    }

    // Smooth open/close.
    const k = Math.min(1, dt * 10);
    this.openAmount += (targetOpen - this.openAmount) * k;
    // Top shell hinges around the back pivot: positive X rotation swings its
    // front edge down, so a higher openAmount closes the gape.
    this.topPivot.rotation.x = this.openAmount * 0.55;

    // Idle gentle scale restore (when not mid-drop).
    if (this.state !== 'dropped') {
      const breathe = 1 + Math.sin(t * 2.2) * 0.02;
      this.body.scale.set(this.baseScale * breathe, this.baseScale * (2 - breathe), this.baseScale * breathe);
    }

    // Pearl shimmer.
    this.pearl.material.emissiveIntensity = 0.1 + Math.max(0, Math.sin(t * 2.6)) * 0.22;
    if (this.state === 'held' && Math.random() < dt * 2) {
      this.particles.sparkle(this.pearl.getWorldPosition(new THREE.Vector3()), 1, 0.15);
    }
  }

  /**
   * Mark the clam as held. Its position is smoothly pulled to the beak by
   * Game's lerp, so the snatch reads as a yank off the sand rather than a
   * teleport.
   */
  attachTo() {
    this.setState('held');
    // Tip the gape up toward the bill (Game supplies the yaw each frame) so
    // the shells wrap the bill tip — the pair reads as biting each other.
    this.root.rotation.set(-0.95, this.root.rotation.y, 0);
    this._snap = false;
    this._snapPower = 1;
    this._liftFrom = this.root.position.clone();
  }

  /** Drop back to the sand with a bounce. */
  dropTo(groundPos) {
    this.setState('dropped');
    this.dropData = {
      t: 0,
      y0: this.root.position.y,
      y1: groundPos.y,
      landed: false,
    };
    this.root.rotation.set(0, this.root.rotation.y * 0.5, 0);
  }

  resetTo(pos) {
    this.state = 'idle';
    this.root.position.copy(pos);
    this.root.rotation.set(0, Math.random() * Math.PI * 2, 0);
    this.body.scale.setScalar(this.baseScale);
    this.openAmount = 0;
    this._idleOpenT = 0;
  }
}
