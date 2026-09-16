// render3d.js — 3D 미리보기를 캔버스에 그린다. (건축 투시도 스타일)
// ─────────────────────────────────────────────────────────────────────────────
// 계산은 하지 않는다. 좌표는 scene3d.js, 가구 도형은 furniture3d.js, 배치는
// room-presets.js, LED 스펙(배열·크기)은 engine.js가 각각 단일 출처다.
//
// 디자인 원칙 (정면 뷰와 같은 디자인 언어를 쓴다)
//   · 밝은 cool-gray 팔레트. 벽·바닥이 각각 '덩어리진 3D 물체'로 보이지 않게 한다.
//   · 윤곽선 대신 은은한 그라데이션과 접지 그림자로만 깊이를 만든다.
//   · LED가 언제나 화면에서 가장 강한 시각 초점 — 나머지는 전부 조연이다.
//   · 오브젝트를 늘리지 않고 정보를 덜어내서 고급스럽게 보이게 한다.
//
// 그리는 순서(중요) — 캔버스에는 깊이 버퍼가 없어서 '먼 것부터' 덮어 그린다.
//   ① 배경 → ② 바닥 → ③ 바닥 격자 → ④ 접지 그림자 → ⑤ 벽(카메라 쪽 벽은 잘라냄)
//   → ⑥ LED → ⑦ 바닥에 깔리는 것(러그·무대) → ⑧ 나머지 가구·사람 → ⑨ 치수·정보 카드
// ─────────────────────────────────────────────────────────────────────────────

import {
  buildScene, roomShellQuads, visibleWallSides, cabinetQuads, floorGridLines,
  viewCamera, projectPoint, cullAndSort, fitTransform, focusGain, toScreen, fitAnchors,
  cubeView, rotateCubeView, DEFAULT_CUBE_VIEW, clampView, VIEW_LIMITS, CUBE_VIEWS,
} from './scene3d.js?v=402';
import { furnitureGroups, footprint } from './furniture3d.js?v=402';

// ── 색 ──────────────────────────────────────────────────────────────────────
// 공간은 '물리 다이어그램'이라 다크모드에서도 항상 밝은 톤으로 그린다(정면 뷰와 같은 원칙).
// 바뀌는 것은 배경(스튜디오 배경)뿐.
export const PALETTE = Object.freeze({
  // 공간
  wallRear: '#f0f3f8',      // LED가 붙은 안쪽 벽
  wallSide: '#e7ecf3',      // 옆벽
  wallCap: '#f7f9fc',       // 벽 윗면(빛을 받는 면)
  wallOuter: '#e2e7ef',     // 벽 바깥면
  wallAccent: '#afc9be',    // 포인트 벽(차분한 세이지)
  floorTop: '#d4d9e1',
  floorSide: '#c5cbd5',

  // LED — 정면 뷰와 같은 화면 색
  ledScreen: ['#315fa0', '#18345d', '#101d35', '#0b1323'],
  ledBezel: 'rgba(12,18,28,.92)',
  ledSide: '#1b2432',
  cabinetLine: 'rgba(255,255,255,.045)',

  // 가구 — 전부 조연. 채도를 낮추고 명도 차이만 남긴다.
  tableTop: '#f5f7fa', tableBase: '#a9b3c0',
  chairBack: '#cbdad7', chairSeat: '#cbdad7', chairBase: '#aeb8c4',
  seatFabric: '#cbdad7', seatFrame: '#aeb8c4',
  deskTop: '#f3f6f9', deskLeg: '#b3bcc8', deskPanel: '#e4e9ef',
  consoleTop: '#f3f6f9', consoleBase: '#9ba6b4', monitor: '#1b2532', monitorBase: '#8f99a7',
  podium: '#eef2f7', podiumTop: '#f7f9fc',
  stage: '#eef1f5', stageSide: '#dce1e7',
  rug: '#c1c9d5',
  plantPot: '#f2f5f9', plantLeaf: '#8fae9c',

  // 선·글자
  gridMajor: 'rgba(89,104,125,.18)',
  gridMinor: 'rgba(89,104,125,.08)',
  dimLine: '#8c95a3',
  pillFill: 'rgba(255,255,255,.94)', pillKeyFill: 'rgba(17,21,27,.92)',
  pillLine: 'rgba(120,130,145,.20)',
  cardFill: 'rgba(255,255,255,.86)',
  cardLine: 'rgba(120,130,145,.16)',
  text: '#1a2028', textSub: '#6b7585',
});

