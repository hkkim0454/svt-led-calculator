// led-recommend.test.js — PHASE 11-c Recommendation V1 계약.
//   권장 크기는 **제안**이다. 계산 규칙(led-recommend.js)과 화면 배선(app.js)을 함께 못박는다.
//   기준 방은 Frozen 회귀 컷(qa/capture-cases.js)의 방·옵션 그대로이고, 실제 크기는 엔진으로 잰다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recommendLedSize, farthestViewerMm, ledReadability, RECOMMEND_PARAMS,
  RECOMMEND_SIDE_MARGIN, RECOMMEND_TOP_CLEAR, READABILITY_LIMIT } from '../src/led-recommend.js';
import { layoutRoom, auditoriumLedSize } from '../src/room-presets.js';
import { computeConfig, frameClearanceMm } from '../src/engine.js';
import { MODELS } from '../src/models.js';
import { normalizeConfig } from '../src/config.js';
import { restoreLedSizeMode } from '../src/led-request.js';
import { CAPTURE_CASES } from '../qa/capture-cases.js';

const MP012F = MODELS.find(m => m.id === 'MP012F');
const CLR = frameClearanceMm(MP012F.series);
const appSrc = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

/** 컷 하나의 방으로 권장값과 MP012F 실제 크기를 구한다(화면과 같은 길). */
function canonical(id) {
  const c = CAPTURE_CASES.find(x => x.id === id);
  const lay = layoutRoom(c.roomType, c.options, { W: c.widthMm, D: c.depthMm, ledBottom: c.ledBaseMm, design: c.design });
  const isHall = /^hall_/.test(c.roomType);
  const far = isHall ? lay.placed.firstRowZ + (lay.placed.rows - 1) * lay.placed.pitchZ : farthestViewerMm(lay);
  const rec = recommendLedSize({ roomTypeId: c.roomType, designId: c.design,
    room: { W: c.widthMm, H: c.heightMm, D: c.depthMm, ledBottom: c.ledBaseMm }, farViewerMm: far, frameClearanceMm: CLR });
  const fit = computeConfig(MP012F, c.widthMm, c.heightMm, { mode: 'ledsize', ledW: rec.w, ledH: rec.h, baseHeight: c.ledBaseMm });
  return { c, far, rec, fit };
}

/** 본문 잘라 오기 — 함수 / 이벤트 처리기. */
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

const room = (o = {}) => ({ roomTypeId: 'meeting', room: { W: 14000, H: 3800, D: 10000, ledBottom: 1000, ...o.room },
  farViewerMm: o.far ?? 6900, frameClearanceMm: o.clr ?? 50, ...(o.type ? { roomTypeId: o.type } : {}) });

// ── A. 기준 방 여섯 곳 ─────────────────────────────────────────────────────────
test('A. 기준 방 여섯 곳의 권장값과 MP012F 실제 크기', () => {
  const 기대 = [
    ['corporate-interior', 4000, 2300, 3226, 1814, '4×4', 'default-floor'],
    ['executive-interior', 4000, 2300, 3226, 1814, '4×4', 'default-floor'],
    ['largeconf-interior', 4200, 2400, 4032, 2268, '5×5', 'presence'],
    ['control-interior', 4800, 2700, 4032, 2268, '5×5', 'presence'],
    ['training-interior', 4000, 2300, 3226, 1814, '4×4', 'default-floor'],
    ['ideation-interior', 4000, 2300, 3226, 1814, '4×4', 'default-floor'],
  ];
  for (const [id, w, h, aw, ah, grid, basis] of 기대) {
    const { rec, fit } = canonical(id);
    assert.deepEqual([rec.w, rec.h], [w, h], `${id} 권장값`);
    assert.deepEqual([Math.round(fit.actualW), Math.round(fit.actualH)], [aw, ah], `${id} 실제 크기`);
    assert.equal(`${fit.cols}×${fit.rows}`, grid, `${id} 배열`);
    assert.equal(rec.basis, basis, `${id} 근거`);
    assert.equal(rec.readability.status, 'ok', `${id} 가독성`);
  }
  // 대회의실·상황실의 가장 먼 시청 자리(배치 결과).
  assert.equal(canonical('largeconf-interior').far, 6900);
  assert.equal(canonical('control-interior').far, 12850);
});

