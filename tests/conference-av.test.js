// conference-av.test.js — 대회의실 AV(개인 모니터·중앙 프롬프터) 회귀 테스트. (PHASE 4-c)
// ─────────────────────────────────────────────────────────────────────────────
// 여기서 지키는 것.
//   ① 크기의 기준이 **계약 + panelSize() 하나**인가 — 인치 환산을 또 적지 않았는가.
//   ② 좌석 1개 = 모니터 1대이고, **그 의자를 바라보는가**(세 방향이 달라야 한다).
//   ③ 받침이 상판 위에 온전히 올라가고 이웃과 겹치지 않는가.
//   ④ 프롬프터가 U자 한가운데에 서고, 테이블·의자·받침·LED 시선을 막지 않는가.
//   ⑤ 의자·테이블이 **한 자리도 움직이지 않았는가**(PHASE 4-a·4-b 동결).
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  FURNITURE_ASSETS, FURNITURE_COLORS, assetFor, assetKey, assetParts,
  createPersonalMonitor, createPrompter, createLargeUTable, createConferenceErgoChair,
} from '../src/furniture-assets.js';
import {
  conferenceAVItems, personalMonitorSize, prompterSize,
  MONITOR_EDGE_INSET, PROMPTER_HEADER_GAP, PROMPTER_FLOOR_RISE,
} from '../src/conference-av.js';
import { panelSize } from '../src/monitors.js';
import { FURNITURE_CONTRACTS, CONTRACT_STATUS } from '../src/furniture-contracts.js';
import {
  resolveFurnitureForDesign, hasRuntimeFurnitureAsset, RUNTIME_CATEGORY,
} from '../src/furniture-routing.js';
import { ROOM_DESIGNS, isPlanned } from '../src/room-design.js';
import { MATERIAL_PRESETS, PART_FINISH, finishForPart } from '../src/materials.js';
import { layoutRoom, defaultOptions, FURNITURE, wantsConferenceAV } from '../src/room-presets.js';
import { computeConfig } from '../src/engine.js';
import { MODELS } from '../src/models.js';

const MC = FURNITURE_CONTRACTS.personalMonitor;
const PC = FURNITURE_CONTRACTS.prompter;
const avSrc = readFileSync(new URL('../src/conference-av.js', import.meta.url), 'utf8');
const assetsSrc = readFileSync(new URL('../src/furniture-assets.js', import.meta.url), 'utf8');
const appSrc = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

/** 대회의실 한 판. design 을 주지 않으면 AV 가 하나도 생기지 않는다. */
function lay(W, D, seats, design = 'largeConference') {
  return layoutRoom('meeting',
    { ...defaultOptions('meeting'), tableShape: 'u', seats, rug: false, plant: false, credenza: false },
    { W, D, ledBottom: 1000, design });
}
const of = (res, t) => res.items.filter(i => i.type === t);
const SCENES = [[12000, 9000, 18], [14000, 10000, 24], [16000, 12000, 30]];
const BIG = lay(16000, 12000, 30);
const BIG_U = createLargeUTable(of(BIG, 'table'));

/** 부품 목록이 차지하는 (x,z) 반폭·반깊이와 y 범위. tiltX 를 반영한다. */
function envelope(parts) {
  let hx = 0, hz = 0, y0 = Infinity, y1 = -Infinity;
  for (const p of parts) {
    const t = (p.tiltX || 0) * Math.PI / 180;
    const vy = Math.abs(p.h * Math.cos(t)) + Math.abs(p.d * Math.sin(t));
    const vz = Math.abs(p.h * Math.sin(t)) + Math.abs(p.d * Math.cos(t));
    hx = Math.max(hx, Math.abs(p.dx || 0) + p.w / 2);
    hz = Math.max(hz, Math.abs(p.dz || 0) + vz / 2);
    y0 = Math.min(y0, p.y - vy / 2);
    y1 = Math.max(y1, p.y + vy / 2);
  }
  return { hx, hz, y0, y1 };
}

// ── A. 런타임 · 라우터 ──────────────────────────────────────────────────────

