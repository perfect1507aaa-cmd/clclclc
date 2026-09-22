import { OWNER, CUT_HIT_RADIUS } from '../core/constants.js';
import { ScreenEffects } from './effects.js';

const COLOR = {
  player: '#ff3b52',
  playerDim: '#7a1f2b',
  enemy: '#3badff',
  enemyDim: '#1f4c7a',
  neutral: '#9aa0aa',
  neutralDim: '#4a4d55',
  dormant: '#3d4048',
  bg: '#05070a',
};

const TYPE_RADIUS = {
  workstation: 16,
  server: 20,
  router: 19,
  firewall: 20,
  mainframe: 27,
};

const TIER_RADIUS_MULT = { 1: 1, 2: 1.18, 3: 1.4 };
const VISUAL_MAX_TRANSIT = 14; // inTransit that maxes out beam thickness/glow

function deg(d) {
  return (d * Math.PI) / 180;
}

function ownerColor(owner, dim = false) {
  if (owner === OWNER.PLAYER) return dim ? COLOR.playerDim : COLOR.player;
  if (owner === OWNER.ENEMY) return dim ? COLOR.enemyDim : COLOR.enemy;
  if (owner === OWNER.DORMANT) return COLOR.dormant;
  return dim ? COLOR.neutralDim : COLOR.neutral;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.effects = new ScreenEffects();
    this.layout = new Map();
    this.w = 0;
    this.h = 0;
    this.time = 0;
  }

  resize(gameState) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.computeLayout(gameState);
  }

  computeLayout(gameState) {
    this.layout.clear();
    if (!gameState) return;
    const marginX = Math.min(90, this.w * 0.12);
    const marginY = Math.min(90, this.h * 0.16);
    for (const node of gameState.nodes.values()) {
      const x = marginX + node.x * (this.w - marginX * 2);
      const y = marginY + node.y * (this.h - marginY * 2);
      this.layout.set(node.id, { x, y });
    }
  }

  pos(nodeId) {
    return this.layout.get(nodeId);
  }

  radius(node) {
    const base = TYPE_RADIUS[node.type] || 16;
    return base * (TIER_RADIUS_MULT[node.tier] || 1);
  }

  hitTestNode(gameState, sx, sy) {
    for (const node of gameState.nodes.values()) {
      const p = this.pos(node.id);
      if (!p) continue;
      const r = this.radius(node) + 10;
      if ((sx - p.x) ** 2 + (sy - p.y) ** 2 <= r * r) return node.id;
    }
    return null;
  }

  // finds the nearest connection beam to a screen point, for the RMB cut
  // gesture — returns { connId, t } where t is the fraction of the way
  // from source to destination the point projects onto.
  hitTestConnection(gameState, sx, sy) {
    let best = null;
    for (const conn of gameState.connections) {
      const a = this.pos(conn.from);
      const b = this.pos(conn.to);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq < 1) continue;
      let t = ((sx - a.x) * dx + (sy - a.y) * dy) / lenSq;
      t = Math.min(1, Math.max(0, t));
      const px = a.x + dx * t;
      const py = a.y + dy * t;
      const dist = Math.hypot(sx - px, sy - py);
      if (dist <= CUT_HIT_RADIUS && (!best || dist < best.dist)) {
        best = { connId: conn.id, t, dist, point: { x: px, y: py } };
      }
    }
    return best;
  }

  render(gameState, input, dt) {
    this.time += dt;
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = COLOR.bg;
    ctx.fillRect(0, 0, this.w, this.h);

    this.drawConnections(gameState);
    this.drawDragLine(gameState, input);
    this.drawCutPreview(input);
    this.drawNodes(gameState, input);
    this.drawTraceStrike(gameState);

    this.effects.draw(ctx, this.w, this.h);
    ctx.restore();
  }

  // ---- connections ------------------------------------------------------

  drawConnections(gameState) {
    const ctx = this.ctx;
    for (const conn of gameState.connections) {
      const source = gameState.nodes.get(conn.from);
      const pa = this.pos(conn.from);
      const pb = this.pos(conn.to);
      if (!pa || !pb) continue;

      const fill = Math.min(1, conn.inTransit / VISUAL_MAX_TRANSIT);
      const width = 1.5 + fill * 7;
      const color = ownerColor(conn.owner || source.owner);

      const collisionPt =
        conn.collisionRatio != null
          ? { x: pa.x + (pb.x - pa.x) * conn.collisionRatio, y: pa.y + (pb.y - pa.y) * conn.collisionRatio }
          : null;

      ctx.save();
      // faint guide line so the pipe reads even when nearly empty
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();

      const end = collisionPt || pb;
      this.beam(pa, end, color, width, fill);

      if (collisionPt) {
        const flash = 0.5 + 0.5 * Math.sin(this.time * 14) * 0.5 + conn.collisionFlash * 0.4;
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${Math.min(1, flash)})`;
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 14;
        ctx.arc(collisionPt.x, collisionPt.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  beam(from, to, color, width, fill = 1) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 4 + fill * 10;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.35 + fill * 0.6;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    // traveling dash pattern to sell direction of flow
    const dashLen = 10;
    ctx.setLineDash([3, dashLen]);
    ctx.lineDashOffset = -this.time * 40;
    ctx.globalAlpha = 0.5 + fill * 0.5;
    ctx.lineWidth = Math.max(1, width * 0.5);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }

  drawDragLine(gameState, input) {
    if (!input || !input.dragFrom) return;
    const p = this.pos(input.dragFrom);
    if (!p) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(input.dragPos.x, input.dragPos.y);
    ctx.stroke();
    ctx.restore();
  }

  drawCutPreview(input) {
    if (!input || !input.cutPreview) return;
    const { point } = input.cutPreview;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 16;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(point.x - 9, point.y - 9);
    ctx.lineTo(point.x + 9, point.y + 9);
    ctx.moveTo(point.x + 9, point.y - 9);
    ctx.lineTo(point.x - 9, point.y + 9);
    ctx.stroke();
    ctx.restore();
  }

  // ---- nodes ----------------------------------------------------------

  drawNodes(gameState, input) {
    for (const node of gameState.nodes.values()) {
      this.drawNode(gameState, node, input);
    }
  }

  drawNode(gameState, node, input) {
    const ctx = this.ctx;
    const p = this.pos(node.id);
    if (!p) return;
    const r = this.radius(node);
    const isDormant = node.owner === OWNER.DORMANT;

    if (isDormant) {
      const pulse = 0.35 + 0.25 * Math.sin(this.time * 2 + node.pulseT);
      ctx.save();
      ctx.beginPath();
      ctx.fillStyle = COLOR.dormant;
      ctx.globalAlpha = pulse;
      ctx.shadowColor = '#6b6f78';
      ctx.shadowBlur = 10;
      ctx.arc(p.x, p.y, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    const color = ownerColor(node.owner);

    // capture glitch flash
    if (node.captureFlashT > 0) {
      const t = node.captureFlashT;
      ctx.save();
      ctx.globalAlpha = t * 1.4;
      ['#ff3b52', '#3badff', '#ffffff'].forEach((c, i) => {
        ctx.strokeStyle = c;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x + (i - 1) * 3 * t, p.y, r + 4, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.restore();
    }

    // buffer ring
    if (node.isOwned()) {
      const ringR = r + 9;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, ringR, 0, Math.PI * 2);
      ctx.stroke();

      const frac = node.buffer / node.bufferMax;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, ringR, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      if (gameState.mainframeId === node.id && gameState.objective === 'hold') {
        this.drawHoldArc(p, ringR + 10, gameState);
      }
    }

    // tier rings — the more digits in the buffer, the more rings a node wears
    this.drawTierRings(p, r, node, color);

    // shape
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = node.owner === OWNER.NEUTRAL ? '#14161b' : `${color}22`;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = node.owner === OWNER.NEUTRAL ? 2 : 8 + node.tier * 4;
    ctx.lineWidth = 1.5 + node.tier * 0.5;
    this.drawShape(node.type, r);
    ctx.restore();

    // buffer number
    ctx.save();
    ctx.fillStyle = 'rgba(230,232,236,0.9)';
    ctx.font = `${10 + node.tier}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(Math.floor(node.buffer).toString(), p.x, p.y + r + 22 + node.tier);
    ctx.restore();

    if (input && input.hoverNodeId === node.id) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawTierRings(center, r, node, color) {
    if (node.tier <= 1) return;
    const ctx = this.ctx;
    ctx.save();
    for (let i = 0; i < node.tier - 1; i++) {
      const ringR = r + 3 + i * 4;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.5 - i * 0.15;
      ctx.lineWidth = 1;
      if (node.tier >= 3) {
        ctx.setLineDash([2, 3]);
        ctx.lineDashOffset = this.time * (i % 2 === 0 ? 12 : -12);
      }
      ctx.beginPath();
      ctx.arc(center.x, center.y, ringR, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawShape(type, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    if (type === 'workstation') {
      ctx.rect(-r * 0.6, -r * 0.6, r * 1.2, r * 1.2);
    } else if (type === 'server') {
      ctx.rect(-r * 0.5, -r * 0.75, r, r * 1.5);
    } else if (type === 'router') {
      for (let i = 0; i < 6; i++) {
        const a = deg(i * 60 - 90);
        const x = Math.cos(a) * r * 0.7;
        const y = Math.sin(a) * r * 0.7;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    } else if (type === 'firewall') {
      ctx.rect(-r * 0.65, -r * 0.65, r * 1.3, r * 1.3);
    } else if (type === 'mainframe') {
      ctx.rect(-r * 0.55, -r * 0.85, r * 1.1, r * 1.7);
    }
    ctx.fill();
    ctx.stroke();

    if (type === 'server') {
      ctx.beginPath();
      ctx.moveTo(-r * 0.35, -r * 0.2);
      ctx.lineTo(r * 0.35, -r * 0.2);
      ctx.moveTo(-r * 0.35, r * 0.15);
      ctx.lineTo(r * 0.35, r * 0.15);
      ctx.stroke();
    } else if (type === 'router') {
      for (let i = 0; i < 3; i++) {
        const a = deg(-90 + (i - 1) * 35);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15);
        ctx.stroke();
      }
    } else if (type === 'firewall') {
      ctx.beginPath();
      for (let i = 1; i < 3; i++) {
        const off = -r * 0.65 + (i * r * 1.3) / 3;
        ctx.moveTo(off, -r * 0.65);
        ctx.lineTo(off, r * 0.65);
        ctx.moveTo(-r * 0.65, off);
        ctx.lineTo(r * 0.65, off);
      }
      ctx.stroke();
    } else if (type === 'mainframe') {
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        ctx.moveTo(i * r * 0.3, -r * 0.7);
        ctx.lineTo(i * r * 0.3, r * 0.7);
      }
      ctx.stroke();
    }
  }

  drawHoldArc(center, radius, gameState) {
    const ctx = this.ctx;
    const frac = gameState.holdProgress / gameState.holdDuration;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,220,80,0.9)';
    ctx.shadowColor = '#ffdc50';
    ctx.shadowBlur = 8;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawTraceStrike(gameState) {
    if (!gameState.traceStrikeEvent) return;
    const node = gameState.nodes.get(gameState.traceStrikeEvent.nodeId);
    if (!node) return;
    const p = this.pos(node.id);
    if (!p) return;
    const ctx = this.ctx;
    const alpha = Math.min(1, gameState.traceStrikeEvent.t);
    ctx.save();
    ctx.strokeStyle = `rgba(255,60,60,${alpha})`;
    ctx.lineWidth = 3;
    ctx.shadowColor = '#ff3c3c';
    ctx.shadowBlur = 20;
    const r = this.radius(node) + 20 + (1 - alpha) * 30;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
