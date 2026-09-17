// executive-materials.test.js — 임원 회의실 마감(벽·바닥·테이블·AV 수납장) 회귀 테스트. (PHASE 3-c)
// ─────────────────────────────────────────────────────────────────────────────
// 여기서 지키는 것은 세 가지다.
//   ① 임원 회의실이 **의도한 마감**으로 풀리는가 — 밝고 절제된 프리미엄.
//   ② 그 마감이 **다른 공간으로 새지 않는가** — 특히 승인된 대기업 회의실 V1.
//   ③ 이번 단계가 **마감 단계**로 남는가 — 형상·조명·화각을 건드리지 않았는가.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DESIGN_PALETTES, ROOM_FINISH_ROLES, CREDENZA_PARTS, FLOOR_PARTS, TABLE_PARTS,
  designPalette, roomFinishForDesign, credenzaFinishForDesign,
  floorPartFinishForDesign, tablePartFinishForDesign, finishStatusForDesign,
} from '../src/design-finish.js';
import {
  MATERIAL_IDS, MATERIAL_ALIASES, MATERIAL_PRESETS, resolveMaterialId,
  materialPreset, PART_FINISH, PART_MATERIAL, finishForPart,
} from '../src/materials.js';
import { ROOM_DESIGNS, DESIGN_IDS, resolveDesign } from '../src/room-design.js';
import { lightingForDesign } from '../src/design-lighting.js';
import { cameraPlanForDesign } from '../src/design-camera.js';
import {
  createExecutiveChair, createBoardroomTable, createCorporateTable, createConferenceTable,
} from '../src/furniture-assets.js';
import { layoutRoom, defaultOptions } from '../src/room-presets.js';

