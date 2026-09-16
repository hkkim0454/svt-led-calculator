// materials.test.js — 재질 라이브러리 명세 회귀 테스트.
// 핵심 규칙: (1) 실내 마감재는 반사가 거의 없다 (2) 무늬는 겨우 보일 정도까지만
//            (3) 무늬 간격은 실제 마감재 규격 (4) 가구 부품이 빠짐없이 재질과 이어진다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MATERIAL_PRESETS, MATERIAL_IDS, LEGACY_MATERIAL_IDS, DESIGN_MATERIAL_IDS,
  MATERIAL_ALIASES, MATERIAL_ROLES, ROLE_CANDIDATES, PART_FINISH,
  resolveMaterialId, materialPreset, isTransparentMaterial, realWorldTileMm, finishForPart,
  PART_MATERIAL, floorFinishFor, tileRepeat, MOODS, moodFor,
} from '../src/materials.js';
import { FURNITURE_COLORS } from '../src/furniture-assets.js';
import { MM_PER_UNIT } from '../src/gl-model.js';

test('재질 13종 — 보호 대상 7종 + 신규 6종이 모두 있고 수치가 채워져 있다', () => {
  // 기존 7종 — 순서까지 그대로다(호환성 계약).
  assert.deepEqual([...LEGACY_MATERIAL_IDS], [
    'paintedWall', 'carpetTile', 'vinylFloor', 'woodTable',
    'metalFrame', 'fabricChair', 'stageSurface',
  ]);
  // PHASE 1-b 신규 6종.
  assert.deepEqual([...DESIGN_MATERIAL_IDS], [
    'carpetTileDark', 'neutralLaminate', 'darkGraphite',
    'blackEquipment', 'glassPartition', 'acousticPanel',
  ]);
  // 정식 재질 = 7 + 6 = 13. 별칭은 여기에 세지 않는다.
  assert.equal(MATERIAL_IDS.length, 13);
  assert.deepEqual([...MATERIAL_IDS], [...LEGACY_MATERIAL_IDS, ...DESIGN_MATERIAL_IDS]);
  assert.equal(new Set(MATERIAL_IDS).size, 13, 'id가 겹친다');
  assert.deepEqual(Object.keys(MATERIAL_PRESETS), [...MATERIAL_IDS], '표와 목록이 어긋난다');
  for (const id of MATERIAL_IDS) {
    const p = MATERIAL_PRESETS[id];
    assert.ok(p, `${id} 없음`);
    assert.equal(p.id, id);
    assert.ok(p.label, `${id}: 라벨 필요`);
    assert.ok(p.roughness >= 0 && p.roughness <= 1, `${id}: roughness ${p.roughness}`);
    assert.ok(p.metalness >= 0 && p.metalness <= 1, `${id}: metalness ${p.metalness}`);
    assert.ok(p.normalScale >= 0 && p.normalScale <= 0.3, `${id}: 무늬가 과하다 ${p.normalScale}`);
    if (p.texture) assert.ok(p.tileMm > 0, `${id}: 무늬가 있으면 반복 간격이 필요하다`);
    else assert.equal(p.normalScale, 0, `${id}: 무늬가 없는데 normalScale이 있다`);
  }
});

test('카펫 — roughness 0.85~0.95, metalness 0, 타일 500mm(실제 규격)', () => {
  const c = MATERIAL_PRESETS.carpetTile;
  assert.ok(c.roughness >= 0.85 && c.roughness <= 0.95, `roughness ${c.roughness}`);
  assert.equal(c.metalness, 0);
  assert.equal(c.tileMm, 500, '카펫 타일 실제 규격');
  assert.ok(c.normalScale > 0, '카펫은 요철이 보여야 한다');
});

test('비닐 — 카펫보다 매끈하지만 반짝이는 플라스틱은 아니다', () => {
  const v = MATERIAL_PRESETS.vinylFloor, c = MATERIAL_PRESETS.carpetTile;
  assert.ok(v.roughness < c.roughness, '카펫보다 매끈해야 한다');
  assert.ok(v.roughness >= 0.7, `너무 반들거린다 ${v.roughness}`);
  assert.equal(v.metalness, 0);
  assert.ok(v.normalScale < c.normalScale, '비닐 요철은 카펫보다 약하다');
});

test('목재 — 결이 아주 옅다(강한 결 금지)', () => {
  const w = MATERIAL_PRESETS.woodTable;
  assert.equal(w.texture, 'wood');
  assert.ok(w.normalScale <= 0.12, `나뭇결이 강하다 ${w.normalScale}`);
  assert.equal(w.metalness, 0);
});

