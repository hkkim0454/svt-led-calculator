// monitors.js — LED 옆에 붙이는 보조 모니터 배치. (순수 — DOM도 THREE도 쓰지 않는다)
// ─────────────────────────────────────────────────────────────────────────────
// 회의실 정면 벽에서 LED가 차지하고 남은 자리에 모니터를 건다.
//
// **제품 스펙을 지어내지 않는다**(CLAUDE.md 규칙 2).
//   여기서 쓰는 것은 '대각 인치 → 16:9 가로·세로'라는 **순수 기하**뿐이다.
//   실제 제품의 베젤 두께·무게·소비전력은 모델마다 다르므로 계산하지 않는다.
//   화면 테두리는 눈에 보이게 하려는 최소값(BEZEL_MM)일 뿐 특정 제품값이 아니다.
// ─────────────────────────────────────────────────────────────────────────────

const MM_PER_INCH = 25.4;

/**
 * LED 옆 모니터로 **고를 수 있는** 인치 — 삼성 사이니지 규격이다(QMC 50~98 + QH115FX 115).
 *
 * 화면의 '모니터 인치' 칸은 이 목록에서만 고른다. 다만 `panelSize()`는 대각 인치를
 * 16:9 기하로 환산할 뿐이라 목록 밖 크기도 계산은 그대로 된다(개인·운용 모니터가
 * 22·24·27인치를 쓰는 것도 같은 함수다).
 */
export const MONITOR_INCHES = Object.freeze([50, 55, 65, 75, 85, 98, 115]);

/** `normalizeInches()`가 계산 직전에 값을 다듬는 범위. 이 밖의 값은 이 범위로 잘린다. */
export const MONITOR_INCH_MIN = 10;
export const MONITOR_INCH_MAX = 200;

/** 입력칸·불러온 설정값을 받아 쓸 수 있는 인치로 다듬는다(범위 밖이면 잘라낸다). */
export function normalizeInches(v, fallback = 55) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(MONITOR_INCH_MAX, Math.max(MONITOR_INCH_MIN, Math.round(n)));
}

/** 배치 위치. */
export const MONITOR_SIDES = Object.freeze(['none', 'left', 'right', 'both']);

/** 화면 테두리(한쪽, mm)와 두께(mm) — 보이라고 두는 최소값이지 제품 스펙이 아니다. */
export const BEZEL_MM = 14;
export const PANEL_DEPTH_MM = 62;

/**
 * 대각 인치 → 화면 가로·세로(mm). 16:9 순수 기하.
 * @returns {{w,h,panelW,panelH}} w·h = 화면, panelW·panelH = 테두리 포함 바깥 크기
 */
export function panelSize(inches, { ratioW = 16, ratioH = 9, bezel = BEZEL_MM } = {}) {
  const d = Math.max(1, Number(inches) || 0) * MM_PER_INCH;
  const k = d / Math.hypot(ratioW, ratioH);
  const w = k * ratioW, h = k * ratioH;
  return { w, h, panelW: w + bezel * 2, panelH: h + bezel * 2 };
}

/**
 * LED 옆 빈 자리에 모니터를 놓는다.
 *
 * @param roomW  방 가로(mm)
 * @param ledX   LED 왼쪽 끝 x(mm)
 * @param ledW   LED 가로(mm)
 * @param ledCY  LED 세로 중심 높이(mm) — 모니터도 같은 눈높이에 맞춘다
 * @param side   'none' | 'left' | 'right' | 'both'
 * @param inches 대각 인치
 * @param clear  모니터와 LED·벽 사이 최소 여유(mm)
 * @returns {{monitors:Array, notes:string[]}}
 *   monitors: [{ x, y, w, h, panelW, panelH, depth, side }] — x·y는 화면 **중심**
 */
export function sideMonitorLayout({
  roomW, ledX, ledW, ledCY, side = 'none', inches = 55, clear = 250,
} = {}) {
  const notes = [];
  if (!MONITOR_SIDES.includes(side) || side === 'none') return { monitors: [], notes };

  const p = panelSize(inches);
  const wantSides = side === 'both' ? ['left', 'right'] : [side];
  const gapLeft = Math.max(0, ledX);                       // 왼쪽 벽 ~ LED 왼쪽 끝
  const gapRight = Math.max(0, roomW - (ledX + ledW));     // LED 오른쪽 끝 ~ 오른쪽 벽
  const monitors = [];

  for (const s of wantSides) {
    const gap = s === 'left' ? gapLeft : gapRight;
    const need = p.panelW + clear * 2;
    if (gap < need) {
      notes.push(`${s === 'left' ? '왼쪽' : '오른쪽'} 여백 ${Math.round(gap)}mm로는 `
        + `${inches}인치(${Math.round(p.panelW)}mm)를 걸 수 없습니다.`);
      continue;
    }
    // 남은 자리 한가운데에 건다.
    const cx = s === 'left' ? gap / 2 : ledX + ledW + gap / 2;
    monitors.push({
      side: s, x: cx, y: ledCY,
      w: p.w, h: p.h, panelW: p.panelW, panelH: p.panelH,
      depth: PANEL_DEPTH_MM, inches: Number(inches),
    });
  }
  return { monitors, notes };
}

/**
 * 정면 뷰용 — `sideMonitorLayout()` 결과를 **정면 벽 왼쪽 위 기준** 사각형(mm)으로 바꾼다.
 *   자리를 새로 정하지 않는다. 3D 와 같은 결과를 좌표계만 바꿔 쓰므로 두 뷰의 모니터가 mm 까지 같다.
 *   정면 뷰는 위에서 아래로 재므로 top = 벽 높이 − (중심 높이 + 바깥 세로 ÷ 2) 이다.
 *
 * @param monitors sideMonitorLayout().monitors
 * @param wallH    벽(방) 높이(mm)
 * @returns {Array<{side,inches,left,top,w,h,bezel}>} w·h = 테두리 포함 바깥 크기, bezel = 화면까지 안쪽 여백
 */
export function frontMonitorBoxes(monitors = [], wallH = 0) {
  return (monitors || []).map(mn => ({
    side: mn.side, inches: mn.inches,
    left: mn.x - mn.panelW / 2,
    top: wallH - (mn.y + mn.panelH / 2),
    w: mn.panelW, h: mn.panelH,
    bezel: (mn.panelW - mn.w) / 2,
  }));
}
