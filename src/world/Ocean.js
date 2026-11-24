import * as THREE from 'three';
import { SAND_CENTER } from './sandProfile.js';

const VERT = /* glsl */ `
uniform float uTime;
uniform vec2 uSandCenter;
varying vec3 vWorld;
varying float vH;

float wave(vec2 p, vec2 dir, float freq, float speed, float amp) {
  return sin(dot(p, dir) * freq + uTime * speed) * amp;
}

void main() {
  vec3 pos = position;
  vec2 p = pos.xz;

  // Several wave octaves with different directions, frequencies and speeds.
  float h = 0.0;
  h += wave(p, normalize(vec2( 1.0,  0.35)), 0.5,  0.9,  0.15);
  h += wave(p, normalize(vec2(-0.6,  1.0)),  0.85, 1.25, 0.085);
  h += wave(p, normalize(vec2( 0.2, -1.0)),  1.6,  2.0,  0.045);
  h += wave(p, normalize(vec2( 1.0,  0.9)),  3.0,  2.7,  0.022);

  // Waves calm down where the water is shallow (over the sandbar).
  float sd = length(p - uSandCenter);
  h *= mix(0.22, 1.0, smoothstep(1.4, 6.0, sd));

  pos.y += h;
  vH = h;
  vec4 wp = modelMatrix * vec4(pos, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform vec2 uSandCenter;
uniform vec2 uSandStretch;
uniform vec2 uRippleCenter;   // clam position
uniform float uRippleStrength;
uniform vec2 uBobberCenter;   // fishing float
uniform float uBobberAgitate; // rises as the fisherman gets suspicious
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFoam;
varying vec3 vWorld;
varying float vH;

// Same edge profile as sandProfile.js
float edgeRadius(float ang) {
  return 4.35 + 0.62 * sin(2.1 * ang + 1.15) + 0.38 * cos(3.3 * ang - 0.7) + 0.18 * sin(5.2 * ang + 0.4);
}
float sandT(vec2 p) {
  vec2 d = (p - uSandCenter) / uSandStretch;
  return length(d) / edgeRadius(atan(d.y, d.x));
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 p = vWorld.xz;
  float t = sandT(p);

  // ---- base color: turquoise shallows near the sand, deep blue further out
  float shallowMix = 1.0 - smoothstep(0.6, 1.9, t);
  vec3 col = mix(uDeep, uShallow, shallowMix * 0.9);

  // crest lightening
  col += vec3(0.045, 0.075, 0.065) * smoothstep(0.04, 0.26, vH);
  // trough shading
  col -= vec3(0.02, 0.03, 0.035) * smoothstep(-0.04, -0.2, vH);

  // ---- distance haze toward the warm horizon
  float haze = smoothstep(20.0, 70.0, length(vWorld - cameraPosition));
  col = mix(col, vec3(0.34, 0.5, 0.53), haze * 0.5);

  // ---- fake sun glints (crest-linked, fading with distance)
  float distFade = smoothstep(46.0, 10.0, length(vWorld - cameraPosition));
  float crest = smoothstep(0.03, 0.16, vH);
  float glint = sin(p.x * 6.7 + uTime * 2.1) * sin(p.y * 5.9 - uTime * 1.6);
  col += vec3(0.95, 0.9, 0.75) * pow(max(glint, 0.0), 8.0) * 0.22 * crest * distFade;

  // ---- shoreline foam: an irregular band where sand crosses the waterline
  float band = 1.0 - smoothstep(0.8, 1.04, t);
  band *= smoothstep(0.7, 0.88, t);
  float foamN = hash(floor(p * 12.0) + floor(uTime * 1.7));
  float foamN2 = hash(floor(p * 26.0) - floor(uTime * 2.3));
  float foamEdge = smoothstep(0.45, 1.0, foamN * 0.7 + foamN2 * 0.3) * 0.6 + 0.4;
  float shoreFoam = band * foamEdge;
  col = mix(col, uFoam, shoreFoam * 0.55);

  // ---- ripples around the clam (only visible on water, faint when idle)
  float rd = length(p - uRippleCenter);
  float ring = sin(rd * 9.0 - uTime * 5.2);
  ring *= smoothstep(0.15, 0.5, rd) * smoothstep(2.2, 1.0, rd);
  ring *= smoothstep(0.9, 1.05, t); // only over open water, not on the sand
  col = mix(col, uFoam, max(ring, 0.0) * (0.03 + uRippleStrength * 0.32));

  // ---- disturbed water near the bobber when the fisherman is on edge
  float bd = length(p - uBobberCenter);
  float jig = sin(bd * 14.0 - uTime * 11.0) * sin(uTime * 3.1);
  jig *= smoothstep(0.05, 0.3, bd) * smoothstep(1.1, 0.4, bd);
  col = mix(col, uFoam, max(jig, 0.0) * uBobberAgitate * 0.5);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Ocean {
  constructor(scene) {
    const geo = new THREE.PlaneGeometry(170, 170, 108, 108);
    geo.rotateX(-Math.PI / 2);

    this.uniforms = {
      uTime: { value: 0 },
      uSandCenter: { value: new THREE.Vector2(SAND_CENTER.x, SAND_CENTER.z) },
      uSandStretch: { value: new THREE.Vector2(1.22, 0.92) },
      uRippleCenter: { value: new THREE.Vector2(0, 0) },
      uRippleStrength: { value: 0 },
      uBobberCenter: { value: new THREE.Vector2(-3.4, 1.6) },
      uBobberAgitate: { value: 0 },
      uDeep: { value: new THREE.Color('#1f6a80') },
      uShallow: { value: new THREE.Color('#5ec4bc') },
      uFoam: { value: new THREE.Color('#f2fbf7') },
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.y = 0.02;
    this.mesh.receiveShadow = false;
    scene.add(this.mesh);
  }

  setRippleCenter(x, z) {
    this.uniforms.uRippleCenter.value.set(x, z);
  }

  setRippleStrength(v) {
    this.uniforms.uRippleStrength.value = v;
  }

  setBobberAgitate(v) {
    this.uniforms.uBobberAgitate.value = v;
  }

  update(dt) {
    this.uniforms.uTime.value += dt;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
