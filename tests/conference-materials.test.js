// conference-materials.test.js — 대회의실 전용 마감 회귀 테스트. (PHASE 4-d.1)
// ─────────────────────────────────────────────────────────────────────────────
// 여기서 지키는 것.
//   ① 정식 재질을 새로 만들지 않았는가 — 13종 + 별칭으로만 해결했는가.
//   ② 마감이 **그 공간에만** 붙는가 — 대기업·임원 테이블·다른 방으로 새지 않는가.
//   ③ 밝기 순서가 맞는가 — 벽 > 상판 > 바닥, AV는 어둡되 검은 구멍이 아니다.
//   ④ 형상은 하나도 안 바뀌었는가 — 이번 단계는 **마감만** 바꾸는 단계다.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  DESIGN_PALETTES, designPalette, roomFinishForDesign, credenzaFinishForDesign,
  floorPartFinishForDesign, tablePartFinishForDesign, avFinishForDesign, finishStatusForDesign,
  TABLE_PARTS, CONFERENCE_TABLE_PARTS, ALL_TABLE_PARTS, AV_PARTS, FLOOR_PARTS,
} from '../src/design-finish.js';
import {
  MATERIAL_PRESETS, MATERIAL_ALIASES, PART_FINISH, PART_MATERIAL,
  resolveMaterialId, finishForPart, realWorldTileMm,
} from '../src/materials.js';
import { ROOM_DESIGNS, DESIGN_IDS, isPlanned, resolveDesign } from '../src/room-design.js';
import { FURNITURE_CONTRACTS } from '../src/furniture-contracts.js';
import {
  createLargeUTable, createConferenceErgoChair, createPersonalMonitor, createPrompter,
} from '../src/furniture-assets.js';
import { layoutRoom, defaultOptions } from '../src/room-presets.js';
import { computeConfig } from '../src/engine.js';
import { MODELS } from '../src/models.js';

const LC = 'largeConference';
const P = designPalette('conferenceBright');
const finSrc = readFileSync(new URL('../src/design-finish.js', import.meta.url), 'utf8');
const glSrc = readFileSync(new URL('../src/furniture-gl.js', import.meta.url), 'utf8');
const appSrc = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

