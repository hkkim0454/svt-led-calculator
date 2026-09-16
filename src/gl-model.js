// gl-model.js — 계산 결과(mm) → Three.js 씬이 쓸 값(unit). 순수 함수. DOM·Three.js 없음.
// ─────────────────────────────────────────────────────────────────────────────
// 여기서는 **아무것도 새로 계산하지 않는다.** engine.js(LED 배열·크기)와
// room-presets.js(가구 배치)가 이미 낸 값을 단위만 바꿔 담는다.
// 이 파일을 따로 둔 이유는 하나 — Three.js 없이 `npm test`(Node)로 검증할 수 있게 하기 위해서다.
// 실제 그리기는 render3d-gl.js.
// ─────────────────────────────────────────────────────────────────────────────

// ── 단위 ────────────────────────────────────────────────────────────────────
// 계산기의 모든 길이는 mm다. Three.js는 1 단위가 1 m일 때 조명·카메라 기본값이 가장 잘 맞는다.
// 그래서 씬에 넣기 직전에 딱 한 번 여기서 바꾼다. 씬 안에서는 mm를 쓰지 않는다.
export const MM_PER_UNIT = 1000;                          // 1000 mm = 1 unit (= 1 m)
export const u = mm => (Number(mm) || 0) / MM_PER_UNIT;   // mm → unit
export const toMm = units => (Number(units) || 0) * MM_PER_UNIT;   // unit → mm (되돌리기용)

// ── 카메라 상수 ─────────────────────────────────────────────────────────────
// 기존 3D 뷰의 카메라 언어(DEC-059·DEC-060)를 잇는다 — '미니어처를 내려다보는' 느낌이 아니라
// '실제 공간 안에서 조금 높은 사람 시점'.
export const EYE_MM = 2350;        // 카메라 눈높이(바닥에서 mm)
export const LOOK_MM = 1250;       // 바라보는 높이 — 눈높이보다 낮아 바닥이 화면에 들어온다
export const START_YAW_DEG = 21;   // 처음 서는 각도(우측 코너). OrbitControls로 자유롭게 돌릴 수 있다.

// 화각. 기존 Canvas 뷰(33°)는 카메라가 방 '밖'에 서는 그림이라 좁아도 됐다.
//   실내 시점은 카메라가 방 안에 갇히므로(뒷벽보다 뒤로 못 감) 좁은 화각이면 LED만 꽉 찬다.
//   40°면 10 m 방에서 가로 약 8 m가 들어와 벽·바닥·무대가 함께 읽힌다.
export const FOV_DEG = 40;

// LED를 담을 때 두는 여유 — 세로 2.6배, 가로 2.2배 크기로 담는다.
//   LED가 주인공이되 방이 함께 읽히는 비율.
export const LED_FIT = Object.freeze({ w: 2.2, h: 2.6 });

/**
 * LED가 화면에 알맞게 들어오는 카메라 거리(unit).
 *   Reference A는 '방 안에서 LED를 바라보는' 실내 시점이다. 그래서 방 크기가 아니라
 *   **LED 크기**로 거리를 정하고, 방보다 뒤로 물러나지 않게 깊이로 제한한다.
 *   (방 크기로 거리를 잡으면 깊은 강당에서 카메라가 뒷벽 밖으로 나가 버린다.)
 *
 * @param led     LED 크기(unit) — { w, h }
 * @param roomD   방 깊이(unit)
 * @param aspect  화면 가로/세로비
 * @returns 카메라가 설 거리(unit). 항상 방 안에 남는다.
 */
export function viewDistance(led, roomD, aspect = 16 / 9) {
  const vFov = FOV_DEG * Math.PI / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(0.3, aspect));
  const need = Math.max(
    (led.h * LED_FIT.h / 2) / Math.tan(vFov / 2),
    (led.w * LED_FIT.w / 2) / Math.tan(hFov / 2),
  );
  // 카메라는 방 안에 남는다(뒷벽에서 0.4 m 앞까지). 아주 작은 방에서도 최소 2 m는 떨어진다.
  return Math.max(2, Math.min(need, Math.max(2, roomD - 0.4)));
}

/**
 * 화면(app.js)이 넘겨준 계산 결과를 Three.js가 쓸 수 있는 형태(unit)로 바꾼다.
 * 여기서 **읽기만** 한다 — 어떤 값도 새로 계산하지 않는다.
 *
 * @param space {W,H,D}                              공간 가로·세로·깊이(mm)
 * @param led   {w,h,marginW,mount,cols,rows,depth}  engine 결과의 LED 실제 크기(mm)
 * @param items room-presets의 배치 결과(STEP 1에서는 무대만 읽는다)
 * @returns { room, led, stage }  전부 unit
 */
export function buildGLModel({ space, led, items }) {
  const room = { W: u(space.W), H: u(space.H), D: u(space.D) };
  const stageItem = (items || []).find(it => it && it.type === 'stage');
  return {
    room,
    led: {
      x: u(led.marginW),          // 왼쪽 벽 ~ LED 왼쪽 끝
      y: u(led.mount),            // 바닥 ~ LED 아래(하단 높이)
      w: u(led.w), h: u(led.h),   // LED 실제 가로·세로
      depth: u(led.depth || 60),  // 벽에서 튀어나온 캐비닛 깊이
      cols: Math.max(1, Math.round(led.cols) || 1),   // STEP 1에서는 아직 그리지 않는다
      rows: Math.max(1, Math.round(led.rows) || 1),   //   (다음 단계 캐비닛 격자용)
    },
    stage: stageItem ? {
      x: u(stageItem.x), z: u(stageItem.z),
      w: u(stageItem.w), d: u(stageItem.d), h: u(stageItem.h || 280),
    } : null,
  };
}
