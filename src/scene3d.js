// scene3d.js — 3D 미리보기의 순수 기하·카메라 계산 (DOM 없음. 브라우저·Node 공용 ESM).
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일은 '그리는' 일을 하지 않는다. 방·LED·캐비닛의 3D 좌표(mm)를 만들고,
// 카메라로 화면 좌표(2D)로 투영하는 계산만 담당한다. 실제 캔버스 그리기는 render3d.js.
//
// ※ LED 스펙 계산(충진 배열·해상도·전력 등)의 단일 출처는 engine.js다.
//    이 파일은 engine 결과를 '보여주기 위한 좌표'로만 바꾼다 — 스펙 공식을 중복 구현하지 않는다.
//
// 월드 좌표계 (단위: mm)
//   X : 오른쪽  (0 = 방 왼쪽 벽,      +X = 오른쪽 벽 방향)
//   Y : 위      (0 = 바닥,            +Y = 천장 방향)
//   Z : 앞      (0 = LED가 붙은 벽면, +Z = 방 안쪽(관찰자) 방향)
// ─────────────────────────────────────────────────────────────────────────────

export const DEG = Math.PI / 180;

// ── 벡터 도우미 ─────────────────────────────────────────────────────────────
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── 방 깊이 ─────────────────────────────────────────────────────────────────
// 깊이를 입력하지 않았을 때의 자동 추정. 기존 정면 미리보기(renderPreview)와 같은 규칙을 쓴다
// — 두 뷰의 방 크기가 달라 보이지 않도록. (가로 × 0.85, 4.5~12 m로 제한)
export function autoRoomDepthMm(spaceWmm) {
  return Math.min(Math.max(Math.round(spaceWmm * 0.85), 4500), 12000);
}

// 사용자가 '공간 깊이 D'를 입력했으면 그 값, 비었으면(0·null) 자동 추정값.
export function roomDepthMm(spaceWmm, explicitMm) {
  const d = Number(explicitMm);
  return (Number.isFinite(d) && d > 0) ? d : autoRoomDepthMm(spaceWmm);
}

// ── 카메라 ──────────────────────────────────────────────────────────────────
// 시점 제한. LED 벽을 '바라보는' 용도이므로 360° 회전은 막는다(벽 뒤로 넘어가면 볼 게 없음).
//   yaw   : 좌우 회전(+ = 오른쪽으로 돌아가며 봄)
//   pitch : 상하 회전(+ = 위에서 내려다봄, - = 아래에서 올려다봄)
export const VIEW_LIMITS = Object.freeze({
  yaw: [-90, 90],
  pitch: [0, 90],
  zoom: [0.45, 5],
});

export function clampView(v = {}) {
  return {
    yaw: clamp(Number(v.yaw) || 0, VIEW_LIMITS.yaw[0], VIEW_LIMITS.yaw[1]),
    pitch: clamp(Number(v.pitch) || 0, VIEW_LIMITS.pitch[0], VIEW_LIMITS.pitch[1]),
    zoom: clamp(Number(v.zoom) || 1, VIEW_LIMITS.zoom[0], VIEW_LIMITS.zoom[1]),
  };
}

// ── 시점(고정 카메라) ───────────────────────────────────────────────────────
// 자유 회전 대신 '정해진 몇 개의 시점'만 쓴다. 결과가 항상 똑같이 재현되고,
// 어느 시점에서든 같은 카메라 언어(눈높이·화각)를 쓰므로 그림이 한 벌처럼 보인다.
//
// 아이소메트릭(정사투영)이 아니라 **건축 투시도(원근)** 다.
//   · 사람 눈높이에서 살짝 내려다보는 각도 — 천장에서 내려다보는 미니어처 느낌을 없앤다.
//   · 정면 뷰에서 카메라를 좌우로 조금 옮긴 그림이 되도록 yaw만 바꾼다.
// 평면도(top)만 예외로 정사투영을 쓴다(도면이므로 원근이 있으면 안 된다).