test('① 개인 모니터가 런타임 카탈로그에 있고 InstancedMesh 로 묶인다', () => {
  assert.ok(FURNITURE_ASSETS.personalMonitor);
  assert.equal(hasRuntimeFurnitureAsset('personalMonitor'), true);
  assert.equal(RUNTIME_CATEGORY.personalMonitor, 'av');
  assert.equal(FURNITURE_ASSETS.personalMonitor.instanced, true, '수십 대가 깔린다 — 반드시 묶어야 한다');
  assert.equal(FURNITURE_ASSETS.personalMonitor.sized, false, '크기가 전부 같다');
  assert.equal(assetKey({ type: 'monitor', asset: 'personalMonitor' }), 'personalMonitor');
});

test('② 프롬프터가 런타임 카탈로그에 있다', () => {
  assert.ok(FURNITURE_ASSETS.prompter);
  assert.equal(hasRuntimeFurnitureAsset('prompter'), true);
  assert.equal(RUNTIME_CATEGORY.prompter, 'av');
  assert.equal(assetFor({ type: 'prompter', asset: 'prompter' }), 'prompter');
});

test('③ 두 계약 모두 구현됨으로 바뀌었고 **치수는 하나도 바뀌지 않았다**', () => {
  assert.equal(MC.status, CONTRACT_STATUS.IMPLEMENTED);
  assert.equal(PC.status, CONTRACT_STATUS.IMPLEMENTED);
  assert.deepEqual({ ...MC.dimensions }, { nominalInches: 24, depth: 55, standH: 130, tiltDeg: 12 });
  assert.deepEqual({ ...PC.dimensions }, { nominalInches: 22, depth: 60, standH: 90, tiltDeg: 22 });
  assert.deepEqual([...MC.parts], ['monitorBody', 'monitorStand', 'screen']);
  assert.deepEqual([...PC.parts], ['prompterBody', 'screen']);
  assert.equal(MC.instancing, 'instanced');
  assert.equal(PC.instancing, 'instanced');
});

test('④ 라우터 — 개인 모니터가 **대체 없이** 제 자산으로 해석된다', () => {
  const r = resolveFurnitureForDesign({ type: 'monitor', asset: 'personalMonitor' }, 'largeConference');
  assert.equal(r.requestedAsset, 'personalMonitor');
  assert.equal(r.runtimeAsset, 'personalMonitor');
  assert.equal(r.implemented, true);
  assert.equal(r.fallbackUsed, false);
  assert.equal(r.renderable, true);
  assert.equal(r.contractStatus, CONTRACT_STATUS.IMPLEMENTED);
});

test('⑤ 라우터 — 프롬프터가 **대체 없이** 제 자산으로 해석된다', () => {
  const r = resolveFurnitureForDesign({ type: 'prompter', asset: 'prompter' }, 'largeConference');
  assert.equal(r.runtimeAsset, 'prompter');
  assert.equal(r.implemented, true);
  assert.equal(r.fallbackUsed, false);
  // 라우터 본체는 손대지 않았다 — 갈래표 두 줄만 늘었다.
  assert.equal(assetFor({ type: 'monitor' }), null, '모르는 종류는 여전히 null 이다');
});

// ── B. 치수 — 기준은 계약 + panelSize() 하나 ────────────────────────────────

test('⑥ 개인 모니터 크기가 계약 인치에서 `panelSize()` 로 나온다', () => {
  const S = personalMonitorSize(), p = panelSize(MC.dimensions.nominalInches);
  assert.equal(S.screenW, p.w);
  assert.equal(S.screenH, p.h);
  assert.equal(S.panelW, p.panelW);
  assert.equal(S.panelH, p.panelH);
  assert.equal(S.depth, MC.dimensions.depth);
  assert.equal(S.standH, MC.dimensions.standH);
  // 계약의 발자국 폭이 실제 패널 폭과 어긋나지 않는다(1mm 이내).
  assert.ok(Math.abs(MC.footprint.w - S.panelW) <= 1, `계약 ${MC.footprint.w} vs 실제 ${S.panelW}`);
});

test('⑦ 프롬프터 크기도 같은 `panelSize()` 로 나온다', () => {
  const S = prompterSize(), p = panelSize(PC.dimensions.nominalInches);
  assert.equal(S.panelW, p.panelW);
  assert.equal(S.panelH, p.panelH);
  assert.equal(S.depth, PC.dimensions.depth);
  assert.ok(Math.abs(PC.footprint.w - S.panelW) <= 5, `계약 ${PC.footprint.w} vs 실제 ${S.panelW}`);
  // 개인 모니터보다 작다(22" < 24").
  assert.ok(S.panelW < personalMonitorSize().panelW);
});

