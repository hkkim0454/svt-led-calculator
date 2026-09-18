// furniture-routing.test.js — 요청 ↔ 실제 가구 라우팅 회귀 테스트 (PHASE 1-d).
// 핵심 규칙
//   (1) 기존 `assetFor`/`assetKey`/`assetParts` 의미를 **한 글자도 바꾸지 않는다**.
//   (2) 계약이 있다고 해서 가구가 있는 것이 아니다 — 구현 여부는 런타임 목록만이 답한다.
//   (3) 갈래가 다른 가구로 **조용히 바꿔치기하지 않는다**(모니터 자리에 테이블 금지).
//   (4) 대기업 회의실은 여전히 지금 화면 그대로다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  RUNTIME_CATEGORY, FALLBACK_ALLOWED,
  hasRuntimeFurnitureAsset, runtimeCategory, assetCategory,
  requestedFurnitureForDesign, resolveFurnitureForDesign, furnitureStatusForDesign,
} from '../src/furniture-routing.js';
import { FURNITURE_ASSETS, assetFor, assetKey, assetParts } from '../src/furniture-assets.js';
import { FURNITURE_CONTRACTS, CONTRACT_IDS, CONTRACT_STATUS } from '../src/furniture-contracts.js';
import { ROOM_DESIGNS, DESIGN_IDS } from '../src/room-design.js';
import { ROOM_TYPES, layoutRoom, defaultOptions } from '../src/room-presets.js';

const RESULT_FIELDS = ['requestedAsset', 'contractStatus', 'category',
  'runtimeAsset', 'implemented', 'fallbackUsed', 'renderable'];

// ── A·B·C. 기존 경로는 한 글자도 바뀌지 않는다 ──────────────────────────────

test('기존 경로 무변경 — assetFor / assetKey / assetParts 결과가 그대로다', () => {
  assert.equal(assetFor({ type: 'chair' }), 'conferenceChair');
  assert.equal(assetFor({ type: 'table' }), 'conferenceTable');
  assert.equal(assetFor({ type: 'console' }), 'controlConsole');
  assert.equal(assetFor({ type: 'seat' }), 'auditoriumChair');
  assert.equal(assetFor({ type: 'credenza' }), 'avCredenza');
  assert.equal(assetFor({ type: 'chair', asset: 'trainingChair' }), 'trainingChair');
  assert.equal(assetFor({ type: 'rug' }), null);
  // **아직 없는 계약 이름을 가리켜도** 기존 함수는 예전 그대로 안전하게 되돌아간다.
  for (const id of CONTRACT_IDS.filter(x => !FURNITURE_ASSETS[x])) {
    assert.equal(assetFor({ type: 'chair', asset: id }), 'conferenceChair', id);
    assert.equal(assetKey({ type: 'chair', asset: id }), 'conferenceChair', id);
  }
  // 만들어진 자산을 가리키면 그것을 쓴다 — 기존 함수의 원래 동작이다(의미가 바뀐 것이 아니다).
  assert.equal(assetFor({ type: 'chair', asset: 'corporateChair' }), 'corporateChair');
  assert.equal(assetKey({ type: 'chair', asset: 'corporateChair' }), 'corporateChair');
  assert.equal(assetKey({ type: 'chair' }), 'conferenceChair');
  assert.equal(assetKey({ type: 'desk', w: 1400, d: 600 }), 'trainingDesk:1400x600');
  assert.equal(assetParts({ type: 'chair' }).length, 9);
  assert.equal(assetParts({ type: 'table' }), null);
});

test('기존 경로 무변경 — 6개 공간 타입의 실제 배치에서도 결과가 같다', () => {
  // 라우터를 만들었다고 해서 실제 배치의 자산 선택이 달라지면 안 된다.
  for (const t of ROOM_TYPES) {
    const res = layoutRoom(t.id, defaultOptions(t.id), { W: 12000, D: 14000 });
    for (const it of res.items) {
      const legacy = assetFor(it);
      // 디자인을 주지 않으면(= 지금 렌더러가 하는 일) 라우터도 정확히 같은 답을 낸다.
      const r = resolveFurnitureForDesign(it, undefined);
      assert.equal(r.runtimeAsset, legacy, `${t.id}/${it.type}: 기존 선택과 다르다`);
      assert.equal(r.fallbackUsed, false, `${t.id}/${it.type}: 대체가 일어났다`);
    }
  }
});