// 포인트 벽 농도 — 벽은 면적이 넓어 원색 그대로 칠하면 LED보다 먼저 눈에 띈다.
export const ACCENT_ALPHA = 0.5;

// 배경 — 정면 뷰 프레임(.rs3Frame)과 같은 그라데이션.
const BACKDROP = {
  light: ['#f7f8fb', '#eceef3'],
  dark: ['#12141a', '#0a0b0f'],
};

// 면 종류 → 기본 색. 없으면 회색.
const FACE_COLOR = {
  wallRear: PALETTE.wallRear, wallSide: PALETTE.wallSide, wallCap: PALETTE.wallCap,
  wallOuter: PALETTE.wallOuter, wallAccent: PALETTE.wallAccent,
  floorTop: PALETTE.floorTop, floorSide: PALETTE.floorSide,
  ledSide: PALETTE.ledSide, stage: PALETTE.stage, stageSide: PALETTE.stageSide,
};

// 한 물건 안에서 '반드시 나중에(위에) 그려야 하는' 부품. 상판은 다리·받침 위에 얹히므로,
// 단순 거리순으로만 그리면 받침이 상판을 뚫고 보인다. 숫자가 클수록 나중에 그린다.
const LATE = { tableTop: 1, deskTop: 1, consoleTop: 1, podiumTop: 1, monitorBase: 1, monitor: 2, plantLeaf: 1 };

// 면 방향에 따른 밝기. 예전보다 폭을 크게 줄여(0.93~1.0) 벽·바닥이 각각 도드라지지 않게 한다.
function shadeFactor(normal) {
  const [nx, ny] = normal;
  if (ny > 0.5) return 1;          // 윗면
  if (ny < -0.5) return 0.9;       // 아랫면
  return nx > 0 ? 0.985 : 0.955;   // 좌우 — 아주 미세한 차이만
}

const hexCache = new Map();
function shade(color, f) {
  if (f === 1 || color[0] !== '#' || color.length !== 7) return color;
  const key = color + '|' + f;
  const hit = hexCache.get(key); if (hit) return hit;
  const n = parseInt(color.slice(1), 16);
  const out = `rgb(${Math.round(((n >> 16) & 255) * f)},${Math.round(((n >> 8) & 255) * f)},${Math.round((n & 255) * f)})`;
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
// (윤곽선이 아니라 '틈 메우기'다 — 색이 같아 선으로 보이지 않는다.)
function fillQuad(ctx, pts, color) {
  quadPath(ctx, pts);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.6;
  ctx.stroke();
}

const bbox = pts => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
};

