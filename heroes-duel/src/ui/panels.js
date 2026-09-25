// DOM UI: deployment tray, initiative strip, action bar, combat log, tooltip,
// creature card, bestiary and the end-of-battle overlay.
import { CREATURES, TIERS, VARIANT_LABEL } from '../data/haven.js';
import { ABILITIES } from '../data/abilities.js';
import { SIDES } from '../data/duel.js';
import { portrait } from './portraits.js';

const $ = (sel) => document.querySelector(sel);
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dmgText = (d) => (d[0] === d[1] ? `${d[0]}` : `${d[0]}–${d[1]}`);

function statRows(def, unit) {
  const rows = [
    ['Атака', def.attack],
    ['Защита', unit?.defending ? `${def.defense} <em>+30%</em>` : def.defense],
    ['Урон', dmgText(def.dmg)],
    ['Здоровье', unit ? `${unit.topHp} / ${def.hp}` : def.hp],
    ['Скорость', def.speed],
    ['Инициатива', def.initiative],
  ];
  if (def.shots) rows.push(['Выстрелы', unit ? `${unit.shots} / ${def.shots}` : def.shots]);
  if (def.mana) rows.push(['Мана', def.mana]);
  rows.push(['Прирост', `${def.growth} / нед.`]);
  const cost = [`<span class="res gold"></span>${def.cost.gold}`];
  if (def.cost.crystal) cost.push(`<span class="res crystal"></span>${def.cost.crystal}`);
  rows.push(['Стоимость', cost.join(' ')]);
  return rows;
}

function creatureCardHTML(id, unit) {
  const d = CREATURES[id];
  const stats = statRows(d, unit).map(([k, v]) => `<div class="st"><span>${k}</span><b>${v}</b></div>`).join('');
  const abil = d.abilities.map((a) => {
    const ab = ABILITIES[a];
    const spells = a === 'caster' && d.spells.length ? `<div class="spells">Заклинания: ${d.spells.map(esc).join(', ')}</div>` : '';
    const todo = ab.combat ? '' : '<i class="todo">в бою пока не действует</i>';
    return `<li><b>${esc(ab.name)}</b><span>${esc(ab.desc)}</span>${spells}${todo}</li>`;
  }).join('');
  const inBattle = unit
    ? `<div class="battle-line" style="--team:${SIDES[unit.side].color}"><span>${SIDES[unit.side].name}</span><span>В отряде: <b>${unit.count}</b></span></div>`
    : '';
  return `
    <div class="card-head">
      <img src="${portrait(id)}" alt="">
      <div>
        <div class="card-name">${esc(d.name)}</div>
        <div class="card-en">${esc(d.nameEn)}</div>
        <div class="badges">
          <span class="badge tier">Уровень ${d.tier}</span>
          <span class="badge v-${d.variant}">${VARIANT_LABEL[d.variant]}</span>
        </div>
      </div>
    </div>
    ${inBattle}
    <div class="stats">${stats}</div>
    <ul class="abilities">${abil}</ul>`;
}

