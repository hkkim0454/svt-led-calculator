// model-recommend.js — LED 모델 · 픽셀 피치 추천 엔진 (PHASE 12-a, Model/Pitch Recommendation V2). 순수 함수, DOM 없음.
// ─────────────────────────────────────────────────────────────────────────────
// 무엇을 하나
//   V1 이 정한 **요청 크기**(② 권장 크기)를 그대로 두고, 그 크기에 어울리는 LED 모델 · 피치를 **제안**한다.
//   현재 선택 모델을 바꾸지 않는다. 화면 · 저장 상태를 건드리지 않는다. 결과는 평범한 객체다.
//
// 오너 정책(PHASE 12-0.1 승인, DEC-197)
//   · 근거리 안전 = 가장 가까운 시청자 ≥ 피치(mm) × K 미터, K = 2.5(기본).
//     K = 3.44(1분각, 보수적 품질 기준)는 설명용 정보로만 함께 낸다 — 기본 추천을 이 값으로 고르지 않는다.
//   · 모델의 `ovd_m` 은 쓰지 않는다(의미가 정의되지 않음 · 문서 명칭 불일치 · 일부 값은 복사한 수기값).
//   · 가장 먼 시청자 · 해상도 · 가격은 순위에 쓰지 않는다. 해상도는 설명값으로만 돌려준다.
//   · 강당은 초기 범위 밖(OUT_OF_V2_INITIAL_SCOPE). 안전한 후보가 없으면 억지로 고르지 않는다(NO_SAFE_CANDIDATE).
//   · 공간의 격(임원실 등)으로 가중하지 않는다 — 기하만 본다.
//
// 순서
//   필수 조건  ① 추천 대상 제품 ② 판매 · 사용 가능 ③ 배열 성립 ④ 실제 크기가 벽 · 천장 안 ⑤ 근거리 안전
//   순위       맞춤 효율(실제 ÷ 요청 면적)이 하한(70%) 이상인 후보 먼저
//              → S-Box 적은 순 → 캐비닛 적은 순 → 맞춤 효율 높은 순 → 굵은 피치
//              → (결정성용) 검증된 데이터 먼저 → 모델 id 사전순. 카탈로그 배열 순서는 결과에 영향이 없다.
//   경고       추천 모델의 면적 손실이 30% 이상이면 FIT_LOSS_WARNING. 요청 크기는 절대 고치지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
import { computeConfig } from './engine.js?v=497';
import { ledFitProblem } from './led-request.js?v=497';

/** 기본 근거리 상수(m / 피치 mm). 가장 가까운 시청자 ≥ 피치 × 2.5 m 이면 적합. */
export const NEAR_VIEW_K = 2.5;
/** 보수적 품질 기준(1분각: 피치가 시야에서 1′ 이하가 되는 거리). 설명 · 향후 프리미엄 옵션용. */
export const PREMIUM_NEAR_VIEW_K = 1 / Math.tan(Math.PI / 180 / 60) / 1000;   // ≈ 3.4377
/** 맞춤 효율 하한 — 이 이상이면 '받아들일 만한 맞춤' 묶음에 든다. */
export const FIT_FLOOR = 0.70;
/** 면적 손실이 이 비율 이상이면 경고한다. */
export const FIT_LOSS_WARN = 0.30;
/** 판매 범위(app.js 의 MIN_PITCH · MAX_PITCH 와 같은 값). */
export const SALE_PITCH_MIN = 0.8;
export const SALE_PITCH_MAX = 1.8;
/** 초기 V2 범위 — 강당(hall_s · hall_m · hall_l)은 들지 않는다. */
export const V2_SCOPE = Object.freeze(['meeting', 'control', 'classroom', 'ideation']);
export const MAX_RANKED = 3;

export const STATUS = Object.freeze({
  RECOMMENDED: 'RECOMMENDED',
  NO_SAFE_CANDIDATE: 'NO_SAFE_CANDIDATE',
  OUT_OF_V2_INITIAL_SCOPE: 'OUT_OF_V2_INITIAL_SCOPE',
});
export const REASON = Object.freeze({
  NEAR_VIEW_SAFE: 'NEAR_VIEW_SAFE',
  PREMIUM_NEAR_VIEW: 'PREMIUM_NEAR_VIEW',
  LOW_SYSTEM_COMPLEXITY: 'LOW_SYSTEM_COMPLEXITY',
  BEST_FIT: 'BEST_FIT',
  NO_SAFE_CANDIDATE: 'NO_SAFE_CANDIDATE',
  NO_NEAREST_VIEWER: 'NO_NEAREST_VIEWER',
  OUT_OF_SCOPE: 'OUT_OF_SCOPE',
});
export const WARNING = Object.freeze({
  FIT_LOSS_WARNING: 'FIT_LOSS_WARNING',
  FIT_BELOW_FLOOR: 'FIT_BELOW_FLOOR',
});
/** 필수 조건에서 떨어진 이유. */
export const REJECT = Object.freeze({
  NOT_LED_PRODUCT: 'NOT_LED_PRODUCT',
  NOT_AVAILABLE: 'NOT_AVAILABLE',
  NO_ARRAY: 'NO_ARRAY',
  EXCEEDS_WALL: 'EXCEEDS_WALL',
  NEAR_VIEW_UNSAFE: 'NEAR_VIEW_UNSAFE',
});

