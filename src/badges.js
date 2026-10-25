// Badges (значки): ten little enamel pins lost about the district, on a
// bench, the kiosk shelf, the bus stop seat, a stairwell landing... Each
// glints now and then to catch the eye; E picks it up, a card says which one
// it was, and the pause screen keeps the collection. What has been found
// stays found (localStorage); the badges have no colliders and their own
// placement, so the seeded world is untouched.
import * as THREE from 'three';
import { makeCanvas } from './util.js';

const STORAGE_KEY = 'pervyj-sneg:badges';
const REACH = 1.6; // m

/** The ten badges: name, English gloss, enamel colour and the emblem. */
export const BADGES = [
  {
    id: 'sputnik',
    name: 'Спутник',
    en: 'Sputnik, 1957',
    color: '#2d5a9e',
    sign: 'sputnik',
  },
  {
    id: 'vostok',
    name: 'Восток',
    en: 'Gagarin, 12 April 1961',
    color: '#b3261e',
    sign: 'rocket',
  },
  {
    id: 'luna',
    name: 'Луна-3',
    en: 'the far side of the Moon, 1959',
    color: '#1c2340',
    sign: 'moon',
  },
  {
    id: 'oktyabryonok',
    name: 'Октябрёнок',
    en: 'Little Octobrist',
    color: '#c8302a',
    sign: 'star',
  },
  {
    id: 'pioneer',
    name: 'Юный пионер',
    en: 'Young Pioneer',
    color: '#d8382c',
    sign: 'flame',
  },
  {
    id: 'gto',
    name: 'ГТО',
    en: 'Ready for Labour and Defence',
    color: '#2a6db0',
    sign: 'text:ГТО',
  },
  {
    id: 'tourist',
    name: 'Турист СССР',
    en: 'USSR Tourist',
    color: '#2f7a4a',
    sign: 'mountain',
  },
  {
    id: 'udarnik',
    name: 'Ударник',
    en: 'Shock worker of communist labour',
    color: '#8a1f1a',
    sign: 'gear',
  },
  {
    id: 'tokyo',
    name: 'Токио-64',
    en: 'the Olympic team, 1964',
    color: '#f1ece0',
    sign: 'rings',
  },
  {
    id: 'chess',
    name: 'Шахматы',
    en: 'district chess club, 2nd category',
    color: '#3b3b3b',
    sign: 'knight',
  },
];

