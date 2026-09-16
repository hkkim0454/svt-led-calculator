// scene3d.test.js — 3D 미리보기의 기하·카메라 계산 회귀 테스트.
// 화면(캔버스) 없이 순수 계산만 검증한다. 스펙 수치(배열·전력 등)는 engine.test.js 담당.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autoRoomDepthMm, roomDepthMm, clampView, VIEW_LIMITS, defaultDistanceMm,
  makeCamera, toCameraSpace, projectPoint,
  buildScene, cabinetQuads, floorGridLines, isFacing, cullAndSort,
  fitTransform, toScreen, fitAnchors, NEAR_MM,
  CUBE_VIEWS, DEFAULT_CUBE_VIEW, cubeView, rotateCubeView, ISO_PITCH,
  boxQuads, prismQuads, rotateQuadsY, roomShellQuads, visibleWallSides,
} from '../src/scene3d.js';

// 테스트 기준 장면: 8.0 × 3.4 m 벽, MP012F 7×6 = 42캐비닛 (삼성 검증 구성과 같은 형상)
const baseInput = {
  spaceW: 8000, spaceH: 3400, spaceD: 6000,
  ledW: 5644.8, ledH: 2721.6, marginW: 1177.6, mountMm: 500,
  cols: 7, rows: 6, cabDepth: 49.4,
};
const scene = buildScene(baseInput);

test('방 깊이 — 입력이 있으면 그 값, 없으면 가로×0.85(4.5~12m 제한)', () => {
  assert.equal(roomDepthMm(8000, 6000), 6000);      // 직접 입력 우선
  assert.equal(roomDepthMm(8000, 0), autoRoomDepthMm(8000));
  assert.equal(roomDepthMm(8000, null), 6800);      // 8000 × 0.85
  assert.equal(autoRoomDepthMm(2000), 4500);        // 하한
  assert.equal(autoRoomDepthMm(30000), 12000);      // 상한
});

test('시점 제한 — yaw·pitch·zoom이 허용 범위로 잘린다', () => {
  const v = clampView({ yaw: 400, pitch: -90, zoom: 99 });
  assert.equal(v.yaw, VIEW_LIMITS.yaw[1]);
  assert.equal(v.pitch, VIEW_LIMITS.pitch[0]);
  assert.equal(v.zoom, VIEW_LIMITS.zoom[1]);
  assert.deepEqual(clampView({}), { yaw: 0, pitch: 0, zoom: 1 });
});

test('buildScene — LED가 여백·하단높이대로 놓이고 카메라 타깃은 LED 중앙', () => {
  assert.equal(scene.W, 8000);
  assert.equal(scene.D, 6000);
  assert.equal(scene.led.x, 1177.6);
  assert.equal(scene.led.y, 500);
  assert.equal(scene.target[0], 1177.6 + 5644.8 / 2);
  assert.equal(scene.target[1], 500 + 2721.6 / 2);
  // LED 상자: 앞면 1 + 옆면 4 (벽에 묻히는 뒷면 제외)
  assert.equal(scene.ledQuads.length, 5);
  assert.equal(scene.ledQuads.filter(q => q.kind === 'ledFace').length, 1);
});

test('buildScene — LED가 벽보다 크거나 값이 이상해도 벽 안으로 잘린다', () => {
  const s = buildScene({ ...baseInput, marginW: -500, mountMm: 99999 });
  assert.ok(s.led.x >= 0);
  assert.ok(s.led.y + s.led.h <= s.H + 1e-6);
});

test('캐비닛 — cols×rows 장이 생기고, 너무 많으면 생략한다', () => {
  const cells = cabinetQuads(scene);
  assert.equal(cells.length, 42);
  // 첫 장(0행 0열)은 LED 왼쪽 '위'에 온다 — 화면에서 세는 순서와 일치
  const first = cells[0];
  assert.equal(first.row, 0);
  assert.equal(first.col, 0);
  // 캐비닛 사이 이음매(gap)의 절반만큼 안쪽에 있다 — LED 위 모서리에 거의 붙어 있어야 한다.
  const topY = Math.max(...first.pts.map(p => p[1]));
  const ledTop = scene.led.y + scene.led.h;
  assert.ok(topY < ledTop && ledTop - topY < 12, `topY=${topY}, ledTop=${ledTop}`);
  assert.equal(cabinetQuads(buildScene({ ...baseInput, cols: 100, rows: 100 })).length, 0);
});

test('바닥 격자 — 방 크기만큼 생기고 모두 바닥(Y=0)에 있다', () => {
  const lines = floorGridLines(scene, 1200);
  assert.ok(lines.length > 4);
  for (const [a, b] of lines) { assert.equal(a[1], 0); assert.equal(b[1], 0); }
});

