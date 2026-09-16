// furniture3d.js — 가구 입체 도형 만들기 (순수 함수, DOM 없음).
// ─────────────────────────────────────────────────────────────────────────────
// room-presets.js가 계산한 '배치'(무엇을 어디에) 를 받아, scene3d.js의 기본 도형
// (상자·기둥)으로 실제 3D 면(quad)을 만든다. 그리는 일은 render3d.js.
//
// 모든 가구는 rotY = 0 일 때 'LED 벽(-Z)을 바라보는' 방향으로 만들어진다.
// 등받이·모니터처럼 뒤에 오는 부분은 +Z 쪽에 둔다.
//
// kind 값은 render3d.js의 색 팔레트 키와 1:1로 맞춘다(예: chairSeat, tableTop).
// ─────────────────────────────────────────────────────────────────────────────

import { boxQuads, prismQuads, polyPrismQuads, rotateQuadsY } from './scene3d.js?v=348';

// 가구 기준 치수(mm). 실제 사무가구 표준에 맞춘 값.
export const SIZES = Object.freeze({
  chair: { seatW: 480, seatD: 480, seatY: 420, seatH: 100, backH: 430, backD: 80, baseR: 290 },
  seat: { w: 500, d: 460, seatY: 420, seatH: 80, backH: 520 },
  table: { topY: 720, topH: 55 },
  desk: { topY: 720, topH: 40 },
  console: { topY: 730, topH: 50, monW: 760, monH: 440 },
  podium: { w: 700, d: 500, h: 1080 },
  plant: { potR: 190, potH: 360, leafH: 900 },
  rug: { h: 14 },
});

// 만들어진 면들을 물건의 방향(rotY)에 맞춰 돌린다.
const place = (quads, item) => rotateQuadsY(quads, [item.x, 0, item.z], item.rotY || 0);

// 바닥 그림자(접지 그림자)를 그릴 때 쓰는 대략적인 바닥 면적(mm).
export function footprint(item) {
  switch (item.type) {
    case 'chair': return { w: 620, d: 620 };
    case 'seat': return { w: 540, d: 520 };
    case 'table': return { w: (item.w || 2000) * 0.92, d: (item.d || 1200) * 0.92 };
    case 'desk': return { w: (item.w || 1400) * 0.95, d: (item.d || 600) * 0.95 };
    case 'console': return { w: (item.w || 1800) * 0.95, d: (item.d || 900) * 0.95 };
    case 'podium': return { w: SIZES.podium.w, d: SIZES.podium.d };
    case 'plant': return { w: SIZES.plant.potR * 2.2, d: SIZES.plant.potR * 2.2 };
    default: return null;   // 러그·무대는 바닥에 붙어 있어 그림자 없음
  }
}

// 배치 목록 → 물건별 묶음. 캔버스에는 깊이 버퍼가 없어 '먼 물건부터' 그려야 하므로,
// 렌더러가 물건 단위로 앞뒤를 정렬할 수 있도록 묶어서 돌려준다.
export function furnitureGroups(items) {
  const out = [];
  for (const it of items || []) {
    const quads = buildOne(it);
    if (quads && quads.length) out.push({ item: it, quads });
  }
  return out;
}

// 배치 목록 전체 → 3D 면 목록(평평하게).
export function furnitureQuads(items) {
  return furnitureGroups(items).flatMap(g => g.quads);
}

function buildOne(item) {
  switch (item.type) {
    case 'chair': return buildChair(item);
    case 'seat': return buildAudienceSeat(item);
    case 'table': return buildTable(item);
    case 'desk': return buildDesk(item);
    case 'console': return buildConsole(item);
    case 'podium': return buildPodium(item);
    case 'stage': return buildStage(item);
    case 'rug': return buildRug(item);
    case 'plant': return buildPlant(item);
    default: return [];
  }
}

