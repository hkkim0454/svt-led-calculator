// model-recommend-ui.test.js — PHASE 12-c 'LED 모델 추천' 카드(제안 전용) 계약(DEC-200).
//   (1) 화면 문구(model-recommend-view.js)는 엔진 결과만 옮긴다 — 상태 넷 · 같음/다름 · 경고 · 이유.
//   (2) 화면 연결(app.js)은 읽기만 한다 — selectedId · ② 칸 · ledSizeAuto · 하단 높이 · 방 치수 · 저장값을 바꾸지 않는다.
//   (3) 다시 그리는 길목이 모든 관련 변경을 지난다(방 · 치수 · 옵션 · 모델 · ② 칸 · V1 적용 · 되돌리기).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { modelRecommendationView, MODEL_REC_STATE, REASON_TEXT, pitchLabel } from '../src/model-recommend-view.js';
import { recommendModel, nearestViewerMm, REASON } from '../src/model-recommend.js';
import { recommendLedSize, farthestViewerMm } from '../src/led-recommend.js';
import { layoutRoom } from '../src/room-presets.js';
import { MODELS } from '../src/models.js';
import { CAPTURE_CASES } from '../qa/capture-cases.js';

const APP = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const HTML = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const VIEW = readFileSync(new URL('../src/model-recommend-view.js', import.meta.url), 'utf8')
  .replace(/^\s*\/\/.*$/gm, '').replace(/\/\*\*[\s\S]*?\*\//g, '');   // 주석을 뺀 코드만 본다
const byId = id => MODELS.find(m => m.id === id);

function body(name) {
  const i = APP.indexOf(`function ${name}(`);
  assert.ok(i >= 0, `${name} 함수가 없다`);
  let depth = 0;
  for (let k = APP.indexOf('{', i); k < APP.length; k++) {
    if (APP[k] === '{') depth++;
    else if (APP[k] === '}' && --depth === 0) return APP.slice(i, k + 1);
  }
  throw new Error(`${name} 본문을 못 찾았다`);
}
/** 기준 컷 — 화면과 같은 길(V1 권장 크기를 요청으로)로 엔진을 부른다. */
function canonical(id) {
  const c = CAPTURE_CASES.find(x => x.id === id);
  const lay = layoutRoom(c.roomType, c.options, { W: c.widthMm, D: c.depthMm, ledBottom: c.ledBaseMm, design: c.design });
  const far = farthestViewerMm(lay);
  const v1 = recommendLedSize({ roomTypeId: c.roomType, designId: c.design,
    room: { W: c.widthMm, H: c.heightMm, D: c.depthMm, ledBottom: c.ledBaseMm }, farViewerMm: far, frameClearanceMm: 50 });
  return recommendModel({ roomTypeId: c.roomType, nearestViewerMm: nearestViewerMm(lay, c.roomType), farthestViewerMm: far,
    requested: { w: v1.w, h: v1.h }, room: { W: c.widthMm, H: c.heightMm, ledBottom: c.ledBaseMm }, catalog: MODELS });
}

// ── 화면 문구 ─────────────────────────────────────────────────────────────
test('RECOMMENDED — 추천 모델 · 피치 · 실제 크기 · 해상도 · 배열 · S-Box · 이유', () => {
  const v = modelRecommendationView(canonical('control-interior'), byId('IF015RM'));
  assert.equal(v.state, MODEL_REC_STATE.RECOMMENDED);
  assert.deepEqual(v.recommended, { id: 'MP012F', name: 'MP012F', pitch: 'P1.26', actual: '4,032 × 2,268 mm',
    resolution: '3,200 × 1,800', matrix: '5 × 5', sbox: 1, cabinets: 25 });
  assert.deepEqual(v.current, { id: 'IF015RM', name: 'IF015R-M' });
  assert.equal(v.same, false);
  assert.equal(v.sameText, '');
  assert.deepEqual(v.reasons, [REASON_TEXT.NEAR_VIEW_SAFE, REASON_TEXT.LOW_SYSTEM_COMPLEXITY]);
  assert.deepEqual(v.warnings, []);
  assert.equal(v.requested, '4,800 × 2,700 mm');
  // 해상도는 숫자만 — FHD · QHD · 4K 같은 이름을 붙이지 않는다.
  assert.doesNotMatch(VIEW, /FHD|QHD|UHD|4K|Full ?HD/);
});

test('현재 모델과 추천이 같을 때 · 다를 때 — 두 개념을 늘 따로 보인다', () => {
  const r = canonical('corporate-interior');
  const same = modelRecommendationView(r, byId('IF015RM'));
  assert.equal(same.same, true);
  assert.equal(same.sameText, '현재 선택 모델이 추천 모델과 같습니다.');
  assert.equal(same.current.id, 'IF015RM');
  assert.equal(same.recommended.id, 'IF015RM');
  const diff = modelRecommendationView(r, byId('MP012F'));
  assert.equal(diff.same, false);
  assert.equal(diff.current.name, 'MP012F');
  assert.equal(diff.recommended.name, 'IF015R-M');
  // 현재 모델을 모르면 같다고 하지 않는다.
  assert.equal(modelRecommendationView(r, null).same, false);
  assert.equal(modelRecommendationView(r, null).current, null);
});

test('NO_SAFE_CANDIDATE — 모델을 보이지 않고 이유를 말한다(차선 · 가까운 모델 없음)', () => {
  const r = canonical('ideation-interior');
  const v = modelRecommendationView(r, byId('IF015RM'));
  assert.equal(v.state, MODEL_REC_STATE.NO_SAFE);
  assert.equal(v.recommended, null);
  assert.equal(v.same, false);
  assert.equal(v.message, '현재 시청 거리 조건을 만족하는 추천 모델이 없습니다.');
  assert.match(v.detail, /가장 가까운 시청 거리 1\.2m 기준에서 현재 카탈로그 모델이 조건을 충족하지 않습니다/);
  assert.doesNotMatch(VIEW, /차선|가장 가까운 모델|대신 추천/);
  // 시청 자리가 없을 때는 그 이유를 말한다.
  const nv = modelRecommendationView({ status: 'NO_SAFE_CANDIDATE', reasons: [REASON.NO_NEAREST_VIEWER, REASON.NO_SAFE_CANDIDATE], nearestViewerMm: 0 }, null);
  assert.equal(nv.detail, '시청 자리가 없어 가장 가까운 시청 거리를 알 수 없습니다.');
});

test('OUT_OF_V2_INITIAL_SCOPE(강당)와 UNSUPPORTED_ROOM_TYPE 을 다른 상태 · 다른 말로', () => {
  for (const id of ['hall-s-interior', 'hall-m-interior', 'hall-l-interior']) {
    const v = modelRecommendationView(canonical(id), byId('MP012F'));
    assert.equal(v.state, MODEL_REC_STATE.OUT_OF_SCOPE, id);
    assert.equal(v.message, '강당의 모델 · 픽셀 피치 추천은 현재 지원 범위에 포함되지 않습니다.');
    assert.match(v.detail, /권장 크기는 그대로/);   // 오류처럼 보이지 않게, V1 은 계속 쓸 수 있다고 알린다
    assert.equal(v.recommended, null);
  }
  const u = modelRecommendationView(recommendModel({ roomTypeId: 'meetng' }), byId('MP012F'));
  assert.equal(u.state, MODEL_REC_STATE.UNSUPPORTED);
  assert.equal(u.message, '이 공간 유형에서는 모델 추천을 사용할 수 없습니다.');
  assert.notEqual(MODEL_REC_STATE.UNSUPPORTED, MODEL_REC_STATE.OUT_OF_SCOPE);
  // 결과가 아예 없어도 깨지지 않는다.
  assert.equal(modelRecommendationView(null, null).state, MODEL_REC_STATE.NO_SAFE);
});

test('FIT_LOSS_WARNING — 요청 크기와 예상 실제 크기를 함께 보인다', () => {
  const r = recommendModel({ roomTypeId: 'meeting', nearestViewerMm: 4100, requested: { w: 4000, h: 2300 },
    room: { W: 14000, H: 3800, ledBottom: 1000 }, catalog: [byId('MP012F')] });
  assert.ok(r.warnings.includes('FIT_LOSS_WARNING'));
  const v = modelRecommendationView(r, byId('MP012F'));
  // 엔진이 낸 순서 그대로 옮긴다.
  assert.deepEqual(r.warnings, ['FIT_BELOW_FLOOR', 'FIT_LOSS_WARNING']);
  assert.deepEqual(v.warnings, ['요청 크기에 70% 이상 맞는 후보가 없습니다.',
    '추천 모델 적용 시 요청 크기(4,000 × 2,300 mm)보다 실제 설치 크기(3,226 × 1,814 mm)가 작아질 수 있습니다.']);
  // 경고가 있어도 추천은 엔진 결과 그대로다.
  assert.equal(v.recommended.id, 'MP012F');
});

test('이유는 엔진이 낸 코드만 옮긴다(새 근거를 지어내지 않는다)', () => {
  assert.deepEqual(Object.keys(REASON_TEXT).sort(), ['BEST_FIT', 'LOW_SYSTEM_COMPLEXITY', 'NEAR_VIEW_SAFE', 'PREMIUM_NEAR_VIEW']);
  const v = modelRecommendationView({ status: 'RECOMMENDED', recommended: { modelId: 'X', pitch: 1.5, actualW: 1, actualH: 1, resW: 1, resH: 1, cols: 1, rows: 1, sbox: 1, cabinets: 1 },
    reasons: ['NEAR_VIEW_SAFE', 'SOMETHING_NEW'], warnings: [], requested: { w: 1, h: 1 } }, null);
  assert.deepEqual(v.reasons, [REASON_TEXT.NEAR_VIEW_SAFE]);
  assert.equal(pitchLabel(1.5625), 'P1.56');
  assert.equal(pitchLabel(0.9375), 'P0.94');
  assert.equal(pitchLabel(1.5), 'P1.5');
});

// ── 화면 연결 ─────────────────────────────────────────────────────────────
test('카드는 02 모델 라이브러리 안의 별도 칸 — ② 권장 크기 상자와 다른 카드', () => {
  assert.match(HTML, /<div class="modelRec" id="modelRec" role="region" aria-label="LED 모델 추천" aria-live="polite" hidden><\/div>/);
  const card02 = HTML.indexOf('data-step="02"'), rec = HTML.indexOf('id="modelRec"'), list = HTML.indexOf('id="modelList"'), v1 = HTML.indexOf('id="ledRec"');
  assert.ok(card02 > 0 && rec > card02 && rec < list, '02 카드 안 모델 목록 위에 있어야 한다');
  assert.ok(v1 < card02, 'V1 상자(01 카드)와 섞였다');
  // 적용 버튼은 이번 단계에 없다.
  const fn = body('renderModelRecommendation');
  assert.doesNotMatch(fn, /<button/);
  assert.doesNotMatch(HTML.slice(rec, HTML.indexOf('</div>', rec)), /<button/);
});

test('그리는 경로는 읽기만 한다 — selectedId · ② 칸 · 상태 · 하단 높이 · 치수 · 저장값 불변', () => {
  for (const fn of ['renderModelRecommendation', 'currentModelRecommendation', 'modelRecLayoutInfo']) {
    const b = body(fn);
    assert.doesNotMatch(b, /selectedId\s*=[^=]/, `${fn} 이 selectedId 를 바꾼다`);
    assert.doesNotMatch(b, /\.value\s*=[^=]/, `${fn} 이 입력값을 바꾼다`);
    assert.doesNotMatch(b, /ledSizeAuto\s*=[^=]/, `${fn} 이 크기 상태를 바꾼다`);
    assert.doesNotMatch(b, /roomOpts\s*=[^=]|roomTypeId\s*=[^=]|designId\s*=[^=]|models\s*=[^=]/, `${fn} 이 방 상태를 바꾼다`);
    assert.doesNotMatch(b, /saveLastSession|localStorage|renderAll\(|applyConfig\(|applyAutoLedSize\(|resetLedSizeToAuto\(/, `${fn} 이 저장하거나 다른 상태 변경을 부른다`);
  }
  // 요청 크기는 계산과 같은 opts() 값을 읽는다(② 칸 값 · 비우면 벽면).
  assert.match(body('currentModelRecommendation'), /const o = opts\(\);\n\s*return recommendModel\(\{ roomTypeId, nearestViewerMm: near, farthestViewerMm: far,\n\s*requested: \{ w: o\.ledW, h: o\.ledH \}/);
  // 배열 직접 지정 · 사이니지에서는 계산하지 않는다.
  assert.match(body('currentModelRecommendation'), /if \(svCode \|\| mode === 'manual'\) return null;/);
  // 현재 모델은 selectedId 로 읽기만 한다.
  assert.match(body('renderModelRecommendation'), /const cur = models\.find\(x => x\.id === selectedId\) \|\| null;/);
});

test('V1 경로는 그대로 — ledLayoutInfo · 권장 상자 함수에 V2 가 끼어들지 않는다', () => {
  for (const fn of ['ledLayoutInfo', 'renderLedRecommendation', 'currentLedRecommendation', 'autoLedTarget', 'applyAutoLedSize', 'resetLedSizeToAuto']) {
    assert.doesNotMatch(body(fn), /recommendModel|modelRec|ModelRecommendation/, `${fn} 에 V2 가 섞였다`);
  }
});

test('다시 그리는 길목 — 방 · 치수 · 깊이 · 옵션 · 디자인 · 모델 · ② 칸 · V1 적용 · 되돌리기', () => {
  // renderPreview 가 V1 상자와 함께 V2 카드를 새로 고친다(깊이 · 옵션 · 디자인은 renderPreview 만 돈다).
  const rp = body('renderPreview');
  assert.ok(rp.indexOf('renderModelRecommendation()') > 0 && rp.indexOf('renderModelRecommendation()') < rp.indexOf("if (pvView === '3d')"), '3D 분기 전에 불러야 한다');
  // renderAll 은 renderPreview 를 부른다(모델 · 치수 · ② 칸 · V1 적용 · 되돌리기는 renderAll 을 지난다).
  assert.match(body('renderAll'), /renderPreview\(\);/);
  assert.match(APP, /\['ledW', 'ledH'\]\.forEach\(id => \$\('#' \+ id\)\?\.addEventListener\('input', \(\) => \{\n  ledSizeAuto = false;[^\n]*\n  clampLedInputs\(\); renderAll\(\);/);
  assert.match(APP, /\$\('#ledRecApply'\)\?\.addEventListener\('click', \(\) => \{[\s\S]{0,260}setLedMax\(\); renderAll\(\);/);
  assert.match(body('resetLedSizeToAuto'), /renderAll\(\);/);
  assert.match(APP, /if \(row\) \{ selectedId = row\.dataset\.id; svCode = null; renderAll\(\);/);
  assert.match(APP, /\$\('#spaceD'\)\?\.addEventListener\('input', \(\) => \{ if \(applyAutoLedSize\(\)\) renderAll\(\); else renderPreview\(\); \}\);/);
  // 배치 기억은 방 상태가 바뀌면 다시 계산한다 — 열쇠에 용도 · 디자인 · 옵션 · 폭 · 깊이 · 하단 높이가 다 들어 있다.
  assert.match(body('modelRecLayoutInfo'), /const key = JSON\.stringify\(\[roomTypeId, designId, roomOpts, sW, D, baseH\]\);/);
  // 요청 크기 · 현재 모델은 기억하지 않고 매번 읽는다(오래된 값이 남지 않게).
  assert.doesNotMatch(body('currentModelRecommendation'), /Memo|memo/);
});

test('카드 그리기 — 현재 · 추천 줄을 바꿔 쓰지 않고, 경고 · 이유를 빠짐없이 보인다', () => {
  const fn = body('renderModelRecommendation');
  assert.match(fn, /row\('현재 선택', esc\(v\.current \? v\.current\.name : '—'\), ' mrCurrent'\)/);
  assert.match(fn, /row\('추천', `\$\{esc\(t\.name\)\} · \$\{esc\(t\.pitch\)\}`, ' mrRec'\)/);
  assert.match(fn, /\+ v\.warnings\.map\(w => `<div class="mrWarn" role="note">⚠ \$\{esc\(w\)\}<\/div>`\)\.join\(''\);/);
  assert.match(fn, /v\.reasons\.map\(esc\)\.join\(' · '\)/);
  assert.match(fn, /\(v\.same \? `<div class="mrSame">\$\{esc\(v\.sameText\)\}<\/div>` : ''\)/);
  // 추천이 아닌 상태는 모델 대신 안내문만 보인다.
  assert.match(fn, /\} else \{\n\s*html \+= `<div class="mrMsg">\$\{esc\(v\.message\)\}<\/div>`/);
  // 화면 검사 · 자동 검증용 표시(값을 읽기만 한다).
  for (const k of ['status', 'state', 'recModel', 'current', 'same', 'warn']) assert.match(fn, new RegExp(`box\\.dataset\\.${k} = `));
});
