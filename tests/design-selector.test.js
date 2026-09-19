// design-selector.test.js — 공간 디자인 선택기 회귀 테스트. (PHASE 4-d.4)
// ─────────────────────────────────────────────────────────────────────────────
// 이 단계가 고친 것은 **'고른 값이 화면에 도달하지 못하던 것'**이다.
//   고치기 전: app.js 가 디자인 id를 **상태로 갖고 있지 않았다.** 언제나
//     `normalizeDesign(undefined, roomTypeId)`를 불러 그 용도의 기본값(대기업 회의실)으로
//     떨어뜨렸다. 그래서 임원 회의실·대회의실은 코드에 다 있는데도 **제품에서 고를 수 없었다.**
//   고친 뒤: `designId` 하나가 유일한 출처가 되어 배치·가구·마감·조명·화각까지 내려간다.
// 여기서 지키는 것.
//   ① 고를 것이 둘 이상인 용도(= 지금은 회의실)에만 선택칸이 나온다.
//   ② 기본값은 지금까지와 같은 대기업 회의실이고, 없는 값·이상한 값도 거기로 떨어진다.
//   ③ 고른 디자인이 **다섯 층 전부**(가구·마감·조명·화각·배치 옵션)에 도달한다.
//   ④ 한 디자인에서만 쓰는 값이 다른 디자인에 새지 않는다(테이블 방향·AV).
//   ⑤ 저장은 **기존 구성(config) 규격**에 얹는다 — 새 저장 체계를 만들지 않았다.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ROOM_DESIGNS, DESIGN_IDS, designsFor, normalizeDesign, defaultDesignFor,
  DEFAULT_DESIGN_BY_ROOM_TYPE, resolveDesign, INHERIT,
} from '../src/room-design.js';
import { ROOM_TYPES, layoutRoom, defaultOptions, normalizeOptions, optionsForDesign,
  tableDirOf, TABLE_DIR_DESIGNS } from '../src/room-presets.js';
import { CONFIG_DEFAULTS, normalizeConfig } from '../src/config.js';
import { lightingForDesign } from '../src/design-lighting.js';
import { roomFinishForDesign } from '../src/design-finish.js';
import { conferenceCameraPlanId, corporateCameraPlanId, executiveCameraPlanId } from '../src/design-camera.js';
import { MATERIAL_PRESETS } from '../src/materials.js';
import { MODELS } from '../src/models.js';
import { computeConfig } from '../src/engine.js';

const CO = 'corporateMeeting', EX = 'executiveBoardroom', LC = 'largeConference';
const appSrc = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const htmlSrc = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');

// ── A. 선택기가 있는가 · 어디에 나오는가 (§17 ①②) ─────────────────────────

test('① 화면에 공간 디자인 선택칸이 있다', () => {
  assert.match(htmlSrc, /id="roomDesignField"/, '디자인 칸이 마크업에 없다');
  assert.match(htmlSrc, /<select id="roomDesign">/, '디자인 선택칸이 없다');
  assert.match(htmlSrc, /공간 디자인/, '라벨이 없다');
  // 화면이 목록을 **직접 적지 않고** designsFor()로 받아 채운다(출처가 갈라지지 않게).
  assert.match(appSrc, /function renderRoomDesigns\(\)/);
  assert.match(appSrc, /designsFor\(roomTypeId\)/);
  // 이름표는 **데이터에서** 온다 — 화면 코드에 적혀 있으면 목록의 출처가 둘이 된다.
  //   (설명 주석에 이름이 나오는 것은 상관없으므로 주석을 지우고 본다.)
  const code = appSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    .replace(/([^:])\/\/.*$/gm, '$1');
  for (const name of ['대기업 회의실', '임원 회의실', '대회의실']) {
    assert.ok(!code.includes(name), `app.js 코드가 '${name}'을 직접 적고 있다`);
  }
  assert.match(appSrc, /\$\{esc\(d\.label\)\}/, '이름표를 데이터에서 가져오지 않는다');
});

