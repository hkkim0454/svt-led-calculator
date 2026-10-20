// seat-edit.js — 3D 뷰에서 고른 의자를 지우는 규칙(오너 요청 2026-10-19). 순수 함수, DOM 없음.
// ─────────────────────────────────────────────────────────────────────────────
// 배치(room-presets)는 그대로 두고, **그림에 넘길 목록에서만** 지운 의자를 뺀다.
//   · 의자는 자리(x, z mm)로 알아본다. 같은 자리의 앉은 사람(seated)도 함께 빠진다.
//   · 방 크기·좌석 수가 바뀌어 의자 배치가 새로 만들어지면 지운 기록을 버린다 —
//     바뀐 배치에서 엉뚱한 의자가 사라지지 않게 하려는 것이다(seatLayoutSig 로 알아본다).
// ─────────────────────────────────────────────────────────────────────────────
import { SEAT_ITEM_TYPES } from './gl-model.js?v=486';

/** 의자 자리 열쇠 — mm 를 반올림한 'x:z'. */
export function seatKey(it) {
  return `${Math.round(Number(it?.x) || 0)}:${Math.round(Number(it?.z) || 0)}`;
}

/** 고르고 지울 수 있는 물건인가(의자·객석·스툴·라운지, 앉은 사람). */
export function isSeatItem(it) {
  return !!it && SEAT_ITEM_TYPES.has(it.type);
}

/** 이 배치의 의자 자리 전체를 대표하는 짧은 지문. 자리 하나만 달라져도 값이 바뀐다. */
export function seatLayoutSig(items) {
  const keys = (items || []).filter(isSeatItem).map(seatKey).sort();
  let h = 5381;
  const s = keys.join('|');
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return `${keys.length}-${h.toString(36)}`;
}

/** 지운 의자를 뺀 목록. 지운 것이 없으면 **같은 배열을 그대로** 돌려준다(기본 화면 무변화). */
export function removeSeats(items, removed) {
  const set = removed instanceof Set ? removed : new Set(removed || []);
  if (!set.size) return items;
  return (items || []).filter(it => !(isSeatItem(it) && set.has(seatKey(it))));
}

/**
 * 저장된 지운 기록을 지금 배치에 맞춘다.
 *   지문이 같으면 그대로, 다르면(배치가 새로 만들어졌으면) 비운다.
 * @returns {{ sig: string, removed: string[] }}
 */
export function reconcileSeatEdit(edit, items) {
  const sig = seatLayoutSig(items);
  const removed = Array.isArray(edit?.removed) ? edit.removed.filter(k => typeof k === 'string') : [];
  if (!removed.length || edit?.sig !== sig) return { sig, removed: [] };
  // 지금 배치에 없는 자리는 버린다(지문이 같으면 원래 없지만, 손으로 고친 저장값을 대비한다).
  const here = new Set((items || []).filter(isSeatItem).map(seatKey));
  return { sig, removed: removed.filter(k => here.has(k)) };
}

/** 지운 의자 수 — 앉은 사람(seated)은 세지 않는다(같은 자리의 의자로 이미 센다). */
export function removedSeatCount(items, removed) {
  const set = removed instanceof Set ? removed : new Set(removed || []);
  if (!set.size) return 0;
  return (items || []).filter(it => isSeatItem(it) && it.type !== 'seated' && set.has(seatKey(it))).length;
}
