// led-request.js — ② LED 설치 크기 요청값의 '자동 / 직접' 상태 규칙 (PHASE 11-a). 순수 함수, DOM 없음.
// ─────────────────────────────────────────────────────────────────────────────
// ② 칸의 값은 언제나 둘 중 하나의 상태에 있다.
//   'auto'   — 사람이 칸에 손대지 않았다. 강당이면 방에 맞춘 권장값, 그 밖의 용도면 제품 기본값을 넣는다.
//   'manual' — 사람이 칸에 직접 넣었다. 용도·디자인·방 크기·모델을 바꾸거나 새로 고쳐도 그 값을 지킨다.
//   우선순위는 **직접 넣은 값 > 자동 권장값** 이다.
//
// 이 파일은 '칸에 어느 값이 있어야 하는가'만 정한다. 권장값 자체(강당 공식)는 room-presets.js 의
//   auditoriumLedSize 가, 캐비닛 맞춤과 산출은 engine.js 가 한다. 여기서 스펙을 계산하지 않는다.
// ─────────────────────────────────────────────────────────────────────────────

/** 제품 기본 요청값(mm). index.html 의 #ledW·#ledH 초깃값, config.js 의 기본값과 같아야 한다. */
export const LED_REQUEST_DEFAULT = Object.freeze({ w: 4000, h: 2300 });

/** 저장 규격에 쓰는 상태 이름. */
export const LED_SIZE_MODES = Object.freeze(['auto', 'manual']);

/**
 * 'auto' 상태에서 ② 칸에 있어야 할 값.
 *   강당이면 그 방의 권장값(호출하는 쪽이 auditoriumLedSize 로 구해 넘긴다), 그 밖이면 제품 기본값이다.
 *   **강당이 아닌 용도에 강당 권장값을 남기지 않는다** — 대강당 7,100×4,000 이 회의실로 따라가던 결함(PHASE 11-0 P1-②).
 * @param {{w:number,h:number}|null} hallSize 강당 권장값. 강당이 아니면 null.
 * @returns {{w:number,h:number}}
 */
export function autoLedRequest(hallSize) {
  if (hallSize && hallSize.w > 0 && hallSize.h > 0) return { w: hallSize.w, h: hallSize.h };
  return { w: LED_REQUEST_DEFAULT.w, h: LED_REQUEST_DEFAULT.h };
}

/**
 * 저장된 구성을 되살릴 때의 상태.
 *   ① 상태가 적혀 있으면 그대로 따른다.
 *   ② 상태가 없는 옛 저장값이면 **저장된 크기가 그 방의 자동값과 정확히 같을 때만** 'auto' 로 본다.
 *      그때는 자동으로 되돌려도 칸의 값이 한 자리도 바뀌지 않는다 — 사람이 넣은 값을 덮어쓸 수 없다.
 *   ③ 그 밖에는 전부 'manual' 이다. 애매하면 사람의 값을 지키는 쪽으로 떨어진다.
 * @param {object} saved   normalizeConfig 를 거친 구성(ledW·ledH·ledSizeMode)
 * @param {{w:number,h:number}|null} autoNow 그 방에서 지금 'auto' 라면 들어갈 값(autoLedRequest 의 결과)
 * @returns {'auto'|'manual'}
 */
export function restoreLedSizeMode(saved, autoNow) {
  const m = saved && saved.ledSizeMode;
  if (LED_SIZE_MODES.includes(m)) return m;
  if (!saved || !autoNow) return 'manual';
  const w = Number(saved.ledW), h = Number(saved.ledH);
  return (w === autoNow.w && h === autoNow.h) ? 'auto' : 'manual';
}

/**
 * 맞춘 LED 가 벽 안에 들어가는가. 들어가지 않으면 무엇이 넘치는지 돌려준다(경고용).
 *   **다른 입력을 고쳐서 억지로 맞추지 않는다** — 하단 높이를 몰래 내리던 동작을 없앤 자리다(P1-②).
 * @param {{spaceW:number,spaceH:number,baseHeight:number,actualW:number,actualH:number}} p (mm)
 * @returns {null|{width:boolean,height:boolean,topMm:number}}
 */
export function ledFitProblem({ spaceW, spaceH, baseHeight, actualW, actualH } = {}) {
  if (!(spaceW > 0) || !(spaceH > 0) || !(actualW > 0) || !(actualH > 0)) return null;
  const base = Math.max(0, Number(baseHeight) || 0);
  const topMm = base + actualH;
  const width = actualW > spaceW + 0.5;
  const height = topMm > spaceH + 0.5;
  return (width || height) ? { width, height, topMm } : null;
}
