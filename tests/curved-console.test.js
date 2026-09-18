// curved-console.test.js — 상황실 곡선 콘솔 데스크 회귀 테스트. (PHASE 5-b)
// ─────────────────────────────────────────────────────────────────────────────
// 여기서 지키는 것.
//   ① 계약이 유일한 치수 기준인가 — 도형 코드가 치수를 다시 적지 않았는가.
//   ② **발자국을 넘지 않는가** — 휨을 배치가 준 깊이 **안에서** 쓰는가.
//      (900 상판을 만든 뒤 180 더 부풀리면 발자국이 소리 없이 1,080이 된다.)
//   ③ **콘솔에 AV가 박혀 있지 않은가** — 모니터·키보드는 PHASE 5-c 의 몫이다.
//   ④ 배치·의자는 그대로인가 — 이번 단계는 콘솔 가구 형상 단계다.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FURNITURE_ASSETS, DIMS, assetFor, assetKey, assetParts,
  createCurvedConsole, createControlConsole, createTaskChair,
  createCorporateChair, createExecutiveChair, createConferenceErgoChair,
  CONSOLE_MIN_BAND_DEPTH,
} from '../src/furniture-assets.js';
import { FURNITURE_CONTRACTS, CONTRACT_STATUS } from '../src/furniture-contracts.js';
import {
  resolveFurnitureForDesign, hasRuntimeFurnitureAsset, RUNTIME_CATEGORY,
} from '../src/furniture-routing.js';
import { ROOM_DESIGNS, isPlanned, designsFor, normalizeDesign } from '../src/room-design.js';
import { MATERIAL_IDS, PART_FINISH, PART_MATERIAL } from '../src/materials.js';
import { layoutRoom, defaultOptions, FURNITURE } from '../src/room-presets.js';

const C = FURNITURE_CONTRACTS.curvedConsole;
const D = C.dimensions;
const parts = createCurvedConsole(1800, 900);
const kinds = [...new Set(parts.map(p => p.kind))].sort();
const assetsSrc = readFileSync(new URL('../src/furniture-assets.js', import.meta.url), 'utf8');
const geoSrc = readFileSync(new URL('../src/geometry-gl.js', import.meta.url), 'utf8');

/** 선언된 부품들이 차지하는 봉투. 휜 상판은 w/h/d 가 **휜 뒤의 실제 크기**다. */
function envelope(list) {
  let hx = 0, hz = 0, top = 0, bottom = Infinity;
  for (const p of list) {
    hx = Math.max(hx, Math.abs(p.dx || 0) + (p.w || 0) / 2);
    hz = Math.max(hz, Math.abs(p.dz || 0) + (p.d || 0) / 2);
    top = Math.max(top, (p.y || 0) + (p.h || 0) / 2);
    bottom = Math.min(bottom, (p.y || 0) - (p.h || 0) / 2);
  }
  return { w: hx * 2, d: hz * 2, h: top, bottom };
}

function control(W, D2, H, over = {}) {
  const o = { ...defaultOptions('control'), ...over };
  const res = layoutRoom('control', o, { W, D: D2, H });
  const by = t => res.items.filter(i => i.type === t);
  return { res, chairs: by('chair'), consoles: by('console'), tables: by('table') };
}
function rect(x, z, w, d, rotY) {
  const swap = (Math.round(Math.abs(rotY || 0)) % 180) === 90;
  const W = swap ? d : w, D2 = swap ? w : d;
  return { x0: x - W / 2, x1: x + W / 2, z0: z - D2 / 2, z1: z + D2 / 2 };
}
function gap(a, b) {
  const gx = Math.max(a.x0 - b.x1, b.x0 - a.x1);
  const gz = Math.max(a.z0 - b.z1, b.z0 - a.z1);
  return (gx >= 0 || gz >= 0) ? Math.max(gx, gz) : -Math.min(-gx, -gz);
}
/** 휜 상판의 운용자 쪽(+Z) 모서리 — 폭 위치 x 에서의 z. 가운데가 가장 물러난다. */
function operatorEdgeZ(x, w, d, sag) {
  const t = (x + w / 2) / w;
  return d / 2 - sag * (1 - (2 * t - 1) ** 2);
}

