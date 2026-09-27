// The desk surface: papers can be dragged around and brought to the front.
export class Desk {
  constructor(el, { canDrag }) {
    this.el = el;
    this.z = 10;
    this.canDrag = canDrag;
  }

  add(doc, x, y) {
    doc.style.left = `${x}px`;
    doc.style.top = `${y}px`;
    doc.style.zIndex = ++this.z;
    this.el.appendChild(doc);
    this.clamp(doc);
    this.bindDrag(doc);
    return doc;
  }

  front(doc) {
    doc.style.zIndex = ++this.z;
  }

  clamp(doc) {
    const maxX = Math.max(0, this.el.clientWidth - doc.offsetWidth);
    const maxY = Math.max(0, this.el.clientHeight - doc.offsetHeight);
    const x = Math.min(Math.max(0, parseFloat(doc.style.left)), maxX);
    const y = Math.min(Math.max(0, parseFloat(doc.style.top)), maxY);
    doc.style.left = `${x}px`;
    doc.style.top = `${y}px`;
  }

  clampAll() {
    for (const d of this.el.querySelectorAll('.doc')) this.clamp(d);
  }

  bindDrag(doc) {
    doc.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0 && ev.pointerType === 'mouse') return;
      if (ev.target.closest('button')) return;
      this.front(doc);
      if (!this.canDrag(ev)) return;
      ev.preventDefault();
      const startX = ev.clientX;
      const startY = ev.clientY;
      const ox = parseFloat(doc.style.left);
      const oy = parseFloat(doc.style.top);
      doc.setPointerCapture(ev.pointerId);
      doc.classList.add('dragging');
      const move = (e) => {
        doc.style.left = `${ox + e.clientX - startX}px`;
        doc.style.top = `${oy + e.clientY - startY}px`;
        this.clamp(doc);
      };
      const up = () => {
        doc.classList.remove('dragging');
        doc.removeEventListener('pointermove', move);
        doc.removeEventListener('pointerup', up);
        doc.removeEventListener('pointercancel', up);
      };
      doc.addEventListener('pointermove', move);
      doc.addEventListener('pointerup', up);
      doc.addEventListener('pointercancel', up);
    });
  }

  remove(filter) {
    for (const d of [...this.el.querySelectorAll('.doc')]) {
      if (!filter || filter(d)) d.remove();
    }
  }
}
