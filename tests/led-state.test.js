// led-state.test.js — ② LED 설치 크기의 자동/직접 상태와 벽 초과 보호 (PHASE 11-a)
// ─────────────────────────────────────────────────────────────────────────────
// PHASE 11-0 감사가 찾은 P1 두 건을 못박는다.
//   P1-① 새로 고치면 강당 자동 크기가 꺼졌다 — 상태가 저장되지 않아 되살릴 때 늘 '직접'으로 떨어졌다.
//   P1-② 강당 자동값(7,100×4,000)이 회의실로 따라갔고, 벽을 넘으면 하단 높이를 몰래 내렸다(1,000 → 20mm).
//
// app.js 는 화면(DOM)에 묶여 있어 여기서 불러올 수 없다. 그래서 두 겹으로 검사한다.
//   ① 행동 — app.js 와 **같은 규칙 함수**(led-request.js · auditoriumLedSize · normalizeConfig)로
//      저장 → 새로 고침 → 복원 → 방 바꾸기를 그대로 돌려 본다(아래 '화면' 모형).
//   ② 배선 — app.js 가 그 규칙을 **정확히 그 자리에서** 부르는지 소스를 읽어 확인한다.
//      ②가 깨지면 ①의 모형이 실제 화면과 어긋났다는 뜻이다.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LED_REQUEST_DEFAULT, LED_SIZE_MODES, autoLedRequest, restoreLedSizeMode, ledFitProblem } from '../src/led-request.js';
import { CONFIG_DEFAULTS, normalizeConfig } from '../src/config.js';
import { auditoriumLedSize, layoutRoom, defaultOptions, autoDepthForType } from '../src/room-presets.js';
import { normalizeDesign } from '../src/room-design.js';
import { computeConfig } from '../src/engine.js';
import { MODELS } from '../src/models.js';

const src = f => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const appSrc = src('app.js');
const MP012F = MODELS.find(m => m.id === 'MP012F');

/** 함수 본문(중괄호 짝까지)을 잘라 온다. */
function body(name, text = appSrc) {
  const i = text.indexOf(`function ${name}(`);
  assert.ok(i >= 0, `app.js 에 ${name} 이 없다`);
  let depth = 0, j = text.indexOf('{', i);
  for (let k = j; k < text.length; k++) {
    if (text[k] === '{') depth++;
    else if (text[k] === '}' && --depth === 0) return text.slice(i, k + 1);
  }
  throw new Error(`${name} 본문을 못 찾았다`);
}
/** 이벤트 처리기 본문 — `$('#id')?.addEventListener('evt', () => { ... });` */
function listener(id, evt) {
  const key = `$('#${id}')?.addEventListener('${evt}', () => {`;
  const i = appSrc.indexOf(key);
  assert.ok(i >= 0, `${id} 의 ${evt} 처리기가 없다`);
  let depth = 0, j = appSrc.indexOf('{', i + key.length - 1);
  for (let k = j; k < appSrc.length; k++) {
    if (appSrc[k] === '{') depth++;
    else if (appSrc[k] === '}' && --depth === 0) return appSrc.slice(i, k + 1);
  }
  throw new Error(`${id} 처리기 본문을 못 찾았다`);
}