const VIEWER_TYPES = Object.freeze(['chair', 'seat', 'stool', 'lounge']);
/** LED 를 향해 앉은 자리만 시청자로 보는 용도 — 강사석처럼 LED 를 등진 자리를 뺀다. */
const FACING_ONLY = Object.freeze(['classroom', 'control']);
const FACING_TOLERANCE_DEG = 60;

/** 0° = LED(−Z) 를 바라봄. 각도가 없으면 바라본다고 본다(모르는 값으로 자리를 빼지 않는다). */
function facesLed(item) {
  if (!Number.isFinite(item.rotY)) return true;
  const a = ((item.rotY % 360) + 360) % 360;
  return Math.min(a, 360 - a) <= FACING_TOLERANCE_DEG;
}

/**
 * 역할 기준(C)의 가장 가까운 시청자 거리(mm, LED 벽에서). 시청 자리가 없으면 0.
 *   교육장 · 상황실: LED 를 향해 앉은 자리만(강사석 제외 → 첫 학생 줄 · 앞 콘솔 운영자).
 *   회의실 · 아이디에이션: 실제로 쓰는 모든 자리(테이블 앞쪽 참석자 · 라운지 포함).
 * @param {{items?:Array<{type:string,z:number,rotY?:number}>}|null} layout layoutRoom 결과
 * @param {string} roomTypeId
 */
export function nearestViewerMm(layout, roomTypeId) {
  const items = layout && Array.isArray(layout.items) ? layout.items : [];
  const facingOnly = FACING_ONLY.includes(roomTypeId);
  let near = Infinity;
  for (const it of items) {
    if (!VIEWER_TYPES.includes(it.type) || !Number.isFinite(it.z) || it.z <= 0) continue;
    if (facingOnly && !facesLed(it)) continue;
    if (it.z < near) near = it.z;
  }
  return Number.isFinite(near) ? near : 0;
}

/** 판매 · 사용 가능한 모델인가(판매 범위 P0.8~1.8 · 단종 아님). */
export function isAvailableModel(m) {
  return !!m && Number.isFinite(m.pitch)
    && m.pitch >= SALE_PITCH_MIN - 1e-9 && m.pitch <= SALE_PITCH_MAX + 1e-9
    && m.lifecycle !== 'discontinued';
}
/** 추천 대상 제품(LED 캐비닛 모델)인가. */
function isLedProduct(m) {
  return !!m && typeof m.id === 'string' && Number(m.cabW) > 0 && Number(m.cabH) > 0 && Number(m.pitch) > 0;
}
/** 근거리 안전 — 가장 가까운 시청자(mm) ≥ 피치(mm) × K(m/mm) × 1000. */
export function nearViewSafe(nearMm, pitchMm, k = NEAR_VIEW_K) {
  return Number(nearMm) >= Number(pitchMm) * k * 1000;
}

/** 맞춤 효율이 하한 이상인가(받아들일 만한 맞춤). */
export function isAcceptableFit(eff) { return eff >= FIT_FLOOR; }
/** 면적 손실 경고 — 효율이 1 − 30% 이하(손실 30% 이상). */
export function isFitLossWarning(eff) { return eff <= 1 - FIT_LOSS_WARN; }

/** 후보 정렬 — 카탈로그 순서와 무관한 완전한 순서. */
function compareCandidates(a, b) {
  return (b.acceptableFit - a.acceptableFit)
    || (a.sbox - b.sbox)
    || (a.cabinets - b.cabinets)
    || (b.fitEfficiency - a.fitEfficiency)
    || (b.pitch - a.pitch)
    || ((b.dataStatus === 'verified') - (a.dataStatus === 'verified'))
    || (a.modelId < b.modelId ? -1 : a.modelId > b.modelId ? 1 : 0);
}

/**
 * 모델 · 피치 추천.
 * @param {object} p
 * @param {string} p.roomTypeId            meeting · control · classroom · ideation · hall_s · hall_m · hall_l
 * @param {number} p.nearestViewerMm       역할 기준 가장 가까운 시청자(nearestViewerMm)
 * @param {number} [p.farthestViewerMm]    받기만 하고 순위에 쓰지 않는다(V1 이 다룬다)
 * @param {{w:number,h:number}} p.requested V1 요청 크기(mm) — 읽기만 한다
 * @param {{W:number,H:number,ledBottom?:number}} p.room 벽 폭 · 높이 · 하단 높이(mm)
 * @param {Array<object>} p.catalog        LED 모델 목록(models.js 형식)
 * @returns {object} 평범한 결과 객체(STATUS · 추천 · 순위 · 이유 · 경고 · 탈락 이유)
 */
