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

test('buildGLModel — 배치 목록은 mm 그대로 넘긴다(가구 쪽에서 환산)', () => {
  const lay = layoutRoom('hall_s', defaultOptions('hall_s'), { W: 10000, D: 10000 });
  const m = buildGLModel({
    space: { W: 10000, H: 3500, D: 10000 },
    led: { w: 3840, h: 2160, marginW: 3080, mount: 1000, cols: 4, rows: 4, depth: 79.5 },
    items: lay.items,
  });
  assert.equal(m.items.length, lay.items.length);
  assert.deepEqual(m.items[0], lay.items[0], '배치값을 바꾸지 않고 그대로 들고 간다');
  // 좌석은 mm 단위 그대로여야 한다(= 1000 단위의 큰 수)
  const seat = m.items.find(it => it.type === 'seat' || it.type === 'chair');
  if (seat) assert.ok(Math.abs(seat.x) > 100, '좌석 좌표가 mm 가 아니다');
  // items 가 없어도 안전하다
  assert.deepEqual(buildGLModel({ space: { W: 1, H: 1, D: 1 }, led: { w: 1, h: 1, marginW: 0, mount: 0 } }).items, []);
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

// ── 카메라 프리셋 (STEP 2) ──────────────────────────────────────────────────

import { CAMERA_PRESETS, DEFAULT_PRESET, cameraPreset, stepPreset, presetPose } from '../src/gl-model.js';

// 검증용 표준 장면: 소강당 10 × 3.5 × 10 m, LED 3.84 × 2.16 m, 하단 높이 1.0 m
const room10 = buildGLModel({
  space: { W: 10000, H: 3500, D: 10000 },
  led: { w: 3840, h: 2160, marginW: 3080, mount: 1000, cols: 4, rows: 4, depth: 79.5 },
  items: layoutRoom('hall_s', defaultOptions('hall_s'), { W: 10000, D: 10000 }).items,
});

const PRESET_IDS = ['interior', 'corner-l', 'front', 'corner-r', 'iso', 'top'];
const INSIDE_IDS = ['interior', 'corner-l', 'front', 'corner-r'];

test('프리셋 목록 — 요구된 6종이 모두 있고 평면도만 정사투영이다', () => {
  assert.deepEqual(CAMERA_PRESETS.map(p => p.id), PRESET_IDS);
  assert.equal(DEFAULT_PRESET, 'interior');
  assert.deepEqual(CAMERA_PRESETS.filter(p => p.ortho).map(p => p.id), ['top']);
  // 모르는 id를 넣어도 기본값으로 안전하게 떨어진다
  assert.equal(cameraPreset('없는값').id, DEFAULT_PRESET);
});

test('stepPreset — 좌우로 한 칸씩 돌고 끝에서 이어진다', () => {
  assert.equal(stepPreset('interior', 1), 'corner-l');
  assert.equal(stepPreset('interior', -1), 'top');       // 앞으로 넘어가면 마지막
  assert.equal(stepPreset('top', 1), 'interior');        // 뒤로 넘어가면 처음
  assert.equal(stepPreset('없는값', 1), 'corner-l');
});

test('프리셋 — 모든 값이 유한한 숫자다(씬이 통째로 사라지는 사고 방지)', () => {
  for (const id of PRESET_IDS) {
    for (const aspect of [0.6, 1, 1.1375, 16 / 9, 2.4]) {
      const p = presetPose(id, room10, aspect);
      for (const v of [...p.position, ...p.target, ...p.up]) {
        assert.ok(Number.isFinite(v), `${id} @${aspect}: 좌표가 숫자가 아니다`);
      }
      if (p.ortho) {
        assert.equal(p.fov, null);
        assert.ok(p.orthoHeight > 0, `${id}: 정사투영 화면 범위가 0 이하`);
      } else {
        assert.ok(p.fov > 10 && p.fov < 90, `${id}: 화각 ${p.fov}°`);
        assert.equal(p.orthoHeight, null);
      }
    }
  }
});

test('실내 계열 — 카메라가 방 안에 있고 사람 눈높이다', () => {
  for (const id of INSIDE_IDS) {
    const p = presetPose(id, room10, 16 / 9);
    const [x, y, z] = p.position;
    assert.ok(x > 0 && x < room10.room.W, `${id}: x=${x} 가 방 밖`);
    assert.ok(z > 0 && z < room10.room.D, `${id}: z=${z} 가 방 밖`);
    assert.ok(y > 0 && y < room10.room.H, `${id}: y=${y} 가 방 밖`);
    assert.ok(y >= 1.5 && y <= 2.4, `${id}: 눈높이 ${y} m — 사람 시점 범위 밖`);
  }
});

test('interior — Reference A: 천장에서 내려다보는 느낌이 나면 안 된다', () => {
  const p = presetPose('interior', room10, 16 / 9);
  const [, eyeY] = p.position;
  assert.ok(eyeY >= 1.6 && eyeY <= 2.0, `눈높이 ${eyeY} m — 요구 범위(1.6~2.0) 밖`);
  // 시선이 아래로 꺾이면 내려다보는 그림이 된다. LED 쪽을 수평~살짝 위로 봐야 한다.
  const dy = p.target[1] - p.position[1];
  const dist = Math.hypot(p.target[0] - p.position[0], p.target[2] - p.position[2]);
  const pitchDeg = Math.atan2(dy, dist) * 180 / Math.PI;
  assert.ok(pitchDeg > -3, `시선이 ${pitchDeg.toFixed(1)}° 아래를 향한다 — 내려다보는 느낌`);
  // LED가 화면의 주인공이어야 한다. '가장 가까운 카메라'가 아니라 '화면에서 가장 크게
  //   잡히는 대상'이라는 뜻이다 — interior는 관람자처럼 좌석 뒤에 서므로 front보다
  //   멀 수 있고, 대신 화각이 넓다. 그래서 '화면 가로에서 LED가 차지하는 비율'로 잰다.
  const shareOf = id => {
    const q = presetPose(id, room10, 16 / 9);
    const dist = Math.hypot(q.position[0] - q.target[0], q.position[2] - q.target[2]);
    const hFov = 2 * Math.atan(Math.tan(q.fov * Math.PI / 360) * (16 / 9));
    return room10.led.w / (2 * dist * Math.tan(hFov / 2));   // 화면 가로 대비 LED 비율
  };
  const share = shareOf('interior');
  assert.ok(share > 0.3, `interior에서 LED가 화면 가로의 ${(share * 100).toFixed(0)}%밖에 안 된다`);
  assert.ok(share < 0.9, `interior에서 LED가 화면을 꽉 채워 공간이 안 보인다 (${(share * 100).toFixed(0)}%)`);
});

test('interior — 관람자처럼 좌석 뒤에 선다(앞줄 좌석·무대가 보이도록)', () => {
  // 좌석 한가운데에 서면 앞줄 좌석이 화면 아래로 빠지고 무대도 잘린다.
  const seats = room10.items.filter(it => it.type === 'seat' || it.type === 'chair');
  assert.ok(seats.length, '검증 장면에 좌석이 있어야 한다');
  const backZ = Math.max(...seats.map(it => it.z)) / 1000;   // mm → m
  const p = presetPose('interior', room10, 16 / 9);
  assert.ok(p.position[2] > backZ, `카메라 z=${p.position[2].toFixed(2)} 가 마지막 좌석 z=${backZ.toFixed(2)} 보다 앞에 있다`);
  assert.ok(p.position[2] < room10.room.D, '그래도 방 안에 있어야 한다');
});

test('코너 — 좌우가 LED 중심을 기준으로 반대편에 선다', () => {
  const cx = room10.led.x + room10.led.w / 2;
  const l = presetPose('corner-l', room10, 16 / 9);
  const r = presetPose('corner-r', room10, 16 / 9);
  const f = presetPose('front', room10, 16 / 9);
  assert.ok(l.position[0] < cx, '좌측 코너는 LED 중심보다 왼쪽');
  assert.ok(r.position[0] > cx, '우측 코너는 LED 중심보다 오른쪽');
  assert.ok(Math.abs(f.position[0] - cx) < 1e-6, '정면은 LED 중심과 같은 가로 위치');
  // 좌우 대칭
  assert.ok(Math.abs((cx - l.position[0]) - (r.position[0] - cx)) < 1e-6, '좌우 코너가 대칭이어야 한다');
});

test('iso — 방 전체가 보이도록 방 밖 높은 곳에 선다(과도한 top-down은 아님)', () => {
  const p = presetPose('iso', room10, 16 / 9);
  const { room } = room10;
  assert.ok(p.position[1] > room.H, '방 높이보다 위에서 내려다본다');
  // 방 밖에 있어야 벽이 잘려(컷어웨이) 안이 보인다
  const outside = p.position[0] > room.W || p.position[0] < 0 || p.position[2] > room.D || p.position[2] < 0;
  assert.ok(outside, '아이소메트릭은 방 밖에서 본다');
  // 내려다보는 각도가 너무 크면 평면도처럼 되어 벽·LED 관계가 안 읽힌다
  const dy = p.position[1] - p.target[1];
  const flat = Math.hypot(p.position[0] - p.target[0], p.position[2] - p.target[2]);
  const pitchDeg = Math.atan2(dy, flat) * 180 / Math.PI;
  assert.ok(pitchDeg > 20 && pitchDeg < 45, `내려다보는 각도 ${pitchDeg.toFixed(1)}° — 20~45° 밖`);
});

test('top — 정사투영으로 방 바로 위에서, 방 전체가 화면에 들어온다', () => {
  const { room } = room10;
  for (const aspect of [0.6, 1, 16 / 9, 2.4]) {
    const p = presetPose('top', room10, aspect);
    assert.equal(p.ortho, true);
    assert.ok(Math.abs(p.position[0] - room.W / 2) < 1e-6);
    assert.ok(Math.abs(p.position[2] - room.D / 2) < 1e-6);
    assert.ok(p.position[1] > room.H, '천장보다 위에서');
    // 바로 위에서 볼 때 '화면 위'는 LED 벽(-Z) — 도면 방향을 고정한다
    assert.deepEqual(p.up, [0, 0, -1]);
    // 방이 화면 안에 다 들어오는가
    assert.ok(p.orthoHeight >= room.D, `깊이 ${room.D} 가 화면 세로 ${p.orthoHeight} 를 넘는다`);
    assert.ok(p.orthoHeight * aspect >= room.W - 1e-9, `가로 ${room.W} 가 화면 가로를 넘는다`);
  }
});

test('프리셋 — 아주 작은 방·아주 깊은 강당에서도 카메라가 방 안팎 규칙을 지킨다', () => {
  const cases = [
    { W: 4000, H: 2600, D: 4000, lw: 1920, lh: 1080, mount: 800 },
    { W: 18000, H: 6000, D: 24300, lw: 12000, lh: 4000, mount: 1200 },
    { W: 39837, H: 6350, D: 30000, lw: 39837, lh: 6350, mount: 0 },   // SDR 미디어월급
  ];
  for (const c of cases) {
    const m = buildGLModel({
      space: { W: c.W, H: c.H, D: c.D },
      led: { w: c.lw, h: c.lh, marginW: (c.W - c.lw) / 2, mount: c.mount, cols: 10, rows: 4, depth: 80 },
      items: [],
    });
    for (const id of INSIDE_IDS) {
      const p = presetPose(id, m, 16 / 9);
      assert.ok(p.position[0] > 0 && p.position[0] < m.room.W, `${c.W}mm ${id}: x 방 밖`);
      assert.ok(p.position[2] > 0 && p.position[2] < m.room.D, `${c.W}mm ${id}: z 방 밖`);
      assert.ok(p.position[1] > 0 && p.position[1] < m.room.H, `${c.W}mm ${id}: y 방 밖`);
    }
    const top = presetPose('top', m, 16 / 9);
    assert.ok(top.orthoHeight >= m.room.D, `${c.W}mm top: 방이 다 안 들어온다`);
  }
});