test('② 고를 것이 둘 이상인 용도에만 나온다 — 지금은 회의실뿐이다', () => {
  // 규칙을 용도 이름으로 박지 않았다. '목록이 2개 이상'이 조건이다.
  assert.match(appSrc, /const show = list\.length > 1;/);
  assert.match(appSrc, /field\.hidden = !show;/);
  const many = ROOM_TYPES.filter(t => designsFor(t.id).length > 1).map(t => t.id);
  assert.deepEqual(many, ['meeting'], `지금 선택칸이 나오는 용도: ${many.join(', ')}`);
  // 나머지 용도는 0개이거나 1개다 — 0개면 디자인 없음, 1개면 '고를 것'이 아니다.
  for (const t of ROOM_TYPES) {
    if (t.id === 'meeting') continue;
    assert.ok(designsFor(t.id).length <= 1, `${t.id}: ${designsFor(t.id).length}종`);
  }
});

test('③④⑤ 회의실에서 고를 수 있는 것은 정확히 세 가지다', () => {
  const ids = designsFor('meeting').map(d => d.id);
  assert.deepEqual(ids, [CO, EX, LC]);
  assert.deepEqual(designsFor('meeting').map(d => d.label),
    ['대기업 회의실', '임원 회의실', '대회의실']);
});

// ── B. 기본값과 안전한 되돌림 (§17 ⑥⑦⑧) ──────────────────────────────────

test('⑥⑦⑧ 기본값은 대기업 회의실 — 없는 값·이상한 값도 거기로 떨어진다', () => {
  assert.equal(DEFAULT_DESIGN_BY_ROOM_TYPE.meeting, CO);
  assert.equal(defaultDesignFor('meeting'), CO);
  // 예전 저장본(항목 없음) · 모르는 값 · 용도가 안 맞는 값 → 전부 대기업 회의실.
  for (const v of [undefined, null, '', '없는디자인', 0, {}, [], true, 'controlRoom']) {
    assert.equal(normalizeDesign(v, 'meeting'), CO, String(v));
  }
  assert.equal(normalizeConfig({}).roomDesign, null, '저장본에는 null로 남는다');
  assert.equal(CONFIG_DEFAULTS.roomDesign, null);
  // 화면이 시작할 때도 같은 함수로 정한다(기본값을 두 곳에 적지 않는다).
  assert.match(appSrc, /let designId = normalizeDesign\(undefined, DEFAULT_ROOM_TYPE\);/);
  // 디자인이 없는 용도는 null 이다 — 회의실 디자인이 강당에 따라붙지 않는다.
  for (const t of ['hall_s', 'hall_m', 'hall_l']) {
    assert.equal(normalizeDesign(LC, t), null, t);
  }
  // 교육장은 PHASE 7-a, 아이디에이션은 PHASE 8-2a 에서 제 디자인이 생겼다 —
  //   회의실 값을 넣어도 **그 용도의 것**으로 떨어진다.
  assert.equal(normalizeDesign(LC, 'classroom'), 'trainingRoom');
  assert.equal(normalizeDesign(LC, 'ideation'), 'ideationRoom');
});

// ── C. 고른 값이 다섯 층에 도달하는가 (§17 ⑨⑩⑪ ⑰⑱⑲) ────────────────────

