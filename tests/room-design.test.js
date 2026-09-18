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
  ROOM_DESIGNS, DESIGN_IDS, DESIGN_FIELDS, DESIGN_STATUS, INHERIT,
  NEUTRAL_DESIGN, DEFAULT_DESIGN_BY_ROOM_TYPE, defaultDesignFor,
  LAYOUT_VARIANTS, layoutVariant, layoutPlan,
  roomDesign, designsFor, normalizeDesign, resolveDesign, isNeutralDesign,
  planned, isPlanned,
} from '../src/room-design.js';
import { ROOM_TYPES, DEFAULT_ROOM_TYPE, layoutRoom, defaultOptions } from '../src/room-presets.js';
import { computeConfig } from '../src/engine.js';
import { MODELS } from '../src/models.js';
import { MATERIAL_PRESETS, MATERIAL_IDS, resolveMaterialId, floorFinishFor, moodFor } from '../src/materials.js';
import { designPalette } from '../src/design-finish.js';
import { lightingPreset } from '../src/design-lighting.js';
import { WALL_PLAN_IDS } from '../src/control-walls.js';
// 화각 계획 이름 — 실재하는 계획인지 확인하기 위한 목록(가짜 스펙 금지).
const CAMERA_PLAN_IDS = new Set(['corporateProposal', 'executiveProposal', 'conferenceProposal', 'controlProposal']);
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

test('기본 디자인 — 되돌아가는 곳은 언제나 **그 용도의** 기본이다', () => {
  // 용도별 기본 디자인 표 — 지원하는 용도만 적혀 있어야 한다.
  assert.deepEqual(DEFAULT_DESIGN_BY_ROOM_TYPE, { meeting: 'corporateMeeting', control: 'controlRoom' });
  for (const [t, id] of Object.entries(DEFAULT_DESIGN_BY_ROOM_TYPE)) {
    assert.ok(ROOM_TYPE_IDS.includes(t), `없는 공간 타입 ${t}`);
    assert.ok(ROOM_DESIGNS[id], `없는 디자인 ${id}`);
    assert.equal(ROOM_DESIGNS[id].roomType, t, `${id}: 기본으로 걸린 용도와 디자인의 용도가 다르다`);
  }
  assert.equal(defaultDesignFor('meeting'), 'corporateMeeting');
  assert.equal(defaultDesignFor('control'), 'controlRoom');
  // 아직 다루지 않는 공간에는 **억지로 회의실 디자인을 붙이지 않는다.**
  for (const t of ['classroom', 'hall_s', 'hall_m', 'hall_l', 'ideation', undefined, '없는용도']) {
    assert.equal(defaultDesignFor(t), null, `${String(t)}: 디자인 없음이어야 한다`);
  }

  // 모르는 id는 특정 공간의 디자인이 아니라 '디자인 없음'이다.
  for (const bad of [undefined, null, '', 0, false, '없는디자인', 'CorporateMeeting']) {
    assert.equal(roomDesign(bad), NEUTRAL_DESIGN, `${String(bad)} → 디자인 없음`);
    assert.equal(roomDesign(bad).id, null);
  }

  // **예전 세션에는 design 값이 아예 없다.** 용도에 맞는 기본으로 떨어져야 한다.
  assert.equal(normalizeDesign(undefined, 'meeting'), 'corporateMeeting');
  assert.equal(normalizeDesign(undefined, 'control'), 'controlRoom');
  for (const t of ['classroom', 'hall_s', 'hall_m', 'hall_l', 'ideation']) {
    assert.equal(normalizeDesign(undefined, t), null, `${t}: 디자인 없음으로 복원`);
  }
  assert.equal(normalizeDesign(undefined, undefined), null);
  // 용도와 안 맞는 디자인도 **그 용도의** 기본으로 되돌린다(회의실 디자인으로 새지 않는다).
  assert.equal(normalizeDesign('controlRoom', 'meeting'), 'corporateMeeting');
  assert.equal(normalizeDesign('executiveBoardroom', 'control'), 'controlRoom');
  assert.equal(normalizeDesign('executiveBoardroom', 'hall_l'), null);
  assert.equal(normalizeDesign('executiveBoardroom', 'meeting'), 'executiveBoardroom');
  assert.equal(normalizeDesign('controlRoom', 'control'), 'controlRoom');
});

