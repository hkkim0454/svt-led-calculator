// table-finish.test.js — 테이블 모양을 바꿔도 마감 정체성이 유지되는가. (PHASE 4-d.5)
// ─────────────────────────────────────────────────────────────────────────────
// 무엇이 문제였나.
//   전용 테이블 자산은 **자기가 아는 모양만** 세운다. 대회의실 `largeUTable`은 U자 조각을
//   읽어 세우고, 보트·사각형이 오면 세우지 못한다. 그때는 기존 **범용 테이블이 대신 선다**
//   (설계된 폴백 — 화면에서 테이블이 사라지지 않게 하는 장치다).
//   그런데 그 범용 테이블의 부품 이름은 `tableTop`·`tableBase`·`tableBeam` 이라
//   공간별 마감표(전용 부품 이름만 있다)에 걸리지 않았다.
//   → **같은 대회의실인데 테이블 모양만 바꾸면 상판 색이 달라졌다**(#e2ddd1 → #ece6db).
//
// 어떻게 고쳤나 — **형상을 새로 만들지 않고 마감 라우팅만** 일반화했다.
//   그 공간의 전용 부품 마감을 그대로 빌려 범용 부품에 입힌다(새 색·새 재질 없음).
//   빌려 갈 디자인은 표에 이름이 있는 것뿐이다 — 대기업·임원은 예전 그대로다.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DESIGN_PALETTES, tablePartFinishForDesign, GENERIC_TABLE_FINISH, GENERIC_TABLE_PARTS,
  TABLE_PARTS, CONFERENCE_TABLE_PARTS, ALL_TABLE_PARTS,
} from '../src/design-finish.js';
import { MATERIAL_PRESETS } from '../src/materials.js';
import { ROOM_DESIGNS, DESIGN_STATUS, resolveDesign } from '../src/room-design.js';
import { layoutRoom, defaultOptions } from '../src/room-presets.js';
import { createConferenceTable } from '../src/furniture-assets.js';
import { lightingForDesign } from '../src/design-lighting.js';
import { CONFERENCE_CAMERA_PLANS, CONFERENCE_FOV_RANGE } from '../src/design-camera.js';
import { MODELS } from '../src/models.js';
import { computeConfig } from '../src/engine.js';

const CO = 'corporateMeeting', EX = 'executiveBoardroom', LC = 'largeConference';
const finSrc = readFileSync(new URL('../src/design-finish.js', import.meta.url), 'utf8');
const glSrc = readFileSync(new URL('../src/furniture-gl.js', import.meta.url), 'utf8');
const SHAPES = ['u', 'boat', 'rect'];
const DIRS = ['across', 'along'];

const items = (design, shape, dir) => layoutRoom('meeting',
  { ...defaultOptions('meeting'), tableShape: shape, seats: 24, tableDir: dir, rug: true },
  { W: 14000, D: 10000, ledBottom: 1000, design }).items;

// ── A. 대회의실 — 모양이 달라도 같은 마감 (§23 ①~⑥) ──────────────────────

test('①② 대회의실 U자 상판·하부는 승인된 값 그대로다', () => {
  const f = tablePartFinishForDesign(LC);
  assert.deepEqual({ ...f.conferenceTop },
    { material: 'lightAsh', color: '#e2ddd1', canonical: 'neutralLaminate' });
  assert.deepEqual({ ...f.conferenceBase },
    { material: 'darkGraphite', color: '#3a3f46', canonical: 'darkGraphite', roughness: 0.7 });
});

test('③④⑤⑥ 보트·사각형(범용 폴백)도 **같은 마감**을 받는다', () => {
  const f = tablePartFinishForDesign(LC);
  // 상판 — 전용 U자 상판과 색·재질·거칠기까지 **한 값도 다르지 않아야** 한다.
  assert.deepEqual({ ...f.tableTop }, { ...f.conferenceTop });
  // 하부·보 — 전용 하부와 같다.
  assert.deepEqual({ ...f.tableBase }, { ...f.conferenceBase });
  assert.deepEqual({ ...f.tableBeam }, { ...f.conferenceBase });
  // 표가 '어디서 빌려 오는지'를 밝힌다(값을 두 곳에 적지 않는다).
  assert.deepEqual({ ...GENERIC_TABLE_FINISH[LC] },
    { tableTop: 'conferenceTop', tableBase: 'conferenceBase', tableBeam: 'conferenceBase' });
  assert.deepEqual([...GENERIC_TABLE_PARTS], ['tableTop', 'tableBase', 'tableBeam']);
});

