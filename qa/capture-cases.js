// capture-cases.js — 시각 회귀로 찍는 컷 목록. (PHASE 8-0, DEC-133)
// ─────────────────────────────────────────────────────────────────────────────
// QA 전용 고정 자료다. 값은 **컷마다 빠짐없이** 적는다 — 앞 컷이 남긴 값을 물려받지 않는
//   것이 이 파일의 목적이기 때문이다. `ledBaseMm` 을 모든 컷에 적어 둔 까닭도 같다.
//
// 천장 3.0m 인 `training-compact` 는 일부러 남겨 둔다. 이 컷이 **LED 하단 높이를 자르는**
//   유일한 칸이라, 정규화가 빠지면 뒤따르는 컷이 전부 오염된다(PHASE 7-c 에서 실제로 그랬다).
// ─────────────────────────────────────────────────────────────────────────────
import { CANONICAL_DEFAULTS } from './capture-state.js';

const 기본 = { model: CANONICAL_DEFAULTS.model, ledBaseMm: 1000, ledWmm: 4000, ledHmm: 2300, mode: 'fill' };

// 방별 옵션도 **컷마다 적어 둔다.** 지금 값은 각 용도의 릴리스 기본값과 같지만, 적어 두는
//   것과 물려받는 것은 다르다 — 적어 두어야 앞 컷이나 제품 기본값이 바뀌어도 그림이
//   흔들리지 않고, 바뀌었다는 사실이 `assertState` 에서 드러난다.
const 회의실옵션 = Object.freeze({ tableShape: 'boat', seats: 12, credenza: true,
  sideMonitor: 'none', sideMonitorIn: '55', rug: true, plant: true });
// 대회의실만 상판 방향(`tableDir`) 조절칸을 내놓는다. 다른 회의실 디자인에는 그 칸이 없으므로
//   적어 두면 '요청했는데 없다'가 되어 확인 단계에서 걸린다.
const 대회의실옵션 = Object.freeze({ ...회의실옵션, tableDir: 'across' });
const 강의실옵션 = Object.freeze({ deskType: 'single', rows: 4, cols: 4, aisle: true, podium: true, plant: false });
const 상황실옵션 = Object.freeze({ consoleRows: 2, perRow: 4, tiers: 1, riserH: 200, tierStartRow: 0,
  backTable: true, plant: false });
// 강당은 줄 수·줄당 좌석 수·단 수가 **0 = 자동**이다(PHASE 9-b). 컷에도 제품 기본값
//   그대로 0 을 적어 둔다 — 자동으로 정해지는 구성이 곧 오너가 보는 화면이기 때문이다.
//   한 단 높이(riserH)만 크기별 기본값이 달라 인자로 받는다.
const 강당옵션 = (aisles, riserH) => Object.freeze({ rows: 0, seatsPerRow: 0, aisles,
  stage: true, stageStep: true, tiers: 0, riserH, tierStartRow: 0, occupancy: 0, plant: false });
const 아이디에이션옵션 = Object.freeze({ highTables: 1, stools: 4, collabTables: 2, lounge: true,
  mobileStand: true, rug: true, plant: true });