// ── '화면' 모형 ─────────────────────────────────────────────────────────────
// app.js 의 autoLedTarget · applyAutoLedSize · gatherConfig · applyConfig 를 같은 함수로 옮긴 것이다.
//   저장소는 localStorage 처럼 문자열 하나를 들고 있고, 새로 고침은 그 문자열을 normalizeConfig 로 되살린다.
function 화면(store = { v: null }) {
  const s = { roomType: 'meeting', W: 8000, H: 3400, D: 0, base: 1000,
    ledW: LED_REQUEST_DEFAULT.w, ledH: LED_REQUEST_DEFAULT.h, auto: true,
    opts: defaultOptions('meeting'), design: normalizeDesign(null, 'meeting'), model: 'MP012F' };
  const autoTarget = () => {
    const D = s.D || autoDepthForType(s.roomType, s.W);
    const lay = layoutRoom(s.roomType, s.opts, { W: s.W, D, ledBottom: s.base, design: s.design });
    const size = auditoriumLedSize(s.roomType, { W: s.W, H: s.H, D, ledBottom: s.base,
      lastRowZ: Number(lay?.placed?.firstRowZ) > 0
        ? lay.placed.firstRowZ + (lay.placed.rows - 1) * lay.placed.pitchZ : 0 });
    return autoLedRequest(size);
  };
  const applyAuto = () => { if (!s.auto) return; const t = autoTarget(); s.ledW = t.w; s.ledH = t.h; };
  const save = () => { store.v = JSON.stringify({
    spaceW: s.W, spaceH: s.H, spaceD: s.D, roomType: s.roomType, roomOpts: s.opts, roomDesign: s.design,
    baseHeight: s.base, ledW: s.ledW, ledH: s.ledH, ledSizeMode: s.auto ? 'auto' : 'manual',
    mode: 'ledsize', selectedId: s.model }); };
  const api = {
    s, store,
    led: () => `${s.ledW}×${s.ledH}`,
    setRoomType(t) { s.roomType = t; s.opts = defaultOptions(t); s.design = normalizeDesign(s.design, t); applyAuto(); save(); return api; },
    setSize(W, H, D) { s.W = W; s.H = H; s.D = D; applyAuto(); save(); return api; },
    setDesign(d) { s.design = normalizeDesign(d, s.roomType); save(); return api; },
    setModel(id) { s.model = id; save(); return api; },
    typeLed(w, h) { s.auto = false; s.ledW = w; s.ledH = h; save(); return api; },
    resetAuto() { s.auto = true; applyAuto(); save(); return api; },
    reload() {
      const c = normalizeConfig(JSON.parse(store.v));
      Object.assign(s, { W: c.spaceW, H: c.spaceH, D: c.spaceD, roomType: c.roomType,
        opts: c.roomOpts || defaultOptions(c.roomType), design: normalizeDesign(c.roomDesign, c.roomType),
        base: c.baseHeight, ledW: c.ledW, ledH: c.ledH, model: c.selectedId || 'MP012F' });
      s.auto = restoreLedSizeMode(c, autoTarget()) === 'auto';
      save();
      return api;
    },
  };
  if (store.v == null) save();   // 첫 방문만 저장한다. 넘겨받은 저장 문자열(옛 저장값)은 덮지 않는다.
  return api;
}

// ── 기본값이 한 곳에서 어긋나지 않는다 ────────────────────────────────────────
test('기준값 — 제품 기본 요청값 4,000×2,300 이 세 곳에서 같다', () => {
  assert.deepEqual({ ...LED_REQUEST_DEFAULT }, { w: 4000, h: 2300 });
  assert.equal(CONFIG_DEFAULTS.ledW, LED_REQUEST_DEFAULT.w, 'config.js 기본값과 다르다');
  assert.equal(CONFIG_DEFAULTS.ledH, LED_REQUEST_DEFAULT.h, 'config.js 기본값과 다르다');
  const html = src('index.html');
  assert.match(html, /id="ledW" value="4000"/, 'index.html 초깃값이 바뀌었다');
  assert.match(html, /id="ledH" value="2300"/, 'index.html 초깃값이 바뀌었다');
  assert.deepEqual([...LED_SIZE_MODES], ['auto', 'manual']);
});

// ── 계약 A — 자동 상태는 새로 고쳐도 살아 있다 (P1-①) ─────────────────────────
test('계약 A — 대강당 자동 7,100×4,000 은 새로 고친 뒤에도 자동이고, 깊이를 바꾸면 다시 계산한다', () => {
  const app = 화면().setSize(24000, 8000, 28000).setRoomType('hall_l');
  assert.equal(app.led(), '7100×4000', '첫 방문 대강당 권장값');
  assert.equal(JSON.parse(app.store.v).ledSizeMode, 'auto', '상태가 저장되지 않았다');
  app.reload();
  assert.equal(app.s.auto, true, '새로 고친 뒤 자동이 꺼졌다(P1-①)');
  assert.equal(app.led(), '7100×4000', '새로 고친 뒤 값이 바뀌었다');
  app.setSize(24000, 8000, 34000);
  const 기대 = auditoriumLedSize('hall_l', { W: 24000, H: 8000, D: 34000, ledBottom: 1000,
    lastRowZ: (() => { const p = layoutRoom('hall_l', defaultOptions('hall_l'),
      { W: 24000, D: 34000, ledBottom: 1000, design: 'auditoriumLarge' }).placed;
      return p.firstRowZ + (p.rows - 1) * p.pitchZ; })() });
  assert.equal(app.led(), `${기대.w}×${기대.h}`, '깊이를 바꿨는데 다시 계산하지 않았다');
  assert.notEqual(app.led(), '7100×4000', '깊이 34m 에서도 28m 값 그대로다');
  // 두 번 새로 고쳐도 같다.
  app.reload().reload();
  assert.equal(app.s.auto, true);
  assert.equal(app.led(), `${기대.w}×${기대.h}`);
});

