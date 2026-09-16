// gl-model.js — 계산 결과(mm) → Three.js 씬이 쓸 값(unit). 순수 함수. DOM·Three.js 없음.
// ─────────────────────────────────────────────────────────────────────────────
// 여기서는 **아무것도 새로 계산하지 않는다.** engine.js(LED 배열·크기)와
// room-presets.js(가구 배치)가 이미 낸 값을 단위만 바꿔 담는다.
// 이 파일을 따로 둔 이유는 하나 — Three.js 없이 `npm test`(Node)로 검증할 수 있게 하기 위해서다.
// 실제 그리기는 render3d-gl.js.
// ─────────────────────────────────────────────────────────────────────────────

// ── 단위 ────────────────────────────────────────────────────────────────────
// 계산기의 모든 길이는 mm다. Three.js는 1 단위가 1 m일 때 조명·카메라 기본값이 가장 잘 맞는다.
// 그래서 씬에 넣기 직전에 딱 한 번 여기서 바꾼다. 씬 안에서는 mm를 쓰지 않는다.
export const MM_PER_UNIT = 1000;                          // 1000 mm = 1 unit (= 1 m)
export const u = mm => (Number(mm) || 0) / MM_PER_UNIT;   // mm → unit
export const toMm = units => (Number(units) || 0) * MM_PER_UNIT;   // unit → mm (되돌리기용)

// ── 카메라 상수 ─────────────────────────────────────────────────────────────
// 기존 3D 뷰의 카메라 언어(DEC-059·DEC-060)를 잇는다 — '미니어처를 내려다보는' 느낌이 아니라
// '실제 공간 안에서 조금 높은 사람 시점'.
export const EYE_MM = 2350;        // 카메라 눈높이(바닥에서 mm)
export const LOOK_MM = 1250;       // 바라보는 높이 — 눈높이보다 낮아 바닥이 화면에 들어온다
export const START_YAW_DEG = 21;   // 처음 서는 각도(우측 코너). OrbitControls로 자유롭게 돌릴 수 있다.

// 화각. 기존 Canvas 뷰(33°)는 카메라가 방 '밖'에 서는 그림이라 좁아도 됐다.
//   실내 시점은 카메라가 방 안에 갇히므로(뒷벽보다 뒤로 못 감) 좁은 화각이면 LED만 꽉 찬다.
//   40°면 10 m 방에서 가로 약 8 m가 들어와 벽·바닥·무대가 함께 읽힌다.
export const FOV_DEG = 40;

// LED를 담을 때 두는 여유 — 세로 2.6배, 가로 2.2배 크기로 담는다.
//   LED가 주인공이되 방이 함께 읽히는 비율.
export const LED_FIT = Object.freeze({ w: 2.2, h: 2.6 });

/**
 * LED가 화면에 알맞게 들어오는 카메라 거리(unit).
 *   Reference A는 '방 안에서 LED를 바라보는' 실내 시점이다. 그래서 방 크기가 아니라
 *   **LED 크기**로 거리를 정하고, 방보다 뒤로 물러나지 않게 깊이로 제한한다.
 *   (방 크기로 거리를 잡으면 깊은 강당에서 카메라가 뒷벽 밖으로 나가 버린다.)
 *
 * @param led     LED 크기(unit) — { w, h }
 * @param roomD   방 깊이(unit)
 * @param aspect  화면 가로/세로비
 * @returns 카메라가 설 거리(unit). 항상 방 안에 남는다.
 */
export function viewDistance(led, roomD, aspect = 16 / 9) {
  const vFov = FOV_DEG * Math.PI / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(0.3, aspect));
  const need = Math.max(
    (led.h * LED_FIT.h / 2) / Math.tan(vFov / 2),
    (led.w * LED_FIT.w / 2) / Math.tan(hFov / 2),
  );
  // 카메라는 방 안에 남는다(뒷벽에서 0.4 m 앞까지). 아주 작은 방에서도 최소 2 m는 떨어진다.
  return Math.max(2, Math.min(need, Math.max(2, roomD - 0.4)));
}

/**
 * 화면(app.js)이 넘겨준 계산 결과를 Three.js가 쓸 수 있는 형태(unit)로 바꾼다.
 * 여기서 **읽기만** 한다 — 어떤 값도 새로 계산하지 않는다.
 *
 * @param space {W,H,D}                              공간 가로·세로·깊이(mm)
 * @param led   {w,h,marginW,mount,cols,rows,depth}  engine 결과의 LED 실제 크기(mm)
 * @param items room-presets의 배치 결과(STEP 1에서는 무대만 읽는다)
 * @returns { room, led, stage }  전부 unit
 */
