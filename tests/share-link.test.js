// share-link.test.js — 상단 '링크 공유' 버튼(DEC-193).
// 저장하지 않고 지금 화면의 구성을 링크(#share=)로 만든다. 받는 쪽 처리(handleSharedLink)는 기존 그대로다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeRecord, exportBundle, parseImport, CONFIG_DEFAULTS } from '../src/config.js';

const appSrc = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');

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

test('상단 도구 줄에 링크 공유 버튼이 있고 지금 구성으로 링크를 만든다', () => {
  assert.match(html, /<button[^>]*id="btnShareLink"[^>]*>링크 공유<\/button>/);
  assert.match(appSrc, /\$\('#btnShareLink'\)\?\.addEventListener\('click', shareCurrentLink\)/);
  const fn = body('shareCurrentLink');
  assert.match(fn, /gatherConfig\(\)/, '지금 화면의 구성을 쓰지 않는다');
  assert.match(fn, /buildShareLink\(\[rec\]\)/);
  assert.doesNotMatch(fn, /writeConfigs|persistConfig/, '링크 공유가 내 목록을 바꾼다');
  // 구성 목록의 '공유'와 같은 복사 절차를 쓴다.
  assert.match(body('shareConfig'), /copyShareLink\(/);
  // 직접 넣은 기타 자재 금액은 링크에 싣지 않는다.
  assert.match(body('buildShareLink'), /etcCost: 0, etcSell: 0/);
});

test('링크에 담는 묶음은 되읽으면 같은 구성이 나온다(가격 정보 없음)', () => {
  const data = { ...CONFIG_DEFAULTS, spaceW: 11000, spaceH: 2900, ledW: 8200, ledH: 2000, baseHeight: 866, selectedId: 'MM012FS' };
  const payload = JSON.stringify(exportBundle([makeRecord('MM012F-S_13X5', data)]));
  // 화면과 같은 base64url(한글 안전)로 감싸고 푼다.
  const enc = Buffer.from(payload, 'utf8').toString('base64url');
  const back = parseImport(JSON.parse(Buffer.from(enc, 'base64url').toString('utf8')));
  assert.equal(back.length, 1);
  assert.equal(back[0].name, 'MM012F-S_13X5');
  for (const k of ['spaceW', 'spaceH', 'ledW', 'ledH', 'baseHeight', 'selectedId']) assert.equal(back[0].data[k], data[k], k);
  assert.ok(!/price|cost|sell/i.test(Object.keys(back[0].data).join(',').replace(/etcCost|etcSell/g, '')), '가격 항목이 섞였다');
});
