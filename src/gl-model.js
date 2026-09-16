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
import { floorFinishFor, moodFor } from './materials.js?v=399';
import { DEFAULT_RENDER_MODE } from './render-mode.js?v=399';

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
export function buildGLModel({ space, led, items, show, person, roomType, sideMonitors, ledImage, renderMode }) {
  // 벽 두께는 '방 바깥쪽'으로 붙인다 — 안쪽 치수(W×H×D)는 계산값 그대로여야 한다.
  const room = {
    W: u(space.W), H: u(space.H), D: u(space.D),
    wallThk: u(clamp(Number(space.wallThk) || 0, 0, 600)),
  };
  const stageItem = (items || []).find(it => it && it.type === 'stage');
  return {
    room,
    // 사람(축척 비교) — 화면이 고른 인물·키·자리를 그대로 받는다(여기서 위치를 정하지 않는다).
    person: person || null,
    // 표시 토글(치수·바닥 격자·포인트 벽). 화면 상태를 그대로 받는다.
    show: {
      dims: show?.dims !== false,
      grid: show?.grid !== false,
      accentWall: show?.accentWall !== false,
      // 천장 — 꺼 두면 실내 시점에서도 감춘다(켜도 아이소·평면도에는 생기지 않는다).
      ceiling: show?.ceiling !== false,
      // 벽 4면을 각각 켜고 끈다. 기본은 LED 벽 + 왼쪽 벽 2면만 —
      //   카메라 쪽 벽이 없어야 방 안이 들여다보인다(컷어웨이).
      walls: {
        front: show?.walls?.front !== false,
        back: !!show?.walls?.back,
        left: show?.walls?.left !== false,
        right: !!show?.walls?.right,
      },
    },
    // 바닥 마감 — 공간 타입이 정한다(강의실만 비닐, 나머지는 카펫).
    //   재질 수치는 materials.js에 있고 여기서는 '어떤 마감인지'만 고른다.
    // 표현 방식(심플/실사) — 형상·치수는 그대로이고 빛과 재질만 달라진다.
    renderMode: renderMode || DEFAULT_RENDER_MODE,
    finish: { floor: floorFinishFor(roomType), mood: moodFor(roomType) },
    // LED 옆 보조 모니터 — 화면이 계산해 넘긴 값을 unit으로만 바꾼다(여기서 자리를 정하지 않는다).
    sideMonitors: (sideMonitors || []).map(mn => ({
      side: mn.side, inches: mn.inches,
      x: u(mn.x), y: u(mn.y), w: u(mn.w), h: u(mn.h),
      panelW: u(mn.panelW), panelH: u(mn.panelH), depth: u(mn.depth),
    })),
    // 배치 목록은 mm 그대로 들고 간다 — 가구를 세우는 쪽(furniture-gl.js)에서 환산한다.
    //   여기서 미리 바꾸면 room-presets 결과와 대조하기 어려워진다.
    items: items || [],
    led: {
      x: u(led.marginW),          // 왼쪽 벽 ~ LED 왼쪽 끝
      y: u(led.mount),            // 바닥 ~ LED 아래(하단 높이)
      w: u(led.w), h: u(led.h),   // LED 실제 가로·세로
      depth: u(led.depth || 60),  // 벽에서 튀어나온 캐비닛 깊이
      // 화면에 넣은 이미지(있으면). 픽셀 데이터라 단위 변환 대상이 아니다 — 그대로 들고 간다.
      image: ledImage || null,
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
// 포인트 벽 — **공간 좌표 기준 왼쪽 벽**에 고정한다(기존 Canvas 뷰 DEC-060과 같은 값).
//   '카메라에서 보이는 옆벽'에 칠하면 시점을 돌릴 때 벽이 좌↔우로 옮겨 다닌다.
//   실제로 칠해 둔 벽은 그럴 수 없다. 이 값은 카메라와 무관한 상수다.
export const ACCENT_WALL_SIDE = 'left';

// ── 방 껍데기(Room Shell) 치수 ───────────────────────────────────────────────
// 벽 두께는 화면에서 입력받는다(기본 100mm, config.js). 아래는 그에 딸린 부속 치수다.
//   전부 mm — 실제 건축 치수를 그대로 쓴다. 눈에 띄라고 과장하지 않는다.
export const BASEBOARD_MM = Object.freeze({
  h: 70,      // 걸레받이 높이 — 실제 시공값 60~80mm의 가운데
  thk: 18,    // 벽에서 방 안쪽으로 나온 두께
});
// ── 조명 ────────────────────────────────────────────────────────────────────
// 합이 너무 크면 벽이 하얗게 날아가고, 주광 비중이 크면 그림자가 게임처럼 진해진다.
//   주광 비중 = key / 전체 ≈ 25% — '있는 듯 없는 듯한' 접촉 그림자가 나오는 지점이다.
//   그림자를 만드는 조명은 주광 하나뿐이다(둘 이상이면 그림자가 겹쳐 지저분해지고 비용도 배가 된다).
export const LIGHTS = Object.freeze({
  hemi: 1.85,      // 부드러운 환경광(하늘/바닥)
  ceiling: 1.15,   // 천장등 — 바로 아래를 고르게 비춘다
  key: 1.15,       // 주광 — 그림자를 만드는 유일한 조명
  fill: 0.40,      // 보조광 — 그림자 속이 새까매지지 않게
  ledSpill: 0.55,  // LED가 벽에 번지는 푸른 빛(네온이 되면 안 된다)
});

/** 주광이 전체 빛에서 차지하는 비중 = 그림자의 진하기. */
export function keyShare(lights = LIGHTS) {
  const total = lights.hemi + lights.ceiling + lights.key + lights.fill;
  return total > 0 ? lights.key / total : 0;
}

/**
 * 그림자 지도 한 변(픽셀). 무작정 키우면 메모리만 먹는다.
 *   장면이 정적이라 매 프레임 다시 굽지 않으므로 2048이면 충분하고,
 *   화면 배율이 높은(=픽셀이 이미 많은) 기기에서는 1024로 낮춘다.
 */
export function shadowMapSize(dpr = 1) {
  return dpr > 1.5 ? 1024 : 2048;
}

export const CEILING_THK_MM = 120;   // 천장 슬래브 두께(보이는 건 아랫면뿐)
export const GRID_LIFT_MM = 3;       // 바닥 격자를 바닥에서 띄우는 높이(지글거림 방지)

// 방 '안'에서 바라보는 시점 — 천장이 보여야 하는 프리셋.
//   아이소·평면도는 방을 밖에서 내려다보므로 천장이 있으면 안이 안 보인다.
export const INTERIOR_PRESETS = Object.freeze(['interior', 'corner-l', 'front', 'corner-r']);

/** 카메라가 방 안(벽 사이·천장 아래)에 있는가. 저장해 둔 커스텀 시점을 판정할 때 쓴다. */
export function cameraInsideRoom(position, room, margin = 0.3) {
  if (!position || !room) return false;
  const [x, y, z] = position;
  return x > -margin && x < room.W + margin
      && z > -margin && z < room.D + margin
      && y > 0 && y < room.H + margin;
}

/**
 * 천장을 보여야 하는가.
 *   · 사용자가 '천장' 토글을 끄면 어느 시점에서도 감춘다(enabled = false).
 *   · 평면도(정사투영)는 무조건 감춘다 — 위에서 보는데 천장이 있으면 방이 안 보인다.
 *   · 기본 프리셋은 목록으로 정한다(실내 4종만 보임).
 *   · 저장해 둔 커스텀 시점은 카메라가 방 안에 있는지로 판단한다.
 * 켠다고 해서 아이소·평면도에 천장이 생기지는 않는다 — 방 안이 안 보이게 되기 때문이다.
 */
export function showCeiling({ presetId, ortho, position, room, enabled = true } = {}) {
  if (enabled === false) return false;   // 사용자가 끈 경우 — 시점과 무관하게 감춘다
  if (ortho) return false;
  if (presetId && presetId !== 'custom') return INTERIOR_PRESETS.includes(presetId);
  return cameraInsideRoom(position, room);
}

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

// 평면도를 얼마나 눕힐지(°). 90 = 완전히 수직(납작함), 작을수록 입체감이 커진다.
//   58°면 바닥 배치가 도면처럼 읽히면서 좌석 등받이·무대·단차 높이가 함께 보인다.
//   더 세우면(70° 이상) 좌석이 납작한 띠로 뭉쳐 안 읽힌다.
// 화각(FOV) 조절 범위. 좁을수록 망원(원근이 약해 도면처럼), 넓을수록 광각(공간이 넓어 보인다).
//   24° 아래는 왜곡 없이 납작해지고, 75°를 넘으면 가장자리가 휘어 제안서에 쓰기 어렵다.
export const FOV_RANGE = Object.freeze({ min: 24, max: 75, step: 1, default: FOV_DEG });

/**
 * 화각 값을 허용 범위로 자른다. 값이 없으면(null·undefined·빈 문자열) 기본값을 쓴다.
 *   `Number(null)`은 0이라 그냥 Number로 바꾸면 '값 없음'이 하한으로 잘려 버린다 — 먼저 걸러낸다.
 */
export function clampFov(deg, fallback = FOV_DEG) {
  if (deg === null || deg === undefined || deg === '') return fallback;
  const v = Number(deg);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(FOV_RANGE.max, Math.max(FOV_RANGE.min, v));
}

export const TOP_PITCH_DEG = 58;

/**
 * 정사투영 카메라가 방 전체를 담으려면 세로로 몇 m를 봐야 하는지.
 *   방의 여덟 모서리를 카메라의 화면 축(오른쪽·위)에 투영해 실제 차지하는 범위를 잰다
 *   — 기울어진 시점에서도 잘리지 않는다.
 */
export function orthoFitHeight(room, yawDeg, pitchDeg, aspect = 16 / 9, pad = 1.1, target = null) {
  const a = Math.max(0.3, aspect);
  const y = yawDeg * DEG, p = pitchDeg * DEG;
  // 카메라 → 바라보는 점 방향
  const fwd = [-Math.cos(p) * Math.sin(y), -Math.sin(p), -Math.cos(p) * Math.cos(y)];
  // 화면 오른쪽 = fwd × 위(0,1,0), 화면 위 = 오른쪽 × fwd
  const right = [-fwd[2], 0, fwd[0]];
  const rl = Math.hypot(right[0], right[2]) || 1;
  right[0] /= rl; right[2] /= rl;
  const up = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0],
  ];
  let maxR = 0, maxU = 0;
  // **카메라가 실제로 바라보는 점**을 기준으로 재야 한다 — 방 중심으로 재면
  //   바라보는 점이 다를 때 그 차이만큼 화면이 한쪽으로 치우쳐 잘린다.
  const [cx, cy, cz] = target || [room.W / 2, room.H / 2, room.D / 2];
  for (const x of [0, room.W]) for (const yy of [0, room.H]) for (const z of [0, room.D]) {
    const d = [x - cx, yy - cy, z - cz];
    maxR = Math.max(maxR, Math.abs(d[0] * right[0] + d[1] * right[1] + d[2] * right[2]));
    maxU = Math.max(maxU, Math.abs(d[0] * up[0] + d[1] * up[1] + d[2] * up[2]));
  }
  return Math.max(2 * maxU, (2 * maxR) / a) * pad;
}

// 화각(세로)과 화면비로 가로 화각을 구한다. 세로로 긴 화면에서는 가로가 더 빡빡해진다.
function hFovOf(fovDeg, aspect) {
  return 2 * Math.atan(Math.tan(fovDeg * DEG / 2) * Math.max(0.3, aspect));
}

// 좌석(관람석·의자)이 놓인 가장 뒤쪽 깊이(unit). 없으면 0.
//   배치 계산 결과를 읽기만 한다 — 좌석 위치를 여기서 정하지 않는다.
function seatingBackZ(model) {
  let back = 0;
  for (const it of model.items || []) {
    if (it.type !== 'seat' && it.type !== 'chair' && it.type !== 'desk' && it.type !== 'console') continue;
    const z = u(it.z);
    if (z > back) back = z;
  }
  return back;
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
  interior: { eye: 1.75, look: 1.85, yaw: 12,  fov: 42, padW: 1.85, padH: 2.30 },
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
export function presetPose(id, model, aspect = 16 / 9, opts = {}) {
  const p = cameraPreset(id);
  const { room, led } = model;
  const a = Math.max(0.3, aspect);
  const cx = led.x + led.w / 2;               // LED 가로 중심

  // ── 평면도 — 위에서 내려다본 배치도. 다만 **수직은 아니다** ──
  //   완전히 수직으로 보면 벽·좌석·무대가 납작한 색면이 되어 높이 관계가 안 읽힌다.
  //   조금 눕혀(TOP_PITCH_DEG) 입체가 보이게 하되, 원근이 없는 정사투영이라
  //   도면처럼 좌우 폭을 그대로 비교할 수 있다. 화면 위쪽은 여전히 LED 벽이다.
  if (p.id === 'top') {
    const pitch = TOP_PITCH_DEG * DEG;
    // 방 한가운데를 본다 — 그래야 담을 범위 계산과 화면 중심이 정확히 맞는다.
    const target = [room.W / 2, room.H / 2, room.D / 2];
    // 원근 평면도 — 같은 각도에서 보되 원근이 들어간다(멀리 있는 줄이 작아진다).
    //   정사투영은 도면처럼 폭을 그대로 비교할 수 있고, 원근은 공간감이 산다. 화면에서 고른다.
    if (opts.topPerspective) {
      const fov = clampFov(opts.fov);
      // 방을 감싸는 구로 거리를 잡는다. 위에서 내려다보는 그림은 높이 방향이 눌려 보여
      //   구 반지름이 실제보다 넉넉하다 — 그만큼 당겨(0.92) 화면을 덜 비운다.
      const R = 0.5 * Math.hypot(room.W, room.H, room.D);
      const minFov = Math.min(fov * DEG, hFovOf(fov, a));
      const dist = (R / Math.sin(minFov / 2)) * 0.92;
      return {
        id: p.id, ortho: false,
        position: [
          target[0],
          target[1] + dist * Math.sin(pitch),
          target[2] + dist * Math.cos(pitch),
        ],
        target, up: [0, 1, 0], fov, orthoHeight: null,
      };
    }
    const dist = Math.max(room.W, room.D, room.H) * 4;   // 정사투영이라 거리는 크기에 영향 없음
    return {
      id: p.id, ortho: true,
      position: [
        target[0],
        target[1] + dist * Math.sin(pitch),
        target[2] + dist * Math.cos(pitch),
      ],
      target, up: [0, 1, 0],
      fov: null, orthoHeight: orthoFitHeight(room, 0, TOP_PITCH_DEG, a, 1.1, target),
    };
  }

  // ── 아이소메트릭 — 방 전체를 한눈에. 카메라는 방 밖에 선다 ──
  if (p.id === 'iso') {
    // 기본 30°(좁은 화각 = 원근이 약해 아이소메트릭처럼). 사용자가 화각을 바꾸면 같은 비율로 따라간다.
    const fov = clampFov(30 * (clampFov(opts.fov) / FOV_DEG), 30);
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
  // 프리셋마다 정해진 화각에, 사용자가 고른 화각의 비율을 곱한다
  //   (실내 시점끼리의 성격 차이는 유지하면서 전체를 넓거나 좁게 볼 수 있다).
  const fov = clampFov(s.fov * (clampFov(opts.fov) / FOV_DEG), s.fov);
  let want = fitDistance(led.w * s.padW, led.h * s.padH, fov, a);
  // 실내 시점(Reference A)은 '관람자가 객석에서 보는' 그림이어야 한다.
  //   좌석 한가운데에 서면 앞줄 좌석이 화면 아래로 빠지고 무대도 잘린다.
  //   그래서 좌석이 놓인 범위보다 뒤로 물러난다(방 안에서 갈 수 있는 만큼만).
  if (p.id === 'interior') want = Math.max(want, seatingBackZ(model) + 1.1);
  const dist = clamp(want, 1.6, Math.max(1.6, room.D - 0.6));
  const position = [
    clamp(cx + dist * Math.sin(yaw), 0.3, Math.max(0.3, room.W - 0.3)),
    clamp(s.eye, 0.6, room.H - 0.2),
    clamp(led.depth + dist * Math.cos(yaw), 0.8, Math.max(0.8, room.D - 0.3)),
  ];
  return { id: p.id, ortho: false, position, target, up: [0, 1, 0], fov, orthoHeight: null };
}
