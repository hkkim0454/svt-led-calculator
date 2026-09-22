// control-av.js — 상황실 콘솔 AV(운용 모니터·키보드)의 **자리 계산**. (순수)
// ─────────────────────────────────────────────────────────────────────────────
// 대회의실의 `conference-av.js`와 같은 자리에 선 모듈이다. 하는 일은 딱 하나다 —
//   **이미 정해진 콘솔에서 AV 장비의 자리를 파생한다.**
//   · 콘솔 좌표·크기·회전·단 높이를 한 자리도 바꾸지 않는다(PHASE 5-b 결과 동결).
//   · 의자도 건드리지 않는다(PHASE 5-a 결과 동결).
//   · 장비의 **모양**은 여기서 정하지 않는다(furniture-assets.js).
//
// 왜 콘솔 안에 모니터를 박지 않는가 — 콘솔은 **가구**이고 모니터는 **AV 장비**다.
//   형상에 박아 두면 수량·기종·자리를 따로 정할 수 없고, 콘솔을 바꾸면 모니터도 같이 바뀐다.
//   (기존 `controlConsole`이 실제로 그랬고, PHASE 5-b 에서 떼어 냈다.)
//
// 좌표계는 room-presets.js와 같다(단위 mm).
//   rotY = 0 이면 LED 벽(-Z)을 바라본다. 콘솔도 의자도 같은 규칙이다.
//   따라서 콘솔의 **운용자 쪽은 +Z**이고, 모니터 화면은 그쪽을 바라봐야 한다.
// ─────────────────────────────────────────────────────────────────────────────

import { FURNITURE_CONTRACTS } from './furniture-contracts.js?v=446';
import { panelSize } from './monitors.js?v=446';

const DEG = Math.PI / 180;

// ── 곡선 상판의 단 하나의 기준식 ────────────────────────────────────────────
// 상판 곡선을 **두 곳에 다르게 적지 않는다.** 도형(geometry-gl)과 자리 계산(여기)이
//   조금이라도 다른 식을 쓰면, 화면에서는 상판 위에 있는데 검사에서는 밖이라고 나온다.
//   그래서 식은 여기 하나뿐이고, 도형 쪽이 이것을 가져다 쓴다.

/** 띠(책상면)가 이보다 얇아지면 앉아서 쓸 수 없는 선반이 된다 — 휨을 그만큼만 준다. */
export const CONSOLE_MIN_BAND_DEPTH = 520;

/** 그 깊이에서 실제로 쓸 수 있는 휨(mm). 배치가 주는 900mm 에서는 계약값 그대로다. */
export function consoleSag(d) {
  const C = FURNITURE_CONTRACTS.curvedConsole.dimensions;
  return Math.min(C.curveSagitta, Math.max(0, d - CONSOLE_MIN_BAND_DEPTH));
}

/** 가운데가 가장 깊은 포물선. t ∈ [0,1] 이 폭을 왼쪽 끝에서 오른쪽 끝까지 훑는다. */
export function consoleCurve(t, sag) {
  return sag * (1 - (2 * t - 1) ** 2);
}

/**
 * 콘솔 **로컬 좌표**에서 운용자 쪽(+Z) 상판 모서리의 z.
 * 날개(양 끝)가 가장 앞이고 가운데가 물러난다 — 운용자를 감싸는 방향(오너 승인, PHASE 5-b).
 */
export function consoleFrontEdgeZ(localX, w, d, sag = consoleSag(d)) {
  const t = (localX + w / 2) / w;
  if (!(t >= 0 && t <= 1)) return -Infinity;      // 상판 폭 밖이면 받쳐 주는 면이 없다
  return d / 2 - consoleCurve(t, sag);
}

/** 콘솔 로컬 좌표에서 LED 쪽(−Z) 상판 모서리의 z. 앞 모서리와 나란히 휜다. */
export function consoleRearEdgeZ(localX, w, d, sag = consoleSag(d)) {
  const front = consoleFrontEdgeZ(localX, w, d, sag);
  return front === -Infinity ? Infinity : front - (d - sag);
}

/** 그 로컬 좌표(x, z)가 상판 위에 **온전히** 얹혀 있는가. */
export function onConsoleTop(localX, localZ, w, d, sag = consoleSag(d)) {
  const front = consoleFrontEdgeZ(localX, w, d, sag);
  if (front === -Infinity) return false;
  return localZ <= front && localZ >= consoleRearEdgeZ(localX, w, d, sag);
}

// ── 장비 크기 ───────────────────────────────────────────────────────────────

/** 운용 모니터의 실제 크기 — 인치 환산은 기존 `panelSize()` 하나만 쓴다. */
export function consoleMonitorSize() {
  const C = FURNITURE_CONTRACTS.consoleMonitor.dimensions;
  const p = panelSize(C.nominalInches);
  return Object.freeze({
    screenW: p.w, screenH: p.h, panelW: p.panelW, panelH: p.panelH,
    depth: C.depth, standH: C.standH, tiltDeg: C.tiltDeg,
  });
}

