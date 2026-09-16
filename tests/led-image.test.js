// led-image.test.js — LED 화면 이미지 맞춤 규칙 회귀 테스트.
// 핵심 규칙: 정면 뷰(2D)와 3D 뷰가 **같은 규칙**을 쓴다. 두 곳에 따로 적으면 그림이 다르게 잘린다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ledImageFit } from '../src/led-image.js';

const LED = { ledW: 1600, ledH: 900 };            // 16:9

test('가로 고정 — 가로를 꽉 채우고 세로가 넘치면 위아래로 자른다', () => {
  // 세로로 긴 이미지(1:2) → 가로를 채우면 세로가 크게 넘친다.
  const f = ledImageFit({ ...LED, imgAspect: 0.5, mode: 'width', panY: 0.5 });
  assert.equal(f.mode, 'width');
  assert.equal(f.iw, 1600, '가로는 꽉');
  assert.equal(f.ih, 3200);
  assert.ok(f.range > 0, '넘친다');
  assert.equal(f.left, 0);
  assert.equal(f.top, -(3200 - 900) / 2, '가운데로 잘린다');
  // 위로 붙이면 top = 0, 아래로 붙이면 남는 만큼 전부 올라간다.
  assert.equal(ledImageFit({ ...LED, imgAspect: 0.5, panY: 0 }).top, 0);
  assert.equal(ledImageFit({ ...LED, imgAspect: 0.5, panY: 1 }).top, -(3200 - 900));
});

test('가로 고정 — 세로가 모자라면 검정이 남고 그 안에서 움직인다', () => {
  // 가로로 긴 이미지(4:1) → 가로를 채우면 세로가 모자란다.
  const f = ledImageFit({ ...LED, imgAspect: 4, mode: 'width', panY: 0.5 });
  assert.equal(f.ih, 400);
  assert.ok(f.range < 0, '모자란다');
  assert.equal(f.top, (900 - 400) * 0.5, '남는 자리 가운데');
  assert.equal(ledImageFit({ ...LED, imgAspect: 4, panY: 0 }).top, 0);
  assert.equal(ledImageFit({ ...LED, imgAspect: 4, panY: 1 }).top, 500);
});

test('세로 고정 — 세로를 꽉 채우고 가로를 좌우로 옮긴다', () => {
  const f = ledImageFit({ ...LED, imgAspect: 4, mode: 'height', panX: 0.5 });
  assert.equal(f.ih, 900, '세로는 꽉');
  assert.equal(f.iw, 3600);
  assert.ok(f.range > 0);
  assert.equal(f.top, 0);
  assert.equal(f.left, -(3600 - 1600) / 2);
  // 모자라는 쪽도 같은 규칙.
  const g = ledImageFit({ ...LED, imgAspect: 0.5, mode: 'height', panX: 1 });
  assert.ok(g.range < 0);
  assert.equal(g.left, 1600 - 450);
});

test('비율이 같으면 정확히 꽉 찬다(잘림도 검정도 없다)', () => {
  const f = ledImageFit({ ...LED, imgAspect: 16 / 9, mode: 'width' });
  assert.equal(f.iw, 1600);
  assert.ok(Math.abs(f.ih - 900) < 1e-9);
  assert.ok(Math.abs(f.range) < 1e-9);
  assert.equal(f.left, 0);
  assert.ok(Math.abs(f.top) < 1e-9);
});

test('이상한 값에도 무너지지 않는다', () => {
  // 비율을 모르면 LED 비율로 본다 → 꽉 찬다.
  const f = ledImageFit({ ...LED, imgAspect: null });
  assert.ok(Math.abs(f.range) < 1e-9);
  assert.ok(Math.abs(ledImageFit({ ...LED, imgAspect: -3 }).range) < 1e-9);
  // 이동값이 범위를 벗어나면 0~1로 자른다.
  assert.equal(ledImageFit({ ...LED, imgAspect: 0.5, panY: 99 }).top,
    ledImageFit({ ...LED, imgAspect: 0.5, panY: 1 }).top);
  assert.equal(ledImageFit({ ...LED, imgAspect: 0.5, panY: -99 }).top,
    ledImageFit({ ...LED, imgAspect: 0.5, panY: 0 }).top);
  assert.equal(ledImageFit({ ...LED, imgAspect: 0.5, panY: 'abc' }).top,
    ledImageFit({ ...LED, imgAspect: 0.5, panY: 0.5 }).top, '숫자가 아니면 가운데');
  // LED 크기가 0이어도 0으로 나누지 않는다.
  for (const k of [ledImageFit({ ledW: 0, ledH: 0, imgAspect: 2 }), ledImageFit()]) {
    for (const v of [k.iw, k.ih, k.left, k.top, k.range]) assert.ok(Number.isFinite(v), JSON.stringify(k));
  }
});

test('같은 입력이면 2D와 3D가 같은 결과 — 배율만 달라도 비율이 같으면 비례한다', () => {
  const small = ledImageFit({ ledW: 400, ledH: 225, imgAspect: 0.7, mode: 'width', panY: 0.3 });
  const big = ledImageFit({ ledW: 1600, ledH: 900, imgAspect: 0.7, mode: 'width', panY: 0.3 });
  const k = 4;
  assert.ok(Math.abs(big.iw - small.iw * k) < 1e-9);
  assert.ok(Math.abs(big.ih - small.ih * k) < 1e-9);
  assert.ok(Math.abs(big.top - small.top * k) < 1e-9);
  assert.ok(Math.abs(big.left - small.left * k) < 1e-9);
});
