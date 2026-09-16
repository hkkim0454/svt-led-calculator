// gl-model.test.js — Three.js 씬에 넘기는 값이 계산 결과와 정확히 같은지 확인한다.
// 그리기(WebGL)는 브라우저 전용이라 여기서 다루지 않는다. 여기서 지키는 건 '데이터 연결'이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MM_PER_UNIT, u, toMm, buildGLModel, viewDistance,
  FOV_DEG, EYE_MM, LOOK_MM, START_YAW_DEG, LED_FIT,
} from '../src/gl-model.js';
import { computeConfig } from '../src/engine.js';
import { MODELS } from '../src/models.js';
import { layoutRoom, defaultOptions } from '../src/room-presets.js';

test('단위 — 1000 mm = 1 unit, 왕복 변환이 값을 바꾸지 않는다', () => {
  assert.equal(MM_PER_UNIT, 1000);
  assert.equal(u(1000), 1);
  assert.equal(u(3840), 3.84);
  assert.equal(u(0), 0);
  for (const v of [0, 1, 79.5, 2160, 39837]) assert.equal(toMm(u(v)), v);
  // 빈 값·잘못된 값이 NaN으로 새어 나가지 않는다(씬이 통째로 사라지는 사고를 막는다)
  for (const bad of [null, undefined, '', NaN, {}]) assert.equal(u(bad), 0);
});

test('buildGLModel — 공간 W/H/D를 그대로 옮긴다', () => {
  const m = buildGLModel({
    space: { W: 10000, H: 3500, D: 10000 },
    led: { w: 3840, h: 2160, marginW: 3080, mount: 1000, cols: 4, rows: 4, depth: 79.5 },
    items: [],
  });
  assert.deepEqual(m.room, { W: 10, H: 3.5, D: 10 });
});

test('buildGLModel — LED 실제 크기·여백·하단 높이를 그대로 옮긴다', () => {
  const m = buildGLModel({
    space: { W: 10000, H: 3500, D: 10000 },
    led: { w: 3840, h: 2160, marginW: 3080, mount: 1000, cols: 4, rows: 4, depth: 79.5 },
    items: [],
  });
  assert.equal(m.led.w, 3.84);
  assert.equal(m.led.h, 2.16);
  assert.equal(m.led.x, 3.08);     // 왼쪽 벽 ~ LED 왼쪽 끝
  assert.equal(m.led.y, 1);        // 바닥 ~ LED 아래 = 하단 높이
  assert.equal(m.led.depth, 0.0795);
  assert.equal(m.led.cols, 4);
  assert.equal(m.led.rows, 4);
  // LED는 벽 안에 들어 있어야 한다(왼쪽 여백 + 가로 ≤ 공간 가로)
  assert.ok(m.led.x + m.led.w <= m.room.W + 1e-9);
  assert.ok(m.led.y + m.led.h <= m.room.H + 1e-9);
});

test('buildGLModel — 캐비닛 깊이가 없으면 기본 60 mm, 배열은 최소 1', () => {
  const m = buildGLModel({
    space: { W: 8000, H: 3400, D: 6000 },
    led: { w: 1000, h: 1000, marginW: 0, mount: 0 },
    items: [],
  });
  assert.equal(m.led.depth, 0.06);
  assert.equal(m.led.cols, 1);
  assert.equal(m.led.rows, 1);
});

test('buildGLModel — 무대는 배치 계산(room-presets) 결과를 읽기만 한다', () => {
  const lay = layoutRoom('hall_s', defaultOptions('hall_s'), { W: 10000, D: 10000 });
  const src = lay.items.find(it => it.type === 'stage');
  assert.ok(src, '소강당 기본 옵션에는 무대가 있어야 한다');
  const m = buildGLModel({
    space: { W: 10000, H: 3500, D: 10000 },
    led: { w: 3840, h: 2160, marginW: 3080, mount: 1000, cols: 4, rows: 4, depth: 79.5 },
    items: lay.items,
  });
  assert.equal(m.stage.w, src.w / 1000);
  assert.equal(m.stage.d, src.d / 1000);
  assert.equal(m.stage.x, src.x / 1000);
  assert.equal(m.stage.z, src.z / 1000);
});