// ── 사무용 회전의자 ─────────────────────────────────────────────────────────
function buildChair(item) {
  const S = SIZES.chair, { x, z } = item;
  const q = [
    ...prismQuads('chairBase', { cx: x, cz: z, r: S.baseR, y0: 25, y1: 80, sides: 10 }),
    ...boxQuads('chairBase', { x: x - 45, y: 80, z: z - 45, w: 90, h: S.seatY - 80, d: 90 }),
    ...boxQuads('chairSeat', { x: x - S.seatW / 2, y: S.seatY, z: z - S.seatD / 2, w: S.seatW, h: S.seatH, d: S.seatD }),
    // 등받이는 앉은 사람 뒤(+Z)
    ...boxQuads('chairBack', {
      x: x - (S.seatW - 20) / 2, y: S.seatY + S.seatH + 20, z: z + S.seatD / 2 - S.backD,
      w: S.seatW - 20, h: S.backH, d: S.backD,
    }),
  ];
  return place(q, item);
}

// ── 강당 고정식 관람석 ──────────────────────────────────────────────────────
function buildAudienceSeat(item) {
  const S = SIZES.seat, { x, z } = item;
  const q = [
    ...boxQuads('seatFabric', { x: x - S.w / 2, y: S.seatY, z: z - S.d / 2, w: S.w, h: S.seatH, d: S.d }),
    ...boxQuads('seatFabric', { x: x - S.w / 2, y: S.seatY + S.seatH, z: z + S.d / 2 - 70, w: S.w, h: S.backH, d: 70 }),
    ...boxQuads('seatFrame', { x: x - S.w / 2 - 25, y: 0, z: z - S.d / 2, w: 50, h: S.seatY + S.seatH, d: S.d }),
    ...boxQuads('seatFrame', { x: x + S.w / 2 - 25, y: 0, z: z - S.d / 2, w: 50, h: S.seatY + S.seatH, d: S.d }),
  ];
  return place(q, item);
}

// ── 테이블 (사각 · 보트 · 원형) ─────────────────────────────────────────────
function buildTable(item) {
  const S = SIZES.table, { x, z } = item;
  const w = Math.max(400, item.w || 2400), d = Math.max(400, item.d || 1200);
  const ring = tableRing(item.shape, x, z, w, d);
  const q = [...polyPrismQuads('tableTop', ring, S.topY, S.topY + S.topH)];
  if (item.shape === 'round') {
    q.push(...prismQuads('tableBase', { cx: x, cz: z, r: Math.min(w, d) * 0.17, y0: 60, y1: S.topY, sides: 12 }));
    q.push(...prismQuads('tableBase', { cx: x, cz: z, r: Math.min(w, d) * 0.3, y0: 20, y1: 60, sides: 12 }));
  } else {
    // 상판을 받치는 검은 받침 2개(레퍼런스의 흰 상판 + 어두운 베이스)
    const pw = Math.max(120, w * 0.06), pd = Math.max(200, d * 0.55);
    for (const sx of [x - w * 0.27, x + w * 0.27 - pw]) {
      q.push(...boxQuads('tableBase', { x: sx, y: 20, z: z - pd / 2, w: pw, h: S.topY - 20, d: pd }));
    }
    q.push(...boxQuads('tableBase', { x: x - w * 0.27, y: S.topY - 180, z: z - 80, w: w * 0.54, h: 120, d: 160 }));
  }
  return place(q, item);
}

// 상판 윤곽선. 보트형은 긴 변이 바깥으로 살짝 부푼다.
function tableRing(shape, x, z, w, d) {
  if (shape === 'round') {
    const r = Math.min(w, d) / 2, n = 28, ring = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; ring.push([x + Math.cos(a) * r, z + Math.sin(a) * r]); }
    return ring;
  }
  if (shape === 'boat') {
    const n = 14, bulge = d * 0.16, ring = [];
    for (let i = 0; i <= n; i++) {   // 앞쪽 긴 변(-Z)
      const t = i / n;
      ring.push([x - w / 2 + w * t, z - d / 2 - Math.sin(t * Math.PI) * bulge]);
    }
    for (let i = 0; i <= n; i++) {   // 뒤쪽 긴 변(+Z)
      const t = i / n;
      ring.push([x + w / 2 - w * t, z + d / 2 + Math.sin(t * Math.PI) * bulge]);
    }
    return ring;
  }
  return [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x + w / 2, z + d / 2], [x - w / 2, z + d / 2]];
}