export const EYE_MM = 2350;     // 카메라 눈높이(바닥에서 mm). 서 있는 눈높이보다 살짝 위.
export const LOOK_MM = 1100;    // 바라보는 높이 — 눈높이보다 낮아 자연스럽게 내려다본다.
export const FOV_DEG = 33;      // 화각. 건축 투시도에 쓰는 약망원(왜곡이 적다).
export const MIN_PITCH_DEG = 9; // 최소한 이만큼은 내려다본다. 강당처럼 깊은 공간에서
                                // 눈높이 그대로 두면 좌석이 지평선에 납작하게 뭉친다.

export const CUBE_VIEWS = Object.freeze([
  { id: 'side-l',   label: '좌측',      yaw: -40 },
  { id: 'corner-l', label: '좌측 코너', yaw: -21 },
  { id: 'front',    label: '정면',      yaw: 0 },
  { id: 'corner-r', label: '우측 코너', yaw: 21 },
  { id: 'side-r',   label: '우측',      yaw: 40 },
  { id: 'top',      label: '평면도',    yaw: 0, plan: true },
]);

export const DEFAULT_CUBE_VIEW = 'corner-r';

export function cubeView(id) {
  return CUBE_VIEWS.find(v => v.id === id) || CUBE_VIEWS.find(v => v.id === DEFAULT_CUBE_VIEW);
}

// 시점을 좌우(step +1 = 오른쪽)로 한 칸 돌린다.
// 평면도는 고리 밖이므로, 평면도에서 화살표를 누르면 가운데(정면) 옆 칸으로 들어온다.
export function rotateCubeView(id, step) {
  const ring = CUBE_VIEWS.filter(v => !v.plan);
  const i = ring.findIndex(v => v.id === cubeView(id).id);
  if (i < 0) {
    const mid = ring.findIndex(v => v.yaw === 0);
    return ring[Math.min(ring.length - 1, Math.max(0, mid + Math.sign(step || 1)))].id;
  }
  return ring[(i + step + ring.length) % ring.length].id;
}

// 카메라가 방 밖에 서도록 하는 거리(mm). 방 안에 들어가면 벽이 카메라 뒤로 넘어가 잘린다.
export function viewDistanceMm(scene) {
  return Math.max(scene.D * 1.45, scene.W * 1.25, 8000);
}

/**
 * 시점 id → 카메라. 모든 시점이 같은 눈높이·화각을 쓴다(= 같은 카메라 언어).
 * 평면도만 정사투영.
 */
export function viewCamera(scene, viewId) {
  const v = cubeView(viewId);
  if (v.plan) {
    return makeCamera({
      target: [scene.W / 2, 0, scene.D / 2],
      yaw: 0, pitch: 90,
      distance: Math.max(scene.W, scene.D) * 8,
      ortho: true,
    });
  }
  const distance = viewDistanceMm(scene);
  const target = [scene.W / 2, Math.min(LOOK_MM, scene.H * 0.45), scene.D * 0.28];
  // 눈높이를 정하면 내려다보는 각도(pitch)가 기하로 결정된다 — 각도를 손으로 적지 않는다.
  //   다만 방이 깊을수록 각도가 0에 가까워지므로 최소 각도를 보장한다(깊은 공간도 안이 보이게).
  const pitch = Math.max(MIN_PITCH_DEG, Math.asin(clamp((EYE_MM - target[1]) / distance, -1, 1)) / DEG);
  return makeCamera({ target, yaw: v.yaw, pitch, distance, fovDeg: FOV_DEG });
}

