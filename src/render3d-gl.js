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
import { buildFurnitureGroup, disposeFurniture } from './furniture-gl.js?v=405';
import { createMaterialLibrary } from './materials-gl.js?v=405';
import { MOODS } from './materials.js?v=405';
import { ledImageFit } from './led-image.js?v=405';
import { renderMode, lightLevels, DEFAULT_RENDER_MODE } from './render-mode.js?v=405';
// 단위 환산·카메라 상수·모델 변환은 Three.js가 필요 없는 순수 계산이라 따로 뒀다
//   (Three.js는 브라우저 전용이라 npm test 에서 못 불러온다 — gl-model.js 는 불러올 수 있다).
import {
  MM_PER_UNIT, u, toMm, EYE_MM, LOOK_MM, FOV_DEG, START_YAW_DEG, viewDistance, buildGLModel,
  CAMERA_PRESETS, DEFAULT_PRESET, cameraPreset, stepPreset, presetPose, ACCENT_WALL_SIDE,
  TOP_PITCH_DEG, orthoFitHeight,
  BASEBOARD_MM, CEILING_THK_MM, GRID_LIFT_MM, showCeiling, LIGHTS, shadowMapSize, clampFov, FOV_RANGE,
} from './gl-model.js?v=405';

// 화면(app.js)이 한 곳에서만 불러 쓰도록 다시 내보낸다.
export {
  MM_PER_UNIT, u, toMm, EYE_MM, LOOK_MM, FOV_DEG, START_YAW_DEG, viewDistance, buildGLModel,
  CAMERA_PRESETS, DEFAULT_PRESET, cameraPreset, stepPreset, presetPose, ACCENT_WALL_SIDE,
  TOP_PITCH_DEG, orthoFitHeight,
};

// 프리셋 전환에 걸리는 시간(ms). 툭 끊기지 않으면서 기다린다는 느낌은 없는 길이.
export const TRANSITION_MS = 420;

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
  stageFascia: '#c8cfd9',   // 무대 전면판(관객 쪽) — 옆면보다 어둡게 해 단 높이가 읽히게
  wallAccent: '#afc9be',    // 포인트 벽(차분한 세이지) — 기존 3D 뷰와 같은 색
  gridMinor: 'rgba(89,104,125,.10)',   // 바닥 격자 600mm
  gridMajor: 'rgba(89,104,125,.20)',   // 바닥 격자 1200mm
  baseboard: '#c3cbd6',     // 걸레받이 — 벽보다 한 단계 어두운 회색(튀지 않게)
  ceiling: '#f4f6fa',       // 천장 아랫면 — 벽보다 살짝 밝게
  dimLine: '#8c95a3',       // 치수 보조선
});

// 포인트 벽은 벽 색 위에 '낮은 농도로' 얹는다. 원색 그대로 칠하면 면적이 넓어
//   LED보다 포인트 벽에 시선이 먼저 간다(기존 3D 뷰와 같은 규칙).
export const ACCENT_ALPHA = 0.5;


// 바닥 격자 간격(mm) — 기존 3D 뷰와 같은 2단계.
export const GRID_MINOR_MM = 600;
export const GRID_MAJOR_MM = 1200;

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

