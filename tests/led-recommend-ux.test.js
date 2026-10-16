// led-recommend-ux.test.js — PHASE 11-d 권장 크기 화면과 '자동으로 되돌리기' 계약.
//   핵심: '자동으로 되돌리기'(자동값)와 '권장 크기 적용'(권장값 · 직접 입력)은 서로 다른 일이다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recommendLedSize, farthestViewerMm, recommendationUiState, recommendationCapNote,
  LED_MODE_LABEL } from '../src/led-recommend.js';
import { autoLedRequest, restoreLedSizeMode, LED_REQUEST_DEFAULT } from '../src/led-request.js';
import { layoutRoom, auditoriumLedSize } from '../src/room-presets.js';
import { normalizeConfig } from '../src/config.js';
import { CAPTURE_CASES } from '../qa/capture-cases.js';

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
function listener(id, evt) {
  const key = `$('#${id}')?.addEventListener('${evt}', () => {`;
  const i = appSrc.indexOf(key);
  assert.ok(i >= 0, `${id} 의 ${evt} 처리기가 없다`);
  let depth = 0;
  for (let k = appSrc.indexOf('{', i + key.length - 1); k < appSrc.length; k++) {
    if (appSrc[k] === '{') depth++;
    else if (appSrc[k] === '}' && --depth === 0) return appSrc.slice(i, k + 1);
  }
  throw new Error(`${id} 처리기 본문을 못 찾았다`);
}

/** 화면과 같은 길로 자동값(자동으로 되돌리기의 목적지)과 권장값을 구한다. */
function canonical(id) {
  const c = CAPTURE_CASES.find(x => x.id === id);
  const lay = layoutRoom(c.roomType, c.options, { W: c.widthMm, D: c.depthMm, ledBottom: c.ledBaseMm, design: c.design });
  const lastRowZ = Number(lay?.placed?.firstRowZ) > 0 ? lay.placed.firstRowZ + (lay.placed.rows - 1) * lay.placed.pitchZ : 0;
  const hall = auditoriumLedSize(c.roomType, { W: c.widthMm, H: c.heightMm, D: c.depthMm, ledBottom: c.ledBaseMm, lastRowZ });
  const auto = autoLedRequest(hall);
  const rec = recommendLedSize({ roomTypeId: c.roomType, designId: c.design,
    room: { W: c.widthMm, H: c.heightMm, D: c.depthMm, ledBottom: c.ledBaseMm },
    farViewerMm: /^hall_/.test(c.roomType) ? lastRowZ : farthestViewerMm(lay), frameClearanceMm: 50 });
  return { auto, rec };
}

const REC = (o = {}) => ({ w: 4200, h: 2400, basis: 'presence', capped: [], readability: { farViewerMm: 6900 }, ...o });

// ── A. 자동으로 되돌리기 ──────────────────────────────────────────────────────
test('A. 자동으로 되돌리기 — 자동 상태로 바꾸고 자동값으로 채운 뒤 다시 그리고 저장한다', () => {
  assert.match(listener('ledRestoreAuto', 'click'), /resetLedSizeToAuto\(\)/);
  const reset = body('resetLedSizeToAuto');
  assert.match(reset, /ledSizeAuto = true/);
  assert.match(reset, /applyAutoLedSize\(\)/);
  assert.match(reset, /renderAll\(\)/);                 // renderAll 이 saveLastSession 으로 저장한다
  assert.match(body('renderAll'), /saveLastSession\(\)/);
  assert.match(body('gatherConfig'), /ledSizeMode:\s*ledSizeAuto \? 'auto' : 'manual'/);
  // 되돌린 뒤 저장한 구성은 새로 고쳐도 자동이다.
  const saved = normalizeConfig({ ledW: 4000, ledH: 2300, ledSizeMode: 'auto', roomType: 'meeting' });
  assert.equal(restoreLedSizeMode(saved, { w: 4000, h: 2300 }), 'auto');
});

// ── B. 권장 크기 적용 ────────────────────────────────────────────────────────
test('B. 권장 크기 적용 — 권장값을 넣고 직접 입력이 되며, 저장값도 직접 입력이다', () => {
  const apply = listener('ledRecApply', 'click');
  assert.match(apply, /wEl\.value = rec\.w; hEl\.value = rec\.h;/);
  assert.match(apply, /ledSizeAuto = false;/);
  assert.doesNotMatch(apply, /resetLedSizeToAuto|ledSizeAuto = true/);
  const saved = normalizeConfig({ ledW: 4200, ledH: 2400, ledSizeMode: 'manual', roomType: 'meeting' });
  assert.equal(restoreLedSizeMode(saved, { w: 4000, h: 2300 }), 'manual');
  assert.deepEqual([saved.ledW, saved.ledH], [4200, 2400]);
});

