// geometry.test.js — 유선형 부품 정의 회귀 테스트.
// 도형 자체(Three.js)는 브라우저 전용이라 여기서 만들지 않는다.
// 여기서 지키는 것은 **어떤 부품을 둥글릴지, 얼마나 둥글릴지**라는 판단이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FURNITURE_ASSETS, DIMS,
  createConferenceChair, createAuditoriumChair, createTrainingChair, createAvCredenza,
} from '../src/furniture-assets.js';

// 둥글림이 걸리는 **면**의 두 변. 두께는 상관없다 —
//   'plan'(눕힌 판)은 위에서 본 폭 × 앞뒤, 'face'(세운 판)는 정면에서 본 폭 × 높이가 둥글어진다.
//   좌판은 두께 70mm여도 480 × 470 평면을 둥글리므로 반지름 60mm가 과하지 않다.
const roundedPlane = p => (p.mode === 'face' ? [p.w, p.h] : [p.w, p.d]);
const minSide = p => Math.min(...roundedPlane(p));

test('둥글림 — 반지름이 부품의 가장 짧은 변 절반을 넘지 않는다', () => {
  for (const [id, a] of Object.entries(FURNITURE_ASSETS)) {
    if (!a.instanced) continue;
    for (const p of a.build({ w: 1800, d: 900 })) {
      if (p.shape !== 'box' || !p.r) continue;
      if (p.sag) {
        // 휜 판(등받이)에서 r은 **어깨선(위아래 모서리)**을 둥글리는 값이라 높이에 걸린다.
        assert.ok(p.r <= p.h / 2 + 1e-9, `${id}/${p.kind}: 어깨 둥글림 ${p.r} > 높이(${p.h})의 절반`);
        continue;
      }
      assert.ok(p.r <= minSide(p) / 2 + 1e-9,
        `${id}/${p.kind}: 반지름 ${p.r} > 둥글리는 면의 짧은 변(${minSide(p)})의 절반`);
      assert.ok(p.r > 0);
      assert.ok(['plan', 'face', undefined].includes(p.mode), `${id}/${p.kind}: mode ${p.mode}`);
    }
  }
});

test('둥글림 — 휜 판(등받이)은 휨 깊이가 두께보다 크고 폭보다 작다', () => {
  for (const [id, a] of Object.entries(FURNITURE_ASSETS)) {
    if (!a.instanced) continue;
    for (const p of a.build({ w: 1800, d: 900 })) {
      if (!p.sag) continue;
      // 휨은 폭에 대한 비율로 본다 — 5% 아래면 평평해 보이고, 20%를 넘으면 접힌 판처럼 보인다.
      const ratio = p.sag / p.w;
      assert.ok(ratio >= 0.05, `${id}/${p.kind}: 휨 ${p.sag} / 폭 ${p.w} = ${(ratio * 100).toFixed(1)}% — 너무 평평하다`);
      assert.ok(ratio <= 0.20, `${id}/${p.kind}: 휨 ${p.sag} / 폭 ${p.w} = ${(ratio * 100).toFixed(1)}% — 과하게 접힌다`);
    }
  }
});

test('앉는 면과 등받이는 모두 둥글다(각진 상자로 남으면 안 된다)', () => {
  const chairs = {
    conferenceChair: createConferenceChair(),
    auditoriumChair: createAuditoriumChair(),
    trainingChair: createTrainingChair(),
  };
  const SOFT = new Set(['chairSeat', 'chairBack', 'seatFabric']);
  for (const [id, parts] of Object.entries(chairs)) {
    const soft = parts.filter(p => SOFT.has(p.kind));
    assert.ok(soft.length >= 2, `${id}: 좌판·등받이가 있어야 한다`);
    for (const p of soft) {
      assert.ok(p.r > 0 || p.sag > 0, `${id}/${p.kind}: 둥글리지 않았다`);
    }
    // 등받이는 반드시 휘어 있어야 한다 — 평평하면 칸막이로 보인다.
    const back = parts.find(p => p.sag > 0);
    assert.ok(back, `${id}: 휜 등받이가 없다`);
    assert.ok(back.tiltX, `${id}: 등받이가 젖혀져 있어야 한다`);
  }
});

