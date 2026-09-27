import { escapeHtml, clamp } from './util.js';
import { ROOM_CAP } from './online.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.root = $('hud');
    this.lbList = $('lb-list');
    this.statLen = $('st-len');
    this.statRank = $('st-rank');
    this.statKills = $('st-kills');
    this.net = $('netinfo');
    this.feed = $('feed');
    this.notice = $('notice');
    this.mini = $('minimap');
    this.miniCtx = this.mini.getContext('2d');
    this.lbTimer = 0;
    this.netTimer = 0;
    this.miniTimer = 0;
    this.noticeUntil = 0;
    this.fps = 60;
  }

  show(v) {
    this.root.classList.toggle('hidden', !v);
  }

  update(dt, world, player, room, ping, now) {
    this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.05;

    this.lbTimer -= dt;
    if (this.lbTimer <= 0) {
      this.lbTimer = 0.4;
      const top = world.ranked.slice(0, 10);
      let html = top
        .map((s, i) => `<li class="${s === player ? 'me' : ''}"><span class="n">${i + 1}. ${escapeHtml(s.name)}</span><span class="v">${Math.floor(s.score)}</span></li>`)
        .join('');
      if (player && player.alive) {
        const r = world.rankOf(player);
        if (r > 10) html += `<li class="me sep"><span class="n">${r}. ${escapeHtml(player.name)}</span><span class="v">${Math.floor(player.score)}</span></li>`;
      }
      this.lbList.innerHTML = html;
    }

    if (player) {
      this.statLen.textContent = Math.floor(player.score);
      const r = world.rankOf(player);
      this.statRank.textContent = r ? `${r} / ${world.snakes.length}` : '—';
      this.statKills.textContent = player.kills;
    }

    this.netTimer -= dt;
    if (this.netTimer <= 0) {
      this.netTimer = 0.5;
      this.net.innerHTML = `${escapeHtml(room.name)} · <b>${room.players}</b>/${ROOM_CAP} игроков · пинг <b class="${ping > 150 ? 'bad' : ''}">${ping}</b> мс · ${Math.round(this.fps)} fps`;
    }

    if (this.noticeUntil && now > this.noticeUntil) {
      this.notice.classList.remove('show');
      this.noticeUntil = 0;
    }

    this.miniTimer -= dt;
    if (this.miniTimer <= 0) {
      this.miniTimer = 0.1;
      this.drawMinimap(world, player);
    }
  }

  drawMinimap(world, player) {
    const c = this.mini;
    const g = this.miniCtx;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const S = c.clientWidth;
    if (c.width !== Math.round(S * dpr)) {
      c.width = c.height = Math.round(S * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, S, S);
    const k = S / world.size;
    g.fillStyle = 'rgba(255,255,255,0.28)';
    for (const s of world.snakes) {
      if (s === player) continue;
      const h = s.head;
      const r = clamp(1 + s.w * 0.1, 1, 2.5);
      g.fillRect(h.x * k - r / 2, h.y * k - r / 2, r, r);
    }
    const king = world.king;
    if (king && king !== player) {
      g.fillStyle = '#ffe53b';
      g.beginPath();
      g.arc(king.head.x * k, king.head.y * k, 3, 0, Math.PI * 2);
      g.fill();
    }
    if (player && player.alive) {
      g.fillStyle = '#fff';
      g.shadowColor = player.color;
      g.shadowBlur = 8;
      g.beginPath();
      g.arc(player.head.x * k, player.head.y * k, 3.2, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
    }
  }

  addFeed(html) {
    const el = document.createElement('div');
    el.className = 'feed-item';
    el.innerHTML = html;
    this.feed.prepend(el);
    while (this.feed.children.length > 5) this.feed.lastChild.remove();
    setTimeout(() => el.classList.add('fade'), 4500);
    setTimeout(() => el.remove(), 5500);
  }

  showNotice(text, now, dur = 2.2) {
    this.notice.textContent = text;
    this.notice.classList.add('show');
    this.noticeUntil = now + dur;
  }
}
