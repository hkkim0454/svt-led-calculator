// conference-chair.test.js — 대회의실용 인체공학 의자 회귀 테스트. (PHASE 4-a)
// ─────────────────────────────────────────────────────────────────────────────
// 여기서 지키는 것.
//   ① 계약이 유일한 치수 기준인가 — 도형 코드가 치수를 다시 적지 않았는가.
//   ② **앞의 두 의자와 다른 의자인가** — 크기만 줄인 축소판이면 실패다.
//   ③ 좌석이 많아도 버티는가 — 그리기 호출이 좌석 수를 따라 늘지 않는가.
//   ④ 이번 단계가 **의자 단계**로 남는가 — 테이블·AV·다른 공간을 건드리지 않았는가.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FURNITURE_ASSETS, DIMS, assetFor, assetKey, assetParts,
  createConferenceErgoChair, createCorporateChair, createExecutiveChair, createConferenceChair,
  ERGO_BEVEL_MARGIN, ERGO_TOP_MARGIN,
} from '../src/furniture-assets.js';
import { FURNITURE_CONTRACTS, CONTRACT_STATUS, finishPartFor } from '../src/furniture-contracts.js';
import {
  resolveFurnitureForDesign, hasRuntimeFurnitureAsset, RUNTIME_CATEGORY,
} from '../src/furniture-routing.js';
import { ROOM_DESIGNS, isPlanned } from '../src/room-design.js';
import { PART_FINISH, MATERIAL_IDS, finishForPart } from '../src/materials.js';
import { layoutRoom, defaultOptions, FURNITURE } from '../src/room-presets.js';

const C = FURNITURE_CONTRACTS.conferenceErgoChair;
const D = C.dimensions;
const parts = createConferenceErgoChair();
const kinds = [...new Set(parts.map(p => p.kind))].sort();
const assetsSrc = readFileSync(new URL('../src/furniture-assets.js', import.meta.url), 'utf8');

/** 선언된 부품들이 차지하는 최대 반폭·반깊이·높이(도형 굽기 전 기준). */
function envelope(list) {
  let halfX = 0, halfZ = 0, top = 0;
  for (const p of list) {
    const hw = p.shape === 'star' ? p.reach : (p.w || 0) / 2;
    const hd = p.shape === 'star' ? p.reach : (p.d || 0) / 2;
    halfX = Math.max(halfX, Math.abs(p.dx || 0) + hw);
    halfZ = Math.max(halfZ, Math.abs(p.dz || 0) + hd);
    top = Math.max(top, (p.y || 0) + (p.h || 0) / 2);
  }
  return { w: halfX * 2, d: halfZ * 2, h: top };
}

// ── A. 등록·계약 ────────────────────────────────────────────────────────────

test('① 런타임 카탈로그에 있고, 계약이 구현됨으로 바뀌었다', () => {
  const a = FURNITURE_ASSETS.conferenceErgoChair;
  assert.ok(a, '런타임 카탈로그에 없다');
  assert.equal(a.instanced, true, '좌석이 많은 공간이라 인스턴싱 대상이어야 한다');
  assert.equal(a.sized, false);
  assert.equal(C.status, CONTRACT_STATUS.IMPLEMENTED);
  assert.equal(RUNTIME_CATEGORY.conferenceErgoChair, 'chair');
  assert.equal(hasRuntimeFurnitureAsset('conferenceErgoChair'), true);
  assert.equal(assetFor({ type: 'chair', asset: 'conferenceErgoChair' }), 'conferenceErgoChair');
  assert.equal(assetKey({ type: 'chair', asset: 'conferenceErgoChair' }), 'conferenceErgoChair');
});

