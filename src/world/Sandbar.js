import * as THREE from 'three';
import { sandHeight, sandT, SAND_CENTER } from './sandProfile.js';
import { CONFIG } from '../core/config.js';

/**
 * Sandy beach built from the shared height profile, plus rocks, shells,
 * seaweed, driftwood and other little details.
 */
export class Sandbar {
  constructor(scene) {
    this.group = new THREE.Group();
    this.seaweed = [];
    this._buildTerrain();
    this._buildProps();
    scene.add(this.group);
  }

  _buildTerrain() {
    const SEG_A = 72;   // angular steps
    const SEG_R = 26;   // radial steps
    const R_MAX = 1.45; // profile t to reach (skirt sinks under water)

    const positions = [];
    const colors = [];
    const indices = [];

    const dry = new THREE.Color('#e9d6a7');
    const wet = new THREE.Color('#cbb083');
    const underwater = new THREE.Color('#b3a075');

    for (let a = 0; a <= SEG_A; a++) {
      const ang = (a / SEG_A) * Math.PI * 2;
      for (let r = 0; r <= SEG_R; r++) {
        const t = (r / SEG_R) * R_MAX;
        // convert polar t back into stretched space
        const dx = Math.cos(ang) * t * 1.22;
        const dz = Math.sin(ang) * t * 0.92;
        const x = SAND_CENTER.x + dx;
        const z = SAND_CENTER.z + dz;
        const y = sandHeight(x, z);
        positions.push(x, y, z);

        // wet sand near the waterline, slightly deeper tone under water
        const c = new THREE.Color();
        if (y < -0.06) c.lerpColors(wet, underwater, Math.min(1, (-y - 0.06) * 3));
        else c.lerpColors(dry, wet, 1 - Math.min(1, Math.max(0, (y + 0.02) / 0.24)));
        // subtle warm speckle
        const speck = 0.96 + 0.07 * Math.sin(x * 12.9 + z * 7.7);
        colors.push(c.r * speck, c.g * speck, c.b * speck);
      }
    }

    const row = SEG_R + 1;
    for (let a = 0; a < SEG_A; a++) {
      for (let r = 0; r < SEG_R; r++) {
        const i0 = a * row + r;
        indices.push(i0, i0 + row, i0 + 1);
        indices.push(i0 + 1, i0 + row, i0 + row + 1);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1.0,
      metalness: 0,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  _groundY(x, z) {
    return Math.max(0.02, sandHeight(x, z) + 0.01);
  }

  _buildProps() {
    const rng = (seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647)(4357);

    // ---- rocks ----
    const rockMat = new THREE.MeshStandardMaterial({ color: '#9a9d96', roughness: 0.95 });
    const rockMatDark = new THREE.MeshStandardMaterial({ color: '#7c8280', roughness: 0.95 });
    const rockSpots = [
      [1.0, -0.6, 0.30], [5.4, 2.3, 0.22], [4.6, -1.9, 0.16], [0.9, 2.6, 0.18],
      [6.2, 0.4, 0.14], [2.0, 3.4, 0.11], [5.9, -0.8, 0.2],
    ];
    for (const [x, z, s] of rockSpots) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rng() > 0.5 ? rockMat : rockMatDark);
      rock.position.set(x, this._groundY(x, z) + s * 0.35, z);
      rock.scale.y = 0.7;
      rock.rotation.set(rng() * 0.4, rng() * Math.PI * 2, rng() * 0.4);
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.group.add(rock);
    }

    // ---- shells ----
    const shellMat = new THREE.MeshStandardMaterial({ color: '#f6ead9', roughness: 0.6 });
    const shellMat2 = new THREE.MeshStandardMaterial({ color: '#e8b7a9', roughness: 0.6 });
    for (let i = 0; i < 7; i++) {
      const ang = rng() * Math.PI * 2;
      const t = 0.35 + rng() * 0.5;
      const x = SAND_CENTER.x + Math.cos(ang) * t * 1.22 * 4.0;
      const z = SAND_CENTER.z + Math.sin(ang) * t * 0.92 * 4.0;
      const shell = new THREE.Mesh(new THREE.ConeGeometry(0.055 + rng() * 0.04, 0.12 + rng() * 0.08, 5), rng() > 0.5 ? shellMat : shellMat2);
      shell.position.set(x, this._groundY(x, z) + 0.03, z);
      shell.rotation.set(1.35, rng() * Math.PI * 2, 0);
      shell.castShadow = true;
      this.group.add(shell);
    }

    // ---- seaweed tufts (animated) ----
    const seaweedMat = new THREE.MeshStandardMaterial({ color: '#4f8f5e', roughness: 0.9 });
    const seaweedMat2 = new THREE.MeshStandardMaterial({ color: '#3c7a4e', roughness: 0.9 });
    for (let i = 0; i < 9; i++) {
      const ang = rng() * Math.PI * 2;
      const t = 0.78 + rng() * 0.2;
      const x = SAND_CENTER.x + Math.cos(ang) * t * 1.22 * 4.35;
      const z = SAND_CENTER.z + Math.sin(ang) * t * 0.92 * 4.35;
      const tuft = new THREE.Group();
      const blades = 3 + Math.floor(rng() * 3);
      for (let b = 0; b < blades; b++) {
        const h = 0.28 + rng() * 0.4;
        const blade = new THREE.Mesh(new THREE.ConeGeometry(0.035, h, 4), rng() > 0.5 ? seaweedMat : seaweedMat2);
        blade.position.set((rng() - 0.5) * 0.14, h / 2, (rng() - 0.5) * 0.14);
        blade.rotation.z = (rng() - 0.5) * 0.5;
        tuft.add(blade);
      }
      tuft.position.set(x, sandHeight(x, z) - 0.04, z);
      tuft.userData.phase = rng() * Math.PI * 2;
      this.seaweed.push(tuft);
      this.group.add(tuft);
    }

    // ---- driftwood ----
    const woodMat = new THREE.MeshStandardMaterial({ color: '#9c8265', roughness: 0.95 });
    const drift = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.11, 1.7, 7), woodMat);
    trunk.rotation.z = Math.PI / 2 - 0.12;
    trunk.rotation.y = 0.5;
    drift.add(trunk);
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 0.7, 6), woodMat);
    branch.position.set(-0.4, 0.18, 0.05);
    branch.rotation.z = 0.9;
    drift.add(branch);
    drift.position.set(5.0, this._groundY(5.0, 1.6) + 0.1, 1.6);
    drift.rotation.y = 0.5;
    drift.traverse(m => { m.castShadow = true; m.receiveShadow = true; });
    this.group.add(drift);

    // ---- a second small log near the bird for composition ----
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.9, 6), woodMat);
    log.rotation.z = Math.PI / 2 + 0.08;
    log.rotation.y = -0.8;
    log.position.set(1.15, this._groundY(1.15, 1.9) + 0.06, 1.9);
    log.castShadow = true;
    this.group.add(log);

    // ---- starfish ----
    const starMat = new THREE.MeshStandardMaterial({ color: '#e07856', roughness: 0.85 });
    const star = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.16, 3, 6), starMat);
      arm.position.set(Math.cos((i / 5) * Math.PI * 2) * 0.12, 0, Math.sin((i / 5) * Math.PI * 2) * 0.12);
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = -(i / 5) * Math.PI * 2;
      star.add(arm);
    }
    star.position.set(4.35, this._groundY(4.35, 2.9) + 0.02, 2.9);
    star.scale.y = 0.45;
    this.group.add(star);
  }

  /** Height of the sand at the gameplay spots (used to seat characters). */
  static groundAt(x, z) {
    return sandHeight(x, z);
  }

  update(dt, time) {
    for (const tuft of this.seaweed) {
      tuft.rotation.x = Math.sin(time * 1.4 + tuft.userData.phase) * 0.14;
      tuft.rotation.z = Math.cos(time * 1.1 + tuft.userData.phase) * 0.12;
    }
  }

  dispose() {
    this.group.traverse(m => {
      if (m.geometry) m.geometry.dispose();
      if (m.material) m.material.dispose();
    });
  }
}
