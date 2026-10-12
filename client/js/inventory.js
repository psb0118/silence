export const ITEM = {
  KEY: { id: "key", name: "키" },
  BATTERY: { id: "battery", name: "배터리" },
  FUSE: { id: "fuse", name: "차단기" },
  MEDKIT: { id: "medkit", name: "구급상자" },
  SMOKE: { id: "smoke", name: "연막탄" },
  DECOY: { id: "decoy", name: "소음장치" }
};

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
    const i = this.findEmpty();
    if (i < 0) return { ok: false };
    this.slots[i] = { id, name, count };
    return { ok: true, slot: i };
  }
  hasKey() {
    return this.slots.some((s) => s.id === "key" && s.count > 0);
  }
  removeKey() {
    for (let i = 0; i < this.size; i++) {
      if (this.slots[i].id === "key") {
        this.slots[i].count = 0;
        this.slots[i].id = null;
        this.slots[i].name = "";
        return true;
      }
    }
    return false;
  }
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