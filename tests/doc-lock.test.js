// doc-lock.test.js — 제안서 잠금(비밀번호)과 제품 자료실 연결 (DEC-163, 2026-10-04).
//
// 이 검사는 실제 비밀번호를 모른다(저장소에 적지 않기 때문이다). 그래서 두 겹으로 본다.
//   ① 잠금 방식 자체 — 임의의 시험용 비밀번호로 잠그고 풀어 본다(맞으면 원본 그대로, 틀리면 실패).
//   ② 올린 파일 — 제안서는 전부 잠긴 파일이고 원본 PDF 가 아니다. 매뉴얼은 전부 평범한 PDF 다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { LOCK_MAGIC, isLocked, lockBytes, unlockBytes, WrongPasswordError } from '../src/doc-lock.js';
import { PRODUCT_DOCS, SIGNAGE_DOCS, DOC_LIBRARY, DOCS_DIR, docsFor, isLockedDoc } from '../src/product-docs.js';
import { SIGNAGE_MODELS } from '../src/signage-data.js';

const file = rel => new URL(`../src/${rel}`, import.meta.url);
const bytes = rel => new Uint8Array(readFileSync(file(rel)));
const head = (b, n) => String.fromCharCode(...b.slice(0, n));
const appSrc = readFileSync(file('app.js'), 'utf8');

test('잠금 방식 — 같은 비밀번호로만 원본 그대로 풀리고, 틀리거나 손대면 실패한다', async () => {
  const plain = new TextEncoder().encode('%PDF-1.7 시험용 내용 '.repeat(50));
  const locked = await lockBytes(plain, 'test-only-pw', { iterations: 1000 });
  assert.equal(head(locked, 8), LOCK_MAGIC);
  assert.ok(isLocked(locked));
  assert.notEqual(head(locked, 4), '%PDF', '잠근 파일 앞에 PDF 표식이 그대로 보인다');
  assert.deepEqual(await unlockBytes(locked, 'test-only-pw'), plain);
  await assert.rejects(unlockBytes(locked, 'wrong-pw'), WrongPasswordError);
  const bad = locked.slice(); bad[bad.length - 5] ^= 1;               // 한 바이트만 바꿔도
  await assert.rejects(unlockBytes(bad, 'test-only-pw'), WrongPasswordError);
  // 같은 내용을 두 번 잠가도 결과가 다르다(salt·iv 가 매번 새로 생긴다).
  const again = await lockBytes(plain, 'test-only-pw', { iterations: 1000 });
  assert.notDeepEqual(again.slice(12, 40), locked.slice(12, 40));
  await assert.rejects(lockBytes(plain, ''), /비밀번호가 비어 있습니다/);
  assert.equal(isLocked(plain), false);
});

test('올린 파일 — 제안서는 잠긴 파일만, 매뉴얼은 평범한 PDF 다', () => {
  const proposals = DOC_LIBRARY.filter(x => x.doc.kind === 'proposal').map(x => x.doc);
  const manuals = DOC_LIBRARY.filter(x => x.doc.kind === 'manual').map(x => x.doc);
  assert.equal(proposals.length, 3, '제안서 3개(MPF · MMF · 스페이셜)');
  assert.equal(manuals.length, 4, '매뉴얼 4개(LED 실내용 · LCD 단독형 · QH115FX · 비디오월)');
  for (const d of proposals) {
    assert.ok(isLockedDoc(d) && d.file.endsWith('.pdf.lock'), `${d.file}: 잠긴 자료로 등록되지 않았다`);
    const b = bytes(d.file);
    assert.ok(isLocked(b), `${d.file}: 암호화 표식이 없다`);
    assert.notEqual(head(b, 4), '%PDF', `${d.file}: 원본 PDF 가 그대로 올라갔다`);
  }
  for (const d of manuals) {
    assert.ok(!isLockedDoc(d) && d.file.endsWith('.pdf'), `${d.file}: 매뉴얼이 잠겨 있다`);
    assert.equal(head(bytes(d.file), 4), '%PDF', `${d.file}: PDF 가 아니다`);
  }
  // 제안서 원본(.pdf)이 catalogs/ 에 함께 들어가 있지 않다.
  const names = readdirSync(file(DOCS_DIR));
  for (const n of names) if (/proposal/.test(n)) assert.ok(n.endsWith('.pdf.lock'), `잠그지 않은 제안서 파일: ${n}`);
  // 등록하지 않은 파일이 catalogs/ 에 남아 있지 않다(README 제외).
  const known = new Set(DOC_LIBRARY.map(x => x.doc.file.slice(DOCS_DIR.length)));
  for (const n of names) if (n !== 'README.md') assert.ok(known.has(n), `자료실에 없는 파일: ${n}`);
});

