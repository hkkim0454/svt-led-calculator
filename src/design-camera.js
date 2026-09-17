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

import { roomDesign, isPlanned } from './room-design.js?v=426';

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
