// geometry-gl.js — 유선형 가구 도형 공장. (Three.js 전용)
// ─────────────────────────────────────────────────────────────────────────────
// 왜 필요한가: 지금까지 가구 부품은 전부 **모서리가 날카로운 상자**였다.
//   실제 가구는 모서리가 3~70mm 둥글고, 그 둥근 면이 빛을 받아 밝은 선을 만든다.
//   그 선 하나가 '모델'과 '실물'을 가른다 — 각진 상자는 아무리 비율이 맞아도 폴리곤으로 읽힌다.
//
// 만드는 방법: 둥근 사각형 윤곽을 그린 뒤 두께만큼 밀어내고(ExtrudeGeometry)
//   가장자리에 작은 경사(bevel)를 준다. 별도 라이브러리가 필요 없다(빌드리스 유지).
//
// **크기를 행렬로 늘리지 않고 실제 치수로 굽는다.** 단위 상자를 늘려 쓰면
//   가로로 긴 부품에서 모서리 반지름까지 같이 늘어나 한쪽만 뭉툭해진다.
//   같은 자산의 같은 부품은 어차피 치수가 같으므로, 한 번 구워 InstancedMesh로 돌려 쓰면 된다.
//
// 성능: 도형은 **치수·모양이 같으면 하나를 돌려 쓴다**(캐시). 좌석이 수백 개여도 도형은 한 벌이다.
//   반복이 많은 자산(강당 객석)은 분할 수를 낮춰(detail 'low') 삼각형을 아낀다.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from './vendor/three/three.module.min.js';

// 분할 수 — 'high'는 가까이서 보는 회의실 가구, 'low'는 수백 개가 깔리는 객석.
const DETAIL = Object.freeze({
  high: { curve: 4, bevel: 2, radial: 28, sphere: [20, 14] },
  low: { curve: 2, bevel: 1, radial: 14, sphere: [12, 9] },
});

/** 둥근 사각형 윤곽. r은 네 모서리 반지름(같은 단위). */
function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  const rr = Math.max(0, Math.min(r, w / 2 - 1e-6, h / 2 - 1e-6));
  if (rr <= 1e-6) {
    s.moveTo(x, y); s.lineTo(x + w, y); s.lineTo(x + w, y + h); s.lineTo(x, y + h);
    s.closePath();
    return s;
  }
  s.moveTo(x + rr, y);
  s.lineTo(x + w - rr, y);
  s.quadraticCurveTo(x + w, y, x + w, y + rr);
  s.lineTo(x + w, y + h - rr);
  s.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  s.lineTo(x + rr, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - rr);
  s.lineTo(x, y + rr);
  s.quadraticCurveTo(x, y, x + rr, y);
  s.closePath();
  return s;
}

/**
 * 살짝 휜 판의 윤곽(위에서 본 모양). 등받이처럼 몸을 감싸는 곡면에 쓴다.
 * @param w    폭
 * @param thk  두께
 * @param sag  가운데가 뒤로 물러난 깊이(활의 배부름). 0이면 평평하다.
 */
function arcBandShape(w, thk, sag, seg) {
  const n = Math.max(6, seg * 4);
  const s = new THREE.Shape();
  const curve = t => sag * (1 - (2 * t - 1) ** 2 * 1);   // 가운데가 가장 깊은 포물선
  // 바깥면(뒤쪽) → 안쪽면(앞쪽)을 한 바퀴 돈다.
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = -w / 2 + w * t, y = curve(t) + thk / 2;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  for (let i = n; i >= 0; i--) {
    const t = i / n, x = -w / 2 + w * t, y = curve(t) - thk / 2;
    s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

// 윤곽 → 두께가 있는 입체. 가장자리에 작은 경사를 줘 빛을 받게 한다.
function extrude(shape, depth, bevel, d) {
  const b = Math.max(1e-5, Math.min(bevel, depth / 2 - 1e-5));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-5, depth - b * 2),
    bevelEnabled: true, bevelThickness: b, bevelSize: b,
    bevelSegments: d.bevel, curveSegments: d.curve,
  });
  geo.translate(0, 0, -(depth - b * 2) / 2);   // 두께 가운데를 원점으로
  return geo;
}

