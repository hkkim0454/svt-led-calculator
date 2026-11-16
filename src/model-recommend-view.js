// model-recommend-view.js — 모델 · 픽셀 피치 추천(V2) 결과를 화면 문구로 바꾼다 (PHASE 12-c). 순수 함수, DOM 없음.
// ─────────────────────────────────────────────────────────────────────────────
// 추천 엔진(model-recommend.js)의 결과를 **그대로** 읽어 사람이 읽을 문장으로만 옮긴다.
//   · 엔진이 낸 이유 · 경고만 옮긴다 — 여기서 새 순위 근거를 지어내지 않는다.
//   · 안전한 후보가 없으면 모델을 보이지 않는다(차선 · 가까운 모델 · 현재 모델을 추천처럼 보이지 않는다).
//   · 해상도는 실제 숫자만 보인다(FHD · 4K 같은 이름을 붙이지 않는다).
//   · 제안만 한다 — 이 파일은 선택 모델 · ② 칸 · 상태를 모른다.
// ─────────────────────────────────────────────────────────────────────────────

export const MODEL_REC_STATE = Object.freeze({
  RECOMMENDED: 'recommended',
  NO_SAFE: 'no-safe',
  OUT_OF_SCOPE: 'out-of-scope',
  UNSUPPORTED: 'unsupported',
});

/** 엔진 이유 코드 → 화면 말. 엔진에 없는 코드는 보이지 않는다. */
export const REASON_TEXT = Object.freeze({
  NEAR_VIEW_SAFE: '가까운 시청 거리 기준 충족',
  PREMIUM_NEAR_VIEW: '보수적 근거리 기준도 충족',
  LOW_SYSTEM_COMPLEXITY: '시스템 구성이 단순함(S-Box · 캐비닛 수 적음)',
  BEST_FIT: '요청 크기에 가장 잘 맞음',
});

const nf = n => Math.round(Number(n) || 0).toLocaleString('ko-KR');
/** 피치 표기 — 화면의 다른 곳(fmtPitch)과 같게 소수 둘째 자리까지, 끝 0 은 생략. */
export function pitchLabel(p) {
  return Number.isFinite(p) ? 'P' + Number(p).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : '—';
}
const meters = mm => (Number(mm) / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 1 });

/**
 * 엔진 결과 → 화면에 그릴 값.
 * @param {object} result   recommendModel(...) 결과
 * @param {{id:string,name?:string}|null} current 지금 선택된 모델(읽기만 한다)
 * @returns {object} { state, current, recommended, same, sameText, reasons, warnings, message, detail, requested }
 */
export function modelRecommendationView(result, current) {
  const r = result || {};
  const cur = current ? { id: current.id, name: current.name || current.id } : null;
  const base = { state: null, current: cur, recommended: null, same: false, sameText: '', reasons: [], warnings: [], message: '', detail: '',
    requested: r.requested ? `${nf(r.requested.w)} × ${nf(r.requested.h)} mm` : '' };
  if (r.status === 'OUT_OF_V2_INITIAL_SCOPE') {
    return { ...base, state: MODEL_REC_STATE.OUT_OF_SCOPE,
      message: '강당의 모델 · 픽셀 피치 추천은 현재 지원 범위에 포함되지 않습니다.',
      detail: '② LED 설치 크기의 권장 크기는 그대로 쓸 수 있습니다.' };
  }
  if (r.status === 'UNSUPPORTED_ROOM_TYPE') {
    return { ...base, state: MODEL_REC_STATE.UNSUPPORTED, message: '이 공간 유형에서는 모델 추천을 사용할 수 없습니다.' };
  }
  if (r.status !== 'RECOMMENDED' || !r.recommended) {
    const noViewer = Array.isArray(r.reasons) && r.reasons.includes('NO_NEAREST_VIEWER');
    return { ...base, state: MODEL_REC_STATE.NO_SAFE,
      message: '현재 시청 거리 조건을 만족하는 추천 모델이 없습니다.',
      detail: noViewer ? '시청 자리가 없어 가장 가까운 시청 거리를 알 수 없습니다.'
        : `가장 가까운 시청 거리 ${meters(r.nearestViewerMm)}m 기준에서 현재 카탈로그 모델이 조건을 충족하지 않습니다.` };
  }
  const t = r.recommended;
  const same = !!cur && cur.id === t.modelId;
  const warnings = [];
  for (const w of r.warnings || []) {
    if (w === 'FIT_LOSS_WARNING') warnings.push(`추천 모델 적용 시 요청 크기(${base.requested})보다 실제 설치 크기(${nf(t.actualW)} × ${nf(t.actualH)} mm)가 작아질 수 있습니다.`);
    else if (w === 'FIT_BELOW_FLOOR') warnings.push('요청 크기에 70% 이상 맞는 후보가 없습니다.');
  }
  return {
    ...base, state: MODEL_REC_STATE.RECOMMENDED, same,
    sameText: same ? '현재 선택 모델이 추천 모델과 같습니다.' : '',
    recommended: {
      id: t.modelId, name: t.name || t.modelId, pitch: pitchLabel(t.pitch),
      actual: `${nf(t.actualW)} × ${nf(t.actualH)} mm`,
      resolution: `${nf(t.resW)} × ${nf(t.resH)}`,
      matrix: `${t.cols} × ${t.rows}`,
      sbox: Number.isFinite(t.sbox) ? t.sbox : null, cabinets: t.cabinets,
    },
    reasons: (r.reasons || []).map(c => REASON_TEXT[c]).filter(Boolean),
    warnings,
  };
}
