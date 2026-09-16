// render3d.js — 3D(아이소메트릭) 미리보기를 캔버스에 그린다.
// ─────────────────────────────────────────────────────────────────────────────
// 계산은 하지 않는다. 좌표는 scene3d.js, 가구 도형은 furniture3d.js, 배치는
// room-presets.js, LED 스펙(배열·크기)은 engine.js가 각각 단일 출처다.
//
// 그리는 순서(중요) — 캔버스에는 깊이 버퍼가 없어서 '먼 것부터' 덮어 그린다.
//   ① 배경·방 그림자 → ② 바닥 → ③ 바닥 격자·접지 그림자 → ④ 벽(카메라 쪽 벽은 잘라냄)
//   → ⑤ LED(캐비닛·이미지·발광) → ⑥ 바닥에 깔리는 것(러그·무대) → ⑦ 나머지 가구
//   → ⑧ 치수·설명 글자
// ─────────────────────────────────────────────────────────────────────────────

import {
  buildScene, roomShellQuads, visibleWallSides, cabinetQuads, floorGridLines,
  makeCamera, projectPoint, cullAndSort, fitTransform, toScreen, fitAnchors,
  cubeView, rotateCubeView, DEFAULT_CUBE_VIEW, clampView, VIEW_LIMITS, CUBE_VIEWS,
} from './scene3d.js?v=351';
import { furnitureGroups, footprint } from './furniture3d.js?v=351';

// ── 색 ──────────────────────────────────────────────────────────────────────
// 방·가구는 제품 렌더처럼 '항상 밝은 톤'으로 그린다(다크모드에서도 동일).
// 바뀌는 것은 배경(스튜디오 배경)뿐 — 기존 정면 미리보기와 같은 원칙.
export const PALETTE = Object.freeze({
  floorTop: '#f4f5f7', floorSide: '#dcdfe4',
  wall: '#ffffff', wallAccent: '#7ea99b',
  rug: '#4b5058',
  tableTop: '#fbfbfc', tableBase: '#23262c',
  chairSeat: '#dfeae5', chairBack: '#eef1f4', chairBase: '#d3d8de',
  seatFabric: '#c3dcd2', seatFrame: '#dde1e7',
  deskTop: '#fafbfc', deskLeg: '#ccd1d8', deskPanel: '#edf0f3',
  consoleTop: '#fafbfc', consoleBase: '#2a2e35', monitor: '#171a1f', monitorBase: '#3b4048',
  podium: '#eef1f4', podiumTop: '#fafbfc',
  stage: '#e7eaef',
  plantPot: '#fafbfc', plantLeaf: '#4e7d63',
  ledFace: '#14171c', ledSide: '#0d0f12', cabinet: '#181c22', cabinetSeam: 'rgba(0,0,0,.55)',
  grid: 'rgba(30,38,52,.16)',
  text: '#10131a', textSub: '#5b6472', pill: 'rgba(255,255,255,.92)', pillLine: 'rgba(16,19,26,.12)',
});

const BACKDROP = {
  light: ['#eef0f4', '#dfe3e9'],
  dark: ['#15171c', '#0a0b0e'],
};

// 한 물건 안에서 '반드시 나중에(위에) 그려야 하는' 부품. 상판은 다리·받침 위에 얹히므로,
// 단순 거리순으로만 그리면 받침이 상판을 뚫고 보인다. 숫자가 클수록 나중에 그린다.
const LATE = { tableTop: 1, deskTop: 1, consoleTop: 1, podiumTop: 1, monitorBase: 1, monitor: 2, plantLeaf: 1 };

// 그 면이 '방 안쪽'을 향한 벽면인지 — 포인트 색은 이 면에만 칠한다.
const INWARD = { front: [0, 0, 1], back: [0, 0, -1], left: [1, 0, 0], right: [-1, 0, 0] };
function isInnerWallFace(q) {
  const n = INWARD[q.side];
  return !!n && (q.normal[0] * n[0] + q.normal[1] * n[1] + q.normal[2] * n[2]) > 0.5;
}

// 면이 향한 방향에 따른 밝기 — 위는 밝고 아래·옆은 어둡게(입체감).
function shadeFactor(normal) {
  const [nx, ny, nz] = normal;
  if (ny > 0.5) return 1;
  if (ny < -0.5) return 0.62;
  if (nz > 0.5) return 0.94;
  if (nz < -0.5) return 0.84;
  return nx > 0 ? 0.88 : 0.79;
}

