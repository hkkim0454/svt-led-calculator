// furniture-routing.js — "무엇을 요청했나"와 "실제로 무엇을 그리나"를 잇는 다리. (순수)
// ─────────────────────────────────────────────────────────────────────────────
// 지금 상태를 한 줄로 말하면 이렇다.
//   공간 디자인은 `executiveChair`를 원한다고 **적어 두었지만**, 그 의자는 **아직 없다.**
//
// 이 파일은 그 둘 사이를 잇되, **없는 것을 있는 것처럼 다루지 않는다.**
//   요청(requested)  디자인·배치가 원한 가구 이름
//   실제(runtime)    지금 실제로 세울 수 있는 가구 이름
//   두 값을 **따로** 돌려준다. 하나로 뭉뚱그리면 "왜 임원 의자가 안 나오지"를 알 수 없다.
//
// 세 가지 진실의 출처가 있고, 서로 섞지 않는다.
//   FURNITURE_ASSETS     지금 실제로 세울 수 있는 가구 (런타임)
//   FURNITURE_CONTRACTS  앞으로 만들 가구의 명세 (계약)
//   ROOM_DESIGNS         어느 공간이 무엇을 원하는지 (디자인)
//   **계약이 있다고 해서 가구가 있는 것이 아니다.** 구현 여부는 오직 런타임 목록이 답한다.
//
// 기존 `assetFor()`는 **건드리지 않는다.** 지금 화면을 그리는 유일한 경로이고,
//   의미를 바꾸면 회의실·강당·강의실이 한꺼번에 흔들린다. 새 길을 옆에 낸다.
//
// 이 단계(PHASE 1-d)에서는 **렌더러가 이 파일을 쓰지 않는다.** 계약만 만든다.
//   PHASE 2에서 대기업 회의실 의자를 실제로 만들면, 이 라우터를 고치지 않아도
//   `hasRuntimeFurnitureAsset('corporateChair')`가 true가 되면서 저절로 그것을 고른다.
// ─────────────────────────────────────────────────────────────────────────────

import { FURNITURE_ASSETS, assetFor } from './furniture-assets.js?v=454';
import { furnitureContract, hasFurnitureContract } from './furniture-contracts.js?v=454';
import { roomDesign, isPlanned } from './room-design.js?v=454';

/**
 * 지금 실제로 세울 수 있는 가구의 갈래.
 * 대신 그릴 가구를 고를 때 **갈래가 맞는지** 보기 위한 것이다 —
 * 모니터 자리에 테이블을 그리면 제안서가 통째로 틀린 그림이 된다.
 */
export const RUNTIME_CATEGORY = Object.freeze({
  conferenceChair: 'chair', corporateChair: 'chair', executiveChair: 'chair',
  conferenceErgoChair: 'chair', taskChair: 'chair',
  auditoriumChair: 'chair', trainingChair: 'chair',
  loungeChair: 'chair', stool: 'chair',
  conferenceTable: 'table', corporateTable: 'table', boardroomTable: 'table',
  largeUTable: 'table',
  trainingDesk: 'table', highTable: 'table', collabTable: 'table',
  controlConsole: 'console', curvedConsole: 'console',
  avCredenza: 'av', mobileStand: 'av',
  personalMonitor: 'av', prompter: 'av',
  consoleMonitor: 'av', keyboard: 'av',
  podium: 'podium',
  seatedPerson: 'person',
});

/**
 * **대신 그릴 수 있는 갈래.** 여기 없는 갈래는 없으면 없는 대로 둔다.
 *   의자·테이블·콘솔은 기존 것으로 대신해도 "가구가 놓인 방"으로 읽힌다.
 *   그러나 개인 모니터 대신 이동식 디스플레이를 그리면 **다른 장비**가 된다 —
 *   AV 장비는 대신할 것이 없으면 **그리지 않는 편이 낫다**(오너 지침 §12·§13).
 */
export const FALLBACK_ALLOWED = Object.freeze(['chair', 'table', 'console']);

/** 배치 항목의 종류 → 디자인 선언의 가구 자리. */
const ROLE_BY_TYPE = Object.freeze({ chair: 'chair', table: 'table', console: 'console' });

/** 이 이름의 가구를 **지금 실제로 세울 수 있는가.** 계약이 아니라 런타임 목록이 답한다. */
export function hasRuntimeFurnitureAsset(id) {
  return typeof id === 'string' && !!FURNITURE_ASSETS[id];
}

/** 런타임 가구의 갈래. 모르면 null. */
export function runtimeCategory(id) {
  return RUNTIME_CATEGORY[id] || null;
}

/** 계약이 정한 갈래. 계약이 없으면 런타임 갈래로 답한다. 둘 다 없으면 null. */
export function assetCategory(id) {
  const c = furnitureContract(id);
  return c ? c.category : runtimeCategory(id);
}

// `planned('executiveChair')` 같은 '아직 없음' 표시를 벗겨 이름만 꺼낸다.
const nameOf = v => (isPlanned(v) ? v.planned : (typeof v === 'string' ? v : null));

