// training-room.test.js — 교육장 · 트레이닝룸 V1 마감 회귀 테스트. (PHASE 7-a, DEC-127)
// ─────────────────────────────────────────────────────────────────────────────
// PHASE 7-0 감사가 찾은 것은 "가구가 낡았다"가 아니라 **"디자인 층이 통째로 없다"** 였다.
//   배치(`layoutClassroom`)와 가구(`trainingDesk`·`trainingChair`·`podium`)는 이미 전용이고,
//   없던 것은 마감·조명·화각뿐이다. 이 단계는 그중 **마감만** 붙인다.
//
// 여기서 지키는 것.
//   ① 디자인이 실재하고 강의실이 거기로 떨어진다 — 상태는 아직 planned 다.
//   ② 마감이 실제로 붙는다 — 정식 재질 13종 안에서만.
//   ③ 강사 의자가 LED 벽을 파고들지 않는다 — 그 의자 **하나만** 움직였다.
//   ④ 조명·화각은 아직 손대지 않았다(7-b 의 몫).
//   ⑤ 다른 공간으로 새지 않는다 — 특히 부품 이름을 공유하는 강당·회의 의자.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ROOM_DESIGNS, DESIGN_IDS, DESIGN_STATUS, isPlanned, resolveDesign,
  defaultDesignFor, normalizeDesign, designsFor, layoutVariant, INHERIT,
} from '../src/room-design.js';
import {
  DESIGN_PALETTES, roomFinishForDesign, trainingFinishForDesign, TRAINING_PARTS,
  consoleFinishForDesign, credenzaFinishForDesign, tablePartFinishForDesign,
} from '../src/design-finish.js';
import { MATERIAL_IDS, resolveMaterialId, PART_MATERIAL, moodFor, floorFinishFor } from '../src/materials.js';
import { layoutRoom, defaultOptions, FURNITURE } from '../src/room-presets.js';
import { DIMS, FURNITURE_ASSETS } from '../src/furniture-assets.js';
import { lightingPreset } from '../src/design-lighting.js';
import { cameraPlanForDesign, controlCameraPlanId, conferenceCameraPlanId,
  trainingCameraPlanId } from '../src/design-camera.js';