test('도장 벽 — 거칠고 반사가 거의 없다', () => {
  const p = MATERIAL_PRESETS.paintedWall;
  assert.ok(p.roughness >= 0.9, `벽이 너무 매끈하다 ${p.roughness}`);
  assert.equal(p.metalness, 0);
  assert.ok(p.normalScale <= 0.08, '벽 요철은 거의 보이지 않아야 한다');
});

test('LED보다 눈에 띄지 않는다 — 금속성은 가구·장비에만, 넓은 면은 언제나 무광', () => {
  // 금속성을 가질 수 있는 것은 **가구 부속과 AV 장비뿐**이다. 바닥·벽처럼 넓은 면이
  //   반짝이면 LED보다 그쪽에 먼저 시선이 간다.
  const shiny = MATERIAL_IDS.filter(id => MATERIAL_PRESETS[id].metalness > 0);
  assert.deepEqual(shiny, ['metalFrame', 'darkGraphite', 'blackEquipment'],
    '실내 마감재에 금속성이 있으면 반사가 시선을 끈다');
  // 어느 것도 기존 금속 프레임(0.35)보다 더 금속스러우면 안 된다.
  for (const id of shiny) {
    assert.ok(MATERIAL_PRESETS[id].metalness <= 0.35, `${id}: 금속성 ${MATERIAL_PRESETS[id].metalness}`);
  }
  // 바닥·벽·무대·흡음처럼 면적이 넓은 재질은 반드시 무광에 가깝고 금속성이 0이다.
  for (const id of ['paintedWall', 'carpetTile', 'carpetTileDark', 'vinylFloor', 'stageSurface', 'acousticPanel']) {
    assert.ok(MATERIAL_PRESETS[id].roughness >= 0.75, `${id}: 넓은 면이 반들거린다`);
    assert.equal(MATERIAL_PRESETS[id].metalness, 0, `${id}: 넓은 면에 금속성이 있다`);
  }
});

test('바닥 마감 — 강의실·아이디에이션은 비닐, 나머지는 카펫', () => {
  assert.equal(floorFinishFor('classroom'), 'vinylFloor');
  assert.equal(floorFinishFor('ideation'), 'vinylFloor');
  for (const id of ['meeting', 'hall_s', 'hall_m', 'hall_l', 'control', undefined]) {
    assert.equal(floorFinishFor(id), 'carpetTile', String(id));
  }
});

test('분위기 — 아이디에이션 공간만 더 밝고, 조명 구성은 방마다 바뀌지 않는다', () => {
  assert.equal(moodFor('ideation'), 'bright');
  for (const id of ['meeting', 'classroom', 'hall_s', 'control', undefined]) {
    assert.equal(moodFor(id), 'office', String(id));
  }
  assert.ok(MOODS.bright.light > MOODS.office.light, '아이디에이션이 더 밝아야 한다');
  assert.ok(MOODS.bright.wallMix > 0, '벽도 흰쪽으로 섞인다');
  assert.equal(MOODS.office.wallMix, 0, '기준 분위기는 색을 건드리지 않는다');
  assert.ok(MOODS.dim.light < MOODS.office.light, '어두운 분위기는 더 어둡다');
  // 밝기 차이가 과하면 같은 도구 안에서 방마다 다른 세상처럼 보인다.
  for (const m of Object.values(MOODS)) {
    assert.ok(m.light >= 0.75 && m.light <= 1.25, `${m.id}: 밝기 배수 ${m.light}`);
    assert.ok(m.label, `${m.id}: 라벨 필요`);
  }
});

test('무늬 간격 — 방이 커지면 반복도 같이 늘어난다(확대·축소되지 않는다)', () => {
  const carpet = MATERIAL_PRESETS.carpetTile;   // 500mm 타일
  // 10m × 8m 방 → 20 × 16장
  assert.deepEqual(tileRepeat(carpet, 10, 8, MM_PER_UNIT), [20, 16]);
  // 방이 두 배가 되면 타일 수도 두 배 — 타일 한 장의 '실제 크기'는 그대로다.
  assert.deepEqual(tileRepeat(carpet, 20, 16, MM_PER_UNIT), [40, 32]);
  // 아주 작은 면이라도 최소 1장은 깔린다(0으로 나뉘거나 무늬가 사라지지 않게).
  assert.deepEqual(tileRepeat(carpet, 0.2, 0.2, MM_PER_UNIT), [1, 1]);
  assert.equal(tileRepeat(MATERIAL_PRESETS.metalFrame, 5, 5, MM_PER_UNIT), null, '무늬 없는 재질');
  assert.equal(tileRepeat(null, 5, 5), null);
});