test('카메라 — 정면(yaw·pitch 0)이면 LED 벽 앞(+Z)에 서서 벽을 본다', () => {
  const cam = makeCamera({ target: scene.target, yaw: 0, pitch: 0, distance: 6000 });
  assert.ok(Math.abs(cam.pos[0] - scene.target[0]) < 1e-6);
  assert.ok(Math.abs(cam.pos[1] - scene.target[1]) < 1e-6);
  assert.ok(Math.abs(cam.pos[2] - (scene.target[2] + 6000)) < 1e-6);
  assert.ok(cam.fwd[2] < 0);                     // -Z(벽) 방향을 본다
  assert.ok(Math.abs(cam.right[0] - 1) < 1e-9);  // 화면 오른쪽 = +X
  assert.ok(Math.abs(cam.up[1] - 1) < 1e-9);     // 화면 위 = +Y
});

test('카메라 — yaw를 주면 오른쪽으로 돌아가며(+X) 여전히 타깃을 본다', () => {
  const cam = makeCamera({ target: scene.target, yaw: 40, pitch: 0, distance: 6000 });
  assert.ok(cam.pos[0] > scene.target[0]);
  const z = toCameraSpace(cam, scene.target)[2];
  assert.ok(Math.abs(z - 6000) < 1e-6);          // 타깃까지 거리 = distance
});

test('투영 — 타깃은 화면 중앙, 두 배 멀면 절반 크기, 뒤쪽은 그리지 않음', () => {
  const cam = makeCamera({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 5000 });
  const c = projectPoint(cam, [0, 0, 0]);
  assert.ok(c.ok && Math.abs(c.x) < 1e-9 && Math.abs(c.y) < 1e-9);
  const near = projectPoint(cam, [500, 0, 0]);          // 카메라에서 5000mm
  const far = projectPoint(cam, [1000, 0, -5000]);      // 10000mm, 옆으로 2배
  assert.ok(Math.abs(near.x - far.x) < 1e-9);          // 화면에서는 같은 위치로 보인다
  assert.ok(far.z > near.z);
  assert.equal(projectPoint(cam, [0, 0, 100000]).ok, false);   // 카메라 뒤
  assert.equal(projectPoint(cam, [0, 0, 5000 - NEAR_MM / 2]).ok, false);
});

test('투영 — 화면 y는 아래가 +(위쪽 점이 더 작은 y)', () => {
  const cam = makeCamera({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 5000 });
  assert.ok(projectPoint(cam, [0, 1000, 0]).y < projectPoint(cam, [0, -1000, 0]).y);
});

test('컷어웨이 — 카메라 쪽 벽은 잘라내고 반대편 벽만 그린다', () => {
  const far = defaultDistanceMm(scene) * 4;
  // 우측 코너에서 보면: LED 벽(front)과 좌측 벽이 남고, 가까운 우측·정면 벽은 잘린다
  const camR = makeCamera({ target: scene.target, yaw: 45, pitch: ISO_PITCH, distance: far, ortho: true });
  const vR = visibleWallSides(camR, scene);
  assert.deepEqual(vR, { floor: true, front: true, back: false, left: true, right: false });
  // 좌측 코너에서는 좌우가 뒤바뀐다
  const camL = makeCamera({ target: scene.target, yaw: -45, pitch: ISO_PITCH, distance: far, ortho: true });
  const vL = visibleWallSides(camL, scene);
  assert.equal(vL.left, false);
  assert.equal(vL.right, true);
  assert.equal(vL.front, true);
});

test('방 껍데기 — 바닥·벽 4개가 두께를 가진 상자로 만들어진다', () => {
  const shell = roomShellQuads(scene, { thickness: 120 });
  for (const side of ['floor', 'front', 'back', 'left', 'right']) {
    assert.equal(shell.filter(q => q.side === side).length, 6, side);   // 상자 1개 = 면 6장
  }
  // 바닥 윗면은 Y=0 (방 바닥 높이)
  const top = shell.find(q => q.side === 'floor' && q.normal[1] > 0.5);
  assert.ok(top.pts.every(p => p[1] === 0));
});