test('빌려 쓰는 디자인은 대회의실 하나뿐이다 — 대기업·임원 폴백은 예전 그대로', () => {
  // PHASE 5-d.1 에서 상황실이 더해졌다 — 뒤쪽 회의 테이블이 콘솔 마감을 빌려 쓴다.
  assert.deepEqual(Object.keys(GENERIC_TABLE_FINISH), [LC, 'controlRoom']);
  // 대기업은 테이블 마감이 아예 안 붙는다(팔레트에 그 색이 없다).
  assert.equal(tablePartFinishForDesign(CO), null);
  // 임원은 **제 부품만** — 범용 부품을 빌려 가지 않는다(§19 폴백 모습 동결).
  assert.deepEqual(Object.keys(tablePartFinishForDesign(EX)), [...TABLE_PARTS]);
  for (const part of GENERIC_TABLE_PARTS) {
    assert.equal(tablePartFinishForDesign(EX)[part], undefined, `임원이 ${part} 를 가져갔다`);
  }
  // 디자인이 없는 경우에도 아무 일도 없다.
  for (const id of [null, undefined, '', '없는디자인']) {
    const f = tablePartFinishForDesign(id);
    if (f) for (const part of GENERIC_TABLE_PARTS) assert.equal(f[part], undefined, String(id));
  }
  // 상황실은 반대로 **범용 부품만** 가져간다 — 제 전용 테이블 부품은 없다(전용 자산이 없다).
  const ctrl = tablePartFinishForDesign('controlRoom');
  assert.deepEqual(Object.keys(ctrl), [...GENERIC_TABLE_PARTS]);
  for (const part of [...TABLE_PARTS, ...CONFERENCE_TABLE_PARTS]) {
    assert.equal(ctrl[part], undefined, `상황실이 ${part} 를 가져갔다`);
  }
});

test('④ 전역 마감은 건드리지 않았다 — 범용 테이블 자체의 색을 바꾼 것이 아니다', () => {
  // 고친 것은 **디자인이 갈아 끼우는 자리**뿐이다. 범용 테이블의 기본 색은 그대로 있어야
  //   대기업 U자·임원 보트/사각이 지금 모습을 유지한다(실측 #ece6db / #a9b3c0).
  assert.ok(!/tableTop:\s*'#|tableBase:\s*'#|tableBeam:\s*'#/.test(finSrc),
    '팔레트에 범용 테이블 색을 직접 적었다(전역 변경 위험)');
  // 범용 테이블은 여전히 같은 부품 이름을 쓴다(형상·이름을 바꾸지 않았다).
  const body = glSrc.match(/function tableMesh[\s\S]*?\n}\n/)[0];
  assert.ok(/mat\.tableTop/.test(body) && /mat\.tableBase/.test(body), '범용 테이블 부품 이름이 바뀌었다');
  // 전용 대회의실 테이블은 여전히 남의 부품을 쓰지 않는다.
  const u = glSrc.match(/function largeUTableMesh[\s\S]*?\n}\n/)[0];
  assert.ok(!/mat\.corporateTop|mat\.tableBase|mat\.tableTop/.test(u), '대회의실 전용 테이블이 남의 부품을 쓴다');
});

// ── B. 형상·배치는 한 자리도 안 바뀌었다 (§23 ⑦~⑰) ──────────────────────

test('⑦⑧⑨⑩ 보트·사각형이 가로·세로 모두 성립한다', () => {
  for (const shape of ['boat', 'rect']) for (const dir of DIRS) {
    const list = items(LC, shape, dir);
    const t = list.filter(i => i.type === 'table');
    assert.equal(t.length, 1, `${shape}/${dir}: 테이블 조각 수`);
    assert.ok(t[0].w > 0 && t[0].d > 0, `${shape}/${dir}: 크기`);
    assert.ok(list.some(i => i.type === 'chair'), `${shape}/${dir}: 좌석`);
    // 세로면 90° 돌려 세운다(PHASE 4-b·테이블 방향 옵션에서 정한 규칙 — 그대로다).
    assert.equal(t[0].rotY, dir === 'along' ? 90 : 0, `${shape}/${dir}: 방향`);
  }
});