test('⑨⑩⑪ 세 디자인의 가구·마감·조명·화각이 각자 제 것으로 풀린다', () => {
  const STACK = {
    [CO]: { chair: 'corporateChair', table: 'corporateTable', palette: 'corporateNeutral',
      lighting: 'corporateSoft', camera: 'corporateProposal' },
    [EX]: { chair: 'executiveChair', table: 'boardroomTable', palette: 'executiveBright',
      lighting: 'executiveSoft', camera: 'executiveProposal' },
    [LC]: { chair: 'conferenceErgoChair', table: 'largeUTable', palette: 'conferenceBright',
      lighting: 'conferenceSoft', camera: 'conferenceProposal' },
  };
  for (const [id, want] of Object.entries(STACK)) {
    const r = resolveDesign(id);
    assert.equal(r.furniture.chair, want.chair, `${id}: 의자`);
    assert.equal(r.furniture.table, want.table, `${id}: 테이블`);
    assert.equal(r.palette, want.palette, `${id}: 마감`);
    assert.equal(r.lighting, want.lighting, `${id}: 조명`);
    assert.equal(r.camera, want.camera, `${id}: 화각`);
    // 실제 해석기까지 내려가는지 — 이름만 맞고 값이 안 나오면 의미가 없다.
    assert.equal(lightingForDesign(id).id, want.lighting, `${id}: 조명 해석`);
    assert.ok(roomFinishForDesign(id), `${id}: 마감 해석`);
  }
  // 화각은 계열이 서로 섞이지 않는다.
  assert.equal(corporateCameraPlanId(CO, 'interior'), 'interior');
  assert.equal(executiveCameraPlanId(EX, 'interior'), 'interior');
  assert.equal(conferenceCameraPlanId(LC, 'interior'), 'interior');
  for (const [id, wrong] of [[CO, conferenceCameraPlanId], [CO, executiveCameraPlanId],
    [EX, conferenceCameraPlanId], [EX, corporateCameraPlanId],
    [LC, corporateCameraPlanId], [LC, executiveCameraPlanId]]) {
    assert.equal(wrong(id, 'interior'), null, `${id} 가 남의 계열로 풀렸다`);
  }
});

test('⑰⑱⑲ 대회의실 전용 마감·조명·화각이 대회의실에서만 켜진다', () => {
  assert.equal(resolveDesign(LC).palette, 'conferenceBright');
  assert.equal(lightingForDesign(LC).id, 'conferenceSoft');
  assert.equal(conferenceCameraPlanId(LC, 'interior'), 'interior');
  for (const id of [CO, EX, 'controlRoom', null, undefined, '없는것']) {
    assert.notEqual(resolveDesign(id).palette, 'conferenceBright', String(id));
    assert.notEqual(lightingForDesign(id)?.id, 'conferenceSoft', String(id));
    assert.equal(conferenceCameraPlanId(id, 'interior'), null, String(id));
  }
});

// ── D. 한 디자인의 값이 남에게 새지 않는가 (§17 ⑫⑬⑭⑮⑯ ㉒㉓) ─────────────

test('⑫⑬⑭ 테이블 방향 칸은 대회의실에서만 나온다', () => {
  assert.ok(optionsForDesign('meeting', LC).some(o => o.key === 'tableDir'));
  for (const id of [CO, EX, null, undefined, '없는것']) {
    assert.ok(!optionsForDesign('meeting', id).some(o => o.key === 'tableDir'), String(id));
  }
  // 화면도 **고른 디자인**으로 목록을 거른다(예전엔 언제나 기본 디자인이었다).
  assert.match(appSrc, /optionsForDesign\(roomTypeId, designId\)/);
});

test('⑮⑯ 세로(along)가 저장에 남아 있어도 대기업·임원 배치는 그대로다', () => {
  const opts = { ...defaultOptions('meeting'), tableShape: 'u', seats: 20, tableDir: 'along' };
  for (const id of [CO, EX]) {
    assert.equal(tableDirOf({ design: id, tableDir: 'along' }), 'across', id);
    const withStale = layoutRoom('meeting', opts, { W: 12000, D: 9000, ledBottom: 1000, design: id });
    const clean = layoutRoom('meeting', { ...opts, tableDir: 'across' },
      { W: 12000, D: 9000, ledBottom: 1000, design: id });
    // 좌표 한 자리까지 같아야 한다 — 남은 값이 배치를 흔들면 안 된다.
    assert.deepEqual(withStale.items, clean.items, `${id}: 남은 세로 값이 배치를 바꿨다`);
    assert.equal(withStale.capacity, clean.capacity, id);
  }
  // 대회의실에서만 실제로 세로가 걸린다.
  assert.equal(tableDirOf({ design: LC, tableDir: 'along' }), 'along');
  assert.deepEqual([...TABLE_DIR_DESIGNS], [LC]);
});

