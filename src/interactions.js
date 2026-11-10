// What the player can do in the world, and the keys that do it: the kiosk
// radio, a smoke or a mug of tea on any bench, getting in and out of the
// cars, the radio in the dashboard. main.js owns the modes (title, playing,
// paused); this owns everything that happens while playing.
import { smokeSpots } from './smoke.js';

export class Interactions {
  constructor({ world, player, ui, sound, smoke, driving, state }) {
    Object.assign(this, { world, player, ui, sound, smoke, driving, state });
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
        prompt: () => 'E — get in the car',
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
      text = !state.transitioning && Math.abs(driving.car.speed) < 1.5 ? `E — get out · V — camera · R — radio ${this.radioSets.car ? 'off' : 'on'}` : null;
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
