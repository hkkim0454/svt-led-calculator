// design-camera.js — "이 공간 디자인은 어디에 서서 방을 보여 주는가". (순수 — THREE도 DOM도 쓰지 않는다)
// ─────────────────────────────────────────────────────────────────────────────
// 무엇을 고치려는 것인가.
//   지금 실내 시점은 **LED를 기준으로 거리를 잡는다** — LED가 화면에 꽉 차도록 뒤로 물러난 뒤
//   눈높이 1.75m에서 1.85m를 바라본다. 즉 **시선이 위를 향한다.**
//   그 결과 테이블은 화면 아래로 밀려 한두 줄만 걸치고, 의자 배치는 거의 보이지 않는다.
//   "LED 사진"이지 "회의실 제안 렌더"가 아니다.
//
// 어떻게 바꾸는가 — 기준을 **LED에서 방으로** 옮긴다.
//   ① 사람이 실제로 서는 자리에 선다. 회의실 **뒤쪽 벽 바로 앞**, 눈높이 1.65m.
//      LED 크기로 거리를 정하면 큰 LED일수록 앞으로 다가와 방이 안 보인다.
//      뒤에서 보면 LED·테이블·의자·바닥이 **한 화면에** 들어온다.
//   ② 시선을 **내린다.** LED 중심보다 낮은 곳을 본다(§6) — 그래야 화면 아래쪽에 테이블이 들어온다.
//      다만 너무 내리면 LED 윗변이 잘리므로, **LED 윗변이 화면 안에 남는 선까지만** 내린다.
//      그 한계는 거리와 화각이 정하므로 여기서 **계산해서 자른다**(눈대중 상수가 아니다).
//   ③ 화각은 40~42°. 더 넓히면 광각 왜곡이 생겨 제안서에 못 쓴다(§7).
//
// **숫자를 방 크기로 만든다.** 10m 방에서만 맞는 고정 좌표를 쓰지 않는다(§4) —
//   전부 방 너비·깊이·높이와 LED 위치에서 비율로 뽑고, 마지막에 방 안으로 자른다.
//
// 디자인이 화각을 정하지 않았으면 **null**을 돌려준다. 그러면 기존 계산이 그대로 쓰인다.
// ─────────────────────────────────────────────────────────────────────────────

import { roomDesign, isPlanned } from './room-design.js?v=452';

/** 이 파일이 다루는 시점. 아이소·평면도는 **손대지 않는다**(오너 지침 §12). */
export const CORPORATE_CAMERA_PRESETS = Object.freeze(['interior', 'corner-l', 'corner-r', 'rear']);

/** 사람 눈높이의 허용 범위(m). 2m를 넘으면 미니어처를 내려다보는 그림이 된다. */
export const EYE_RANGE = Object.freeze({ min: 1.45, max: 1.90 });

/** 화각 허용 범위(°). 50° 이상은 광각 왜곡, 30° 이하는 답답한 망원이다. */
export const CORPORATE_FOV_RANGE = Object.freeze({ min: 36, max: 46 });

/** LED 윗변과 화면 위 가장자리 사이에 남기는 여유 = LED 높이 × 이 값. 0 이하면 윗변이 가장자리에 붙는다. */
export const LED_TOP_MARGIN_RATIO = 0.12;

/** 카메라·시선이 벽·바닥·천장에서 최소한 떨어져 있어야 하는 거리(m). */
export const WALL_MARGIN = 0.25;

/**
 * 시선이 눈높이보다 얼마나 낮아야 하는가 — **거리에 비례한다.**
 *   OrbitControls는 카메라가 시선보다 아래로 가지 못하게 막는다(maxPolarAngle = 90° − 0.02rad).
 *   즉 카메라는 시선보다 **최소 `거리 × tan(0.02)` 만큼 위**에 있어야 한다.
 *   고정값으로 두면 깊은 방(거리가 멀수록 필요한 높이차가 커진다)에서 조작기가 카메라를 끌어올린다
 *   — 실제로 12m 방에서 1.65m로 계획한 카메라가 1.81m로 떠올랐다.
 * 0.025는 tan(0.02)≈0.020 에 안전 여유를 더한 값이다.
 */
export const POLAR_GAP_PER_DIST = 0.025;
export const MIN_EYE_ABOVE_TARGET = 0.06;

/** 이 거리에서 시선이 눈높이보다 최소 얼마나 낮아야 하는가(m). */
export function eyeAboveTargetFor(dist) {
  return Math.max(MIN_EYE_ABOVE_TARGET, Math.max(0, dist) * POLAR_GAP_PER_DIST);
}

/**
 * 시점별 기준값. **전부 비율이거나 사람 치수**다 — 방 크기에 곱하거나 그대로 쓴다.
 *   eye        눈높이(m). 사람이 서서 보는 높이.
 *   fov        화각(°).
 *   rearRatio  뒷벽에서 안쪽으로 들어오는 거리 = 방 깊이 × 이 값(아래 min/max로 자른다).
 *   drop       시선 높이 = LED 중심 − 이 값(m). 내릴수록 테이블이 많이 보인다.
 *   xRatio     카메라 좌우 위치 = 방 너비 × 이 값.
 */
export const CAMERA_PLANS = Object.freeze({
  // 기본 실내 — 회의실 뒤 가운데에서 LED와 테이블을 함께 본다(제안서 표준 구도).
  interior: Object.freeze({ eye: 1.65, fov: 41, rearRatio: 0.06, drop: 0.35, xRatio: 0.50 }),
  // 좌·우 코너 — 같은 눈높이 계열에서 살짝만 올리고 옆으로 선다.
  //   테이블 깊이와 의자 줄이 비스듬히 보여야 '배치'가 읽힌다. 아이소처럼 올라가면 실패다.
  'corner-l': Object.freeze({ eye: 1.75, fov: 44, rearRatio: 0.07, drop: 0.30, xRatio: 0.18 }),
  'corner-r': Object.freeze({ eye: 1.75, fov: 44, rearRatio: 0.07, drop: 0.30, xRatio: 0.82 }),
  // 뒤에서 보는 시점 — 실내와 같은 자리지만 조금 더 낮고 좁다(회사 제안 렌더에 가장 가깝다).
  //   **아직 화면 버튼이 없다.** 계산만 준비해 둔다(오너 지침 §10).
  rear: Object.freeze({ eye: 1.58, fov: 39, rearRatio: 0.045, drop: 0.30, xRatio: 0.50 }),
});

/**
 * 임원 회의실 시점. **대기업과 같은 구조를 쓰되 값이 다르다**(오너 지침 §4·§6).
 *   Executive는 Corporate보다 **덜 광각이고 더 차분하다** — 화각 상한이 46°가 아니라 44°다.
 */
export const EXECUTIVE_CAMERA_PRESETS = Object.freeze(['interior', 'corner-l', 'corner-r', 'rear']);

/** 임원 화각 허용 범위(°). 상한 44 — 이 이상은 제안서에서 광각 왜곡으로 읽힌다(§13). */
export const EXECUTIVE_FOV_RANGE = Object.freeze({ min: 36, max: 44 });

/**
 * 임원 시점 기준값.
 *
 * **왜 시선(target)을 대기업과 다른 방식으로 정하는가** — 실측에서 나온 결론이다.
 *   대기업은 `LED 중심 − drop`으로 시선을 잡는다. 임원 방에 그대로 쓰면 화면 위쪽이
 *   **방 바깥(빈 하늘)으로 40% 넘게 비었다** — 방보다 화면이 세로로 더 크기 때문이다.
 *   뒷벽에서 8.5m 떨어진 정면 벽을 40° 화각으로 보면 세로로 6m가 담기는데 방 높이는 3.8m다.
 *   남는 2m를 **위로 흘리면 빈 하늘**, **아래로 흘리면 바닥과 테이블**이 된다.
 *   그래서 임원 시점은 **화면 위 가장자리가 천장선에 오도록** 시선을 계산한다(aim: 'frameTop').
 *   그 한 줄로 테이블 화면 점유가 0% → 14%, 위쪽 빈 공간이 80% → 3%가 됐다(실측).
 *
 *   aim 'frameTop' : 화면 위 가장자리를 천장선에 맞춘다(실내·후방). 남는 세로를 전부 아래로 보낸다.
 *   aim 'room'     : 방 좌표로 시선을 직접 찍는다(좌·우 코너). 비스듬히 보므로 벽까지 거리가 다르다.
 */
export const EXECUTIVE_CAMERA_PLANS = Object.freeze({
  // 실내 — 뒤 가운데 눈높이. LED가 주제이되 아래로 테이블·바닥이 함께 담긴다.
  interior: Object.freeze({
    aim: 'frameTop', eye: 1.60, fov: 40, rearRatio: 0.04, xRatio: 0.50,
  }),
  // 좌·우 코너 — 제안서에서 가장 많이 쓰는 컷. U자 깊이와 의자 줄이 비스듬히 읽힌다.
  //   시선은 방 반대편 안쪽(LED와 테이블 사이)을 찍는다. 아이소처럼 올라가면 실패다(§15).
  //   시선을 방 정중앙이 아니라 **카메라 쪽으로 조금 당겨** 찍는다(targetXRatio 0.40/0.60) —
  //   그래야 가까운 쪽 날개와 그 바깥 의자들이 화면에 남아 사람 크기가 전달된다(실측: 의자 0% → 3.7%).
  'corner-l': Object.freeze({
    aim: 'room', eye: 1.76, fov: 43, rearRatio: 0.07, xRatio: 0.10,
    targetXRatio: 0.40, targetZRatio: 0.22, targetHRatio: 0.26,
  }),
  'corner-r': Object.freeze({
    aim: 'room', eye: 1.76, fov: 43, rearRatio: 0.07, xRatio: 0.90,
    targetXRatio: 0.60, targetZRatio: 0.22, targetHRatio: 0.26,
  }),
  // 후방 — 실내와 같은 자리에서 조금 더 낮고 좁게. **아직 화면 버튼이 없다**(오너 지침 §14).
  rear: Object.freeze({
    aim: 'frameTop', eye: 1.60, fov: 38, rearRatio: 0.045, xRatio: 0.50,
  }),
});

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const DEG = Math.PI / 180;

/** 세로 화각 → 가로 화각(°). 화면이 옆으로 넓으면 가로로 더 많이 담긴다. */
function hFovDeg(fovDeg, aspect) {
  return 2 * Math.atan(Math.tan(fovDeg * DEG / 2) * Math.max(0.3, aspect)) / DEG;
}

/**
 * 이 디자인이 이 시점의 카메라를 정하는가. 정하지 않으면 null(= 기존 계산 그대로).
 * 아이소·평면도는 **언제나 null**이다 — 이번 단계에서 건드리지 않기로 한 시점이다.
 */
export function corporateCameraPlanId(designId, presetId) {
  const v = roomDesign(designId).camera;
  if (isPlanned(v) || typeof v !== 'string' || v !== 'corporateProposal') return null;
  return CORPORATE_CAMERA_PRESETS.includes(presetId) ? presetId : null;
}

/** 이 디자인이 **임원 계열** 카메라를 쓰는가. 아니면 null. */
export function executiveCameraPlanId(designId, presetId) {
  const v = roomDesign(designId).camera;
  if (isPlanned(v) || typeof v !== 'string' || v !== 'executiveProposal') return null;
  return EXECUTIVE_CAMERA_PRESETS.includes(presetId) ? presetId : null;
}

/**
 * 카메라 한 벌을 계산한다. **순수 계산** — 방·LED 치수만 보고 답한다.
 *
 * @param room   { W, H, D }  방 안쪽 치수(unit = m)
 * @param led    { x, y, w, h, depth }  LED 위치·크기(unit = m)
 * @param preset 'interior' | 'corner-l' | 'corner-r' | 'rear'
 * @param aspect 화면 가로/세로비
 * @returns {null|{position:[x,y,z], target:[x,y,z], fov:number, eye:number, ledTopMargin:number}}
 */
export function corporateCameraPlan(room, led, preset, aspect = 16 / 9) {
  return planCamera(room, led, CAMERA_PLANS[preset], CORPORATE_FOV_RANGE, aspect, null);
}

/**
 * 임원 회의실 카메라. 대기업과 **같은 계산기**를 쓰고 기준값과 화각 상한만 다르다.
 * @param table 테이블 바닥 발자국 {x0,x1,z0,z1}(m). 있으면 '테이블이 화면에 남는가'를 함께 답한다.
 */
export function executiveCameraPlan(room, led, preset, aspect = 16 / 9, table = null) {
  return planCamera(room, led, EXECUTIVE_CAMERA_PLANS[preset], EXECUTIVE_FOV_RANGE, aspect, table);
}

/** 두 계열이 공유하는 계산기. **여기가 유일한 카메라 공식**이다(두 곳에 쓰지 않는다). */
function planCamera(room, led, s, fovRange, aspect, table) {
  if (!s || !room || !led) return null;
  const a = Math.max(0.3, aspect);

  // ── 카메라 자리 ──
  // 눈높이 — 낮은 천장에서도 천장을 뚫지 않게 자른다.
  const eye = clamp(s.eye, EYE_RANGE.min, Math.min(EYE_RANGE.max, room.H - WALL_MARGIN - 0.2));
  // 뒷벽에서 안쪽으로. 얕은 방에서도 최소 350mm는 들어오고, 깊은 방에서도 700mm를 넘지 않는다
  //   — 더 들어오면 '뒤에서 보는 그림'이 아니라 방 한가운데에 선 그림이 된다.
  const inset = clamp(room.D * s.rearRatio, 0.35, 0.70);
  const z = clamp(room.D - inset, WALL_MARGIN, Math.max(WALL_MARGIN, room.D - WALL_MARGIN));
  const x = clamp(room.W * s.xRatio, WALL_MARGIN, Math.max(WALL_MARGIN, room.W - WALL_MARGIN));

  // ── 시선 ──
  const cx = led.x + led.w / 2;                 // LED 가로 중심
  const ledTop = led.y + led.h;
  const ledCenterY = led.y + led.h / 2;
  const dz = Math.max(0.5, z - led.depth);      // 카메라에서 LED 면까지의 거리

  // 시선은 **눈높이보다 위로 올라가지 않는다.**
  //   OrbitControls는 카메라가 시선보다 아래로 내려가는 것을 허용하지 않는다(maxPolarAngle).
  //   시선을 눈높이보다 높게 잡으면 **조작기가 카메라를 위로 끌어올려** 계획한 자리가 무너진다
  //   (실제로 큰 방에서 1.65m로 계획한 카메라가 2.23m로 올라갔다 — 이것이 '너무 높은 시점'의 원인이다).
  //   그래서 위를 보고 싶을 때는 **자리를 올리지 않고 화각을 넓혀** 해결한다.
  //
  // aim 'frameTop' — **화면 위 가장자리가 천장선에 오도록** 시선을 내린다(임원 실내·후방).
  //   위로 새던 세로 여유가 전부 아래(바닥·테이블)로 내려간다. 자세한 이유는 EXECUTIVE_CAMERA_PLANS 주석.
  // aim 'room'     — 방 좌표로 시선을 직접 찍는다(임원 코너). 비스듬히 보므로 벽까지 거리가 다르다.
  // 그 밖(대기업)  — 기존 그대로: LED 중심에서 drop 만큼 내린다.
  const halfV0 = clamp(s.fov, fovRange.min, fovRange.max) * DEG / 2;
  let targetY0;
  if (s.aim === 'frameTop') {
    const up = Math.atan(Math.max(0, room.H - eye) / dz);          // 천장선을 보는 각
    targetY0 = eye - dz * Math.tan(Math.max(0, halfV0 - up));
  } else if (s.aim === 'room') {
    targetY0 = room.H * s.targetHRatio;
  } else {
    targetY0 = ledCenterY - s.drop;
  }
  // 시선은 **언제나 눈높이보다 낮다**(위 OrbitControls 설명 참고).
  targetY0 = Math.min(targetY0, eye - eyeAboveTargetFor(dz));
  const targetY = clamp(targetY0, WALL_MARGIN, room.H - WALL_MARGIN);
  // 시선의 가로·깊이 — 코너는 방 안쪽을 찍고, 나머지는 LED 면을 본다.
  const tx = s.aim === 'room' ? room.W * s.targetXRatio : cx;
  const tz = s.aim === 'room' ? room.D * s.targetZRatio : led.depth;

  // 화각 — 기준값에서 출발해 **두 가지 필요분**만큼만 넓힌다. 둘 다 상한(46°)에서 멈춘다(§15).
  //   ① LED 윗변이 화면 위로 잘리지 않을 만큼(시선을 내렸으므로 위쪽을 더 담아야 한다)
  //   ② 아주 넓은 LED의 좌우가 잘리지 않을 만큼 — 카메라는 이미 뒷벽이라 물러날 자리가 없다
  let fov = clamp(s.fov, fovRange.min, fovRange.max);
  const margin = Math.min(0.35, led.h * LED_TOP_MARGIN_RATIO);   // LED 윗변과 화면 가장자리 사이 여유
  const needVTop = 2 * Math.atan(Math.max(0, ledTop + margin - targetY) / dz) / DEG;
  const needHalfW = led.w / 2 + Math.min(0.25, led.w * 0.04);
  const needHWide = 2 * Math.atan(needHalfW / dz) / DEG;
  const needVWide = 2 * Math.atan(Math.tan(needHWide * DEG / 2) / a) / DEG;
  fov = clamp(Math.max(fov, needVTop, needVWide), fovRange.min, fovRange.max);
  const halfV = dz * Math.tan(fov * DEG / 2);

  // ── 테이블이 화면 아래로 잘리지 않고 남는가(임원 단계의 핵심 지표, 오너 지침 §10) ──
  //   화면 **아래 가장자리**는 카메라에서 수평으로 `눈높이 ÷ tan(내려본 각 + 반화각)` 떨어진
  //   자리에서 바닥과 만난다. 그보다 가까운 것은 화면 밖(아래)이다.
  //   테이블 발자국의 **먼 쪽**이 그 거리보다 멀면 테이블은 화면에 남는다.
  const fit = tableFit(table, x, z, eye, Math.atan((eye - targetY) / dz), fov * DEG / 2);

  return Object.freeze({
    position: [x, eye, z],
    target: [tx, targetY, tz],
    fov: +fov.toFixed(3),
    eye,
    // 검증용 — LED 윗변이 화면 위 가장자리에서 얼마나 떨어져 있는가(m). 음수면 잘린 것이다.
    ledTopMargin: +(targetY + halfV - ledTop).toFixed(4),
    // 검증용 — LED 좌우가 화면 안에 들어오는가.
    ledSideMargin: +(dz * Math.tan(hFovDeg(fov, a) * DEG / 2) - led.w / 2).toFixed(4),
    // **화각 상한에 걸려 LED를 다 담지 못했는가.** 아주 넓은 LED + 아주 좁은 화면에서만 생긴다.
    //   여기서 화각을 더 넓히면 광각 왜곡이 생겨 제안서에 못 쓴다(오너 지침 §15) —
    //   그래서 조용히 늘리지 않고 **못 담았다고 말한다.** 화면 쪽이 알고 대응할 수 있게.
    ledFullyVisible: (dz * Math.tan(hFovDeg(fov, a) * DEG / 2) >= led.w / 2)
      && (targetY + dz * Math.tan(fov * DEG / 2) >= ledTop),
    fovCapped: fov >= fovRange.max - 1e-9,
    // 테이블 발자국을 모르면 **null**이다 — 모르는 것을 안다고 답하지 않는다.
    tableVisible: fit ? fit.visible : null,
    tableDepthVisible: fit ? fit.depthShare : null,
    floorNearDist: fit ? fit.floorNear : null,
  });
}