// ── 계약 B — 직접 넣은 값은 새로 고쳐도 직접이다 ─────────────────────────────
test('계약 B — 직접 넣은 값은 새로 고친 뒤에도 그대로이고, 방 크기를 바꿔도 지킨다', () => {
  const app = 화면().setSize(24000, 8000, 28000).setRoomType('hall_l').typeLed(6000, 3375);
  assert.equal(JSON.parse(app.store.v).ledSizeMode, 'manual');
  app.reload();
  assert.equal(app.s.auto, false, '새로 고친 뒤 자동으로 바뀌었다');
  assert.equal(app.led(), '6000×3375');
  app.setSize(18000, 6000, 20000);
  assert.equal(app.led(), '6000×3375', '방 크기를 바꾸자 직접 넣은 값이 덮였다');
  app.reload();
  assert.equal(app.led(), '6000×3375');
});

// ── 계약 C — 자동 상태에서 강당 세 크기 ─────────────────────────────────────
test('계약 C — 자동 상태로 소·중·대강당을 차례로 바꾸면 4,000×2,300 · 5,200×3,000 · 7,100×4,000', () => {
  const app = 화면();
  assert.equal(app.setSize(10000, 4000, 12000).setRoomType('hall_s').led(), '4000×2300');
  assert.equal(app.setRoomType('hall_m').setSize(18000, 6000, 20000).led(), '5200×3000');
  assert.equal(app.setRoomType('hall_l').setSize(24000, 8000, 28000).led(), '7100×4000');
  // 강당 공식 자체가 그대로인지(PHASE 9-c 값) — 이번 단계는 공식을 건드리지 않는다.
  assert.deepEqual(auditoriumLedSize('hall_s', { W: 10000, H: 4000, D: 12000, ledBottom: 1000, lastRowZ: 9700 }), { w: 4000, h: 2300 });
  assert.deepEqual(auditoriumLedSize('hall_m', { W: 18000, H: 6000, D: 20000, ledBottom: 1000, lastRowZ: 17400 }), { w: 5200, h: 3000 });
  assert.deepEqual(auditoriumLedSize('hall_l', { W: 24000, H: 8000, D: 28000, ledBottom: 1000, lastRowZ: 23700 }), { w: 7100, h: 4000 });
});

// ── 계약 D — 자동 강당 → 강당이 아닌 용도 (P1-②) ─────────────────────────────
test('계약 D — 대강당 자동값은 회의실로 따라가지 않고 제품 기본값으로 돌아간다', () => {
  const app = 화면().setSize(24000, 8000, 28000).setRoomType('hall_l');
  assert.equal(app.led(), '7100×4000');
  for (const t of ['meeting', 'classroom', 'control', 'ideation']) {
    app.setRoomType('hall_l');
    assert.equal(app.led(), '7100×4000');
    app.setRoomType(t);
    assert.equal(app.led(), '4000×2300', `${t}: 강당 값이 따라왔다(P1-②)`);
    assert.equal(app.s.auto, true, `${t}: 자동 상태가 풀렸다`);
  }
  // 방을 회의실 크기로 줄여도 그대로 제품 기본값이고, 하단 높이도 그대로다.
  app.setRoomType('meeting').setSize(14000, 3800, 10000);
  assert.equal(app.led(), '4000×2300');
  assert.equal(app.s.base, 1000, '하단 높이가 바뀌었다');
  const r = computeConfig(MP012F, 14000, 3800, { mode: 'ledsize', ledW: 4000, ledH: 2300, baseHeight: 1000 });
  assert.equal(ledFitProblem({ spaceW: 14000, spaceH: 3800, baseHeight: 1000, actualW: r.actualW, actualH: r.actualH }),
    null, '기본값이 회의실 벽에 들어가지 않는다');
  // 새로 고쳐도 기본값·자동 그대로다.
  app.reload();
  assert.equal(app.led(), '4000×2300');
  assert.equal(app.s.auto, true);
});