// ── A. 계약 ─────────────────────────────────────────────────────────────────

test('① 계약이 그대로 있고, 치수가 한 글자도 바뀌지 않았다', () => {
  assert.ok(C, '계약이 사라졌다');
  assert.equal(C.category, 'console');
  assert.equal(C.family, 'consoleDesk');
  assert.equal(C.instancing, 'sized');
  assert.equal(C.profile, 'curved');
  assert.equal(C.footprint, null);
  assert.deepEqual([...C.rooms], ['controlRoom']);
  assert.deepEqual({ ...D }, {
    surfaceY: 730, topThk: 40,
    minWidth: 1800, minDepth: 900,
    curveSagitta: 180, monitorRow: 2,
  }, '계약 치수를 말없이 바꿨다');
  assert.deepEqual([...C.parts], ['consoleTop', 'consoleBase']);
  // 마감은 **둘 다 null** 이다 — 상황실 마감은 PHASE 5-d.1 의 몫이다.
  assert.deepEqual({ ...C.finishParts }, { consoleTop: null, consoleBase: null });
});

test('② 런타임 카탈로그에 있고, 계약 상태가 **구현됨**으로 바뀌었다', () => {
  const a = FURNITURE_ASSETS.curvedConsole;
  assert.ok(a, '런타임 카탈로그에 없다');
  assert.equal(a.instanced, true, '콘솔은 한 방에 여러 대 깔린다 — 인스턴싱 대상이어야 한다');
  assert.equal(a.sized, true, '계약이 sized 다');
  assert.equal(C.status, CONTRACT_STATUS.IMPLEMENTED);
  assert.equal(RUNTIME_CATEGORY.curvedConsole, 'console');
  assert.equal(hasRuntimeFurnitureAsset('curvedConsole'), true);
  assert.equal(assetFor({ type: 'console', asset: 'curvedConsole' }), 'curvedConsole');
});

test('③ **대신 그리지 않는다** — 상황실 콘솔이 기존 직선 콘솔로 되돌아가지 않는다', () => {
  const r = resolveFurnitureForDesign({ type: 'console' }, 'controlRoom');
  assert.equal(r.requestedAsset, 'curvedConsole');
  assert.equal(r.runtimeAsset, 'curvedConsole', '아직 기존 콘솔로 대신 그린다');
  assert.notEqual(r.runtimeAsset, 'controlConsole');
  assert.equal(r.implemented, true);
  assert.equal(r.fallbackUsed, false, '대체가 일어났다');
  assert.equal(r.contractStatus, CONTRACT_STATUS.IMPLEMENTED);
  assert.equal(ROOM_DESIGNS.controlRoom.furniture.console, 'curvedConsole');
  assert.equal(isPlanned(ROOM_DESIGNS.controlRoom.furniture.console), false);
});

test('④ 치수의 기준은 **계약 하나**다 — 도형 코드가 치수를 다시 적지 않았다', () => {
  assert.deepEqual({ ...DIMS.curvedConsole }, { ...D }, '치수를 두 곳에 적었다');
  assert.match(assetsSrc, /curvedConsole: FURNITURE_CONTRACTS\.curvedConsole\.dimensions,/,
    'DIMS 가 계약을 직접 읽지 않는다');
  const body = assetsSrc.match(/export function createCurvedConsole[\s\S]*?\n}\n/)[0]
    .replace(/\/\/.*$/gm, '');
  for (const v of [730, 40, 180]) {
    assert.ok(!new RegExp(`[^.\\w]${v}[^.\\w\\d]`).test(body),
      `도형 코드에 계약 치수 ${v} 가 그대로 적혀 있다 — 계약을 읽어야 한다`);
  }
  assert.match(body, /DIMS\.curvedConsole/);
});