// PHASE 1-a.1 의 핵심 — 이 테스트가 없으면 PHASE 2에서 조용히 깨진다.
test('fallback 격리 — corporateMeeting은 "모든 공간의 기본"이 아니라 "회의실의 기본"이다', () => {
  // 회의실이 아닌 용도에서 corporateMeeting이 나오는 경로가 **하나도 없어야** 한다.
  const NON_MEETING = ROOM_TYPE_IDS.filter(t => t !== 'meeting');
  for (const t of NON_MEETING) {
    for (const saved of [undefined, null, '', '없는디자인', 'corporateMeeting', 'executiveBoardroom', 'largeConference']) {
      const got = normalizeDesign(saved, t);
      assert.notEqual(got, 'corporateMeeting', `${t}: 저장값 ${String(saved)} 이 회의실 디자인으로 샜다`);
      assert.ok(got === null || ROOM_DESIGNS[got].roomType === t, `${t}: 남의 용도 디자인 ${got}`);
    }
    assert.ok(!designsFor(t).some(d => d.id === 'corporateMeeting'), `${t}: 고를 수 있는 목록에 회의실 디자인이 있다`);
  }

  // PHASE 2 모의 — corporateMeeting에 실제 값이 채워진 뒤에도 다른 공간은 영향이 없다.
  //   normalizeDesign이 그 디자인에 **닿지 않으므로**, 값이 무엇이든 강당·강의실은 그대로다.
  const asIfPhase2 = { ...ROOM_DESIGNS.corporateMeeting, furniture: { chair: 'corporateChair' } };
  assert.equal(asIfPhase2.furniture.chair, 'corporateChair');   // 값이 들어갔다고 가정
  //   상황실은 PHASE 5-a 에서 **제 의자**를 정했으므로 INHERIT 가 아니다 —
  //   여기서 볼 것은 '회의실 값이 샜는가'이지 '값이 있는가'가 아니다.
  for (const t of NON_MEETING) {
    const id = normalizeDesign(undefined, t);
    const r = resolveDesign(id);
    for (const f of VALUE_FIELDS) {
      const ids = appliedIds(r[f]);
      assert.ok(!ids.some(x => String(x).startsWith('corporate')),
        `${t}.${f}: 회의실 값이 새어 들어왔다 — ${ids.join(', ')}`);
    }
  }
});

test('고를 수 있는 목록 — 회의실 3종·상황실 1종, 나머지 용도는 없음', () => {
  assert.deepEqual(designsFor('meeting').map(d => d.id),
    ['corporateMeeting', 'executiveBoardroom', 'largeConference']);
  assert.deepEqual(designsFor('control').map(d => d.id), ['controlRoom']);
  // 아직 디자인이 붙지 않은 용도 — **빈 목록**이다. 화면은 그때 선택칸을 그리지 않는다.
  //   여기에 회의실 디자인을 끼워 넣으면 강당 화면에 '대기업 회의실'이 뜬다.
  for (const t of ['classroom', 'hall_s', 'hall_m', 'hall_l', 'ideation']) {
    assert.deepEqual(designsFor(t).map(d => d.id), [], t);
  }
  assert.deepEqual(designsFor(undefined).map(d => d.id), []);
});

// ── PHASE 1-a 의 핵심 안전장치 ──────────────────────────────────────────────