test('buildGLModel — 무대가 없는 공간 타입이면 stage는 null', () => {
  const lay = layoutRoom('meeting', defaultOptions('meeting'), { W: 8000, D: 6800 });
  const m = buildGLModel({
    space: { W: 8000, H: 3400, D: 6800 },
    led: { w: 4000, h: 2300, marginW: 2000, mount: 1000, cols: 5, rows: 4, depth: 60 },
    items: lay.items,
  });
  assert.equal(m.stage, null);
});

test('buildGLModel — engine 결과를 그대로 받아 넘긴다(값을 새로 계산하지 않는다)', () => {
  const model = MODELS.find(x => x.id === 'IF015RM') || MODELS[0];
  const r = computeConfig(model, 10000, 3500, { mode: 'fill', baseHeight: 1000 });
  const m = buildGLModel({
    space: { W: 10000, H: 3500, D: 10000 },
    led: {
      w: r.actualW, h: r.actualH, marginW: r.marginW, mount: 1000,
      cols: r.cols, rows: r.rows, depth: model.depth,
    },
    items: [],
  });
  assert.equal(m.led.w, r.actualW / 1000);
  assert.equal(m.led.h, r.actualH / 1000);
  assert.equal(m.led.x, r.marginW / 1000);
  assert.equal(m.led.cols, r.cols);
  assert.equal(m.led.rows, r.rows);
});

test('viewDistance — 카메라가 언제나 방 안에 남는다', () => {
  // 얕은 방부터 아주 깊은 강당까지. 뒷벽을 뚫고 나가면 벽이 사라져 그림이 깨진다.
  for (const D of [3, 6, 10, 18, 24.3]) {
    for (const led of [{ w: 1.2, h: 0.7 }, { w: 3.84, h: 2.16 }, { w: 9.6, h: 2.16 }, { w: 39.8, h: 6.35 }]) {
      const d = viewDistance(led, D, 16 / 9);
      assert.ok(d >= 2, `거리가 너무 가깝다 (D=${D}, ${d})`);
      assert.ok(d <= Math.max(2, D - 0.4) + 1e-9, `카메라가 방 밖으로 나갔다 (D=${D}, ${d})`);
    }
  }
});

test('viewDistance — LED가 클수록·화면이 좁을수록 더 물러난다', () => {
  const D = 40;   // 방 제한에 걸리지 않을 만큼 깊게
  const small = viewDistance({ w: 2, h: 1.2 }, D, 16 / 9);
  const big = viewDistance({ w: 8, h: 4.5 }, D, 16 / 9);
  assert.ok(big > small, `큰 LED가 더 물러나야 한다 (${small} → ${big})`);
  const wide = viewDistance({ w: 8, h: 4.5 }, D, 16 / 9);
  const narrow = viewDistance({ w: 8, h: 4.5 }, D, 4 / 5);
  assert.ok(narrow > wide, `세로로 긴 화면에서 더 물러나야 한다 (${wide} → ${narrow})`);
});

test('카메라 상수 — 사람 시점을 유지한다', () => {
  assert.ok(EYE_MM >= 2300 && EYE_MM <= 2600, `눈높이 ${EYE_MM}mm — 2.3~2.6 m 밖`);
  assert.ok(LOOK_MM < EYE_MM, '바라보는 높이는 눈높이보다 낮아야 바닥이 보인다');
  assert.ok(FOV_DEG >= 30 && FOV_DEG <= 50, `화각 ${FOV_DEG}° — 실내 시점 범위 밖`);
  assert.ok(START_YAW_DEG > 0 && START_YAW_DEG < 45, '처음 시점은 정면에서 살짝 옆');
  assert.ok(LED_FIT.w > 1 && LED_FIT.h > 1, 'LED 주변 여유는 1배보다 커야 방이 보인다');
});
