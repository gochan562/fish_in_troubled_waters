import * as THREE from 'three';

/**
 * Splits a loaded mesh that contains multiple geometry groups (one per GLTF
 * primitive) into separate Mesh objects, so each primitive can be animated
 * independently. Materials are shared, not cloned.
 */
export function splitMeshByGroups(mesh) {
  const geo = mesh.geometry;
  if (!geo.groups || geo.groups.length <= 1) return [mesh];

  const index = geo.index;
  const out = [];
  for (const group of geo.groups) {
    const start = group.start;
    const count = group.count;
    const subIndex = index
      ? index.array.slice(start, start + count)
      : null;

    const sub = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(geo.attributes)) {
      sub.setAttribute(name, attr);
    }
    if (subIndex) {
      sub.setIndex(new THREE.BufferAttribute(subIndex, index.itemSize));
    }
    sub.groups = []; // single material per sub-mesh

    const m = new THREE.Mesh(sub, mesh.material[group.materialIndex]);
    m.position.copy(mesh.position);
    m.rotation.copy(mesh.rotation);
    m.scale.copy(mesh.scale);
    m.name = `${mesh.name}_g${group.materialIndex}`;
    out.push(m);
  }
  return out;
}

/**
 * Splits a geometry's triangles into "above plane" and "below plane" halves
 * based on the average Y of each triangle. Used to articulate the clam's
 * two shells out of a single merged mesh.
 * Returns { top: BufferGeometry, bottom: BufferGeometry } (index-only split;
 * position/normal/uv attributes are shared with the source geometry).
 */
export function splitGeometryByYPlane(geometry, threshold = 0) {
  const index = geometry.index;
  const pos = geometry.attributes.position;
  const topTris = [];
  const bottomTris = [];

  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);
    const yAvg = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3;
    if (yAvg > threshold) topTris.push(a, b, c);
    else bottomTris.push(a, b, c);
  }

  const make = (tris) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', geometry.attributes.position);
    g.setAttribute('normal', geometry.attributes.normal);
    if (geometry.attributes.uv) g.setAttribute('uv', geometry.attributes.uv);
    g.setIndex(tris);
    return g;
  };

  return { top: make(topTris), bottom: make(bottomTris) };
}