// 벽면에 위→아래로 아주 옅은 그라데이션을 덮어 '평평한 색판' 느낌을 없앤다.
function shadeWallFace(ctx, pts) {
  const b = bbox(pts);
  if (b.h < 2) return;
  const g = ctx.createLinearGradient(0, b.y0, 0, b.y1);
  g.addColorStop(0, 'rgba(255,255,255,.30)');
  g.addColorStop(0.55, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(92,106,126,.10)');     // 바닥과 만나는 쪽에 은은한 음영
  ctx.save(); quadPath(ctx, pts); ctx.clip();
  ctx.fillStyle = g; ctx.fillRect(b.x0 - 1, b.y0 - 1, b.w + 2, b.h + 2);
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

// 원근 투영에서는 사각형이 화면에서 사다리꼴이 되므로, 이미지를 한 번의 변환으로 올릴 수 없다.
// 평면을 작은 조각으로 나눠 조각마다 변환을 적용하면(=원근 보정) 정확히 맞아떨어진다.
function drawImageOnPlane(ctx, img, corners, S, src, sub = 10) {
  const [TL, TR, BL] = corners;
  const at = (u, v) => [
    TL[0] + (TR[0] - TL[0]) * u + (BL[0] - TL[0]) * v,
    TL[1] + (TR[1] - TL[1]) * u + (BL[1] - TL[1]) * v,
    TL[2] + (TR[2] - TL[2]) * u + (BL[2] - TL[2]) * v,
  ];
  const sw = src.w / sub, sh = src.h / sub;
  for (let j = 0; j < sub; j++) {
    for (let i = 0; i < sub; i++) {
      const p00 = S(at(i / sub, j / sub)), p10 = S(at((i + 1) / sub, j / sub)), p01 = S(at(i / sub, (j + 1) / sub));
      const a = (p10.x - p00.x) / sw, b = (p10.y - p00.y) / sw;
      const c = (p01.x - p00.x) / sh, d = (p01.y - p00.y) / sh;
      if (!(a * d - b * c)) continue;
      ctx.save();
      ctx.transform(a, b, c, d, p00.x, p00.y);
      // 조각 사이 실금이 보이지 않도록 아주 조금 겹쳐 그린다.
      ctx.drawImage(img, src.x + i * sw, src.y + j * sh, sw, sh, -0.3, -0.3, sw + 0.6, sh + 0.6);
      ctx.restore();
    }
  }
}

// 치수 라벨 알약. 정면 뷰의 라벨과 같은 모양.
// 치수 알약. 정면 뷰와 같은 규칙 — 핵심 치수는 어두운 알약, 보조 치수는 흰 알약.
function pill(ctx, x, y, text, { sub = false, key = false } = {}) {
  ctx.font = `600 ${sub ? 11 : 12}px ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif`;
  const w = ctx.measureText(text).width + 18, h = sub ? 21 : 23;
  const left = x - w / 2, top = y - h / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(30,40,55,.10)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(left, top, w, h, h / 2); else ctx.rect(left, top, w, h);
  ctx.fillStyle = key ? PALETTE.pillKeyFill : PALETTE.pillFill; ctx.fill();
  ctx.restore();
  if (!key) { ctx.strokeStyle = PALETTE.pillLine; ctx.lineWidth = 1; ctx.stroke(); }
  ctx.fillStyle = key ? '#ffffff' : (sub ? PALETTE.textSub : PALETTE.text);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, left + w / 2, top + h / 2 + 0.5);
}

// ── 한 장 그리기 ────────────────────────────────────────────────────────────
/**
 * @param ctx      2D 컨텍스트 (이미 devicePixelRatio 배율이 걸린 상태)
 * @param width/height  논리 픽셀 크기
 * @param m        { scene, items, show, caption, ledImage, person, theme }
 * @param view     { viewId, zoom, panX, panY }
 */
export function paint(ctx, width, height, m, view) {
  const { scene } = m;
  ctx.clearRect(0, 0, width, height);

  // ① 배경
  const bd = BACKDROP[m.theme === 'dark' ? 'dark' : 'light'];
  const bg = ctx.createLinearGradient(width * 0.15, 0, width * 0.85, height);
  bg.addColorStop(0, bd[0]); bg.addColorStop(1, bd[1]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const cam = viewCamera(scene, view.viewId);
  const anchors = focusAnchors(scene, m.items).map(p => projectPoint(cam, p));
  // LED를 자르지 않는 선에서 한 단계 더 당겨 들어간다(평면도는 도면이므로 그대로).
  //   확대 배율은 사용자 줌과 별개로 계산한다 — '맞춤'(줌 1)을 눌러도 같은 framing이 나오고,
  //   사용자가 줌을 올렸을 때 배율이 덩달아 되돌아가지도 않는다.
  const gain = cubeView(view.viewId).plan ? 1
    : focusGain(anchors, ledCornerPoints(cam, scene), { width, height, pad: FIT_PAD });
  const t = fitTransform(anchors, { width, height, pad: FIT_PAD, zoom: view.zoom * gain });
  t.ox += view.panX || 0; t.oy += view.panY || 0;
  const P = p => toScreen(t, projectPoint(cam, p));
  const paintQuads = list => {
    for (const q of list) {
      const pts = q.proj.map(p => toScreen(t, p));
      fillQuad(ctx, pts, shade(FACE_COLOR[q.kind] || PALETTE[q.kind] || '#cfd4dc', shadeFactor(q.normal)));
    }
  };

  const sides = visibleWallSides(cam, scene);
  const shell = roomShellQuads(scene, { thickness: 110 });

  // ② 바닥
  paintQuads(cullAndSort(cam, shell.filter(q => q.side === 'floor').map(q => ({
    ...q, kind: q.normal[1] > 0.5 ? 'floorTop' : 'floorSide',
  }))));

  // ③ 바닥 격자 — 바닥 위에 '판'이 얹힌 것처럼 보이지 않게 멀수록 옅어지게 한다.
  if (m.show?.grid) drawFloorGrid(ctx, P, cam, scene);

  // ④ 접지 그림자 — 가구가 바닥에 닿은 자리(아주 약하게)
  if (m.show?.shadow !== false) for (const it of m.items || []) drawContactShadow(ctx, P, it);

  // ⑤ 벽 — 카메라 쪽 벽은 잘라내(컷어웨이) 안이 보이게.
  //    포인트 색은 '방 안쪽을 향한 면'에만 칠한다. 윗면·바깥면까지 칠하면 흰 벽과 만나는
  //    꼭짓점에서 색이 끊겨 모서리가 어긋나 보인다(실제 도장과도 다름).
  //    포인트 벽은 '카메라에서 보이는 벽'이 아니라 '실제로 칠해 둔 벽'이다 — 시점을 돌려도
  //    반대편으로 옮겨가지 않게 공간 좌표(ACCENT_WALL_SIDE)에 고정한다. 그 벽이 카메라
  //    뒤에 놓이는 시점(좌측·좌측 코너)에서는 컷어웨이로 잘려 보이지 않는 게 맞다.
  const accent = ACCENT_WALL_SIDE;
  const wallVis = cullAndSort(cam, shell.filter(q => q.side !== 'floor' && sides[q.side]).map(q => {
    const inner = isInnerWallFace(q);
    let kind = 'wallOuter';
    if (q.normal[1] > 0.5) kind = 'wallCap';
    else if (inner) kind = (q.side === 'front') ? 'wallRear' : 'wallSide';
    const isAccent = inner && m.show?.accentWall !== false && q.side === accent;
    return { ...q, kind, inner, isAccent };
  }));
  paintQuads(wallVis);
  // 포인트 색은 벽 색 위에 '낮은 농도로' 얹는다. 원색 그대로 칠하면 면적이 넓어
  //   LED보다 포인트 벽에 시선이 먼저 간다(디자인 지침 2026-09-16).
  for (const q of wallVis) {
    const pts = q.proj.map(p => toScreen(t, p));
    if (q.isAccent) {
      ctx.save(); ctx.globalAlpha = ACCENT_ALPHA; fillQuad(ctx, pts, PALETTE.wallAccent); ctx.restore();
    }
    if (q.inner) shadeWallFace(ctx, pts);
  }

  // ⑥ LED — 화면의 시각 초점
  drawLed(ctx, P, cam, t, scene, m);

  // ⑦⑧ 가구 — 바닥에 깔리는 것 먼저, 그 다음 세워두는 것. 사람은 깊이 순서에 끼워 그린다.
  const groups = furnitureGroups(m.items);
  const flatTypes = new Set(['rug', 'stage']);
  const byDepth = list => list
    .map(g => ({ g, depth: projectPoint(cam, [g.item.x, 0, g.item.z]).z }))
    .sort((a, b) => b.depth - a.depth);
  const drawGroup = g => {
    const vis = cullAndSort(cam, g.quads);
    vis.sort((a, b) => (LATE[a.kind] || 0) - (LATE[b.kind] || 0) || b.depth - a.depth);
    paintQuads(vis);
  };
  for (const { g } of byDepth(groups.filter(g => flatTypes.has(g.item.type)))) drawGroup(g);

  const person = (m.person && personScreenHeight(P, m.person) >= 6) ? m.person : null;
  const personDepth = person ? projectPoint(cam, [person.x, 0, person.z]).z : null;
  let personDrawn = !person;
  if (person) drawContactShadow(ctx, P, { type: 'person', x: person.x, z: person.z });
  for (const { g, depth } of byDepth(groups.filter(g => !flatTypes.has(g.item.type)))) {
    if (!personDrawn && personDepth > depth) { drawPerson(ctx, P, person); personDrawn = true; }
    drawGroup(g);
  }
  if (!personDrawn) drawPerson(ctx, P, person);

  // ⑨ 치수·정보
  if (m.show?.dims) {
    drawDims(ctx, P, scene);
    if (person) {
      const f = P([person.x, 0, person.z]);
      pill(ctx, f.x, f.y + 22, `${(person.heightMm / 10).toFixed(0)} cm`, { sub: true });
    }
  }
  if (m.caption) drawInfoCard(ctx, m.caption);
}

// 화면에 맞출 기준점. 방 전체(빈 뒤쪽 바닥까지)를 억지로 넣으면 LED가 작아지고
// 옆벽·빈 바닥이 화면을 차지한다. 사진처럼 'LED 벽 + 가구가 있는 영역'만 잡는다.
function focusAnchors(scene, items) {
  const { W, H, D, led } = scene;
  let zMax = D * 0.45;
  for (const it of items || []) {
    const half = (it.d || 800) / 2;
    if (it.z + half + 900 > zMax) zMax = it.z + half + 900;
  }
  zMax = Math.min(D, zMax);
  return [
    // LED가 붙은 벽 네 모서리 — 이것이 화면의 중심이 된다
    [0, 0, 0], [W, 0, 0], [0, H, 0], [W, H, 0],
    // 가구가 놓인 데까지의 바닥
    [0, 0, zMax], [W, 0, zMax],
    // LED 자체
    [led.x, led.y, led.z], [led.x + led.w, led.y + led.h, led.z],
  ];
}

// 자동 맞춤 여백(px).
const FIT_PAD = 34;

// 포인트 벽 — 공간 좌표 기준으로 '왼쪽 벽'에 고정한다(기본 시점인 '우측 코너'에서
// 보이는 옆벽). 카메라를 돌린다고 칠한 벽이 옮겨 다니면 안 된다.
export const ACCENT_WALL_SIDE = 'left';

// LED 화면 네 모서리(투영 완료) — framing을 당길 때 이 점들이 화면 안에 남아야 한다.
function ledCornerPoints(cam, scene) {
  const { led } = scene;
  return [
    [led.x, led.y, led.z], [led.x + led.w, led.y, led.z],
    [led.x, led.y + led.h, led.z], [led.x + led.w, led.y + led.h, led.z],
  ].map(p => projectPoint(cam, p));
}

// 그 면이 '방 안쪽'을 향한 벽면인지 — 포인트 색은 이 면에만 칠한다.
const INWARD = { front: [0, 0, 1], back: [0, 0, -1], left: [1, 0, 0], right: [-1, 0, 0] };
function isInnerWallFace(q) {
  const n = INWARD[q.side];
  return !!n && (q.normal[0] * n[0] + q.normal[1] * n[1] + q.normal[2] * n[2]) > 0.5;
}

// ── 바닥 격자 ───────────────────────────────────────────────────────────────
// 600mm(보조)·1200mm(주) 두 단계. 멀수록 옅어져 '격자판'이 따로 놓인 느낌을 없앤다.
function drawFloorGrid(ctx, P, cam, scene) {
  const floor = [P([0, 0, 0]), P([scene.W, 0, 0]), P([scene.W, 0, scene.D]), P([0, 0, scene.D])];
  ctx.save();
  quadPath(ctx, floor); ctx.clip();
  ctx.lineWidth = 1;
  const camZ = cam.pos[2];
  for (const [step, color] of [[600, PALETTE.gridMinor], [1200, PALETTE.gridMajor]]) {
    ctx.strokeStyle = color;
    for (const [a, b] of floorGridLines(scene, step)) {
      // 카메라에서 먼 선일수록 옅게(선 중간점 기준)
      const midZ = (a[2] + b[2]) / 2;
      const far = Math.min(1, Math.abs(camZ - midZ) / Math.max(1, Math.abs(camZ) + scene.D));
      ctx.globalAlpha = Math.max(0.25, 1 - far * 0.9);
      const pa = P(a), pb = P(b);
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ── 접지 그림자 ─────────────────────────────────────────────────────────────
function drawContactShadow(ctx, P, item) {
  const f = footprint(item); if (!f) return;
  const c = P([item.x, 0, item.z]);
  const ex = P([item.x + f.w / 2, 0, item.z]), ez = P([item.x, 0, item.z + f.d / 2]);
  const rx = Math.max(2, Math.hypot(ex.x - c.x, ex.y - c.y));
  const rz = Math.max(2, Math.hypot(ez.x - c.x, ez.y - c.y));
  const r = Math.max(rx, rz);
  const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
  g.addColorStop(0, 'rgba(50,70,90,.14)');
  g.addColorStop(0.55, 'rgba(50,70,90,.06)');
  g.addColorStop(1, 'rgba(50,70,90,0)');
  ctx.save();
  ctx.translate(c.x, c.y); ctx.scale(rx / r, rz / r); ctx.translate(-c.x, -c.y);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ── LED ─────────────────────────────────────────────────────────────────────
function drawLed(ctx, P, cam, t, scene, m) {
  const led = scene.led;
  const vis = cullAndSort(cam, scene.ledQuads);
  // 옆면(두께)은 얇게, 눈에 띄지 않게 먼저.
  for (const q of vis) {
    if (q.kind === 'ledFace') continue;
    fillQuad(ctx, q.proj.map(p => toScreen(t, p)), PALETTE.ledSide);
  }
  const face = vis.find(q => q.kind === 'ledFace');
  if (!face) return;
  const pts = face.proj.map(p => toScreen(t, p));
  const b = bbox(pts);

  // 화면 — 정면 뷰와 같은 짙은 네이비 + 가운데 푸른 발광.
  //   LED만 조금 더 또렷한 그림자를 받아 공간에서 앞으로 나와 보인다.
  const c0 = P([led.x + led.w / 2, led.y + led.h / 2, led.z]);
  const r = Math.max(24, Math.hypot(b.w, b.h) / 2);
  // 벽에 번지는 푸른 헤일로 — 정면 뷰의 네온 글로우와 같은 역할(화면이 켜져 있음을 보여준다).
  ctx.save();
  const halo = ctx.createRadialGradient(c0.x, c0.y, r * 0.5, c0.x, c0.y, r * 1.9);
  halo.addColorStop(0, 'rgba(47,127,246,.16)');
  halo.addColorStop(1, 'rgba(47,127,246,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(b.x0 - r * 1.2, b.y0 - r * 1.2, b.w + r * 2.4, b.h + r * 2.4);
  ctx.restore();

  //   화면은 정면 뷰처럼 '거의 검은' 상태에 가운데만 은은하게 밝다(밝은 심지를 좁게).
  const g = ctx.createRadialGradient(c0.x, c0.y, 0, c0.x, c0.y, r);
  const [s0, s1, s2, s3] = PALETTE.ledScreen;
  g.addColorStop(0, s0); g.addColorStop(0.18, s1); g.addColorStop(0.5, s2); g.addColorStop(1, s3);
  ctx.save();
  ctx.shadowColor = 'rgba(24,40,70,.22)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
  quadPath(ctx, pts); ctx.fillStyle = g; ctx.fill();
  ctx.restore();

  // 화면 내용(이미지) — 원근 보정해서 올린다.
  if (m.ledImage && m.ledImage.complete && m.ledImage.naturalWidth) {
    const src = coverSrc(m.ledImage, led.w / led.h);
    if (src) {
      ctx.save(); quadPath(ctx, pts); ctx.clip();
      drawImageOnPlane(ctx, m.ledImage, [
        [led.x, led.y + led.h, led.z], [led.x + led.w, led.y + led.h, led.z], [led.x, led.y, led.z],
      ], P, src);
      ctx.restore();
    }
  }

  // 캐비닛 격자 — 아주 약한 흰 선(면을 칠하지 않는다).
  const cells = cabinetQuads(scene, { gapRatio: 0 });
  if (cells.length) {
    ctx.save(); quadPath(ctx, pts); ctx.clip();
    ctx.strokeStyle = PALETTE.cabinetLine; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const c of cells) {
      const cp = c.pts.map(P);
      ctx.moveTo(cp[0].x, cp[0].y);
      for (let i = 1; i < cp.length; i++) ctx.lineTo(cp[i].x, cp[i].y);
      ctx.closePath();
    }
    ctx.stroke();
    ctx.restore();
  }

  // 얇은 검은 프레임(베젤)
  quadPath(ctx, pts);
  ctx.strokeStyle = PALETTE.ledBezel; ctx.lineWidth = 1.2; ctx.stroke();
}

// ── 사람 ────────────────────────────────────────────────────────────────────
function personScreenHeight(P, person) {
  const foot = P([person.x, 0, person.z]), head = P([person.x, person.heightMm, person.z]);
  return Math.hypot(head.x - foot.x, head.y - foot.y);
}

function drawPerson(ctx, P, person) {
  const img = person && person.img;
  if (!img || !img.complete || !img.naturalWidth) return false;
  const foot = P([person.x, 0, person.z]);
  const h = personScreenHeight(P, person);
  const w = h * (img.naturalWidth / img.naturalHeight);
  ctx.drawImage(img, foot.x - w / 2, foot.y - h, w, h);
  return true;
}

// ── 치수 ────────────────────────────────────────────────────────────────────
// 정면 뷰와 같은 3종(LED 가로·세로·하단 높이). 오브젝트에 바짝 붙여 CAD 도면 느낌을 줄인다.
function drawDims(ctx, P, scene) {
  const led = scene.led;
  const mm = v => `${Math.round(v).toLocaleString('ko-KR')}mm`;
  const o = P([0, 0, led.z]);
  const dir = (p, fallback) => {
    const v = P(p), dx = v.x - o.x, dy = v.y - o.y, len = Math.hypot(dx, dy);
    return len < 1e-3 ? fallback : [dx / len, dy / len];
  };
  const up = dir([0, 1000, led.z], [0, -1]);
  const right = dir([1000, 0, led.z], [1, 0]);
  const flat = Math.hypot(P([0, 1000, led.z]).x - o.x, P([0, 1000, led.z]).y - o.y) < 6;
  const GAP = 18;   // 화면 픽셀 — 라벨이 오브젝트에서 멀어지지 않게

  const line = (a, bb, label, d, opts) => {
    const pa = P(a), pb = P(bb);
    const ox = d[0] * GAP, oy = d[1] * GAP;
    pa.x += ox; pa.y += oy; pb.x += ox; pb.y += oy;
    ctx.strokeStyle = PALETTE.dimLine; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    pill(ctx, (pa.x + pb.x) / 2, (pa.y + pb.y) / 2, label, opts);
  };
  const top = led.y + led.h;
  line([led.x, top, led.z], [led.x + led.w, top, led.z], mm(led.w), up, { key: true });
  if (flat) return;
  line([led.x + led.w, led.y, led.z], [led.x + led.w, top, led.z], mm(led.h), right, { key: true });
  if (led.y > 100) line([led.x, 0, led.z], [led.x, led.y, led.z], mm(led.y), [-right[0], -right[1]]);
}

// ── 정보 카드 ───────────────────────────────────────────────────────────────
// { title, lines: [...] } — 작고 정돈된 카드. 배경 위에서도 읽히게 반투명 흰 판을 깐다.
function drawInfoCard(ctx, caption) {
  const title = caption.title || '';
  const lines = caption.lines || [];
  const F = { title: '700 14px', line: '500 11.5px' };
  const font = k => `${F[k]} ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif`;
  ctx.save();
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.font = font('title');
  let wMax = ctx.measureText(title).width;
  ctx.font = font('line');
  for (const l of lines) wMax = Math.max(wMax, ctx.measureText(l).width);

  const padX = 14, padY = 12, lineH = 16;
  const boxW = wMax + padX * 2, boxH = padY * 2 + 18 + lines.length * lineH;
  ctx.shadowColor = 'rgba(30,40,55,.07)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(14, 14, boxW, boxH, 15); else ctx.rect(14, 14, boxW, boxH);
  ctx.fillStyle = PALETTE.cardFill; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = PALETTE.cardLine; ctx.lineWidth = 1; ctx.stroke();

  let y = 14 + padY;
  ctx.font = font('title'); ctx.fillStyle = PALETTE.text;
  ctx.fillText(title, 14 + padX, y);
  y += 19;
  ctx.font = font('line'); ctx.fillStyle = PALETTE.textSub;
  for (const l of lines) { ctx.fillText(l, 14 + padX, y); y += lineH; }
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
  //   회전은 정해진 시점만 쓰므로 드래그로 각도를 바꾸지 않는다.
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
    /** 시점 선택(id). */
    setViewId(id) { view.viewId = cubeView(id).id; view.panX = 0; view.panY = 0; redraw(); onChange?.(getView()); },
    /** 좌(-1)·우(+1)로 한 칸 회전. */
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
