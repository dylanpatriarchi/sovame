// The post boxes in the stairwell vestibule: E has a look through the slots
// of the bank by the door. Something is always sticking out of somebody's
// box: the morning paper with its headline, a letter, a postcard, a bill.
// A few looks per entrance and there is nothing more until the post comes
// again in the morning. Live only: its own Rng, nothing from the seeded stream.
import { Rng } from './util.js';

const LOOKS = 3; // finds per entrance between posts
const POST = 7 * 60; // the post comes at seven
const NOTE = 5; // s a find stays up

const PAPERS = [
  ['Pravda', 'The plan for the quarter met ahead of time'],
  ['Pravda', 'New microdistrict handed over to its tenants'],
  ['Trud', 'Tractor works beats its plan by twelve percent'],
  ['Trud', 'Heating season opens on schedule'],
  ['Izvestia', 'A cosmonaut sends greetings from orbit'],
  ['Izvestia', 'Record harvest in the Kuban'],
  ['Sovetsky Sport', 'Our hockey team takes the cup again'],
  ['Vechernyaya Moskva', 'Snow tonight, minus twelve, light wind'],
];
const OTHERS = [
  'a letter, the address in a careful hand: "from Mum, Kharkov"',
  'a postcard with a red star: "Happy New Year!"',
  'a postcard of the Black Sea: "Greetings from Sochi!"',
  'the electricity bill: 2 rub. 40 kop.',
  'the rent slip for the quarter: 14 rub. 60 kop.',
  'Murzilka, the children’s magazine',
  'Krokodil, folded open at the cartoons',
  'Rabotnitsa, with a knitting pattern inside',
  'a notice: "Hot water off on Thursday, 9:00 — 17:00"',
  'a parcel slip: "Collect at the post office, No. 12"',
];

export class Mail {
  constructor({ env }) {
    this.env = env;
    this.rng = new Rng(7311);
    this.looked = new Map(); // entrance → looks since the post came
    this.note = null;
    this.noteT = 0;
    this.finds = 0;
    this.lastClock = this.#clock();
  }

  #clock() {
    return Math.round(this.env?.cur?.clockMinutes ?? 0) % 1440;
  }

  /** The entrance a stairwell stands for right now, and the numbers on its
   * bank of boxes (the ten painted on the vestibule wall). */
  #entrance(interior) {
    const a = interior.address;
    return { key: a ? `${a.spec.id}:${a.entrance}` : interior.id, first: interior.flatBase ?? 1, count: 10 };
  }

  /** Anything left to find in this entrance's boxes? */
  left(interior) {
    return LOOKS - (this.looked.get(this.#entrance(interior).key) ?? 0);
  }

  prompt(interior) {
    return this.left(interior) > 0 ? 'E — look through the post boxes' : 'E — look through the post boxes (the post comes at seven)';
  }

  /** Through the slots: what turns up, as a line for the prompt. */
  look(interior) {
    const e = this.#entrance(interior);
    const n = this.looked.get(e.key) ?? 0;
    if (n >= LOOKS) {
      this.#say('Nothing sticking out of any of them: the post comes at seven');
      return null;
    }
    this.looked.set(e.key, n + 1);
    const box = e.first + this.rng.int(0, e.count - 1);
    let find;
    if (this.rng.chance(0.5)) {
      const [paper, headline] = this.rng.pick(PAPERS);
      find = `Box ${box}: ${paper} — "${headline}"`;
    } else {
      find = `Box ${box}: ${this.rng.pick(OTHERS)}`;
    }
    this.finds++;
    this.#say(find);
    return find;
  }

  #say(text) {
    this.note = text;
    this.noteT = NOTE;
  }

  update(dt) {
    if (this.noteT > 0) {
      this.noteT -= dt;
      if (this.noteT <= 0) this.note = null;
    }
    // the post: every box filled again once the clock passes seven
    // (the clock eases either way round to a new time of day)
    const now = this.#clock();
    const step = ((now - this.lastClock + 2160) % 1440) - 720;
    const ahead = (POST - this.lastClock + 1440) % 1440;
    const behind = (this.lastClock - POST + 1440) % 1440;
    if ((step > 0 && ahead > 0 && ahead <= step) || (step < 0 && behind < -step)) this.looked.clear();
    this.lastClock = now;
  }
}
