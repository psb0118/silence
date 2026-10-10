export const ITEM = {
  KEY: { id: "key", name: "키" },
  BATTERY: { id: "battery", name: "배터리" },
  FUSE: { id: "fuse", name: "분전기" }
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
}