// ── 계약 E — 직접 넣은 값은 어떤 용도로 옮겨도 지킨다 ─────────────────────────
test('계약 E — 직접 넣은 6,000×3,375 는 용도·디자인·방 크기·모델을 바꾸고 새로 고쳐도 그대로다', () => {
  const app = 화면().setSize(24000, 8000, 28000).setRoomType('hall_l').typeLed(6000, 3375);
  const 경로 = ['meeting', 'control', 'classroom', 'ideation', 'hall_s', 'hall_m', 'hall_l', 'meeting'];
  for (const t of 경로) {
    app.setRoomType(t);
    assert.equal(app.led(), '6000×3375', `${t}: 직접 넣은 값이 바뀌었다`);
  }
  app.setDesign('executiveBoardroom');
  assert.equal(app.led(), '6000×3375', '디자인을 바꾸자 바뀌었다');
  app.setSize(12000, 3600, 9000);
  assert.equal(app.led(), '6000×3375', '방 크기를 바꾸자 바뀌었다');
  for (const id of ['MP008F', 'IF025R', 'MM009F']) {
    app.setModel(id);
    assert.equal(app.led(), '6000×3375', `${id}: 모델을 바꾸자 요청값이 바뀌었다`);
  }
  app.reload();
  assert.equal(app.led(), '6000×3375');
  assert.equal(app.s.auto, false);
  // 요청값과 실제 설치 크기는 다르다 — 모델마다 캐비닛 크기가 달라 실제 크기는 달라진다.
  const 실제 = ['MP012F', 'IF025R'].map(id => computeConfig(MODELS.find(m => m.id === id), 12000, 3600,
    { mode: 'ledsize', ledW: 6000, ledH: 3375, baseHeight: 0 })).map(r => `${Math.round(r.actualW)}×${Math.round(r.actualH)}`);
  assert.notEqual(실제[0], 실제[1], '모델이 달라도 실제 크기가 같다 — 요청값과 실제 크기를 섞었다');
});

// ── 자동으로 되돌리는 길 (PHASE 11-d 의 '추천값으로 되돌리기' 자리) ────────────
test('자동 복귀 — 직접 넣은 뒤 자동으로 되돌리면 그 방의 권장값으로 다시 채운다', () => {
  const app = 화면().setSize(24000, 8000, 28000).setRoomType('hall_l').typeLed(6000, 3375);
  app.resetAuto();
  assert.equal(app.s.auto, true);
  assert.equal(app.led(), '7100×4000');
  app.setRoomType('meeting');
  assert.equal(app.led(), '4000×2300');
});