/**
 * 도형 캐시를 하나 만든다. 치수·모양이 같으면 같은 도형을 돌려 쓴다.
 * 방을 다시 지을 때마다 새로 만들고, 버릴 때 dispose()한다.
 */
export function createGeometryCache() {
  const cache = new Map();
  const take = (key, make) => {
    if (!cache.has(key)) {
      const geo = make();
      // 이 도형은 캐시가 주인이다 — 메시를 버릴 때 개별로 dispose하면 안 된다.
      geo.userData.cached = true;
      cache.set(key, geo);
    }
    return cache.get(key);
  };
  const q = lvl => DETAIL[lvl] || DETAIL.high;

  return {
    /** 각진 상자 — 얇은 프레임·다리처럼 둥글려도 안 보이는 곳에 쓴다(가장 싸다). */
    box(w, h, d) {
      return take(`b|${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
    },

    /**
     * 모서리가 둥근 판.
     * @param mode 'plan' 눕힌 판(좌판·상판) — 위에서 본 네 모서리가 둥글다
     *             'face' 세운 판(등받이·문) — 정면에서 본 네 모서리가 둥글다
     * @param r    모서리 반지름
     */
    slab(w, h, d, { mode = 'plan', r = 0, bevel = 0, detail = 'high' } = {}) {
      const dd = q(detail);
      const key = `s|${mode}|${w}|${h}|${d}|${r}|${bevel}|${detail}`;
      return take(key, () => {
        const bv = bevel || Math.min(r * 0.45, Math.min(w, h, d) * 0.22);
        if (mode === 'face') {
          // 정면(폭 × 높이)을 둥글리고 앞뒤(d)로 밀어낸다.
          return extrude(roundedRectShape(w, h, r), d, bv, dd);
        }
        // 눕힌 판: 평면(폭 × 앞뒤)을 둥글리고 위아래(h)로 밀어낸다.
        const geo = extrude(roundedRectShape(w, d, r), h, bv, dd);
        geo.rotateX(-Math.PI / 2);
        return geo;
      });
    },

    /**
     * 살짝 휜 세운 판 — 등받이. 몸을 감싸듯 가운데가 뒤로 물러난다.
     * @param sag 휨 깊이(가운데가 물러나는 양)
     */
    arc(w, h, thk, { sag = 40, r = 0, detail = 'high' } = {}) {
      const dd = q(detail);
      const key = `a|${w}|${h}|${thk}|${sag}|${r}|${detail}`;
      return take(key, () => {
        // r은 **위아래 모서리**(등받이의 어깨선)를 둥글리는 값이다. 밀어내는 방향이 높이이므로
        //   경사(bevel)가 곧 그 둥글림이 된다. 두께가 아니라 높이를 기준으로 잡아야 실제로 둥글어진다.
        const bv = Math.max(thk * 0.25, Math.min(r || h * 0.12, h * 0.35));
        const geo = extrude(arcBandShape(w, thk, sag, dd.curve), h, bv, dd);
        geo.rotateX(-Math.PI / 2);   // 밀어낸 방향(두께)을 위아래(높이)로 세운다
        return geo;
      });
    },

    /** 기둥·원판. 분할 수를 올려 각져 보이지 않게 한다. */
    cyl(rTop, rBottom, h, { detail = 'high' } = {}) {
      const seg = q(detail).radial;
      return take(`c|${rTop}|${rBottom}|${h}|${seg}`,
        () => new THREE.CylinderGeometry(rTop, rBottom, h, seg));
    },

    /** 구 — 머리처럼 둥근 것. */
    sph(r, { detail = 'high' } = {}) {
      const [wSeg, hSeg] = q(detail).sphere;
      return take(`p|${r}|${wSeg}|${hSeg}`, () => new THREE.SphereGeometry(r, wSeg, hSeg));
    },

    /** 만든 도형 수(성능 점검용). */
    get size() { return cache.size; },

    dispose() {
      for (const g of cache.values()) g.dispose();
      cache.clear();
    },
  };
}
