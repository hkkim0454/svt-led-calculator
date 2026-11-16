// autofill-summary.test.js — 03 미리보기 위 배열 요약 줄(DEC-192).
// 자동 채움(② LED 설치 크기)에서도 배열 직접 지정과 같은 요약(배열 · 전체 · 해상도 · 무게)을 보인다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSrc = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

/** 본문 잘라 오기 — 함수 하나. */
function body(name) {
  const i = appSrc.indexOf(`function ${name}(`);
  assert.ok(i >= 0, `${name} 함수가 없다`);
  let depth = 0;
  for (let k = appSrc.indexOf('{', i); k < appSrc.length; k++) {
    if (appSrc[k] === '{') depth++;
    else if (appSrc[k] === '}' && --depth === 0) return appSrc.slice(i, k + 1);
  }
  throw new Error(`${name} 본문을 못 찾았다`);
}

test('자동 채움에서도 배열 요약 줄을 보인다', () => {
  const auto = body('renderLedSizeFitWarning');
  assert.match(auto, /자동 채움/, '머리말이 없다');
  assert.match(auto, /ledArraySummaryHTML\(m, r\)/, '요약을 그리지 않는다');
  // 숨기는 경우는 계산 결과가 없거나 캐비닛이 하나도 들어가지 않을 때뿐이다(넘치지 않는다고 숨기지 않는다).
  const hides = [...auto.matchAll(/bar\.hidden = true/g)];
  assert.equal(hides.length, 1);
  assert.match(auto, /if \(!r \|\| !r\.fits\) \{ bar\.hidden = true/);
  // 넘칠 때의 경고는 그대로 남는다(PHASE 11-a).
  assert.match(auto, /data-ledfit="over"/);
});

test('두 모드가 같은 요약 문구를 쓴다', () => {
  const sum = body('ledArraySummaryHTML');
  for (const label of ['배열 ', '전체 ', '해상도 ', '무게 ']) assert.ok(sum.includes(label), `${label} 이 없다`);
  assert.match(body('renderLedFitBar'), /ledArraySummaryHTML\(m, r\)/, '배열 직접 지정이 공통 요약을 쓰지 않는다');
  assert.match(body('renderLedFitBar'), /배열 직접 지정/);
});
