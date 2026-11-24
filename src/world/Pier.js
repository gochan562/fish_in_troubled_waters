import * as THREE from 'three';
import { CONFIG } from '../core/config.js';

/**
 * Weathered wooden fishing pier on the left side of the diorama,
 * dressed with a bucket, tackle box, rope coil, lantern and a silly sign.
 */
export class Pier {
  constructor(scene) {
    this.group = new THREE.Group();
    this.lanternGlow = null;
    this._build();
    scene.add(this.group);
  }

  _wood(light) {
    return new THREE.MeshStandardMaterial({
      color: light ? '#a98a63' : '#8a6d4c',
      roughness: 0.95,
    });
  }

  _build() {
    const DECK_Y = 1.62;
    const PIER_X0 = -10.8;
    const PIER_X1 = -2.6;
    const PIER_Z = -0.35;

    // ---- deck planks (slightly irregular for charm) ----
    const plankGeo = new THREE.BoxGeometry(0.62, 0.09, 2.6);
    const planks = [];
    const n = Math.ceil((PIER_X1 - PIER_X0) / 0.72);
    for (let i = 0; i <= n; i++) {
      const x = PIER_X0 + i * 0.72;
      const mat = this._wood(i % 2 === 0);
      const plank = new THREE.Mesh(plankGeo, mat);
      plank.position.set(x, DECK_Y, PIER_Z + (Math.random() - 0.5) * 0.05);
      plank.rotation.y = (Math.random() - 0.5) * 0.035;
      plank.rotation.z = (Math.random() - 0.5) * 0.02;
      plank.castShadow = true;
      plank.receiveShadow = true;
      this.group.add(plank);
      planks.push(plank);
    }

    // ---- support posts + cross beams ----
    const postGeo = new THREE.CylinderGeometry(0.11, 0.13, 3.4, 7);
    const postMat = this._wood(false);
    for (let i = 0; i <= n; i += 2) {
      const x = PIER_X0 + i * 0.72;
      for (const dz of [-1.05, 1.05]) {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(x, DECK_Y - 1.75, PIER_Z + dz);
        post.rotation.z = (Math.random() - 0.5) * 0.03;
        post.castShadow = true;
        this.group.add(post);
        // water ripple collar
        const collar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.2, 0.1, 8),
          new THREE.MeshStandardMaterial({ color: '#4d9aa0', roughness: 0.7 })
        );
        collar.position.set(x, 0.0, PIER_Z + dz);
        this.group.add(collar);
      }
      // cross beam
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 2.3), postMat);
      beam.position.set(x, DECK_Y - 0.45, PIER_Z);
      this.group.add(beam);
    }

    // ---- side stringers ----
    for (const dz of [-1.28, 1.28]) {
      const stringer = new THREE.Mesh(new THREE.BoxGeometry(PIER_X1 - PIER_X0, 0.12, 0.16), postMat);
      stringer.position.set((PIER_X0 + PIER_X1) / 2, DECK_Y - 0.12, PIER_Z + dz);
      this.group.add(stringer);
    }

    // ---- bucket ----
    const bucket = new THREE.Group();
    const bMat = new THREE.MeshStandardMaterial({ color: '#5d7f8a', roughness: 0.6, metalness: 0.15 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.16, 0.32, 12, 1, true), bMat);
    body.material.side = THREE.DoubleSide;
    bucket.add(body);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.16, 12), bMat);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = -0.16;
    bucket.add(bottom);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.02, 6, 14), bMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.16;
    bucket.add(rim);
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(0.185, 12),
      new THREE.MeshStandardMaterial({ color: '#3f98a8', roughness: 0.3 })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.1;
    bucket.add(water);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.015, 5, 12, Math.PI), bMat);
    handle.position.y = 0.16;
    bucket.add(handle);
    bucket.position.set(-8.1, DECK_Y + 0.16, -1.05);
    bucket.rotation.y = 0.4;
    bucket.traverse(m => { m.castShadow = true; });
    this.group.add(bucket);

    // ---- tackle box ----
    const box = new THREE.Group();
    const boxMat = new THREE.MeshStandardMaterial({ color: '#c96f43', roughness: 0.7 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.24, 0.3), boxMat);
    box.add(base);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.07, 0.3), boxMat);
    lid.position.set(0, 0.16, -0.11);
    lid.rotation.x = -0.9;
    box.add(lid);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.24),
      new THREE.MeshStandardMaterial({ color: '#e8dcc0', roughness: 0.8 }));
    tray.position.y = 0.05;
    box.add(tray);
    for (let i = 0; i < 3; i++) {
      const lure = new THREE.Mesh(
        new THREE.SphereGeometry(0.032, 6, 5),
        new THREE.MeshStandardMaterial({ color: ['#e8c33f', '#d95f4b', '#7fb069'][i], roughness: 0.5 })
      );
      lure.position.set(-0.12 + i * 0.12, 0.09, 0);
      box.add(lure);
    }
    box.position.set(-7.0, DECK_Y + 0.12, 0.75);
    box.rotation.y = -0.35;
    box.traverse(m => { m.castShadow = true; });
    this.group.add(box);

    // ---- coiled rope ----
    const ropeMat = new THREE.MeshStandardMaterial({ color: '#cbb491', roughness: 1 });
    for (let i = 0; i < 3; i++) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.17 - i * 0.025, 0.022, 5, 16), ropeMat);
      coil.rotation.x = Math.PI / 2;
      coil.position.set(-9.4, DECK_Y + 0.03 + i * 0.045, 0.55);
      coil.rotation.y = Math.random() * Math.PI;
      coil.castShadow = true;
      this.group.add(coil);
    }

    // ---- lantern post (lit — warm focal point on the pier) ----
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.7, 6), postMat);
    post.position.set(-9.9, DECK_Y + 0.85, -1.3);
    post.castShadow = true;
    this.group.add(post);
    const lampCase = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.3, 0.22),
      new THREE.MeshStandardMaterial({ color: '#3a4a52', roughness: 0.5, metalness: 0.4 })
    );
    lampCase.position.set(-9.9, DECK_Y + 1.8, -1.3);
    this.group.add(lampCase);
    const lampGlass = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 8, 6),
      new THREE.MeshStandardMaterial({
        color: '#ffd98a', emissive: '#ffb84d', emissiveIntensity: 1.4, roughness: 0.3,
      })
    );
    lampGlass.position.set(-9.9, DECK_Y + 1.79, -1.3);
    this.group.add(lampGlass);
    this.lanternGlow = new THREE.PointLight('#ffb45e', 0.8, 5.5, 2);
    this.lanternGlow.position.copy(lampGlass.position);
    this.group.add(this.lanternGlow);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.12, 4), postMat);
    cap.position.set(-9.9, DECK_Y + 1.99, -1.3);
    this.group.add(cap);

    // ---- silly "gone fishing" style sign (left side, clear of the fisherman) ----
    const signPost = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 1.1, 6), postMat);
    signPost.position.set(-7.65, DECK_Y + 0.55, 0.95);
    signPost.castShadow = true;
    this.group.add(signPost);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.34, 0.05), this._wood(true));
    board.position.set(-7.65, DECK_Y + 1.08, 0.95);
    board.rotation.y = 0.28;
    board.rotation.z = 0.04;
    board.castShadow = true;
    this.group.add(board);
    // little wooden fish nailed to the board
    const fishMat = new THREE.MeshStandardMaterial({ color: '#6a5138', roughness: 0.9 });
    const fishBody = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), fishMat);
    fishBody.scale.set(1.5, 0.7, 0.35);
    fishBody.position.set(-7.7, DECK_Y + 1.08, 0.99);
    fishBody.rotation.y = 0.28;
    this.group.add(fishBody);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.1, 4), fishMat);
    tail.position.set(-7.55, DECK_Y + 1.08, 0.99);
    tail.rotation.z = -Math.PI / 2;
    tail.rotation.y = 0.28;
    this.group.add(tail);
  }

  update(dt, time) {
    if (this.lanternGlow) {
      this.lanternGlow.intensity = 0.75 + Math.sin(time * 7.3) * 0.05 + Math.sin(time * 2.1) * 0.06;
    }
  }

  dispose() {
    this.group.traverse(m => {
      if (m.geometry) m.geometry.dispose();
      if (m.material) m.material.dispose();
    });
  }
}
