// model-recommend.test.js — PHASE 12-a 모델 · 픽셀 피치 추천 엔진 계약(DEC-197).
//   오너 정책: K = 2.5 · ovd_m 미사용 · 역할 기준 가장 가까운 시청자 · 맞춤 하한 70% · S-Box → 캐비닛 → 맞춤 → 굵은 피치
//   · 면적 손실 30% 경고 · 강당 범위 밖 · 안전 후보 없으면 고르지 않음 · V1 요청 크기는 읽기만.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  recommendModel, nearestViewerMm, nearViewSafe, isAvailableModel, isAcceptableFit, isFitLossWarning,
  NEAR_VIEW_K, PREMIUM_NEAR_VIEW_K, FIT_FLOOR, FIT_LOSS_WARN, SALE_PITCH_MIN, SALE_PITCH_MAX, V2_SCOPE,
  STATUS, REASON, WARNING, REJECT,
} from '../src/model-recommend.js';
import { recommendLedSize, farthestViewerMm } from '../src/led-recommend.js';
import { layoutRoom } from '../src/room-presets.js';
import { frameClearanceMm } from '../src/engine.js';
import { MODELS } from '../src/models.js';
import { CAPTURE_CASES } from '../qa/capture-cases.js';

const SRC = readFileSync(new URL('../src/model-recommend.js', import.meta.url), 'utf8');
const APP = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const byId = id => MODELS.find(m => m.id === id);
const CLR = frameClearanceMm(byId('MP012F').series);   // V1 동결 기준값과 같은 여백(MP012F)

/** 기준 컷 하나 — 화면과 같은 길로 V1 요청 크기를 구하고 V2 를 부른다. */
function canonical(id, catalog = MODELS) {
  const c = CAPTURE_CASES.find(x => x.id === id);
  const lay = layoutRoom(c.roomType, c.options, { W: c.widthMm, D: c.depthMm, ledBottom: c.ledBaseMm, design: c.design });
  const hall = /^hall_/.test(c.roomType);
  const far = hall ? lay.placed.firstRowZ + (lay.placed.rows - 1) * lay.placed.pitchZ : farthestViewerMm(lay);
  const v1 = recommendLedSize({ roomTypeId: c.roomType, designId: c.design,
    room: { W: c.widthMm, H: c.heightMm, D: c.depthMm, ledBottom: c.ledBaseMm }, farViewerMm: far, frameClearanceMm: CLR });
  const near = nearestViewerMm(lay, c.roomType);
  const input = { roomTypeId: c.roomType, nearestViewerMm: near, farthestViewerMm: far,
    requested: { w: v1.w, h: v1.h }, room: { W: c.widthMm, H: c.heightMm, ledBottom: c.ledBaseMm }, catalog };
  return { c, v1, near, input, r: recommendModel(input) };
}
const ids = r => r.ranked.map(x => x.modelId);
const room = { W: 14000, H: 3800, ledBottom: 1000 };
const run = (catalog, o = {}) => recommendModel({ roomTypeId: 'meeting', nearestViewerMm: 4100, requested: { w: 4200, h: 2400 }, room, catalog, ...o });
/** 실제 모델을 바탕으로 한 시험용 모델(다른 값은 그대로). */
const clone = (id, patch) => ({ ...structuredClone(byId(id)), ...patch });

// ── 정책 상수 ─────────────────────────────────────────────────────────────
test('정책 상수 — K 2.5 · 보수 기준 1분각 · 하한 70% · 경고 30% · 범위', () => {
  assert.equal(NEAR_VIEW_K, 2.5);
  assert.ok(Math.abs(PREMIUM_NEAR_VIEW_K - 3.4377) < 1e-4);
  assert.equal(FIT_FLOOR, 0.70);
  assert.equal(FIT_LOSS_WARN, 0.30);
  assert.deepEqual([...V2_SCOPE].sort(), ['classroom', 'control', 'ideation', 'meeting']);
  // 판매 범위는 화면(app.js)의 기본 목록 규칙과 같다.
  assert.match(APP, new RegExp(`const MIN_PITCH = ${SALE_PITCH_MIN};`));
  assert.match(APP, new RegExp(`const MAX_PITCH = ${SALE_PITCH_MAX};`));
});