// ── D~H. 계약 있음 ≠ 구현됨 ─────────────────────────────────────────────────

test('구현 여부 — 런타임 목록만이 답한다(계약이 있다고 있는 게 아니다)', () => {
  for (const id of CONTRACT_IDS) {
    const runtime = hasRuntimeFurnitureAsset(id);
    // 진실의 출처는 하나뿐 — FURNITURE_ASSETS.
    assert.equal(runtime, !!FURNITURE_ASSETS[id], `${id}: 판정 근거가 어긋난다`);
    // 계약 상태와 런타임이 어긋나면 안 된다 — 상태는 설명이고 런타임이 진실이다.
    const built = FURNITURE_CONTRACTS[id].status !== CONTRACT_STATUS.CONTRACT_READY;
    assert.equal(runtime, built, `${id}: 상태(${FURNITURE_CONTRACTS[id].status})와 런타임이 어긋난다`);
  }
  for (const bad of ['없는자산', '', null, undefined, 0, {}]) {
    assert.equal(hasRuntimeFurnitureAsset(bad), false, String(bad));
  }
});

test('대기업 회의 의자 — PHASE 2-a 에서 실제로 만들어져 대체 없이 쓰인다', () => {
  // **PHASE 1-d 구조가 실제로 작동한다는 첫 증명.** 라우터를 고치지 않았는데
  //   도형이 생기자마자 저절로 그것을 고른다.
  assert.equal(hasRuntimeFurnitureAsset('corporateChair'), true);
  const r = resolveFurnitureForDesign({ type: 'chair' }, 'corporateMeeting');
  assert.equal(r.requestedAsset, 'corporateChair');
  assert.equal(r.runtimeAsset, 'corporateChair');
  assert.equal(r.implemented, true);
  assert.equal(r.fallbackUsed, false, '있는 것을 대체하면 안 된다');
  assert.equal(r.renderable, true);
  assert.equal(r.category, 'chair');
});

test('의자 계약 4종 — 이제 전부 제 도형으로 선다(대신 그리는 의자가 없다)', () => {
  // PHASE 5-a 에서 운용자 의자가 만들어져, 도형이 없는 **의자 계약은 하나도 남지 않았다.**
  const CASES = [
    ['corporateMeeting', 'corporateChair'],
    ['executiveBoardroom', 'executiveChair'],
    ['largeConference', 'conferenceErgoChair'],
    ['controlRoom', 'taskChair'],
  ];
  for (const [design, want] of CASES) {
    assert.ok(FURNITURE_CONTRACTS[want], `${want}: 계약이 없다`);
    assert.equal(hasRuntimeFurnitureAsset(want), true, `${want}: 도형이 사라졌다`);
    const r = resolveFurnitureForDesign({ type: 'chair', asset: want }, design);
    assert.equal(r.requestedAsset, want);
    assert.equal(r.category, 'chair');
    assert.equal(r.implemented, true, `${want}: 구현되지 않은 것처럼 취급됐다`);
    assert.equal(r.runtimeAsset, want, `${want}: 다른 의자로 대체됐다`);
    assert.equal(r.fallbackUsed, false, `${want}: 있는 것을 대체하면 안 된다`);
    assert.equal(r.renderable, true);
    assert.equal(r.contractStatus, CONTRACT_STATUS.IMPLEMENTED);
  }
});

test('대기업 회의 테이블 — PHASE 2-b 에서 실제로 만들어져 대체 없이 쓰인다', () => {
  assert.equal(hasRuntimeFurnitureAsset('corporateTable'), true);
  const r = resolveFurnitureForDesign({ type: 'table' }, 'corporateMeeting');
  assert.equal(r.requestedAsset, 'corporateTable');
  assert.equal(r.runtimeAsset, 'corporateTable');
  assert.equal(r.implemented, true);
  assert.equal(r.fallbackUsed, false);
  assert.equal(r.contractStatus, CONTRACT_STATUS.IMPLEMENTED);
});

