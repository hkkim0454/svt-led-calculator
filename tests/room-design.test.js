// room-design.test.js — 디자인 프리셋 구조 회귀 테스트 (PHASE 1-a).
// 핵심 규칙
//   (1) 이 단계에서는 **화면이 하나도 바뀌지 않는다** — 어떤 디자인을 적용해도 INHERIT뿐이다.
//   (2) design 값이 없는 예전 세션은 반드시 corporateMeeting으로 떨어진다.
//   (3) 배치의 주인은 언제나 용도(roomType)다 — 디자인이 배치를 가로채지 않는다.
//   (4) 가짜 스펙 금지 — 실제로 적용되는 id는 반드시 존재하는 자산·재질이어야 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ROOM_DESIGNS, DESIGN_IDS, DEFAULT_DESIGN, DESIGN_FIELDS, DESIGN_STATUS, INHERIT,
  LAYOUT_VARIANTS, layoutVariant, layoutPlan,
  roomDesign, designsFor, normalizeDesign, resolveDesign, isNeutralDesign,
  planned, isPlanned,
} from '../src/room-design.js';
import { ROOM_TYPES, DEFAULT_ROOM_TYPE, layoutRoom, defaultOptions } from '../src/room-presets.js';
import { computeConfig } from '../src/engine.js';
import { MODELS } from '../src/models.js';
import { MATERIAL_PRESETS, floorFinishFor, moodFor } from '../src/materials.js';
import { FURNITURE_ASSETS } from '../src/furniture-assets.js';

const ROOM_TYPE_IDS = ROOM_TYPES.map(t => t.id);
const VALUE_FIELDS = ['furniture', 'palette', 'materials', 'wallTreatment', 'lighting', 'camera', 'accessories'];

// 해석된 디자인 안의 모든 문자열 값을 모은다(실제로 적용되는 id들).
function appliedIds(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) appliedIds(x, out);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) appliedIds(x, out);
  return out;
}

test('디자인 4종 — 요청한 공간이 모두 선언되어 있고 항목이 빠짐없이 있다', () => {
  assert.deepEqual([...DESIGN_IDS],
    ['corporateMeeting', 'executiveBoardroom', 'largeConference', 'controlRoom']);
  for (const id of DESIGN_IDS) {
    const d = ROOM_DESIGNS[id];
    assert.equal(d.id, id, `${id}: id가 열쇠와 달라서는 안 된다`);
    assert.ok(d.label, `${id}: 라벨 필요`);
    for (const f of DESIGN_FIELDS) {
      assert.ok(f in d, `${id}: '${f}' 항목이 빠졌다`);
    }
    assert.ok(Object.values(DESIGN_STATUS).includes(d.status), `${id}: 상태 ${d.status}`);
    assert.ok(Number.isInteger(d.phase) && d.phase >= 1, `${id}: 구현 단계 ${d.phase}`);
    assert.ok(Object.isFrozen(d), `${id}: 실수로 바뀌지 않게 얼려 둬야 한다`);
  }
});

test('디자인 ↔ 용도 — 모든 디자인이 실제 공간 타입에 붙어 있다', () => {
  for (const id of DESIGN_IDS) {
    const d = ROOM_DESIGNS[id];
    assert.ok(ROOM_TYPE_IDS.includes(d.roomType), `${id}: 없는 공간 타입 ${d.roomType}`);
  }
  // 오너가 지정한 대응 관계.
  assert.equal(ROOM_DESIGNS.corporateMeeting.roomType, 'meeting');
  assert.equal(ROOM_DESIGNS.executiveBoardroom.roomType, 'meeting');
  assert.equal(ROOM_DESIGNS.largeConference.roomType, 'meeting');
  assert.equal(ROOM_DESIGNS.controlRoom.roomType, 'control');
});

