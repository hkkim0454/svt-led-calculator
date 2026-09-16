// led-image.js — LED 화면에 넣은 이미지의 '어떻게 맞출지' 계산. (순수)
// ─────────────────────────────────────────────────────────────────────────────
// 정면 뷰(2D)와 3D 뷰가 **같은 규칙**을 써야 한다. 두 곳에 따로 적으면
// 2D에서 맞춰 놓은 그림이 3D에서 다르게 잘린다 — 그래서 여기 한 곳에만 둔다.
//
// 규칙(기존 정면 뷰 동작 그대로):
//   가로 고정(width)  가로를 꽉 채우고, 남거나 넘치는 세로를 위아래로 옮긴다(panY).
//   세로 고정(height) 세로를 꽉 채우고, 남거나 넘치는 가로를 좌우로 옮긴다(panX).
//   넘치면 잘리고(크롭), 모자라면 그 자리는 검정으로 남는다.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param ledW,ledH   LED 화면 크기(같은 단위면 무엇이든 — px든 mm든 비율만 쓴다)
 * @param imgAspect   이미지 가로/세로 비. 없으면 LED 비율로 본다(꽉 참).
 * @param mode        'width' | 'height'
 * @param panX,panY   0~1. 0.5가 가운데.
 * @returns {{mode, iw, ih, left, top, range}} left·top은 LED 왼쪽 위 기준
 */
export function ledImageFit({ ledW, ledH, imgAspect, mode = 'width', panX = 0.5, panY = 0.5 } = {}) {
  const Lw = Math.max(1e-6, Number(ledW) || 0);
  const Lh = Math.max(1e-6, Number(ledH) || 0);
  const asp = (Number(imgAspect) > 0) ? Number(imgAspect) : (Lw / Lh);
  const px = clamp01(panX), py = clamp01(panY);

  if (mode === 'height') {
    const ih = Lh, iw = Lh * asp, range = iw - Lw;
    const left = (range > 0) ? (-range * px) : ((Lw - iw) * px);
    return { mode, iw, ih, left: z(left), top: 0, range: z(range) };
  }
  const iw = Lw, ih = Lw / asp, range = ih - Lh;
  const top = (range > 0) ? (-range * py) : ((Lh - ih) * py);
  return { mode: 'width', iw, ih, left: 0, top: z(top), range: z(range) };
}

// -0을 0으로 맞춘다. 그리기에는 영향이 없지만 값을 비교할 때 -0 !== 0 으로 걸린다.
function z(v) { return v === 0 ? 0 : v; }

function clamp01(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5;
}