const EX = 'executiveBoardroom';
const hex = /^#[0-9a-f]{6}$/i;
const rgb = c => { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const lum = c => { const [r, g, b] = rgb(c); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
const warmth = c => { const [r, , b] = rgb(c); return r - b; };          // 따뜻함(+) / 차가움(−)
const chroma = c => { const v = rgb(c); return Math.max(...v) - Math.min(...v); };  // 색기(채도 근사)
const glSrc = readFileSync(new URL('../src/furniture-gl.js', import.meta.url), 'utf8');

function uTables(W = 11000, D = 9000) {
  return layoutRoom('meeting', { ...defaultOptions('meeting'), tableShape: 'u', seats: 14, ledBottom: 1000 }, { W, D })
    .items.filter(i => i.type === 'table');
}

// ── A. 팔레트·역할 활성화 ───────────────────────────────────────────────────

test('① 임원 팔레트가 켜졌고, 마감 이름이 전부 맨 문자열이다(planned 가 아니다)', () => {
  const d = ROOM_DESIGNS[EX];
  assert.equal(d.palette, 'executiveBright');
  assert.ok(designPalette('executiveBright'), '팔레트가 없다');
  for (const [role, v] of Object.entries(d.materials)) {
    assert.equal(typeof v, 'string', `${role}: 아직 planned 다`);
    assert.ok(resolveMaterialId(v), `${role}: '${v}' 는 실재하는 재질이 아니다`);
  }
  const st = finishStatusForDesign(EX);
  assert.equal(st.palette, 'executiveBright');
  assert.deepEqual([...st.room], [...ROOM_FINISH_ROLES]);
  assert.deepEqual([...st.credenza], [...CREDENZA_PARTS]);
  assert.deepEqual([...st.floorParts], [...FLOOR_PARTS]);
  assert.deepEqual([...st.tableParts], [...TABLE_PARTS]);
});

test('② 벽 — 밝은 웜 오프화이트로 풀린다(순백도, 푸른 회색도, 베이지도 아니다)', () => {
  const f = roomFinishForDesign(EX);
  for (const role of ['wallFront', 'wallSide', 'baseboard']) {
    assert.equal(f[role].material, 'paintedWallWhite', role);
    assert.equal(f[role].canonical, 'paintedWall', role);
    assert.match(f[role].color, hex);
  }
  const w = f.wallFront.color;
  assert.ok(lum(w) >= 0.90 && lum(w) < 0.99, `정면 벽 밝기 ${lum(w).toFixed(3)} — 순백(1.0)이면 LED가 주인공 자리를 뺏긴다`);
  assert.ok(warmth(w) > 0, '벽에 푸른 기가 돈다 — 웜 뉴트럴이어야 한다');
  assert.ok(chroma(w) <= 14, `벽 색기 ${chroma(w)} — 호텔 베이지/아이보리로 읽힌다`);
  // 대기업 벽보다 **아주 조금만** 밝다. 크게 벌리면 다른 건물처럼 보인다.
  const cw = roomFinishForDesign('corporateMeeting').wallFront.color;
  const dL = lum(w) - lum(cw);
  assert.ok(dL > 0, '임원 벽이 대기업보다 어둡다');
  assert.ok(dL < 0.06, `벽 밝기 차 ${dL.toFixed(3)} — 같은 회사로 읽히지 않는다`);
});

test('③ 바닥 — 카펫 타일 경로로 풀리고, 대기업보다 한 단만 밝다', () => {
  const f = roomFinishForDesign(EX);
  assert.equal(f.floor.material, 'carpetTileLight');
  assert.equal(f.floor.canonical, 'carpetTile');
  const cf = roomFinishForDesign('corporateMeeting').floor.color;
  const dL = lum(f.floor.color) - lum(cf);
  assert.ok(dL > 0, '임원 바닥이 대기업보다 어둡다');
  assert.ok(dL < 0.08, `바닥 밝기 차 ${dL.toFixed(3)} — 두 공간이 다른 건물처럼 보인다`);
  // 바닥은 벽보다 확실히 어두워야 한다 — 같으면 '빈 회색 판' 하나로 읽힌다.
  assert.ok(lum(f.wallFront.color) - lum(f.floor.color) > 0.12, '벽과 바닥이 갈리지 않는다');
});

test('④ 상판 — 밝은 오크로 풀린다(다크 월넛도, 주황·노랑 캐스트도 아니다)', () => {
  const t = tablePartFinishForDesign(EX);
  assert.ok(t && t.boardroomTop, '상판 마감이 없다');
  assert.equal(t.boardroomTop.material, 'lightOak');
  assert.equal(t.boardroomTop.canonical, 'woodTable');
  const c = t.boardroomTop.color;
  assert.ok(lum(c) > 0.72, `상판 밝기 ${lum(c).toFixed(3)} — 어두우면 옛날식 월넛 임원 책상이 된다`);
  assert.ok(warmth(c) > 20, `상판 따뜻함 ${warmth(c)} — 나무로 읽히지 않는다`);
  assert.ok(warmth(c) < 55, `상판 따뜻함 ${warmth(c)} — 주황·노랑이 과하다`);
  assert.ok(chroma(c) <= 45, `상판 색기 ${chroma(c)} — 공간 전체를 지배한다`);
  // 대기업 상판(중성 라미네이트)과 **육안으로 구분**되어야 한다.
  const cc = PART_FINISH.corporateTop.color;
  assert.ok(warmth(c) - warmth(cc) > 15, '대기업 상판과 구분되지 않는다');
});

test('⑤ 하부 — 짙은 그라파이트로 풀린다(순수 검정도, 금속 광택도 아니다)', () => {
  const t = tablePartFinishForDesign(EX);
  assert.equal(t.boardroomBase.material, 'darkGraphite');
  assert.equal(t.boardroomBase.canonical, 'darkGraphite');
  const c = t.boardroomBase.color;
  assert.ok(lum(c) < 0.25, `하부 밝기 ${lum(c).toFixed(3)} — 밝으면 상판과 뭉친다`);
  assert.ok(lum(c) > 0.06, '순수 검정에 가까우면 모서리와 형태가 죽는다');
  // 의자 프레임과 같은 계열이되 **같은 색은 아니다**.
  assert.notEqual(c, PART_FINISH.chairFrame.color);
  assert.ok(Math.abs(lum(c) - lum(PART_FINISH.chairFrame.color)) < 0.08, '의자와 계열이 달라졌다');
  // 금속성은 부품 마감표가 정한 값 그대로여야 한다(크롬·광택 금지).
  assert.ok(!(t.boardroomBase.metalness > 0.2), '하부에 금속 광택이 생겼다');
});

test('⑥ AV 수납장 — 어두운 AV 가구로 풀리고, 의자보다 아주 조금 밝다', () => {
  const c = credenzaFinishForDesign(EX);
  assert.ok(c && c.credenzaBody);
  for (const part of CREDENZA_PARTS) {
    assert.equal(c[part].canonical, 'darkGraphite', part);
    assert.ok(lum(c[part].color) < 0.30, `${part}: 밝으면 흰 수납장이 된다`);
  }
  assert.ok(lum(c.credenzaTop.color) > lum(c.credenzaBody.color), '상판이 몸통보다 밝아야 수평면이 읽힌다');
  assert.ok(lum(c.credenzaToe.color) < lum(c.credenzaBody.color), '굽은 가장 어두워야 한다');
  // 새까만 장비 상자(대기업)보다 한 단 밝다 — 프리미엄 AV 가구.
  const cc = credenzaFinishForDesign('corporateMeeting');
  assert.ok(lum(c.credenzaBody.color) > lum(cc.credenzaBody.color), '대기업 수납장보다 어둡다');
});

// ── B. 재질 체계 ────────────────────────────────────────────────────────────

test('⑦ 정식 재질을 새로 만들지 않았다 — 13종 그대로', () => {
  assert.equal(MATERIAL_IDS.length, 13, `정식 재질이 ${MATERIAL_IDS.length}종으로 늘었다`);
  assert.equal(Object.keys(MATERIAL_PRESETS).length, 13);
});

test('⑧ 별칭은 별칭 그대로다(같은 정식 재질을 가리킨다)', () => {
  assert.equal(MATERIAL_ALIASES.carpetTileLight, 'carpetTile');
  assert.equal(MATERIAL_ALIASES.paintedWallWhite, 'paintedWall');
  assert.equal(MATERIAL_ALIASES.lightOak, 'woodTable');
  for (const [alias, target] of Object.entries(MATERIAL_ALIASES)) {
    assert.equal(MATERIAL_PRESETS[alias], undefined, `${alias} 가 정식 재질이 되어 버렸다`);
    assert.ok(MATERIAL_PRESETS[target], `${alias} → ${target} 가 실재하지 않는다`);
  }
});

test('⑨ 카펫 타일 실제 크기가 그대로다(방 크기와 무관한 500mm)', () => {
  assert.equal(materialPreset('carpetTile').tileMm, 500);
  assert.equal(materialPreset('carpetTileLight').tileMm, 500);
  assert.equal(materialPreset('paintedWall').tileMm, 1500);
  assert.equal(materialPreset('woodTable').tileMm, 1400);
});

test('⑩ 거칠기·금속성은 **부품 마감표 값 그대로** 실려 나온다(디자인은 색·재질만 바꾼다)', () => {
  const t = tablePartFinishForDesign(EX);
  for (const part of TABLE_PARTS) {
    const base = finishForPart(part);
    for (const k of ['roughness', 'metalness']) {
      if (typeof base[k] === 'number') {
        assert.equal(t[part][k], base[k], `${part}.${k} 가 디자인을 거치며 달라졌다`);
      } else {
        assert.equal(t[part][k], undefined, `${part}.${k} 를 디자인이 새로 만들어 냈다`);
      }
    }
  }
  assert.equal(finishForPart('boardroomBase').roughness, 0.72);
});

// ── C. 포인트 벽·러그 ───────────────────────────────────────────────────────

test('⑪ 포인트 벽 — **색이 아니라 질감**으로만 차이를 준다(새 형상 없음)', () => {
  const f = roomFinishForDesign(EX);
  assert.equal(f.wallAccent.material, 'acousticPanel');
  assert.equal(f.wallAccent.canonical, 'acousticPanel');
  // 색은 옆벽과 거의 같다 — 포인트 벽이 LED보다 먼저 보이면 안 된다.
  assert.ok(Math.abs(lum(f.wallAccent.color) - lum(f.wallSide.color)) < 0.05,
    '포인트 벽 색이 옆벽과 너무 갈린다 — LED보다 먼저 보인다');
  // 대기업은 그대로 도장 벽이다(포인트 재질을 선언하지 않았다).
  assert.equal(roomFinishForDesign('corporateMeeting').wallAccent.canonical, 'paintedWall');
  assert.equal(ROOM_DESIGNS.corporateMeeting.materials.wallAccent, undefined);
});

test('⑫ 러그 — 바닥과 같은 질감이고, 색만 바닥에 바싹 붙였다(형상은 손대지 않는다)', () => {
  const r = floorPartFinishForDesign(EX);
  const f = roomFinishForDesign(EX);
  assert.equal(r.rug.canonical, f.floor.canonical);
  assert.equal(r.rug.canonical, 'carpetTile');
  assert.equal(PART_MATERIAL.rug, 'carpetTile', '기존 대응표를 바꾸면 안 된다');
  const d = lum(r.rug.color) - lum(f.floor.color);
  assert.ok(d >= 0, '러그가 바닥보다 어두우면 얼룩으로 읽힌다');
  assert.ok(d < 0.03, `러그와 바닥 차이 ${d.toFixed(3)} — Reference 는 전체 카펫이라 러그가 도드라지면 안 된다`);
  // 옛 차가운 파란 판때기가 아니다.
  assert.ok(warmth(r.rug.color) >= 0, '러그에 푸른 기가 남아 있다');
});

// ── D. 동결 검증 ────────────────────────────────────────────────────────────

test('⑬ 대기업 회의실 완전 동결 — 팔레트·마감 해석 결과가 한 값도 안 바뀌었다', () => {
  assert.deepEqual({ ...DESIGN_PALETTES.corporateNeutral }, {
    id: 'corporateNeutral', label: '대기업 중성 마감',
    floor: '#b9bab8', wallFront: '#f1efea', wallSide: '#eae7e1', wallAccent: '#e5e1da',
    baseboard: '#dedad2',
    credenzaBody: '#262a30', credenzaDoor: '#1f2328', credenzaTop: '#343940', credenzaToe: '#15181c',
    rug: '#c6c5c1',
  });
  const f = roomFinishForDesign('corporateMeeting');
  assert.deepEqual(ROOM_FINISH_ROLES.map(r => `${r}:${f[r].canonical}:${f[r].color}`), [
    'floor:carpetTile:#b9bab8', 'wallFront:paintedWall:#f1efea', 'wallSide:paintedWall:#eae7e1',
    'wallAccent:paintedWall:#e5e1da', 'baseboard:paintedWall:#dedad2',
  ]);
  const c = credenzaFinishForDesign('corporateMeeting');
  assert.deepEqual(CREDENZA_PARTS.map(p => `${p}:${c[p].canonical}:${c[p].color}`), [
    'credenzaBody:blackEquipment:#262a30', 'credenzaDoor:blackEquipment:#1f2328',
    'credenzaTop:darkGraphite:#343940', 'credenzaToe:blackEquipment:#15181c',
  ]);
  assert.equal(floorPartFinishForDesign('corporateMeeting').rug.color, '#c6c5c1');
  // 대기업은 테이블 부품 마감을 타지 않는다 — 임원 전용 부품 이름이기 때문이다.
  assert.equal(tablePartFinishForDesign('corporateMeeting'), null);
});

test('⑭ 임원 의자 동결 — 마감도 형상도 PHASE 3-a 그대로다', () => {
  assert.deepEqual({
    chairFrame: [PART_FINISH.chairFrame.material, PART_FINISH.chairFrame.color],
    chairMesh: [PART_FINISH.chairMesh.material, PART_FINISH.chairMesh.color],
    chairCushion: [PART_FINISH.chairCushion.material, PART_FINISH.chairCushion.color],
    chairArmPad: [PART_FINISH.chairArmPad.material, PART_FINISH.chairArmPad.color],
    chairColumn: [PART_FINISH.chairColumn.material, PART_FINISH.chairColumn.color],
    chairCaster: [PART_FINISH.chairCaster.material, PART_FINISH.chairCaster.color],
  }, {
    chairFrame: ['darkGraphite', '#3a3e44'], chairMesh: ['fabricChair', '#454a51'],
    chairCushion: ['fabricChair', '#3d4147'], chairArmPad: ['darkGraphite', '#33373d'],
    chairColumn: ['darkGraphite', '#41464d'], chairCaster: ['darkGraphite', '#2e3238'],
  });
  const ch = createExecutiveChair();
  assert.equal(ch.length, 12, '임원 의자 부품 수가 바뀌었다');
  // 디자인 마감은 의자 부품을 건드리지 않는다.
  for (const fin of [roomFinishForDesign(EX), credenzaFinishForDesign(EX),
    floorPartFinishForDesign(EX), tablePartFinishForDesign(EX)]) {
    for (const k of Object.keys(fin || {})) assert.ok(!/^chair/.test(k), `의자 부품 ${k} 을 디자인이 덮는다`);
  }
});

test('⑮ 임원 테이블 형상 동결 — PHASE 3-b 기준 수치 그대로다', () => {
  const S = createBoardroomTable(uTables());
  assert.deepEqual({
    outerW: S.outerW, outerD: S.outerD, segW: S.segW, frontR: S.frontR, rearR: S.rearR,
    innerR: S.innerR, surfaceY: S.surfaceY, topThk: S.topThk, panelBottom: S.panelBottom,
    supports: S.supports.length, cx: S.cx, cz: S.cz,
  }, {
    outerW: 8100, outerD: 4500, segW: 900, frontR: 450, rearR: 162, innerR: 300,
    surfaceY: 745, topThk: 30, panelBottom: 95, supports: 7, cx: 5500, cz: 5000,
  });
});

test('⑯ 기존 테이블 동결 — 회의 테이블·대기업 테이블의 형상이 그대로다', () => {
  const conf = createConferenceTable({ shape: 'rect', w: 4000, d: 1500 });
  assert.equal(conf.surfaceY, 740);
  const corp = createCorporateTable({ shape: 'boat', w: 4000, d: 1500 });
  assert.equal(corp.surfaceY, 740);
  assert.equal(corp.topThk, 25);
  assert.equal(corp.bulge, 120);
  assert.equal(corp.supports.length, 2);
});

test('⑰ 화각은 아직 건드리지 않았다 — 조명만 PHASE 3-d.1 에서 켰다', () => {
  assert.equal(cameraPlanForDesign(EX, 'interior', { room: { W: 11, H: 3.8, D: 9 }, led: { w: 5.76, h: 2.16, y: 2 } }, 1.6), null,
    '임원 화각이 켜졌다 — PHASE 3-d.2 몫이다');
  const d = ROOM_DESIGNS[EX];
  assert.equal(typeof d.camera, 'object', 'camera 가 planned 가 아니다');
  // 조명은 PHASE 3-d.1 에서 켜졌다(마감 단계에서 켠 것이 아니다).
  assert.equal(d.lighting, 'executiveSoft');
  // 대기업 조명·화각은 그대로 살아 있어야 한다.
  assert.ok(lightingForDesign('corporateMeeting'), '대기업 조명이 사라졌다');
});

test('⑱ LED·방 껍데기 형상에는 마감이 닿지 않는다', () => {
  const all = { ...roomFinishForDesign(EX), ...credenzaFinishForDesign(EX),
    ...floorPartFinishForDesign(EX), ...tablePartFinishForDesign(EX) };
  for (const k of Object.keys(all)) {
    assert.ok(!/led|ceiling|stage|monitor|screen/i.test(k), `${k}: 마감이 LED·천장까지 건드린다`);
  }
  // 방 껍데기에서 마감이 붙는 자리는 PHASE 2-c 때와 같은 5자리뿐이다(새 자리를 만들지 않았다).
  assert.deepEqual([...ROOM_FINISH_ROLES],
    ['floor', 'wallFront', 'wallSide', 'wallAccent', 'baseboard']);
});

// ── E. 구조·순수성 ──────────────────────────────────────────────────────────

test('⑲ 순수 유지 — 마감 해석기는 Three.js·DOM 없이 돈다', () => {
  const src = readFileSync(new URL('../src/design-finish.js', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.equal(/from\s+['"].*three/i.test(code), false, 'Three.js 를 불러왔다');
  assert.equal(/\bdocument\.|\bwindow\./.test(code), false, 'DOM 을 만졌다');
  // 같은 입력이면 같은 결과다.
  assert.deepEqual(tablePartFinishForDesign(EX), tablePartFinishForDesign(EX));
});

test('⑳ 어댑터 — 테이블 부품 마감을 실제로 갈아 끼우고, 거칠기·금속성을 함께 넘긴다', () => {
  assert.match(glSrc, /tablePartFinishForDesign/, '테이블 부품 마감을 부르지 않는다');
  assert.match(glSrc, /credenzaFinishForDesign\(designId\), floorPartFinishForDesign\(designId\),\s*\n\s*tablePartFinishForDesign\(designId\)/,
    '테이블 부품 마감이 덮어쓰기 목록에 없다');
  assert.match(glSrc, /if \(typeof f\.roughness === 'number'\) extra\.roughness = f\.roughness;/,
    '거칠기를 넘기지 않는다 — 켜는 순간 그 부품만 반질반질해진다');
  // 새 framework 를 만들지 않았다 — PHASE 2-c 흐름을 그대로 쓴다.
  assert.match(glSrc, /for \(const fin of \[credenzaFinishForDesign/);
});

test('㉑ 마감을 선언하지 않은 공간은 여전히 전부 null 이다', () => {
  for (const id of DESIGN_IDS) {
    if (id === 'corporateMeeting' || id === EX) continue;
    for (const fn of [roomFinishForDesign, credenzaFinishForDesign,
      floorPartFinishForDesign, tablePartFinishForDesign]) {
      assert.equal(fn(id), null, `${id}: ${fn.name} 가 null 이 아니다`);
    }
  }
  for (const id of [null, undefined, '', '없는디자인', 0, {}]) {
    assert.equal(roomFinishForDesign(id), null, String(id));
    assert.equal(tablePartFinishForDesign(id), null, String(id));
  }
});

test('㉒ 해석 결과에 뜬 이름이 없다 — 적용되는 값은 전부 실재한다', () => {
  const r = resolveDesign(EX);
  const names = [r.palette, ...Object.values(r.materials || {})].filter(v => typeof v === 'string');
  assert.ok(names.length >= 6);
  for (const n of names) {
    assert.ok(resolveMaterialId(n) || designPalette(n), `없는 재질·팔레트 ${n}`);
  }
});
