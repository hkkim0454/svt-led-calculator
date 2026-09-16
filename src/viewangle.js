// viewangle.js — 좌석별 LED 시야 판정. (순수 — DOM도 THREE도 쓰지 않는다)
// ─────────────────────────────────────────────────────────────────────────────
// "이 자리에서 화면이 제대로 보이는가"를 좌석마다 계산한다.
//
// **가짜 스펙을 만들지 않는다**(CLAUDE.md 규칙 2).
//   · 모델이 실제로 가진 값만 스펙으로 쓴다 — `ovd_m`(최적 시청 거리, 삼성 제공).
//   · 각도는 전부 좌표에서 계산한다(스펙이 필요 없다).
//   · 등급 경계값은 **모델 스펙이 아니라 판정 기준**이다. 어디서 온 숫자인지 아래에 적어 두고,
//     화면에도 '기준값'으로 표시한다. 모델 데이터시트인 것처럼 섞지 않는다.
//
// 좌표 규약은 room-presets와 같다(mm). LED는 정면 벽(z≈0)에 붙어 있고 +Z가 객석 쪽이다.
// ─────────────────────────────────────────────────────────────────────────────

const DEG = 180 / Math.PI;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * 판정 기준값.
 *   offAxis*  화면 법선에서 얼마나 벗어나 앉았는가(도). LED는 정면에서 벗어날수록
 *             밝기·색이 떨어진다. 일반적인 LED 캐비닛의 시야각 표기가 140°(= ±70°)라
 *             그 절반을 '불량' 경계로, 여유를 둔 50°를 '주의' 경계로 잡았다.
 *             — 모델별 시야각 스펙이 데이터에 없으므로 이 값은 **기준(입력)** 이다.
 *   subtend*  화면이 시야에서 차지하는 각도(도). 영상 규격(SMPTE 권장 최소 화면 점유각 30°)을
 *             기준으로, 그 아래 20°를 '너무 멀다'로 본다.
 *   nearOvd   최적 시청 거리(ovd_m, 모델 스펙) 대비 얼마나 가까우면 픽셀이 보이는가.
 */
export const VIEW_RULES = Object.freeze({
  offAxisWarnDeg: 50,
  offAxisBadDeg: 70,
  subtendWarnDeg: 30,     // SMPTE 권장 최소
  subtendBadDeg: 20,
  nearOvdRatio: 1.0,      // ovd_m 보다 가까우면 픽셀이 보이기 시작한다
});

/** 앉은 사람의 눈높이 — 좌판 윗면에서 위로(mm). 성인 평균 앉은키 기준. */
export const SEATED_EYE_MM = 700;

/**
 * 좌석 하나의 시야 계산.
 * @param seat {x, z, y?}   좌석 위치(mm). y는 단차 높이.
 * @param led  {cx, cy, w, h}  LED 중심 x·y와 실제 가로·세로(mm). LED 면은 z = 0.
 * @param opts {seatTopMm}  좌판 높이(mm). 눈높이는 여기에 SEATED_EYE_MM을 더한다.
 */
export function seatView(seat, led, opts = {}) {
  const seatTop = opts.seatTopMm ?? 440;
  const eyeY = (seat.y || 0) + seatTop + SEATED_EYE_MM;
  const dx = seat.x - led.cx;
  const dy = eyeY - led.cy;
  const dz = Math.max(1, seat.z);                 // LED 면(z=0)에서 앞뒤 거리
  const dist = Math.hypot(dx, dy, dz);

  // 화면 법선(=+Z)에서 벗어난 각. 수평·수직을 따로 본다.
  const offAxisH = Math.atan2(Math.abs(dx), dz) * DEG;
  const offAxisV = Math.atan2(Math.abs(dy), dz) * DEG;

  // 화면이 시야에서 차지하는 각도. 먼 자리일수록 작아진다.
  const subtendH = 2 * Math.atan((led.w / 2) / Math.max(1, dist)) * DEG;
  const subtendV = 2 * Math.atan((led.h / 2) / Math.max(1, dist)) * DEG;

  return { dist, eyeY, offAxisH, offAxisV, subtendH, subtendV };
}

