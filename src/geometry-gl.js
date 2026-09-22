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
// 곡선 콘솔 상판의 포물선은 **control-av.js 하나가 정한다** — AV 자리 계산(모니터·키보드가
//   상판 위에 얹혀 있는가)이 같은 식을 읽어야 한다. 여기서 다시 적으면 언젠가 어긋나고,
//   그때는 '화면에서는 상판 위인데 검사는 밖이라고 한다'가 된다.
import { consoleCurve } from './control-av.js?v=447';

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

/**
 * 곡선 콘솔 상판의 윤곽(위에서 본 모양) — 상황실 운용자 데스크.
 * ─────────────────────────────────────────────────────────────────────────
 * `arcBandShape`(등받이)와 **같은 포물선 언어**를 쓴다. 다른 점은 두 가지다.
 *   ① 띠의 폭이 '두께'가 아니라 **책상 깊이**다(사람이 앉아 쓰는 면).
 *   ② 휘는 양(sag)을 **주어진 span 안에서** 쓴다 — 밖으로 더 부풀지 않는다.
 *      배치가 정한 발자국(1800×900)을 180mm 넘겨 버리면 의자와의 여유가 조용히 줄어든다.
 *      그래서 띠 폭 = span − sag 로 잡아, 휜 뒤의 전체 깊이가 정확히 span 이 되게 한다.
 *
 * 방향 — **운용자를 감싸듯** 휜다. 양 끝(날개)이 운용자 쪽으로 나오고 가운데가 물러난다.
 *   `extrude` 뒤 `rotateX(-90°)`를 거치면 윤곽의 +y 가 월드 −z 가 되므로, 여기서는
 *   운용자 모서리를 **−y 쪽**에 둔다(그래야 월드에서 +z = 운용자 쪽이 된다).
 *
 * @param w    가로(폭)
 * @param span 앞뒤 전체 깊이(휜 것까지 포함한 값)
 * @param sag  가운데가 물러나는 깊이
 */
function curvedDeskShape(w, span, sag, seg) {
  const n = Math.max(8, seg * 4);
  const band = span - sag;                                  // 띠 자체의 폭(책상 깊이)
  const curve = t => consoleCurve(t, sag);                  // 가운데가 가장 깊은 포물선
  const front = t => -span / 2 + curve(t);                  // 운용자 쪽 모서리
  const s = new THREE.Shape();
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = -w / 2 + w * t, y = front(t);
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  for (let i = n; i >= 0; i--) {
    const t = i / n;
    s.lineTo(-w / 2 + w * t, front(t) + band);              // 뒤(LED) 쪽 모서리 — 나란히 휜다
  }
  s.closePath();
  return s;
}

/**
 * 보트형(배 모양) 상판 윤곽 — 가운데가 살짝 불룩한 회의 테이블.
 * 양 끝 폭은 그대로 두고 **가운데만** 부풀린다(사인 곡선). 부푸는 양은 명세가 정한다.
 *   과장하면 타원 식탁이 되고, 0이면 사각과 같다 — 실제 기업 회의 테이블은 4~8% 정도다.
 * @param w      길이(장변 방향)
 * @param d      양 끝의 폭
 * @param bulge  가운데가 한쪽으로 더 나가는 양(편측)
 */
function boatShape(w, d, bulge, seg) {
  const n = Math.max(8, seg * 4);
  const s = new THREE.Shape();
  const edge = t => d / 2 + Math.sin(t * Math.PI) * bulge;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = -w / 2 + w * t;
    if (i === 0) s.moveTo(x, edge(t)); else s.lineTo(x, edge(t));
  }
  for (let i = n; i >= 0; i--) {
    const t = i / n, x = -w / 2 + w * t;
    s.lineTo(x, -edge(t));
  }
  s.closePath();
  return s;
}

/**
 * 모서리마다 **다른 반지름**을 줄 수 있는 다각형 윤곽.
 * `roundedRectShape`와 같은 방식(꼭짓점을 제어점으로 하는 2차 베지에)이되,
 *   네 모서리가 아니라 **꼭짓점마다** 반지름을 따로 받는다.
 *   U자 상판은 바깥 앞·바깥 뒤·안쪽 오목 모서리의 성격이 전부 달라서 하나의 값으로는 안 된다.
 *
 * 오목한(안으로 꺾인) 모서리도 같은 식이 그대로 통한다 — 곡선이 반대로 휘어
 *   **모서리를 메우는 곡면**이 된다. U자가 '직사각형 세 장'이 아니라 한 덩어리로 읽히는 이유가 이것이다.
 *
 * @param pts [{x, y, r}] 꼭짓점 목록(닫힌 다각형). r은 그 꼭짓점의 둥글림.
 */