test('연결 — MPF·MMF 제안서는 사양 쪽부터, LCD 매뉴얼은 사이니지 모델 전부에 연결된다', () => {
  for (const id of ['MP008F', 'MP012F', 'MP016F']) {
    const d = docsFor(id);
    assert.equal(d.proposal.file, 'catalogs/samsung-led-mpf-proposal.pdf.lock', id);
    assert.equal(d.proposal.page, 17, `${id}: MPF 사양 쪽`);
    assert.equal(d.images.length, 4, `${id}: 사진 4장`);
    assert.equal(d.catalog, null, `${id}: 이 모델은 매뉴얼(제품가이드)에 없다`);
  }
  for (const id of ['MM009F', 'MM012F', 'MM015F']) {
    assert.equal(docsFor(id).proposal.page, 13, `${id}: MMF 사양 쪽`);
    assert.equal(docsFor(id).catalog.page, 3, `${id}: 제품가이드는 그대로`);
  }
  for (const m of SIGNAGE_MODELS) {
    const d = SIGNAGE_DOCS[m.modelCode];
    assert.ok(d && d.manual && !isLockedDoc(d.manual) && existsSync(file(d.manual.file)), `${m.modelCode}: 매뉴얼 연결 없음`);
    assert.ok(d.manual.page >= 1 && d.manual.page <= d.manual.pages, `${m.modelCode}: 쪽 번호가 자료 밖`);
  }
  for (const code of Object.keys(SIGNAGE_DOCS)) assert.ok(SIGNAGE_MODELS.some(m => m.modelCode === code), `${code}: 없는 사이니지 모델`);
  for (const [id, d] of Object.entries(PRODUCT_DOCS)) for (const k of ['catalog', 'datasheet']) if (d[k]) assert.ok(!isLockedDoc(d[k]), `${id}.${k}: 매뉴얼 칸에 잠긴 자료`);
});

test('화면 — 비밀번호는 저장하지 않고, 잠긴 자료는 풀기 전에는 주소를 내주지 않는다', () => {
  const fn = name => { const i = appSrc.indexOf(`function ${name}(`); assert.ok(i >= 0, name); return appSrc.slice(i, appSrc.indexOf('\n}', i)); };
  const unlock = fn('unlockDoc');
  assert.match(unlock, /unlockBytes\(/);
  assert.doesNotMatch(unlock, /Storage|cookie/, '비밀번호를 브라우저 저장소에 남긴다');
  assert.doesNotMatch(appSrc.slice(appSrc.indexOf('let docPassword'), appSrc.indexOf('function renderModelList(')), /localStorage|sessionStorage|document\.cookie/);
  // 잠긴 자료는 풀어 둔 blob: 주소가 없으면 null — 암호 파일 주소를 그대로 iframe·다운로드에 넣지 않는다.
  assert.match(fn('docHref'), /if \(!isLockedDoc\(d\)\) return docViewUrl\(d\);\s*const u = docBlobUrls\.get\(d\.file\); if \(!u\) return null;/);
  assert.match(appSrc, /const docDownloadHref = d => \(!d \? null : isLockedDoc\(d\) \? \(docBlobUrls\.get\(d\.file\) \|\| null\) : d\.file\);/);
  // 팝업과 자료실 모두 같은 보기 함수(docViewerHtml)를 쓴다.
  assert.match(fn('renderProductInfo'), /docViewerHtml\(cur\[2\]/);
  assert.match(fn('renderDocLibrary'), /docViewerHtml\(view/);
  assert.match(appSrc, /mountSignageDocsButton\(\);/);
});
