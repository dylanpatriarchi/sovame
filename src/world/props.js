// District props: bus stop, kiosk, playground, cars, street lamps, monument,
// notice boards, New Year fir, power poles and wires.
import * as THREE from 'three';
import { Rng, TAU } from '../util.js';
import { makeSignTexture, makeGlowTexture, makeSoftCircleTexture, makeBeamTexture } from '../textures.js';
import { makeStarMesh } from './buildings.js';
import { WORLD } from '../config.js';

export function buildProps(ctx) {
  const { world, materials: M, textures: T, rng } = ctx;
  const group = world.group;
  const woodMat = M.wood;
  const rustMat = M.rust;

  /* ---------------------------------------------------------- street lamps */
  const glowTex = makeGlowTexture(128, '255,186,110');
  const beamTex = makeBeamTexture();
  const beamGeo = new THREE.PlaneGeometry(3.4, 7.1);
  const lampHeadMat = new THREE.MeshStandardMaterial({ color: 0x35393b, emissive: 0xffb066, emissiveIntensity: 0 });
  const lampGlassMat = new THREE.MeshBasicMaterial({ color: 0x2a2c2c });
  world.lampMats = { head: lampHeadMat, glass: lampGlassMat };

  const makeLamp = (x, z, facing) => {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.6, 10), M.concreteDark);
    base.position.y = 0.3;
    base.castShadow = true;
    g.add(base);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.11, 7.2, 10), M.metal);
    pole.position.y = 3.9;
    pole.castShadow = true;
    g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.09, 0.09), M.metal);
    arm.position.set(0.7, 7.45, 0);
    arm.rotation.z = -0.12;
    arm.castShadow = true;
    g.add(arm);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.22, 0.38), lampHeadMat);
    head.position.set(1.42, 7.35, 0);
    head.castShadow = true;
    g.add(head);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.3), lampGlassMat);
    glass.position.set(1.42, 7.23, 0);
    g.add(glass);

    const light = new THREE.PointLight(0xff9d3c, 0, 30, 2);
    light.position.set(1.42, 7.1, 0);
    g.add(light);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTex, color: 0xffc681, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    glow.scale.set(2.6, 2.6, 1);
    glow.position.copy(light.position);
    g.add(glow);

    // fake pool of light on the ground: keeps distant lamps readable even where
    // their PointLight is culled to save cost
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(17, 17),
      new THREE.MeshBasicMaterial({
        map: glowTex,
        color: 0xffa54d,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(1.42, 0.18, 0);
    g.add(pool);

    // fake volumetric beam: two crossed soft-alpha cards, dissolving
    // before they reach the ground; no hard silhouette edges
    const beamMat = new THREE.MeshBasicMaterial({
      map: beamTex,
      color: 0xffbe78,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const cone = new THREE.Group();
    for (const ry of [0, Math.PI / 2]) {
      const card = new THREE.Mesh(beamGeo, beamMat);
      card.rotation.y = ry;
      cone.add(card);
    }
    cone.position.set(1.42, 3.62, 0);
    g.add(cone);

    g.position.set(x, 0, z);
    g.rotation.y = facing;
    group.add(g);
    ctx.addBoxCollider(x, z, 0.5, 0.5, 0.15);
    world.lamps.push({ light, glow, pool, cone, coneMat: beamMat, group: g, height: 7.4 });
  };

  makeLamp(8.2, -78, Math.PI);
  makeLamp(8.2, -6, Math.PI);
  makeLamp(8.2, 66, Math.PI);
  makeLamp(-8.2, -42, 0);
  makeLamp(-8.2, 30, 0);
  makeLamp(-8.2, 96, 0);
  makeLamp(-30, -13.5, 0.6);
  makeLamp(27, 26, -2.2);

  /* ---------------------------------------------------------- bus stop */
  {
    const cx = 7.9;
    const cz = 24;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.16, 5.6), M.concreteDark);
    pad.position.set(cx, 0.22, cz);
    pad.receiveShadow = true;
    group.add(pad);
    for (const dz of [-2.5, 2.5]) {
      for (const dx of [-1.15, 1.15]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 8), M.metal);
        post.position.set(cx + dx, 1.5, cz + dz);
        ctx.place(post);
      }
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.16, 5.9), M.metal);
    roof.position.set(cx, 2.86, cz);
    ctx.place(roof);
    const snow = new THREE.Mesh(new THREE.BoxGeometry(3.06, 0.14, 5.96), M.snow);
    snow.position.set(cx, 3.0, cz);
    group.add(ctx.seasonable('winter', snow));
    // glass walls on the road side
    for (const dz of [-1.25, 1.25]) {
      const pane = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.9, 2.4), M.glassPane);
      pane.position.set(cx - 1.15, 1.5, cz + dz);
      group.add(pane);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 2.5), M.metalLight);
      frame.position.set(cx - 1.15, 2.45, cz + dz);
      ctx.place(frame);
      const frame2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 2.5), M.metalLight);
      frame2.position.set(cx - 1.15, 0.6, cz + dz);
      ctx.place(frame2);
    }
    // bench
    for (const dz of [-1.3, 1.3]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.08), M.metal);
      leg.position.set(cx + 0.85, 0.55, cz + dz);
      ctx.place(leg);
    }
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 4.2), woodMat);
    seat.position.set(cx + 0.85, 0.85, cz);
    ctx.place(seat);
    for (let i = 0; i < 3; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 4.2), woodMat);
      slat.position.set(cx + 0.62 + i * 0.24, 0.92, cz);
      ctx.place(slat);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 4.2), woodMat);
    back.position.set(cx + 1.12, 1.25, cz);
    ctx.place(back);

    // bus stop sign
    const signTex = makeSignTexture(256, 320, (c, W, H) => {
      c.fillStyle = '#dcd7c6';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#2b3a55';
      c.beginPath();
      c.arc(W / 2, H * 0.26, W * 0.24, 0, TAU);
      c.fill();
      c.fillStyle = '#efe3cf';
      c.font = 'bold 62px "Arial Narrow", Arial, sans-serif';
      c.fillText('А', W / 2, H * 0.3);
      c.fillStyle = '#2b2a27';
      c.font = 'bold 40px "Arial Narrow", Arial, sans-serif';
      c.fillText('АВТОБУС', W / 2, H * 0.58);
      c.font = 'bold 28px Arial, sans-serif';
      c.fillStyle = '#a8231c';
      c.fillText('12  24  31', W / 2, H * 0.76);
    });
    const signPost = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 3.0, 8), M.metal);
    signPost.position.set(6.6, 1.5, 28.6);
    ctx.place(signPost);
    const plateMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.75 });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 0.8), [plateMat, plateMat, M.metal, M.metal, plateMat, plateMat]);
    plate.position.set(6.6, 2.5, 28.6);
    ctx.place(plate);
    const snowCap = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.9), M.snow);
    snowCap.position.set(6.6, 3.05, 28.6);
    group.add(ctx.seasonable('winter', snowCap));
    ctx.addBoxCollider(6.6, 28.6, 0.4, 0.4, 0.1);

    // timetable inside the shelter
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 1.3), [
      M.metal,
      M.metal,
      M.metal,
      M.metal,
      new THREE.MeshStandardMaterial({ map: plateMat.map, roughness: 0.8 }),
      M.metal,
    ]);
    board.position.set(cx + 1.2, 1.6, cz - 1.9);
    board.rotation.y = Math.PI / 2;
    ctx.place(board);

    world.points.busStop = new THREE.Vector3(cx, 0, cz);
    ctx.addZone('Автобусная остановка', 'Bus stop', 6, 14, 18, 32);
  }

  /* ---------------------------------------------------------- kiosk */
  {
    const x = 11.6;
    const z = 4;
    const w = 3.8;
    const h = 2.8;
    const d = 2.8;
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xb9c0c2, roughness: 0.7, metalness: 0.25 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
    body.position.set(x, h / 2 + 0.2, z);
    ctx.place(body);
    ctx.addBoxCollider(x, z, w, d, 0.2);
    const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.4, d + 0.4), M.concreteDark);
    base.position.set(x, 0.2, z);
    ctx.place(base);

    const signTex = makeSignTexture(512, 160, (c, W, H) => {
      c.fillStyle = '#f0ead8';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#a8231c';
      c.fillRect(0, 0, W, 12);
      c.fillStyle = '#2a2a28';
      c.font = 'bold 68px "Arial Narrow", Arial, sans-serif';
      c.fillText('ПРОДУКТЫ', W / 2, H * 0.5);
    });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 0.62, 0.1), [
      M.metalLight,
      M.metalLight,
      M.metalLight,
      M.metalLight,
      new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.8 }),
      M.metal,
    ]);
    sign.position.set(x, h + 0.35, z - d / 2 - 0.04);
    ctx.place(sign);

    // warm window
    const windowMat = new THREE.MeshBasicMaterial({ color: 0x3a3226 });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.05), windowMat);
    win.rotation.y = Math.PI;
    win.position.set(x, 1.85, z - d / 2 - 0.06);
    group.add(win);
    const winFrame = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.2, 0.08), M.metal);
    winFrame.position.set(x, 1.85, z - d / 2 - 0.02);
    ctx.place(winFrame);
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.1, 0.42), M.metal);
    shelf.position.set(x, 1.2, z - d / 2 - 0.18);
    ctx.place(shelf);

    const kLight = new THREE.PointLight(0xffc98a, 0, 10, 2);
    kLight.position.set(x, 1.9, z - d / 2 - 0.8);
    group.add(kLight);
    const kGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTex, color: 0xffcf94, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    kGlow.scale.set(3.6, 3.6, 1);
    kGlow.position.set(x, 1.85, z - d / 2 - 0.5);
    group.add(kGlow);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.16, d + 0.5), M.metal);
    roof.position.set(x, h + 0.72, z);
    ctx.place(roof);
    const snow = new THREE.Mesh(new THREE.BoxGeometry(w + 0.54, 0.14, d + 0.54), M.snow);
    snow.position.set(x, h + 0.86, z);
    group.add(ctx.seasonable('winter', snow));

    // step and opening-hours sign
    const step = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.16, 0.6), M.concreteDark);
    step.position.set(x, 0.28, z - d / 2 - 0.5);
    ctx.place(step);
    const hoursTex = makeSignTexture(256, 128, (c, W, H) => {
      c.fillStyle = '#efe9d8';
      c.fillRect(0, 0, W, H);
      c.strokeStyle = '#2b2a27';
      c.lineWidth = 4;
      c.strokeRect(2, 2, W - 4, H - 4);
      c.fillStyle = '#2b2a27';
      c.font = 'bold 30px Arial, sans-serif';
      c.fillText('ОТКРЫТО', W / 2, H * 0.38);
      c.font = 'bold 26px Arial, sans-serif';
      c.fillText('8:00 — 20:00', W / 2, H * 0.72);
    });
    const hours = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshStandardMaterial({ map: hoursTex, roughness: 0.8 }));
    hours.rotation.y = Math.PI;
    hours.position.set(x - 1.5, 1.9, z - d / 2 - 0.08);
    group.add(hours);

    world.kiosk = { windowMat, light: kLight, glow: kGlow, glowBase: 0.5 };
    world.points.radio = new THREE.Vector3(x, 1.8, z - d / 2 - 0.6);
    ctx.addZone('Продуктовый киоск', 'Grocery kiosk', 9, 15, 0, 8);
  }

  /* ---------------------------------------------------------- playground */
  const paint = new THREE.MeshStandardMaterial({ color: 0x2f6b8a, roughness: 0.55, metalness: 0.35 });
  const paintFaded = new THREE.MeshStandardMaterial({ color: 0x6b7a80, roughness: 0.7, metalness: 0.3 });
  const swingGroup = new THREE.Group();
  {
    const cx = -34;
    const cz = -20;
    // A-frame
    for (const dx of [-2.4, 2.4]) {
      for (const dz of [-0.9, 0.9]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 3.0, 8), rustMat);
        leg.position.set(dx * 0.86, 1.42, dz);
        leg.rotation.z = dx > 0 ? -0.32 : 0.32;
        ctx.place(leg);
      }
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 10), rustMat);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(0, 2.86, 0);
    ctx.place(bar);
    // two swinging seats
    for (const dz of [-0.6, 0.6]) {
      const pivot = new THREE.Group();
      pivot.position.set(0, 2.86, dz);
      for (const dx of [-0.22, 0.22]) {
        const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.9, 5), M.metal);
        chain.position.set(dx, -0.95, 0);
        pivot.add(chain);
      }
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.06, 0.26), paintFaded);
      seat.position.set(0, -1.9, 0);
      seat.castShadow = true;
      pivot.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.22, 0.04), paintFaded);
      back.position.set(0, -1.78, -0.13);
      pivot.add(back);
      swingGroup.add(pivot);
      world.updaters.push((dt, t) => {
        pivot.rotation.x = Math.sin(t * 1.1 + dz * 3) * 0.13;
      });
    }
    swingGroup.position.set(cx, 0, cz);
    group.add(swingGroup);
    ctx.addBoxCollider(cx, cz, 5.6, 2.6, 0.2);
    world.points.playground = new THREE.Vector3(cx, 0, cz);
  }

  // merry-go-round
  {
    const carousel = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.85, 0.2, 20), M.concreteDark);
    base.position.y = 0.1;
    base.receiveShadow = true;
    carousel.add(base);
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 0.1, 20), paintFaded);
    deck.position.y = 0.24;
    carousel.add(deck);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 2.1, 10), rustMat);
    pole.position.y = 1.2;
    pole.castShadow = true;
    carousel.add(pole);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.045, 6, 20), rustMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.5;
    ring.castShadow = true;
    carousel.add(ring);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 0.34), paintFaded);
      seat.position.set(Math.cos(a) * 1.15, 0.62, Math.sin(a) * 1.15);
      seat.rotation.y = -a;
      seat.castShadow = true;
      carousel.add(seat);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 6), rustMat);
      bar.position.set(Math.cos(a) * 1.45, 1.0, Math.sin(a) * 1.45);
      carousel.add(bar);
    }
    carousel.position.set(-44, 0, -20);
    group.add(carousel);
    ctx.addBoxCollider(-44, -20, 3.6, 3.6, 0.1);
    world.updaters.push((dt) => {
      carousel.rotation.y += dt * 0.22;
    });
  }

  // seesaw and slide
  {
    const cx = -49;
    const cz = -30;
    const fulcrum = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), rustMat);
    fulcrum.position.set(cx, 0.25, cz);
    ctx.place(fulcrum);
    const plank = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.09, 0.34), paintFaded);
    plank.position.set(cx, 0.62, cz);
    plank.rotation.z = 0.14;
    plank.castShadow = true;
    group.add(plank);
    for (const dx of [-1.5, 1.5]) {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6), rustMat);
      handle.position.set(cx + dx, 0.85 + (-dx / 1.5) * 0.21, cz);
      group.add(handle);
    }
    ctx.addBoxCollider(cx, cz, 3.6, 0.8, 0.1);

    // slide
    const sx = -53;
    const sz = -25;
    const ladder = new THREE.Group();
    for (const dx of [-0.35, 0.35]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.6, 8), rustMat);
      rail.position.set(dx, 1.3, 0);
      rail.castShadow = true;
      ladder.add(rail);
    }
    for (let i = 1; i < 6; i++) {
      const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.8, 6), rustMat);
      rung.rotation.z = Math.PI / 2;
      rung.position.set(0, i * 0.42, 0);
      ladder.add(rung);
    }
    ladder.position.set(sx, 0, sz - 1.9);
    group.add(ladder);
    const platform = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.9), paintFaded);
    platform.position.set(sx, 2.5, sz - 1.2);
    ctx.place(platform);
    const chute = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 3.2), paintFaded);
    chute.position.set(sx, 1.35, sz + 0.6);
    chute.rotation.x = -0.72;
    chute.castShadow = true;
    group.add(chute);
    for (const dx of [-0.42, 0.42]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 3.2), rustMat);
      side.position.set(sx + dx, 1.45, sz + 0.6);
      side.rotation.x = -0.72;
      group.add(side);
    }
    ctx.addBoxCollider(sx, sz, 1.8, 4.6, 0.15);
  }

  // sandbox + mushroom
  {
    const sx = -30;
    const sz = -30;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, 0.18), woodMat);
      rail.position.set(sx + Math.cos(a) * 1.25, 0.18, sz + Math.sin(a) * 1.25);
      rail.rotation.y = -a - Math.PI / 2;
      ctx.place(rail);
    }
    const sand = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.14, 2.4),
      new THREE.MeshStandardMaterial({ color: 0xd7cdb4, roughness: 1 })
    );
    sand.position.set(sx, 0.18, sz);
    sand.receiveShadow = true;
    group.add(sand);
    const snow = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.16, 2.42), M.snow);
    snow.position.set(sx, 0.26, sz);
    snow.receiveShadow = true;
    group.add(ctx.seasonable('winter', snow));

    const mx = -38;
    const mz = -27;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.4, 10), rustMat);
    pole.position.set(mx, 1.2, mz);
    ctx.place(pole);
    const dome = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.0, 16), new THREE.MeshStandardMaterial({ color: 0xa8342a, roughness: 0.6 }));
    dome.position.set(mx, 2.7, mz);
    ctx.place(dome);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 0.1, 16), M.snow);
    rim.position.set(mx, 2.24, mz);
    group.add(ctx.seasonable('winter', rim));
    const seatRing = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.09, 16), woodMat);
    seatRing.position.set(mx, 0.5, mz);
    ctx.place(seatRing);
    ctx.addBoxCollider(mx, mz, 2.2, 2.2, 0.1);
  }

  /* ---------------------------------------------------------- car */
  const makeCar = (x, z, ry, color) => {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.28 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.66, 4.1), bodyMat);
    body.position.y = 0.66;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.72, 2.05), bodyMat);
    cabin.position.set(0, 1.24, -0.12);
    cabin.castShadow = true;
    g.add(cabin);
    const glassBand = new THREE.Mesh(new THREE.BoxGeometry(1.63, 0.36, 2.08), M.glass);
    glassBand.position.set(0, 1.32, -0.12);
    g.add(glassBand);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.1, 2.0), bodyMat);
    roof.position.set(0, 1.62, -0.12);
    roof.castShadow = true;
    g.add(roof);
    for (const dx of [-0.86, 0.86]) {
      for (const dz of [-1.35, 1.35]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 12), M.rubber);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(dx, 0.34, dz);
        wheel.castShadow = true;
        g.add(wheel);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.24, 10), M.metalLight);
        hub.rotation.z = Math.PI / 2;
        hub.position.set(dx, 0.34, dz);
        g.add(hub);
      }
    }
    for (const dz of [-2.12, 2.12]) {
      const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.14, 0.12), M.metalLight);
      bumper.position.set(0, 0.52, dz);
      g.add(bumper);
    }
    for (const dx of [-0.55, 0.55]) {
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.06), new THREE.MeshStandardMaterial({ color: 0xd8d4c2, roughness: 0.35, metalness: 0.2, emissive: 0x1a1608 }));
      light.position.set(dx, 0.82, 2.06);
      g.add(light);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.05), new THREE.MeshStandardMaterial({ color: 0x7a2018, roughness: 0.4 }));
      tail.position.set(dx, 0.82, -2.06);
      g.add(tail);
    }
    for (const dx of [-0.86, 0.86]) {
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.06), M.metalLight);
      mirror.position.set(dx, 1.34, 0.85);
      g.add(mirror);
    }
    // snow on the roof and hood
    const snowTop = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 1.9), M.snow);
    snowTop.position.set(0, 1.74, -0.12);
    g.add(ctx.seasonable('winter', snowTop));
    const snowHood = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.1, 1.5), M.snow);
    snowHood.position.set(0, 1.03, 1.35);
    g.add(ctx.seasonable('winter', snowHood));

    g.position.set(x, 0, z);
    g.rotation.y = ry;
    group.add(g);
    ctx.addBoxCollider(x, z, 2.2, 4.4, 0.15);
    return g;
  };
  makeCar(-24, -39, 0.06, 0x4a6076);
  makeCar(-21, -39, 0.02, 0x8a7a62);
  makeCar(44, -14, Math.PI / 2, 0x6d3a30);
  makeCar(44, -8.5, Math.PI / 2, 0x3f4a45);
  makeCar(-38, 30, 0.04, 0x5a5f63);
  makeCar(-63, -44, Math.PI / 2 + 0.06, 0x7d8078);

  /* ---------------------------------------------------------- benches and bins */
  const makeBench = (x, z, ry) => {
    const g = new THREE.Group();
    for (const dx of [-0.75, 0.75]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.44, 0.5), M.metal);
      leg.position.set(dx, 0.22, 0);
      g.add(leg);
    }
    for (let i = 0; i < 3; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.14), woodMat);
      slat.position.set(0, 0.46, -0.2 + i * 0.2);
      slat.castShadow = true;
      g.add(slat);
    }
    for (let i = 0; i < 2; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.14, 0.06), woodMat);
      slat.position.set(0, 0.72 + i * 0.2, -0.28);
      slat.castShadow = true;
      g.add(slat);
    }
    const snow = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.06, 0.5), M.snow);
    snow.position.set(0, 0.52, -0.05);
    g.add(ctx.seasonable('winter', snow));
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    group.add(g);
    ctx.addBoxCollider(x, z, 2.0, 0.7, 0.1);
  };
  makeBench(-27, -16, 0);
  makeBench(-52, -36, Math.PI);
  makeBench(-12.5, -4, Math.PI / 2);
  makeBench(26, 11, -0.4);
  makeBench(43, 23, 2.4);
  makeBench(-19, 11.2, 0);

  const makeBin = (x, z, tipped = false) => {
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.8, 12), M.metal);
    bin.castShadow = true;
    bin.receiveShadow = true;
    if (tipped) {
      bin.rotation.z = Math.PI / 2;
      bin.position.set(x, 0.28, z);
    } else {
      bin.position.set(x, 0.4, z);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 12), M.metalLight);
      lid.position.set(x, 0.83, z);
      lid.castShadow = true;
      group.add(lid);
    }
    group.add(bin);
    ctx.addBoxCollider(x, z, 0.6, 0.6, 0.1);
  };
  makeBin(11.4, 21.6);
  makeBin(-26.4, -15.4);
  makeBin(12.2, 6.5, true);
  makeBin(-43.5, -18.6);

  /* ---------------------------------------------------------- monument */
  {
    const cx = -18.5;
    const cz = 2;
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, 3.4), M.concreteWhite);
    base.position.set(cx, 0.3, cz);
    ctx.place(base);
    const step = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.24, 4.2), M.concreteDark);
    step.position.set(cx, 0.12, cz);
    step.receiveShadow = true;
    group.add(step);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.95, 6.6, 4, 1), M.concreteWhite);
    column.rotation.y = Math.PI / 4;
    column.position.set(cx, 3.9, cz);
    ctx.place(column);
    const star = makeStarMesh(0.95, 0.2);
    star.position.set(cx, 7.7, cz);
    group.add(star);
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.7, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x8d8a80, roughness: 0.6, metalness: 0.3 })
    );
    plate.position.set(cx, 1.9, cz - 0.95);
    ctx.place(plate);
    ctx.addBoxCollider(cx, cz, 3.6, 3.6, 0.15);
    ctx.addZone('Площадь у обелиска', 'Obelisk square', -28, -8, -10, 14);
  }

  /* ---------------------------------------------------------- notice boards and posters */
  const makeBoard = (x, z, ry, texture, w = 3.4, h = 2.1, legH = 1.3) => {
    const board = new THREE.Group();
    const backMat = M.paintBlue;
    // the posters have their own light: the boards stay readable in the evening
    const poster = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.8,
      emissive: 0xffffff,
      emissiveMap: texture,
      emissiveIntensity: 0.12,
    });
    world.posterMats.push(poster);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), [backMat, backMat, backMat, backMat, poster, backMat]);
    panel.position.y = legH + h / 2;
    ctx.place(panel);
    board.add(panel);
    for (const dx of [-w * 0.32, w * 0.32]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, legH + h, 0.14), M.metal);
      post.position.set(dx, (legH + h) / 2, -0.16);
      ctx.place(post);
      board.add(post);
    }
    const snow = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.1, 0.2), M.snow);
    snow.position.set(0, legH + h + 0.05, 0);
    board.add(ctx.seasonable('winter', snow));
    board.position.set(x, 0, z);
    board.rotation.y = ry;
    group.add(board);
    const sideways = Math.abs(Math.sin(ry)) > 0.5;
    ctx.addBoxCollider(x, z, sideways ? 0.6 : w, sideways ? w : 0.6, 0.2);
  };
  makeBoard(-13.6, 6, -Math.PI / 2, ctx.TEXTURES.posterSlava(512, 320), 3.6, 2.2);
  makeBoard(-11.8, -8, -Math.PI / 2, ctx.TEXTURES.posterNewYear(512, 320), 3.2, 2.0, 1.5);
  // turned toward the road: from behind it was just a dark panel
  makeBoard(12.6, 12.5, -Math.PI / 2, ctx.TEXTURES.posterFire(400, 512), 1.9, 2.5, 1.1);
  // "доска почёта" (honor board) with portraits of the best workers
  {
    const texture = makeSignTexture(512, 320, (c, W, H) => {
      c.fillStyle = '#8d2a22';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#efe3cf';
      c.font = 'bold 40px "Arial Narrow", Arial, sans-serif';
      c.fillText('ДОСКА ПОЧЁТА', W / 2, H * 0.2);
      const rg = new Rng(5);
      for (let i = 0; i < 8; i++) {
        const x = 30 + (i % 4) * 112;
        const y = 90 + Math.floor(i / 4) * 108;
        c.fillStyle = '#d8d3c4';
        c.fillRect(x, y, 88, 92);
        c.fillStyle = `rgba(${rg.int(60, 110)},${rg.int(58, 106)},${rg.int(54, 100)},0.85)`;
        c.beginPath();
        c.arc(x + 44, y + 34, 24, 0, TAU);
        c.fill();
        c.beginPath();
        c.arc(x + 44, y + 92, 30, Math.PI, TAU);
        c.fill();
        c.fillStyle = '#2b2a27';
        c.font = '10px Arial, sans-serif';
        c.fillText(`СМЕНА №${i + 1}`, x + 44, y + 100);
      }
    });
    makeBoard(-16, -8.4, 0, texture, 4.6, 2.8, 0.9);
  }

  /* ---------------------------------------------------------- New Year fir */
  {
    const cx = -22.5;
    const cz = 9.5;
    const fir = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.4, 8), M.bark);
    trunk.position.y = 0.7;
    fir.add(trunk);
    const needle = new THREE.MeshStandardMaterial({ color: 0x1f3f2e, roughness: 0.9 });
    let y = 1.2;
    for (let i = 0; i < 6; i++) {
      const r = 2.5 - i * 0.35;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, 1.9, 12), needle);
      cone.position.y = y + 0.95;
      cone.castShadow = true;
      cone.receiveShadow = true;
      fir.add(cone);
      const snowCap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.94, 0.6, 12), M.snow);
      snowCap.position.y = y + 1.6;
      fir.add(ctx.seasonable('winter', snowCap));
      y += 1.15;
    }
    // garland: three spirals of fairy lights
    const garlandMats = [];
    const colors = [0xfff0c4, 0xff6a4a, 0x8fd6ff, 0xffd24a];
    for (let k = 0; k < 3; k++) {
      const count = 46;
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        const a = t * 9.5 + k * 2.1;
        const radius = 2.35 * (1 - t * 0.78) + 0.12;
        positions[i * 3] = Math.cos(a) * radius;
        positions[i * 3 + 1] = 1.3 + t * 6.2;
        positions[i * 3 + 2] = Math.sin(a) * radius;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        size: 0.24,
        map: makeSoftCircleTexture(48, '255,255,255', 2.2),
        color: colors[k % colors.length],
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      });
      garlandMats.push(mat);
      const points = new THREE.Points(geo, mat);
      fir.add(points);
    }
    const topStar = makeStarMesh(0.5, 0.12, 0xc9302a);
    topStar.position.y = 8.4;
    fir.add(topStar);
    fir.position.set(cx, 0, cz);
    group.add(fir);
    ctx.addBoxCollider(cx, cz, 4.2, 4.2, 0.2);
    world.updaters.push((dt, t) => {
      const level = world.garlandLevel ?? 1;
      garlandMats.forEach((m, i) => {
        m.opacity = (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * (2 + i * 0.7) + i * 2))) * level;
      });
    });
    // freeze-frame: the lights turn on only from dusk onward
    world.garlandMats = garlandMats;
  }

  /* ---------------------------------------------------------- poles and wires */
  {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x6f6a62, roughness: 0.9 });
    const wireMat = new THREE.MeshStandardMaterial({ color: 0x1b1d1e, roughness: 0.8 });
    const zs = [-96, -72, -48, -24, 0, 24, 48, 72, 96];
    const x = -12.6;
    const tops = [];
    zs.forEach((z, i) => {
      const h = 8.6 - (i % 2) * 0.2;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.19, h, 8), poleMat);
      pole.position.set(x, h / 2, z);
      ctx.place(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.12), poleMat);
      arm.position.set(x, h - 0.7, z);
      ctx.place(arm);
      for (const dx of [-0.95, 0, 0.95]) {
        const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.2, 6), M.glassPane);
        ins.position.set(x + dx, h - 0.55, z);
        group.add(ins);
      }
      ctx.addBoxCollider(x, z, 0.5, 0.5, 0.1);
      tops.push(new THREE.Vector3(x, h - 0.45, z));
    });
    for (let i = 0; i < tops.length - 1; i++) {
      const a = tops[i];
      const b = tops[i + 1];
      for (const dx of [-0.95, 0, 0.95]) {
        const mid = new THREE.Vector3((a.x + b.x) / 2 + dx, (a.y + b.y) / 2 - 0.55, (a.z + b.z) / 2);
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(a.x + dx, a.y, a.z), mid, new THREE.Vector3(b.x + dx, b.y, b.z)]);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.026, 4, false), wireMat);
        tube.castShadow = false;
        group.add(tube);
      }
    }
    world.points.wires = tops;
  }

  /* ---------------------------------------------------------- bulky waste */
  {
    // dumpster platform
    const pad = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.14, 2.4), M.concreteDark);
    pad.position.set(-56, 0.09, -60.5);
    pad.receiveShadow = true;
    group.add(pad);
    const containerMat = new THREE.MeshStandardMaterial({ color: 0x4d5a4c, roughness: 0.75, metalness: 0.35 });
    for (let i = 0; i < 2; i++) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 1.0), containerMat);
      box.position.set(-57 + i * 1.5, 0.66, -60.5);
      ctx.place(box);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.1, 1.06), M.metal);
      lid.position.set(box.position.x, 1.2, -60.5);
      lid.rotation.z = 0.06 * (i === 0 ? 1 : -1);
      ctx.place(lid);
      const snow = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.1, 1.08), M.snow);
      snow.position.set(box.position.x, 1.28, -60.5);
      snow.rotation.z = lid.rotation.z;
      group.add(ctx.seasonable('winter', snow));
    }
    ctx.addBoxCollider(-55.6, -60.5, 3.6, 1.4, 0.2);
    // pile of dirty snow and a tipped-over bin
    makeBin(-53.6, -59.6, true);
  }

  /* ---------------------------------------------------------- pond zone */
  ctx.addZone('Каток', 'Ice rink', 24, 46, 6, 28);

  /* ---------------------------------------------------------- street zones */
  ctx.addZone('Улица Космонавтов', 'Cosmonauts Avenue', -12, 12, -110, 110);
  ctx.addZone('Двор дома № 12', 'Courtyard of building 12', -64, -10, -46, -2);
  ctx.addZone('Двор дома № 7', 'Courtyard of building 7', 12, 60, -24, 56);
  ctx.addZone('Северный микрорайон', 'Northern district', -WORLD.bounds, WORLD.bounds, -WORLD.bounds, WORLD.bounds);
}