// 카메라를 만든다. target(바라보는 점)을 중심으로 yaw·pitch·distance 만큼 떨어진 곳에 선다.
//   fovDeg = 화각. 작을수록 망원(원근 약함), 클수록 광각(원근 강함).
//   ortho  = true 면 '정사투영'(원근 없음). 평행한 모서리가 화면에서도 평행하게 그려져
//            제품 카탈로그·도면 같은 아이소메트릭 그림이 된다. 큐브 뷰의 기본값.
export function makeCamera({ target, yaw = 0, pitch = 0, distance, fovDeg = 40, ortho = false }) {
  const cy = Math.cos(yaw * DEG), sy = Math.sin(yaw * DEG);
  const cp = Math.cos(pitch * DEG), sp = Math.sin(pitch * DEG);
  // yaw=0·pitch=0 이면 LED 벽 정면(+Z 쪽)에 선다.
  const pos = [
    target[0] + distance * cp * sy,
    target[1] + distance * sp,
    target[2] + distance * cp * cy,
  ];
  const fwd = unit(sub(target, pos));            // 카메라가 보는 방향
  // 바로 위에서 내려다보면(pitch 90°) 보는 방향과 '위'가 겹쳐 좌우축을 정할 수 없다.
  //   이때는 '위' 대신 방의 앞뒤(Z)를 기준으로 삼는다. -Z를 쓰면 평면도가 도면처럼
  //   '오른쪽 = +X, 위쪽 = LED 벽(z=0)'으로 나온다(+Z를 쓰면 좌우가 뒤집힌다).
  const ref = Math.abs(fwd[1]) > 0.999 ? [0, 0, -1] : [0, 1, 0];
  const right = unit(cross(fwd, ref));           // 화면 오른쪽
  const up = cross(right, fwd);                  // 화면 위
  const focal = 1 / Math.tan((fovDeg * DEG) / 2); // 정규화 투영(±1 = 화각 가장자리)
  return { pos, target, fwd, right, up, focal, distance, yaw, pitch, fovDeg, ortho: !!ortho };
}

// 월드 좌표 → 카메라 좌표. z = 카메라 앞쪽 거리(mm, 양수면 카메라 앞).
export function toCameraSpace(cam, p) {
  const v = sub(p, cam.pos);
  return [dot(v, cam.right), dot(v, cam.up), dot(v, cam.fwd)];
}

// 카메라 앞 최소 거리(mm). 이보다 가까우면 투영이 발산하므로 그리지 않는다.
export const NEAR_MM = 60;

// 월드 좌표 → 정규화 화면 좌표. { x, y, z, ok }
//   x·y : 화면 좌표(원점 = 화면 중앙, y는 아래가 +). 픽셀 변환은 fitTransform이 담당.
//   z   : 카메라로부터의 거리(mm) — 앞뒤 정렬(painter's algorithm)에 쓴다.
//   ok  : false면 카메라 뒤쪽이라 그릴 수 없음.
export function projectPoint(cam, p) {
  const [x, y, z] = toCameraSpace(cam, p);
  // 정사투영: 거리로 나누지 않는다 → 멀어도 작아지지 않고 평행선이 평행하게 유지된다.
  if (cam.ortho) return { x, y: -y, z, ok: true };
  if (!(z > NEAR_MM)) return { x: 0, y: 0, z, ok: false };
  const f = cam.focal / z;
  return { x: x * f, y: -y * f, z, ok: true };
}

// ── 장면 구성 ───────────────────────────────────────────────────────────────
// 면(quad) 하나: { kind, pts:[4개 꼭짓점], normal }
//   normal 은 '방 안쪽'을 향한다 — 카메라가 그 면의 앞쪽에 있을 때만 그린다(뒷면 제거).
const quad = (kind, pts, normal, extra) => ({ kind, pts, normal, ...extra });

/**
 * 방 + LED 벽의 3D 장면을 만든다.
 * @param {object} i
 *   spaceW, spaceH : 벽면 가로·세로(mm)
 *   spaceD         : 공간 깊이(mm). 0·null이면 자동 추정
 *   ledW, ledH     : LED 실제 가로·세로(mm)  — engine의 computeConfig 결과
 *   marginW        : LED 좌측 여백(mm)       — engine 결과(좌우 균등)
 *   mountMm        : 바닥에서 LED 아래까지(mm)
 *   cols, rows     : 캐비닛 배열
 *   cabDepth       : 캐비닛 깊이(mm). 벽에서 튀어나온 두께로 그린다
 */
