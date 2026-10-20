// Drifting ground mist: a handful of large soft-alpha planes sliding slowly
// through the courtyards and down the far ends of the avenue. A depth cue
// only — opacity stays low and follows the active fog density and season.
import * as THREE from 'three';
import { Rng, TAU, smoothstep } from '../util.js';
import { makeMistTexture } from '../textures.js';

const WRAP = 135;

export class Mist {
  constructor(scene) {
    const tex = makeMistTexture();
    const rng = new Rng(5150);
    this.planes = [];
    const geo = new THREE.PlaneGeometry(1, 1);
    // two wisps over the far avenue ends, two in the courtyards, two roaming
    const spots = [
      [rng.float(-8, 8), rng.float(58, 88)],
      [rng.float(-8, 8), rng.float(-88, -58)],
      [rng.float(-58, -28), rng.float(-40, 10)],
      [rng.float(28, 58), rng.float(-20, 40)],
      [rng.float(-80, 80), rng.float(-90, 90)],
      [rng.float(-80, 80), rng.float(-90, 90)],
    ];
    for (const [x, z] of spots) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.scale.set(rng.float(36, 58), rng.float(7, 12), 1);
      mesh.position.set(x, rng.float(2.0, 5.2), z);
      mesh.rotation.y = rng.float(0, TAU);
      mesh.renderOrder = 4;
      scene.add(mesh);
      this.planes.push({
        mesh,
        mat,
        speed: rng.float(0.5, 1.25),
        phase: rng.float(0, TAU),
        base: rng.float(0.05, 0.095),
      });
    }
  }

  update(dt, t, wind, cam, density, color) {
    for (const p of this.planes) {
      const pos = p.mesh.position;
      pos.x += (wind.x * 0.55 + Math.sin(t * 0.05 + p.phase) * 0.25) * p.speed * dt;
      pos.z += (wind.z * 0.55 + Math.cos(t * 0.043 + p.phase) * 0.25) * p.speed * dt;
      // slow yaw drift so a plane never stands edge-on for long
      p.mesh.rotation.y += dt * 0.01 * p.speed;
      if (pos.x > WRAP) pos.x = -WRAP;
      else if (pos.x < -WRAP) pos.x = WRAP;
      if (pos.z > WRAP) pos.z = -WRAP;
      else if (pos.z < -WRAP) pos.z = WRAP;
      // fade out before the camera slices through the plane
      const d = Math.hypot(pos.x - cam.x, pos.z - cam.z);
      p.mat.opacity = p.base * density * smoothstep(5, 17, d);
      p.mat.color.copy(color);
    }
  }
}
