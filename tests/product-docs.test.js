// product-docs.test.js — 제품 정보 팝업(ⓘ)의 자료 목록 · 스펙 표 회귀 테스트 (DEC-159, 2026-10-03).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { MODELS } from '../src/models.js';
import { PRODUCT_DOCS, docsFor, docViewUrl, ledSpecRows, DATA_STATUS_TEXT, DOCS_DIR } from '../src/product-docs.js';

const src = f => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const onDisk = rel => existsSync(new URL(`../src/${rel}`, import.meta.url));

test('자료 목록 — 등록한 제품은 실재하고, 파일은 catalogs/ 의 실제 PDF, 공식 주소는 https 다', () => {
  const ids = new Set(MODELS.map(m => m.id));
  for (const [id, d] of Object.entries(PRODUCT_DOCS)) {
    assert.ok(ids.has(id), `${id}: models.js 에 없는 제품`);
    for (const key of ['catalog', 'datasheet']) {
      const doc = d[key]; if (!doc) continue;
      assert.ok(doc.file.startsWith(DOCS_DIR) && doc.file.endsWith('.pdf'), `${id}.${key}: catalogs/…pdf 가 아니다`);
      assert.ok(onDisk(doc.file), `${id}.${key}: 파일이 없다 (${doc.file})`);
    }
    if (d.officialUrl) assert.match(d.officialUrl, /^https:\/\//, `${id}: 공식 주소가 https 가 아니다`);
    for (const im of d.images || []) assert.ok(onDisk(im.file), `${id}: 사진 파일이 없다 (${im.file})`);
  }
  // 공개 사이트다 — 가격·견적 정보를 자료 목록에 두지 않는다(CLAUDE.md 규칙 5).
  assert.equal(/price|cost|sell|견적|단가/i.test(src('product-docs.js').replace(/가격표·견적·계약·내부 문서는 올리지 않는다/g, '')), false);
});

test('docsFor — 등록이 없으면 빈 묶음, docViewUrl 은 그 쪽부터 연다', () => {
  assert.deepEqual({ ...docsFor('없는제품') }, { catalog: null, datasheet: null, officialUrl: null, images: [] });
  assert.equal(docViewUrl(null), null);
  assert.equal(docViewUrl({ file: 'catalogs/a.pdf' }), 'catalogs/a.pdf');
  assert.equal(docViewUrl({ file: 'catalogs/a.pdf', page: 3 }), 'catalogs/a.pdf#page=3');
});

test('스펙 표 — models.js 값을 그대로 쓰고, 없는 값은 지어내지 않고 — 로 둔다', () => {
  const mp = ledSpecRows(MODELS.find(m => m.id === 'MP012F'));
  const kv = Object.fromEntries([...mp.kpi, ...mp.rows].map(x => [x.k, x.v]));
  assert.equal(kv['픽셀 피치'], '1.26mm');
  assert.equal(kv['캐비닛 해상도'], '640×360');
  assert.equal(kv['무게'], '9.2kg');
  assert.equal(kv['소비전력 (최대 / 평균)'], '146 / 77 W');
  assert.equal(kv['캐비닛 크기 (W×H×D)'], '806.4 × 453.6 × 49.4 mm');
  assert.equal(kv['부품 코드'], 'LH012MPFAAA');
  const blank = ledSpecRows({ id: 'X', pitch: 1.5, cabW: 600, cabH: 337.5, weight: null, maxPower: null, typicalPower: null,
    brightnessPeak: null, brightnessReduced: null });
  const bv = Object.fromEntries([...blank.kpi, ...blank.rows].map(x => [x.k, x.v]));
  assert.equal(bv['무게'], '—'); assert.equal(bv['소비전력 (최대 / 평균)'], '—');
  assert.equal(bv['밝기 (최대 / 보정)'], '—'); assert.equal(bv['부품 코드'], '—');
  // 모든 등록 모델의 검증 상태를 사람이 읽는 말로 설명할 수 있다.
  for (const m of MODELS) assert.ok(DATA_STATUS_TEXT[m.dataStatus], `${m.id}: 설명 없는 dataStatus ${m.dataStatus}`);
});

test('화면 — 모델 줄의 ⓘ 는 선택(계산)을 바꾸지 않고 정보 팝업만 연다', () => {
  const app = src('app.js');
  assert.match(app, /class="infoBtn" data-act="info" data-id="\$\{m\.id\}"/);
  assert.match(app, /if \(act === 'info'\) return openProductInfo\(id\);/);
  // 지금 구성 요약은 engine 을 그대로 부른다(새 공식 없음).
  assert.match(app, /function renderProductInfo[\s\S]{0,1500}computeConfig\(m, spaceWmm\(\), spaceHmm\(\), opts\(\)\)/);
  assert.ok(existsSync(new URL('../src/catalogs/README.md', import.meta.url)));
});