test('정렬 — 먼 면부터(painter) 나오고, LED 앞면이 벽보다 나중에(위에) 그려진다', () => {
  const cam = makeCamera({ target: scene.target, yaw: 45, pitch: ISO_PITCH, distance: defaultDistanceMm(scene) * 4, ortho: true });
  const wallFront = roomShellQuads(scene).filter(q => q.side === 'front');
  const vis = cullAndSort(cam, [...wallFront, ...scene.ledQuads]);
  assert.ok(vis.length > 0);
  for (let i = 1; i < vis.length; i++) assert.ok(vis[i - 1].depth >= vis[i].depth);
  const iLed = vis.findIndex(q => q.kind === 'ledFace');
  const iWall = vis.findIndex(q => q.side === 'front' && q.normal[2] > 0.5);
  assert.ok(iLed >= 0 && iWall >= 0 && iLed > iWall);
});

test('자동 맞춤 — 어느 각도로 돌려도 장면 전체가 화면 안에 들어온다', () => {
  const width = 900, height = 520, pad = 18;
  for (const yaw of [-90, -45, 0, 45, 90]) {
    for (const pitch of [0, ISO_PITCH, 60, 90]) {
      const cam = makeCamera({ target: scene.target, yaw, pitch, distance: defaultDistanceMm(scene) * 4, ortho: true });
      const pts = fitAnchors(scene).map(p => projectPoint(cam, p));
      const t = fitTransform(pts, { width, height, pad });
      for (const p of pts.filter(p => p.ok)) {
        const s = toScreen(t, p);
        assert.ok(s.x >= pad - 0.5 && s.x <= width - pad + 0.5, `x=${s.x} (yaw ${yaw}, pitch ${pitch})`);
        assert.ok(s.y >= pad - 0.5 && s.y <= height - pad + 0.5, `y=${s.y} (yaw ${yaw}, pitch ${pitch})`);
      }
    }
  }
});

test('자동 맞춤 — zoom 배율이 그대로 크기에 반영된다', () => {
  const cam = makeCamera({ target: scene.target, yaw: 0, pitch: 0, distance: 6000 });
  const pts = fitAnchors(scene).map(p => projectPoint(cam, p));
  const a = fitTransform(pts, { width: 800, height: 400 });
  const b = fitTransform(pts, { width: 800, height: 400, zoom: 2 });
  assert.ok(Math.abs(b.scale - a.scale * 2) < 1e-9);
});

test('정사투영(아이소) — 거리와 상관없이 크기가 같고 평행선이 평행하게 유지된다', () => {
  const cam = makeCamera({ target: [0, 0, 0], yaw: 45, pitch: ISO_PITCH, distance: 50000, ortho: true });
  const a0 = projectPoint(cam, [0, 0, 0]), a1 = projectPoint(cam, [1000, 0, 0]);
  const b0 = projectPoint(cam, [0, 0, 8000]), b1 = projectPoint(cam, [1000, 0, 8000]);
  const len = p => Math.hypot(p[0], p[1]);
  const va = [a1.x - a0.x, a1.y - a0.y], vb = [b1.x - b0.x, b1.y - b0.y];
  assert.ok(Math.abs(len(va) - len(vb)) < 1e-9);                       // 멀어도 같은 크기
  assert.ok(Math.abs(va[0] * vb[1] - va[1] * vb[0]) < 1e-9);           // 평행(외적 0)
  assert.equal(projectPoint(cam, [0, 0, 99999]).ok, true);             // 정사투영은 근거리 잘림 없음
});

test('큐브 뷰 — 꼭짓점·모서리·면 시점이 정의돼 있고 기본은 우측 코너', () => {
  assert.ok(CUBE_VIEWS.length >= 8);
  assert.equal(cubeView(DEFAULT_CUBE_VIEW).id, 'iso-r');
  assert.equal(cubeView('없는값').id, DEFAULT_CUBE_VIEW);              // 잘못된 값은 기본 시점
  const corner = CUBE_VIEWS.filter(v => v.kind === 'corner');
  assert.equal(corner.length, 2);
  for (const v of corner) assert.ok(Math.abs(v.pitch - ISO_PITCH) < 1e-9);   // 정아이소메트릭 각도
  for (const v of CUBE_VIEWS) assert.deepEqual(clampView(v), clampView({ yaw: v.yaw, pitch: v.pitch, zoom: 1 }));
});

test('큐브 뷰 — 좌우로 한 칸씩 돌리면 같은 높이의 시점끼리 순환한다', () => {
  const start = 'iso-r';
  const next = rotateCubeView(start, 1);
  assert.notEqual(next, start);
  assert.equal(cubeView(next).pitch, cubeView(start).pitch);           // 높이(pitch)는 그대로
  // 한 바퀴 돌면 제자리
  let id = start;
  const ring = CUBE_VIEWS.filter(v => Math.abs(v.pitch - cubeView(start).pitch) < 0.01 && v.pitch < 89).length;
  for (let i = 0; i < ring; i++) id = rotateCubeView(id, 1);
  assert.equal(id, start);
  assert.equal(rotateCubeView(rotateCubeView(start, 1), -1), start);   // 되돌리기
});