test('아직 구현하지 않은 1개 공간 — 적용해도 화면이 바뀌지 않는다(전부 INHERIT)', () => {
  // PHASE 5-a 에서 상황실에도 **의자 하나**가 들어갔다(그 외 항목은 여전히 전부 planned).
  //   이제 아무것도 정하지 않은 공간은 **하나도 없다** — 대신 각 공간이 '정한 것만' 정했는지 본다.
  const STARTED = ['corporateMeeting', 'executiveBoardroom', 'largeConference', 'controlRoom'];
  assert.deepEqual(DESIGN_IDS.filter(x => !STARTED.includes(x)), []);
  // 상황실이 정한 것은 **가구 2종 + AV 2종 + 마감 + 벽 구성 + 조명 + 화각**이다. 소품만 planned 다.
  const ctrl = resolveDesign('controlRoom');
  assert.deepEqual(VALUE_FIELDS.flatMap(f => appliedIds(ctrl[f])),
    ['taskChair', 'curvedConsole', 'consoleMonitor', 'keyboard', 'controlPalette',
      'carpetTileDark', 'paintedWallWhite', 'acousticPanel', 'neutralLaminate', 'darkGraphite',
      'neutralLaminate', 'darkGraphite', 'darkGraphite', 'controlWalls', 'controlTechnical',
      'controlProposal'],
    '상황실이 가구·AV·마감·벽·조명·화각 말고 다른 것까지 정했다 (소품은 아직이다)');
  assert.equal(isNeutralDesign('controlRoom'), false, '상황실은 이제 의자를 정한다');
  assert.equal(isNeutralDesign('corporateMeeting'), false, '회의실은 이제 의자를 정한다');
  // 대회의실은 가구·AV(4-a~4-c)와 마감(4-d.1)까지 정했다 — 조명·화각·벽 구성은 아직 planned 다.
  assert.equal(isNeutralDesign('largeConference'), false, '대회의실은 이제 가구를 정한다');
  const lc = resolveDesign('largeConference');
  assert.equal(lc.furniture.chair, 'conferenceErgoChair');
  assert.equal(lc.furniture.table, 'largeUTable');
  assert.equal(lc.palette, 'conferenceBright');
  assert.equal(lc.lighting, 'conferenceSoft');
  assert.equal(lc.camera, 'conferenceProposal', 'PHASE 4-d.3 에서 대회의실 전용 화각이 켜졌다');
  for (const f of ['wallTreatment', 'accessories']) {
    assert.equal(lc[f], INHERIT, `largeConference.${f} 가 아직 INHERIT가 아니다`);
  }
});

