// Real windows for the interiors. Stairwells and flats are sealed boxes far
// outside the district, so their windows are portals: while you are inside,
// a second camera stands where that window really is in its block (same
// floor, same facade) and renders the district into a texture, which the
// window panes sample in screen space. The near plane is bent onto the
// facade (oblique frustum), so the block's own walls never get in the way.
import * as THREE from 'three';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D tView;
  uniform sampler2D tFallback;
  uniform vec2 uRes;
  uniform float uLive;
  uniform float uFallbackGain;
  uniform vec3 uFrost;
  uniform float uFrostAmount;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
  }

  void main() {
    vec3 col;
    if (uLive > 0.5) {
      col = texture2D(tView, gl_FragCoord.xy / uRes).rgb;
      // double glazing: a little darker and cooler than the open air
      col *= vec3(0.86, 0.9, 0.94);
      // frost creeping in from the bottom corners and the edges
      vec2 e = min(vUv, 1.0 - vUv);
      float edge = 1.0 - smoothstep(0.0, 0.16, min(e.x, e.y));
      float corner = 1.0 - smoothstep(0.0, 0.42, length(vec2(min(vUv.x, 1.0 - vUv.x), vUv.y)));
      float grain = hash(floor(vUv * vec2(90.0, 120.0)));
      float frost = clamp((edge * 0.55 + corner * 0.9) * (0.75 + 0.5 * grain), 0.0, 1.0) * uFrostAmount;
      col = mix(col, uFrost, frost * 0.7);
    } else {
      col = texture2D(tFallback, vUv).rgb * uFallbackGain;
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

const _m = new THREE.Matrix4();
const _plane = new THREE.Plane();
const _clip = new THREE.Vector4();
const _q = new THREE.Vector4();
const _frustum = new THREE.Frustum();
const _sphere = new THREE.Sphere();

export class WindowViews {
  constructor({ renderer, scene, quality = 'high' }) {
    this.renderer = renderer;
    this.scene = scene;
    this.scale = quality === 'high' ? 0.6 : 0.45;
    this.target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true });
    this.target.texture.generateMipmaps = false;
    this.camera = new THREE.PerspectiveCamera(68, 1, 0.1, 1500);
    this.camera.layers.set(0);
    this.camera.matrixAutoUpdate = false;
    this.uniforms = {
      tView: { value: this.target.texture },
      uRes: { value: new THREE.Vector2(1, 1) },
      uLive: { value: 0 },
      uFrost: { value: new THREE.Color(0.32, 0.36, 0.42) },
      uFrostAmount: { value: 1 },
    };
    /** The view in use: { toWorld: Matrix4, point: Vector3, normal: Vector3, panes: Mesh[] } */
    this.view = null;
    this.visible = false;
  }

  /** Window-pane material: live view when a portal is set, painted view otherwise. */
  makeMaterial(fallback, gain = 0.85) {
    return new THREE.ShaderMaterial({
      uniforms: {
        tView: this.uniforms.tView,
        uRes: this.uniforms.uRes,
        uLive: this.uniforms.uLive,
        uFrost: this.uniforms.uFrost,
        uFrostAmount: this.uniforms.uFrostAmount,
        tFallback: { value: fallback },
        uFallbackGain: { value: gain },
      },
      vertexShader,
      fragmentShader,
    });
  }

  setView(view) {
    this.view = view;
    this.uniforms.uLive.value = view ? 1 : 0;
  }

  setQuality(quality) {
    this.scale = quality === 'high' ? 0.6 : 0.45;
  }

  /** Places the portal camera for this frame. Returns it (or null when no
   * portal is active), so the environment can center snow and lamps on it. */
  update(camera) {
    const view = this.view;
    if (!view) return null;
    camera.updateMatrixWorld();
    const cam = this.camera;
    cam.matrixWorld.multiplyMatrices(view.toWorld, camera.matrixWorld);
    cam.matrixWorld.decompose(cam.position, cam.quaternion, cam.scale);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    cam.fov = camera.fov;
    cam.aspect = camera.aspect;
    cam.near = 0.1;
    cam.far = camera.far;
    cam.updateProjectionMatrix();

    // oblique near plane on the facade (Lengyel): nothing behind the outer
    // wall of the block is drawn, whatever the angle
    _plane.setFromNormalAndCoplanarPoint(view.normal, view.point).applyMatrix4(cam.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const p = cam.projectionMatrix.elements;
    _q.set((Math.sign(_clip.x) + p[8]) / p[0], (Math.sign(_clip.y) + p[9]) / p[5], -1, (1 + p[10]) / p[14]);
    _clip.multiplyScalar(2 / _clip.dot(_q));
    p[2] = _clip.x;
    p[6] = _clip.y;
    p[10] = _clip.z + 1;
    p[14] = _clip.w;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();

    // only worth a render when a pane is actually on screen
    _m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_m);
    this.visible = view.panes.some((pane) => {
      if (!pane.geometry.boundingSphere) pane.geometry.computeBoundingSphere();
      _sphere.copy(pane.geometry.boundingSphere).applyMatrix4(pane.matrixWorld);
      return pane.visible && _frustum.intersectsSphere(_sphere);
    });
    return cam;
  }

  render() {
    if (!this.view || !this.visible) return;
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    this.uniforms.uRes.value.copy(size);
    const w = Math.max(4, Math.round(size.x * this.scale));
    const h = Math.max(4, Math.round(size.y * this.scale));
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.target);
    r.clear();
    r.render(this.scene, this.camera);
    r.setRenderTarget(prev);
  }
}

/**
 * Rigid map from an interior's coordinates to the district: the interior
 * point `from` (scene coords) lands on `to`, and the interior's +z axis on
 * the facade normal (side +1 → +z, -1 → -z).
 */
export function portalMatrix(from, to, side) {
  const m = new THREE.Matrix4().makeTranslation(to.x, to.y, to.z);
  if (side < 0) m.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
  return m.multiply(new THREE.Matrix4().makeTranslation(-from.x, -from.y, -from.z));
}

/** A window pane for an interior: live when the world has window views. */
export function paneMaterial(world, fallback, gain = 0.85) {
  if (world.windowViews) return world.windowViews.makeMaterial(fallback, gain);
  return new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: fallback, emissiveIntensity: gain, roughness: 0.5 });
}
