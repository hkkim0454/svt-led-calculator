// password-retry.test.js — 틀린 비밀번호를 기억하지 않고 다시 묻는다(DEC-194, 오너 제보 2026-11-16).
// 한 번 틀리면 페이지 안에 남은 값 때문에 창을 다시 열어도 묻지 않던 문제와,
// 설치 사례 등록이 실패해도 저장된 관리자 비밀번호를 그대로 쓰던 문제를 막는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSrc = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
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

test('설계 프로젝트 — 빈 목록이면 저장값과 페이지 안의 값을 모두 비운다', () => {
  const fn = body('renderSharedList');
  assert.match(fn, /if \(!rows\.length\) \{[\s\S]*?localStorage\.removeItem\(SHARE_KEY\);\s*shareCode = '';/);
});

test('설치 사례 보기 — 빈 목록이면 저장값과 페이지 안의 값을 모두 비운다', () => {
  const fn = body('renderCaseList');
  assert.match(fn, /if \(!rows\.length\) \{[\s\S]*?localStorage\.removeItem\(CASE_VIEW_KEY\);\s*caseViewCode = '';/);
});

test('설치 사례 등록 · 일괄 등록 · 수정 · 삭제 — 실패하면 관리자 비밀번호를 지운다', () => {
  // 함수 하나의 범위 — 다음 최상위 함수 선언 전까지(인자에 중괄호가 있는 함수도 안전하게 자른다).
  const span = name => { const i = appSrc.indexOf(`function ${name}(`); assert.ok(i >= 0, name);
    const j = appSrc.indexOf('\nasync function ', i + 1); return appSrc.slice(i, j < 0 ? undefined : j); };
  for (const name of ['registerCurrentCase', 'registerParsedCases', 'editCase']) {
    assert.match(span(name), /catch \(e\) \{ localStorage\.removeItem\(CASE_ADMIN_KEY\);/, `${name} 실패 때 관리자 비밀번호를 남긴다`);
  }
  // 삭제는 클릭 처리기 안에 있다.
  assert.match(appSrc, /deleteCase\(admin, c\.id, caseViewCode\);[^\n]*\n\s*catch \(err\) \{ localStorage\.removeItem\(CASE_ADMIN_KEY\);/);
  // 등록 경로의 catch 중 관리자 비밀번호를 지우지 않는 것이 남아 있으면 안 된다.
  const bad = [...appSrc.matchAll(/catch \(e\) \{ alert\('(사례 등록|일괄 등록)에 실패/g)];
  assert.equal(bad.length, 0);
});
