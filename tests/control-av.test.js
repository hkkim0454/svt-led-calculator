// control-av.test.js — 상황실 콘솔 AV(운용 모니터·키보드) 회귀 테스트. (PHASE 5-c)
// ─────────────────────────────────────────────────────────────────────────────
// 여기서 지키는 것.
//   ① 개수가 **콘솔에서 파생되는가** — 콘솔이 줄면 AV도 줄고, 떠 있는 장비가 없는가.
//   ② **곡선 상판 위에 온전히 얹혀 있는가** — 네모난 봉투가 아니라 **실제 휜 상판**으로 검사한다.
//   ③ 단 높이를 물려받는가 — 두 번 더하지도, 무시하지도 않는가.
//   ④ 화면이 운용자를 바라보는가 — 180° 뒤집히지 않았는가.
//   ⑤ 이번 단계가 **AV 단계**로 남는가 — 콘솔·의자·배치·마감을 건드리지 않았는가.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FURNITURE_ASSETS, assetFor, assetKey, assetParts,
  createConsoleMonitor, createKeyboard, createCurvedConsole, createTaskChair,
  createPersonalMonitor, createCorporateChair, createExecutiveChair, createConferenceErgoChair,
} from '../src/furniture-assets.js';
import { FURNITURE_CONTRACTS, CONTRACT_STATUS } from '../src/furniture-contracts.js';
import {
  resolveFurnitureForDesign, hasRuntimeFurnitureAsset, RUNTIME_CATEGORY,
} from '../src/furniture-routing.js';
import { ROOM_DESIGNS, isPlanned, designsFor, normalizeDesign } from '../src/room-design.js';
import { MATERIAL_IDS, PART_FINISH, finishForPart } from '../src/materials.js';
import { layoutRoom, defaultOptions, FURNITURE, wantsControlAV, CONSOLE_AV_DESIGNS } from '../src/room-presets.js';
import {
  controlAVItems, consoleMonitorSize, keyboardSize, consoleSag, consoleCurve,
  consoleFrontEdgeZ, consoleRearEdgeZ, onConsoleTop,
  MONITORS_PER_CONSOLE, KEYBOARDS_PER_CONSOLE, MONITOR_PAIR_SPAN, MONITOR_LOCAL_Z, KEYBOARD_EDGE_GAP,
} from '../src/control-av.js';

const CM = FURNITURE_CONTRACTS.consoleMonitor;
const KB = FURNITURE_CONTRACTS.keyboard;
const M = consoleMonitorSize(), K = keyboardSize();
const monParts = createConsoleMonitor(), kbParts = createKeyboard();
const geoSrc = readFileSync(new URL('../src/geometry-gl.js', import.meta.url), 'utf8');
const avSrc = readFileSync(new URL('../src/control-av.js', import.meta.url), 'utf8');

const STAND_W = Math.max(...monParts.filter(p => p.kind === 'monitorStand').map(p => p.w));
const STAND_D = Math.max(...monParts.filter(p => p.kind === 'monitorStand').map(p => p.d));

function control(W, D2, H, over = {}) {
  const o = { ...defaultOptions('control'), ...over };
  const res = layoutRoom('control', o, { W, D: D2, H, design: 'controlRoom' });
  const by = t => res.items.filter(i => i.type === t);
  return { res, consoles: by('console'), monitors: by('monitor'), keyboards: by('keyboard'),
    chairs: by('chair'), tables: by('table') };
}
function rect(x, z, w, d) { return { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 }; }
function gap(a, b) {
  const gx = Math.max(a.x0 - b.x1, b.x0 - a.x1);
  const gz = Math.max(a.z0 - b.z1, b.z0 - a.z1);
  return (gx >= 0 || gz >= 0) ? Math.max(gx, gz) : -Math.min(-gx, -gz);
}
/** 그 물건의 네 모서리가 전부 곡선 상판 위인가. */
function cornersOnTop(localX, localZ, w, d, cw, cd) {
  const sag = consoleSag(cd);
  for (const cx of [localX - w / 2, localX + w / 2]) {
    for (const cz of [localZ - d / 2, localZ + d / 2]) {
      if (!onConsoleTop(cx, cz, cw, cd, sag)) return false;
    }
  }
  return true;
}

// ── A. 계약 ─────────────────────────────────────────────────────────────────