// ── B. 형상 ─────────────────────────────────────────────────────────────────

test('⑤ 부품 의미가 계약 그대로다 — 상판은 consoleTop, 다리는 consoleBase', () => {
  assert.deepEqual(kinds, ['consoleBase', 'consoleTop']);
  for (const k of kinds) assert.ok(C.parts.includes(k), `${k}: 계약에 없는 부품`);
  const top = parts.filter(p => p.kind === 'consoleTop');
  assert.equal(top.length, 1, '상판이 한 덩어리가 아니다 — 이음매가 생긴다');
  assert.equal(top[0].shape, 'curvedTop', '상판이 휜 도형이 아니다');
  assert.ok(parts.filter(p => p.kind === 'consoleBase').length >= 2, '지지 구조가 없다');
});

test('⑥ **AV가 박혀 있지 않다** — 모니터·키보드·화면은 PHASE 5-c 의 몫이다', () => {
  for (const bad of ['monitor', 'monitorBase', 'consoleMonitor', 'keyboard', 'screen', 'prompter', 'standPanel']) {
    assert.ok(!kinds.includes(bad), `콘솔 안에 ${bad} 가 들어 있다`);
  }
  assert.equal(kinds.length, 2, `부품 종류가 ${kinds} — 계약의 2종뿐이어야 한다`);
  // 기존 직선 콘솔은 반대로 모니터를 품고 있어야 한다(동결 확인 — 손대지 않았다).
  const legacy = [...new Set(createControlConsole(1800, 900).map(p => p.kind))];
  assert.ok(legacy.includes('monitor') && legacy.includes('monitorBase'),
    '기존 콘솔의 형상을 건드렸다');
});

test('⑦ 상판 윗면이 계약 높이에 정확히 온다 · 바닥은 0이다', () => {
  const top = parts.find(p => p.kind === 'consoleTop');
  assert.equal(top.y + top.h / 2, D.surfaceY, '상판 윗면이 계약과 다르다');
  assert.equal(top.h, D.topThk, '상판 두께가 계약과 다르다');
  const e = envelope(parts);
  assert.equal(e.bottom, 0, `콘솔 밑면이 ${e.bottom} — 배치가 주는 단 높이에 그대로 얹혀야 한다`);
  assert.equal(e.h, D.surfaceY, '가장 높은 곳이 상판 윗면이 아니다');
});

test('⑧ **발자국을 넘지 않는다** — 휨을 배치가 준 깊이 안에서 쓴다', () => {
  for (const [w, d] of [[1800, 900], [2000, 1000], [1800, 1200]]) {
    const e = envelope(createCurvedConsole(w, d));
    assert.ok(e.w <= w, `${w}×${d}: 폭 ${e.w} > ${w}`);
    assert.ok(e.d <= d, `${w}×${d}: 깊이 ${e.d} > ${d} — 휨이 발자국 밖으로 나갔다`);
  }
  // 상판은 발자국을 **꽉** 채운다(작게 만들어 피하지 않았다).
  const top = parts.find(p => p.kind === 'consoleTop');
  assert.equal(top.w, 1800);
  assert.equal(top.d, 900);
});

test('⑨ 휨이 계약값이고, 배치가 주는 크기에서 줄어들지 않는다', () => {
  const top = parts.find(p => p.kind === 'consoleTop');
  assert.equal(top.sag, D.curveSagitta, '휨이 계약값과 다르다');
  // 띠(책상면) 자체는 앉아서 쓸 수 있는 깊이로 남는다.
  assert.ok(CONSOLE_MIN_BAND_DEPTH > 0);
  assert.equal(900 - top.sag >= CONSOLE_MIN_BAND_DEPTH, true, '책상면이 선반처럼 얕아졌다');
  // 아주 얕은 콘솔에서는 휨이 줄어든다 — 발자국을 넘느니 덜 휘는 편이 낫다(가짜 스펙 금지).
  const shallow = createCurvedConsole(1800, 600).find(p => p.kind === 'consoleTop');
  assert.ok(shallow.sag < D.curveSagitta, '얕은 콘솔인데 휨이 그대로다');
  assert.ok(shallow.sag >= 0);
});

