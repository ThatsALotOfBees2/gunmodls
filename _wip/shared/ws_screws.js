// Screw head with its drive recess ("inlet"). Built along +y with the underside at y = 0.
// style: 'slot' (flat blade), 'phillips' (cross), 'hex' (socket). countersunk heads sit nearly flush.
function screwHead(r, { style = 'slot', h, countersunk = false, seg = 36 } = {}) {
  if (h === undefined) h = countersunk ? r * 0.5 : r * 0.6;
  const prof = countersunk
    ? [[0, 0], [r * 0.5, 0], [r, h - 0.006], [r, h], [0, h]]
    : [[0, 0], [r, 0], [r, h * 0.45], [r * 0.86, h * 0.82], [r * 0.55, h * 0.97], [0, h]];
  let g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), seg);
  // the recess a driver goes into: deep enough to grip, open across the head for a blade
  const d = Math.min(h * 0.85, r * 0.62);
  if (style === 'slot') g = subtract(g, box(-r * 1.3, r * 1.3, h - d, h + 0.2, -r * 0.17, r * 0.17));
  else if (style === 'phillips') {
    g = subtractEach(g, box(-r * 0.68, r * 0.68, h - d, h + 0.2, -r * 0.13, r * 0.13), box(-r * 0.13, r * 0.13, h - d, h + 0.2, -r * 0.68, r * 0.68));
  } else if (style === 'hex') {
    g = subtract(g, new THREE.CylinderGeometry(r * 0.5, r * 0.5, d * 2, 6).translate(0, h, 0));
  }
  return creased(g, 35);
}
// Put a screw head at pos with its axis along normal; spin turns the recess about that axis.
function placeScrew(geo, pos, normal, spin = 0) {
  geo.applyMatrix4(new THREE.Matrix4().makeRotationY(spin));
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal.clone().normalize()));
  geo.translate(pos.x, pos.y, pos.z);
  return geo;
}