test('① 운용 모니터 계약이 그대로다', () => {
  assert.equal(CM.category, 'av');
  assert.equal(CM.family, 'displayDevice');
  assert.equal(CM.instancing, 'instanced');
  assert.deepEqual([...CM.rooms], ['controlRoom']);
  assert.deepEqual({ ...CM.dimensions }, { nominalInches: 27, depth: 60, standH: 160, tiltDeg: 10 });
  assert.deepEqual({ ...CM.footprint }, { w: 630, d: 220 });
  assert.deepEqual([...CM.parts], ['monitorBody', 'monitorStand', 'screen']);
});

test('② 키보드 계약이 그대로다 — 부품 1종', () => {
  assert.equal(KB.category, 'av');
  assert.equal(KB.instancing, 'instanced');
  assert.deepEqual({ ...KB.dimensions }, { w: 440, d: 150, h: 22 });
  assert.deepEqual({ ...KB.footprint }, { w: 440, d: 150 });
  assert.deepEqual([...KB.parts], ['keyboardBody']);
  assert.equal(KB.parts.length, 1, '부품을 쪼개면 그리기 호출이 그대로 두 배가 된다');
});

test('③ 둘 다 런타임에 있고, 계약 상태가 **구현됨**이다', () => {
  for (const [id, c] of [['consoleMonitor', CM], ['keyboard', KB]]) {
    const a = FURNITURE_ASSETS[id];
    assert.ok(a, `${id}: 런타임 카탈로그에 없다`);
    assert.equal(a.instanced, true, `${id}: 콘솔마다 깔리므로 인스턴싱 대상이어야 한다`);
    assert.equal(a.sized, false);
    assert.equal(c.status, CONTRACT_STATUS.IMPLEMENTED, id);
    assert.equal(RUNTIME_CATEGORY[id], 'av', id);
    assert.equal(hasRuntimeFurnitureAsset(id), true, id);
    assert.equal(assetFor({ type: 'av', asset: id }), id, id);
  }
});

test('④ **대신 그리지 않는다** — 상황실 AV가 다른 장비로 바뀌지 않는다', () => {
  for (const id of ['consoleMonitor', 'keyboard']) {
    const r = resolveFurnitureForDesign({ type: 'av', asset: id }, 'controlRoom');
    assert.equal(r.requestedAsset, id);
    assert.equal(r.runtimeAsset, id, `${id}: 다른 장비로 대체됐다`);
    assert.equal(r.implemented, true, id);
    assert.equal(r.fallbackUsed, false, id);
    assert.equal(r.contractStatus, CONTRACT_STATUS.IMPLEMENTED, id);
  }
  assert.deepEqual([...ROOM_DESIGNS.controlRoom.furniture.av], ['consoleMonitor', 'keyboard']);
  for (const a of ROOM_DESIGNS.controlRoom.furniture.av) assert.equal(isPlanned(a), false);
});

// ── B. 형상 ─────────────────────────────────────────────────────────────────

test('⑤ 모니터 형상이 계약대로다 — 27인치 · 받침 160 · 기울기 10°', () => {
  const kinds = [...new Set(monParts.map(p => p.kind))].sort();
  assert.deepEqual(kinds, ['monitorBody', 'monitorStand', 'screen']);
  const body = monParts.find(p => p.kind === 'monitorBody');
  assert.equal(body.tiltX, CM.dimensions.tiltDeg, '본체 기울기가 계약과 다르다');
  assert.equal(body.d, CM.dimensions.depth);
  assert.ok(Math.abs(body.w - M.panelW) < 1e-6);
  // 받침 밑면이 상판 윗면(자산 기준 y=0)에 정확히 닿는다.
  const bottom = Math.min(...monParts.map(p => p.y - p.h / 2));
  assert.equal(bottom, 0, `모니터 밑면이 ${bottom} — 상판 위에 놓이는 물건이다`);
  // 본체 아랫변이 받침 높이 근처에 온다(계약 standH).
  assert.ok(Math.abs((body.y - body.h / 2) - CM.dimensions.standH) < 1, '받침 높이가 계약과 다르다');
  // 폭이 계약 발자국 안이다.
  assert.ok(M.panelW <= CM.footprint.w, `본체 폭 ${M.panelW} > 계약 ${CM.footprint.w}`);
  assert.ok(STAND_D <= CM.footprint.d, `받침 깊이 ${STAND_D} > 계약 ${CM.footprint.d}`);
  // **두 번째 모니터 틀을 만들지 않았다** — 개인 모니터와 부품 구성이 같다.
  assert.deepEqual([...new Set(createPersonalMonitor().map(p => p.kind))].sort(), kinds);
  // 둥글림이 계약 발자국을 밀어내지 않는다. 27인치 패널(625.7)에 계약 여유가 4.3mm 뿐이라
  //   둥글림이 크면 화면 실측이 630을 넘는다(실제로 r=10 일 때 634.7 이 나왔다).
  //   (둥글림 4 에서 화면 실측 629.3 — 계약 630 안이다. 여기서는 그 선택을 고정만 한다.)
  assert.ok(body.r <= 5, `본체 둥글림 ${body.r} — 화면 실측이 계약 발자국을 넘긴다`);
  assert.ok(M.panelW <= CM.footprint.w, `패널 폭 ${M.panelW.toFixed(1)} > 계약 ${CM.footprint.w}`);
});

