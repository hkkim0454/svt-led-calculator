// capture-state.test.js — 시각 회귀 촬영의 정규 상태 계약. (PHASE 8-0, DEC-133)
// ─────────────────────────────────────────────────────────────────────────────
// 여기서 지키는 약속은 하나다.
//   **한 컷의 그림은 그 컷의 명세만으로 정해진다.**
//   앞에서 무엇을 찍었는지, 몇 번째로 찍는지, 새로고침을 했는지와 무관해야 한다.
//
// PHASE 7-c 에서 이 약속이 깨져 있었다. LED 하단 높이가 앞 컷에서 이어져 와, 같은 코드인데
//   촬영 순서만 바꾸면 LED 가 160mm 낮게 찍혔다(중심 2.08m → 1.92m). 제품은 정상이었고
//   — 사용자가 고른 설치 높이를 방을 바꿔도 유지하는 것은 맞다 — 촬영 도구가 그 값을
//   컷마다 정해 주지 않은 것이 잘못이었다.
//
// 브라우저가 필요한 증명(순서를 바꿔도 같은 픽셀)은 `qa/capture.mjs` 가 한다. 이 파일은
//   저장소 규칙대로 **Node 내장만** 써서 그 도구의 계약을 값과 소스로 고정한다.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CANONICAL_DEFAULTS, CAPTURE_STEPS, CAPTURE_RELEVANT_KEYS, normalizeCaseSpec,
  capturePlan, effectiveLedBase, fingerprint, stateMismatches, shuffledOrder } from '../qa/capture-state.js';
import { CAPTURE_CASES, CAPTURE_IDS, caseById } from '../qa/capture-cases.js';

