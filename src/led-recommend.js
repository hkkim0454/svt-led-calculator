// led-recommend.js — ② LED 설치 크기의 '권장 크기' 계산 (PHASE 11-c, Recommendation V1). 순수 함수, DOM 없음.
// ─────────────────────────────────────────────────────────────────────────────
// 무엇을 하나
//   방 크기와 가장 먼 시청자 거리로 '이 방에 어울리는 LED 요청 크기'를 **제안**한다.
//   ② 칸의 값을 바꾸지 않는다 — 사람이 '권장 크기 적용'을 눌렀을 때만 화면이 칸에 넣는다.
//
// 규칙(PHASE 11-b 감사, 오너 승인)
//   강당 셋   기존 auditoriumLedSize 를 **그대로** 쓴다(공식·값·계약 무변경).
//   그 밖     이상 높이 = max(가장 먼 시청자 ÷ bdm, 벽 폭 × ratio × 9/16), 이상 폭 = 높이 × 16/9
//             → 쓸 수 있는 폭·높이 안으로 자른다(16:9 유지) → 100 mm 단위 → 제품 기본값이 하한.
//   쓸 수 있는 폭   = 벽 폭 − 좌우 여유×2 + 구조틀 여백×2
//   쓸 수 있는 높이 = 벽 높이 − 하단 높이 − 위쪽 여유 + 구조틀 여백×2
//     구조틀 여백을 더하는 까닭: 엔진이 요청값에서 그만큼을 빼고 캐비닛을 채우므로, 실제 화면은
//     요청값보다 작다. 더하지 않으면 실제로는 들어가는 한 단(예: 천장 3.6m 의 5×5)을 놓친다.
//
// 이 파일은 **모델과 무관한 물리 크기**만 정한다. 캐비닛 맞춤(실제 설치 크기)은 engine.js 가 한다.
//   여기서 캐비닛 단위로 맞추지(snap) 않는다.
// ─────────────────────────────────────────────────────────────────────────────
import { auditoriumLedSize, AUDITORIUM_LED_TOP_CLEAR } from './room-presets.js?v=481';
import { LED_REQUEST_DEFAULT } from './led-request.js?v=481';

/**
 * 용도별 계수 — 한 곳에만 둔다. V1 에서는 넷 다 같지만, V2 에서 공간별로 고칠 수 있게 표로 남긴다.
 *   ratio : 벽 폭 대비 화면 폭(요청값 기준). 승인된 공간·강당의 실제 벽 폭 27~32% 에서 나온 값이다.
 *   bdm   : 가장 먼 시청자 ÷ 화면 높이의 권장 상한. 엔진의 BDM 2.5%(세로 × 5)와 같다.
 */
export const RECOMMEND_PARAMS = Object.freeze({
  meeting: Object.freeze({ ratio: 0.30, bdm: 5 }),
  control: Object.freeze({ ratio: 0.30, bdm: 5 }),
  classroom: Object.freeze({ ratio: 0.30, bdm: 5 }),
  ideation: Object.freeze({ ratio: 0.30, bdm: 5 }),
});

/** 좌우 한쪽에 남기는 최소 여유(mm). 소강당 무대 규칙(minSideMargin)과 같은 값이다. */
export const RECOMMEND_SIDE_MARGIN = 800;
/** LED 위쪽으로 남기는 최소 여유(mm). 강당과 같은 상수를 쓴다. */
export const RECOMMEND_TOP_CLEAR = AUDITORIUM_LED_TOP_CLEAR;
/** 가독성 한계 — 가장 먼 시청자가 화면 높이의 이 배수를 넘으면 경고한다(엔진의 BDM 3% 최대 = 세로 × 6). */
export const READABILITY_LIMIT = 6;
/** 구조틀 여백을 모를 때 쓰는 값(mm). MP·MM 시리즈의 한 변 여백과 같다. */
const DEFAULT_FRAME_CLEARANCE = 50;

const HALLS = Object.freeze(['hall_s', 'hall_m', 'hall_l']);

/** 의자·객석·스툴·라운지 — 화면을 보는 자리로 치는 배치 항목. */
const VIEWER_ITEM_TYPES = Object.freeze(['chair', 'seat', 'stool', 'lounge']);