export function buildGLModel({ space, led, items }) {
  const room = { W: u(space.W), H: u(space.H), D: u(space.D) };
  const stageItem = (items || []).find(it => it && it.type === 'stage');
  return {
    room,
    led: {
      x: u(led.marginW),          // 왼쪽 벽 ~ LED 왼쪽 끝
      y: u(led.mount),            // 바닥 ~ LED 아래(하단 높이)
      w: u(led.w), h: u(led.h),   // LED 실제 가로·세로
      depth: u(led.depth || 60),  // 벽에서 튀어나온 캐비닛 깊이
      cols: Math.max(1, Math.round(led.cols) || 1),   // STEP 1에서는 아직 그리지 않는다
      rows: Math.max(1, Math.round(led.rows) || 1),   //   (다음 단계 캐비닛 격자용)
    },
    stage: stageItem ? {
      x: u(stageItem.x), z: u(stageItem.z),
      w: u(stageItem.w), d: u(stageItem.d), h: u(stageItem.h || 280),
    } : null,
  };
}

// ── 카메라 프리셋 ───────────────────────────────────────────────────────────
// 하나의 Scene을 여러 각도에서 본다 — 방을 새로 만들지 않는다. 카메라만 옮긴다.
//
//   interior  실내 시점. 관람자가 공간 안에 서서 LED를 바라보는 느낌(Reference A).
//   corner-l  좌측 코너에서
//   front     정면에서 (3D 씬을 정면으로 본 것 — 정면 '계산' 뷰와는 별개다)
//   corner-r  우측 코너에서
//   iso       아이소메트릭. 방 전체 구조를 한눈에 보는 배치도(Reference B).
//   top       평면도. 위에서 내려다본 배치. 여기만 정사투영(원근 없음)을 쓴다.
export const CAMERA_PRESETS = Object.freeze([
  { id: 'interior', label: '실내',      ortho: false },
  { id: 'corner-l', label: '좌측 코너', ortho: false },
  { id: 'front',    label: '정면',      ortho: false },
  { id: 'corner-r', label: '우측 코너', ortho: false },
  { id: 'iso',      label: '아이소',    ortho: false },
  { id: 'top',      label: '평면도',    ortho: true  },
]);

export const DEFAULT_PRESET = 'interior';

export function cameraPreset(id) {
  return CAMERA_PRESETS.find(p => p.id === id) || CAMERA_PRESETS.find(p => p.id === DEFAULT_PRESET);
}