const lum = c => {
  const n = parseInt(c.slice(1), 16);
  return (0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255;
};
const chroma = c => {
  const n = parseInt(c.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
  return Math.max(r, g, b) - Math.min(r, g, b);
};
const lay = (W, D, seats, design = LC) => layoutRoom('meeting',
  { ...defaultOptions('meeting'), tableShape: 'u', seats, rug: true, plant: false, credenza: true },
  { W, D, ledBottom: 1000, design });

// ── A. 팔레트 · 정식 재질 ───────────────────────────────────────────────────

test('① 대회의실 팔레트가 켜졌다 — 제 이름의 팔레트를 쓴다', () => {
  assert.equal(ROOM_DESIGNS[LC].palette, 'conferenceBright');
  assert.ok(P, '팔레트가 없다');
  assert.equal(P.id, 'conferenceBright');
  assert.equal(resolveDesign(LC).palette, 'conferenceBright');
  // 임원·대기업 팔레트를 물려받은 것이 아니다.
  assert.notEqual(P, DESIGN_PALETTES.executiveBright);
  assert.notEqual(P, DESIGN_PALETTES.corporateNeutral);
  const st = finishStatusForDesign(LC);
  assert.equal(st.palette, 'conferenceBright');
  for (const k of ['room', 'credenza', 'floorParts', 'tableParts', 'av']) {
    assert.ok(st[k] && st[k].length, `${k}: 마감이 하나도 안 붙었다`);
  }
});

test('⑫⑬ 정식 재질 13종 그대로 — 별칭으로만 풀었다', () => {
  assert.equal(Object.keys(MATERIAL_PRESETS).length, 13);
  // 새 별칭(lightAsh)도 **정식 재질이 아니라 별칭**이다.
  assert.equal(MATERIAL_ALIASES.lightAsh, 'neutralLaminate');
  assert.equal(MATERIAL_PRESETS.lightAsh, undefined, 'lightAsh 가 정식 재질이 됐다');
  for (const [alias, canon] of Object.entries(MATERIAL_ALIASES)) {
    assert.ok(MATERIAL_PRESETS[canon], `${alias} → ${canon}: 없는 정식 재질을 가리킨다`);
    assert.equal(resolveMaterialId(alias), canon);
  }
  // 이 공간이 쓰는 마감은 전부 기존 13종으로 풀린다.
  for (const fn of [roomFinishForDesign, credenzaFinishForDesign,
    floorPartFinishForDesign, tablePartFinishForDesign, avFinishForDesign]) {
    for (const f of Object.values(fn(LC) || {})) {
      assert.ok(MATERIAL_PRESETS[f.canonical], `${f.material} → ${f.canonical}: 정식 재질이 아니다`);
    }
  }
});

// ── B. 방 껍데기 ───────────────────────────────────────────────────────────

test('② 벽 — 밝은 오프화이트다(순백도, 푸른 회색도 아니다)', () => {
  const r = roomFinishForDesign(LC);
  assert.ok(r && r.wallFront && r.wallSide && r.wallAccent && r.baseboard);
  for (const k of ['wallFront', 'wallSide', 'wallAccent', 'baseboard']) {
    assert.equal(r[k].canonical, 'paintedWall', `${k}: 도장 벽이 아니다`);
    assert.notEqual(P[k].toLowerCase(), '#ffffff', `${k}: 순백은 날아간다`);
    assert.ok(lum(P[k]) > 0.82, `${k}: 밝기 ${lum(P[k]).toFixed(3)} — 밝은 벽이 아니다`);
    assert.ok(lum(P[k]) < 0.98, `${k}: 밝기 ${lum(P[k]).toFixed(3)} — 날아간다`);
    assert.ok(chroma(P[k]) <= 12, `${k}: 색기 ${chroma(P[k])} — 중성이 아니다`);
  }
  // 정면 벽이 가장 밝고, 옆벽·포인트 벽 순서로 내려간다(모서리가 읽힌다).
  assert.ok(lum(P.wallFront) > lum(P.wallSide), '정면 벽이 옆벽보다 밝지 않다');
  assert.ok(lum(P.wallSide) > lum(P.wallAccent), '옆벽이 포인트 벽보다 밝지 않다');
  // 포인트 벽을 **질감으로 꾸미지 않는다** — 임원(흡음 패널)과 갈리는 지점이다.
  assert.equal(ROOM_DESIGNS[LC].materials.wallAccent, undefined);
  assert.equal(r.wallAccent.canonical, r.wallFront.canonical);
});

test('③④ 바닥 — 카펫 타일 계열이고 실제 규격(500mm)이 그대로다', () => {
  const r = roomFinishForDesign(LC);
  assert.equal(ROOM_DESIGNS[LC].materials.floor, 'carpetTileLight');
  assert.equal(r.floor.canonical, 'carpetTile');
  assert.equal(MATERIAL_PRESETS.carpetTile.tileMm, 500, '카펫 실제 규격이 바뀌었다');
  assert.equal(realWorldTileMm('carpetTile'), 500);
  assert.equal(realWorldTileMm('carpetTileLight'), 500, '별칭도 같은 규격이어야 한다');
  // 바닥은 벽보다 확실히 어둡다(같으면 '빈 회색 판'으로 읽힌다).
  assert.ok(lum(P.floor) < lum(P.wallSide) - 0.05, '바닥과 벽이 갈리지 않는다');
  assert.ok(lum(P.floor) > 0.65, `바닥 ${lum(P.floor).toFixed(3)} — 넓은 방에 어둡다`);
  // 대기업보다 밝고, 임원과 같은 계열 안에 있다(같은 건물로 보여야 한다).
  assert.ok(lum(P.floor) > lum(DESIGN_PALETTES.corporateNeutral.floor));
  assert.ok(Math.abs(lum(P.floor) - lum(DESIGN_PALETTES.executiveBright.floor)) < 0.05);
});

test('⑤ 러그 — 바닥과 거의 같은 톤이다(구역을 가르지 않는다)', () => {
  const fp = floorPartFinishForDesign(LC);
  const r = roomFinishForDesign(LC);
  assert.ok(fp && fp.rug);
  assert.deepEqual([...FLOOR_PARTS], ['rug']);
  assert.equal(fp.rug.canonical, r.floor.canonical, '러그와 바닥은 같은 질감이다');
  assert.ok(Math.abs(lum(P.rug) - lum(P.floor)) < 0.03,
    `러그와 바닥 차이 ${(lum(P.rug) - lum(P.floor)).toFixed(3)} — 판처럼 도드라진다`);
  // 푸른 판이 되면 안 된다(§11).
  assert.ok(chroma(P.rug) <= 6, `러그 색기 ${chroma(P.rug)}`);
});

// ── C. 대형 U 테이블 ───────────────────────────────────────────────────────

test('⑤ 상판 — 라이트 애시 작업면이고 임원 오크와 구분된다', () => {
  const t = tablePartFinishForDesign(LC);
  assert.ok(t && t.conferenceTop);
  assert.equal(ROOM_DESIGNS[LC].materials.tableTop, 'lightAsh');
  assert.equal(t.conferenceTop.canonical, 'neutralLaminate', '중성 라미네이트가 아니다');
  assert.notEqual(t.conferenceTop.canonical, 'woodTable', '임원처럼 나뭇결 상판이 됐다');
  const ex = DESIGN_PALETTES.executiveBright.boardroomTop;
  assert.ok(lum(P.conferenceTop) > lum(ex) + 0.04,
    `상판 ${lum(P.conferenceTop).toFixed(3)} vs 임원 ${lum(ex).toFixed(3)} — 구분되지 않는다`);
  assert.ok(chroma(P.conferenceTop) < chroma(ex), '임원 오크보다 노랑기가 적어야 한다');
  // 순백도 아니고, 벽보다 밝지도 않다(넓은 상판이 벽보다 밝으면 LED가 묻힌다).
  assert.notEqual(P.conferenceTop.toLowerCase(), '#ffffff');
  assert.ok(lum(P.conferenceTop) < lum(P.wallFront), '상판이 벽보다 밝다');
  assert.ok(lum(P.conferenceTop) > lum(P.floor), '상판이 바닥보다 어둡다');
});

test('⑥ 하부 — 짙은 그라파이트이고 상판과 확실히 갈린다', () => {
  const t = tablePartFinishForDesign(LC);
  assert.ok(t.conferenceBase);
  assert.equal(t.conferenceBase.canonical, 'darkGraphite');
  assert.ok(lum(P.conferenceTop) - lum(P.conferenceBase) > 0.6, '상판이 얇아 보이지 않는다');
  assert.ok(lum(P.conferenceBase) > 0.05, '순수 검정에 가까우면 형태가 죽는다');
  assert.ok(chroma(P.conferenceBase) <= 14, '금속 광택/색기가 돈다');
  // 거칠기는 부품 마감표가 정한 값을 그대로 나른다(디자인이 반질거리게 만들지 않는다).
  assert.equal(t.conferenceBase.roughness, PART_FINISH.conferenceBase.roughness);
});

test('마감이 **다른 테이블로 새지 않는다** — 이름을 나눠 둔 이유', () => {
  assert.deepEqual([...TABLE_PARTS], ['boardroomTop', 'boardroomBase']);
  assert.deepEqual([...CONFERENCE_TABLE_PARTS], ['conferenceTop', 'conferenceBase']);
  assert.deepEqual([...ALL_TABLE_PARTS], [...TABLE_PARTS, ...CONFERENCE_TABLE_PARTS]);
  // 새 부품 이름이 **기존 부품 이름을 가로채지 않는다**(가로채면 회의 테이블·책상이 같이 바뀐다).
  for (const part of CONFERENCE_TABLE_PARTS) {
    assert.ok(!PART_MATERIAL[part], `${part}: 기존 부품 이름과 겹친다`);
    assert.ok(PART_FINISH[part], `${part}: 마감 표에 없다`);
  }
  // 대기업은 테이블 마감이 아예 안 붙는다(팔레트에 그 색이 없다).
  assert.equal(tablePartFinishForDesign('corporateMeeting'), null);
  // 임원은 제 부품만 — 범용(폴백) 테이블 부품을 빌려 가지 않는다(PHASE 4-d.5에서도 그대로).
  assert.deepEqual(Object.keys(tablePartFinishForDesign('executiveBoardroom')), [...TABLE_PARTS]);
  // 대회의실은 제 부품 + **범용 테이블 부품**이다(PHASE 4-d.5).
  //   전용 자산이 못 읽는 모양(보트·사각형)에서 폴백 테이블이 같은 마감을 받게 하기 위해서다.
  assert.deepEqual(Object.keys(tablePartFinishForDesign(LC)),
    [...CONFERENCE_TABLE_PARTS, 'tableTop', 'tableBase', 'tableBeam']);
  assert.equal(glSrc.includes('mat.corporateTop'), true, '대기업 테이블 경로가 사라졌다');
  const body = glSrc.match(/function largeUTableMesh[\s\S]*?\n}\n/)[0];
  assert.ok(!/mat\.corporateTop|mat\.tableBase/.test(body), '대회의실이 남의 부품을 쓴다');
});

// ── D. AV 장비 ─────────────────────────────────────────────────────────────

test('⑦⑧⑩ 모니터·프롬프터 본체 — 어둡되 검은 구멍이 아니다', () => {
  const av = avFinishForDesign(LC);
  assert.ok(av);
  assert.deepEqual([...AV_PARTS], ['monitorBody', 'monitorStand', 'prompterBody', 'screen']);
  assert.equal(ROOM_DESIGNS[LC].materials.av, 'blackEquipment');
  for (const k of ['monitorBody', 'monitorStand', 'prompterBody']) {
    assert.ok(av[k], `${k}: 마감이 안 붙었다`);
    assert.equal(av[k].canonical, 'blackEquipment', `${k}: 다른 재질로 갔다`);
    assert.ok(lum(P[k]) > 0.10, `${k}: ${lum(P[k]).toFixed(3)} — 검은 띠로 뭉친다`);
    assert.ok(lum(P[k]) < 0.30, `${k}: ${lum(P[k]).toFixed(3)} — 업무용 장비로 안 보인다`);
  }
  // 받침이 본체보다 아주 살짝 밝다(§13) — 받침이 본체에 먹히지 않는다.
  assert.ok(lum(P.monitorStand) > lum(P.monitorBody), '받침이 본체보다 어둡다');
  assert.ok(lum(P.monitorStand) - lum(P.monitorBody) < 0.06, '받침이 따로 논다');
  // 프롬프터는 모니터와 같은 계열이다(같은 AV 장비로 읽혀야 한다).
  assert.equal(P.prompterBody, P.monitorBody);
  // 받침의 금속성은 부품 마감표 값을 그대로 나른다.
  assert.equal(av.monitorStand.metalness, PART_FINISH.monitorStand.metalness);
});

test('⑨⑪ 꺼진 화면 — 빛나지 않고 본체보다 어둡다', () => {
  const av = avFinishForDesign(LC);
  assert.ok(av.screen, '화면 마감이 안 붙었다');
  assert.ok(lum(P.screen) < lum(P.monitorBody), '화면이 본체보다 밝다 — 켜진 것처럼 보인다');
  assert.ok(lum(P.screen) > 0.04, '완전한 검은 구멍이다');
  assert.ok(lum(P.screen) < 0.15, `화면 ${lum(P.screen).toFixed(3)} — 발광처럼 보인다`);
  // 아주 약한 푸른기(스탠바이 화면). 강한 색은 아니다.
  const n = parseInt(P.screen.slice(1), 16);
  assert.ok((n & 255) > (n >> 16 & 255), '푸른기가 없다');
  assert.ok(chroma(P.screen) <= 24, '화면 색이 너무 강하다');
  // 발광(emissive) 설정이 어디에도 없다 — LED가 유일한 발광체다.
  assert.ok(!/emissive/i.test(finSrc), '마감 층에 발광 설정이 생겼다');
  // 화면은 **색을 재질이 들고 다니지 않는다** — 질감만 적혀 있다.
  const f = finishForPart('screen');
  assert.ok(f && !f.color, '꺼진 화면에 재질 색이 생겼다');
  assert.equal(f.material, 'blackEquipment');
});

test('⑮ AV 수납장 — 흰 상자가 아니라 낮은 AV 가구다', () => {
  const c = credenzaFinishForDesign(LC);
  assert.ok(c && c.credenzaBody && c.credenzaDoor && c.credenzaTop && c.credenzaToe);
  assert.equal(ROOM_DESIGNS[LC].materials.credenza, 'darkGraphite');
  for (const k of Object.keys(c)) assert.ok(lum(P[k]) < 0.30, `${k}: 밝은 상자로 남았다`);
  // 상판이 몸통보다 밝다 — 수평면이 빛을 받아 형태가 살아난다.
  assert.ok(lum(P.credenzaTop) > lum(P.credenzaBody));
  assert.ok(lum(P.credenzaToe) < lum(P.credenzaBody), '굽이 가장 어둡다');
  // 실제로 이 방의 배치에 수납장이 있다(없는데 마감만 정하지 않았다).
  assert.ok(lay(16000, 12000, 30).items.some(i => i.type === 'credenza'), '수납장이 배치에 없다');
});

// ── E. 시각 순서 ───────────────────────────────────────────────────────────

test('⑱ 밝기 순서 — 벽 > 상판 > 바닥 ≫ 의자·AV', () => {
  const chair = '#3a3e44';   // darkGraphite 기준색(의자는 동결)
  const order = [
    ['wallFront', lum(P.wallFront)], ['conferenceTop', lum(P.conferenceTop)],
    ['floor', lum(P.floor)], ['chair', lum(chair)],
    ['monitorBody', lum(P.monitorBody)], ['screen', lum(P.screen)],
  ];
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i - 1][1] > order[i][1],
      `${order[i - 1][0]}(${order[i - 1][1].toFixed(3)}) ≤ ${order[i][0]}(${order[i][1].toFixed(3)})`);
  }
  // 모니터 줄이 '검은 벽'이 되지 않도록 의자와 너무 벌어지지 않는다.
  // 모니터 줄이 '검은 벽'이 되지 않도록 의자와 같은 어두운 계열 안에 머문다.
  //   (모니터가 의자보다 조금 어두운 것은 정상이다 — 무광 검정 디스플레이 vs 그라파이트 프레임)
  assert.ok(Math.abs(lum(P.monitorBody) - lum(chair)) < 0.10, 'AV가 의자와 따로 논다');
});

