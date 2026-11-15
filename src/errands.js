// Things to do for a few roubles: parcels carried from a shop counter to a
// door somewhere in town (or out on the islands), and a winter rod for the
// bay ice, the catch sold back over the same counter.
import * as THREE from 'three';
import { isIce } from './world/land.js';

const ROD_PRICE = 120;
const FISH_PRICE = 30; // roubles a kilo
/** name, lightest, heaviest (kg), how often it bites */
const FISH = [
  ['Навага', 0.2, 0.5, 9],
  ['Корюшка', 0.05, 0.15, 7],
  ['Камбала', 0.3, 1.1, 4],
  ['Треска', 0.8, 3.2, 3],
  ['Зубатка', 2.0, 6.0, 1],
];

const round5 = (v) => Math.round(v / 5) * 5;

export class Errands {
  constructor({ scene, camera, world, player, ui, sound, state, driving, actions }) {
    Object.assign(this, { camera, world, player, ui, sound, state, driving, actions });
    this.rubles = 0;
    this.rod = false;
    this.fish = [];
    this.delivered = 0;
    /** The parcel being carried: { door, pay }. */
    this.job = null;
    this.fishing = null;
    this.hudT = 0;
    actions.errands = this;

    // a column of light over the door a parcel is going to
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 70, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    this.beacon.visible = false;
    scene.add(this.beacon);

    // the hole in the ice and the short rod propped beside it
    const hole = new THREE.Group();
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.16, 14), new THREE.MeshBasicMaterial({ color: 0x06141c }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.012;
    const rim = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.3, 14), new THREE.MeshStandardMaterial({ color: 0xe6edf2, roughness: 1 }));
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.02;
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.8 });
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.05), wood);
    stand.position.set(0.34, 0.08, 0);
    this.rodTip = new THREE.Group();
    this.rodTip.position.set(0.34, 0.16, 0);
    const stick = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.018, 0.018), wood);
    stick.position.x = -0.16;
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.2, 0.004), new THREE.MeshBasicMaterial({ color: 0xcfd6da }));
    line.position.set(-0.35, -0.1, 0);
    this.rodTip.add(stick, line);
    hole.add(water, rim, stand, this.rodTip);
    hole.visible = false;
    scene.add(hole);
    this.hole = hole;

    this.register();
    this.refresh();
  }

  register() {
    const { world } = this;
    const list = world.interactables;
    const shop = world.rooms?.shop;
    if (shop?.counter) {
      for (const key of ['KeyE', 'KeyF']) {
        list.push({
          id: `counter-${key}`,
          key,
          x: shop.counter.x,
          z: shop.counter.z,
          radius: 1.9,
          available: () => world.inside === shop,
          prompt: () => this.counterPrompt(),
          onUse: () => (key === 'KeyE' ? this.takeParcel() : this.trade()),
        });
      }
    }
    // the door a parcel is addressed to
    const self = this;
    list.push({
      id: 'parcel-door',
      get x() {
        return self.job?.door.x ?? 0;
      },
      get z() {
        return self.job?.door.z ?? 0;
      },
      radius: 2.6,
      available: () => !!this.job && !world.inside,
      prompt: () => 'E — hand over the parcel',
      onUse: () => this.deliver(),
    });
  }

  /* ------------------------------------------------------- the counter */

  catchValue() {
    return Math.max(5, round5(this.fish.reduce((sum, f) => sum + f.kg, 0) * FISH_PRICE));
  }

  counterPrompt() {
    const parts = [this.job ? `Parcel for ${this.job.door.address}` : 'E — take a parcel to deliver'];
    if (this.fish.length) parts.push(`F — sell the catch (${this.catchValue()} ₽)`);
    else if (!this.rod) parts.push(`F — winter fishing rod (${ROD_PRICE} ₽)`);
    return parts.join(' · ');
  }

  takeParcel() {
    if (this.job) return this.sound.ui('tick');
    const from = this.actions.lastDoor ?? this.player.position;
    const doors = this.world.doors.filter((d) => !d.inside && !d.public && d.address && Math.hypot(d.x - from.x, d.z - from.z) > 120);
    if (!doors.length) return null;
    const door = doors[Math.floor(Math.random() * doors.length)];
    const pay = round5(40 + Math.hypot(door.x - from.x, door.z - from.z) * 0.11);
    this.setJob({ door, pay });
    this.sound.ui('confirm');
    this.ui.toast(`Посылка · ${door.address} · ${pay} ₽`, 'M — map');
    return this.job;
  }

  setJob(job) {
    this.job = job;
    this.beacon.visible = !!job;
    // it starts above the porch roof: nobody stands inside it
    if (job) this.beacon.position.set(job.door.x, job.door.y + 39, job.door.z);
    this.refresh();
  }

  deliver() {
    const { job } = this;
    if (!job) return;
    this.rubles += job.pay;
    this.delivered++;
    this.setJob(null);
    this.sound.door();
    this.sound.ui('confirm');
    this.ui.toast(`Доставлено · +${job.pay} ₽`, 'Delivered');
  }

  /** F at the counter: the catch is sold first, then there is a rod to buy. */
  trade() {
    if (this.fish.length) {
      const value = this.catchValue();
      this.rubles += value;
      this.fish = [];
      this.sound.ui('confirm');
      this.ui.toast(`Улов продан · +${value} ₽`, 'Catch sold');
    } else if (!this.rod) {
      if (this.rubles < ROD_PRICE) {
        this.sound.ui('tick');
        this.ui.toast(`Не хватает ${ROD_PRICE - this.rubles} ₽`, 'Not enough money — deliver a parcel first');
      } else {
        this.rubles -= ROD_PRICE;
        this.rod = true;
        this.sound.ui('confirm');
        this.ui.toast('Зимняя удочка', 'Walk out onto the bay ice and press F');
      }
    } else this.sound.ui('tick');
    this.refresh();
  }

  /* ------------------------------------------------------- the ice */

  canFish() {
    const { world, driving, state, player } = this;
    if (!this.rod || world.inside || driving.active || state.smoking || this.fishing) return false;
    const { x, z } = player.position;
    if (!isIce(x, z) || !isIce(x + 6, z) || !isIce(x - 6, z)) return false;
    return !this.actions.nearest();
  }

  startFishing() {
    const { player, world } = this;
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    const x = player.position.x + fx * 1.1;
    const z = player.position.z + fz * 1.1;
    this.hole.position.set(x, world.heightAt(x, z), z);
    this.hole.rotation.y = player.yaw;
    this.hole.visible = true;
    player.enabled = false;
    player.pitch = -0.55;
    this.state.fishing = true;
    this.fishing = { wait: 4 + Math.random() * 8, bite: 0 };
    this.sound.ui('tick');
  }

  stopFishing() {
    if (!this.fishing) return;
    this.fishing = null;
    this.hole.visible = false;
    this.state.fishing = false;
    if (this.state.mode === 'playing') this.player.enabled = true;
  }

  strike() {
    const f = this.fishing;
    if (f.bite <= 0) {
      // pulled on nothing: whatever was nosing the hook is gone
      f.wait = 5 + Math.random() * 8;
      return this.sound.ui('tick');
    }
    const total = FISH.reduce((sum, row) => sum + row[3], 0);
    let pick = Math.random() * total;
    const row = FISH.find((r) => (pick -= r[3]) < 0) ?? FISH[0];
    const kg = Math.round((row[1] + Math.random() ** 2 * (row[2] - row[1])) * 100) / 100;
    this.fish.push({ name: row[0], kg });
    f.bite = 0;
    f.wait = 5 + Math.random() * 9;
    this.sound.ui('confirm');
    this.ui.toast(`${row[0]} · ${kg.toFixed(2)} кг`, 'Sell it at any shop counter');
    this.refresh();
    return true;
  }

  /* ------------------------------------------------------- keys, prompt, frame */

  /** The prompt this module wants on screen, or undefined to leave it. */
  prompt() {
    if (this.fishing) return this.fishing.bite > 0 ? 'E — strike!' : 'Waiting for a bite… · F — pack up';
    if (this.canFish()) return 'F — drill a hole and fish';
    return undefined;
  }

  /** True when the key was ours. */
  onKey(event) {
    const { code } = event;
    if (this.fishing) {
      if (event.repeat) return true;
      if (code === 'KeyE') this.strike();
      else if (code === 'KeyF') this.stopFishing();
      return true;
    }
    if (code === 'KeyF' && !event.repeat && this.canFish()) {
      this.startFishing();
      return true;
    }
    return false;
  }

  update(dt, t) {
    const f = this.fishing;
    if (f) {
      if (f.bite > 0) {
        f.bite -= dt;
        this.rodTip.rotation.z = 0.5 + Math.sin(t * 38) * 0.16;
        if (f.bite <= 0) {
          f.wait = 4 + Math.random() * 8;
          this.ui.toast('Сорвалась', 'It got away');
        }
      } else {
        this.rodTip.rotation.z = Math.sin(t * 1.3) * 0.02;
        f.wait -= dt;
        if (f.wait <= 0) {
          f.bite = 1.5;
          this.sound.ui('tick');
        }
      }
    }
    if (this.job) {
      this.beacon.material.opacity = 0.22 + 0.1 * Math.sin(t * 2.4);
      this.hudT -= dt;
      if (this.hudT <= 0) {
        this.hudT = 0.2;
        this.refresh();
      }
    }
  }

  /** Where the parcel is going, from where the camera stands. */
  bearing() {
    const { camera, job, world } = this;
    const dir = camera.getWorldDirection(new THREE.Vector3());
    // a room is nowhere near its door: measure from the door you came in by
    const from = (world.inside && this.actions.lastDoor) || camera.position;
    const dx = job.door.x - from.x;
    const dz = job.door.z - from.z;
    return { distance: Math.hypot(dx, dz), angle: Math.atan2(dx * -dir.z + dz * dir.x, dx * dir.x + dz * dir.z) };
  }

  refresh() {
    const kg = this.fish.reduce((sum, x) => sum + x.kg, 0);
    this.ui.setWallet(`${this.rubles} ₽${this.fish.length ? ` · улов ${kg.toFixed(1)} кг` : ''}`);
    if (!this.job) return this.ui.setTask(null);
    const { distance, angle } = this.bearing();
    const far = distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${Math.round(distance / 10) * 10} m`;
    return this.ui.setTask(`Посылка · ${this.job.door.address} · ${far}`, angle);
  }

  /* ------------------------------------------------------- the saved game */

  snapshot() {
    return { rubles: this.rubles, rod: this.rod, fish: this.fish, delivered: this.delivered, job: this.job ? { door: this.world.doors.indexOf(this.job.door), pay: this.job.pay } : null };
  }

  restore(data) {
    this.stopFishing();
    this.rubles = data?.rubles ?? 0;
    this.rod = !!data?.rod;
    this.fish = Array.isArray(data?.fish) ? data.fish : [];
    this.delivered = data?.delivered ?? 0;
    const door = data?.job ? this.world.doors[data.job.door] : null;
    this.setJob(door ? { door, pay: data.job.pay } : null);
  }
}