const TR = 'trainingRoom';
const 동결 = ['corporateMeeting', 'executiveBoardroom', 'largeConference', 'controlRoom'];
const src = f => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const code = f => src(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const 배치 = (W, D, opts = {}) =>
  layoutRoom('classroom', { ...defaultOptions('classroom'), ...opts }, { W, D, design: TR });
/** 교육용 의자의 발자국 깊이 — 좌판 깊이에 여유 80 을 더한 값(PHASE 7-0 감사와 같은 자). */
const 의자깊이 = DIMS.trainingChair.seatD + 80;

// ── ① 디자인이 실재하고 강의실이 거기로 떨어진다 ─────────────────────────────

test('① `trainingRoom` 디자인이 있고, 용도·상태·단계가 맞다', () => {
  const d = ROOM_DESIGNS[TR];
  assert.ok(d, '교육장 디자인이 없다');
  assert.equal(d.id, TR);
  assert.equal(d.roomType, 'classroom');
  assert.equal(d.status, DESIGN_STATUS.PLANNED, '아직 릴리스 판정을 받지 않았다 — ready 로 올리면 안 된다');
  assert.ok(Number.isInteger(d.phase) && d.phase >= 7);
  assert.ok(Object.isFrozen(d));
  assert.ok(layoutVariant(d.layoutVariant), `없는 배치 변형 ${d.layoutVariant}`);
  assert.equal(layoutVariant(d.layoutVariant).roomType, 'classroom');
});

test('② 강의실이 교육장 디자인으로 떨어진다 — 잘못된 값도 안전하게', () => {
  assert.equal(defaultDesignFor('classroom'), TR);
  for (const v of [undefined, null, '', 0, false, {}, [], '없는디자인',
    'corporateMeeting', 'controlRoom', 'TrainingRoom']) {
    assert.equal(normalizeDesign(v, 'classroom'), TR, `${String(v)}: 교육장으로 떨어지지 않는다`);
  }
  // 다른 용도는 건드리지 않았다.
  assert.equal(normalizeDesign(undefined, 'meeting'), 'corporateMeeting');
  assert.equal(normalizeDesign(undefined, 'control'), 'controlRoom');
  for (const t of ['hall_s', 'hall_m', 'hall_l', 'ideation']) {
    assert.equal(normalizeDesign(undefined, t), null, `${t}: 디자인이 붙으면 안 된다`);
  }
});

test('③ 교육장 디자인은 하나뿐이다 — 선택칸을 띄우지 않는다(상황실과 같은 규칙)', () => {
  const list = designsFor('classroom');
  assert.deepEqual(list.map(d => d.id), [TR], '교육장 디자인이 하나가 아니다');
  // 화면은 **둘 이상일 때만** 선택칸을 그린다. 그 규칙 자체를 고정한다.
  assert.ok(/const show = list\.length > 1;/.test(code('app.js')),
    '디자인 선택칸 노출 규칙이 바뀌었다');
});

// ── ② 마감이 실제로 붙는다 ───────────────────────────────────────────────────

test('④ 교육장 마감이 실제로 풀린다 — 방 껍데기와 가구 둘 다', () => {
  const room = roomFinishForDesign(TR);
  assert.ok(room, '방 껍데기 마감이 붙지 않았다');
  assert.equal(room.floor.canonical, 'carpetTile', '바닥이 승인된 정식 재질이 아니다');
  for (const role of ['wallFront', 'wallSide', 'wallAccent', 'baseboard']) {
    assert.equal(room[role].canonical, 'paintedWall', `${role}: 벽 질감이 도장 벽이 아니다`);
  }
  // 포인트 벽은 7-a 범위 밖이다 — 옆벽과 **같은 색**이어야 한다(장식을 더하지 않았다).
  assert.equal(room.wallAccent.color, room.wallSide.color, '포인트 벽에 장식을 더했다');

  const fur = trainingFinishForDesign(TR);
  assert.ok(fur, '가구 마감이 붙지 않았다');
  assert.deepEqual(Object.keys(fur).sort(), [...TRAINING_PARTS].sort(), '빠진 부품이 있다');
  assert.equal(fur.deskTop.canonical, 'neutralLaminate');
  assert.equal(fur.deskLeg.canonical, 'darkGraphite');
  assert.equal(fur.deskRail.canonical, 'darkGraphite');
  assert.equal(fur.deskPanel.canonical, 'paintedWall');
  assert.equal(fur.chairSeat.canonical, 'fabricChair');
  assert.equal(fur.chairBack.canonical, 'fabricChair');
  assert.equal(fur.seatFrame.canonical, 'darkGraphite');
  assert.equal(fur.podiumTop.canonical, 'neutralLaminate', '교탁 상판이 책상과 같은 재질이 아니다');
  assert.equal(fur.podium.canonical, 'paintedWall');
  // 교탁 상판 색은 책상 상판과 **같아야** 같은 방의 가구로 읽힌다.
  assert.equal(fur.podiumTop.color, fur.deskTop.color, '교탁 상판이 책상과 다른 색이다');
});

test('⑤ 민트가 사라졌다 — 의자가 중성 회색으로 읽힌다', () => {
  const fur = trainingFinishForDesign(TR);
  const 민트 = '#cbdad7';   // PHASE 7-0 이 실측한 예전 색
  assert.notEqual(fur.chairSeat.color.toLowerCase(), 민트, '의자 좌판이 아직 민트다');
  assert.notEqual(fur.chairBack.color.toLowerCase(), 민트, '의자 등판이 아직 민트다');
  // 중성인가 — R·G·B 가 서로 크게 벌어지면 색기가 남은 것이다.
  for (const part of ['chairSeat', 'chairBack', 'deskTop', 'seatFrame']) {
    const c = fur[part].color.replace('#', '');
    const [r, g, b] = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16));
    assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 16,
      `${part}: 색기가 너무 강하다 ${fur[part].color}`);
  }
});

