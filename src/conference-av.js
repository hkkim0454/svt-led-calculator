// conference-av.js — 대회의실 AV 장비(개인 모니터·중앙 프롬프터)의 **자리 계산**. (순수)
// ─────────────────────────────────────────────────────────────────────────────
// 여기서 하는 일은 딱 하나다 — **이미 정해진 좌석과 테이블에서 AV 장비의 자리를 파생한다.**
//   · 좌석 좌표·방향을 한 자리도 바꾸지 않는다(PHASE 4-a·4-b 결과 동결).
//   · 테이블 좌표·크기를 한 자리도 바꾸지 않는다.
//   · 장비의 **모양**은 여기서 정하지 않는다(furniture-assets.js).
//
// 좌표계는 room-presets.js와 같다(단위 mm).
//   rotY = 0 이면 LED 벽(-Z)을 바라본다. 의자도 가구도 같은 규칙이다.
// ─────────────────────────────────────────────────────────────────────────────

import { FURNITURE_CONTRACTS } from './furniture-contracts.js?v=455';
import { panelSize } from './monitors.js?v=455';

const DEG = Math.PI / 180;

/** 상판 모서리 ~ 모니터 받침 **중심** 거리(mm). 앞쪽 150mm는 서류·키보드 자리로 비워 둔다. */
export const MONITOR_EDGE_INSET = 250;
/** 뒤 상판 안쪽면 ~ 프롬프터 중심 거리(mm). 상석에서 읽을 수 있는 거리에 둔다. */
export const PROMPTER_HEADER_GAP = 1200;
/**
 * 프롬프터를 바닥에서 들어 올리는 높이(mm) — **이 자산만의 값**이다.
 * 계약은 화면 크기(22")·기울기(22°)·받침 높이(90)만 정하고, 바닥에 세우는 기둥 높이는
 * 정하지 않았다(오너 지침 §15). 화면 윗변이 약 950mm에 오도록 잡았다 —
 * 앉은 사람 눈높이(≈1,200)보다 낮아 **LED 시선을 가로막지 않는다**(§14).
 */
export const PROMPTER_FLOOR_RISE = 560;

/** 개인 모니터의 실제 크기 — 인치 환산은 기존 `panelSize()` 하나만 쓴다(공식을 두 곳에 적지 않는다). */
export function personalMonitorSize() {
  const C = FURNITURE_CONTRACTS.personalMonitor.dimensions;
  const p = panelSize(C.nominalInches);
  return Object.freeze({
    screenW: p.w, screenH: p.h, panelW: p.panelW, panelH: p.panelH,
    depth: C.depth, standH: C.standH, tiltDeg: C.tiltDeg,
  });
}

/** 중앙 프롬프터의 실제 크기 — 같은 `panelSize()`를 쓴다. */
export function prompterSize() {
  const C = FURNITURE_CONTRACTS.prompter.dimensions;
  const p = panelSize(C.nominalInches);
  return Object.freeze({
    screenW: p.w, screenH: p.h, panelW: p.panelW, panelH: p.panelH,
    depth: C.depth, standH: C.standH, tiltDeg: C.tiltDeg,
  });
}

// rotY 가 가리키는 방향의 단위 벡터. rotY = 0 → (0, -1) = LED 쪽(-Z).
//   room-presets의 faceTowards(atan2(dx, -dz))와 **정확히 짝을 이룬다.**
const facing = rotY => ({ dx: Math.sin(rotY * DEG), dz: -Math.cos(rotY * DEG) });

/**
 * 좌석과 U 테이블에서 AV 장비 자리를 파생한다.
 *
 * @param chairs      배치가 만든 의자들 [{x, z, rotY}] — **읽기만 한다.**
 * @param table       U 테이블 테두리 { cx, cz, outerW, outerD, segW } (mm)
 * @param chairClear  상판 모서리 ~ 의자 중심 거리(mm). 배치가 쓰는 값을 그대로 받는다.
 * @returns {{monitors:Array, prompter:object|null, items:Array}}
 *   monitors : 좌석 1개당 1대. 화면이 **그 의자를 바라본다**(rotY = 의자 + 180°).
 *   prompter : U자 가운데, 좌우 치우침 0. 상석(뒤 상판) 쪽을 바라본다.
 */
export function conferenceAVItems({ chairs = [], table = null, chairClear = 650 } = {}) {
  const surfaceY = FURNITURE_CONTRACTS.largeUTable.dimensions.surfaceY;
  const monitors = [];
  for (const ch of chairs) {
    if (!ch || !Number.isFinite(ch.x) || !Number.isFinite(ch.z)) continue;
    const rotY = ((ch.rotY || 0) % 360 + 360) % 360;
    const f = facing(rotY);
    // 의자에서 **바라보는 방향으로** 상판 모서리(chairClear)를 지나 안쪽으로 조금 더 들어간다.
    const reach = chairClear + MONITOR_EDGE_INSET;
    monitors.push({
      type: 'monitor', asset: 'personalMonitor',
      x: Math.round(ch.x + f.dx * reach),
      z: Math.round(ch.z + f.dz * reach),
      y: surfaceY,                       // 상판 **위에** 놓인다(바닥이 아니다)
      rotY: (rotY + 180) % 360,          // 화면이 그 의자를 바라본다
    });
  }

  let prompter = null;
  if (table && table.outerD > 0 && table.segW > 0) {
    // 가로 상판 안쪽면에서 일정 거리 앞. **가운데 축에서 치우치지 않는다**(오너 지침 §14).
    //   세로 배치(테이블 방향 옵션)면 그 상판이 옆벽에 서 있으므로 기준 축만 바뀐다 —
    //   거리·높이·바라보는 대상(상석)은 똑같다.
    const along = table.dir === 'along';
    const innerEdge = along
      ? table.cx + table.outerW / 2 - table.segW     // 세로: 가로 상판이 +X 쪽에 있다
      : table.cz + table.outerD / 2 - table.segW;    // 가로: 가로 상판이 +Z(뒤) 쪽에 있다
    const set = Math.round(innerEdge - PROMPTER_HEADER_GAP);
    prompter = {
      type: 'prompter', asset: 'prompter',
      x: along ? set : Math.round(table.cx),
      z: along ? Math.round(table.cz) : set,
      y: 0,                              // 바닥에 선다(U자 가운데에는 상판이 없다)
      rotY: along ? 90 : 180,            // 상석(가로 상판) 쪽을 바라본다
    };
  }
  return Object.freeze({
    monitors: Object.freeze(monitors),
    prompter,
    items: Object.freeze(prompter ? [...monitors, prompter] : [...monitors]),
  });
}