// ── 기준 공간 ─────────────────────────────────────────────────────────────
test('대기업 회의실 — 유효한 추천(IF015R-M 4×4)', () => {
  const { r, near } = canonical('corporate-interior');
  assert.equal(near, 4100);
  assert.equal(r.status, STATUS.RECOMMENDED);
  const t = r.recommended;
  assert.equal(t.modelId, 'IF015RM');
  assert.deepEqual([t.cols, t.rows, Math.round(t.actualW), Math.round(t.actualH), t.resW, t.resH, t.sbox, t.cabinets], [4, 4, 3840, 2160, 2560, 1440, 1, 16]);
  assert.ok(Math.abs(t.fitEfficiency - 0.902) < 0.001);
  assert.deepEqual(ids(r), ['IF015RM', 'IE015AE', 'MM015FS']);
  assert.ok(r.reasons.includes(REASON.NEAR_VIEW_SAFE) && r.reasons.includes(REASON.BEST_FIT) && r.reasons.includes(REASON.LOW_SYSTEM_COMPLEXITY));
  assert.deepEqual(r.warnings, []);
});

test('임원 회의실 — 기하가 같으면 격(prestige) 가중 없이 같은 결과', () => {
  const a = canonical('corporate-interior').r, b = canonical('executive-interior').r;
  assert.equal(a.nearestViewerMm, b.nearestViewerMm);
  assert.deepEqual(b.requested, a.requested);
  assert.deepEqual(b.recommended, a.recommended);
  assert.deepEqual(b.ranked, a.ranked);
  assert.doesNotMatch(SRC, /executive|prestige|premiumWeight/i, '격 가중 코드가 있다');
});

test('대회의실 — 실제 크기 · 해상도 · 복잡도를 함께 돌려준다', () => {
  const { r } = canonical('largeconf-interior');
  assert.equal(r.status, STATUS.RECOMMENDED);
  assert.deepEqual(r.requested, { w: 4200, h: 2400 });
  const t = r.recommended;
  assert.equal(t.modelId, 'IF015RM');
  assert.deepEqual([t.cols, t.rows, Math.round(t.actualW), Math.round(t.actualH), t.resW, t.resH, t.sbox, t.cabinets], [4, 4, 3840, 2160, 2560, 1440, 1, 16]);
  assert.ok(Math.abs(t.fitEfficiency - 0.823) < 0.001);
  assert.deepEqual(ids(r), ['IF015RM', 'IE015AE', 'MP012F']);
});

test('상황실 — 앞 콘솔 운영자 거리(4,050mm) 기준', () => {
  const { r, near } = canonical('control-interior');
  assert.equal(near, 4050);
  assert.equal(r.status, STATUS.RECOMMENDED);
  const t = r.recommended;
  assert.equal(t.modelId, 'MP012F');
  assert.deepEqual([t.cols, t.rows, Math.round(t.actualW), Math.round(t.actualH), t.resW, t.resH, t.sbox, t.cabinets], [5, 5, 4032, 2268, 3200, 1800, 1, 25]);
  assert.deepEqual(ids(r), ['MP012F', 'MM015FS', 'MM012FS']);
  assert.ok(!r.warnings.includes(WARNING.FIT_LOSS_WARNING), '29.4% 손실은 경고 대상이 아니다');
});

test('교육장 — 강사석이 아니라 첫 학생 줄(3,325mm) 기준', () => {
  const { r, near, c } = canonical('training-interior');
  const lay = layoutRoom(c.roomType, c.options, { W: c.widthMm, D: c.depthMm, ledBottom: c.ledBaseMm, design: c.design });
  const minAny = Math.min(...lay.items.filter(i => ['chair', 'seat', 'stool', 'lounge'].includes(i.type)).map(i => i.z));
  assert.ok(minAny < 1000, '강사석이 있어야 이 검사가 의미 있다');
  assert.equal(near, 3325);
  assert.equal(r.status, STATUS.RECOMMENDED);
  assert.equal(r.recommended.modelId, 'MM012FS');
  assert.deepEqual(ids(r), ['MM012FS', 'MM009F', 'MP012F']);
});

test('아이디에이션 — NO_SAFE_CANDIDATE(억지로 고르지 않는다)', () => {
  const { r, near } = canonical('ideation-interior');
  assert.ok(near > 1100 && near < 1200);
  assert.equal(r.status, STATUS.NO_SAFE_CANDIDATE);
  assert.equal(r.recommended, null);
  assert.deepEqual(r.ranked, []);
  assert.deepEqual(r.reasons, [REASON.NO_SAFE_CANDIDATE]);
  assert.ok(r.rejected.some(x => x.reason === REJECT.NEAR_VIEW_UNSAFE));
});