export function createUI(h) {
  const tip = $('#tooltip');
  const card = $('#card');
  const bestiary = $('#bestiary');

  // ── Top bar ──
  $('#btn-grid').addEventListener('click', (e) => e.currentTarget.classList.toggle('on', h.onToggleGrid()));
  $('#btn-camera').addEventListener('click', h.onResetCamera);
  $('#btn-mode').addEventListener('click', h.onToggleMode);
  $('#card-close').addEventListener('click', () => card.classList.add('hidden'));

  // ── Deployment tray ──
  $('#btn-deploy-default').addEventListener('click', h.onDeployDefault);
  $('#btn-fight').addEventListener('click', h.onFight);

  // ── Battle actions ──
  $('#btn-wait').addEventListener('click', h.onWait);
  $('#btn-defend').addEventListener('click', h.onDefend);
  $('#btn-again').addEventListener('click', h.onRestart);

  // ── Bestiary ──
  const body = $('#bestiary-body');
  const detail = $('#bestiary-detail');
  body.innerHTML = TIERS.map((ids, i) => `
    <div class="tier-row">
      <div class="tier-num">${i + 1}</div>
      ${ids.map((id) => {
        const d = CREATURES[id];
        return `<button class="beast" data-id="${id}">
          <img src="${portrait(id)}" alt="">
          <span class="beast-name">${esc(d.name)}</span>
          <span class="beast-stats">⚔${d.attack} 🛡${d.defense} ❤${d.hp} 👣${d.speed} ⚡${d.initiative}</span>
          <span class="badge v-${d.variant}">${VARIANT_LABEL[d.variant]}</span>
        </button>`;
      }).join('')}
    </div>`).join('');
  const showBeast = (id) => {
    detail.innerHTML = creatureCardHTML(id);
    body.querySelectorAll('.beast').forEach((b) => b.classList.toggle('active', b.dataset.id === id));
  };
  body.querySelectorAll('.beast').forEach((b) => b.addEventListener('click', () => showBeast(b.dataset.id)));
  showBeast(TIERS[0][0]);
  $('#btn-bestiary').addEventListener('click', () => bestiary.classList.remove('hidden'));
  $('#bestiary-close').addEventListener('click', () => bestiary.classList.add('hidden'));
  bestiary.addEventListener('click', (e) => { if (e.target === bestiary) bestiary.classList.add('hidden'); });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!bestiary.classList.contains('hidden')) bestiary.classList.add('hidden');
      else card.classList.add('hidden');
    }
  });

  const logEl = $('#log');

  return {
    setPhase({ phase, side, round, mode }) {
      document.body.dataset.phase = phase;
      const label = phase === 'deploy'
        ? `Расстановка · ${SIDES[side].name}`
        : phase === 'battle' ? `Бой · раунд ${round}` : 'Бой окончен';
      $('#phase').textContent = label;
      $('#btn-mode').textContent = mode === 'ai' ? 'Против ИИ' : '2 игрока';
    },

    renderTray(units, side, selected) {
      $('#deploy-title').innerHTML = `Расстановка: <b style="color:${SIDES[side].color}">${SIDES[side].name}</b>`;
      $('#deploy-list').innerHTML = units.map((u) => {
        const [base, up] = TIERS[u.def.tier - 1];
        const other = u.id === base ? up : base;
        return `<div class="tray-item${u === selected ? ' selected' : ''}" data-uid="${u.uid}" style="--team:${SIDES[side].color}">
          <button class="tray-pick" data-uid="${u.uid}" title="Выбрать для расстановки">
            <img src="${portrait(u.id)}" alt="">
            <span class="tray-name">${esc(u.def.name)}</span>
            <span class="tray-count">${u.count}</span>
          </button>
          <button class="tray-swap" data-uid="${u.uid}" title="Сменить на: ${esc(CREATURES[other].name)}">${u.id === base ? '▲' : '▼'} ${esc(CREATURES[other].name)}</button>
        </div>`;
      }).join('');
      document.querySelectorAll('.tray-pick').forEach((b) => b.addEventListener('click', () => h.onTrayPick(+b.dataset.uid)));
      document.querySelectorAll('.tray-swap').forEach((b) => b.addEventListener('click', () => h.onTraySwap(+b.dataset.uid)));
    },

    renderATB(forecast, currentRound) {
      let lastRound = currentRound;
      const items = [];
      forecast.forEach((f, i) => {
        if (f.round !== lastRound) {
          items.push(`<div class="atb-round">${f.round}</div>`);
          lastRound = f.round;
        }
        const u = f.unit;
        items.push(`<button class="atb-item${i === 0 ? ' now' : ''}" data-uid="${u.uid}" style="--team:${SIDES[u.side].color}" title="${esc(u.def.name)}">
          <img src="${portrait(u.id)}" alt="">
          <span class="atb-ini">${u.def.initiative}</span>
          <span class="atb-count">${u.count}</span>
        </button>`);
      });
      $('#atb-track').innerHTML = items.join('');
      document.querySelectorAll('.atb-item').forEach((b) => {
        b.addEventListener('click', () => h.onInspect(+b.dataset.uid));
        b.addEventListener('mouseenter', () => h.onHoverUid(+b.dataset.uid));
        b.addEventListener('mouseleave', () => h.onHoverUid(null));
      });
    },

    setActive(unit, { playerTurn, canWait }) {
      const el = $('#active');
      if (!unit) {
        el.innerHTML = '';
        return;
      }
      el.style.setProperty('--team', SIDES[unit.side].color);
      el.innerHTML = `<img src="${portrait(unit.id)}" alt=""><div><b>${esc(unit.def.name)}</b> × ${unit.count}<small>${playerTurn ? 'Ваш ход' : 'Ходит противник…'}</small></div>`;
      $('#btn-wait').disabled = !playerTurn || !canWait;
      $('#btn-defend').disabled = !playerTurn;
    },

    log(html) {
      const line = document.createElement('div');
      line.innerHTML = html;
      logEl.appendChild(line);
      while (logEl.children.length > 6) logEl.firstChild.remove();
    },

    clearLog() {
      logEl.innerHTML = '';
    },

    showCard(unit) {
      $('#card-body').innerHTML = creatureCardHTML(unit.id, unit);
      card.style.setProperty('--team', SIDES[unit.side].color);
      card.classList.remove('hidden');
    },

    hideCard() {
      card.classList.add('hidden');
    },

    showTooltip(html, x, y, color, caption = false) {
      if (!html) {
        tip.classList.add('hidden');
        return;
      }
      if (tip.innerHTML !== html) tip.innerHTML = html;
      tip.classList.toggle('caption', caption);
      tip.style.setProperty('--team', color || '#8a7040');
      const w = tip.offsetWidth || 220;
      const h = tip.offsetHeight || 60;
      // Caption sits just below-right of the cursor icon; flip when near the edges.
      const left = x + 20 + w > window.innerWidth - 8 ? x - w - 14 : x + 20;
      const top = y + 20 + h > window.innerHeight - 90 ? y - h - 12 : y + 20;
      tip.style.left = `${Math.max(8, left)}px`;
      tip.style.top = `${Math.max(8, top)}px`;
      tip.classList.remove('hidden');
    },

    showEnd(winner, mode) {
      const title = winner === 'draw' ? 'Ничья'
        : mode === 'ai' ? (winner === 'left' ? 'Победа!' : 'Поражение')
        : `Победили ${SIDES[winner].name.toLowerCase()}`;
      $('#end-title').textContent = title;
      $('#end-sub').textContent = winner === 'draw' ? 'Обе армии полегли.' : `На поле осталась армия: ${SIDES[winner].name.toLowerCase()}.`;
      $('#end').classList.remove('hidden');
    },

    hideEnd() {
      $('#end').classList.add('hidden');
    },
  };
}

export function unitTooltip(u) {
  const d = u.def;
  return `<b>${esc(d.name)}</b> × ${u.count}
    <div class="tip-stats">⚔ ${d.attack} · 🛡 ${d.defense} · 🗡 ${dmgText(d.dmg)} · ❤ ${u.topHp}/${d.hp} · 👣 ${d.speed} · ⚡ ${d.initiative}${d.shots ? ` · 🏹 ${u.shots}` : ''}</div>`;
}