function filletedPolygonShape(pts) {
  const n = pts.length;
  const seg = i => Math.hypot(pts[(i + 1) % n].x - pts[i].x, pts[(i + 1) % n].y - pts[i].y);
  const t = pts.map(p => Math.max(0, p.r || 0));
  // 한 변에서 양 끝 모서리가 함께 물러난다 — 합이 변 길이를 넘으면 비율대로 줄인다.
  //   (한 번 줄이면 이웃 변의 조건이 다시 깨질 수 있어 두 번 돈다.)
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, L = seg(i), sum = t[i] + t[j];
      if (sum > L && sum > 1e-9) { const k = L / sum; t[i] *= k; t[j] *= k; }
    }
  }
  const at = (i, j, dist) => {
    const a = pts[i], b = pts[j];
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: a.x + ((b.x - a.x) * dist) / L, y: a.y + ((b.y - a.y) * dist) / L };
  };
  const s = new THREE.Shape();
  for (let i = 0; i < n; i++) {
    const inP = at(i, (i + n - 1) % n, t[i]);    // 들어오는 변에서 물러난 점
    const outP = at(i, (i + 1) % n, t[i]);       // 나가는 변에서 물러난 점
    if (i === 0) s.moveTo(inP.x, inP.y); else s.lineTo(inP.x, inP.y);
    if (t[i] > 1e-9) s.quadraticCurveTo(pts[i].x, pts[i].y, outP.x, outP.y);
    else s.lineTo(outP.x, outP.y);
  }
  s.closePath();
  return s;
}

/**
 * U자(ㄷ자) 상판 윤곽 — **한 덩어리**다. 직사각형 세 장을 이어 붙인 것이 아니다.
 *
 * 좌표 약속: 이 윤곽의 **+Y가 화면의 앞쪽(-Z, LED 쪽)** 이 된다.
 *   윤곽을 만든 뒤 `rotateX(-90°)`로 눕히면 윤곽의 +Y가 월드 -Z로 가기 때문이다.
 *   그래서 U자가 열린 쪽(터진 쪽)을 +Y에 둔다.
 *
 * @param outerW 바깥 가로(양 날개 바깥 끝 사이)
 * @param outerD 바깥 세로(앞 날개 끝 ~ 뒤 상판 뒷면)
 * @param segW   상판 폭(띠의 너비). 뒤 상판의 세로이자 날개의 가로다.
 */