test('가구 부품 — 모든 색 이름이 재질과 이어진다(모니터·잎 제외)', () => {
  // 7종 프리셋에 없는 것 — 화면 2종(모니터·이동식 디스플레이)과 잎.
  const EXEMPT = new Set(['monitor', 'standPanel', 'plantLeaf']);
  for (const kind of Object.keys(FURNITURE_COLORS)) {
    if (EXEMPT.has(kind)) continue;
    const token = PART_MATERIAL[kind];
    assert.ok(token, `${kind}: 재질이 지정되지 않았다`);
    assert.ok(MATERIAL_PRESETS[token], `${kind}: 없는 재질 ${token}`);
  }
  // 대응표에 유령 항목이 없어야 한다(색이 사라졌는데 재질만 남는 것 방지).
  for (const kind of Object.keys(PART_MATERIAL)) {
    assert.ok(FURNITURE_COLORS[kind], `PART_MATERIAL에 없는 색 이름: ${kind}`);
  }
  // 앉는 면은 패브릭, 다리·프레임은 금속, 상판은 목재.
  assert.equal(PART_MATERIAL.seatFabric, 'fabricChair');
  assert.equal(PART_MATERIAL.chairSeat, 'fabricChair');
  assert.equal(PART_MATERIAL.seatFrame, 'metalFrame');
  assert.equal(PART_MATERIAL.deskLeg, 'metalFrame');
  assert.equal(PART_MATERIAL.tableTop, 'woodTable');
  assert.equal(PART_MATERIAL.deskTop, 'woodTable');
});

// ── PHASE 1-b · Material Architecture Foundation ────────────────────────────
// 핵심 규칙
//   (1) 기존 7종은 **호환성 보호 대상** — 값이 한 글자도 달라지면 안 된다.
//   (2) 신규 6종은 선언만 — 화면에 연결되지 않는다.
//   (3) 별칭은 정식 재질이 아니다 — 개수에 세지 않고, 재질을 복제하지도 않는다.
//   (4) PART_FINISH는 지금 쓰는 가구 부품에 하나도 걸리지 않는다.

/**
 * **PHASE 1-b 이전 스냅샷.** 삼성 기준값과 같은 성격의 '고정된 사실'이다.
 * 이 표와 다르면 기존 화면이 이미 바뀐 것이다. 여기를 고쳐서 테스트를 통과시키지 말 것.
 */
const LEGACY_SNAPSHOT = Object.freeze({
  paintedWall: { id: 'paintedWall', label: '도장 벽', roughness: 0.96, metalness: 0, normalScale: 0.05, tileMm: 1500, texture: 'speckle' },
  carpetTile: { id: 'carpetTile', label: '카펫 타일', roughness: 0.92, metalness: 0, normalScale: 0.28, tileMm: 500, texture: 'carpet' },
  vinylFloor: { id: 'vinylFloor', label: '비닐 바닥', roughness: 0.78, metalness: 0, normalScale: 0.08, tileMm: 600, texture: 'speckle' },
  woodTable: { id: 'woodTable', label: '목재 상판', roughness: 0.62, metalness: 0, normalScale: 0.10, tileMm: 1400, texture: 'wood' },
  metalFrame: { id: 'metalFrame', label: '금속 프레임', roughness: 0.45, metalness: 0.35, normalScale: 0, tileMm: 0, texture: null },
  fabricChair: { id: 'fabricChair', label: '패브릭 의자', roughness: 0.94, metalness: 0, normalScale: 0.18, tileMm: 220, texture: 'carpet' },
  stageSurface: { id: 'stageSurface', label: '무대 마감', roughness: 0.90, metalness: 0, normalScale: 0.12, tileMm: 900, texture: 'speckle' },
});

