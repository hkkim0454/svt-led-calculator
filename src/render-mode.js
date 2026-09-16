// render-mode.js — 3D 표현 방식(심플 / 실사). (순수 — DOM도 THREE도 쓰지 않는다)
// ─────────────────────────────────────────────────────────────────────────────
// 같은 장면을 두 가지 느낌으로 보여 준다.
//
//   심플  다이어그램·도면에 가까운 평평한 그림. 그림자와 요철 무늬를 끄고
//         빛을 환경광 위주로 돌려 방향감을 줄인다. 배치를 검토하거나
//         흑백 인쇄에 넣을 때, 그리고 느린 기기에서 유리하다.
//   실사  지금의 기본. 접촉 그림자와 재질 요철이 들어간 건축 시각화 느낌.
//
// **형상·치수·계산은 어느 쪽에서도 똑같다.** 달라지는 것은 빛과 재질뿐이다.
// 여기 있는 값은 LIGHTS(gl-model.js)와 재질 프리셋(materials.js)에 **곱하는 배수**다 —
// 원래 값을 복사해 두지 않으므로 기준이 바뀌면 두 모드가 함께 따라간다.
// ─────────────────────────────────────────────────────────────────────────────

export const RENDER_MODES = Object.freeze({
  simple: Object.freeze({
    id: 'simple', label: '심플',
    shadows: false,
    texture: 0,                // 요철 무늬 세기 배수 — 0이면 무늬 없음
    // 환경광을 올리고 주광을 크게 낮춘다 → 면마다 밝기 차가 거의 없어 평평해진다.
    light: Object.freeze({ hemi: 1.50, ceiling: 0.75, key: 0.55, fill: 0.45, ledSpill: 0.35 }),
  }),
  real: Object.freeze({
    id: 'real', label: '실사',
    shadows: true,
    texture: 1,
    light: Object.freeze({ hemi: 1, ceiling: 1, key: 1, fill: 1, ledSpill: 1 }),
  }),
});

export const DEFAULT_RENDER_MODE = 'real';

/** 모드 id → 모드. 모르는 값이면 기본(실사). */
export function renderMode(id) {
  return RENDER_MODES[id] || RENDER_MODES[DEFAULT_RENDER_MODE];
}

/**
 * 조명 세기 = 기준값 × 모드 배수 × 분위기 배수.
 * @param base   LIGHTS (gl-model.js)
 * @param modeId 'simple' | 'real'
 * @param moodLight 분위기 밝기 배수(materials.js MOODS[..].light)
 */
export function lightLevels(base, modeId, moodLight = 1) {
  const m = renderMode(modeId).light;
  const k = Number(moodLight) > 0 ? Number(moodLight) : 1;
  return {
    hemi: base.hemi * m.hemi * k,
    ceiling: base.ceiling * m.ceiling * k,
    key: base.key * m.key * k,
    fill: base.fill * m.fill * k,
    ledSpill: base.ledSpill * m.ledSpill,   // LED 번짐은 방 밝기와 무관하다
  };
}

/** 주광이 전체에서 차지하는 비중 = 그림자·음영의 진하기. 심플일수록 작아진다. */
export function keyShareOf(levels) {
  const total = levels.hemi + levels.ceiling + levels.key + levels.fill;
  return total > 0 ? levels.key / total : 0;
}