export function recommendModel({ roomTypeId, nearestViewerMm: near, farthestViewerMm: far, requested, room, catalog } = {}) {
  const req = { w: Number(requested && requested.w) || 0, h: Number(requested && requested.h) || 0 };
  const W = Number(room && room.W) || 0, H = Number(room && room.H) || 0;
  const base = Math.max(0, Number(room && room.ledBottom) || 0);
  const nearMm = Math.max(0, Number(near) || 0);
  const out = {
    status: STATUS.NO_SAFE_CANDIDATE, roomTypeId: roomTypeId ?? null,
    requested: { ...req }, nearestViewerMm: nearMm, farthestViewerMm: Number(far) || 0,
    pitchBand: { k: NEAR_VIEW_K, maxPitch: nearMm / NEAR_VIEW_K / 1000,
      premiumK: PREMIUM_NEAR_VIEW_K, premiumMaxPitch: nearMm / PREMIUM_NEAR_VIEW_K / 1000, recommendedPitch: null },
    recommended: null, ranked: [], reasons: [], warnings: [], rejected: [],
  };
  if (!V2_SCOPE.includes(roomTypeId)) {
    out.status = STATUS.OUT_OF_V2_INITIAL_SCOPE; out.reasons.push(REASON.OUT_OF_SCOPE);
    out.pitchBand.maxPitch = null; out.pitchBand.premiumMaxPitch = null;
    return out;
  }
  if (!(nearMm > 0)) { out.reasons.push(REASON.NO_NEAREST_VIEWER, REASON.NO_SAFE_CANDIDATE); return out; }

  const pass = [];
  for (const m of Array.isArray(catalog) ? catalog : []) {
    const id = m && m.id;
    if (!isLedProduct(m)) { out.rejected.push({ modelId: id ?? null, reason: REJECT.NOT_LED_PRODUCT }); continue; }
    if (!isAvailableModel(m)) { out.rejected.push({ modelId: id, reason: REJECT.NOT_AVAILABLE }); continue; }
    const r = (req.w > 0 && req.h > 0)
      ? computeConfig(m, W, H, { mode: 'ledsize', ledW: req.w, ledH: req.h, baseHeight: base }) : null;
    if (!r || !r.fits) { out.rejected.push({ modelId: id, reason: REJECT.NO_ARRAY }); continue; }
    if (!(W > 0) || !(H > 0) || ledFitProblem({ spaceW: W, spaceH: H, baseHeight: base, actualW: r.actualW, actualH: r.actualH })) {
      out.rejected.push({ modelId: id, reason: REJECT.EXCEEDS_WALL }); continue;
    }
    if (!nearViewSafe(nearMm, m.pitch)) { out.rejected.push({ modelId: id, reason: REJECT.NEAR_VIEW_UNSAFE }); continue; }
    const fitEfficiency = (r.actualW * r.actualH) / (req.w * req.h);
    pass.push({
      modelId: id, name: m.name ?? id, pitch: m.pitch, series: m.series ?? null, dataStatus: m.dataStatus ?? null,
      cols: r.cols, rows: r.rows, cabinets: r.total,
      actualW: r.actualW, actualH: r.actualH, resW: r.resW, resH: r.resH,
      fitEfficiency, widthEfficiency: r.actualW / req.w, heightEfficiency: r.actualH / req.h,
      acceptableFit: isAcceptableFit(fitEfficiency) ? 1 : 0,
      sbox: Number.isFinite(r.sbox) ? r.sbox : Infinity,
      premiumNearView: nearViewSafe(nearMm, m.pitch, PREMIUM_NEAR_VIEW_K),
    });
  }
  if (!pass.length) { out.reasons.push(REASON.NO_SAFE_CANDIDATE); return out; }

  pass.sort(compareCandidates);
  const top = pass[0];
  out.status = STATUS.RECOMMENDED;
  out.recommended = top;
  out.ranked = pass.slice(0, MAX_RANKED);
  out.pitchBand.recommendedPitch = top.pitch;
  out.reasons.push(REASON.NEAR_VIEW_SAFE);
  if (top.premiumNearView) out.reasons.push(REASON.PREMIUM_NEAR_VIEW);
  const pool = pass.filter(c => c.acceptableFit === top.acceptableFit);
  if (pool.every(c => top.sbox <= c.sbox && (c.sbox > top.sbox || top.cabinets <= c.cabinets))) out.reasons.push(REASON.LOW_SYSTEM_COMPLEXITY);
  if (pass.every(c => top.fitEfficiency >= c.fitEfficiency)) out.reasons.push(REASON.BEST_FIT);
  if (!top.acceptableFit) out.warnings.push(WARNING.FIT_BELOW_FLOOR);
  if (isFitLossWarning(top.fitEfficiency)) out.warnings.push(WARNING.FIT_LOSS_WARNING);
  return out;
}
