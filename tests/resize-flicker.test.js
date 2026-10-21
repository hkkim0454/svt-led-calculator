// 모바일 주소창이 접히며 오는 '높이만 바뀐 resize' 로 정면 뷰를 다시 그리지 않는다(오너 제보 2026-10-21, DEC-187).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('① 창 resize 는 폭이 바뀔 때만 정면 뷰를 다시 그린다', () => {
  assert.ok(!/window\.addEventListener\('resize', renderPreview\)/.test(app), '높이만 바뀌어도 다시 그리는 옛 연결이 남아 있다');
  assert.match(app, /let lastWindowW = window\.innerWidth;\nwindow\.addEventListener\('resize', \(\) => \{\n  const w = window\.innerWidth;\n  if \(w === lastWindowW\) return;\n  lastWindowW = w;\n  renderPreview\(\);\n\}\);/);
});

test('② 칸 폭 감시(ResizeObserver)도 높이만 바뀐 경우는 무시한다', () => {
  assert.match(app, /if \(!w \|\| w === lastW\) return;/);
});

test('③ 터치 기기에서는 유리 흐림을 끄고 정면 뷰를 따로 그린다(DEC-188), PC 는 그대로', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const m = css.match(/@media \(hover:none\) and \(pointer:coarse\)\{([\s\S]*?)\n\}/);
  assert.ok(m, '터치 기기 규칙이 없다');
  assert.match(m[1], /--glass-blur:none/);
  assert.match(m[1], /\.rs3Frame\{contain:paint;isolation:isolate\}/);
  // PC(기본) 값은 그대로 흐림이다.
  assert.match(css, /--glass-blur:saturate\(180%\) blur\(30px\);/);
});
