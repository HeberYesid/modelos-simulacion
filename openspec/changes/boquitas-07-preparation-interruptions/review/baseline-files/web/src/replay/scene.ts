import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { ReplayOrderState, ReplayPersonState, ReplayState, ReplayTrace, ReplayWorkerState } from "./project";

export interface ShopSceneOptions {
  reducedMotion: boolean;
  onPersonSelected: (personId: string | null) => void;
  onContextLost: () => void;
}

export interface ShopScene {
  setAnimationLoop(callback: ((timeMs: number) => void) | null): void;
  render(): void;
  setState(state: ReplayState, changedOrderIds: readonly string[] | null, animate: boolean): void;
  setSimulationTime(timeS: number): void;
  setSelection(personId: string | null): void;
  setReducedMotion(reduced: boolean): void;
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
    depthTest: false,
    sizeAttenuation: true,
  }));
  sprite.scale.set(Math.min(6.4, Math.max(1.85, canvas.width / 125)), 0.64, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function personPosition(
  person: ReplayPersonState,
  memberIndex: number,
  paymentSlots: ReadonlyMap<string, QueueSlot>,
  preparationSlots: ReadonlyMap<string, QueueSlot>,
  pendingSlots: ReadonlyMap<string, QueueSlot>,
): THREE.Vector3 | null {
  const center = (slot: QueueSlot, offset: number): THREE.Vector3 => new THREE.Vector3(slot.x + offset, 0, slot.z);
  const groupOffset = memberIndex === 0 ? -0.2 : 0.23;
  switch (person.state) {
    case "not_arrived":
    case "completed":
    case "abandoned":
      return null;
    case "waiting_payment": {
      const slot = paymentSlots.get(person.order_id) ?? { x: -6.1, z: 0.7 };
      return center(slot, groupOffset);
    }
    case "payment_active":
      if (memberIndex === 0) return new THREE.Vector3(-5.35, 0, -1.35);
      return new THREE.Vector3(-3.9 + (memberIndex - 1) * 0.62, 0, -0.95);
    case "payment_pending": {
      const slot = pendingSlots.get(person.order_id) ?? { x: -3.65, z: -0.55 };
      return center(slot, groupOffset);
    }
    case "waiting_preparation": {
      const slot = preparationSlots.get(person.order_id) ?? { x: -0.25, z: 0.8 };
      return center(slot, groupOffset);
    }
    case "preparing": {
      const slot = preparationSlots.get(person.order_id) ?? { x: 0.7, z: 0.2 };
      return center({ x: slot.x + 1.55, z: slot.z - 0.65 }, groupOffset);
    }
    default:
      return null;
  }
}

function stateTime(order: ReplayOrderState): number {
  return stageStart(order) ?? 0;
}

function buildQueueSlots(trace: ReplayTrace, kind: "payment" | "preparation" | "pending"): Map<string, QueueSlot> {
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
    const column = index % 6;
    const row = Math.floor(index / 6);
    const slot = kind === "payment"
      ? { x: -6.1 + (column - 2.5) * 0.68, z: 0.6 + row * 0.72 }
      : kind === "preparation"
        ? { x: -0.25 + (column - 2.5) * 0.68, z: 0.8 + row * 0.72 }
        : { x: -3.65 + (column - 2.5) * 0.62, z: -0.55 + row * 0.62 };
    if (!slots.has(orderId)) slots.set(orderId, slot);
  }
  return slots;
}

