// DOM UI: army panels, initiative (ATB) strip, hover tooltip, creature card, bestiary.
import { CREATURES, TIERS, VARIANT_LABEL, FACTION } from '../data/haven.js';
import { ABILITIES } from '../data/abilities.js';
import { portrait } from './portraits.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function dmgText(d) {
  return d[0] === d[1] ? `${d[0]}` : `${d[0]}–${d[1]}`;
}

function costText(cost) {
  const parts = [`<span class="res gold"></span>${cost.gold}`];
  if (cost.crystal) parts.push(`<span class="res crystal"></span>${cost.crystal}`);
  return parts.join(' ');
}

export function statRows(def) {
  const rows = [
    ['Атака', def.attack],
    ['Защита', def.defense],
    ['Урон', dmgText(def.dmg)],
    ['Здоровье', def.hp],
    ['Скорость', def.speed],
    ['Инициатива', def.initiative],
  ];
  if (def.shots) rows.push(['Выстрелы', def.shots]);
  if (def.mana) rows.push(['Мана', def.mana]);
  rows.push(['Прирост', `${def.growth} / нед.`]);
  rows.push(['Стоимость', costText(def.cost)]);
  return rows;
}

export function creatureCardHTML(id, stack) {
  const d = CREATURES[id];
  const stats = statRows(d).map(([k, v]) => `<div class="st"><span>${k}</span><b>${v}</b></div>`).join('');
  const abil = d.abilities.map((a) => {
    const ab = ABILITIES[a];
    const extra = a === 'caster' && d.spells.length ? `<div class="spells">Заклинания: ${d.spells.map(esc).join(', ')}</div>` : '';
    return `<li><b>${esc(ab.name)}</b><span>${esc(ab.desc)}</span>${extra}</li>`;
  }).join('');
  const inBattle = stack
    ? `<div class="battle-line"><span>В отряде: <b>${stack.count}</b></span><span>Всего HP: <b>${stack.count * d.hp}</b></span></div>`
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

export function createUI({ units, onSelect, onHoverSlot, onToggleGrid, onResetCamera }) {
  // ── Army panels ──
  for (const side of ['left', 'right']) {
    const own = units.filter((u) => u.army.side === side);
    const army = own[0].army;
    const el = $(`#army-${side}`);
    el.innerHTML = `
      <div class="army-head" style="--team:${army.color}">
        <div class="hero-name">${esc(army.hero)}</div>
        <div class="army-sub">${esc(FACTION.name)} · ${esc(army.name)}</div>
      </div>
      <div class="slots">
        ${own.map((u) => `
          <button class="slot" data-key="${u.key}" style="--team:${army.color}">
            <img src="${portrait(u.stack.id)}" alt="">
            <span class="slot-name">${esc(u.def.name)}</span>
            <span class="slot-count">${u.stack.count}</span>
          </button>`).join('')}
      </div>`;
  }

  // ── Initiative strip ──
  const order = [...units].sort((a, b) =>
    b.def.initiative - a.def.initiative || (a.army.side === 'left' ? -1 : 1) || a.stack.row - b.stack.row);
  $('#atb').innerHTML = `<div class="atb-label">Шкала инициативы</div><div class="atb-track">${order.map((u) => `
    <button class="atb-item" data-key="${u.key}" style="--team:${u.army.color}" title="${esc(u.def.name)}">
      <img src="${portrait(u.stack.id)}" alt="">
      <span class="atb-ini">${u.def.initiative}</span>
      <span class="atb-count">${u.stack.count}</span>
    </button>`).join('')}</div>`;

  const byKey = new Map(units.map((u) => [u.key, u]));
  document.querySelectorAll('.slot, .atb-item').forEach((b) => {
    b.addEventListener('click', () => onSelect(byKey.get(b.dataset.key)));
    b.addEventListener('mouseenter', () => onHoverSlot(byKey.get(b.dataset.key)));
    b.addEventListener('mouseleave', () => onHoverSlot(null));
  });

  // ── Card ──
  const card = $('#card');
  $('#card-close').addEventListener('click', () => onSelect(null));

  // ── Tooltip ──
  const tip = $('#tooltip');

  // ── Bestiary ──
  const bestiary = $('#bestiary');
  const bestiaryBody = $('#bestiary-body');
  const bestiaryDetail = $('#bestiary-detail');
  bestiaryBody.innerHTML = TIERS.map((ids, i) => `
    <div class="tier-row">
      <div class="tier-num">${i + 1}</div>
      ${ids.map((id) => {
        const d = CREATURES[id];
        return `<button class="beast" data-id="${id}">
          <img src="${portrait(id)}" alt="">
          <span class="beast-name">${esc(d.name)}</span>
          <span class="beast-stats">⚔${d.attack} 🛡${d.defense} ❤${d.hp} ⚡${d.initiative}</span>
          <span class="badge v-${d.variant}">${VARIANT_LABEL[d.variant]}</span>
        </button>`;
      }).join('')}
    </div>`).join('');
  const showBeast = (id) => {
    bestiaryDetail.innerHTML = creatureCardHTML(id);
    bestiaryBody.querySelectorAll('.beast').forEach((b) => b.classList.toggle('active', b.dataset.id === id));
  };
  bestiaryBody.querySelectorAll('.beast').forEach((b) => b.addEventListener('click', () => showBeast(b.dataset.id)));
  showBeast(TIERS[0][0]);
  $('#btn-bestiary').addEventListener('click', () => bestiary.classList.remove('hidden'));
  $('#bestiary-close').addEventListener('click', () => bestiary.classList.add('hidden'));
  bestiary.addEventListener('click', (e) => { if (e.target === bestiary) bestiary.classList.add('hidden'); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!bestiary.classList.contains('hidden')) bestiary.classList.add('hidden');
      else onSelect(null);
    }
  });

  $('#btn-grid').addEventListener('click', (e) => {
    const on = onToggleGrid();
    e.currentTarget.classList.toggle('on', on);
  });
  $('#btn-camera').addEventListener('click', onResetCamera);

  return {
    showCard(unit) {
      document.querySelectorAll('.slot, .atb-item').forEach((b) => b.classList.toggle('selected', !!unit && b.dataset.key === unit.key));
      if (!unit) {
        card.classList.add('hidden');
        return;
      }
      $('#card-body').innerHTML = creatureCardHTML(unit.stack.id, unit.stack);
      card.style.setProperty('--team', unit.army.color);
      card.classList.remove('hidden');
    },
    showTooltip(unit, x, y) {
      document.querySelectorAll('.slot, .atb-item').forEach((b) => b.classList.toggle('hovered', !!unit && b.dataset.key === unit.key));
      if (!unit || x == null) {
        tip.classList.add('hidden');
        return;
      }
      const d = unit.def;
      tip.innerHTML = `<b>${esc(d.name)}</b> × ${unit.stack.count}
        <div class="tip-stats">⚔ ${d.attack} · 🛡 ${d.defense} · 🗡 ${dmgText(d.dmg)} · ❤ ${d.hp} · 👣 ${d.speed} · ⚡ ${d.initiative}</div>`;
      tip.style.setProperty('--team', unit.army.color);
      tip.style.left = `${x + 16}px`;
      tip.style.top = `${y + 14}px`;
      tip.classList.remove('hidden');
    },
  };
}
