// A chalk target on a garage door: rings drawn by some kid, for snowballs.
// A ball that lands inside scores (10 in the middle, then 5, then 2) and the
// running score comes up for a moment; E at the door wipes it and starts
// again. Live only: nothing here draws on the world's seeded stream.
import * as THREE from 'three';
import { makeCanvas, Rng } from './util.js';

// garage № 5 in the co-op row (x = -70, doors facing +x)
const FACE_X = -67.11;
const CZ = -15.45;
const CY = 1.3;
const R = 0.5; // the outer ring
const RINGS = [
  [R * 0.34, 10],
  [R * 0.68, 5],
  [R, 2],
];
const NOTE = 2.5; // s the score stays up

function makeChalkTexture(size = 256) {
  const canvas = makeCanvas(size, size);
  const c = canvas.getContext('2d');
  const rng = new Rng(5150);
  c.clearRect(0, 0, size, size);
  c.strokeStyle = 'rgba(244,244,236,0.85)';
  c.fillStyle = 'rgba(244,244,236,0.85)';
  c.lineCap = 'round';
  const mid = size / 2;
  const scale = (size / 2 - 6) / R;
  // each ring gone round twice, by a hand that doesn't quite close it
  for (const [r] of RINGS) {
    for (let pass = 0; pass < 2; pass++) {
      c.lineWidth = rng.float(3, 5);
      c.beginPath();
      const a0 = rng.float(0, Math.PI * 2);
      const wob = rng.float(0.01, 0.03);
      for (let k = 0; k <= 48; k++) {
        const a = a0 + (k / 48) * Math.PI * 2.05;
        const rr = r * scale * (1 + Math.sin(a * 3 + pass) * wob);
        const x = mid + Math.cos(a) * rr;
        const y = mid + Math.sin(a) * rr;
        if (k === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
  }
  c.font = 'bold 34px Arial, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('10', mid, mid + 2);
  c.font = 'bold 24px Arial, sans-serif';
  c.fillText('5', mid, mid - R * 0.51 * scale);
  c.fillText('2', mid, mid - R * 0.84 * scale);
  // chalk is dry: knock specks out of the strokes
  c.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 1400; i++) {
    c.fillStyle = `rgba(0,0,0,${rng.float(0.3, 0.9)})`;
    c.fillRect(rng.float(0, size), rng.float(0, size), rng.float(1, 2.5), rng.float(1, 2.5));
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Target {
  constructor({ world, sound }) {
    this.world = world;
    this.sound = sound;
    this.score = 0;
    this.hits = 0;
    this.best = 0; // the most points from one chalking
    this.last = null; // points for the last ball that scored
    this.note = null;
    this.noteT = 0;
    // the garages stand at y = 0, whatever the ground does
    this.center = new THREE.Vector3(FACE_X, CY, CZ);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(R * 2 + 0.05, R * 2 + 0.05),
      new THREE.MeshStandardMaterial({
        map: makeChalkTexture(),
        transparent: true,
        depthWrite: false,
        roughness: 1,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    mesh.rotation.y = Math.PI / 2;
    mesh.position.copy(this.center).x += 0.006;
    mesh.name = 'chalk-target';
    world.group.add(mesh);
    this.mesh = mesh;
  }

  /** A snowball landed somewhere: did it land on the target? Points, or 0. */
  impact(kind, pos) {
    if (kind !== 'wall' || Math.abs(pos.x - FACE_X) > 0.12) return 0;
    const r = Math.hypot(pos.z - this.center.z, pos.y - this.center.y);
    const ring = RINGS.find(([rr]) => r <= rr);
    if (!ring) return 0;
    const points = ring[1];
    this.score += points;
    this.hits++;
    this.last = points;
    this.best = Math.max(this.best, this.score);
    this.note = `${points === 10 ? 'Bullseye! ' : ''}+${points} · ${this.score} points in ${this.hits} ${this.hits === 1 ? 'hit' : 'hits'}`;
    this.noteT = NOTE;
    this.sound?.ui?.(points === 10 ? 'confirm' : 'tick');
    return points;
  }

  /** Up at the door, to wipe it. */
  distanceTo(x, z) {
    if (this.score === 0) return Infinity;
    if (x < FACE_X) return Infinity;
    return Math.hypot(x - FACE_X, z - this.center.z);
  }

  get prompt() {
    return `Chalk target: ${this.score} points in ${this.hits} ${this.hits === 1 ? 'hit' : 'hits'} · E — wipe it and start again`;
  }

  wipe() {
    this.score = 0;
    this.hits = 0;
    this.last = null;
    this.note = null;
  }

  /** The running score, to anyone close enough to see the door. */
  noteFor(x, z) {
    return this.note && Math.hypot(x - this.center.x, z - this.center.z) < 40 ? this.note : null;
  }

  update(dt) {
    if (this.noteT > 0) {
      this.noteT -= dt;
      if (this.noteT <= 0) this.note = null;
    }
  }
}
