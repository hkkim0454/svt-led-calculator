// materials.test.js — 재질 라이브러리 명세 회귀 테스트.
// 핵심 규칙: (1) 실내 마감재는 반사가 거의 없다 (2) 무늬는 겨우 보일 정도까지만
//            (3) 무늬 간격은 실제 마감재 규격 (4) 가구 부품이 빠짐없이 재질과 이어진다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MATERIAL_PRESETS, MATERIAL_IDS, PART_MATERIAL, floorFinishFor, tileRepeat,
} from '../src/materials.js';
import { FURNITURE_COLORS } from '../src/furniture-assets.js';
import { MM_PER_UNIT } from '../src/gl-model.js';

test('재질 7종 — 요청한 프리셋이 모두 있고 수치가 채워져 있다', () => {
  assert.deepEqual([...MATERIAL_IDS], [
    'paintedWall', 'carpetTile', 'vinylFloor', 'woodTable',
    'metalFrame', 'fabricChair', 'stageSurface',
  ]);
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

test('LED보다 눈에 띄지 않는다 — 마감재 중 금속성이 있는 것은 금속 프레임뿐', () => {
  const shiny = MATERIAL_IDS.filter(id => MATERIAL_PRESETS[id].metalness > 0);
  assert.deepEqual(shiny, ['metalFrame'], '실내 마감재에 금속성이 있으면 반사가 시선을 끈다');
  // 바닥·벽·무대처럼 면적이 넓은 재질은 반드시 무광에 가깝다.
  for (const id of ['paintedWall', 'carpetTile', 'vinylFloor', 'stageSurface']) {
    assert.ok(MATERIAL_PRESETS[id].roughness >= 0.75, `${id}: 넓은 면이 반들거린다`);
  }
});

test('바닥 마감 — 강의실만 비닐, 나머지는 카펫', () => {
  assert.equal(floorFinishFor('classroom'), 'vinylFloor');
  for (const id of ['meeting', 'hall_s', 'hall_m', 'hall_l', 'control', undefined]) {
    assert.equal(floorFinishFor(id), 'carpetTile', String(id));
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
  const EXEMPT = new Set(['monitor', 'plantLeaf']);   // 7종 프리셋에 없는 둘
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