/**
 * 배치 결과에서 LED 벽으로부터 가장 먼 시청 자리까지의 거리(mm). 자리가 없으면 0.
 * @param {{items?:Array<{type:string,z:number}>}|null} layout layoutRoom 결과
 */
export function farthestViewerMm(layout) {
  const items = layout && Array.isArray(layout.items) ? layout.items : [];
  let far = 0;
  for (const it of items) {
    if (VIEWER_ITEM_TYPES.includes(it.type) && Number.isFinite(it.z) && it.z > far) far = it.z;
  }
  return far;
}

/**
 * 가독성 판정. 가장 먼 시청자 ÷ 화면 높이가 한계(6)를 넘으면 'below'.
 *   화면 높이는 보통 엔진이 맞춘 **실제 높이**를 넘긴다. 둘 중 하나라도 없으면 'unknown'.
 */
export function ledReadability(farViewerMm, heightMm) {
  const far = Number(farViewerMm) || 0, h = Number(heightMm) || 0;
  if (!(far > 0) || !(h > 0)) return { farViewerMm: far, threshold: READABILITY_LIMIT, ratio: null, status: 'unknown' };
  const ratio = far / h;
  return { farViewerMm: far, threshold: READABILITY_LIMIT, ratio, status: ratio > READABILITY_LIMIT ? 'below' : 'ok' };
}

/** 100 mm 단위로 반올림하되, 한계를 넘으면 한계 아래 100 mm 단위로 내린다. */
function round100Within(v, max) {
  const r = Math.max(100, Math.round(v / 100) * 100);
  return r <= max ? r : Math.max(100, Math.floor(max / 100) * 100);
}

/**
 * 권장 LED 요청 크기.
 * @param {object} p
 * @param {string} p.roomTypeId   용도(meeting·control·classroom·ideation·hall_s·hall_m·hall_l)
 * @param {string} [p.designId]   공간 디자인 — V1 에서는 쓰지 않는다(V2 에서 공간별 계수용)
 * @param {{W:number,H:number,D?:number,ledBottom?:number}} p.room  mm. ledBottom 은 읽기만 한다
 * @param {number} [p.farViewerMm]      가장 먼 시청 자리(farthestViewerMm). 강당이면 마지막 줄 위치로 쓴다
 * @param {number} [p.frameClearanceMm] 선택한 모델 시리즈의 한 변 구조틀 여백(engine.frameClearanceMm)
 * @returns {{w:number,h:number,ideal:{w:number,h:number}|null,basis:string,capped:string[],
 *   readability:{farViewerMm:number,threshold:number,ratio:number|null,status:string}}|null}
 *   알 수 없는 용도이거나 방 크기가 없으면 null.
 */
export function recommendLedSize({ roomTypeId, designId, room, farViewerMm = 0, frameClearanceMm } = {}) {
  void designId;
  const W = Number(room && room.W) || 0, H = Number(room && room.H) || 0;
  const D = Number(room && room.D) || 0;
  const base = Math.max(0, Number(room && room.ledBottom) || 0);
  const far = Math.max(0, Number(farViewerMm) || 0);
  if (!(W > 0) || !(H > 0)) return null;

  // 강당 — 기존 규칙을 그대로 부른다. 계산 흐름을 합치지 않는다(PHASE 11-c 지침).
  if (HALLS.includes(roomTypeId)) {
    const s = auditoriumLedSize(roomTypeId, { W, H, D, ledBottom: base, lastRowZ: far });
    if (!s) return null;
    return { w: s.w, h: s.h, ideal: null, basis: 'auditorium', capped: [], readability: ledReadability(far, s.h) };
  }

  const P = RECOMMEND_PARAMS[roomTypeId];
  if (!P) return null;
  const clr = Number.isFinite(frameClearanceMm) && frameClearanceMm >= 0 ? frameClearanceMm : DEFAULT_FRAME_CLEARANCE;

  const hRead = far > 0 ? far / P.bdm : 0;
  const hPres = W * P.ratio * (9 / 16);
  let h = Math.max(hRead, hPres);
  let w = h * (16 / 9);
  const basis = hRead > hPres ? 'readability' : 'presence';
  const ideal = { w: Math.round(w), h: Math.round(h) };

  const maxW = Math.max(1000, W - RECOMMEND_SIDE_MARGIN * 2 + clr * 2);
  const maxH = Math.max(600, H - base - RECOMMEND_TOP_CLEAR + clr * 2);
  const capped = [];
  if (w > maxW) { w = maxW; h = w * (9 / 16); capped.push('width'); }
  if (h > maxH) { h = maxH; w = h * (16 / 9); capped.push('ceiling'); }
  const size = { w: round100Within(w, maxW), h: round100Within(h, maxH) };

  // 제품 기본값(4,000×2,300)보다 작게 제안하지 않는다 — 강당 규칙과 같은 하한이다.
  //   방이 그보다 작으면 실제 맞춤 결과가 벽을 넘는지는 화면의 기존 경고(ledFitProblem)가 알린다.
  const floor = LED_REQUEST_DEFAULT;
  const floored = size.w <= floor.w || size.h <= floor.h;
  const out = floored ? { w: floor.w, h: floor.h } : size;
  return {
    w: out.w, h: out.h, ideal,
    basis: floored ? 'default-floor' : basis,
    capped,
    readability: ledReadability(far, out.h),
  };
}