// ── B. 강당은 기존 규칙 그대로 ──────────────────────────────────────────────────
test('B. 강당 셋은 auditoriumLedSize 결과와 같고 기준값이 바뀌지 않는다', () => {
  const 기대 = { 'hall-s-interior': [4000, 2300], 'hall-m-interior': [5200, 3000], 'hall-l-interior': [7100, 4000] };
  for (const [id, [w, h]] of Object.entries(기대)) {
    const { c, far, rec } = canonical(id);
    assert.deepEqual([rec.w, rec.h], [w, h], id);
    assert.equal(rec.basis, 'auditorium');
    const old = auditoriumLedSize(c.roomType, { W: c.widthMm, H: c.heightMm, D: c.depthMm, ledBottom: c.ledBaseMm, lastRowZ: far });
    assert.deepEqual({ w: rec.w, h: rec.h }, old, `${id} 이 기존 강당 규칙과 다르다`);
  }
});

// ── C. 결정성 · 부수효과 없음 ──────────────────────────────────────────────────
test('C. 같은 입력이면 같은 출력이고 입력을 바꾸지 않는다', () => {
  const input = room();
  const snap = JSON.stringify(input);
  const a = recommendLedSize(input), b = recommendLedSize(input);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(input), snap, '입력 객체가 바뀌었다');
  assert.ok(Object.isFrozen(RECOMMEND_PARAMS));
  for (const k of ['meeting', 'control', 'classroom', 'ideation']) {
    assert.deepEqual({ ...RECOMMEND_PARAMS[k] }, { ratio: 0.30, bdm: 5 }, `${k} 계수(V1 은 넷 다 같다)`);
  }
  assert.equal(recommendLedSize({ roomTypeId: 'unknown', room: { W: 10000, H: 3000 } }), null);
  assert.equal(recommendLedSize({ roomTypeId: 'meeting', room: { W: 0, H: 3000 } }), null);
});

// ── D. 가로 ──────────────────────────────────────────────────────────────────
test('D. 벽 폭이 늘면 권장값이 줄지 않는다(용도 넷)', () => {
  for (const type of Object.keys(RECOMMEND_PARAMS)) {
    let prev = null;
    for (let W = 6000; W <= 30000; W += 500) {
      const r = recommendLedSize(room({ type, room: { W } }));
      if (prev) assert.ok(r.w >= prev.w && r.h >= prev.h, `${type} W=${W}: ${prev.w}×${prev.h} → ${r.w}×${r.h}`);
      prev = r;
    }
  }
  // 폭 한계에 걸리는 방: 쓸 수 있는 폭을 넘지 않고, 걸렸다고 알린다.
  assert.equal(RECOMMEND_SIDE_MARGIN, 800);
  assert.equal(RECOMMEND_TOP_CLEAR, 300);
  const r = recommendLedSize(room({ room: { W: 7000, H: 6000 }, far: 20000 }));
  assert.ok(r.capped.includes('width'));
  assert.deepEqual([r.w, r.h], [5500, 3100]);   // 7,000 − 1,600 + 100 = 5,500 → 높이 3,094 → 3,100
  // 100 mm 반올림이 한계를 넘지 않는다(쓸 수 있는 폭 5,480 → 5,500 이 아니라 5,400).
  const r2 = recommendLedSize(room({ room: { W: 6980, H: 6000 }, far: 20000 }));
  assert.equal(r2.w, 5400);
});

// ── E. 깊이(가장 먼 시청자) ─────────────────────────────────────────────────────
test('E. 가장 먼 시청자가 멀어지면 권장값이 줄지 않고, 가독성 근거로 바뀐다', () => {
  let prev = null;
  for (let far = 0; far <= 30000; far += 250) {
    const r = recommendLedSize(room({ type: 'control', room: { W: 12000, H: 6000 }, far }));
    if (prev) assert.ok(r.h >= prev.h && r.w >= prev.w, `far=${far}`);
    prev = r;
  }
  const near = recommendLedSize(room({ room: { W: 14000, H: 6000 }, far: 6900 }));
  const deep = recommendLedSize(room({ room: { W: 14000, H: 6000 }, far: 16000 }));
  assert.equal(near.basis, 'presence');
  assert.equal(deep.basis, 'readability');
  assert.equal(deep.ideal.h, 3200);   // 16,000 ÷ 5
});

