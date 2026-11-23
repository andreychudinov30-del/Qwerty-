// Глава 3 — «Подземный кошмар»
import { DIR, FACE, note, item, dev, lamp, locker, body, LIDA } from './kit.js';

export const CH3 = [
  // ---------------------------------------------------------------- 17. Мёртвый город
  {
    id: 'c3m1', chapter: 3, num: 1, title: 'Мёртвый город', desc: 'Исследовать огромную подземную станцию.', reward: 340,
    size: [64, 42],
    env: { power: 'off', emergency: false, lampBroken: 0.3, fog: 0.028, battery: 90, inventory: { battery: 2 }, ambient: 0.4, director: { intensity: 1.2 } },
    map(m) {
      m.path([[0, 22], [9, 22]], '=', 2);
      m.stairs(10, 22); m.stairs(10, 23);
      m.rect(11, 6, 44, 30, 'h');
      for (let x = 15; x < 54; x += 6) for (let y = 10; y < 34; y += 6) if (Math.abs(x - 33) > 2 || Math.abs(y - 20) > 3) m.set(x, y, 'o');
      m.rect(11, 36, 44, 2, '_');
      m.door(55, 12, { id: 'dElder' }); m.room(56, 9, 6, 7, '-');
      m.door(33, 5, { id: 'downGate', type: 'gate', locked: true, noUse: true, lockText: 'Подъёмная решётка — нужно питание' });
      m.path([[33, 4], [33, 1]], '-');
      m.spot('start', 2, 22); m.spot('square', 32, 20); m.spot('down', 33, 2);
      m.spot('s1', 20, 14); m.spot('s2', 46, 28); m.spot('t1', 24, 30); m.spot('t2', 44, 10);
      dev(m, 'generator', 32, 21, 'gen', { needs: 'fuel', count: 2, needText: 'Нужно топливо', rotY: 0 });
      item(m, 16, 9, 'fuel', 1, 'fuel1'); item(m, 50, 32, 'fuel', 1, 'fuel2');
      note(m, 59, 12, 'diary', 'Дневник старосты', 'Нас было триста человек. «Площадь Свободы» стала городом: рынок, школа, больница в вагоне.\nПотом пришли первые. Тихо, ночью. Сначала пропадали дети.\nМы жгли костры — они боятся огня. Но топливо кончилось.\nГенератор на площади работает на солярке. Если кто-то найдёт канистры — зажгите свет. Пусть хоть кто-то увидит наш город.', 'Староста Игнат');
      note(m, 28, 25, 'n_school', 'Детский рисунок', 'На рисунке — поезд, солнце и человечки. Подпись детским почерком: «мы поедем наверх».');
      item(m, 38, 14, 'battery', 1, 'b1'); item(m, 22, 26, 'medkit', 1, 'm1'); item(m, 44, 22, 'flare', 1, 'f1'); item(m, 18, 30, 'bottle', 1, 'bt');
    },
    start: 'start', startYaw: DIR.E,
    monsters: [{ kind: 'shadow', spot: 's1', wander: 10 }, { kind: 'shadow', spot: 's2', wander: 10 }, { kind: 'turned', spot: 't1', wander: 10 }, { kind: 'turned', spot: 't2', wander: 10 }],
    steps: [
      { type: 'reach', spot: 'square', r: 4, text: 'Исследуйте мёртвый город', sub: 'Станция «Площадь Свободы» — когда-то здесь жили люди', on: [['think', 'Палатки, лачуги, костры... Целый город под землёй. И ни души.', 5]] },
      { type: 'read', note: 'diary', text: 'Найдите дневник старосты', hint: 'Дом старосты у восточной стены' },
      { type: 'collect', item: 'fuel', count: 2, text: 'Найдите топливо для генератора (2)', hint: 'Канистры в северо-западном и юго-восточном углах' },
      { type: 'use', id: 'gen', text: 'Запустите генератор на площади', hold: 1.5, done: [['power', 'on'], ['say', 'Свет... Город снова видно. Боже, сколько их здесь было...', 5, 'Вы'], ['door', 'downGate', 'open']] },
      { type: 'reach', spot: 'down', r: 2.5, text: 'Найдите спуск вниз (север)', done: [['complete']] },
    ],
  },
  // ---------------------------------------------------------------- 18. Исчезнувшие
  {
    id: 'c3m2', chapter: 3, num: 2, title: 'Исчезнувшие', desc: 'Найти следы пропавших людей.', reward: 340,
    size: [58, 34],
    env: { power: 'on', lampBroken: 0.5, lampFlicker: 0.35, fog: 0.045, battery: 85, inventory: { battery: 1 }, director: { intensity: 1.3 } },
    map(m) {
      m.tunnel([[2, 20], [54, 20]]);
      for (const [x, i] of [[6, 1], [22, 2], [38, 3]]) { m.room(x, 11, 8, 7, 'k'); m.door(x + 3, 18, { id: 'dn' + i }); m.stairs(x + 3, 19); }
      for (const [x, i] of [[14, 4], [30, 5], [46, 6]]) { m.stairs(x + 3, 22); m.door(x + 3, 23, { id: 'ds' + i }); m.room(x, 24, 8, 7, i === 6 ? '-' : 'k'); }
      m.spot('start', 3, 20); m.spot('exit', 54, 20); m.spot('t1', 14, 21); m.spot('t2', 34, 20); m.spot('t3', 25, 14); m.spot('sh', 44, 21);
      const B = [[8, 13, 'b1', 'Детская кукла без глаз. На спине вышито: «Маша, 6 лет».'], [26, 14, 'b2', 'Очки и раскрытая Библия. Подчёркнуто: «и тьма не объяла его».'], [42, 15, 'b3', 'Гитара с порванными струнами. Внутри записка: «Ушёл вниз за Машей».'], [17, 28, 'b4', 'Окровавленная куртка МЕТРОСТРОЙ. В кармане — пропуск на «Глубину».'], [33, 27, 'b5', 'Самодельная рация. Последняя запись: «Они зовут нас голосами наших близких»']];
      for (const [x, y, id, text] of B) dev(m, 'device', x, y, id, { prompt: 'Осмотреть вещи', text, who: 'Находка' });
      note(m, 50, 27, 'missingList', 'Список ушедших', 'Список жителей, ушедших вниз 3 октября:\nВолковы (4 чел.), Маша Ильина, отец Сергий, Гена-гитарист, бригада Метростроя (7 чел.)\nВсе ушли на голос. Сказали — там тепло и светло.\nНикто не вернулся. Кроме того, что вернулось.', 'Староста');
      locker(m, 7, 12, FACE.S); locker(m, 31, 29, FACE.N);
      item(m, 24, 12, 'battery', 1, 'b6'); item(m, 48, 28, 'medkit', 1, 'm1'); item(m, 12, 21, 'bottle', 1, 'bt');
    },
    start: 'start', startYaw: DIR.E,
    monsters: [{ kind: 'turned', spot: 't1', wander: 6 }, { kind: 'turned', spot: 't2', wander: 8 }, { kind: 'turned', spot: 't3', wander: 4 }, { kind: 'shadow', spot: 'sh', wander: 8 }],
    steps: [
      { type: 'use', ids: ['b1', 'b2', 'b3', 'b4', 'b5'], text: 'Найдите вещи пропавших (5)', sub: 'Жилые блоки вдоль тоннеля', on: [['think', 'Здесь жили люди. Их вещи брошены, будто все ушли в спешке.', 4.5]] },
      { type: 'read', note: 'missingList', text: 'Найдите список жителей', hint: 'Последний блок на юго-востоке' },
      { type: 'reach', spot: 'exit', r: 3, text: 'Идите дальше на восток', on: [['scare', 'whisper'], ['say', 'Ни-ки-та... иди к нам...', 3, '???']], done: [['complete']] },
    ],
  },
  // ---------------------------------------------------------------- 19. Тишина
  {
    id: 'c3m3', chapter: 3, num: 3, title: 'Тишина', desc: 'Пройти территорию слепых существ без шума.', reward: 380,
    size: [60, 40],
    env: { power: 'off', emergency: false, fog: 0.04, battery: 90, inventory: { battery: 1, bottle: 2 }, noiseMeter: true, director: { intensity: 0.4, silhouettes: false } },
    map(m, rng) {
      m.path([[0, 18], [5, 18]], '-', 2);
      m.rect(6, 6, 48, 28, 'c');
      const keep = [[6, 18], [30, 20], [53, 19], [12, 10], [44, 28], [20, 26], [38, 12]];
      for (let i = 0; i < 30; i++) {
        const x = 9 + Math.floor(rng.next() * 42), y = 8 + Math.floor(rng.next() * 23);
        if (keep.some(([kx, ky]) => Math.abs(kx - x) < 4 && Math.abs(ky - y) < 4)) continue;
        m.rect(x, y, 2, 2, '#');
      }
      m.door(54, 19, { id: 'exitGate', type: 'gate', locked: true, key: 'key_bunker' });
      m.path([[55, 19], [59, 19]], '-');
      m.spot('start', 1, 18); m.spot('exit', 57, 19); m.spot('keyspot', 30, 20);
      m.spot('b1', 14, 12); m.spot('b2', 44, 28); m.spot('b3', 38, 12); m.spot('b4', 20, 26);
      body(m, 30, 20, 'keyBody', { item: 'key_bunker', text: 'Он полз к выходу... Ключ от бункерных ворот.', skin: 'stalker' });
      item(m, 12, 10, 'bottle', 2, 'bt1'); item(m, 44, 26, 'bottle', 1, 'bt2'); item(m, 22, 30, 'medkit', 1, 'm1');
      note(m, 7, 19, 'n_silence', 'Нацарапано на стене', 'СЛЕПЫЕ. НЕ ШУМИ.\nПригнись — шаги тише.\nБрось бутылку — они пойдут на звон.\nЕсли один рядом — замри.');
    },
    start: 'start', startYaw: DIR.E,
    monsters: [{ kind: 'blind', spot: 'b1', patrol: ['b1', 'b3'] }, { kind: 'blind', spot: 'b2', patrol: ['b2', 'b4'] }, { kind: 'blind', spot: 'b3', wander: 10 }],
    steps: [
      { type: 'collect', item: 'key_bunker', text: 'Найдите ключ от ворот, не издавая звуков', sub: 'Слепые слышат каждый шаг. Приседайте [Ctrl/C]', hint: 'Тело в центре пещеры', on: [['radio', 'Это территория слепых. Они слышат всё. Двигайся пригнувшись и не беги...', 6, LIDA]] },
      { type: 'reach', spot: 'exit', r: 2.5, text: 'Доберитесь до ворот бункера (восток)', done: [['complete']] },
    ],
  },
  // ---------------------------------------------------------------- 20. Старый бункер
  {
    id: 'c3m4', chapter: 3, num: 4, title: 'Старый бункер', desc: 'Запустить резервный генератор.', reward: 380,
    size: [56, 42],
    env: { power: 'off', emergency: true, fog: 0.045, battery: 80, inventory: { battery: 1 }, director: { intensity: 1 } },
    map(m) {
      m.path([[2, 22], [50, 22]], 'k', 2);
      for (const [x, i] of [[6, 1], [22, 2], [38, 3]]) { m.room(x, 8, 10, 8, 'k'); m.path([[x + 4, 16], [x + 4, 21]], 'k'); m.door(x + 4, 17, { id: 'dr' + i, metal: true }); }
      m.room(18, 28, 18, 10, 'k'); m.path([[26, 24], [26, 27]], 'k'); m.door(26, 26, { id: 'hGen', type: 'hermetic', open: true });
      m.room(44, 28, 8, 8, 'k'); m.path([[47, 24], [47, 27]], 'k'); m.door(47, 26, { id: 'hComm', type: 'hermetic', locked: true, noUse: true, lockText: 'Гермодверь обесточена' });
      m.spot('start', 3, 22); m.spot('comm', 48, 31); m.spot('t1', 10, 11); m.spot('t2', 42, 12); m.spot('c1', 27, 33);
      item(m, 9, 10, 'fuel', 1, 'f1'); item(m, 28, 13, 'fuel', 1, 'f2'); item(m, 44, 9, 'fuel', 1, 'f3'); item(m, 40, 14, 'wire', 1, 'w1');
      dev(m, 'device', 21, 29, 'starter', { needs: 'wire', needText: 'Нужен кабель для стартера', prompt: 'Подключить стартер', hold: 1.5, rotY: FACE.S, oz: -0.6 });
      dev(m, 'generator', 27, 33, 'gen', { needs: 'fuel', count: 3, needText: 'Нужно топливо', requiresFlag: 'wired', requiresText: 'Стартер не подключён' });
      note(m, 24, 10, 'n_bunker', 'Плакат ГО (подпись от руки)', 'Резервный генератор Д-12. Запуск: 1) залить 3 канистры; 2) подключить стартер кабелем; 3) запустить.\nПосле запуска гермодвери узла связи откроются автоматически.');
      locker(m, 7, 9, FACE.S); locker(m, 23, 9, FACE.S); locker(m, 35, 30, FACE.W);
      item(m, 12, 14, 'medkit', 1, 'm1'); item(m, 46, 23, 'battery', 1, 'b1');
    },
    start: 'start', startYaw: DIR.E,
    monsters: [{ kind: 'turned', spot: 't1', wander: 5 }, { kind: 'turned', spot: 't2', wander: 5 }, { kind: 'crawler', spot: 'c1', wander: 7 }],
    steps: [
      { type: 'collect', item: 'fuel', count: 3, text: 'Найдите топливо (3 канистры)', sub: 'Бункер гражданской обороны «Ковчег-2»', on: [['think', 'Старый бункер. Если запустить генератор — откроется узел связи.', 4.5]] },
      { type: 'collect', item: 'wire', text: 'Найдите кабель для стартера' },
      { type: 'use', id: 'starter', text: 'Подключите стартер генератора', done: [['flag', 'wired']] },
      { type: 'use', id: 'gen', text: 'Запустите резервный генератор', done: [['power', 'on'], ['door', 'hComm', 'open'], ['say', 'Генератор работает! Гермодверь узла связи открывается.', 4.5, 'Вы'], ['scare', 'scream']] },
      { type: 'reach', spot: 'comm', r: 3, text: 'Пройдите в узел связи', done: [['complete']] },
    ],
  },
  // ---------------------------------------------------------------- 21. Ложный выход
  {
    id: 'c3m5', chapter: 3, num: 5, title: 'Ложный выход', desc: 'Разгадать сложную головоломку.', reward: 400,
    size: [56, 34],
    env: { power: 'on', lampBroken: 0.4, lampFlicker: 0.3, fog: 0.04, battery: 85, inventory: { battery: 1 } },
    map(m) {
      m.station(4, 10, 30, { pw: 6, name: 'ПЕРЕКРЁСТОК' });
      m.rect(0, 12, 4, 6, '.');
      m.path([[1, 11], [1, 3], [20, 3]], '-');
      m.door(21, 3, { id: 'fakeDoor', type: 'gate', shutter: true, locked: true, sealed: true, lockText: 'Двери заварены снаружи' });
      m.set(22, 3, '-');
      m.path([[2, 18], [2, 26], [19, 26]], '-');
      m.room(20, 23, 12, 7, '-');
      m.door(34, 14, { id: 'realGate', type: 'gate', locked: true, noUse: true, lockText: 'Аварийный выход — управление рубильниками' });
      m.path([[35, 14], [50, 14]], '-');
      m.hint('sign', 20, 3, { dx: 1, dy: 0, text: 'ВЫХОД', bg: '#1a3d14', arrow: 1, h: 2.2, w: 1.4 });
      m.spot('start', 18, 14); m.spot('fakeExit', 19, 3); m.spot('realExit', 49, 14); m.spot('behind', 1, 8); m.spot('t1', 26, 15);
      for (const [i, x] of [[1, 22], [2, 25], [3, 28], [4, 31]]) dev(m, 'lever', x, 23, 'L' + i, { toggle: true, rotY: FACE.S, oz: -0.9, prompt: `Рубильник ${i}` });
      note(m, 24, 27, 'puzzleNote', 'Схема аварийного выхода', 'Аварийный выход открывается комбинацией рубильников.\nПервый и последний смотрят на свет.\nВторой всегда спит.\nТретий повторяет за первым.\n\n(Свет — рубильник ВКЛЮЧЁН, зелёный огонь.)', 'Инженер станции');
      note(m, 10, 14, 'n_fake', 'Надпись мелом на колонне', 'ВЫХОД НАВЕРХ — ЛОЖЬ. ОНИ ЖДУТ ТАМ.');
      item(m, 28, 27, 'battery', 1, 'b1'); item(m, 6, 3, 'medkit', 1, 'm1');
    },
    start: 'start', startYaw: DIR.W,
    monsters: [{ kind: 'turned', spot: 't1', wander: 6 }],
    steps: [
      { type: 'reach', spot: 'fakeExit', r: 2, text: 'Найдите выход со станции', sub: 'Указатели ведут к выходу на север', on: [['think', 'Указатель «ВЫХОД»... Неужели?', 3]], done: [['scare', 'blackout'], ['wait', 0.8], ['spawn', 'turned', 'behind', { aggressive: true }], ['scare', 'stinger'], ['say', 'Ловушка! Двери заварены!', 3, 'Вы'], ['wait', 4], ['power', 'on']] },
      { type: 'read', note: 'puzzleNote', text: 'Найдите схему аварийного выхода', hint: 'Щитовая к югу от вестибюля' },
      { type: 'custom', check: (g) => { const st = [1, 2, 3, 4].map((i) => !!g.entities.byId.get('L' + i)?.on); return st[0] && !st[1] && st[2] && st[3]; }, text: 'Выставьте рубильники по схеме', sub: 'Зелёный огонь — включён', done: [['door', 'realGate', 'open'], ['sound', 'power_on', null, {}], ['say', 'Где-то загудели ворота аварийного выхода!', 4, 'Вы']] },
      { type: 'reach', spot: 'realExit', r: 3, text: 'Уходите через аварийный выход (восток)', done: [['complete']] },
    ],
  },
  // ---------------------------------------------------------------- 22. Заражённая зона
  {
    id: 'c3m6', chapter: 3, num: 6, title: 'Заражённая зона', desc: 'Найти защитное снаряжение и пройти заражённые тоннели.', reward: 400,
    size: [60, 30],
    env: { power: 'on', lampBroken: 0.5, lampFlicker: 0.3, fog: 0.06, fogColor: 0x040603, battery: 85, inventory: { battery: 1 } },
    map(m) {
      m.room(2, 14, 8, 8, 'k');
      m.stairs(10, 17); m.stairs(10, 18);
      m.tunnel([[11, 17], [50, 17]]);
      m.tunnel([[24, 8], [24, 16]]);
      m.stairs(24, 7); m.stairs(25, 7);
      m.room(20, 2, 10, 5, '-');
      m.stairs(51, 17); m.stairs(51, 18);
      m.room(52, 14, 7, 8, 'l');
      m.spot('start', 4, 17); m.spot('cache', 25, 4); m.spot('decon', 55, 17); m.spot('c1', 18, 18); m.spot('c2', 40, 17); m.spot('t1', 30, 18);
      m.ent('gas', 11, 15, { w: 40, h: 6, id: 'gas1' }); m.ent('gas', 22, 7, { w: 6, h: 9, id: 'gas2' });
      item(m, 7, 15, 'gasmask', 1, 'mask', { ox: 0, oz: 0, h: 0.8 }); m.ent('prop', 7, 15, { model: 'metal_office_desk', solid: true });
      item(m, 5, 20, 'filter', 1, 'fl1'); item(m, 26, 3, 'filter', 2, 'fl2'); item(m, 44, 18, 'filter', 1, 'fl3');
      dev(m, 'device', 56, 15, 'shower', { prompt: 'Пройти дезактивацию', hold: 2.5, rotY: FACE.S, oz: -0.6 });
      note(m, 3, 15, 'n_gas', 'Предупреждение', 'ЗАРАЖЁННАЯ ЗОНА!\nСпоры Объекта-217 в воздухе. Без противогаза — смерть за минуту.\nФильтра хватает примерно на минуту. Запасные — на складе к северу.');
      item(m, 34, 18, 'medkit', 1, 'm1');
    },
    start: 'start', startYaw: DIR.E,
    monsters: [{ kind: 'crawler', spot: 'c1', wander: 6 }, { kind: 'crawler', spot: 'c2', wander: 7 }, { kind: 'turned', spot: 't1', wander: 8 }],
    steps: [
      { type: 'collect', item: 'gasmask', text: 'Найдите противогаз', sub: 'Впереди облако спор', on: [['think', 'Зелёный туман в тоннеле... Без защиты туда нельзя.', 4]] },
      { type: 'reach', spot: 'cache', r: 3, text: 'Доберитесь до склада фильтров (север)', sub: 'Фильтр противогаза расходуется в газе' },
      { type: 'reach', spot: 'decon', r: 3, text: 'Пройдите к блоку дезактивации (восток)' },
      { type: 'use', id: 'shower', text: 'Пройдите дезактивацию', done: [['say', 'Чисто. Можно снять маску.', 3, 'Вы'], ['wait', 3], ['complete']] },
    ],
  },
  // ---------------------------------------------------------------- 23. Последняя связь
  {
    id: 'c3m7', chapter: 3, num: 7, title: 'Последняя связь', desc: 'Восстановить систему коммуникаций.', reward: 420,
    size: [52, 40],
    env: { power: 'on', lampBroken: 0.45, lampFlicker: 0.3, fog: 0.04, battery: 85, inventory: { battery: 1 } },
    map(m) {
      m.path([[2, 30], [19, 30]], '-');
      m.room(20, 20, 16, 16, 'd');
      m.path([[28, 19], [28, 12]], '-'); m.door(28, 18, { id: 'dAnt' });
      m.room(24, 6, 10, 6, '-');
      m.path([[36, 26], [39, 26]], '-'); m.room(40, 23, 8, 7, '-');
      m.path([[10, 16], [10, 29]], '-'); m.room(6, 10, 8, 6, '-');
      m.spot('start', 3, 30); m.spot('c1', 30, 30); m.spot('c2', 44, 26); m.spot('sh', 10, 22);
      item(m, 9, 12, 'radio_part', 1, 'rp1'); item(m, 45, 27, 'radio_part', 1, 'rp2'); item(m, 34, 34, 'wire', 1, 'w1');
      dev(m, 'terminal', 28, 20, 'relay', { needs: 'radio_part', count: 2, needText: 'Нужны радиодетали', prompt: 'Починить ретранслятор', rotY: FACE.S, oz: -0.6, text: 'Ретранслятор: ПИТАНИЕ ЕСТЬ. Нет антенны.', who: 'Терминал' });
      dev(m, 'device', 25, 7, 'antenna', { needs: 'wire', needText: 'Нужен кабель', prompt: 'Подключить антенну', hold: 1.5, rotY: FACE.S, oz: -0.6, requiresFlag: 'relay', requiresText: 'Сначала почините ретранслятор' });
      dev(m, 'radio', 31, 9, 'radio', { freq: 98.3, rotY: FACE.S, oz: -0.4, requiresFlag: 'antenna', requiresText: 'Антенна не подключена' });
      note(m, 22, 22, 'n_relay', 'Схема ретранслятора', 'Ретранслятор «Береза-М»: 2 платы, кабель до антенны.\nЧастота «Ковчега» — 98.3.');
      item(m, 22, 34, 'battery', 1, 'b1'); item(m, 42, 28, 'medkit', 1, 'm1');
    },
    start: 'start', startYaw: DIR.E,
    monsters: [{ kind: 'crawler', spot: 'c1', wander: 7 }, { kind: 'crawler', spot: 'c2', wander: 4 }, { kind: 'shadow', spot: 'sh', wander: 6 }],
    steps: [
      { type: 'collect', item: 'radio_part', count: 2, text: 'Найдите платы ретранслятора (2)', on: [['think', 'Нужно связаться с «Ковчегом». Лида должна знать, что впереди.', 4]] },
      { type: 'collect', item: 'wire', text: 'Найдите антенный кабель' },
      { type: 'use', id: 'relay', text: 'Почините ретранслятор', done: [['flag', 'relay']] },
      { type: 'use', id: 'antenna', text: 'Подключите антенну (север)', done: [['flag', 'antenna']] },
      { type: 'use', id: 'radio', text: 'Свяжитесь с «Ковчегом» (98.3)', done: [['radio', 'Никита?! Ты жив! Слушай внимательно...', 4, LIDA], ['wait', 4], ['radio', 'Под тобой — гнездо. Королева. Всё, что ты видел, — её дети. Её нужно уничтожить.', 7, LIDA], ['wait', 7], ['radio', 'Заряды есть на складе у гнезда. Заложи их у опор свода. И... будь тише, чем когда-либо.', 6, LIDA], ['wait', 6], ['complete']] },
    ],
  },
  // ---------------------------------------------------------------- 24. Королева тоннелей
  {
    id: 'c3m8', chapter: 3, num: 8, title: 'Королева тоннелей', desc: 'Пережить встречу с огромным существом.', reward: 600,
    size: [64, 46],
    env: { power: 'off', emergency: false, fog: 0.03, fogColor: 0x050302, battery: 95, inventory: { battery: 2, charge: 3, flare: 2, medkit: 1 }, director: { intensity: 0.5, silhouettes: false } },
    map(m, rng) {
      m.tunnel([[0, 24], [12, 24]]);
      m.stairs(13, 24); m.stairs(13, 25);
      m.rect(14, 8, 34, 32, 'q');
      const keep = [[18, 24], [31, 24], [20, 12], [42, 14], [40, 34], [47, 24]];
      for (let i = 0; i < 14; i++) { const x = 17 + Math.floor(rng.next() * 28), y = 10 + Math.floor(rng.next() * 27); if (keep.some(([kx, ky]) => Math.abs(kx - x) < 5 && Math.abs(ky - y) < 5)) continue; m.rect(x, y, 2, 2, '#'); }
      m.path([[48, 24], [54, 24]], '-');
      m.door(52, 24, { id: 'herm', type: 'hermetic', open: true });
      m.room(55, 20, 7, 9, 'k');
      m.spot('start', 2, 24); m.spot('nestEdge', 18, 24); m.spot('queen', 31, 24); m.spot('safe', 58, 24); m.spot('egg1', 24, 30); m.spot('egg2', 36, 16); m.spot('hermDoor', 52, 24);
      dev(m, 'device', 20, 12, 'c1', { needs: 'charge', needText: 'Нет зарядов', prompt: 'Заложить заряд у опоры', hold: 2.2 });
      dev(m, 'device', 42, 14, 'c2', { needs: 'charge', needText: 'Нет зарядов', prompt: 'Заложить заряд у опоры', hold: 2.2 });
      dev(m, 'device', 40, 34, 'c3', { needs: 'charge', needText: 'Нет зарядов', prompt: 'Заложить заряд у опоры', hold: 2.2 });
      dev(m, 'lever', 57, 20, 'hermLever', { rotY: FACE.S, oz: -0.9, prompt: 'Закрыть гермодверь' });
      for (const [x, y] of [[20, 12], [42, 14], [40, 34]]) lamp(m, x, y, 'fungus', { oy: 0.3 });
    },
    start: 'start', startYaw: DIR.E,
    monsters: [{ kind: 'queen', spot: 'queen', id: 'queen', dormant: true }],
    steps: [
      { type: 'reach', spot: 'nestEdge', r: 3, text: 'Проберитесь в гнездо. Тихо.', on: [['radio', 'Королева спит. Три заряда — у трёх опор свода. Не свети ей в глаза...', 6, LIDA]], done: [['think', 'Господи... Оно огромное.', 3], ['scare', 'stinger']] },
      { type: 'use', ids: ['c1', 'c2', 'c3'], text: 'Заложите заряды у опор свода (3)', sub: 'Опоры отмечены светящимися грибами' },
      { type: 'reach', spot: 'safe', r: 3, text: 'БЕГИТЕ К ГЕРМОДВЕРИ! (восток)', checkpoint: false, on: [['wake', 'queen', true], ['sound', 'growl', 'queen', { volume: 1, rate: 0.45 }], ['shake', 1], ['scare', 'stinger'], ['spawn', 'crawler', 'egg1', { aggressive: true }], ['spawn', 'crawler', 'egg2', { aggressive: true }]] },
      { type: 'use', id: 'hermLever', text: 'Закройте гермодверь!', checkpoint: false, done: [['door', 'herm', 'seal']] },
      { type: 'survive', time: 12, text: 'Держитесь... Заряды сработают по таймеру', timerLabel: 'Взрыв через', on: [['sound', 'slam', 'hermDoor'], ['shake', 0.8], ['wait', 3], ['sound', 'growl', 'hermDoor', { volume: 1, rate: 0.5 }], ['shake', 0.6]], done: [['sound', 'hit', null, { volume: 1 }], ['shake', 1.5], ['despawnAll'], ['wait', 1], ['say', 'Взрыв! Свод гнезда обрушился...', 4, 'Вы'], ['wait', 3], ['radio', 'Никита... ты сделал это. Но это была не единственная матка. Возвращайся. Поезд будет ждать у «Ковчега».', 7, LIDA], ['wait', 7], ['complete']] },
    ],
    triggers: [{ on: 'use:c2', actions: [['sound', 'growl', 'queen', { volume: 0.8, rate: 0.5 }], ['shake', 0.4], ['think', 'Она шевелится...', 2.5]] }],
    outro: 'Королева погребена под сводом. Глава 3 завершена.',
  },
];
