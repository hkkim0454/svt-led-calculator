// view3d-options.test.js — 3D 뷰 옵션 회귀 테스트 (오너 요청 2026-10-01, DEC-155).
//   ① 무대 계단 토글이 3D 장면까지 전달된다  ② 좌석·책상 숨기기는 그림에서만 뺀다
//   ③ 1열 거리(강의실·강당)  ④ 강당 무대 크기(가로·깊이·높이)  ⑤ 방 크기를 바꿔도 돌려 둔 시점을 지킨다
//   ⑥ 벽면 기본 앞+우 · 아이소 카메라는 켜진 옆벽 반대편 (DEC-156)
//   ⑦ 앞벽·옆벽 두께 분리 · 벽에 붙은 기둥 (DEC-157)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildGLModel, drawnItems, SEAT_ITEM_TYPES, DESK_ITEM_TYPES, defaultWalls, featureWallSide, presetPose,
  columnBoxes, columnLedConflicts, COLUMN_DEFAULT, MAX_COLUMNS } from '../src/gl-model.js';
import { ROOM_DESIGNS } from '../src/room-design.js';
import { layoutRoom, defaultOptions, auditoriumStageSize, AUDITORIUM_SEATING, AUDITORIUM_STAGE } from '../src/room-presets.js';

const src = f => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const led = { marginW: 2000, mount: 1000, w: 4000, h: 2250, depth: 60, cols: 4, rows: 4 };
const HALLS = ['hall_s', 'hall_m', 'hall_l'];
const ROOM = { hall_s: { W: 12000, D: 14000 }, hall_m: { W: 18000, D: 20000 }, hall_l: { W: 24000, D: 28000 } };

test('① 무대 계단 끄기가 3D 장면 데이터까지 전달된다', () => {
  for (const step of [true, false]) {
    const lay = layoutRoom('hall_s', { ...defaultOptions('hall_s'), stageStep: step }, { W: 12000, D: 14000, ledBottom: 1000 });
    const m = buildGLModel({ space: { W: 12000, H: 4000, D: 14000 }, led, items: lay.items, roomType: 'hall_s' });
    assert.equal(m.stage.step, step, `stageStep=${step}`);
  }
  // 렌더러는 이 값을 보고 계단을 세운다.
  assert.match(src('render3d-gl.js'), /if \(stage\.step !== false && stage\.h > u\(160\)\)/);
});

test('② 좌석·책상 숨기기 — 그림에 넘길 목록만 거르고 배치는 그대로다', () => {
  for (const t of ['meeting', 'classroom', 'hall_m', 'control', 'ideation']) {
    const lay = layoutRoom(t, { ...defaultOptions(t), occupancy: 50 }, { W: 14000, D: 16000, ledBottom: 1000 });
    const base = { space: { W: 14000, H: 4000, D: 16000 }, led, items: lay.items, roomType: t };
    const on = buildGLModel(base);
    assert.equal(on.show.seats, true); assert.equal(on.show.desks, true);
    assert.equal(drawnItems(on), on.items, `${t}: 기본은 걸러내지 않는다`);
    const noSeat = buildGLModel({ ...base, show: { seats: false } });
    assert.equal(noSeat.items.length, lay.items.length, `${t}: 배치 목록이 줄었다`);
    assert.deepEqual(noSeat.fields, on.fields, `${t}: 카메라 구도 판단이 바뀌었다`);
    assert.equal(drawnItems(noSeat).some(i => SEAT_ITEM_TYPES.has(i.type)), false, `${t}: 좌석이 남았다`);
    const noDesk = buildGLModel({ ...base, show: { desks: false } });
    assert.equal(drawnItems(noDesk).some(i => DESK_ITEM_TYPES.has(i.type)), false, `${t}: 책상이 남았다`);
  }
  // 화면 버튼 — 기본은 켜짐.
  assert.match(src('index.html'), /class="pvTog on" data-t3d="seats"/);
  assert.match(src('index.html'), /class="pvTog on" data-t3d="desks"/);
  assert.match(src('app.js'), /seats: true, desks: true,/);
});

test('③ 강당 1열 거리 — 0 은 예전 자리 그대로, 값을 넣으면 그 거리에 첫 줄이 선다', () => {
  for (const t of HALLS) {
    const { W, D } = ROOM[t];
    const room = { W, D, ledBottom: 1000 };
    const auto = layoutRoom(t, defaultOptions(t), room);
    const P = AUDITORIUM_SEATING[t];
    assert.equal(auto.placed.firstRowZ, Math.max(P.firstRowZ, AUDITORIUM_STAGE[t].depth + P.stageClear), `${t}: 자동 1열 거리가 바뀌었다`);
    const ask = layoutRoom(t, { ...defaultOptions(t), firstRow: 7000 }, room);
    assert.equal(ask.placed.firstRowZ, 7000, t);
    assert.equal(Math.min(...ask.items.filter(i => i.type === 'seat').map(i => i.z)), 7000, `${t}: 첫 줄 좌석 위치`);
    // 무대에 붙여 넣으면 통행 거리를 지키는 자리로 물러나고 안내가 붙는다.
    const near = layoutRoom(t, { ...defaultOptions(t), firstRow: 500 }, room);
    assert.equal(near.placed.firstRowZ, AUDITORIUM_STAGE[t].depth + P.stageClear, t);
    assert.ok(near.notes.some(n => /1열 거리/.test(n)), `${t}: 안내가 없다`);
  }
});