// ── F. 동결 ────────────────────────────────────────────────────────────────

test('⑭ 대회의실 의자 — 형상·재질 전부 그대로다', () => {
  const parts = createConferenceErgoChair();
  assert.equal(parts.length, 13);
  assert.deepEqual([...new Set(parts.map(p => p.kind))].sort(),
    ['chairArmPad', 'chairCaster', 'chairColumn', 'chairCushion', 'chairFrame', 'chairMesh']);
  // 팔레트가 의자 색을 정하지 않는다 — 정하면 승인된 의자가 바뀐다(§12).
  for (const k of ['chairFrame', 'chairMesh', 'chairCushion', 'chairArmPad', 'chairColumn', 'chairCaster']) {
    assert.equal(P[k], undefined, `${k}: 팔레트가 의자 색을 덮어쓴다`);
  }
});

test('⑮⑯⑰ U 테이블·모니터·프롬프터 형상이 그대로다', () => {
  const res = lay(16000, 12000, 30);
  const S = createLargeUTable(res.items.filter(i => i.type === 'table'));
  assert.equal(S.outerW, 12000);
  assert.equal(S.outerD, 6500);
  assert.equal(S.surfaceY, 740);
  assert.equal(S.topThk, 25);
  assert.equal(S.frontR, 180);
  assert.equal(S.supports.length, 11);
  assert.equal(S.maxSpan, 2186);
  const mons = res.items.filter(i => i.type === 'monitor');
  const pro = res.items.filter(i => i.type === 'prompter');
  assert.equal(mons.length, 30);
  assert.equal(pro.length, 1);
  assert.equal(pro[0].x, 8000);
  assert.equal(pro[0].z, 7650);
  assert.equal(createPersonalMonitor().length, 4);
  assert.equal(createPrompter().length, 4);
  assert.equal(createPrompter()[2].tiltX, FURNITURE_CONTRACTS.prompter.dimensions.tiltDeg);
  assert.equal(res.capacity, 30);
});