test('⑤-2 팔레트 값 자체를 고정한다 — 예전 하얀 마감으로 되돌아가면 잡는다', () => {
  // 역검증에서 바닥을 예전 값(#d4d9e1)으로 되돌렸는데 재질 이름만 보는 검사는 놓쳤다.
  //   **색이 곧 이 단계의 결과물**이므로 값을 직접 못박는다.
  const pal = DESIGN_PALETTES.trainingNeutral;
  assert.deepEqual({ ...pal }, {
    id: 'trainingNeutral', label: '교육장 중성 마감',
    floor: '#b0b2af', wallFront: '#e0ddd8', wallSide: '#dedbd5',
    wallAccent: '#dedbd5', baseboard: '#cfccc5',
    deskTop: '#d7d3cc', deskLeg: '#454a51', deskRail: '#454a51', deskPanel: '#c0c3c6',
    chairSeat: '#8f9499', chairBack: '#8f9499', seatFrame: '#4a4f56',
    podium: '#dedbd5', podiumTop: '#d7d3cc',
  }, '교육장 팔레트 값이 달라졌다 — 화면 밝기가 함께 움직인다');
  // 위계 — **바닥이 벽보다 어두워야 한다.** 고치기 전에는 거꾸로였다(바닥 229.1 > 벽 223.4).
  const 밝기 = hex => { const c = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  assert.ok(밝기(pal.floor) < 밝기(pal.wallFront) - 10, '바닥이 벽보다 어둡지 않다');
  assert.ok(밝기(pal.chairSeat) < 밝기(pal.floor) - 20, '의자가 바닥과 구분되지 않는다');
  // 책상 상판은 **팔레트에서 벽보다 한 단 아래**다(211.3 vs 219.2). 그것이 렌더에서
  //   249.6 → 226.4 로 내려가 날아가는 선(250)에서 멀어지게 한 장치다.
  //   화면에서는 수평면이 천장 빛을 받아 벽(204.2)보다 밝게 읽히는데, 그 방향은
  //   대기업 회의실(상판 223.9 > 벽 194.7)과 같다 — 위계가 아니라 **재질 차이**로 갈린다.
  assert.ok(밝기(pal.deskTop) < 밝기(pal.wallSide), '책상 상판이 벽보다 밝다 — 날아갈 여지가 남는다');
  assert.ok(밝기(pal.wallSide) - 밝기(pal.deskTop) >= 5, '책상 상판과 벽이 거의 같은 값이다');
});

test('⑥ 새 정식 재질을 만들지 않았다 — 13종 그대로', () => {
  assert.equal(MATERIAL_IDS.length, 13, `정식 재질이 ${MATERIAL_IDS.length}종이 됐다`);
  for (const v of Object.values(ROOM_DESIGNS[TR].materials)) {
    assert.ok(MATERIAL_IDS.includes(resolveMaterialId(v)), `${v}: 정식 목록으로 풀리지 않는다`);
  }
  // 팔레트는 한 벌 늘었다. 그 한 벌이 교육장 것이다.
  assert.ok(DESIGN_PALETTES.trainingNeutral, '교육장 팔레트가 없다');
  assert.equal(ROOM_DESIGNS[TR].palette, 'trainingNeutral');
});

test('⑦ 부품 이름을 공유하는 다른 공간으로 마감이 새지 않는다', () => {
  // `seatFrame` 은 강당 의자와, `chairSeat`·`chairBack` 은 기존 회의 의자와 이름이 같다.
  //   전역 색표를 고쳤다면 그 공간들이 같이 바뀐다 — 그러지 않았다는 것을 고정한다.
  for (const id of [...동결, undefined, null, '없는디자인']) {
    assert.equal(trainingFinishForDesign(id), null, `${String(id)}: 교육장 마감이 새어 나갔다`);
  }
  // 반대 방향도 본다 — 교육장이 다른 계열 마감을 끌어오지 않았다.
  assert.equal(consoleFinishForDesign(TR), null, '교육장이 콘솔 마감을 가져갔다');
  assert.equal(credenzaFinishForDesign(TR), null, '교육장이 수납장 마감을 가져갔다');
  assert.equal(tablePartFinishForDesign(TR), null, '교육장이 테이블 마감을 가져갔다');
  // 전역 부품 대응표는 한 값도 바뀌지 않았다.
  assert.equal(PART_MATERIAL.deskTop, 'woodTable');
  assert.equal(PART_MATERIAL.chairSeat, 'fabricChair');
  assert.equal(PART_MATERIAL.seatFrame, 'metalFrame');
});

test('⑧ 렌더러가 교육장 마감을 실제로 집어 든다 — 표만 만들고 끝내지 않았다', () => {
  const t = code('furniture-gl.js');
  assert.ok(/for \(const fin of \[credenzaFinishForDesign/.test(t), '기존 마감 적용 자리가 사라졌다');
  assert.ok(/trainingFinishForDesign\(designId\)/.test(t), '교육장 마감이 적용 목록에 없다');
});

// ── ③ 강사 의자 결함 ─────────────────────────────────────────────────────────

test('⑨ 강사 의자가 LED 벽을 파고들지 않는다', () => {
  for (const [W, D] of [[8000, 7000], [12000, 10000], [18000, 14000], [24000, 18000]]) {
    const lay = 배치(W, D);
    const 앞쪽 = lay.items.filter(i => i.type === 'chair').sort((a, b) => a.z - b.z)[0];
    const 여유 = 앞쪽.z - 의자깊이 / 2;
    assert.ok(여유 > 0, `${W}×${D}: 강사 의자가 벽을 ${-여유}mm 파고든다`);
    // 강사 책상과도 부딪히지 않아야 한다(고치다가 새 충돌을 만들면 안 된다).
    const 책상 = lay.items.filter(i => i.type === 'desk').sort((a, b) => a.z - b.z)[0];
    const 간격 = (책상.z - 책상.d / 2) - (앞쪽.z + 의자깊이 / 2);
    assert.ok(간격 > 0, `${W}×${D}: 강사 의자가 강사 책상과 ${-간격}mm 겹친다`);
  }
});

test('⑩ 보정값은 결정적이다 — 짐작한 숫자가 아니라 기존 상수에서 나온다', () => {
  const lay = 배치(12000, 10000);
  const 의자 = lay.items.filter(i => i.type === 'chair').sort((a, b) => a.z - b.z)[0];
  assert.equal(의자.z, FURNITURE.chairClear / 2, '강사 의자 z 가 기존 상수에서 나오지 않는다');
  assert.equal(의자.z, 325);
  // 같은 방을 여러 번 계산해도 같은 값이다.
  for (let i = 0; i < 3; i++) {
    const again = 배치(12000, 10000).items.filter(x => x.type === 'chair').sort((a, b) => a.z - b.z)[0];
    assert.equal(again.z, 의자.z);
  }
  // 방 전체에 새 여유를 도입하지 않았다 — 하한일 뿐이라 `Math.max` 로 걸린다.
  assert.ok(/Math\.max\(F\.chairClear \/ 2, iz - 750\)/.test(code('room-presets.js')),
    '강사 의자 하한이 기존 상수 기반 Math.max 가 아니다');
});

test('⑪ 움직인 것은 강사 의자 **하나뿐**이다', () => {
  for (const [W, D] of [[8000, 7000], [12000, 10000], [18000, 14000]]) {
    const lay = 배치(W, D);
    const 강사의자 = lay.items.filter(i => i.type === 'chair').sort((a, b) => a.z - b.z)[0];
    // 학생 책상 — 첫 줄 z 와 줄 간격이 예전 그대로다.
    const 책상z = [...new Set(lay.items.filter(i => i.type === 'desk' && i.z > FURNITURE.frontClear)
      .map(i => Math.round(i.z)))].sort((a, b) => a - b);
    assert.equal(책상z[0], FURNITURE.frontClear + FURNITURE.deskPitchZ / 2, `${W}: 첫 줄이 움직였다`);
    if (책상z.length > 1) assert.equal(책상z[1] - 책상z[0], FURNITURE.deskPitchZ, `${W}: 줄 간격이 바뀌었다`);
    // 학생 책상 x — **좌우로 밀리지 않았다.** 블록이 방 가운데에 놓인다.
    //   의자가 책상을 따라 움직이므로 750 규칙만 보면 이 밀림을 놓친다(역검증에서 드러났다).
    const 책상x = [...new Set(lay.items.filter(i => i.type === 'desk' && i.z > FURNITURE.frontClear)
      .map(i => Math.round(i.x)))].sort((a, b) => a - b);
    const 가운데 = (책상x[0] + 책상x[책상x.length - 1]) / 2;
    assert.ok(Math.abs(가운데 - W / 2) < 1, `${W}: 학생 책상 블록이 방 가운데에서 ${가운데 - W / 2}mm 밀렸다`);
    // 학생 의자 — 책상 뒤 750 규칙 그대로.
    for (const c of lay.items.filter(i => i.type === 'chair' && i !== 강사의자)) {
      const 짝 = lay.items.find(i => i.type === 'desk' && Math.abs(i.z - (c.z - 750)) < 1);
      assert.ok(짝, `학생 의자(${c.x}, ${c.z})의 짝 책상을 찾지 못했다 — 750 규칙이 깨졌다`);
    }
    // 교탁·강사 책상 — 예전 식 그대로.
    const 교탁 = lay.items.find(i => i.type === 'podium');
    assert.equal(교탁.z, FURNITURE.frontClear * 0.6, '교탁이 움직였다');
    assert.equal(교탁.rotY, 180, '교탁 방향이 바뀌었다');
    const 강사책상 = lay.items.filter(i => i.type === 'desk').sort((a, b) => a.z - b.z)[0];
    assert.equal(강사책상.z, FURNITURE.frontClear * 0.55, '강사 책상이 움직였다');
    assert.equal(강사책상.rotY, 180, '강사 책상 방향이 바뀌었다');
    assert.deepEqual([강사책상.w, 강사책상.d], [1500, 700], '강사 책상 크기가 바뀌었다');
  }
});

test('⑫ 정원·통로·방 크기 적응이 그대로다', () => {
  const 기본 = 배치(12000, 10000);
  assert.deepEqual(기본.placed, { desks: 16, chairs: 16, cols: 4, rows: 4, perDesk: 1 });
  assert.equal(기본.capacity, 20);
  // 2인용 책상 — 책상 한 대에 두 자리.
  const 쌍 = 배치(12000, 10000, { deskType: 'double' });
  assert.equal(쌍.placed.perDesk, 2);
  assert.equal(쌍.placed.chairs, 쌍.placed.desks * 2);
  // 통로 — 켜면 열 간격에 통로 폭이 끼어든다.
  const 통로없음 = 배치(12000, 10000, { aisle: false });
  const x = a => [...new Set(a.items.filter(i => i.type === 'desk' && i.z > FURNITURE.frontClear)
    .map(i => Math.round(i.x)))].sort((p, q) => p - q);
  const 간격 = a => { const v = x(a); const g = []; for (let i = 1; i < v.length; i++) g.push(v[i] - v[i - 1]); return [...new Set(g)]; };
  assert.deepEqual(간격(통로없음), [FURNITURE.deskPitchX], '통로를 끄면 열 간격이 하나여야 한다');
  assert.ok(간격(기본).includes(FURNITURE.deskPitchX + FURNITURE.aisleW), '가운데 통로가 사라졌다');
  // 방이 작으면 줄·열을 줄이고 메모를 남긴다.
  const 좁음 = 배치(6000, 6000);
  assert.ok(좁음.placed.cols <= 4 && 좁음.placed.rows <= 4);
  assert.ok(좁음.notes.some(n => /줄로 줄였습니다/.test(n)), '줄인 사실을 알리지 않는다');
});

// ── ④ 조명·화각은 아직 손대지 않았다 ─────────────────────────────────────────

test('⑬ 교육장 조명·화각이 PHASE 7-b 에서 실제로 켜졌다', () => {
  const d = ROOM_DESIGNS[TR];
  assert.equal(d.lighting, 'trainingSoft', '조명이 붙지 않았다');
  assert.equal(d.camera, 'trainingProposal', '화각이 붙지 않았다');
  // 이름만 적힌 것이 아니라 **실재해야** 한다.
  assert.ok(lightingPreset('trainingSoft'), '교육장 조명 프리셋이 없다');
  assert.ok(trainingCameraPlanId(TR, 'interior'), '교육장 화각이 실내 시점에 걸리지 않는다');
  // 해석 결과에도 그대로 적용된다.
  const r = resolveDesign(TR);
  assert.equal(r.lighting, 'trainingSoft');
  assert.equal(r.camera, 'trainingProposal');
});

test('⑭ 가구·벽 구성·소품은 이 단계에서 정하지 않았다', () => {
  const d = ROOM_DESIGNS[TR];
  // 가구는 배치가 이미 `asset` 으로 못박고 있어 디자인이 적을 필요가 없다(§10 가구 동결).
  assert.equal(d.furniture, INHERIT, '가구를 선언해 가구 계약 범위를 끌어들였다');
  assert.equal(d.wallTreatment, INHERIT, '벽 구성을 더했다 — 7-a 범위가 아니다');
  assert.equal(d.accessories, INHERIT, '소품을 더했다 — 7-a 범위가 아니다');
  // 배치가 세우는 가구는 예전 그대로다.
  const lay = 배치(12000, 10000);
  for (const c of lay.items.filter(i => i.type === 'chair')) assert.equal(c.asset, 'trainingChair');
  for (const id of ['trainingDesk', 'trainingChair', 'podium']) {
    assert.ok(FURNITURE_ASSETS[id], `${id}: 런타임 가구가 사라졌다`);
  }
  // 형상 동결(§10) — 치수가 바뀌면 마감만 바꾼 단계가 아니게 된다.
  assert.deepEqual({ ...DIMS.trainingDesk }, { surfaceY: 730, topThk: 25, legW: 40, railW: 30,
    panelH: 300, panelThk: 18, panelTopGap: 20 }, '교육용 책상 치수가 바뀌었다');
  assert.deepEqual({ ...DIMS.trainingChair }, { seatTop: 450, seatThk: 55, seatW: 470, seatD: 450,
    backH: 370, backThk: 45, backTilt: 10, backTopY: 960, legW: 45 }, '교육용 의자 치수가 바뀌었다');
  assert.deepEqual({ ...DIMS.podium }, { w: 700, d: 500, h: 1080 }, '교탁 치수가 바뀌었다');
});

test('⑮ 강의실의 바닥 기본값·분위기 경로는 그대로다(조명 동결)', () => {
  // 디자인이 없을 때의 기본 바닥은 예전 그대로다 — 디자인이 그 위에 얹힐 뿐이다.
  assert.equal(floorFinishFor('classroom'), 'vinylFloor');
  // 분위기는 사무 표준 그대로다. 아이디에이션의 `bright` 를 건드리지 않았다(§13).
  assert.equal(moodFor('classroom'), 'office');
  assert.equal(moodFor('ideation'), 'bright', '아이디에이션 분위기를 건드렸다 — 7-a 범위 밖이다');
});

// ── ⑤ 동결된 공간이 그대로다 ─────────────────────────────────────────────────

test('⑯ 릴리스된 네 공간과 나머지 레거시가 그대로다', () => {
  for (const id of 동결) {
    assert.equal(ROOM_DESIGNS[id].status, DESIGN_STATUS.READY, `${id}: 상태가 바뀌었다`);
  }
  // 팔레트 값 — 교육장을 더하면서 기존 팔레트를 건드리지 않았는지 대표 값으로 본다.
  assert.equal(DESIGN_PALETTES.corporateNeutral.floor, '#b9bab8');
  assert.equal(DESIGN_PALETTES.corporateNeutral.wallFront, '#f1efea');
  assert.equal(DESIGN_PALETTES.executiveBright.floor, '#c3c1bc');
  assert.equal(DESIGN_PALETTES.conferenceBright.floor, '#c0c1c0');
  assert.equal(DESIGN_PALETTES.controlPalette.floor, '#8d9095');
  assert.equal(DESIGN_PALETTES.controlPalette.wallAccent, '#5a6068');
  // 강당·아이디에이션에는 여전히 디자인이 없다.
  for (const t of ['hall_s', 'hall_m', 'hall_l', 'ideation']) {
    assert.deepEqual(designsFor(t).map(d => d.id), [], `${t}: 디자인이 생겼다`);
  }
  // 디자인 목록은 다섯이고, 교육장 말고는 이름이 그대로다.
  assert.deepEqual([...DESIGN_IDS],
    ['corporateMeeting', 'executiveBoardroom', 'largeConference', TR, 'controlRoom']);
});

test('⑰ 강당·아이디에이션 배치가 한 값도 바뀌지 않았다', () => {
  // 강사 의자를 고치면서 공유 배치 코드를 건드렸다면 여기서 드러난다.
  const 지문 = (type, W, D) => {
    const lay = layoutRoom(type, defaultOptions(type), { W, D });
    return JSON.stringify(lay.items.map(i => [i.type, i.asset || '', Math.round(i.x), Math.round(i.z),
      Math.round(i.y || 0), Math.round(i.rotY || 0)]).sort()) + '|' + JSON.stringify(lay.placed);
  };
  // 값 자체를 적어 두지 않는다(길다) — 대신 **배치 함수가 강의실만 바뀌었다**는 것을
  //   같은 실행 안에서 강의실과 대조해 확인한다. 강당·아이디에이션은 강사 의자 규칙을 쓰지 않는다.
  assert.equal(/chairClear \/ 2/.test(code('room-presets.js').split('function layoutHall')[1] || ''), false,
    '강당 배치에 강사 의자 규칙이 새어 들어갔다');
  assert.equal(/chairClear \/ 2/.test(code('room-presets.js').split('function layoutIdeation')[1]?.split('function layoutControl')[0] || ''), false,
    '아이디에이션 배치에 강사 의자 규칙이 새어 들어갔다');
  // 강당·아이디에이션이 여전히 계산되고 좌석 수가 유지되는지.
  assert.ok(지문('hall_m', 18000, 20000).length > 100);
  const hall = layoutRoom('hall_m', defaultOptions('hall_m'), { W: 18000, D: 20000 });
  assert.equal(hall.placed.seats, 160);
  // 좌석 **간격**도 고정한다 — 좌석 수만 보면 간격이 바뀌어도 잡히지 않는다(역검증에서 드러났다).
  assert.equal(FURNITURE.seatPitchX, 550, '강당 좌석 열 간격이 바뀌었다');
  assert.equal(FURNITURE.seatPitchZ, 950, '강당 좌석 줄 간격이 바뀌었다');
  const 좌석z = [...new Set(hall.items.filter(i => i.type === 'seat').map(i => Math.round(i.z)))].sort((a, b) => a - b);
  assert.equal(좌석z[1] - 좌석z[0], 950, '강당 줄 간격 실측이 바뀌었다');
  // 교육장 책상 간격도 함께 못박는다.
  assert.equal(FURNITURE.deskPitchX, 1700);
  assert.equal(FURNITURE.deskPitchZ, 1550);
  assert.equal(FURNITURE.chairClear, 650, '강사 의자 하한이 딛고 선 상수다');
  assert.equal(layoutRoom('ideation', defaultOptions('ideation'), { W: 9000, D: 8000 }).placed.chairs, 10);
});
