import * as THREE from 'three';

/**
 * Gradient sky dome with a warm sun glow, plus soft low-poly clouds
 * drifting slowly across the horizon.
 */
export class Sky {
  constructor(scene) {
    this.group = new THREE.Group();
    this.clouds = [];
    this._buildDome();
    this._buildClouds();
    scene.add(this.group);
  }

  _buildDome() {
    const geo = new THREE.SphereGeometry(130, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color('#3f9bc8') },
        uHorizon: { value: new THREE.Color('#c6e6e8') },
        uSunDir: { value: new THREE.Vector3(-0.42, 0.5, 0.42).normalize() },
        uSunColor: { value: new THREE.Color('#ffdda6') },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop;
        uniform vec3 uHorizon;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y * 1.6 + 0.14, 0.0, 1.0);
          vec3 col = mix(uHorizon, uTop, pow(h, 0.62));
          // warm halo around the sun
          float sunAmt = max(dot(vDir, uSunDir), 0.0);
          col += uSunColor * pow(sunAmt, 26.0) * 0.5;
          col += uSunColor * pow(sunAmt, 7.0) * 0.1;
          // faint warm band hugging the horizon
          col += vec3(0.03, 0.018, 0.0) * (1.0 - smoothstep(0.0, 0.16, abs(vDir.y)));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.dome = new THREE.Mesh(geo, mat);
    this.group.add(this.dome);
  }

  _cloudMat() {
    return new THREE.MeshStandardMaterial({
      color: '#fbfefe',
      emissive: '#d9e8ec',
      emissiveIntensity: 0.45,
      roughness: 1,
      flatShading: true,
      transparent: true,
      opacity: 0.95,
    });
  }

  _buildClouds() {
    const defs = [
      { pos: [-19, 6.2, -44], scale: 2.6, blobs: 5 },
      { pos: [12, 6.9, -50], scale: 3.0, blobs: 6 },
      { pos: [27, 8.2, -62], scale: 4.0, blobs: 6 },
      { pos: [-32, 7.4, -55], scale: 2.8, blobs: 5 },
      { pos: [3, 7.9, -60], scale: 3.4, blobs: 7 },
      { pos: [-9, 5.9, -38], scale: 2.0, blobs: 4 },
    ];
    const puffGeo = new THREE.IcosahedronGeometry(1, 1);
    for (const def of defs) {
      const cloud = new THREE.Group();
      for (let i = 0; i < def.blobs; i++) {
        const puff = new THREE.Mesh(puffGeo, this._cloudMat());
        const a = (i / def.blobs) * Math.PI * 2;
        puff.position.set(
          Math.cos(a) * def.scale * 0.55,
          (Math.random() - 0.5) * def.scale * 0.24,
          Math.sin(a) * def.scale * 0.3
        );
        const s = def.scale * (0.36 + Math.random() * 0.3);
        puff.scale.set(s, s * 0.62, s * 0.8);
        cloud.add(puff);
      }
      cloud.position.set(...def.pos);
      cloud.userData.speed = 0.14 + Math.random() * 0.12;
      cloud.userData.baseX = def.pos[0];
      this.clouds.push(cloud);
      this.group.add(cloud);
    }
  }

  update(dt) {
    for (const cloud of this.clouds) {
      cloud.position.x += cloud.userData.speed * dt;
      if (cloud.position.x > cloud.userData.baseX + 30) {
        cloud.position.x = cloud.userData.baseX - 30;
      }
    }
  }

  dispose() {
    this.group.traverse(m => {
      if (m.geometry) m.geometry.dispose();
      if (m.material) m.material.dispose();
    });
  }
}
