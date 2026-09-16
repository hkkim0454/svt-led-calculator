// render3d-gl.js — 3D 미리보기의 Three.js(WebGL) 렌더러. [STEP 1 — 최소 골격]
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일은 '보여주기'만 한다. LED 배열·크기·해상도·좌석 수 같은 계산은 전부
// engine.js / room-presets.js가 이미 끝낸 값을 **읽기만** 한다. 공식을 다시 쓰지 않는다.
//
// STEP 1에서 만드는 것 (그 외에는 아직 만들지 않는다)
//   렌더러 · 씬 · 원근 카메라 · OrbitControls · 기본 조명
//   바닥 · 정면(LED) 벽 · 좌측 벽 · 우측 벽 · LED 화면 · 무대
//
// 아직 없는 것: 좌석·사람·치수·바닥 격자·포인트 벽·미니맵·PNG 저장·시점 프리셋 UI
//
// 월드 좌표계 (Three.js 단위, 오른손 좌표계)
//   X : 오른쪽  (0 = 방 왼쪽 벽,      +X = 오른쪽 벽 방향)
//   Y : 위      (0 = 바닥,            +Y = 천장 방향)
//   Z : 앞      (0 = LED가 붙은 벽면, +Z = 방 안쪽(관찰자) 방향)
//   ※ 기존 Canvas 렌더러(scene3d.js)와 축 방향이 같다 — room-presets의 배치값을 그대로 쓸 수 있다.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from './vendor/three/three.module.min.js';
import { OrbitControls } from './vendor/three/OrbitControls.js';
// 단위 환산·카메라 상수·모델 변환은 Three.js가 필요 없는 순수 계산이라 따로 뒀다
//   (Three.js는 브라우저 전용이라 npm test 에서 못 불러온다 — gl-model.js 는 불러올 수 있다).
import { MM_PER_UNIT, u, toMm, EYE_MM, LOOK_MM, FOV_DEG, START_YAW_DEG, viewDistance, buildGLModel } from './gl-model.js?v=354';

// 화면(app.js)이 한 곳에서만 불러 쓰도록 다시 내보낸다.
export { MM_PER_UNIT, u, toMm, EYE_MM, LOOK_MM, FOV_DEG, START_YAW_DEG, viewDistance, buildGLModel };

// ── 색 ──────────────────────────────────────────────────────────────────────
// 정면 뷰·기존 3D 뷰와 같은 팔레트. 공간은 '물리 다이어그램'이라 항상 밝은 톤으로 그린다.
export const GL_PALETTE = Object.freeze({
  bg: '#eef1f5',            // 배경(스튜디오)
  wallFront: '#f0f3f8',     // LED가 붙은 정면 벽
  wallSide: '#e7ecf3',      // 좌·우 옆벽
  floor: '#d4d9e1',         // 바닥 — 벽보다 살짝 어둡게
  ledCore: '#315fa0',       // LED 화면 가운데(푸른 심지)
  ledMid1: '#18345d',
  ledMid2: '#101d35',
  ledEdge: '#0b1323',       // 화면 가장자리(거의 검정)
  ledBody: '#1b2432',       // 캐비닛 옆면(두께)
  ledGlow: '#2f7ff6',       // 벽에 번지는 푸른 헤일로
  stageTop: '#eef1f5',      // 무대 윗면
  stageSide: '#dce1e7',     // 무대 옆면
});

// ── LED 화면 텍스처 ─────────────────────────────────────────────────────────
// 정면 뷰와 같은 '짙은 네이비 + 가운데만 은은하게 푸른' 화면. 캔버스로 한 번 그려 텍스처로 쓴다.
// (실제 콘텐츠 이미지 올리기는 다음 단계 — 여기서는 꺼진 듯 은은한 기본 화면만.)
function makeScreenTexture(aspect = 16 / 9) {
  const H = 512, W = Math.max(64, Math.round(H * aspect));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const r = Math.hypot(W, H) / 2;
  const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, r);
  g.addColorStop(0, GL_PALETTE.ledCore);
  g.addColorStop(0.18, GL_PALETTE.ledMid1);
  g.addColorStop(0.5, GL_PALETTE.ledMid2);
  g.addColorStop(1, GL_PALETTE.ledEdge);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 벽에 번지는 헤일로(화면이 켜져 있다는 느낌). 가운데가 밝고 가장자리로 갈수록 투명해진다.
