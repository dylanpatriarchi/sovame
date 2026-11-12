// What the player can do in the world, and the keys that do it: the kiosk
// radio, a smoke or a mug of tea on any bench, getting in and out of the
// cars, the radio in the dashboard. main.js owns the modes (title, playing,
// paused); this owns everything that happens while playing.
import { smokeSpots } from './smoke.js';
import { TIME_PRESETS } from './config.js';

export class Interactions {
  constructor({ world, player, ui, sound, smoke, driving, state, env }) {
    Object.assign(this, { world, player, ui, sound, smoke, driving, state, env });
    /** One broadcast, two sets: the kiosk's and the one in the dashboard. */
    this.radioSets = { kiosk: false, car: false };
    this.lastPrompt = null;
    this.register();
  }

  /* ------------------------------------------------------- registry */

  register() {
    const { world, smoke, driving } = this;
    const list = world.interactables;
    const radio = world.points.radio;
    if (radio) {
      list.push({
        id: 'radio',
        x: radio.x,
        z: radio.z,
        radius: 7,
        prompt: () => (this.radioSets.kiosk ? 'E — turn off the radio' : 'E — turn on the radio'),
        onUse: () => this.toggleRadio('kiosk'),
      });
    }
    // every bench: F for a smoke, G for tea
    for (const spot of smokeSpots(world)) {
      for (const [key, mode] of [
        ['KeyF', 'smoke'],
        ['KeyG', 'tea'],
      ]) {
        list.push({
          id: mode === 'tea' ? `${spot.id}:tea` : spot.id,
          key,
          x: spot.x,
          z: spot.z,
          y: spot.y,
          radius: spot.radius,
          available: () => smoke.available(spot, mode),
          prompt: () => 'F — have a smoke · G — tea from the thermos',
          onUse: () => this.startSmoke(spot, mode),
        });
      }
    }
    // every door in town says what it is: the few that open stand open
    // with a lit plate over them, the rest are locked
    for (const door of world.doors ?? []) {
      const where = door.label === 'home' ? 'E — go home' : `E — go in · ${door.label}`;
      list.push({
        id: door.inside ? `door-${door.inside}` : 'door-locked',
        x: door.x,
        z: door.z,
        // an open door calls from the foot of the steps, a locked one
        // only answers when you are standing at it
        y: door.inside ? undefined : door.y,
        radius: door.inside ? 2.6 : 1.2,
        available: () => !world.inside,
        prompt: () => (door.inside ? where : door.public ? `${door.label} — закрыто · closed` : 'Заперто · locked'),
        onUse: () => (door.inside ? this.enterRoom(door) : this.sound.ui('tick')),
      });
    }
    for (const room of world.roomList ?? []) {
      list.push({
        id: `exit-${room.id}`,
        x: room.door.x,
        z: room.door.z,
        radius: 1.3,
        available: () => world.inside === room,
        prompt: () => 'E — go outside',
        onUse: () => this.leaveRoom(),
      });
      for (const use of room.uses) {
        list.push({
          id: `${room.id}-${use.id}`,
          x: use.x,
          z: use.z,
          radius: use.radius,
          available: () => world.inside === room,
          prompt: () => 'E — lie down for a few hours',
          onUse: () => this.sleep(),
        });
      }
    }
    // the boats: E to take the helm, from the shore or the ice beside one
    for (const boat of world.boats ?? []) {
      list.push({
        id: `boat-${boat.id}`,
        get x() {
          return boat.x;
        },
        get z() {
          return boat.z;
        },
        distanceTo: (x, z) => boat.distanceTo(x, z),
        radius: 4.2,
        available: () => !driving.active,
        prompt: () => 'E — take the boat',
        onUse: () => this.enterCar(boat),
      });
    }
    // every parked car: E to get in (the prompt follows the car around)
    for (const car of world.cars ?? []) {
      list.push({
        id: `car-${car.id}`,
        get x() {
          return car.x;
        },
        get z() {
          return car.z;
        },
        // measured from the bodywork, not the car's center
        distanceTo: (x, z) => car.distanceTo(x, z),
        radius: 1.3,
        available: () => !driving.active,
        prompt: () => `E — get in the ${car.model}`,
        onUse: () => this.enterCar(car),
      });
    }
  }

  /** Nearest interactable within its radius (optionally for one key). */
  nearest(key) {
    const { player } = this;
    let best = null;
    let bestDist = Infinity;
    for (const it of this.world.interactables) {
      if (key && (it.key ?? 'KeyE') !== key) continue;
      if (it.available && !it.available()) continue;
      if (it.y !== undefined && Math.abs(player.position.y - it.y) > 0.6) continue;
      const d = it.distanceTo ? it.distanceTo(player.position.x, player.position.z) : Math.hypot(it.x - player.position.x, it.z - player.position.z);
      if (d < it.radius && d < bestDist) {
        best = it;
        bestDist = d;
      }
    }
    return best;
  }

  /** Runs `fn` behind a fade; nothing else may start until it is over. */
  fade(fn) {
    this.state.transitioning = true;
    this.ui.fadeTransition(() => {
      fn();
      this.lastPrompt = null;
    }).finally(() => {
      this.state.transitioning = false;
    });
  }

  /* ------------------------------------------------------- radio */

  toggleRadio(set) {
    this.radioSets[set] = !this.radioSets[set];
    this.sound.ui('tick');
  }