test('상자 — 면 6장이 나오고 각 면의 normal은 바깥을 향한다', () => {
  const b = boxQuads('test', { x: 0, y: 0, z: 0, w: 100, h: 200, d: 300 });
  assert.equal(b.length, 6);
  const center = [50, 100, 150];
  for (const q of b) {
    // 면 중심 - 상자 중심 이 normal과 같은 방향이면 바깥을 향한 것
    const c = q.pts.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4, a[2] + p[2] / 4], [0, 0, 0]);
    const v = [c[0] - center[0], c[1] - center[1], c[2] - center[2]];
    assert.ok(v[0] * q.normal[0] + v[1] * q.normal[1] + v[2] * q.normal[2] > 0);
  }
  // 상자 밖에서 보면 6면 중 최대 3면만 보인다
  const cam = makeCamera({ target: center, yaw: 40, pitch: 30, distance: 5000, ortho: true });
  assert.equal(b.filter(q => isFacing(cam, q)).length, 3);
});

test('원기둥 근사 — 옆면이 N개 생기고 위·아래 뚜껑이 붙는다', () => {
  const p = prismQuads('t', { cx: 0, cz: 0, r: 300, y0: 0, y1: 100, sides: 12 });
  assert.equal(p.length, 12 * 3);                                      // 옆면 12 + 뚜껑 12×2
  for (const q of p) for (const pt of q.pts) assert.ok(Math.hypot(pt[0], pt[2]) <= 300 + 1e-9);
});

test('회전 — Y축 90° 회전이 좌표와 normal에 같이 적용된다', () => {
  const b = boxQuads('t', { x: 0, y: 0, z: 0, w: 1000, h: 100, d: 200 });
  const r = rotateQuadsY(b, [500, 0, 100], 90);
  assert.equal(r.length, b.length);
  // 원래 +X를 향하던 면은 회전 뒤 +Z를 향한다
  const px = b.findIndex(q => q.normal[0] > 0.5);
  assert.ok(Math.abs(r[px].normal[2] - 1) < 1e-9);
  assert.ok(Math.abs(r[px].normal[0]) < 1e-9);
  // 0°는 원본 그대로
  assert.equal(rotateQuadsY(b, [0, 0, 0], 0), b);
});

test('큐브 뷰 — 회전 가능한 고리는 아이소(꼭짓점)와 낮은 시점 둘, 평면도는 고리 밖', () => {
  const pitches = [...new Set(CUBE_VIEWS.filter(v => v.pitch < 89).map(v => v.pitch))];
  assert.equal(pitches.length, 2, '높이는 아이소와 낮은 시점 두 종류');
  for (const pitch of pitches) {
    const ring = CUBE_VIEWS.filter(v => v.pitch === pitch);
    assert.ok(ring.length >= 3, `${pitch}° 고리가 너무 작음`);
    // 같은 고리 안에서만 순환한다
    let id = ring[0].id;
    for (let i = 0; i < ring.length; i++) {
      id = rotateCubeView(id, 1);
      assert.equal(cubeView(id).pitch, pitch);
    }
    assert.equal(id, ring[0].id, '한 바퀴 돌면 제자리');
  }
  // 평면도는 혼자이므로 회전해도 그대로
  assert.equal(rotateCubeView('top', 1), 'top');
});

test('평면도(바로 위) 시점에서도 카메라 축이 무너지지 않는다', () => {
  const v = cubeView('top');
  const cam = makeCamera({ target: scene.target, yaw: v.yaw, pitch: v.pitch, distance: 100000, ortho: true });
  for (const axis of [cam.right, cam.up, cam.fwd]) {
    assert.ok(Math.abs(Math.hypot(...axis) - 1) < 1e-9, `축 길이 ${axis}`);
  }
  // 위에서 내려다보면 방의 가로·세로가 화면에서 서로 수직인 넓이를 가진다
  const a = projectPoint(cam, [0, 0, 0]), b = projectPoint(cam, [scene.W, 0, 0]), c = projectPoint(cam, [0, 0, scene.D]);
  assert.ok(Math.hypot(b.x - a.x, b.y - a.y) > 1);
  assert.ok(Math.hypot(c.x - a.x, c.y - a.y) > 1);
  // 높이(Y)는 화면에서 거의 움직이지 않는다(납작해진다)
  const up = projectPoint(cam, [0, 3000, 0]);
  assert.ok(Math.hypot(up.x - a.x, up.y - a.y) < 1e-6);
});
