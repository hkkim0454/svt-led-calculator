// share-link-short.test.js — 짧은 공유 링크(#s=, DEC-195).
// 핵심: (1) 줄였다가 되살리면 언제나 같은 구성이다 (2) 카탈로그 모델 스냅샷은 빼고 직접 고친 모델은 남긴다
//       (3) 실제 압축을 거친 링크가 예전보다 훨씬 짧다 (4) 받는 쪽은 예전 형식도 읽는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFIG_DEFAULTS, normalizeConfig, makeRecord, exportBundle, slimShareRecord, unslimShareRecord } from '../src/config.js';
import { MODELS } from '../src/models.js';

const appSrc = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const MP012F = MODELS.find(m => m.id === 'MP012F');
const sample = {
  ...CONFIG_DEFAULTS, spaceW: 11000, spaceH: 2900, ledW: 8200, ledH: 2000, baseHeight: 866,
  mode: 'manual', manCols: 10, manRows: 4, selectedId: 'MP012F', selectedModel: structuredClone(MP012F),
  roomOpts: { tableShape: 'boat', seats: 12 }, ledSizeMode: 'manual', visibleLines: ['IF', 'IFM', 'IE', 'IEE', 'MM', 'MP'],
};
const roundTrip = data => unslimShareRecord(JSON.parse(JSON.stringify(slimShareRecord(makeRecord('X', data), MODELS))))[0].data;

test('줄였다 되살리면 같은 구성이다(카탈로그 모델 스냅샷만 빠진다)', () => {
  const back = roundTrip(sample), full = normalizeConfig(sample);
  for (const k of Object.keys(full)) {
    if (k === 'selectedModel') continue;
    assert.deepEqual(back[k], full[k], k);
  }
  assert.equal(back.selectedModel, null, '카탈로그와 같은 스냅샷을 실었다');
  assert.equal(back.selectedId, 'MP012F');
  assert.equal(`${back.manCols}x${back.manRows}`, '10x4');
});

test('빠지면 다른 값을 따라가는 항목도 그대로 되살아난다(앞벽 두께 ← 옆벽 두께)', () => {
  const data = { ...sample, wallThk: 200, wallThkFront: 100 };
  const back = roundTrip(data);
  assert.equal(back.wallThk, 200);
  assert.equal(back.wallThkFront, 100, '앞벽 두께가 옆벽 두께를 따라갔다');
});

test('직접 고친 모델은 스냅샷을 그대로 싣는다', () => {
  const edited = { ...structuredClone(MP012F), maxPower: 150 };
  const slim = slimShareRecord(makeRecord('X', { ...sample, selectedModel: edited }), MODELS);
  assert.equal(slim.d.selectedModel.maxPower, 150);
  const custom = { ...structuredClone(MP012F), id: 'mabc12', name: '내 모델' };
  const slim2 = slimShareRecord(makeRecord('X', { ...sample, selectedId: 'mabc12', selectedModel: custom }), MODELS);
  assert.equal(slim2.d.selectedModel.name, '내 모델');
});

test('형식이 아니면 빈 목록', () => {
  for (const bad of [null, 1, {}, { a: 'x', d: {} }, { a: 'svt' }]) assert.deepEqual(unslimShareRecord(bad), []);
});

test('실제 압축(deflate-raw)을 거친 링크가 예전 형식보다 훨씬 짧고 다시 풀린다', async () => {
  const rec = makeRecord('MP012F_10X4', sample);
  const oldLen = Buffer.from(JSON.stringify(exportBundle([rec]))).toString('base64url').length;
  const json = JSON.stringify(slimShareRecord(rec, MODELS));
  const comp = new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  const newLen = Buffer.from(comp).toString('base64url').length;
  assert.ok(newLen < oldLen * 0.35, `짧아지지 않았다: ${oldLen} → ${newLen}`);
  const text = await new Response(new Blob([comp]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  assert.equal(unslimShareRecord(JSON.parse(text))[0].data.manCols, 10);
});

test('화면 배선: 짧은 형식으로 만들고, 받을 때는 두 형식을 다 읽는다', () => {
  assert.match(appSrc, /'#s=' \+ await deflateToB64url\(JSON\.stringify\(slimShareRecord\(safe\[0\], MODELS\)\)\)/);
  assert.match(appSrc, /'#share=' \+ b64urlEncode\(/, '옛 브라우저용 예전 형식이 없다');
  assert.match(appSrc, /\/\[#&\]s=\(\[\^&\]\+\)\//);
  assert.match(appSrc, /\/\[#&\]share=\(\[\^&\]\+\)\//);
  assert.match(appSrc, /unslimShareRecord\(JSON\.parse\(await inflateFromB64url/);
});