const hexCache = new Map();
function shade(color, f) {
  if (f === 1) return color;
  const key = color + '|' + f;
  const hit = hexCache.get(key); if (hit) return hit;
  let out = color;
  if (color[0] === '#' && color.length === 7) {
    const n = parseInt(color.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
    out = `rgb(${r},${g},${b})`;
  }
  hexCache.set(key, out);
  return out;
}

// ── 그리기 도우미 ───────────────────────────────────────────────────────────
function quadPath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

// 면을 채운다. 같은 색으로 아주 얇게 테두리도 그어 면 사이 실금(안티에일리어싱 틈)을 막는다.
function fillQuad(ctx, pts, color) {
  quadPath(ctx, pts);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.7;
  ctx.stroke();
}

// 정사투영에서는 직사각형이 화면에서 평행사변형이 되므로, 이미지를 '한 번의 변환'으로
// 정확히 올릴 수 있다(원근 보정 분할이 필요 없음).
function drawImageOnQuad(ctx, img, TL, TR, BL, src) {
  const a = (TR.x - TL.x) / src.w, b = (TR.y - TL.y) / src.w;
  const c = (BL.x - TL.x) / src.h, d = (BL.y - TL.y) / src.h;
  if (![a, b, c, d].every(Number.isFinite) || (a * d - b * c) === 0) return;
  ctx.save();
  ctx.transform(a, b, c, d, TL.x - a * src.x - c * src.y, TL.y - b * src.x - d * src.y);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

// 이미지를 LED 비율에 맞춰 '꽉 채우기(cover)'로 잘라 쓸 영역.
function coverSrc(img, ratio) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!(iw > 0 && ih > 0)) return null;
  const imgRatio = iw / ih;
  if (imgRatio > ratio) { const w = ih * ratio; return { x: (iw - w) / 2, y: 0, w, h: ih }; }
  const h = iw / ratio; return { x: 0, y: (ih - h) / 2, w: iw, h };
}

function pill(ctx, x, y, text, { align = 'center', sub = false } = {}) {
  ctx.font = `600 ${sub ? 11 : 12}px ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif`;
  const w = ctx.measureText(text).width + 16, h = sub ? 20 : 22;
  const left = align === 'center' ? x - w / 2 : (align === 'right' ? x - w : x);
  const top = y - h / 2;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(left, top, w, h, h / 2); else ctx.rect(left, top, w, h);
  ctx.fillStyle = PALETTE.pill; ctx.fill();
  ctx.strokeStyle = PALETTE.pillLine; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = sub ? PALETTE.textSub : PALETTE.text;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, left + w / 2, top + h / 2 + 0.5);
}

// ── 한 장 그리기 ────────────────────────────────────────────────────────────
/**
 * @param ctx      2D 컨텍스트 (이미 devicePixelRatio 배율이 걸린 상태)
 * @param width/height  논리 픽셀 크기
 * @param m        { scene, items, show, caption, ledImage, theme }
 * @param view     { viewId, zoom, panX, panY }
 */