test('남은 콘솔 — 갈래에 맞는 기존 자산으로만 대신한다', () => {
  // PHASE 5-a 에서 운용자 의자까지 생겨, 아직 도형이 없는 **의자 계약은 하나도 남지 않았다.**
  //   그래서 여기서는 **아직 없는 것**(곡선 콘솔)으로 같은 규칙을 확인한다.
  const c = resolveFurnitureForDesign({ type: 'console', asset: 'curvedConsole' }, 'controlRoom');
  assert.equal(c.category, 'console');
  assert.equal(c.runtimeAsset, 'controlConsole', '콘솔은 콘솔로 대신한다');
  assert.equal(c.implemented, false);
  assert.equal(c.fallbackUsed, true);
});

// ── I·J. 갈래가 다른 것으로 바꿔치기 금지 ───────────────────────────────────

test('바꿔치기 금지 — 대신할 것이 없는 AV 장비는 미구현으로 남는다', () => {
  // 상황실 모니터·키보드는 대신할 기존 자산이 없다. **엉뚱한 가구를 그리느니 안 그린다.**
  //   (개인 모니터·프롬프터는 PHASE 4-c 에서 실제로 만들어져 더 이상 이 경우가 아니다.)
  for (const want of ['consoleMonitor', 'keyboard']) {
    for (const type of ['monitor', 'chair', 'table', 'console']) {
      const r = resolveFurnitureForDesign({ type, asset: want }, 'largeConference');
      assert.equal(r.requestedAsset, want);
      assert.equal(r.category, 'av', want);
      assert.equal(r.implemented, false, want);
      assert.equal(r.runtimeAsset, null, `${want}(${type}): 엉뚱한 가구로 대체됐다`);
      assert.equal(r.renderable, false, want);
      assert.equal(r.fallbackUsed, false, `${want}: 대체하지 않았는데 대체했다고 한다`);
    }
  }
  // 대신할 수 있는 갈래는 의자·테이블·콘솔 셋뿐이다.
  assert.deepEqual([...FALLBACK_ALLOWED], ['chair', 'table', 'console']);
  assert.ok(!FALLBACK_ALLOWED.includes('av'), 'AV 장비를 대신하면 다른 장비가 된다');
});

test('갈래 표 — 런타임 자산 14종 전부에 갈래가 있고 계약과 어긋나지 않는다', () => {
  for (const id of Object.keys(FURNITURE_ASSETS)) {
    assert.ok(RUNTIME_CATEGORY[id], `${id}: 갈래가 없다 — 대체 판단을 할 수 없다`);
  }
  // 유령 항목이 없어야 한다(자산이 사라졌는데 갈래만 남는 것 방지).
  for (const id of Object.keys(RUNTIME_CATEGORY)) {
    assert.ok(FURNITURE_ASSETS[id], `RUNTIME_CATEGORY 에 없는 자산: ${id}`);
  }
  // 계약과 런타임에 모두 있는 자산은 갈래가 같아야 한다.
  for (const id of CONTRACT_IDS.filter(x => FURNITURE_ASSETS[x])) {
    assert.equal(runtimeCategory(id), FURNITURE_CONTRACTS[id].category, `${id}: 갈래가 어긋난다`);
  }
  assert.equal(assetCategory('corporateChair'), 'chair', '계약만 있어도 갈래는 안다');
  assert.equal(assetCategory('conferenceChair'), 'chair', '런타임만 있어도 갈래는 안다');
  assert.equal(assetCategory('없는자산'), null);
});

// ── K. 없는 것은 명확히 없다고 답한다 ───────────────────────────────────────

test('없는 이름 — null / false 로 분명하게 답한다', () => {
  const r = resolveFurnitureForDesign({ type: 'chair', asset: '없는가구' }, 'corporateMeeting');
  assert.equal(r.requestedAsset, '없는가구');
  assert.equal(r.contractStatus, null, '계약이 없으면 상태도 없다');
  assert.equal(r.category, null);
  assert.equal(r.implemented, false);
  // 갈래를 모르면 대신하지도 않는다 — 모르는 채로 그리는 것이 가장 위험하다.
  assert.equal(r.runtimeAsset, null);
  assert.equal(r.renderable, false);
  // 배치 항목이 아니어도 무너지지 않는다.
  for (const bad of [null, undefined, {}, { type: 'rug' }]) {
    const x = resolveFurnitureForDesign(bad, 'corporateMeeting');
    assert.equal(x.renderable, false, JSON.stringify(bad));
    assert.equal(x.runtimeAsset, null, JSON.stringify(bad));
  }
  // 모르는 디자인 id는 '디자인 없음'이므로 기존 경로 그대로.
  const legacy = resolveFurnitureForDesign({ type: 'chair' }, '없는디자인');
  assert.equal(legacy.runtimeAsset, 'conferenceChair');
  assert.equal(legacy.fallbackUsed, false);
});