test('⑪⑫⑬⑭⑮⑯ 형상·좌표·좌석 수·테이블 범위가 마감 전후로 같다', () => {
  // 마감은 배치 계산을 전혀 건드리지 않는다 — 같은 입력이면 같은 좌표가 나온다.
  for (const shape of SHAPES) for (const dir of DIRS) {
    const a = items(LC, shape, dir), b = items(LC, shape, dir);
    assert.deepEqual(a, b, `${shape}/${dir}`);
  }
  // 기준값 고정 — 보트·사각형의 상판 크기와 좌석 수(바뀌면 형상을 건드린 것이다).
  const boat = items(LC, 'boat', 'across').filter(i => i.type === 'table')[0];
  assert.deepEqual([boat.w, boat.d], [8200, 1500]);
  assert.deepEqual([...items(LC, 'boat', 'along').filter(i => i.type === 'table')]
    .map(t => [t.w, t.d, t.rotY]), [[6100, 1500, 90]]);
  const rect = items(LC, 'rect', 'across').filter(i => i.type === 'table')[0];
  assert.deepEqual([rect.w, rect.d], [8200, 1500]);
  const u = items(LC, 'u', 'across').filter(i => i.type === 'table');
  assert.equal(u.length, 3, 'U자는 세 조각이다');
  assert.deepEqual([u[0].w, u[0].d], [11100, 900]);
  // 마감 층은 배치·가구 모듈을 읽지 않는다(층이 서로 물리면 한쪽을 고칠 때 다른 쪽이 흔들린다).
  assert.ok(!/room-presets|furniture-assets|gl-model/.test(finSrc), '마감 층이 배치·가구를 읽는다');
});

test('⑫⑬ 범용(폴백) 테이블의 형상이 한 값도 바뀌지 않았다 — 마감만 고쳤다', () => {
  // 마감만 고치는 단계이므로 **폴백 테이블의 생김새**도 그대로여야 한다.
  //   역검증에서 상판 모서리 경사를 6 → 11 로 바꿔도 아무 테스트가 잡지 못했다 — 그래서 여기서 막는다.
  const boat = createConferenceTable({ type: 'table', shape: 'boat', x: 7000, z: 5000, w: 8200, d: 1500 });
  assert.equal(boat.shape, 'boat');
  assert.equal(boat.surfaceY, 740);
  assert.equal(boat.topThk, 30);
  assert.equal(boat.topBottom, 710);
  assert.deepEqual(boat.legs.map(l => l.dx), [-2460, 2460]);
  assert.deepEqual({ ...boat.legs[0].post }, { w: 110, d: 540, y0: 40, y1: 710 });
  assert.equal(Math.round(boat.legs[0].foot.d), 870);
  assert.deepEqual({ ...boat.beam }, { w: 4920, h: 70, d: 140, y: 675 });
  const rect = createConferenceTable({ type: 'table', shape: 'rect', x: 7000, z: 5000, w: 8200, d: 1500 });
  assert.equal(rect.surfaceY, 740);
  assert.equal(rect.topThk, 30);
  assert.deepEqual(rect.legs.map(l => l.dx), [-2460, 2460]);
  // **어댑터가 쓰는 형상 상수**도 고정한다(Three.js 쪽이라 Node에서 만들어 볼 수 없다).
  //   상판 모서리 경사·둥글림은 '판때기가 아니라 상판처럼 보이게' 하는 값이다 — 바뀌면 실루엣이 달라진다.
  const body = glSrc.match(/function tableMesh[\s\S]*?\n}\n/)[0];
  assert.match(body, /const bev = u\(6\);/, '보트 상판 모서리 경사가 바뀌었다');
  assert.match(body, /bevelSegments: 2, curveSegments: 6/, '보트 상판 분할 수가 바뀌었다');
  assert.match(body, /mode: 'plan', r: u\(90\)/, '사각 상판 모서리 둥글림이 바뀌었다');
  assert.match(body, /mode: 'face', r: u\(16\)/, '받침 기둥 둥글림이 바뀌었다');
  assert.match(body, /mode: 'plan', r: u\(18\)/, '받침 발 둥글림이 바뀌었다');
  assert.match(body, /mode: 'face', r: u\(20\)/, '보 둥글림이 바뀌었다');
});

test('⑰ 개인 모니터·프롬프터 동작이 그대로다 — U자에만, 수는 좌석과 같다', () => {
  for (const dir of DIRS) {
    const list = items(LC, 'u', dir);
    const chairs = list.filter(i => i.type === 'chair').length;
    assert.equal(list.filter(i => i.type === 'monitor').length, chairs, `u/${dir}`);
    assert.equal(list.filter(i => i.type === 'prompter').length, 1, `u/${dir}`);
  }
  for (const shape of ['boat', 'rect']) for (const dir of DIRS) {
    const list = items(LC, shape, dir);
    assert.equal(list.filter(i => i.type === 'monitor').length, 0, `${shape}/${dir}`);
    assert.equal(list.filter(i => i.type === 'prompter').length, 0, `${shape}/${dir}`);
  }
});

// ── C. 손대지 않은 것 (§23 ⑱~㉚) ─────────────────────────────────────────