test('⑱⑲⑳ LED·화각을 건드리지 않았다(조명은 PHASE 4-d.2)', () => {
  const d = ROOM_DESIGNS[LC];
  // 화각은 **이 단계 뒤(PHASE 4-d.3)** 에 켜졌다 — 마감 층이 켠 것이 아니다.
  //   여기서 지키는 것은 '마감 층이 화각·조명 모듈에 손대지 않는다'는 쪽이다(아래 import 검사).
  assert.equal(d.camera, 'conferenceProposal');
  assert.ok(isPlanned(d.wallTreatment));
  // 마감 층이 LED·조명·그림자·노출을 건드리지 않는다(§16·§17).
  //   ('lightAsh'·'carpetTileLight' 같은 **재질 이름**은 조명이 아니므로 식별자로만 본다.)
  assert.ok(!/\bemissive\b|\btoneMapping\b|\bexposure\b|shadowSettings|lightingPreset|\bLIGHTS\b/
    .test(finSrc), '마감 층이 LED·조명을 건드린다');
  assert.ok(!/design-lighting|design-camera/.test(finSrc), '마감 층이 조명·화각 모듈을 읽는다');
});

test('㉑㉒㉓㉔ 대기업·임원 마감이 한 값도 바뀌지 않았다', () => {
  assert.deepEqual({ ...DESIGN_PALETTES.corporateNeutral }, {
    id: 'corporateNeutral', label: '대기업 중성 마감',
    floor: '#b9bab8', wallFront: '#f1efea', wallSide: '#eae7e1', wallAccent: '#e5e1da',
    baseboard: '#dedad2', credenzaBody: '#262a30', credenzaDoor: '#1f2328',
    credenzaTop: '#343940', credenzaToe: '#15181c', rug: '#c6c5c1',
  });
  const ex = DESIGN_PALETTES.executiveBright;
  assert.equal(ex.floor, '#c3c1bc');
  assert.equal(ex.wallFront, '#f4f1ec');
  assert.equal(ex.boardroomTop, '#dbcdb6');
  assert.equal(ex.boardroomBase, '#34383e');
  assert.equal(ROOM_DESIGNS.executiveBoardroom.materials.wallAccent, 'acousticPanel');
  assert.equal(roomFinishForDesign('executiveBoardroom').wallAccent.canonical, 'acousticPanel');
  // 두 공간의 배치도 그대로다.
  for (const [W, D] of [[8000, 7000], [11000, 9000]]) {
    const a = layoutRoom('meeting', defaultOptions('meeting'), { W, D, ledBottom: 1000 });
    const b = layoutRoom('meeting', defaultOptions('meeting'),
      { W, D, ledBottom: 1000, design: 'corporateMeeting' });
    assert.deepEqual(b.items, a.items);
  }
});

