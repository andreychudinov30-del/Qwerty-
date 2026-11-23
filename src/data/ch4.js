// Глава 4 — «Последний поезд»
import { DIR, FACE, note, item, dev, lamp, locker, body, npc, LIDA } from './kit.js';

export const CH4 = [
  // ---------------------------------------------------------------- 25. Обратный путь
  {
    id: 'c4m1', chapter: 4, num: 1, title: 'Обратный путь', desc: 'Вернуться через изменившиеся тоннели.', reward: 420,
    size: [56, 30],
    env: { power: 'on', lampBroken: 0.6, lampFlicker: 0.3, fog: 0.05, fogColor: 0x050303, wet: 1, battery: 85, inventory: { battery: 1 }, director: { intensity: 1.4 } },
    map(m) {
      m.station(6, 8, 28, { pw: 6, name: 'ЗАРЯ' });
      m.tunnel([[34, 8], [50, 8]]);
      m.rect(2, 10, 4, 6, '.');
      m.door(1, 12, { id: 'vestRubble', rubble: true }); m.set(0, 12, '-');
      m.path([[3, 9], [3, 3], [20, 3]], '-'); m.door(3, 9, { id: 'dN' });
      m.room(20, 1, 6, 4, '-');
      m.path([[26, 2], [40, 2]], 'c', 2); m.path([[40, 2], [40, 22]], 'c', 2); m.path([[40, 22], [52, 22]], 'c', 2);
      m.stairs(33, 10);
      m.spot('start', 49, 8); m.spot('platform', 20, 12); m.spot('vestibule', 3, 12); m.spot('burrow', 30, 2); m.spot('exit', 52, 23);
      m.spot('c1', 14, 9); m.spot('c2', 40, 14); m.spot('t1', 24, 14); m.spot('t2', 34, 2); m.spot('sh', 10, 13);
      note(m, 22, 2, 'n_return', 'Записка Лиды', 'Никита, если ты читаешь это — «Заря» заражена. Масса проросла через вестибюль. Обходи по норам, которые они прорыли. Они ведут к «Ковчегу».', 'Л.');
      item(m, 18, 14, 'battery', 1, 'b1'); item(m, 41, 18, 'medkit', 1, 'm1'); item(m, 24, 3, 'flare', 1, 'f1');
      body(m, 12, 12, 'oldDuty', { skin: 'scientist', text: 'Дежурная Орлова... Она так и не ушла со станции.' });
    },
    start: 'start', startYaw: DIR.W,
    monsters: [{ kind: 'crawler', spot: 'c1', wander: 8 }, { kind: 'crawler', spot: 'c2', wander: 6 }, { kind: 'turned', spot: 't1', wander: 8 }, { kind: 'turned', spot: 't2', wander: 5 }, { kind: 'shadow', spot: 'sh', wander: 6 }],
    steps: [
      { type: 'reach', spot: 'platform', r: 4, text: 'Вернитесь на станцию «Заря»', on: [['think', 'Я вернулся туда, где всё началось. Но станция... изменилась.', 4.5]] },
      { type: 'reach', spot: 'vestibule', r: 2.5, text: 'Пройдите через западный вестибюль', done: [['think', 'Завал. Сквозь камни проросла какая-то мерзость. Нужен другой путь.', 4.5]] },
      { type: 'reach', spot: 'burrow', r: 3, text: 'Ищите обход через северные помещения', hint: 'Дежурка и подсобка — на север от вестибюля' },
      { type: 'reach', spot: 'exit', r: 3, text: 'Пройдите по норам на юго-восток', done: [['complete']] },
    ],
  },
  // ---------------------------------------------------------------- 26. Разрушенная станция
  {
    id: 'c4m2', chapter: 4, num: 2, title: 'Разрушенная станция', desc: 'Найти безопасный маршрут через руины.', reward: 440,
    size: [60, 30],
    env: { power: 'on', lampBroken: 0.65, lampFlicker: 0.3, fog: 0.05, battery: 85, inventory: { battery: 1 }, director: { intensity: 1.2 } },
    map(m, rng) {
      m.station(4, 8, 44, { pw: 6, name: 'ПОБЕДА' });
      for (let i = 0; i < 26; i++) { const x = 6 + Math.floor(rng.next() * 40), y = 9 + Math.floor(rng.next() * 8); if ((x === 10 && y === 12) || Math.abs(x - 26) < 2 || Math.abs(x - 40) < 2 || x > 44) continue; m.rubble(x, y); }
      m.tunnel([[0, 8], [3, 8]]); m.tunnel([[48, 16], [58, 16]]);
      m.stairs(4, 10); m.stairs(47, 15);
      m.spot('start', 1, 8); m.spot('exit', 57, 16); m.spot('c1', 20, 12); m.spot('c2', 34, 13); m.spot('c3', 44, 16);
      dev(m, 'device', 14, 10, 'mk1', { prompt: 'Осмотреть отметку мелом', text: 'Стрелка мелом и надпись «К. — по левому краю, не по центру»', who: 'Отметка' });
      dev(m, 'device', 26, 13, 'mk2', { prompt: 'Осмотреть отметку мелом', text: 'Стрелка вниз, к путям: «через яму, пригнувшись»', who: 'Отметка' });
      dev(m, 'device', 40, 15, 'mk3', { prompt: 'Осмотреть отметку мелом', text: '«Восточный тоннель чист. Ждём у Ковчега. К.»', who: 'Отметка' });
      note(m, 7, 12, 'n_ruin', 'Обгоревший лист', 'Свод «Победы» рухнул после взрыва газа. Пол проваливается. Мы с Котовым помечаем мелом безопасную тропу.');
      item(m, 22, 14, 'battery', 1, 'b1'); item(m, 26, 15, 'flare', 1, 'f1'); item(m, 30, 16, 'medkit', 1, 'm1');
    },
    start: 'start', startYaw: DIR.E,
    monsters: [{ kind: 'crawler', spot: 'c1', wander: 6 }, { kind: 'crawler', spot: 'c2', wander: 6 }, { kind: 'crawler', spot: 'c3', wander: 5 }],
    steps: [
      { type: 'use', ids: ['mk1', 'mk2', 'mk3'], text: 'Найдите отметки безопасного маршрута (3)', sub: 'Перелезайте через завалы [Пробел]', on: [['think', 'Станция «Победа»... от неё мало что осталось.', 4]] },
      { type: 'reach', spot: 'exit', r: 3, text: 'Уходите в восточный тоннель', done: [['complete']] },
    ],
  },
  // ---------------------------------------------------------------- 27. Отключение
  {
    id: 'c4m3', chapter: 4, num: 3, title: 'Отключение', desc: 'Выжить без электричества и фонарика.', reward: 480,
    size: [54, 40],
    env: { power: 'off', emergency: false, fog: 0.05, flashlight: false, battery: 0, inventory: { flare: 1 }, ambient: 0.6, director: { intensity: 1.5 } },
    map(m) {
      m.tunnel([[2, 4], [48, 4], [48, 34], [2, 34], [2, 6]]);
      m.room(14, 12, 10, 8, 'k'); m.path([[18, 6], [18, 11]], '-'); m.stairs(18, 6);
      m.room(30, 22, 10, 8, 'k'); m.path([[34, 30], [34, 33]], '-'); m.stairs(34, 33);
      m.room(8, 24, 8, 6, 'c'); m.path([[4, 27], [7, 27]], 'c'); m.stairs(4, 27);
      m.door(50, 4, { id: 'exitGate', type: 'hermetic', locked: true, noUse: true, lockText: 'Гермоворота — нужен сигнал огнями' });
      m.set(50, 5, '#'); m.path([[51, 4], [53, 4]], '-');
      m.spot('start', 3, 5); m.spot('exit', 52, 4); m.spot('s1', 30, 4); m.spot('s2', 48, 20); m.spot('s3', 20, 34);
      m.ent('fire', 19, 15, { id: 'f1' }); m.ent('fire', 35, 26, { id: 'f2' }); m.ent('fire', 11, 27, { id: 'f3' });
      item(m, 10, 4, 'flare', 1, 'fl1'); item(m, 48, 12, 'flare', 1, 'fl2'); item(m, 26, 34, 'flare', 1, 'fl3'); item(m, 16, 18, 'flare', 1, 'fl4'); item(m, 38, 28, 'medkit', 1, 'm1');
      note(m, 22, 13, 'n_dark', 'Записка', 'Тени приходят, когда гаснет свет. Огонь их держит. Разожги три сигнальных костра — с поста увидят и откроют гермоворота.');
    },
    start: 'start', startYaw: DIR.E,
    monsters: [{ kind: 'shadow', spot: 's1', wander: 10, aggressive: true }, { kind: 'shadow', spot: 's2', wander: 10 }, { kind: 'shadow', spot: 's3', wander: 10 }],
    steps: [
      { type: 'collect', item: 'flare', count: 3, text: 'Соберите фальшфейеры (3)', sub: 'Фонарь разбит. Свет — только от огня. [G] — зажечь и бросить фальшфейер', on: [['think', 'Фонарь разбился при падении... Темнота абсолютная.', 4], ['scare', 'whisper']] },
      { type: 'use', ids: ['f1', 'f2', 'f3'], text: 'Разожгите три сигнальных костра', hint: 'Бочки в комнатах внутри кольца тоннелей' },
      { type: 'reach', spot: 'exit', r: 2.5, text: 'Гермоворота открываются — к выходу (северо-восток)!', on: [['door', 'exitGate', 'open'], ['sound', 'door_heavy', 'exit', {}]], done: [['complete']] },
    ],
  },
  // ---------------------------------------------------------------- 28. Подземный комплекс
  {
    id: 'c4m4', chapter: 4, num: 4, title: 'Подземный комплекс', desc: 'Проникнуть на секретный объект «Глубина».', reward: 500,
    size: [58, 42],
    env: { power: 'on', lampBroken: 0.2, lampFlicker: 0.15, fog: 0.03, battery: 90, inventory: { battery: 2, flare: 1 } },
    map(m) {
      m.path([[2, 20], [8, 20]], '-');
      m.path([[9, 20], [50, 20]], 'l', 2);
      m.room(12, 6, 12, 10, 'l'); m.path([[17, 16], [17, 19]], 'l'); m.door(17, 17, { id: 'dSec' });
      m.room(30, 6, 12, 10, 'l'); m.path([[35, 16], [35, 19]], 'l'); m.door(35, 17, { id: 'dLab' });
      m.room(12, 26, 12, 10, 'l'); m.path([[17, 22], [17, 25]], 'l'); m.door(17, 24, { id: 'dS1' });
      m.room(36, 26, 14, 12, 'l'); m.path([[42, 22], [42, 25]], 'l'); m.door(42, 24, { id: 'dArch', locked: true, key: 'keycard', keepKey: true });
      m.spot('start', 3, 20); m.spot('archive', 43, 32); m.spot('al1', 6, 20); m.spot('al2', 48, 21); m.spot('t1', 36, 10);
      m.ent('camera', 20, 20, { id: 'cam1', rotY: FACE.E, oy: 3.0, oz: -0.9 }); m.ent('camera', 32, 21, { id: 'cam2', rotY: FACE.W, oy: 3.0, oz: 0.9 });
      m.ent('camera', 44, 20, { id: 'cam3', rotY: FACE.S, oy: 3.0, oz: -0.9 }); m.ent('camera', 18, 9, { id: 'cam4', rotY: FACE.S, oy: 3.0 }); m.ent('camera', 40, 30, { id: 'cam5', rotY: FACE.N, oy: 3.0 });
      body(m, 20, 9, 'guard', { skin: 'military', item: 'keycard', text: 'Охранник комплекса. Ключ-карта доступа в архив.' });
      note(m, 14, 8, 'n_sec', 'Инструкция поста охраны', 'Камеры фиксируют движение в освещённых зонах. Тревога — сигнал всем... обитателям.\nНе ходить в полный рост под камерами. Выключать фонарь.');
      locker(m, 13, 30, FACE.E); locker(m, 31, 7, FACE.S);
      item(m, 22, 30, 'battery', 1, 'b1'); item(m, 40, 12, 'medkit', 1, 'm1');
    },
    start: 'start', startYaw: DIR.E,
    monsters: [{ kind: 'turned', spot: 't1', wander: 5 }],
    steps: [
      { type: 'collect', item: 'keycard', text: 'Добудьте ключ-карту на посту охраны', sub: 'Камеры замечают движение в полный рост и свет фонаря', on: [['think', '«Глубина». Здесь всё началось. Камеры ещё работают...', 4.5]] },
      { type: 'reach', spot: 'archive', r: 3, text: 'Проникните в архив (юго-восток)', done: [['complete']] },
    ],
    triggers: [{ on: 'alarm', repeat: true, actions: [['spawn', 'turned', 'al1', { aggressive: true }], ['sound', 'buzz', null, { volume: 0.8 }]] }],
  },
  // ---------------------------------------------------------------- 29. Правда
  {
    id: 'c4m5', chapter: 4, num: 5, title: 'Правда', desc: 'Раскрыть тайну катастрофы.', reward: 520,
    size: [52, 36],
    env: { power: 'on', lampBroken: 0.25, lampFlicker: 0.3, fog: 0.03, battery: 90, inventory: { battery: 1, charge: 3 } },
    map(m) {
      m.room(2, 14, 10, 8, 'l');
      m.path([[12, 17], [20, 17]], 'l', 2);
      m.room(20, 6, 24, 24, 'd');
      for (const [x, y] of [[26, 12], [38, 12], [32, 24]]) m.set(x, y, 'o');
      m.path([[44, 17], [50, 17]], '-', 2);
      m.door(46, 17, { id: 'exitDoor', type: 'hermetic', open: true }); m.set(46, 18, '#');
      m.spot('start', 5, 17); m.spot('core', 32, 17); m.spot('exit', 49, 17); m.spot('t1', 30, 8); m.spot('t2', 40, 26);
      dev(m, 'terminal', 4, 14, 'tr1', { rotY: FACE.S, oz: -0.6, who: 'Архив', text: 'Приказ №1: Объект-217 обнаружен 02.03. Это не плесень — это нервная система. Она думает.' });
      dev(m, 'terminal', 8, 14, 'tr2', { rotY: FACE.S, oz: -0.6, who: 'Архив', text: 'Приказ №7: курировать «матку» поручено Л. Воронцовой. Цель — управляемое оружие.' });
      dev(m, 'terminal', 10, 21, 'tr3', { rotY: FACE.N, oz: 0.6, who: 'Архив', text: '14.09: Воронцова вскрыла бокс 3 вручную. Утечка спор в вентиляцию метро. Причина: «проверка реакции на толпу».' });
      dev(m, 'radio', 6, 20, 'tape', { freq: 101.1, rotY: FACE.N, oz: 0.5, prompt: 'Прослушать кассету' });
      for (const [i, x, y] of [[1, 26, 13], [2, 38, 13], [3, 32, 25]]) {
        dev(m, 'device', x, y, 'ch' + i, { needs: 'charge', needText: 'Нет зарядов', prompt: 'Заложить заряд у опоры реактора', hold: 2, requiresFlag: 'destroy', requiresText: 'Вы решили забрать образцы' });
        item(m, x + 1, y, 'sample', 1, 'smp' + i, { hidden: true });
      }
    },
    start: 'start', startYaw: DIR.E,
    monsters: [{ kind: 'turned', spot: 't1', wander: 6, dormant: true, id: 'g1' }, { kind: 'crawler', spot: 't2', wander: 6, dormant: true, id: 'g2' }],
    steps: [
      { type: 'use', ids: ['tr1', 'tr2', 'tr3'], text: 'Изучите архивные терминалы (3)', on: [['think', 'Архив «Глубины». Здесь должна быть правда.', 3.5]] },
      { type: 'use', id: 'tape', text: 'Прослушайте кассету (частота 101.1)', done: [['radio', '...говорит Людмила Воронцова. Да, это я открыла бокс. Я хотела увидеть, как масса поведёт себя в толпе.', 7, 'Кассета'], ['wait', 7], ['radio', 'Если ты это слушаешь, Никита... я — та, кого ты зовёшь Лидой. Мне нужны образцы. Принеси их — и я выведу тебя наверх.', 8, 'Кассета'], ['wait', 8]] },
      { type: 'choice', id: 'truth', title: 'Лида — куратор катастрофы. Что вы сделаете?', options: [{ text: 'Уничтожить реактор «Глубины» и всё, что в нём', value: true, flag: 'destroyedLab' }, { text: 'Забрать образцы для Лиды', value: false, flag: 'destroyedLab' }] },
      { type: 'custom', check: (g, m) => m.flags.destroyedLab ? ['ch1', 'ch2', 'ch3'].every((id) => m.used.has(id)) : (g.player.inventory.sample || 0) >= 3, text: 'Выполните решение: заряды у опор (3) или образцы (3)',
        on: [['call', (g, m) => { if (m.flags.destroyedLab) m.setFlag('destroy', true); else for (const i of [1, 2, 3]) { const e = g.entities.byId.get('smp' + i); if (e) { e.object.visible = true; e.enabled = true; } } }], ['wake', 'g1', true], ['wake', 'g2', true], ['scare', 'scream']] },
      { type: 'reach', spot: 'exit', r: 3, text: 'Уходите! Таймер запущен', limit: 90, timerLabel: 'Осталось', failText: 'Вы не успели уйти', on: [['call', (g, m) => { if (!m.flags.destroyedLab) m.step.limit = 0; }]], done: [['door', 'exitDoor', 'close'], ['call', async (g, m) => { if (m.flags.destroyedLab) { const { audio } = await import('../core/audio.js'); audio.play('hit', { volume: 1 }); g.player.shake = 1.5; g.hud.subtitle('Реактор «Глубины» уничтожен.', 4, 'Вы'); } else g.hud.subtitle('Образцы у меня. Лида будет довольна... наверное.', 4, 'Вы'); }], ['wait', 4], ['complete']] },
    ],
  },
  // ---------------------------------------------------------------- 30. Последняя оборона
  {
    id: 'c4m6', chapter: 4, num: 6, title: 'Последняя оборона', desc: 'Удерживать станцию до прибытия поезда.', reward: 600,
    size: [52, 26],
    env: { power: 'on', lampBroken: 0.15, lampFlicker: 0.2, fog: 0.03, battery: 100, inventory: { battery: 2, flare: 3, medkit: 2, bottle: 2 }, director: { intensity: 0.2 } },
    map(m) {
      m.station(6, 6, 36, { pw: 6, name: 'КОВЧЕГ' });
      m.tunnel([[0, 6], [5, 6]]); m.tunnel([[42, 14], [51, 14]]);
      m.path([[24, 5], [24, 1]], '-'); m.door(24, 4, { id: 'dNorth', metal: true, open: true });
      m.door(5, 14, { id: 'dWest', type: 'gate', open: true }); m.set(4, 14, '='); m.set(4, 15, '='); m.set(5, 15, '#');
      m.rect(0, 14, 4, 2, '=');
      m.door(42, 6, { id: 'dEast', type: 'gate', open: true }); m.set(42, 7, '#'); m.rect(43, 6, 8, 2, '=');
      m.stairs(6, 8); m.stairs(41, 13);
      m.spot('start', 24, 10); m.spot('board', 26, 8); m.spot('wN', 24, 1); m.spot('wW', 1, 14); m.spot('wE', 49, 6); m.spot('wE2', 49, 14); m.spot('wW2', 1, 6);
      m.spot('trainStart', 2, 6); m.spot('trainStop', 18, 6);
      m.ent('train', -6, 6, { id: 'train', axis: 'x', cars: 2, oz: 1.25, lit: true, collide: false });
      dev(m, 'barricade', 24, 5, 'bar1', { prompt: 'Заколотить северный проход', hold: 2 });
      dev(m, 'lever', 7, 14, 'bar2', { prompt: 'Опустить западную решётку', rotY: FACE.N, oz: 0.9 });
      dev(m, 'lever', 41, 7, 'bar3', { prompt: 'Опустить восточную решётку', rotY: FACE.S, oz: -0.9 });
      npc(m, 22, 11, 'lidaNpc', { name: 'Лида', skin: 'scientist', rotY: FACE.S, lines: [['Ты пришёл! Поезд будет через пару минут. Закрой проходы — они уже идут!', 5], ['Держись! Я верю в тебя.', 3]] });
    },
    start: 'start', startYaw: DIR.N,
    steps: [
      { type: 'use', ids: ['bar1', 'bar2', 'bar3'], text: 'Закройте три прохода на станцию', sub: 'Север — доски, запад и восток — решётки', on: [['say', 'Они идут! Закрывай проходы!', 3, 'Лида']] },
      { type: 'defend', time: 150, text: 'Держите станцию до прибытия поезда', timerLabel: 'Поезд через', on: [['aggro']],
        waves: [{ t: 2, kind: 'turned', spot: 'wN' }, { t: 12, kind: 'crawler', spot: 'wW' }, { t: 25, kind: 'turned', spot: 'wE' }, { t: 40, kind: 'crawler', spot: 'wE2' }, { t: 55, kind: 'turned', spot: 'wW2' }, { t: 70, kind: 'hunter', spot: 'wN' }, { t: 90, kind: 'crawler', spot: 'wW' }, { t: 105, kind: 'turned', spot: 'wE' }, { t: 120, kind: 'crawler', spot: 'wE2' }, { t: 132, kind: 'turned', spot: 'wW2' }] },
      { type: 'reach', spot: 'board', r: 3, text: 'Поезд прибыл! Садитесь!', checkpoint: false, on: [['train', 'train', 'move', 'trainStop', 5, true]], done: [['despawnAll'], ['say', 'Поехали! Держись крепче.', 3, 'Лида'], ['fade', 'out', 1.5], ['complete']] },
    ],
    triggers: [{ on: 'use:bar1', actions: [['door', 'dNorth', 'lock']] }, { on: 'use:bar2', actions: [['door', 'dWest', 'lock']] }, { on: 'use:bar3', actions: [['door', 'dEast', 'lock']] }],
  },
  // ---------------------------------------------------------------- 31. Финальная погоня
  {
    id: 'c4m7', chapter: 4, num: 7, title: 'Финальная погоня', desc: 'Спастись от главного монстра.', reward: 700,
    size: [80, 24],
    env: { power: 'on', lampBroken: 0.35, lampFlicker: 0.5, fog: 0.04, fogColor: 0x060202, battery: 100, inventory: { flare: 2, medkit: 1 }, director: { intensity: 0.2, silhouettes: false } },
    map(m) {
      m.tunnel([[2, 10], [30, 10], [30, 4], [50, 4], [50, 16], [70, 16]]);
      m.rect(72, 13, 6, 8, '.');
      m.stairs(72, 16); m.stairs(72, 17);
      for (const [x, y] of [[14, 10], [22, 11], [38, 4], [44, 5], [50, 10], [60, 16], [64, 17]]) m.rubble(x, y);
      m.spot('start', 3, 10); m.spot('boss', 2, 11); m.spot('mid', 40, 4); m.spot('cab', 75, 16); m.spot('cp2', 50, 12);
      m.ent('train', 70, 13, { id: 'train', axis: 'y', cars: 1, ox: 0, lit: true, dir: -1, collide: false });
      dev(m, 'trainControls', 75, 15, 'controls', { prompt: 'Запустить поезд', hold: 1.5, oy: 0 });
    },
    start: 'start', startYaw: DIR.E,
    steps: [
      { type: 'reach', spot: 'mid', r: 4, text: 'БЕГИТЕ! Машинист идёт за вами', sub: 'Перелезайте через завалы [Пробел], бросайте фальшфейеры', on: [['wait', 1], ['sound', 'train_horn', 'boss', { volume: 1, rate: 0.6 }], ['spawn', 'conductor', 'boss', { aggressive: true, rubber: true, id: 'boss' }], ['scare', 'stinger'], ['say', 'Это... Машинист. Тот, кто вёл первый поезд с «Глубины».', 4, 'Вы']] },
      { type: 'reach', spot: 'cp2', r: 4, text: 'Не останавливайтесь!' },
      { type: 'reach', spot: 'cab', r: 3, text: 'К поезду! На восток!' },
      { type: 'use', id: 'controls', text: 'Запустите поезд!', checkpoint: false, done: [['despawnAll'], ['sound', 'train_horn', 'cab', { volume: 1 }], ['say', 'Поезд рванул с места. Машинист остался в темноте.', 4, 'Вы'], ['fade', 'out', 1.5], ['complete']] },
    ],
  },
  // ---------------------------------------------------------------- 32. Рассвет
  {
    id: 'c4m8', chapter: 4, num: 8, title: 'Рассвет', desc: 'Выбраться на поверхность. Одна из нескольких концовок.', reward: 1000,
    size: [44, 46],
    env: { power: 'on', lampBroken: 0.3, lampFlicker: 0.25, fog: 0.035, battery: 100, inventory: { flare: 2, medkit: 1 }, director: { intensity: 0.8 } },
    map(m) {
      m.station(4, 34, 24, { pw: 6, name: 'РАССВЕТ', sides: 1 });
      m.rect(12, 26, 8, 8, '.');
      m.rect(13, 34, 4, 2, '.');
      m.path([[14, 25], [14, 10]], '.', 4);
      m.rect(8, 3, 16, 7, '.');
      m.door(15, 2, { id: 'surface', type: 'gate', shutter: true, locked: true, noUse: true });
      m.set(15, 1, '-');
      m.spot('start', 10, 38); m.spot('escalator', 15, 18); m.spot('top', 15, 6); m.spot('t1', 16, 12); m.spot('sh', 10, 5);
      dev(m, 'device', 15, 3, 'exitDoor', { prompt: 'Открыть двери наружу', hold: 3, rotY: FACE.S, oz: -0.8 });
      note(m, 16, 28, 'n_final', 'Последняя записка Котова', 'Если ты дошёл сюда — выход наверху. Двери заклинило, но их можно открыть. Не оглядывайся. Там, наверху, — утро.', 'К.');
      for (const [x, y] of [[15, 22], [15, 14]]) lamp(m, x, y, 'work', { oy: 5.5 });
    },
    start: 'start', startYaw: DIR.N,
    monsters: [{ kind: 'turned', spot: 't1', id: 'last', dormant: true }],
    steps: [
      { type: 'reach', spot: 'escalator', r: 3, text: 'Поднимитесь к эскалаторам', on: [['call', (g) => { const f = g.mission.flags; const pf = (window.__mhProfileFlags && window.__mhProfileFlags()) || {}; void f; void pf; }], ['think', 'Станция «Рассвет». Последняя. Наверху — поверхность.', 4]] },
      { type: 'reach', spot: 'top', r: 3, text: 'Доберитесь до вестибюля', on: [['wake', 'last', true], ['scare', 'burst']] },
      { type: 'use', id: 'exitDoor', text: 'Откройте двери на поверхность', done: [['despawnAll'], ['door', 'surface', 'open'], ['ending'], ['complete']] },
    ],
  },
];
