// control-materials.test.js — 상황실 마감 회귀 테스트. (PHASE 5-d.1)
// ─────────────────────────────────────────────────────────────────────────────
// 여기서 지키는 것.
//   ① **떨어지는 자리가 없는가** — consoleTop/consoleBase 가 옛 대응표로 새지 않는가.
//   ② **전역을 건드리지 않았는가** — 상황실 마감이 디자인 한정 경로로만 붙는가.
//   ③ 정식 재질 13종 그대로인가 — 새 재질·새 질감을 만들지 않았는가.
//   ④ 형상·배치·조명·화각이 그대로인가 — 이번 단계는 **색만** 바꾼다.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DESIGN_PALETTES, designPalette, roomFinishForDesign, tablePartFinishForDesign,
  consoleFinishForDesign, avFinishForDesign, credenzaFinishForDesign, floorPartFinishForDesign,
  finishStatusForDesign, GENERIC_TABLE_FINISH, GENERIC_TABLE_PARTS, CONSOLE_PARTS,
  TABLE_PARTS, CONFERENCE_TABLE_PARTS,
} from '../src/design-finish.js';
import {
  MATERIAL_IDS, MATERIAL_PRESETS, PART_FINISH, PART_MATERIAL, finishForPart, resolveMaterialId,
} from '../src/materials.js';
import { ROOM_DESIGNS, DESIGN_IDS, isPlanned, normalizeDesign, designsFor } from '../src/room-design.js';
import { layoutRoom, defaultOptions, FURNITURE } from '../src/room-presets.js';
import {
  createCurvedConsole, createTaskChair, createConsoleMonitor, createKeyboard, FURNITURE_COLORS,
} from '../src/furniture-assets.js';
import { FURNITURE_CONTRACTS, CONTRACT_STATUS } from '../src/furniture-contracts.js';

const CR = 'controlRoom';
const D = ROOM_DESIGNS[CR];
const P = DESIGN_PALETTES.controlPalette;
const finishSrc = readFileSync(new URL('../src/design-finish.js', import.meta.url), 'utf8');

/** 상대 밝기 — 색을 '밝다/어둡다'로 비교할 때 쓴다(사람 눈의 가중치). */
function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
}
const glSrc = readFileSync(new URL('../src/furniture-gl.js', import.meta.url), 'utf8');

function control(W, D2, H, over = {}) {
  const o = { ...defaultOptions('control'), ...over };
  const res = layoutRoom('control', o, { W, D: D2, H, design: CR });
  const by = t => res.items.filter(i => i.type === t);
  return { res, consoles: by('console'), chairs: by('chair'), tables: by('table'),
    monitors: by('monitor'), keyboards: by('keyboard') };
}

// ── A. 마감 선언 ────────────────────────────────────────────────────────────

test('① 상황실 마감 id 가 controlPalette 이고, 재질이 전부 실재한다', () => {
  assert.equal(D.palette, 'controlPalette');
  assert.equal(isPlanned(D.palette), false, '아직 planned 다');
  assert.ok(P, '팔레트가 없다');
  assert.equal(P.id, 'controlPalette');
  for (const [k, v] of Object.entries(D.materials)) {
    assert.equal(isPlanned(v), false, `materials.${k} 가 아직 planned 다`);
    assert.ok(resolveMaterialId(v), `materials.${k}=${v} 가 정식 재질로 풀리지 않는다`);
  }
  // **해석기가 읽는 열쇠 이름**을 쓴다. 읽히지 않는 이름을 적으면 값이 아무 데도 닿지 않는다.
  assert.deepEqual(Object.keys(D.materials).sort(),
    ['chair', 'consoleBase', 'consoleTop', 'floor', 'tableBase', 'tableTop', 'wall', 'wallAccent']);
});

test('② 정식 재질 13종 그대로 — 새 재질도, 새 질감도 만들지 않았다', () => {
  assert.equal(MATERIAL_IDS.length, 13, `정식 재질이 ${MATERIAL_IDS.length}종이 됐다`);
  // 상황실이 고른 재질은 **전부 기존 것**이다.
  for (const v of Object.values(D.materials)) {
    assert.ok(MATERIAL_IDS.includes(resolveMaterialId(v)), `${v}: 정식 목록에 없다`);
  }
  // 팔레트는 5벌이 됐지만(상황실 · 교육장 추가) 재질은 그대로다.
  assert.deepEqual(Object.keys(DESIGN_PALETTES),
    ['corporateNeutral', 'executiveBright', 'conferenceBright', 'trainingNeutral', 'controlPalette']);
});