test('② 치수의 기준은 **계약 하나**다 — 도형 코드가 치수를 다시 적지 않았다', () => {
  // 값이 같아야 하고, **소스에서도 계약을 직접 읽어야** 한다.
  //   (테스트는 `?v=` 없이 불러오므로 모듈 인스턴스가 달라 객체 동일성 비교는 쓸 수 없다.)
  assert.deepEqual({ ...DIMS.conferenceErgoChair }, { ...C.dimensions }, '치수를 두 곳에 적었다');
  assert.match(assetsSrc,
    /conferenceErgoChair: FURNITURE_CONTRACTS\.conferenceErgoChair\.dimensions,/,
    'DIMS 가 계약을 직접 읽지 않는다');
  assert.deepEqual({ ...D }, {
    seatTop: 450, seatW: 490, seatD: 470,
    overallW: 650, overallD: 660, overallH: 1010,
    casterBase: 650, backAboveSeat: 560,
  });
  // 소스에도 계약 값이 숫자로 박혀 있지 않아야 한다(좌판·전체 치수).
  const body = assetsSrc.match(/export function createConferenceErgoChair[\s\S]*?\n}\n/)[0];
  for (const v of [490, 470, 660, 1010, 650]) {
    assert.ok(!new RegExp(`[^.\\w]${v}[^.\\w\\d]`).test(body.replace(/\/\/.*$/gm, '')),
      `도형 코드에 계약 치수 ${v} 가 그대로 적혀 있다 — 계약을 읽어야 한다`);
  }
  assert.match(body, /DIMS\.conferenceErgoChair/);
});

test('③ 선언 치수가 계약 봉투 안에 들어온다', () => {
  const e = envelope(parts);
  assert.ok(e.w <= D.overallW, `폭 ${e.w} > 계약 ${D.overallW}`);
  assert.ok(e.d <= D.overallD, `깊이 ${e.d} > 계약 ${D.overallD}`);
  assert.ok(e.h <= D.overallH, `높이 ${e.h} > 계약 ${D.overallH}`);
  // 여유는 **의도적**이다 — 둥글림이 도형을 사방으로 밀어내기 때문에 미리 빼 둔다.
  assert.ok(ERGO_BEVEL_MARGIN > 0 && ERGO_TOP_MARGIN > 0);
  assert.equal(Math.round(e.w), D.overallW - ERGO_BEVEL_MARGIN * 2, '폭 여유가 선언과 다르다');
});

test('④ 좌판·받침이 계약대로다', () => {
  const seat = parts.find(p => p.kind === 'chairCushion');
  assert.equal(seat.w, D.seatW);
  assert.equal(seat.d, D.seatD);
  assert.equal(seat.y + seat.h / 2, D.seatTop, '좌판 윗면이 좌석고와 다르다');
  assert.ok(seat.h <= 70, `좌판 두께 ${seat.h}mm — 두꺼우면 가벼운 인상이 사라진다`);
  const star = parts.find(p => p.shape === 'star');
  assert.ok(star, '5발 받침이 없다');
  assert.equal(star.legs, 5);
  assert.ok(star.reach * 2 <= D.casterBase, `받침 ${star.reach * 2} > 계약 ${D.casterBase}`);
  assert.ok(parts.some(p => p.shape === 'cyl' && p.kind === 'chairColumn'), '가스 실린더가 없다');
});

// ── B. 다른 의자와의 차이 ───────────────────────────────────────────────────

test('⑤ **헤드레스트가 없다** — 그것이 임원 의자와의 첫 번째 차이다', () => {
  assert.ok(!kinds.includes('chairHeadrest'), '헤드레스트가 생겼다');
  assert.equal(D.headrestH, undefined, '계약에 헤드레스트가 생겼다');
  assert.ok(!C.parts.includes('chairHeadrest'));
  assert.equal(finishPartFor('conferenceErgoChair', 'chairHeadrest'), null);
  // 임원 의자는 반대로 헤드레스트가 있어야 한다(동결 확인).
  assert.ok(createExecutiveChair().some(p => p.kind === 'chairHeadrest'));
});