/** Draws one badge face: a gold rim, the enamel and the emblem. */
export function drawBadge(b, size = 128) {
  const cv = makeCanvas(size, size);
  const c = cv.getContext('2d');
  const r = size / 2;
  c.translate(r, r);
  const gold = c.createLinearGradient(-r, -r, r, r);
  gold.addColorStop(0, '#f3d98a');
  gold.addColorStop(0.5, '#b08a3a');
  gold.addColorStop(1, '#f0d27c');
  c.fillStyle = gold;
  c.beginPath();
  c.arc(0, 0, r - 1, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = b.color;
  c.beginPath();
  c.arc(0, 0, r * 0.82, 0, Math.PI * 2);
  c.fill();
  // a glaze highlight across the enamel
  const glaze = c.createRadialGradient(-r * 0.3, -r * 0.35, 0, -r * 0.3, -r * 0.35, r);
  glaze.addColorStop(0, 'rgba(255,255,255,0.35)');
  glaze.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = glaze;
  c.fill();
  c.fillStyle = gold;
  c.strokeStyle = gold;
  c.lineWidth = size * 0.035;
  c.lineCap = 'round';
  const s = r * 0.62;
  const star = (cx, cy, R) => {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? R * 0.42 : R;
      c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    c.closePath();
    c.fill();
  };
  switch (b.sign) {
    case 'sputnik':
      c.beginPath();
      c.arc(-s * 0.15, -s * 0.15, s * 0.32, 0, Math.PI * 2);
      c.fill();
      for (const a of [0.5, 0.8, 1.1, 1.4]) {
        c.beginPath();
        c.moveTo(-s * 0.15, -s * 0.15);
        c.lineTo(-s * 0.15 + Math.cos(a) * s, -s * 0.15 + Math.sin(a) * s);
        c.stroke();
      }
      break;
    case 'rocket':
      c.save();
      c.rotate(Math.PI / 4);
      c.beginPath();
      c.moveTo(0, -s);
      c.quadraticCurveTo(s * 0.35, -s * 0.3, s * 0.22, s * 0.55);
      c.lineTo(-s * 0.22, s * 0.55);
      c.quadraticCurveTo(-s * 0.35, -s * 0.3, 0, -s);
      c.fill();
      c.fillRect(-s * 0.42, s * 0.3, s * 0.84, s * 0.14);
      c.restore();
      star(s * 0.55, s * 0.55, s * 0.22);
      break;
    case 'moon':
      c.beginPath();
      c.arc(0, 0, s * 0.7, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = b.color;
      c.beginPath();
      c.arc(s * 0.3, -s * 0.15, s * 0.6, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = gold;
      star(s * 0.45, s * 0.45, s * 0.18);
      break;
    case 'star':
      star(0, s * 0.05, s);
      break;
    case 'flame':
      c.beginPath();
      c.moveTo(0, -s);
      c.bezierCurveTo(s * 0.7, -s * 0.2, s * 0.5, s * 0.6, 0, s * 0.7);
      c.bezierCurveTo(-s * 0.5, s * 0.6, -s * 0.7, -s * 0.2, 0, -s);
      c.fill();
      c.fillStyle = b.color;
      c.beginPath();
      c.moveTo(0, -s * 0.2);
      c.bezierCurveTo(s * 0.3, s * 0.15, s * 0.2, s * 0.5, 0, s * 0.55);
      c.bezierCurveTo(-s * 0.2, s * 0.5, -s * 0.3, s * 0.15, 0, -s * 0.2);
      c.fill();
      break;
    case 'mountain':
      c.beginPath();
      c.moveTo(-s, s * 0.55);
      c.lineTo(-s * 0.25, -s * 0.6);
      c.lineTo(s * 0.1, -s * 0.05);
      c.lineTo(s * 0.4, -s * 0.4);
      c.lineTo(s, s * 0.55);
      c.closePath();
      c.fill();
      break;
    case 'gear':
      for (let i = 0; i < 10; i++) {
        c.save();
        c.rotate((i * Math.PI) / 5);
        c.fillRect(-s * 0.13, -s * 0.95, s * 0.26, s * 0.4);
        c.restore();
      }
      c.beginPath();
      c.arc(0, 0, s * 0.68, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = b.color;
      star(0, s * 0.03, s * 0.5);
      break;
    case 'rings': {
      const cols = ['#2c64b4', '#202020', '#c8302a', '#e0b02a', '#2f8a4a'];
      const at = [
        [-0.62, -0.15],
        [0, -0.15],
        [0.62, -0.15],
        [-0.31, 0.22],
        [0.31, 0.22],
      ];
      c.lineWidth = size * 0.04;
      at.forEach(([x, y], i) => {
        c.strokeStyle = cols[i];
        c.beginPath();
        c.arc(x * s, y * s, s * 0.3, 0, Math.PI * 2);
        c.stroke();
      });
      break;
    }
    case 'knight':
      c.beginPath();
      c.moveTo(-s * 0.45, s * 0.75);
      c.lineTo(s * 0.5, s * 0.75);
      c.lineTo(s * 0.35, s * 0.1);
      c.quadraticCurveTo(s * 0.55, -s * 0.5, -s * 0.05, -s * 0.85);
      c.lineTo(-s * 0.2, -s * 0.6);
      c.quadraticCurveTo(-s * 0.7, -s * 0.3, -s * 0.6, 0);
      c.lineTo(-s * 0.1, -s * 0.05);
      c.lineTo(-s * 0.45, s * 0.75);
      c.fill();
      break;
    default: {
      const text = b.sign.slice(5);
      c.font = `bold ${Math.round(s * 0.75)}px Arial, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(text, 0, s * 0.05);
    }
  }
  return cv;
}

/** Where they were lost: an outdoor spot dropped onto whatever is there, or a fixed indoor one. */
function badgeSpots(world, landing) {
  const bus = world.points.busStop;
  const counter = world.points.counter;
  const rink = world.surfaceRects.find((r) => r.type === 'ice');
  return [
    { x: -26.7, z: -15.95 }, // the courtyard bench behind building 12
    counter && { x: counter.x + 0.9, z: counter.z + 0.86 }, // the kiosk shelf
    bus && { x: bus.x + 0.86, z: bus.z - 0.3, top: 1.1 }, // the bus stop seat, under the roof
    { x: -12.5, z: -4.5 }, // the bench on the obelisk square
    { x: 42.71, z: 22.73 }, // the bench by the east courtyard path
    { x: -34.5, z: -19.2 }, // the playground
    rink && { x: rink.minX - 0.6, z: (rink.minZ + rink.maxZ) / 2 }, // by the rink
    { x: -27.1, z: 129.2 }, // a bench in the north courtyard
    { x: 30.4, z: 141.4 }, // another, further along
    landing && {
      x: landing.x + 0.75,
      z: landing.z + 0.35,
      top: landing.y + 1.4,
    }, // the stairwell landing, under the window
  ];
}

export class Badges {
  constructor({ world, sound, landing }) {
    this.world = world;
    this.sound = sound;
    this.found = new Set();
    try {
      for (const id of JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')) this.found.add(id);
    } catch {
      // private window: nothing remembered, nothing lost
    }
    this.group = new THREE.Group();
    this.group.name = 'badges';
    this.group.userData.dynamic = true;
    this.items = [];
    this.t = 0;
    this.placed = false;
    this.spots = badgeSpots(world, landing);
    this.faces = BADGES.map((b) => drawBadge(b));
    const glintTex = new THREE.CanvasTexture(
      (() => {
        const cv = makeCanvas(64, 64);
        const c = cv.getContext('2d');
        const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, 'rgba(255,248,220,1)');
        g.addColorStop(0.15, 'rgba(255,236,170,0.7)');
        g.addColorStop(1, 'rgba(255,220,140,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, 64, 64);
        // a four-pointed sparkle
        c.fillStyle = 'rgba(255,250,230,0.9)';
        c.fillRect(30, 2, 4, 60);
        c.fillRect(2, 30, 60, 4);
        return cv;
      })(),
    );
    const disc = new THREE.CylinderGeometry(0.045, 0.045, 0.008, 24);
    const rim = new THREE.MeshStandardMaterial({
      color: 0xc9a24a,
      metalness: 0.8,
      roughness: 0.35,
    });
    BADGES.forEach((b, i) => {
      const spot = this.spots[i];
      if (!spot) return;
      const face = new THREE.MeshStandardMaterial({
        map: new THREE.CanvasTexture(this.faces[i]),
        metalness: 0.35,
        roughness: 0.3,
      });
      face.map.colorSpace = THREE.SRGBColorSpace;
      // the face on top, the gold on the edge and the back
      const mesh = new THREE.Mesh(disc, [rim, face, rim]);
      mesh.name = `badge-${b.id}`;
      mesh.rotation.y = i * 1.7;
      mesh.castShadow = true;
      const glint = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glintTex,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      glint.scale.setScalar(0.34);
      const root = new THREE.Group();
      root.add(mesh, glint);
      root.visible = !this.found.has(b.id);
      this.group.add(root);
      this.items.push({
        badge: b,
        i,
        root,
        glint,
        spot,
        x: spot.x,
        z: spot.z,
        y: 0,
        phase: i * 0.73,
      });
    });

    // the card that comes up when one is found
    this.card = document.createElement('div');
    this.card.id = 'badge-card';
    this.card.innerHTML = `<canvas width="128" height="128"></canvas><div><b></b><span></span><i></i></div>`;
    document.body.appendChild(this.card);
    // the collection, on the pause screen
    this.shelf = document.createElement('div');
    this.shelf.id = 'badge-shelf';
    const panel = document.querySelector('#pause .actions');
    panel?.parentNode.insertBefore(this.shelf, panel);
    this.drawShelf();
  }

  get count() {
    return this.found.size;
  }

  /** Drops each badge onto whatever it lies on (once the world is built: about half a second). */
  place() {
    this.placed = true;
    const ray = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    this.world.group.updateMatrixWorld(true);
    const solid = [];
    this.world.group.traverse((o) => {
      if (o.isMesh && !o.isInstancedMesh && !o.material?.transparent && o.visible && !this.group.children.includes(o.parent)) solid.push(o);
    });
    for (const it of this.items) {
      const top = it.spot.top ?? 3;
      ray.set(new THREE.Vector3(it.x, top, it.z), down);
      ray.far = top + 1;
      const hit = ray.intersectObjects(solid, false).find((h) => h.object.parent !== it.root);
      it.y = (hit ? hit.point.y : this.world.heightAt(it.x, it.z)) + 0.004;
      it.root.position.set(it.x, it.y, it.z);
      it.glint.position.set(0, 0.04, 0);
    }
  }

  /** The badge within reach of (x, y, z), nearest first. */
  near(x, y, z) {
    let best = null;
    let bestD = REACH;
    for (const it of this.items) {
      if (this.found.has(it.badge.id)) continue;
      if (Math.abs(y - it.y) > 2.2) continue;
      const d = Math.hypot(it.x - x, it.z - z);
      if (d < bestD) {
        best = it;
        bestD = d;
      }
    }
    return best;
  }

  /** Picks one up: true if it was new. */
  take(it) {
    const id = it.badge.id;
    if (this.found.has(id)) return false;
    this.found.add(id);
    it.root.visible = false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.found]));
    } catch {
      // not remembered: still in the pocket this time round
    }
    this.sound?.ui?.('confirm');
    this.show(it);
    this.drawShelf();
    return true;
  }

  show(it) {
    const b = it.badge;
    this.card.querySelector('canvas').getContext('2d').drawImage(this.faces[it.i], 0, 0);
    this.card.querySelector('b').textContent = `Значок «${b.name}»`;
    this.card.querySelector('span').textContent = b.en;
    this.card.querySelector('i').textContent = `${this.count} of ${BADGES.length} found`;
    this.card.classList.add('visible');
    clearTimeout(this.cardTimer);
    this.cardTimer = setTimeout(() => this.card.classList.remove('visible'), 4500);
  }

  drawShelf() {
    this.shelf.innerHTML = `<div class="shelf-title">Значки · ${this.count} / ${BADGES.length}</div>`;
    const row = document.createElement('div');
    row.className = 'shelf-row';
    BADGES.forEach((b, i) => {
      const slot = document.createElement('div');
      slot.className = 'slot';
      if (this.found.has(b.id)) {
        const cv = makeCanvas(56, 56);
        cv.getContext('2d').drawImage(this.faces[i], 0, 0, 56, 56);
        slot.appendChild(cv);
        slot.title = `${b.name} — ${b.en}`;
      } else {
        slot.textContent = '?';
      }
      row.appendChild(slot);
    });
    this.shelf.appendChild(row);
  }

  update(dt) {
    if (!this.placed) this.place();
    this.t += dt;
    for (const it of this.items) {
      if (!it.root.visible) continue;
      // a glint every few seconds, as the light catches the enamel
      const k = ((this.t + it.phase * 3) % 2.6) / 0.5;
      it.glint.material.opacity = k < 1 ? Math.sin(k * Math.PI) * 0.9 : 0;
      it.glint.material.rotation = this.t * 0.6;
    }
  }
}