test('⑩ 휘는 방향이 **정해져 있다** — 날개가 운용자 쪽, 가운데가 물러난다', () => {
  const top = parts.find(p => p.kind === 'consoleTop');
  const w = top.w, d = top.d, sag = top.sag;
  const end = operatorEdgeZ(-w / 2, w, d, sag), mid = operatorEdgeZ(0, w, d, sag);
  assert.equal(end, d / 2, '날개가 발자국 끝까지 나오지 않는다');
  assert.equal(mid, d / 2 - sag, '가운데가 물러나지 않는다');
  assert.ok(mid < end, '방향이 뒤집혔다 — 가운데가 운용자 쪽으로 나왔다');
  // 도형 코드에도 그 방향이 **한 곳에** 적혀 있어야 한다(양쪽에 적으면 언젠가 어긋난다).
  assert.match(geoSrc, /function curvedDeskShape/);
  assert.match(geoSrc, /-span \/ 2 \+ curve\(t\)/, '윤곽의 방향 식이 바뀌었다');
});

test('⑪ 무릎 자리가 열려 있다 — 통짜 상자가 아니다', () => {
  const base = parts.filter(p => p.kind === 'consoleBase');
  const solid = base.reduce((a, p) => a + p.w * p.d, 0);
  assert.ok(solid < 1800 * 900 * 0.35,
    `다리가 발자국의 ${(solid / (1800 * 900) * 100).toFixed(0)}% 를 막는다 — 무릎 자리가 없다`);
  // 기존 콘솔은 반대로 통짜였다(무엇이 좋아졌는지 고정한다).
  const legacyBase = createControlConsole(1800, 900).filter(p => p.kind === 'consoleBase');
  const legacySolid = legacyBase.reduce((a, p) => a + p.w * p.d, 0);
  assert.ok(legacySolid > solid * 2, '기존 콘솔이 더 이상 통짜가 아니다 — 비교 기준이 깨졌다');
  // 다리는 전부 상판 아래에 있다(밖으로 삐져나오지 않는다).
  const top = parts.find(p => p.kind === 'consoleTop');
  for (const p of base) {
    assert.ok(Math.abs(p.dx) + p.w / 2 <= top.w / 2, 'consoleBase 가 상판 폭 밖으로 나갔다');
    assert.ok(p.y + p.h / 2 <= D.surfaceY - D.topThk + 1e-6, 'consoleBase 가 상판을 뚫는다');
  }
});

// ── C. 배치 동결 ────────────────────────────────────────────────────────────

test('⑫ 소형(10×3.4×8m) — 콘솔 4대 / 의자 12석, 좌표 그대로', () => {
  const { consoles, chairs } = control(10000, 8000, 3400);
  assert.equal(consoles.length, 4);
  assert.equal(chairs.length, 12);
  assert.deepEqual(consoles.map(c => c.x), [2000, 4000, 6000, 8000]);
  assert.deepEqual([...new Set(consoles.map(c => c.z))], [3050]);
});

test('⑬ 중형(12×3.6×10m) — 콘솔 4대 / 의자 12석', () => {
  const { consoles, chairs } = control(12000, 10000, 3600);
  assert.equal(consoles.length, 4);
  assert.equal(chairs.length, 12);
  assert.deepEqual(consoles.map(c => c.x), [3000, 5000, 7000, 9000]);
});