test('㉒㉓ 개인 모니터·프롬프터는 대회의실에서만 놓인다', () => {
  const opts = { ...defaultOptions('meeting'), tableShape: 'u', seats: 24 };
  const at = id => layoutRoom('meeting', opts, { W: 14000, D: 10000, ledBottom: 1000, design: id }).items;
  const lc = at(LC);
  assert.ok(lc.some(i => i.type === 'monitor'), '대회의실에 개인 모니터가 없다');
  assert.ok(lc.some(i => i.type === 'prompter'), '대회의실에 프롬프터가 없다');
  for (const id of [CO, EX, null, undefined]) {
    const items = at(id);
    assert.ok(!items.some(i => i.type === 'monitor'), `${String(id)}: 개인 모니터가 샜다`);
    assert.ok(!items.some(i => i.type === 'prompter'), `${String(id)}: 프롬프터가 샜다`);
  }
});

test('㉔ 디자인을 오가도 결과가 흔들리지 않는다', () => {
  const opts = { ...defaultOptions('meeting'), tableShape: 'u', seats: 24, tableDir: 'along' };
  const room = { W: 14000, D: 10000, ledBottom: 1000 };
  const snap = id => JSON.stringify(layoutRoom('meeting', opts, { ...room, design: id }).items);
  const order = [CO, EX, LC, CO, LC, EX, CO];
  const first = {};
  for (const id of order) {
    const s = snap(id);
    if (first[id] === undefined) first[id] = s;
    else assert.equal(s, first[id], `${id}: 오갔더니 결과가 달라졌다`);
  }
  // 세 디자인의 결과는 서로 달라야 한다(전환이 실제로 무언가를 바꾼다는 증거).
  assert.notEqual(first[CO], first[LC]);
  assert.notEqual(first[EX], first[LC]);
});

// ── E. 저장은 기존 규격에 얹는다 (§17 ㉕) ─────────────────────────────────