export function createShopScene(
  stage: HTMLElement,
  canvas: HTMLCanvasElement,
  trace: ReplayTrace,
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
  const camera = new THREE.PerspectiveCamera(37, Math.max(1, stage.clientWidth) / Math.max(1, stage.clientHeight), 0.1, 110);
  const cameraHome = new THREE.Vector3(19, 17, 23);
  const cameraTarget = new THREE.Vector3(0, 0.5, 0);
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

  const platformGeometry = cachedGeometry("box:25:0.55:19", () => new THREE.BoxGeometry(25, 0.55, 19));
  const platform = new THREE.Mesh(platformGeometry, material(COLORS.floorEdge));
  platform.position.set(0, -0.3, 0);
  platform.receiveShadow = true;
  platform.castShadow = true;
  shop.add(platform);
  const floor = new THREE.Mesh(cachedGeometry("plane:24:18", () => new THREE.PlaneGeometry(24, 18)), material(COLORS.floor));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.015;
  floor.receiveShadow = true;
  shop.add(floor);

  makeBox(shop, "Muro posterior", [22.6, 6.2, 0.38], [0, 3.05, -8.95], COLORS.wall, false, true);
  makeBox(shop, "Muro lateral izquierdo", [0.38, 5.3, 14.5], [-11.05, 2.6, -0.9], COLORS.paleTeal, false, true);
  makeBox(shop, "Muro lateral derecho", [0.38, 5.3, 14.5], [11.05, 2.6, -0.9], COLORS.wallShadow, false, true);
  makeBox(shop, "Zócalo posterior", [22.7, 0.35, 0.48], [0, 0.2, -8.75], COLORS.teal);
  makeBox(shop, "Marco superior posterior", [22.7, 0.28, 0.5], [0, 5.95, -8.75], COLORS.strawberry);

  // A striped awning, bright counter fronts and window panels give the room its shop identity.
  makeBox(shop, "Vitrina izquierda", [4.2, 2.25, 0.16], [-6.15, 3.15, -8.68], COLORS.paleTeal);
  makeBox(shop, "Vitrina central", [4.2, 2.25, 0.16], [-1.2, 3.15, -8.68], COLORS.paleTeal);
  makeBox(shop, "Vitrina right", [4.2, 2.25, 0.16], [4.25, 3.15, -8.68], COLORS.paleTeal);
  for (const x of [-8.25, -4.05, -3.3, 0.9, 2.15, 6.35, 7.1, 9.2]) {
    makeBox(shop, "Divisor de vitrina", [0.12, 2.45, 0.18], [x, 3.1, -8.55], COLORS.paper);
  }
  makeBox(shop, "Letrero de heladería", [5.1, 0.92, 0.34], [0, 5.02, -8.48], COLORS.strawberryDark, true);
  addLabel(shop, "HELADERÍA", [0, 5.02, -8.24], "#fff9e9", "rgba(182, 46, 90, 0.97)", 1.18);
  addLabel(shop, "VISTA ILUSTRATIVA", [0, 4.35, -8.28], "#3e645f", "rgba(255, 255, 255, 0.94)", 0.74);

  // Entrance, door frame and four scalloped awning stripes at the front edge.
  makeBox(shop, "Marco de entrada", [2.8, 4.3, 0.38], [-8.15, 2.15, 6.2], COLORS.wood);
  makeBox(shop, "Puerta de vidrio", [2.26, 3.8, 0.16], [-8.15, 2.04, 6.14], COLORS.tealDark);
  makeBox(shop, "Panel de puerta", [1.77, 3.25, 0.12], [-8.16, 1.82, 6.03], COLORS.paleTeal);
  makeSphere(shop, "Manija de puerta", 0.09, [-7.55, 1.75, 5.9], COLORS.mango, 8);
  makeBox(shop, "Alero de entrada", [4.6, 0.28, 2.05], [-8.15, 4.5, 7.0], COLORS.paper, true);
  for (let stripe = 0; stripe < 8; stripe += 1) {
    const stripeX = -10.25 + stripe * 0.6;
    makeBox(shop, "Franja del alero", [0.48, 0.08, 1.72], [stripeX, 4.33, 7.04], stripe % 2 === 0 ? COLORS.strawberry : COLORS.cream);
  }

  // Cashier and preparation counters are separate model zones even when a regular worker serves both.
  const cashierX = -5.65;
  const cashierZ = -2.55;
  makeBox(shop, "Base de caja", [4.9, 1.0, 1.05], [cashierX, 0.55, cashierZ], COLORS.teal, true, true);
  makeBox(shop, "Banda de caja", [4.92, 0.22, 1.08], [cashierX, 0.72, cashierZ], COLORS.tealDark, false, true);
  makeBox(shop, "Cubierta de caja", [5.1, 0.18, 1.22], [cashierX, 1.1, cashierZ], COLORS.cream, false, true);
  makeBox(shop, "Terminal de pago", [0.46, 0.32, 0.28], [-5.45, 1.34, -2.18], COLORS.cocoa, false);
  makeBox(shop, "Pantalla terminal", [0.34, 0.18, 0.04], [-5.45, 1.36, -2.01], COLORS.mango, false);
  addLabel(shop, "CAJA · PAGO", [cashierX, 2.55, cashierZ - 0.04], "#0f7166", "rgba(255, 249, 233, 0.97)", 0.9);
  addLabel(shop, "CONFIRMACIÓN EXTERNA", [-3.35, 1.82, -0.1], "#6b480c", "rgba(255, 239, 194, 0.98)", 0.64);

  const preparationX = 4.7;
  const preparationZ = -2.55;
  makeBox(shop, "Base de preparación", [8.35, 0.95, 1.35], [preparationX, 0.52, preparationZ], COLORS.strawberry, true, true);
  makeBox(shop, "Banda de preparación", [8.37, 0.22, 1.39], [preparationX, 0.68, preparationZ], COLORS.strawberryDark, false, true);
  makeBox(shop, "Cubierta de preparación", [8.55, 0.18, 1.55], [preparationX, 1.05, preparationZ], COLORS.cream, false, true);
  makeBox(shop, "Mostrador de entrega", [3.0, 0.45, 0.86], [7.7, 0.68, -1.2], COLORS.teal, true, true);
  makeBox(shop, "Cubierta de entrega", [3.15, 0.16, 0.98], [7.7, 0.96, -1.2], COLORS.cream, false, true);
  addLabel(shop, "PREPARACIÓN", [preparationX, 2.32, preparationZ], "#b62e5a", "rgba(255, 249, 233, 0.97)", 0.9);
  addLabel(shop, "ENTREGA", [7.7, 1.85, -0.95], "#0f7166", "rgba(255, 249, 233, 0.97)", 0.75);

  // Paid waiting area: benches and a warm tile cue sit between payment and pickup.
  makeBox(shop, "Alfombra espera pagada", [6.6, 0.04, 4.6], [-0.05, 0.02, 2.15], COLORS.palePink);
  addLabel(shop, "ESPERA PAGADA", [-0.05, 2.25, 2.05], "#89556a", "rgba(255, 255, 255, 0.96)", 0.78);
  for (const benchX of [-1.6, 1.65]) {
    makeBox(shop, "Asiento", [2.55, 0.22, 0.64], [benchX, 0.72, 2.65], COLORS.wood, true);
    makeBox(shop, "Respaldo del asiento", [2.55, 0.88, 0.16], [benchX, 1.22, 2.97], COLORS.strawberry, true);
    for (const legX of [benchX - 0.9, benchX + 0.9]) {
      makeBox(shop, "Pata de asiento", [0.12, 0.72, 0.12], [legX, 0.36, 2.65], COLORS.cocoa);
    }
  }
  for (const x of [-10, 9.85]) {
    const pot = makeCylinder(shop, "Maceta", 0.48, 0.38, 0.62, [x, 0.31, 4.15], COLORS.wood);
    pot.castShadow = true;
    makeCylinder(shop, "Planta", 0.28, 0.42, 1.18, [x, 1.16, 4.15], COLORS.green, 10);
    makeSphere(shop, "Copa de planta", 0.58, [x, 1.82, 4.15], COLORS.green, 9);
  }
  for (const [lampX, lampZ] of [[-2.2, -6.0], [3.5, -6.0], [8.3, -6.0]] as const) {
    makeCylinder(shop, "Cable de lámpara", 0.025, 0.025, 1.05, [lampX, 5.35, lampZ], COLORS.cocoa, 6);
    makeSphere(shop, "Lámpara cálida", 0.32, [lampX, 4.72, lampZ], COLORS.mango, 10);
  }

  const personOrder = Object.values(trace.final_orders).flatMap((order) => order.person_ids.map((personId) => [personId, order.order_id] as const));
  const personIds = personOrder.map(([personId]) => personId);
  const personOrderId = new Map(personOrder);
  const personMemberIndex = new Map<string, number>();
  for (const order of trace.final_orders) {
    order.person_ids.forEach((personId, index) => personMemberIndex.set(personId, index));
  }
  const personVisuals = new Map<string, PersonVisual>();
  const personBodyGeometry = cachedGeometry("person-body", () => new THREE.CapsuleGeometry(0.19, 0.42, 2, 7));
  const personHeadGeometry = cachedGeometry("person-head", () => new THREE.SphereGeometry(0.17, 10, 8));
  const personBody = new THREE.InstancedMesh(personBodyGeometry, material(0xffffff), Math.max(1, personIds.length));
  personBody.name = "Personas · cuerpos";
  personBody.count = personIds.length;
  personBody.castShadow = true;
  personBody.frustumCulled = false;
  const personHead = new THREE.InstancedMesh(personHeadGeometry, material(0xffffff), Math.max(1, personIds.length));
  personHead.name = "Personas · rostros";
  personHead.count = personIds.length;
  personHead.castShadow = true;
  personHead.frustumCulled = false;
  scene.add(personBody, personHead);

  const dummy = new THREE.Object3D();
  const hiddenPosition = new THREE.Vector3(0, -200, 0);
  const updatePersonMatrix = (visual: PersonVisual): void => {
    const index = visual.index;
    if (!visual.visible) {
      dummy.position.copy(hiddenPosition);
      dummy.scale.setScalar(0.001);
      dummy.rotation.set(0, 0, 0);
    } else {
      const walking = visual.transitioning && !options.reducedMotion;
      const progress = walking ? THREE.MathUtils.clamp((simulationTimeS - visual.transitionStartS) / 4, 0, 1) : 0;
      const bob = walking ? Math.sin(progress * Math.PI * 8) * 0.025 : 0;
      dummy.position.set(visual.current.x, 0.52 + bob, visual.current.z);
      dummy.rotation.set(0, visual.yaw + (walking ? Math.sin(visual.current.x + visual.current.z) * 0.08 : 0), 0);
      dummy.scale.set(1, 1, 1);
    }
    dummy.updateMatrix();
    personBody.setMatrixAt(index, dummy.matrix);
    if (visual.visible) {
      dummy.position.set(visual.current.x, 0.98, visual.current.z);
      dummy.rotation.set(0, visual.yaw, 0);
      dummy.scale.set(1, 1, 1);
    } else {
      dummy.position.copy(hiddenPosition);
      dummy.scale.setScalar(0.001);
      dummy.rotation.set(0, 0, 0);
    }
    dummy.updateMatrix();
    personHead.setMatrixAt(index, dummy.matrix);
    personBody.instanceMatrix.needsUpdate = true;
    personHead.instanceMatrix.needsUpdate = true;
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
    updatePersonMatrix(visual);
  }
  if (personBody.instanceColor) personBody.instanceColor.needsUpdate = true;
  if (personHead.instanceColor) personHead.instanceColor.needsUpdate = true;

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
    const apron = new THREE.Mesh(cachedGeometry("worker-apron", () => new THREE.BoxGeometry(0.36, 0.46, 0.09)), material(COLORS.cream));
    apron.position.set(0, 0.63, 0.2);
    root.add(apron);
    const head = new THREE.Mesh(personHeadGeometry, material(COLORS.skin));
    head.position.y = 1.23;
    head.castShadow = true;
    root.add(head);
    const armGeometry = cachedGeometry("worker-arm", () => new THREE.CapsuleGeometry(0.075, 0.28, 1, 6));
    const armMaterial = material(COLORS.tealDark);
    const leftArm = new THREE.Group();
    leftArm.position.set(-0.24, 0.91, 0);
    const leftSleeve = new THREE.Mesh(armGeometry, armMaterial);
    leftSleeve.position.y = -0.19;
    leftSleeve.castShadow = true;
    leftArm.add(leftSleeve);
    root.add(leftArm);
    const rightArm = new THREE.Group();
    rightArm.position.set(0.24, 0.91, 0);
    const rightSleeve = new THREE.Mesh(armGeometry, armMaterial);
    rightSleeve.position.y = -0.19;
    rightSleeve.castShadow = true;
    rightArm.add(rightSleeve);
    root.add(rightArm);
    makeCylinder(root, "Pantalón", 0.14, 0.14, 0.36, [-0.12, 0.17, 0], COLORS.cocoa, 8);
    makeCylinder(root, "Pantalón", 0.14, 0.14, 0.36, [0.12, 0.17, 0], COLORS.cocoa, 8);
    const tray = new THREE.Group();
    tray.name = `Orden en trabajo ${workerId}`;
    makeBox(tray, "Bandeja genérica", [0.82, 0.1, 0.56], [0, 0.05, 0], COLORS.cream, false);
    makeCylinder(tray, "Vaso genérico de demostración", 0.16, 0.2, 0.38, [0, 0.28, 0], COLORS.paper, 14);
    makeCylinder(tray, "Borde del vaso", 0.19, 0.19, 0.07, [0, 0.49, 0], COLORS.teal, 14);
    makeSphere(tray, "Ilustración de porción", 0.15, [0, 0.59, 0], COLORS.mango, 10);
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
  let reducedMotion = options.reducedMotion;
  let currentState: ReplayState | null = null;
  let simulationTimeS = 0;
  let disposed = false;
  let resizeObserver: ResizeObserver | null = null;
  const targetFor = (person: ReplayPersonState): THREE.Vector3 | null => {
    const order = currentState?.orders[person.order_id];
    if (!order) return null;
    const memberIndex = order.person_ids.indexOf(person.person_id);
    return personPosition(person, memberIndex, paymentSlots, preparationSlots, pendingSlots);
  };

  const workerStatus = (worker: ReplayWorkerState): { text: string; color: keyof typeof workerStatePalette } => {
    if (worker.reserved && !worker.active && worker.stage === "external_confirmation") {
      return { text: "Reservado · confirmación externa", color: "reserved" };
    }
    if (worker.active && worker.stage === "payment_active") return { text: "Pago activo", color: "active" };
    if (worker.active && (worker.stage === "preparation" || worker.stage === "preparing")) {
      return { text: "Preparación activa", color: "active" };
    }
    if (worker.reserved && !worker.active) return { text: "Orden reservada", color: "reserved" };
    return { text: "Disponible", color: "idle" };
  };

  const updateWorker = (worker: ReplayWorkerState | undefined): void => {
    if (!worker) return;
    const visual = workerVisuals.get(worker.worker_id);
    if (!visual) return;
    const poolIndex = workerSlots.get(worker.worker_id) ?? visual.index;
    let x = -5.65 + (poolIndex - (workerPools.cashier.length - 1) / 2) * 0.76;
    let z = -3.75;
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
    visual.tray.visible = preparing;
    if (worker.active) animatedWorkerIds.add(worker.worker_id);
    else animatedWorkerIds.delete(worker.worker_id);
    const status = workerStatus(worker);
    const palette = workerStatePalette[status.color];
    if (visual.badgeText !== status.text || visual.badgeColor !== palette.background) {
      if (visual.badge) {
        visual.root.remove(visual.badge);
        releaseSprite(visual.badge);
      }
      visual.badge = trackSprite(makeSpriteLabel(`${worker.worker_id} · ${status.text}`, palette.text, palette.background, textures));
      visual.badge.position.set(0, 2.25, 0);
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
    if (changed && animate && !reducedMotion) {
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
      if (previous?.admissions_closed !== nextState.admissions_closed) {
        const entranceStatus = shop.getObjectByName("admission-status");
        if (entranceStatus instanceof THREE.Sprite) {
          releaseSprite(entranceStatus);
          shop.remove(entranceStatus);
        }
        const badge = addLabel(
          shop,
          nextState.admissions_closed ? "ADMISIONES CERRADAS" : "ADMISIONES ABIERTAS",
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
      simulationTimeS = timeS;
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
      setSelectedPersonPosition();
    },
    setSelection(personId) {
      selectedPersonId = personId;
      if (personId) {
        const visual = personVisuals.get(personId);
        releaseSprite(selectedLabel);
        const orderId = personOrderId.get(personId) ?? "";
        const label = trackSprite(makeSpriteLabel(`${personId} · ${orderId}`, "#ffffff", "rgba(15, 113, 102, 0.96)", textures));
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
      for (const personId of transitioningPeople) {
        const visual = personVisuals.get(personId);
        if (!visual) continue;
        visual.current.copy(visual.target);
        visual.transitioning = false;
        updatePersonMatrix(visual);
      }
      transitioningPeople.clear();
      for (const visual of workerVisuals.values()) {
        visual.leftArm.rotation.z = 0;
        visual.rightArm.rotation.z = 0;
      }
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
      for (const geometry of geometries.values()) geometry.dispose();
      for (const texture of textures) texture.dispose();
      for (const item of disposableMaterials) item.dispose();
      textures.clear();
      disposableMaterials.clear();
      renderer.dispose();
    },
  };
}
