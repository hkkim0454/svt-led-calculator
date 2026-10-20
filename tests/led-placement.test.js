// LED 가로 위치(오너 요청 2026-10-19) — 앞벽 위에서 LED 를 좌우로 옮긴다.
//   계산 결과는 그대로 두고 위치만 정한다. 가운데(0)는 예전 화면과 같아야 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ledPlacement, computeConfig } from '../src/engine.js';
import { CONFIG_DEFAULTS, normalizeConfig } from '../src/config.js';
import { MODELS } from '../src/models.js';

test('① 가운데(0)는 computeConfig 의 가운데 정렬 여백과 같다', () => {
  const m = MODELS.find(x => x.id === 'MP012F');
  const r = computeConfig(m, 6000, 3400);
  const p = ledPlacement(6000, r.actualW, 0);
  assert.equal(p.left, r.marginW);
  assert.equal(p.right, r.marginW);
  assert.equal(p.offset, 0);
});

test('② 옮긴 만큼 왼쪽 여백이 늘고 오른쪽이 준다(+ = 오른쪽)', () => {
  const p = ledPlacement(8000, 4000, 500);
  assert.deepEqual([p.left, p.right, p.offset, p.maxOffset], [2500, 1500, 500, 2000]);
  const q = ledPlacement(8000, 4000, -1200);
  assert.deepEqual([q.left, q.right], [800, 3200]);
});

test('③ 벽 밖으로 나가지 않는다 — 끝까지 가면 벽에 붙는다', () => {
  assert.deepEqual([ledPlacement(8000, 4000, 99999).left, ledPlacement(8000, 4000, 99999).right], [4000, 0]);
  assert.deepEqual([ledPlacement(8000, 4000, -99999).left, ledPlacement(8000, 4000, -99999).right], [0, 4000]);
  // LED 가 벽보다 넓거나 같으면 움직일 자리가 없다
  assert.deepEqual(ledPlacement(4000, 4000, 300), { left: 0, right: 0, offset: 0, maxOffset: 0 });
  assert.equal(ledPlacement(3000, 4000, -300).left, 0);
});

test('④ 숫자가 아니면 가운데로 둔다', () => {
  for (const bad of [NaN, undefined, null, 'abc', Infinity]) {
    const p = ledPlacement(8000, 4000, bad);
    assert.equal(p.left, p.right, String(bad));
  }
});

test('⑤ 구성 저장 — 기본은 0(가운데), 옛 저장값도 가운데로 되살아난다', () => {
  assert.equal(CONFIG_DEFAULTS.ledOffsetX, 0);
  assert.equal(normalizeConfig({}).ledOffsetX, 0);
  assert.equal(normalizeConfig({ ledOffsetX: '-750' }).ledOffsetX, -750);
  assert.equal(normalizeConfig({ ledOffsetX: 'x' }).ledOffsetX, 0);
});

test('⑥ 화면 배선 — 미리보기는 한 곳에서 위치를 반영하고, 가운데면 r 을 바꾸지 않는다', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const fn = app.slice(app.indexOf('function resolvePreviewTarget()'), app.indexOf('function resolvePreviewTargetCentered()'));
  assert.match(fn, /ledPlacement\(spaceWmm\(\), t\.r\.actualW, ledOffsetX\)/);
  assert.match(fn, /if \(p\.offset === 0\) return \{ \.\.\.t, r: \{ \.\.\.t\.r, marginR: t\.r\.marginW \} \}/);
  // 저장·복원
  assert.match(app, /^\s+ledOffsetX,$/m);
  assert.match(app, /ledOffsetX = c\.ledOffsetX;/);
  // 정면 뷰 오른쪽 여백은 오른쪽 값으로 잰다
  assert.match(app, /hDim\(Lx \+ Lw, SWp, topDimV, 0, mmL\(r\.marginR\)/);
  // 3D 패널 버튼 세 개
  for (const k of ['left', 'center', 'right']) assert.ok(app.includes(`'${k}', `), k);
  assert.match(app, /inp\.id = 'ledOffsetX'/);
});