function makeGlowTexture() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(47,127,246,.34)');
  g.addColorStop(0.45, 'rgba(47,127,246,.10)');
  g.addColorStop(1, 'rgba(47,127,246,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ── 장면 만들기 ─────────────────────────────────────────────────────────────
// 방·LED·무대를 하나의 Group에 담아 돌려준다. 모델이 바뀌면 이 Group만 통째로 갈아 끼운다.
function buildRoomGroup(model, shared) {
  const { room, led, stage } = model;
  const g = new THREE.Group();
  g.name = 'roomGroup';

  const matWallFront = new THREE.MeshStandardMaterial({
    color: GL_PALETTE.wallFront, roughness: 0.96, metalness: 0, side: THREE.FrontSide,
  });
  const matWallSide = new THREE.MeshStandardMaterial({
    color: GL_PALETTE.wallSide, roughness: 0.96, metalness: 0, side: THREE.FrontSide,
  });
  const matFloor = new THREE.MeshStandardMaterial({
    color: GL_PALETTE.floor, roughness: 0.92, metalness: 0, side: THREE.FrontSide,
  });

  // ① 바닥 — XZ 평면. PlaneGeometry는 XY 평면에 서 있으므로 눕힌다.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(room.W, room.D), matFloor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(room.W / 2, 0, room.D / 2);
  floor.name = 'floor';
  g.add(floor);

  // ② 정면 벽(LED가 붙는 벽, z=0) — 방 안쪽(+Z)을 향한다.
  const wallFront = new THREE.Mesh(new THREE.PlaneGeometry(room.W, room.H), matWallFront);
  wallFront.position.set(room.W / 2, room.H / 2, 0);
  wallFront.name = 'wallFront';
  g.add(wallFront);

  // ③ 좌측 벽(x=0) — 방 안쪽(+X)을 향하도록 +90° 돌린다.
  const wallLeft = new THREE.Mesh(new THREE.PlaneGeometry(room.D, room.H), matWallSide);
  wallLeft.rotation.y = Math.PI / 2;
  wallLeft.position.set(0, room.H / 2, room.D / 2);
  wallLeft.name = 'wallLeft';
  g.add(wallLeft);

  // ④ 우측 벽(x=W) — 방 안쪽(−X)을 향한다.
  const wallRight = new THREE.Mesh(new THREE.PlaneGeometry(room.D, room.H), matWallSide);
  wallRight.rotation.y = -Math.PI / 2;
  wallRight.position.set(room.W, room.H / 2, room.D / 2);
  wallRight.name = 'wallRight';
  g.add(wallRight);

  // ⑤ LED — 벽에서 캐비닛 깊이만큼 튀어나온 상자 + 그 앞면에 붙는 화면.
  //    상자와 화면을 나누면 옆면(두께)과 화면 색을 따로 줄 수 있다.
  const ledGroup = new THREE.Group();
  ledGroup.name = 'led';
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(led.w, led.h, led.depth),
    new THREE.MeshStandardMaterial({ color: GL_PALETTE.ledBody, roughness: 0.6, metalness: 0.1 }),
  );
  // 상자 기준점은 가운데다 — 왼쪽아래앞 모서리 기준인 계산값에서 절반씩 옮긴다.
  body.position.set(led.x + led.w / 2, led.y + led.h / 2, led.depth / 2);
  body.name = 'ledBody';
  ledGroup.add(body);

  // 화면: 상자 앞면에 아주 살짝 띄워 붙인다(같은 위치면 z-fighting으로 지글거린다).
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(led.w, led.h),
    new THREE.MeshBasicMaterial({ map: shared.screenTex(led.w / led.h), toneMapped: false }),
  );
  screen.position.set(led.x + led.w / 2, led.y + led.h / 2, led.depth + u(1.5));
  screen.name = 'ledScreen';
  ledGroup.add(screen);

  // 벽에 번지는 헤일로 — 화면보다 크게, 벽 바로 앞에. 더해지는(additive) 빛이라 벽을 밝힌다.
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(led.w * 2.1, led.h * 2.6),
    new THREE.MeshBasicMaterial({
      map: shared.glowTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }),
  );
  halo.position.set(led.x + led.w / 2, led.y + led.h / 2, u(6));
  halo.renderOrder = -1;
  halo.name = 'ledHalo';
  ledGroup.add(halo);
  g.add(ledGroup);

  // ⑥ 무대 — 강당류에서 배치 계산(room-presets)이 무대를 놓았을 때만 그린다.
  //    크기·위치는 전부 그 계산 결과를 그대로 쓴다(여기서 새로 정하지 않는다).
  if (stage) {
    const top = new THREE.MeshStandardMaterial({ color: GL_PALETTE.stageTop, roughness: 0.9 });
    const side = new THREE.MeshStandardMaterial({ color: GL_PALETTE.stageSide, roughness: 0.92 });
    // BoxGeometry 면 순서: +X, −X, +Y(윗면), −Y, +Z, −Z
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(stage.w, stage.h, stage.d),
      [side, side, top, side, side, side],
    );
    box.position.set(stage.x, stage.h / 2, stage.z);
    box.name = 'stage';
    g.add(box);
  }

  return g;
}