// ── 화면 표시 규칙 (PHASE 11-d) ──────────────────────────────────────────────
// ② 칸 아래 상자가 무엇을 보여 주고 어느 버튼을 켤지 — 상태 네 가지(자동/직접 × 권장과 같음/다름)만 본다.
//   '자동으로 되돌리기'는 **권장 크기가 아니라 자동값**(강당 권장값 · 그 밖 4,000×2,300)으로 돌아간다.
//   그래서 두 버튼은 늘 따로 있고, 하나가 다른 하나를 대신하지 않는다.

/** 상태 이름(저장값)을 화면 말로. */
export const LED_MODE_LABEL = Object.freeze({ auto: '자동', manual: '직접 입력' });

/** 쓸 수 있는 폭·높이에 걸려 줄인 이유를 사람 말로. 하한·강당이면 보이지 않는다. */
export function recommendationCapNote(rec) {
  if (!rec || rec.basis === 'default-floor' || rec.basis === 'auditorium') return '';
  const c = Array.isArray(rec.capped) ? rec.capped : [];
  if (c.includes('width') && c.includes('ceiling')) return '벽 폭과 천장 높이에 맞춰 줄인 값입니다';
  if (c.includes('ceiling')) return '천장 높이(하단 높이 포함)에 맞춰 줄인 값입니다';
  if (c.includes('width')) return '벽 폭(좌우 여유 포함)에 맞춰 줄인 값입니다';
  return '';
}

/**
 * 권장 상자의 버튼·문구 상태. 순수 함수.
 * @param {{mode:'auto'|'manual', current:{w:number,h:number}, rec:object|null, actualH?:number}} p
 *   actualH: 권장값을 적용했을 때 엔진이 맞춘 실제 화면 높이(mm). 가독성 판정에 쓴다.
 * @returns {{modeLabel:string, same:boolean, applyEnabled:boolean, applyText:string,
 *   restoreEnabled:boolean, capNote:string, warn:boolean, readability:object|null}}
 */
export function recommendationUiState({ mode, current, rec, actualH } = {}) {
  const m = mode === 'manual' ? 'manual' : 'auto';
  const same = !!rec && !!current && Number(current.w) === rec.w && Number(current.h) === rec.h;
  const applyText = !rec ? '권장 크기 적용'
    : same ? (m === 'auto' ? '현재 권장값 사용 중' : '권장값 적용됨') : '권장 크기 적용';
  const capNote = recommendationCapNote(rec);
  const readability = rec ? ledReadability(rec.readability && rec.readability.farViewerMm, actualH) : null;
  // 경고는 최소한으로: 물리 한계 때문에 더 키울 수 없는데도 가장 먼 자리가 기준(6배)을 넘을 때만. 강당은 범위 밖.
  const warn = !!rec && rec.basis !== 'auditorium' && rec.basis !== 'default-floor'
    && Array.isArray(rec.capped) && rec.capped.length > 0 && !!readability && readability.status === 'below';
  return {
    modeLabel: LED_MODE_LABEL[m], same,
    applyEnabled: !!rec && !same, applyText,
    restoreEnabled: m === 'manual',
    capNote, warn, readability,
  };
}