test('⑭ 대형(16×3.9×14m) — 콘솔 8대 / 의자 16석', () => {
  const { consoles, chairs } = control(16000, 14000, 3900);
  assert.equal(consoles.length, 8);
  assert.equal(chairs.length, 16);
  assert.deepEqual([...new Set(consoles.map(c => c.z))], [3050, 5550]);
});

test('⑮ 콘솔 크기·회전·간격이 그대로다', () => {
  assert.equal(FURNITURE.consoleW, 1800);
  assert.equal(FURNITURE.consoleD, 900);
  assert.equal(FURNITURE.consolePitchZ, 2500);
  for (const [W, D2] of [[10000, 8000], [12000, 10000], [16000, 14000]]) {
    for (const c of control(W, D2, 3600).consoles) {
      assert.equal(c.w, 1800); assert.equal(c.d, 900); assert.equal(c.rotY, 0);
    }
  }
  const { tables } = control(16000, 14000, 3900);
  assert.equal(tables.length, 1);
  assert.equal(tables[0].w, 6000);
  assert.equal(tables[0].d, 1200);
  assert.equal(tables[0].z, 11600);
});

test('⑯ 단이 있는 방 — 콘솔 y 가 배치가 준 값 그대로다', () => {
  for (const tiers of [1, 2, 3]) {
    const { consoles, chairs } = control(16000, 14000, 3900, { tiers });
    const cy = [...new Set(consoles.map(c => c.y || 0))].sort((a, b) => a - b);
    const chy = [...new Set(chairs.map(c => c.y || 0))].sort((a, b) => a - b);
    assert.deepEqual(cy, tiers === 1 ? [0] : [0, 200], `tiers=${tiers}: 콘솔 높이`);
    assert.deepEqual(chy, cy, `tiers=${tiers}: 의자와 콘솔이 다른 단에 앉았다`);
    assert.equal(envelope(parts).bottom, 0, '자산 자체의 바닥이 0이 아니면 단 높이가 두 번 더해진다');
  }
});

test('⑰ 의자는 그대로다 — PHASE 5-a 의 운용자 의자를 건드리지 않았다', () => {
  const chair = createTaskChair();
  assert.equal(chair.length, 10);
  const seat = chair.find(p => p.kind === 'chairCushion');
  assert.equal(seat.y + seat.h / 2, 450);
  assert.equal(resolveFurnitureForDesign({ type: 'chair' }, 'controlRoom').runtimeAsset, 'taskChair');
  for (const [W, D2] of [[10000, 8000], [16000, 14000]]) {
    const { chairs, consoles } = control(W, D2, 3600);
    for (const c of chairs) assert.equal(c.rotY, 0, '의자 방향이 바뀌었다');
    // 의자는 콘솔 뒤 1,000mm 에 앉는다(배치 규칙 그대로).
    for (const c of consoles) {
      assert.ok(chairs.some(h => h.x === c.x && h.z === c.z + 1000), '의자가 콘솔에서 떨어졌다');
    }
  }
});