test('⑥ 키보드 형상이 계약대로다 — 얇은 판 하나', () => {
  assert.equal(kbParts.length, 1, '부품이 하나가 아니다');
  const p = kbParts[0];
  assert.equal(p.kind, 'keyboardBody');
  assert.equal(p.w, K.w); assert.equal(p.d, K.d); assert.equal(p.h, K.h);
  assert.equal(p.y - p.h / 2, 0, '키보드가 상판에서 뜨거나 파고든다');
  assert.ok(p.h <= 30, '키보드가 두껍다');
  // **둥글리지 않는다** — 계약 치수가 곧 발자국이라 여유가 0이고, 둥글리면 넘친다(실측 445.4).
  //   제안서 거리에서 보이지도 않으면서 삼각형만 236 → 12 로 차이가 난다.
  assert.equal(p.r, undefined, '키보드를 둥글렸다 — 계약 발자국을 넘긴다');
  assert.equal(p.shape, 'box');
});

test('⑦ 키보드 마감에 **색이 있다** — 없으면 화면에서 하얗게 뜬다', () => {
  // 임원 의자 헤드레스트에서 한 번 겪은 함정이다(색 없는 부품은 재질을 못 받는다).
  for (const kind of ['keyboardBody', 'monitorBody', 'monitorStand']) {
    const fin = finishForPart(kind);
    assert.ok(fin, `${kind}: 마감표에 없다`);
    assert.ok(fin.color, `${kind}: 색이 없다 — 화면에서 하얗게 뜬다`);
    assert.equal(fin.material, 'blackEquipment', `${kind}: AV 하드웨어 재질이 아니다`);
  }
  assert.equal(MATERIAL_IDS.length, 13, `정식 재질이 ${MATERIAL_IDS.length}종이 됐다`);
});

// ── C. 개수와 파생 ──────────────────────────────────────────────────────────

test('⑧ 콘솔 1대에 모니터 2대 + 키보드 1개', () => {
  assert.equal(MONITORS_PER_CONSOLE, 2);
  assert.equal(KEYBOARDS_PER_CONSOLE, 1);
  assert.equal(FURNITURE_CONTRACTS.curvedConsole.dimensions.monitorRow, MONITORS_PER_CONSOLE,
    '계약의 monitorRow 와 V1 규칙이 어긋난다');
  const av = controlAVItems({ consoles: [{ x: 0, z: 0, y: 0, rotY: 0, w: 1800, d: 900 }] });
  assert.equal(av.monitors.length, 2);
  assert.equal(av.keyboards.length, 1);
  assert.equal(av.items.length, 3);
});

test('⑨ 방 3종 — 개수가 콘솔에서 저절로 나온다', () => {
  for (const [W, D2, H, consoles] of [[10000, 8000, 3400, 4], [12000, 10000, 3600, 4], [16000, 14000, 3900, 8]]) {
    const r = control(W, D2, H);
    assert.equal(r.consoles.length, consoles, `${W}×${D2}: 콘솔 수가 바뀌었다`);
    assert.equal(r.monitors.length, consoles * 2, `${W}×${D2}: 모니터`);
    assert.equal(r.keyboards.length, consoles, `${W}×${D2}: 키보드`);
    assert.equal(r.res.placed.monitors, consoles * 2);
    assert.equal(r.res.placed.keyboards, consoles);
  }
});