export function buildScene(i) {
  const W = Math.max(1, i.spaceW), H = Math.max(1, i.spaceH);
  const D = roomDepthMm(W, i.spaceD);
  const lw = Math.max(1, i.ledW), lh = Math.max(1, i.ledH);
  const lx = clamp(Number(i.marginW) || 0, 0, Math.max(0, W - lw));
  const ly = clamp(Number(i.mountMm) || 0, 0, Math.max(0, H - lh));
  const lz = clamp(Number(i.cabDepth) || 50, 10, 500);   // 벽에서 튀어나온 깊이
  const led = { x: lx, y: ly, w: lw, h: lh, z: lz };

  // LED — 벽에서 캐비닛 깊이만큼 튀어나온 상자. 벽에 묻히는 뒷면은 빼고 5면만 쓴다.
  const ledQuads = boxQuads('led', { x: lx, y: ly, z: 0, w: lw, h: lh, d: lz })
    .filter(q => q.normal[2] >= 0)
    .map(q => ({ ...q, kind: q.normal[2] > 0.5 ? 'ledFace' : 'ledSide' }));

  return {
    W, H, D, led,
    cols: Math.max(1, Math.round(i.cols) || 1),
    rows: Math.max(1, Math.round(i.rows) || 1),
    ledQuads,
    target: [lx + lw / 2, ly + lh / 2, lz],   // 카메라가 바라보는 점 = LED 중앙
  };
}

// ── 입체 도형 만들기 (가구·벽 두께용) ───────────────────────────────────────
// 직육면체 하나 → 면 6장. x·y·z는 '가장 작은 모서리' 기준, w·h·d는 가로·높이·깊이(mm).
// normal은 바깥쪽을 향한다 → 카메라 반대편 면은 자동으로 그려지지 않는다(뒷면 제거).
export function boxQuads(kind, { x, y, z, w, h, d }, extra) {
  const x1 = x + w, y1 = y + h, z1 = z + d;
  return [
    quad(kind, [[x, y, z1], [x1, y, z1], [x1, y1, z1], [x, y1, z1]], [0, 0, 1], extra),
    quad(kind, [[x, y, z], [x1, y, z], [x1, y1, z], [x, y1, z]], [0, 0, -1], extra),
    quad(kind, [[x1, y, z], [x1, y, z1], [x1, y1, z1], [x1, y1, z]], [1, 0, 0], extra),
    quad(kind, [[x, y, z], [x, y, z1], [x, y1, z1], [x, y1, z]], [-1, 0, 0], extra),
    quad(kind, [[x, y1, z], [x1, y1, z], [x1, y1, z1], [x, y1, z1]], [0, 1, 0], extra),
    quad(kind, [[x, y, z], [x1, y, z], [x1, y, z1], [x, y, z1]], [0, -1, 0], extra),
  ];
}

// 임의 다각형을 위로 뽑아낸 기둥 — 보트형 테이블 상판처럼 사각형이 아닌 모양에 쓴다.
// ring : [[x, z], ...] 평면 윤곽선(시계/반시계 무관). y0~y1 사이 높이로 세운다.
export function polyPrismQuads(kind, ring, y0, y1, extra) {
  const n = ring.length;
  if (n < 3) return [];
  let cx = 0, cz = 0;
  for (const [x, z] of ring) { cx += x / n; cz += z / n; }
  const out = [];
  for (let i = 0; i < n; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % n];
    const nx = (ax + bx) / 2 - cx, nz = (az + bz) / 2 - cz;
    out.push(quad(kind, [[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]], unit([nx, 0, nz]), extra));
  }
  // 윗면·아랫면은 다각형이지만 quad 기반이라 '중심 - 이웃한 두 점'의 부채꼴 조각으로 채운다.
  for (const [y, nml] of [[y1, [0, 1, 0]], [y0, [0, -1, 0]]]) {
    for (let i = 0; i < n; i++) {
      const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % n];
      out.push(quad(kind, [[cx, y, cz], [ax, y, az], [bx, y, bz], [cx, y, cz]], nml, extra));
    }
  }
  return out;
}