test('⑱ conferenceBright 값이 한 칸도 바뀌지 않았다 — 새 색을 고르지 않았다', () => {
  assert.deepEqual({ ...DESIGN_PALETTES.conferenceBright }, {
    id: 'conferenceBright', label: '대회의실 밝은 운영 마감',
    floor: '#c0c1c0', wallFront: '#f3f1ed', wallSide: '#ece9e4', wallAccent: '#e4e0d9',
    baseboard: '#e0dcd5',
    conferenceTop: '#e2ddd1', conferenceBase: '#3a3f46',
    monitorBody: '#262b31', monitorStand: '#2e343b', prompterBody: '#262b31', screen: '#181f2a',
    credenzaBody: '#2b3037', credenzaDoor: '#252a30', credenzaTop: '#353b43', credenzaToe: '#1a1e23',
    rug: '#c4c5c3',
  });
});

test('⑲⑳ 조명(conferenceSoft)과 화각(conferenceProposal)이 그대로다', () => {
  const l = lightingForDesign(LC);
  assert.equal(l.id, 'conferenceSoft');
  assert.deepEqual({ ...l.scale }, { hemi: 1.18, ceiling: 0.28, key: 0.92, fill: 1.30, ledSpill: 1.00 });
  assert.deepEqual({ ...l.shadow }, { radius: 12, bias: -0.00035, normalBias: 0.030 });
  assert.deepEqual({ ...CONFERENCE_CAMERA_PLANS.interior },
    { eye: 1.66, fov: 44, band: 0.09, xRatio: 0.26, aimMix: 0.62, followX: 0.45, minOffset: 0 });
  assert.deepEqual({ ...CONFERENCE_FOV_RANGE }, { min: 36, max: 46 });
  // 마감 층은 조명·화각을 읽지 않는다(마감 문제를 조명으로 보정하지 않았다는 구조적 증거).
  assert.ok(!/design-lighting|design-camera/.test(finSrc), '마감 층이 조명·화각을 읽는다');
});

test('㉓㉔㉕ 대기업·임원 마감이 한 값도 바뀌지 않았다', () => {
  assert.deepEqual({ ...DESIGN_PALETTES.corporateNeutral }, {
    id: 'corporateNeutral', label: '대기업 중성 마감',
    floor: '#b9bab8', wallFront: '#f1efea', wallSide: '#eae7e1', wallAccent: '#e5e1da',
    baseboard: '#dedad2', credenzaBody: '#262a30', credenzaDoor: '#1f2328',
    credenzaTop: '#343940', credenzaToe: '#15181c', rug: '#c6c5c1',
  });
  const ex = tablePartFinishForDesign(EX);
  assert.deepEqual({ ...ex.boardroomTop },
    { material: 'lightOak', color: '#dbcdb6', canonical: 'woodTable' });
  assert.deepEqual({ ...ex.boardroomBase },
    { material: 'darkGraphite', color: '#34383e', canonical: 'darkGraphite', roughness: 0.72 });
});

test('㉗ 정식 재질은 13종 그대로 — 새로 만들지 않았다', () => {
  assert.equal(Object.keys(MATERIAL_PRESETS).length, 13);
  // 빌려 온 마감도 전부 기존 정식 재질로 풀린다.
  const f = tablePartFinishForDesign(LC);
  for (const part of [...CONFERENCE_TABLE_PARTS, ...GENERIC_TABLE_PARTS]) {
    assert.ok(MATERIAL_PRESETS[f[part].canonical], `${part}: ${f[part].canonical} 가 정식 재질이 아니다`);
  }
  assert.deepEqual([...ALL_TABLE_PARTS], [...TABLE_PARTS, ...CONFERENCE_TABLE_PARTS]);
});

test('㉘ 승급은 릴리스 게이트에서만 일어난다', () => {
  // PHASE 4-d.5 에서는 올리지 않았고, PHASE 4-e 릴리스 게이트를 통과한 뒤에 올렸다.
  assert.equal(ROOM_DESIGNS[LC].status, DESIGN_STATUS.READY, '대회의실은 4-e 통과로 ready');
  assert.equal(ROOM_DESIGNS[CO].status, DESIGN_STATUS.READY);
  // 임원은 PHASE 3-e 판정에 맞춰 별도 메타데이터 PR에서 동기화됐다.
  assert.equal(ROOM_DESIGNS[EX].status, DESIGN_STATUS.READY);
});

test('㉙㉚ 계산기와 가격표 동작이 그대로다', () => {
  const MP012F = MODELS.find(m => m.id === 'MP012F');
  const r = computeConfig(MP012F, 6000, 3400, { mode: 'manual', cols: 7, rows: 6 });
  assert.equal(r.total, 42);
  assert.equal(r.maxW, 6132);
  assert.ok(Math.abs(r.heatMaxBTU - 20916) < 20);
  assert.ok(!/engine\.js|models\.js|prices/.test(finSrc), '마감 층이 계산기·단가를 읽는다');
  assert.equal(resolveDesign(LC).palette, 'conferenceBright');
});