test('강당 셋 — OUT_OF_V2_INITIAL_SCOPE', () => {
  for (const id of ['hall-s-interior', 'hall-m-interior', 'hall-l-interior']) {
    const { r } = canonical(id);
    assert.equal(r.status, STATUS.OUT_OF_V2_INITIAL_SCOPE, id);
    assert.equal(r.recommended, null);
    assert.deepEqual(r.ranked, []);
    assert.deepEqual(r.reasons, [REASON.OUT_OF_SCOPE]);
  }
  for (const t of ['hall_s', 'hall_m', 'hall_l', 'unknown', undefined]) assert.equal(run(MODELS, { roomTypeId: t }).status, STATUS.OUT_OF_V2_INITIAL_SCOPE, String(t));
});

// ── K 경계 ────────────────────────────────────────────────────────────────
test('K 경계 — 거리 · 피치 바로 통과 / 바로 실패', () => {
  // 피치 1.5 → 3,750mm 가 경계다.
  assert.equal(nearViewSafe(3750, 1.5), true);
  assert.equal(nearViewSafe(3749.99, 1.5), false);
  assert.equal(nearViewSafe(4100, 1.64), true);       // 1.64 × 2.5 = 4.1 m
  assert.equal(nearViewSafe(4100, 1.6401), false);
  // 엔진을 거쳐도 같다(모델 하나짜리 카탈로그).
  const one = [byId('IF015RM')];
  assert.equal(run(one, { nearestViewerMm: 3750 }).status, STATUS.RECOMMENDED);
  const fail = run(one, { nearestViewerMm: 3749 });
  assert.equal(fail.status, STATUS.NO_SAFE_CANDIDATE);
  assert.deepEqual(fail.rejected, [{ modelId: 'IF015RM', reason: REJECT.NEAR_VIEW_UNSAFE }]);
  // 피치 경계(가까운 시청자 4,100mm): 1.64 는 통과, 1.6401 은 실패.
  assert.equal(run([clone('IF015RM', { id: 'P164', pitch: 1.64 })]).status, STATUS.RECOMMENDED);
  assert.equal(run([clone('IF015RM', { id: 'P164x', pitch: 1.6401 })]).status, STATUS.NO_SAFE_CANDIDATE);
  // 보수 기준(3.44)은 설명용 — 결과를 바꾸지 않고 표시만 한다.
  const r = run([byId('IF015RM')], { nearestViewerMm: 4100 });
  assert.equal(r.status, STATUS.RECOMMENDED);
  assert.equal(r.recommended.premiumNearView, false);
  assert.ok(!r.reasons.includes(REASON.PREMIUM_NEAR_VIEW));
  assert.ok(Math.abs(r.pitchBand.maxPitch - 1.64) < 1e-9);
  assert.ok(Math.abs(r.pitchBand.premiumMaxPitch - 4100 / PREMIUM_NEAR_VIEW_K / 1000) < 1e-9);
});

test('계약 — 모델의 ovd_m 은 추천 판단에 쓰지 않는다', () => {
  assert.doesNotMatch(SRC.replace(/^\s*\/\/.*$/gm, ''), /ovd/i, '코드에 ovd 가 있다');
  const base = canonical('corporate-interior').r;
  for (const v of [99, 0.1, null, undefined]) {
    const cat = MODELS.map(m => ({ ...m, ovd_m: v }));
    for (const id of ['corporate-interior', 'control-interior', 'training-interior', 'ideation-interior']) {
      const a = canonical(id).r, b = canonical(id, cat).r;
      assert.deepEqual(b, a, `${id} · ovd_m=${v}`);
    }
  }
  assert.ok(base.recommended);
});

// ── 순위 규칙 ──────────────────────────────────────────────────────────────
test('맞춤 하한 — 경계(70%)와 하한 미만 후보는 뒤로', () => {
  assert.equal(isAcceptableFit(0.70), true);
  assert.equal(isAcceptableFit(0.6999999), false);
  // 4000×2300: MP012F 4×4(63.6%, 캐비닛 16) < 하한 · MM012F-S 6×6(79.2%, 캐비닛 36) — 캐비닛이 많아도 하한을 넘는 쪽이 먼저.
  const r = run([byId('MP012F'), byId('MM012FS')], { requested: { w: 4000, h: 2300 } });
  assert.deepEqual(ids(r), ['MM012FS', 'MP012F']);
  assert.equal(r.ranked[1].acceptableFit, 0);
  // 하한을 넘는 후보가 하나도 없으면 고르되 경고한다.
  const low = run([byId('MP012F')], { requested: { w: 4000, h: 2300 } });
  assert.equal(low.status, STATUS.RECOMMENDED);
  assert.ok(low.warnings.includes(WARNING.FIT_BELOW_FLOOR));
  assert.ok(low.warnings.includes(WARNING.FIT_LOSS_WARNING));   // 손실 36.4%
});