export function paint(ctx, width, height, m, view) {
  const { scene } = m;
  ctx.clearRect(0, 0, width, height);

  // ① 배경
  const bd = BACKDROP[m.theme === 'dark' ? 'dark' : 'light'];
  const bg = ctx.createLinearGradient(0, 0, width * 0.3, height);
  bg.addColorStop(0, bd[0]); bg.addColorStop(1, bd[1]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const vw = cubeView(view.viewId);
  const cam = makeCamera({
    target: [scene.W / 2, scene.H * 0.5, scene.D * 0.5],
    yaw: vw.yaw, pitch: vw.pitch,
    distance: Math.max(scene.W, scene.H, scene.D) * 8,   // 정사투영이라 크게 잡아도 크기에 영향 없음
    ortho: true,
  });
  const anchors = fitAnchors(scene).map(p => projectPoint(cam, p));
  const t = fitTransform(anchors, { width, height, pad: 30, zoom: view.zoom });
  t.ox += view.panX || 0; t.oy += view.panY || 0;
  const P = p => toScreen(t, projectPoint(cam, p));
  const drawQuads = list => {
    for (const q of list) fillQuad(ctx, q.proj.map(p => toScreen(t, p)), shade(PALETTE[q.kind] || '#cccccc', shadeFactor(q.normal)));
  };

  const sides = visibleWallSides(cam, scene);
  const shell = roomShellQuads(scene, { thickness: 120 });

  // ② 방 아래 그림자(스튜디오 조명 느낌)
  drawRoomShadow(ctx, P, scene);

  // ③ 바닥
  drawQuads(cullAndSort(cam, shell.filter(q => q.side === 'floor')));

  // ④ 바닥 격자 — 바닥 윗면 위에만
  if (m.show?.grid) drawFloorGrid(ctx, P, scene);

  // ⑤ 접지 그림자 — 가구가 바닥에 닿은 자리
  if (m.show?.shadow !== false) for (const it of m.items || []) drawContactShadow(ctx, P, it);

  // ⑥ 벽 — 카메라 쪽 벽은 잘라내(컷어웨이) 안이 보이게. 옆벽 하나는 포인트 색.
  //    포인트 색은 '방 안쪽을 향한 면'에만 칠한다. 벽 윗면·바깥면까지 칠하면
  //    흰 벽의 윗면과 만나는 꼭짓점에서 색이 끊겨 모서리가 어긋나 보인다(실제 도장과도 다름).
  const accent = sides.right ? 'right' : (sides.left ? 'left' : null);
  const wallQuads = shell
    .filter(q => q.side !== 'floor' && sides[q.side])
    .map(q => ({
      ...q,
      kind: (m.show?.accentWall !== false && q.side === accent && isInnerWallFace(q)) ? 'wallAccent' : 'wall',
    }));
  drawQuads(cullAndSort(cam, wallQuads));

  // ⑦ LED
  drawLed(ctx, cam, t, scene, m);

  // ⑧ 가구 — 바닥에 깔리는 것(러그·무대) 먼저, 그 다음 세워두는 것.
  //    물건 '단위'로 먼 것부터 그려야 앞의 의자가 뒤의 의자를 제대로 가린다.
  const groups = furnitureGroups(m.items);
  const flatTypes = new Set(['rug', 'stage']);
  const byDepth = list => list
    .map(g => ({ g, depth: projectPoint(cam, [g.item.x, 0, g.item.z]).z }))
    .sort((a, b) => b.depth - a.depth);
  const drawGroup = g => {
    const vis = cullAndSort(cam, g.quads);
    vis.sort((a, b) => (LATE[a.kind] || 0) - (LATE[b.kind] || 0) || b.depth - a.depth);
    drawQuads(vis);
  };
  for (const { g } of byDepth(groups.filter(g => flatTypes.has(g.item.type)))) drawGroup(g);

  // 사람은 가구와 같은 앞뒤 순서에 끼워 그린다(뒤쪽 의자에 가려지고, 앞쪽 의자는 사람을 가리게).
  //   평면도처럼 키가 화면에서 납작해지는 시점에서는 사람(그림자·키 라벨 포함)을 생략한다.
  const person = (m.person && personScreenHeight(P, m.person) >= 6) ? m.person : null;
  const personDepth = person ? projectPoint(cam, [person.x, 0, person.z]).z : null;
  let personDrawn = !person;
  if (person) drawPersonShadow(ctx, P, person);
  for (const { g, depth } of byDepth(groups.filter(g => !flatTypes.has(g.item.type)))) {
    if (!personDrawn && personDepth > depth) { drawPerson(ctx, P, person); personDrawn = true; }
    drawGroup(g);
  }
  if (!personDrawn) drawPerson(ctx, P, person);

  // ⑨ 치수·설명
  if (m.show?.dims) {
    drawDims(ctx, P, scene);
    if (person) {
      const f = P([person.x, 0, person.z]);
      pill(ctx, f.x, f.y + 24, `키 ${(person.heightMm / 10).toFixed(1)} cm`, { sub: true });
    }
  }
  if (m.caption) drawCaption(ctx, width, height, m.caption);
}

function drawRoomShadow(ctx, P, scene) {
  // 바닥 네 모서리의 화면 위치로 그림자 타원 크기를 잡는다.
  // ※ 사각형(fillRect)으로 칠하면 그라데이션이 다 사라지기 전에 잘려 네모난 자국이 남는다.
  //    반드시 그라데이션 반지름과 같은 '원'으로 칠할 것.
  const pts = [[0, 0, 0], [scene.W, 0, 0], [scene.W, 0, scene.D], [0, 0, scene.D]].map(P);
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const rx = Math.max(40, (Math.max(...xs) - Math.min(...xs)) / 2) * 1.18;
  const ry = Math.max(24, (Math.max(...ys) - Math.min(...ys)) / 2) * 1.18;
  const R = Math.max(rx, ry);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  g.addColorStop(0, 'rgba(0,0,0,.30)');
  g.addColorStop(0.5, 'rgba(0,0,0,.15)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.translate(cx, cy + ry * 0.08); ctx.scale(rx / R, ry / R); ctx.translate(-cx, -(cy + ry * 0.08));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawFloorGrid(ctx, P, scene) {
  ctx.save();
  quadPath(ctx, [P([0, 0, 0]), P([scene.W, 0, 0]), P([scene.W, 0, scene.D]), P([0, 0, scene.D])]);
  ctx.clip();
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const [a, b] of floorGridLines(scene, 1200)) {
    const pa = P(a), pb = P(b);
    ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawContactShadow(ctx, P, item) {
  const f = footprint(item); if (!f) return;
  const c = P([item.x, 0, item.z]);
  const ex = P([item.x + f.w / 2, 0, item.z]), ez = P([item.x, 0, item.z + f.d / 2]);
  const rx = Math.max(3, Math.hypot(ex.x - c.x, ex.y - c.y));
  const rz = Math.max(3, Math.hypot(ez.x - c.x, ez.y - c.y));
  const r = Math.max(rx, rz);
  const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
  g.addColorStop(0, 'rgba(24,30,42,.22)');
  g.addColorStop(0.55, 'rgba(24,30,42,.09)');
  g.addColorStop(1, 'rgba(24,30,42,0)');
  ctx.save();
  ctx.translate(c.x, c.y); ctx.scale(rx / r, rz / r); ctx.translate(-c.x, -c.y);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawLed(ctx, cam, t, scene, m) {
  const S = p => toScreen(t, projectPoint(cam, p));
  const vis = cullAndSort(cam, scene.ledQuads);
  for (const q of vis) {
    if (q.kind !== 'ledFace') { fillQuad(ctx, q.proj.map(p => toScreen(t, p)), shade(PALETTE.ledSide, shadeFactor(q.normal))); continue; }
    const pts = q.proj.map(p => toScreen(t, p));
    fillQuad(ctx, pts, PALETTE.ledFace);
    // 캐비닛 한 장씩(수가 너무 많으면 생략 — 화면에서 구분되지 않음)
    for (const c of cabinetQuads(scene)) {
      fillQuad(ctx, c.pts.map(S), PALETTE.cabinet);
    }
    // 화면 내용(이미지) — 정사투영이라 한 번의 변환으로 정확히 맞는다
    const led = scene.led;
    if (m.ledImage && m.ledImage.complete && m.ledImage.naturalWidth) {
      const src = coverSrc(m.ledImage, led.w / led.h);
      if (src) {
        ctx.save();
        quadPath(ctx, pts); ctx.clip();
        drawImageOnQuad(ctx, m.ledImage,
          S([led.x, led.y + led.h, led.z]), S([led.x + led.w, led.y + led.h, led.z]), S([led.x, led.y, led.z]), src);
        ctx.restore();
      }
    } else {
      // 이미지가 없으면 푸른 발광으로 '켜져 있음'을 표현
      const c0 = S([led.x + led.w / 2, led.y + led.h / 2, led.z]);
      const edge = S([led.x, led.y, led.z]);
      const r = Math.max(20, Math.hypot(edge.x - c0.x, edge.y - c0.y));
      const g = ctx.createRadialGradient(c0.x, c0.y, 0, c0.x, c0.y, r);
      g.addColorStop(0, 'rgba(96,164,255,.78)');
      g.addColorStop(0.55, 'rgba(46,108,222,.42)');
      g.addColorStop(1, 'rgba(18,44,120,.14)');
      ctx.save(); quadPath(ctx, pts); ctx.clip();
      ctx.fillStyle = g; ctx.fill();
      ctx.restore();
    }
    // 베젤
    quadPath(ctx, pts);
    ctx.strokeStyle = 'rgba(5,6,8,.9)'; ctx.lineWidth = 2; ctx.stroke();
  }
}

// 사람은 입체 도형이 아니라 '화면을 향해 세운 사진 판(빌보드)'으로 그린다.
//   정사투영이라 화면에서의 크기가 거리와 무관하므로, 실제 키(mm)가 그대로 비율에 반영된다.
//   반환값: 실제로 그렸으면 true (평면도처럼 키가 납작해지는 시점에서는 그리지 않는다).
function personScreenHeight(P, person) {
  const foot = P([person.x, 0, person.z]), head = P([person.x, person.heightMm, person.z]);
  return Math.hypot(head.x - foot.x, head.y - foot.y);
}

function drawPerson(ctx, P, person) {
  const img = person.img;
  if (!img || !img.complete || !img.naturalWidth) return false;
  const foot = P([person.x, 0, person.z]);
  const h = personScreenHeight(P, person);
  const w = h * (img.naturalWidth / img.naturalHeight);
  ctx.drawImage(img, foot.x - w / 2, foot.y - h, w, h);
  return true;
}

// 사람 발밑 그림자 — 바닥에 서 있다는 느낌을 준다(가구 접지 그림자와 같은 방식).
function drawPersonShadow(ctx, P, person) {
  drawContactShadow(ctx, P, { type: 'person', x: person.x, z: person.z });
}

function drawDims(ctx, P, scene) {
  const led = scene.led;
  const mm = v => `${Math.round(v).toLocaleString('ko-KR')}mm`;
  // 치수선을 '벽에서 몇 mm 떨어뜨릴지'로 잡으면 방이 클수록 화면에서는 붙어 보인다.
  //   → 화면(픽셀) 기준으로 일정하게 띄운다. 방향은 벽면의 가로·세로를 화면에 투영해 구한다.
  const o = P([0, 0, led.z]);
  const dir = (p, fallback) => {
    const v = P(p), dx = v.x - o.x, dy = v.y - o.y;
    const len = Math.hypot(dx, dy);
    return len < 1e-3 ? fallback : [dx / len, dy / len];
  };
  const up = dir([0, 1000, led.z], [0, -1]);        // 화면에서 벽면의 '위' 방향
  const right = dir([1000, 0, led.z], [1, 0]);      // 화면에서 벽면의 '가로' 방향
  const GAP = 30;                                   // 화면 픽셀 여백
  // 평면도(위에서)처럼 높이가 화면에서 납작해지는 시점에서는 세로 치수를 생략한다.
  const upFlat = Math.hypot(P([0, 1000, led.z]).x - o.x, P([0, 1000, led.z]).y - o.y) < 6;

  const line = (a, b, label, d) => {
    const pa = P(a), pb = P(b);
    const ox = d[0] * GAP, oy = d[1] * GAP;
    pa.x += ox; pa.y += oy; pb.x += ox; pb.y += oy;
    ctx.strokeStyle = 'rgba(16,19,26,.45)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    pill(ctx, (pa.x + pb.x) / 2, (pa.y + pb.y) / 2, label);
  };
  const top = led.y + led.h;
  line([led.x, top, led.z], [led.x + led.w, top, led.z], mm(led.w), up);                     // 가로 — LED 위
  if (upFlat) return;
  line([led.x + led.w, led.y, led.z], [led.x + led.w, top, led.z], mm(led.h), right);        // 세로 — LED 오른쪽
  if (led.y > 100) line([led.x, 0, led.z], [led.x, led.y, led.z], mm(led.y), [-right[0], -right[1]]);   // 하단 높이 — LED 왼쪽
}

function drawCaption(ctx, width, height, lines) {
  const arr = Array.isArray(lines) ? lines : [lines];
  ctx.save();
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  // 배경(벽·바닥) 위에 겹쳐도 읽히도록 옅은 판을 먼저 깐다.
  let wMax = 0;
  for (let i = 0; i < arr.length; i++) {
    ctx.font = `${i === 0 ? '700 15px' : '500 12px'} ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif`;
    wMax = Math.max(wMax, ctx.measureText(arr[i]).width);
  }
  const boxH = 21 + (arr.length - 1) * 17 + 18;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(8, 8, wMax + 30, boxH, 12); else ctx.rect(8, 8, wMax + 30, boxH);
  ctx.fillStyle = 'rgba(255,255,255,.80)'; ctx.fill();
  ctx.strokeStyle = PALETTE.pillLine; ctx.lineWidth = 1; ctx.stroke();
  let y = 16;
  for (let i = 0; i < arr.length; i++) {
    const big = i === 0;
    ctx.font = `${big ? '700 15px' : '500 12px'} ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = big ? PALETTE.text : PALETTE.textSub;
    ctx.fillText(arr[i], 18, y);
    y += big ? 21 : 17;
  }
  ctx.restore();
}

// ── 뷰어(캔버스 + 조작) ─────────────────────────────────────────────────────
/**
 * 캔버스 하나를 3D 뷰어로 만든다.
 * @param canvas   <canvas>
 * @param onChange 시점이 바뀔 때 호출(화면 버튼 상태 갱신용)
 */
export function createViewer3d(canvas, { onChange } = {}) {
  let model = null;
  let view = { viewId: DEFAULT_CUBE_VIEW, zoom: 1, panX: 0, panY: 0 };
  let raf = 0;

  const size = () => ({
    w: Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || 800),
    h: Math.max(1, canvas.clientHeight || 460),
  });

  function redraw() {
    if (!model) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const { w, h } = size();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      }
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(ctx, w, h, model, view);
    });
  }

  // ── 조작: 휠=확대, 드래그=이동, 더블클릭=초기화 ──
  //   회전은 '큐브 뷰'(정해진 시점)만 쓰므로 드래그로 각도를 바꾸지 않는다.
  let drag = null;
  const onDown = e => {
    drag = { x: e.clientX, y: e.clientY, px: view.panX, py: view.panY };
    canvas.setPointerCapture?.(e.pointerId);
    canvas.style.cursor = 'grabbing';
  };
  const onMove = e => {
    if (!drag) return;
    view.panX = drag.px + (e.clientX - drag.x);
    view.panY = drag.py + (e.clientY - drag.y);
    redraw();
  };
  const onUp = () => { drag = null; canvas.style.cursor = 'grab'; };
  const onWheel = e => {
    e.preventDefault();
    const z = view.zoom * Math.exp(-e.deltaY * 0.0012);
    view.zoom = Math.max(VIEW_LIMITS.zoom[0], Math.min(VIEW_LIMITS.zoom[1], z));
    redraw(); onChange?.(getView());
  };
  const onDbl = () => { resetView(); };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDbl);
  canvas.style.cursor = 'grab';
  canvas.style.touchAction = 'none';

  const ro = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(() => redraw()) : null;
  ro?.observe(canvas.parentElement || canvas);

  function resetView() {
    view = { ...view, zoom: 1, panX: 0, panY: 0 };
    redraw(); onChange?.(getView());
  }
  function getView() { return { ...view }; }

  return {
    /** 장면 데이터 교체 후 다시 그린다. */
    setModel(next) { model = next; redraw(); },
    /** 큐브 시점 선택(id). */
    setViewId(id) { view.viewId = cubeView(id).id; view.panX = 0; view.panY = 0; redraw(); onChange?.(getView()); },
    /** 같은 높이에서 좌(-1)·우(+1)로 한 칸 회전. */
    rotate(step) { this.setViewId(rotateCubeView(view.viewId, step)); },
    /** 확대/축소(배율 곱). */
    zoomBy(k) { view.zoom = clampView({ ...view, zoom: view.zoom * k }).zoom; redraw(); onChange?.(getView()); },
    resetView, getView,
    views: CUBE_VIEWS,
    /** 현재 화면을 PNG 데이터URL로. scale=2~3이면 인쇄·제안서용 고해상도. */
    toPNG(scale = 3) {
      if (!model) return null;
      const { w, h } = size();
      const off = document.createElement('canvas');
      off.width = Math.round(w * scale); off.height = Math.round(h * scale);
      const c = off.getContext('2d');
      c.setTransform(scale, 0, 0, scale, 0, 0);
      paint(c, w, h, model, view);
      return off.toDataURL('image/png');
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDbl);
    },
  };
}

// 화면(app.js)이 넘겨준 값으로 그릴 준비가 된 모델을 만든다.
export function buildModel({ space, led, items, show, caption, ledImage, theme, person }) {
  return {
    scene: buildScene({
      spaceW: space.W, spaceH: space.H, spaceD: space.D,
      ledW: led.w, ledH: led.h, marginW: led.marginW, mountMm: led.mount,
      cols: led.cols, rows: led.rows, cabDepth: led.depth,
    }),
    items: items || [],
    show: show || {},
    caption, ledImage, theme, person,
  };
}