test('㉕ 저장은 기존 구성(config) 규격 그대로 — 새 저장 체계를 만들지 않았다', () => {
  // 구성 객체에 한 칸이 늘었을 뿐이다(roomType·roomOpts와 같은 자리).
  assert.ok('roomDesign' in CONFIG_DEFAULTS);
  assert.equal(normalizeConfig({ roomDesign: LC }).roomDesign, LC);
  // app.js 가 그 칸을 채우고 읽는다.
  assert.match(appSrc, /roomDesign: designId/);
  assert.match(appSrc, /designId = normalizeDesign\(c\.roomDesign, roomTypeId\)/);
  // 저장은 **기존 함수**를 부른다 — localStorage를 직접 만지는 새 코드가 없다.
  assert.match(appSrc, /\$\('#roomDesign'\)\?\.addEventListener\('change'[\s\S]{0,220}saveLastSession\(\)/);
  // localStorage를 직접 만지는 곳이 **하나도 늘지 않았다**(기존 8곳 그대로).
  //   늘었다면 이 단계가 별도 저장 경로를 만들었다는 뜻이다(오너 지침 §9 금지).
  const stores = appSrc.match(/localStorage\.setItem\(/g) || [];
  assert.equal(stores.length, 8, `localStorage 직접 저장 지점이 달라졌다: ${stores.length}`);
  // 디자인·좌석 옵션은 전부 기존 saveLastSession() 하나를 통해 저장된다.
  assert.match(appSrc, /function saveLastSession\(\) \{ try \{ localStorage\.setItem\(LAST_KEY/);
});

// ── F. 손대지 않은 것 (§17 ⑳㉑㉚㉛㉜) ─────────────────────────────────────

test('⑳㉑ 대기업·임원 디자인이 한 값도 바뀌지 않았다', () => {
  const co = ROOM_DESIGNS[CO], ex = ROOM_DESIGNS[EX];
  assert.deepEqual({ ...co.furniture }, { chair: 'corporateChair', table: 'corporateTable' });
  assert.equal(co.palette, 'corporateNeutral');
  assert.equal(co.lighting, 'corporateSoft');
  assert.equal(co.camera, 'corporateProposal');
  assert.equal(ex.furniture.chair, 'executiveChair');
  assert.equal(ex.furniture.table, 'boardroomTable');
  assert.equal(ex.palette, 'executiveBright');
  assert.equal(ex.lighting, 'executiveSoft');
  assert.equal(ex.camera, 'executiveProposal');
});

test('㉙㉚ 다른 용도는 그대로 · 정식 재질 13종 유지', () => {
  // 디자인이 붙지 않은 용도는 전부 INHERIT 다(적용해도 화면이 바뀌지 않는다).
  for (const t of ['hall_s', 'hall_m', 'hall_l']) {
    assert.deepEqual(designsFor(t).map(d => d.id), [], t);
    assert.equal(defaultDesignFor(t), null, t);
  }
  // 아이디에이션도 하나뿐이라 선택칸이 뜨지 않는다(PHASE 8-2a).
  assert.deepEqual(designsFor('ideation').map(d => d.id), ['ideationRoom']);
  assert.equal(defaultDesignFor('ideation'), 'ideationRoom');
  // 교육장은 디자인이 하나뿐이라 선택칸이 뜨지 않는다(상황실과 같은 규칙).
  assert.deepEqual(designsFor('classroom').map(d => d.id), ['trainingRoom']);
  assert.equal(defaultDesignFor('classroom'), 'trainingRoom');
  assert.equal(Object.keys(MATERIAL_PRESETS).length, 13);
});

test('㉛㉜ 계산기와 가격표 동작이 그대로다', () => {
  const MP012F = MODELS.find(m => m.id === 'MP012F');
  const r = computeConfig(MP012F, 6000, 3400, { mode: 'manual', cols: 7, rows: 6 });
  assert.equal(r.total, 42);
  assert.equal(r.maxW, 6132);
  assert.ok(Math.abs(r.heatMaxBTU - 20916) < 20);
  // 선택기가 계산기·가격표에 닿지 않는다.
  assert.ok(!/prices\.local/.test(appSrc.slice(appSrc.indexOf('function renderRoomDesigns'),
    appSrc.indexOf('function renderRoomOptions'))), '선택기가 가격표를 읽는다');
  // 구성 규격은 여전히 가격을 담지 않는다.
  assert.ok(!('prices' in CONFIG_DEFAULTS));
});

// ── G. 렌더러가 화면 값을 직접 읽지 않는가 (§3) ───────────────────────────

test('렌더러는 화면(DOM)에서 디자인을 직접 읽지 않는다 — 출처는 designId 하나다', () => {
  for (const f of ['render3d-gl.js', 'gl-model.js', 'furniture-gl.js', 'design-camera.js',
    'design-lighting.js', 'design-finish.js', 'room-presets.js', 'room-design.js']) {
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    assert.ok(!/#roomDesign|roomDesignField/.test(src), `${f} 가 화면 값을 직접 읽는다`);
  }
  // app.js 안에서도 '지금 고른 디자인'을 읽는 곳은 designId 하나뿐이다.
  assert.ok(!/normalizeDesign\(undefined, roomTypeId\)/.test(appSrc),
    '아직 기본 디자인으로 되돌리는 지름길이 남아 있다');
});
