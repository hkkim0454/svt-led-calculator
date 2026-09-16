// render-mode.test.js — 3D 표현 방식(심플 / 실사) 회귀 테스트.
// 핵심 규칙: 형상·치수·계산은 어느 쪽에서도 같고, 빛과 재질만 달라진다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RENDER_MODES, DEFAULT_RENDER_MODE, renderMode, lightLevels, keyShareOf } from '../src/render-mode.js';
import { LIGHTS, buildGLModel } from '../src/gl-model.js';

test('모드 2종 — 심플과 실사가 있고 기본은 실사', () => {
  assert.deepEqual(Object.keys(RENDER_MODES), ['simple', 'real']);
  assert.equal(DEFAULT_RENDER_MODE, 'real');
  for (const m of Object.values(RENDER_MODES)) {
    assert.ok(m.label, m.id);
    assert.equal(typeof m.shadows, 'boolean');
    assert.ok(m.texture >= 0 && m.texture <= 1, `${m.id}: 무늬 배수 ${m.texture}`);
  }
  // 모르는 값은 기본으로 되돌린다(화면이 비지 않게).
  assert.equal(renderMode('없는모드').id, DEFAULT_RENDER_MODE);
  assert.equal(renderMode(undefined).id, DEFAULT_RENDER_MODE);
});

test('심플 — 그림자와 무늬가 꺼지고 음영이 평평해진다', () => {
  const s = RENDER_MODES.simple, r = RENDER_MODES.real;
  assert.equal(s.shadows, false);
  assert.equal(s.texture, 0, '무늬 없음');
  assert.equal(r.shadows, true);
  assert.equal(r.texture, 1);

  const ls = lightLevels(LIGHTS, 'simple'), lr = lightLevels(LIGHTS, 'real');
  assert.ok(keyShareOf(ls) < keyShareOf(lr), '심플이 더 평평해야 한다');
  assert.ok(keyShareOf(ls) < 0.18, `심플 주광 비중 ${(keyShareOf(ls) * 100).toFixed(1)}%`);
  // 밝기 총량은 비슷해야 한다 — 모드를 바꿨는데 방이 어두워지면 안 된다.
  const tot = l => l.hemi + l.ceiling + l.key + l.fill;
  assert.ok(Math.abs(tot(ls) - tot(lr)) / tot(lr) < 0.08, `총량 ${tot(ls).toFixed(2)} vs ${tot(lr).toFixed(2)}`);
});

test('조명 세기 — 기준값 × 모드 × 분위기, LED 번짐은 방 밝기와 무관', () => {
  const base = lightLevels(LIGHTS, 'real', 1);
  const bright = lightLevels(LIGHTS, 'real', 1.14);
  for (const k of ['hemi', 'ceiling', 'key', 'fill']) {
    assert.ok(Math.abs(bright[k] - base[k] * 1.14) < 1e-9, k);
  }
  assert.equal(bright.ledSpill, base.ledSpill, 'LED 번짐은 분위기 배수를 타지 않는다');
  // 실사 모드는 기준값 그대로다(배수 1).
  for (const k of ['hemi', 'ceiling', 'key', 'fill', 'ledSpill']) {
    assert.ok(Math.abs(base[k] - LIGHTS[k]) < 1e-9, `${k}: ${base[k]} vs ${LIGHTS[k]}`);
  }
  // 이상한 분위기 배수는 1로 본다.
  assert.deepEqual(lightLevels(LIGHTS, 'real', 0), base);
  assert.deepEqual(lightLevels(LIGHTS, 'real', 'abc'), base);
  assert.equal(keyShareOf({ hemi: 0, ceiling: 0, key: 0, fill: 0 }), 0, '0으로 나누지 않는다');
});

test('모드를 바꿔도 형상·치수는 한 값도 달라지지 않는다', () => {
  const args = {
    space: { W: 10000, H: 3500, D: 12000, wallThk: 100 },
    led: { w: 4000, h: 2300, marginW: 500, mount: 1000, cols: 5, rows: 4, depth: 60 },
    items: [{ type: 'seat', x: 100, z: 200, rotY: 0, y: 250 }],
    roomType: 'hall_s',
  };
  const simple = buildGLModel({ ...args, renderMode: 'simple' });
  const real = buildGLModel({ ...args, renderMode: 'real' });
  assert.equal(simple.renderMode, 'simple');
  assert.equal(real.renderMode, 'real');
  // 표현 방식만 빼면 완전히 같아야 한다.
  const strip = m => JSON.stringify({ ...m, renderMode: null });
  assert.equal(strip(simple), strip(real), '형상·치수·배치가 달라졌다');
  // 모드를 안 주면 기본(실사).
  assert.equal(buildGLModel(args).renderMode, DEFAULT_RENDER_MODE);
});
