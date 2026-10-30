import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { ReplayOrderState, ReplayPersonState, ReplayProductVisualKind, ReplayState, ReplayWorkerState } from "./project";
import { productBasketSignature, visibleProductKinds } from "./products";

export interface ShopSceneOptions {
  reducedMotion: boolean;
  onPersonSelected: (personId: string | null) => void;
  onContextLost: () => void;
  /** Render station records as glyphs; these are never measured people. */
  recordMarkers?: boolean;
  recordLabels?: Readonly<Record<string, string>>;
}

/** Drawing input shared by simulated histories and independently measured records. */
export interface ShopSceneTrace {
  readonly events: readonly {
    readonly type: string;
    readonly time_s: number;
    readonly seq: number;
    readonly order_id?: string | null;
    readonly data?: Readonly<Record<string, unknown>>;
  }[];
  readonly final_orders: readonly { readonly order_id: string; readonly person_ids: readonly string[] }[];
  readonly final_workers: readonly { readonly worker_id: string; readonly pool: "cashier" | "preparer" | "integrated" }[];
}

export type ShopView = "interior" | "facade";

export interface ShopScene {
  setAnimationLoop(callback: ((timeMs: number) => void) | null): void;
  render(): void;
  setState(state: ReplayState, changedOrderIds: readonly string[] | null, animate: boolean): void;
  setSimulationTime(timeS: number): void;
  setSelection(personId: string | null): void;
  setReducedMotion(reduced: boolean): void;
  setView(view: ShopView): void;
  resetCamera(): void;
  zoom(direction: "in" | "out"): void;
  finishCosmeticMotion(): void;
  dispose(): void;
}

const COLORS = {
  sky: 0xdcefeb,
  floor: 0xe9e0ce,
  floorEdge: 0xb6d2cb,
  wall: 0xfff6e5,
  wallShadow: 0xe4d7be,
  strawberry: 0xd94373,
  strawberryDark: 0xb62e5a,
  teal: 0x13877a,
  tealDark: 0x0f7166,
  paleTeal: 0xbfe1d8,
  palePink: 0xffdce6,
  mango: 0xebbc62,
  cocoa: 0x6a4c43,
  wood: 0xa76d4e,
  green: 0x5b986e,
  skin: 0xd5a27a,
  cream: 0xfff5dd,
  paper: 0xffffff,
};

const PERSON_COLORS = [0xe36582, 0x4c91a2, 0xe0a94e, 0x8c78b0, 0x5c9b73, 0xc96d49, 0x6c7cbd, 0xc27e9d];
const SKIN_COLORS = [0xf0c8a5, 0xd6a17e, 0xb87958, 0x9b6248, 0xe6b898, 0xc78d6d];
const HAIR_COLORS = [0x393031, 0x5b4034, 0x25282d, 0x765b49, 0x4b3542, 0x6c513a];
const TROUSER_COLORS = [0x34434e, 0x4f5862, 0x584b4a, 0x34504c, 0x5d5144];
const SHOE_COLORS = [0x342f31, 0x51453d, 0x4d5555, 0xeee4d3];

interface GroupOffset {
  x: number;
  z: number;
}

interface PersonVisual {
  personId: string;
  orderId: string;
  index: number;
  from: THREE.Vector3;
  current: THREE.Vector3;
  target: THREE.Vector3;
  visible: boolean;
  transitionStartS: number;
  transitioning: boolean;
  stage: ReplayPersonState["state"];
  yaw: number;
}

interface WorkerVisual {
  workerId: string;
  pool: ReplayWorkerState["pool"];
  index: number;
  root: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  badge: THREE.Sprite | null;
  badgeText: string;
  badgeColor: string;
  tray: THREE.Group;
  neutralBasket: THREE.Group;
  menuBasket: THREE.Group;
  basketSignature: string;
  scoop: THREE.Group;
  position: THREE.Vector3;
  phase: number;
}