/** 프리셋 목록을 좌(-1)·우(+1)로 한 칸 돈다. */
export function stepPreset(id, step) {
  const i = Math.max(0, CAMERA_PRESETS.findIndex(p => p.id === cameraPreset(id).id));
  const n = CAMERA_PRESETS.length;
  return CAMERA_PRESETS[(i + step + n) % n].id;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const DEG = Math.PI / 180;

// 화각(세로)과 화면비로 가로 화각을 구한다. 세로로 긴 화면에서는 가로가 더 빡빡해진다.
function hFovOf(fovDeg, aspect) {
  return 2 * Math.atan(Math.tan(fovDeg * DEG / 2) * Math.max(0.3, aspect));
}

/** 가로 w × 세로 h 의 사각형이 화면에 들어오는 최소 거리. */
function fitDistance(w, h, fovDeg, aspect) {
  const vFov = fovDeg * DEG;
  return Math.max(
    (h / 2) / Math.tan(vFov / 2),
    (w / 2) / Math.tan(hFovOf(fovDeg, aspect) / 2),
  );
}

// 실내 계열(interior·corner·front) 공통 설정.
//   eye   : 카메라 눈높이(m)
//   look  : 바라보는 높이(m)
//   yaw   : 정면에서 좌우로 돈 각도(°). 음수 = 왼쪽
//   fov   : 화각(°)
//   pad   : LED를 화면의 몇 배 크기로 담을지 — 클수록 방이 많이 보이고 LED는 작아진다
const INSIDE = {
  // Reference A. 눈높이를 사람 키 가까이 내려 '천장에서 내려다보는' 느낌을 없앤다.
  //   바라보는 높이가 눈높이보다 높아 시선이 살짝 올라간다 — 실제로 스크린을 볼 때와 같다.
  interior: { eye: 1.75, look: 2.05, yaw: 12,  fov: 42, padW: 1.85, padH: 2.30 },
  // 둘러보기 3종. 조금 높은 시점에서 방과 LED의 관계를 본다.
  'corner-l': { eye: 2.20, look: 1.45, yaw: -28, fov: 40, padW: 2.30, padH: 2.90 },
  front:      { eye: 2.10, look: 1.40, yaw: 0,   fov: 40, padW: 2.25, padH: 2.85 },
  'corner-r': { eye: 2.20, look: 1.45, yaw: 28,  fov: 40, padW: 2.30, padH: 2.90 },
};

/**
 * 프리셋 id → 카메라 설정. **순수 계산** — Three.js도 DOM도 쓰지 않는다.
 *
 * @param id     프리셋 id
 * @param model  buildGLModel() 결과 { room, led, stage }
 * @param aspect 화면 가로/세로비
 * @returns {{
 *   id, ortho, position:[x,y,z], target:[x,y,z], up:[x,y,z],
 *   fov:number|null, orthoHeight:number|null
 * }}  길이 단위는 전부 unit(1 = 1 m)
 */
export function presetPose(id, model, aspect = 16 / 9) {
  const p = cameraPreset(id);
  const { room, led } = model;
  const a = Math.max(0.3, aspect);
  const cx = led.x + led.w / 2;               // LED 가로 중심

  // ── 평면도 — 위에서 수직으로 내려다본다(정사투영) ──
  if (p.id === 'top') {
    // 바로 위에서 보면 '위쪽'이 정해지지 않는다. -Z를 위로 두면 도면처럼
    //   '오른쪽 = +X, 화면 위 = LED 벽'이 된다(+Z를 쓰면 좌우가 뒤집힌다).
    const height = Math.max(room.D, room.W / a) * 1.08;
    return {
      id: p.id, ortho: true,
      position: [room.W / 2, Math.max(room.H * 3, 10), room.D / 2],
      target: [room.W / 2, 0, room.D / 2],
      up: [0, 0, -1],
      fov: null, orthoHeight: height,
    };
  }

  // ── 아이소메트릭 — 방 전체를 한눈에. 카메라는 방 밖에 선다 ──
  if (p.id === 'iso') {
    const fov = 30;                            // 좁은 화각 = 원근이 약해 아이소메트릭처럼 보인다
    const yaw = 34 * DEG, pitch = 30 * DEG;    // 30° — 지나친 top-down을 피한다
    // 방을 감싸는 구의 반지름으로 거리를 잡으면 어느 방 모양에서도 전체가 들어온다.
    const R = 0.5 * Math.hypot(room.W, room.H, room.D);
    const minFov = Math.min(fov * DEG, hFovOf(fov, a));
    const dist = (R / Math.sin(minFov / 2)) * 1.06;
    const target = [room.W / 2, room.H * 0.35, room.D * 0.45];
    return {
      id: p.id, ortho: false,
      position: [
        target[0] + dist * Math.cos(pitch) * Math.sin(yaw),
        target[1] + dist * Math.sin(pitch),
        target[2] + dist * Math.cos(pitch) * Math.cos(yaw),
      ],
      target, up: [0, 1, 0],
      fov, orthoHeight: null,
    };
  }

  // ── 실내 계열 — 카메라가 방 안에 선다 ──
  const s = INSIDE[p.id] || INSIDE.interior;
  const yaw = s.yaw * DEG;
  const target = [cx, Math.min(s.look, room.H * 0.8), led.depth];
  // 거리는 LED 크기로 정하고, 방보다 뒤로는 못 간다(뒷벽 밖으로 나가면 벽이 사라진다).
  const want = fitDistance(led.w * s.padW, led.h * s.padH, s.fov, a);
  const dist = clamp(want, 1.6, Math.max(1.6, room.D - 0.6));
  const position = [
    clamp(cx + dist * Math.sin(yaw), 0.3, Math.max(0.3, room.W - 0.3)),
    clamp(s.eye, 0.6, room.H - 0.2),
    clamp(led.depth + dist * Math.cos(yaw), 0.8, Math.max(0.8, room.D - 0.3)),
  ];
  return { id: p.id, ortho: false, position, target, up: [0, 1, 0], fov: s.fov, orthoHeight: null };
}