// ── F. 천장 ──────────────────────────────────────────────────────────────────
test('F. 천장이 낮아지면 쓸 수 있는 높이를 넘지 않고, 실제 화면도 위쪽 여유를 지킨다', () => {
  for (let H = 2400; H <= 6000; H += 100) {
    const r = recommendLedSize(room({ type: 'control', room: { W: 16000, H }, far: 12850 }));
    if (r.basis === 'default-floor') { assert.deepEqual([r.w, r.h], [4000, 2300]); continue; }
    assert.ok(r.h <= H - 1000 - RECOMMEND_TOP_CLEAR + 2 * CLR, `H=${H}: ${r.h}`);
    const fit = computeConfig(MP012F, 16000, H, { mode: 'ledsize', ledW: r.w, ledH: r.h, baseHeight: 1000 });
    assert.ok(1000 + fit.actualH <= H - RECOMMEND_TOP_CLEAR, `H=${H}: 실제 위 끝 ${1000 + fit.actualH}`);
  }
  // 천장 3.6m 대회의실 — 구조틀 여백을 반영하므로 실제로 들어가는 5×5 를 놓치지 않는다.
  const r36 = recommendLedSize(room({ room: { H: 3600 } }));
  const f36 = computeConfig(MP012F, 14000, 3600, { mode: 'ledsize', ledW: r36.w, ledH: r36.h, baseHeight: 1000 });
  assert.equal(`${f36.cols}×${f36.rows}`, '5×5');
  // 16:9 를 지킨다(100 mm 반올림 오차 안).
  const r = recommendLedSize(room({ room: { W: 30000, H: 4200 }, far: 20000 }));
  assert.ok(r.capped.includes('ceiling'));
  assert.ok(Math.abs(r.w / r.h - 16 / 9) < 0.05, `${r.w}×${r.h}`);
});