// ── 계약 F — 하단 높이를 몰래 바꾸지 않는다 (P1-②) ─────────────────────────────
test('계약 F — 벽에 들어가지 않으면 경고로 알리고, 하단 높이는 그대로 둔다', () => {
  // PHASE 11-0 실측: 14×3.8m 방에 7,100×4,000 요청이 남으면 실제 6,451×3,629 가 나와 벽을 넘었다.
  const r = computeConfig(MP012F, 14000, 3800, { mode: 'ledsize', ledW: 7100, ledH: 4000, baseHeight: 1000 });
  const p = ledFitProblem({ spaceW: 14000, spaceH: 3800, baseHeight: 1000, actualW: r.actualW, actualH: r.actualH });
  assert.ok(p && p.height, '벽을 넘었는데 문제로 보지 않았다');
  assert.equal(p.width, false);
  assert.equal(Math.round(p.topMm), Math.round(1000 + r.actualH));
  // 가로가 넘치는 경우와 딱 맞는 경우.
  assert.equal(ledFitProblem({ spaceW: 3000, spaceH: 3400, baseHeight: 1000, actualW: 3226, actualH: 1814 }).width, true);
  assert.equal(ledFitProblem({ spaceW: 3226, spaceH: 2814, baseHeight: 1000, actualW: 3226, actualH: 1814 }), null, '딱 맞는데 넘친다고 했다');
  assert.equal(ledFitProblem({}), null);

  // 배선 — LED 는 하단 높이 값을 고치지 않는다. 고치는 대입은 사이니지(svCode) 조건 아래에만 있다.
  const clamp = body('clampBaseHeight');
  const 대입 = [...clamp.matchAll(/^\s*(.*)el\.value\s*=/gm)].map(m => m[0]);
  assert.equal(대입.length, 1, `하단 높이 대입이 ${대입.length}곳이다`);
  assert.match(대입[0], /if \(svCode &&/, 'LED 경로에서 하단 높이를 고친다(P1-②)');
  // 넘치면 ② 아래에 경고를 띄운다.
  const warn = body('renderLedSizeFitWarning');
  assert.match(warn, /ledFitProblem\(/);
  assert.match(warn, /notice warn/);
  assert.doesNotMatch(warn, /\.value\s*=/, '경고 함수가 입력값을 고친다');
  assert.match(body('renderLedFitBar'), /renderLedSizeFitWarning\(bar\)/);
});

// ── 계약 G — 상태가 없는 옛 저장값 ────────────────────────────────────────────
test('계약 G — 상태가 적혀 있지 않은 옛 저장값은 사람의 값을 덮지 않는다', () => {
  // ① 상태가 적혀 있으면 그대로 따른다.
  assert.equal(restoreLedSizeMode({ ledSizeMode: 'auto', ledW: 1, ledH: 1 }, { w: 4000, h: 2300 }), 'auto');
  assert.equal(restoreLedSizeMode({ ledSizeMode: 'manual', ledW: 4000, ledH: 2300 }, { w: 4000, h: 2300 }), 'manual');
  // ② 옛 저장값 — 그 방의 자동값과 정확히 같을 때만 자동이다(되살려도 한 자리도 바뀌지 않는다).
  assert.equal(restoreLedSizeMode({ ledW: 7100, ledH: 4000 }, { w: 7100, h: 4000 }), 'auto');
  assert.equal(restoreLedSizeMode({ ledW: 4000, ledH: 2300 }, { w: 4000, h: 2300 }), 'auto');
  // ③ 하나라도 다르면 직접이다 — P1-① 때문에 대강당에서 4,000×2,300 에 멈춰 있던 저장값도 그대로 둔다.
  assert.equal(restoreLedSizeMode({ ledW: 4000, ledH: 2300 }, { w: 7100, h: 4000 }), 'manual');
  assert.equal(restoreLedSizeMode({ ledW: 6000, ledH: 3375 }, { w: 4000, h: 2300 }), 'manual');
  assert.equal(restoreLedSizeMode({ ledW: 7100, ledH: 3999 }, { w: 7100, h: 4000 }), 'manual');
  // ④ 알 수 없으면 직접이다.
  for (const bad of [null, undefined, {}, { ledSizeMode: 'AUTO' }, { ledSizeMode: 1 }]) {
    assert.equal(restoreLedSizeMode(bad, null), 'manual', JSON.stringify(bad));
  }
  // 저장 규격 — 옛 값은 null 로, 모르는 값도 null 로 떨어지고, 맞는 값만 남는다.
  assert.equal(normalizeConfig({ ledW: 4000 }).ledSizeMode, null);
  assert.equal(normalizeConfig({ ledSizeMode: 'auto' }).ledSizeMode, 'auto');
  assert.equal(normalizeConfig({ ledSizeMode: 'manual' }).ledSizeMode, 'manual');
  assert.equal(normalizeConfig({ ledSizeMode: 'yes' }).ledSizeMode, null);

  // 실제 흐름 — 상태 항목이 없는 옛 저장 문자열을 되살린다.
  const 옛 = (o) => JSON.stringify({ spaceW: 24000, spaceH: 8000, spaceD: 28000, roomType: 'hall_l',
    roomOpts: defaultOptions('hall_l'), roomDesign: 'auditoriumLarge', baseHeight: 1000, mode: 'ledsize', ...o });
  const a = 화면({ v: 옛({ ledW: 6000, ledH: 3375 }) }).reload();          // 사람이 넣은 값
  assert.equal(a.s.auto, false); assert.equal(a.led(), '6000×3375');
  a.setSize(24000, 8000, 34000);
  assert.equal(a.led(), '6000×3375', '옛 저장값의 직접 입력을 자동값으로 덮었다');
  const b = 화면({ v: 옛({ ledW: 4000, ledH: 2300 }) }).reload();          // P1-① 로 멈춰 있던 값
  assert.equal(b.s.auto, false, '애매한 옛 값을 자동으로 판정했다');
  assert.equal(b.led(), '4000×2300');
  const c = 화면({ v: 옛({ ledW: 7100, ledH: 4000 }) }).reload();          // 자동이 만든 값과 같다
  assert.equal(c.s.auto, true); assert.equal(c.led(), '7100×4000', '되살리는 순간 값이 바뀌었다');
});

// ── 배선 — app.js 가 위 규칙을 정확한 자리에서 부른다 ────────────────────────
test('배선 — 저장·복원·용도 전환·직접 입력이 led-request.js 규칙을 그대로 쓴다', () => {
  assert.match(appSrc, /from '\.\/led-request\.js\?v=\d+'/, 'led-request.js 를 불러오지 않는다');
  // 저장: 상태를 함께 적는다.
  assert.match(body('gatherConfig'), /ledSizeMode:\s*ledSizeAuto \? 'auto' : 'manual'/);
  // 복원: 무조건 'manual' 로 떨어뜨리지 않는다(P1-① 의 원인이었던 줄).
  const apply = body('applyConfig');
  assert.match(apply, /ledSizeAuto = restoreLedSizeMode\(c, autoLedTarget\(\)\) === 'auto'/);
  assert.doesNotMatch(apply, /ledSizeAuto = false/, '되살릴 때 다시 무조건 직접으로 떨어진다(P1-①)');
  // 자동값: 강당이 아니면 제품 기본값(autoLedRequest)이다 — 강당 값을 그대로 두지 않는다.
  assert.match(body('autoLedTarget'), /return autoLedRequest\(size\)/);
  const applyAuto = body('applyAutoLedSize');
  assert.match(applyAuto, /if \(!ledSizeAuto\) return false/);
  assert.doesNotMatch(applyAuto, /if \(!size\) return false/, '강당이 아니면 손대지 않던 옛 규칙이 남았다(P1-②)');
  // 용도 전환: 자동값을 다시 맞추고, 직접 넣은 값은 줄이지 않는다.
  const room = listener('roomType', 'change');
  assert.match(room, /applyAutoLedSize\(\)/);
  assert.doesNotMatch(room, /clampLedInputs\(\)/, '용도를 바꿀 때 직접 넣은 값을 줄인다');
  // 방 크기 변경: 자동값을 다시 맞춘다(깊이 포함).
  assert.match(appSrc, /\['spaceW', 'spaceH', 'baseHeight'\][^\n]*\n\s*setLedMax\(\); applyAutoLedSize\(\); renderAll\(\);/);
  assert.match(listener('spaceD', 'input'), /applyAutoLedSize\(\)/);
  // 직접 입력: 직접 상태가 된다.
  assert.match(appSrc, /\['ledW', 'ledH'\]\.forEach\(id => \$\('#' \+ id\)\?\.addEventListener\('input', \(\) => \{\s*\n\s*ledSizeAuto = false;/);
  // 자동으로 되돌리는 내부 경로가 있다(버튼은 PHASE 11-d).
  const reset = body('resetLedSizeToAuto');
  assert.match(reset, /ledSizeAuto = true/);
  assert.match(reset, /applyAutoLedSize\(\)/);
  // 상태를 바꾸는 곳은 이 넷뿐이다: 처음 값 · 직접 입력 · 복원 · 자동 복귀.
  const 대입 = [...appSrc.matchAll(/ledSizeAuto = /g)].length;
  assert.equal(대입, 4, `ledSizeAuto 를 바꾸는 곳이 ${대입}곳이다`);
});
