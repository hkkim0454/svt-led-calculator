// design-finish.test.js — 공간 디자인 마감(바닥·벽·AV 수납장) 회귀 테스트. (PHASE 2-c)
// 여기서 지키는 것은 두 가지다.
//   ① 대기업 회의실이 **의도한 마감**으로 풀리는가.
//   ② 그 마감이 **다른 공간으로 새지 않는가** — 이것이 더 중요하다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DESIGN_PALETTES, ROOM_FINISH_ROLES, CREDENZA_PARTS, FLOOR_PARTS,
  designPalette, roomFinishForDesign, credenzaFinishForDesign,
  floorPartFinishForDesign, finishStatusForDesign,
} from '../src/design-finish.js';
import {
  MATERIAL_IDS, MATERIAL_ALIASES, MATERIAL_PRESETS, resolveMaterialId,
  materialPreset, tileRepeat, floorFinishFor, PART_MATERIAL, PART_FINISH,
} from '../src/materials.js';
import { ROOM_DESIGNS, DESIGN_IDS } from '../src/room-design.js';
import { DIMS, createAvCredenza, createCorporateChair, createCorporateTable } from '../src/furniture-assets.js';

const hex = /^#[0-9a-f]{6}$/i;
const lum = c => {
  const n = parseInt(c.slice(1), 16);
  return (0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255;
};

// ① 바닥 → carpetTileLight / 정식 carpetTile
test('대기업 회의실 바닥 — carpetTileLight(별칭)로 정해지고 정식 carpetTile로 풀린다', () => {
  const f = roomFinishForDesign('corporateMeeting');
  assert.ok(f && f.floor, '바닥 마감이 없다');
  assert.equal(f.floor.material, 'carpetTileLight');
  assert.equal(f.floor.canonical, 'carpetTile');
  assert.match(f.floor.color, hex);
  // 용도가 정하던 기존 규칙도 그대로 살아 있어야 한다(디자인이 없는 공간이 이것을 쓴다).
  assert.equal(floorFinishFor('meeting'), 'carpetTile');
  assert.equal(floorFinishFor('classroom'), 'vinylFloor');
});

// ② 벽 → paintedWallWhite / 정식 paintedWall
test('대기업 회의실 벽 — paintedWallWhite(별칭)로 정해지고 정식 paintedWall로 풀린다', () => {
  const f = roomFinishForDesign('corporateMeeting');
  for (const role of ['wallFront', 'wallSide', 'wallAccent', 'baseboard']) {
    assert.ok(f[role], `${role} 마감이 없다`);
    assert.equal(f[role].material, 'paintedWallWhite', role);
    assert.equal(f[role].canonical, 'paintedWall', role);
    assert.match(f[role].color, hex, role);
  }
  // 벽은 **순백이 아니다.** 넓은 면이 하얗게 날아가면 LED가 주인공 자리를 뺏긴다.
  for (const role of ['wallFront', 'wallSide', 'wallAccent']) {
    assert.notEqual(f[role].color.toLowerCase(), '#ffffff', role);
    assert.ok(lum(f[role].color) < 0.97, `${role} 이 너무 밝다(${f[role].color})`);
    assert.ok(lum(f[role].color) > 0.80, `${role} 이 오프화이트라기엔 어둡다(${f[role].color})`);
  }
});

// ③ 수납장 → 어두운 AV 재질
test('대기업 회의실 AV 수납장 — 어두운 AV 장비 재질로 정해진다', () => {
  const c = credenzaFinishForDesign('corporateMeeting');
  assert.ok(c, '수납장 마감이 없다');
  assert.deepEqual(Object.keys(c).sort(), [...CREDENZA_PARTS].sort(), '부품이 늘거나 줄었다');
  assert.equal(c.credenzaBody.canonical, 'blackEquipment');
  assert.equal(c.credenzaDoor.canonical, 'blackEquipment');
  for (const part of CREDENZA_PARTS) {
    assert.ok(lum(c[part].color) < 0.28, `${part} 이 AV 장비라기엔 밝다(${c[part].color})`);
    // **순수 검정 금지** — 새까맣게 칠하면 모서리와 형태가 죽는다.
    assert.notEqual(c[part].color.toLowerCase(), '#000000', part);
    assert.ok(lum(c[part].color) > 0.02, `${part} 이 검은 구멍이 된다(${c[part].color})`);
  }
  // 의자(그라파이트)와 **같은 덩어리로 뭉치지 않아야** 한다 — 몸통이 의자보다 확실히 어둡다.
  const chairFrame = '#3a3e44';
  assert.ok(lum(c.credenzaBody.color) < lum(chairFrame) - 0.02,
    `수납장 몸통(${c.credenzaBody.color})이 의자 프레임(${chairFrame})과 구분되지 않는다`);
  // 상판은 한 단 밝다 — 수평면이 빛을 받아 형태가 살아난다.
  assert.ok(lum(c.credenzaTop.color) > lum(c.credenzaBody.color), '상판이 몸통보다 밝아야 한다');
});

// ④ 정식 재질은 13종 그대로 / ⑤ 별칭은 별칭으로 남는다
test('정식 재질 13종 · 별칭은 별칭으로 — 마감을 켜도 재질이 늘지 않는다', () => {
  assert.equal(MATERIAL_IDS.length, 13);
  for (const [alias, canonical] of Object.entries(MATERIAL_ALIASES)) {
    assert.ok(!MATERIAL_IDS.includes(alias), `별칭 ${alias} 가 정식 재질 목록에 들어갔다`);
    assert.ok(!MATERIAL_PRESETS[alias], `별칭 ${alias} 에 프리셋이 생겼다(= 정식 재질이 되어 버렸다)`);
    assert.ok(MATERIAL_IDS.includes(canonical), `${alias} → ${canonical} 가 정식이 아니다`);
  }
  // 디자인이 쓰는 이름은 전부 기존 13종 또는 그 별칭이어야 한다.
  const used = new Set();
  const walk = v => { if (typeof v === 'string') used.add(v); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(ROOM_DESIGNS.corporateMeeting.materials);
  for (const n of used) assert.ok(MATERIAL_IDS.includes(resolveMaterialId(n)), `${n} 이 정식으로 풀리지 않는다`);
});

// ⑥ 카펫 실제 타일 크기는 방 크기와 무관하게 일정
test('카펫 타일 — 방이 커져도 타일 한 장의 실제 크기가 그대로다', () => {
  const p = materialPreset('carpetTileLight');
  assert.equal(p.id, 'carpetTile');
  assert.equal(p.tileMm, 500);
  for (const [w, d] of [[6, 5], [10, 8.5], [20, 15], [30, 24]]) {
    const rep = tileRepeat(p, w, d, 1000);
    // 반복 횟수 ÷ 면의 크기 = 1m당 타일 수 → 어느 방에서나 같아야 한다(= 2장/m).
    assert.ok(Math.abs(rep[0] / w - 2) < 1e-9, `가로 ${w}m: 타일 밀도가 다르다`);
    assert.ok(Math.abs(rep[1] / d - 2) < 1e-9, `세로 ${d}m: 타일 밀도가 다르다`);
  }
});

// ⑦ 격자와 바닥 재질은 별개의 길
test('바닥 재질과 기술 격자는 서로 다른 길이다(격자를 꺼도 카펫이 남는다)', () => {
  const src = readFileSync(new URL('../src/render3d-gl.js', import.meta.url), 'utf8');
  // 바닥 재질은 격자 표시 여부(show.grid)와 **무관하게** 만들어져야 한다.
  const floorLine = src.match(/const matFloor = [^\n]*\n/);
  assert.ok(floorLine, '바닥 재질을 만드는 곳을 찾지 못했다');
  assert.ok(!/grid/i.test(floorLine[0]), `바닥 재질이 격자에 묶여 있다: ${floorLine[0].trim()}`);
  // 격자는 바닥과 **다른 메시**여야 한다(덧판).
  assert.match(src, /grid\.name = 'floorGrid'/);
  assert.match(src, /floor\.name = 'floor'/);
});

// ⑧⑨⑩ 의자·테이블 동결
test('의자·테이블 동결 — PHASE 2-a/2-b/2-b.1 결과가 한 글자도 안 바뀐다', () => {
  const chair = createCorporateChair();
  assert.equal(chair.length, 12, '의자 부품 수');
  assert.equal(chair.filter(p => p.shape === 'star').length, 1, '5발 캐스터 받침 1개');
  const S = DIMS.corporateChair;
  assert.equal(S.seatTop, 450);
  assert.equal(S.overallH, 1040);
  // 의자 마감도 동결한다 — 색이 조용히 바뀌면 회의실 전체 인상이 달라진다.
  assert.deepEqual(Object.fromEntries(
    ['chairFrame', 'chairArmPad', 'chairCaster', 'chairColumn', 'chairMesh', 'chairCushion']
      .map(k => [k, [PART_FINISH[k].material, PART_FINISH[k].color]])), {
    chairFrame: ['darkGraphite', '#3a3e44'],
    chairArmPad: ['darkGraphite', '#33373d'],
    chairCaster: ['darkGraphite', '#2e3238'],
    chairColumn: ['darkGraphite', '#41464d'],
    chairMesh: ['fabricChair', '#454a51'],
    chairCushion: ['fabricChair', '#3d4147'],
  });
  // 상판 마감도 마찬가지다(PHASE 2-b). 순백이 아니어야 한다.
  assert.equal(PART_FINISH.corporateTop.material, 'neutralLaminate');
  assert.equal(PART_FINISH.corporateTop.color, '#e9e4da');

  const t = createCorporateTable({ shape: 'boat', w: 4000, d: 1500 });
  assert.equal(t.surfaceY, 740);
  assert.equal(t.topThk, 25);
  assert.equal(t.bulge, 120, '보트 부풀림 8% (1500 × 0.08)');
  assert.equal(t.bulge / t.d, 0.08);
  assert.deepEqual(t.supports.map(s => s.dx), [-1050, 1050], 'T형 받침 위치');
  assert.equal(createCorporateTable({ shape: 'rect', w: 4000, d: 1500 }).bulge, 0);
});

// ⑪ avCredenza 형상 무변경
test('AV 수납장 형상 무변경 — 마감만 바뀌고 치수·부품은 그대로다', () => {
  const parts = createAvCredenza(1800, 450);
  assert.deepEqual([...new Set(parts.map(p => p.kind))].sort(), [...CREDENZA_PARTS].sort());
  assert.equal(parts.length, 5, '굽·몸통·문2·상판 구성 그대로');
  // 전역 대응표는 건드리지 않았다 — 디자인이 없는 공간은 여전히 이 재질을 쓴다.
  assert.equal(PART_MATERIAL.credenzaBody, 'paintedWall');
  assert.equal(PART_MATERIAL.credenzaDoor, 'paintedWall');
  assert.equal(PART_MATERIAL.credenzaTop, 'woodTable');
  assert.equal(PART_MATERIAL.credenzaToe, 'metalFrame');
});

// ⑫ 다른 공간은 마감이 없다 — 이 단계에서 가장 중요한 테스트
test('마감이 다른 공간으로 새지 않는다 — 대기업 회의실 말고는 전부 null이다', () => {
  for (const id of DESIGN_IDS) {
    if (id === 'corporateMeeting') continue;
    assert.equal(roomFinishForDesign(id), null, `${id} 에 방 마감이 붙었다`);
    assert.equal(credenzaFinishForDesign(id), null, `${id} 에 수납장 마감이 붙었다`);
    assert.equal(floorPartFinishForDesign(id), null, `${id} 에 러그 마감이 붙었다`);
  }
  // 디자인이 아예 없는 공간(강의실·강당·아이디에이션)도 마찬가지다.
  for (const id of [null, undefined, '', '없는디자인', 0, {}]) {
    assert.equal(roomFinishForDesign(id), null, `${String(id)} 에 방 마감이 붙었다`);
    assert.equal(credenzaFinishForDesign(id), null, `${String(id)} 에 수납장 마감이 붙었다`);
    assert.equal(floorPartFinishForDesign(id), null, `${String(id)} 에 러그 마감이 붙었다`);
  }
});

// ⑬ 재질 캐시 재사용 — 같은 재질+같은 색은 한 벌
test('재질 재사용 — 같은 질감에 같은 색이면 캐시 열쇠가 같다(정식 id 기준)', () => {
  const src = readFileSync(new URL('../src/materials-gl.js', import.meta.url), 'utf8');
  // 열쇠는 **정식 id**로 만든다 — 별칭으로 만들면 같은 재질이 두 벌 생긴다.
  assert.match(src, /const id = canonical\(name\);[\s\S]{0,200}const key = `\$\{id\}\|/);
  // 색이 다르면 열쇠도 달라야 한다(디자인별 색은 정상적으로 따로 만들어진다).
  assert.match(src, /const key = `\$\{id\}\|\$\{color\}\|/);
  const f = roomFinishForDesign('corporateMeeting');
  // 벽 세 자리는 같은 질감·다른 색 → 재질 3벌이 정상이다(색이 실제로 다르므로).
  const colors = new Set(['wallFront', 'wallSide', 'wallAccent'].map(r => f[r].color));
  assert.equal(colors.size, 3, '벽 색이 겹치면 모서리가 사라진다');
  assert.equal(new Set(['wallFront', 'wallSide', 'wallAccent'].map(r => f[r].canonical)).size, 1,
    '벽은 질감 하나를 나눠 쓴다');
});

// ⑭ 순수 모듈에 Three.js가 들어오지 않았다
test('순수 계층 — 디자인·재질·마감 모듈은 Three.js도 DOM도 쓰지 않는다', () => {
  for (const f of ['design-finish.js', 'room-design.js', 'materials.js', 'furniture-contracts.js']) {
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    assert.ok(!/from ['"].*three/i.test(src), `${f} 가 Three.js 를 불러온다`);
    assert.ok(!/\bdocument\.|\bwindow\./.test(src), `${f} 가 DOM 을 쓴다`);
  }
});

// 구조 계약 — 팔레트·자리 이름이 서로 맞는다
test('팔레트 — 방 자리와 수납장 부품의 색이 빠짐없이 들어 있다', () => {
  const pal = designPalette('corporateNeutral');
  assert.ok(pal, '팔레트가 없다');
  for (const role of [...ROOM_FINISH_ROLES, ...CREDENZA_PARTS, ...FLOOR_PARTS]) {
    assert.match(pal[role] || '', hex, `${role} 색이 없다`);
  }
  assert.equal(designPalette('없는팔레트'), null);
  assert.equal(designPalette(null), null);
  assert.ok(Object.isFrozen(DESIGN_PALETTES) && Object.isFrozen(pal));
  // 바닥은 벽보다 확실히 어둡다 — 밝기가 비슷하면 '빈 회색 판'으로 읽힌다.
  assert.ok(lum(pal.floor) < lum(pal.wallSide) - 0.10,
    `바닥(${pal.floor})과 벽(${pal.wallSide})의 밝기 차가 너무 작다`);
  // 상태 요약도 같은 답을 한다.
  const st = finishStatusForDesign('corporateMeeting');
  assert.equal(st.palette, 'corporateNeutral');
  assert.equal(st.room.length, ROOM_FINISH_ROLES.length);
  assert.equal(st.credenza.length, CREDENZA_PARTS.length);
  assert.equal(st.floorParts.length, FLOOR_PARTS.length);
});

// 어댑터가 **쓰는 이름을 실제로 불러오는가.**
//   브라우저 전용 파일(THREE 의존)이라 Node에서 실행할 수 없다 — 그래서 이름만 대조한다.
//   이 검사가 없으면 `import`를 빠뜨려도 테스트는 전부 통과하고 **화면만 까맣게 죽는다**
//   (PHASE 2-c 작업 중 실제로 한 번 그렇게 됐다).
test('어댑터 — 쓰는 함수를 전부 import 한다(빠뜨리면 화면이 죽는다)', () => {
  const check = (file, names) => {
    const src = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const n of names) {
      if (!new RegExp(`\\b${n}\\s*\\(`).test(code)) continue;      // 안 쓰면 검사할 것도 없다
      const imported = new RegExp(`import\\s*\\{[^}]*\\b${n}\\b[^}]*\\}\\s*from`).test(code);
      assert.ok(imported, `${file} 이 ${n}() 를 쓰면서 import 하지 않는다`);
    }
  };
  check('render3d-gl.js', ['roomFinishForDesign', 'createMaterialLibrary', 'buildFurnitureGroup', 'renderMode']);
  check('furniture-gl.js', ['credenzaFinishForDesign', 'floorPartFinishForDesign',
    'resolveFurnitureForDesign', 'fitsCorporateTable',
    'createCorporateTable', 'createConferenceTable', 'finishForPart']);
  // 두 어댑터가 실제로 마감 해석기를 부르고 있는지도 확인한다(연결이 끊기면 마감이 안 걸린다).
  const shell = readFileSync(new URL('../src/render3d-gl.js', import.meta.url), 'utf8');
  assert.match(shell, /roomFinishForDesign\(model\.design\)/, '방 마감이 디자인과 연결되지 않았다');
  const furn = readFileSync(new URL('../src/furniture-gl.js', import.meta.url), 'utf8');
  assert.match(furn, /credenzaFinishForDesign\(designId\)/, '수납장 마감이 디자인과 연결되지 않았다');
});

// 러그 — 바닥 마감의 일부다(낮은 시점에서 좌석 구역을 덮는 넓은 면)
test('러그 — 바닥과 같은 질감을 쓰고, 색은 바닥과 같은 계열의 한 단 밝은 톤이다', () => {
  const r = floorPartFinishForDesign('corporateMeeting');
  const f = roomFinishForDesign('corporateMeeting');
  assert.ok(r && r.rug, '러그 마감이 없다');
  assert.equal(r.rug.canonical, f.floor.canonical, '러그와 바닥은 같은 질감을 쓴다');
  assert.equal(r.rug.canonical, 'carpetTile');
  // 기존 대응표에서도 러그는 이미 카펫이다 — 질감을 바꾼 것이 아니라 색만 맞춘 것이다.
  assert.equal(PART_MATERIAL.rug, 'carpetTile');
  const d = lum(r.rug.color) - lum(f.floor.color);
  assert.ok(d > 0, '러그가 바닥보다 어두우면 구역이 아니라 얼룩으로 읽힌다');
  assert.ok(d < 0.10, `러그가 바닥과 너무 갈린다(차이 ${d.toFixed(3)}) — 밝은 판처럼 도드라진다`);
  // 러그도 대기업 회의실 밖으로 새지 않는다.
  for (const id of DESIGN_IDS) {
    if (id !== 'corporateMeeting') assert.equal(floorPartFinishForDesign(id), null, id);
  }
});
