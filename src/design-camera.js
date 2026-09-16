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

import { roomDesign, isPlanned } from './room-design.js?v=413';

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
  const s = CAMERA_PLANS[preset];
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
  const targetY0 = Math.min(ledCenterY - s.drop, eye - eyeAboveTargetFor(dz));
  const targetY = clamp(targetY0, WALL_MARGIN, room.H - WALL_MARGIN);

  // 화각 — 기준값에서 출발해 **두 가지 필요분**만큼만 넓힌다. 둘 다 상한(46°)에서 멈춘다(§15).
  //   ① LED 윗변이 화면 위로 잘리지 않을 만큼(시선을 내렸으므로 위쪽을 더 담아야 한다)
  //   ② 아주 넓은 LED의 좌우가 잘리지 않을 만큼 — 카메라는 이미 뒷벽이라 물러날 자리가 없다
  let fov = clamp(s.fov, CORPORATE_FOV_RANGE.min, CORPORATE_FOV_RANGE.max);
  const margin = Math.min(0.35, led.h * LED_TOP_MARGIN_RATIO);   // LED 윗변과 화면 가장자리 사이 여유
  const needVTop = 2 * Math.atan(Math.max(0, ledTop + margin - targetY) / dz) / DEG;
  const needHalfW = led.w / 2 + Math.min(0.25, led.w * 0.04);
  const needHWide = 2 * Math.atan(needHalfW / dz) / DEG;
  const needVWide = 2 * Math.atan(Math.tan(needHWide * DEG / 2) / a) / DEG;
  fov = clamp(Math.max(fov, needVTop, needVWide), CORPORATE_FOV_RANGE.min, CORPORATE_FOV_RANGE.max);
  const halfV = dz * Math.tan(fov * DEG / 2);

  return Object.freeze({
    position: [x, eye, z],
    target: [cx, targetY, led.depth],
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
    fovCapped: fov >= CORPORATE_FOV_RANGE.max - 1e-9,
  });
}

/**
 * 디자인·시점에 맞는 카메라. 디자인이 정하지 않았거나 다루지 않는 시점이면 **null**.
 * 렌더러는 null을 받으면 기존 계산(presetPose)을 그대로 쓴다.
 */
export function cameraPlanForDesign(designId, presetId, model, aspect = 16 / 9) {
  const id = corporateCameraPlanId(designId, presetId);
  if (!id || !model) return null;
  return corporateCameraPlan(model.room, model.led, id, aspect);
}

/** 이 디자인이 쓰는 시점 이름들(검증·디버깅용). 정하지 않았으면 빈 목록. */
export function corporateCameraPresets(designId) {
  return Object.freeze(CORPORATE_CAMERA_PRESETS.filter(p => corporateCameraPlanId(designId, p)));
}
