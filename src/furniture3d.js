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

import { boxQuads, prismQuads, polyPrismQuads, frustumQuads, rotateQuadsY } from './scene3d.js?v=415';

// 가구 기준 치수(mm). 실제 사무가구 표준에 맞춘 값.
export const SIZES = Object.freeze({
  // 의자는 '등받이 + 얇은 좌판' 정도로 단순화한다. 작은 정육면체가 반복되면
  //   미니어처 모형처럼 보여 공간의 격이 떨어진다(디자인 지침 2026-09-16).
  chair: { seatW: 470, seatD: 460, seatY: 430, seatH: 55, backH: 400, backD: 45, baseR: 195 },
  seat: { w: 500, d: 450, seatY: 420, seatH: 50, backH: 480, backD: 45 },
  table: { topY: 720, topH: 55 },
  desk: { topY: 720, topH: 40 },
  console: { topY: 730, topH: 50, monW: 760, monH: 440 },
  podium: { w: 700, d: 500, h: 1080 },
  plant: { potR: 170, potH: 300, leafH: 520 },
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
    case 'person': return { w: 520, d: 380 };   // 서 있는 사람 발밑
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
    // 납작한 받침 + 가는 기둥 — 덩어리감을 줄인다.
    ...prismQuads('chairBase', { cx: x, cz: z, r: S.baseR, y0: 20, y1: 55, sides: 10 }),
    ...boxQuads('chairBase', { x: x - 34, y: 55, z: z - 34, w: 68, h: S.seatY - 55, d: 68 }),
    // 얇은 좌판
    ...boxQuads('chairSeat', { x: x - S.seatW / 2, y: S.seatY, z: z - S.seatD / 2, w: S.seatW, h: S.seatH, d: S.seatD }),
    // 등받이는 앉은 사람 뒤(+Z). 좌판보다 살짝 좁게 세운다.
    ...boxQuads('chairBack', {
      x: x - (S.seatW - 60) / 2, y: S.seatY + S.seatH + 40, z: z + S.seatD / 2 - S.backD,
      w: S.seatW - 60, h: S.backH, d: S.backD,
    }),
  ];
  return place(q, item);
}

// ── 강당 고정식 관람석 ──────────────────────────────────────────────────────
function buildAudienceSeat(item) {
  const S = SIZES.seat, { x, z } = item;
  const q = [
    // 얇은 좌판 + 등받이. 다리는 가운데 하나로 모아 줄줄이 늘어설 때 시각적 잡음을 줄인다.
    ...boxQuads('seatFabric', { x: x - S.w / 2, y: S.seatY, z: z - S.d / 2, w: S.w, h: S.seatH, d: S.d }),
    ...boxQuads('seatFabric', {
      x: x - (S.w - 40) / 2, y: S.seatY + S.seatH, z: z + S.d / 2 - S.backD,
      w: S.w - 40, h: S.backH, d: S.backD,
    }),
    ...boxQuads('seatFrame', { x: x - 45, y: 0, z: z - 45, w: 90, h: S.seatY, d: 90 }),
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
    // 상판을 받치는 얇은 받침 2개. 가로대를 두면 옆에서 볼 때 하나의 회색 덩어리로 뭉친다.
    const pw = Math.max(90, w * 0.035), pd = Math.max(160, d * 0.42);
    for (const sx of [x - w * 0.28, x + w * 0.28 - pw]) {
      q.push(...boxQuads('tableBase', { x: sx, y: 15, z: z - pd / 2, w: pw, h: S.topY - 15, d: pd }));
    }
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
  const h = item.h || 300, w = item.w || 6000, d = item.d || 2600;
  // 윗면과 옆면 색을 나눠 낮고 얇은 단처럼 보이게 한다(덩어리로 보이지 않게).
  return boxQuads('stage', { x: item.x - w / 2, y: 0, z: item.z - d / 2, w, h, d })
    .map(q => ({ ...q, kind: q.normal[1] > 0.5 ? 'stage' : 'stageSide' }));
}

// ── 러그 ────────────────────────────────────────────────────────────────────
function buildRug(item) {
  const w = item.w || 4000, d = item.d || 3000;
  return place(boxQuads('rug', { x: item.x - w / 2, y: 0, z: item.z - d / 2, w, h: SIZES.rug.h, d }), item);
}

// ── 화분(잎이 위로 뻗는 형태) ───────────────────────────────────────────────
function buildPlant(item) {
  const S = SIZES.plant, { x, z } = item;
  // 화분 + 둥글게 뭉친 잎. 가는 막대나 원기둥을 쌓으면 식물이 아니라 기계 부품처럼 보인다.
  //   구(球)에 가까운 지름 곡선으로 얇게 여러 겹 쌓아 둥근 수형을 만든다.
  const q = [
    ...prismQuads('plantPot', { cx: x, cz: z, r: S.potR * 0.78, y0: 0, y1: 45, sides: 12 }),
    ...prismQuads('plantPot', { cx: x, cz: z, r: S.potR, y0: 45, y1: S.potH, sides: 12 }),
  ];
  const profile = [0.42, 0.88, 1.12, 1.15, 0.98, 0.58, 0.12];   // 아래→위 지름 변화(둥근 수형)
  const slice = S.leafH / (profile.length - 1);
  for (let i = 0; i < profile.length - 1; i++) {
    const y0 = S.potH - 40 + i * slice;
    q.push(...frustumQuads('plantLeaf', {
      cx: x, cz: z, r0: S.potR * 1.15 * profile[i], r1: S.potR * 1.15 * profile[i + 1],
      y0, y1: y0 + slice, sides: 14,
    }));
  }
  return place(q, item);
}