test('가는 구조재는 상자로 둔다 — 둥글려도 안 보이고 삼각형만 는다', () => {
  // 실제로 아낄 수 있는 곳은 **가는 구조재**다 — 다리·각관·가로대·굽·팔걸이 기둥처럼
  //   짧은 변이 손가락 두께쯤인 것들. 이런 것은 둥글려도 화면에서 보이지 않는다.
  // 반대로 **눈에 보이는 구조**는 둥글려야 한다. 인체공학 의자의 등받이 테두리·기구부는
  //   그 곡선 자체가 형태이고, 각지게 두면 다시 상자 의자로 읽힌다.
  //   그래서 규칙의 기준은 '이름'이 아니라 **크기와 휨**이다.
  const STRUCTURAL = /(Leg|Frame|Base|Rail|Toe|Pole|Beam|Stem)$/;
  const THIN_MM = 120;          // 이보다 얇은 면은 둥글려도 안 보인다
  const rounded = [];
  for (const [id, a] of Object.entries(FURNITURE_ASSETS)) {
    if (!a.instanced) continue;
    for (const p of a.build({ w: 1800, d: 900 })) {
      if (p.shape !== 'box' || !p.r) continue;
      if (p.sag) continue;                       // 휜 판은 곡면이 곧 형태다
      if (!STRUCTURAL.test(p.kind)) continue;
      if (minSide(p) > THIN_MM) continue;        // 넓은 구조는 둥근 것이 맞다
      rounded.push(`${id}/${p.kind}(${minSide(p)}mm)`);
    }
  }
  assert.deepEqual(rounded, [], `가는 구조재를 둥글렸다: ${rounded.join(', ')}`);

  // 반대로, 아주 좁은 면(40mm 이하)은 둥글려 봐야 형태만 뭉개진다.
  for (const [id, a] of Object.entries(FURNITURE_ASSETS)) {
    if (!a.instanced) continue;
    for (const p of a.build({ w: 1800, d: 900 })) {
      if (p.shape !== 'box' || !p.r || p.sag) continue;
      assert.ok(minSide(p) > 40, `${id}/${p.kind}: ${minSide(p)}mm 면을 둥글렸다`);
    }
  }
});

test('AV 수납장 — 몸통·문·상판이 둥글고 치수는 그대로다', () => {
  const parts = createAvCredenza(1800, 450);
  const body = parts.find(p => p.kind === 'credenzaBody');
  const top = parts.find(p => p.kind === 'credenzaTop');
  assert.ok(body.r > 0 && body.mode === 'face');
  assert.ok(top.r > 0 && top.mode === 'plan');
  // 둥글려도 전체 높이는 설계값 그대로여야 한다(치수는 계산값이다).
  assert.equal(Math.round(Math.max(...parts.map(p => p.y + p.h / 2))), DIMS.avCredenza.h);
});

// ── PHASE 2-b — 보트형 상판 도형 캐시 ────────────────────────────────────────
// 도형 자체는 Three.js가 있어야 만들 수 있어 여기서 굽지 못한다.
// 대신 **깨지면 화면이 조용히 틀려지는 한 가지**를 소스에서 지킨다:
//   사각 상판(slab)과 보트 상판(boatTop)이 같은 캐시 열쇠를 쓰면,
//   한 화면에서 먼저 그린 모양이 다른 테이블 상판까지 덮어쓴다(오류 없이, 그림만 틀린다).
const geometrySrc = readFileSync(new URL('../src/geometry-gl.js', import.meta.url), 'utf8');

test('보트 상판 — 도형 캐시가 있고, 폭·깊이·두께·부푼 양이 모두 열쇠에 들어간다', () => {
  assert.match(geometrySrc, /boatTop\s*\(/, 'boatTop 도형 캐시가 없다');
  const key = geometrySrc.match(/boatTop\([^)]*\)\s*\{[\s\S]*?const key = `([^`]+)`/);
  assert.ok(key, 'boatTop의 캐시 열쇠를 찾지 못했다');
  for (const v of ['w', 'd', 'thk', 'bulge']) {
    assert.ok(key[1].includes('${' + v + '}'), `보트 상판 캐시 열쇠에 ${v}가 빠졌다: ${key[1]}`);
  }
});

test('보트 상판 — 사각 상판(slab)과 캐시 열쇠 머리글자가 다르다', () => {
  const head = re => {
    const m = geometrySrc.match(re);
    assert.ok(m, `캐시 열쇠를 찾지 못했다: ${re}`);
    return m[1].split('|')[0];
  };
  const slabHead = head(/slab\([^)]*\)\s*\{[\s\S]*?const key = `([^`]+)`/);
  const boatHead = head(/boatTop\([^)]*\)\s*\{[\s\S]*?const key = `([^`]+)`/);
  assert.notEqual(boatHead, slabHead,
    `사각과 보트가 같은 열쇠 머리글자('${slabHead}')를 쓴다 — 서로의 상판을 덮어쓴다`);
});