// 원뿔대(위아래 지름이 다른 기둥) — 둥근 수형처럼 매끄럽게 굵기가 변하는 형태에 쓴다.
// 같은 지름의 기둥을 쌓으면 계단처럼 층이 보인다.
export function frustumQuads(kind, { cx, cz, r0, r1, y0, y1, sides = 12 }, extra) {
  const out = [];
  const pt = (r, y, i) => {
    const a = (i / sides) * Math.PI * 2;
    return [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
  };
  for (let i = 0; i < sides; i++) {
    const a0 = pt(r0, y0, i), b0 = pt(r0, y0, i + 1);
    const a1 = pt(r1, y1, i), b1 = pt(r1, y1, i + 1);
    const nx = (a0[0] + b0[0]) / 2 - cx, nz = (a0[2] + b0[2]) / 2 - cz;
    out.push(quad(kind, [a0, b0, b1, a1], unit([nx, (r0 - r1) * 0.5, nz]), extra));
  }
  // 위·아래 뚜껑
  for (const [r, y, n] of [[r1, y1, [0, 1, 0]], [r0, y0, [0, -1, 0]]]) {
    if (r <= 0) continue;
    for (let i = 0; i < sides; i++) {
      const a = pt(r, y, i), b = pt(r, y, i + 1);
      out.push(quad(kind, [[cx, y, cz], a, b, [cx, y, cz]], n, extra));
    }
  }
  return out;
}

// 원기둥 근사(정N각기둥) — 의자 다리받침, 화분 등.
export function prismQuads(kind, { cx, cz, r, y0, y1, sides = 16 }, extra) {
  const ring = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    ring.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return polyPrismQuads(kind, ring, y0, y1, extra);
}

// Y축(수직축) 기준 회전 — 가구를 방향에 맞게 돌릴 때 쓴다. deg는 시계 반대방향(+X→+Z).
export function rotateQuadsY(quads, center, deg) {
  if (!deg) return quads;
  const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG);
  const [cx, , cz] = center;
  const rot = ([x, y, z]) => {
    const dx = x - cx, dz = z - cz;
    return [cx + dx * c - dz * s, y, cz + dx * s + dz * c];
  };
  return quads.map(q => ({
    ...q,
    pts: q.pts.map(rot),
    normal: (([x, y, z]) => [x * c - z * s, y, x * s + z * c])(q.normal),
  }));
}

// ── 방 껍데기(컷어웨이) ─────────────────────────────────────────────────────
// 레퍼런스처럼 '벽이 두께를 가진 판'으로 서 있는 모형. 카메라 쪽 벽은 그리지 않아
// 안이 들여다보인다(돌하우스/컷어웨이). side 태그로 어느 벽인지 구분한다.
//   front = LED가 붙은 벽(z=0) · back = 열린 쪽(z=D) · left/right = 좌우 벽
export function roomShellQuads(scene, { thickness = 120, wallTop = true } = {}) {
  const { W, H, D } = scene;
  const t = thickness;
  const out = [];
  const add = (kind, box, extra) => out.push(...boxQuads(kind, box, extra));
  add('floor', { x: -t, y: -t, z: -t, w: W + t * 2, h: t, d: D + t * 2 }, { side: 'floor' });
  add('wall', { x: -t, y: 0, z: -t, w: W + t * 2, h: H, d: t }, { side: 'front' });
  add('wall', { x: -t, y: 0, z: D, w: W + t * 2, h: H, d: t }, { side: 'back' });
  add('wall', { x: -t, y: 0, z: 0, w: t, h: H, d: D }, { side: 'left' });
  add('wall', { x: W, y: 0, z: 0, w: t, h: H, d: D }, { side: 'right' });
  if (!wallTop) return out.filter(q => !(q.side !== 'floor' && q.normal[1] > 0.5));
  return out;
}

// 지금 시점에서 그릴 벽 = '카메라 반대편'에 있는 벽들. 앞쪽 벽은 잘라내 안을 보여준다.
export function visibleWallSides(cam, scene) {
  const { W, D } = scene;
  const [px, , pz] = cam.pos;
  return {
    floor: true,
    front: pz > 0,          // LED 벽: 카메라가 방 안쪽(+Z)에 있을 때 보인다
    back: pz < D,
    left: px > 0,
    right: px < W,
  };
}