test('⑧ 기울기가 계약값 그대로 화면 판에 실린다', () => {
  const m = createPersonalMonitor(), p = createPrompter();
  for (const part of m) if (part.kind !== 'monitorStand') assert.equal(part.tiltX, MC.dimensions.tiltDeg, part.kind);
  for (const part of p.slice(2)) assert.equal(part.tiltX, PC.dimensions.tiltDeg, part.kind);
  assert.equal(PC.dimensions.tiltDeg, 22);
  assert.equal(MC.dimensions.tiltDeg, 12);
  // 받침은 기울지 않는다(기울면 상판·바닥에서 뜬다).
  assert.ok(!m[0].tiltX && !p[0].tiltX);
});

test('⑨ 인치 환산 공식을 **두 곳에 적지 않았다**', () => {
  assert.match(avSrc, /import \{ panelSize \} from '\.\/monitors\.js/);
  // 순수 계산 모듈에도, 도형 코드에도 25.4 나 16:9 환산이 다시 나타나지 않는다.
  assert.ok(!/25\.4|MM_PER_INCH/.test(avSrc), 'conference-av 가 인치 환산을 다시 적었다');
  const body = assetsSrc.match(/export function createPersonalMonitor[\s\S]*?\n}\n/)[0]
    + assetsSrc.match(/export function createPrompter[\s\S]*?\n}\n/)[0];
  assert.ok(!/25\.4|nominalInches/.test(body), '도형 코드가 인치에서 직접 계산한다');
  assert.match(body, /personalMonitorSize\(\)/);
  assert.match(body, /prompterSize\(\)/);
});

// ── C. 배치 — 좌석에서 파생한다 ─────────────────────────────────────────────

test('⑩⑪⑫ 좌석 1개 = 모니터 1대 (18 / 24 / 30석)', () => {
  for (const [W, D, seats] of SCENES) {
    const res = lay(W, D, seats);
    const chairs = of(res, 'chair'), mons = of(res, 'monitor'), pro = of(res, 'prompter');
    assert.equal(chairs.length, seats, `${seats}석이 놓이지 않았다`);
    assert.equal(mons.length, seats, `${seats}석인데 모니터 ${mons.length}대`);
    assert.equal(pro.length, 1, '프롬프터는 1대다');
    assert.equal(res.placed.monitors, seats);
    assert.equal(res.placed.prompters, 1);
  }
});

test('⑬ 모니터가 **제 의자를 바라본다** — 세 변의 방향이 서로 다르다', () => {
  const res = lay(16000, 12000, 30);
  const chairs = of(res, 'chair'), mons = of(res, 'monitor');
  const S = personalMonitorSize();
  for (const ch of chairs) {
    // 그 의자 앞에 놓인 모니터 = 의자에서 가장 가까운 것.
    const m = mons.reduce((a, b) =>
      (Math.hypot(b.x - ch.x, b.z - ch.z) < Math.hypot(a.x - ch.x, a.z - ch.z) ? b : a));
    assert.equal(m.rotY, (ch.rotY + 180) % 360, '모니터가 의자를 등지고 있다');
    const d = Math.hypot(m.x - ch.x, m.z - ch.z);
    assert.ok(Math.abs(d - (FURNITURE.chairClear + MONITOR_EDGE_INSET)) <= 1, `거리 ${d}`);
    assert.equal(m.y, FURNITURE_CONTRACTS.largeUTable.dimensions.surfaceY, '상판 위가 아니다');
  }
  // 뒤·좌·우 세 방향이 전부 나와야 한다. 하나뿐이면 전부 같은 쪽을 본다는 뜻이다.
  const rots = [...new Set(mons.map(m => m.rotY))].sort((a, b) => a - b);
  assert.deepEqual(rots, [90, 180, 270], `방향이 ${rots.join('/')} 뿐이다`);
  assert.ok(S.panelW > 0);
});