test('배치 변형(layoutVariant) — 디자인마다 다른 이름을 갖고 용도와 짝이 맞다', () => {
  const seen = new Set();
  for (const id of DESIGN_IDS) {
    const d = ROOM_DESIGNS[id];
    const v = layoutVariant(d.layoutVariant);
    assert.ok(v, `${id}: 없는 배치 변형 ${d.layoutVariant}`);
    assert.equal(v.roomType, d.roomType, `${id}: 변형의 용도가 디자인과 다르다`);
    assert.ok(ROOM_TYPE_IDS.includes(v.base), `${id}: 기존 배치 분기가 아니다 ${v.base}`);
    assert.ok(!seen.has(v.id), `배치 변형이 겹친다: ${v.id}`);
    seen.add(v.id);
  }
  // 오너가 지정한 이름 그대로.
  assert.equal(ROOM_DESIGNS.corporateMeeting.layoutVariant, 'corporate-standard');
  assert.equal(ROOM_DESIGNS.executiveBoardroom.layoutVariant, 'executive-u');
  assert.equal(ROOM_DESIGNS.largeConference.layoutVariant, 'large-conference');
  assert.equal(ROOM_DESIGNS.controlRoom.layoutVariant, 'curved-console');
  assert.equal(layoutVariant('없는변형'), null);
  // 선언한 변형 4종 말고 다른 것이 섞여 들어오지 않았는지.
  assert.deepEqual(Object.keys(LAYOUT_VARIANTS),
    ['corporate-standard', 'executive-u', 'large-conference', 'curved-console']);
  assert.equal(seen.size, Object.keys(LAYOUT_VARIANTS).length, '쓰이지 않는 변형이 남아 있다');
});

test('기본 디자인 — 값이 없거나 모르는 id면 corporateMeeting으로 떨어진다', () => {
  assert.equal(DEFAULT_DESIGN, 'corporateMeeting');
  for (const bad of [undefined, null, '', 0, false, '없는디자인', 'CorporateMeeting']) {
    assert.equal(roomDesign(bad).id, DEFAULT_DESIGN, `${String(bad)} → 기본 디자인`);
  }
  // **예전 세션에는 design 값이 아예 없다.** 그래도 지금 화면 그대로여야 한다.
  assert.equal(normalizeDesign(undefined, 'meeting'), DEFAULT_DESIGN);
  assert.equal(normalizeDesign(undefined, undefined), DEFAULT_DESIGN);
  for (const t of ROOM_TYPE_IDS) {
    assert.equal(normalizeDesign(undefined, t), DEFAULT_DESIGN, `${t}: 예전 세션 복원`);
  }
  // 용도와 안 맞는 디자인도 기본으로 되돌린다(상황실에 임원 회의실 디자인이 붙지 않게).
  assert.equal(normalizeDesign('controlRoom', 'meeting'), DEFAULT_DESIGN);
  assert.equal(normalizeDesign('executiveBoardroom', 'control'), DEFAULT_DESIGN);
  assert.equal(normalizeDesign('executiveBoardroom', 'meeting'), 'executiveBoardroom');
  assert.equal(normalizeDesign('controlRoom', 'control'), 'controlRoom');
});

test('고를 수 있는 목록 — 회의실 3종·상황실 1종, 나머지 용도는 기본 하나', () => {
  assert.deepEqual(designsFor('meeting').map(d => d.id),
    ['corporateMeeting', 'executiveBoardroom', 'largeConference']);
  assert.deepEqual(designsFor('control').map(d => d.id), ['controlRoom']);
  // 아직 디자인이 붙지 않은 용도 — 화면에 고를 것이 하나도 없으면 안 된다.
  for (const t of ['classroom', 'hall_s', 'hall_m', 'hall_l', 'ideation']) {
    assert.deepEqual(designsFor(t).map(d => d.id), [DEFAULT_DESIGN], t);
  }
  assert.deepEqual(designsFor(undefined).map(d => d.id), [DEFAULT_DESIGN]);
});

// ── PHASE 1-a 의 핵심 안전장치 ──────────────────────────────────────────────

test('PHASE 1-a — 어떤 디자인을 적용해도 화면이 바뀌지 않는다(전부 INHERIT)', () => {
  for (const id of DESIGN_IDS) {
    assert.ok(isNeutralDesign(id), `${id}: 아직 화면을 바꾸면 안 된다`);
    const r = resolveDesign(id);
    for (const f of VALUE_FIELDS) {
      assert.equal(r[f], INHERIT, `${id}.${f} 가 INHERIT가 아니다`);
    }
  }
});