test('③ 강의실 1열 거리 — 0 은 예전 자리 그대로, 값을 넣으면 첫 줄 의자가 그 거리에 앉는다', () => {
  const room = { W: 10000, D: 12000, ledBottom: 1000 };
  const chairs = lay => lay.items.filter(i => i.type === 'chair' && i.z > 1500).map(i => i.z);
  const auto = layoutRoom('classroom', defaultOptions('classroom'), room);
  assert.equal(Math.min(...chairs(auto)), 1800 + 1550 / 2 + 750, '자동 1열 거리가 바뀌었다');
  const ask = layoutRoom('classroom', { ...defaultOptions('classroom'), firstRow: 4500 }, room);
  assert.equal(Math.min(...chairs(ask)), 4500);
  assert.equal(ask.placed.rows, 4);
  const near = layoutRoom('classroom', { ...defaultOptions('classroom'), firstRow: 1000 }, room);
  assert.ok(near.notes.some(n => /1열 거리/.test(n)));
  assert.ok(Math.min(...near.items.filter(i => i.type === 'desk' && i.rotY === 0).map(i => i.z)) >= 1800, '강사 영역을 침범했다');
});

test('④ 강당 무대 크기 — 0 은 자동, 값을 넣으면 그 크기. 높이는 LED 아래 여유를 지킨다', () => {
  for (const t of HALLS) {
    const { W, D } = ROOM[t];
    const auto = auditoriumStageSize(t, W, 5000, 1000);
    assert.deepEqual(auditoriumStageSize(t, W, 5000, 1000, { w: 0, d: 0, h: 0, D }), auto, `${t}: 자동값이 바뀌었다`);
    const ask = auditoriumStageSize(t, W, 5000, 1500, { w: 6000, d: 3000, h: 500, D });
    assert.deepEqual(ask, { w: 6000, d: 3000, h: 500 }, t);
    assert.equal(auditoriumStageSize(t, W, 5000, 1000, { h: 1500, D }).h, 800, `${t}: 무대가 LED를 가린다`);
    assert.equal(auditoriumStageSize(t, W, 5000, 1000, { w: W + 5000, D }).w, W, `${t}: 무대가 방보다 넓다`);
    const lay = layoutRoom(t, { ...defaultOptions(t), stageW: 6000, stageD: 3000, stageH: 500 }, { W, D, ledBottom: 1500 });
    const st = lay.items.find(i => i.type === 'stage');
    assert.deepEqual([st.w, st.d, st.h], [6000, 3000, 500], t);
  }
});

test('⑤ 방 크기가 바뀌어도 돌려 둔 시점·저장한 시점은 지키고, 손대지 않았으면 움직임 없이 다시 맞춘다', () => {
  const s = src('render3d-gl.js');
  assert.match(s, /if \(first \|\| \(!sameRoom && !userMoved && !customPose\)\) applyPreset\(presetId, \{ animate: false \}\);/);
  assert.equal(/applyPreset\(presetId, \{ animate: !first \}\)/.test(s), false, '방 크기 변경 때 다시 움직임이 생겼다');
  // 저장한 시점(applyPose)은 customPose 로 표시하고, 프리셋을 고르면 풀린다.
  assert.match(s, /userMoved = false;\n\s*customPose = true;/);
  assert.match(s, /userMoved = false;\n\s*customPose = false;/);
  // '맞춤'은 언제든 지금 프리셋 자리로 다시 앉힌다.
  assert.match(s, /fitView\(\) \{ applyPreset\(presetId\); \}/);
});

// ── DEC-156 — 벽면 기본값 앞+우 · 포인트 벽 오른쪽 · 아이소 카메라는 켜진 옆벽 반대편 ──

test('⑥ 기본 벽은 앞+우, 상황실 디자인만 앞+좌(흡음벽 쪽)다', () => {
  for (const d of [null, ...Object.keys(ROOM_DESIGNS)]) {
    const side = d === 'controlRoom' ? 'left' : 'right';
    assert.equal(featureWallSide(d), side, String(d));
    assert.deepEqual(defaultWalls(d), { front: true, back: false, left: side === 'left', right: side === 'right' }, String(d));
    const m = buildGLModel({ space: { W: 10000, H: 3400, D: 10000 }, led, items: [], design: d });
    assert.equal(m.accentSide, side, `${d}: 포인트 벽`);
    assert.deepEqual(m.show.walls, defaultWalls(d), `${d}: 모델 기본 벽`);
  }
  // 화면도 같은 한 곳(defaultWalls)에서 기본값을 받고, 디자인이 바뀌어 기본 쪽이 달라질 때만 되돌린다.
  assert.match(src('app.js'), /walls: defaultWalls\(designId\),/);
  assert.match(src('app.js'), /function syncWallsToDesign\(prevDesign, force = false\)/);
});