// ── C. 되돌리기 ≠ 권장 ───────────────────────────────────────────────────────
test('C. 자동으로 되돌리기는 권장값이 아니라 자동값으로 간다(대회의실 · 상황실)', () => {
  const lc = canonical('largeconf-interior');
  assert.deepEqual({ w: lc.rec.w, h: lc.rec.h }, { w: 4200, h: 2400 });
  assert.deepEqual(lc.auto, { w: 4000, h: 2300 });
  const cr = canonical('control-interior');
  assert.deepEqual({ w: cr.rec.w, h: cr.rec.h }, { w: 4800, h: 2700 });
  assert.deepEqual(cr.auto, { w: 4000, h: 2300 });
  assert.deepEqual(cr.auto, { ...LED_REQUEST_DEFAULT });
  // 되돌리기 경로는 권장 계산을 쓰지 않는다.
  assert.doesNotMatch(listener('ledRestoreAuto', 'click'), /recommendLedSize|currentLedRecommendation|rec\.w|ledRecApply/, '되돌리기 버튼이 권장값에 손댄다');
  for (const fn of ['resetLedSizeToAuto', 'applyAutoLedSize', 'autoLedTarget']) {
    assert.doesNotMatch(body(fn), /recommendLedSize|currentLedRecommendation/, `${fn} 이 권장값을 쓴다`);
  }
  // 강당은 자동값과 권장값이 같은 규칙이다(기존 강당 규칙).
  const hl = canonical('hall-l-interior');
  assert.deepEqual(hl.auto, { w: 7100, h: 4000 });
  assert.deepEqual({ w: hl.rec.w, h: hl.rec.h }, hl.auto);
});