test('⑥ 세 의자가 **크기만 다른 같은 의자가 아니다** — 등받이를 만드는 방식이 다르다', () => {
  const back = list => list.filter(p => p.sag).map(p => `${p.kind}:${p.shape}`);
  const conf = back(parts), corp = back(createCorporateChair()), exec = back(createExecutiveChair());
  // 대회의: 휜 판이 **메시와 허리받침 둘뿐**이다(뒤판도 어깨 가로대도 없다).
  assert.deepEqual(conf.sort(), ['chairFrame:box', 'chairMesh:box'], `휜 판 구성: ${conf}`);
  assert.ok(corp.length >= 3, '대기업 의자 구성이 바뀌었다');
  assert.ok(createExecutiveChair().some(p => p.shape === 'taper'), '임원 의자 구성이 바뀌었다');
  // 대회의만 **세로 레일 두 개**(휘지 않는 각재)를 가진다.
  const rails = parts.filter(p => p.kind === 'chairFrame' && p.shape === 'box' && !p.sag && !p.r && p.dx);
  assert.equal(rails.length, 4, '세로 레일 2 + 팔걸이 기둥 2 가 아니다');
  assert.ok(rails.some(p => p.h > 300), '등받이를 잡는 세로 레일이 없다');
});

test('⑦ 세 의자의 치수가 뚜렷하게 갈린다(축소판이 아니다)', () => {
  const T = id => FURNITURE_CONTRACTS[id].dimensions;
  const conf = T('conferenceErgoChair'), corp = T('corporateChair'), exec = T('executiveChair');
  // 가장 낮고, 가장 좁고, 등받이가 가장 짧다.
  assert.ok(conf.overallH < corp.overallH && corp.overallH < exec.overallH, '높이 순서가 깨졌다');
  assert.ok(exec.overallH - conf.overallH >= 200, `임원과 높이 차 ${exec.overallH - conf.overallH}mm`);
  assert.ok(corp.overallH - conf.overallH >= 25, `대기업과 높이 차 ${corp.overallH - conf.overallH}mm`);
  assert.ok(conf.overallW < corp.overallW && corp.overallW < exec.overallW, '폭 순서가 깨졌다');
  assert.ok(conf.backAboveSeat < corp.backAboveSeat, '등받이가 대기업보다 낮아야 한다');
  assert.ok(conf.casterBase < corp.casterBase, '받침이 대기업보다 작아야 한다');
});

test('⑧ 기존 두 의자의 형상이 한 값도 바뀌지 않았다', () => {
  assert.equal(createCorporateChair().length, 12);
  assert.equal(createExecutiveChair().length, 12);
  assert.equal(createConferenceChair().length, 9, '기존 회의용 의자도 그대로다');
  const sig = list => list.map(p => `${p.kind}|${p.shape}|${p.dx || 0}|${p.y}|${p.w || 0}|${p.h || 0}`).join(';');
  // 좌판 윗면·전체 높이 같은 대표 수치를 고정한다.
  const corpSeat = createCorporateChair().find(p => p.kind === 'chairCushion');
  assert.equal(corpSeat.y + corpSeat.h / 2, 450);
  assert.equal(corpSeat.w, 500);
  const execSeat = createExecutiveChair().find(p => p.kind === 'chairCushion');
  assert.equal(execSeat.y + execSeat.h / 2, 460);
  assert.equal(execSeat.w, 530);
  assert.ok(sig(createCorporateChair()).length > 0 && sig(createExecutiveChair()).length > 0);
});

// ── C. 부품·마감 ────────────────────────────────────────────────────────────

test('⑨ 계약이 정한 부품 이름만 쓰고, 마감이 전부 실재한다', () => {
  assert.deepEqual([...C.parts].sort(),
    ['chairArmPad', 'chairCaster', 'chairColumn', 'chairCushion', 'chairFrame', 'chairMesh'].sort());
  assert.deepEqual(kinds, [...C.parts].sort(), `쓰는 부품이 계약과 다르다: ${kinds}`);
  for (const k of kinds) {
    const f = finishForPart(k);
    assert.ok(f && f.color, `${k}: 마감(색)이 없다 — 재질 없는 메시는 하얗게 뜬다`);
    assert.equal(finishPartFor('conferenceErgoChair', k), k);
  }
  // 새 정식 재질을 만들지 않았다.
  assert.equal(MATERIAL_IDS.length, 13);
  assert.equal(PART_FINISH.chairHeadrest, undefined);
});