test('면적 손실 경고 — 경계 30%', () => {
  assert.equal(isFitLossWarning(0.70), true);
  assert.equal(isFitLossWarning(0.7000001), false);
  assert.equal(isFitLossWarning(0.636), true);
});

test('S-Box 가 캐비닛 · 맞춤보다 먼저 — 대회의실 MP008F(S-Box 4) vs MM009F(S-Box 1)', () => {
  const r = run([byId('MP008F'), byId('MM009F')]);
  assert.deepEqual(r.ranked.map(x => [x.modelId, x.sbox]), [['MM009F', 1], ['MP008F', 4]]);
  assert.ok(r.reasons.includes(REASON.LOW_SYSTEM_COMPLEXITY));
  assert.ok(!r.reasons.includes(REASON.BEST_FIT), 'MP008F 가 더 크게 맞는다');
});

test('캐비닛 수가 맞춤보다 먼저 — 대회의실 IF015R-M(16장, 82%) vs MP012F(25장, 91%)', () => {
  const r = run([byId('MP012F'), byId('IF015RM')]);
  assert.deepEqual(ids(r), ['IF015RM', 'MP012F']);
});

test('복잡도가 같으면 맞춤 효율 — 같은 25장 · S-Box 1', () => {
  // 'AA1' 은 캐비닛이 조금 작아 효율이 낮다. id 순서였다면 AA1 이 먼저 온다.
  const small = clone('MP012F', { id: 'AA1', cabW: 780, cabH: 438.75 });
  const r = run([small, byId('MP012F')]);
  assert.equal(r.ranked[0].cabinets, r.ranked[1].cabinets);
  assert.equal(r.ranked[0].sbox, r.ranked[1].sbox);
  assert.deepEqual(ids(r), ['MP012F', 'AA1']);
});

test('마지막은 굵은 피치 — 같은 캐비닛 · 같은 효율이면 불필요하게 촘촘한 피치를 고르지 않는다', () => {
  const fine = clone('IF015RM', { id: 'AA2', pitch: 1.26 });
  const r = run([fine, byId('IF015RM')]);
  assert.deepEqual(ids(r), ['IF015RM', 'AA2']);
});

// ── 필수 조건 · 탈락 이유 ─────────────────────────────────────────────────
test('필수 조건 — 탈락 이유를 돌려준다', () => {
  const r = run([byId('IF015R'), byId('IF020R'), byId('MP016F'), { id: 'X' }, byId('IF015RM')]);
  const why = Object.fromEntries(r.rejected.map(x => [x.modelId, x.reason]));
  assert.equal(why.IF015R, REJECT.NOT_AVAILABLE);      // 단종
  assert.equal(why.IF020R, REJECT.NOT_AVAILABLE);      // 판매 범위 밖(P2.0)
  assert.equal(why.MP016F, REJECT.NEAR_VIEW_UNSAFE);   // 1.68 × 2.5 = 4.2 m > 4.1 m
  assert.equal(why.X, REJECT.NOT_LED_PRODUCT);
  assert.deepEqual(ids(r), ['IF015RM']);
  // 배열이 성립하지 않음 · 벽을 넘음
  assert.equal(run([byId('IF015RM')], { requested: { w: 500, h: 300 } }).rejected[0].reason, REJECT.NO_ARRAY);
  assert.equal(run([byId('IF015RM')], { room: { W: 3800, H: 3800, ledBottom: 1000 } }).rejected[0].reason, REJECT.EXCEEDS_WALL);
  assert.equal(run([byId('IF015RM')], { room: { W: 14000, H: 3000, ledBottom: 1000 } }).rejected[0].reason, REJECT.EXCEEDS_WALL);
  assert.equal(isAvailableModel(byId('MM012F')), false);
  assert.equal(isAvailableModel(byId('MM012FS')), true);
});