test('⑩ 떠 있는 장비가 없다 — 모든 AV가 어떤 콘솔에 속한다', () => {
  for (const [W, D2] of [[10000, 8000], [16000, 14000]]) {
    const { consoles, monitors, keyboards } = control(W, D2, 3600);
    for (const m of monitors) {
      assert.ok(consoles.some(c => Math.abs(c.x - m.x) <= MONITOR_PAIR_SPAN / 2 + 1
        && Math.abs(c.z - m.z) <= 500 && (c.y || 0) + 730 === m.y), '주인 없는 모니터');
    }
    for (const k of keyboards) {
      assert.ok(consoles.some(c => c.x === k.x && Math.abs(c.z - k.z) <= 500), '주인 없는 키보드');
    }
  }
  // 콘솔이 줄면 AV도 같이 준다(방을 좁혀 확인).
  const small = control(7000, 6000, 3200);
  assert.equal(small.monitors.length, small.consoles.length * 2);
  assert.equal(small.keyboards.length, small.consoles.length);
  assert.ok(small.consoles.length < 4, '방을 좁혔는데 콘솔이 줄지 않았다 — 검사가 무의미해진다');
});

test('⑪ 다른 공간에는 상황실 AV가 하나도 생기지 않는다', () => {
  assert.deepEqual([...CONSOLE_AV_DESIGNS], ['controlRoom']);
  assert.equal(wantsControlAV('controlRoom'), true);
  for (const d of ['corporateMeeting', 'executiveBoardroom', 'largeConference', null, undefined]) {
    assert.equal(wantsControlAV(d), false, String(d));
  }
  // 디자인을 주지 않으면 상황실이라도 AV가 붙지 않는다(기존 화면 그대로).
  const plain = layoutRoom('control', defaultOptions('control'), { W: 16000, D: 14000, H: 3900 });
  assert.equal(plain.items.filter(i => i.type === 'monitor').length, 0);
  assert.equal(plain.items.filter(i => i.type === 'keyboard').length, 0);
  for (const room of ['meeting', 'classroom', 'hall_m', 'ideation']) {
    const res = layoutRoom(room, defaultOptions(room), { W: 12000, D: 10000, H: 3600, design: 'controlRoom' });
    assert.equal(res.items.filter(i => i.asset === 'consoleMonitor').length, 0, room);
    assert.equal(res.items.filter(i => i.asset === 'keyboard').length, 0, room);
  }
});

// ── D. 자리 ─────────────────────────────────────────────────────────────────

test('⑫ 모니터가 운용자를 바라본다 — 180° 뒤집히지 않았다', () => {
  for (const rotY of [0, 90, 180, 270]) {
    const av = controlAVItems({ consoles: [{ x: 0, z: 0, y: 0, rotY, w: 1800, d: 900 }] });
    for (const m of av.monitors) assert.equal(m.rotY, (rotY + 180) % 360, `콘솔 ${rotY}°`);
    assert.equal(av.keyboards[0].rotY, rotY, `키보드는 콘솔과 같은 방향이어야 한다 (${rotY}°)`);
  }
  // **방향만이 아니라 자리도 돌아야 한다.** 지금 배치는 전부 rotY 0 이라
  //   회전을 무시해도 화면이 똑같다 — 그래서 여기서 자리까지 직접 고정한다(사양서 §7).
  //   로컬 (dx, dz) → 월드: rotY 90° 면 로컬 좌우가 **월드 앞뒤**로 간다.
  {
    const c = { x: 5000, z: 3000, y: 0, rotY: 90, w: 1800, d: 900 };
    const av = controlAVItems({ consoles: [c] });
    const [a, b] = av.monitors;
    assert.equal(a.x, b.x, 'rotY 90° 인데 짝이 좌우로 벌어졌다 — 회전을 무시했다');
    assert.equal(a.x, c.x + MONITOR_LOCAL_Z, '모니터가 콘솔 로컬 앞뒤 축을 따라가지 않았다');
    assert.equal(Math.abs(a.z - b.z), MONITOR_PAIR_SPAN, '짝 간격이 월드 앞뒤로 나오지 않았다');
    assert.equal(a.z + b.z, 2 * c.z, '짝이 콘솔 중심을 기준으로 대칭이 아니다');
    const k = av.keyboards[0];
    assert.equal(k.z, c.z, 'rotY 90° 에서 키보드가 좌우로 치우쳤다');
    assert.ok(k.x > c.x, '키보드가 운용자 쪽(로컬 +Z = 월드 +X)으로 가지 않았다');
  }
  {
    const c = { x: 0, z: 0, y: 0, rotY: 180, w: 1800, d: 900 };
    const k = controlAVItems({ consoles: [c] }).keyboards[0];
    assert.ok(k.z < 0, 'rotY 180° 에서 키보드가 반대쪽으로 갔다 — 회전을 무시했다');
  }
  // 배치가 주는 실제 콘솔(rotY 0)에서 화면은 +Z(운용자) 쪽을 본다.
  const { monitors, consoles, chairs } = control(16000, 14000, 3900);
  for (const m of monitors) assert.equal(m.rotY, 180);
  // 의자는 콘솔 뒤(+Z)에 있다 — 화면이 그쪽을 본다는 뜻이다.
  for (const c of consoles) assert.ok(chairs.some(h => h.x === c.x && h.z > c.z), '의자가 콘솔 앞에 있다');
});