/**
 * 그 공간 디자인이 **원한다고 적어 둔** 가구.
 * 아직 만들지 않은 것도 그대로 이름을 돌려준다 — 여기는 '요청'을 읽는 자리다.
 * 디자인이 가구를 정하지 않았으면(INHERIT) 전부 null이다 = 지금 하던 대로.
 *
 * @returns {{chair:string|null, table:string|null, console:string|null, av:string[]}}
 */
export function requestedFurnitureForDesign(designId) {
  const f = roomDesign(designId).furniture;
  const av = (f && Array.isArray(f.av)) ? f.av.map(nameOf).filter(Boolean) : [];
  return Object.freeze({
    chair: f ? nameOf(f.chair) : null,
    table: f ? nameOf(f.table) : null,
    console: f ? nameOf(f.console) : null,
    av: Object.freeze(av),
  });
}

// 이 배치 항목에 대해 디자인이 요청하는 가구 이름. 없으면 null.
//   `item.asset`(배치가 직접 붙인 힌트)이 디자인보다 우선한다 — 강의실 의자처럼
//   배치가 이미 정확히 지정한 경우가 있기 때문이다.
function requestedAssetFor(item, designId) {
  if (!item) return null;
  if (typeof item.asset === 'string' && item.asset) return item.asset;
  const role = ROLE_BY_TYPE[item.type];
  if (!role) return null;
  return requestedFurnitureForDesign(designId)[role];
}

const result = o => Object.freeze({
  requestedAsset: null, contractStatus: null, category: null,
  runtimeAsset: null, implemented: false, fallbackUsed: false, renderable: false,
  ...o,
});

/**
 * 배치 항목 하나를 그 공간 디자인의 눈으로 풀어 본다.
 *
 * 순서
 *   ① 디자인·배치가 요청한 가구가 **실제로 있으면** 그것을 쓴다.
 *   ② 없으면, **갈래가 같은** 기존 가구로 대신한다(의자·테이블·콘솔만).
 *   ③ 대신할 것도 없으면 **미구현으로 남긴다.** 엉뚱한 가구를 그리지 않는다.
 *
 * 디자인이 가구를 정하지 않았으면(대기업 회의실이 지금 그렇다) 요청 자체가 없으므로
 * 곧바로 기존 경로(`assetFor`) 결과가 나온다 — **지금 화면이 그대로인 이유**다.
 *
 * @returns {{requestedAsset, contractStatus, category, runtimeAsset, implemented, fallbackUsed, renderable}}
 *   requestedAsset  원한 가구 이름
 *   runtimeAsset    실제로 그릴 가구 이름(없으면 null)
 *   implemented     원한 가구가 실제로 있는가
 *   fallbackUsed    다른 가구로 대신했는가
 *   renderable      그릴 것이 있는가
 */
export function resolveFurnitureForDesign(item, designId) {
  // 기존 경로. **무슨 일이 있어도 이 값을 바꾸지 않는다** — 지금 화면의 기준이다.
  const legacy = assetFor(item);
  const requested = requestedAssetFor(item, designId);

  // 요청이 없다 = 디자인이 정하지 않았다 → 지금 하던 그대로.
  if (!requested) {
    return result({
      requestedAsset: legacy, category: assetCategory(legacy),
      contractStatus: furnitureContract(legacy)?.status ?? null,
      runtimeAsset: legacy, implemented: !!legacy, renderable: !!legacy,
    });
  }

  const contract = furnitureContract(requested);
  const category = assetCategory(requested);
  const base = {
    requestedAsset: requested, category,
    contractStatus: contract ? contract.status : null,
  };

  // ① 원한 가구가 실제로 있다 — 대신할 필요가 없다(avCredenza가 이 길로 간다).
  if (hasRuntimeFurnitureAsset(requested)) {
    return result({ ...base, runtimeAsset: requested, implemented: true, renderable: true });
  }

  // ② 갈래가 같은 기존 가구로만 대신한다.
  //    갈래가 다르면 대신하지 않는다 — 모니터 자리에 테이블이 서는 일을 막는다.
  if (FALLBACK_ALLOWED.includes(category) && legacy && runtimeCategory(legacy) === category) {
    return result({ ...base, runtimeAsset: legacy, implemented: false, fallbackUsed: true, renderable: true });
  }

  // ③ 대신할 것이 없다. **미구현으로 남긴다** — 잘못 그리는 것보다 안 그리는 것이 낫다.
  return result({ ...base, runtimeAsset: null, implemented: false, renderable: false });
}

/**
 * 그 공간 디자인이 요청한 가구들의 현재 상태 한눈에 보기(검증·디버깅용).
 * @returns {Array<{requested, contract, implemented, runtimeAsset}>}
 */
export function furnitureStatusForDesign(designId) {
  const req = requestedFurnitureForDesign(designId);
  const names = [req.chair, req.table, req.console, ...req.av].filter(Boolean);
  return Object.freeze(names.map(id => Object.freeze({
    requested: id,
    contract: hasFurnitureContract(id),
    implemented: hasRuntimeFurnitureAsset(id),
    runtimeAsset: hasRuntimeFurnitureAsset(id) ? id : null,
  })));
}
