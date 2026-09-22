import { OWNER } from '../core/constants.js';

const DRAG_THRESHOLD = 6;

export class InputController {
  constructor(canvas, renderer, callbacks) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.callbacks = callbacks; // { onConnect, onClaimDormant, onCutConnection, getGameState }

    this.dragFrom = null;
    this.dragPos = { x: 0, y: 0 };
    this.moved = false;

    this.cutting = false;
    this.cutConnId = null;
    this.cutT = 0.5;
    this.cutPoint = null;

    this.hoverNodeId = null;

    canvas.addEventListener('pointerdown', this.onDown.bind(this));
    canvas.addEventListener('pointermove', this.onMove.bind(this));
    window.addEventListener('pointerup', this.onUp.bind(this));
    canvas.addEventListener('pointercancel', this.onCancel.bind(this));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  coords(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  onDown(e) {
    const gs = this.callbacks.getGameState();
    if (!gs || gs.result) return;
    const pos = this.coords(e);

    if (e.button === 2) {
      const hit = this.renderer.hitTestConnection(gs, pos.x, pos.y);
      if (hit) {
        this.cutting = true;
        this.cutConnId = hit.connId;
        this.cutT = hit.t;
        this.cutPoint = hit.point;
      }
      return;
    }

    this.downPos = pos;
    this.moved = false;
    const nodeId = this.renderer.hitTestNode(gs, pos.x, pos.y);
    if (nodeId) {
      const node = gs.nodes.get(nodeId);
      if (node.owner === OWNER.PLAYER) {
        this.dragFrom = nodeId;
        this.dragPos = pos;
      }
    }
  }

  onMove(e) {
    const gs = this.callbacks.getGameState();
    if (!gs) return;
    const pos = this.coords(e);
    this.hoverNodeId = this.renderer.hitTestNode(gs, pos.x, pos.y);

    if (this.cutting && this.cutConnId) {
      const conn = gs.connections.find((c) => c.id === this.cutConnId);
      if (conn) {
        const a = this.renderer.pos(conn.from);
        const b = this.renderer.pos(conn.to);
        if (a && b) {
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const lenSq = dx * dx + dy * dy || 1;
          let t = ((pos.x - a.x) * dx + (pos.y - a.y) * dy) / lenSq;
          t = Math.min(1, Math.max(0, t));
          this.cutT = t;
          this.cutPoint = { x: a.x + dx * t, y: a.y + dy * t };
        }
      } else {
        this.cutting = false;
        this.cutConnId = null;
      }
      return;
    }

    if (this.dragFrom) {
      this.dragPos = pos;
      const dx = pos.x - this.downPos.x;
      const dy = pos.y - this.downPos.y;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD) this.moved = true;
    }
  }

  onUp(e) {
    const gs = this.callbacks.getGameState();
    if (!gs) {
      this.reset();
      return;
    }

    if (this.cutting) {
      if (this.cutConnId) this.callbacks.onCutConnection(this.cutConnId, this.cutT);
      this.cutting = false;
      this.cutConnId = null;
      this.cutPoint = null;
      return;
    }

    const pos = this.coords(e);

    if (this.dragFrom) {
      if (this.moved) {
        const targetId = this.renderer.hitTestNode(gs, pos.x, pos.y);
        if (targetId && targetId !== this.dragFrom) {
          const targetNode = gs.nodes.get(targetId);
          if (targetNode.owner === OWNER.DORMANT) {
            this.callbacks.onClaimDormant(targetId);
          } else {
            this.callbacks.onConnect(this.dragFrom, targetId);
          }
        }
      }
      this.dragFrom = null;
      this.moved = false;
      return;
    }

    const nodeId = this.renderer.hitTestNode(gs, pos.x, pos.y);
    if (nodeId) {
      const node = gs.nodes.get(nodeId);
      if (node.owner === OWNER.DORMANT) this.callbacks.onClaimDormant(nodeId);
    }
  }

  onCancel() {
    this.reset();
  }

  reset() {
    this.dragFrom = null;
    this.moved = false;
    this.cutting = false;
    this.cutConnId = null;
    this.cutPoint = null;
  }

  getState() {
    return {
      dragFrom: this.dragFrom,
      dragPos: this.dragPos,
      hoverNodeId: this.hoverNodeId,
      cutPreview: this.cutting && this.cutPoint ? { point: this.cutPoint, t: this.cutT } : null,
    };
  }

  clearSelection() {
    this.reset();
  }
}