test('⑬ 짝 모니터가 좌우 대칭이고 서로 겹치지 않는다', () => {
  const av = controlAVItems({ consoles: [{ x: 5000, z: 3000, y: 0, rotY: 0, w: 1800, d: 900 }] });
  const [a, b] = av.monitors;
  assert.equal(a.z, b.z, '짝이 앞뒤로 어긋났다');
  assert.equal(a.x + b.x, 2 * 5000, '좌우 대칭이 아니다');
  assert.equal(Math.abs(a.x - b.x), MONITOR_PAIR_SPAN);
  // 본체끼리 닿지 않는다.
  assert.ok(MONITOR_PAIR_SPAN > M.panelW, `짝 간격 ${MONITOR_PAIR_SPAN} ≤ 본체 폭 ${M.panelW}`);
  assert.ok(gap(rect(a.x, a.z, M.panelW, STAND_D), rect(b.x, b.z, M.panelW, STAND_D)) > 0, '짝이 겹친다');
  // 본체 바깥 끝이 콘솔 폭 안이다.
  assert.ok(MONITOR_PAIR_SPAN / 2 + M.panelW / 2 <= 1800 / 2, '모니터가 콘솔 옆으로 나갔다');
});

test('⑭ **곡선 상판 위에 온전히 얹혀 있다** — 네모 봉투가 아니라 실제 휜 상판으로 잰다', () => {
  const w = 1800, d = 900;
  // 받침 네 모서리
  for (const sign of [-1, 1]) {
    assert.ok(cornersOnTop(sign * MONITOR_PAIR_SPAN / 2, MONITOR_LOCAL_Z, STAND_W, STAND_D, w, d),
      '모니터 받침이 상판 밖으로 나갔다');
  }
  // 키보드 네 모서리
  const kz = consoleFrontEdgeZ(0, w, d) - KEYBOARD_EDGE_GAP - K.d / 2;
  assert.ok(cornersOnTop(0, kz, K.w, K.d, w, d), '키보드가 상판 밖으로 나갔다');
  // 키보드는 앞 모서리를 넘지 않는다(운용자 쪽으로 튀어나오지 않는다).
  assert.ok(kz + K.d / 2 <= consoleFrontEdgeZ(0, w, d), '키보드가 앞 모서리를 넘었다');
  // 키보드와 받침이 겹치지 않는다.
  assert.ok(kz - K.d / 2 > MONITOR_LOCAL_Z + STAND_D / 2, '키보드가 모니터 받침과 겹친다');
  // **곡선식은 한 곳에서만 온다** — 도형 쪽이 control-av 의 식을 가져다 쓴다.
  assert.match(geoSrc, /import \{ consoleCurve \} from '\.\/control-av\.js/,
    '도형이 곡선식을 따로 적고 있다 — 두 곳에 적으면 검사와 화면이 어긋난다');
  assert.match(avSrc, /export function consoleCurve/);
  assert.equal(consoleCurve(0.5, 180), 180);
  assert.equal(consoleCurve(0, 180), 0);
  assert.equal(consoleFrontEdgeZ(0, 1800, 900), 900 / 2 - 180);
  assert.equal(consoleRearEdgeZ(0, 1800, 900), 900 / 2 - 180 - (900 - 180));
});

