// capture-state.js — 화면 촬영(시각 회귀)의 **정규 상태 계약**. (PHASE 8-0, DEC-133)
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일은 QA 도구다. 제품 코드가 아니며 `src/` 의 어떤 파일도 이것을 읽지 않는다.
//   순수 계산만 한다 — DOM·브라우저·Playwright 를 모르므로 `node --test` 로 검사할 수 있다.
//
// **왜 필요한가.** PHASE 7-c 에서 같은 코드인데 촬영 순서만 바꾸면 픽셀이 달라지는 일이
//   있었다. 원인은 LED 하단 높이(`#baseHeight`)였다.
//     · 이 값은 방 옵션이 아니라 **계산기 전역 입력**이다(기본 1,000mm).
//     · `renderAll()` 이 부르는 `clampBaseHeight()` 가 `벽 높이 − LED 실제 높이` 를 넘으면
//       값을 **내린다**. 천장 3.0m 방에서 2,160mm 배열이면 상한이 840mm 라 1,000 → 840 이 된다.
//     · 그리고 **다시 올라오지 않는다.** 나중에 천장 6m 방으로 가도 840 그대로다.
//   그래서 천장 낮은 방을 먼저 본 촬영본은 LED 가 160mm 낮게 찍힌다(중심 2.08m → 1.92m).
//
//   **이것은 제품의 정상 동작이다.** 사용자가 고른 LED 설치 높이는 방을 바꿔도 유지되는 것이
//   맞고, 벽을 넘지 않게 자르는 것도 맞다. 잘못한 쪽은 **촬영 도구**다 — 컷마다 이 값을
//   정해 주지 않고 앞 컷이 남긴 값을 그대로 썼다. 그래서 제품이 아니라 도구를 고친다.
//
// **계약.** 컷 하나의 그림은 **그 컷의 명세만으로** 결정된다. 앞에서 무엇을 찍었는지,
//   몇 번째로 찍는지, 새로고침을 했는지와 무관해야 한다.
// ─────────────────────────────────────────────────────────────────────────────

/** 촬영에 영향을 주는 값의 기본치. 제품 기본값이 아니라 **촬영용 기준점**이다. */
export const CANONICAL_DEFAULTS = Object.freeze({
  model: 'MP012F',          // 삼성 정합성 기준 모델. 컷마다 명시적으로 고른다.
  ledBaseMm: 1000,          // LED 하단 높이(mm) — 이번 단계가 드러낸 바로 그 값
  ledWmm: 4000,
  ledHmm: 2300,
  mode: 'fill',             // 배열 산출 방식(자동 채움)
  view: 'interior',
  person3d: true,           // 릴리스된 기본값(DEC-126)
  viewport: Object.freeze({ width: 1280, height: 900 }),
  dpr: 1,
});

/**
 * 컷 하나를 적용하는 **순서**. 순서 자체가 계약이다.
 *   치수를 LED 보다 먼저 두는 이유: 하단 높이 상한이 `벽 높이 − LED 높이` 라서,
 *   치수가 정해지지 않은 상태에서 높이를 넣으면 나중에 다시 잘린다.
 */
export const CAPTURE_STEPS = Object.freeze([
  'resetBrowserState',   // ① 저장값을 지우고 앱을 처음 상태로 띄운다
  'enterViewer',         // ② 3D 작업영역으로 들어간다(여기서만 방 컨트롤이 보인다)
  'selectModel',         // ③ LED 제품을 고른다
  'roomType',            // ④ 공간 타입
  'dimensions',          // ⑤ 가로·높이·깊이
  'ledState',            // ⑥ LED 크기·배열·하단 높이
  'design',              // ⑦ 공간 디자인
  'roomOptions',         // ⑧ 방별 옵션(화분·통로·좌석 등)
  'accessories',         // ⑨ 서 있는 사람 등 소품
  'view',                // ⑩ 시점
  'settle',              // ⑪ 장면이 멈출 때까지 기다린다
  'assertState',         // ⑫ 요청한 값과 실제 값이 같은지 확인한다
  'capture',             // ⑬ 찍는다
]);

