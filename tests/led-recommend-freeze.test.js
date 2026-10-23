// PHASE 11-e.1 — Recommendation V1 동결 계약 보강(DEC-189). 제품 코드는 바꾸지 않고 검사만 더한다.
//   PHASE 11-e 변이 검사에서 놓친 네 가지(G1~G4)를 못박는다. 이 파일의 값은 v478~v490 제품 동작 그대로다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recommendLedSize } from '../src/led-recommend.js';
import { ledFitProblem, LED_REQUEST_DEFAULT } from '../src/led-request.js';

const rec = (W, { H = 4000, D = 9000, base = 1000, far = 6000, type = 'meeting' } = {}) =>
  recommendLedSize({ roomTypeId: type, room: { W, H, D, ledBottom: base }, farViewerMm: far, frameClearanceMm: 50 });

const NON_HALL = ['meeting', 'control', 'classroom', 'ideation'];
const sweep = function* () {
  for (const type of NON_HALL) for (let W = 6000; W <= 30000; W += 250) for (const H of [3000, 3400, 4000, 6000])
    for (const far of [0, 6000, 14000, 26000]) yield { type, W, H, far };
};

test('G1-a · 16:9 — 하한·제한이 아닌 권장값은 이상값(ideal)을 100 mm 단위로 **반올림**한 값이다', () => {
  let checked = 0;
  for (const s of sweep()) {
    const r = rec(s.W, s);
    if (!r || r.basis === 'default-floor' || r.capped.length) continue;
    assert.equal(r.w, Math.round(r.ideal.w / 100) * 100, `${JSON.stringify(s)} 폭 ${r.w} (이상 ${r.ideal.w})`);
    assert.equal(r.h, Math.round(r.ideal.h / 100) * 100, `${JSON.stringify(s)} 높이 ${r.h} (이상 ${r.ideal.h})`);
    checked++;
  }
  assert.ok(checked > 100, `검사한 경우가 너무 적다(${checked})`);
});

test('G1-b · 16:9 — 모든 비강당 권장값은 16:9 에서 100 mm 반올림 오차 이상 벗어나지 않는다', () => {
  for (const s of sweep()) {
    const r = rec(s.W, s);
    if (!r || r.basis === 'default-floor') continue;
    // 폭·높이를 따로 100 mm 로 맞추므로 |w·9 − h·16| ≤ 9·50 + 16·50 = 1,250 이다. 천장 제한은 내림이라 한 칸(100)까지 더 허용한다.
    const slack = r.capped.includes('ceiling') ? 1250 + 1600 : 1250;
    assert.ok(Math.abs(r.w * 9 - r.h * 16) <= slack, `${JSON.stringify(s)} → ${r.w}×${r.h} 가 16:9 를 벗어났다`);
  }
});

test('G1-c · 기준 사례 — 폭 15 m 회의실은 4,500×2,500 (16:9 반올림, 2,600 아님)', () => {
  const r = rec(15000);
  assert.deepEqual([r.w, r.h, r.basis], [4500, 2500, 'presence']);
});

test('G2-a · 하한 — 폭 13.5 m 회의실은 하한 4,000×2,300 이다(4,100×2,300 아님)', () => {
  const r = rec(13500);
  assert.deepEqual([r.w, r.h, r.basis], [LED_REQUEST_DEFAULT.w, LED_REQUEST_DEFAULT.h, 'default-floor']);
});

test('G2-b · 하한 — 한쪽이라도 하한 이하면 정확히 하한, 아니면 둘 다 하한보다 크다', () => {
  for (const s of sweep()) {
    const r = rec(s.W, s);
    if (!r) continue;
    const isFloor = r.w === LED_REQUEST_DEFAULT.w && r.h === LED_REQUEST_DEFAULT.h;
    assert.ok(isFloor || (r.w > LED_REQUEST_DEFAULT.w && r.h > LED_REQUEST_DEFAULT.h),
      `${JSON.stringify(s)} → ${r.w}×${r.h} 가 하한 경계에서 어긋났다`);
    assert.equal(r.basis === 'default-floor', isFloor, `${JSON.stringify(s)} 근거 ${r.basis}`);
  }
});

test('G3 · 벽 넘침 경고 여유는 0.5 mm 다 — 1 mm 넘으면 경고, 0.4 mm 는 경고 아님', () => {
  const base = { spaceW: 8000, spaceH: 3400, baseHeight: 1000 };
  assert.deepEqual(ledFitProblem({ ...base, actualW: 8001, actualH: 2000 }), { width: true, height: false, topMm: 3000 });
  assert.deepEqual(ledFitProblem({ ...base, actualW: 7000, actualH: 2401 }), { width: false, height: true, topMm: 3401 });
  assert.equal(ledFitProblem({ ...base, actualW: 8000.4, actualH: 2400.4 }), null);
  assert.equal(ledFitProblem({ ...base, actualW: 8000, actualH: 2400 }), null);
});

test('G4 · 배열 직접 지정 · 사이니지에서는 권장 상자를 숨긴다(권장값을 구하지 않는다)', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const fn = app.slice(app.indexOf('function renderLedRecommendation()'), app.indexOf('function renderLedFitBar()'));
  assert.match(fn, /const rec = \(!svCode && mode !== 'manual' && m\) \? currentLedRecommendation\(\) : null;/);
  assert.match(fn, /if \(!rec\) \{\n    box\.style\.visibility = 'hidden';/);
});