// ── 바닥 격자 ───────────────────────────────────────────────────────────────
// 바닥 격자 — **바닥(재질)과 완전히 분리한 얇은 덧판**이다.
//   격자를 바닥 재질의 무늬로 넣으면 격자를 끌 때 바닥 색까지 같이 바뀐다(예전 동작).
//   이제 바닥은 늘 같은 재질이고, 격자만 3mm 위에 얹었다 뺐다 한다.
//   뜨거나 지글거리지 않도록 polygonOffset + depthWrite:false 로 바닥에 붙여 그린다.
//   한 타일 = 1200mm(주 격자). 그 안에 600mm(보조) 선을 하나 더 넣는다.
function makeGridTexture() {
  const S = 256;                       // 타일 한 장(= 1200mm)의 픽셀 수
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  // 배경은 칠하지 않는다 — 격자는 바닥 '위에 얹는 선'일 뿐,
  //   바닥 재질 자체가 아니다(격자를 꺼도 바닥은 그대로 있어야 한다).
  c.clearRect(0, 0, S, S);
  // 보조선(600mm) — 타일 한가운데
  c.strokeStyle = GL_PALETTE.gridMinor;
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(S / 2, 0); c.lineTo(S / 2, S);
  c.moveTo(0, S / 2); c.lineTo(S, S / 2);
  c.stroke();
  // 주선(1200mm) — 타일 경계. 이웃 타일과 이어지도록 양쪽 가장자리에 반씩 그린다.
  c.strokeStyle = GL_PALETTE.gridMajor;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(0.5, 0); c.lineTo(0.5, S);
  c.moveTo(S - 0.5, 0); c.lineTo(S - 0.5, S);
  c.moveTo(0, 0.5); c.lineTo(S, 0.5);
  c.moveTo(0, S - 0.5); c.lineTo(S, S - 0.5);
  c.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// LED 화면에 넣은 이미지 → 텍스처. 맞춤(꽉 채우기·이동)은 정면 뷰와 **같은 함수**를 쓴다.
//   넘치면 잘리고 모자라면 검정으로 남는 것까지 2D와 똑같다.
function makeLedImageTexture(image, ledW, ledH) {
  const H = 720;                                    // 텍스처 세로 픽셀
  const W = Math.max(64, Math.round(H * (ledW / Math.max(1e-6, ledH))));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.fillStyle = '#000';                             // 모자라는 자리는 검정(2D와 같다)
  c.fillRect(0, 0, W, H);
  const fit = ledImageFit({
    ledW: W, ledH: H, imgAspect: image.aspect,
    mode: image.mode, panX: image.panX, panY: image.panY,
  });
  try { c.drawImage(image.img, fit.left, fit.top, fit.iw, fit.ih); } catch { /* 아직 못 읽었으면 검정 */ }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ── 장면 만들기 ─────────────────────────────────────────────────────────────
// 방·LED·무대를 하나의 Group에 담아 돌려준다. 모델이 바뀌면 이 Group만 통째로 갈아 끼운다.
function buildRoomGroup(model, shared) {
  const { room, led, stage } = model;
  // 가구(좌석·통로·테이블 등)는 room-presets 배치를 그대로 세운다 — 여기서 새로 계산하지 않는다.
  const rmode = renderMode(model.renderMode);
  const furniture = buildFurnitureGroup(model.items, { textureScale: rmode.texture, designId: model.design });
  const ownedTex = [];   // 이 Group만 쓰는 텍스처(공용 텍스처와 달리 여기서 반납한다)
  const g = new THREE.Group();
  g.name = 'roomGroup';

  // 재질은 materials.js의 프리셋에서 가져온다 — 거칠기·금속성·무늬 간격이 한곳에 모여 있다.
  //   무늬(요철)는 실제 마감재 규격대로 반복한다: 카펫 타일 500mm · 비닐 600mm · 도장 벽 1500mm.
  const mats = createMaterialLibrary({ textureScale: rmode.texture });
  // 분위기 — 벽·천장 색을 흰색 쪽으로 조금 섞는다(아이디에이션 공간은 더 밝고 가볍게).
  //   조명 '구성'은 방마다 바꾸지 않는다. 세기와 색만 조금 다를 뿐이다.
  const mood = MOODS[model.finish?.mood] || MOODS.office;
  const lighten = hex => (mood.wallMix > 0
    ? '#' + new THREE.Color(hex).lerp(new THREE.Color(0xffffff), mood.wallMix).getHexString()
    : hex);
  const matWallFront = mats.surface('paintedWall', lighten(GL_PALETTE.wallFront), room.W, room.H, { side: THREE.FrontSide });
  const matWallSide = mats.surface('paintedWall', lighten(GL_PALETTE.wallSide), room.D, room.H, { side: THREE.FrontSide });
  // 바닥 재질 — 격자를 켜든 끄든 **항상 같다**. 격자는 별도의 덧판이다.
  const floorFinish = model.finish?.floor || 'carpetTile';
  const matFloor = mats.surface(floorFinish, GL_PALETTE.floor, room.W, room.D, { side: THREE.FrontSide });
  const matBaseboard = mats.get('paintedWall', GL_PALETTE.baseboard);

  // ① 바닥 — 방 치수(W×D)와 정확히 같다. PlaneGeometry는 XY 평면에 서 있으므로 눕힌다.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(room.W, room.D), matFloor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(room.W / 2, 0, room.D / 2);
  floor.name = 'floor';
  g.add(floor);

  // ①' 바닥 격자(선택) — 바닥과 같은 크기의 투명 덧판. 끄면 이 덧판만 사라진다.
  if (model.show?.grid !== false) {
    const tex = shared.gridTex();
    // 타일 한 장 = 1200mm. 방 크기에 맞춰 반복 횟수를 정한다.
    tex.repeat.set(room.W / u(GRID_MAJOR_MM), room.D / u(GRID_MAJOR_MM));
    const matGrid = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(room.W, room.D), matGrid);
    grid.rotation.x = -Math.PI / 2;
    grid.position.set(room.W / 2, u(GRID_LIFT_MM), room.D / 2);
    grid.name = 'floorGrid';
    g.add(grid);
  }

  // 벽 두께. 0이면 예전처럼 얇은 판 하나로 그린다(두께 없는 벽).
  //   두께가 있으면 상자로 세우되 **방 바깥쪽으로만** 붙여 안쪽 치수를 건드리지 않는다.
  const thk = room.wallThk || 0;
  const wallMesh = (w, h, d, mats) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);

  const wallOn = model.show?.walls || {};

  // ② 정면 벽(LED가 붙는 벽, z=0) — 방 안쪽(+Z)을 향한다.
  if (wallOn.front !== false) {
    let wallFront;
    if (thk > 0) {
      wallFront = wallMesh(room.W + thk * 2, room.H, thk, matWallFront);
      wallFront.position.set(room.W / 2, room.H / 2, -thk / 2);
    } else {
      wallFront = new THREE.Mesh(new THREE.PlaneGeometry(room.W, room.H), matWallFront);
      wallFront.position.set(room.W / 2, room.H / 2, 0);
    }
    wallFront.name = 'wallFront';
    g.add(wallFront);
  }

  // ②' 뒷벽(z=D) — 방 안쪽(−Z)을 향한다. 기본은 꺼 둔다(카메라가 이쪽에 선다).
  if (wallOn.back) {
    let wallBack;
    if (thk > 0) {
      wallBack = wallMesh(room.W + thk * 2, room.H, thk, matWallSide);
      wallBack.position.set(room.W / 2, room.H / 2, room.D + thk / 2);
    } else {
      wallBack = new THREE.Mesh(new THREE.PlaneGeometry(room.W, room.H), matWallSide);
      wallBack.rotation.y = Math.PI;               // 방 안쪽(−Z)을 향한다
      wallBack.position.set(room.W / 2, room.H / 2, room.D);
    }
    wallBack.name = 'wallBack';
    g.add(wallBack);
  }

  // ③④ 좌·우 벽. 포인트 벽은 **공간 좌표 기준 한쪽 벽(ACCENT_WALL_SIDE)에 고정**한다.
  //     '카메라에서 보이는 옆벽'에 칠하면 시점을 돌릴 때 벽이 좌↔우로 옮겨 다닌다 —
  //     실제로 칠해 둔 벽은 그럴 수 없다. 여기서 카메라를 참조하지 않는 것이 핵심이다.
  const accentOn = model.show?.accentWall !== false;
  // 벽 색에 포인트 색을 ACCENT_ALPHA 만큼 섞는다(반투명 겹치기 대신 색을 미리 섞어
  //   두면 어느 각도에서도 같은 색으로 보이고 그리기 순서 문제도 없다).
  const accentColor = '#' + new THREE.Color(GL_PALETTE.wallSide)
    .lerp(new THREE.Color(GL_PALETTE.wallAccent), ACCENT_ALPHA).getHexString();
  const matAccent = mats.surface('paintedWall', accentColor, room.D, room.H, { side: THREE.FrontSide });
  // 두께 있는 벽(상자)은 '방 안쪽을 향한 면'에만 포인트 색을 칠한다.
  //   윗면·바깥면까지 칠하면 흰 벽과 만나는 모서리에서 색이 끊겨 보인다(기존 3D 뷰 DEC-058과 같은 이유).
  //   BoxGeometry 면 순서: +X, −X, +Y, −Y, +Z, −Z
  const sideMat = side => {
    const isAccent = accentOn && side === ACCENT_WALL_SIDE;
    if (!isAccent) return matWallSide;
    if (!thk) return matAccent;
    const inner = side === 'left' ? 0 : 1;   // 왼쪽 벽은 +X면이, 오른쪽 벽은 −X면이 방 안쪽
    return [0, 1, 2, 3, 4, 5].map(i => (i === inner ? matAccent : matWallSide));
  };

  if (wallOn.left !== false) {
    let wallLeft;
    if (thk > 0) {
      wallLeft = wallMesh(thk, room.H, room.D, sideMat('left'));
      wallLeft.position.set(-thk / 2, room.H / 2, room.D / 2);
    } else {
      wallLeft = new THREE.Mesh(new THREE.PlaneGeometry(room.D, room.H), sideMat('left'));
      wallLeft.rotation.y = Math.PI / 2;           // 방 안쪽(+X)을 향한다
      wallLeft.position.set(0, room.H / 2, room.D / 2);
    }
    wallLeft.name = 'wallLeft';
    g.add(wallLeft);
  }
  if (wallOn.right) {
    let wallRight;
    if (thk > 0) {
      wallRight = wallMesh(thk, room.H, room.D, sideMat('right'));
      wallRight.position.set(room.W + thk / 2, room.H / 2, room.D / 2);
    } else {
      wallRight = new THREE.Mesh(new THREE.PlaneGeometry(room.D, room.H), sideMat('right'));
      wallRight.rotation.y = -Math.PI / 2;         // 방 안쪽(−X)을 향한다
      wallRight.position.set(room.W, room.H / 2, room.D / 2);
    }
    wallRight.name = 'wallRight';
    g.add(wallRight);
  }

  // ④' 걸레받이 — 벽과 바닥이 만나는 자리에 두르는 얇은 띠(70 × 18mm, 실제 시공값).
  //   이것 하나로 '벽이 바닥에 꽂혀 있다'는 느낌이 생긴다. 벽이 켜진 면에만 붙인다.
  //   모서리에서 서로 겹치면 윗면이 같은 높이라 지글거리므로, 앞뒤 띠를 옆 두께만큼 줄인다.
  const bbH = u(BASEBOARD_MM.h), bbT = u(BASEBOARD_MM.thk);
  const addBaseboard = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, bbH, d), matBaseboard);
    m.position.set(x, bbH / 2, z);
    m.name = 'baseboard';
    g.add(m);
  };
  const bbW = Math.max(0.001, room.W - bbT * 2);
  if (wallOn.front !== false) addBaseboard(bbW, bbT, room.W / 2, bbT / 2);
  if (wallOn.back) addBaseboard(bbW, bbT, room.W / 2, room.D - bbT / 2);
  if (wallOn.left !== false) addBaseboard(bbT, room.D, bbT / 2, room.D / 2);
  if (wallOn.right) addBaseboard(bbT, room.D, room.W - bbT / 2, room.D / 2);

  // ④" 천장 — 실내 시점에서만 보인다. 아이소·평면도에서 천장이 있으면 방 안이 안 보인다.
  //   보이는 것은 아랫면뿐이라 얇은 상자 하나면 충분하다(복잡한 천장은 만들지 않는다).
  //   벽 두께만큼 넓혀 벽 위 모서리를 닫는다 — 실내에서 천장과 벽 사이가 벌어지지 않게.
  const ceilThk = u(CEILING_THK_MM);
  //   천장 아랫면은 아래를 향해서 위에서 내리쬐는 조명을 전혀 받지 못한다 —
  //   그대로 두면 흰 천장이 어두운 회색 슬래브로 보인다. 조명 구성은 손대지 않고
  //   재질 자체에 옅은 자발광(emissive)을 주어 '흰 천장'으로 읽히게 한다.
  //   (STEP 3에서 실내 조명이 들어오면 이 보정은 걷어낼 수 있다.)
  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(room.W + thk * 2, ceilThk, room.D + thk * 2),
    mats.get('paintedWall', lighten(GL_PALETTE.ceiling), {
      emissive: new THREE.Color(lighten(GL_PALETTE.ceiling)), emissiveIntensity: 0.62,
    }),
  );
  ceiling.position.set(room.W / 2, room.H + ceilThk / 2, room.D / 2);
  ceiling.name = 'ceiling';
  ceiling.visible = false;          // 실제 표시 여부는 시점에 따라 정한다(applyShellVisibility)
  g.add(ceiling);
  g.userData.ceiling = ceiling;

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
  // 이미지를 넣었으면 그 그림을, 아니면 기본 화면(은은한 푸른 그라데이션)을 띄운다.
  const ledImg = led.image && led.image.img ? makeLedImageTexture(led.image, led.w, led.h) : null;
  if (ledImg) ownedTex.push(ledImg);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(led.w, led.h),
    new THREE.MeshBasicMaterial({ map: ledImg || shared.screenTex(led.w / led.h), toneMapped: false }),
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

  // ⑤' LED 옆 보조 모니터 — 정면 벽에 거는 화면. 몸통(테두리) + 화면 두 조각이다.
  //    LED와 같은 화면 텍스처를 쓰되 크기가 달라 비율에 맞춰 따로 굽는다.
  for (const mn of model.sideMonitors || []) {
    const mg = new THREE.Group();
    mg.name = 'sideMonitor';
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(mn.panelW, mn.panelH, mn.depth),
      mats.get('metalFrame', GL_PALETTE.ledBody));
    body.position.z = mn.depth / 2;
    body.name = 'sideMonitorBody';
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(mn.w, mn.h),
      // 화면 텍스처는 **LED와 같은 것을 쓴다**. shared.screenTex()는 종횡비가 달라지면
      //   이전 텍스처를 버리므로, 여기서 다른 비율을 요청하면 LED 화면이 지워진다.
      //   무늬가 가운데만 은은한 방사형이라 비율이 조금 달라도 눈에 띄지 않는다.
      new THREE.MeshBasicMaterial({ map: shared.screenTex(led.w / led.h), toneMapped: false }));
    screen.position.z = mn.depth + 0.002;
    screen.name = 'sideMonitorScreen';
    mg.add(body, screen);
    mg.position.set(mn.x, mn.y, 0);
    g.add(mg);
  }

  // ⑥ 무대 — 강당류에서 배치 계산(room-presets)이 무대를 놓았을 때만 그린다.
  //    크기·위치는 전부 그 계산 결과를 그대로 쓴다(여기서 새로 정하지 않는다).
  if (stage) {
    //   상자 하나로 그리면 '바닥에 놓인 회색 판'으로 읽힌다. 실제 무대처럼
    //   상판(앞으로 살짝 내민 코) + 전면판 + 계단으로 나눈다. 크기·위치는 배치 계산 값 그대로다.
    const matTop = mats.surface('stageSurface', GL_PALETTE.stageTop, stage.w, stage.d);
    const matSide = mats.get('stageSurface', GL_PALETTE.stageSide);
    const matFascia = mats.get('stageSurface', GL_PALETTE.stageFascia);
    const sg = new THREE.Group();
    sg.name = 'stage';
    sg.position.set(stage.x, 0, stage.z);

    const topThk = u(40), lip = u(50);            // 상판 두께 / 앞으로 내민 코
    const bodyH = Math.max(u(20), stage.h - topThk);
    const body = new THREE.Mesh(new THREE.BoxGeometry(stage.w, bodyH, stage.d), matSide);
    body.position.y = bodyH / 2;
    body.name = 'stageBody';
    sg.add(body);

    // 상판 — 관객 쪽(+Z)으로만 내민다. 그 그늘이 무대 앞 선을 만든다.
    const top = new THREE.Mesh(new THREE.BoxGeometry(stage.w, topThk, stage.d + lip), matTop);
    top.position.set(0, stage.h - topThk / 2, lip / 2);
    top.name = 'stageTop';
    sg.add(top);

    // 전면판 — 관객을 향한 면. 옆면보다 어두워 단 높이가 또렷하게 읽힌다.
    const fascia = new THREE.Mesh(
      new THREE.BoxGeometry(stage.w, Math.max(u(20), bodyH - u(20)), u(25)), matFascia);
    fascia.position.set(0, bodyH / 2, stage.d / 2 + u(12));
    fascia.name = 'stageFascia';
    sg.add(fascia);

    // 계단 — 무대 앞 가운데. 단 수는 무대 높이가 정한다(한 단 140mm 안팎).
    if (stage.step !== false && stage.h > u(160)) {
      const n = Math.min(3, Math.max(1, Math.round(stage.h / u(160))));
      const stepW = Math.min(stage.w * 0.35, u(1600));
      const stepD = u(320);
      for (let i = 0; i < n; i++) {
        const h = stage.h * (n - i) / (n + 1);
        const st = new THREE.Mesh(new THREE.BoxGeometry(stepW, h, stepD), matSide);
        st.position.set(0, h / 2, stage.d / 2 + lip + stepD * (i + 0.5));
        st.name = 'stageStep';
        sg.add(st);
      }
    }
    g.add(sg);
  }

  // 재질 라이브러리는 이 Group의 것이다 — 버릴 때 텍스처까지 함께 반납한다.
  g.userData.materials = mats;
  g.userData.ownedTextures = ownedTex;

  g.add(furniture);

  // ⑦ 사람 — 실제 키로. 있으면 세운다.
  const person = buildPerson(model.person);
  if (person) g.add(person);

  // ⑧ 치수 보조선 — 글자는 HTML 오버레이가 그리고, 선만 씬에 둔다.
  //    (3D 문자를 만들면 각도마다 읽기 어렵고 무거워진다)
  if (model.show?.dims !== false) g.add(buildDimLines(model));

  // ── 그림자 역할 ────────────────────────────────────────────────────────
  //   **가구를 모두 넣은 뒤에** 한 번에 지정한다(먼저 지정하면 나중에 들어온 가구가 빠진다).
  //   **벽과 천장은 그림자를 만들지 않는다.** 방을 둘러싼 면이라 어떤 방향의 빛에서도
  //   실내 바닥에 거대한 그늘을 드리우게 되는데, 실제 방은 조명이 천장 안쪽에 있어 그렇지 않다.
  //   대신 걸레받이가 바닥에 얇은 그림자를 남겨 '벽이 바닥에 닿은 선'을 만든다.
  //   가구·무대·LED 상자는 바닥에 접촉 그림자를 만들고, 바닥·벽은 그림자를 받는다.
  const NO_CAST = new Set(['ceiling', 'floorGrid', 'floor', 'wallFront', 'wallBack', 'wallLeft', 'wallRight']);
  const NO_RECEIVE = new Set(['ceiling', 'floorGrid']);
  g.traverse(o => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    o.castShadow = rmode.shadows && !NO_CAST.has(o.name);
    o.receiveShadow = rmode.shadows && !NO_RECEIVE.has(o.name);
  });

  return g;
}