// ── E. 이미 있는 것(avCredenza)은 대체 없이 그대로 ──────────────────────────

test('avCredenza — 계약과 런타임에 모두 있어 대체 없이 그대로 쓰인다', () => {
  // **계약 ↔ 런타임 연결의 정상 본보기다.**
  for (const design of ['corporateMeeting', 'executiveBoardroom', 'largeConference']) {
    const r = resolveFurnitureForDesign({ type: 'credenza', asset: 'avCredenza' }, design);
    assert.equal(r.requestedAsset, 'avCredenza', design);
    assert.equal(r.contractStatus, CONTRACT_STATUS.EXISTING, design);
    assert.equal(r.runtimeAsset, 'avCredenza', design);
    assert.equal(r.implemented, true, design);
    assert.equal(r.fallbackUsed, false, `${design}: 있는 것을 대체하면 안 된다`);
    assert.equal(r.renderable, true, design);
  }
  // 요청을 주지 않아도(배치 type 만으로도) 같은 결과.
  const plain = resolveFurnitureForDesign({ type: 'credenza' }, 'executiveBoardroom');
  assert.equal(plain.runtimeAsset, 'avCredenza');
  assert.equal(plain.implemented, true);
});

// ── L·M. 디자인 선언과의 연결 ───────────────────────────────────────────────

test('디자인 요청 목록 — 네 공간이 서로 다른 가구를 원한다', () => {
  assert.deepEqual({ ...requestedFurnitureForDesign('corporateMeeting') },
    { chair: 'corporateChair', table: 'corporateTable', console: null, av: [] });
  assert.deepEqual({ ...requestedFurnitureForDesign('executiveBoardroom') },
    { chair: 'executiveChair', table: 'boardroomTable', console: null, av: ['avCredenza'] });
  assert.deepEqual({ ...requestedFurnitureForDesign('largeConference') },
    { chair: 'conferenceErgoChair', table: 'largeUTable', console: null,
      av: ['personalMonitor', 'prompter', 'avCredenza'] });
  assert.deepEqual({ ...requestedFurnitureForDesign('controlRoom') },
    { chair: 'taskChair', table: null, console: 'curvedConsole',
      av: ['consoleMonitor', 'keyboard'] });
  // 디자인이 요청하는 이름은 전부 계약으로 해석된다(떠 있는 이름 없음).
  for (const d of DESIGN_IDS) {
    for (const s of furnitureStatusForDesign(d)) {
      assert.ok(s.contract, `${d}: '${s.requested}' 이 계약에 없다`);
      assert.equal(s.implemented, hasRuntimeFurnitureAsset(s.requested), d);
      assert.equal(s.runtimeAsset, s.implemented ? s.requested : null, d);
    }
  }
  // 지금 구현된 것 — PHASE 4-c 에서 개인 모니터·프롬프터가 늘었다.
  const done = DESIGN_IDS.flatMap(d => furnitureStatusForDesign(d))
    .filter(s => s.implemented).map(s => s.requested);
  assert.deepEqual([...new Set(done)].sort(),
    ['avCredenza', 'boardroomTable', 'conferenceErgoChair', 'corporateChair', 'corporateTable',
      'executiveChair', 'largeUTable', 'personalMonitor', 'prompter', 'taskChair']);
});