// ── B. 떨어지는 자리가 없다 ─────────────────────────────────────────────────

test('③ 콘솔 상판·하부가 **해석된다** — 더 이상 옛 대응표로 새지 않는다', () => {
  const f = consoleFinishForDesign(CR);
  assert.ok(f, '콘솔 마감이 붙지 않는다');
  assert.deepEqual(Object.keys(f).sort(), [...CONSOLE_PARTS].sort());
  assert.equal(f.consoleTop.canonical, 'neutralLaminate');
  assert.equal(f.consoleBase.canonical, 'darkGraphite');
  assert.equal(f.consoleTop.color, P.consoleTop);
  assert.equal(f.consoleBase.color, P.consoleBase);
  // 흰색·기본값으로 떨어지지 않는다.
  for (const part of CONSOLE_PARTS) {
    assert.ok(/^#[0-9a-f]{6}$/i.test(f[part].color), `${part}: 색이 없다`);
    assert.notEqual(f[part].color.toLowerCase(), '#ffffff', `${part}: 흰색으로 떨어졌다`);
  }
  // **옛 경로는 그대로 남아 있다**(전역을 건드리지 않았다는 증거).
  assert.equal(PART_MATERIAL.consoleTop, 'woodTable');
  assert.equal(PART_MATERIAL.consoleBase, 'metalFrame');
  assert.equal(PART_FINISH.consoleTop, undefined, '전역 마감표에 넣었다 — 다른 공간이 같이 바뀐다');
  assert.equal(PART_FINISH.consoleBase, undefined);
  // 렌더러가 실제로 이 표를 소비한다.
  assert.match(glSrc, /consoleFinishForDesign\(designId\)/, '렌더러가 콘솔 마감을 읽지 않는다');
});

test('④ 상판이 벽보다 어둡고, 하부가 의자와 같은 계열이다', () => {
  assert.ok(lum(P.wallFront) > lum(P.consoleTop),
    `상판(${P.consoleTop})이 정면 벽(${P.wallFront})보다 밝다 — 방이 뒤집힌다`);
  assert.ok(lum(P.consoleTop) > lum(P.floor), '상판이 바닥보다 어둡다');
  // 하부는 의자 프레임과 같은 계열(둘 다 darkGraphite)이라 한 덩어리로 읽힌다.
  assert.equal(consoleFinishForDesign(CR).consoleBase.canonical, 'darkGraphite');
  assert.equal(finishForPart('chairFrame').material, 'darkGraphite');
  // **하부는 실제로 어두워야 한다.** 재질 이름만 맞고 색이 밝으면 '밝은 흰 콘솔 받침'이 된다(§6).
  //   상판·바닥보다 확실히 어둡고, 의자 프레임 근처 밝기여야 한 덩어리로 읽힌다.
  assert.ok(lum(P.consoleBase) < lum(P.floor) - 40,
    `콘솔 하부(${P.consoleBase})가 바닥(${P.floor})만큼 밝다`);
  assert.ok(lum(P.consoleBase) < lum(P.consoleTop) - 80,
    `콘솔 하부(${P.consoleBase})가 상판(${P.consoleTop})과 갈리지 않는다`);
  assert.ok(Math.abs(lum(P.consoleBase) - lum(finishForPart('chairFrame').color)) < 30,
    `콘솔 하부(${P.consoleBase})가 의자 프레임과 다른 계열로 읽힌다`);
  // **바닥이 의자보다 밝다** — 어두우면 의자 실루엣이 바닥에 먹힌다.
  assert.ok(lum(P.floor) > lum(finishForPart('chairFrame').color),
    `바닥(${P.floor})이 의자 프레임보다 어둡다 — 실루엣이 사라진다`);
  // 새까만 방이 아니다(§6).
  assert.ok(lum(P.floor) > 100, `바닥이 너무 어둡다 (${P.floor})`);
  assert.ok(lum(P.wallFront) > 200, `벽이 너무 어둡다 (${P.wallFront})`);
});

test('⑤ 바닥이 짙은 카펫 타일이다 — 회의실 3종보다 확실히 어둡다', () => {
  const room = roomFinishForDesign(CR);
  assert.ok(room, '방 껍데기 마감이 붙지 않는다');
  assert.equal(room.floor.canonical, 'carpetTileDark');
  assert.equal(room.floor.color, P.floor);
  for (const other of ['corporateNeutral', 'executiveBright', 'conferenceBright']) {
    assert.ok(lum(P.floor) < lum(DESIGN_PALETTES[other].floor) - 20,
      `바닥이 ${other} 보다 충분히 어둡지 않다`);
  }
  // 벽은 도장 벽이다. **딱 한 자리, 포인트 벽(=왼쪽 벽 안쪽 면)만** 흡음 패널이다(PHASE 5-d.2).
  for (const role of ['wallFront', 'wallSide', 'baseboard']) {
    assert.equal(room[role].canonical, 'paintedWall', `${role}: 도장 벽이 아니다`);
  }
  assert.equal(room.wallAccent.canonical, 'acousticPanel', '포인트 벽이 흡음 패널이 아니다');
});

test('⑥ 뒤 테이블이 **상황실 한정으로** 콘솔 마감을 빌려 쓴다', () => {
  const t = tablePartFinishForDesign(CR);
  assert.ok(t, '뒤 테이블 마감이 붙지 않는다');
  assert.deepEqual(Object.keys(t), [...GENERIC_TABLE_PARTS]);
  assert.equal(t.tableTop.canonical, 'neutralLaminate');
  assert.equal(t.tableTop.color, P.consoleTop, '상판이 콘솔과 다른 색이다');
  assert.equal(t.tableBase.color, P.consoleBase);
  assert.equal(t.tableBeam.color, P.consoleBase);
  // 상황실은 **전용 테이블 부품을 가져가지 않는다**(전용 자산이 없다).
  for (const part of [...TABLE_PARTS, ...CONFERENCE_TABLE_PARTS]) {
    assert.equal(t[part], undefined, `상황실이 ${part} 를 가져갔다`);
  }
  assert.deepEqual(Object.keys(GENERIC_TABLE_FINISH), ['largeConference', 'controlRoom']);
});

test('⑦ AV 마감은 건드리지 않았다 — 이미 어두운 장비 계열이다', () => {
  // 디자인이 `materials.av` 를 정하지 않았으므로 AV 마감표는 붙지 않는다.
  assert.equal(avFinishForDesign(CR), null, '상황실 AV 마감을 새로 만들었다');
  // 전역 부품 마감이 이미 올바르다(PHASE 5-a·5-c 결과).
  for (const part of ['monitorBody', 'monitorStand', 'keyboardBody']) {
    const f = finishForPart(part);
    assert.ok(f, `${part}: 마감표에 없다`);
    assert.equal(f.material, 'blackEquipment', part);
    assert.ok(f.color, `${part}: 색이 없다 — 화면에서 하얗게 뜬다`);
  }
  // 화면(`screen`)은 **마감표에 색이 없는 것이 정상**이다 — 실내 마감재가 아니라 꺼진 화면이고,
  //   색은 가구 팔레트(FURNITURE_COLORS)가 준다. 키보드가 하얗게 뜰 뻔한 것과는 경우가 다르다
  //   (키보드는 그 경로에도 이름이 없었다). 이 단계에서 밝기를 손대지 않는다(§7).
  assert.equal(PART_FINISH.screen.color, undefined, '화면에 마감 색을 새로 넣었다');
  assert.equal(FURNITURE_COLORS.screen, '#151d28', '화면 색이 바뀌었다');
  assert.equal(FURNITURE_COLORS.keyboardBody, undefined,
    '키보드는 가구 팔레트가 아니라 마감표가 색을 준다(PHASE 5-c)');
});

// ── C. 전역·다른 공간 무변경 ────────────────────────────────────────────────

test('⑧ 다른 공간의 마감이 한 값도 바뀌지 않았다', () => {
  assert.equal(DESIGN_PALETTES.corporateNeutral.floor, '#b9bab8');
  assert.equal(DESIGN_PALETTES.corporateNeutral.wallFront, '#f1efea');
  assert.equal(DESIGN_PALETTES.executiveBright.floor, '#c3c1bc');
  assert.equal(DESIGN_PALETTES.executiveBright.boardroomTop, '#dbcdb6');
  assert.equal(DESIGN_PALETTES.conferenceBright.floor, '#c0c1c0');
  assert.equal(DESIGN_PALETTES.conferenceBright.conferenceTop, '#e2ddd1');
  // 대회의실의 범용 테이블 빌려 쓰기도 그대로다.
  const lc = tablePartFinishForDesign('largeConference');
  assert.equal(lc.tableTop.color, DESIGN_PALETTES.conferenceBright.conferenceTop);
  // 대기업은 여전히 테이블 마감이 안 붙는다.
  assert.equal(tablePartFinishForDesign('corporateMeeting'), null);
  // 상황실은 수납장·러그 마감을 정하지 않았다(그 가구가 배치에 없다).
  assert.equal(credenzaFinishForDesign(CR), null);
  assert.equal(floorPartFinishForDesign(CR), null);
});

test('⑧-2 **전역 범용 테이블 색을 건드리지 않았다** — 다른 공간 폴백이 같이 바뀌면 안 된다', () => {
  // 상황실 뒤 테이블은 **디자인 한정 표**로 칠한다. 전역 가구 팔레트를 고치면
  //   대기업·임원·강의실의 폴백 테이블까지 한꺼번에 따라 바뀐다(그래서 여기서 고정한다).
  assert.equal(FURNITURE_COLORS.tableTop, '#ece6db', '전역 범용 상판 색을 고쳤다');
  assert.equal(FURNITURE_COLORS.tableBase, '#a9b3c0', '전역 범용 하부 색을 고쳤다');
  assert.equal(FURNITURE_COLORS.tableBeam, '#9ba6b4', '전역 범용 보 색을 고쳤다');
  assert.equal(FURNITURE_COLORS.consoleTop, '#f3f6f9', '전역 콘솔 상판 색을 고쳤다');
  assert.equal(FURNITURE_COLORS.consoleBase, '#9ba6b4', '전역 콘솔 하부 색을 고쳤다');
  // 상황실이 쓰는 색은 전역값과 **달라야** 한다 — 같으면 디자인 한정 경로가 죽은 것이다.
  const t = tablePartFinishForDesign(CR);
  assert.notEqual(t.tableTop.color, FURNITURE_COLORS.tableTop);
  assert.notEqual(t.tableBase.color, FURNITURE_COLORS.tableBase);
});

test('⑨ 전역 재질 수치를 고치지 않았다 — 정식 재질 표가 그대로다', () => {
  assert.equal(MATERIAL_PRESETS.carpetTileDark.color, '#4a4f56');
  assert.equal(MATERIAL_PRESETS.carpetTileDark.roughness, 0.92);
  assert.equal(MATERIAL_PRESETS.neutralLaminate.roughness, 0.58);
  assert.equal(MATERIAL_PRESETS.darkGraphite.color, '#3a3e44');
  assert.equal(MATERIAL_PRESETS.blackEquipment.color, '#1a1d21');
  // 팔레트가 정식 재질의 색을 덮어쓰는 것이지, 재질 자체를 고치는 것이 아니다.
  assert.notEqual(P.floor, MATERIAL_PRESETS.carpetTileDark.color);
});

// ── D. 형상·배치·조명·화각 동결 ─────────────────────────────────────────────

test('⑩ 형상이 한 값도 바뀌지 않았다 — 이번 단계는 색만 바꾼다', () => {
  const cons = createCurvedConsole(1800, 900);
  assert.equal(cons.length, 4);
  const top = cons.find(p => p.kind === 'consoleTop');
  assert.equal(top.y + top.h / 2, 730);
  assert.equal(top.sag, 180);
  assert.equal(top.w, 1800); assert.equal(top.d, 900);
  assert.equal(createTaskChair().length, 10);
  assert.equal(createConsoleMonitor().length, 4);
  assert.equal(createKeyboard().length, 1);
  const kb = createKeyboard()[0];
  assert.equal(kb.w, 440); assert.equal(kb.d, 150); assert.equal(kb.h, 22);
});

test('⑪ 배치가 한 값도 바뀌지 않았다', () => {
  assert.equal(FURNITURE.consoleW, 1800);
  assert.equal(FURNITURE.consoleD, 900);
  assert.equal(FURNITURE.consolePitchX, 2000);
  assert.equal(FURNITURE.consolePitchZ, 2500);
  for (const [W, D2, cons, ch] of [[10000, 8000, 4, 12], [12000, 10000, 4, 12], [16000, 14000, 8, 16]]) {
    const r = control(W, D2, 3600);
    assert.equal(r.consoles.length, cons, `${W}×${D2}: 콘솔`);
    assert.equal(r.chairs.length, ch, `${W}×${D2}: 의자`);
    assert.equal(r.monitors.length, cons * 2, `${W}×${D2}: 모니터`);
    assert.equal(r.keyboards.length, cons, `${W}×${D2}: 키보드`);
  }
  const big = control(16000, 14000, 3900);
  assert.deepEqual([...new Set(big.consoles.map(c => c.z))], [3050, 5550]);
  assert.deepEqual([...new Set(big.consoles.map(c => c.rotY))], [0]);
  assert.equal(big.tables[0].z, 11600);
  for (const tiers of [1, 2, 3]) {
    const r = control(16000, 14000, 3900, { tiers });
    const ys = [...new Set(r.consoles.map(c => c.y || 0))].sort((a, b) => a - b);
    assert.deepEqual(ys, tiers === 1 ? [0] : [0, 200], `tiers=${tiers}`);
    for (const m of [...r.monitors, ...r.keyboards]) {
      assert.ok(ys.map(y => y + 730).includes(m.y), `tiers=${tiers}: AV 높이가 단을 벗어났다`);
    }
  }
});

test('⑫ 소품만 그대로 planned 다 — 조명·화각은 구현됐다', () => {
  assert.equal(D.lighting, 'controlTechnical', '조명은 PHASE 5-d.3 에서 생겼다');
  assert.equal(D.camera, 'controlProposal', '화각은 PHASE 5-d.4 에서 생겼다');
  assert.equal(isPlanned(D.wallTreatment), false, '벽 구성은 PHASE 5-d.2 에서 실재한다');
  assert.equal(D.wallTreatment, 'controlWalls');
  assert.ok(isPlanned(D.accessories));
  assert.equal(D.status, 'ready', 'PHASE 5-e 릴리스 게이트를 통과했다(DEC-125)');
  assert.ok(MATERIAL_IDS.includes('glassPartition'));
  assert.ok(MATERIAL_IDS.includes('acousticPanel'));
  // **유리는 방 껍데기(벽·바닥·걸레받이)에 붙지 않는다.** 유리는 방 안에 따로 서는 물건이라
  //   벽 마감 해석기가 아니라 `control-walls.js` 계획이 자리를 정한다.
  const room = roomFinishForDesign(CR);
  for (const role of Object.keys(room)) {
    assert.notEqual(room[role].canonical, 'glassPartition', `${role}: 유리를 벽 마감으로 붙였다`);
  }
});

test('⑬ 제품 도달 경로가 그대로다 — 선택칸을 새로 노출하지 않았다', () => {
  assert.deepEqual(designsFor('control').map(d => d.id), [CR]);
  for (const saved of [undefined, null, '', '없는디자인', 'largeConference']) {
    assert.equal(normalizeDesign(saved, 'control'), CR, String(saved));
  }
  for (const id of ['taskChair', 'curvedConsole', 'consoleMonitor', 'keyboard']) {
    assert.equal(FURNITURE_CONTRACTS[id].status, CONTRACT_STATUS.IMPLEMENTED, id);
  }
});

test('⑭ 마감 상태 요약이 상황실을 제대로 보고한다', () => {
  const st = finishStatusForDesign(CR);
  assert.equal(st.palette, 'controlPalette');
  assert.deepEqual([...st.room], ['floor', 'wallFront', 'wallSide', 'wallAccent', 'baseboard']);
  assert.deepEqual([...st.consoleParts], [...CONSOLE_PARTS]);
  assert.deepEqual([...st.tableParts], [...GENERIC_TABLE_PARTS]);
  assert.equal(st.av, null);
  assert.equal(st.credenza, null);
  // 디자인이 없는 공간은 여전히 전부 null 이다.
  for (const id of [null, undefined, '', '없는디자인']) {
    assert.equal(consoleFinishForDesign(id), null, String(id));
  }
});

test('⑮ 순수 유지 — 마감 파일은 Three.js·DOM 을 부르지 않는다', () => {
  const code = finishSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  for (const bad of [/THREE\./, /\bdocument\b/, /\bwindow\b/, /geometry-gl/]) {
    assert.ok(!bad.test(code), `design-finish 가 ${bad} 를 쓴다`);
  }
});
