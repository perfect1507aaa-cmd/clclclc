import { OWNER } from '../core/constants.js';

const DRAG_THRESHOLD = 6;

export class InputController {
  constructor(canvas, renderer, callbacks) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.callbacks = callbacks; // { onToggleChannel, onClaimDormant, onUpgrade, getGameState }

    this.dragFrom = null;
    this.dragPos = { x: 0, y: 0 };
    this.moved = false;
    this.selectedNodeId = null;
    this.hoverNodeId = null;
    this.pendingMenuAction = null;

    canvas.addEventListener('pointerdown', this.onDown.bind(this));
    canvas.addEventListener('pointermove', this.onMove.bind(this));
    window.addEventListener('pointerup', this.onUp.bind(this));
    canvas.addEventListener('pointercancel', this.onCancel.bind(this));
  }

  coords(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  onDown(e) {
    const gs = this.callbacks.getGameState();
    if (!gs || gs.result) return;
    const pos = this.coords(e);
    this.downPos = pos;
    this.moved = false;

    if (this.selectedNodeId) {
      const branch = this.renderer.hitTestUpgradeMenu(pos.x, pos.y);
      if (branch) {
        this.pendingMenuAction = { nodeId: this.selectedNodeId, branch };
        return;
      }
    }

    const nodeId = this.renderer.hitTestNode(gs, pos.x, pos.y);
    this.downNodeId = nodeId;
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
    const pos = this.coords(e);

    if (this.pendingMenuAction) {
      this.callbacks.onUpgrade(this.pendingMenuAction.nodeId, this.pendingMenuAction.branch);
      this.pendingMenuAction = null;
      return;
    }

    if (this.dragFrom) {
      if (this.moved) {
        const targetId = this.renderer.hitTestNode(gs, pos.x, pos.y);
        if (targetId && targetId !== this.dragFrom) {
          const targetNode = gs.nodes.get(targetId);
          if (targetNode.owner === OWNER.DORMANT) {
            this.callbacks.onClaimDormant(targetId);
          } else {
            this.callbacks.onToggleChannel(this.dragFrom, targetId);
          }
        }
      } else {
        this.selectedNodeId = this.selectedNodeId === this.dragFrom ? null : this.dragFrom;
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
    this.selectedNodeId = null;
  }

  onCancel() {
    this.reset();
  }

  reset() {
    this.dragFrom = null;
    this.moved = false;
    this.pendingMenuAction = null;
  }

  getState() {
    return {
      dragFrom: this.dragFrom,
      dragPos: this.dragPos,
      hoverNodeId: this.hoverNodeId,
      selectedNodeId: this.selectedNodeId,
    };
  }

  clearSelection() {
    this.selectedNodeId = null;
    this.dragFrom = null;
  }
}