/**
 * 시야 값 → 등급.
 * @returns {{grade:'good'|'warn'|'poor', reasons:string[]}}
 *   good 양호 · warn 주의 · poor 불량
 */
export function gradeView(v, { rules = VIEW_RULES, ovdMm = null } = {}) {
  const reasons = [];
  let grade = 'good';
  const worse = g => { if (g === 'poor' || (g === 'warn' && grade === 'good')) grade = g; };

  const off = Math.max(v.offAxisH, v.offAxisV);
  if (off >= rules.offAxisBadDeg) { worse('poor'); reasons.push(`화면에서 ${Math.round(off)}° 벗어남`); }
  else if (off >= rules.offAxisWarnDeg) { worse('warn'); reasons.push(`화면에서 ${Math.round(off)}° 벗어남`); }

  if (v.subtendH < rules.subtendBadDeg) { worse('poor'); reasons.push(`화면이 ${v.subtendH.toFixed(1)}°로 작게 보임`); }
  else if (v.subtendH < rules.subtendWarnDeg) { worse('warn'); reasons.push(`화면이 ${v.subtendH.toFixed(1)}°로 작게 보임`); }

  // 최적 시청 거리(모델 스펙)보다 가까우면 픽셀이 보인다.
  if (ovdMm && v.dist < ovdMm * rules.nearOvdRatio) {
    worse('warn');
    reasons.push(`최적 시청 거리(${(ovdMm / 1000).toFixed(1)}m)보다 가까움`);
  }
  return { grade, reasons };
}

/**
 * 배치 목록의 좌석에 시야 등급을 붙인다.
 * 좌석 좌표는 건드리지 않는다 — `grade`·`view` 꼬리표만 더한 **새 배열**을 돌려준다.
 *
 * @param items room-presets 배치 결과
 * @param led   {cx, cy, w, h} mm
 * @param opts  {seatTypes, seatTopMm, ovdMm, rules}
 * @returns {{items, summary:{good,warn,poor,total,minDist,maxDist,maxOffAxis,minSubtend}}}
 */
export function annotateSeatViews(items, led, opts = {}) {
  const seatTypes = new Set(opts.seatTypes || ['seat']);
  const out = [];
  const sum = { good: 0, warn: 0, poor: 0, total: 0, minDist: Infinity, maxDist: 0, maxOffAxis: 0, minSubtend: Infinity };
  for (const it of items || []) {
    if (!seatTypes.has(it.type)) { out.push(it); continue; }
    const v = seatView(it, led, opts);
    const { grade, reasons } = gradeView(v, opts);
    sum[grade]++; sum.total++;
    sum.minDist = Math.min(sum.minDist, v.dist);
    sum.maxDist = Math.max(sum.maxDist, v.dist);
    sum.maxOffAxis = Math.max(sum.maxOffAxis, v.offAxisH, v.offAxisV);
    sum.minSubtend = Math.min(sum.minSubtend, v.subtendH);
    out.push({ ...it, grade, view: { ...v, reasons } });
  }
  if (!sum.total) { sum.minDist = 0; sum.minSubtend = 0; }
  return { items: out, summary: sum };
}

/** 등급별 표시 색(좌석 천). 신호등처럼 읽히되 LED보다 튀지 않게 채도를 낮춘다. */
export const GRADE_COLORS = Object.freeze({
  good: '#b9d6c4',   // 양호 — 차분한 초록
  warn: '#e6d8ab',   // 주의 — 바랜 노랑
  poor: '#e0b3b3',   // 불량 — 바랜 빨강
});

export const GRADE_LABELS = Object.freeze({ good: '양호', warn: '주의', poor: '불량' });

/** 착석 인원 고르기 — 착석률(%)에 맞춰 흩어지게 고른다(같은 입력이면 항상 같은 결과). */
export function isOccupied(index, percent) {
  const p = clamp(Math.round(percent) || 0, 0, 100);
  if (p <= 0) return false;
  if (p >= 100) return true;
  // 황금비 수열 — 앞뒤로 몰리지 않고 고르게 흩어진다.
  return Math.floor(((index * 0.6180339887498949) % 1) * 100) < p;
}