/** 키보드의 실제 크기 — 계약이 그대로 치수다(인치 환산이 없는 물건). */
export function keyboardSize() {
  const C = FURNITURE_CONTRACTS.keyboard.dimensions;
  return Object.freeze({ w: C.w, d: C.d, h: C.h });
}

// ── V1 배치 규칙 ────────────────────────────────────────────────────────────
// 콘솔 한 대에 **모니터 2대 + 키보드 1개**. V1에서는 개수 선택칸을 만들지 않는다
//   (계약의 `monitorRow: 2` 와 같은 값이다). 개수는 **콘솔에서 저절로 파생된다** —
//   방이 작아 콘솔이 줄면 AV도 같이 준다. 떠 있는 장비가 생기지 않는다.
export const MONITORS_PER_CONSOLE = 2;
export const KEYBOARDS_PER_CONSOLE = 1;

/** 짝을 이룬 두 모니터의 중심 간 거리(mm). 본체(625.7)가 서로 닿지 않을 만큼만 벌린다. */
export const MONITOR_PAIR_SPAN = 680;
/** 모니터 중심의 로컬 z — 상판 **뒤쪽**(LED 쪽)에 둔다. 앞은 손 쓰는 자리로 비운다. */
export const MONITOR_LOCAL_Z = -180;
/** 키보드 앞면과 상판 앞 모서리 사이 여유(mm). 손목이 모서리에 걸리지 않을 만큼. */
export const KEYBOARD_EDGE_GAP = 40;

// rotY 가 가리키는 방향의 단위 벡터. rotY = 0 → (0, -1) = LED 쪽(-Z).
const facing = rotY => ({ dx: Math.sin(rotY * DEG), dz: -Math.cos(rotY * DEG) });

/** 콘솔 로컬 (dx, dz) → 월드 (x, z). rotY 만큼 돌려서 콘솔 자리에 얹는다. */
function toWorld(console_, dx, dz) {
  const r = (console_.rotY || 0) * DEG;
  const cos = Math.cos(r), sin = Math.sin(r);
  // rotY = 0 이면 그대로. 90°면 로컬 +X 가 월드 −Z 로 간다(faceTowards와 같은 규약).
  return {
    x: console_.x + dx * cos + dz * sin,
    z: console_.z - dx * sin + dz * cos,
  };
}

/**
 * 콘솔에서 AV 장비 자리를 파생한다.
 *
 * @param consoles 배치가 만든 콘솔들 [{x, z, y, rotY, w, d}] — **읽기만 한다.**
 * @returns {{monitors:Array, keyboards:Array, items:Array}}
 *   monitors : 콘솔 1대당 2대. 화면이 **운용자를 바라본다**(rotY = 콘솔 + 180°).
 *   keyboards: 콘솔 1대당 1개. 운용자 쪽 모서리 바로 안쪽, 좌우 치우침 0.
 */
export function controlAVItems({ consoles = [] } = {}) {
  const surfaceY = FURNITURE_CONTRACTS.curvedConsole.dimensions.surfaceY;
  const K = keyboardSize();
  const monitors = [], keyboards = [];
  for (const c of consoles) {
    if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.z)) continue;
    const w = c.w || 0, d = c.d || 0;
    if (!(w > 0 && d > 0)) continue;
    const rotY = ((c.rotY || 0) % 360 + 360) % 360;
    const baseY = (c.y || 0) + surfaceY;           // 콘솔이 올라앉은 단 높이를 그대로 물려받는다
    const sag = consoleSag(d);

    // ① 모니터 2대 — 좌우 대칭. 로컬 z 는 뒤쪽 고정이다.
    for (const sign of [-1, 1]) {
      const dx = sign * MONITOR_PAIR_SPAN / 2;
      const p = toWorld(c, dx, MONITOR_LOCAL_Z);
      monitors.push({
        type: 'monitor', asset: 'consoleMonitor',
        x: Math.round(p.x), z: Math.round(p.z), y: baseY,
        rotY: (rotY + 180) % 360,                  // 화면이 운용자(+Z)를 바라본다
      });
    }

    // ② 키보드 1개 — 가운데, 앞 모서리 바로 안쪽. 앞 모서리는 **가운데가 가장 물러난 곳**이라
    //    여기서 재면 좌우 어느 쪽보다 보수적이다(양옆은 상판이 더 앞까지 있다).
    const front = consoleFrontEdgeZ(0, w, d, sag);
    const p = toWorld(c, 0, front - KEYBOARD_EDGE_GAP - K.d / 2);
    keyboards.push({
      type: 'keyboard', asset: 'keyboard',
      x: Math.round(p.x), z: Math.round(p.z), y: baseY, rotY,
    });
  }
  return Object.freeze({
    monitors: Object.freeze(monitors),
    keyboards: Object.freeze(keyboards),
    items: Object.freeze([...monitors, ...keyboards]),
  });
}

export { facing as consoleFacing };