/**
 * 화면 아래 가장자리가 바닥과 만나는 거리와, 테이블이 그보다 멀리 남는가.
 * @returns {null|{visible:boolean, depthShare:number, floorNear:number}}
 */
function tableFit(table, x, z, eye, pitchDown, halfVRad) {
  if (!table) return null;
  const down = pitchDown + halfVRad;
  // 아래로 90°를 넘으면 카메라 바로 아래를 본다 — 그 경우 '무한히 가깝다'로 둔다.
  const floorNear = down >= Math.PI / 2 - 1e-6 ? 0 : Math.max(0, eye / Math.tan(Math.max(1e-6, down)));
  // 카메라에서 테이블 발자국까지의 가까운 쪽·먼 쪽 수평 거리.
  const dxTo = v => Math.max(0, Math.max(table.x0 - x, x - table.x1));
  const near = Math.hypot(dxTo(), Math.max(0, Math.max(table.z0 - z, z - table.z1)));
  const corners = [[table.x0, table.z0], [table.x1, table.z0], [table.x0, table.z1], [table.x1, table.z1]];
  const far = Math.max(...corners.map(([cx2, cz2]) => Math.hypot(cx2 - x, cz2 - z)));
  const span = Math.max(1e-6, far - near);
  return {
    visible: far > floorNear,
    depthShare: +clamp((far - Math.max(near, floorNear)) / span, 0, 1).toFixed(4),
    floorNear: +floorNear.toFixed(4),
  };
}

/**
 * 디자인·시점에 맞는 카메라. 디자인이 정하지 않았거나 다루지 않는 시점이면 **null**.
 * 렌더러는 null을 받으면 기존 계산(presetPose)을 그대로 쓴다.
 */
export function cameraPlanForDesign(designId, presetId, model, aspect = 16 / 9) {
  if (!model) return null;
  // 상황실 — 콘솔 배열과 **이미 세워진 칸막이**를 읽어 구도를 잡는다(PHASE 5-d.4).
  //   칸막이 자리를 여기서 정하지 않는다. control-walls.js 가 정한 것을 받아 쓸 뿐이다.
  const ct = controlCameraPlanId(designId, presetId);
  if (ct) {
    return controlCameraPlan(model.room, model.led, ct, aspect,
      { consoles: model.fields?.consoles || null, partitions: model.partitions || null });
  }
  // 강당 — 객석 줄·통로·단을 읽어 **객석 한가운데**에 선다(PHASE 9-d.2).
  //   좌석이 아직 없는 방이면 계획이 null 을 돌려주어 기존 계산이 그대로 돈다.
  const au = auditoriumCameraPlanId(designId, presetId);
  if (au) {
    const plan = auditoriumCameraPlan(model.room, model.led, designId, au, aspect, model.fields || null);
    if (plan) return plan;
  }
  // 아이디에이션 — 협업 구역과 하이 테이블 구역을 읽어 구도를 잡는다(PHASE 8-2b).
  //   실내·좌코너·우코너만 가로챈다. 정면·아이소·평면은 기술 시점이라 손대지 않는다.
  const idea = ideationCameraPlanId(designId, presetId);
  if (idea) return ideationCameraPlan(model.room, model.led, idea, aspect, model.fields || null);
  // 교육장 — 책상 배열을 읽어 구도를 잡는다(PHASE 7-b).
  const tr = trainingCameraPlanId(designId, presetId);
  if (tr) {
    return trainingCameraPlan(model.room, model.led, tr, aspect,
      { desks: model.fields?.desks || null, seats: model.fields?.seats || null,
        seatPoints: model.fields?.seatPoints || null });
  }
  // 대회의실 — 배치 범위(테이블·좌석·모니터·프롬프터)까지 보고 구도를 잡는다.
  const cf = conferenceCameraPlanId(designId, presetId);
  if (cf) {
    return conferenceCameraPlan(model.room, model.led, cf, aspect,
      { table: model.table || null, ...(model.fields || {}) });
  }
  const ex = executiveCameraPlanId(designId, presetId);
  if (ex) return executiveCameraPlan(model.room, model.led, ex, aspect, model.table || null);
  const id = corporateCameraPlanId(designId, presetId);
  return id ? corporateCameraPlan(model.room, model.led, id, aspect) : null;
}

/** 이 디자인이 쓰는 시점 이름들(검증·디버깅용). 정하지 않았으면 빈 목록. */
export function corporateCameraPresets(designId) {
  return Object.freeze(CORPORATE_CAMERA_PRESETS.filter(p => corporateCameraPlanId(designId, p)));
}

/** 이 디자인이 쓰는 임원 시점 이름들(검증·디버깅용). */
export function executiveCameraPresets(designId) {
  return Object.freeze(EXECUTIVE_CAMERA_PRESETS.filter(p => executiveCameraPlanId(designId, p)));
}

// ═════════════════════════════════════════════════════════════════════════════
// 대회의실 카메라 (PHASE 4-d.3)
// ─────────────────────────────────────────────────────────────────────────────
// 앞의 두 계열과 **무엇이 다른가.**
//   대기업·임원 방은 깊이가 7~12m다. 그래서 '뒷벽 바로 앞에 선다'는 한 줄로 충분했다.
//   대회의실은 12~16m 폭에 깊이가 18m까지 간다. 같은 규칙을 그대로 쓰면
//     ① 카메라가 내용물에서 4~5m 뒤에 서서 **빈 바닥만 긴 활주로**처럼 깔리고(§16),
//     ② LED 벽까지 17m라 화면 세로에 방 높이(3.8m)가 30%밖에 안 차서
//        **천장과 바닥이 화면을 먹는다**(§15).
//   그래서 이 계열은 기준을 **벽이 아니라 '놓인 것'으로** 옮긴다.
//
// 세 가지를 새로 한다.
//   ① **서는 자리를 내용물이 정한다.** 맨 뒤 테이블·의자 뒤로 얼마만큼 물러설지를
//      '바닥이 화면에 보이기 시작하는 거리 + 여유'에서 **계산**한다(고정 상수가 아니다).
//      그 값이 화각과 시선에 다시 의존하므로 **몇 번 되풀이해 수렴시킨다**(solve).
//   ② **천장 띠를 직접 정한다.** 화면 위쪽에 천장이 몇 % 남을지를 먼저 정하고(band),
//      거기서 내려다보는 각을 역산한다. 임원의 'frameTop'은 이 식에서 band = 0 인 경우다.
//   ③ **시선을 LED 면이 아니라 시선 위 가까운 점에 찍는다.** 방향(각도)은 그대로 두고
//      점만 앞으로 당긴다 — 깊은 방에서 LED 면 위의 시선점이 바닥 아래로 내려가는 것을 막는다.
//      결과적으로 시선은 '테이블 가운데와 LED 아래쪽 사이'에 놓인다(§26).
//
// 가로·세로(across/along)는 **따로 좌표를 쓰지 않는다**(§8). 테이블·좌석 범위에서
//   중심과 맨 뒤를 읽어 계산하므로, 테이블이 돌아가면 그 값이 바뀌어 구도가 따라간다.
// ─────────────────────────────────────────────────────────────────────────────

/** 이 계열이 다루는 시점. 아이소·평면도·정면은 **언제나 제외**다(§19~§21 동결). */
export const CONFERENCE_CAMERA_PRESETS = Object.freeze(['interior', 'corner-l', 'corner-r', 'rear']);

/** 대회의실 화각 허용 범위(°). 상한 46 — 오너 지침 §6의 hard cap이다. */
export const CONFERENCE_FOV_RANGE = Object.freeze({ min: 36, max: 46 });

/** 화면 위쪽에 남기는 천장 띠의 상한(§15 — 18%를 넘으면 재검토, 25%면 실패). */
export const CONFERENCE_BAND_MAX = 0.18;

/** 내용물 앞쪽으로 **바닥이 이만큼(m) 더 보이도록** 물러선다(§16 '바닥이 조금은 보일 것'). */
export const FLOOR_STRIP = 0.55;

/** 맨 뒤 내용물에서 물러서는 거리의 허용 범위(m). 너무 붙으면 코앞, 너무 멀면 빈 활주로. */
export const STANDOFF_RANGE = Object.freeze({ min: 1.10, max: 4.20 });

/** LED가 화면에 다 안 들어올 때, 코너 카메라를 가운데로 되돌려 보는 횟수(§11 우선순위 ②). */
export const LATERAL_RELAX_STEPS = 6;

/**
 * 코너 컷이 되돌릴 때도 **코너는 코너로 남는다.** 방 가운데에서 최소한 이만큼(방 너비 × 이 값)은
 * 옆에 선다. 끝까지 가운데로 옮기면 좌·우 코너가 실내 컷과 같은 그림이 되어 버린다(§17 — 코너는
 * 테이블 깊이·의자 밀도·모니터 줄을 비스듬히 보여 주는 역할이다).
 * **실내·후방 컷에는 이 하한이 없다**(`minOffset: 0`) — 그 둘은 가운데로 돌아가도 제 역할을 한다.
 */
export const MIN_CORNER_OFFSET = 0.18;

/** LED 가장자리와 화면 가장자리 사이에 남기는 각도 여유(°). 0이면 딱 붙는다. */
export const LED_EDGE_MARGIN_DEG = 1.2;

/**
 * 대회의실 시점 기준값. **전부 비율이거나 사람 치수**다.
 *   eye     눈높이(m) — §6 실내 1.58~1.72 / 코너 1.68~1.82
 *   fov     기준 화각(°) — 여기서 시작해 LED가 들어갈 만큼만 넓힌다(상한 46)
 *   band    화면 위쪽 천장 띠 목표 비율 — §15의 6~14% 안
 *   xRatio  카메라 좌우 자리 = 방 너비 × 이 값
 *   aimMix  시선을 LED 면(0)에서 **내용물 가운데**(1) 쪽으로 얼마나 당기는가
 *   followX 카메라 좌우를 내용물 중심 쪽으로 얼마나 따라가는가(세로 배치 대응)
 */
export const CONFERENCE_CAMERA_PLANS = Object.freeze({
  // 실내 — 뒤쪽 눈높이의 **3/4 구도**(§7이 허용한 '뒤 가운데 + 약간의 좌우 오프셋').
  //   왜 정중앙이 아닌가 — 실측에서 나온 결론이다. 대회의실 U 테이블은 방을 거의 가득 채워
  //   (14m 방에서 상판 11.1m, 팔이 축에서 5.1m 밖) **뒤 정중앙에서는 46° 상한으로 담기지 않는다.**
  //   실제로 정중앙(xRatio 0.50)에서는 중형 방의 상판이 화면에 **0.7%**만 남았고, 화면 절반이
  //   U자 안쪽 빈 바닥이었다(캡처로 확인). 옆으로 비켜서 대각으로 보면 가까운 쪽 팔과
  //   그 위의 모니터 줄이 화면에 들어온다 — 상판 실측 점유가 0.7% → 21%로 올라간다.
  interior: Object.freeze({ eye: 1.66, fov: 44, band: 0.09, xRatio: 0.26, aimMix: 0.62, followX: 0.45, minOffset: 0 }),
  // 좌·우 코너 — 조금 높고 조금 넓다. 테이블 깊이·의자 밀도·모니터 줄이 비스듬히 읽혀야 한다(§17).
  //   아이소처럼 올라가면 실패이므로 눈높이는 1.74m에서 멈춘다.
  'corner-l': Object.freeze({ eye: 1.74, fov: 44, band: 0.11, xRatio: 0.14, aimMix: 0.52, followX: 0.35, minOffset: MIN_CORNER_OFFSET }),
  'corner-r': Object.freeze({ eye: 1.74, fov: 44, band: 0.11, xRatio: 0.86, aimMix: 0.52, followX: 0.35, minOffset: MIN_CORNER_OFFSET }),
  // 후방 — 실내와 같은 자리에서 조금 더 낮고 좁게. **아직 화면 버튼이 없다**(§18).
  rear: Object.freeze({ eye: 1.62, fov: 41, band: 0.09, xRatio: 0.50, aimMix: 0.28, followX: 0.45, minOffset: 0 }),
});

/** 이 디자인이 **대회의실 계열** 카메라를 쓰는가. 아니면 null. */
export function conferenceCameraPlanId(designId, presetId) {
  const v = roomDesign(designId).camera;
  if (isPlanned(v) || typeof v !== 'string' || v !== 'conferenceProposal') return null;
  return CONFERENCE_CAMERA_PRESETS.includes(presetId) ? presetId : null;
}

/** 이 디자인이 쓰는 대회의실 시점 이름들(검증·디버깅용). */
export function conferenceCameraPresets(designId) {
  return Object.freeze(CONFERENCE_CAMERA_PRESETS.filter(p => conferenceCameraPlanId(designId, p)));
}

/** 여러 범위를 하나로 합친다. 전부 없으면 null(모르면 모른다고 한다). */
function mergeBounds(list) {
  const b = (list || []).filter(v => v && Number.isFinite(v.x0) && Number.isFinite(v.z0));
  if (!b.length) return null;
  return {
    x0: Math.min(...b.map(v => v.x0)), x1: Math.max(...b.map(v => v.x1)),
    z0: Math.min(...b.map(v => v.z0)), z1: Math.max(...b.map(v => v.z1)),
  };
}

/**
 * 한 점을 **화면 좌표(tan 공간)** 로 옮긴다.
 *   u = 좌우, v = 위아래. |u| ≤ tan(가로 반화각), |v| ≤ tan(세로 반화각)이면 화면 안이다.
 *   카메라는 yaw(좌우)·pitch(내려봄)만 쓴다 — 기울이지(roll) 않는다.
 */
function toView(p, cam, yaw, pitch) {
  const dx = p[0] - cam[0], dy = p[1] - cam[1], dz = p[2] - cam[2];
  // 시선 방향 기준으로 회전 — 앞(f)·오른쪽(r)·위(up)
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  const fx = dx * sy + dz * cy;          // 시선축 방향 성분(수평면)
  const rx = dx * cy - dz * sy;          // 오른쪽 성분
  const sp = Math.sin(pitch), cp = Math.cos(pitch);
  const fwd = fx * cp - dy * sp;         // 내려본 각을 반영한 전방 거리
  const up = fx * sp + dy * cp;          // 화면 위 방향 성분
  if (fwd <= 1e-6) return null;          // 카메라 뒤 — 화면에 없다
  return { u: rx / fwd, v: up / fwd, fwd };
}

