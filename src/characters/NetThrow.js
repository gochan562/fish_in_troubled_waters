import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { splitMeshByGroups } from './meshUtils.js';

/**
 * The capture net. Uses the netting primitive from the provided fishing-net
 * model as the visible mesh, supplemented with a rope rim and a translucent
 * hanging bag so it reads as a proper throwing net.
 *
 * The source GLB is a flat, hand-net-shaped model baked at a huge internal
 * scale; we extract the netting mesh from it and rebuild it around a
 * game-sized cast-net rig. Lifecycle:
 *   throw() → tumbling flight → lands draped over the bird & clam.
 */
export class NetThrow {
  constructor(scene, particles, netGLTFScene) {
    this.scene = scene;
    this.particles = particles;
    this.flightTime = CONFIG.attack.netFlight;
    this.flightData = null;
    this.landed = false;
    this.landData = null;

    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    // ---- pull the netting primitive out of the provided model ----
    let sourceMesh = null;
    netGLTFScene.traverse(m => {
      if (m.isMesh) {
        if (!sourceMesh || m.geometry.attributes.position.count > sourceMesh.geometry.attributes.position.count) {
          sourceMesh = m;
        }
      }
    });

    let netMesh = null;
    if (sourceMesh) {
      // Split by material groups and pick the biggest (the netting itself).
      const parts = splitMeshByGroups(sourceMesh);
      let biggest = parts[0];
      for (const p of parts) {
        if (p.geometry.index && (!biggest.geometry.index || p.geometry.index.count > biggest.geometry.index.count)) {
          biggest = p;
        }
      }
      const geo = biggest.geometry.clone();
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      const center = new THREE.Vector3();
      bb.getCenter(center);
      geo.translate(-center.x, -center.y, -center.z); // center the disc

      // The source net is a shallow scoop: rim on the +Z side, apex on -Z.
      // Align the rim with the rope ring (y = 0); the rotation below tips
      // the apex up into the crown so the opening faces down over the catch.
      const size = new THREE.Vector3();
      bb.getSize(size);
      geo.translate(0, 0, -size.z / 2);

      const mat = (biggest.material || sourceMesh.material).clone();
      if (mat.color) mat.color.lerp(new THREE.Color('#6f7d72'), 0.55); // lift the near-black netting
      mat.side = THREE.DoubleSide;
      mat.roughness = 0.8;
      netMesh = new THREE.Mesh(geo, mat);
      // Normalize into a round, tall drape: ~1.95 across, 1.25 deep — deep
      // enough to shroud the bird once the rim settles at its feet.
      const targetDiameter = 1.95;
      const targetDepth = 1.25;
      netMesh.scale.set(
        targetDiameter / Math.max(size.x, 0.001),
        targetDiameter / Math.max(size.y, 0.001),
        targetDepth / Math.max(size.z, 0.001)
      );
      netMesh.rotation.x = Math.PI / 2; // rim ring at y ≈ 0 (bottom), apex rises to the crown: opening faces down
      netMesh.castShadow = true;
    }

    this.nettIng = netMesh;
    this.group.add(netMesh || new THREE.Group());

    // ---- rope rim around the netting ----
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(1.0, 0.035, 6, 28),
      new THREE.MeshStandardMaterial({ color: '#cbb491', roughness: 0.95 })
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.015;
    rim.castShadow = true;
    this.group.add(rim);

    // little knots on the rim for detail
    const knotMat = new THREE.MeshStandardMaterial({ color: '#b3a084', roughness: 1 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), knotMat);
      knot.position.set(Math.cos(a) * 1.0, 0.03, Math.sin(a) * 1.0);
      this.group.add(knot);
    }

    // ---- translucent dome sheath for volume (balloons up from the rim) ----
    const bagProfile = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const r = 0.92 * (1 - t * t * 0.72) * (1 + Math.sin(t * Math.PI) * 0.16);
      bagProfile.push(new THREE.Vector2(Math.max(0.001, r), t * 1.05));
    }
    const bagGeo = new THREE.LatheGeometry(bagProfile, 18);
    this.bagMat = new THREE.MeshStandardMaterial({
      color: '#eef2ea',
      roughness: 0.9,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.bag = new THREE.Mesh(bagGeo, this.bagMat);
    this.group.add(this.bag);

    this.group.scale.setScalar(1);
  }

  setFlightTime(t) {
    this.flightTime = t;
  }

  /**
   * Launch from the fisherman's hand toward the capture point
   * (already positioned above the bird & clam by Game).
   */
  throw(from, to, onLand) {
    this.group.visible = true;
    this.landed = false;
    this.landData = null;
    this.flightData = {
      t: 0,
      from: from.clone(),
      to: to.clone(),
      onLand,
      arcHeight: 1.5 + from.distanceTo(to) * 0.16,
      baseScale: 1,
    };
    this.group.position.copy(from);
    this.group.scale.setScalar(0.3);
    this.group.rotation.set(0, 0, 0);
  }

  update(dt, time) {
    if (!this.group.visible) return;

    // ------- flight -------
    if (this.flightData && !this.landed) {
      const f = this.flightData;
      f.t += dt;
      const k = Math.min(1, f.t / this.flightTime);
      const ek = 1 - Math.pow(1 - k, 2.2);

      const pos = new THREE.Vector3().lerpVectors(f.from, f.to, ek);
      pos.y += Math.sin(k * Math.PI) * f.arcHeight;
      this.group.position.copy(pos);

      // Tumble, then level out just before landing.
      const levelOut = Math.min(1, Math.max(0, (k - 0.6) / 0.4));
      this.group.rotation.x = Math.sin(k * Math.PI * 2.5) * 0.5 * (1 - levelOut);
      this.group.rotation.y = k * 6.0; // spin
      this.group.rotation.z = Math.cos(k * Math.PI * 2.2) * 0.35 * (1 - levelOut);

      // Unfurl everything to full size early in flight.
      const unfurl = Math.min(1, k / 0.42);
      const s = 0.3 + unfurl * 0.7;
      this.group.scale.set(s, 0.45 + unfurl * 0.55, s);
      this.bag.scale.set(1, 0.25 + unfurl * 0.75, 1);

      if (Math.random() < dt * 22) {
        this.particles.foam(this.group.position, 1, 0.35);
      }

      if (k >= 1) {
        this.landed = true;
        this.landData = { t: 0, baseY: f.to.y, wiggle: 1 };
        this.group.rotation.set(0.06, f.to ? this.group.rotation.y : 0, 0.03);
        this.bag.scale.set(1, 1, 1);
        if (f.onLand) f.onLand();
      }
      return;
    }

    // ------- landed: drape, settle and wiggle -------
    if (this.landData) {
      const d = this.landData;
      d.t += dt;
      this.group.position.y += (d.baseY - this.group.position.y) * Math.min(1, dt * 8);
      this.group.rotation.x += ((0.06 + Math.sin(time * 17) * 0.02 * d.wiggle) - this.group.rotation.x) * Math.min(1, dt * 6);
      this.group.rotation.z = Math.sin(time * 19) * 0.05 * d.wiggle;
      this.group.rotation.y += Math.sin(time * 11) * 0.015 * d.wiggle;
      d.wiggle *= Math.exp(-1.3 * dt);
      // Bag hangs a touch heavier as it settles.
      this.bag.scale.y = 1 + Math.sin(time * 13) * 0.03 * d.wiggle;
    }
  }

  hide() {
    this.group.visible = false;
    this.flightData = null;
    this.landData = null;
  }

  reset() {
    this.hide();
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(m => {
      if (m.geometry) m.geometry.dispose();
      if (m.material) m.material.dispose();
    });
  }
}
