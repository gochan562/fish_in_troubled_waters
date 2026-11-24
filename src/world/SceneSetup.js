import * as THREE from 'three';
import { CONFIG } from '../core/config.js';

/**
 * Renderer, cinematic camera and lighting for the diorama.
 * The camera stays in a fixed side-on composition with tiny event-driven
 * adjustments (push-in, shake) handled here.
 */
export class SceneSetup {
  constructor(canvas) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xcfe0d6, 34, 92);

    this.camera = new THREE.PerspectiveCamera(
      CONFIG.camera.fov,
      1,
      0.1,
      220
    );

    this.shake = { intensity: 0, decay: 3.2, offset: new THREE.Vector3() };
    this.pushIn = 0;      // subtle forward drift while holding
    this.tilt = 0;        // small upward tilt during escapes

    this._buildLights();
    this._applyCamera();
    this._onResize();
    window.addEventListener('resize', () => this._onResize());
  }

  _buildLights() {
    // Warm key light — late afternoon sun.
    const sun = new THREE.DirectionalLight(0xffe3b0, 2.6);
    sun.position.set(-7, 11, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 42;
    sun.shadow.camera.left = -13;
    sun.shadow.camera.right = 13;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -8;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    this.sun = sun;
    this.scene.add(sun);
    this.scene.add(sun.target);

    // Sky/sea bounce light.
    const hemi = new THREE.HemisphereLight(0xbfe8ee, 0x5d7a63, 0.85);
    this.scene.add(hemi);

    // Soft fill from camera side so shadows stay readable.
    const fill = new THREE.DirectionalLight(0xcfe9f2, 0.5);
    fill.position.set(6, 5, 9);
    this.scene.add(fill);
  }

  _applyCamera() {
    const base = CONFIG.camera;
    const portrait = this.camera.aspect < 0.9;
    this.camera.fov = portrait ? base.portraitFov : base.fov;
    this.camera.updateProjectionMatrix();
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.camera.aspect = w / h;
    this._applyCamera();
  }

  /** Camera shake — call with intensity in world units. */
  addShake(intensity) {
    this.shake.intensity = Math.max(this.shake.intensity, intensity);
  }

  update(dt, holding) {
    // Hold-driven slow push-in.
    const target = holding ? 0.55 : 0;
    this.pushIn += (target - this.pushIn) * Math.min(1, dt * 2.2);

    // Shake decay.
    const s = this.shake;
    let sx = 0, sy = 0;
    if (s.intensity > 0.0004) {
      s.intensity *= Math.exp(-s.decay * dt);
      sx = (Math.random() * 2 - 1) * s.intensity;
      sy = (Math.random() * 2 - 1) * s.intensity;
    }

    // Breath-like idle drift keeps the diorama alive.
    const t = performance.now() / 1000;
    const driftX = Math.sin(t * 0.31) * 0.09 + Math.sin(t * 0.13) * 0.05;
    const driftY = Math.sin(t * 0.23 + 1.7) * 0.05;

    const base = CONFIG.camera;
    const portrait = this.camera.aspect < 0.9;
    const pos = new THREE.Vector3(...base.position);
    if (portrait) {
      pos.z += base.portraitOffsetZ;
      pos.y += 0.9;
    }
    const look = new THREE.Vector3(...base.lookAt);
    const dir = look.clone().sub(pos).normalize();

    this.camera.position.copy(pos)
      .addScaledVector(dir, this.pushIn)
      .add(new THREE.Vector3(driftX + sx, driftY + sy + this.tilt * 0.9, 0));
    this.camera.lookAt(look.x + sx * 0.6, look.y + this.tilt * 2.2, look.z);
  }

  dispose() {
    this.renderer.dispose();
    window.removeEventListener('resize', this._onResize);
  }
}