test('corporateMeeting — 지금 회의실 화면과 100% 같다(선언부터 전부 INHERIT)', () => {
  const d = ROOM_DESIGNS.corporateMeeting;
  assert.equal(d.status, DESIGN_STATUS.READY, '지금 쓸 수 있는 유일한 디자인이다');
  assert.equal(d.phase, 1);
  // 해석 결과뿐 아니라 **선언 자체**가 비어 있어야 한다 — 나중에 누가 값을 채우면 테스트가 잡는다.
  for (const f of VALUE_FIELDS) {
    assert.equal(d[f], INHERIT, `corporateMeeting.${f} 에 값을 넣으면 현재 화면이 바뀐다`);
  }
  // INHERIT는 '용도가 정하던 규칙 그대로'를 뜻한다 — 그 규칙이 살아 있는지 확인한다.
  assert.equal(floorFinishFor('meeting'), 'carpetTile');
  assert.equal(floorFinishFor('classroom'), 'vinylFloor');
  assert.equal(moodFor('meeting'), 'office');
});

test('가짜 스펙 금지 — 아직 없는 자산은 planned로만 적히고 절대 적용되지 않는다', () => {
  assert.ok(isPlanned(planned('x')));
  assert.equal(planned('x').planned, 'x');
  for (const v of [null, undefined, 'x', 1, {}, { planned: 1 }, []]) assert.equal(isPlanned(v), false);

  // 해석 결과에 남은 문자열 id는 전부 **실재하는** 자산·재질이어야 한다.
  //   (지금은 전부 INHERIT이므로 하나도 남지 않는 것이 정상이다.)
  const known = new Set([...Object.keys(MATERIAL_PRESETS), ...Object.keys(FURNITURE_ASSETS)]);
  for (const id of DESIGN_IDS) {
    const r = resolveDesign(id);
    const ids = VALUE_FIELDS.flatMap(f => appliedIds(r[f]));
    assert.deepEqual(ids, [], `${id}: 아직 적용될 수 있는 값이 남아 있다 (${ids.join(', ')})`);
    for (const x of ids) assert.ok(known.has(x), `${id}: 없는 자산·재질 ${x}`);
  }
  // 아직 구현 전인 3종은 planned 표시를 달고 있어야 한다(빈 껍데기가 아니라 '계획'이라는 뜻).
  for (const id of ['executiveBoardroom', 'largeConference', 'controlRoom']) {
    assert.equal(ROOM_DESIGNS[id].status, DESIGN_STATUS.PLANNED, id);
    assert.ok(ROOM_DESIGNS[id].phase >= 3, `${id}: PHASE 3 이후 구현`);
  }
});

test('배치 — 디자인은 배치를 가로채지 않는다(주인은 언제나 용도)', () => {
  for (const t of ROOM_TYPE_IDS) {
    for (const id of [...DESIGN_IDS, undefined, '없는디자인']) {
      const p = layoutPlan(id, t);
      assert.equal(p.roomType, t, `${t}/${id}: 용도가 바뀌면 안 된다`);
      assert.equal(p.useBaseLayout, true, `${t}/${id}: 아직 기존 배치를 그대로 써야 한다`);
      assert.ok(ROOM_TYPE_IDS.includes(p.base), `${t}/${id}: 기존 배치 분기가 아니다 ${p.base}`);
    }
  }
  // 용도가 맞을 때만 변형 이름이 붙는다.
  assert.equal(layoutPlan('executiveBoardroom', 'meeting').variant, 'executive-u');
  assert.equal(layoutPlan('controlRoom', 'control').variant, 'curved-console');
  // 안 맞으면 변형 없음 = 기존 배치 그대로.
  assert.equal(layoutPlan('controlRoom', 'classroom').variant, null);
  assert.equal(layoutPlan(undefined, 'hall_m').variant, null);
  // 기본 용도(회의실)에서 기본 디자인은 표준 변형에 걸린다.
  assert.equal(DEFAULT_ROOM_TYPE, 'meeting');
  assert.equal(layoutPlan(undefined, DEFAULT_ROOM_TYPE).variant, 'corporate-standard');
});