// ── G. 하단 높이 ─────────────────────────────────────────────────────────────
test('G. 하단 높이가 오르면 쓸 수 있는 높이가 줄고, 하단 높이 자체는 그대로다', () => {
  let prev = null;
  for (let base = 0; base <= 2000; base += 100) {
    const input = room({ type: 'control', room: { W: 16000, H: 3900, ledBottom: base }, far: 12850 });
    const r = recommendLedSize(input);
    assert.equal(input.room.ledBottom, base, '하단 높이를 바꿨다');
    if (prev) assert.ok(r.h <= prev.h || r.basis === 'default-floor', `base=${base}`);
    if (r.basis !== 'default-floor') assert.ok(r.h <= 3900 - base - RECOMMEND_TOP_CLEAR + 100);
    prev = r;
  }
  assert.doesNotMatch(body('renderLedRecommendation'), /#baseHeight'\)\.value\s*=/);
  assert.doesNotMatch(listener('ledRecApply', 'click'), /baseHeight/);
});

// ── H. 하한 ──────────────────────────────────────────────────────────────────
test('H. 강당이 아닌 용도의 권장값은 4,000×2,300 아래로 내려가지 않는다', () => {
  for (const type of Object.keys(RECOMMEND_PARAMS)) {
    for (const W of [1000, 3000, 5000, 8000, 12000, 20000]) {
      for (const H of [2000, 2600, 3000, 3600, 5000]) {
        for (const far of [0, 2000, 8000, 20000]) {
          const r = recommendLedSize(room({ type, room: { W, H }, far }));
          assert.ok(r.w >= 4000 && r.h >= 2300, `${type} ${W}×${H} far ${far}: ${r.w}×${r.h}`);
        }
      }
    }
  }
});

// ── 가독성 정보 ───────────────────────────────────────────────────────────────
test('가독성 — 가장 먼 자리 ÷ 실제 화면 높이가 6을 넘으면 below', () => {
  assert.equal(READABILITY_LIMIT, 6);
  assert.deepEqual(ledReadability(12850, 2268), { farViewerMm: 12850, threshold: 6, ratio: 12850 / 2268, status: 'ok' });
  assert.equal(ledReadability(18850, 2268).status, 'below');
  assert.equal(ledReadability(2268 * 6, 2268).status, 'ok');        // 딱 6배는 통과
  assert.equal(ledReadability(2268 * 6.5, 2268).status, 'below');   // 6.5배는 경고
  assert.equal(ledReadability(0, 2268).status, 'unknown');
  // 상황실을 20m 로 깊게 하면 천장 때문에 더 키울 수 없다 — 경고 정보가 나온다.
  const r = recommendLedSize(room({ type: 'control', room: { W: 16000, H: 3900 }, far: 18850 }));
  const fit = computeConfig(MP012F, 16000, 3900, { mode: 'ledsize', ledW: r.w, ledH: r.h, baseHeight: 1000 });
  assert.ok(r.capped.includes('ceiling'));
  assert.equal(ledReadability(r.readability.farViewerMm, fit.actualH).status, 'below');
});

test('가장 먼 시청 자리 — 의자·객석·스툴·라운지만 센다', () => {
  assert.equal(farthestViewerMm(null), 0);
  assert.equal(farthestViewerMm({ items: [{ type: 'table', z: 9000 }, { type: 'chair', z: 5000 }, { type: 'lounge', z: 6000 }] }), 6000);
});

// ── I. 적용 버튼 ─────────────────────────────────────────────────────────────
test('I. 권장 크기 적용 — 칸에 넣고 직접(manual) 상태로, 기존 흐름으로 다시 그리고 저장한다', () => {
  const apply = listener('ledRecApply', 'click');
  assert.match(apply, /currentLedRecommendation\(\)/);
  assert.match(apply, /wEl\.value = rec\.w; hEl\.value = rec\.h;/);
  assert.match(apply, /ledSizeAuto = false;/);
  assert.match(apply, /renderAll\(\)/);   // renderAll 이 saveLastSession 으로 저장한다
  assert.match(body('renderAll'), /saveLastSession\(\)/);
  // 저장 → 다시 열기: 직접 상태와 값이 그대로다.
  const saved = normalizeConfig({ ledW: 4200, ledH: 2400, ledSizeMode: 'manual', roomType: 'meeting' });
  assert.equal(saved.ledSizeMode, 'manual');
  assert.deepEqual([saved.ledW, saved.ledH], [4200, 2400]);
  assert.equal(restoreLedSizeMode(saved, { w: 4000, h: 2300 }), 'manual');
});

// ── J. 계산만으로는 입력이 바뀌지 않는다 ──────────────────────────────────────
test('J. 권장 크기를 그리는 경로는 ② 칸과 상태를 바꾸지 않는다', () => {
  for (const fn of ['renderLedRecommendation', 'currentLedRecommendation', 'ledLayoutInfo']) {
    const b = body(fn);
    assert.doesNotMatch(b, /\.value\s*=[^=]/, `${fn} 이 입력값을 바꾼다`);
    assert.doesNotMatch(b, /ledSizeAuto\s*=[^=]/, `${fn} 이 상태를 바꾼다`);
  }
  // 자동 상태의 값은 여전히 autoLedRequest(강당 권장값 또는 기본값)다 — 권장 크기를 끌어 쓰지 않는다.
  assert.doesNotMatch(body('autoLedTarget'), /recommendLedSize|currentLedRecommendation/);
  assert.match(body('renderAll'), /renderLedRecommendation\(\)/);
  // 강당은 배치의 마지막 줄 위치(자동값과 같은 값)를 넘긴다.
  assert.match(body('currentLedRecommendation'), /isHall \? lastRowZ : farViewerMm/);
  assert.match(body('currentLedRecommendation'), /const isHall = \/\^hall_\/\.test\(roomTypeId\)/);
  // 깊이·용도 옵션만 바꿀 때는 renderPreview 만 돈다 — 그때도 권장 줄이 새로 고쳐져야 한다.
  assert.match(body('renderPreview'), /renderLedRecommendation\(\)/);
});