test('⑱ 겹침이 없다 — 콘솔↔의자·콘솔↔콘솔·뒤 테이블·벽', () => {
  const top = parts.find(p => p.kind === 'consoleTop');
  for (const [W, D2, ov] of [[10000, 8000, {}], [12000, 10000, {}], [16000, 14000, {}],
    [16000, 14000, { tiers: 2 }], [16000, 14000, { tiers: 3 }]]) {
    const { consoles, chairs, tables } = control(W, D2, 3600, ov);
    const cb = consoles.map(c => rect(c.x, c.z, c.w, c.d, c.rotY));
    const hb = chairs.map(c => rect(c.x, c.z, 620, 630, c.rotY));
    for (let i = 0; i < cb.length; i++) {
      for (let j = i + 1; j < cb.length; j++) {
        assert.ok(gap(cb[i], cb[j]) > 0, `${W}×${D2}: 콘솔끼리 겹친다`);
      }
      for (const h of hb) assert.ok(gap(cb[i], h) > 0, `${W}×${D2}: 콘솔이 의자와 겹친다`);
      for (const t of tables) {
        assert.ok(gap(cb[i], rect(t.x, t.z, t.w, t.d, t.rotY)) > 0, `${W}×${D2}: 콘솔이 뒤 테이블과 겹친다`);
      }
      assert.ok(cb[i].x0 > 0 && cb[i].z0 > 0 && cb[i].x1 < W && cb[i].z1 < D2,
        `${W}×${D2}: 콘솔이 벽을 뚫었다`);
    }
    // **곡선이 여유를 줄이지 않았다** — 의자 폭 안에서 상판은 오히려 뒤로 물러난다.
    for (const c of consoles) {
      const chair = chairs.find(h => h.x === c.x && h.z === c.z + 1000);
      if (!chair) continue;
      const edge = Math.max(operatorEdgeZ(-310, top.w, top.d, top.sag),
        operatorEdgeZ(310, top.w, top.d, top.sag), operatorEdgeZ(0, top.w, top.d, top.sag));
      const clear = (chair.z - 315) - (c.z + edge);
      assert.ok(clear >= 235, `의자 여유 ${clear} — 곡선 이전(235)보다 줄었다`);
    }
  }
});

// ── D. 인스턴싱·재질 ────────────────────────────────────────────────────────

test('⑲ 인스턴싱 — 같은 크기 콘솔은 도형·묶음을 나눠 쓴다', () => {
  const a = { type: 'console', asset: 'curvedConsole', w: 1800, d: 900 };
  assert.deepEqual(assetParts(a), assetParts({ ...a }), '같은 크기인데 부품이 다르다');
  const keys = [1, 2, 3, 8].map(() => assetKey(a));
  assert.equal(new Set(keys).size, 1, '같은 크기인데 묶음 열쇠가 갈렸다');
  assert.equal(assetKey(a), 'curvedConsole:1800x900');
  // 크기가 다르면 갈린다(sized 자산의 약속).
  assert.notEqual(assetKey({ ...a, w: 2000 }), assetKey(a));
  // 방 3종 전부 1800×900 한 가지뿐 — 도형 캐시 항목이 하나로 모인다.
  for (const [W, D2] of [[10000, 8000], [12000, 10000], [16000, 14000]]) {
    const ks = new Set(control(W, D2, 3600).consoles.map(c => assetKey({ ...c, asset: 'curvedConsole' })));
    assert.equal(ks.size, 1, `${W}×${D2}: 같은 크기 콘솔이 여러 묶음으로 쪼개졌다`);
  }
});