  /** Where the music comes from this frame: with the dashboard set on it
   * rides along with the listener, otherwise it stays at the kiosk. */
  updateRadio(listener) {
    const inCar = this.driving.active && this.radioSets.car;
    const wanted = inCar || this.radioSets.kiosk;
    if (this.sound.radioOn !== wanted) this.sound.toggleRadio(wanted);
    return inCar ? listener : this.world.points.radio;
  }

  /* ------------------------------------------------------- doors */

  /** Through a door that opens: the room is somewhere else entirely. */
  enterRoom(door) {
    if (this.state.transitioning || this.world.inside) return;
    this.sound.door();
    this.fade(() => this.enterRoomNow(door));
  }

  /** Inside without the fade (also how a saved game comes back indoors). */
  enterRoomNow(door) {
    const { world, player } = this;
    const room = world.rooms[door.inside];
    world.inside = room;
    room.group.visible = true;
    this.lastDoor = door;
    player.teleport(room.spawn.x, room.spawn.z, room.spawn.yaw);
    player.pitch = 0;
    this.env.setIndoors(true);
    this.sound.setIndoors(true);
  }

  leaveRoom() {
    if (this.state.transitioning || !this.world.inside) return;
    this.sound.door();
    this.fade(() => {
      const door = this.lastDoor;
      this.leaveRoomNow();
      this.player.teleport(door.x, door.z, door.yaw);
      this.player.pitch = 0;
    });
  }

  /** Out of doors again without ceremony (back to the title, a restart). */
  leaveRoomNow() {
    const { world } = this;
    if (!world.inside) return;
    world.inside.group.visible = false;
    world.inside = null;
    this.env.setIndoors(false);
    this.sound.setIndoors(false);
  }

  /** On the sofa at home: the day moves on to its next part. */
  sleep() {
    if (this.state.transitioning) return;
    this.fade(() => {
      const next = TIME_PRESETS[(this.env.timeIndex + 1) % TIME_PRESETS.length];
      this.env.setTime(next.id);
    });
  }

  /* ------------------------------------------------------- cars */

  /** Into the driver's seat: a short fade, the door, the starter. */
  enterCar(car) {
    if (this.state.transitioning || this.driving.active) return;
    this.fade(() => this.driving.enter(car));
  }

  leaveCar() {
    const { driving, state } = this;
    if (state.transitioning || !driving.active || Math.abs(driving.car.speed) > 1.5) return;
    this.fade(() => {
      if (!driving.exit()) this.sound.ui('tick');
    });
  }

  /** Back to the title (or a restart) with the engine still running. */
  leaveCarNow() {
    const { driving } = this;
    if (!driving.active) return;
    driving.car.setDriven(false);
    driving.car = null;
    this.world.carBeam.light.intensity = 0;
    this.sound.engineStop();
  }

  /* ------------------------------------------------------- benches */

  /** Sits down (fade), then hands the view to the sequence. */
  startSmoke(spot, mode = 'smoke') {
    const { state, player, world } = this;
    if (state.transitioning || state.smoking) return;
    const begin = () => {
      const seat = spot.seat;
      player.teleport(seat.x, seat.z, seat.yaw);
      player.pitch = seat.pitch;
      player.eyeOverride = seat.eyeY === null ? null : seat.eyeY - world.heightAt(seat.x, seat.z);
      if (player.eyeOverride !== null) player.eye = player.eyeOverride;
      player.enabled = false;
      state.smoking = true;
      this.smoke.start(spot, mode);
      this.lastPrompt = null;
      this.ui.setPrompt(null);
    };
    if (spot.stand) this.fade(begin);
    else begin();
  }

  /** Back on your feet: fade up from the bench (or just carry on, standing). */
  endSmoke(animate = true) {
    const { state, player, smoke } = this;
    const spot = smoke.active;
    smoke.stop();
    state.smoking = false;
    const stand = () => {
      player.eyeOverride = null;
      if (spot?.stand) player.teleport(spot.stand.x, spot.stand.z, player.yaw);
      if (state.mode === 'playing') player.enabled = true;
    };
    if (animate && spot?.stand) this.fade(stand);
    else stand();
  }

  /* ------------------------------------------------------- per frame, keys */

  updatePrompt() {
    const { driving, state } = this;
    let text = null;
    if (driving.active) {
      text = !state.transitioning && Math.abs(driving.car.speed) < 1.5 ? driving.car.boat ? 'E — step ashore (close to land) · V — camera' : `E — get out · V — camera · R — radio ${this.radioSets.car ? 'off' : 'on'}` : null;
    } else {
      const it = state.smoking ? null : this.nearest();
      text = it && !state.transitioning ? it.prompt() : null;
    }
    if (text !== this.lastPrompt) {
      this.lastPrompt = text;
      this.ui.setPrompt(text);
    }
  }

  /** A key pressed while playing. */
  onKey(event) {
    const { driving, state, smoke } = this;
    const { code } = event;
    if (driving.active) {
      if (event.repeat) return;
      if (code === 'KeyE') this.leaveCar();
      if (code === 'KeyV') driving.toggleView();
      if (code === 'KeyR') this.toggleRadio('car');
      return;
    }
    if (state.transitioning) return;
    const useKey = code === 'KeyE' || code === 'KeyF' || code === 'KeyG';
    if (useKey && !state.smoking) this.nearest(code)?.onUse();
    // F or G again cuts the break short
    else if ((code === 'KeyF' || code === 'KeyG') && state.smoking && smoke.t > 0.3) this.endSmoke();
  }
}
