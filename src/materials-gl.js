// materials-gl.js — 재질 명세(materials.js) → Three.js 재질. (어댑터)
// ─────────────────────────────────────────────────────────────────────────────
// 여기서 수치를 정하지 않는다. materials.js의 프리셋을 읽어 MeshStandardMaterial을 만들고,
// 필요한 요철 무늬(normal map)를 캔버스로 직접 그려 붙인다.
//
// 무늬는 **이미지 파일을 쓰지 않는다** — 저장소에 바이너리를 넣지 않기 위해서다(빌드리스 유지).
//   256픽셀짜리 높이 무늬를 만든 뒤 기울기를 계산해 normal map으로 바꾼다.
//   세기는 프리셋의 normalScale이 정하므로, 여기서는 '보통 세기'로 한 장만 구워 돌려 쓴다.
//
// 재질은 **토큰 + 색 + 반복 횟수**가 같으면 하나를 돌려 쓴다(캐시).
//   같은 재질을 여러 번 만들면 그리기 호출이 쪼개져 성능이 떨어진다.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from './vendor/three/three.module.min.js';
import { MATERIAL_PRESETS, tileRepeat } from './materials.js?v=390';
import { MM_PER_UNIT } from './gl-model.js?v=390';

const TEX_SIZE = 256;

// 결정적 난수 — 새로고침할 때마다 무늬가 달라지면 화면이 미묘하게 흔들린다.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// 높이 무늬 한 장(0~1). kind에 따라 결이 다르다.
function heightField(kind) {
  const S = TEX_SIZE, h = new Float32Array(S * S);
  const rand = rng(kind === 'carpet' ? 20260916 : kind === 'wood' ? 13572468 : 99887766);
  if (kind === 'wood') {
    // 나뭇결 — 한 방향으로 흐르는 옅은 줄. 줄 간격을 불규칙하게 흔들어 기계적으로 안 보이게.
    const jitter = Array.from({ length: S }, () => rand());
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const wob = jitter[(x + (y >> 4)) % S] * 6;
        h[y * S + x] = 0.5 + 0.5 * Math.sin((y + wob) * 0.42) * 0.35
          + (jitter[x] - 0.5) * 0.06;
      }
    }
    return h;
  }
  // 카펫·미세 요철 — 굵기가 다른 잡음 두 겹을 겹친다(한 겹이면 규칙적으로 보인다).
  const cell = kind === 'carpet' ? 4 : 2;
  const coarse = kind === 'carpet' ? 16 : 32;
  const grid = (n) => {
    const g = new Float32Array((S / n + 2) * (S / n + 2));
    for (let i = 0; i < g.length; i++) g[i] = rand();
    return g;
  };
  const gA = grid(cell), gB = grid(coarse);
  const sample = (g, n, x, y) => {
    const w = S / n + 2;
    return g[Math.floor(y / n) * w + Math.floor(x / n)];
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      h[y * S + x] = sample(gA, cell, x, y) * 0.55 + sample(gB, coarse, x, y) * 0.45;
    }
  }
  return h;
}

// 높이 무늬 → normal map 텍스처. 이웃 픽셀과의 높이차로 기울기를 낸다.
function makeNormalTexture(kind) {
  const S = TEX_SIZE;
  const h = heightField(kind);
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  const img = c.createImageData(S, S);
  const at = (x, y) => h[((y + S) % S) * S + ((x + S) % S)];
  const STRENGTH = 2.4;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * STRENGTH;
      const dy = (at(x, y - 1) - at(x, y + 1)) * STRENGTH;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      img.data[i] = Math.round((dx / len * 0.5 + 0.5) * 255);
      img.data[i + 1] = Math.round((dy / len * 0.5 + 0.5) * 255);
      img.data[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      img.data[i + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // normal map은 색이 아니라 방향 데이터라 sRGB 변환을 하면 안 된다.
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * 재질 라이브러리를 하나 만든다. 방을 다시 지을 때마다 새로 만들고, 버릴 때 dispose()한다.
 * @returns {{ get, surface, preset, dispose }}
 */
export function createMaterialLibrary({ textureScale = 1 } = {}) {
  const texCache = new Map();     // kind → 원본 normal map
  const matCache = new Map();     // 토큰|색|반복 → 재질
  const owned = [];               // 여기서 만든 재질·텍스처(반납 대상)

  const baseTex = kind => {
    if (!kind) return null;
    if (!texCache.has(kind)) texCache.set(kind, makeNormalTexture(kind));
    return texCache.get(kind);
  };

  function build(presetId, color, repeat, extra) {
    const p = MATERIAL_PRESETS[presetId];
    if (!p) return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 });
    const m = new THREE.MeshStandardMaterial({
      color, roughness: p.roughness, metalness: p.metalness, ...extra,
    });
    const src = (p.normalScale * textureScale > 0) ? baseTex(p.texture) : null;
    const nScale = p.normalScale * textureScale;   // 표현 방식(심플/실사)이 무늬 세기를 정한다
    if (src && nScale > 0) {
      // 면마다 반복 횟수가 다르므로 텍스처는 복제한다(이미지 자체는 공유되어 메모리가 늘지 않는다).
      const t = src.clone();
      t.needsUpdate = true;
      t.repeat.set(repeat ? repeat[0] : 1, repeat ? repeat[1] : 1);
      m.normalMap = t;
      m.normalScale = new THREE.Vector2(nScale, nScale);
      owned.push(t);
    }
    owned.push(m);
    return m;
  }

  return {
    /** 반복 무늬 없이(가구 부품처럼 작은 면) 재질 하나. */
    get(presetId, color, extra) {
      const key = `${presetId}|${color}|${extra ? JSON.stringify(extra) : ''}`;
      if (!matCache.has(key)) matCache.set(key, build(presetId, color, [2, 2], extra));
      return matCache.get(key);
    },
    /**
     * 바닥·벽처럼 **실제 크기가 있는 면**용. 무늬 간격을 실제 치수에 맞춰 반복한다.
     * @param wUnits,dUnits 면의 가로·세로(unit = m)
     */
    surface(presetId, color, wUnits, dUnits, extra) {
      const p = MATERIAL_PRESETS[presetId];
      const rep = tileRepeat(p, wUnits, dUnits, MM_PER_UNIT);
      const key = `${presetId}|${color}|${rep ? rep.map(n => n.toFixed(2)).join('x') : '-'}|${extra ? JSON.stringify(extra) : ''}`;
      if (!matCache.has(key)) matCache.set(key, build(presetId, color, rep, extra));
      return matCache.get(key);
    },
    /** 프리셋 수치 그대로(디버깅·검증용). */
    preset(id) { return MATERIAL_PRESETS[id] || null; },
    dispose() {
      for (const o of owned) o.dispose?.();
      for (const t of texCache.values()) t.dispose();
      owned.length = 0; texCache.clear(); matCache.clear();
    },
  };
}