test('㉕ 마감을 선언하지 않은 공간으로 새지 않는다', () => {
  for (const id of DESIGN_IDS) {
    // 상황실은 PHASE 5-d.1 에서 제 마감을 갖게 됐다(대회의실 것을 물려받은 것이 아니다).
    //   교육장은 PHASE 7-a 에서 제 마감을 갖게 됐다.
    if (['corporateMeeting', 'executiveBoardroom', LC, 'controlRoom', 'trainingRoom'].includes(id)) continue;
    for (const fn of [roomFinishForDesign, credenzaFinishForDesign,
      floorPartFinishForDesign, tablePartFinishForDesign, avFinishForDesign]) {
      assert.equal(fn(id), null, `${id}: ${fn.name}`);
    }
  }
  // AV 마감은 대회의실에만 붙는다(다른 공간은 AV 재질을 정하지 않았다).
  assert.equal(avFinishForDesign('corporateMeeting'), null);
  assert.equal(avFinishForDesign('executiveBoardroom'), null);
  for (const id of [null, undefined, '', '없는디자인', 0, {}]) {
    assert.equal(avFinishForDesign(id), null, String(id));
  }
});

// ── G. 순수성 · 무회귀 ─────────────────────────────────────────────────────

test('㉖ 마감 해석기는 Three.js·DOM 없이 돈다', () => {
  assert.ok(!/\bTHREE\b|document|window|require\(/.test(finSrc), '마감 층이 순수하지 않다');
  assert.equal(typeof globalThis.document, 'undefined');
  assert.ok(Object.isFrozen(P));
  assert.deepEqual(avFinishForDesign(LC), avFinishForDesign(LC));
  // 새 framework 를 만들지 않았다 — PHASE 2-c 흐름에 한 줄만 더했다.
  assert.match(glSrc, /tablePartFinishForDesign\(designId\), avFinishForDesign\(designId\)/);
});

test('㉗㉘ 계산기·가격표 무회귀', () => {
  const m = MODELS.find(x => x.id === 'MP012F');
  const r = computeConfig(m, 6000, 3400, { mode: 'manual', cols: 7, rows: 6 });
  assert.equal(r.total, 42);
  assert.equal(r.resW, 4480);
  assert.equal(r.maxW, 6132);
  assert.match(appSrc, /await import\('\.\/prices\.local\.js\?v=\d+'\)\)\.PRICES; \} catch \{ PRICES = null; \}/);
  assert.equal(existsSync(new URL('../src/prices.local.js', import.meta.url)), false);
});

test('기준 색 고정 — conferenceBright', () => {
  assert.deepEqual({ ...P }, {
    id: 'conferenceBright', label: '대회의실 밝은 운영 마감',
    floor: '#c0c1c0', wallFront: '#f3f1ed', wallSide: '#ece9e4', wallAccent: '#e4e0d9',
    baseboard: '#e0dcd5',
    conferenceTop: '#e2ddd1', conferenceBase: '#3a3f46',
    monitorBody: '#262b31', monitorStand: '#2e343b', prompterBody: '#262b31', screen: '#181f2a',
    credenzaBody: '#2b3037', credenzaDoor: '#252a30', credenzaTop: '#353b43', credenzaToe: '#1a1e23',
    rug: '#c4c5c3',
  });
});