test('⑥ 아이소 카메라는 켜진 옆벽의 반대편에 선다 — 벽이 방을 가리지 않는다', () => {
  const base = { space: { W: 10000, H: 3400, D: 10000 }, led, items: [] };
  const x = walls => presetPose('iso', buildGLModel({ ...base, show: { walls } }), 1.5, {}).position[0];
  const W = 10;   // m
  assert.ok(x({ left: false, right: true }) < 0, '오른쪽 벽만 켜면 왼쪽 바깥에서 본다');
  assert.ok(x({ left: true, right: false }) > W, '왼쪽 벽만 켜면 오른쪽 바깥에서 본다(예전 자리)');
  assert.ok(x({ left: true, right: true }) > W, '양쪽이면 예전 자리');
});

test('⑦ 앞벽 두께는 옆벽과 따로다 — 주지 않으면 옆벽과 같다(예전 그림 그대로)', () => {
  const m = (space) => buildGLModel({ space: { W: 10000, H: 3400, D: 10000, ...space }, led, items: [] }).room;
  assert.equal(m({ wallThk: 100 }).wallThkFront, 0.1);
  assert.equal(m({ wallThk: 100, wallThkFront: 450 }).wallThkFront, 0.45);
  assert.equal(m({ wallThk: 100, wallThkFront: 450 }).wallThk, 0.1, '옆벽까지 두꺼워졌다');
  assert.equal(m({ wallThk: 100, wallThkFront: 99999 }).wallThkFront, 0.6);
  // 렌더러: 앞벽 상자의 깊이는 앞벽 값이다(폭 규칙은 아래 별도 검사).
  assert.match(src('render3d-gl.js'), /room\.H, thkF, matWallFront\);/);
});

test('⑦ 기둥 — 기본 600×600, 벽에 붙어 방 안쪽으로 튀어나오고 방 밖으로 나가지 않는다', () => {
  assert.deepEqual({ ...COLUMN_DEFAULT }, { w: 600, d: 600 });
  const space = { W: 10000, D: 8000 };
  const [f, b, l, r] = columnBoxes([
    { wall: 'front', pos: 2000 }, { wall: 'back', pos: 5000, w: 800, d: 400 },
    { wall: 'left', pos: 3000 }, { wall: 'right', pos: 3000, w: 1000, d: 300 },
  ], space);
  assert.deepEqual(f, { wall: 'front', x: 2000, z: 300, w: 600, d: 600 });
  assert.deepEqual(b, { wall: 'back', x: 5000, z: 7800, w: 800, d: 400 });
  assert.deepEqual(l, { wall: 'left', x: 300, z: 3000, w: 600, d: 600 });
  assert.deepEqual(r, { wall: 'right', x: 9850, z: 3000, w: 300, d: 1000 });
  // 벽 끝을 넘는 위치는 모서리에 붙여 자른다. 5개째부터는 버린다.
  assert.equal(columnBoxes([{ wall: 'front', pos: 99999 }], space)[0].x, 10000 - 300);
  assert.equal(columnBoxes(Array(6).fill({ wall: 'front', pos: 1000 }), space).length, MAX_COLUMNS);
  assert.deepEqual(columnBoxes(null, space), []);
  // 모델에 단위(m)로 실리고, 높이는 천장까지다.
  const m = buildGLModel({ space: { ...space, H: 3400, columns: [{ wall: 'front', pos: 2000 }] }, led, items: [] });
  assert.deepEqual({ ...m.columns[0] }, { wall: 'front', x: 2, z: 0.3, w: 0.6, d: 0.6, h: 3.4 });
  assert.deepEqual(buildGLModel({ space: { ...space, H: 3400 }, led, items: [] }).columns, [], '기본은 기둥 없음');
  // LED(왼쪽 2,000mm 에서 4,000mm 폭)와 겹치는 앞벽 기둥만 알린다.
  assert.deepEqual(columnLedConflicts([{ wall: 'front', pos: 1500 }, { wall: 'front', pos: 3000 }, { wall: 'left', pos: 3000 }],
    space, { x: 2000, w: 4000 }), [2]);
  // 꺼 둔 벽의 기둥은 함께 감춘다(컷어웨이).
  assert.match(src('render3d-gl.js'), /if \(!wallOn\[col\.wall\]\) continue;/);
});

test('⑦ 앞·뒤 벽은 켜진 옆벽 쪽만 그 두께만큼 넓힌다 — 꺼 둔 쪽으로 방 가로보다 넓어지지 않는다', () => {
  const s = src('render3d-gl.js');
  assert.match(s, /const capL = model\.show\?\.walls\?\.left \? thk : 0;/);
  assert.match(s, /const capR = model\.show\?\.walls\?\.right \? thk : 0;/);
  assert.match(s, /wallFront = wallMesh\(room\.W \+ capL \+ capR, room\.H, thkF, matWallFront\);/);
  assert.equal(/room\.W \+ thk \* 2, room\.H/.test(s), false, '앞·뒤 벽이 다시 양쪽으로 넓어졌다');
});