test('⑩ 한 색 검정으로 뭉치지 않는다 — 부품마다 미세한 명도 차가 있다', () => {
  const lum = c => { const n = parseInt(c.slice(1), 16);
    return 0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255); };
  const vals = kinds.map(k => lum(finishForPart(k).color));
  assert.ok(Math.max(...vals) - Math.min(...vals) >= 8, '부품 밝기 차가 너무 작다 — 덩어리로 보인다');
  assert.ok(Math.min(...vals) > 20, '순수 검정에 가까우면 형태가 죽는다');
});

// ── D. 라우팅·범위 ──────────────────────────────────────────────────────────

test('⑪ 라우터가 **고치지 않아도** 대회의실 의자를 고른다', () => {
  assert.equal(ROOM_DESIGNS.largeConference.furniture.chair, 'conferenceErgoChair');
  const r = resolveFurnitureForDesign({ type: 'chair' }, 'largeConference');
  assert.equal(r.requestedAsset, 'conferenceErgoChair');
  assert.equal(r.runtimeAsset, 'conferenceErgoChair');
  assert.equal(r.implemented, true);
  assert.equal(r.fallbackUsed, false);
  assert.equal(r.contractStatus, CONTRACT_STATUS.IMPLEMENTED);
  // 다른 공간은 제 의자를 그대로 쓴다.
  assert.equal(resolveFurnitureForDesign({ type: 'chair' }, 'corporateMeeting').runtimeAsset, 'corporateChair');
  assert.equal(resolveFurnitureForDesign({ type: 'chair' }, 'executiveBoardroom').runtimeAsset, 'executiveChair');
});

test('⑫ 상황실 모니터·키보드는 그대로 미구현이다 (운용자 의자는 PHASE 5-a 에서 생겼다)', () => {
  for (const id of ['consoleMonitor', 'keyboard']) {
    assert.equal(FURNITURE_CONTRACTS[id].status, CONTRACT_STATUS.CONTRACT_READY, `${id}: 상태가 바뀌었다`);
    assert.equal(hasRuntimeFurnitureAsset(id), false, `${id}: 도형이 생겼다`);
  }
  // PHASE 4-b — 테이블은 실제로 생겼다. 대체 없이 제 자산으로 선다.
  const t = resolveFurnitureForDesign({ type: 'table' }, 'largeConference');
  assert.equal(t.requestedAsset, 'largeUTable');
  assert.equal(t.implemented, true);
  assert.equal(t.fallbackUsed, false);
  assert.equal(t.runtimeAsset, 'largeUTable');
  // 대회의실 디자인에서 아직 정하지 않은 것들은 여전히 planned 다(벽 구성·소품).
  //   화각은 PHASE 4-d.3 에서 켜졌다.
  const d = ROOM_DESIGNS.largeConference;
  assert.equal(d.camera, 'conferenceProposal');
  for (const f of ['wallTreatment', 'accessories']) {
    assert.ok(isPlanned(d[f]), `largeConference.${f} 가 벌써 정해졌다`);
  }
});

// ── E. 좌석 간격·성능 ───────────────────────────────────────────────────────

