// Main menu & sections: Играть, Онлайн, Друзья, Скины, Настройки, Профиль.
import { h, bus, formatTime, isMobile } from '../core/util.js';
import { getProfile, saveProfile, QUALITY_PRESETS, addCoins, unlockAchievement, resetProfile } from '../core/save.js';
import { CHAPTERS, MISSIONS, missionById } from '../data/missions.js';
import { SKINS, skinById } from '../data/skins.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { audio } from '../core/audio.js';
import { backend } from '../net/backend.js';

const click = () => audio.play('ui', { bus: 'ui', volume: 0.6 });

export class Menu {
  constructor(app) {
    this.app = app;
    this.root = app.uiRoot;
    this.el = null;
    this.panel = null;
    bus.on('coins', () => this.refreshTop());
    bus.on('achievement', (id) => { const a = ACHIEVEMENTS.find((x) => x.id === id); if (a) { addCoins(a.coins); this.app.toast(`Достижение: ${a.name} (+${a.coins} ◉)`, 'ach'); } });
    bus.on('invite', (inv) => this.showInvite(inv));
  }

  show() {
    this.hide();
    const p = getProfile();
    const cp = p.progress.checkpoint;
    const item = (label, sub, fn) => h('button', { class: 'menu-item', onclick: () => { click(); fn(); } }, label, sub ? h('small', {}, sub) : '');
    this.top = h('div', { class: 'menu-top' });
    this.skinLabel = h('div', { class: 'skin-label' });
    this.el = h('div', { class: 'screen menu' },
      h('div', { class: 'menu-left' },
        h('div', { class: 'logo' }, 'METRO', h('span', {}, 'HORROR')),
        h('div', { class: 'logo-sub' }, 'ПОСЛЕДНИЙ ПОЕЗД'),
        cp ? item('Продолжить', `${missionById(cp.mission)?.title || ''} · контрольная точка`, () => this.app.startMission(cp.mission, { checkpoint: cp })) : '',
        item('Играть', 'Кампания: 4 главы, 32 миссии', () => this.openPlay()),
        item('Онлайн', 'Кооператив на двоих', () => this.openOnline()),
        item('Друзья', 'Список, заявки, приглашения', () => this.openFriends()),
        item('Скины', 'Персонажи и экипировка', () => this.openSkins()),
        item('Настройки', 'Графика, звук, управление', () => this.openSettings()),
        item('Профиль', 'Статистика и достижения', () => this.openProfile())),
      this.top, this.skinLabel,
      h('div', { class: 'menu-foot' }, 'Ассеты: Poly Haven (CC0), персонаж Mixamo/three.js · Звук синтезируется в реальном времени · v1.0'));
    this.root.append(this.el);
    this.refreshTop();
  }
  hide() { this.el?.remove(); this.el = null; this.closePanel(); }

  refreshTop() {
    if (!this.top) return;
    const p = getProfile();
    this.top.innerHTML = '';
    this.top.append(
      h('span', { class: 'pid' }, p.online.id ? `ID: ${p.online.id}` : 'офлайн'),
      h('span', { class: 'coins' }, p.coins));
    const s = skinById(p.skin);
    this.skinLabel.innerHTML = '';
    this.skinLabel.append(h('b', {}, s.name), h('span', { class: 'muted' }, p.name));
  }