function uOutlinePoints(outerW, outerD, segW, { frontR, rearR, innerR }) {
  const A = outerW / 2, B = outerD / 2, s = segW;
  return [
    { x: -A, y: -B, r: rearR },              // 뒤 바깥 왼쪽 — 사람이 없는 쪽이라 약하게만
    { x: A, y: -B, r: rearR },               // 뒤 바깥 오른쪽
    { x: A, y: B, r: frontR },               // 오른 날개 앞 끝(바깥)
    { x: A - s, y: B, r: frontR },           // 오른 날개 앞 끝(안쪽) — 둘이 만나 반원 끝이 된다
    { x: A - s, y: -B + s, r: innerR },      // 안쪽 오목 모서리(오른쪽)
    { x: -A + s, y: -B + s, r: innerR },     // 안쪽 오목 모서리(왼쪽)
    { x: -A + s, y: B, r: frontR },          // 왼 날개 앞 끝(안쪽)
    { x: -A, y: B, r: frontR },              // 왼 날개 앞 끝(바깥)
  ];
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
 * U자 상판 입체. **치수는 완성된 실제 치수로 받는다.**
 *
 * 왜 보정이 필요한가 — ExtrudeGeometry의 경사(bevel)는 윤곽을 **사방으로 bevel만큼 넓힌다.**
 *   (2×2 윤곽에 경사 0.1을 주면 결과는 2.2×2.2다. 실제로 재서 확인했다.)
 *   그대로 두면 상판이 배치보다 커지고, U자 안쪽 구멍은 그만큼 작아진다.
 *   그래서 윤곽을 **미리 bevel만큼 줄여서** 만든다 — 볼록 모서리는 반지름을 빼고,
 *   오목 모서리는 반대로 더한다(바깥으로 부풀 때 오목은 작아지므로).
 * 그 결과 완성된 상판의 바깥 크기·띠 폭·모서리 반지름이 **넘겨받은 값과 정확히 같다.**
 */
function uTopGeometry(outerW, outerD, segW, thk, radii, bevel, d) {
  const b = Math.max(1e-5, Math.min(bevel, thk / 2 - 1e-5, segW / 4));
  const shape = filletedPolygonShape(uOutlinePoints(
    outerW - b * 2, outerD - b * 2, segW - b * 2,
    {
      frontR: Math.max(0, radii.frontR - b),
      rearR: Math.max(0, radii.rearR - b),
      innerR: Math.max(0, radii.innerR + b),
    },
  ));
  const geo = extrude(shape, thk, b, d);
  geo.rotateX(-Math.PI / 2);   // 윤곽의 +Y가 월드 -Z(앞쪽)로, 밀어낸 방향이 위아래로
  return geo;
}

// 여러 도형을 **하나로 합친다.** 5발 받침처럼 조각이 많은 물건을 부품마다 따로 그리면
//   그리기 호출이 조각 수만큼(허브 1 + 다리 5 + 바퀴 5 = 11개) 늘어난다. 합쳐 두면 한 번에 그린다.
//   (Three.js의 병합 유틸은 addons에 있어 동봉본에 없다 — 속성 배열을 직접 이어 붙인다.)
function mergeGeometries(list) {
  const flat = list.map(g => (g.index ? g.toNonIndexed() : g));
  const attrs = ['position', 'normal', 'uv'];
  const total = flat.reduce((n, g) => n + g.attributes.position.count, 0);
  const out = new THREE.BufferGeometry();
  for (const name of attrs) {
    const size = flat[0].attributes[name]?.itemSize;
    if (!size) continue;
    const arr = new Float32Array(total * size);
    let at = 0;
    for (const g of flat) {
      const a = g.attributes[name];
      if (!a) { at += g.attributes.position.count * size; continue; }
      arr.set(a.array.subarray(0, a.count * size), at);
      at += a.count * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  for (let i = 0; i < flat.length; i++) {
    flat[i].dispose();
    if (flat[i] !== list[i]) list[i].dispose();   // toNonIndexed()로 새로 만든 경우 원본도 반납
  }
  out.computeBoundingSphere();
  return out;
}

/**
 * **위로 갈수록 좁아지는 휜 판** — 임원 의자의 하이백 등받이. (PHASE 3-a 신규)
 *
 * `arc()`와 무엇이 다른가: `arc()`는 윤곽 하나를 그대로 밀어내므로(ExtrudeGeometry)
 *   **높이 어디서나 폭이 같다.** 회의용 의자는 그래서 등받이 위에 좁은 가로대를 따로 얹어
 *   '위가 좁아 보이게' 했다 — 가까이서 보면 단이 진다(PHASE 2-a에 남긴 알려진 문제).
 *   여기서는 아래 폭에서 위 폭까지 **연속으로** 줄어드는 껍데기를 직접 짠다.
 *
 * 만드는 방법: 높이를 몇 칸으로 나누고, 각 칸마다 그 높이의 폭으로 **휜 단면**을 만든 뒤
 *   이웃한 단면끼리 이어 붙인다(로프트). 위·아래는 부채꼴로 막아 닫힌 덩어리로 만든다.
 *   분할 수는 낮게 — 실루엣만 살면 되고, 좌석이 여럿이면 삼각형이 그만큼 곱해진다.
 *
 * @param wBottom 아래쪽(허리) 폭
 * @param wTop    위쪽(어깨) 폭 — wBottom 보다 작아야 좁아진다
 * @param h       높이
 * @param thk     두께
 * @param sag     가운데가 뒤로 물러난 깊이(몸을 감싸는 곡률)
 */
function taperedBackGeometry(wBottom, wTop, h, thk, sag, d) {
  const nU = Math.max(6, d.curve * 3);      // 폭 방향 분할
  const nV = Math.max(3, d.curve + 2);      // 높이 방향 분할
  // 한 높이(v)에서의 단면 둘레 점들. 바깥면(뒤) → 안쪽면(앞)을 한 바퀴 돈다.
  const ring = (v) => {
    const w = wBottom + (wTop - wBottom) * v;
    const y = (v - 0.5) * h;
    const pts = [];
    const curve = t => sag * (1 - (2 * t - 1) ** 2);
    for (let i = 0; i <= nU; i++) { const t = i / nU; pts.push([-w / 2 + w * t, y, curve(t) + thk / 2]); }
    for (let i = nU; i >= 0; i--) { const t = i / nU; pts.push([-w / 2 + w * t, y, curve(t) - thk / 2]); }
    return pts;
  };
  const rings = [];
  for (let j = 0; j <= nV; j++) rings.push(ring(j / nV));
  const pos = [];
  const tri = (a, b, c) => { pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); };
  const m = rings[0].length;
  // 옆면 — 이웃한 두 단면을 잇는다.
  for (let j = 0; j < nV; j++) {
    const lo = rings[j], hi = rings[j + 1];
    for (let i = 0; i < m; i++) {
      const k = (i + 1) % m;
      tri(lo[i], hi[i], hi[k]);
      tri(lo[i], hi[k], lo[k]);
    }
  }
  // 위·아래 막음 — 단면 가운데를 중심으로 한 부채꼴.
  const capAt = (r, up) => {
    const c = [0, r[0][1], 0];
    for (let i = 0; i < m; i++) {
      const k = (i + 1) % m;
      if (up) tri(c, r[i], r[k]); else tri(c, r[k], r[i]);
    }
  };
  capAt(rings[nV], true);
  capAt(rings[0], false);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * 오피스 체어 5발 받침 — 허브 + 방사형 다리 + 바퀴를 **한 덩어리**로 만든다.
 *   실제 의자에서 이 부분은 하나로 움직이고 색도 같다. 조각마다 따로 그릴 이유가 없다.
 *   다리는 **낮고 길게** 뻗어야 한다 — 굵고 짧으면 장난감처럼 보인다.
 * 만든 도형은 위아래 가운데를 원점으로 맞춰 돌려준다(부품 위치 규칙과 맞추기 위해).
 */
function starBase({ legs = 5, reach, hubR, hubH, legW, legH, casterR, casterH }, d) {
  const parts = [];
  const hub = new THREE.CylinderGeometry(hubR, hubR * 1.1, hubH, d.radial);
  hub.translate(0, casterH + hubH / 2, 0);
  parts.push(hub);

  for (let i = 0; i < legs; i++) {
    const a = (i / legs) * Math.PI * 2;
    // 다리 — 눕힌 판. 모서리를 둥글려 위에서 볼 때 날카로운 막대가 아니게 한다.
    const leg = extrude(roundedRectShape(legW, reach, legW * 0.42), legH, legH * 0.3, d);
    leg.rotateX(-Math.PI / 2);                         // 세운 판 → 눕힌 판
    leg.translate(0, casterH + legH / 2, reach / 2);   // 허브 앞쪽으로 밀어 낸다
    leg.rotateY(a);                                    // 제자리에서 돌려 방사형으로
    parts.push(leg);

    // 바퀴 — 다리 끝. 낮은 원기둥 하나면 '바퀴 달린 의자' 실루엣이 산다.
    //   여기서 분할 수를 올려 봐야 멀리서는 안 보이고 삼각형만 는다.
    const cas = new THREE.CylinderGeometry(casterR, casterR, casterH, Math.max(8, Math.round(d.radial / 2)));
    cas.translate(0, casterH / 2, reach - casterR);
    cas.rotateY(a);
    parts.push(cas);
  }
  const geo = mergeGeometries(parts);
  geo.translate(0, -(casterH + hubH) / 2, 0);   // 부품 중심이 원점에 오도록
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

    /**
     * 보트형 상판 — 눕힌 판이되 장변이 가운데에서 살짝 부푼다.
     * 캐시 열쇠가 `slab`(s|…)과 **다른 머리글자**를 쓴다 — 사각과 보트가 같은 도형을 물려받으면
     *   한 화면에서 먼저 그린 모양이 다른 테이블까지 덮어쓴다.
     */
    boatTop(w, d, thk, { bulge = 0, seg = 8, detail = 'high' } = {}) {
      const dd = q(detail);
      const key = `w|${w}|${d}|${thk}|${bulge}|${seg}|${detail}`;
      return take(key, () => {
        const geo = extrude(boatShape(w, d, bulge, seg), thk, thk * 0.3, dd);
        geo.rotateX(-Math.PI / 2);   // 밀어낸 방향(두께)을 위아래로 눕힌다
        return geo;
      });
    },

    /**
     * 곡선 콘솔 상판 — 상황실 운용자 데스크(PHASE 5-b).
     * 캐시 열쇠 머리글자가 다른 도형과 겹치지 않는다(`v|`) — 특히 등받이 `arc`(a|)와
     *   섞이면 의자 등받이가 콘솔 상판을 덮어쓴다.
     * **완성 치수로 받는다** — 돌려주는 도형의 실제 크기가 정확히 w × thk × d 다.
     *   경사(bevel)가 윤곽을 사방으로 밀어내므로 윤곽 자체는 미리 그만큼 줄여 만든다.
     */
    curvedTop(w, d, thk, { sag = 0, detail = 'high' } = {}) {
      const dd = q(detail);
      const key = `v|${w}|${d}|${thk}|${sag}|${detail}`;
      return take(key, () => {
        const b = Math.max(1e-5, Math.min(thk * 0.3, thk / 2 - 1e-5));
        // 곡선 분할을 따로 올린다 — 1.8m 폭에 180mm 휨이라 기본 4분할이면 각져 보인다.
        const fine = { ...dd, curve: Math.max(dd.curve, 12) };
        // 경사(bevel)는 윤곽의 **법선 방향**으로 밀어낸다. 휜 모서리는 법선이 비스듬해서
        //   앞뒤로 b 보다 조금 더 나간다(실측 +2mm). 끝점 기울기(4·sag/w)로 그만큼 더 줄인다 —
        //   빼지 않으면 배치가 정한 발자국을 소리 없이 넘는다.
        const slope = w > 0 ? (4 * sag) / w : 0;
        const bz = b * Math.hypot(1, slope);
        const geo = extrude(curvedDeskShape(w - b * 2, d - bz * 2, sag, fine.curve), thk, b, fine);
        geo.rotateX(-Math.PI / 2);   // 밀어낸 방향(두께)을 위아래로 눕힌다
        return geo;
      });
    },

    /**
     * U자 상판 — **이음매가 없는 한 덩어리.**
     * 캐시 열쇠 머리글자가 다른 도형과 겹치지 않는다(`u|`) — 겹치면 사각 상판이 U자를 덮어쓴다.
     *   열쇠에는 U자를 결정하는 값이 **전부** 들어간다: 바깥 가로·세로, 띠 폭, 두께,
     *   모서리 반지름 3종. 하나라도 빠지면 크기가 다른 두 테이블이 같은 도형을 물려받는다.
     */
    uTop(outerW, outerD, segW, thk, { frontR = 0, rearR = 0, innerR = 0, bevel = 0, detail = 'high' } = {}) {
      const dd = q(detail);
      const key = `u|${outerW}|${outerD}|${segW}|${thk}|${frontR}|${rearR}|${innerR}|${bevel}|${detail}`;
      // 곡선 분할을 **따로 올린다.** 다른 부품의 둥글림은 반지름이 10~90mm라 4분할이면 충분하지만,
      //   여기 앞 끝은 반지름이 450mm다 — 같은 4분할로는 눈에 띄게 각져 보인다(실제로 그렇게 나왔다).
      //   상판은 이 자산에 **딱 한 장**뿐이라 분할을 올려도 삼각형 수가 크게 늘지 않는다.
      const fine = { ...dd, curve: Math.max(dd.curve, 14) };
      return take(key, () => uTopGeometry(outerW, outerD, segW, thk,
        { frontR, rearR, innerR }, bevel || thk * 0.2, fine));
    },

    /**
     * 위로 갈수록 좁아지는 휜 판(하이백 등받이). `arc()`와 달리 **폭이 연속으로** 줄어든다.
     * 캐시 열쇠 머리글자가 `arc`(a|…)와 다르다 — 섞이면 서로의 등받이를 덮어쓴다.
     */
    taperedBack(wBottom, wTop, h, thk, { sag = 0, detail = 'high' } = {}) {
      const dd = q(detail);
      const key = `k|${wBottom}|${wTop}|${h}|${thk}|${sag}|${detail}`;
      return take(key, () => taperedBackGeometry(wBottom, wTop, h, thk, sag, dd));
    },

    /**
     * 오피스 체어 5발 받침(허브 + 다리 + 바퀴)을 **한 덩어리**로.
     * 부품 하나 = 그리기 호출 하나이므로, 조각 11개를 합쳐 1개로 만든다.
     */
    star(spec, { detail = 'high' } = {}) {
      const dd = q(detail);
      const key = `t|${Object.values(spec).join('|')}|${detail}`;
      return take(key, () => starBase(spec, dd));
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