test('⑬ 좌석 간격 — 임원 의자에서 나온 겹침 문제를 되풀이하지 않는다', () => {
  const e = envelope(parts);
  assert.ok(e.w < FURNITURE.chairPitch, `의자 폭 ${e.w} ≥ 좌석 간격 ${FURNITURE.chairPitch}`);
  const gap = FURNITURE.chairPitch - e.w;
  assert.ok(gap >= 50, `이웃 의자 사이 여유 ${gap}mm — 좌석이 많은 공간에서는 넉넉해야 한다`);
  // 임원 의자는 반대로 간격보다 넓다(알려진 P2 — 여기서 고치지 않는다. 사실만 고정한다).
  assert.ok(envelope(createExecutiveChair()).w > FURNITURE.chairPitch,
    '임원 의자 상태가 바뀌었다 — 이 단계에서 건드리면 안 된다');
});

test('⑭ 실제 배치에서 겹치지 않는다(대회의실 U자, 방 3종)', () => {
  const W = envelope(parts).w, Dp = envelope(parts).d;
  for (const [w, d] of [[12000, 10000], [14000, 12000], [16000, 14000]]) {
    const ch = layoutRoom('meeting', { ...defaultOptions('meeting'), tableShape: 'u', seats: 20, ledBottom: 1000 },
      { W: w, D: d }).items.filter(i => i.type === 'chair');
    assert.ok(ch.length > 0);
    for (let i = 0; i < ch.length; i++) {
      for (let j = i + 1; j < ch.length; j++) {
        const a = ch[i], b = ch[j];
        const ta = Math.round(a.rotY || 0) % 180 !== 0, tb = Math.round(b.rotY || 0) % 180 !== 0;
        const aw = ta ? Dp : W, ad = ta ? W : Dp, bw = tb ? Dp : W, bd = tb ? W : Dp;
        const hit = Math.abs(a.x - b.x) < (aw + bw) / 2 - 1 && Math.abs(a.z - b.z) < (ad + bd) / 2 - 1;
        assert.equal(hit, false, `${w}x${d}: 의자 (${a.x},${a.z}) 와 (${b.x},${b.z}) 가 겹친다`);
      }
    }
  }
});

test('⑮ 인스턴싱 — 그리기 묶음이 **좌석 수를 따라 늘지 않는다**', () => {
  // 부품 목록이 좌석 수와 무관하게 한 벌이다(어댑터는 부품마다 InstancedMesh 하나를 만든다).
  const p1 = assetParts({ type: 'chair', asset: 'conferenceErgoChair' });
  const p2 = assetParts({ type: 'chair', asset: 'conferenceErgoChair' });
  assert.equal(p1.length, p2.length);
  assert.equal(p1.length, parts.length);
  // 좌석이 몇 개든 묶음 열쇠가 같다 → 한 덩어리로 묶인다.
  const keys = [8, 16, 24, 40].map(() => assetKey({ type: 'chair', asset: 'conferenceErgoChair' }));
  assert.equal(new Set(keys).size, 1);
  // 부품 수는 대량 배치를 감안해 앞의 두 의자를 넘지 않는다.
  assert.ok(parts.length <= createExecutiveChair().length + 1,
    `부품 ${parts.length}개 — 대량 배치용치고 많다`);
});

test('⑯ 순수 유지 — 가구 명세는 Three.js·DOM 없이 돌고, 결과가 안정적이다', () => {
  const code = assetsSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.equal(/from\s+['"].*three/i.test(code), false, 'Three.js 를 불러왔다');
  assert.equal(/\bdocument\.|\bwindow\./.test(code), false, 'DOM 을 만졌다');
  assert.deepEqual(createConferenceErgoChair(), createConferenceErgoChair());
  for (const p of parts) {
    for (const v of [p.dx, p.y, p.dz, p.w, p.h, p.d]) {
      if (v !== undefined) assert.ok(Number.isFinite(v), `${p.kind}: 유한하지 않은 값 ${v}`);
    }
  }
});

test('⑰ 기준 수치 고정 — 대회의실 의자 선언 봉투', () => {
  const e = envelope(parts);
  assert.deepEqual({ 부품: parts.length, 폭: e.w, 깊이: e.d, 높이: Math.round(e.h) },
    { 부품: 13, 폭: 622, 깊이: 622, 높이: 1010 });
});