/**
 * **얼마나 화면에 남는가를 '재서' 말한다.**
 *   감싸는 상자 하나를 화면에 던져 넓이를 재던 방식은 틀렸다 — U자 테이블은 상자 안쪽이
 *   전부 빈 곳이라, 상판이 한 조각도 안 보이는데도 '43% 보인다'고 답했다(실측에서 발각).
 *   그래서 **실제 조각 위에 점을 뿌려 그 점들이 화면 안에 들어오는 비율**을 센다.
 * @returns 0~1. 잴 것이 없으면 null(모르면 모른다고 한다).
 */
function sampleShare(points, cam, yaw, pitch, tanH, tanV) {
  if (!points || !points.length) return null;
  let inside = 0;
  for (const p of points) {
    const q = toView(p, cam, yaw, pitch);
    if (q && Math.abs(q.u) <= tanH && Math.abs(q.v) <= tanV) inside++;
  }
  return +(inside / points.length).toFixed(4);
}

/** 사각 조각들의 상판 위에 격자로 점을 뿌린다(조각 하나당 최대 n×n). */
function topSamples(parts, y, n = 7) {
  if (!parts || !parts.length) return null;
  const out = [];
  for (const b of parts) {
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      out.push([b.x0 + (b.x1 - b.x0) * (i + 0.5) / n, y, b.z0 + (b.z1 - b.z0) * (j + 0.5) / n]);
    }
  }
  return out;
}

/** {x,z} 목록을 특정 높이의 점 목록으로. */
const atHeight = (list, y) => (list && list.length ? list.map(p => [p.x, y, p.z]) : null);

/**
 * 대회의실 카메라 한 벌. **순수 계산** — 방·LED·배치 범위만 보고 답한다.
 *
 * @param room   { W, H, D }  방 안쪽 치수(m)
 * @param led    { x, y, w, h, depth }  LED 위치·크기(m)
 * @param preset 'interior' | 'corner-l' | 'corner-r' | 'rear'
 * @param aspect 화면 가로/세로비
 * @param fields { table, seats, monitors, prompter } 배치 범위(m). 없으면 null로 두면 된다.
 */