const clampPx = (v, lo, hi) => (hi <= lo ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));

// 높이 축이 화면에서 거의 사라졌는지(= 위에서 수직으로 내려다보는 그림인지).
const _f1 = new THREE.Vector3(), _f2 = new THREE.Vector3();
function isFlatView(m, cam, h) {
  if (!m) return false;
  const { led } = m;
  _f1.set(led.x, led.y, led.depth).project(cam);
  _f2.set(led.x, led.y + 1, led.depth).project(cam);   // 1 m 위
  return Math.abs(_f2.y - _f1.y) * h * 0.5 < 8;        // 화면에서 8px 미만이면 '납작'
}

// ── 사람(축척 비교) ─────────────────────────────────────────────────────────
// 실제 키(mm)로 세워 LED 크기를 한눈에 가늠하게 한다. 화면의 주인공이 아니므로
// 그림자·윤곽 같은 장식은 붙이지 않는다. Sprite 는 항상 카메라를 향해 서므로
// 어느 시점에서도 사람이 옆으로 눕지 않는다.
function buildPerson(person) {
  if (!person || !person.img || !person.img.complete || !person.img.naturalWidth) return null;
  const tex = new THREE.Texture(person.img);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sp = new THREE.Sprite(mat);
  const h = u(person.heightMm);
  const w = h * (person.img.naturalWidth / person.img.naturalHeight);
  sp.scale.set(w, h, 1);
  sp.position.set(u(person.x), h / 2, u(person.z));   // 발이 바닥에 닿게
  sp.name = 'person';
  sp.userData.tex = tex;
  return sp;
}