test('⑭ 모니터 받침이 **상판 위에 온전히** 올라간다(밖으로 안 나간다)', () => {
  for (const [W, D, seats] of SCENES) {
    const res = lay(W, D, seats);
    const S = createLargeUTable(of(res, 'table'));
    const hw = S.outerW / 2, hd = S.outerD / 2;
    const bands = [
      [S.cx - hw, S.cx + hw, S.cz + hd - S.segW, S.cz + hd],          // 뒤 가로 상판
      [S.cx - hw, S.cx - hw + S.segW, S.cz - hd, S.cz + hd - S.segW], // 왼 날개
      [S.cx + hw - S.segW, S.cx + hw, S.cz - hd, S.cz + hd - S.segW], // 오른 날개
    ];
    const base = createPersonalMonitor()[0];
    for (const m of of(res, 'monitor')) {
      const along = (m.rotY % 180 === 0);
      const bx = (along ? base.w : base.d) / 2, bz = (along ? base.d : base.w) / 2;
      const inside = bands.some(([x0, x1, z0, z1]) =>
        m.x - bx >= x0 - 0.5 && m.x + bx <= x1 + 0.5 && m.z - bz >= z0 - 0.5 && m.z + bz <= z1 + 0.5);
      assert.ok(inside, `${seats}석: 받침이 상판 밖으로 나갔다 (${m.x},${m.z})`);
    }
  }
});

test('⑮ 이웃 모니터끼리 겹치지 않는다(좌석 간격 700 안에서)', () => {
  const S = personalMonitorSize();
  assert.ok(FURNITURE.chairPitch - S.panelW > 0, '모니터가 좌석 간격보다 넓다');
  for (const [W, D, seats] of SCENES) {
    const mons = of(lay(W, D, seats), 'monitor');
    let worst = Infinity;
    for (let i = 0; i < mons.length; i++) for (let j = i + 1; j < mons.length; j++) {
      const a = mons[i], b = mons[j];
      const ax = (a.rotY % 180 === 0) ? S.panelW / 2 : S.depth / 2;
      const az = (a.rotY % 180 === 0) ? S.depth / 2 : S.panelW / 2;
      const bx = (b.rotY % 180 === 0) ? S.panelW / 2 : S.depth / 2;
      const bz = (b.rotY % 180 === 0) ? S.depth / 2 : S.panelW / 2;
      const gx = Math.abs(a.x - b.x) - (ax + bx), gz = Math.abs(a.z - b.z) - (az + bz);
      assert.ok(gx > 0 || gz > 0, `${seats}석: 모니터가 겹친다`);
      worst = Math.min(worst, Math.max(gx, gz));
    }
    assert.ok(worst > 100, `${seats}석: 이웃 여유 ${Math.round(worst)}mm`);
  }
});

test('⑯ 모니터가 의자와 겹치지 않는다(상판 위에만 있다)', () => {
  const E = FURNITURE_CONTRACTS.conferenceErgoChair.dimensions;
  const S = personalMonitorSize();
  const res = lay(16000, 12000, 30);
  const chairs = of(res, 'chair');
  for (const m of of(res, 'monitor')) {
    for (const ch of chairs) {
      const d = Math.hypot(m.x - ch.x, m.z - ch.z);
      assert.ok(d > (E.casterBase + S.panelW) / 2 - 240, `모니터가 의자 위에 올라갔다 (${d})`);
    }
  }
  // 모니터는 언제나 상판 모서리에서 안쪽이다 = 의자 쪽으로 나오지 않는다.
  assert.ok(MONITOR_EDGE_INSET > createPersonalMonitor()[0].d / 2, '받침이 상판 모서리를 넘는다');
});

test('⑰ 프롬프터가 U자 한가운데에 선다(좌우 치우침 0)', () => {
  for (const [W, D, seats] of SCENES) {
    const res = lay(W, D, seats);
    const S = createLargeUTable(of(res, 'table'));
    const p = of(res, 'prompter')[0];
    assert.equal(p.x, S.cx, '좌우 치우침이 생겼다');
    assert.equal(p.x, W / 2, '방 중심축에서 벗어났다');
    assert.equal(p.rotY, 180, '상석을 바라보지 않는다');
    assert.equal(p.y, 0, '바닥에 서지 않는다');
    const headerInner = S.cz + S.outerD / 2 - S.segW;
    assert.equal(p.z, Math.round(headerInner - PROMPTER_HEADER_GAP));
  }
});