/** 촬영 결과를 좌우하는 값들. 이 목록에 있는 것은 **컷마다 반드시 지정**한다. */
export const CAPTURE_RELEVANT_KEYS = Object.freeze([
  'roomType', 'widthMm', 'heightMm', 'depthMm', 'design',
  'model', 'mode', 'ledWmm', 'ledHmm', 'ledBaseMm',
  'view', 'person3d', 'options', 'viewport', 'dpr',
]);

const clone = v => JSON.parse(JSON.stringify(v));

/**
 * 컷 명세를 **빠진 값 없는 완전한 상태**로 채운다.
 * @param {object} spec 최소한 `id`·`roomType`·치수를 담은 명세
 * @param {object} [defaults] 기준점(시험용으로 갈아끼울 수 있다)
 */
export function normalizeCaseSpec(spec, defaults = CANONICAL_DEFAULTS) {
  if (!spec || typeof spec !== 'object') throw new TypeError('촬영 명세가 없다');
  for (const k of ['id', 'roomType', 'widthMm', 'heightMm', 'depthMm']) {
    if (spec[k] === undefined || spec[k] === null) throw new TypeError(`촬영 명세에 ${k} 가 없다`);
  }
  const out = {
    id: String(spec.id),
    label: String(spec.label ?? spec.id),
    roomType: String(spec.roomType),
    widthMm: Number(spec.widthMm),
    heightMm: Number(spec.heightMm),
    depthMm: Number(spec.depthMm),
    design: spec.design ?? null,            // null = 그 용도의 기본 디자인에 맡긴다
    model: String(spec.model ?? defaults.model),
    mode: String(spec.mode ?? defaults.mode),
    ledWmm: Number(spec.ledWmm ?? defaults.ledWmm),
    ledHmm: Number(spec.ledHmm ?? defaults.ledHmm),
    ledBaseMm: Number(spec.ledBaseMm ?? defaults.ledBaseMm),
    view: String(spec.view ?? defaults.view),
    person3d: spec.person3d === undefined ? defaults.person3d : !!spec.person3d,
    options: clone(spec.options ?? {}),     // 비어 있으면 '그 용도의 기본값을 그대로 확인'
    viewport: Object.freeze({ ...defaults.viewport, ...(spec.viewport ?? {}) }),
    dpr: Number(spec.dpr ?? defaults.dpr),
  };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === 'number' && !Number.isFinite(v)) throw new TypeError(`${k} 가 수가 아니다`);
  }
  if (out.widthMm <= 0 || out.heightMm <= 0 || out.depthMm <= 0) throw new TypeError('치수가 0 이하다');
  if (out.ledBaseMm < 0) throw new TypeError('LED 하단 높이가 음수다');
  return Object.freeze(out);
}

/**
 * 명세를 **단계별 지시 목록**으로 바꾼다. 브라우저를 모는 쪽은 이 목록만 따르면 된다.
 *   앞 컷의 상태를 읽지 않는다 — 모든 값이 목록 안에 들어 있다.
 */
export function capturePlan(spec, defaults = CANONICAL_DEFAULTS) {
  const s = normalizeCaseSpec(spec, defaults);
  return Object.freeze([
    Object.freeze({ step: 'resetBrowserState', clearStorage: true, reload: true }),
    Object.freeze({ step: 'enterViewer', viewport: s.viewport, dpr: s.dpr }),
    Object.freeze({ step: 'selectModel', model: s.model }),
    Object.freeze({ step: 'roomType', roomType: s.roomType }),
    Object.freeze({ step: 'dimensions', widthMm: s.widthMm, heightMm: s.heightMm, depthMm: s.depthMm }),
    Object.freeze({ step: 'ledState', mode: s.mode, ledWmm: s.ledWmm, ledHmm: s.ledHmm, ledBaseMm: s.ledBaseMm }),
    Object.freeze({ step: 'design', design: s.design }),
    Object.freeze({ step: 'roomOptions', options: Object.freeze({ ...s.options }) }),
    Object.freeze({ step: 'accessories', person3d: s.person3d }),
    Object.freeze({ step: 'view', view: s.view }),
    Object.freeze({ step: 'settle' }),
    Object.freeze({ step: 'assertState', spec: s }),
    Object.freeze({ step: 'capture', id: s.id }),
  ]);
}