// ── D. 버튼 상태 네 칸 ───────────────────────────────────────────────────────
test('D. 버튼 상태 — 자동/직접 입력 × 권장과 같음/다름', () => {
  const rec = REC();
  const A = recommendationUiState({ mode: 'auto', current: { w: 4200, h: 2400 }, rec });
  assert.deepEqual([A.modeLabel, A.same, A.applyEnabled, A.applyText, A.restoreEnabled], ['자동', true, false, '현재 권장값 사용 중', false]);
  const B = recommendationUiState({ mode: 'auto', current: { w: 4000, h: 2300 }, rec });
  assert.deepEqual([B.modeLabel, B.same, B.applyEnabled, B.applyText, B.restoreEnabled], ['자동', false, true, '권장 크기 적용', false]);
  const C = recommendationUiState({ mode: 'manual', current: { w: 4200, h: 2400 }, rec });
  assert.deepEqual([C.modeLabel, C.same, C.applyEnabled, C.applyText, C.restoreEnabled], ['직접 입력', true, false, '권장값 적용됨', true]);
  const D = recommendationUiState({ mode: 'manual', current: { w: 5000, h: 2300 }, rec });
  assert.deepEqual([D.modeLabel, D.same, D.applyEnabled, D.applyText, D.restoreEnabled], ['직접 입력', false, true, '권장 크기 적용', true]);
  assert.deepEqual({ ...LED_MODE_LABEL }, { auto: '자동', manual: '직접 입력' });
  // 권장값이 없으면 두 버튼 모두 적용할 대상이 없다(자동 상태 기준).
  const N = recommendationUiState({ mode: 'auto', current: { w: 4000, h: 2300 }, rec: null });
  assert.equal(N.applyEnabled, false);
  assert.equal(N.restoreEnabled, false);
  // 화면이 이 규칙을 그대로 쓴다.
  const r = body('renderLedRecommendation');
  assert.match(r, /recommendationUiState\(/);
  assert.match(r, /btn\.disabled = !ui\.applyEnabled/);
  assert.match(r, /restore\.disabled = !ui\.restoreEnabled/);
});

// ── D-2. '같음' 판정 계약표(PHASE 11-d.1) ───────────────────────────────────
//   폭과 높이가 **둘 다 정확히** 같을 때만 권장값과 같다. 현재값이 권장값보다 큰 경우도 '다름'이다.
test('D-2. 같음 판정 — 폭·높이가 모두 정확히 같을 때만 같다(현재값이 더 커도 다름)', () => {
  const rec = REC();   // 4,200 × 2,400 (대회의실 권장값)
  const table = [
    { name: '같음',      current: { w: 4200, h: 2400 }, same: true },
    { name: '폭이 큼',    current: { w: 4400, h: 2400 }, same: false },
    { name: '높이가 큼',  current: { w: 4200, h: 2500 }, same: false },
    { name: '둘 다 큼',   current: { w: 4400, h: 2500 }, same: false },
  ];
  for (const row of table) {
    const ui = recommendationUiState({ mode: 'manual', current: row.current, rec });
    assert.equal(ui.same, row.same, `${row.name}: same`);
    assert.deepEqual([ui.modeLabel, ui.applyEnabled, ui.applyText, ui.restoreEnabled],
      row.same ? ['직접 입력', false, '권장값 적용됨', true] : ['직접 입력', true, '권장 크기 적용', true], `${row.name}: 버튼`);
    // 자동 상태에서도 같은 판정을 쓴다.
    assert.equal(recommendationUiState({ mode: 'auto', current: row.current, rec }).same, row.same, `${row.name}: same(자동)`);
  }
});

// ── E. 표시만으로는 바뀌지 않는다 ────────────────────────────────────────────
test('E. 권장 상자를 그리는 것만으로 현재 입력과 상태가 바뀌지 않는다', () => {
  const b = body('renderLedRecommendation');
  assert.doesNotMatch(b, /\.value\s*=[^=]/);
  assert.doesNotMatch(b, /ledSizeAuto\s*=[^=]/);
  const input = { mode: 'auto', current: { w: 4000, h: 2300 }, rec: REC({ capped: ['ceiling'] }), actualH: 2268 };
  const snap = JSON.stringify(input);
  recommendationUiState(input);
  assert.equal(JSON.stringify(input), snap);
  assert.deepEqual(recommendationUiState(input), recommendationUiState(input));
});

// ── F. 가독성 경고 ───────────────────────────────────────────────────────────
test('F. 가독성 경고 — 물리 한계에 걸린 채 가장 먼 자리가 6배를 넘을 때만', () => {
  const far = { readability: { farViewerMm: 18850 } };
  const on = recommendationUiState({ mode: 'auto', current: { w: 4000, h: 2300 }, rec: REC({ capped: ['ceiling'], ...far }), actualH: 2268 });
  assert.equal(on.warn, true);
  assert.equal(on.readability.status, 'below');
  // 6배 이하면 숨긴다.
  assert.equal(recommendationUiState({ mode: 'auto', current: {}, rec: REC({ capped: ['ceiling'], readability: { farViewerMm: 12850 } }), actualH: 2268 }).warn, false);
  // 물리 한계에 걸리지 않았으면 숨긴다.
  assert.equal(recommendationUiState({ mode: 'auto', current: {}, rec: REC({ capped: [], ...far }), actualH: 2268 }).warn, false);
  // 강당·하한은 이번 범위 밖이다.
  assert.equal(recommendationUiState({ mode: 'auto', current: {}, rec: REC({ basis: 'auditorium', capped: ['ceiling'], ...far }), actualH: 2268 }).warn, false);
  assert.equal(recommendationUiState({ mode: 'auto', current: {}, rec: REC({ basis: 'default-floor', capped: ['ceiling'], ...far }), actualH: 2268 }).warn, false);
  // 화면은 경고를 글자로 보인다(색만으로 전하지 않는다).
  assert.match(body('renderLedRecommendation'), /warnEl\.hidden = !ui\.warn/);
  assert.match(body('renderLedRecommendation'), /권장 가독성 기준/);
});

// ── G. 물리 한계 이유 ────────────────────────────────────────────────────────
test('G. 물리 한계 이유 — 벽 폭 · 천장 높이를 짧은 말로', () => {
  assert.equal(recommendationCapNote(REC({ capped: ['width'] })), '벽 폭(좌우 여유 포함)에 맞춰 줄인 값입니다');
  assert.equal(recommendationCapNote(REC({ capped: ['ceiling'] })), '천장 높이(하단 높이 포함)에 맞춰 줄인 값입니다');
  assert.equal(recommendationCapNote(REC({ capped: ['width', 'ceiling'] })), '벽 폭과 천장 높이에 맞춰 줄인 값입니다');
  assert.equal(recommendationCapNote(REC({ capped: [] })), '');
  assert.equal(recommendationCapNote(REC({ basis: 'default-floor', capped: ['ceiling'] })), '');
  assert.equal(recommendationCapNote(REC({ basis: 'auditorium', capped: ['ceiling'] })), '');
  assert.equal(recommendationCapNote(null), '');
  // 실제 계산 결과와 이어진다: 18 m 대회의실은 천장 한계에 걸린다.
  const r = recommendLedSize({ roomTypeId: 'meeting', room: { W: 18000, H: 3800, D: 10000, ledBottom: 1000 }, farViewerMm: 6900, frameClearanceMm: 50 });
  assert.equal(recommendationCapNote(r), '천장 높이(하단 높이 포함)에 맞춰 줄인 값입니다');
});

// ── H. 저장 · 마크업 ─────────────────────────────────────────────────────────
test('H. 적용·되돌리기 결과가 저장값으로 남고, 버튼은 실제 button 이다', () => {
  for (const mode of ['auto', 'manual']) {
    assert.equal(normalizeConfig({ ledW: 4200, ledH: 2400, ledSizeMode: mode }).ledSizeMode, mode);
  }
  for (const id of ['ledRestoreAuto', 'ledRecApply']) {
    assert.match(html, new RegExp(`<button type="button" class="tiny" id="${id}" disabled>`), `${id} 가 button 이 아니다`);
  }
  for (const id of ['ledRec', 'ledRecCurrent', 'ledModeTag', 'ledRecSize', 'ledRecNote', 'ledRecWarn']) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} 가 없다`);
  }
  assert.match(html, /자동으로 되돌리기/);
  // 세 값의 이름이 화면에 다르게 적힌다: 현재 입력 · 권장 크기 · 실제 설치.
  assert.match(html, /현재 입력/);
  assert.match(html, /권장 크기/);
  assert.match(body('renderLedRecommendation'), /실제 설치/);
  assert.match(body('renderLedRecommendation'), /권장 적용 시/);
});