test('⑱ 프롬프터가 상판과 겹치지 않는다(가운데 빈 공간 안쪽)', () => {
  const p = of(BIG, 'prompter')[0], S = BIG_U;
  const e = envelope(createPrompter());
  const innerX0 = S.cx - S.innerW / 2, innerX1 = S.cx + S.innerW / 2;
  const innerZ0 = S.cz - S.outerD / 2, innerZ1 = S.cz + S.outerD / 2 - S.segW;
  assert.ok(p.x - e.hx > innerX0 && p.x + e.hx < innerX1, '좌우 날개와 겹친다');
  assert.ok(p.z - e.hz > innerZ0 && p.z + e.hz < innerZ1, '앞뒤 상판과 겹친다');
  assert.equal(e.y0, 0, '바닥에서 떠 있거나 파고든다');
});

test('⑲ 프롬프터가 의자와 겹치지 않는다', () => {
  const E = FURNITURE_CONTRACTS.conferenceErgoChair.dimensions;
  const e = envelope(createPrompter());
  for (const [W, D, seats] of SCENES) {
    const res = lay(W, D, seats);
    const p = of(res, 'prompter')[0];
    let worst = Infinity;
    for (const ch of of(res, 'chair')) {
      const gx = Math.abs(p.x - ch.x) - (e.hx + E.casterBase / 2);
      const gz = Math.abs(p.z - ch.z) - (e.hz + E.casterBase / 2);
      assert.ok(gx > 0 || gz > 0, `${seats}석: 프롬프터가 의자와 겹친다`);
      worst = Math.min(worst, Math.max(gx, gz));
    }
    assert.ok(worst > 500, `${seats}석: 의자까지 ${Math.round(worst)}mm`);
  }
});

test('⑳ 프롬프터가 테이블 받침과 겹치지 않고 LED 시선도 막지 않는다', () => {
  const p = of(BIG, 'prompter')[0], S = BIG_U;
  const e = envelope(createPrompter());
  for (const sp of S.supports) {
    const sx = S.cx + sp.dx, sz = S.cz + sp.dz;
    const gx = Math.abs(p.x - sx) - (e.hx + 160), gz = Math.abs(p.z - sz) - (e.hz + 160);
    assert.ok(gx > 0 || gz > 0, '프롬프터가 테이블 기둥과 겹친다');
  }
  // 상석(가장 뒤 의자)의 앉은 눈높이 1,200mm 에서 LED 아래 모서리(1,000mm)로 가는 시선.
  //   프롬프터 꼭대기가 그 선 아래에 있어야 LED를 가리지 않는다.
  const backZ = Math.max(...of(BIG, 'chair').map(c => c.z));
  const sight = 1000 + (p.z / backZ) * (1200 - 1000);
  assert.ok(e.y1 < sight, `프롬프터 높이 ${e.y1.toFixed(0)} ≥ 시선 ${sight.toFixed(0)}`);
  assert.ok(e.y1 < 1000, `프롬프터가 ${e.y1.toFixed(0)}mm — LED 아래 모서리보다 높다`);
});

// ── D. 동결 ────────────────────────────────────────────────────────────────

test('㉑ 대회의실 의자가 한 값도 바뀌지 않았다', () => {
  const parts = createConferenceErgoChair();
  assert.equal(parts.length, 13);
  const D = FURNITURE_CONTRACTS.conferenceErgoChair.dimensions;
  assert.deepEqual({ ...D }, {
    seatTop: 450, seatW: 490, seatD: 470,
    overallW: 650, overallD: 660, overallH: 1010, casterBase: 650, backAboveSeat: 560,
  });
});

test('㉒㉓ U 테이블 형상·정원이 그대로다', () => {
  assert.equal(BIG_U.outerW, 12000);
  assert.equal(BIG_U.outerD, 6500);
  assert.equal(BIG_U.surfaceY, 740);
  assert.equal(BIG_U.topThk, 25);
  assert.equal(BIG_U.frontR, 180);
  assert.equal(BIG_U.innerR, 120);
  assert.equal(BIG_U.rearR, 60);
  assert.equal(BIG_U.supports.length, 11);
  assert.equal(BIG_U.maxSpan, 2186);
  assert.equal(BIG.capacity, 30);
});