export function conferenceCameraPlan(room, led, preset, aspect = 16 / 9, fields = null) {
  const s = CONFERENCE_CAMERA_PLANS[preset];
  if (!s || !room || !led) return null;
  const a = Math.max(0.3, aspect);
  const f = fields || {};
  const table = f.table || null;

  // ── 내용물 범위 ──  테이블·의자·모니터를 전부 감싼 것이 '보여 줘야 할 것'이다.
  const content = mergeBounds([table, f.seats, f.monitors]) || {
    x0: room.W * 0.25, x1: room.W * 0.75, z0: room.D * 0.2, z1: room.D * 0.7,
  };
  const contentCx = (content.x0 + content.x1) / 2;
  const contentCz = (content.z0 + content.z1) / 2;
  // **테이블이 어느 축으로 긴가.** 좌표를 따로 쓰지 않고 이 한 값으로 구도가 따라간다(§8).
  const orient = table && (table.z1 - table.z0) > (table.x1 - table.x0) ? 'along' : 'across';

  // ── 눈높이 ──  낮은 천장에서도 천장을 뚫지 않게 자른다.
  const eye = clamp(s.eye, EYE_RANGE.min, Math.min(EYE_RANGE.max, room.H - WALL_MARGIN - 0.2));

  // ── 서는 깊이 ──  '맨 뒤 내용물 + 물러설 거리'. 물러설 거리는 아래에서 **계산해 수렴시킨다.**
  const rearMost = clamp(room.D - clamp(room.D * 0.05, 0.35, 0.70), WALL_MARGIN, room.D - WALL_MARGIN);
  const backZ = Math.max(content.z1, table ? table.z1 : 0);

  const ledPts = [[led.x, led.y, led.depth], [led.x + led.w, led.y, led.depth],
    [led.x, led.y + led.h, led.depth], [led.x + led.w, led.y + led.h, led.depth]];

  // 한 자리에 섰을 때의 화각·내려본 각·서는 깊이를 푼다.
  //   셋이 서로를 물고 있어서 **네 번 되풀이하면 충분히 수렴한다**(값이 밀리미터 아래로 떨어진다).
  function solveAt(x) {
  let fov = clamp(s.fov, CONFERENCE_FOV_RANGE.min, CONFERENCE_FOV_RANGE.max);
  let standOff = STANDOFF_RANGE.min;
  let z = rearMost, pitch = 0, yaw = 0, halfV = fov * DEG / 2, dzWall = Math.max(0.5, z - led.depth);

  for (let it = 0; it < 4; it++) {
    z = clamp(Math.min(rearMost, backZ + standOff), WALL_MARGIN, rearMost);
    dzWall = Math.max(0.5, z - led.depth);
    halfV = fov * DEG / 2;

    // 시선이 향할 지점 — LED 가로 중심에서 내용물 가운데 쪽으로 aimMix 만큼 당긴다.
    const aimX = (led.x + led.w / 2) + (contentCx - (led.x + led.w / 2)) * s.aimMix;
    const aimZ = led.depth + (contentCz - led.depth) * s.aimMix;
    yaw = Math.atan2(aimX - x, aimZ - z);        // -Z(LED 쪽)을 0으로 재는 각

    // **천장 띠에서 내려본 각을 역산한다.** band = 0 이면 임원의 'frameTop'과 같은 식이다.
    const eCeil = Math.atan(Math.max(0, room.H - eye) / dzWall);      // 천장선을 보는 각
    const band = clamp(s.band, 0, CONFERENCE_BAND_MAX);
    pitch = Math.atan((1 - 2 * band) * Math.tan(halfV)) - eCeil;
    // 시선은 **언제나 눈높이보다 낮다** — 조작기(OrbitControls)가 카메라를 끌어올리지 못하게(§5).
    pitch = Math.max(pitch, Math.atan(POLAR_GAP_PER_DIST));

    // LED 네 모서리가 화면에 들어갈 만큼만 화각을 넓힌다(상한 46°에서 멈춘다, §11).
    let needV = 0, needH = 0;
    for (const p of ledPts) {
      const q = toView(p, [x, eye, z], yaw, pitch);
      if (!q) continue;
      needV = Math.max(needV, Math.abs(q.v)); needH = Math.max(needH, Math.abs(q.u));
    }
    const m = Math.tan(LED_EDGE_MARGIN_DEG * DEG);
    const wantV = 2 * Math.atan(Math.max(needV + m, (needH + m) / a)) / DEG;
    fov = clamp(Math.max(s.fov, wantV), CONFERENCE_FOV_RANGE.min, CONFERENCE_FOV_RANGE.max);

    // 물러설 거리 — 바닥이 보이기 시작하는 거리보다 FLOOR_STRIP 만큼 더 뒤에 선다(§16).
    const down = pitch + fov * DEG / 2;
    const floorNear = down >= Math.PI / 2 - 1e-6 ? 0 : eye / Math.tan(Math.max(1e-6, down));
    standOff = clamp(floorNear + FLOOR_STRIP, STANDOFF_RANGE.min, STANDOFF_RANGE.max);
  }

  // 이 자리에서 LED 네 모서리가 화면 안에 들어오는가.
  const tanV = Math.tan(fov * DEG / 2);
  const tanH = Math.tan(hFovDeg(fov, a) * DEG / 2);
  const v = ledPts.map(q => toView(q, [x, eye, z], yaw, pitch)).filter(Boolean);
  const ledFullyVisible = v.length === 4
    && v.every(q => Math.abs(q.u) <= tanH + 1e-9 && Math.abs(q.v) <= tanV + 1e-9);
  return { x, z, fov, pitch, yaw, dzWall, tanV, tanH, ledFullyVisible };
  }

  // ── 카메라 좌우 ──  기본 자리에서 내용물 중심 쪽으로 조금 따라간다(세로 배치면 테이블이 한쪽에 몰린다).
  const x0 = clamp(room.W * s.xRatio + (contentCx - room.W / 2) * s.followX,
    WALL_MARGIN, Math.max(WALL_MARGIN, room.W - WALL_MARGIN));

  // **LED가 다 안 들어오면 화각부터 넓히지 않는다**(§11의 우선순위 ②가 ④보다 먼저다).
  //   좁은 화면 + 아주 넓은 LED에서 코너 컷이 먼저 걸린다. 그때는 옆으로 나간 만큼을
  //   가운데로 **조금씩 되돌려** 본다 — 코너의 성격은 최대한 남기고 LED를 담는 쪽이다.
  //   끝까지 안 들어오면 늘리지 않고 `ledFullyVisible: false`로 **정직하게 말한다**(§11).
  const mid = room.W / 2;
  let sol = solveAt(x0);
  const side = Math.sign(x0 - mid);
  // 되돌릴 수 있는 **한계 자리** — 가운데가 아니라 '최소한의 코너'까지다.
  const limit = mid + side * room.W * (s.minOffset ?? MIN_CORNER_OFFSET);
  if (!sol.ledFullyVisible && side !== 0 && Math.abs(limit - x0) > 1e-6
      && Math.abs(limit - mid) < Math.abs(x0 - mid)) {
    for (let k = 1; k <= LATERAL_RELAX_STEPS; k++) {
      const cand = solveAt(x0 + (limit - x0) * (k / LATERAL_RELAX_STEPS));
      sol = cand;
      if (cand.ledFullyVisible) break;              // 들어온 순간 멈춘다(더 옮기지 않는다)
    }
  }
  const { x, z, fov, pitch, yaw, dzWall } = sol;
  const lateralRelax = +Math.abs(x - x0).toFixed(4);

  // ── 시선점 ──  **방향은 그대로 두고 점만 앞으로 당긴다.**
  //   LED 면에 찍으면 깊은 방에서 바닥 아래로 내려간다 — 방향이 같으면 그림은 똑같으므로
  //   '테이블 가운데쯤'에 찍어 값이 방 안에 남게 한다(§26).
  const aimDist = Math.hypot(contentCx - x, contentCz - z);
  let tDist = clamp(aimDist, 1.2, Math.max(1.2, dzWall));
  // 시선이 바닥 아래로 내려가지 않는 선까지만 당긴다.
  const maxDist = Math.tan(pitch) > 1e-6 ? (eye - WALL_MARGIN) / Math.tan(pitch) : tDist;
  tDist = Math.max(1.2, Math.min(tDist, maxDist));
  const targetY = Math.min(eye - eyeAboveTargetFor(tDist), eye - tDist * Math.tan(pitch));
  const target = [
    clamp(x + Math.sin(yaw) * tDist, WALL_MARGIN, Math.max(WALL_MARGIN, room.W - WALL_MARGIN)),
    clamp(targetY, 0.05, room.H - WALL_MARGIN),
    clamp(z + Math.cos(yaw) * tDist, WALL_MARGIN, Math.max(WALL_MARGIN, room.D - WALL_MARGIN)),
  ];

  // ── 지표 ──  '보인다'고 말하려면 재고 말해야 한다(§10·§38).
  const cam = [x, eye, z];
  const { tanV, tanH, ledFullyVisible } = sol;

  // 천장선이 화면 위 가장자리에서 얼마나 내려와 있는가 = 천장 띠 비율.
  const eCeil = Math.atan(Math.max(0, room.H - eye) / dzWall);
  const ceilingBand = +clamp((1 - Math.tan(eCeil + pitch) / tanV) / 2, 0, 1).toFixed(4);
  const down = pitch + fov * DEG / 2;
  const floorNear = down >= Math.PI / 2 - 1e-6 ? 0 : eye / Math.tan(Math.max(1e-6, down));
  const fit = tableFit(table, x, z, eye, pitch, fov * DEG / 2);
  // 상판(0.74m) · 의자 등받이 윗부분(1.00m) · 개인 모니터 화면(1.00m)에 점을 뿌려 센다.
  const tableShare = sampleShare(topSamples(f.tableParts, 0.74), cam, yaw, pitch, tanH, tanV);
  const seatsShare = sampleShare(atHeight(f.seatPoints, 1.00), cam, yaw, pitch, tanH, tanV);
  const monShare = sampleShare(atHeight(f.monitorPoints, 1.00), cam, yaw, pitch, tanH, tanV);
  // LED 자체가 **몇 %나 화면에 남는가.** '못 담았다'고 말할 때 얼마나 못 담았는지까지 말한다 —
  //   1%가 스친 것과 절반이 잘린 것은 제안서에서 전혀 다른 이야기다(§11).
  const ledShare = (() => {
    const q = ledPts.map(t => toView(t, cam, yaw, pitch)).filter(Boolean);
    if (q.length < 4) return 0;
    const u0 = Math.min(...q.map(t => t.u)), u1 = Math.max(...q.map(t => t.u));
    const v0 = Math.min(...q.map(t => t.v)), v1 = Math.max(...q.map(t => t.v));
    const full = Math.max(1e-9, (u1 - u0) * (v1 - v0));
    const iw = Math.max(0, Math.min(u1, tanH) - Math.max(u0, -tanH));
    const ih = Math.max(0, Math.min(v1, tanV) - Math.max(v0, -tanV));
    return +(iw * ih / full).toFixed(4);
  })();
  let prompter = null;
  if (f.prompter) {
    const q = [toView([f.prompter.x, 0.56, f.prompter.z], cam, yaw, pitch),
      toView([f.prompter.x, 1.05, f.prompter.z], cam, yaw, pitch)].filter(Boolean);
    prompter = q.length > 0 && q.some(p => Math.abs(p.u) <= tanH && Math.abs(p.v) <= tanV);
  }
  // 가장 가까운 내용물이 화면 아래로 잘리기까지 남은 여유(m). 음수면 코앞이 잘린 것이다.
  const nearest = Math.max(0, Math.min(z - content.z1, z - (table ? table.z1 : z)));
  const nearestMargin = +(nearest - floorNear).toFixed(4);

  return Object.freeze({
    position: [+x.toFixed(4), +eye.toFixed(4), +z.toFixed(4)],
    target: target.map(v => +v.toFixed(4)),
    fov: +fov.toFixed(3),
    eye,
    orient,
    standOff: +(z - backZ).toFixed(4),
    lateralRelax,
    pitchDeg: +(pitch / DEG).toFixed(3),
    yawDeg: +(yaw / DEG).toFixed(3),
    ceilingBand,
    floorNear: +floorNear.toFixed(4),
    nearestMargin,
    ledFullyVisible,
    ledVisibleShare: ledShare,
    tableVisible: fit ? fit.visible : null,
    tableDepthVisible: fit ? fit.depthShare : null,
    // **실측** — 상판·좌석·모니터가 화면에 남는 비율(점을 뿌려 센 값).
    tableVisibleShare: tableShare,
    seatsVisibleShare: seatsShare,
    monitorsVisibleShare: monShare,
    prompterVisible: prompter,
    fovCapped: fov >= CONFERENCE_FOV_RANGE.max - 1e-9,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 상황실 카메라 (PHASE 5-d.4)
// ─────────────────────────────────────────────────────────────────────────────
// **무엇을 고치려는 것인가.** PHASE 5-d.2·5-d.3 에서 오른쪽 유리 파티션과 왼쪽 흡음 벽을
//   만들었는데, 실내·코너 시점에서 **한 픽셀도 화면에 들어오지 않았다.** 실측하면
//   16m 방에서 왼쪽 벽 중앙이 화면 가로 −92.5%, 오른쪽 끝이 213.6% 에 찍힌다 —
//   화면에 담기는 것은 방 폭의 3분의 1뿐이고 나머지는 프레임 밖이다.
//   자리도 마감도 조명도 문제가 아니라 **구도의 문제**이고, 그것이 이 단계의 몫이다.
//
// **양쪽 벽을 한 화면에 함께 넣는 것은 불가능하다.** 방 안에 선 사람이 좌우 벽을 동시에
//   보려면 화각이 100°를 넘어야 하고, 그러면 제안서에 쓸 수 없는 어안 사진이 된다.
//   그래서 **시점마다 한쪽씩 맡긴다** — 이것이 이 계열의 핵심 결정이다.
//     interior  LED 정면 구도를 지키되 살짝 비켜서서 유리가 프레임 끝에 걸리게
//     corner-l  왼쪽 뒤에 서서 **오른쪽 유리 파티션**을 대각으로
//     corner-r  오른쪽 뒤에 서서 **왼쪽 흡음 벽**을 대각으로
//     rear      뒤 가운데에서 좁게(기존 성격 유지 — 아직 화면 버튼이 없다)
//
// 앞의 세 계열과 **무엇이 다른가.** 대기업·임원·대회의실은 '테이블이 화면에 남는가'를 풀었다.
//   상황실은 거기에 **'벽면 마감이 읽히는가'**가 더해진다. 그래서 화각을 넓힐 때
//   LED 네 모서리뿐 아니라 **그 시점이 맡은 벽의 대표점**까지 담기도록 넓힌다.
//   담기지 않으면 억지로 넓히지 않고 `featureVisible: false` 로 **정직하게 말한다.**
//
// **새 카메라 프레임워크를 만들지 않는다.** 대회의실 계열이 쓰는 헬퍼(toView·hFovDeg·
//   sampleShare·clamp)를 그대로 쓰고, 그 함수 자체는 한 줄도 건드리지 않는다.
// ─────────────────────────────────────────────────────────────────────────────

/** 이 계열이 다루는 시점. 아이소·평면도·정면은 **언제나 제외**다(앞 단계들과 같다). */
export const CONTROL_CAMERA_PRESETS = Object.freeze(['interior', 'corner-l', 'corner-r', 'rear']);

/**
 * 상황실 화각 허용 범위(°).
 *   **상한 46 — 제안서 원근의 하드 게이트다.** 오너 검토(2026-09-18)에서 확정됐다.
 *   한때 50 까지 열어 두었는데, 대표 장면이 우연히 46 이하로 떨어지더라도 **탐색 자체가
 *   46 을 넘을 수 있다는 것**이 문제였다. 그래서 값이 아니라 **탐색의 상한**을 46 으로 내렸다.
 *   대회의실(46)과 같은 값이다 — 상황실이라고 더 넓게 볼 이유가 없다.
 *   46 으로 부족하면 화각을 넓히지 않고 **카메라를 뒤로 물리고 좌우·시선을 다시 잡는다**.
 */
export const CONTROL_FOV_RANGE = Object.freeze({ min: 38, max: 46 });

/** 화면 위쪽에 남길 천장 띠의 상한 비율. 대회의실과 같은 기준이다. */
export const CONTROL_BAND_MAX = 0.18;

/** 콘솔 맨 뒷줄에서 물러설 거리(m)의 범위. 뒷벽을 뚫지 않는 선에서 잡는다. */
export const CONTROL_STANDOFF = Object.freeze({ min: 0.90, max: 12.0 });

/**
 * **벽면을 맡은 시점은 뒷벽 앞까지 물러선다.**
 *   왜 — 벽면은 카메라 옆에 있고 LED 는 앞에 있다. 가까이 서면 둘 사이 각도가 벌어져
 *   화각 상한(50°)으로도 함께 담기지 않는다(실측: 16m 방 실내 시점에서 LED 가 82.6%만 남았다).
 *   뒤로 물러나면 두 방향의 각도 차가 줄어 **같은 화각에 둘 다 들어온다**(LED 100% · 유리 보임).
 *   벽면을 맡지 않은 후방 시점은 기존 방식 그대로 '바닥이 보이기 시작하는 거리 + 여유'다.
 */
export const FEATURE_VIEW_GOES_REAR = true;

/** 벽면 대표점을 담을 때 두는 여유(°). LED 모서리 여유와 같은 뜻이다. */
export const FEATURE_MARGIN_DEG = 1.0;

/** LED 가 잘릴 때 시선을 LED 쪽으로 되돌리는 단계 수. 대회의실의 '옆으로 되돌리기'와 같은 장치다. */
export const FEATURE_RELAX_STEPS = 6;

/** 카메라가 유리 파티션에서 떨어져 서는 최소 거리(m). 사람이 유리 앞에 서는 거리다. */
export const CAMERA_GLASS_CLEAR = 1.1;

/** 물러설 거리를 찾을 때 시험하는 단계 수. 조건을 만족하는 **가장 가까운** 자리를 고른다. */
export const STANDOFF_STEPS = 10;

/**
 * 상황실 시점 기준값. **전부 비율이거나 사람 치수**다.
 *   eye         눈높이(m)
 *   fov         기준 화각(°) — 여기서 시작해 LED와 담당 벽이 들어갈 만큼만 넓힌다(상한 50)
 *   band        화면 위쪽 천장 띠 목표 비율
 *   xRatio      카메라 좌우 자리 = 방 너비 × 이 값
 *   feature     이 시점이 맡은 벽면 — 'glass'(오른쪽 유리) · 'acoustic'(왼쪽 흡음) · null
 *   featureMix  시선을 LED 중심(0)에서 담당 벽 쪽(1)으로 얼마나 돌리는가.
 *               **LED 가 주인공이라는 규칙이 이 값의 상한을 정한다** — 크게 돌리면
 *               LED 가 화면 가장자리로 밀려난다. 실측으로 고른 값이다.
 */
export const CONTROL_CAMERA_PLANS = Object.freeze({
  // 실내 — LED 정면 구도. 가운데에서 살짝 왼쪽으로 비켜서 **오른쪽 유리가 프레임에 걸리게** 한다.
  //   정중앙(0.50)에서는 유리가 화면 오른쪽 밖 213% 에 있어 어떤 화각으로도 담기지 않는다(실측).
  interior: Object.freeze({ eye: 1.66, fov: 43, band: 0.10, xRatio: 0.34, feature: 'glass', featureMix: 0.30 }),
  // 좌측 코너 — 왼쪽 뒤에 서서 **오른쪽 유리 파티션**을 대각으로 본다.
  //   왼쪽 벽은 카메라 뒤에 있어 어차피 보이지 않는다 — 그 벽은 corner-r 이 맡는다.
  'corner-l': Object.freeze({ eye: 1.72, fov: 44, band: 0.12, xRatio: 0.15, feature: 'glass', featureMix: 0.42 }),
  // 우측 코너 — 오른쪽 뒤에 서서 **왼쪽 흡음 벽**을 대각으로 본다. 이 방에서 흡음 벽이
  //   화면에 들어오는 **유일한 시점**이다.
  'corner-r': Object.freeze({ eye: 1.72, fov: 44, band: 0.12, xRatio: 0.85, feature: 'acoustic', featureMix: 0.42 }),
  // 후방 — 뒤 가운데에서 조금 낮고 좁게. 벽면을 맡지 않는다(LED 와 콘솔 배열만 본다).
  rear: Object.freeze({ eye: 1.62, fov: 41, band: 0.09, xRatio: 0.50, feature: null, featureMix: 0 }),
});

/** 이 디자인이 **상황실 계열** 카메라를 쓰는가. 아니면 null. */
export function controlCameraPlanId(designId, presetId) {
  const v = roomDesign(designId).camera;
  if (isPlanned(v) || typeof v !== 'string' || v !== 'controlProposal') return null;
  return CONTROL_CAMERA_PRESETS.includes(presetId) ? presetId : null;
}

/** 이 디자인이 쓰는 상황실 시점 이름들(검증·디버깅용). */
export function controlCameraPresets(designId) {
  return Object.freeze(CONTROL_CAMERA_PRESETS.filter(p => controlCameraPlanId(designId, p)));
}

/**
 * 그 시점이 맡은 벽면의 **대표점**(m). 화각을 넓힐 때 이 점들이 화면에 들어가야 한다.
 *   유리  — 계획이 실제로 세운 파티션에서 읽는다. 세우지 못한 방(좁은 방)이면 null 이다.
 *           **여기서 자리를 정하지 않는다** — control-walls.js 가 정한 값을 받아 쓴다.
 *   흡음  — 왼쪽 벽(x = 0)의 방 안쪽 면. 카메라 앞쪽 절반을 대표점으로 삼는다.
 */
export function controlFeaturePoints(feature, room, partitions) {
  if (!feature || !room) return null;
  if (feature === 'glass') {
    const g = (partitions || []).find(p => p && p.role === 'partition');
    if (!g) return null;
    const z0 = g.z - g.d / 2, z1 = g.z + g.d / 2, len = z1 - z0;
    const y = clamp(room.H * 0.45, 0.4, room.H - 0.3);
    // **LED 쪽 구간을 고른다.** 카메라는 뒷벽 앞에 서므로, 옆에 있는 파티션은 카메라에
    //   가까운 뒤쪽일수록 화면 밖으로 벌어지고 **LED 쪽(먼 쪽)이 화면 안에 들어온다**(실측).
    //   목적은 '유리 전체를 담는 것'이 아니라 '유리가 읽히는 것'이다.
    return [[g.x, y, z0 + len * 0.10], [g.x, y, z0 + len * 0.28], [g.x, y, z0 + len * 0.46]];
  }
  if (feature === 'acoustic') {
    const y = clamp(room.H * 0.45, 0.4, room.H - 0.3);
    // 같은 이유로 LED 쪽 절반을 고른다 — 벽 전체가 아니라 벽면 마감이 읽히면 된다.
    return [[0.02, y, room.D * 0.12], [0.02, y, room.D * 0.30], [0.02, y, room.D * 0.48]];
  }
  return null;
}

/**
 * 상황실 시점 계산.
 *
 * @param fields `{ consoles, partitions }` — 배치가 이미 만든 것을 **읽기만 한다.**
 * @returns 카메라 자리·시선·화각과 **실측 지표**(LED·담당 벽이 얼마나 화면에 남는가).
 */
export function controlCameraPlan(room, led, preset, aspect = 16 / 9, fields = null) {
  const s = CONTROL_CAMERA_PLANS[preset];
  if (!s || !room || !led) return null;
  const a = Math.max(0.3, aspect);
  const f = fields || {};

  // ── 내용물 범위 ──  콘솔 배열이 '보여 줘야 할 것'이다. 없으면 방 비율로 어림잡는다.
  // 콘솔 **과 뒤쪽 회의 테이블**이 '보여 줘야 할 것'이다. 뒤 테이블을 빼면 카메라가
  //   그 너머까지 물러나 앞쪽 빈 바닥이 화면을 먹는다(실측: 바닥이 화면의 47.9%였다).
  const content = mergeBounds([f.consoles, f.table]) || {
    x0: room.W * 0.2, x1: room.W * 0.8, z0: room.D * 0.15, z1: room.D * 0.6,
  };
  const contentCx = (content.x0 + content.x1) / 2;
  const contentCz = (content.z0 + content.z1) / 2;

  const eye = clamp(s.eye, EYE_RANGE.min, Math.min(EYE_RANGE.max, room.H - WALL_MARGIN - 0.2));
  const rearMost = clamp(room.D - clamp(room.D * 0.05, 0.35, 0.70), WALL_MARGIN, room.D - WALL_MARGIN);
  const backZ = Math.max(content.z1, 0);

  const ledPts = [[led.x, led.y, led.depth], [led.x + led.w, led.y, led.depth],
    [led.x, led.y + led.h, led.depth], [led.x + led.w, led.y + led.h, led.depth]];
  const featPts = controlFeaturePoints(s.feature, room, f.partitions);

  // ── 카메라 좌우 ── 기본 자리에서 시작하되, **유리 파티션 안에 서지 않는다.**
  //   파티션은 운용 구역 오른쪽 끝에 있어서 xRatio 0.85 가 그 자리와 겹친다(실측: 16m 방에서
  //   카메라 x 13.6 = 파티션 x 13.606). 그대로 두면 화면이 온통 유리 한 장이 된다.
  //   그래서 파티션이 있으면 **운용 구역 쪽으로** 한 걸음 물러난 자리까지만 간다.
  const glass = (f.partitions || []).find(p => p && p.role === 'partition');
  const xLimit = glass ? glass.x - CAMERA_GLASS_CLEAR : Infinity;
  const x0 = Math.min(xLimit,
    clamp(room.W * s.xRatio, WALL_MARGIN, Math.max(WALL_MARGIN, room.W - WALL_MARGIN)));

  // 화각·내려본 각·서는 깊이가 서로를 물고 있어 네 번 되풀이하면 수렴한다(대회의실과 같은 방식).
  function solveWith(mix, want = null, x = x0) {
  let fov = clamp(s.fov, CONTROL_FOV_RANGE.min, CONTROL_FOV_RANGE.max);
  let standOff = CONTROL_STANDOFF.min;
  let z = rearMost, pitch = 0, yaw = 0, dzWall = Math.max(0.5, z - led.depth);

  for (let it = 0; it < 4; it++) {
    z = clamp(Math.min(rearMost, backZ + standOff), WALL_MARGIN, rearMost);
    dzWall = Math.max(0.5, z - led.depth);
    const halfV = fov * DEG / 2;

    // 시선 — LED 가로 중심에서 **담당 벽 쪽으로** featureMix 만큼 돌린다.
    //   담당 벽이 없거나(후방) 유리를 세우지 못한 방이면 LED 중심을 그대로 본다.
    const ledCx = led.x + led.w / 2;
    let aimX = ledCx;
    let aimZ = led.depth + (contentCz - led.depth) * 0.35;
    if (featPts && featPts.length) {
      const fx = featPts.reduce((t, p) => t + p[0], 0) / featPts.length;
      const fz = featPts.reduce((t, p) => t + p[2], 0) / featPts.length;
      aimX = ledCx + (fx - ledCx) * mix;
      aimZ = aimZ + (fz - aimZ) * mix;
    }
    yaw = Math.atan2(aimX - x, aimZ - z);

    // 천장 띠에서 내려본 각을 역산한다.
    const eCeil = Math.atan(Math.max(0, room.H - eye) / dzWall);
    const band = clamp(s.band, 0, CONTROL_BAND_MAX);
    pitch = Math.atan((1 - 2 * band) * Math.tan(halfV)) - eCeil;
    pitch = Math.max(pitch, Math.atan(POLAR_GAP_PER_DIST));

    // LED 네 모서리 **와 담당 벽 대표점**이 들어갈 만큼만 넓힌다(상한 50°에서 멈춘다).
    let needV = 0, needH = 0;
    for (const p of ledPts) {
      const q = toView(p, [x, eye, z], yaw, pitch);
      if (!q) continue;
      needV = Math.max(needV, Math.abs(q.v)); needH = Math.max(needH, Math.abs(q.u));
    }
    const m = Math.tan(LED_EDGE_MARGIN_DEG * DEG);
    let wantV = 2 * Math.atan(Math.max(needV + m, (needH + m) / a)) / DEG;
    if (featPts) {
      // 벽 대표점은 **가로로 멀리** 있다 — 세로가 아니라 가로에서 화각을 정한다.
      let fH = 0, fV = 0;
      for (const p of featPts) {
        const q = toView(p, [x, eye, z], yaw, pitch);
        if (!q) continue;
        fH = Math.max(fH, Math.abs(q.u)); fV = Math.max(fV, Math.abs(q.v));
      }
      if (fH > 0) {
        const fm = Math.tan(FEATURE_MARGIN_DEG * DEG);
        wantV = Math.max(wantV, 2 * Math.atan(Math.max(fV + fm, (fH + fm) / a)) / DEG);
      }
    }
    fov = clamp(Math.max(s.fov, wantV), CONTROL_FOV_RANGE.min, CONTROL_FOV_RANGE.max);

    const down = pitch + fov * DEG / 2;
    const floorNear = down >= Math.PI / 2 - 1e-6 ? 0 : eye / Math.tan(Math.max(1e-6, down));
    standOff = clamp(want === null ? floorNear + 0.45 : want,
      CONTROL_STANDOFF.min, CONTROL_STANDOFF.max);
  }
  const tanV0 = Math.tan(fov * DEG / 2);
  const tanH0 = Math.tan(hFovDeg(fov, a) * DEG / 2);
  const inside = q => q && Math.abs(q.u) <= tanH0 + 1e-9 && Math.abs(q.v) <= tanV0 + 1e-9;
  const lv = ledPts.map(q => toView(q, [x, eye, z], yaw, pitch));
  const ok = lv.every(inside);
  const fv = featPts ? featPts.map(q => toView(q, [x, eye, z], yaw, pitch)) : [];
  const featOk = !featPts || fv.every(inside);
  // 카메라 앞에 깔리는 **빈 바닥의 길이(m)** — 가장 가까운 내용물이 '바닥이 보이기 시작하는
  //   거리'보다 얼마나 더 뒤에 있는가. 0 이면 내용물이 화면 아래까지 꽉 찬다.
  const down0 = pitch + fov * DEG / 2;
  const fn = down0 >= Math.PI / 2 - 1e-6 ? 0 : eye / Math.tan(Math.max(1e-6, down0));
  const emptyFloor = Math.max(0, (z - content.z1) - fn);
  return { fov, z, pitch, yaw, dzWall, mix, want, x, emptyFloor,
    ledFullyVisible: ok, featureAllVisible: featOk,
    ledShare: lv.filter(inside).length / Math.max(1, lv.length),
    featShare: featPts ? fv.filter(inside).length / Math.max(1, fv.length) : 0 };
  }

  // **LED 가 먼저다.** 벽 쪽으로 돌린 시선 때문에 LED 가 잘리면, 시선을 LED 쪽으로
  //   조금씩 되돌린다 — 벽면은 덜 보여도 되지만 LED 가 잘린 제안서 그림은 쓸 수 없다.
  //   끝까지 담기지 않으면 억지로 넓히지 않고 `ledFullyVisible: false` 로 정직하게 말한다.
  // ── 물러설 거리 ── **필요한 만큼만 물러난다.**
  //   뒤로 갈수록 LED 와 벽면의 각도 차가 줄어 둘 다 담기지만, 그만큼 앞쪽 빈 바닥이
  //   화면을 먹는다(실측: 뒷벽까지 밀었더니 바닥이 화면의 47.9%였다). 그래서 가까운
  //   자리부터 시험해 **조건을 만족하는 첫 자리**에서 멈춘다.
  const maxWant = Math.max(CONTROL_STANDOFF.min, rearMost - backZ);
  const wants = featPts
    ? Array.from({ length: STANDOFF_STEPS }, (_, i) => CONTROL_STANDOFF.min
      + (maxWant - CONTROL_STANDOFF.min) * ((i + 1) / STANDOFF_STEPS))
    : [null];
  //   고르는 순서가 곧 우선순위다. ① LED 도 벽도 다 담기는 **가장 가까운** 자리,
  //   ② 없으면 LED 만이라도 다 담기는 가장 가까운 자리, ③ 그것도 없으면 LED 를 가장 많이 담는 자리.
  // **카메라 좌우도 되돌린다.** 코너에서 카메라가 LED 폭 바깥에 서면 LED 반대쪽 끝이
  //   화각을 간신히 넘어간다(실측: 12m 방에서 33.8° 대 허용 33.2°). 그때는 옆으로 나간 만큼을
  //   가운데로 조금씩 되돌린다 — 코너의 성격은 최대한 남기고 LED 를 담는 쪽이다(대회의실과 같은 장치).
  const mid = room.W / 2;
  const xs = [x0];
  for (let k = 1; k <= LATERAL_RELAX_STEPS; k++) {
    const cand = x0 + (mid + Math.sign(x0 - mid) * room.W * MIN_CORNER_OFFSET - x0) * (k / LATERAL_RELAX_STEPS);
    xs.push(Math.min(xLimit, clamp(cand, WALL_MARGIN, Math.max(WALL_MARGIN, room.W - WALL_MARGIN))));
  }
  // **시선·좌우·물러섬 셋을 함께 본다.** 하나씩 차례로 되돌리면 조합을 놓친다 —
  //   실측에서 '카메라를 가운데로 되돌렸더니 시선이 그만큼 더 돌아가 LED 가 그대로 잘리는'
  //   경우가 나왔다. 셋을 같이 훑고 **우선순위로** 고르는 편이 짧고 정확하다.
  const mixes = Array.from({ length: FEATURE_RELAX_STEPS + 1 },
    (_, k) => s.featureMix * (1 - k / FEATURE_RELAX_STEPS));
  const tried = [];
  for (const xc of xs) for (const w of wants) for (const mx of mixes) tried.push(solveWith(mx, w, xc));
  // 고르는 기준(앞쪽이 셀수록 강하다).
  //   ① **LED 가 온전히 담기는가** — 잘린 LED 는 제안서 그림이 아니다.
  //   ② 담당 벽이 얼마나 보이는가 — 이 단계가 풀려는 문제다.
  //   ③ 시선을 덜 되돌렸는가 — 벽 쪽을 향한 본래 구도에 가까울수록 좋다.
  //   ④ 코너다운가(기본 자리에서 덜 옮겼는가) · ⑤ 필요 이상 물러나지 않았는가.
  //   ③ **빈 바닥이 화면을 먹지 않는가** — 뒤로 물러날수록 카메라 앞에 빈 바닥이 깔린다.
  //   벽은 '전부 담기는가'가 아니라 **'읽히는가'**가 기준이다. 전부 담으려 들면 카메라가
  //   뒷벽까지 밀려 바닥이 화면의 절반을 먹는다(실측 47.9%). 그래서 ② 는 보이는지 여부만 보고,
  //   얼마나 많이 보이는지는 ④ 로 내린다.
  const rank = c => [c.ledFullyVisible ? 0 : 1, c.featShare > 0 ? 0 : 1,
    Math.round(c.emptyFloor * 4) / 4, -c.featShare, -c.mix, Math.abs(c.x - x0)];
  const sol = tried.reduce((best, c) => {
    const A = rank(c), B = rank(best);
    for (let i = 0; i < A.length; i++) { if (A[i] < B[i] - 1e-9) return c; if (A[i] > B[i] + 1e-9) return best; }
    return best;
  }, tried[0]);
  const { fov, z, pitch, yaw, dzWall, x } = sol;
  const featureMixUsed = +sol.mix.toFixed(4);
  const lateralRelax = +Math.abs(x - x0).toFixed(4);

  const cam = [x, eye, z];
  const tanV = Math.tan(fov * DEG / 2);
  const tanH = Math.tan(hFovDeg(fov, a) * DEG / 2);

  // ── 시선점 ── 방향은 그대로 두고 점만 앞으로 당긴다(깊은 방에서 바닥 아래로 내려가지 않게).
  const aimDist = Math.hypot(contentCx - x, contentCz - z);
  let tDist = clamp(aimDist, 1.2, Math.max(1.2, dzWall));
  const maxDist = Math.tan(pitch) > 1e-6 ? (eye - WALL_MARGIN) / Math.tan(pitch) : tDist;
  tDist = Math.max(1.2, Math.min(tDist, maxDist));
  const targetY = Math.min(eye - eyeAboveTargetFor(tDist), eye - tDist * Math.tan(pitch));
  const target = [
    clamp(x + Math.sin(yaw) * tDist, WALL_MARGIN, Math.max(WALL_MARGIN, room.W - WALL_MARGIN)),
    clamp(targetY, 0.05, room.H - WALL_MARGIN),
    clamp(z + Math.cos(yaw) * tDist, WALL_MARGIN, Math.max(WALL_MARGIN, room.D - WALL_MARGIN)),
  ];

  // ── 지표 ── '보인다'고 말하려면 재고 말해야 한다.
  const inFrame = q => q && Math.abs(q.u) <= tanH + 1e-9 && Math.abs(q.v) <= tanV + 1e-9;
  const v4 = ledPts.map(q => toView(q, cam, yaw, pitch));
  const ledFullyVisible = v4.every(inFrame);
  const ledShare = (() => {
    const q = v4.filter(Boolean);
    if (q.length < 4) return 0;
    const u0 = Math.min(...q.map(t => t.u)), u1 = Math.max(...q.map(t => t.u));
    const v0 = Math.min(...q.map(t => t.v)), v1 = Math.max(...q.map(t => t.v));
    const full = Math.max(1e-9, (u1 - u0) * (v1 - v0));
    const iw = Math.max(0, Math.min(u1, tanH) - Math.max(u0, -tanH));
    const ih = Math.max(0, Math.min(v1, tanV) - Math.max(v0, -tanV));
    return +(iw * ih / full).toFixed(4);
  })();
  // **담당 벽이 실제로 화면에 남는가.** 대표점 중 몇 개가 프레임 안인지 센다.
  const featureShare = featPts ? sampleShare(featPts, cam, yaw, pitch, tanH, tanV) : null;
  const eCeil = Math.atan(Math.max(0, room.H - eye) / dzWall);
  const ceilingBand = +clamp((1 - Math.tan(eCeil + pitch) / tanV) / 2, 0, 1).toFixed(4);
  const down = pitch + fov * DEG / 2;
  const floorNear = down >= Math.PI / 2 - 1e-6 ? 0 : eye / Math.tan(Math.max(1e-6, down));

  return Object.freeze({
    position: [+x.toFixed(4), +eye.toFixed(4), +z.toFixed(4)],
    target: target.map(v => +v.toFixed(4)),
    fov: +fov.toFixed(3),
    eye,
    feature: s.feature,
    featureMix: featureMixUsed,
    lateralRelax,
    standOff: +(z - backZ).toFixed(4),
    pitchDeg: +(pitch / DEG).toFixed(3),
    yawDeg: +(yaw / DEG).toFixed(3),
    ceilingBand,
    floorNear: +floorNear.toFixed(4),
    emptyFloor: +sol.emptyFloor.toFixed(4),
    ledFullyVisible,
    ledVisibleShare: ledShare,
    // 담당 벽이 없으면 null(모르는 것이 아니라 '맡지 않았다'는 뜻이다).
    featureVisible: featureShare === null ? null : featureShare > 0,
    featureVisibleShare: featureShare,
    fovCapped: fov >= CONTROL_FOV_RANGE.max - 1e-9,
  });
}

// ── 교육장 · 트레이닝룸 제안용 화각 (PHASE 7-b) ───────────────────────────────
// **PHASE 7-0 이 남긴 '화각 높이 불일치'를 푸는 자리이기도 하다.**
//   공용 실내 시점(`INSIDE.interior`)은 눈 1.75 · 시선 1.85 로 **눈이 시선보다 낮다.**
//   그러면 극각이 90°를 넘어 조작기 상한(`CONTROLS_MAX_POLAR`)에 걸리고, 조작기가
//   카메라를 시선 둘레로 **위로 돌려 버린다** — 올라가는 높이가 반지름에 비례해서
//   방이 깊을수록 커진다(강의실 2.03 · 중강당 2.13 · 대강당 2.24). 선언값과 화면이 갈린 이유다.
//   그래서 이 계열은 회의실 3종·상황실과 같은 규칙을 따른다:
//   **시선은 언제나 눈높이보다 `eyeAboveTargetFor(거리)` 만큼 아래**다. 조작기가 손댈 일이 없다.
//
// 교육장 구도의 성격 — 회의실처럼 테이블 하나를 둘러싸는 그림이 아니라,
//   **LED 를 향해 줄지어 앉은 작업면**을 보여 주는 그림이다. 그래서 내용물의 기준은
//   테이블이 아니라 **책상 배열**이고(`fields.desks`), 좌우 코너도 크게 돌지 않는다 —
//   많이 돌면 줄이 겹쳐 '책상 더미'가 된다(강당 코너에서 이미 확인된 현상이다).
export const TRAINING_CAMERA_PRESETS = Object.freeze(['interior', 'corner-l', 'corner-r']);

/**
 * 제안서 원근의 **하드 게이트**. 임원 회의실과 같은 44° 상한이다.
 *   승인 게이트는 '대표 화면이 44 이하'가 아니라 **'풀이 자체가 44 를 넘을 수 없음'** 이다.
 *   그래서 이 값은 풀이가 실제로 쓰는 상한이고, 화각을 넓히는 것은 언제나 마지막 수단이다.
 */
export const TRAINING_FOV_RANGE = Object.freeze({ min: 36, max: 44 });

/** LED 가 안 들어올 때 뒤로 물러서는 단계 수(1순위 수단). */
export const TRAINING_RETREAT_STEPS = 5;

/** 시선을 LED 한가운데로 되돌리는 단계 수(3순위 수단). */
export const TRAINING_AIM_STEPS = 4;

/**
 * LED 가 화각에 안 들어올 때 **쓰는 순서**. 이 순서가 곧 승인된 정책이다.
 *   ① 물러서기 → ② 좌우 이동 → ③ 시선 조정 → ④ 동시 탐색 → ⑤ 화각(최대 44°)
 *   화각을 넓히는 것은 언제나 마지막이고, 어떤 경우에도 44° 를 넘지 않는다.
 */
export const TRAINING_REMEDY_ORDER = Object.freeze(
  ['base', 'retreat', 'lateral', 'aim', 'joint', 'fov']);

/** 화면에 들어온 LED 넓이 비율(0~1). 네 모서리를 화면 좌표로 옮긴 결과를 받는다. */
function ledAreaShare(view, tanH, tanV) {
  if (!view || view.length < 4) return 0;
  const u0 = Math.min(...view.map(t => t.u)), u1 = Math.max(...view.map(t => t.u));
  const v0 = Math.min(...view.map(t => t.v)), v1 = Math.max(...view.map(t => t.v));
  const full = Math.max(1e-9, (u1 - u0) * (v1 - v0));
  const iw = Math.max(0, Math.min(u1, tanH) - Math.max(u0, -tanH));
  const ih = Math.max(0, Math.min(v1, tanV) - Math.max(v0, -tanV));
  return iw * ih / full;
}

/** 천장 띠 상한 — 이보다 크면 천장이 화면을 먹는다. */
export const TRAINING_BAND_MAX = 0.18;

/** 맨 뒷줄에서 물러설 거리(m). */
export const TRAINING_STANDOFF = Object.freeze({ min: 0.90, max: 4.20 });

/**
 * 시점별 기준값.
 *   eye    — 사람 눈높이. 릴리스된 네 공간과 같은 범위(1.6~1.75)다.
 *   band   — 천장 띠 목표 비율.
 *   xRatio — 방 폭에서 카메라가 서는 자리.
 *   aimMix — 시선을 LED 가로 중심에서 책상 배열 가운데 쪽으로 얼마나 당길지.
 */
export const TRAINING_CAMERA_PLANS = Object.freeze({
  // band 0.14 는 **실측에서 골랐다.** 0.10 / 0.14 / 0.18 을 재 보면 (기본 / 대형 방 바닥 점유)
  //   0.10 → 25.2 / 32.2% (천장 10.6%) · 0.14 → 22.6 / 29.0% (천장 14.9%) · 0.18 → 19.9 / 25.2% (천장 19.1%).
  //   눈높이를 2.03 에서 1.66 으로 내리면 바닥이 더 보이는 것은 당연한 대가라, 천장을 과하게
  //   내주지 않는 선에서 바닥을 깎았다. 천장 14.9% 는 상황실(13.0%)과 대기업(20.4%) 사이다.
  interior: Object.freeze({ eye: 1.66, fov: 42, band: 0.14, xRatio: 0.50, aimMix: 0.16 }),
  'corner-l': Object.freeze({ eye: 1.70, fov: 43, band: 0.12, xRatio: 0.26, aimMix: 0.30 }),
  'corner-r': Object.freeze({ eye: 1.70, fov: 43, band: 0.12, xRatio: 0.74, aimMix: 0.30 }),
});

/** 이 디자인·시점이 교육장 화각을 쓰는가. 아니면 null(= 기존 공용 시점 그대로). */
export function trainingCameraPlanId(designId, presetId) {
  if (roomDesign(designId).camera !== 'trainingProposal') return null;
  return TRAINING_CAMERA_PRESETS.includes(presetId) ? presetId : null;
}

/** 이 디자인이 쓰는 시점 이름들(검증·디버깅용). */
export function trainingCameraPresets(designId) {
  return Object.freeze(TRAINING_CAMERA_PRESETS.filter(p => trainingCameraPlanId(designId, p)));
}

/**
 * 교육장 제안용 카메라. **배치·형상·마감은 한 값도 읽어 바꾸지 않는다** — 이미 놓인 것을
 *   감싸는 범위만 읽어 카메라 자리를 고른다.
 *
 * @param fields `model.fields` — 여기서는 `desks`(책상 배열)와 `seats`(의자 범위)를 쓴다.
 */
export function trainingCameraPlan(room, led, preset, aspect = 16 / 9, fields = null) {
  const s = TRAINING_CAMERA_PLANS[preset];
  if (!s || !room || !led) return null;
  const a = Math.max(0.3, aspect);
  const f = fields || {};

  // ── 내용물 범위 ── 책상이 주인공이고, 의자는 뒤쪽 끝을 알려 준다.
  const content = mergeBounds([f.desks, f.seats]) || {
    x0: room.W * 0.2, x1: room.W * 0.8, z0: room.D * 0.2, z1: room.D * 0.75,
  };
  const contentCx = (content.x0 + content.x1) / 2;
  const contentCz = (content.z0 + content.z1) / 2;

  // ── 눈높이 ── 낮은 천장에서도 천장을 뚫지 않게 자른다.
  const eye = clamp(s.eye, EYE_RANGE.min, Math.min(EYE_RANGE.max, room.H - WALL_MARGIN - 0.2));
  const rearMost = clamp(room.D - clamp(room.D * 0.05, 0.35, 0.70), WALL_MARGIN, room.D - WALL_MARGIN);
  // 물러설 수 있는 **끝자리**. 기본 자리(rearMost)보다 조금 더 뒤지만, 벽에서 `WALL_MARGIN`
  //   만큼은 반드시 띄운다 — 벽을 뚫고 서지 않는다. 물러서기를 쓸 때만 여기까지 간다.
  const rearLimit = Math.max(rearMost, clamp(room.D - WALL_MARGIN, WALL_MARGIN, room.D - WALL_MARGIN));
  const backZ = content.z1;

  const ledPts = [[led.x, led.y, led.depth], [led.x + led.w, led.y, led.depth],
    [led.x, led.y + led.h, led.depth], [led.x + led.w, led.y + led.h, led.depth]];

  // 화각·내려본 각·서는 깊이가 서로를 물고 있어 네 번 되풀이해 수렴시킨다(회의실과 같은 방법).
  //   `retreat` 0~1 — 뒷줄 바로 뒤(0)에서 뒷벽 앞(1)까지 얼마나 물러설지.
  //   `aimMix`      — 시선을 LED 가운데에서 책상 쪽으로 얼마나 당길지(0 이면 LED 정중앙).
  //   `fovCap`      — 이번 시도에서 허용하는 화각 상한. **넓히기는 마지막 수단이라 따로 받는다.**
  function solveAt(x, retreat, aimMix, fovCap) {
    const cap = clamp(fovCap, TRAINING_FOV_RANGE.min, TRAINING_FOV_RANGE.max);
    let fov = clamp(s.fov, TRAINING_FOV_RANGE.min, cap);
    let standOff = TRAINING_STANDOFF.min;
    let z = rearMost, pitch = 0, yaw = 0, dzWall = Math.max(0.5, z - led.depth);

    for (let it = 0; it < 4; it++) {
      const zNatural = clamp(Math.min(rearMost, backZ + standOff), WALL_MARGIN, rearMost);
      z = zNatural + (rearLimit - zNatural) * clamp(retreat, 0, 1);
      dzWall = Math.max(0.5, z - led.depth);
      const halfV = fov * DEG / 2;

      const aimX = (led.x + led.w / 2) + (contentCx - (led.x + led.w / 2)) * aimMix;
      const aimZ = led.depth + (contentCz - led.depth) * aimMix;
      yaw = Math.atan2(aimX - x, aimZ - z);

      const eCeil = Math.atan(Math.max(0, room.H - eye) / dzWall);
      const band = clamp(s.band, 0, TRAINING_BAND_MAX);
      pitch = Math.atan((1 - 2 * band) * Math.tan(halfV)) - eCeil;
      // **시선은 언제나 눈높이보다 낮다** — 조작기가 카메라를 끌어올리지 못하게 한다.
      pitch = Math.max(pitch, Math.atan(POLAR_GAP_PER_DIST));

      let needV = 0, needH = 0;
      for (const p of ledPts) {
        const q = toView(p, [x, eye, z], yaw, pitch);
        if (!q) continue;
        needV = Math.max(needV, Math.abs(q.v)); needH = Math.max(needH, Math.abs(q.u));
      }
      const m = Math.tan(LED_EDGE_MARGIN_DEG * DEG);
      const wantV = 2 * Math.atan(Math.max(needV + m, (needH + m) / a)) / DEG;
      fov = clamp(Math.max(s.fov, wantV), TRAINING_FOV_RANGE.min, cap);

      // 바닥이 보이기 시작하는 거리보다 조금 더 뒤에 선다 — 앞줄 책상이 화면 아래로 빠지지 않게.
      const down = pitch + fov * DEG / 2;
      const floorNear = down >= Math.PI / 2 - 1e-6 ? 0 : eye / Math.tan(Math.max(1e-6, down));
      standOff = clamp(floorNear + FLOOR_STRIP, TRAINING_STANDOFF.min, TRAINING_STANDOFF.max);
    }

    const tanV = Math.tan(fov * DEG / 2);
    const tanH = Math.tan(hFovDeg(fov, a) * DEG / 2);
    const v = ledPts.map(q => toView(q, [x, eye, z], yaw, pitch)).filter(Boolean);
    const ledFullyVisible = v.length === 4
      && v.every(q => Math.abs(q.u) <= tanH + 1e-9 && Math.abs(q.v) <= tanV + 1e-9);
    // 다 안 들어올 때 **덜 잘린 자리**를 고르기 위해 여기서도 점유를 잰다.
    return { x, z, fov, pitch, yaw, dzWall, tanV, tanH, ledFullyVisible,
      share: ledAreaShare(v, tanH, tanV), aimMix, retreat: clamp(retreat, 0, 1) };
  }

  // ── LED 가 다 안 들어올 때의 **수단 순서** ─────────────────────────────────
  //   ① 물러서기 → ② 좌우 이동 → ③ 시선 조정 → ④ 동시 탐색 → ⑤ 화각(최대 44°).
  //   **화각은 언제나 마지막**이라, 앞의 네 수단은 기준 화각(`s.fov`)으로만 돌린다.
  //   승인된 자리에서 LED 가 이미 들어오면 이 단계들은 **한 번도 돌지 않는다** —
  //   즉 이 정책이 생겨도 승인된 대표 구도는 그대로다.
  const mid = room.W / 2;
  const x0 = clamp(room.W * s.xRatio, WALL_MARGIN, Math.max(WALL_MARGIN, room.W - WALL_MARGIN));
  const side = Math.sign(x0 - mid);
  const limit = mid + side * room.W * MIN_CORNER_OFFSET;
  const canMoveSide = side !== 0 && Math.abs(limit - mid) < Math.abs(x0 - mid);
  const xAt = k => (canMoveSide ? x0 + (limit - x0) * (k / LATERAL_RELAX_STEPS) : x0);
  const aimAt = k => s.aimMix * (1 - k / TRAINING_AIM_STEPS);

  let sol = null, stage = 'base';
  /** 후보를 받아 더 나으면 채택한다. LED 가 온전히 들어오면 true(= 더 볼 것 없다). */
  const consider = (cand, name) => {
    if (!sol || cand.share > sol.share + 1e-9) { sol = cand; stage = name; }
    return cand.ledFullyVisible;
  };

  for (const fovCap of [s.fov, TRAINING_FOV_RANGE.max]) {
    const fovStage = fovCap > s.fov;          // 마지막 판 — 여기서부터 화각을 연다.
    let done = consider(solveAt(x0, 0, s.aimMix, fovCap), fovStage ? 'fov' : 'base');

    // ① 물러서기 — 뒷벽 쪽으로 물러서면 LED 가 화면에서 작아진다. 가구 쪽으로 가지 않는다.
    for (let r = 1; r <= TRAINING_RETREAT_STEPS && !done; r++) {
      done = consider(solveAt(x0, r / TRAINING_RETREAT_STEPS, s.aimMix, fovCap),
        fovStage ? 'fov' : 'retreat');
    }
    // ② 좌우 이동 — 코너를 가운데로 조금씩 되돌린다.
    for (let k = 1; k <= LATERAL_RELAX_STEPS && !done && canMoveSide; k++) {
      done = consider(solveAt(xAt(k), 1, s.aimMix, fovCap), fovStage ? 'fov' : 'lateral');
    }
    // ③ 시선 조정 — 시선을 LED 한가운데로 되돌려 LED 를 화면 가운데에 놓는다.
    for (let k = 1; k <= TRAINING_AIM_STEPS && !done; k++) {
      done = consider(solveAt(x0, 1, aimAt(k), fovCap), fovStage ? 'fov' : 'aim');
    }
    // ④ 동시 탐색 — 물러서기·좌우·시선을 함께 움직여 찾는다.
    for (let r = 0; r <= TRAINING_RETREAT_STEPS && !done; r++) {
      for (let k = 0; k <= LATERAL_RELAX_STEPS && !done; k++) {
        for (let q = 0; q <= TRAINING_AIM_STEPS && !done; q++) {
          done = consider(solveAt(xAt(k), r / TRAINING_RETREAT_STEPS, aimAt(q), fovCap),
            fovStage ? 'fov' : 'joint');
        }
      }
    }
    if (done) break;
  }

  const { x, z, fov, pitch, yaw, dzWall, tanV, tanH, ledFullyVisible } = sol;

  // ── 시선점 ── 방향은 그대로 두고 점만 앞으로 당겨 값이 방 안에 남게 한다.
  const aimDist = Math.hypot(contentCx - x, contentCz - z);
  let tDist = clamp(aimDist, 1.2, Math.max(1.2, dzWall));
  const maxDist = Math.tan(pitch) > 1e-6 ? (eye - WALL_MARGIN) / Math.tan(pitch) : tDist;
  tDist = Math.max(1.2, Math.min(tDist, maxDist));
  const targetY = Math.min(eye - eyeAboveTargetFor(tDist), eye - tDist * Math.tan(pitch));
  const target = [
    clamp(x + Math.sin(yaw) * tDist, WALL_MARGIN, Math.max(WALL_MARGIN, room.W - WALL_MARGIN)),
    clamp(targetY, 0.05, room.H - WALL_MARGIN),
    clamp(z + Math.cos(yaw) * tDist, WALL_MARGIN, Math.max(WALL_MARGIN, room.D - WALL_MARGIN)),
  ];

  const cam = [x, eye, z];
  const eCeil = Math.atan(Math.max(0, room.H - eye) / dzWall);
  const ceilingBand = +clamp((1 - Math.tan(eCeil + pitch) / tanV) / 2, 0, 1).toFixed(4);
  const down = pitch + fov * DEG / 2;
  const floorNear = down >= Math.PI / 2 - 1e-6 ? 0 : eye / Math.tan(Math.max(1e-6, down));
  // 책상 상판(0.73m)과 의자 등받이 윗부분(0.96m)에 점을 뿌려 화면 점유를 센다.
  const deskShare = sampleShare(topSamples(f.desks ? [f.desks] : null, 0.73), cam, yaw, pitch, tanH, tanV);
  const seatsShare = sampleShare(atHeight(f.seatPoints, 0.96), cam, yaw, pitch, tanH, tanV);
  const ledShare = (() => {
    const q = ledPts.map(t => toView(t, cam, yaw, pitch)).filter(Boolean);
    if (q.length < 4) return 0;
    const u0 = Math.min(...q.map(t => t.u)), u1 = Math.max(...q.map(t => t.u));
    const v0 = Math.min(...q.map(t => t.v)), v1 = Math.max(...q.map(t => t.v));
    const full = Math.max(1e-9, (u1 - u0) * (v1 - v0));
    const iw = Math.max(0, Math.min(u1, tanH) - Math.max(u0, -tanH));
    const ih = Math.max(0, Math.min(v1, tanV) - Math.max(v0, -tanV));
    return +(iw * ih / full).toFixed(4);
  })();
  const nearestMargin = +((z - content.z1) - floorNear).toFixed(4);

  return Object.freeze({
    position: [+x.toFixed(4), +eye.toFixed(4), +z.toFixed(4)],
    target: target.map(v => +v.toFixed(4)),
    fov: +fov.toFixed(3),
    eye,
    standOff: +(z - backZ).toFixed(4),
    pitchDeg: +(pitch / DEG).toFixed(3),
    yawDeg: +(yaw / DEG).toFixed(3),
    ceilingBand,
    floorNear: +floorNear.toFixed(4),
    nearestMargin,
    ledFullyVisible,
    ledVisibleShare: ledShare,
    deskShare,
    seatsShare,
    // ── 정책 관측치 ── 어떤 수단까지 갔는지, 벽·뒷줄과 얼마나 떨어졌는지.
    remedy: stage,
    retreat: +sol.retreat.toFixed(4),
    aimMix: +sol.aimMix.toFixed(4),
    rearClearance: +(z - content.z1).toFixed(4),
    wallClearance: +Math.min(x, room.W - x, room.D - z, z).toFixed(4),
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 아이디에이션 제안 카메라 (PHASE 8-2b)
// ─────────────────────────────────────────────────────────────────────────────
// **무엇을 고치는가.** PHASE 8-1 에서 잰 값 하나가 이 단계의 전부다 —
//   협업 구역이 제안서에 쓰는 시점에서 화면 점유 **0.00%** 였다. 아이디에이션 공간의
//   정체성이 협업 구역인데, 제안서에는 LED 벽과 하이 테이블만 나왔다.
//
// **왜 그랬나.** 짐작하지 않고 후보 자세를 렌더러에 실제로 놓고 재서 알아냈다.
//   공용 실내 시점은 방 한가운데 뒤에 서서 LED 를 정면으로 본다. 그런데 협업 구역은
//   카메라에서 **약 1.9m 앞·좌우로 1.1~3.1m** 떨어져 있고, 그 거리에서 가로 반화각이
//   담는 폭은 0.84m 뿐이다. 즉 **화면 가로 밖으로 밀려나 있었다.** 아래로 잘린 것이
//   아니어서, 눈높이를 낮추거나 더 내려다봐도 들어오지 않았다(후보 243개 전부 0.00%).
//
// **어떻게 고치나 — 두 가지다.**
//   ① **LED 가 허락하는 만큼 가까운 협업 덩이 쪽으로 돌아선다.** LED 네 귀퉁이가 다
//      들어오는 방위각 구간을 먼저 구하고, 그 구간 안에서 협업 덩이에 가장 가까운
//      방위각을 고른다. 화각을 넓혀서 푸는 것이 아니라 **어디를 보는가**로 푼다.
//   ② **맨 뒤 내용물에서 일정 거리만 물러선다.** 언제나 뒷벽까지 물러서면 14m 급 방에서
//      카메라 앞에 빈 바닥이 길게 깔려 바닥 점유가 42% 까지 올라간다(실측). 내용물 뒤
//      `IDEATION_STANDOFF` 만큼만 물러서면 작은 방에서는 결과가 뒷벽과 같고, 큰 방에서만
//      카메라가 앞으로 나온다.
//
// 정면·아이소·평면은 **가로채지 않는다.** 그 셋은 기술·참조 시점이라 PHASE 8-2a 자세
//   그대로 둔다(픽셀 차이 0 으로 증명한다).
// ─────────────────────────────────────────────────────────────────────────────
export const IDEATION_CAMERA_PRESETS = Object.freeze(['interior', 'corner-l', 'corner-r']);

/** 화각 하드 게이트. 교육장과 같은 44° 다 — 이 단계에서 올리지 않는다. */
export const IDEATION_FOV_RANGE = Object.freeze({ min: 36, max: 44 });

/** 사람 눈높이 범위(오너 지침 §5). 레거시 코너의 2.20m 를 쓰지 않는다. */
export const IDEATION_EYE_RANGE = Object.freeze({ min: 1.62, max: 1.78 });

/** 맨 뒤 내용물에서 물러서는 기본 거리(m). 뒷벽을 넘지는 않는다.
 *   **왜 이만큼인가.** 협업 테이블 상판은 눈보다 0.96m 낮다. 너무 가까이 서면 그 상판이
 *   화면 아래로 빠져 버린다(1.5m 에서는 내려본 각 32.6°로 화면 밖이다). 실측으로 고른 값이다. */
export const IDEATION_STANDOFF = 1.10;

/**
 * 시점 기준값. 전부 **비율이거나 사람 치수**다.
 *   eye     눈높이(m)
 *   fov     기준 화각(°) — 여기서 시작해 LED 가 들어갈 만큼만 넓히고 44°에서 멈춘다
 *   band    화면 위쪽 천장 띠 목표 비율
 *   xRatio  서는 자리(가로) = 방 너비 × 이 값
 *   turn    LED 가 허락하는 한계까지 협업 덩이 쪽으로 얼마나 돌아서는가(0 이면 LED 정면)
 */
export const IDEATION_CAMERA_PLANS = Object.freeze({
  interior: Object.freeze({ eye: 1.66, fov: 42, band: 0.11, xRatio: 0.30, turn: 1.00 }),
  'corner-l': Object.freeze({ eye: 1.66, fov: 43, band: 0.11, xRatio: 0.21, turn: 1.00 }),
  'corner-r': Object.freeze({ eye: 1.66, fov: 43, band: 0.11, xRatio: 0.79, turn: 1.00 }),
});

/** 이 디자인·시점이 아이디에이션 화각을 쓰는가. 아니면 null(= 기존 공용 시점 그대로). */
export function ideationCameraPlanId(designId, presetId) {
  if (roomDesign(designId).camera !== 'ideationProposal') return null;
  return IDEATION_CAMERA_PRESETS.includes(presetId) ? presetId : null;
}

/** 이 디자인이 쓰는 시점 이름들(검증·디버깅용). */
export function ideationCameraPresets(designId) {
  return Object.freeze(IDEATION_CAMERA_PRESETS.filter(p => ideationCameraPlanId(designId, p)));
}

/** 이름으로 고른 기준값으로 구도를 푼다. */
export function ideationCameraPlan(room, led, preset, aspect = 16 / 9, fields = null) {
  const s = IDEATION_CAMERA_PLANS[preset];
  return s ? ideationCameraPlanWith(room, led, s, aspect, fields) : null;
}

/**
 * 아이디에이션 제안용 카메라. **배치·형상·마감·조명은 한 값도 읽어 바꾸지 않는다** —
 *   이미 놓인 것을 감싸는 범위만 읽어 카메라 자리와 방향을 고른다.
 *
 * 기준값을 인자로 받는 까닭은, 후보 기준값을 **렌더러에 실제로 놓고 재서** 고르기
 *   위해서다(QA 도구가 이 함수를 그대로 부른다). 제품이 쓰는 값은 위 표 한 곳뿐이다.
 *
 * @param fields `model.fields` — 여기서는 `ideationZones` 를 쓴다.
 */
export function ideationCameraPlanWith(room, led, s, aspect = 16 / 9, fields = null) {
  if (!s || !room || !led) return null;
  const a = Math.max(0.3, aspect);
  const zones = (fields && fields.ideationZones) || null;

  // ── 내용물 범위 ── 협업 구역이 주인공이고, 하이 테이블 구역이 앞쪽 끝을 알려 준다.
  const content = mergeBounds([zones && zones.collab, zones && zones.high]) || {
    x0: room.W * 0.2, x1: room.W * 0.8, z0: room.D * 0.3, z1: room.D * 0.8,
  };
  const contentCx = (content.x0 + content.x1) / 2;
  const contentCz = (content.z0 + content.z1) / 2;

  // ── 눈높이 ── 사람 눈높이 범위 안에서, 낮은 천장이면 천장을 뚫지 않게 자른다.
  const eye = clamp(s.eye, IDEATION_EYE_RANGE.min,
    Math.min(IDEATION_EYE_RANGE.max, Math.max(IDEATION_EYE_RANGE.min, room.H - WALL_MARGIN - 0.2)));

  // ── 서는 자리(앞뒤) ── 맨 뒤 내용물에서 정해진 만큼만 물러선다. 뒷벽이 한계다.
  const backLimit = Math.max(WALL_MARGIN, room.D - WALL_MARGIN);
  const standoff = Number.isFinite(s.standoff) ? s.standoff : IDEATION_STANDOFF;
  const standZ = clamp(content.z1 + standoff, Math.min(backLimit, led.depth + 1.2), backLimit);
  const dzWall = Math.max(0.5, standZ - led.depth);

  const ledPts = [[led.x, led.y, led.depth], [led.x + led.w, led.y, led.depth],
    [led.x, led.y + led.h, led.depth], [led.x + led.w, led.y + led.h, led.depth]];

  // 방위각 — **정면(-z 방향)이 0**, +x 쪽이 양수. 카메라가 늘 앞을 보므로 이 기준이 편하다.
  const bear = (px, pz, xAt) => Math.atan2(px - xAt, Math.max(1e-6, standZ - pz));
  // 협업 덩이는 방마다 두 곳으로 흩어진다. **선 자리에서 가까운 쪽**을 주인공으로 삼는다.
  const nearSpot = (xAt) => {
    const list = (zones && zones.collabSpots) || null;
    if (!list || !list.length) return { x: contentCx, z: contentCz };
    let best = list[0], bd = Infinity;
    for (const p of list) {
      const d = Math.hypot(p.x - xAt, p.z - standZ);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };

  /**
   * 한 자리에서의 해. 화각과 방위각이 서로를 물고 있어 다섯 번 되풀이해 수렴시킨다.
   * @param xAt  설 자리(가로)
   * @param turn LED 가 허락하는 한계까지 협업 덩이 쪽으로 도는 정도(0~1)
   */
  function solveAt(xAt, turn) {
    const cam = [xAt, eye, standZ];
    const k = nearSpot(xAt);
    const bK = bear(k.x, k.z, xAt);
    const bL = bear(led.x, led.depth, xAt);
    const bR = bear(led.x + led.w, led.depth, xAt);
    const bC = (bL + bR) / 2;
    let fov = clamp(s.fov, IDEATION_FOV_RANGE.min, IDEATION_FOV_RANGE.max);
    let b = bC, pitch = Math.atan(POLAR_GAP_PER_DIST), lo = bC, hi = bC;
    for (let it = 0; it < 5; it++) {
      const halfV = fov * DEG / 2;
      // LED 두 세로 모서리가 다 들어오는 방위각 구간. 여유(LED_EDGE_MARGIN_DEG)를 둔다.
      const aH = Math.atan(Math.tan(hFovDeg(fov, a) * DEG / 2)) - LED_EDGE_MARGIN_DEG * DEG;
      lo = bR - aH; hi = bL + aH;
      if (lo > hi) { const m = (lo + hi) / 2; lo = m; hi = m; }   // 화각이 모자라면 가운데
      // **구간 안에서 협업 덩이에 가장 가까운 방위각.** 이것이 이 단계의 핵심 규칙이다.
      b = clamp(bC + (clamp(bK, lo, hi) - bC) * clamp(turn, 0, 1), lo, hi);
      // 내려본 각 — 천장 띠에서 역산한다. 시선은 **언제나 눈보다 낮다**.
      const eCeil = Math.atan(Math.max(0, room.H - eye) / dzWall);
      pitch = Math.max(Math.atan((1 - 2 * clamp(s.band, 0, 0.30)) * Math.tan(halfV)) - eCeil,
        Math.atan(POLAR_GAP_PER_DIST));
      // LED 가 다 들어오는 최소 화각. 기준보다 넓혀야 하면 넓히되 **44°를 넘지 않는다.**
      let needV = 0, needH = 0;
      for (const p of ledPts) {
        const q = toView(p, cam, Math.PI - b, pitch);
        if (!q) continue;
        needV = Math.max(needV, Math.abs(q.v)); needH = Math.max(needH, Math.abs(q.u));
      }
      const m = Math.tan(LED_EDGE_MARGIN_DEG * DEG);
      const wantV = 2 * Math.atan(Math.max(needV + m, (needH + m) / a)) / DEG;
      fov = clamp(Math.max(s.fov, wantV), IDEATION_FOV_RANGE.min, IDEATION_FOV_RANGE.max);
    }
    const yaw = Math.PI - b;
    const tV = Math.tan(fov * DEG / 2);
    const tH = Math.tan(hFovDeg(fov, a) * DEG / 2);
    const q = ledPts.map(t => toView(t, cam, yaw, pitch)).filter(Boolean);
    const whole = q.length === 4 && q.every(t => Math.abs(t.u) <= tH + 1e-9 && Math.abs(t.v) <= tV + 1e-9);
    return { x: xAt, turn, spot: k, bearing: b, span: [lo, hi], fov, pitch, yaw,
      tanV: tV, tanH: tH, whole, share: ledAreaShare(q, tH, tV) };
  }

  // ── LED 가 그래도 다 안 들어올 때의 **수단 순서** ────────────────────────────
  //   물러서기는 내용물이 정해 버렸고, 방위각은 이미 'LED 가 허락하는 구간' 안에서 고른다.
  //   남은 수단은 **좌우로 가운데에 다가서기** 하나다(멀리 설수록 LED 가 넓게 보인다).
  //   **화각은 이미 상한(44°)이라 열지 않는다.** 승인된 자리에서 들어오면 한 번도 돌지 않는다.
  const mid = room.W / 2;
  const x0 = clamp(room.W * s.xRatio, WALL_MARGIN, Math.max(WALL_MARGIN, room.W - WALL_MARGIN));
  const side = Math.sign(x0 - mid);
  const limit = mid + side * room.W * MIN_CORNER_OFFSET;
  const canMoveSide = side !== 0 && Math.abs(limit - mid) < Math.abs(x0 - mid);

  let sol = null, stage = 'base';
  const consider = (cand, name) => {
    if (!sol || cand.share > sol.share + 1e-9) { sol = cand; stage = name; }
    return cand.whole;
  };
  let done = consider(solveAt(x0, s.turn), 'base');
  for (let k = 1; k <= LATERAL_RELAX_STEPS && !done && canMoveSide; k++) {
    done = consider(solveAt(x0 + (limit - x0) * (k / LATERAL_RELAX_STEPS), s.turn), 'lateral');
  }

  const { x, fov, pitch, yaw, tanV, tanH, whole: ledFullyVisible, spot } = sol;
  const cam = [x, eye, standZ];

  // ── 시선점 ── 방향(방위각·내려본 각)은 그대로 두고, 점만 **주인공 앞**에 찍는다.
  const aimDist = Math.hypot(spot.x - x, spot.z - standZ);
  let tDist = clamp(aimDist, 1.2, Math.max(1.2, dzWall));
  const maxDist = Math.tan(pitch) > 1e-6 ? (eye - WALL_MARGIN) / Math.tan(pitch) : tDist;
  tDist = Math.max(1.2, Math.min(tDist, maxDist));
  const targetY = Math.min(eye - eyeAboveTargetFor(tDist), eye - tDist * Math.tan(pitch));
  const target = [
    clamp(x + Math.sin(yaw) * tDist, WALL_MARGIN, Math.max(WALL_MARGIN, room.W - WALL_MARGIN)),
    clamp(targetY, 0.05, room.H - WALL_MARGIN),
    clamp(standZ + Math.cos(yaw) * tDist, WALL_MARGIN, Math.max(WALL_MARGIN, room.D - WALL_MARGIN)),
  ];

  const eCeil = Math.atan(Math.max(0, room.H - eye) / dzWall);
  const ceilingBand = +clamp((1 - Math.tan(eCeil + pitch) / tanV) / 2, 0, 1).toFixed(4);
  const down = pitch + fov * DEG / 2;
  const floorNear = down >= Math.PI / 2 - 1e-6 ? 0 : eye / Math.tan(Math.max(1e-6, down));
  // 구역이 화면에 남는지 — 협업 테이블 상판(0.70m)·라운지 등받이(0.82m)·하이 상판(1.05m)
  //   높이에 점을 뿌려 센다. **그림을 대신하지는 않는다** — 최종 판정은 렌더러 실측이다.
  const zoneShare = (b, h) => sampleShare(topSamples(b ? [b] : null, h), cam, yaw, pitch, tanH, tanV);
  const spotShare = sampleShare(topSamples([{ x0: spot.x - 0.55, x1: spot.x + 0.55,
    z0: spot.z - 0.55, z1: spot.z + 0.55 }], 0.70), cam, yaw, pitch, tanH, tanV);
  const ledVisibleShare = (() => {
    const q = ledPts.map(t => toView(t, cam, yaw, pitch)).filter(Boolean);
    if (q.length < 4) return 0;
    const u0 = Math.min(...q.map(t => t.u)), u1 = Math.max(...q.map(t => t.u));
    const v0 = Math.min(...q.map(t => t.v)), v1 = Math.max(...q.map(t => t.v));
    const full = Math.max(1e-9, (u1 - u0) * (v1 - v0));
    const iw = Math.max(0, Math.min(u1, tanH) - Math.max(u0, -tanH));
    const ih = Math.max(0, Math.min(v1, tanV) - Math.max(v0, -tanV));
    return +(iw * ih / full).toFixed(4);
  })();

  return Object.freeze({
    position: [+x.toFixed(4), +eye.toFixed(4), +standZ.toFixed(4)],
    target: target.map(q => +q.toFixed(4)),
    fov: +fov.toFixed(3),
    eye,
    pitchDeg: +(pitch / DEG).toFixed(3),
    bearingDeg: +(sol.bearing / DEG).toFixed(3),
    bearingSpanDeg: sol.span.map(v => +(v / DEG).toFixed(3)),
    ceilingBand,
    floorNear: +floorNear.toFixed(4),
    ledFullyVisible,
    ledVisibleShare,
    collabShare: zoneShare(zones && zones.collab, 0.82),
    collabSpotShare: spotShare,
    highShare: zoneShare(zones && zones.high, 1.05),
    turn: +clamp(sol.turn, 0, 1).toFixed(4),
    remedy: stage,
    standoff: +standoff.toFixed(4),
    rearClearance: +(standZ - content.z1).toFixed(4),
    wallClearance: +Math.min(x, room.W - x, room.D - standZ, standZ).toFixed(4),
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 강당 카메라 (PHASE 9-d.2)
// ─────────────────────────────────────────────────────────────────────────────
// 앞의 계열들과 **무엇이 다른가.**
//   회의실·교육장·아이디에이션은 깊이가 7~14m라 '내용물 뒤에 선다'는 한 줄로 충분했다.
//   강당은 깊이가 12~28m다. 같은 규칙을 그대로 쓰면 카메라가 맨 뒷줄 뒤에 서게 되는데,
//   PHASE 9-d.1 기준 화면을 실제로 재어 보면 그 자리에서 세 가지가 함께 무너진다.
//     ① **LED 가 작아진다.** 대강당 실내 시점의 LED 화면 점유는 6.08% 였다.
//     ② **무대가 사라진다.** 같은 컷의 무대 상판 점유는 0.19% 로, 무대와 LED 의 관계가
//        읽히지 않는다(중강당 0.39%).
//     ③ **맨 뒤 단이 화면 아래를 덮는다.** 대강당 실내 시점은 객석 단 상판 하나가 화면
//        아래 1/4 띠의 **56.47%** 를 차지해, 제안서에 쓸 수 없는 민무늬 판으로 읽힌다.
//   게다가 그 자리의 눈높이는 선언값 1.75m 가 아니라 **2.35m** 였다. 시선을 눈보다 높게
//   두면 조작기가 카메라를 위로 밀어 올리기 때문이다(`settledPose` 의 극각 상한).
//
// 그래서 이 계열은 서는 자리를 **뒷벽이 아니라 객석 한가운데**로 옮긴다.
//   ① **줄을 세어 선다.** 객석 첫 줄과 맨 뒷줄 사이를 `coverage` 비율로 나눈 자리에서,
//      **두 줄 사이**에 선다. 사람이 실제로 설 수 있는 자리이고, 방이 커지면 줄 수가
//      늘어 자리도 따라 뒤로 간다 — 고정 거리가 아니다.
//   ② **눈높이를 단이 정한다.** 그 자리를 덮는 객석 단의 높이에 선 사람의 눈높이를 더한다.
//      단이 높아 2.20m 를 넘을 자리라면 **더 낮은 단으로 앞당겨 선다**(드론 시점 금지).
//   ③ **시선은 언제나 눈보다 낮다.** 그래야 조작기의 극각 상한에 걸리지 않아, 여기서 적은
//      눈높이가 화면의 눈높이와 같아진다.
//   ④ **LED 가 목표만큼 안 차면 한 줄씩 앞으로 나온다.** 화각을 넓혀서 풀지 않는다 —
//      광각 왜곡은 제안서에서 쓸 수 없다(상한 44°).
//
// 정면·아이소·평면은 **가로채지 않는다.** 그 셋은 기술 시점이라 PHASE 9-d.1 자세 그대로
//   두고 픽셀 차이 0 으로 증명한다.
// ─────────────────────────────────────────────────────────────────────────────

/** 이 계열이 다루는 시점. 정면·아이소·평면도는 **언제나 제외**다(§6 동결). */
export const AUDITORIUM_CAMERA_PRESETS = Object.freeze(['interior', 'corner-l', 'corner-r']);

/** 화각 하드 게이트(§9). 권장 상한 44°를 코드에서 지킨다 — 50°는 애초에 닿지 않는다. */
export const AUDITORIUM_FOV_RANGE = Object.freeze({ min: 36, max: 44 });

/** 눈높이 허용 범위(m·§15). 단 위에 서더라도 2.20m 를 넘지 않는다. */
export const AUDITORIUM_EYE_RANGE = Object.freeze({ min: 1.60, max: 2.20 });

/** 단 위에 **선 사람**의 눈높이(m). 여기에 그 자리의 단 높이를 더해 카메라 높이를 만든다. */
export const AUDITORIUM_STAND_EYE = 1.70;

/** 화면 위쪽에 남길 천장 띠의 상한(§14). 이보다 크게 적어도 여기서 잘린다. */
export const AUDITORIUM_BAND_MAX = 0.15;

/** 두 줄 사이 어디에 서는가(줄 간격에 대한 비율). 0.5 면 정확히 한가운데다. */
export const AUDITORIUM_ROW_GAP = 0.5;

/** 카메라 앞에 반드시 남겨 두는 객석 비율. 이보다 앞으로는 나오지 않는다(객석이 사라진다). */
export const AUDITORIUM_MIN_HOUSE_AHEAD = 0.30;

/**
 * 크기별 기준값. **세 강당이 한 함수를 쓰되 같은 숫자를 쓰지는 않는다**(§8).
 *   ledAim    LED 가 화면 넓이에서 차지할 목표 비율. 이 값이 **서는 깊이를 정한다**
 *   eye       단 위에 선 사람의 눈높이(m)
 *   fov       기준 화각(°)
 *   band      화면 위쪽에 남길 천장 띠 목표 비율
 *
 * **왜 깊이를 비율이 아니라 LED 목표로 정하는가.** 객석 깊이의 몇 할이라는 식으로 정하면,
 *   같은 비율이라도 소강당에서는 LED 까지 5m, 대강당에서는 14m 가 되어 LED 크기가 크게
 *   갈린다. 반대로 LED 목표를 정해 두고 **그 목표를 지키는 가장 뒤쪽 줄**에 서면, 세 강당이
 *   모두 같은 굵기로 LED 를 보여 주면서 객석은 담을 수 있는 만큼 담는다(§31).
 *
 * **왜 큰 방일수록 목표가 조금 낮은가.** 대강당은 LED 가 7.1m 로 커서 같은 목표라도 카메라가
 *   훨씬 앞으로 나와야 하고, 그러면 뒤쪽 객석이 통째로 화면에서 빠진다. 대·중강당은 목표를
 *   조금 낮춰 객석 깊이를 남긴다.
 */
export const AUDITORIUM_CAMERA_SIZES = Object.freeze({
  auditoriumSmall: Object.freeze({ ledAim: 0.150, eye: 1.70, fov: 40, band: 0.05 }),
  auditoriumMedium: Object.freeze({ ledAim: 0.135, eye: 1.70, fov: 41, band: 0.05 }),
  auditoriumLarge: Object.freeze({ ledAim: 0.125, eye: 1.70, fov: 42, band: 0.05 }),
});

/**
 * 시점별 기준값. 크기와 따로 두어 **한 곳만 고치면 세 강당에 같이 듣게** 한다(§5).
 *   place     서는 가로 자리를 어떻게 고르는가 — 'center' 는 방 한가운데, 'side' 는 옆 통로
 *   side      옆 통로를 고를 때 어느 쪽인가(-1 왼쪽 · +1 오른쪽)
 *   rowShift  기준 자리에서 **객석 깊이의 몇 할**만큼 앞뒤로 옮겨 설지(음수 = 무대 쪽).
 *             줄 수가 아니라 비율로 적는 까닭은, 7줄짜리 소강당과 19줄짜리 대강당에서 '세 줄'이
 *             전혀 다른 거리이기 때문이다. 소강당에서 세 줄은 객석의 절반이다
 *   fovAdd    기준 화각에 더하는 값(°)
 *   aimMix    시선을 LED 벽(0)에서 객석 첫 줄(1) 쪽으로 얼마나 당길지
 *
 * **왜 코너의 깊이를 LED 목표로 다시 풀지 않는가.** 옆에서 보면 LED 가 비스듬해 같은 자리라도
 *   화면에서 작아진다. 그 값을 그대로 목표에 견주면 카메라가 맨 앞줄까지 걸어 나와 객석이
 *   통째로 사라진다(실제로 그렇게 나왔다). 그래서 깊이는 **크기가 한 번만 정하고**, 시점은
 *   그 자리에서 몇 줄 옮길지만 고른다.
 *
 * **좌·우 코너를 대칭으로 두지 않는다**(§7). 왼쪽은 기준 자리 그대로 서서 객석 깊이를
 *   보여 주고, 오른쪽은 세 줄 앞에 서서 무대를 크게 보여 준다. 거울상 두 장을 나란히 놓으면
 *   제안서에서 같은 그림 두 장으로 읽힌다.
 */
export const AUDITORIUM_CAMERA_VIEWS = Object.freeze({
  interior: Object.freeze({ place: 'center', side: 0, rowShift: 0, fovAdd: 0, aimMix: 0.30 }),
  'corner-l': Object.freeze({ place: 'side', side: -1, rowShift: 0, fovAdd: 1, aimMix: 0.42 }),
  'corner-r': Object.freeze({ place: 'side', side: 1, rowShift: -0.18, fovAdd: 1, aimMix: 0.30 }),
});

/**
 * LED 가 **화면 넓이의 몇 할**을 차지하는가(0~1). `ledAreaShare` 는 'LED 가 얼마나 잘리지
 *   않았는가'를 재는 값이라 이 판단에 쓸 수 없다 — 아무리 멀어도 다 보이면 1 이기 때문이다.
 *   네 모서리를 화면 좌표로 옮긴 사각형을 화면 테두리로 자른 뒤 그 넓이를 화면 넓이로 나눈다.
 */
function screenAreaShare(view, tanH, tanV) {
  if (!view || view.length < 4) return 0;
  // 화면 좌표를 [-1,1]² 로 정규화해 자른다 — 자르는 식이 간단해진다.
  let poly = view.map(t => [t.u / tanH, t.v / tanV]);
  for (const [nx, ny] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const dp = 1 - (p[0] * nx + p[1] * ny), dq = 1 - (q[0] * nx + q[1] * ny);
      if (dp >= 0) out.push(p);
      if ((dp >= 0) !== (dq >= 0)) {
        const t = dp / (dp - dq);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
    poly = out;
    if (!poly.length) return 0;
  }
  let A = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    A += p[0] * q[1] - q[0] * p[1];
  }
  return +(Math.abs(A / 2) / 4).toFixed(5);
}

/** 이 디자인·시점이 강당 화각을 쓰는가. 아니면 null(= 기존 공용 시점 그대로). */
export function auditoriumCameraPlanId(designId, presetId) {
  if (roomDesign(designId).camera !== 'auditoriumProposal') return null;
  if (!AUDITORIUM_CAMERA_SIZES[designId]) return null;
  return AUDITORIUM_CAMERA_PRESETS.includes(presetId) ? presetId : null;
}

/** 이 디자인이 쓰는 시점 이름들(검증·디버깅용). */
export function auditoriumCameraPresets(designId) {
  return Object.freeze(AUDITORIUM_CAMERA_PRESETS.filter(p => auditoriumCameraPlanId(designId, p)));
}

/** 이름으로 고른 기준값으로 구도를 푼다. */
export function auditoriumCameraPlan(room, led, designId, preset, aspect = 16 / 9, fields = null) {
  const size = AUDITORIUM_CAMERA_SIZES[designId];
  const view = AUDITORIUM_CAMERA_VIEWS[preset];
  if (!size || !view) return null;
  return auditoriumCameraPlanWith(room, led, { ...size, ...view }, aspect, fields);
}

/**
 * 강당 제안용 카메라. **배치·형상·마감·조명은 한 값도 바꾸지 않는다** — 이미 놓인 좌석과
 *   단을 읽어 카메라 자리와 방향만 고른다.
 *
 * 기준값을 인자로 받는 까닭은, 후보 기준값을 **렌더러에 실제로 놓고 재서** 고르기
 *   위해서다(QA 도구가 이 함수를 그대로 부른다). 제품이 쓰는 값은 위 두 표뿐이다.
 *
 * @param fields `model.fields` — 여기서는 `auditorium` 만 쓴다. 없으면 null 을 돌려주어
 *               기존 계산(`presetPose`)이 그대로 돌게 한다.
 */
export function auditoriumCameraPlanWith(room, led, s, aspect = 16 / 9, fields = null) {
  const aud = fields && fields.auditorium;
  if (!s || !room || !led || !aud || !aud.rowZ || aud.rowZ.length < 2) return null;
  const a = Math.max(0.3, aspect);
  const rows = aud.rowZ;
  const pitchZ = aud.pitchZ > 0 ? aud.pitchZ : 1;
  const 마지막 = rows.length - 1;

  // ── 눈높이가 허락하는 단 ── 그 깊이를 덮는 단 가운데 가장 높은 것이 바닥을 정한다.
  const 단높이 = z => {
    let h = 0;
    for (const r of aud.risers || []) if (z >= r.z0 && z <= r.z1 && r.h > h) h = r.h;
    return h;
  };
  const standEye = clamp(s.eye, AUDITORIUM_EYE_RANGE.min, AUDITORIUM_EYE_RANGE.max);
  // 천장이 낮으면 천장을 뚫지 않게 한 번 더 자른다(강당 천장은 4m 이상이라 보통 놀고 있다).
  const eyeCap = Math.min(AUDITORIUM_EYE_RANGE.max, Math.max(AUDITORIUM_EYE_RANGE.min,
    room.H - WALL_MARGIN - 0.2));
  const 눈높이 = z => clamp(단높이(z) + standEye, AUDITORIUM_EYE_RANGE.min, eyeCap);

  // 설 수 있는 자리 — 두 줄 사이. `k` 번째 자리는 `k-1` 번 줄과 `k` 번 줄 사이다.
  const 자리 = k => rows[clamp(k, 0, 마지막 - 1)] + pitchZ * AUDITORIUM_ROW_GAP;
  // 단이 높아 눈높이가 2.20m 를 넘는 자리에는 **서지 않는다**(드론 시점 금지 · §15).
  const 설수있는 = k => 단높이(자리(k)) + standEye <= eyeCap + 1e-9;

  // ── 가로 자리 ── 실내는 방 한가운데, 코너는 **객석 블록 바깥의 옆 통로**에 선다.
  //   옆 통로는 좌석이 없는 자리라 카메라 앞을 막는 것이 없고, 객석 블록의 옆면과 단차가
  //   한 화면에 들어온다(§7). 방마다 폭이 다르므로 자리는 좌석 범위와 벽에서 계산한다.
  const 가운데 = room.W / 2;
  const 블록0 = aud.x0 - aud.pitchX / 2, 블록1 = aud.x1 + aud.pitchX / 2;
  let 선자리x = 가운데;
  if (s.place === 'side') {
    선자리x = s.side < 0 ? (WALL_MARGIN + 블록0) / 2 : (블록1 + room.W - WALL_MARGIN) / 2;
  }
  선자리x = clamp(선자리x, WALL_MARGIN, Math.max(WALL_MARGIN, room.W - WALL_MARGIN));

  const ledCx = led.x + led.w / 2;
  // LED 네 모서리. **테두리를 도는 차례**로 적는다 — 넓이를 신발끈 공식으로 재기 때문에,
  //   마주 보는 두 점을 이어 적으면 나비 모양이 되어 넓이가 0 에 가깝게 나온다.
  const ledPts = [[led.x, led.y, led.depth], [led.x + led.w, led.y, led.depth],
    [led.x + led.w, led.y + led.h, led.depth], [led.x, led.y + led.h, led.depth]];

  /** 한 줄에서의 해. 화각·시선·천장 띠가 서로를 물고 있어 네 번 되풀이해 수렴시킨다. */
  function solveAt(k, 가운데기준 = false) {
    // `가운데기준` 은 **기준 자리를 고를 때만** 쓴다 — 세 시점이 같은 잣대로 깊이를 얻도록,
    //   옆 통로가 아니라 방 한가운데에서 기준 화각으로 재는 것이다.
    const x = 가운데기준 ? 가운데 : 선자리x;
    const baseFov = s.fov + (가운데기준 ? 0 : (s.fovAdd || 0));
    const z = clamp(자리(k), WALL_MARGIN, Math.max(WALL_MARGIN, room.D - WALL_MARGIN));
    const eye = 눈높이(z);
    const dzWall = Math.max(0.5, z - led.depth);
    let fov = clamp(baseFov, AUDITORIUM_FOV_RANGE.min, AUDITORIUM_FOV_RANGE.max);
    let pitch = Math.atan(POLAR_GAP_PER_DIST), yaw = 0;
    for (let it = 0; it < 4; it++) {
      const halfV = fov * DEG / 2;
      // 시선 방향(좌우) — LED 가운데를 본다. 코너에서도 LED 를 놓치지 않게 한다.
      yaw = Math.atan2(ledCx - x, led.depth - z);
      // 내려본 각 — 천장 띠에서 역산한다. **시선은 언제나 눈보다 낮다**(극각 상한 회피).
      const eCeil = Math.atan(Math.max(0, room.H - eye) / dzWall);
      pitch = Math.max(Math.atan((1 - 2 * clamp(s.band, 0, AUDITORIUM_BAND_MAX)) * Math.tan(halfV)) - eCeil,
        Math.atan(POLAR_GAP_PER_DIST));
      // LED 가 다 들어오는 최소 화각. 기준보다 넓혀야 하면 넓히되 **44°를 넘지 않는다.**
      let needV = 0, needH = 0;
      for (const p of ledPts) {
        const q = toView(p, [x, eye, z], yaw, pitch);
        if (!q) continue;
        needV = Math.max(needV, Math.abs(q.v)); needH = Math.max(needH, Math.abs(q.u));
      }
      const m = Math.tan(LED_EDGE_MARGIN_DEG * DEG);
      const wantV = 2 * Math.atan(Math.max(needV + m, (needH + m) / a)) / DEG;
      fov = clamp(Math.max(baseFov, wantV), AUDITORIUM_FOV_RANGE.min, AUDITORIUM_FOV_RANGE.max);
    }
    const tanV = Math.tan(fov * DEG / 2);
    const tanH = Math.tan(hFovDeg(fov, a) * DEG / 2);
    const q = ledPts.map(p => toView(p, [x, eye, z], yaw, pitch)).filter(Boolean);
    const whole = q.length === 4 && q.every(t => Math.abs(t.u) <= tanH + 1e-9 && Math.abs(t.v) <= tanV + 1e-9);
    return { row: k, x, z, eye, fov, pitch, yaw, tanV, tanH, dzWall, whole,
      share: screenAreaShare(q, tanH, tanV), visible: ledAreaShare(q, tanH, tanV) };
  }

  // ── 기준 자리 ── **LED 목표를 지키는 가장 뒤쪽 자리**를 방 한가운데 기준으로 한 번만 푼다.
  //   뒤로 갈수록 LED 는 작아지고 객석은 많이 담기므로, 목표를 만족하는 자리 가운데 가장 뒤가
  //   곧 '객석을 가장 많이 담은 구도'다(§31). 설 수 없는 자리는 애초에 후보에서 뺀다.
  //   어느 자리도 목표를 못 채우면(LED 가 아주 작은 방) 설 수 있는 가장 앞자리가 기준이 된다.
  const aim = clamp(s.ledAim || 0, 0, 1);
  const 앞한계 = Math.max(1, Math.round(마지막 * AUDITORIUM_MIN_HOUSE_AHEAD));
  let 기준 = null, 가장앞 = null;
  for (let k = 마지막 - 1; k >= 앞한계; k--) {
    if (!설수있는(k)) continue;
    가장앞 = k;
    if (solveAt(k, true).share >= aim) { 기준 = k; break; }
  }
  if (기준 == null) 기준 = 가장앞 != null ? 가장앞 : 앞한계;

  // ── 시점이 고른 자리 ── 기준에서 `rowShift` 만큼 옮기고, 설 수 있는 자리까지 앞으로 당긴다.
  let 줄 = clamp(기준 + Math.round((s.rowShift || 0) * 마지막), 앞한계, 마지막 - 1);
  let 눈낮춤 = 0;
  while (줄 > 1 && !설수있는(줄)) { 줄--; 눈낮춤++; }
  const sol = solveAt(줄);
  const 앞당김 = 마지막 - 1 - 줄;

  const { x, z, eye, fov, pitch, yaw, tanV, tanH, dzWall } = sol;
  const cam = [x, eye, z];

  // ── 시선점 ── 방향(방위각·내려본 각)은 그대로 두고, 점만 **무대 앞쪽**에 찍는다(§16).
  //   `aimMix` 가 0 이면 LED 벽, 1 이면 객석 첫 줄 쪽이다. 거리만 바뀌고 각도는 그대로다.
  const aimZ = led.depth + (aud.z0 - led.depth) * clamp(s.aimMix, 0, 1);
  let tDist = clamp(Math.abs(z - aimZ), 1.5, Math.max(1.5, dzWall));
  const maxDist = Math.tan(pitch) > 1e-6 ? (eye - WALL_MARGIN) / Math.tan(pitch) : tDist;
  tDist = Math.max(1.5, Math.min(tDist, maxDist));
  const targetY = Math.min(eye - eyeAboveTargetFor(tDist), eye - tDist * Math.tan(pitch));
  const target = [
    clamp(x + Math.sin(yaw) * tDist, WALL_MARGIN, Math.max(WALL_MARGIN, room.W - WALL_MARGIN)),
    clamp(targetY, 0.05, room.H - WALL_MARGIN),
    clamp(z + Math.cos(yaw) * tDist, WALL_MARGIN, Math.max(WALL_MARGIN, room.D - WALL_MARGIN)),
  ];

  const eCeil = Math.atan(Math.max(0, room.H - eye) / dzWall);
  const ceilingBand = +clamp((1 - Math.tan(eCeil + pitch) / tanV) / 2, 0, 1).toFixed(4);
  const down = pitch + fov * DEG / 2;
  const floorNear = down >= Math.PI / 2 - 1e-6 ? 0 : eye / Math.tan(Math.max(1e-6, down));
  // 앞줄 좌석 등받이(0.96m)와 맨 뒷줄이 화면에 남는지 — **그림을 대신하지는 않는다.**
  //   최종 판정은 렌더러 실측이다. 여기서는 회귀로 잡을 관측치를 남긴다.
  const 줄점 = (z0, z1, h) => sampleShare(topSamples([{ x0: aud.x0, x1: aud.x1, z0, z1 }], h),
    cam, yaw, pitch, tanH, tanV);

  return Object.freeze({
    position: [+x.toFixed(4), +eye.toFixed(4), +z.toFixed(4)],
    target: target.map(v => +v.toFixed(4)),
    fov: +fov.toFixed(3),
    eye,
    pitchDeg: +(pitch / DEG).toFixed(3),
    yawDeg: +(yaw / DEG).toFixed(3),
    ceilingBand,
    floorNear: +floorNear.toFixed(4),
    ledFullyVisible: sol.whole,
    ledScreenShare: +sol.share.toFixed(4),
    ledVisibleShare: +sol.visible.toFixed(4),
    stageAimZ: +aimZ.toFixed(4),
    frontRowShare: 줄점(aud.z0, aud.z0 + pitchZ, 0.96),
    houseShare: 줄점(aud.z0, z, 0.96),
    // ── 정책 관측치 ── 몇 번째 줄 뒤에 섰는지, 단이 얼마나 되는지, 앞으로 몇 줄 나왔는지.
    row: sol.row,
    rows: rows.length,
    riserAtStand: +단높이(z).toFixed(4),
    standEye: +standEye.toFixed(4),
    advanced: 앞당김,
    loweredTier: 눈낮춤,
    rowsAhead: sol.row,
    rowsBehind: 마지막 - sol.row,
    rearClearance: +(aud.z1 - z).toFixed(4),
    wallClearance: +Math.min(x, room.W - x, room.D - z, z).toFixed(4),
  });
}