test('가장 가까운 시청자 — 역할 기준(교육장 · 상황실은 LED 를 향한 자리만)', () => {
  const items = [{ type: 'chair', z: 300, rotY: 180 }, { type: 'chair', z: 3300, rotY: 0 }, { type: 'table', z: 100 }];
  assert.equal(nearestViewerMm({ items }, 'classroom'), 3300);
  assert.equal(nearestViewerMm({ items }, 'control'), 3300);
  assert.equal(nearestViewerMm({ items }, 'meeting'), 300);    // 테이블 앞쪽 참석자는 등지고 앉아도 사용자다
  assert.equal(nearestViewerMm({ items: [{ type: 'lounge', z: 1160, rotY: 210 }] }, 'ideation'), 1160);
  assert.equal(nearestViewerMm({ items: [{ type: 'chair', z: 2000 }] }, 'classroom'), 2000);   // 방향을 모르면 뺀다고 가정하지 않는다
  assert.equal(nearestViewerMm({ items: [] }, 'meeting'), 0);
  assert.equal(nearestViewerMm(null, 'meeting'), 0);
  const r = run(MODELS, { nearestViewerMm: 0 });
  assert.equal(r.status, STATUS.NO_SAFE_CANDIDATE);
  assert.deepEqual(r.reasons, [REASON.NO_NEAREST_VIEWER, REASON.NO_SAFE_CANDIDATE]);
});

// ── 크기 · 모델 · 저장 독립 ──────────────────────────────────────────────
test('V1 요청 크기 · 카탈로그 · 입력을 바꾸지 않는다(얼린 입력으로 호출)', () => {
  const deepFreeze = o => { Object.values(o).forEach(v => v && typeof v === 'object' && deepFreeze(v)); return Object.freeze(o); };
  for (const id of ['corporate-interior', 'control-interior', 'training-interior']) {
    const { input, v1 } = canonical(id);
    const before = JSON.stringify(input);
    const frozen = deepFreeze(structuredClone(input));
    const r = recommendModel(frozen);
    assert.equal(JSON.stringify(frozen), before);
    assert.deepEqual(r.requested, { w: v1.w, h: v1.h });
    assert.notEqual(r.requested, frozen.requested, '요청 크기 객체를 그대로 돌려주면 바깥에서 고칠 수 있다');
    // 추천 모델이 무엇이든 요청 크기는 V1 값 그대로다.
    for (const m of ['IF015RM', 'MP012F', 'MM012FS']) assert.deepEqual(recommendModel({ ...input, catalog: [byId(m)] }).requested, { w: v1.w, h: v1.h });
  }
  // 화면 상태 · 저장소 · 선택 모델에 손대지 않는다(DOM 없음 · 저장 없음).
  assert.doesNotMatch(SRC, /localStorage|sessionStorage|document\.|window\.|selectedId|ledSizeMode|ledW\s*=|ledH\s*=/);
  assert.doesNotMatch(SRC, /from '\.\/(app|config|led-recommend)\.js/);
});

// ── 결정성 ────────────────────────────────────────────────────────────────
test('결정성 — 1,000회 반복과 카탈로그 순서 섞기', () => {
  for (const id of ['corporate-interior', 'largeconf-interior', 'control-interior', 'training-interior']) {
    const { input } = canonical(id);
    const first = JSON.stringify(recommendModel(input));
    for (let i = 0; i < 1000; i++) assert.equal(JSON.stringify(recommendModel(input)), first, `${id} #${i}`);
    // 고정 씨앗으로 50가지 순서를 섞는다 — 결과(탈락 목록 순서 제외)가 같아야 한다.
    let seed = 20261116;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const pick = r => JSON.stringify({ ...r, rejected: [...r.rejected].sort((a, b) => String(a.modelId).localeCompare(String(b.modelId))) });
    const ref = pick(recommendModel(input));
    for (let k = 0; k < 50; k++) {
      const cat = [...MODELS];
      for (let i = cat.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cat[i], cat[j]] = [cat[j], cat[i]]; }
      assert.equal(pick(recommendModel({ ...input, catalog: cat })), ref, `${id} 섞기 #${k}`);
    }
  }
  // 완전히 같은 두 후보(IF015R-M · IE015A-E)는 검증된 데이터가 먼저다.
  assert.deepEqual(ids(run([byId('IE015AE'), byId('IF015RM')])), ['IF015RM', 'IE015AE']);
});

test('UI 없음 — 이번 단계는 화면에 연결하지 않는다', () => {
  assert.doesNotMatch(APP, /model-recommend/);
});