interface QueueSlot {
  x: number;
  z: number;
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stageStart(order: ReplayOrderState): number | null {
  switch (order.state) {
    case "waiting_payment":
      return order.arrival_s;
    case "payment_active":
      return order.payment_started_s;
    case "payment_pending":
      return order.payment_active_ended_s;
    case "waiting_preparation":
      return order.payment_completed_s;
    case "preparing":
    case "preparation_paused":
      return order.preparation_started_s;
    default:
      return null;
  }
}

function makeSpriteLabel(
  text: string,
  foreground: string,
  background: string,
  resources: Set<THREE.Texture>,
): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo preparar una etiqueta de la escena.");
  const fontSize = 56;
  context.font = `700 ${fontSize}px "Segoe UI", system-ui, sans-serif`;
  const measured = Math.ceil(context.measureText(text).width);
  canvas.width = Math.max(192, Math.min(1024, measured + 44));
  canvas.height = 100;
  const labelContext = canvas.getContext("2d");
  if (!labelContext) throw new Error("No se pudo preparar una etiqueta de la escena.");
  labelContext.font = `700 ${fontSize}px "Segoe UI", system-ui, sans-serif`;
  labelContext.textBaseline = "middle";
  labelContext.fillStyle = background;
  labelContext.beginPath();
  labelContext.roundRect(2, 2, canvas.width - 4, canvas.height - 4, 28);
  labelContext.fill();
  labelContext.strokeStyle = "rgba(32, 52, 66, 0.16)";
  labelContext.lineWidth = 3;
  labelContext.stroke();
  labelContext.fillStyle = foreground;
  labelContext.fillText(text, 22, canvas.height / 2, canvas.width - 44);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  resources.add(texture);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    sizeAttenuation: true,
  }));
  sprite.scale.set(Math.min(6.4, Math.max(1.85, canvas.width / 125)), 0.64, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function personPosition(
  person: ReplayPersonState,
  memberIndex: number,
  memberCount: number,
  paymentSlots: ReadonlyMap<string, QueueSlot>,
  preparationSlots: ReadonlyMap<string, QueueSlot>,
  pendingSlots: ReadonlyMap<string, QueueSlot>,
): THREE.Vector3 | null {
  const groupOffset = groupMemberOffset(memberIndex, memberCount);
  const center = (slot: QueueSlot): THREE.Vector3 => new THREE.Vector3(slot.x + groupOffset.x, 0, slot.z + groupOffset.z);
  switch (person.state) {
    case "not_arrived":
    case "completed":
    case "abandoned":
      return null;
    case "waiting_payment": {
      const slot = paymentSlots.get(person.order_id) ?? { x: -6.1, z: 0.7 };
      return center(slot);
    }
    case "payment_active":
      return new THREE.Vector3(-5.35 + groupOffset.x, 0, -1.35 + groupOffset.z);
    case "payment_pending": {
      const slot = pendingSlots.get(person.order_id) ?? { x: -3.65, z: -0.55 };
      return center(slot);
    }
    case "waiting_preparation": {
      const slot = preparationSlots.get(person.order_id) ?? { x: -0.25, z: 0.8 };
      return center(slot);
    }
    case "preparing":
    case "preparation_paused": {
      const slot = preparationSlots.get(person.order_id) ?? { x: 0.7, z: 0.2 };
      return center({ x: slot.x + 1.55, z: slot.z - 0.65 });
    }
    default:
      return null;
  }
}

function stateTime(order: ReplayOrderState): number {
  return stageStart(order) ?? 0;
}

function groupMemberOffset(memberIndex: number, memberCount: number): GroupOffset {
  const count = Math.max(1, memberCount);
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const column = memberIndex % columns;
  const row = Math.floor(memberIndex / columns);
  const spacing = 0.48;
  return {
    x: (column - (Math.min(columns, count) - 1) / 2) * spacing,
    z: (row - (rows - 1) / 2) * spacing,
  };
}

function buildQueueSlots(trace: ShopSceneTrace, kind: "payment" | "preparation" | "pending"): Map<string, QueueSlot> {
  const initial: Array<{ orderId: string; rank: number; seq: number }> = [];
  const newOrders: Array<{ orderId: string; time: number; seq: number }> = [];
  const pending: Array<{ orderId: string; time: number; seq: number }> = [];
  for (const event of trace.events) {
    const data = event.data ?? {};
    const stage = data.initial_stage ?? data.stage;
    if (kind === "payment" && event.type === "order_initialized" && stage === "waiting_payment") {
      initial.push({ orderId: event.order_id ?? "", rank: typeof data.queue_rank === "number" ? data.queue_rank : Number.MAX_SAFE_INTEGER, seq: event.seq });
    }
    if (kind === "preparation" && event.type === "order_initialized" && stage === "waiting_preparation") {
      initial.push({ orderId: event.order_id ?? "", rank: typeof data.queue_rank === "number" ? data.queue_rank : Number.MAX_SAFE_INTEGER, seq: event.seq });
    }
    if (kind === "payment" && event.type === "order_arrived" && event.order_id) {
      newOrders.push({ orderId: event.order_id, time: event.time_s, seq: event.seq });
    }
    if (kind === "preparation" && event.type === "payment_completed" && event.order_id) {
      newOrders.push({ orderId: event.order_id, time: event.time_s, seq: event.seq });
    }
    if (kind === "pending" && ((event.type === "order_initialized" && stage === "payment_pending") || event.type === "payment_active_ended" && stage === "payment_pending") && event.order_id) {
      pending.push({ orderId: event.order_id, time: event.time_s, seq: event.seq });
    }
  }
  initial.sort((left, right) => left.rank - right.rank || left.seq - right.seq);
  newOrders.sort((left, right) => left.time - right.time || left.seq - right.seq);
  pending.sort((left, right) => left.time - right.time || left.seq - right.seq);
  const slotOrder = kind === "pending"
    ? pending.map((item) => item.orderId)
    : [...initial.map((item) => item.orderId), ...newOrders.map((item) => item.orderId)];
  const slots = new Map<string, QueueSlot>();
  for (const [index, orderId] of slotOrder.entries()) {
    const columns = kind === "pending" ? 6 : 5;
    const column = index % columns;
    const row = Math.floor(index / columns);
    const slot = kind === "payment"
      ? { x: -6.1 + (column - (columns - 1) / 2) * 0.9, z: 0.6 + row * 0.92 }
      : kind === "preparation"
        ? { x: -0.25 + (column - (columns - 1) / 2) * 0.9, z: 0.8 + row * 0.92 }
        : { x: -3.65 + (column - (columns - 1) / 2) * 0.78, z: -0.55 + row * 0.78 };
    if (!slots.has(orderId)) slots.set(orderId, slot);
  }
  return slots;
}

export function createShopScene(
  stage: HTMLElement,
  canvas: HTMLCanvasElement,
  trace: ShopSceneTrace,
  options: ShopSceneOptions,
): ShopScene {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(Math.max(1, stage.clientWidth), Math.max(1, stage.clientHeight), false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  // Preserve the facade's horizontal framing on narrow screens without moving
  // the user's orbit target or altering any simulation coordinates.
  const framingFov = (aspect: number): number => THREE.MathUtils.radToDeg(
    2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(37) / 2) * Math.max(1, 1.5 / aspect)),
  );
  const initialAspect = Math.max(1, stage.clientWidth) / Math.max(1, stage.clientHeight);
  const camera = new THREE.PerspectiveCamera(framingFov(initialAspect), initialAspect, 0.1, 110);
  const cameraPresets: Record<ShopView, { position: THREE.Vector3; target: THREE.Vector3 }> = {
    interior: { position: new THREE.Vector3(10, 16, 21), target: new THREE.Vector3(0, 1, -2) },
    facade: { position: new THREE.Vector3(13, 12, 31), target: new THREE.Vector3(0, 4.5, 4.5) },
  };
  const cameraHome = cameraPresets.interior.position.clone();
  const cameraTarget = cameraPresets.interior.target.clone();
  camera.position.copy(cameraHome);
  camera.lookAt(cameraTarget);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(cameraTarget);
  controls.minDistance = 12;
  controls.maxDistance = 43;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.enableDamping = false;
  controls.update();

  const textures = new Set<THREE.Texture>();
  const geometries = new Map<string, THREE.BufferGeometry>();
  const materials = new Map<string, THREE.Material>();
  const disposableMaterials = new Set<THREE.Material>();
  const trackSprite = (sprite: THREE.Sprite): THREE.Sprite => {
    disposableMaterials.add(sprite.material);
    return sprite;
  };
  const releaseSprite = (sprite: THREE.Sprite): void => {
    const texture = sprite.material.map;
    if (texture) {
      texture.dispose();
      textures.delete(texture);
    }
    sprite.material.dispose();
    disposableMaterials.delete(sprite.material);
  };
  const cachedGeometry = (key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry => {
    let geometry = geometries.get(key);
    if (!geometry) {
      geometry = make();
      geometries.set(key, geometry);
    }
    return geometry;
  };
  const material = (color: number, roughness = 0.76, metalness = 0): THREE.MeshStandardMaterial => {
    const key = `standard:${color}:${roughness}:${metalness}`;
    let existing = materials.get(key);
    if (!existing) {
      existing = new THREE.MeshStandardMaterial({ color, roughness, metalness });
      materials.set(key, existing);
      disposableMaterials.add(existing);
    }
    return existing as THREE.MeshStandardMaterial;
  };
  const translucentMaterial = (color: number, opacity: number): THREE.MeshPhysicalMaterial => {
    const key = `translucent:${color}:${opacity}`;
    let existing = materials.get(key);
    if (!existing) {
      existing = new THREE.MeshPhysicalMaterial({
        color,
        transparent: true,
        opacity,
        roughness: 0.18,
        metalness: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      materials.set(key, existing);
      disposableMaterials.add(existing);
    }
    return existing as THREE.MeshPhysicalMaterial;
  };
  const makeProductMesh = (
    parent: THREE.Object3D,
    name: string,
    geometryKey: string,
    makeGeometry: () => THREE.BufferGeometry,
    surface: THREE.Material,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(cachedGeometry(geometryKey, makeGeometry), surface);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    parent.add(mesh);
    return mesh;
  };
  const makeBox = (
    parent: THREE.Object3D,
    name: string,
    size: readonly [number, number, number],
    position: readonly [number, number, number],
    color: number,
    castShadow = false,
    receiveShadow = false,
  ): THREE.Mesh => {
    const [width, height, depth] = size;
    const geometry = cachedGeometry(`box:${width}:${height}:${depth}`, () => new THREE.BoxGeometry(width, height, depth));
    const mesh = new THREE.Mesh(geometry, material(color));
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    parent.add(mesh);
    return mesh;
  };
  const makeCylinder = (
    parent: THREE.Object3D,
    name: string,
    radiusTop: number,
    radiusBottom: number,
    height: number,
    position: readonly [number, number, number],
    color: number,
    segments = 12,
  ): THREE.Mesh => {
    const geometry = cachedGeometry(`cylinder:${radiusTop}:${radiusBottom}:${height}:${segments}`, () => new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments));
    const mesh = new THREE.Mesh(geometry, material(color));
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const makeSphere = (
    parent: THREE.Object3D,
    name: string,
    radius: number,
    position: readonly [number, number, number],
    color: number,
    detail = 10,
  ): THREE.Mesh => {
    const geometry = cachedGeometry(`sphere:${radius}:${detail}`, () => new THREE.SphereGeometry(radius, detail, Math.max(6, detail - 2)));
    const mesh = new THREE.Mesh(geometry, material(color));
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const makeCanvasTexture = (
    width: number,
    height: number,
    paint: (context: CanvasRenderingContext2D) => void,
  ): THREE.CanvasTexture => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar una textura de la escena.");
    paint(context);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.add(texture);
    return texture;
  };
  const mappedMaterial = (key: string, map: THREE.Texture, roughness = 0.86): THREE.MeshStandardMaterial => {
    let existing = materials.get(`map:${key}`);
    if (!existing) {
      existing = new THREE.MeshStandardMaterial({ map, roughness });
      materials.set(`map:${key}`, existing);
      disposableMaterials.add(existing);
    }
    return existing as THREE.MeshStandardMaterial;
  };
  const makePlane = (
    parent: THREE.Object3D,
    name: string,
    size: readonly [number, number],
    position: readonly [number, number, number],
    surface: THREE.Material,
  ): THREE.Mesh => {
    const [width, height] = size;
    const mesh = new THREE.Mesh(
      cachedGeometry(`plane:${width}:${height}`, () => new THREE.PlaneGeometry(width, height)),
      surface,
    );
    mesh.name = name;
    mesh.position.set(...position);
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const addLabel = (
    parent: THREE.Object3D,
    text: string,
    position: readonly [number, number, number],
    foreground = "#29434a",
    background = "rgba(255, 249, 233, 0.96)",
    scale = 1,
  ): THREE.Sprite => {
    const sprite = trackSprite(makeSpriteLabel(text, foreground, background, textures));
    sprite.name = `label:${text}`;
    sprite.position.set(...position);
    sprite.scale.multiplyScalar(scale);
    parent.add(sprite);
    return sprite;
  };

  const makeProductUnit = (kind: ReplayProductVisualKind): THREE.Group => {
    const product = new THREE.Group();
    product.name = `Producto ${kind}`;
    if (kind === "fruit_salad") {
      const bowl = makeProductMesh(
        product,
        "Bowl transparente de ensalada de frutas",
        "fruit-bowl-wall",
        () => new THREE.CylinderGeometry(0.23, 0.16, 0.23, 18, 1, true),
        translucentMaterial(0xcce9e8, 0.28),
      );
      bowl.position.y = 0.225;
      const bottom = makeProductMesh(
        product,
        "Base transparente del bowl",
        "fruit-bowl-bottom",
        () => new THREE.CylinderGeometry(0.16, 0.16, 0.025, 18),
        translucentMaterial(0xe8f4ef, 0.42),
      );
      bottom.position.y = 0.11;
      const rim = makeProductMesh(
        product,
        "Borde del bowl",
        "fruit-bowl-rim",
        () => new THREE.TorusGeometry(0.225, 0.018, 6, 20),
        material(COLORS.paper, 0.36),
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.345;
      const fruitPieces: ReadonlyArray<readonly [number, number, number, number]> = [
        [-0.09, 0.28, -0.045, COLORS.strawberry],
        [0.005, 0.295, -0.055, COLORS.mango],
        [0.09, 0.275, -0.04, 0x6eae66],
        [-0.055, 0.29, 0.05, 0xf4d469],
        [0.045, 0.305, 0.055, 0xe9894f],
        [0.13, 0.28, 0.06, 0xd94373],
      ];
      fruitPieces.forEach(([x, y, z, color], index) => {
        makeBox(product, `Trozo de fruta ${index + 1}`, [0.075, 0.065, 0.075], [x, y, z], color);
      });
      const spoonHandle = makeCylinder(product, "Mango de cuchara", 0.012, 0.012, 0.24, [0.18, 0.37, 0.02], 0xc0c7c5, 8);
      spoonHandle.rotation.z = Math.PI / 2;
      makeSphere(product, "Cuchara", 0.035, [0.31, 0.37, 0.02], 0xc0c7c5, 8);
    } else if (kind === "ice_cream") {
      const cone = makeProductMesh(
        product,
        "Cono de helado",
        "ice-cream-cone",
        () => new THREE.ConeGeometry(0.22, 0.42, 12),
        material(0xd2a061, 0.9),
      );
      cone.position.y = 0.22;
      cone.rotation.z = Math.PI;
      makeSphere(product, "Bola de helado de vainilla", 0.18, [0, 0.47, 0], 0xfff2d2, 12);
      makeSphere(product, "Bola de helado de fresa", 0.145, [-0.075, 0.56, 0.035], COLORS.palePink, 10);
      makeSphere(product, "Bola de helado de mango", 0.135, [0.075, 0.55, 0.025], COLORS.mango, 10);
    } else {
      const cupShell = makeProductMesh(
        product,
        "Vaso transparente de raspado",
        "slush-cup-wall",
        () => new THREE.CylinderGeometry(0.18, 0.125, 0.38, 16, 1, true),
        translucentMaterial(0xbce4e5, 0.3),
      );
      cupShell.position.y = 0.22;
      const cupBase = makeProductMesh(
        product,
        "Base del vaso de raspado",
        "slush-cup-bottom",
        () => new THREE.CylinderGeometry(0.125, 0.125, 0.025, 16),
        material(COLORS.paper, 0.38),
      );
      cupBase.position.y = 0.035;
      const ice = makeProductMesh(
        product,
        "Hielo de color del raspado",
        "slush-ice",
        () => new THREE.CylinderGeometry(0.16, 0.115, 0.29, 16),
        material(0xeb6689, 0.46),
      );
      ice.position.y = 0.23;
      makeSphere(product, "Montículo de hielo raspado", 0.16, [0, 0.39, 0], 0xf08aa5, 12);
      const straw = makeCylinder(product, "Pitillo", 0.015, 0.015, 0.38, [0.075, 0.49, 0], COLORS.cream, 8);
      straw.rotation.z = -0.12;
      const rim = makeProductMesh(
        product,
        "Borde del vaso de raspado",
        "slush-cup-rim",
        () => new THREE.TorusGeometry(0.178, 0.012, 5, 18),
        material(COLORS.paper, 0.4),
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.41;
    }
    product.scale.setScalar(0.82);
    product.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = false;
        object.receiveShadow = false;
      }
    });
    return product;
  };

  const ambient = new THREE.HemisphereLight(0xf8fff9, 0xa9b8a7, 2.1);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffefd3, 3.2);
  sun.position.set(-8, 18, 11);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536);
  sun.shadow.camera.left = -16;
  sun.shadow.camera.right = 16;
  sun.shadow.camera.top = 17;
  sun.shadow.camera.bottom = -15;
  sun.shadow.bias = -0.00035;
  scene.add(sun);

  const shop = new THREE.Group();
  shop.name = "Ilustración de heladería";
  scene.add(shop);

  const floorTileTexture = makeCanvasTexture(256, 256, (context) => {
    context.fillStyle = "#bcae97";
    context.fillRect(0, 0, 256, 256);
    const tileColors = ["#efe6d5", "#e7dcc8", "#f3ead9", "#e4d8c3"];
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        const x = column * 64;
        const y = row * 64;
        context.fillStyle = tileColors[(row * 3 + column) % tileColors.length];
        context.fillRect(x + 2, y + 2, 60, 60);
        context.fillStyle = "rgba(255, 255, 255, 0.18)";
        context.fillRect(x + 4, y + 4, 56, 2);
      }
    }
  });
  floorTileTexture.wrapS = THREE.RepeatWrapping;
  floorTileTexture.wrapT = THREE.RepeatWrapping;
  floorTileTexture.repeat.set(8, 4.5);
  floorTileTexture.needsUpdate = true;
  const backsplashTexture = floorTileTexture.clone();
  textures.add(backsplashTexture);
  backsplashTexture.repeat.set(8, 0.48);
  backsplashTexture.needsUpdate = true;

  const platformGeometry = cachedGeometry("box:25:0.55:19", () => new THREE.BoxGeometry(25, 0.55, 19));
  const platform = new THREE.Mesh(platformGeometry, material(COLORS.floorEdge));
  platform.position.set(0, -0.3, 0);
  platform.receiveShadow = true;
  platform.castShadow = true;
  shop.add(platform);
  const floor = new THREE.Mesh(
    cachedGeometry("plane:24:13.5", () => new THREE.PlaneGeometry(24, 13.5)),
    mappedMaterial("interior-floor-tile", floorTileTexture, 0.92),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.015, -2.25);
  floor.receiveShadow = true;
  shop.add(floor);

  const facadeRoot = new THREE.Group();
  facadeRoot.name = "Fachada frontal";
  facadeRoot.position.z = 13.67;
  shop.add(facadeRoot);
  const upperFacade = new THREE.Group();
  upperFacade.name = "Volumen superior de fachada";
  upperFacade.visible = false;
  facadeRoot.add(upperFacade);
  const openStorefront = new THREE.Group();
  openStorefront.name = "Aberturas de atención";
  facadeRoot.add(openStorefront);
  const canopyAndSign = new THREE.Group();
  canopyAndSign.name = "Toldo y letrero exterior";
  canopyAndSign.visible = false;
  facadeRoot.add(canopyAndSign);

  // A roofless room, with the front service openings left clear in the default view.
  makeBox(shop, "Muro posterior interior", [22.2, 3.2, 0.34], [0, 1.6, -9.18], 0xfff1d8, false, true);
  makeBox(shop, "Muro lateral izquierdo interior", [0.34, 3.2, 13.5], [-11.15, 1.6, -2.25], 0xe8dfcc, false, true);
  makeBox(shop, "Muro lateral derecho interior", [0.34, 3.2, 13.5], [11.15, 1.6, -2.25], 0xe8dfcc, false, true);
  makePlane(
    shop,
    "Salpicadero cerámico",
    [19, 1.2],
    [0, 2.34, -8.99],
    mappedMaterial("backsplash-tile", backsplashTexture, 0.86),
  );

  // The front elevation borrows the shop's real facade materials and proportions;
  // the shop floor and service stations remain an illustrative operating layout.
  makeBox(upperFacade, "Volumen de fachada", [22.6, 6.05, 0.42], [0, 6.12, -9.17], 0xd8c5a7, false, true);
  const brickTexture = makeCanvasTexture(256, 128, (context) => {
    context.fillStyle = "#b99984";
    context.fillRect(0, 0, 256, 128);
    const brickColors = ["#b96650", "#bd7058", "#b35e49", "#c2765e", "#b8614d"];
    for (let row = 0; row < 4; row += 1) {
      const offset = row % 2 === 0 ? 0 : 32;
      for (let column = -1; column < 5; column += 1) {
        const x = column * 64 + offset;
        const y = row * 32;
        context.fillStyle = brickColors[(row * 3 + column + 12) % brickColors.length];
        context.fillRect(x + 2, y + 2, 60, 28);
        context.strokeStyle = "rgba(111, 61, 49, 0.24)";
        context.lineWidth = 1;
        context.strokeRect(x + 2.5, y + 2.5, 59, 27);
      }
    }
  });
  brickTexture.wrapS = THREE.RepeatWrapping;
  brickTexture.wrapT = THREE.RepeatWrapping;
  brickTexture.repeat.set(4.5, 4.8);
  brickTexture.needsUpdate = true;
  const brickMaterial = mappedMaterial("facade-brick", brickTexture, 0.93);
  makePlane(upperFacade, "Paño superior de ladrillo", [11.65, 6.05], [4.79, 6.12, -8.935], brickMaterial);
  makePlane(upperFacade, "Paño superior beige", [9.65, 6.05], [-5.855, 6.12, -8.935], material(0xd3bd9d));

  const shutterTexture = makeCanvasTexture(256, 512, (context) => {
    context.fillStyle = "#d6d1c7";
    context.fillRect(0, 0, 256, 512);
    for (let y = 0; y < 512; y += 20) {
      context.fillStyle = "rgba(255, 255, 255, 0.43)";
      context.fillRect(0, y, 256, 3);
      context.fillStyle = "rgba(94, 91, 84, 0.27)";
      context.fillRect(0, y + 16, 256, 3);
      context.fillStyle = "rgba(191, 186, 177, 0.35)";
      context.fillRect(0, y + 4, 256, 12);
    }
  });
  const shutterMaterial = mappedMaterial("roller-shutter", shutterTexture, 0.82);

  const addWindow = (parent: THREE.Object3D, centerX: number, width: number, y: number, height: number): void => {
    const backZ = -8.79;
    makeBox(parent, "Marco blanco de ventana", [width + 0.2, height + 0.2, 0.13], [centerX, y, backZ], 0xf0eadb);
    makeBox(parent, "Vidrio azul pálido", [width, height, 0.06], [centerX, y, backZ + 0.085], 0xb6d3d5);
    makeBox(parent, "Montante de ventana", [0.075, height, 0.055], [centerX, y, backZ + 0.14], 0xf7f3e8);
    makeBox(parent, "Travesaño de ventana", [width, 0.075, 0.055], [centerX, y, backZ + 0.14], 0xf7f3e8);
  };
  for (const centerX of [-9.05, -6.55, -4.05]) addWindow(upperFacade, centerX, 2.05, 6.28, 1.65);
  addWindow(upperFacade, 5.0, 5.6, 6.3, 1.7);

  // Ground floor remains open during operation in both camera views.
  makeBox(openStorefront, "Marco de puerta exterior", [2.05, 3.0, 0.16], [-9.15, 1.48, -8.81], 0xf3ecdd);
  makeBox(openStorefront, "Puerta exterior clara", [1.76, 2.76, 0.08], [-9.15, 1.42, -8.7], 0xe9e5d8);
  makeBox(openStorefront, "Panel superior de puerta", [1.28, 0.78, 0.045], [-9.15, 2.12, -8.64], 0xf5f1e7);
  makeBox(openStorefront, "Panel inferior de puerta", [1.28, 1.02, 0.045], [-9.15, 0.88, -8.64], 0xf1ede2);
  makeSphere(openStorefront, "Pomo de puerta exterior", 0.07, [-8.56, 1.44, -8.57], 0xb9924f, 8);

  for (const [centerX, width] of [[-5.55, 5.15], [0.05, 5.55], [6.65, 6.05]] as const) {
    const shutter = makePlane(openStorefront, "Persiana metálica", [width, 0.34], [centerX, 2.7, -8.71], shutterMaterial);
    shutter.receiveShadow = false;
    makeBox(openStorefront, "Cajón superior de persiana", [width + 0.05, 0.18, 0.2], [centerX, 2.88, -8.67], 0xbab5aa);
    const rolledShutter = makeCylinder(openStorefront, "Persiana enrollada", 0.12, 0.12, width, [centerX, 2.83, -8.7], 0xc8c2b6, 16);
    rolledShutter.rotation.z = Math.PI / 2;
  }
  makeBox(openStorefront, "Dintel corrido", [22.2, 0.16, 0.22], [0, 3.0, -8.72], 0xe7dac4);
  for (const x of [-10.15, -8.1, -2.95, 2.85, 3.6, 9.7, 10.15]) {
    makeBox(openStorefront, "Columna de abertura frontal", [0.12, 2.85, 0.18], [x, 1.48, -8.75], 0xf0eadb);
  }

  // Beige sloping canopy, green steel edge and two yellow support posts.
  const canopy = makeBox(canopyAndSign, "Toldo beige de fachada", [22.0, 0.17, 1.92], [0, 3.17, -8.05], 0xd9c49d, true);
  canopy.rotation.x = 0.14;
  makeBox(canopyAndSign, "Viga frontal verde", [22.0, 0.13, 0.14], [0, 3.02, -7.1], 0x397a4c, true);
  makeBox(canopyAndSign, "Viga posterior verde", [22.0, 0.1, 0.11], [0, 3.32, -8.94], 0x397a4c);
  for (const x of [-10.25, 10.25]) {
    makeBox(canopyAndSign, "Poste amarillo del toldo", [0.14, 3.05, 0.14], [x, 1.53, -7.08], 0xd6ad42, true);
  }
  for (const x of [-8.6, -5.0, -1.4, 2.2, 5.8, 9.4]) {
    const brace = makeBox(canopyAndSign, "Brazo verde del toldo", [0.08, 0.08, 1.84], [x, 3.3, -8.03], 0x397a4c);
    brace.rotation.x = 0.14;
  }

  const signTexture = makeCanvasTexture(1200, 300, (context) => {
    context.clearRect(0, 0, 1200, 300);
    context.font = 'italic 700 206px Georgia, "Palatino Linotype", serif';
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineJoin = "round";
    context.shadowColor = "rgba(91, 37, 51, 0.28)";
    context.shadowBlur = 8;
    context.shadowOffsetY = 5;
    context.lineWidth = 34;
    context.strokeStyle = "#a82d50";
    context.strokeText("Boquitas", 600, 154, 1060);
    context.lineWidth = 18;
    context.strokeStyle = "#fff0c8";
    context.strokeText("Boquitas", 600, 154, 1060);
    context.fillStyle = "#f1d58e";
    context.fillText("Boquitas", 600, 154, 1060);
  });
  const signMaterial = new THREE.MeshBasicMaterial({ map: signTexture, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  disposableMaterials.add(signMaterial);
  for (const x of [0, 2.4, 4.8]) {
    makeBox(canopyAndSign, "Montante verde del letrero", [0.09, 0.8, 0.09], [x, 3.73, -7.14], 0x397a4c);
  }
  const sign = makePlane(canopyAndSign, "Letrero principal Boquitas", [8.8, 2.2], [2.4, 4.5, -7.02], signMaterial);
  sign.castShadow = false;

  // A red-brick apron recalls the sidewalk, while a clear lane stays open to arrivals and service.
  const sidewalkTexture = makeCanvasTexture(256, 128, (context) => {
    context.fillStyle = "#b87f69";
    context.fillRect(0, 0, 256, 128);
    const tileColors = ["#aa5c47", "#b7654d", "#b86c54", "#a95443", "#c1775d"];
    for (let row = 0; row < 4; row += 1) {
      const offset = row % 2 === 0 ? 0 : 32;
      for (let column = -1; column < 5; column += 1) {
        const x = column * 64 + offset;
        const y = row * 32;
        context.fillStyle = tileColors[(row * 2 + column + 12) % tileColors.length];
        context.fillRect(x + 2, y + 2, 60, 28);
      }
    }
  });
  sidewalkTexture.wrapS = THREE.RepeatWrapping;
  sidewalkTexture.wrapT = THREE.RepeatWrapping;
  sidewalkTexture.repeat.set(12, 5);
  sidewalkTexture.needsUpdate = true;
  const sidewalk = makePlane(shop, "Andén de ladrillo rojo", [22, 5], [0, 0.012, 7], mappedMaterial("sidewalk-brick", sidewalkTexture, 0.95));
  sidewalk.rotation.x = -Math.PI / 2;

  const planterCenters: ReadonlyArray<readonly [number, number]> = [
    [-6.6, 6.8], [-5.4, 6.8], [-4.2, 6.8], [-3, 6.8],
    [5.2, 6.8], [6.4, 6.8], [7.6, 6.8], [8.8, 6.8],
  ];
  for (const [index, [x, z]] of planterCenters.entries()) {
    makeCylinder(shop, "Matera terracota", 0.38, 0.29, 0.54, [x, 0.29, z], 0xb66b4f, 12);
    makeCylinder(shop, "Borde de matera", 0.39, 0.38, 0.07, [x, 0.55, z], 0xc07b5c, 12);
    const foliage = [0x598a55, 0x6b965c, 0x4d7e4e][index % 3];
    makeSphere(shop, "Planta de matera", 0.43, [x, 0.92, z], foliage, 9);
    makeSphere(shop, "Brotes de matera", 0.26, [x + (index % 2 === 0 ? 0.22 : -0.22), 1.12, z], foliage, 8);
  }

  // Cashier and preparation counters are separate model zones even when a regular worker serves both.
  const cashierX = -5.65;
  const cashierZ = -2.55;
  makeBox(shop, "Base de caja", [4.9, 1.0, 1.05], [cashierX, 0.55, cashierZ], COLORS.teal, true, true);
  makeBox(shop, "Banda de caja", [4.92, 0.22, 1.08], [cashierX, 0.72, cashierZ], COLORS.tealDark, false, true);
  makeBox(shop, "Cubierta de caja", [5.1, 0.18, 1.22], [cashierX, 1.1, cashierZ], COLORS.cream, false, true);
  makeBox(shop, "Terminal de pago", [0.46, 0.32, 0.28], [-5.45, 1.34, -2.18], COLORS.cocoa, false);
  makeBox(shop, "Pantalla terminal", [0.34, 0.18, 0.04], [-5.45, 1.36, -2.01], COLORS.mango, false);
  addLabel(shop, "CAJA · PAGO", [cashierX, 1.78, -1.91], "#0f7166", "rgba(255, 249, 233, 0.97)", 0.72);
  addLabel(shop, "CONFIRMACIÓN EXTERNA", [-3.55, 1.66, -1.93], "#6b480c", "rgba(255, 239, 194, 0.98)", 0.42);

  const preparationX = 4.7;
  const preparationZ = -2.55;
  makeBox(shop, "Base de preparación", [8.35, 0.95, 1.35], [preparationX, 0.52, preparationZ], COLORS.strawberry, true, true);
  makeBox(shop, "Banda de preparación", [8.37, 0.22, 1.39], [preparationX, 0.68, preparationZ], COLORS.strawberryDark, false, true);
  makeBox(shop, "Cubierta de preparación", [8.55, 0.18, 1.55], [preparationX, 1.05, preparationZ], COLORS.cream, false, true);
  makeBox(shop, "Mostrador de entrega", [3.0, 0.45, 0.86], [7.7, 0.68, -1.2], COLORS.teal, true, true);
  makeBox(shop, "Cubierta de entrega", [3.15, 0.16, 0.98], [7.7, 0.96, -1.2], COLORS.cream, false, true);
  addLabel(shop, "PREPARACIÓN", [preparationX, 1.77, -1.77], "#b62e5a", "rgba(255, 249, 233, 0.97)", 0.68);
  addLabel(shop, "ENTREGA", [7.7, 2.72, -8.84], "#0f7166", "rgba(255, 249, 233, 0.97)", 0.55);

  const deliveryCue = new THREE.Group();
  deliveryCue.name = "Señal ilustrativa de entrega completada";
  deliveryCue.position.set(7.7, 1.08, -1.2);
  makeBox(deliveryCue, "Bandeja de entrega ilustrativa", [0.72, 0.08, 0.48], [0, 0.04, 0], COLORS.cream);
  makeCylinder(deliveryCue, "Vaso de entrega ilustrativo", 0.14, 0.17, 0.32, [0, 0.24, 0], COLORS.paper, 14);
  makeCylinder(deliveryCue, "Borde del vaso entregado", 0.16, 0.16, 0.05, [0, 0.425, 0], COLORS.teal, 14);
  makeSphere(deliveryCue, "Porción ilustrativa entregada", 0.125, [0, 0.51, 0], 0xf0e4ce, 10);
  let deliveryLabelText = "";
  let deliveryLabel = trackSprite(makeSpriteLabel("", "#0f7166", "rgba(229, 248, 241, 0.98)", textures));
  deliveryLabel.position.set(0, 1.02, 0);
  deliveryLabel.scale.multiplyScalar(0.46);
  deliveryCue.add(deliveryLabel);
  deliveryCue.visible = false;
  shop.add(deliveryCue);

  // The interior fittings are illustrative context; they do not add service capacity or menu claims.
  const interiorSignboard = makeBox(shop, "Placa interior Boquitas", [3.4, 0.68, 0.12], [0, 2.72, -8.84], COLORS.tealDark);
  interiorSignboard.castShadow = false;
  const interiorSignTexture = makeCanvasTexture(768, 192, (context) => {
    context.fillStyle = "#0f7166";
    context.fillRect(0, 0, 768, 192);
    context.strokeStyle = "rgba(255, 241, 205, 0.52)";
    context.lineWidth = 5;
    context.strokeRect(4, 4, 760, 184);
    context.font = 'italic 700 132px Georgia, "Palatino Linotype", serif';
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#fff1cd";
    context.fillText("Boquitas", 384, 96, 720);
  });
  const interiorSignMaterial = new THREE.MeshBasicMaterial({ map: interiorSignTexture, side: THREE.DoubleSide, toneMapped: false });
  disposableMaterials.add(interiorSignMaterial);
  const interiorSign = makePlane(shop, "Letrero interior Boquitas", [3.4, 0.68], [0, 2.72, -8.75], interiorSignMaterial);
  interiorSign.castShadow = false;
  interiorSign.receiveShadow = false;

  makeBox(shop, "Vitrina fría ilustrativa", [2.5, 0.62, 0.95], [1.45, 1.47, -2.55], 0xe6e0d4, true, true);
  makeBox(shop, "Frente de vidrio de vitrina", [2.24, 0.38, 0.045], [1.45, 1.52, -2.06], 0xb9d5d7);
  makeBox(shop, "Tapa de vitrina", [2.36, 0.055, 0.86], [1.45, 1.81, -2.55], 0xb9d5d7);
  makeBox(shop, "Borde de acero de vitrina", [2.5, 0.08, 0.98], [1.45, 1.86, -2.55], 0x9ba9a5);
  for (const x of [0.72, 1.45, 2.18]) {
    makeCylinder(shop, "Recipiente neutro de vitrina", 0.2, 0.2, 0.09, [x, 1.59, -2.55], 0xd6d1c6, 12);
  }

  makeBox(shop, "Repisa mural de preparación", [4.8, 0.1, 0.38], [4.55, 2.47, -8.49], COLORS.wood);
  for (const x of [2.75, 3.45, 4.15, 4.85, 5.55]) {
    makeCylinder(shop, "Vaso genérico en repisa", 0.095, 0.08, 0.24, [x, 2.63, -8.43], 0xf0e9da, 10);
  }
  makeCylinder(shop, "Portautensilios ilustrativo", 0.22, 0.2, 0.35, [6.25, 2.69, -8.43], COLORS.teal, 12);
  for (const [index, x] of [6.12, 6.25, 6.38].entries()) {
    const utensil = makeCylinder(shop, "Utensilio de preparación", 0.025, 0.025, 0.48, [x, 3.0, -8.43], 0xb1aaa0, 8);
    utensil.rotation.z = (index - 1) * 0.12;
  }

  // The paid-waiting marker stays visible without the former bench clutter.
  makeBox(shop, "Alfombra espera pagada", [6.6, 0.025, 4.6], [-0.05, 0.012, 2.15], 0xeadbc6);
  addLabel(shop, "ESPERA PAGADA", [9.65, 2.2, 2.2], "#89556a", "rgba(255, 255, 255, 0.96)", 0.58);

  const personOrder = Object.values(trace.final_orders).flatMap((order) => order.person_ids.map((personId) => [personId, order.order_id] as const));
  const personIds = personOrder.map(([personId]) => personId);
  const personOrderId = new Map(personOrder);
  const personMemberIndex = new Map<string, number>();
  for (const order of trace.final_orders) {
    order.person_ids.forEach((personId, index) => personMemberIndex.set(personId, index));
  }
  const personVisuals = new Map<string, PersonVisual>();
  let reducedMotion = options.reducedMotion;
  let currentState: ReplayState | null = null;
  let simulationTimeS = 0;
  const makePersonInstances = (name: string, geometry: THREE.BufferGeometry, count: number, surface = material(0xffffff)): THREE.InstancedMesh => {
    const mesh = new THREE.InstancedMesh(geometry, surface, Math.max(1, count));
    mesh.name = name;
    mesh.count = count;
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  };
  const personBody = makePersonInstances(
    options.recordMarkers ? "Registros observados · marcadores" : "Personas · cuerpos",
    options.recordMarkers
      ? cachedGeometry("record-marker", () => new THREE.BoxGeometry(0.5, 0.5, 0.5))
      : cachedGeometry("person-body", () => new THREE.CapsuleGeometry(0.2, 0.34, 2, 8)),
    personIds.length,
  );
  const personHead = makePersonInstances(
    "Personas · rostros",
    cachedGeometry("person-head", () => new THREE.SphereGeometry(0.18, 12, 9)),
    personIds.length,
  );
  const personHair = makePersonInstances(
    "Personas · cabello",
    cachedGeometry("person-hair", () => new THREE.SphereGeometry(0.17, 10, 7)),
    personIds.length,
  );
  const personEyes = makePersonInstances(
    "Personas · ojos",
    cachedGeometry("person-eye", () => new THREE.SphereGeometry(0.022, 7, 6)),
    personIds.length * 2,
    material(0x302d2d),
  );
  const personArms = makePersonInstances(
    "Personas · brazos",
    cachedGeometry("person-arm", () => new THREE.CapsuleGeometry(0.057, 0.26, 1, 7)),
    personIds.length * 2,
  );
  const personHands = makePersonInstances(
    "Personas · manos",
    cachedGeometry("person-hand", () => new THREE.SphereGeometry(0.064, 8, 6)),
    personIds.length * 2,
  );
  const personLegs = makePersonInstances(
    "Personas · piernas",
    cachedGeometry("person-leg", () => new THREE.CapsuleGeometry(0.073, 0.22, 1, 7)),
    personIds.length * 2,
  );
  const personShoes = makePersonInstances(
    "Personas · calzado",
    cachedGeometry("person-shoe", () => new THREE.BoxGeometry(0.26, 0.12, 0.37)),
    personIds.length * 2,
  );

  const dummy = new THREE.Object3D();
  const hiddenPosition = new THREE.Vector3(0, -200, 0);
  const forwardAxis = new THREE.Vector3(0, 1, 0);
  const setPersonPart = (
    mesh: THREE.InstancedMesh,
    instanceIndex: number,
    visual: PersonVisual,
    localPosition: readonly [number, number, number],
    localRotation: readonly [number, number, number],
    scale: readonly [number, number, number],
    yaw: number,
    bob: number,
  ): void => {
    if (!visual.visible) {
      dummy.position.copy(hiddenPosition);
      dummy.scale.setScalar(0.001);
      dummy.rotation.set(0, 0, 0);
    } else {
      const offset = new THREE.Vector3(...localPosition).applyAxisAngle(forwardAxis, yaw);
      dummy.position.set(visual.current.x + offset.x, localPosition[1] + bob, visual.current.z + offset.z);
      dummy.rotation.set(localRotation[0], yaw + localRotation[1], localRotation[2]);
      dummy.scale.set(...scale);
    }
    dummy.updateMatrix();
    mesh.setMatrixAt(instanceIndex, dummy.matrix);
  };
  const personParts = [personBody, personHead, personHair, personEyes, personArms, personHands, personLegs, personShoes];
  if (options.recordMarkers) {
    for (const part of personParts.slice(1)) part.visible = false;
  }
  const updatePersonMatrix = (visual: PersonVisual): void => {
    const index = visual.index;
    if (options.recordMarkers) {
      setPersonPart(personBody, index, visual, [0, 0.65, 0], [0, 0, 0], [1, 1, 1], 0, 0);
      personBody.instanceMatrix.needsUpdate = true;
      return;
    }
    const walking = visual.transitioning && !reducedMotion;
    const progress = walking ? THREE.MathUtils.clamp((simulationTimeS - visual.transitionStartS) / 4, 0, 1) : 0;
    const bob = walking ? Math.sin(progress * Math.PI * 8) * 0.025 : 0;
    const yaw = visual.yaw + (walking ? Math.sin(visual.current.x + visual.current.z) * 0.08 : 0);
    const paying = visual.stage === "payment_active";
    const armLeft: readonly [number, number, number] = paying ? [-0.23, 0.77, 0.1] : [-0.28, 0.75, 0];
    const armRight: readonly [number, number, number] = paying ? [0.23, 0.64, 0.15] : [0.28, 0.75, 0];
    const armLeftRotation: readonly [number, number, number] = paying ? [-0.72, 0, -0.16] : [0, 0, -0.12];
    const armRightRotation: readonly [number, number, number] = paying ? [-0.96, 0, 0.22] : [0, 0, 0.12];
    const handLeft: readonly [number, number, number] = paying ? [-0.23, 0.64, 0.31] : [-0.29, 0.53, 0.02];
    const handRight: readonly [number, number, number] = paying ? [0.27, 0.62, 0.35] : [0.29, 0.53, 0.02];
    const style = hashText(visual.personId);
    const hairScale = 0.92 + ((style >>> 3) % 4) * 0.035;
    const hairY = 1.39 + ((style >>> 7) % 3) * 0.012;

    setPersonPart(personBody, index, visual, [0, 0.76, 0], [0, 0, 0], [1, 1, 1], yaw, bob);
    setPersonPart(personHead, index, visual, [0, 1.28, 0], [0, 0, 0], [1, 1.02, 0.96], yaw, bob);
    setPersonPart(personHair, index, visual, [0, hairY, -0.025], [0, 0, 0], [hairScale, 0.58, hairScale], yaw, bob);
    setPersonPart(personEyes, index * 2, visual, [-0.052, 1.3, 0.155], [0, 0, 0], [1, 1, 1], yaw, bob);
    setPersonPart(personEyes, index * 2 + 1, visual, [0.052, 1.3, 0.155], [0, 0, 0], [1, 1, 1], yaw, bob);
    setPersonPart(personArms, index * 2, visual, armLeft, armLeftRotation, [1, 1, 1], yaw, bob);
    setPersonPart(personArms, index * 2 + 1, visual, armRight, armRightRotation, [1, 1, 1], yaw, bob);
    setPersonPart(personHands, index * 2, visual, handLeft, [0, 0, 0], [1, 1, 1], yaw, bob);
    setPersonPart(personHands, index * 2 + 1, visual, handRight, [0, 0, 0], [1, 1, 1], yaw, bob);
    setPersonPart(personLegs, index * 2, visual, [-0.12, 0.23, 0], [0, 0, -0.02], [1, 1, 1], yaw, bob);
    setPersonPart(personLegs, index * 2 + 1, visual, [0.12, 0.23, 0], [0, 0, 0.02], [1, 1, 1], yaw, bob);
    setPersonPart(personShoes, index * 2, visual, [-0.12, 0.065, 0.055], [0, 0, 0], [1, 1, 1], yaw, bob);
    setPersonPart(personShoes, index * 2 + 1, visual, [0.12, 0.065, 0.055], [0, 0, 0], [1, 1, 1], yaw, bob);
    for (const mesh of personParts) mesh.instanceMatrix.needsUpdate = true;
  };

  const skinPalette = SKIN_COLORS.map((color) => new THREE.Color(color));
  for (const [index, personId] of personIds.entries()) {
    const orderId = personOrderId.get(personId) ?? personId;
    const visual: PersonVisual = {
      personId,
      orderId,
      index,
      from: new THREE.Vector3(-8.15, 0, 6.9),
      current: new THREE.Vector3(-8.15, 0, 6.9),
      target: new THREE.Vector3(-8.15, 0, 6.9),
      visible: false,
      transitionStartS: 0,
      transitioning: false,
      stage: "not_arrived",
      yaw: -0.35,
    };
    personVisuals.set(personId, visual);
    const orderHash = hashText(orderId);
    const memberIndex = personMemberIndex.get(personId) ?? 0;
    const color = new THREE.Color(PERSON_COLORS[orderHash % PERSON_COLORS.length]);
    color.offsetHSL(0, 0, memberIndex % 2 === 0 ? 0.035 : -0.035);
    personBody.setColorAt(index, color);
    personHead.setColorAt(index, skinPalette[hashText(personId) % skinPalette.length]);
    personHair.setColorAt(index, new THREE.Color(HAIR_COLORS[hashText(personId) % HAIR_COLORS.length]));
    personArms.setColorAt(index * 2, color);
    personArms.setColorAt(index * 2 + 1, color);
    const skin = skinPalette[hashText(personId) % skinPalette.length];
    personHands.setColorAt(index * 2, skin);
    personHands.setColorAt(index * 2 + 1, skin);
    const trouserColor = new THREE.Color(TROUSER_COLORS[hashText(personId + ":trousers") % TROUSER_COLORS.length]);
    personLegs.setColorAt(index * 2, trouserColor);
    personLegs.setColorAt(index * 2 + 1, trouserColor);
    const shoeColor = new THREE.Color(SHOE_COLORS[hashText(personId + ":shoes") % SHOE_COLORS.length]);
    personShoes.setColorAt(index * 2, shoeColor);
    personShoes.setColorAt(index * 2 + 1, shoeColor);
    updatePersonMatrix(visual);
  }
  for (const mesh of personParts) {
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  const selectionRing = new THREE.Mesh(
    cachedGeometry("selection-ring", () => new THREE.RingGeometry(0.31, 0.4, 28)),
    new THREE.MeshBasicMaterial({ color: COLORS.strawberryDark, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }),
  );
  disposableMaterials.add(selectionRing.material as THREE.Material);
  selectionRing.name = "Selección de persona";
  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.position.y = 0.035;
  selectionRing.visible = false;
  scene.add(selectionRing);
  const selectedLabel = trackSprite(makeSpriteLabel("", "#ffffff", "rgba(15, 113, 102, 0.96)", textures));
  selectedLabel.visible = false;
  scene.add(selectedLabel);
  let selectedPersonId: string | null = null;

  const workerStatePalette = {
    idle: { text: "#0f7166", background: "rgba(229, 248, 241, 0.98)" },
    active: { text: "#8f2b4d", background: "rgba(255, 224, 234, 0.98)" },
    reserved: { text: "#704b0d", background: "rgba(255, 239, 194, 0.98)" },
  };
  const workerVisuals = new Map<string, WorkerVisual>();
  const animatedWorkerIds = new Set<string>();
  const workerIds = trace.final_workers.map((worker) => worker.worker_id).sort((left, right) => left.localeCompare(right, "en"));
  const workerSlots = new Map<string, number>();
  const workerPools: Record<ReplayWorkerState["pool"], string[]> = { cashier: [], preparer: [], integrated: [] };
  for (const worker of trace.final_workers) workerPools[worker.pool].push(worker.worker_id);
  for (const ids of Object.values(workerPools)) ids.sort((left, right) => left.localeCompare(right, "en"));
  for (const [workerIndex, workerId] of workerIds.entries()) {
    const pool = trace.final_workers.find((worker) => worker.worker_id === workerId)?.pool ?? "cashier";
    workerSlots.set(workerId, workerPools[pool].indexOf(workerId));
    const root = new THREE.Group();
    root.name = `Trabajador ${workerId}`;
    const torso = new THREE.Mesh(cachedGeometry("worker-torso", () => new THREE.CapsuleGeometry(0.22, 0.42, 2, 7)), material(COLORS.tealDark));
    torso.position.y = 0.65;
    torso.castShadow = true;
    root.add(torso);
    const apron = new THREE.Mesh(cachedGeometry("worker-apron", () => new THREE.BoxGeometry(0.4, 0.45, 0.09)), material(COLORS.cream));
    apron.position.set(0, 0.64, 0.2);
    root.add(apron);
    const apronBib = new THREE.Mesh(cachedGeometry("worker-apron-bib", () => new THREE.BoxGeometry(0.32, 0.23, 0.08)), material(COLORS.cream));
    apronBib.position.set(0, 0.91, 0.2);
    root.add(apronBib);
    makeBox(root, "Insignia de uniforme", [0.18, 0.16, 0.045], [0, 0.74, 0.26], COLORS.strawberry);
    makeSphere(root, "Punto del distintivo", 0.035, [0, 0.74, 0.29], COLORS.cream, 8);
    const head = new THREE.Mesh(cachedGeometry("worker-head", () => new THREE.SphereGeometry(0.17, 10, 8)), material(COLORS.skin));
    head.position.y = 1.23;
    head.castShadow = true;
    root.add(head);
    makeCylinder(root, "Gorra de servicio", 0.2, 0.22, 0.13, [0, 1.39, 0], COLORS.cream, 12);
    makeBox(root, "Visera de gorra", [0.42, 0.055, 0.24], [0, 1.37, 0.15], COLORS.strawberryDark);
    const armGeometry = cachedGeometry("worker-arm", () => new THREE.CapsuleGeometry(0.075, 0.28, 1, 6));
    const armMaterial = material(COLORS.tealDark);
    const leftArm = new THREE.Group();
    leftArm.position.set(-0.25, 0.9, 0);
    const leftSleeve = new THREE.Mesh(armGeometry, armMaterial);
    leftSleeve.position.y = -0.19;
    leftSleeve.castShadow = true;
    leftArm.add(leftSleeve);
    makeSphere(leftArm, "Mano de servicio", 0.07, [0, -0.38, 0.025], COLORS.skin, 8);
    root.add(leftArm);
    const rightArm = new THREE.Group();
    rightArm.position.set(0.25, 0.9, 0);
    const rightSleeve = new THREE.Mesh(armGeometry, armMaterial);
    rightSleeve.position.y = -0.19;
    rightSleeve.castShadow = true;
    rightArm.add(rightSleeve);
    makeSphere(rightArm, "Mano de preparación", 0.07, [0, -0.38, 0.025], COLORS.skin, 8);
    root.add(rightArm);
    makeCylinder(root, "Pantalón", 0.11, 0.11, 0.36, [-0.12, 0.2, 0], COLORS.cocoa, 8);
    makeCylinder(root, "Pantalón", 0.11, 0.11, 0.36, [0.12, 0.2, 0], COLORS.cocoa, 8);
    makeBox(root, "Zapato de servicio", [0.27, 0.12, 0.38], [-0.12, 0.06, 0.055], 0x403a38);
    makeBox(root, "Zapato de servicio", [0.27, 0.12, 0.38], [0.12, 0.06, 0.055], 0x403a38);
    const scoop = new THREE.Group();
    scoop.name = `Utensilio de preparación ${workerId}`;
    const scoopHandle = makeCylinder(scoop, "Mango de utensilio", 0.024, 0.024, 0.24, [0, -0.37, 0.12], 0xb5b2aa, 8);
    scoopHandle.rotation.x = Math.PI / 2;
    makeSphere(scoop, "Cazo de utensilio", 0.06, [0, -0.37, 0.24], 0xb5b2aa, 8);
    rightArm.add(scoop);
    scoop.visible = false;
    const tray = new THREE.Group();
    tray.name = `Bandeja de preparación ${workerId}`;
    const neutralBasket = new THREE.Group();
    neutralBasket.name = "Representación genérica de orden histórica";
    makeBox(neutralBasket, "Bandeja genérica", [0.72, 0.08, 0.48], [0, 0.04, 0], COLORS.cream, false);
    makeCylinder(neutralBasket, "Vaso genérico ilustrativo", 0.14, 0.17, 0.32, [0, 0.24, 0], COLORS.paper, 14);
    makeCylinder(neutralBasket, "Borde del vaso genérico", 0.16, 0.16, 0.05, [0, 0.425, 0], COLORS.teal, 14);
    makeSphere(neutralBasket, "Porción ilustrativa neutra", 0.125, [0, 0.51, 0], 0xf0e4ce, 10);
    tray.add(neutralBasket);
    const menuBasket = new THREE.Group();
    menuBasket.name = "Productos registrados para la orden";
    menuBasket.visible = false;
    tray.add(menuBasket);
    tray.visible = false;
    scene.add(tray);
    scene.add(root);
    workerVisuals.set(workerId, {
      workerId,
      pool,
      index: workerIndex,
      root,
      leftArm,
      rightArm,
      badge: null,
      badgeText: "",
      badgeColor: "",
      tray,
      neutralBasket,
      menuBasket,
      basketSignature: "",
      scoop,
      position: new THREE.Vector3(),
      phase: (hashText(workerId) % 1000) / 1000 * Math.PI * 2,
    });
  }

  const paymentSlots = buildQueueSlots(trace, "payment");
  const preparationSlots = buildQueueSlots(trace, "preparation");
  const pendingSlots = buildQueueSlots(trace, "pending");
  const transitioningPeople = new Set<string>();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pointerStart = new THREE.Vector2();
  let pointerDown = false;
  let disposed = false;
  let resizeObserver: ResizeObserver | null = null;
  const pausedOrderIds = new Set(
    trace.events
      .filter((event) => event.type === "preparation_paused" && event.order_id != null)
      .map((event) => event.order_id!),
  );
  const pausedLabels = new Map<string, THREE.Sprite>();
  for (const orderId of pausedOrderIds) {
    const label = addLabel(
      shop,
      "PREPARACIÓN PAUSADA",
      [0, 2.45, 0],
      "#704b0d",
      "rgba(255, 239, 194, 0.98)",
      0.58,
    );
    label.visible = false;
    pausedLabels.set(orderId, label);
  }
  const syncPausedLabels = (state: ReplayState): void => {
    for (const [orderId, label] of pausedLabels) {
      const order = state.orders[orderId];
      const isPaused = order?.state === "preparation_paused";
      label.visible = isPaused;
      if (!isPaused || !order) continue;
      const personId = order.person_ids[0];
      const visual = personId ? personVisuals.get(personId) : undefined;
      if (visual) label.position.set(visual.current.x, 2.45, visual.current.z);
    }
  };
  const deliveryEvents = trace.events
    .filter((event) => event.type === "order_delivered" && event.order_id != null)
    .map((event) => ({ timeS: event.time_s, seq: event.seq, orderId: event.order_id! }))
    .sort((left, right) => left.timeS - right.timeS || left.seq - right.seq);
  const syncDeliveryCue = (timeS: number): void => {
    let low = 0;
    let high = deliveryEvents.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (deliveryEvents[middle].timeS <= timeS) low = middle + 1;
      else high = middle;
    }
    const event = low > 0 ? deliveryEvents[low - 1] : undefined;
    const order = event ? currentState?.orders[event.orderId] : undefined;
    const ageS = event ? timeS - event.timeS : Number.POSITIVE_INFINITY;
    if (!event || order?.state !== "completed" || order.delivery_s !== event.timeS || ageS < 0 || ageS >= 2.4) {
      deliveryCue.visible = false;
      return;
    }

    const labelText = `ENTREGADO · ${options.recordLabels?.[`record:${event.orderId}`] ?? event.orderId}`;
    if (deliveryLabelText !== labelText) {
      deliveryCue.remove(deliveryLabel);
      releaseSprite(deliveryLabel);
      deliveryLabel = trackSprite(makeSpriteLabel(labelText, "#0f7166", "rgba(229, 248, 241, 0.98)", textures));
      deliveryLabel.position.set(0, 1.02, 0);
      deliveryLabel.scale.multiplyScalar(0.46);
      deliveryCue.add(deliveryLabel);
      deliveryLabelText = labelText;
    }
    deliveryCue.visible = true;
  };
  const targetFor = (person: ReplayPersonState): THREE.Vector3 | null => {
    const order = currentState?.orders[person.order_id];
    if (!order) return null;
    if (options.recordMarkers && currentState) {
      if (["not_arrived", "completed", "abandoned"].includes(person.state)) return null;
      // Layout describes records sharing a stage, never staffing or measured positions.
      const sameStage = Object.values(currentState.people).filter((entry) => entry.state === person.state);
      const index = Math.max(0, sameStage.findIndex((entry) => entry.person_id === person.person_id));
      const column = index % 5;
      const row = Math.floor(index / 5);
      const x = person.state === "waiting_payment" ? -7.2
        : person.state === "payment_active" ? -6.7
          : person.state === "preparing" ? 1.7 : -1.7;
      const z = person.state === "payment_active" || person.state === "preparing" ? -1.35 : 1.1;
      return new THREE.Vector3(x + column * 0.72, 0, z + row * 0.76);
    }
    const memberIndex = order.person_ids.indexOf(person.person_id);
    return personPosition(person, memberIndex, order.person_ids.length, paymentSlots, preparationSlots, pendingSlots);
  };

  const workerStatus = (worker: ReplayWorkerState): { text: string; color: keyof typeof workerStatePalette } => {
    if (worker.reserved && !worker.active && worker.stage === "external_confirmation") {
      return { text: "Conf. externa", color: "reserved" };
    }
    if (worker.active && worker.stage === "payment_active") return { text: "Pago", color: "active" };
    if (worker.active && (worker.stage === "preparation" || worker.stage === "preparing")) {
      return { text: "Preparación", color: "active" };
    }
    if (worker.reserved && !worker.active) return { text: "Reservado", color: "reserved" };
    return { text: "Libre", color: "idle" };
  };

  const updateWorker = (worker: ReplayWorkerState | undefined): void => {
    if (!worker) return;
    const visual = workerVisuals.get(worker.worker_id);
    if (!visual) return;
    const poolIndex = workerSlots.get(worker.worker_id) ?? visual.index;
    let x = -5.65 + (poolIndex - (workerPools.cashier.length - 1) / 2) * 0.76;
    let z = -3.48;
    if (worker.pool === "preparer") {
      x = 2.0 + poolIndex * 1.22;
    } else if (worker.pool === "integrated" && worker.stage === "preparation") {
      x = 3.15 + poolIndex * 1.25;
    }
    const position = new THREE.Vector3(x, 0, z);
    visual.position.copy(position);
    visual.root.position.copy(position);
    visual.root.rotation.y = 0;
    visual.tray.position.set(x, 1.08, worker.pool === "cashier" ? -2.28 : -2.18);
    const preparing = worker.active && (worker.stage === "preparation" || worker.stage === "preparing");
    const paying = worker.active && worker.stage === "payment_active";
    const assignedOrder = worker.assigned_order_id
      ? currentState?.orders[worker.assigned_order_id]
      : undefined;
    const items = assignedOrder?.items ?? [];
    const basketSignature = productBasketSignature(items);
    if (basketSignature !== visual.basketSignature) {
      for (const product of [...visual.menuBasket.children]) visual.menuBasket.remove(product);
      if (items.length > 0) {
        makeBox(visual.menuBasket, "Bandeja de productos", [1.25, 0.08, 0.78], [0, 0.04, 0], COLORS.cream, false);
        const models = visibleProductKinds(items);
        models.forEach((kind, index) => {
          const product = makeProductUnit(kind);
          const column = index % 3;
          const row = Math.floor(index / 3);
          product.position.set((column - 1) * 0.39, 0.1, (row - 0.5) * 0.34);
          visual.menuBasket.add(product);
        });
      }
      visual.basketSignature = basketSignature;
    }
    visual.menuBasket.visible = items.length > 0;
    visual.neutralBasket.visible = items.length === 0;
    visual.tray.visible = preparing;
    visual.scoop.visible = preparing;
    if (worker.active) animatedWorkerIds.add(worker.worker_id);
    else animatedWorkerIds.delete(worker.worker_id);
    visual.leftArm.rotation.x = paying ? -0.48 : preparing ? -0.72 : 0;
    visual.rightArm.rotation.x = paying ? -1.02 : preparing ? -0.88 : 0;
    const status = workerStatus(worker);
    const palette = workerStatePalette[status.color];
    if (visual.badgeText !== status.text || visual.badgeColor !== palette.background) {
      if (visual.badge) {
        visual.root.remove(visual.badge);
        releaseSprite(visual.badge);
      }
      visual.badge = trackSprite(makeSpriteLabel(`${worker.worker_id} · ${status.text}`, palette.text, palette.background, textures));
      visual.badge.scale.multiplyScalar(0.36);
      visual.badge.position.set(0, 1.9, 0);
      visual.root.add(visual.badge);
      visual.badgeText = status.text;
      visual.badgeColor = palette.background;
    }
    visual.leftArm.rotation.z = 0;
    visual.rightArm.rotation.z = 0;
  };

  const updatePerson = (person: ReplayPersonState | undefined, order: ReplayOrderState | undefined, animate: boolean): void => {
    if (!person || !order) return;
    const visual = personVisuals.get(person.person_id);
    if (!visual) return;
    const target = targetFor(person);
    const nextStage = person.state;
    if (!target) {
      visual.visible = false;
      visual.transitioning = false;
      transitioningPeople.delete(person.person_id);
      updatePersonMatrix(visual);
      if (selectedPersonId === person.person_id) selectionRing.visible = false;
      return;
    }
    const changed = visual.stage !== nextStage || !visual.visible;
    if (changed && animate && !reducedMotion && !options.recordMarkers) {
      if (visual.transitioning) visual.current.copy(visual.target);
      visual.from.copy(visual.current);
      if (!visual.visible) visual.from.set(-8.15, 0, 6.9);
      visual.target.copy(target);
      visual.transitionStartS = stateTime(order);
      visual.transitioning = true;
      transitioningPeople.add(person.person_id);
      visual.visible = true;
    } else {
      visual.current.copy(target);
      visual.from.copy(target);
      visual.target.copy(target);
      visual.transitioning = false;
      transitioningPeople.delete(person.person_id);
      visual.visible = true;
    }
    visual.stage = nextStage;
    if (nextStage === "payment_active") visual.yaw = -Math.PI / 2;
    else if (nextStage === "waiting_payment") visual.yaw = Math.PI;
    else if (nextStage === "preparation_paused") visual.yaw = Math.PI * 0.65;
    else if (nextStage === "preparing" || nextStage === "waiting_preparation") visual.yaw = Math.PI * 0.83;
    else visual.yaw = 0;
    updatePersonMatrix(visual);
  };

  const setSelectedPersonPosition = (): void => {
    const visual = selectedPersonId ? personVisuals.get(selectedPersonId) : undefined;
    if (!visual?.visible) {
      selectionRing.visible = false;
      selectedLabel.visible = false;
      return;
    }
    selectionRing.visible = true;
    selectionRing.position.set(visual.current.x, 0.045, visual.current.z);
    selectedLabel.position.set(visual.current.x, 1.57, visual.current.z);
    selectedLabel.visible = true;
  };

  const render = (): void => {
    if (disposed) return;
    renderer.render(scene, camera);
  };

  const resize = (): void => {
    if (disposed) return;
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = framingFov(camera.aspect);
    camera.updateProjectionMatrix();
    render();
  };

  const handleContextLost = (event: Event): void => {
    event.preventDefault();
    renderer.setAnimationLoop(null);
    options.onContextLost();
  };
  const handleResize = (): void => resize();
  const handlePointerDown = (event: PointerEvent): void => {
    pointerDown = true;
    pointerStart.set(event.clientX, event.clientY);
  };
  const handlePointerUp = (event: PointerEvent): void => {
    if (!pointerDown) return;
    pointerDown = false;
    if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5) return;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    if (options.recordMarkers) personBody.computeBoundingSphere();
    const hit = raycaster.intersectObject(personBody, false)[0];
    const personId = hit?.instanceId == null ? null : personIds[hit.instanceId] ?? null;
    options.onPersonSelected(personId);
  };
  const handlePointerCancel = (): void => { pointerDown = false; };
  const handleControlsChange = (): void => render();
  canvas.addEventListener("webglcontextlost", handleContextLost);
  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerCancel);
  controls.addEventListener("change", handleControlsChange);
  window.addEventListener("resize", handleResize);
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);
  }

  return {
    setAnimationLoop(callback) {
      if (disposed) return;
      renderer.setAnimationLoop(callback);
    },
    render,
    setState(nextState, changedOrderIds, animate) {
      const previous = currentState;
      currentState = nextState;
      const changedIds = changedOrderIds ?? Object.keys(nextState.orders);
      const changedWorkers = new Set<string>();
      for (const orderId of changedIds) {
        const previousOrder = previous?.orders[orderId];
        const nextOrder = nextState.orders[orderId];
        if (previousOrder?.worker_id) changedWorkers.add(previousOrder.worker_id);
        if (nextOrder?.worker_id) changedWorkers.add(nextOrder.worker_id);
        const peopleForOrder = nextOrder?.person_ids ?? previousOrder?.person_ids ?? [];
        for (const personId of peopleForOrder) updatePerson(nextState.people[personId], nextOrder, animate);
      }
      for (const workerId of changedWorkers) updateWorker(nextState.workers[workerId]);
      if (!previous) for (const worker of Object.values(nextState.workers)) updateWorker(worker);
      syncPausedLabels(nextState);
      if (previous?.admissions_closed !== nextState.admissions_closed) {
        const entranceStatus = shop.getObjectByName("admission-status");
        if (entranceStatus instanceof THREE.Sprite) {
          releaseSprite(entranceStatus);
          shop.remove(entranceStatus);
        }
        const badge = addLabel(
          shop,
          options.recordMarkers ? "VENTANA OBSERVADA" : nextState.admissions_closed ? "ADMISIONES CERRADAS" : "ADMISIONES ABIERTAS",
          [-8.15, 5.35, 7.15],
          nextState.admissions_closed ? "#6a4c43" : "#0f7166",
          nextState.admissions_closed ? "rgba(255, 239, 194, 0.98)" : "rgba(229, 248, 241, 0.98)",
          0.72,
        );
        badge.name = "admission-status";
      }
      setSelectedPersonPosition();
      render();
    },
    setSimulationTime(timeS) {
      const reverseSeek = timeS < simulationTimeS;
      simulationTimeS = timeS;
      if (reverseSeek && currentState) {
        for (const person of Object.values(currentState.people)) {
          updatePerson(person, currentState.orders[person.order_id], false);
        }
        for (const worker of Object.values(currentState.workers)) updateWorker(worker);
        transitioningPeople.clear();
        syncPausedLabels(currentState);
      }
      if (transitioningPeople.size > 0 && currentState) {
        for (const personId of [...transitioningPeople]) {
          const visual = personVisuals.get(personId);
          const order = visual ? currentState.orders[visual.orderId] : undefined;
          if (!visual || !order) {
            transitioningPeople.delete(personId);
            continue;
          }
          const progress = THREE.MathUtils.clamp((timeS - visual.transitionStartS) / 4, 0, 1);
          visual.current.lerpVectors(visual.from, visual.target, progress);
          if (progress >= 1) {
            visual.current.copy(visual.target);
            visual.transitioning = false;
            transitioningPeople.delete(personId);
          }
          updatePersonMatrix(visual);
        }
      }
      for (const workerId of animatedWorkerIds) {
        const visual = workerVisuals.get(workerId);
        if (!visual) continue;
        const worker = currentState?.workers[visual.workerId];
        if (!worker?.active || reducedMotion) {
          visual.leftArm.rotation.z = 0;
          visual.rightArm.rotation.z = 0;
          continue;
        }
        const isPreparing = worker.stage === "preparation" || worker.stage === "preparing";
        const phase = simulationTimeS * (isPreparing ? 7.2 : 4.4) + visual.phase;
        const swing = Math.sin(phase) * (isPreparing ? 0.42 : 0.17);
        visual.leftArm.rotation.z = swing;
        visual.rightArm.rotation.z = -swing;
      }
      syncDeliveryCue(timeS);
      setSelectedPersonPosition();
    },
    setSelection(personId) {
      selectedPersonId = personId;
      if (personId) {
        const visual = personVisuals.get(personId);
        releaseSprite(selectedLabel);
        const orderId = personOrderId.get(personId) ?? "";
        const label = trackSprite(makeSpriteLabel(options.recordLabels?.[personId] ?? `${personId} · ${orderId}`, "#ffffff", "rgba(15, 113, 102, 0.96)", textures));
        selectedLabel.material = label.material;
        selectedLabel.scale.copy(label.scale);
        void visual;
      }
      setSelectedPersonPosition();
      render();
    },
    setReducedMotion(reduced) {
      reducedMotion = reduced;
      if (reduced) this.finishCosmeticMotion();
    },
    setView(view) {
      upperFacade.visible = view === "facade";
      canopyAndSign.visible = view === "facade";

      openStorefront.visible = true;
      const preset = cameraPresets[view];
      cameraHome.copy(preset.position);
      cameraTarget.copy(preset.target);
      camera.position.copy(cameraHome);
      controls.target.copy(cameraTarget);
      controls.update();
      render();
    },
    resetCamera() {
      camera.position.copy(cameraHome);
      controls.target.copy(cameraTarget);
      controls.update();
      render();
    },
    zoom(direction) {
      const offset = camera.position.clone().sub(controls.target);
      const factor = direction === "in" ? 0.82 : 1.22;
      offset.multiplyScalar(factor);
      const distance = THREE.MathUtils.clamp(offset.length(), controls.minDistance, controls.maxDistance);
      offset.setLength(distance);
      camera.position.copy(controls.target).add(offset);
      controls.update();
      render();
    },
    finishCosmeticMotion() {
      if (currentState) {
        for (const person of Object.values(currentState.people)) {
          updatePerson(person, currentState.orders[person.order_id], false);
        }
        for (const worker of Object.values(currentState.workers)) updateWorker(worker);
        syncPausedLabels(currentState);
      }
      transitioningPeople.clear();
      for (const visual of workerVisuals.values()) {
        visual.leftArm.rotation.z = 0;
        visual.rightArm.rotation.z = 0;
      }
      deliveryCue.visible = false;
      setSelectedPersonPosition();
      render();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      renderer.setAnimationLoop(null);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", handleResize);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerCancel);
      controls.removeEventListener("change", handleControlsChange);
      controls.dispose();
      for (const mesh of personParts) mesh.dispose();
      for (const geometry of geometries.values()) geometry.dispose();
      for (const texture of textures) texture.dispose();
      for (const item of disposableMaterials) item.dispose();
      textures.clear();
      disposableMaterials.clear();
      renderer.dispose();
    },
  };
}