test('corporateMeeting — PHASE 2-d.2 에서 가구·마감·조명·화각을 정한다(벽 구성·소품은 INHERIT)', () => {
  const d = ROOM_DESIGNS.corporateMeeting;
  assert.equal(d.status, DESIGN_STATUS.READY, '지금 쓸 수 있는 유일한 디자인이다');
  assert.equal(d.phase, 2);
  assert.deepEqual({ ...d.furniture }, { chair: 'corporateChair', table: 'corporateTable' });
  // 마감은 바닥·벽·수납장 세 자리. 이름은 전부 기존 13종 또는 그 별칭이다.
  assert.equal(d.palette, 'corporateNeutral');
  assert.equal(d.materials.floor, 'carpetTileLight');
  assert.equal(d.materials.wall, 'paintedWallWhite');
  assert.equal(d.materials.credenza, 'blackEquipment');
  assert.equal(d.lighting, 'corporateSoft');
  assert.equal(d.camera, 'corporateProposal');
  // 벽 구성·소품은 여전히 비어 있어야 한다 — 누가 값을 채우면 테스트가 잡는다.
  for (const f of ['wallTreatment', 'accessories']) {
    assert.equal(d[f], INHERIT, `corporateMeeting.${f} 에 값을 넣으면 현재 화면이 더 바뀐다`);
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
  // 별칭(carpetTileLight 등)도 실재하는 재질이다 — 정식 id로 풀리면 된다.
  const known = new Set([...Object.keys(MATERIAL_PRESETS), ...Object.keys(FURNITURE_ASSETS)]);
  //   팔레트 이름도 '적용되는 값'이다 — 실재하는 팔레트로 풀려야 한다(가짜 스펙 금지).
  const exists = x => known.has(x) || !!resolveMaterialId(x) || !!designPalette(x)
    || !!lightingPreset(x) || CAMERA_PLAN_IDS.has(x) || WALL_PLAN_IDS.includes(x);
  for (const id of DESIGN_IDS) {
    const r = resolveDesign(id);
    const ids = VALUE_FIELDS.flatMap(f => appliedIds(r[f]));
    // **적용되는 값은 반드시 실재해야 한다.** 이것이 '가짜 스펙 금지'의 핵심이다.
    for (const x of ids) assert.ok(exists(x), `${id}: 없는 자산·재질 ${x}`);
  }
  // 지금 실제로 적용되는 값 — 네 공간의 가구·AV·마감 한 벌씩(상황실은 PHASE 5-a~5-d.1).
  //   대회의실의 벽 구성·소품은 아직 planned 다. 상황실은 가구·AV 말고 전부 planned 다.
  const applied = DESIGN_IDS.flatMap(id => VALUE_FIELDS.flatMap(f => appliedIds(resolveDesign(id)[f])));
  assert.deepEqual(applied.slice().sort(), [
    'acousticPanel', 'acousticPanel', 'blackEquipment', 'blackEquipment', 'boardroomTable', 'carpetTileDark',
    'carpetTileLight', 'carpetTileLight', 'carpetTileLight', 'conferenceBright', 'conferenceErgoChair',
    'conferenceProposal', 'conferenceSoft', 'consoleMonitor', 'controlPalette', 'controlProposal', 'controlTechnical', 'controlWalls', 'corporateChair',
    'corporateNeutral', 'corporateProposal', 'corporateSoft', 'corporateTable', 'curvedConsole',
    'darkGraphite', 'darkGraphite', 'darkGraphite', 'darkGraphite', 'darkGraphite',
    'darkGraphite', 'darkGraphite', 'darkGraphite', 'darkGraphite', 'darkGraphite',
    'executiveBright', 'executiveChair', 'executiveProposal', 'executiveSoft', 'keyboard',
    'largeUTable', 'lightAsh', 'lightOak', 'neutralLaminate', 'neutralLaminate',
    'neutralLaminate', 'paintedWallWhite', 'paintedWallWhite', 'paintedWallWhite', 'paintedWallWhite',
    'personalMonitor', 'prompter', 'taskChair',
  ], `적용값이 늘었다: ${applied.join(', ')}`);
  for (const id of applied) {
    assert.ok(FURNITURE_ASSETS[id] || resolveMaterialId(id) || designPalette(id)
      || lightingPreset(id) || CAMERA_PLAN_IDS.has(id) || WALL_PLAN_IDS.includes(id),
      `${id} 는 실재하는 가구·재질·팔레트·조명·화각·벽 구성이어야 한다`);
  }
  // 아직 구현 전인 것만 planned 표시를 단다(빈 껍데기가 아니라 '계획'이라는 뜻).
  //   지금 그런 공간은 상황실 하나뿐이다.
  for (const id of ['controlRoom']) {
    assert.equal(ROOM_DESIGNS[id].status, DESIGN_STATUS.PLANNED, id);
    assert.ok(ROOM_DESIGNS[id].phase >= 3, `${id}: PHASE 3 이후 구현`);
  }
  // 릴리스 게이트를 통과한 회의실 3종은 ready 다.
  //   임원은 PHASE 3-e, 대회의실은 PHASE 4-e 에서 판정을 받았다.
  for (const id of ['corporateMeeting', 'executiveBoardroom', 'largeConference']) {
    assert.equal(ROOM_DESIGNS[id].status, DESIGN_STATUS.READY, id);
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
  // 호출하는 쪽은 normalizeDesign()을 거친 값을 넘긴다 — 그 경로에서 변형이 제대로 걸린다.
  assert.equal(DEFAULT_ROOM_TYPE, 'meeting');
  assert.equal(layoutPlan(normalizeDesign(undefined, 'meeting'), 'meeting').variant, 'corporate-standard');
  assert.equal(layoutPlan(normalizeDesign(undefined, 'control'), 'control').variant, 'curved-console');
  // 디자인이 없는 공간은 변형도 없다 = 기존 배치 그대로.
  for (const t of ['classroom', 'hall_s', 'hall_m', 'hall_l', 'ideation']) {
    assert.equal(layoutPlan(normalizeDesign(undefined, t), t).variant, null, t);
  }
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
  //   디자인이 정하는 것은 **가구의 생김새와 마감·조명·화각**뿐이다 — 계산에는 닿지 않는다.
  const CAM = { corporateMeeting: 'corporateProposal', executiveBoardroom: 'executiveProposal',
    largeConference: 'conferenceProposal', controlRoom: 'controlProposal' };
  for (const id of [...DESIGN_IDS, undefined]) {
    if (CAM[id]) { assert.equal(resolveDesign(id).camera, CAM[id], id); continue; }
    assert.equal(resolveDesign(id).camera, INHERIT, `${id}: 화각은 아직 디자인이 정하지 않는다`);
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
  frozen(NEUTRAL_DESIGN, 'NEUTRAL_DESIGN');
  frozen(DEFAULT_DESIGN_BY_ROOM_TYPE, 'DEFAULT_DESIGN_BY_ROOM_TYPE');
  // 해석 결과와 배치 계획도 호출한 쪽이 고칠 수 없어야 한다(캐시된 값을 오염시키지 않게).
  for (const id of DESIGN_IDS) assert.ok(Object.isFrozen(resolveDesign(id)), `resolveDesign(${id})`);
  assert.ok(Object.isFrozen(layoutPlan('corporateMeeting', 'meeting')));
  assert.ok(Object.isFrozen(designsFor('meeting')));
});

// ── PHASE 1-b.1 · 이름 계약 ────────────────────────────────────────────────
test('재질 이름 계약 — 디자인이 적어 둔 재질 이름이 전부 실재하는 재질로 풀린다', () => {
  // 디자인 선언의 `materials` 칸에 적힌 이름(planned 표시 포함)은 PHASE 2에서 그대로 쓰인다.
  //   그때 가서 "그런 재질 없음"이 되면 조용히 기본 재질로 빠진다 — 지금 막아 둔다.
  const names = [];
  const walk = v => {
    if (!v) return;
    if (isPlanned(v)) { names.push(v.planned); return; }
    if (typeof v === 'string') { names.push(v); return; }
    if (typeof v === 'object') for (const x of Object.values(v)) walk(x);
  };
  for (const id of DESIGN_IDS) walk(ROOM_DESIGNS[id].materials);
  assert.ok(names.length >= 12, `검사할 재질 이름이 너무 적다 (${names.length})`);
  for (const n of names) {
    const canonical = resolveMaterialId(n);
    assert.ok(canonical, `디자인이 가리키는 재질 '${n}' 이 없다`);
    assert.ok(MATERIAL_IDS.includes(canonical), `'${n}' 이 정식 재질로 풀리지 않는다`);
    assert.ok(MATERIAL_PRESETS[canonical], `'${n}' → '${canonical}' 프리셋 없음`);
  }
  // paintedWallWhite 는 **별칭**이어야 한다 — 같은 질감의 재질을 두 벌 만들지 않는다.
  assert.equal(resolveMaterialId('paintedWallWhite'), 'paintedWall');
  assert.ok(!MATERIAL_IDS.includes('paintedWallWhite'), '별칭이 정식 재질이 되어 버렸다');
});