/**
 * LED 하단 높이의 **유효값**. 제품이 하는 자르기를 그대로 흉내 낸다.
 *   (제품을 고치는 것이 아니라, 촬영 도구가 '무엇을 기대해야 하는지' 알기 위한 계산이다.)
 * @param requestedMm 명세가 요구한 하단 높이
 * @param roomHeightMm 벽 높이
 * @param ledActualHmm 실제 배열 높이(캐비닛 단위로 맞춰진 값)
 */
export function effectiveLedBase(requestedMm, roomHeightMm, ledActualHmm) {
  const max = Math.max(0, Math.round(roomHeightMm - ledActualHmm));
  return Math.min(Math.max(0, Math.round(requestedMm)), max);
}

/** 촬영 한 컷의 지문. 로그에 남겨 무엇을 찍었는지 나중에 대조한다(화면에는 쓰지 않는다). */
export function fingerprint(runtime) {
  const r = runtime || {};
  const o = r.options && typeof r.options === 'object'
    ? Object.keys(r.options).sort().map(k => `${k}=${r.options[k]}`).join(',') : '';
  return [
    `room=${r.roomType}`,
    `size=${r.widthMm}x${r.heightMm}x${r.depthMm}`,
    `design=${r.design ?? '-'}`,
    `model=${r.model}`,
    `led=${r.ledWmm}x${r.ledHmm}@${r.ledBaseMm}`,
    `view=${r.view}`,
    `fov=${r.fov ?? '-'}`,
    `person=${r.person3d ? 1 : 0}`,
    `opts[${o}]`,
    `canvas=${r.canvasWidth}x${r.canvasHeight}`,
    `dpr=${r.dpr}`,
  ].join(' ');
}

/**
 * 요청한 상태와 실제 상태를 견준다. 어긋난 항목 목록을 돌려준다(비어 있으면 일치).
 *   `ledBaseMm` 만 특별하다 — 제품이 자를 수 있으므로 **자른 뒤의 값**과 견준다.
 */
export function stateMismatches(spec, runtime, ledActualHmm = null) {
  const s = normalizeCaseSpec(spec);
  const r = runtime || {};
  const bad = [];
  const eq = (k, want, got) => { if (String(want) !== String(got)) bad.push(`${k}: 요청 ${want} · 실제 ${got}`); };
  eq('roomType', s.roomType, r.roomType);
  eq('widthMm', s.widthMm, r.widthMm);
  eq('heightMm', s.heightMm, r.heightMm);
  eq('depthMm', s.depthMm, r.depthMm);
  if (s.design !== null) eq('design', s.design, r.design);
  eq('model', s.model, r.model);
  eq('ledWmm', s.ledWmm, r.ledWmm);
  eq('view', s.view, r.view);
  eq('person3d', s.person3d, !!r.person3d);
  eq('canvasWidth', r.canvasWidth, r.canvasWidth);   // 존재만 확인(실제 값은 레이아웃이 정한다)
  eq('dpr', s.dpr, r.dpr);
  const wantBase = ledActualHmm == null ? s.ledBaseMm
    : effectiveLedBase(s.ledBaseMm, s.heightMm, ledActualHmm);
  eq('ledBaseMm', wantBase, r.ledBaseMm);
  for (const [k, v] of Object.entries(s.options)) {
    if (r.options && String(r.options[k]) !== String(v)) bad.push(`options.${k}: 요청 ${v} · 실제 ${r.options[k]}`);
  }
  return bad;
}

/** 고정 씨앗 섞기(xorshift). 순서를 바꿔도 **매번 같은 순서**가 나와야 재현된다. */
export function shuffledOrder(list, seed) {
  if (!Number.isInteger(seed)) throw new TypeError('섞기에는 정수 씨앗이 필요하다');
  const a = [...list];
  let x = seed >>> 0 || 0x9e3779b9;
  const next = () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x; };
  for (let i = a.length - 1; i > 0; i--) {
    const j = next() % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
