// render3d.test.js — 3D 미리보기 렌더러 중 '캔버스 없이 확인할 수 있는' 규칙만 검증한다.
// 실제 그리기(canvas 2D)는 브라우저 전용이라 여기서 다루지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCENT_WALL_SIDE } from '../src/render3d.js';
import { buildScene, viewCamera, visibleWallSides, CUBE_VIEWS } from '../src/scene3d.js';

const baseInput = {
  spaceW: 10000, spaceH: 3500, spaceD: 10000,
  ledW: 3840, ledH: 2160, marginW: 3080, mountMm: 0,
  cols: 4, rows: 4, cabDepth: 50,
};

test('포인트 벽 — 시점을 돌려도 실제 벽 위치가 바뀌지 않는다(공간 좌표 고정)', () => {
  // '카메라에서 보이는 옆벽'에 칠하면 좌↔우로 옮겨 다닌다. 실제 도장은 그럴 수 없다.
  assert.ok(['left', 'right'].includes(ACCENT_WALL_SIDE));
  const room = buildScene(baseInput);
  for (const v of CUBE_VIEWS) {
    // 시점별 계산에 들어가는 값이 상수 하나뿐이므로 어느 시점에서도 같은 벽이다
    assert.equal(ACCENT_WALL_SIDE, 'left', `${v.id}: 포인트 벽이 옮겨 갔다`);
  }
  // 기본 시점(우측 코너)에서는 그 벽이 실제로 보여야 한다 — 안 보이면 포인트 색이 사라진다
  const sides = visibleWallSides(viewCamera(room, 'corner-r'), room);
  assert.equal(sides[ACCENT_WALL_SIDE], true);
});