  openPanel(title, body, { wide = false, onClose } = {}) {
    this.closePanel();
    if (this.el) this.el.style.display = 'none';
    const back = h('button', { class: 'btn small', onclick: () => { click(); this.closePanel(); } }, '← Назад');
    const panel = h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, back, h('h2', {}, title), h('div', { class: 'grow' }), h('span', { class: 'coins' }, getProfile().coins)), h('div', { class: 'panel-body' }, body));
    if (!wide) panel.style.maxWidth = '100%';
    this.root.append(panel);
    this.panel = panel; this.panelClose = onClose;
    this.app.input?.setMenuPanel?.(true);
  }
  closePanel() {
    if (!this.panel) return;
    this.panel.remove(); this.panel = null;
    if (this.panelClose) { const f = this.panelClose; this.panelClose = null; f(); }
    if (this.el) this.el.style.display = '';
    this.refreshTop();
  }

  // ---------------- ИГРАТЬ ----------------
  openPlay() {
    const p = getProfile();
    const body = h('div');
    const cp = p.progress.checkpoint;
    if (cp && missionById(cp.mission)) {
      const m = missionById(cp.mission);
      body.append(h('div', { class: 'card continue-card' }, h('div', {}, h('div', { class: 'muted', style: { fontSize: '12px' } }, 'ПРОДОЛЖИТЬ'), h('div', { style: { fontFamily: 'var(--font-head)', fontSize: '20px' } }, `Глава ${m.chapter} · ${m.num}. ${m.title}`)), h('button', { class: 'btn primary', onclick: () => this.app.startMission(cp.mission, { checkpoint: cp }) }, 'Продолжить')));
    }
    let idx = 0;
    for (const ch of CHAPTERS) {
      body.append(h('div', { class: 'chapter-title' }, `Глава ${ch.n} — `, h('b', {}, `«${ch.title}»`)));
      const grid = h('div', { class: 'grid mission-grid' });
      for (const m of ch.missions) {
        idx++;
        const unlocked = idx <= p.progress.unlocked || p.devUnlock;
        const done = p.progress.done[m.id];
        grid.append(h('button', { class: 'mission' + (unlocked ? '' : ' locked'), onclick: () => { click(); this.app.startMission(m.id); } },
          h('div', { class: 'num' }, `МИССИЯ ${idx}`),
          h('div', { class: 'name' }, m.title),
          h('div', { class: 'desc' }, m.desc),
          done ? h('div', { class: 'done' }, `✓ ${formatTime(done.time)}`) : ''));
      }
      body.append(grid);
    }
    this.openPanel('Кампания', body);
  }

  // ---------------- ОНЛАЙН ----------------
  openOnline() {
    const body = h('div', { class: 'col', style: { maxWidth: '720px' } });
    const coop = this.app.coop;
    const render = () => {
      body.innerHTML = '';
      if (!backend.configured) { body.append(h('div', { class: 'card' }, 'Онлайн-сервер не настроен (см. README: Supabase).')); return; }
      if (!coop.room) {
        const codeIn = h('input', { class: 'input code-input', maxlength: 6, inputmode: 'numeric', placeholder: '000000' });
        const p = getProfile();
        const missionSel = h('select', { class: 'input' }, MISSIONS.map((m, i) => h('option', { value: m.id, disabled: i + 1 > p.progress.unlocked && !p.devUnlock ? true : undefined }, `${m.chapter}.${m.num} ${m.title}`)));
        missionSel.value = MISSIONS[Math.min(MISSIONS.length - 1, Math.max(0, p.progress.unlocked - 1))].id;
        body.append(
          h('div', { class: 'card col' }, h('b', {}, 'Создать комнату'), h('div', { class: 'muted', style: { fontSize: '13px' } }, 'Вы станете хостом: монстры и задания синхронизируются от вас.'), h('div', { class: 'row' }, missionSel, h('button', { class: 'btn primary', onclick: async (e) => { e.target.disabled = true; try { await coop.host(missionSel.value); } catch (err) { this.app.toast(err.message || 'Ошибка', 'warn'); } render(); } }, 'Создать'))),
          h('div', { class: 'card col' }, h('b', {}, 'Подключиться по коду'), h('div', { class: 'row' }, codeIn, h('button', { class: 'btn primary', onclick: async (e) => { e.target.disabled = true; try { await coop.join(codeIn.value.trim()); } catch (err) { this.app.toast(err.message || 'Не удалось подключиться', 'warn'); } render(); } }, 'Войти'))),
          h('div', { class: 'muted', style: { fontSize: '12px' } }, 'Совет: пригласите друга прямо из раздела «Друзья».'));
        return;
      }
      const r = coop.room;
      const slots = h('div', { class: 'col' });
      const players = coop.players();
      for (let i = 0; i < 2; i++) {
        const pl = players[i];
        slots.append(h('div', { class: 'lobby-slot' + (pl ? ' filled' : '') }, pl ? [h('div', { class: 'friend' }, h('span', { class: 'dot on' })), h('div', { class: 'grow' }, h('div', { class: 'fn' }, pl.name + (pl.host ? ' (хост)' : '')), h('div', { class: 'fid' }, `${pl.id} · ${skinById(pl.skin).name}`)), pl.ready ? h('span', { class: 'tag on' }, 'готов') : h('span', { class: 'tag' }, 'ждёт')] : h('span', { class: 'muted' }, 'Ожидание игрока...')));
      }
      const m = missionById(r.mission);
      body.append(
        h('div', { class: 'card col', style: { alignItems: 'center' } }, h('div', { class: 'muted' }, 'КОД КОМНАТЫ'), h('div', { class: 'big-code' }, r.code), h('button', { class: 'btn small', onclick: () => { navigator.clipboard?.writeText(r.code); this.app.toast('Код скопирован'); } }, 'Копировать')),
        h('div', { class: 'card' }, h('div', { class: 'muted', style: { fontSize: '12px' } }, 'МИССИЯ'), h('div', { style: { fontFamily: 'var(--font-head)', fontSize: '20px' } }, m ? `Глава ${m.chapter} · ${m.num}. ${m.title}` : r.mission)),
        slots,
        h('div', { class: 'row' },
          coop.isHost ? h('button', { class: 'btn primary', disabled: players.length < 2 ? true : undefined, onclick: () => coop.startGame() }, players.length < 2 ? 'Нужен второй игрок' : 'Начать миссию') : h('button', { class: 'btn primary', onclick: () => { coop.setReady(!coop.ready); render(); } }, coop.ready ? 'Не готов' : 'Готов'),
          coop.isHost ? h('button', { class: 'btn', onclick: () => this.openFriends(true) }, 'Пригласить друга') : '',
          h('button', { class: 'btn', onclick: async () => { await coop.leave(); render(); } }, 'Выйти из комнаты')),
        h('div', { class: 'muted', style: { fontSize: '12px' } }, coop.status || ''));
    };
    coop.onChange = () => { if (this.panel && this.panel.dataset.k === 'online') render(); };
    render();
    this.openPanel('Онлайн', body, { onClose: () => { coop.onChange = null; } });
    this.panel.dataset.k = 'online';
  }

  // ---------------- ДРУЗЬЯ ----------------
  async openFriends(inviteMode = false) {
    const body = h('div', { class: 'col', style: { maxWidth: '720px' } });
    const p = getProfile();
    const list = h('div');
    const reqs = h('div');
    const render = (data) => {
      list.innerHTML = ''; reqs.innerHTML = '';
      const friends = data?.friends || [];
      if (data?.requests?.length) {
        reqs.append(h('div', { class: 'chapter-title' }, 'Заявки в друзья'));
        for (const r of data.requests) reqs.append(h('div', { class: 'friend' }, h('span', { class: 'dot' }), h('div', { class: 'grow' }, h('div', { class: 'fn' }, r.name), h('div', { class: 'fid' }, r.id)), h('button', { class: 'btn small primary', onclick: async () => { await backend.respondFriend(r.id, true); unlockAchievement('friend'); refresh(); } }, 'Принять'), h('button', { class: 'btn small', onclick: async () => { await backend.respondFriend(r.id, false); refresh(); } }, 'Отклонить')));
      }
      list.append(h('div', { class: 'chapter-title' }, `Друзья (${friends.length})`));
      if (!friends.length) list.append(h('div', { class: 'muted' }, 'Пока никого. Добавьте друга по его ID.'));
      for (const f of friends) {
        const status = f.online ? (f.status === 'game' ? 'в игре' : f.status === 'lobby' ? 'в лобби' : 'в сети') : 'не в сети';
        list.append(h('div', { class: 'friend' }, h('span', { class: 'dot' + (f.online ? (f.status === 'game' ? ' game' : ' on') : '') }), h('div', { class: 'grow' }, h('div', { class: 'fn' }, f.name), h('div', { class: 'fid' }, `${f.id} · ${status}`)),
          f.online ? h('button', { class: 'btn small primary', onclick: async () => { try { if (!this.app.coop.room) await this.app.coop.host(MISSIONS[Math.max(0, getProfile().progress.unlocked - 1)].id); await backend.invite(f.id, this.app.coop.room.code); this.app.toast(`Приглашение отправлено: ${f.name}`); } catch (e) { this.app.toast(e.message || 'Ошибка', 'warn'); } } }, 'Пригласить') : '',
          f.online && f.room && f.status === 'lobby' ? h('button', { class: 'btn small', onclick: async () => { try { await this.app.coop.join(f.room); this.openOnline(); } catch (e) { this.app.toast(e.message, 'warn'); } } }, 'Присоединиться') : '',
          h('button', { class: 'btn small ghost', title: 'Удалить', onclick: async () => { if (confirm(`Удалить ${f.name} из друзей?`)) { await backend.removeFriend(f.id); refresh(); } } }, '✕')));
      }
    };
    const refresh = async () => { try { render(await backend.heartbeat()); } catch (e) { list.innerHTML = ''; list.append(h('div', { class: 'muted' }, 'Нет соединения с сервером: ' + (e.message || e))); } };
    if (!backend.configured) body.append(h('div', { class: 'card' }, 'Онлайн-сервер не настроен.'));
    else {
      try { await backend.ensurePlayer(); } catch (e) { body.append(h('div', { class: 'card' }, 'Ошибка регистрации: ' + e.message)); }
      const idIn = h('input', { class: 'input', placeholder: 'ID друга, например MH-7K2Q9X', maxlength: 12, style: { textTransform: 'uppercase' } });
      body.append(
        h('div', { class: 'card row' }, h('div', { class: 'grow' }, h('div', { class: 'muted', style: { fontSize: '12px' } }, 'ВАШ ID'), h('div', { class: 'big-code', style: { fontSize: '30px', letterSpacing: '.15em' } }, p.online.id || '—')), h('button', { class: 'btn small', onclick: () => { navigator.clipboard?.writeText(p.online.id); this.app.toast('ID скопирован'); } }, 'Копировать')),
        h('div', { class: 'card row' }, idIn, h('button', { class: 'btn primary', onclick: async () => { try { await backend.addFriend(idIn.value.trim().toUpperCase()); this.app.toast('Заявка отправлена'); unlockAchievement('friend'); idIn.value = ''; refresh(); } catch (e) { this.app.toast(e.message || 'Ошибка', 'warn'); } } }, 'Добавить')),
        reqs, list);
      refresh();
      this.friendsTimer = setInterval(refresh, 8000);
    }
    void inviteMode;
    this.openPanel('Друзья', body, { onClose: () => clearInterval(this.friendsTimer) });
  }

  showInvite(inv) {
    if (this.app.game) { this.app.toast(`${inv.name} приглашает вас в кооператив (код ${inv.room})`); return; }
    const el = h('div', { class: 'invite-pop' }, h('b', {}, 'Приглашение'), h('p', { style: { fontSize: '14px' } }, `${inv.name} зовёт вас в кооператив.`),
      h('div', { class: 'row' }, h('button', { class: 'btn small primary', onclick: async () => { el.remove(); try { await this.app.coop.join(inv.room); this.openOnline(); } catch (e) { this.app.toast(e.message, 'warn'); } } }, 'Принять'), h('button', { class: 'btn small', onclick: () => el.remove() }, 'Отклонить')));
    this.root.append(el);
    audio.play('pickup', { bus: 'ui' });
    setTimeout(() => el.remove(), 30000);
  }

  // ---------------- СКИНЫ ----------------
  openSkins() {
    const p = getProfile();
    const list = h('div', { class: 'grid skin-grid' });
    const render = () => {
      list.innerHTML = '';
      for (const s of SKINS) {
        const owned = p.skins.includes(s.id);
        const sel = p.skin === s.id;
        const locked = s.unlock === 'ending' && !owned;
        list.append(h('div', { class: 'skin' + (sel ? ' sel' : '') },
          h('div', { class: 'sw', style: { background: `linear-gradient(135deg, ${s.swatch} 0%, #0b0b0b 120%)` } }),
          h('div', { class: 'nm' }, s.name), h('div', { class: 'ds' }, s.desc),
          h('div', { class: 'row' },
            h('button', { class: 'btn small', onclick: () => { this.app.menuScene?.setSkin(s.id); } }, 'Примерить'),
            owned ? h('button', { class: 'btn small' + (sel ? ' primary' : ''), onclick: () => { p.skin = s.id; saveProfile(); this.app.menuScene?.setSkin(s.id); this.app.coop?.updateSkin?.(); render(); click(); } }, sel ? 'Выбран' : 'Выбрать')
              : locked ? h('span', { class: 'tag' }, 'за хорошую концовку')
                : h('button', { class: 'btn small primary', disabled: p.coins < s.price ? true : undefined, onclick: () => { if (p.coins < s.price) return; p.coins -= s.price; p.skins.push(s.id); p.skin = s.id; saveProfile(true); this.app.menuScene?.setSkin(s.id); audio.play('pickup', { bus: 'ui' }); if (p.skins.length >= 4) unlockAchievement('fashion'); render(); this.refreshTop(); } }, `Купить · ${s.price} ◉`))));
      }
    };
    render();
    const body = h('div', { class: 'skins-layout' }, h('div', { class: 'list' }, list), h('div', { class: 'preview' }));
    this.openPanel('Скины', body, { onClose: () => this.app.menuScene?.setSkin(getProfile().skin) });
    this.panel.style.background = 'linear-gradient(90deg, rgba(5,6,7,.95) 0%, rgba(5,6,7,.85) 50%, rgba(5,6,7,0) 75%)';
  }

  // ---------------- НАСТРОЙКИ ----------------
  openSettings(inGame = false) {
    const body = this.settingsBody(inGame);
    this.openPanel('Настройки', body);
  }
  settingsBody(inGame = false) {
    const p = getProfile();
    const s = p.settings;
    const wrap = h('div', { style: { maxWidth: '760px' } });
    const tabs = h('div', { class: 'tabs' });
    const content = h('div');
    const TABS = [['g', 'Графика'], ['a', 'Звук'], ['c', 'Управление'], ['i', 'Интерфейс']];
    let cur = 'g';
    const apply = () => { saveProfile(); this.app.engine.applyQuality(); audio.applyVolumes(); };
    const range = (label, get, set, min, max, step, fmt = (v) => v) => {
      const val = h('span', { class: 'val' }, fmt(get()));
      const inp = h('input', { type: 'range', min, max, step, value: get() });
      inp.addEventListener('input', () => { set(+inp.value); val.textContent = fmt(+inp.value); });
      inp.addEventListener('change', apply);
      return h('div', { class: 'set-row' }, h('label', {}, label), inp, val);
    };
    const toggle = (label, get, set) => { const b = h('button', { class: 'switch' + (get() ? ' on' : '') }); b.onclick = () => { set(!get()); b.classList.toggle('on', get()); apply(); click(); }; return h('div', { class: 'set-row' }, h('label', {}, label), h('div', {}, b), h('span')); };
    const seg = (label, options, get, set) => { const el = h('div', { class: 'seg' }); const rerender = () => { el.innerHTML = ''; for (const [v, t] of options) el.append(h('button', { class: get() === v ? 'active' : '', onclick: () => { set(v); rerender(); apply(); click(); render(); } }, t)); }; rerender(); return h('div', { class: 'set-row' }, h('label', {}, label), el, h('span')); };
    const custom = () => (s.custom ||= {});
    const qv = (k) => (s.custom && s.custom[k] !== undefined ? s.custom[k] : QUALITY_PRESETS[s.quality][k]);
    const render = () => {
      content.innerHTML = '';
      if (cur === 'g') {
        content.append(
          seg('Качество', Object.entries(QUALITY_PRESETS).map(([k, v]) => [k, v.label]), () => s.quality, (v) => { s.quality = v; s.custom = null; }),
          range('Разрешение рендера', () => Math.round(qv('resolution') * 100), (v) => (custom().resolution = v / 100), 35, 100, 5, (v) => v + '%'),
          seg('Тени', [[0, 'Выкл'], [1, 'Фонарь'], [2, '+1 лампа'], [3, '+2 лампы']], () => qv('shadows'), (v) => (custom().shadows = v)),
          seg('Размер карты теней', [[512, '512'], [1024, '1024'], [2048, '2048']], () => qv('shadowSize'), (v) => (custom().shadowSize = v)),
          range('Источники света', () => qv('lights'), (v) => (custom().lights = v), 1, 12, 1),
          range('Дальность прорисовки', () => qv('drawDistance'), (v) => (custom().drawDistance = v), 25, 120, 5, (v) => v + ' м'),
          range('Частицы и пыль', () => Math.round(qv('particles') * 100), (v) => (custom().particles = v / 100), 0, 150, 10, (v) => v + '%'),
          toggle('Пост-обработка (цветокоррекция)', () => qv('postfx'), (v) => (custom().postfx = v)),
          toggle('Bloom (свечение)', () => qv('bloom'), (v) => (custom().bloom = v)),
          toggle('SSAO (затенение)', () => qv('ao'), (v) => (custom().ao = v)),
          toggle('Объёмный свет', () => qv('volumetric'), (v) => (custom().volumetric = v)),
          toggle('Адаптивное разрешение', () => s.adaptive, (v) => (s.adaptive = v)),
          h('div', { class: 'muted', style: { fontSize: '12px', marginTop: '10px' } }, `GPU: ${this.app.engine.gpu}`),
        );
      } else if (cur === 'a') {
        const V = s.volume;
        content.append(
          range('Общая громкость', () => Math.round(V.master * 100), (v) => (V.master = v / 100), 0, 100, 1, (v) => v + '%'),
          range('Музыка', () => Math.round(V.music * 100), (v) => (V.music = v / 100), 0, 100, 1, (v) => v + '%'),
          range('Эффекты', () => Math.round(V.sfx * 100), (v) => (V.sfx = v / 100), 0, 100, 1, (v) => v + '%'),
          range('Окружение', () => Math.round(V.ambience * 100), (v) => (V.ambience = v / 100), 0, 100, 1, (v) => v + '%'),
          range('Голос/радио', () => Math.round((V.voice ?? 1) * 100), (v) => (V.voice = v / 100), 0, 100, 1, (v) => v + '%'),
          toggle('Синтез речи для радиосообщений', () => !!s.voice, (v) => (s.voice = v)),
          h('div', { class: 'muted', style: { fontSize: '12px', marginTop: '10px' } }, 'Все звуки синтезируются процедурно, с пространственным HRTF-звуком и реверберацией тоннелей. Лучше всего в наушниках.'));
      } else if (cur === 'c') {
        content.append(
          range('Чувствительность', () => s.sensitivity, (v) => (s.sensitivity = v), 0.2, 3, 0.05, (v) => (+v).toFixed(2)),
          range('Поле зрения (FOV)', () => s.fov, (v) => (s.fov = v), 55, 100, 1, (v) => v + '°'),
          toggle('Инверсия оси Y', () => s.invertY, (v) => (s.invertY = v)),
          toggle('Покачивание камеры', () => s.headBob, (v) => (s.headBob = v)),
          toggle('Бег переключением (сенсор)', () => s.runToggle, (v) => (s.runToggle = v)),
          toggle('Присед переключением', () => s.crouchToggle, (v) => (s.crouchToggle = v)),
          toggle('Вибрация', () => s.vibration, (v) => (s.vibration = v)),
          h('div', { class: 'set-row' }, h('label', {}, 'Сенсорные кнопки'), h('button', { class: 'btn small', onclick: () => this.app.openTouchEditor() }, 'Редактор расположения'), h('span')),
          h('div', { class: 'card', style: { marginTop: '12px', fontSize: '13px', lineHeight: 1.6 } }, h('b', {}, 'Клавиатура и мышь'), h('br'), 'WASD — движение · Shift — бег · Ctrl/C — присесть · Пробел — перелезть · E/ЛКМ — действие (удерживать для долгих) · F/ПКМ — фонарь · R — сменить батарейку · H — аптечка · Q — бросить бутылку · G — фальшфейер · Esc — пауза'));
      } else {
        content.append(
          toggle('Субтитры', () => s.subtitles, (v) => (s.subtitles = v)),
          toggle('Показывать FPS и статистику рендера', () => s.showFps, (v) => (s.showFps = v)),
          h('div', { class: 'set-row' }, h('label', {}, 'Прогресс'), h('button', { class: 'btn small', onclick: () => { if (confirm('Сбросить весь прогресс, монеты и скины?')) { resetProfile(); location.reload(); } } }, 'Сбросить прогресс'), h('span')));
      }
      for (const b of tabs.children) b.classList.toggle('active', b.dataset.k === cur);
    };
    for (const [k, t] of TABS) tabs.append(h('button', { class: 'tab', 'data-k': k, onclick: () => { cur = k; render(); click(); } }, t));
    wrap.append(tabs, content);
    render();
    void inGame;
    return wrap;
  }

  // ---------------- ПРОФИЛЬ ----------------
  openProfile() {
    const p = getProfile();
    const st = p.stats;
    const nameIn = h('input', { class: 'input', value: p.name, maxlength: 18 });
    nameIn.addEventListener('change', () => { p.name = nameIn.value.trim().slice(0, 18) || 'Выживший'; saveProfile(); backend.configured && backend.rename(p.name).catch(() => {}); this.refreshTop(); });
    const done = Object.keys(p.progress.done).length;
    const body = h('div', { class: 'col', style: { maxWidth: '820px' } },
      h('div', { class: 'card row' }, h('div', { class: 'grow' }, h('div', { class: 'muted', style: { fontSize: '12px' } }, 'ИМЯ'), nameIn), h('div', {}, h('div', { class: 'muted', style: { fontSize: '12px' } }, 'ID ИГРОКА'), h('div', { style: { fontFamily: 'var(--font-head)', fontSize: '22px', letterSpacing: '.1em' } }, p.online.id || 'офлайн')), h('div', {}, h('div', { class: 'muted', style: { fontSize: '12px' } }, 'МОНЕТЫ'), h('div', { class: 'coins', style: { fontSize: '22px' } }, p.coins))),
      h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' } },
        h('div', { class: 'card' },
          h('div', { class: 'stat' }, 'Пройдено миссий', h('b', {}, `${done} / ${MISSIONS.length}`)),
          h('div', { class: 'stat' }, 'Время в игре', h('b', {}, formatTime(st.playTime))),
          h('div', { class: 'stat' }, 'Пройдено', h('b', {}, (st.distance / 1000).toFixed(2) + ' км')),
          h('div', { class: 'stat' }, 'Смертей', h('b', {}, st.deaths)),
          h('div', { class: 'stat' }, 'Кооп-миссий', h('b', {}, st.coopMissions)),
          h('div', { class: 'stat' }, 'Испугов', h('b', {}, st.scares || 0)),
          h('div', { class: 'stat' }, 'Записок найдено', h('b', {}, p.progress.notes.length)),
          h('div', { class: 'stat' }, 'Концовки', h('b', {}, `${p.progress.endings.length} / 3`)),
          h('div', { class: 'stat' }, 'Скинов', h('b', {}, `${p.skins.length} / ${SKINS.length}`))),
        h('div', { class: 'col' }, ...ACHIEVEMENTS.map((a) => h('div', { class: 'ach' + (p.achievements[a.id] ? ' got' : '') }, h('div', { class: 'ic' }, a.icon), h('div', {}, h('div', { class: 't' }, a.name), h('div', { class: 'd' }, `${a.desc} · +${a.coins} ◉`)))))));
    this.openPanel('Профиль', body);
  }
}
void isMobile;