/** 동결된 다섯 공간 + 레거시 네 공간. 각 줄이 컷 하나다. */
export const CAPTURE_CASES = Object.freeze([
  // ── 동결된 릴리스 공간 ────────────────────────────────────────────────────
  { id: 'corporate-interior', roomType: 'meeting', design: 'corporateMeeting',
    widthMm: 10000, heightMm: 3500, depthMm: 10000, view: 'interior', options: 회의실옵션, ...기본 },
  { id: 'corporate-corner-l', roomType: 'meeting', design: 'corporateMeeting',
    widthMm: 10000, heightMm: 3500, depthMm: 10000, view: 'corner-l', options: 회의실옵션, ...기본 },
  { id: 'executive-interior', roomType: 'meeting', design: 'executiveBoardroom',
    widthMm: 12000, heightMm: 3600, depthMm: 10000, view: 'interior', options: 회의실옵션, ...기본 },
  { id: 'executive-iso', roomType: 'meeting', design: 'executiveBoardroom',
    widthMm: 12000, heightMm: 3600, depthMm: 10000, view: 'iso', options: 회의실옵션, ...기본 },
  { id: 'largeconf-interior', roomType: 'meeting', design: 'largeConference',
    widthMm: 14000, heightMm: 3800, depthMm: 10000, view: 'interior', options: 대회의실옵션, ...기본 },
  { id: 'largeconf-top', roomType: 'meeting', design: 'largeConference',
    widthMm: 14000, heightMm: 3800, depthMm: 10000, view: 'top', options: 대회의실옵션, ...기본 },
  { id: 'control-interior', roomType: 'control', design: 'controlRoom',
    widthMm: 16000, heightMm: 3900, depthMm: 14000, view: 'interior', options: 상황실옵션, ...기본 },
  { id: 'control-corner-r', roomType: 'control', design: 'controlRoom',
    widthMm: 16000, heightMm: 3900, depthMm: 14000, view: 'corner-r', options: 상황실옵션, ...기본 },

  // ── 교육장(PHASE 7 에서 릴리스) ───────────────────────────────────────────
  //   `training-compact` 는 천장이 낮아 LED 하단 높이가 잘리는 칸이다. 일부러 넣는다.
  { id: 'training-compact-interior', roomType: 'classroom', design: 'trainingRoom',
    widthMm: 8000, heightMm: 3000, depthMm: 7000, view: 'interior', options: 강의실옵션, ...기본 },
  { id: 'training-interior', roomType: 'classroom', design: 'trainingRoom',
    widthMm: 12000, heightMm: 3400, depthMm: 10000, view: 'interior', options: 강의실옵션, ...기본 },
  { id: 'training-corner-l', roomType: 'classroom', design: 'trainingRoom',
    widthMm: 12000, heightMm: 3400, depthMm: 10000, view: 'corner-l', options: 강의실옵션, ...기본 },
  { id: 'training-front', roomType: 'classroom', design: 'trainingRoom',
    widthMm: 12000, heightMm: 3400, depthMm: 10000, view: 'front', options: 강의실옵션, ...기본 },
  { id: 'training-top', roomType: 'classroom', design: 'trainingRoom',
    widthMm: 12000, heightMm: 3400, depthMm: 10000, view: 'top', options: 강의실옵션, ...기본 },

  // ── 강당(PHASE 9-b 에서 좌석·통로·단차 재설계) · 아이디에이션 ────────────
  { id: 'hall-s-interior', roomType: 'hall_s', design: null,
    widthMm: 10000, heightMm: 4000, depthMm: 12000, view: 'interior', options: 강당옵션('1', 200), ...기본 },
  { id: 'hall-m-interior', roomType: 'hall_m', design: null,
    widthMm: 18000, heightMm: 6000, depthMm: 20000, view: 'interior', options: 강당옵션('2', 220), ...기본 },
  // 좌석이 많은 시점 — 인스턴싱·그림자가 가장 많이 걸리는 칸이다.
  { id: 'hall-l-interior', roomType: 'hall_l', design: null,
    widthMm: 24000, heightMm: 8000, depthMm: 28000, view: 'interior', options: 강당옵션('2', 250), ...기본 },
  { id: 'hall-l-iso', roomType: 'hall_l', design: null,
    widthMm: 24000, heightMm: 8000, depthMm: 28000, view: 'iso', options: 강당옵션('2', 250), ...기본 },
  { id: 'ideation-interior', roomType: 'ideation', design: null,
    widthMm: 9000, heightMm: 3200, depthMm: 8000, view: 'interior', options: 아이디에이션옵션, ...기본 },
  { id: 'ideation-corner-l', roomType: 'ideation', design: null,
    widthMm: 9000, heightMm: 3200, depthMm: 8000, view: 'corner-l', options: 아이디에이션옵션, ...기본 },
].map(Object.freeze));

/** 순서 뒤집기·섞기에 쓰는 컷 이름들. */
export const CAPTURE_IDS = Object.freeze(CAPTURE_CASES.map(c => c.id));

/** 이름으로 컷을 찾는다. */
export function caseById(id) {
  return CAPTURE_CASES.find(c => c.id === id) || null;
}
