// The light switches in the flats: three in the hall, as in every flat of
// these blocks (the kitchen's and the room's beside their doorways, the
// hall's own by the front door). E at one snaps its rocker over and the
// lamp it serves goes out or comes back on, so you can stand in a dark
// kitchen and look out at the yard. Each flat keeps its own. Live only:
// no seeded stream, the plates are added to the flats' own groups.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SWITCHES, LIGHT_LEVELS } from './world/flats.js';
import { INTERIOR_LAYER } from './world/interiors.js';

export const ROOMS = ['kitchen', 'room', 'hall'];
const HEIGHT = 1.45; // switches at shoulder height, as they were fitted
const TILT = 0.22; // the rocker's throw, rad
const LAMP_ON = new THREE.Color(1.9, 1.15, 0.55);
const LAMP_OFF = new THREE.Color(0.025, 0.022, 0.02);
const NOTE = 1.6;

export class LightSwitches {
  constructor({ world }) {
    this.world = world;
    this.flips = 0;
    this.note = null;
    this.noteT = 0;
    const plate = new THREE.BoxGeometry(0.085, 0.085, 0.016);
    const plateMat = new THREE.MeshStandardMaterial({ color: 0xe9e2d0, roughness: 0.55 });
    this.rockerGeo = new THREE.BoxGeometry(0.03, 0.05, 0.016);
    this.rockerMat = new THREE.MeshStandardMaterial({ color: 0xd9d0bb, roughness: 0.5 });
    this.flats = (world.flats ?? []).filter((f) => f.lightOn && f.group);
    for (const flat of this.flats) {
      flat.rockers = [];
      const plates = SWITCHES.map((s) => plate.clone().translate(s.x, HEIGHT, s.z + s.facing * 0.008));
      const mesh = new THREE.Mesh(mergeGeometries(plates), plateMat);
      mesh.layers.set(INTERIOR_LAYER);
      flat.group.add(mesh);
      SWITCHES.forEach((s) => {
        const rocker = new THREE.Mesh(this.rockerGeo, this.rockerMat);
        rocker.position.set(s.x, HEIGHT, s.z + s.facing * 0.02);
        rocker.layers.set(INTERIOR_LAYER);
        flat.group.add(rocker);
        flat.rockers.push(rocker);
      });
      this.#show(flat);
    }
  }

  /** Where each switch is in the world and which way it faces. */
  static spots(flat) {
    const x = flat.group.position.x;
    const z = flat.group.position.z;
    return SWITCHES.map((s, i) => ({ i, x: x + s.x, z: z + s.z, facing: s.facing, room: ROOMS[i] }));
  }

  prompt(flat, i) {
    return `E — switch the ${ROOMS[i]} light ${flat.lightOn[i] ? 'off' : 'on'}`;
  }

  /** E at switch i: the lamp it serves goes out, or comes on. */
  flip(flat, i) {
    flat.lightOn[i] = !flat.lightOn[i];
    this.flips++;
    this.#show(flat);
    // the shared lamp lights follow when they are parked in this flat
    const light = this.world.flatLights?.[i];
    if (light && this.world.litFlat === flat) light.intensity = flat.lightOn[i] ? LIGHT_LEVELS[i] : 0;
    this.note = flat.lightOn.some(Boolean) ? null : 'All dark: only the yard outside';
    this.noteT = this.note ? NOTE : 0;
    return flat.lightOn[i];
  }

  #show(flat) {
    flat.lightOn.forEach((on, i) => {
      flat.lampMats?.[i]?.color.copy(on ? LAMP_ON : LAMP_OFF);
      // the top pressed in for on, as the old ones went
      if (flat.rockers[i]) flat.rockers[i].rotation.x = (on ? -TILT : TILT) * SWITCHES[i].facing;
    });
  }

  update(dt) {
    if (this.noteT > 0) {
      this.noteT -= dt;
      if (this.noteT <= 0) this.note = null;
    }
  }
}