test('㉔㉕ 대기업·임원 회의실 배치가 한 자리도 바뀌지 않았다', () => {
  for (const [W, D] of [[8000, 7000], [11000, 9000], [14000, 11000]]) {
    const a = layoutRoom('meeting', defaultOptions('meeting'), { W, D, ledBottom: 1000 });
    const b = layoutRoom('meeting', defaultOptions('meeting'),
      { W, D, ledBottom: 1000, design: 'corporateMeeting' });
    assert.deepEqual(b.items, a.items, `${W}: 대기업 배치가 달라졌다`);
    assert.equal(a.items.filter(i => i.type === 'monitor').length, 0, '대기업에 모니터가 생겼다');
  }
  for (const [W, D, seats] of [[11000, 9000, 14], [13000, 11000, 20]]) {
    const a = lay(W, D, seats, null), b = lay(W, D, seats, 'executiveBoardroom');
    assert.deepEqual(b.items, a.items, `${W}: 임원 배치가 달라졌다`);
    assert.equal(b.items.filter(i => i.type === 'monitor' || i.type === 'prompter').length, 0,
      '임원 회의실에 AV 장비가 생겼다');
  }
});

test('㉖ 다른 용도의 방에는 AV 항목이 하나도 생기지 않는다', () => {
  for (const t of ['classroom', 'hall_s', 'hall_m', 'hall_l', 'control', 'ideation']) {
    const a = layoutRoom(t, defaultOptions(t), { W: 14000, D: 16000, ledBottom: 1000 });
    const b = layoutRoom(t, defaultOptions(t),
      { W: 14000, D: 16000, ledBottom: 1000, design: 'largeConference' });
    assert.deepEqual(b.items, a.items, `${t}: 배치가 달라졌다`);
  }
  assert.equal(wantsConferenceAV('largeConference'), true);
  for (const d of ['corporateMeeting', 'executiveBoardroom', 'controlRoom', null, undefined]) {
    assert.equal(wantsConferenceAV(d), false, String(d));
  }
});

// ── E. 범위 ────────────────────────────────────────────────────────────────

test('㉗㉘ 상황실 AV 는 PHASE 5-c 에서 생겼다 — 대회의실 AV 와 섞이지 않는다', () => {
  // 상황실 장비가 대회의실 배치에 새어 들어오지 않아야 한다(반대 방향도 마찬가지).
  for (const id of ['consoleMonitor', 'keyboard']) {
    assert.equal(FURNITURE_CONTRACTS[id].status, CONTRACT_STATUS.IMPLEMENTED, id);
    assert.equal(hasRuntimeFurnitureAsset(id), true, id);
  }
  const res = layoutRoom('meeting', { ...defaultOptions('meeting'), seats: 24, tableShape: 'u' },
    { W: 14000, D: 10000, design: 'largeConference' });
  for (const it of res.items) {
    assert.notEqual(it.asset, 'consoleMonitor', '대회의실에 상황실 모니터가 새어 들어갔다');
    assert.notEqual(it.asset, 'keyboard', '대회의실에 키보드가 새어 들어갔다');
  }
});

test('㉙㉚㉛ 대회의실 벽 구성·소품은 그대로 planned 다 (마감 4-d.1 · 조명 4-d.2 · 화각 4-d.3)', () => {
  const d = ROOM_DESIGNS.largeConference;
  assert.equal(d.camera, 'conferenceProposal', '화각은 PHASE 4-d.3 에서 켜졌다');
  for (const k of ['wallTreatment', 'accessories']) {
    assert.ok(isPlanned(d[k]), `${k}: 이번 단계에서 건드렸다`);
  }
  assert.deepEqual(d.furniture.av.slice(0, 2), ['personalMonitor', 'prompter']);
  assert.ok(isPlanned(d.furniture.av[2]), 'AV 수납장은 아직 planned 다');
});

// ── F. 재질 · 순수성 · 무회귀 ───────────────────────────────────────────────

