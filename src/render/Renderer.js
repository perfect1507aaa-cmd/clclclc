import { OWNER, CABLE_BASE_BANDWIDTH, UPGRADE_MAX_LEVEL } from '../core/constants.js';
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

const BRANCH_COLOR = {
  cpu: '#ffd23b',
  ram: '#3bff8a',
  nic: '#ff9d3b',
  ice: '#3bd6ff',
};
const BRANCH_LABEL = { cpu: 'CPU', ram: 'RAM', nic: 'NIC', ice: 'ICE' };
const BRANCH_ANGLE = { cpu: -90, ram: 0, nic: 90, ice: 180 };

const TYPE_RADIUS = {
  workstation: 16,
  server: 20,
  router: 19,
  firewall: 20,
  mainframe: 27,
};

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
    this.menuGeom = null;
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
    return TYPE_RADIUS[node.type] || 16;
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

  hitTestUpgradeMenu(sx, sy) {
    if (!this.menuGeom) return null;
    const { center } = this.menuGeom;
    const dx = sx - center.x;
    const dy = sy - center.y;
    const dist = Math.hypot(dx, dy);
    for (const sector of this.menuGeom.sectors) {
      if (dist < sector.rInner || dist > sector.rOuter) continue;
      let a = (Math.atan2(dy, dx) * 180) / Math.PI;
      let lo = sector.startAngle;
      let hi = sector.endAngle;
      // normalize a into [lo, lo+360)
      while (a < lo) a += 360;
      while (a >= lo + 360) a -= 360;
      if (a >= lo && a <= hi) return sector.branch;
    }
    return null;
  }

  render(gameState, input, dt) {
    this.time += dt;
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = COLOR.bg;
    ctx.fillRect(0, 0, this.w, this.h);

    this.drawEdges(gameState);
    this.drawDragLine(gameState, input);
    this.drawNodes(gameState, input);
    this.drawTraceStrike(gameState);

    this.effects.draw(ctx, this.w, this.h);
    ctx.restore();
  }

  // ---- edges ---------------------------------------------------------

  drawEdges(gameState) {
    const ctx = this.ctx;
    for (const edge of gameState.edges) {
      const a = gameState.nodes.get(edge.a);
      const b = gameState.nodes.get(edge.b);
      const pa = this.pos(edge.a);
      const pb = this.pos(edge.b);
      if (!pa || !pb) continue;

      ctx.save();
      if (edge.dashed) {
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = 'rgba(120,128,140,0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
        ctx.restore();
        continue;
      }

      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(120,128,140,0.28)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();

      const bw = edge.bandwidth(gameState.nodes) || CABLE_BASE_BANDWIDTH;
      const widthFor = (flow) => 1.5 + Math.min(1, flow / bw) * 5;

      const collisionPt = edge.collision
        ? { x: pa.x + (pb.x - pa.x) * edge.collision.ratio, y: pa.y + (pb.y - pa.y) * edge.collision.ratio }
        : null;

      if (edge.flowAB > 0) {
        const end = collisionPt || pb;
        this.beam(pa, end, ownerColor(a.owner), widthFor(edge.flowAB));
      }
      if (edge.flowBA > 0) {
        const end = collisionPt || pa;
        this.beam(pb, end, ownerColor(b.owner), widthFor(edge.flowBA));
      }
      if (collisionPt) {
        const net = edge.flowAB - edge.flowBA;
        if (Math.abs(net) > 0.001) {
          const winner = net > 0 ? a : b;
          const target = net > 0 ? pb : pa;
          this.beam(collisionPt, target, ownerColor(winner.owner), widthFor(Math.abs(net) * 0.7));
        }
        const flash = 0.55 + 0.45 * Math.sin(this.time * 14) * 0.5 + edge.collisionFlash * 0.4;
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

  beam(from, to, color, width) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.9;
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

  // ---- nodes ----------------------------------------------------------

  drawNodes(gameState, input) {
    this.menuGeom = null;
    for (const node of gameState.nodes.values()) {
      this.drawNode(gameState, node, input);
    }
    if (input && input.selectedNodeId) {
      const node = gameState.nodes.get(input.selectedNodeId);
      if (node && node.isOwned()) this.drawUpgradeMenu(node);
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

      this.drawUpgradeTicks(p, ringR + 7, node, color);

      if (gameState.mainframeId === node.id && gameState.objective === 'hold') {
        this.drawHoldArc(p, ringR + 15, gameState);
      }
    }

    // shape
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = node.owner === OWNER.NEUTRAL ? '#14161b' : `${color}22`;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = node.owner === OWNER.NEUTRAL ? 2 : 10;
    ctx.lineWidth = 2;
    this.drawShape(node.type, r);
    ctx.restore();

    // labels: buffer / hardware level count
    const hwLevels = node.upgrades.cpu + node.upgrades.ram + node.upgrades.nic + node.upgrades.ice;
    ctx.save();
    ctx.fillStyle = 'rgba(230,232,236,0.85)';
    ctx.font = '11px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(Math.floor(node.buffer).toString(), p.x, p.y + r + 24);
    if (hwLevels > 0) {
      ctx.fillStyle = 'rgba(180,185,195,0.6)';
      ctx.font = '9px "Courier New", monospace';
      ctx.fillText(`hw ${hwLevels}`, p.x, p.y + r + 35);
    }
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

  drawUpgradeTicks(center, radius, node, ownerCol) {
    const ctx = this.ctx;
    ctx.save();
    for (const branch of ['cpu', 'ram', 'nic', 'ice']) {
      const level = node.upgrades[branch];
      const centerAngle = BRANCH_ANGLE[branch];
      for (let i = 0; i < UPGRADE_MAX_LEVEL; i++) {
        const a = deg(centerAngle + (i - 1) * 9);
        const x1 = center.x + Math.cos(a) * radius;
        const y1 = center.y + Math.sin(a) * radius;
        const x2 = center.x + Math.cos(a) * (radius + 5);
        const y2 = center.y + Math.sin(a) * (radius + 5);
        const lit = i < level;
        ctx.strokeStyle = lit ? BRANCH_COLOR[branch] : 'rgba(255,255,255,0.15)';
        ctx.shadowColor = lit ? BRANCH_COLOR[branch] : 'transparent';
        ctx.shadowBlur = lit ? 6 : 0;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }
    void ownerCol;
    ctx.restore();
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

  drawUpgradeMenu(node) {
    const ctx = this.ctx;
    const center = this.pos(node.id);
    const r = this.radius(node);
    const rInner = r + 34;
    const rOuter = rInner + 46;
    const sectors = [];

    ctx.save();
    for (const branch of ['cpu', 'ram', 'nic', 'ice']) {
      const centerAngle = BRANCH_ANGLE[branch];
      const startAngle = centerAngle - 36;
      const endAngle = centerAngle + 36;
      const level = node.upgrades[branch];
      const maxed = level >= UPGRADE_MAX_LEVEL;
      const cost = node.upgradeCost(branch);
      const affordable = !maxed && node.buffer >= cost;
      sectors.push({ branch, startAngle, endAngle, rInner, rOuter });

      ctx.beginPath();
      ctx.arc(center.x, center.y, rOuter, deg(startAngle), deg(endAngle));
      ctx.arc(center.x, center.y, rInner, deg(endAngle), deg(startAngle), true);
      ctx.closePath();
      ctx.fillStyle = maxed
        ? 'rgba(255,255,255,0.05)'
        : affordable
        ? `${BRANCH_COLOR[branch]}33`
        : 'rgba(255,255,255,0.04)';
      ctx.strokeStyle = maxed ? 'rgba(255,255,255,0.2)' : BRANCH_COLOR[branch];
      ctx.lineWidth = 1.5;
      ctx.shadowColor = affordable ? BRANCH_COLOR[branch] : 'transparent';
      ctx.shadowBlur = affordable ? 10 : 0;
      ctx.fill();
      ctx.stroke();

      const midA = deg(centerAngle);
      const midR = (rInner + rOuter) / 2;
      const tx = center.x + Math.cos(midA) * midR;
      const ty = center.y + Math.sin(midA) * midR;
      ctx.shadowBlur = 0;
      ctx.fillStyle = affordable ? '#fff' : 'rgba(255,255,255,0.5)';
      ctx.font = 'bold 11px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(BRANCH_LABEL[branch], tx, ty - 6);
      ctx.font = '9px "Courier New", monospace';
      ctx.fillText(maxed ? 'MAX' : `Lv${level}>${level + 1}`, tx, ty + 6);
      ctx.fillText(maxed ? '' : `-${cost}`, tx, ty + 17);
    }
    ctx.restore();

    this.menuGeom = { center, sectors, nodeId: node.id };
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