test('⑮ 단 높이를 그대로 물려받는다 — 두 번 더하지도, 무시하지도 않는다', () => {
  const surfaceY = FURNITURE_CONTRACTS.curvedConsole.dimensions.surfaceY;
  for (const y of [0, 200, 400]) {
    const av = controlAVItems({ consoles: [{ x: 0, z: 0, y, rotY: 0, w: 1800, d: 900 }] });
    for (const it of av.items) assert.equal(it.y, y + surfaceY, `콘솔 y=${y}`);
  }
  for (const tiers of [1, 2, 3]) {
    const { consoles, monitors, keyboards } = control(16000, 14000, 3900, { tiers });
    for (const c of consoles) {
      const want = (c.y || 0) + surfaceY;
      const mine = [...monitors, ...keyboards].filter(i => Math.abs(i.z - c.z) <= 500
        && Math.abs(i.x - c.x) <= MONITOR_PAIR_SPAN / 2 + 1);
      assert.ok(mine.length >= 3, `tiers=${tiers}: 콘솔에 AV가 모자란다`);
      for (const i of mine) assert.equal(i.y, want, `tiers=${tiers}: AV 높이가 단을 따라오지 않았다`);
    }
  }
});

test('⑯ 겹침이 없다 — 짝·이웃 콘솔·의자·키보드·뒤 테이블·벽', () => {
  for (const [W, D2, ov] of [[10000, 8000, {}], [12000, 10000, {}], [16000, 14000, {}],
    [16000, 14000, { tiers: 2 }]]) {
    const { monitors, keyboards, chairs, tables, consoles } = control(W, D2, 3600, ov);
    const mb = monitors.map(m => rect(m.x, m.z, M.panelW, STAND_D));
    const kb = keyboards.map(k => rect(k.x, k.z, K.w, K.d));
    const chb = chairs.map(c => rect(c.x, c.z, 620, 630));
    for (let i = 0; i < mb.length; i++) {
      for (let j = i + 1; j < mb.length; j++) assert.ok(gap(mb[i], mb[j]) > 0, `${W}×${D2}: 모니터끼리 겹친다`);
      for (const k of kb) assert.ok(gap(mb[i], k) > 0, `${W}×${D2}: 모니터가 키보드와 겹친다`);
      for (const c of chb) assert.ok(gap(mb[i], c) > 0, `${W}×${D2}: 모니터가 의자와 겹친다`);
      for (const t of tables) assert.ok(gap(mb[i], rect(t.x, t.z, t.w, t.d)) > 0, `${W}×${D2}: 모니터가 뒤 테이블과 겹친다`);
      assert.ok(mb[i].x0 > 0 && mb[i].z0 > 0 && mb[i].x1 < W && mb[i].z1 < D2, `${W}×${D2}: 모니터가 벽을 뚫었다`);
    }
    for (let i = 0; i < kb.length; i++) {
      for (const c of chb) assert.ok(gap(kb[i], c) > 0, `${W}×${D2}: 키보드가 의자와 겹친다`);
      // 제 콘솔이 아닌 콘솔과는 겹치지 않는다.
      for (const c of consoles) {
        if (c.x === keyboards[i].x && Math.abs(c.z - keyboards[i].z) < 600) continue;
        assert.ok(gap(kb[i], rect(c.x, c.z, c.w, c.d)) > 0, `${W}×${D2}: 키보드가 이웃 콘솔과 겹친다`);
      }
    }
  }
});

// ── E. 인스턴싱·범위 ────────────────────────────────────────────────────────

test('⑰ 인스턴싱 — 대수가 늘어도 묶음이 늘지 않는다', () => {
  for (const id of ['consoleMonitor', 'keyboard']) {
    const it = { type: 'av', asset: id };
    assert.deepEqual(assetParts(it), assetParts({ ...it }), `${id}: 같은 자산인데 부품이 다르다`);
    const keys = [4, 8, 16].map(() => assetKey(it));
    assert.equal(new Set(keys).size, 1, `${id}: 대수에 따라 묶음이 갈렸다`);
    assert.equal(assetKey(it), id);
    assert.equal(FURNITURE_ASSETS[id].sized, false, `${id}: 크기가 열쇠에 섞이면 묶음이 쪼개진다`);
  }
  assert.equal(monParts.length, 4, '모니터 부품 수');
  assert.equal(kbParts.length, 1, '키보드 부품 수');
});