test('㉜ 정식 재질 13종이 그대로다(새로 만들지 않았다)', () => {
  assert.equal(Object.keys(MATERIAL_PRESETS).length, 13);
  for (const k of ['monitorBody', 'monitorStand', 'prompterBody']) {
    const f = finishForPart(k);
    assert.ok(f && f.color, `${k}: 색이 없다 — 재질 없는 메시는 화면에서 하얗게 뜬다`);
    assert.equal(f.material, 'blackEquipment', `${k}: 기존 재질을 벗어났다`);
    assert.ok(PART_FINISH[k], `${k}: 마감 표에서 사라졌다`);
  }
  // 화면은 실내 마감재가 아니다 — **색을 재질이 들고 다니지 않는다.**
  //   질감(거칠기·금속성)만 적혀 있고 색은 없다 → 기존 색 경로가 그대로 쓰인다.
  const scr = finishForPart('screen');
  assert.ok(scr && !scr.color, '꺼진 화면에 재질 색이 생겼다');
  assert.ok(FURNITURE_COLORS.screen, '꺼진 화면 색이 없다');
  // 쓰는 부품 이름이 전부 계약 안에 있다.
  for (const p of createPersonalMonitor()) assert.ok(MC.parts.includes(p.kind), p.kind);
  for (const p of createPrompter()) assert.ok(PC.parts.includes(p.kind), p.kind);
  assert.equal(Object.keys(MATERIAL_PRESETS).length, 13, '정식 재질이 늘었다');
});

test('㉝ 순수 유지 — 자리 계산에 Three.js·DOM 이 없다', () => {
  assert.ok(!/\bTHREE\b|document|window/.test(avSrc), 'conference-av 가 순수하지 않다');
  assert.equal(typeof globalThis.document, 'undefined');
  const a = conferenceAVItems({
    chairs: of(BIG, 'chair'),
    table: { cx: 8000, cz: 6500, outerW: 12000, outerD: 6500, segW: 900 },
    chairClear: FURNITURE.chairClear,
  });
  assert.deepEqual(a.items, conferenceAVItems({
    chairs: of(BIG, 'chair'),
    table: { cx: 8000, cz: 6500, outerW: 12000, outerD: 6500, segW: 900 },
    chairClear: FURNITURE.chairClear,
  }).items, '같은 입력인데 결과가 다르다');
  assert.equal(conferenceAVItems({}).prompter, null, '테이블이 없으면 프롬프터도 없다');
  assert.equal(conferenceAVItems({}).monitors.length, 0);
});

test('㉞ LED 계산기(삼성 정합성)는 이 단계와 무관하게 그대로다', () => {
  const m = MODELS.find(x => x.id === 'MP012F');
  const r = computeConfig(m, 6000, 3400, { mode: 'manual', cols: 7, rows: 6 });
  assert.equal(r.total, 42);
  assert.equal(r.resW, 4480);
  assert.equal(r.maxW, 6132);
});

test('㉟ 가격표는 로컬 전용 동작 그대로다', () => {
  assert.match(appSrc, /await import\('\.\/prices\.local\.js\?v=\d+'\)\)\.PRICES; \} catch \{ PRICES = null; \}/);
  assert.equal(existsSync(new URL('../src/prices.local.js', import.meta.url)), false,
    '가격 정보가 저장소에 들어왔다(오너 지침 §5 위반)');
});

test('㊱ 기준 수치 고정 — 16 × 12m · 30석 AV', () => {
  const M = personalMonitorSize(), P = prompterSize();
  assert.equal(Math.round(M.panelW * 10) / 10, 559.3);
  assert.equal(Math.round(M.panelH * 10) / 10, 326.9);
  assert.equal(Math.round(P.panelW * 10) / 10, 515);
  assert.equal(Math.round(P.panelH * 10) / 10, 302);
  assert.equal(MONITOR_EDGE_INSET, 250);
  assert.equal(PROMPTER_HEADER_GAP, 1200);
  assert.equal(PROMPTER_FLOOR_RISE, 560);
  const mEnv = envelope(createPersonalMonitor()), pEnv = envelope(createPrompter());
  assert.equal(Math.round(mEnv.y1), 459, '모니터 높이(상판 기준)');
  assert.equal(Math.round(pEnv.y1), 952, '프롬프터 높이(바닥 기준)');
  assert.equal(of(BIG, 'monitor').length, 30);
  assert.equal(of(BIG, 'prompter')[0].z, 7650);
  assert.equal(assetParts({ type: 'monitor', asset: 'personalMonitor' }).length, 4);
  assert.equal(assetParts({ type: 'prompter', asset: 'prompter' }).length, 4);
});