const qa = f => readFileSync(new URL(`../qa/${f}`, import.meta.url), 'utf8');
/** 주석을 지운 소스 — 설명 글에 적힌 낱말이 검사에 걸리지 않게 한다. */
const code = f => qa(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const 단계 = spec => capturePlan(spec).map(p => p.step);
const 단계값 = (spec, name) => capturePlan(spec).find(p => p.step === name);

// ── ① 컷 명세는 빈 곳 없이 채워진다 ─────────────────────────────────────────

test('① 정규화가 촬영에 영향을 주는 값을 하나도 빼놓지 않는다', () => {
  const s = normalizeCaseSpec({ id: 'x', roomType: 'meeting', widthMm: 10000, heightMm: 3500, depthMm: 10000 });
  for (const k of CAPTURE_RELEVANT_KEYS) {
    assert.ok(k in s, `${k} 가 정규화 결과에 없다`);
    assert.notEqual(s[k], undefined, `${k} 가 비어 있다`);
  }
  // 기준점에서 온 값들이 실제로 채워졌다.
  assert.equal(s.model, CANONICAL_DEFAULTS.model);
  assert.equal(s.ledBaseMm, CANONICAL_DEFAULTS.ledBaseMm);
  assert.equal(s.view, CANONICAL_DEFAULTS.view);
  assert.equal(s.person3d, CANONICAL_DEFAULTS.person3d);
  assert.equal(s.dpr, CANONICAL_DEFAULTS.dpr);
  assert.deepEqual({ ...s.viewport }, { ...CANONICAL_DEFAULTS.viewport });
  assert.ok(Object.isFrozen(s), '명세가 얼어 있지 않다');
});

test('② 빠진 값이 있으면 조용히 넘어가지 않고 멈춘다', () => {
  for (const 빠짐 of ['id', 'roomType', 'widthMm', 'heightMm', 'depthMm']) {
    const spec = { id: 'x', roomType: 'meeting', widthMm: 1000, heightMm: 3000, depthMm: 1000 };
    delete spec[빠짐];
    assert.throws(() => normalizeCaseSpec(spec), new RegExp(빠짐), `${빠짐} 이 없는데 통과했다`);
  }
  assert.throws(() => normalizeCaseSpec(null), /명세/);
  assert.throws(() => normalizeCaseSpec({ id: 'x', roomType: 'm', widthMm: 0, heightMm: 3000, depthMm: 1000 }), /치수/);
  assert.throws(() => normalizeCaseSpec({ id: 'x', roomType: 'm', widthMm: 1, heightMm: 1, depthMm: 1, ledBaseMm: -5 }), /음수/);
});

// ── ② 순서가 곧 계약이다 ────────────────────────────────────────────────────

test('③ 적용 순서가 고정돼 있다 — 치수가 LED 보다, 정착이 촬영보다 앞선다', () => {
  assert.deepEqual([...CAPTURE_STEPS], ['resetBrowserState', 'enterViewer', 'selectModel', 'roomType',
    'dimensions', 'ledState', 'design', 'roomOptions', 'accessories', 'view', 'settle', 'assertState', 'capture']);
  const 순 = 단계(CAPTURE_CASES[0]);
  assert.deepEqual(순, [...CAPTURE_STEPS], '계획이 정해진 순서를 따르지 않는다');
  const at = n => 순.indexOf(n);
  // 치수를 먼저 정해야 LED 하단 높이의 상한이 정해진다.
  assert.ok(at('dimensions') < at('ledState'), '치수보다 LED 를 먼저 정한다');
  // 처음 상태로 되돌리는 것이 가장 먼저다.
  assert.equal(at('resetBrowserState'), 0, '초기화가 첫 단계가 아니다');
  // 멈춘 뒤에 확인하고, 확인한 뒤에 찍는다.
  assert.ok(at('settle') < at('assertState'), '멈추기 전에 확인한다');
  assert.ok(at('assertState') < at('capture'), '확인하기 전에 찍는다');
});

test('④ 계획은 **그 컷의 명세만으로** 만들어진다 — 앞 컷과 무관하다', () => {
  const 차례 = [...CAPTURE_CASES];
  const 단독 = JSON.stringify(capturePlan(caseById('hall-m-interior')));
  // 앞에 무엇이 오든 같은 계획이 나온다.
  for (const 앞 of [차례[0], 차례[8], 차례[차례.length - 1]]) {
    capturePlan(앞);   // 앞 컷을 먼저 만들어 본다(상태가 남는지 본다)
    assert.equal(JSON.stringify(capturePlan(caseById('hall-m-interior'))), 단독, '앞 컷이 계획을 바꿨다');
  }
  // 목록 순서로 한 번, 뒤집어서 한 번, 섞어서 한 번 만들어 **컷별로** 견준다.
  //   앞 컷의 값을 물려받는 구석이 하나라도 있으면 여기서 어긋난다.
  const 만들기 = ids => Object.fromEntries(ids.map(id => [id, JSON.stringify(capturePlan(caseById(id)))]));
  const 목록 = 만들기(CAPTURE_IDS);
  const 역순 = 만들기([...CAPTURE_IDS].reverse());
  const 섞음 = 만들기(shuffledOrder(CAPTURE_IDS, 20260919));
  for (const id of CAPTURE_IDS) {
    assert.equal(역순[id], 목록[id], `${id}: 뒤집으니 계획이 달라졌다`);
    assert.equal(섞음[id], 목록[id], `${id}: 섞으니 계획이 달라졌다`);
  }
  assert.equal(목록['hall-m-interior'], 단독, '순서가 계획을 바꿨다');

  // 그리고 계획의 값은 **그 컷의 명세 값 그대로**여야 한다. 위의 대조만으로는 부족하다 —
  //   모든 컷이 똑같이 앞 컷을 물려받으면 어느 순서로 만들어도 서로 같아 보이기 때문이다.
  for (const c of CAPTURE_CASES) {
    const s = normalizeCaseSpec(c);
    const plan = capturePlan(c);
    const v = n => plan.find(p => p.step === n);
    assert.equal(v('view').view, s.view, `${c.id}: 계획의 시점이 명세와 다르다`);
    assert.equal(v('roomType').roomType, s.roomType, `${c.id}: 계획의 공간 타입이 명세와 다르다`);
    assert.equal(v('ledState').ledBaseMm, s.ledBaseMm, `${c.id}: 계획의 하단 높이가 명세와 다르다`);
    assert.equal(v('ledState').ledWmm, s.ledWmm, `${c.id}: 계획의 LED 가로가 명세와 다르다`);
    assert.equal(v('design').design, s.design, `${c.id}: 계획의 디자인이 명세와 다르다`);
    assert.equal(v('accessories').person3d, s.person3d, `${c.id}: 계획의 소품이 명세와 다르다`);
    assert.deepEqual(v('dimensions'),
      { step: 'dimensions', widthMm: s.widthMm, heightMm: s.heightMm, depthMm: s.depthMm },
      `${c.id}: 계획의 치수가 명세와 다르다`);
    assert.deepEqual(v('roomOptions').options, { ...s.options }, `${c.id}: 계획의 옵션이 명세와 다르다`);
  }
});

// ── ③ 값이 실제로 지시되는가 ────────────────────────────────────────────────

test('⑤ LED 하단 높이가 컷마다 명시된다 — 이번 단계가 고친 바로 그 값이다', () => {
  for (const c of CAPTURE_CASES) {
    const step = 단계값(c, 'ledState');
    assert.ok(step, `${c.id}: LED 단계가 없다`);
    assert.equal(typeof step.ledBaseMm, 'number', `${c.id}: 하단 높이가 수가 아니다`);
    assert.ok(step.ledBaseMm >= 0, `${c.id}: 하단 높이가 음수다`);
  }
  // 촬영기가 실제로 그 값을 입력칸에 넣는다.
  const drv = code('capture.mjs');
  assert.ok(/setField, \['#baseHeight', step\.ledBaseMm\]/.test(drv), '촬영기가 하단 높이를 넣지 않는다');
});

test('⑥ 치수·공간 타입·시점·디자인·옵션·소품이 컷마다 명시된다', () => {
  for (const c of CAPTURE_CASES) {
    const d = 단계값(c, 'dimensions');
    assert.ok(d.widthMm > 0 && d.heightMm > 0 && d.depthMm > 0, `${c.id}: 치수가 없다`);
    assert.ok(단계값(c, 'roomType').roomType, `${c.id}: 공간 타입이 없다`);
    assert.ok(단계값(c, 'view').view, `${c.id}: 시점이 없다`);
    assert.ok('design' in 단계값(c, 'design'), `${c.id}: 디자인 단계가 없다`);
    assert.ok('options' in 단계값(c, 'roomOptions'), `${c.id}: 옵션 단계가 없다`);
    assert.equal(typeof 단계값(c, 'accessories').person3d, 'boolean', `${c.id}: 소품 단계가 없다`);
  }
  const drv = code('capture.mjs');
  for (const [무엇, 무늬] of [
    ['공간 타입', /selectOption\('#roomType', step\.roomType\)/],
    ['가로', /'#spaceW', step\.widthMm/], ['높이', /'#spaceH', step\.heightMm/], ['깊이', /'#spaceD', step\.depthMm/],
    ['시점', /setPreset\(v, \{ animate: false \}\)/],
    ['디자인', /#roomDesign/], ['방 옵션', /#roomOpts \[data-ropt=/], ['사람', /data-t3d="person"/],
    ['제품', /modelRow\[data-id=/],
  ]) assert.ok(무늬.test(drv), `촬영기가 ${무엇} 을 지시하지 않는다`);
  // 디자인 단계가 **명세를 보고** 도는지. `if (false)` 처럼 꺼 두면 코드는 남아도 돌지 않는다.
  assert.ok(/if \(step\.design\)/.test(drv), '디자인 단계가 명세를 보지 않는다');
  // 소품도 마찬가지다 — 화면에서 값을 **읽기만** 하고 맞추지 않으면 앞 컷의 상태가 남는다.
  assert.ok(/}, step\.person3d\)/.test(drv), '사람 표시를 명세대로 맞추지 않는다');
  assert.ok(/classList\.contains\('on'\) !== !!on/.test(drv), '사람 표시를 눌러서 맞추지 않는다');
  // 옵션을 적용하다가 **이름을 보고** 특정 항목만 건너뛰지 않는다(화분 등).
  //   조절칸이 없어서 건너뛰는 것(`if (!el) continue`)은 정상이다 — 그 경우는 확인 단계가
  //   '요청했는데 없다'로 잡는다(대회의실 `tableDir` 에서 실제로 그렇게 걸렸다).
  assert.equal(/if \(key ===/.test(drv), false, '옵션 하나를 이름으로 건너뛴다');
  assert.equal(/key !== /.test(drv), false, '옵션 하나를 이름으로 걸러낸다');
});

test('⑦ 촬영기가 저장값을 지우고 처음 상태에서 시작한다', () => {
  const drv = code('capture.mjs');
  assert.ok(/localStorage\.clear\(\)/.test(drv), '저장값을 지우지 않는다');
  assert.ok(/sessionStorage\.clear\(\)/.test(drv), '세션 저장값을 지우지 않는다');
  assert.ok(/page\.reload\(/.test(drv), '지운 뒤 다시 읽지 않는다');
  assert.ok(/setViewportSize/.test(drv), '창 크기를 정하지 않는다');
  assert.ok(/deviceScaleFactor: 1/.test(drv), '화면 배율(DPR)을 고정하지 않는다');
});

test('⑧ 멈춘 것을 **재서** 확인한다 — 정해진 시간을 기다리지 않는다', () => {
  const drv = code('capture.mjs');
  assert.ok(/animating/.test(drv), '전환이 끝났는지 보지 않는다');
  assert.ok(/requestAnimationFrame/.test(drv), '프레임을 세지 않는다');
  assert.ok(/STABLE_FRAMES/.test(drv), '몇 프레임을 볼지 정해 두지 않았다');
  assert.ok(/화면이 멈추지 않았다/.test(qa('capture.mjs')), '멈추지 않았을 때 그냥 찍는다');
  // 임의의 기다림(waitForTimeout)으로 정착을 대신하지 않는다.
  assert.equal(/waitForTimeout/.test(drv), false, '임의의 시간 기다림이 남아 있다');
});

// ── ④ 어긋남을 잡아낸다 ────────────────────────────────────────────────────

test('⑨ 요청과 실제가 다르면 잡아낸다', () => {
  const spec = caseById('training-interior');
  const 실제 = {
    roomType: 'classroom', design: 'trainingRoom', widthMm: 12000, heightMm: 3400, depthMm: 10000,
    model: 'MP012F', ledWmm: 4000, ledHmm: 2300, ledBaseMm: 1000, view: 'interior',
    person3d: true, options: { ...spec.options }, canvasWidth: 574, canvasHeight: 563, dpr: 1,
  };
  assert.deepEqual(stateMismatches(spec, 실제), [], '맞는데도 어긋났다고 한다');
  for (const [키, 값] of [['roomType', 'meeting'], ['widthMm', 9000], ['heightMm', 3000],
    ['design', 'controlRoom'], ['model', 'MP008F'], ['ledWmm', 3000], ['view', 'top'],
    ['person3d', false], ['ledBaseMm', 840], ['dpr', 2]]) {
    const bad = stateMismatches(spec, { ...실제, [키]: 값 });
    assert.ok(bad.some(m => m.startsWith(키)), `${키} 가 달라졌는데 못 잡는다`);
  }
  // 방 옵션이 달라져도 잡는다.
  const 옵션 = stateMismatches({ ...spec, options: { ...spec.options, plant: true } },
    { ...실제, options: { ...spec.options, plant: false } });
  assert.ok(옵션.some(m => m.startsWith('options.plant')), '방 옵션 어긋남을 못 잡는다');
});

test('⑩ 하단 높이는 **제품이 자른 뒤의 값**과 견준다', () => {
  // 천장 3.0m 에 2,160mm 배열이면 상한이 840mm 다 — 제품이 1,000 을 840 으로 내린다.
  assert.equal(effectiveLedBase(1000, 3000, 2160), 840);
  assert.equal(effectiveLedBase(1000, 3400, 2160), 1000, '여유가 있으면 그대로다');
  assert.equal(effectiveLedBase(5000, 3000, 2160), 840, '요청이 커도 상한까지만');
  assert.equal(effectiveLedBase(-10, 3000, 2160), 0, '음수는 0 으로');
  const spec = caseById('training-compact-interior');
  const 실제 = {
    roomType: 'classroom', design: 'trainingRoom', widthMm: 8000, heightMm: 3000, depthMm: 7000,
    model: 'MP012F', ledWmm: 4000, ledHmm: 2000, ledBaseMm: 840, view: 'interior',
    person3d: true, options: { ...spec.options }, canvasWidth: 574, canvasHeight: 563, dpr: 1,
  };
  assert.deepEqual(stateMismatches(spec, 실제, 2160), [], '자른 값을 틀렸다고 한다');
  assert.ok(stateMismatches(spec, { ...실제, ledBaseMm: 1000 }, 2160).some(m => m.startsWith('ledBaseMm')),
    '자르지 않은 값을 그냥 받아들인다');
});

// ── ⑤ 지문과 섞기 ──────────────────────────────────────────────────────────

test('⑪ 촬영 지문에 나중에 대조할 값이 다 들어 있다', () => {
  const fp = fingerprint({
    roomType: 'classroom', widthMm: 12000, heightMm: 3400, depthMm: 10000, design: 'trainingRoom',
    model: 'MP012F', ledWmm: 4000, ledHmm: 2300, ledBaseMm: 1000, view: 'interior', fov: 42,
    person3d: true, options: { plant: false, rows: 4 }, canvasWidth: 574, canvasHeight: 563, dpr: 1,
  });
  for (const 조각 of ['room=classroom', 'size=12000x3400x10000', 'design=trainingRoom', 'model=MP012F',
    'led=4000x2300@1000', 'view=interior', 'fov=42', 'person=1', 'plant=false', 'rows=4',
    'canvas=574x563', 'dpr=1']) {
    assert.ok(fp.includes(조각), `지문에 ${조각} 이 없다`);
  }
  // 값이 달라지면 지문도 달라진다(특히 하단 높이).
  const 다름 = fingerprint({ roomType: 'classroom', widthMm: 12000, heightMm: 3400, depthMm: 10000,
    design: 'trainingRoom', model: 'MP012F', ledWmm: 4000, ledHmm: 2300, ledBaseMm: 840, view: 'interior',
    fov: 42, person3d: true, options: { plant: false, rows: 4 }, canvasWidth: 574, canvasHeight: 563, dpr: 1 });
  assert.notEqual(fp, 다름, '하단 높이가 달라져도 지문이 같다');
});

test('⑫ 섞기는 **씨앗이 같으면 결과가 같다** — 씨앗 없는 무작위를 쓰지 않는다', () => {
  const a = shuffledOrder(CAPTURE_IDS, 20260919);
  const b = shuffledOrder(CAPTURE_IDS, 20260919);
  assert.deepEqual(a, b, '같은 씨앗인데 결과가 다르다');
  assert.notDeepEqual(a, shuffledOrder(CAPTURE_IDS, 777), '씨앗이 달라도 결과가 같다');
  assert.deepEqual([...a].sort(), [...CAPTURE_IDS].sort(), '섞다가 컷이 빠지거나 늘었다');
  assert.throws(() => shuffledOrder(CAPTURE_IDS), /씨앗/, '씨앗 없이 섞을 수 있다');
  const drv = code('capture.mjs');
  assert.equal(/Math\.random/.test(drv), false, '촬영기가 씨앗 없는 무작위를 쓴다');
  assert.ok(/--seed/.test(qa('capture.mjs')), '씨앗을 지정할 방법이 없다');
});

// ── ⑥ 찍는 대상이 빠지지 않는다 ─────────────────────────────────────────────

test('⑬ 동결된 다섯 공간과 레거시 네 공간을 모두 찍는다', () => {
  const 방 = new Set(CAPTURE_CASES.map(c => `${c.roomType}:${c.design ?? '-'}`));
  for (const 필요 of ['meeting:corporateMeeting', 'meeting:executiveBoardroom', 'meeting:largeConference',
    'control:controlRoom', 'classroom:trainingRoom', 'hall_s:-', 'hall_m:-', 'hall_l:-', 'ideation:-']) {
    assert.ok(방.has(필요), `${필요} 를 찍지 않는다`);
  }
  // 명세가 콕 집어 요구한 컷들.
  for (const id of ['training-interior', 'training-corner-l', 'ideation-interior']) {
    assert.ok(caseById(id), `${id} 컷이 없다`);
  }
  assert.ok(CAPTURE_CASES.some(c => c.roomType === 'classroom' && ['top', 'front'].includes(c.view)),
    '교육장 평면·정면 컷이 없다');
  // 좌석이 많은 강당 시점 — 인스턴싱·그림자가 가장 무거운 칸이다.
  assert.ok(CAPTURE_CASES.some(c => c.roomType === 'hall_l'), '대강당 컷이 없다');
  // 천장이 낮아 **하단 높이가 잘리는** 칸이 반드시 있어야 한다. 이 컷이 없으면 이번 단계가
  //   고친 문제가 촬영 목록에서 사라져, 회귀가 생겨도 드러나지 않는다.
  const 잘리는칸 = CAPTURE_CASES.filter(c => effectiveLedBase(c.ledBaseMm ?? CANONICAL_DEFAULTS.ledBaseMm,
    c.heightMm, 2160) < (c.ledBaseMm ?? CANONICAL_DEFAULTS.ledBaseMm));
  assert.ok(잘리는칸.length >= 1, '하단 높이가 잘리는 칸이 목록에 없다');
  assert.ok(CAPTURE_IDS.length >= 15, `컷이 너무 적다(${CAPTURE_IDS.length})`);
  assert.equal(new Set(CAPTURE_IDS).size, CAPTURE_IDS.length, '컷 이름이 겹친다');
});

test('⑮ 모든 컷이 같은 창 크기·화면 배율로 찍힌다 — 한 컷만 달라도 대조가 무너진다', () => {
  for (const c of CAPTURE_CASES) {
    const s = normalizeCaseSpec(c);
    assert.deepEqual({ ...s.viewport }, { ...CANONICAL_DEFAULTS.viewport },
      `${c.id}: 창 크기가 다르다`);
    assert.equal(s.dpr, CANONICAL_DEFAULTS.dpr, `${c.id}: 화면 배율이 다르다`);
  }
  // 방별 옵션도 컷마다 적혀 있어야 한다 — 비어 있으면 그 용도의 기본값을 물려받는 셈이다.
  for (const c of CAPTURE_CASES) {
    const o = 단계값(c, 'roomOptions').options;
    assert.ok(Object.keys(o).length > 0, `${c.id}: 방 옵션이 비어 있다`);
    assert.ok('plant' in o, `${c.id}: 화분 상태가 적혀 있지 않다`);
  }
  // 촬영기가 화분을 포함해 옵션을 **하나씩** 적용한다.
  const drv = code('capture.mjs');
  assert.ok(/Object\.entries\(wanted\)/.test(drv), '옵션을 하나씩 적용하지 않는다');
});

// ── ⑦ 제품을 건드리지 않는다 ────────────────────────────────────────────────

test('⑭ QA 도구는 제품 기본값을 바꾸지 않고, 제품 코드도 QA 도구를 모른다', () => {
  // QA 쪽 순수 모듈은 제품 모듈을 아예 읽지 않는다.
  for (const f of ['capture-state.js', 'capture-cases.js']) {
    assert.equal(/from '\.\.\/src\//.test(qa(f)), false, `${f}: 제품 모듈을 끌어들였다`);
  }
  // 촬영기는 화면(입력칸·버튼)을 통해서만 값을 바꾼다 — 앱 내부 상태에 직접 쓰지 않는다.
  const drv = code('capture.mjs');
  assert.equal(/__svtViewer3d\._internals\.[A-Za-z]+\s*=/.test(drv), false, '앱 내부에 직접 값을 쓴다');
  assert.equal(/window\.__svt[A-Za-z]*\s*=/.test(drv), false, '앱 전역에 직접 값을 쓴다');
  // 제품 코드는 QA 도구를 모른다(한쪽 방향 의존).
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.equal(/qa\//.test(app.replace(/\/\/.*$/gm, '')), false, '제품 코드가 QA 도구를 읽는다');
  // 기준점은 QA 것이지 제품 기본값이 아니다 — 제품은 이 값을 모른다.
  assert.equal(/CANONICAL_DEFAULTS/.test(app), false, '제품 코드가 촬영 기준점을 안다');
});
