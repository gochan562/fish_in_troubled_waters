import * as THREE from 'three';

/**
 * Lightweight pooled particle system.
 * Meshes: tiny icosahedrons with per-variant materials
 * (splash, foam, sand puff, sparkle, feather, droplet).
 */
const VARIANTS = {
  splash: { color: '#ffffff', size: 0.075, gravity: -5.2, drag: 0.9, opacity: 0.95 },
  foam: { color: '#dff5ee', size: 0.06, gravity: -3.4, drag: 0.86, opacity: 0.9 },
  sand: { color: '#dcc494', size: 0.065, gravity: -6.5, drag: 0.92, opacity: 1 },
  sparkle: { color: '#ffe9a3', size: 0.05, gravity: -0.8, drag: 0.94, opacity: 1 },
  feather: { color: '#fdfaf2', size: 0.08, gravity: -1.1, drag: 0.9, opacity: 0.98 },
  drop: { color: '#bfe9e4', size: 0.045, gravity: -7.5, drag: 0.93, opacity: 0.95 },
};

export class Particles {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.active = [];

    this.geo = new THREE.IcosahedronGeometry(1, 0);
    this.materials = {};
    for (const [name, v] of Object.entries(VARIANTS)) {
      this.materials[name] = new THREE.MeshStandardMaterial({
        color: v.color,
        roughness: 0.6,
        transparent: true,
        opacity: v.opacity,
      });
    }

    const POOL = 130;
    for (let i = 0; i < POOL; i++) {
      const mesh = new THREE.Mesh(this.geo, this.materials.splash);
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push(mesh);
    }
  }

  _spawn(variant, pos, vel, life, scale) {
    const mesh = this.pool.pop();
    if (!mesh) return;
    const v = VARIANTS[variant];
    mesh.material = this.materials[variant];
    mesh.position.copy(pos);
    mesh.visible = true;
    mesh.scale.setScalar(scale * v.size);
    mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    this.active.push({
      mesh,
      vel: vel.clone(),
      life,
      maxLife: life,
      gravity: v.gravity,
      drag: v.drag,
      baseScale: scale * v.size,
      spin: (Math.random() - 0.5) * 8,
    });
  }

  /** Water splash burst. */
  splash(pos, count = 14, power = 1) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.5 * power;
      const vel = new THREE.Vector3(
        Math.cos(a) * r,
        1.8 + Math.random() * 2.2 * power,
        Math.sin(a) * r
      );
      this._spawn(Math.random() > 0.4 ? 'splash' : 'foam', pos, vel, 0.55 + Math.random() * 0.4, 0.8 + Math.random() * 0.7);
    }
  }

  /** Small foam/water spray (net whips, beak dips, hand flicks). */
  foam(pos, count = 4, power = 0.6) {
    for (let i = 0; i < count; i++) {
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * power * 2,
        0.4 + Math.random() * power * 1.6,
        (Math.random() - 0.5) * power * 2
      );
      this._spawn('foam', pos, vel, 0.35 + Math.random() * 0.3, 0.6 + Math.random() * 0.5);
    }
  }

  /** Sand dust puff. */
  puff(pos, count = 8, power = 1) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const vel = new THREE.Vector3(
        Math.cos(a) * (0.6 + Math.random() * 0.8) * power,
        0.5 + Math.random() * 0.9,
        Math.sin(a) * (0.6 + Math.random() * 0.8) * power
      );
      this._spawn('sand', pos, vel, 0.5 + Math.random() * 0.35, 0.9 + Math.random() * 0.8);
    }
  }

  /** Tiny sparkles (pearl shimmer, score feedback). */
  sparkle(pos, count = 6, spread = 0.3) {
    for (let i = 0; i < count; i++) {
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * spread,
        0.5 + Math.random() * 0.8,
        (Math.random() - 0.5) * spread
      );
      this._spawn('sparkle', pos, vel, 0.5 + Math.random() * 0.4, 0.7 + Math.random() * 0.6);
    }
  }

  /** Feather burst (capture comedy). */
  feathers(pos, count = 10) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const vel = new THREE.Vector3(
        Math.cos(a) * (0.8 + Math.random() * 1.4),
        1.2 + Math.random() * 1.6,
        Math.sin(a) * (0.8 + Math.random() * 1.4)
      );
      this._spawn('feather', pos, vel, 1.1 + Math.random() * 0.6, 0.9 + Math.random() * 0.7);
    }
  }

  /** Angry droplets for a struggling clam. */
  droplets(pos, count = 5) {
    for (let i = 0; i < count; i++) {
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 1.6,
        1.0 + Math.random() * 1.2,
        (Math.random() - 0.5) * 1.6
      );
      this._spawn('drop', pos, vel, 0.4 + Math.random() * 0.3, 0.8);
    }
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        this.pool.push(p.mesh);
        this.active.splice(i, 1);
        continue;
      }
      p.vel.y += p.gravity * dt;
      p.vel.multiplyScalar(Math.pow(p.drag, dt * 60));
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.spin * dt;
      p.mesh.rotation.z += p.spin * 0.7 * dt;
      // Shared materials — fade via scale, not opacity.
      const k = p.life / p.maxLife;
      p.mesh.scale.setScalar(p.baseScale * (0.25 + 0.75 * k));
    }
  }

  dispose() {
    for (const p of this.active) { p.mesh.visible = false; this.pool.push(p.mesh); }
    this.active = [];
    for (const mesh of this.pool) this.scene.remove(mesh);
    this.geo.dispose();
    for (const m of Object.values(this.materials)) m.dispose();
  }
}
