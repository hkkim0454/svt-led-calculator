// array-requirement.test.js — 배열 직접 지정에서 요청이 줄어들 때 '왜'를 보이는 값(arrayRequirement) 회귀 테스트.
// 핵심: (1) 줄어드는 규칙(fitCabinets)과 같은 규칙의 역산이다 (2) 계산 결과는 바꾸지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arrayRequirement, computeConfig, frameClearanceMm } from '../src/engine.js';
import { MODELS } from '../src/models.js';

const MM015FS = MODELS.find(m => m.id === 'MM015FS');
const appSrc = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('MM015F-S 6행 — 벽 2.7m·하단 600mm 에서는 25mm 모자라 5행이 된다(오너 캡처 2026-10-26)', () => {
  const q = arrayRequirement(MM015FS, 8000, 2700, 6, 6, { baseHeight: 600 });
  assert.equal(q.clr, 50);                 // MM 시리즈 구조틀 여백
  assert.equal(q.bareH, 2025);             // 337.5 × 6
  assert.equal(q.needH, 2125);             // + 위·아래 각 50
  assert.equal(q.availH, 2100);            // 2,700 − 600
  assert.equal(q.shortH, 25);
  assert.equal(q.shortW, 0);               // 가로는 8m 에 3,600 이라 충분
  assert.equal(computeConfig(MM015FS, 8000, 2700, { mode: 'fill', baseHeight: 600 }).rows, 5);
});

test('MM015F-S 6행 — 벽 2.8m·하단 600mm 에서는 그대로 들어간다', () => {
  const q = arrayRequirement(MM015FS, 8000, 2800, 6, 6, { baseHeight: 600 });
  assert.equal(q.shortH, 0);
  assert.equal(computeConfig(MM015FS, 8000, 2800, { mode: 'fill', baseHeight: 600 }).rows, 6);
});

test('역산 일관성 — shortH·shortW 가 0 이면 자동 채움 결과가 그 배열 이상이다(경계 포함)', () => {
  for (const m of MODELS.filter(x => x.cabW > 0 && x.cabH > 0)) {
    const clr = frameClearanceMm(m.series);
    for (const [W, H, base] of [[8000, 2700, 600], [6000, 3400, 0], [4000, 2300, 500], [12000, 5000, 1000]]) {
      const fit = computeConfig(m, W, H, { mode: 'fill', baseHeight: base });
      for (const n of [1, 2, 3, 5, 8, 13]) {
        const q = arrayRequirement(m, W, H, n, n, { baseHeight: base });
        assert.equal(q.shortW === 0, fit.cols >= n, `${m.id} ${W}×${H}/${base} 가로 ${n}열`);
        assert.equal(q.shortH === 0, fit.rows >= n, `${m.id} ${W}×${H}/${base} 세로 ${n}행`);
        assert.equal(q.clr, clr);
      }
    }
  }
});

test('안내 문구 — 공간을 넘는다고 단정하지 않고 필요·남는·부족 mm 를 보인다', () => {
  assert.match(appSrc, /은\(는\) 들어가지 않아 <b>\$\{lf\.cols\}×\$\{lf\.rows\}<\/b> 로 맞췄습니다/);
  assert.match(appSrc, /<span class="fitWhy">\$\{ledOverReason\(lf\)\}<\/span>/);
  assert.match(appSrc, /구조틀 여백 \$\{fmt\(need - bare\)\}mm\(각 변 \$\{fmt\(q\.clr\)\}mm\)/);
});