test('기존 7종 잠금 — PHASE 1-b 이전 값과 한 글자도 다르지 않다', () => {
  assert.deepEqual(Object.keys(LEGACY_SNAPSHOT), [...LEGACY_MATERIAL_IDS]);
  for (const id of LEGACY_MATERIAL_IDS) {
    const now = MATERIAL_PRESETS[id];
    assert.ok(now, `${id}: 사라졌다`);
    // 필드가 새로 생기거나 사라지는 것도 변경이다 — 키 목록까지 통째로 비교한다.
    assert.deepEqual({ ...now }, LEGACY_SNAPSHOT[id], `${id}: 값이 달라졌다`);
  }
  // 신규 재질을 기존 자리에 끼워 넣지 않았는지 — 앞 7개가 그대로 기존 7종이어야 한다.
  assert.deepEqual(MATERIAL_IDS.slice(0, 7), [...LEGACY_MATERIAL_IDS]);
});

test('신규 6종 — 값이 요청한 범위 안에 있다', () => {
  for (const id of DESIGN_MATERIAL_IDS) {
    const p = MATERIAL_PRESETS[id];
    assert.ok(p, `${id} 없음`);
    assert.equal(p.id, id);
    assert.ok(p.label, `${id}: 라벨 필요`);
    // 신규 재질은 '색이 곧 정체성'이라 기준 색을 함께 들고 다닌다.
    assert.match(p.color, /^#[0-9a-f]{6}$/i, `${id}: 색 ${p.color}`);
  }
  const P = MATERIAL_PRESETS;
  // 어두운 카펫 — 금속성 0, 거칠기 0.88~0.95, 실제 규격 500mm, 밝은 카펫보다 무늬가 약하다.
  assert.equal(P.carpetTileDark.metalness, 0);
  assert.ok(P.carpetTileDark.roughness >= 0.88 && P.carpetTileDark.roughness <= 0.95,
    `carpetTileDark roughness ${P.carpetTileDark.roughness}`);
  assert.equal(P.carpetTileDark.tileMm, 500, '카펫 타일 실제 규격');
  assert.ok(P.carpetTileDark.normalScale < P.carpetTile.normalScale,
    '어두운 면에서 무늬가 세면 얼룩처럼 보인다');
  // 중성 라미네이트 — 목재보다 결이 옅고(과한 우드 금지) 금속성이 없다.
  assert.equal(P.neutralLaminate.metalness, 0);
  assert.ok(P.neutralLaminate.normalScale < P.woodTable.normalScale, '라미네이트에 나뭇결이 세다');
  assert.notEqual(P.neutralLaminate.color.toLowerCase(), '#ffffff', '순백 플라스틱 금지');
  // 다크 그라파이트 — **금속이 아니다.** 0.05~0.15, 거칠기는 중간 이상.
  assert.ok(P.darkGraphite.metalness >= 0.05 && P.darkGraphite.metalness <= 0.15,
    `darkGraphite metalness ${P.darkGraphite.metalness}`);
  assert.ok(P.darkGraphite.metalness < P.metalFrame.metalness, '금속 프레임보다 금속스러우면 안 된다');
  assert.ok(P.darkGraphite.roughness >= 0.5, `darkGraphite roughness ${P.darkGraphite.roughness}`);
  // 블랙 AV 장비 — 순수 검정 금지(형태가 죽는다), 광택 금지.
  assert.notEqual(P.blackEquipment.color.toLowerCase(), '#000000', '순수 검정은 형태를 죽인다');
  assert.ok(P.blackEquipment.roughness >= 0.4, '반들거리면 게이밍 장비처럼 보인다');
  assert.ok(P.blackEquipment.metalness <= 0.3, `blackEquipment metalness ${P.blackEquipment.metalness}`);
  // 흡음 패널 — 직물, 비금속, 아주 거칠고 무늬는 패브릭 의자보다 약하다.
  assert.equal(P.acousticPanel.metalness, 0);
  assert.ok(P.acousticPanel.roughness >= 0.9, `acousticPanel roughness ${P.acousticPanel.roughness}`);
  assert.ok(P.acousticPanel.normalScale < P.fabricChair.normalScale, '벽 무늬가 의자보다 세면 안 된다');
});

test('모든 재질 — 물리값이 유효 범위 안이고 id가 겹치지 않는다', () => {
  assert.equal(new Set(MATERIAL_IDS).size, MATERIAL_IDS.length, 'id 중복');
  for (const id of MATERIAL_IDS) {
    const p = MATERIAL_PRESETS[id];
    assert.ok(p.roughness >= 0 && p.roughness <= 1, `${id}: roughness ${p.roughness}`);
    assert.ok(p.metalness >= 0 && p.metalness <= 1, `${id}: metalness ${p.metalness}`);
    assert.ok(p.normalScale >= 0 && p.normalScale <= 0.3, `${id}: 무늬가 과하다 ${p.normalScale}`);
    assert.ok(p.tileMm >= 0, `${id}: tileMm ${p.tileMm}`);
    if ('opacity' in p) assert.ok(p.opacity >= 0 && p.opacity <= 1, `${id}: opacity ${p.opacity}`);
  }
});

test('유리 파티션 — 투명 재질은 이것 하나뿐이고 다룰 방법이 함께 적혀 있다', () => {
  const g = MATERIAL_PRESETS.glassPartition;
  assert.equal(g.transparent, true);
  assert.ok(g.opacity > 0 && g.opacity < 1, `거의 비치는 유리여야 한다 (${g.opacity})`);
  assert.equal(g.castsShadow, false, '유리가 바닥에 그늘을 드리우면 안 된다');
  assert.equal(g.receivesShadow, false);
  assert.equal(g.doubleSided, true);
  assert.equal(g.renderClass, 'transparent');
  assert.ok(Number.isFinite(g.renderOrderHint));
  // 투명 semantic을 가진 것은 유리뿐 — 다른 재질에 새어 들어가면 그리기 순서가 꼬인다.
  for (const id of MATERIAL_IDS) {
    assert.equal(isTransparentMaterial(id), id === 'glassPartition', `${id}: 투명 표시`);
  }
  // 값은 전부 **평범한 숫자·불리언**이다 — Three.js 객체가 순수 모듈에 들어오면 안 된다.
  for (const [k, v] of Object.entries(g)) {
    assert.ok(['string', 'number', 'boolean'].includes(typeof v) || v === null,
      `glassPartition.${k}: 순수 값이 아니다 (${typeof v})`);
  }
});

test('순수 유지 — materials.js 는 Three.js 를 불러오지 않는다', () => {
  const src = readFileSync(new URL('../src/materials.js', import.meta.url), 'utf8');
  assert.equal(/from\s+['"].*three/i.test(src), false, 'materials.js 가 Three.js 를 import 했다');
  assert.equal(/\bTHREE\./.test(src), false, 'materials.js 에서 Three.js 객체를 만들었다');
});

test('별칭 — 이름만 이어 준다. 재질을 복제하지 않고 개수에도 세지 않는다', () => {
  assert.equal(resolveMaterialId('carpetTileLight'), 'carpetTile');
  assert.equal(resolveMaterialId('lightOak'), 'woodTable');
  // 정식 id는 그대로 통과한다.
  for (const id of MATERIAL_IDS) assert.equal(resolveMaterialId(id), id, id);
  // 모르는 이름·잘못된 값은 null (없는 재질을 지어내지 않는다).
  for (const bad of ['없는재질', '', null, undefined, 0, {}, 'CarpetTile']) {
    assert.equal(resolveMaterialId(bad), null, String(bad));
  }
  // **복제 금지** — 별칭을 따라가면 원본 프리셋 객체 그 자체가 나온다.
  assert.equal(materialPreset('lightOak'), MATERIAL_PRESETS.woodTable);
  assert.equal(materialPreset('carpetTileLight'), MATERIAL_PRESETS.carpetTile);
  assert.equal(materialPreset('없는재질'), null);
  // 별칭은 정식 재질이 아니다 — 13종에 섞이면 안 된다.
  for (const alias of Object.keys(MATERIAL_ALIASES)) {
    assert.ok(!MATERIAL_IDS.includes(alias), `별칭 ${alias} 가 정식 목록에 들어갔다`);
    assert.ok(!MATERIAL_PRESETS[alias], `별칭 ${alias} 로 프리셋이 복제됐다`);
    assert.ok(MATERIAL_PRESETS[MATERIAL_ALIASES[alias]], `별칭 ${alias} 가 없는 재질을 가리킨다`);
  }
  assert.equal(MATERIAL_IDS.length, 13, '별칭까지 세면 안 된다');
});

test('실제 무늬 크기 — 기준이 하나뿐이고 방 크기와 무관하게 일정하다', () => {
  assert.equal(realWorldTileMm('carpetTile'), 500);
  assert.equal(realWorldTileMm('carpetTileDark'), 500);
  assert.equal(realWorldTileMm('carpetTileLight'), 500, '별칭으로도 같은 값');
  assert.equal(realWorldTileMm('darkGraphite'), 0, '무늬가 없으면 0');
  assert.equal(realWorldTileMm('없는재질'), 0);
  // 10m 방과 20m 방에서 카펫 한 장의 실제 크기가 같다(= 반복 횟수만 두 배).
  const dark = MATERIAL_PRESETS.carpetTileDark;
  assert.deepEqual(tileRepeat(dark, 10, 8, MM_PER_UNIT), [20, 16]);
  assert.deepEqual(tileRepeat(dark, 20, 16, MM_PER_UNIT), [40, 32]);
});

test('재질 역할 — 어휘와 후보가 실재하는 재질만 가리킨다', () => {
  assert.deepEqual(Object.keys(ROLE_CANDIDATES).sort(), [...MATERIAL_ROLES].sort());
  for (const [role, ids] of Object.entries(ROLE_CANDIDATES)) {
    assert.ok(ids.length > 0, `${role}: 후보가 없다`);
    for (const id of ids) assert.ok(MATERIAL_PRESETS[id], `${role}: 없는 재질 ${id}`);
  }
  // 넓은 면 역할에는 금속성 있는 재질을 넣지 않는다.
  for (const role of ['floor', 'wall', 'ceiling', 'acoustic', 'stage']) {
    for (const id of ROLE_CANDIDATES[role]) {
      assert.equal(MATERIAL_PRESETS[id].metalness, 0, `${role}/${id}: 넓은 면에 금속성`);
    }
  }
});

test('PART_FINISH — 지금 쓰는 가구 부품에는 하나도 걸리지 않는다(화면 무변경 보장)', () => {
  // **이것이 PHASE 1-b의 안전장치다.** 새 마감 표의 부품 이름이 지금 쓰는 부품 이름과
  //   하나도 겹치지 않으므로, 나중에 이 표를 그대로 연결해도 기존 가구는 바뀌지 않는다.
  for (const kind of Object.keys(PART_MATERIAL)) {
    assert.equal(finishForPart(kind), null, `${kind}: 새 마감이 기존 부품에 걸렸다`);
  }
  // 모르는 부품 → null = 지금 하던 대로.
  for (const bad of ['없는부품', '', null, undefined, 0]) {
    assert.equal(finishForPart(bad), null, String(bad));
  }
  // 적어 둔 부품은 실재하는 재질을 가리키고, 조정값은 유효 범위 안이다.
  for (const partId of Object.keys(PART_FINISH)) {
    const f = finishForPart(partId);
    assert.ok(f, `${partId}: 풀리지 않는다`);
    assert.ok(MATERIAL_PRESETS[f.material], `${partId}: 없는 재질 ${f.material}`);
    assert.ok(MATERIAL_IDS.includes(f.material), `${partId}: 정식 id로 풀려야 한다 (${f.material})`);
    if ('roughness' in f) assert.ok(f.roughness >= 0 && f.roughness <= 1, `${partId}: roughness`);
    if ('metalness' in f) assert.ok(f.metalness >= 0 && f.metalness <= 1, `${partId}: metalness`);
  }
  // 의자 프레임 계열은 금속이 아니라 그라파이트다 — 이것이 이 표를 만든 이유다.
  assert.equal(finishForPart('chairFrame').material, 'darkGraphite');
  assert.equal(finishForPart('chairCaster').material, 'darkGraphite');
  assert.equal(finishForPart('monitorBody').material, 'blackEquipment');
  // 별칭으로 적어도 정식 id로 풀린다(복제가 생기지 않는다).
  assert.equal(finishForPart('boardroomTop').material, 'woodTable');
  assert.equal(finishForPart('corporateTop').material, 'neutralLaminate');
});

test('불변 데이터 — 재질·별칭·역할·부품 마감 표를 밖에서 고칠 수 없다', () => {
  const frozen = (v, path) => {
    if (!v || typeof v !== 'object') return;
    assert.ok(Object.isFrozen(v), `${path} 가 얼어 있지 않다`);
    for (const [k, x] of Object.entries(v)) frozen(x, `${path}.${k}`);
  };
  frozen(MATERIAL_PRESETS, 'MATERIAL_PRESETS');
  frozen(MATERIAL_ALIASES, 'MATERIAL_ALIASES');
  frozen(ROLE_CANDIDATES, 'ROLE_CANDIDATES');
  frozen(PART_FINISH, 'PART_FINISH');
  frozen(PART_MATERIAL, 'PART_MATERIAL');
  frozen(MOODS, 'MOODS');
  assert.ok(Object.isFrozen(MATERIAL_IDS) && Object.isFrozen(MATERIAL_ROLES));
  assert.ok(Object.isFrozen(finishForPart('chairFrame')), 'finishForPart 결과도 얼려 돌려준다');
});