test('⑱ 콘솔·의자·배치가 그대로다 — 이번 단계는 AV 단계다', () => {
  // 콘솔 형상 동결
  const cons = createCurvedConsole(1800, 900);
  assert.equal(cons.length, 4);
  const top = cons.find(p => p.kind === 'consoleTop');
  assert.equal(top.y + top.h / 2, 730);
  assert.equal(top.sag, 180);
  assert.deepEqual([...new Set(cons.map(p => p.kind))].sort(), ['consoleBase', 'consoleTop']);
  // 콘솔 안에 AV가 다시 들어가지 않았다.
  for (const bad of ['monitor', 'monitorBody', 'monitorStand', 'screen', 'keyboardBody']) {
    assert.ok(!cons.some(p => p.kind === bad), `콘솔에 ${bad} 가 박혔다`);
  }
  // 의자 형상 동결
  assert.equal(createTaskChair().length, 10);
  // 배치 동결
  assert.equal(FURNITURE.consoleW, 1800);
  assert.equal(FURNITURE.consoleD, 900);
  assert.equal(FURNITURE.consolePitchX, 2000);
  assert.equal(FURNITURE.consolePitchZ, 2500);
  const { consoles, chairs, tables } = control(16000, 14000, 3900);
  assert.deepEqual([...new Set(consoles.map(c => c.z))], [3050, 5550]);
  assert.deepEqual([...new Set(consoles.map(c => c.rotY))], [0]);
  assert.equal(chairs.length, 16);
  assert.equal(tables[0].z, 11600);
});

test('⑲ 상황실 소품은 그대로 planned 다(가구·AV·마감·벽·조명·화각은 구현됐다)', () => {
  const d = ROOM_DESIGNS.controlRoom;
  assert.equal(d.status, 'ready', 'PHASE 5-e 릴리스 게이트를 통과했다(DEC-125)');
  assert.equal(d.palette, 'controlPalette', '마감은 PHASE 5-d.1 에서 생겼다');
  for (const m of Object.values(d.materials)) assert.equal(isPlanned(m), false, '재질이 아직 planned 다');
  assert.equal(d.wallTreatment, 'controlWalls', '벽 구성은 PHASE 5-d.2 에서 생겼다');
  assert.equal(d.lighting, 'controlTechnical', '조명은 PHASE 5-d.3 에서 생겼다');
  assert.equal(d.camera, 'controlProposal', '화각은 PHASE 5-d.4 에서 생겼다');
  assert.ok(isPlanned(d.accessories));
  // 상황실 전용 마감표가 생기지 않았다(콘솔·AV 부품은 전역 마감을 그대로 쓴다).
  for (const k of ['consoleTop', 'consoleBase']) assert.equal(PART_FINISH[k], undefined, k);
});

test('⑳ 앞선 세 공간이 그대로다 · 선택칸도 그대로다', () => {
  for (const [design, chair, table] of [['corporateMeeting', 'corporateChair', 'corporateTable'],
    ['executiveBoardroom', 'executiveChair', 'boardroomTable'],
    ['largeConference', 'conferenceErgoChair', 'largeUTable']]) {
    assert.equal(resolveFurnitureForDesign({ type: 'chair' }, design).runtimeAsset, chair, design);
    assert.equal(resolveFurnitureForDesign({ type: 'table' }, design).runtimeAsset, table, design);
  }
  assert.equal(createCorporateChair().length, 12);
  assert.equal(createExecutiveChair().length, 12);
  assert.equal(createConferenceErgoChair().length, 13);
  assert.deepEqual(designsFor('control').map(d => d.id), ['controlRoom']);
  for (const saved of [undefined, null, '', '없는디자인', 'largeConference']) {
    assert.equal(normalizeDesign(saved, 'control'), 'controlRoom', String(saved));
  }
});

test('㉑ 순수 유지 — control-av 는 Three.js·DOM을 부르지 않는다', () => {
  const code = avSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  for (const bad of [/THREE\./, /\bdocument\b/, /\bwindow\b/, /from 'three/, /geometry-gl/]) {
    assert.ok(!bad.test(code), `control-av 가 ${bad} 를 쓴다 — 순수 모듈이어야 한다`);
  }
  // 콘솔 좌표를 **읽기만** 한다(배치를 고치지 않는다).
  assert.ok(!/consoles\[\d+\]\s*\.\s*\w+\s*=/.test(code), '콘솔 항목을 고쳐 쓴다');
});