// ── 치수 ────────────────────────────────────────────────────────────────────
// 어디를 재는지 — 기존 정면 뷰·3D 뷰와 같은 세 가지.
//   가로 : LED 위쪽      세로 : LED 오른쪽      하단 높이 : LED 왼쪽 아래(바닥까지)
// 화면 픽셀 기준 여백은 라벨 쪽에서 주고, 여기서는 '무엇을 잇는 선인지'만 정한다.
export function dimSpecs(model) {
  const { led } = model;
  const top = led.y + led.h;
  const out = [
    { id: 'w', a: [led.x, top, led.depth], b: [led.x + led.w, top, led.depth],
      mm: led.w * MM_PER_UNIT, key: true, off: [0, 1, 0] },          // 위로 띄운다
    { id: 'h', a: [led.x + led.w, led.y, led.depth], b: [led.x + led.w, top, led.depth],
      mm: led.h * MM_PER_UNIT, key: true, off: [1, 0, 0] },          // 오른쪽으로
  ];
  // 하단 높이는 0이면 잴 것이 없다(바닥에 붙은 설치).
  if (led.y * MM_PER_UNIT > 100) {
    out.push({ id: 'b', a: [led.x, 0, led.depth], b: [led.x, led.y, led.depth],
      mm: led.y * MM_PER_UNIT, key: false, off: [-1, 0, 0] });       // 왼쪽으로
  }
  return out;
}

function buildDimLines(model) {
  const g = new THREE.Group();
  g.name = 'dimLines';
  const mat = new THREE.LineBasicMaterial({ color: GL_PALETTE.dimLine, transparent: true, opacity: 0.85 });
  g.userData.mat = mat;
  for (const d of dimSpecs(model)) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...d.a), new THREE.Vector3(...d.b),
    ]);
    const line = new THREE.Line(geo, mat);
    line.name = `dim:${d.id}`;
    line.userData.spec = d;
    g.add(line);
  }
  return g;
}