test('연결 없음 — 이 단계에서는 화면·계산 어디에도 물려 있지 않다', () => {
  // room-design.js 는 다른 모듈을 하나도 불러오지 않는다(순수·독립).
  //   기존 계산에 끼어들 통로 자체가 없다는 뜻이다.
  const src = readFileSync(new URL('../src/room-design.js', import.meta.url), 'utf8');
  assert.equal(/^\s*import\s/m.test(src), false, 'room-design.js 는 아무것도 import 하지 않아야 한다');
});

// ── 오너 지정 최소 테스트 7번 — 기존 계산 무변경 ────────────────────────────
// 디자인 층이 생겼다고 해서 **산출값이 한 건도 달라지면 안 된다.**
// 지금은 연결되어 있지 않아 당연히 같지만, 이 테스트는 **앞으로를 위한 잠금장치**다 —
// PHASE 1-c에서 디자인을 화면에 물릴 때 배치나 LED 계산에 손이 닿으면 여기서 걸린다.

test('기존 계산 무변경 ① 배치 — 어떤 디자인을 끼워도 room-presets 결과가 똑같다', () => {
  for (const t of ROOM_TYPE_IDS) {
    for (const room of [{ W: 8000, D: 7000 }, { W: 12000, D: 14000 }, { W: 30000, D: 34000 }]) {
      const opts = defaultOptions(t);
      const base = JSON.stringify(layoutRoom(t, opts, room));
      for (const id of [...DESIGN_IDS, undefined, '없는디자인']) {
        // 화면이 앞으로 쓸 경로 그대로: 디자인 → 배치 계획 → 배치 계산.
        const plan = layoutPlan(id, t);
        const after = JSON.stringify(layoutRoom(plan.roomType, defaultOptions(plan.roomType), room));
        assert.equal(after, base, `${t}/${id}/${room.W}×${room.D}: 배치가 달라졌다`);
      }
    }
  }
});

test('기존 계산 무변경 ② LED — 삼성 검증 기준값(MP012F 6×3.4m)이 그대로다', () => {
  // CLAUDE.md §검증된 기준 데이터 — 삼성 공식 configurator 실측값. 절대 바뀌면 안 된다.
  const MP012F = MODELS.find(m => m.id === 'MP012F');
  const r = computeConfig(MP012F, 6000, 3400, { mode: 'manual', cols: 7, rows: 6 });
  assert.equal(r.total, 42);
  assert.equal(r.resW, 4480);
  assert.equal(r.resH, 2160);
  assert.equal(r.maxW, 6132);
  assert.ok(Math.abs(r.heatMaxBTU - 20916) < 20, `btu=${r.heatMaxBTU}`);
  // 디자인 모듈은 이 값에 닿을 수 없다 — 계산에 넘기는 인자가 하나도 없다.
  for (const id of [...DESIGN_IDS, undefined]) {
    const d = resolveDesign(id);
    assert.equal(d.furniture, INHERIT);
    assert.equal(d.materials, INHERIT);
  }
});

test('불변 데이터 — 디자인·변형 표를 밖에서 고칠 수 없다', () => {
  // 전역 상수를 누가 실수로 바꾸면 방마다 다른 결과가 나온다. 깊은 곳까지 얼려 둔다.
  const frozen = (v, path) => {
    if (!v || typeof v !== 'object') return;
    assert.ok(Object.isFrozen(v), `${path} 가 얼어 있지 않다`);
    for (const [k, x] of Object.entries(v)) frozen(x, `${path}.${k}`);
  };
  frozen(ROOM_DESIGNS, 'ROOM_DESIGNS');
  frozen(LAYOUT_VARIANTS, 'LAYOUT_VARIANTS');
  frozen(DESIGN_FIELDS, 'DESIGN_FIELDS');
  frozen(DESIGN_STATUS, 'DESIGN_STATUS');
  frozen(planned('x'), 'planned()');
  // 해석 결과와 배치 계획도 호출한 쪽이 고칠 수 없어야 한다(캐시된 값을 오염시키지 않게).
  for (const id of DESIGN_IDS) assert.ok(Object.isFrozen(resolveDesign(id)), `resolveDesign(${id})`);
  assert.ok(Object.isFrozen(layoutPlan('corporateMeeting', 'meeting')));
  assert.ok(Object.isFrozen(designsFor('meeting')));
});
