// view3d-options.test.js — 3D 뷰 옵션 회귀 테스트 (오너 요청 2026-10-01, DEC-155).
//   ① 무대 계단 토글이 3D 장면까지 전달된다  ② 좌석·책상 숨기기는 그림에서만 뺀다
//   ③ 1열 거리(강의실·강당)  ④ 강당 무대 크기(가로·깊이·높이)  ⑤ 방 크기를 바꿔도 돌려 둔 시점을 지킨다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildGLModel, drawnItems, SEAT_ITEM_TYPES, DESK_ITEM_TYPES } from '../src/gl-model.js';
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
