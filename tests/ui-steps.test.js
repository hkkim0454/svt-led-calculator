// ui-steps.test.js — 01~08 단계 표시줄 · 칸 머리 구조 (오너 A안, DEC-161, 2026-10-04).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = f => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');

test('단계 표시줄 8칸이 각 칸(data-step)과 짝을 이룬다', () => {
  const html = src('index.html');
  const go = [...html.matchAll(/data-stepgo="(\d\d)"/g)].map(m => m[1]);
  const steps = [...html.matchAll(/class="card[^"]*"[^>]*data-step="(\d\d)"/g)].map(m => m[1]);
  assert.deepEqual(go, ['01', '02', '03', '04', '05', '06', '07', '08']);
  assert.deepEqual(steps, go, '단계 버튼과 칸이 어긋났다');
  assert.match(src('app.js'), /function initStepNav\(\)/);
});

test('칸 머리 — 번호와 이름 사이에 / 를 넣지 않고(오너 지시), 칸마다 큰 안내 문장이 있다', () => {
  const html = src('index.html');
  assert.equal(/<span class="idx">\d\d<\/span>\s*\//.test(html), false, '머리표에 / 가 붙었다');
  assert.equal([...html.matchAll(/<div class="secHead"><h3>[^<]+<\/h3><p>[^<]+<\/p><\/div>/g)].length, 8);
  // 01 입력 묶음 1~4
  assert.deepEqual([...html.matchAll(/<div class="grpTitle"[^>]*><b>(\d)<\/b>/g)].map(m => m[1]), ['1', '2', '3', '4']);
});