// ── 뷰어 ────────────────────────────────────────────────────────────────────
/**
 * 캔버스 하나를 Three.js 3D 뷰어로 만든다.
 * 반환 객체의 메서드만 화면(app.js)이 쓴다 — 내부 구조는 언제든 바꿀 수 있다.
 *
 * @param canvas   <canvas>
 * @param onError  WebGL을 못 쓰는 환경 등에서 부른다(화면에 안내 문구를 띄우도록)
 */
export function createViewerGL(canvas, { onError } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  } catch (e) {
    onError?.(e);
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(GL_PALETTE.bg);

  const camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 0.05, 500);

  // ── 조명 ──
  // 밝고 그림자가 옅은 실내. 면끼리 밝기 차만 남기고 어둡게 뭉치지 않게 한다.
  //   hemi : 위는 밝은 회색, 아래는 바닥색 — 전체를 부드럽게 채운다.
  //   key  : 앞 위쪽에서 오는 주광 — 벽·무대에 방향감을 준다.
  //   fill : 반대쪽에서 아주 약하게 — 그늘진 면이 새까매지지 않게.
  const hemi = new THREE.HemisphereLight(0xffffff, 0xc7cdd6, 2.1);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.name = 'keyLight';
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.45);
  fill.name = 'fillLight';
  scene.add(fill);

  // ── 시점 조작(OrbitControls) ──
  // STEP 1에서는 개발 확인용으로 열어 둔다. 시점 프리셋 UI는 다음 단계.
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = false;
  controls.minDistance = 1;
  controls.maxDistance = 200;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;   // 바닥 아래로 내려가지 않게
  controls.minPolarAngle = 0.35;                 // 바로 위에서 내려다보지 않게(평면도는 다음 단계)
  // 벽은 한쪽 면만 그린다(방 안쪽). 카메라가 옆으로 크게 돌아 방 밖으로 나가면 벽이 사라져
  //   그림이 깨져 보이므로, LED를 바라보는 범위(±60°) 안에서만 돌게 막는다.
  controls.minAzimuthAngle = -Math.PI / 3;
  controls.maxAzimuthAngle = Math.PI / 3;
  let userMoved = false;
  controls.addEventListener('change', () => { needsRender = true; });
  controls.addEventListener('start', () => { userMoved = true; });

  // 텍스처는 모델이 바뀌어도 다시 만들 필요가 없다(가로세로비가 달라질 때만 새로).
  let screenTexCache = null, screenTexAspect = null;
  const shared = {
    glowTex: makeGlowTexture(),
    screenTex(aspect) {
      if (!screenTexCache || Math.abs(aspect - screenTexAspect) > 0.01) {
        screenTexCache?.dispose();
        screenTexCache = makeScreenTexture(aspect);
        screenTexAspect = aspect;
      }
      return screenTexCache;
    },
  };

  let group = null;
  let model = null;
  let needsRender = false;
  let raf = 0;
  let disposed = false;

  const size = () => ({
    w: Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || 800),
    h: Math.max(1, canvas.clientHeight || 460),
  });

  function resize() {
    const { w, h } = size();
    renderer.setSize(w, h, false);      // false = 캔버스의 CSS 크기는 건드리지 않는다(CSS가 정한다)
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // 화면비가 바뀌면 LED를 담는 거리도 달라진다. 단, 사용자가 시점을 만진 뒤에는
    //   그 시점을 존중해 다시 앉히지 않는다.
    if (model && !userMoved) frameRoom(model);
    needsRender = true;
  }

  // 방·LED 크기가 바뀌면 카메라·조명을 거기에 맞춰 다시 앉힌다.
  //   '방 안에서 LED를 바라보는' 실내 시점 — 바라보는 점은 LED 중앙이다.
  function frameRoom(m) {
    const { room, led } = m;
    // 바라보는 점: 가로는 LED 중앙, 높이는 눈높이보다 낮은 지점.
    //   LED 중앙(보통 2 m 이상)을 그대로 보면 카메라가 수평이 되어 바닥이 화면 밖으로 나간다.
    const target = new THREE.Vector3(
      led.x + led.w / 2,
      Math.min(u(LOOK_MM), room.H * 0.45, led.y + led.h / 2),
      led.depth,
    );
    const dist = viewDistance(led, room.D, camera.aspect);
    const yaw = START_YAW_DEG * Math.PI / 180;
    // 눈높이는 사람 시점(2.35 m)으로 두되, 천장이 낮으면 그 안에 머문다.
    const eye = Math.min(u(EYE_MM), room.H * 0.8);
    camera.position.set(
      THREE.MathUtils.clamp(target.x + dist * Math.sin(yaw), 0.3, room.W - 0.3),
      eye,
      THREE.MathUtils.clamp(target.z + dist * Math.cos(yaw), 1, room.D - 0.3),
    );
    camera.far = Math.max(200, Math.max(room.W, room.D) * 8);
    camera.updateProjectionMatrix();
    controls.target.copy(target);
    controls.minDistance = 0.8;
    controls.maxDistance = Math.max(room.W, room.D) * 2.5;
    controls.update();

    // 조명은 방을 기준으로 놓는다 — 방이 커져도 같은 방향에서 빛이 온다.
    key.position.set(room.W * 0.25, room.H * 2.2, room.D * 1.1);
    key.target.position.set(room.W / 2, room.H * 0.3, room.D * 0.3);
    scene.add(key.target);
    fill.position.set(room.W * 1.3, room.H * 1.2, room.D * 0.2);
    fill.target.position.set(room.W / 2, room.H * 0.4, 0);
    scene.add(fill.target);
  }

  // 씬에서 Group 하나를 떼어내고 그 안의 GPU 자원을 모두 반납한다(메모리 누수 방지).
  function disposeGroup(gr) {
    if (!gr) return;
    gr.traverse(o => {
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      // 텍스처는 공용(shared)이라 여기서 없애지 않는다 — dispose()에서 한 번에 정리한다.
      for (const mt of mats) mt.dispose?.();
    });
    scene.remove(gr);
  }

  function loop() {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    // controls.update()는 카메라가 실제로 움직였을 때만 true를 돌려준다(관성 포함).
    const moved = controls.update();
    if (moved || needsRender) {
      needsRender = false;
      renderer.render(scene, camera);
    }
  }

  const ro = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(() => resize()) : null;
  ro?.observe(canvas.parentElement || canvas);
  window.addEventListener('resize', resize);

  resize();
  loop();

  return {
    /**
     * 장면 데이터 교체. 방 크기가 바뀌었을 때만 카메라를 다시 앉힌다
     * (매번 앉히면 사용자가 돌려 둔 시점이 초기화된다).
     */
    setModel(next) {
      if (!next) return;
      const sameRoom = model
        && Math.abs(model.room.W - next.room.W) < 1e-6
        && Math.abs(model.room.H - next.room.H) < 1e-6
        && Math.abs(model.room.D - next.room.D) < 1e-6;
      disposeGroup(group);
      model = next;
      group = buildRoomGroup(model, shared);
      scene.add(group);
      if (!sameRoom) frameRoom(model);
      needsRender = true;
    },
    /** 카메라를 처음 위치로 되돌린다. */
    resetView() { userMoved = false; if (model) frameRoom(model); needsRender = true; },
    resize,
    /** 지금 카메라 상태(디버깅·다음 단계의 시점 저장용). */
    getView() {
      return {
        position: camera.position.toArray(),
        target: controls.target.toArray(),
        fov: camera.fov,
      };
    },
    /** 테스트·디버깅용 — 씬 내부를 들여다볼 수 있게. */
    _internals: { scene, camera, controls, renderer, get group() { return group; } },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', resize);
      controls.dispose();
      disposeGroup(group);
      shared.glowTex.dispose();
      screenTexCache?.dispose();
      renderer.dispose();
    },
  };
}