test('대기업 회의실 — 바뀌는 것은 의자와 테이블뿐이다(수납장·러그·화분은 그대로)', () => {
  const res = layoutRoom('meeting', defaultOptions('meeting'), { W: 8000, D: 7000 });
  const changed = [], same = [];
  for (const it of res.items) {
    const r = resolveFurnitureForDesign(it, 'corporateMeeting');
    (r.runtimeAsset !== assetFor(it) ? changed : same).push(it.type);
  }
  assert.deepEqual([...new Set(changed)].sort(), ['chair', 'table'], '의자·테이블 말고 다른 것도 바뀌었다');
  assert.ok(same.includes('credenza'), 'AV 수납장은 그대로여야 한다');
  for (const it of res.items.filter(i => i.type !== 'chair' && i.type !== 'table')) {
    assert.equal(resolveFurnitureForDesign(it, 'corporateMeeting').runtimeAsset, assetFor(it), it.type);
  }
  // 곡선 콘솔은 아직 계약만 있다(운용자 의자는 PHASE 5-a 에서 생겼다).
  for (const id of ['curvedConsole', 'consoleMonitor', 'keyboard']) {
    assert.equal(hasRuntimeFurnitureAsset(id), false, id);
  }
});

// ── N·O. 순수성과 불변성 ────────────────────────────────────────────────────

test('순수 유지 — 라우터는 Three.js·DOM·렌더러를 부르지 않는다', () => {
  const src = readFileSync(new URL('../src/furniture-routing.js', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.equal(/from\s+['"].*three/i.test(code), false, 'Three.js 를 불러왔다');
  assert.equal(/\bTHREE\.|document\.|window\./.test(code), false, 'DOM 을 썼다');
  for (const bad of ['render3d', 'furniture-gl', 'materials-gl', 'scene3d']) {
    assert.equal(code.includes(bad), false, `렌더러(${bad})를 불러왔다`);
  }
  // 불러오는 것은 순수 모듈 셋뿐이다.
  const imports = [...src.matchAll(/from\s+'\.\/([\w-]+)\.js/g)].map(m => m[1]).sort();
  assert.deepEqual(imports, ['furniture-assets', 'furniture-contracts', 'room-design']);
});

test('불변 — 라우터 결과와 표를 밖에서 고칠 수 없다', () => {
  const r = resolveFurnitureForDesign({ type: 'chair' }, 'executiveBoardroom');
  assert.ok(Object.isFrozen(r), '결과를 고치면 호출한 쪽마다 값이 달라진다');
  assert.deepEqual(Object.keys(r).sort(), [...RESULT_FIELDS].sort(), '결과 항목이 달라졌다');
  assert.ok(Object.isFrozen(RUNTIME_CATEGORY) && Object.isFrozen(FALLBACK_ALLOWED));
  assert.ok(Object.isFrozen(requestedFurnitureForDesign('controlRoom')));
  assert.ok(Object.isFrozen(furnitureStatusForDesign('controlRoom')));
  // 결과를 고쳐도 다음 호출에 영향이 없다(얼려 두었으므로 조용히 무시된다).
  try { r.runtimeAsset = '엉뚱한가구'; } catch { /* strict mode 에서는 예외 */ }
  assert.equal(resolveFurnitureForDesign({ type: 'chair' }, 'executiveBoardroom').runtimeAsset,
    'executiveChair');
});

test('렌더러 연결 범위 — 라우터를 쓰는 곳은 가구를 세우는 한 곳뿐이다', () => {
  // PHASE 2-a 에서 처음으로 연결했다. **연결 지점을 한 곳으로 묶어 둔다** —
  //   여러 곳에서 각자 라우팅하면 어디서 가구가 바뀌었는지 추적할 수 없게 된다.
  const uses = [];
  for (const f of ['furniture-gl', 'render3d-gl', 'app', 'gl-model', 'room-presets', 'engine']) {
    const src = readFileSync(new URL(`../src/${f}.js`, import.meta.url), 'utf8');
    if (src.includes('furniture-routing')) uses.push(f);
  }
  assert.deepEqual(uses, ['furniture-gl'], '라우터 연결 지점이 흩어졌다');
  // 배치·계산 계층은 여전히 디자인을 모른다.
  for (const f of ['room-presets', 'engine']) {
    const src = readFileSync(new URL(`../src/${f}.js`, import.meta.url), 'utf8');
    assert.equal(src.includes('room-design'), false, `${f}.js 가 디자인을 알게 됐다`);
  }
});