// 치수 알약을 캔버스에 그린다(PNG 내보내기용). 화면의 .gl3dDim 과 같은 모양.
function drawPillOnCanvas(c, x, y, text, key, k) {
  c.font = `600 ${12 * k}px ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif`;
  const w = c.measureText(text).width + 18 * k, h = 24 * k;
  const left = x - w / 2, top = y - h / 2, r = h / 2;
  c.save();
  c.shadowColor = 'rgba(30,40,55,.10)'; c.shadowBlur = 8 * k; c.shadowOffsetY = 2 * k;
  c.beginPath();
  if (c.roundRect) c.roundRect(left, top, w, h, r); else c.rect(left, top, w, h);
  c.fillStyle = key ? 'rgba(17,21,27,.92)' : 'rgba(255,255,255,.94)';
  c.fill();
  c.restore();
  if (!key) {
    c.strokeStyle = 'rgba(120,130,145,.20)'; c.lineWidth = 1 * k;
    c.beginPath();
    if (c.roundRect) c.roundRect(left, top, w, h, r); else c.rect(left, top, w, h);
    c.stroke();
  }
  c.fillStyle = key ? '#ffffff' : '#151A21';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, x, y + 0.5 * k);
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
    // preserveDrawingBuffer — PNG로 내보낼 때 그린 내용을 다시 읽을 수 있어야 한다.
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: false, preserveDrawingBuffer: true,
    });
  } catch (e) {
    onError?.(e);
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // 그림자 — 부드러운 방식(PCFSoft)만 쓴다. 장면이 움직이지 않으므로 **매 프레임 다시 굽지 않는다**:
  //   모델이 바뀔 때만 한 번 갱신하면 되고, 그래서 지속 비용이 사실상 0이다.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(GL_PALETTE.bg);

  // 카메라 두 대를 미리 만들어 두고 프리셋에 따라 바꿔 단다.
  //   원근(perspective) : 실내·코너·정면·아이소 — 사람이 보는 것과 같은 원근
  //   정사(orthographic) : 평면도 — 원근이 없어야 도면으로 읽힌다
  const perspCam = new THREE.PerspectiveCamera(FOV_DEG, 1, 0.05, 500);
  const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 500);
  let camera = perspCam;

  // ── 조명 ──
  // 밝고 그림자가 옅은 실내. 면끼리 밝기 차만 남기고 어둡게 뭉치지 않게 한다.
  //   hemi : 위는 밝은 회색, 아래는 바닥색 — 전체를 부드럽게 채운다.
  //   key  : 앞 위쪽에서 오는 주광 — 벽·무대에 방향감을 준다.
  //   fill : 반대쪽에서 아주 약하게 — 그늘진 면이 새까매지지 않게.
  // ① 부드러운 환경광 — 하늘(위)과 바닥(아래)에서 오는 은은한 빛. 방의 기본 밝기.
  const hemi = new THREE.HemisphereLight(0xffffff, 0xc9cfd8, LIGHTS.hemi);
  hemi.name = 'hemiLight';
  scene.add(hemi);
  // ② 천장 조명 — 실제 사무실 천장등처럼 위에서 고르게 내려오는 빛.
  //   RectAreaLight가 정석이지만 그 계산에 필요한 데이터 파일(LTC)을 동봉할 수 없어
  //   (사내망에서 외부 CDN이 막힘 + 빌드리스 유지), 바로 아래를 비추는 방향광으로 대신한다.
  //   그림자는 만들지 않는다 — 천장등 그림자는 원래 거의 보이지 않는다.
  const ceilLight = new THREE.DirectionalLight(0xffffff, LIGHTS.ceiling);
  ceilLight.name = 'ceilingLight';
  scene.add(ceilLight);
  // ③ 주광 — **그림자를 만드는 유일한 조명**. 앞 위쪽에서 비스듬히 들어온다.
  const key = new THREE.DirectionalLight(0xffffff, LIGHTS.key);
  key.name = 'keyLight';
  key.castShadow = true;
  const shadowPx = shadowMapSize(typeof window !== 'undefined' ? window.devicePixelRatio : 1);
  key.shadow.mapSize.set(shadowPx, shadowPx);
  key.shadow.radius = 4;            // PCFSoft 흐림 — 가장자리를 뭉갠다
  key.shadow.bias = -0.0006;        // 면 자기 그림자(얼룩) 방지
  key.shadow.normalBias = 0.02;
  scene.add(key);
  // ④ 보조광 — 반대쪽에서 아주 약하게. 그림자 속이 새까매지지 않게 받쳐 준다.
  const fill = new THREE.DirectionalLight(0xffffff, LIGHTS.fill);
  fill.name = 'fillLight';
  scene.add(fill);
  // ⑤ LED 스필광 — 화면 앞에 놓인 아주 약한 푸른 점광. 벽에 옅게 번진다.
  //   네온처럼 빛나면 안 되므로 세기를 낮추고 거리를 짧게 잡는다.
  const ledSpill = new THREE.PointLight(new THREE.Color(GL_PALETTE.ledGlow), LIGHTS.ledSpill, 0, 2);
  ledSpill.name = 'ledSpill';
  scene.add(ledSpill);

  // ── 시점 조작(OrbitControls) ──
  // 프리셋으로 자리를 잡고, 사용자는 거기서 자유롭게 돌려 볼 수 있다.
  //   '맞춤'이나 프리셋을 다시 고르면 프리셋 자리로 돌아온다.
  let controls = null;
  let userMoved = false;   // 사용자가 직접 돌렸는지 — 리사이즈 때 시점을 지켜 주기 위해

  function makeControls(cam) {
    const c = new OrbitControls(cam, canvas);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.screenSpacePanning = false;
    c.minDistance = 0.8;
    c.maxDistance = 400;
    c.maxPolarAngle = Math.PI / 2 - 0.02;   // 바닥 아래로 내려가지 않게
    c.minPolarAngle = 0;                    // 평면도(바로 위)까지 허용
    // 벽은 방 안쪽을 향한 한쪽 면만 그린다. 옆으로 크게 돌아 방 밖으로 나가면 벽이
    //   사라져 그림이 깨지므로, 실내 시점에서는 LED를 바라보는 범위 안에서만 돌게 막는다.
    //   (아이소·평면도는 원래 방 밖에서 보는 시점이라 이 제한을 풀어 준다)
    // 조작 규칙 — 왼쪽 끌기=회전, 휠=확대, 오른쪽 끌기=이동.
    //   Shift+왼쪽 끌기도 이동이 되도록 아래에서 버튼 배정을 바꿔 준다.
    // 왼쪽=회전 · 휠 굴리기=확대 · **휠 버튼 누르고 끌기=전체 이동** · 오른쪽 끌기=이동
    c.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN,
    };
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    c.addEventListener('change', () => { needsRender = true; });
    c.addEventListener('start', () => { userMoved = true; });
    return c;
  }

  // Shift 를 누르고 있는 동안에는 왼쪽 끌기를 '이동'으로 바꾼다.
  //   (OrbitControls 자체에는 이 기능이 없어 버튼 배정을 갈아 끼운다)
  const setLeftButton = mode => { if (controls) controls.mouseButtons.LEFT = mode; };
  const onKeyDown = e => { if (e.key === 'Shift') setLeftButton(THREE.MOUSE.PAN); };
  const onKeyUp = e => { if (e.key === 'Shift') setLeftButton(THREE.MOUSE.ROTATE); };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  // 캔버스 위에서는 오른쪽 버튼 메뉴가 뜨지 않게(오른쪽 끌기 = 이동이므로)
  const onCtx = e => e.preventDefault();
  canvas.addEventListener('contextmenu', onCtx);

  // 프리셋 성격에 맞춰 회전 범위를 조정한다.
  function applyControlLimits(presetId) {
    if (!controls) return;
    const outside = (presetId === 'iso' || presetId === 'top');
    controls.minAzimuthAngle = outside ? -Infinity : -Math.PI / 3;
    controls.maxAzimuthAngle = outside ? Infinity : Math.PI / 3;
  }

  // 카메라를 바꿔 달 때는 조작기도 새로 만든다(OrbitControls는 카메라 한 대에 묶여 있다).
  function useCamera(next) {
    if (camera === next && controls) return;
    const keepTarget = controls ? controls.target.clone() : new THREE.Vector3();
    controls?.dispose();
    camera = next;
    controls = makeControls(camera);
    if (controls) controls.target.copy(keepTarget);
  }
  useCamera(perspCam);

  // 텍스처는 모델이 바뀌어도 다시 만들 필요가 없다(가로세로비가 달라질 때만 새로).
  let screenTexCache = null, screenTexAspect = null;
  let gridTexCache = null;
  const shared = {
    glowTex: makeGlowTexture(),
    gridTex() { if (!gridTexCache) gridTexCache = makeGridTexture(); return gridTexCache; },
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
  // 시점 옵션 — 화각(도)과 평면도 원근 여부. 화면(app.js)이 정하고 프리셋 계산에 넘긴다.
  let viewOpts = { fov: FOV_DEG, topPerspective: false };

  const size = () => ({
    w: Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || 800),
    h: Math.max(1, canvas.clientHeight || 460),
  });

  // ── 미니맵 ────────────────────────────────────────────────────────────────
  // 지금 어디서 보고 있는지만 알면 된다 — 방·LED·좌석 영역·카메라 방향까지.
  // 자세한 도면은 '평면도' 프리셋이 담당하므로 여기서는 더 그리지 않는다.
  const mini = (() => {
    const host = canvas.parentElement;
    if (!host) return { update() {}, dispose() {} };
    const el = document.createElement('canvas');
    el.className = 'pv3dMini';
    el.width = 128; el.height = 128;
    host.appendChild(el);
    const _p = new THREE.Vector3(), _t = new THREE.Vector3();
    return {
      update(m, cam, ctrls) {
        if (!m) { el.style.display = 'none'; return; }
        el.style.display = '';
        const { room, led, items } = m;
        const c = el.getContext('2d');
        const W = el.width, H = el.height, PAD = 10;
        const k = Math.min((W - PAD * 2) / room.W, (H - PAD * 2) / room.D);
        const ox = (W - room.W * k) / 2, oy = (H - room.D * k) / 2;
        const X = x => ox + x * k, Z = z => oy + z * k;   // 방 좌표 → 미니맵 px (위 = LED 벽)
        c.clearRect(0, 0, W, H);
        // 방
        c.fillStyle = 'rgba(255,255,255,.92)';
        c.strokeStyle = 'rgba(120,130,145,.45)'; c.lineWidth = 1;
        c.beginPath(); c.rect(X(0), Z(0), room.W * k, room.D * k); c.fill(); c.stroke();
        // 좌석 영역(가구가 놓인 범위)
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const it of items || []) {
          if (it.type !== 'seat' && it.type !== 'chair' && it.type !== 'desk' && it.type !== 'console') continue;
          const x = u(it.x), z = u(it.z);
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (z < z0) z0 = z; if (z > z1) z1 = z;
        }
        if (x1 > x0) {
          c.fillStyle = 'rgba(143,174,156,.28)';
          c.fillRect(X(x0 - 0.3), Z(z0 - 0.3), (x1 - x0 + 0.6) * k, (z1 - z0 + 0.6) * k);
        }
        // LED — 벽(위쪽)에 두꺼운 선
        c.strokeStyle = '#16233a'; c.lineWidth = 3; c.lineCap = 'round';
        c.beginPath(); c.moveTo(X(led.x), Z(0) + 1.5); c.lineTo(X(led.x + led.w), Z(0) + 1.5); c.stroke();
        // 카메라 — 위치 점 + 보는 방향
        cam.getWorldPosition(_p);
        _t.copy(ctrls ? ctrls.target : new THREE.Vector3(room.W / 2, 0, 0));
        const cxp = X(THREE.MathUtils.clamp(_p.x, -room.W * 0.6, room.W * 1.6));
        const czp = Z(THREE.MathUtils.clamp(_p.z, -room.D * 0.6, room.D * 1.6));
        const a = Math.atan2(X(_t.x) - cxp, Z(_t.z) - czp);
        // 시야 부채꼴
        c.save(); c.translate(cxp, czp); c.rotate(-a);
        c.fillStyle = 'rgba(18,80,224,.16)';
        c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 26, -Math.PI / 2 - 0.42, -Math.PI / 2 + 0.42); c.closePath(); c.fill();
        c.restore();
        c.fillStyle = '#1250E0';
        c.beginPath(); c.arc(cxp, czp, 3.2, 0, Math.PI * 2); c.fill();
      },
      dispose() { el.remove(); },
    };
  })();

  // ── 치수 라벨(HTML 오버레이) ────────────────────────────────────────────────
  // 3D 문자는 각도마다 읽기 어렵고 무겁다. 캔버스 위에 HTML 알약을 띄우고
  // 매 프레임 3D 좌표를 화면 좌표로 바꿔 따라다니게 한다 — 글자는 항상 정면이고
  // 정면 뷰의 알약(.rs3Dlbl)과 같은 디자인 언어를 그대로 쓸 수 있다.
  const labels = (() => {
    const host = canvas.parentElement;
    let layer = null, pool = [];
    if (host) {
      layer = document.createElement('div');
      layer.className = 'gl3dLabels';
      host.appendChild(layer);
    }
    const _v = new THREE.Vector3();
    return {
      /** 치수 목록에 맞춰 알약을 만들고, 화면 좌표로 옮긴다. */
      update(m, cam, w, h) {
        if (!layer) return;
        let specs = (m && m.show?.dims !== false) ? dimSpecs(m) : [];
        // 위에서 내려다보면(평면도) 높이 축이 화면에서 사라진다 — 세로·하단 높이는
        //   잴 수 없고 라벨만 겹치므로 가로 치수만 남긴다(기존 Canvas 뷰와 같은 규칙).
        if (specs.length && isFlatView(m, cam, h)) specs = specs.filter(d => d.id === 'w');
        // 개수가 달라졌을 때만 DOM을 다시 만든다.
        while (pool.length < specs.length) {
          const el = document.createElement('span');
          el.className = 'gl3dDim';
          layer.appendChild(el);
          pool.push(el);
        }
        for (let i = specs.length; i < pool.length; i++) pool[i].style.display = 'none';

        for (let i = 0; i < specs.length; i++) {
          const d = specs[i], el = pool[i];
          // 선의 가운데를 화면 좌표로
          const mid = [(d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2, (d.a[2] + d.b[2]) / 2];
          _v.set(mid[0], mid[1], mid[2]).project(cam);
          if (_v.z > 1) { el.style.display = 'none'; continue; }   // 카메라 뒤
          // 오브젝트에서 띄우는 방향도 3D로 계산한다 — 시점이 바뀌어도 늘 바깥쪽으로 밀린다.
          const off = new THREE.Vector3(mid[0] + d.off[0] * 0.5, mid[1] + d.off[1] * 0.5, mid[2] + d.off[2] * 0.5)
            .project(cam);
          let dx = off.x - _v.x, dy = -(off.y - _v.y);
          const len = Math.hypot(dx, dy) || 1;
          dx /= len; dy /= len;
          const GAP = 22;   // 화면 픽셀 — 라벨이 오브젝트에서 멀어지지 않게
          // 띄울 방향이 화면에서 사라지면(평면도의 높이 축 등) 위쪽으로 밀어 둔다.
          if (!Number.isFinite(dx) || !Number.isFinite(dy) || len < 1e-4) { dx = 0; dy = -1; }
          // 라벨이 캔버스 밖으로 나가지 않게 가장자리에서 붙잡는다.
          const padX = 46, padY = 20;
          const x = clampPx((_v.x * 0.5 + 0.5) * w + dx * GAP, padX, w - padX);
          const y = clampPx((-_v.y * 0.5 + 0.5) * h + dy * GAP, padY, h - padY);
          el.style.display = '';
          el.classList.toggle('key', !!d.key);
          el.textContent = `${Math.round(d.mm).toLocaleString('ko-KR')}mm`;
          el.style.transform = `translate(-50%,-50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        }
      },
      dispose() { layer?.remove(); layer = null; pool = []; },
    };
  })();

  function resize() {
    const { w, h } = size();
    renderer.setSize(w, h, false);      // false = 캔버스의 CSS 크기는 건드리지 않는다(CSS가 정한다)
    const aspect = w / h;
    perspCam.aspect = aspect; perspCam.updateProjectionMatrix();
    orthoCam.aspect = aspect;
    // 화면비가 바뀌면 프리셋이 잡는 거리·화면 범위도 달라진다.
    //   단, 사용자가 직접 시점을 만진 뒤에는 그 시점을 존중해 다시 앉히지 않는다.
    if (model && !userMoved && !tween) applyPreset(presetId, { animate: false });
    needsRender = true;
  }

  // ── 프리셋 적용 ───────────────────────────────────────────────────────────
  // 방·LED 크기는 gl-model.js의 presetPose()가 읽어 카메라 자리를 계산한다.
  // 여기서는 그 결과를 실제 카메라에 옮기고, 부드럽게 이동시키는 일만 한다.

  let presetId = DEFAULT_PRESET;
  let tween = null;   // { t0, dur, from, to } — 진행 중인 전환

  // 정사투영 카메라의 화면 범위를 '세로로 몇 m를 담을지'로 정한다.
  function setOrthoFrustum(h) {
    const half = h / 2, halfW = half * camera.aspect;
    camera.left = -halfW; camera.right = halfW;
    camera.top = half; camera.bottom = -half;
    camera.updateProjectionMatrix();
  }

  // 카메라 현재 상태를 스냅샷으로. 전환의 출발점이 된다.
  function snapshot() {
    return {
      pos: camera.position.clone(),
      target: controls.target.clone(),
      fov: camera.isPerspectiveCamera ? camera.fov : null,
      orthoHeight: camera.isOrthographicCamera ? (camera.top - camera.bottom) : null,
    };
  }

  // 스냅샷을 카메라에 그대로 적용.
  function applySnapshot(s) {
    camera.position.copy(s.pos);
    controls.target.copy(s.target);
    if (camera.isPerspectiveCamera && s.fov != null) { camera.fov = s.fov; camera.updateProjectionMatrix(); }
    if (camera.isOrthographicCamera && s.orthoHeight != null) setOrthoFrustum(s.orthoHeight);
    controls.update();
    needsRender = true;
  }

  // 방 크기에 맞춰 조명·시야 거리를 다시 잡는다(카메라 자리와는 별개).
  function fitSceneBasics(room) {
    const span = Math.max(room.W, room.D, room.H);
    perspCam.far = Math.max(200, span * 12);
    perspCam.updateProjectionMatrix();
    orthoCam.far = Math.max(200, span * 12);
    orthoCam.updateProjectionMatrix();
    // 조명은 방을 기준으로 놓는다 — 방이 커져도 같은 방향에서 빛이 온다.
    key.position.set(room.W * 0.25, room.H * 2.2, room.D * 1.1);
    key.target.position.set(room.W / 2, room.H * 0.3, room.D * 0.3);
    scene.add(key.target);
    fill.position.set(room.W * 1.3, room.H * 1.2, room.D * 0.2);
    fill.target.position.set(room.W / 2, room.H * 0.4, 0);
    scene.add(fill.target);
    // 천장등 — 방 한가운데 천장에서 바로 아래를 비춘다.
    ceilLight.position.set(room.W / 2, room.H * 1.6, room.D / 2);
    ceilLight.target.position.set(room.W / 2, 0, room.D / 2);
    scene.add(ceilLight.target);

    // 그림자 계산 범위를 **방 크기에 딱 맞춘다**. 기본값은 범위가 너무 넓어
    //   같은 해상도를 넓은 면적에 나눠 쓰게 되고, 그림자가 계단처럼 뭉개진다.
    const half = Math.max(room.W, room.D) * 0.75 + room.H;
    const sc = key.shadow.camera;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
    sc.near = 0.5; sc.far = half * 4 + room.H * 3;
    sc.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true;   // 방이 바뀌었으니 한 번 다시 굽는다
  }

  /**
   * 프리셋으로 카메라를 옮긴다.
   * @param id       프리셋 id
   * @param animate  true면 부드럽게 이동(TRANSITION_MS), false면 즉시
   */
  function applyPreset(id, { animate = true } = {}) {
    if (!model) { presetId = cameraPreset(id).id; return; }
    const p = cameraPreset(id);
    presetId = p.id;
    const aspect = Math.max(0.3, camera.aspect || 16 / 9);
    const pose = presetPose(p.id, model, aspect, viewOpts);
    const wantCam = pose.ortho ? orthoCam : perspCam;

    // 카메라 종류가 바뀌는 전환(원근 ↔ 정사)은 중간 모습을 만들 수 없다.
    //   원근 → 정사 : 원근 카메라로 목적지까지 이동한 뒤 마지막에 바꿔 단다.
    //   정사 → 원근 : 먼저 원근 카메라를 지금 자리에 놓고 바꿔 단 뒤 이동한다.
    const typeChange = wantCam !== camera;
    if (typeChange && !pose.ortho) {
      const now = snapshot();
      perspCam.position.copy(now.pos);
      perspCam.aspect = aspect; perspCam.updateProjectionMatrix();
      useCamera(perspCam);
      controls.target.copy(now.target);
    }

    const to = {
      pos: new THREE.Vector3(...pose.position),
      target: new THREE.Vector3(...pose.target),
      fov: pose.fov,
      orthoHeight: pose.orthoHeight,
      up: pose.up,
      swapToOrtho: typeChange && pose.ortho,
    };
    applyControlLimits(p.id);
    userMoved = false;

    if (!animate) { finishPreset(to); return; }
    tween = { t0: (typeof performance !== 'undefined' ? performance.now() : Date.now()), dur: TRANSITION_MS, from: snapshot(), to };
    controls.enabled = false;   // 이동 중에는 조작을 막아 서로 밀지 않게 한다
    needsRender = true;
  }

  // 전환이 끝났을 때(또는 즉시 적용일 때) 최종 상태를 확정한다.
  function finishPreset(to) {
    if (to.swapToOrtho) {
      orthoCam.position.copy(to.pos);
      orthoCam.aspect = camera.aspect;
      useCamera(orthoCam);
    }
    camera.up.set(...to.up);
    camera.position.copy(to.pos);
    controls.target.copy(to.target);
    if (camera.isPerspectiveCamera && to.fov != null) { camera.fov = to.fov; camera.updateProjectionMatrix(); }
    if (camera.isOrthographicCamera && to.orthoHeight != null) setOrthoFrustum(to.orthoHeight);
    camera.lookAt(controls.target);
    controls.enabled = true;
    controls.update();
    tween = null;
    needsRender = true;
  }

  // 부드럽게 시작해 부드럽게 멈추는 곡선. 기계적으로 쭉 미끄러지지 않게.
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function stepTween(now) {
    if (!tween) return false;
    const k = Math.min(1, (now - tween.t0) / tween.dur);
    const e = easeInOut(k);
    const { from, to } = tween;
    camera.position.lerpVectors(from.pos, to.pos, e);
    controls.target.lerpVectors(from.target, to.target, e);
    if (camera.isPerspectiveCamera && from.fov != null && to.fov != null) {
      camera.fov = from.fov + (to.fov - from.fov) * e;
      camera.updateProjectionMatrix();
    }
    if (camera.isOrthographicCamera && from.orthoHeight != null && to.orthoHeight != null) {
      setOrthoFrustum(from.orthoHeight + (to.orthoHeight - from.orthoHeight) * e);
    }
    camera.lookAt(controls.target);
    if (k >= 1) finishPreset(to);
    return true;
  }

  // 씬에서 Group 하나를 떼어내고 그 안의 GPU 자원을 모두 반납한다(메모리 누수 방지).
  function disposeGroup(gr) {
    if (!gr) return;
    disposeFurniture(gr.getObjectByName('furniture'));
    gr.getObjectByName('person')?.userData.tex?.dispose();
    gr.traverse(o => {
      o.geometry?.dispose?.();
      const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      // 공용 텍스처(화면·헤일로·격자)는 여기서 없애지 않는다 — dispose()에서 한 번에 정리한다.
      for (const mt of ms) mt.dispose?.();
    });
    // 재질 라이브러리가 만든 무늬(normal map)는 이 Group 전용이므로 여기서 반납한다.
    gr.userData.materials?.dispose();
    for (const t of gr.userData.ownedTextures || []) t.dispose?.();
    scene.remove(gr);
  }

  /**
   * 시점에 따라 달라지는 방 껍데기 요소를 켜고 끈다(지금은 천장 하나).
   *   실내 4종 → 보임 / 아이소 · 평면도 → 숨김. 저장해 둔 커스텀 시점은 카메라 위치로 판단한다.
   *   판단 규칙은 gl-model.js(showCeiling)에 있다 — 브라우저 없이 검사할 수 있게.
   */
  function applyShellVisibility() {
    const ceiling = group?.userData?.ceiling;
    if (!ceiling || !model) return;
    ceiling.visible = showCeiling({
      presetId,
      ortho: !!camera.isOrthographicCamera,
      position: camera.position.toArray(),
      room: model.room,
      enabled: model.show?.ceiling !== false,
    });
  }

  function loop() {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    // 정면 뷰를 보고 있을 때(3D 캔버스가 화면에서 숨겨졌을 때)는 아무것도 하지 않는다.
    //   숨은 캔버스를 매 프레임 갱신할 이유가 없다 — 배터리와 GPU를 아낀다.
    if (canvas.offsetParent === null) return;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const moving = stepTween(now);
    // controls.update()는 카메라가 실제로 움직였을 때만 true를 돌려준다(관성 포함).
    const moved = controls.enabled ? controls.update() : false;
    if (moving || moved || needsRender) {
      needsRender = false;
      applyShellVisibility();
      renderer.render(scene, camera);
      const { w, h } = size();
      labels.update(model, camera, w, h);
      mini.update(model, camera, controls);
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
      const first = !model;
      const sameRoom = model
        && Math.abs(model.room.W - next.room.W) < 1e-6
        && Math.abs(model.room.H - next.room.H) < 1e-6
        && Math.abs(model.room.D - next.room.D) < 1e-6
        && Math.abs(model.led.w - next.led.w) < 1e-6
        && Math.abs(model.led.h - next.led.h) < 1e-6
        && Math.abs(model.led.y - next.led.y) < 1e-6;
      disposeGroup(group);
      model = next;
      group = buildRoomGroup(model, shared);
      scene.add(group);
      fitSceneBasics(model.room);
      // LED 스필광은 화면 한가운데 앞 0.6m에 둔다 — 벽에 옅게 번지기만 하면 된다.
      ledSpill.position.set(
        model.led.x + model.led.w / 2,
        model.led.y + model.led.h / 2,
        model.led.depth + 0.6,
      );
      ledSpill.distance = Math.max(3, Math.min(9, model.led.w * 1.6));
      // 조명 세기 = 기준값 × 표현 방식(심플/실사) 배수 × 분위기 배수. 조명 개수는 그대로다.
      const md = MOODS[model.finish?.mood] || MOODS.office;
      const lv = lightLevels(LIGHTS, model.renderMode, md.light);
      hemi.intensity = lv.hemi;
      ceilLight.intensity = lv.ceiling;
      key.intensity = lv.key;
      fill.intensity = lv.fill;
      ledSpill.intensity = lv.ledSpill;
      // 심플에서는 그림자 자체를 끈다 — 계산도 하지 않아 느린 기기에서 가볍다.
      renderer.shadowMap.enabled = renderMode(model.renderMode).shadows;
      // 장면이 새로 지어졌으니 그림자를 한 번만 다시 굽는다(매 프레임이 아니다).
      renderer.shadowMap.needsUpdate = true;
      // 방이나 LED가 달라졌으면 카메라를 다시 앉힌다(같으면 보던 시점을 지킨다).
      if (first || !sameRoom) applyPreset(presetId, { animate: !first });
      needsRender = true;
      const { w, h } = size();
      labels.update(model, camera, w, h);
      mini.update(model, camera, controls);
    },
    /** 시점 프리셋 선택. */
    setPreset(id, opts) { applyPreset(id, opts); },
    /** 프리셋 목록을 좌(-1)·우(+1)로 한 칸 돈다. */
    stepPreset(step) { applyPreset(stepPreset(presetId, step)); },
    /** 지금 프리셋 id. */
    getPreset() { return presetId; },
    /**
     * 시점 옵션 — 화각(도)과 평면도 원근 여부.
     * 값이 실제로 바뀌었을 때만 카메라를 다시 앉힌다(같은 값으로 부르면 화면이 안 흔들린다).
     */
    setViewOptions(next = {}, { animate = true } = {}) {
      const fov = clampFov(next.fov ?? viewOpts.fov);
      const topPerspective = next.topPerspective ?? viewOpts.topPerspective;
      if (fov === viewOpts.fov && topPerspective === viewOpts.topPerspective) return false;
      viewOpts = { fov, topPerspective };
      if (model) applyPreset(presetId, { animate });
      return true;
    },
    getViewOptions() { return { ...viewOpts, range: FOV_RANGE }; },
    /** 맞춤(Fit) — 지금 프리셋은 그대로 두고, 그 프리셋의 framing 으로 되돌린다. */
    fitView() { applyPreset(presetId); },
    /** 초기화(Reset) — 기본 시점(실내)으로 돌아간다. */
    resetView() { applyPreset(DEFAULT_PRESET); },
    resize,
    /**
     * 지금 카메라 자세를 그대로 담아 돌려준다 — '이 화면 저장'에 쓴다.
     * 저장한 값은 나중에 applyPose()에 그대로 넣으면 같은 그림이 나온다.
     */
    getPose() {
      return {
        ortho: !!camera.isOrthographicCamera,
        position: camera.position.toArray(),
        target: controls.target.toArray(),
        up: camera.up.toArray(),
        fov: camera.isPerspectiveCamera ? camera.fov : null,
        orthoHeight: camera.isOrthographicCamera ? (camera.top - camera.bottom) : null,
      };
    },
    /** 저장해 둔 카메라 자세로 이동한다(프리셋과 같은 방식으로 부드럽게). */
    applyPose(pose, { animate = true } = {}) {
      if (!pose || !model) return;
      presetId = pose.id || 'custom';
      const wantOrtho = !!pose.ortho;
      const typeChange = (wantOrtho ? orthoCam : perspCam) !== camera;
      if (typeChange && !wantOrtho) {
        const now = snapshot();
        perspCam.position.copy(now.pos);
        perspCam.aspect = Math.max(0.3, camera.aspect || 16 / 9);
        perspCam.updateProjectionMatrix();
        useCamera(perspCam);
        controls.target.copy(now.target);
      }
      const to = {
        pos: new THREE.Vector3(...pose.position),
        target: new THREE.Vector3(...pose.target),
        fov: pose.fov ?? null,
        orthoHeight: pose.orthoHeight ?? null,
        up: pose.up || [0, 1, 0],
        swapToOrtho: typeChange && wantOrtho,
      };
      // 저장한 시점은 방 밖·위에서 본 것일 수 있으므로 회전 제한을 풀어 둔다.
      applyControlLimits('iso');
      userMoved = false;
      if (!animate) { finishPreset(to); return; }
      tween = {
        t0: (typeof performance !== 'undefined' ? performance.now() : Date.now()),
        dur: TRANSITION_MS, from: snapshot(), to,
      };
      controls.enabled = false;
      needsRender = true;
    },
    /** 지금 카메라 상태(디버깅·검증용). */
    getView() {
      return {
        preset: presetId,
        ortho: !!camera.isOrthographicCamera,
        position: camera.position.toArray().map(n => +n.toFixed(4)),
        target: controls.target.toArray().map(n => +n.toFixed(4)),
        up: camera.up.toArray(),
        fov: camera.isPerspectiveCamera ? camera.fov : null,
        orthoHeight: camera.isOrthographicCamera ? +(camera.top - camera.bottom).toFixed(4) : null,
        animating: !!tween,
      };
    },
    /**
     * 지금 화면을 PNG 데이터URL로. scale=2~3이면 인쇄·제안서용 고해상도.
     * 3D 장면 + 치수 라벨만 담는다 — 설정 패널·시점 버튼·미니맵은 들어가지 않는다.
     */
    toPNG(scale = 3) {
      if (!model) return null;
      const { w, h } = size();
      const k = Math.max(1, Math.min(4, scale));
      const prevPR = renderer.getPixelRatio();
      applyShellVisibility();   // 화면과 같은 천장 상태로 저장한다
      // 캔버스의 CSS 크기는 그대로 두고(false) 그리기 해상도만 올린다.
      renderer.setPixelRatio(1);
      renderer.setSize(Math.round(w * k), Math.round(h * k), false);
      renderer.render(scene, camera);

      const out = document.createElement('canvas');
      out.width = Math.round(w * k); out.height = Math.round(h * k);
      const c = out.getContext('2d');
      c.drawImage(renderer.domElement, 0, 0, out.width, out.height);

      // 치수 라벨 — 화면과 같은 자리에 같은 모양으로 얹는다.
      if (model.show?.dims !== false) {
        let specs = dimSpecs(model);
        if (isFlatView(model, camera, h)) specs = specs.filter(d => d.id === 'w');
        const _a = new THREE.Vector3(), _b = new THREE.Vector3();
        for (const d of specs) {
          const mid = [(d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2, (d.a[2] + d.b[2]) / 2];
          _a.set(mid[0], mid[1], mid[2]).project(camera);
          if (_a.z > 1) continue;
          _b.set(mid[0] + d.off[0] * 0.5, mid[1] + d.off[1] * 0.5, mid[2] + d.off[2] * 0.5).project(camera);
          let dx = _b.x - _a.x, dy = -(_b.y - _a.y);
          const len = Math.hypot(dx, dy);
          if (!Number.isFinite(len) || len < 1e-4) { dx = 0; dy = -1; } else { dx /= len; dy /= len; }
          const GAP = 22, padX = 46, padY = 20;
          const x = clampPx((_a.x * 0.5 + 0.5) * w + dx * GAP, padX, w - padX) * k;
          const y = clampPx((-_a.y * 0.5 + 0.5) * h + dy * GAP, padY, h - padY) * k;
          drawPillOnCanvas(c, x, y, `${Math.round(d.mm).toLocaleString('ko-KR')}mm`, !!d.key, k);
        }
      }

      // 화면 해상도로 되돌린다.
      renderer.setPixelRatio(prevPR);
      renderer.setSize(w, h, false);
      needsRender = true;
      return out.toDataURL('image/png');
    },
    /** 사용 가능한 프리셋 목록(화면이 버튼을 만들 때 쓴다). */
    presets: CAMERA_PRESETS,
    /** 테스트·디버깅용 — 씬 내부를 들여다볼 수 있게. */
    _internals: { scene, renderer, get camera() { return camera; }, get controls() { return controls; }, get group() { return group; } },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('contextmenu', onCtx);
      controls?.dispose();
      disposeGroup(group);
      shared.glowTex.dispose();
      gridTexCache?.dispose();
      screenTexCache?.dispose();
      labels.dispose();
      mini.dispose();
      renderer.dispose();
    },
  };
}