test('⑳ 도형 캐시 열쇠가 다른 도형과 겹치지 않는다', () => {
  assert.match(geoSrc, /curvedTop\(w, d, thk, \{ sag = 0/, '곡선 상판 캐시 메서드가 사라졌다');
  const key = geoSrc.match(/const key = `v\|\$\{w\}\|\$\{d\}\|\$\{thk\}\|\$\{sag\}\|\$\{detail\}`/);
  assert.ok(key, '곡선 상판 캐시 열쇠가 바뀌었다');
  // 등받이 `arc` 는 여전히 `a|` 다 — 섞이면 의자 등받이가 콘솔 상판을 덮어쓴다.
  assert.match(geoSrc, /const key = `a\|\$\{w\}\|\$\{h\}\|\$\{thk\}\|\$\{sag\}\|\$\{r\}\|\$\{detail\}`/);
  const prefixes = [...geoSrc.matchAll(/const key = `([a-z])\|/g)].map(m => m[1]);
  assert.equal(new Set(prefixes).size, prefixes.length, `머리글자가 겹친다: ${prefixes}`);
});

test('㉑ 정식 재질 13종 그대로 — 새 부품 이름도, 새 재질도 만들지 않았다', () => {
  assert.equal(MATERIAL_IDS.length, 13, `정식 재질이 ${MATERIAL_IDS.length}종이 됐다`);
  for (const k of kinds) {
    assert.ok(PART_MATERIAL[k], `${k}: 재질 대응표에 없다`);
  }
  // 상황실 마감은 아직 만들지 않았다 — 콘솔 부품은 마감표에 들어가지 않는다(PHASE 5-d.1).
  for (const k of kinds) assert.equal(PART_FINISH[k], undefined, `${k}: 상황실 마감을 미리 만들었다`);
});

// ── E. 범위 ─────────────────────────────────────────────────────────────────

test('㉒ 상황실 소품은 그대로 planned 다(가구·AV·마감·벽·조명·화각은 구현됐다)', () => {
  const d = ROOM_DESIGNS.controlRoom;
  assert.equal(d.status, 'planned', '릴리스 판정은 PHASE 5-e 의 몫이다');
  assert.equal(d.palette, 'controlPalette', '마감은 PHASE 5-d.1 에서 생겼다');
  for (const m of Object.values(d.materials)) assert.equal(isPlanned(m), false, '재질이 아직 planned 다');
  assert.equal(d.wallTreatment, 'controlWalls', '벽 구성은 PHASE 5-d.2 에서 생겼다');
  assert.equal(d.lighting, 'controlTechnical', '조명은 PHASE 5-d.3 에서 생겼다');
  assert.equal(d.camera, 'controlProposal', '화각은 PHASE 5-d.4 에서 생겼다');
  // AV(모니터·키보드)는 PHASE 5-c 에서 생겼다 — 여기서 보는 것은 마감·조명·화각이다.
  for (const id of ['consoleMonitor', 'keyboard']) {
    assert.equal(FURNITURE_CONTRACTS[id].status, CONTRACT_STATUS.IMPLEMENTED, id);
  }
});

test('㉓ 상황실 디자인 선택칸을 새로 노출하지 않았다', () => {
  assert.deepEqual(designsFor('control').map(d => d.id), ['controlRoom']);
  for (const saved of [undefined, null, '', '없는디자인', 'corporateMeeting', 'largeConference']) {
    assert.equal(normalizeDesign(saved, 'control'), 'controlRoom', `저장값 ${String(saved)}`);
  }
});

test('㉔ 앞선 세 공간의 가구가 그대로다 — 동결 확인', () => {
  for (const [design, chair, table] of [['corporateMeeting', 'corporateChair', 'corporateTable'],
    ['executiveBoardroom', 'executiveChair', 'boardroomTable'],
    ['largeConference', 'conferenceErgoChair', 'largeUTable']]) {
    assert.equal(resolveFurnitureForDesign({ type: 'chair' }, design).runtimeAsset, chair, design);
    assert.equal(resolveFurnitureForDesign({ type: 'table' }, design).runtimeAsset, table, design);
    assert.equal(resolveFurnitureForDesign({ type: 'console' }, design).runtimeAsset, 'controlConsole',
      `${design}: 회의실에는 콘솔 디자인이 없으므로 기존 경로 그대로여야 한다`);
  }
  assert.equal(createCorporateChair().length, 12);
  assert.equal(createExecutiveChair().length, 12);
  assert.equal(createConferenceErgoChair().length, 13);
});

test('㉕ 다른 공간에 곡선 콘솔이 새어 들어가지 않는다', () => {
  for (const room of ['meeting', 'classroom', 'hall_m', 'ideation']) {
    const res = layoutRoom(room, defaultOptions(room), { W: 12000, D: 10000, H: 3600 });
    for (const it of res.items) {
      assert.notEqual(assetFor(it), 'curvedConsole', `${room}: 곡선 콘솔이 새어 들어갔다`);
    }
  }
  // 이름을 주지 않은 콘솔은 여전히 기존 직선 콘솔이다(기존 경로 무변경).
  assert.equal(assetFor({ type: 'console' }), 'controlConsole');
});