// ── 강의실 책상 ─────────────────────────────────────────────────────────────
function buildDesk(item) {
  const S = SIZES.desk, { x, z } = item;
  const w = item.w || 1400, d = item.d || 600;
  const q = [...boxQuads('deskTop', { x: x - w / 2, y: S.topY, z: z - d / 2, w, h: S.topH, d })];
  for (const sx of [x - w / 2 + 60, x + w / 2 - 110]) {
    for (const sz of [z - d / 2 + 60, z + d / 2 - 110]) {
      q.push(...boxQuads('deskLeg', { x: sx, y: 0, z: sz, w: 50, h: S.topY, d: 50 }));
    }
  }
  // 앞을 가리는 가림판(-Z 쪽)
  q.push(...boxQuads('deskPanel', { x: x - w / 2 + 80, y: 340, z: z - d / 2 + 50, w: w - 160, h: 350, d: 30 }));
  return place(q, item);
}

// ── 상황실 콘솔(모니터 포함) ────────────────────────────────────────────────
function buildConsole(item) {
  const S = SIZES.console, { x, z } = item;
  const w = item.w || 1800, d = item.d || 900;
  const q = [
    ...boxQuads('consoleTop', { x: x - w / 2, y: S.topY, z: z - d / 2, w, h: S.topH, d }),
    ...boxQuads('consoleBase', { x: x - w / 2 + 100, y: 20, z: z - d / 2 + 100, w: w - 200, h: S.topY - 20, d: d - 200 }),
  ];
  // 모니터 2대를 상판 위에 나란히(가운데 20mm 간격). sx = 각 모니터의 왼쪽 끝.
  const my = S.topY + S.topH;
  for (const sx of [x - S.monW - 20, x + 20]) {
    q.push(...boxQuads('monitorBase', { x: sx + S.monW / 2 - 60, y: my, z: z - 60, w: 120, h: 120, d: 180 }));
    q.push(...boxQuads('monitor', { x: sx, y: my + 120, z: z - 40, w: S.monW, h: S.monH, d: 50 }));
  }
  return place(q, item);
}

// ── 교탁 ────────────────────────────────────────────────────────────────────
function buildPodium(item) {
  const S = SIZES.podium, { x, z } = item;
  const q = [
    ...boxQuads('podium', { x: x - S.w / 2, y: 0, z: z - S.d / 2, w: S.w, h: S.h, d: S.d }),
    ...boxQuads('podiumTop', { x: x - S.w / 2 - 40, y: S.h, z: z - S.d / 2 - 30, w: S.w + 80, h: 45, d: S.d + 60 }),
  ];
  return place(q, item);
}

// ── 무대(단상) ──────────────────────────────────────────────────────────────
function buildStage(item) {
  const h = item.h || 450, w = item.w || 6000, d = item.d || 2600;
  return boxQuads('stage', { x: item.x - w / 2, y: 0, z: item.z - d / 2, w, h, d });
}

// ── 러그 ────────────────────────────────────────────────────────────────────
function buildRug(item) {
  const w = item.w || 4000, d = item.d || 3000;
  return place(boxQuads('rug', { x: item.x - w / 2, y: 0, z: item.z - d / 2, w, h: SIZES.rug.h, d }), item);
}

// ── 화분(잎이 위로 뻗는 형태) ───────────────────────────────────────────────
function buildPlant(item) {
  const S = SIZES.plant, { x, z } = item;
  const q = [
    ...prismQuads('plantPot', { cx: x, cz: z, r: S.potR * 0.82, y0: 0, y1: 40, sides: 12 }),
    ...prismQuads('plantPot', { cx: x, cz: z, r: S.potR, y0: 40, y1: S.potH, sides: 12 }),
  ];
  const blades = [[0, 1], [38, 0.82], [76, 0.92], [120, 0.7], [158, 0.86]];
  for (const [deg, k] of blades) {
    const h = S.leafH * k;
    const blade = boxQuads('plantLeaf', { x: x - 38, y: S.potH - 30, z: z - 8, w: 76, h, d: 16 });
    q.push(...rotateQuadsY(blade, [x, 0, z], deg));
  }
  return place(q, item);
}