// 캐비닛 한 장 한 장을 LED 앞면 위의 작은 사각형으로. 수가 많으면(>maxCells) 생략한다.
export function cabinetQuads(scene, { gapRatio = 0.02, maxCells = 2400 } = {}) {
  const { led, cols, rows } = scene;
  if (cols * rows > maxCells) return [];
  const cw = led.w / cols, ch = led.h / rows;
  const gap = Math.min(cw, ch) * gapRatio;
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = led.x + c * cw + gap / 2, x1 = led.x + (c + 1) * cw - gap / 2;
      // 행 번호는 위에서부터 세는 화면 순서와 맞춘다(r=0이 맨 윗줄).
      const y1 = led.y + led.h - r * ch - gap / 2, y0 = led.y + led.h - (r + 1) * ch + gap / 2;
      out.push(quad('cabinet', [[x0, y0, led.z], [x1, y0, led.z], [x1, y1, led.z], [x0, y1, led.z]], [0, 0, 1], { col: c, row: r }));
    }
  }
  return out;
}

// 바닥 격자선(기본 1200mm — 600 타일 2장). [[시작점, 끝점], ...]
export function floorGridLines(scene, stepMm = 1200) {
  const { W, D } = scene;
  const lines = [];
  for (let x = 0; x <= W + 0.5; x += stepMm) { const xx = Math.min(x, W); lines.push([[xx, 0, 0], [xx, 0, D]]); }
  for (let z = 0; z <= D + 0.5; z += stepMm) { const zz = Math.min(z, D); lines.push([[0, 0, zz], [W, 0, zz]]); }
  return lines;
}

// ── 뒷면 제거 + 앞뒤 정렬 ───────────────────────────────────────────────────
// 카메라가 면의 앞쪽(normal 방향)에 있을 때만 보인다. 방 안쪽을 향한 normal이므로
// 오른쪽으로 돌아가면 오른쪽 벽이 저절로 사라져 안이 들여다보인다(돌하우스 뷰).
export function isFacing(cam, q) {
  return dot(q.normal, sub(cam.pos, q.pts[0])) > 0;
}

// 먼 것부터 그리도록 정렬(painter's algorithm). 카메라 뒤에 걸친 면은 제외.
export function cullAndSort(cam, quads) {
  const out = [];
  for (const q of quads) {
    if (!isFacing(cam, q)) continue;
    const proj = q.pts.map(p => projectPoint(cam, p));
    if (proj.some(p => !p.ok)) continue;
    let z = 0; for (const p of proj) z += p.z;
    out.push({ ...q, proj, depth: z / proj.length });
  }
  out.sort((a, b) => b.depth - a.depth);
  return out;
}

// ── 화면(픽셀) 맞춤 ─────────────────────────────────────────────────────────
// 정규화 좌표를 화면 크기에 맞춰 통째로 확대/이동한다. 어느 각도로 돌려도 장면 전체가
// 화면 안에 들어오게 하는 '자동 맞춤'. (기존 정면 미리보기의 fit 처리와 같은 방식)
export function fitTransform(pts, { width, height, pad = 18, zoom = 1 } = {}) {
  const vis = pts.filter(p => p && p.ok !== false && Number.isFinite(p.x) && Number.isFinite(p.y));
  const w = Math.max(1, width - pad * 2), h = Math.max(1, height - pad * 2);
  if (!vis.length) return { scale: 1, ox: width / 2, oy: height / 2 };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of vis) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  const bw = Math.max(1e-6, x1 - x0), bh = Math.max(1e-6, y1 - y0);
  const scale = Math.min(w / bw, h / bh) * zoom;
  return {
    scale,
    ox: width / 2 - ((x0 + x1) / 2) * scale,
    oy: height / 2 - ((y0 + y1) / 2) * scale,
  };
}

// 정규화 좌표 → 화면 픽셀.
export function toScreen(t, p) {
  return { x: t.ox + p.x * t.scale, y: t.oy + p.y * t.scale };
}

// 자동 맞춤의 기준이 되는 점들(방 8모서리 + LED 4모서리). 캐비닛·격자선은 이 안에 들어오므로 제외.
export function fitAnchors(scene) {
  const { W, H, D, led } = scene;
  return [
    [0, 0, 0], [W, 0, 0], [0, H, 0], [W, H, 0],
    [0, 0, D], [W, 0, D], [0, H, D], [W, H, D],
    [led.x, led.y, led.z], [led.x + led.w, led.y, led.z],
    [led.x, led.y + led.h, led.z], [led.x + led.w, led.y + led.h, led.z],
  ];
}
