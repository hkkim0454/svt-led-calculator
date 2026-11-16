// clearance-loss.test.js — 자동 채움에서 '한 장 더 들어갈 크기인데 구조틀 여백 때문에 줄었다'는 안내(DEC-196).
// 계기: 오너 링크 'MP012F_9X4' — ② LED 가로를 실제 크기 8,064mm(=10열)로 넣었더니 9열이 됐다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clearanceLoss, computeConfig, frameClearanceMm } from '../src/engine.js';
import { MODELS } from '../src/models.js';

const MP012F = MODELS.find(m => m.id === 'MP012F');
const appSrc = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const fit = (m, w, h) => computeConfig(m, 0, 0, { mode: 'ledsize', ledW: w, ledH: h });

test('MP012F 가로 8,064mm — 10열 크기지만 여백 100mm 때문에 9열이다(10열은 8,164mm 이상)', () => {
  const r = fit(MP012F, 8064, 2000);
  assert.equal(r.cols, 9);
  const loss = clearanceLoss(MP012F, 8064, 2000, r.cols, r.rows);
  assert.equal(loss.clr, 50);        // MP 시리즈 구조틀 여백 50mm (각 변)
  assert.equal(loss.w.next, 10);
  assert.equal(loss.w.bare, 8064);
  assert.equal(loss.w.need, 8164);
  assert.equal(loss.w.shortage, 100);
  assert.equal(fit(MP012F, 8164, 2000).cols, 10, '안내가 알려 준 크기를 넣으면 실제로 10열이 된다');
  assert.equal(fit(MP012F, 8163, 2000).cols, 9);
});

test('정말 공간이 모자라면(한 장도 여백 없이 안 들어가면) 안내하지 않는다', () => {
  const r = fit(MP012F, 8000, 2000);       // 10열(8,064)은 여백 없이도 안 들어간다
  assert.equal(r.cols, 9);
  assert.equal(clearanceLoss(MP012F, 8000, 2000, r.cols, r.rows).w, null);
});

test('세로도 같다 — 행 크기에 딱 맞춰 넣으면 여백 때문에 한 행 줄어든다', () => {
  const h = 4 * MP012F.cabH;               // 1,814.4mm = 4행 크기
  const r = fit(MP012F, 8164, h);
  assert.equal(r.rows, 3);
  const loss = clearanceLoss(MP012F, 8164, h, r.cols, r.rows);
  assert.equal(loss.h.next, 4);
  assert.ok(Math.abs(loss.h.need - (h + 100)) < 1e-6);
  assert.equal(fit(MP012F, 8164, loss.h.need).rows, 4);
  assert.equal(loss.w, null, '가로는 여유가 충분해 안내가 없다');
});

test('역산 일관성 — 안내가 있으면 필요한 크기를 넣었을 때 정확히 한 장 늘고, 없으면 늘지 않는다', () => {
  for (const m of MODELS.filter(x => x.cabW > 0 && x.cabH > 0)) {
    for (const [W, H] of [[8064, 2000], [8200, 2000], [3840, 2160], [6000, 3400], [4000, 2300], [12000, 5000]]) {
      const r = fit(m, W, H);
      if (!r.fits) continue;
      const loss = clearanceLoss(m, W, H, r.cols, r.rows);
      if (loss.w) {
        assert.equal(fit(m, loss.w.need, H).cols, r.cols + 1, `${m.id} ${W}×${H} 가로`);
        assert.ok(fit(m, loss.w.need - 0.5, H).cols === r.cols, `${m.id} ${W}×${H} 가로 경계`);
      } else {
        assert.ok((r.cols + 1) * m.cabW > W, `${m.id} ${W}×${H}: 안내가 없는데 한 열이 여백 없이 들어간다`);
      }
      if (loss.h) assert.equal(fit(m, W, loss.h.need).rows, r.rows + 1, `${m.id} ${W}×${H} 세로`);
      else assert.ok((r.rows + 1) * m.cabH > H, `${m.id} ${W}×${H}: 안내가 없는데 한 행이 여백 없이 들어간다`);
      assert.equal(loss.clr, frameClearanceMm(m.series));
    }
  }
});

const htmlSrc = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const cssSrc = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('앱 연결 — 자동 채움 안내 줄에 이유를 붙이고, 직접 지정·사이니지에는 붙이지 않는다', () => {
  assert.match(appSrc, /\+ warn \+ ledClearanceNoteHTML\(m, r\);/);
  assert.match(appSrc, /if \(o\.mode !== 'ledsize'\) return \[\];/);
  assert.match(appSrc, /clearanceLoss\(m, o\.ledW, o\.ledH, r\.cols, r\.rows\)/);
  assert.match(appSrc, /data-ledfit="clearance"/);
});

test('② 칸 아래 — 같은 안내를 별도 칸(#ledClrNote)으로 보이고, 권장 상자(#ledRec)는 건드리지 않는다', () => {
  // 같은 문장 만드는 함수를 03 위 줄과 ② 칸이 함께 쓴다(문구를 두 곳에 적지 않는다).
  assert.match(appSrc, /function ledClearanceNoteHTML\(m, r\) \{\n  const parts = ledClearanceLines\(m, r\);/);
  assert.match(appSrc, /function renderLedClearanceNote\(\) \{/);
  assert.match(appSrc, /const m = \(!svCode && mode !== 'manual'\) \? models\.find\(x => x\.id === selectedId\) : null;\n  const r = m \? computeConfig/);
  assert.match(appSrc, /box\.hidden = !parts\.length;/);
  // 미리보기를 다시 그릴 때와 전체를 다시 그릴 때 모두 갱신한다.
  assert.match(appSrc, /renderLedRecommendation\(\);\n  renderLedClearanceNote\(\);/);
  assert.match(appSrc, /renderLedRecommendation\(\); renderLedClearanceNote\(\); saveLastSession\(\);/);
  // 마크업: 권장 상자 바로 뒤, 처음에는 숨김. 권장 상자 안에는 아무것도 더하지 않았다.
  assert.match(htmlSrc, /<div class="ledRecWarn" id="ledRecWarn" hidden><\/div>\n        <\/div>\n        <div class="ledClrNote" id="ledClrNote" aria-live="polite" hidden><\/div>/);
  assert.doesNotMatch(htmlSrc.slice(htmlSrc.indexOf('id="ledRec"'), htmlSrc.indexOf('<div class="ledClrNote"')), /ledClrNote/);
  assert.match(cssSrc, /\.ledClrNote\[hidden\]\{display:none\}/);
});

test('안내 문구 — 조사가 맞고(9열로 · 3행으로), 소수 mm 는 올림해서 안내한다', () => {
  assert.match(appSrc, /\$\{cur\}\$\{unit\}\$\{josa\} 맞췄습니다/);
  assert.match(appSrc, /line\('LED 가로', '열', '로', r\.cols, loss\.w\)/);
  assert.match(appSrc, /line\('LED 세로', '행', '으로', r\.rows, loss\.h\)/);
  assert.match(appSrc, /const need = Math\.ceil\(d\.need - 1e-9\);/);
  // 올림한 값을 넣으면 실제로 한 장 늘어난다(내림하면 모자란다).
  const h = 4 * MP012F.cabH;                      // 1,814.4mm
  const loss = clearanceLoss(MP012F, 8164, h, 10, 3).h;
  assert.equal(Math.ceil(loss.need - 1e-9), 1915);
  assert.equal(fit(MP012F, 8164, 1915).rows, 4);
  assert.equal(fit(MP012F, 8164, 1914).rows, 3);
});
