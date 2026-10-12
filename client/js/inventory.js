export const ITEM = {
  KEY_SHED: {
    id: "key_shed", name: "창고 열쇠", kind: "key", color: "#5aa0ff",
    desc: "붉은 비상등이 켜진 잠긴 창고(남쪽 방)의 문을 여는 파란색 열쇠."
  },
  KEY_STORE: {
    id: "key_store", name: "저장고 열쇠", kind: "key", color: "#ff5555",
    desc: "복도 중앙에 있는 잠긴 저장고의 문을 여는 빨간색 열쇠."
  },
  BATTERY: {
    id: "battery", name: "예비 배터리", kind: "use", color: "#f5d76e",
    desc: "손전등 배터리를 40 채운다. 숫자키로 꺼냈다가 다시 누르면 사용한다."
  },
  FLASHLIGHT: {
    id: "flashlight", name: "야전 손전등", kind: "use", color: "#ffd97a",
    desc: "새 손전등으로 교체한다 — 배터리를 100%로 채운다. 숫자키로 꺼냈다가 다시 누르면 사용한다."
  },
  MEDKIT: {
    id: "medkit", name: "구급상자", kind: "use", color: "#e06080",
    desc: "체력을 1 회복한다. 숫자키로 꺼냈다가 다시 누르면 사용한다."
  },
  SMOKE: {
    id: "smoke", name: "연막탄", kind: "use", color: "#b8c4cc",
    desc: "앞으로 던져 괴물의 시야를 가린다. 숫자키로 꺼냈다가 다시 누르면 사용한다."
  },
  DECOY: {
    id: "decoy", name: "소음장치", kind: "use", color: "#c9a0ff",
    desc: "앞으로 던져 괴물을 다른 곳으로 유인한다. 숫자키로 꺼냈다가 다시 누르면 사용한다."
  },
  NOTE_SHED: {
    id: "note_shed", name: "찢긴 메모", kind: "note", color: "#d8d0b8",
    desc: "다시 읽으려면 숫자키를 누른다.",
    text: "「잠금이 색으로 나뉜다… 파란 쪽은 창고, 빨간 쪽은 저장고. 섞여 쓰면 안 된다.」"
  },
  NOTE_POWER: {
    id: "note_power", name: "작업 일지", kind: "note", color: "#d8d0b8",
    desc: "다시 읽으려면 숫자키를 누른다.",
    text: "「비상 발전기는 이미 죽었다. 차단기를 전부 되살려야 격리 철문의 잠금이 풀린다. 최소 7개.」"
  }
};

export function getItemDef(id) {
  return Object.values(ITEM).find((it) => it.id === id) || null;
}

export class Inventory {
  constructor(size = 9) {
    this.size = size;
    this.slots = Array(size).fill().map(() => ({ id: null, name: "", count: 0 }));
  }
  findEmpty() {
    for (let i = 0; i < this.size; i++) {
      if (this.slots[i].id === null || this.slots[i].count === 0) return i;
    }
    return -1;
  }
  add(id, name, count = 1) {
    const def = getItemDef(id);
    // 소모품은 같은 아이템이 이미 있으면 한 슬롯에 쌓는다 (슬롯 낭비 방지)
    if (def && def.kind === "use") {
      const ex = this.slots.find((s) => s.id === id && s.count > 0);
      if (ex) {
        ex.count = Math.min(9, ex.count + count);
        return { ok: true, slot: this.slots.indexOf(ex) };
      }
    }
    const i = this.findEmpty();
    if (i < 0) return { ok: false };
    this.slots[i] = { id, name: name || (def ? def.name : id), count };
    return { ok: true, slot: i };
  }
  // 특정 ID 열쇠 보유 여부
  hasKey(keyId) {
    if (!keyId) {
      return this.slots.some((s) => s.id && s.id.startsWith("key_") && s.count > 0);
    }
    return this.slots.some((s) => s.id === keyId && s.count > 0);
  }
  // 열쇠는 소모하지 않고 유지 (문 개방에만 사용)
  removeKey() { return false; }
  takeAt(i) {
    const s = this.slots[i];
    if (!s || s.count <= 0) return null;
    const item = { id: s.id, name: s.name, count: 1 };
    s.count -= 1;
    if (s.count <= 0) { s.count = 0; s.id = null; s.name = ""; }
    return item;
  }
  clear() {
    for (let i = 0; i < this.size; i++) this.slots[i] = { id: null, name: "", count: 0 };
  }
}
