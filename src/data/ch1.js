// Глава 1 — «Последняя станция»
import { DIR, FACE, note, item, dev, lamp, locker, body, tunnelMaze, LIDA } from './kit.js';

export const CH1 = [
  // ---------------------------------------------------------------- 1. Пробуждение
  {
    id: 'c1m1', chapter: 1, num: 1, title: 'Пробуждение', desc: 'Очнуться на пустой станции «Заря» и понять, что произошло.', reward: 120,
    size: [46, 26],
    env: { power: 'on', lampBroken: 0.45, lampFlicker: 0.3, fog: 0.04, ambient: 0.5, director: { intensity: 0.6 } },
    map(m) {
      m.station(6, 8, 28, { pw: 6, name: 'ЗАРЯ' });
      m.rect(2, 10, 4, 6, '.');
      m.path([[3, 9], [3, 4]], '-');
      m.door(3, 9, { id: 'dDuty' });
      m.room(2, 1, 9, 3, '-');
      m.tunnel([[34, 8], [43, 8]]); m.tunnel([[34, 16], [43, 16]]);
      m.rubble(43, 8); m.rubble(43, 9); m.rubble(43, 16); m.rubble(43, 17);
      m.stairs(33, 10);
      m.spot('start', 13, 12, {}); m.spot('board', 21, 12); m.spot('dutyDoor', 3, 10); m.spot('tunnelMouth', 31, 10); m.spot('tunnelEast', 41, 9); m.spot('vest', 4, 12);
      note(m, 8, 2, 'log1', 'Журнал дежурного по станции', '14 сентября.\n04:12 — связь с диспетчерской потеряна.\n04:30 — из тоннеля слышны крики. Ремонтная бригада не вернулась.\n05:10 — приказ: эвакуация через вестибюль. Гермоворота закрыть.\n05:40 — свет мигает. Что-то ходит по путям.\nЯ остаюсь. Если кто-то это читает — не спускайтесь в тоннель без света.', 'Дежурная Н. Орлова');
      note(m, 24, 14, 'n_gazeta', 'Газета «Вечерний город»', 'МЕТРОСТРОЙ ЗАВЕРШИЛ ГЛУБИННУЮ ПРОХОДКУ\nНа перегоне за станцией «Заря» закончены работы по проекту «Глубина». Представитель министерства отказался комментировать, что именно обнаружили проходчики на отметке минус 217 метров.');
      m.ent('prop', 9, 2, { model: 'metal_office_desk', solid: true, rotY: 0 });
      m.ent('prop', 6, 2, { model: 'vintage_radio_transceiver', size: 0.4, oy: 0 });
    },
    start: 'start', startYaw: DIR.E,
    intro: { path: [[60, 4.5, 18], [40, 3.2, 26], [34, 1.9, 31]], look: [30, 1.2, 31], dur: 7, lines: [['Станция «Заря». Утро после.', 4], ['Сколько я здесь пролежал?..', 3, 'Вы']] },
    steps: [
      { type: 'reach', spot: 'board', r: 3, text: 'Осмотрите станцию', sub: 'Где все люди? Что здесь произошло?', on: [['wait', 1], ['think', 'Голова раскалывается... Почему станция пуста?', 4]] },
      { type: 'reach', spot: 'dutyDoor', r: 2.5, text: 'Найдите дежурную комнату', hint: 'Проход из западного вестибюля на север', on: [['think', 'У дежурной должна быть связь.', 3]] },
      { type: 'read', note: 'log1', text: 'Прочитайте журнал дежурного', hint: 'Журнал лежит на столе в дежурке' },
      { type: 'reach', spot: 'tunnelMouth', r: 3, text: 'Проверьте шум у восточного тоннеля', on: [['wait', 1.5], ['sound', 'scream', 'tunnelEast', { volume: 0.8, reverb: 0.9 }], ['think', 'Крик... из тоннеля. Там кто-то есть!', 3.5]],
        done: [['scare', 'blackout'], ['wait', 1.2], ['scare', 'stinger'], ['say', 'Свет погас. Что-то движется в темноте...', 4, 'Вы'], ['wait', 3], ['fade', 'out', 2], ['complete']] },
    ],
    triggers: [
      { area: [2, 10, 4, 6], when: (g, m) => m.stepIdx >= 1, actions: [['scare', 'silhouette']] },
      { spot: 'board', r: 4, actions: [['wait', 6], ['scare', 'knock']] },
    ],
    outro: 'Электричество на станции отключилось. Без света дальше не пройти.',
  },
  // ---------------------------------------------------------------- 2. Тьма
  {
    id: 'c1m2', chapter: 1, num: 2, title: 'Тьма', desc: 'Найти фонарик и батарейки в обесточенной станции.', reward: 140,
    size: [46, 26],
    env: { power: 'off', emergency: true, fog: 0.05, battery: 45, ambient: 0.25, director: { intensity: 1 } },
    map(m) {
      m.station(8, 12, 26, { pw: 6, name: 'ЗАРЯ' });
      m.rect(2, 13, 6, 8, '.');
      m.rect(4, 9, 2, 4, '.');
      m.rect(2, 3, 14, 6, '.');
      m.door(16, 5, { id: 'dStore' });
      m.path([[17, 5], [30, 5]], '-');
      m.room(20, 1, 5, 3, '-'); m.set(22, 4, '-');
      m.room(26, 7, 6, 4, '-'); m.set(28, 6, '-');
      m.door(8, 2, { id: 'gSurface', type: 'gate', shutter: true, locked: true, sealed: true, lockText: 'Ворота на поверхность заблокированы' });
      m.set(8, 1, '-'); m.set(8, 0, '#');
      m.tunnel([[34, 12], [43, 12]]); m.tunnel([[34, 20], [43, 20]]);
      m.spot('start', 31, 16); m.spot('gateSpot', 8, 4); m.spot('crA', 30, 5); m.spot('crB', 17, 5); m.spot('ticket', 9, 6);
      item(m, 29, 9, 'flashlight', 1, 'flash1', { ox: 0, oz: 0, h: 0.05 });
      item(m, 21, 2, 'battery', 1, 'bat1'); item(m, 13, 7, 'battery', 1, 'bat2'); item(m, 5, 18, 'battery', 1, 'bat3');
      lamp(m, 20, 15, 'beacon', { oy: 6.2 }); lamp(m, 4, 14, 'beacon', { oy: 6.2 }); lamp(m, 7, 4, 'beacon', { oy: 6.2 }); lamp(m, 19, 5, 'beacon', { oy: 2.9 }); lamp(m, 28, 8, 'beacon', { oy: 2.9 });
      m.ent('prop', 27, 8, { model: 'steel_frame_shelves_01', solid: true, rotY: 0 });
      m.ent('prop', 30, 8, { model: 'cardboard_box_01' });
      note(m, 23, 2, 'n_store', 'Опись склада', 'Фонари аккумуляторные — 4 шт. (выдано 3)\nБатареи — коробка в кассовом зале\nАптечки — израсходованы\n\nP.S. Кто-то забрал последнюю коробку свечей. Мы что, будем сидеть в темноте?');
    },
    start: 'start', startYaw: DIR.W,
    steps: [
      { type: 'collect', item: 'flashlight', text: 'Найдите мощный фонарь и батарейки', sub: 'Ваш фонарик [F] светит тускло. Аварийные лампы ещё горят.', hint: 'Служебные помещения за кассовым залом (север)', on: [['think', 'Темно... Мой фонарик почти сел. Нужен запасной.', 3.5]],
        done: [['spawn', 'crawler', 'crA', { id: 'cr1', dormant: true, noFlee: true }], ['wait', 0.5], ['monsterPath', 'cr1', ['crB'], 6, [['despawn', 'cr1']]], ['scare', 'stinger'], ['think', 'Что это было?! Оно... убежало от света?', 4]] },
      { type: 'collect', item: 'battery', count: 2, text: 'Найдите батарейки (2)', sub: 'Заряда фонаря надолго не хватит', hint: 'Проверьте кассовый зал и вестибюль. [R] — заменить батарейку' },
      { type: 'reach', spot: 'gateSpot', r: 2.5, text: 'Проверьте выход на поверхность', on: [['wait', 2], ['scare', 'knock', 'gateSpot']],
        done: [['sound', 'knock', 'gateSpot', { volume: 1 }], ['wait', 1.5], ['think', 'Ворота заварены... С той стороны кто-то стучит. Нужно восстановить питание.', 5], ['wait', 4], ['complete']] },
    ],
    triggers: [{ area: [2, 3, 14, 6], actions: [['scare', 'whisper']] }],
    outro: 'Выход наверх заблокирован. Единственный путь — восстановить электричество станции.',
  },
  // ---------------------------------------------------------------- 3. Электричество
  {
    id: 'c1m3', chapter: 1, num: 3, title: 'Электричество', desc: 'Найти предохранители и восстановить питание станции.', reward: 160,
    size: [50, 32],
    env: { power: 'off', emergency: true, fog: 0.05, battery: 75, inventory: { battery: 1 }, director: { intensity: 1 } },
    map(m) {
      m.rect(2, 14, 8, 5, '.');
      m.path([[10, 16], [24, 16]], '-');
      m.path([[16, 16], [16, 6]], '-');
      m.path([[16, 6], [34, 6]], '-');
      m.path([[24, 16], [24, 28]], '-');
      m.path([[24, 28], [40, 28]], '-');
      m.path([[34, 6], [34, 22]], '-');
      m.path([[34, 22], [44, 22]], '-');
      m.room(18, 2, 5, 3, '-'); m.set(20, 5, '-');
      m.room(26, 18, 6, 5, '-'); m.set(25, 20, '-');
      m.room(36, 24, 6, 6, '-');
      m.path([[35, 14], [37, 14]], '-');
      m.door(36, 14, { id: 'dSub', metal: true });
      m.room(38, 10, 9, 9, 'd');
      m.door(10, 16, { id: 'dTech' });
      m.spot('start', 4, 16); m.spot('subHall', 42, 14); m.spot('crHome', 24, 16); m.spot('cr2', 30, 28);
      item(m, 21, 3, 'fuse', 1, 'fuse1'); item(m, 30, 21, 'fuse', 1, 'fuse2'); item(m, 40, 27, 'fuse', 1, 'fuse3');
      item(m, 34, 12, 'battery', 1, 'b1');
      dev(m, 'panel', 40, 10, 'panel1', { needs: 'fuse', count: 3, rotY: FACE.S, oz: -0.9, text: 'Предохранители установлены. Теперь главный рубильник.' });
      dev(m, 'lever', 46, 14, 'mainLever', { rotY: FACE.W, ox: 0.9, hold: 1.5, requiresFlag: 'fused', requiresText: 'Сначала установите предохранители' });
      lamp(m, 4, 15, 'beacon', { oy: 6 }); lamp(m, 16, 10, 'beacon', { oy: 2.8 }); lamp(m, 34, 18, 'beacon', { oy: 2.8 }); lamp(m, 42, 12, 'beacon', { oy: 8.5 });
      note(m, 44, 17, 'n_sub', 'Памятка электромеханика', 'Порядок восстановления питания:\n1. Установить предохранители в щит П-3 (3 шт).\n2. Включить главный рубильник.\n\nНе оставляйте двери открытыми — ОНИ идут на звук и на открытые проходы.', 'Смена №2');
    },
    start: 'start', startYaw: DIR.E,
    monsters: [{ kind: 'crawler', spot: 'crHome', wander: 10, id: 'crA' }, { kind: 'crawler', spot: 'cr2', wander: 6, id: 'crB', dormant: true }],
    steps: [
      { type: 'collect', item: 'fuse', count: 3, text: 'Найдите предохранители (3)', sub: 'Электрощитовые в техническом секторе', hint: 'Комнаты на севере, в центре и на юго-востоке сектора', on: [['think', 'Здесь что-то ползает. Держите фонарь наготове — свет их отпугивает.', 4.5]] },
      { type: 'use', id: 'panel1', text: 'Установите предохранители в щит подстанции', sub: 'Тяговая подстанция — восток', done: [['flag', 'fused']] },
      { type: 'use', id: 'mainLever', text: 'Включите главный рубильник', done: [['power', 'on'], ['wait', 1], ['say', 'Есть свет! Станция оживает...', 3.5, 'Вы'], ['wake', 'crB'], ['scare', 'scream']] },
      { type: 'reach', spot: 'start', r: 3, text: 'Вернитесь на станцию', done: [['complete']] },
    ],
    triggers: [{ on: 'pickup:fuse', actions: [['wake', 'crB']] }],
  },
  // ---------------------------------------------------------------- 4. Неизвестный сигнал
  {
    id: 'c1m4', chapter: 1, num: 4, title: 'Неизвестный сигнал', desc: 'Найти источник радиосообщения в южном тоннеле.', reward: 170,
    size: [56, 32],
    env: { power: 'on', lampBroken: 0.5, lampFlicker: 0.25, fog: 0.045, battery: 80, inventory: { battery: 1 } },
    map(m) {
      m.station(2, 4, 16, { pw: 6, name: 'ЗАРЯ' });
      m.stairs(17, 11);
      m.tunnel([[18, 12], [46, 12], [46, 24]]);
      m.room(28, 15, 6, 4, '-');
      m.door(30, 14, { id: 'dPost' });
      m.room(42, 26, 10, 3, '-');
      m.spot('start', 6, 8); m.spot('radioRoom', 47, 27); m.spot('t1', 22, 12); m.spot('t2', 44, 13); m.spot('mid', 34, 12);
      dev(m, 'radio', 50, 27, 'radio1', { freq: 104.7, rotY: FACE.N, oz: 0.6, once: true });
      m.ent('ambient', 49, 27, { sound: 'radio_voice', volume: 0.25 });
      body(m, 31, 17, 'lineman', { item: 'key_tech', text: 'Обходчик Смирнов... В руке зажат ключ от техсектора.', skin: 'lineman' });
      note(m, 29, 16, 'n_post', 'Записка на пульте связи', 'Связи с «Ковчегом» нет третьи сутки. Частота аварийного канала — 104.7.\nЕсли поймаешь — скажи им, что мы ещё живы.\nТо, что вылезло из «Глубины», не любит свет. Но не все из них.', 'С.');
      item(m, 36, 13, 'bottle', 1, 'bot1');
      item(m, 24, 13, 'battery', 1, 'b4');
    },
    start: 'start', startYaw: DIR.E,
    monsters: [{ kind: 'turned', spot: 't1', patrol: ['t1', 't2'], id: 'tur1' }],
    steps: [
      { type: 'reach', spot: 'radioRoom', r: 4, text: 'Найдите источник радиосигнала', sub: 'Помехи слышны из южного тоннеля', hint: 'Спуститесь в тоннель с восточного края платформы', on: [['sound', 'radio_static', null, { volume: 0.4 }], ['think', 'Радио? Кто-то выходит на связь!', 3]] },
      { type: 'use', id: 'radio1', text: 'Настройте радиостанцию', sub: 'Аварийная частота — 104.7', done: [['radio', 'Приём... Если кто-то слышит — это диспетчерская бункера «Ковчег». Говорит Лида.', 6, LIDA], ['wait', 6], ['radio', 'Станция «Заря», вы живы? Не шумите. Они слышат каждый шаг. Обращённые видят свет фонаря издалека.', 7, LIDA], ['wait', 7], ['radio', 'Путь к нам — через технический сектор. Ключ был у обходчика Смирнова. Он шёл к посту связи...', 6, LIDA]] },
      { type: 'collect', item: 'key_tech', text: 'Найдите ключ техсектора', hint: 'Пост связи в середине тоннеля' },
      { type: 'reach', spot: 'start', r: 4, text: 'Вернитесь на станцию «Заря»', done: [['complete']] },
    ],
    triggers: [{ spot: 'mid', r: 4, actions: [['scare', 'burst']] }],
  },
  // ---------------------------------------------------------------- 5. Закрытые двери
  {
    id: 'c1m5', chapter: 1, num: 5, title: 'Закрытые двери', desc: 'Найти ключи и открыть технический сектор.', reward: 180,
    size: [54, 34],
    env: { power: 'on', lampBroken: 0.35, lampFlicker: 0.3, fog: 0.04, battery: 80, inventory: { key_tech: 1, battery: 1 } },
    map(m) {
      m.path([[2, 20], [48, 20]], '-');
      m.room(6, 12, 7, 6, '-'); m.door(9, 18, { id: 'dA' }); m.set(9, 19, '-');
      m.room(18, 23, 8, 6, '-'); m.door(21, 21, { id: 'dB', locked: true, key: 'key_red' }); m.set(21, 22, '-');
      m.room(30, 10, 8, 7, 'l'); m.door(33, 18, { id: 'dC', locked: true, key: 'key_blue' }); m.set(33, 17, '-'); m.set(33, 19, '-');
      m.door(44, 20, { id: 'gTech', type: 'gate', locked: true, noUse: true, lockText: 'Ворота закрыты. Нужен код.' });
      m.room(45, 14, 6, 12, '-');
      m.set(43, 19, '-'); m.set(14, 19, '-'); m.set(27, 21, '-'); m.set(38, 19, '-');
      m.spot('start', 3, 20); m.spot('exit', 48, 18); m.spot('p1', 8, 20); m.spot('p2', 40, 20); m.spot('mid', 26, 20);
      item(m, 10, 13, 'key_red', 1, 'kred');
      item(m, 24, 27, 'key_blue', 1, 'kblue');
      note(m, 35, 12, 'codeNote', 'Служебная записка', 'Код ворот техсектора сменён.\nНовый: 2 1 7 4\n(как отметка глубины, только переставь последние цифры)\nЗапиши и сожги эту записку!', 'Начальник смены');
      dev(m, 'keypad', 43, 19, 'keypad1', { code: '2174', rotY: FACE.S, oz: -0.9 });
      locker(m, 14, 19, FACE.S); locker(m, 27, 21, FACE.N); locker(m, 38, 19, FACE.S); locker(m, 7, 15, FACE.E);
      item(m, 31, 15, 'medkit', 1, 'med1'); item(m, 19, 24, 'bottle', 1, 'bot1');
      note(m, 7, 13, 'n_locker', 'Записка в шкафчике', 'Если ОНО заметит тебя — прячься в шкаф и не дыши. Они глупые, но настойчивые. Подождут и уйдут.');
    },
    start: 'start', startYaw: DIR.E,
    monsters: [{ kind: 'turned', spot: 'mid', patrol: ['p1', 'p2'], id: 'tur1' }],
    steps: [
      { type: 'collect', item: 'key_red', text: 'Найдите красный ключ', hint: 'Раздевалка в северном крыле (первая дверь)', on: [['think', 'Ключ техсектора открыл внешнюю дверь. Дальше — внутренние замки.', 4]] },
      { type: 'collect', item: 'key_blue', text: 'Найдите синий ключ на складе', hint: 'Склад за красной дверью (юг)' },
      { type: 'read', note: 'codeNote', text: 'Найдите код от ворот техсектора', hint: 'Кабинет за синей дверью (север)' },
      { type: 'use', id: 'keypad1', text: 'Введите код на кодовом замке', done: [['door', 'gTech', 'open']] },
      { type: 'reach', spot: 'exit', r: 3, text: 'Пройдите в технический сектор', done: [['complete']] },
    ],
  },
  // ---------------------------------------------------------------- 6. Первый контакт
  {
    id: 'c1m6', chapter: 1, num: 6, title: 'Первый контакт', desc: 'Пережить встречу с неизвестным существом.', reward: 200,
    size: [54, 22],
    env: { power: 'on', lampBroken: 0.3, lampFlicker: 0.35, fog: 0.04, battery: 85, inventory: { battery: 1 } },
    map(m) {
      m.room(2, 12, 6, 6, '-');
      m.path([[8, 14], [40, 14]], '-', 2);
      m.set(41, 15, '#');
      m.room(20, 4, 10, 7, 'l');
      m.path([[24, 11], [24, 13]], '-');
      m.door(24, 12, { id: 'dCtrl' });
      m.door(41, 14, { id: 'herm1', type: 'hermetic', open: true });
      m.room(42, 12, 8, 6, 'k');
      m.spot('start', 4, 14); m.spot('control', 24, 7); m.spot('westSpawn', 9, 15); m.spot('safe', 45, 14); m.spot('hermDoor', 41, 14);
      dev(m, 'terminal', 26, 5, 'term1', { rotY: FACE.S, oz: -0.6, text: '«ВНИМАНИЕ: нарушение герметичности сектора 4. Биологическая угроза. Немедленно покинуть...»', who: 'Терминал' });
      dev(m, 'lever', 43, 12, 'hermLever', { rotY: FACE.S, oz: -0.9, prompt: 'Закрыть гермодверь' });
      note(m, 22, 9, 'n_ctrl', 'Журнал пульта', 'Датчики движения в секторе 4 сработали 211 раз за ночь.\nКамеры показывают пустые коридоры.\nНо я слышу шаги прямо над потолком.');
      item(m, 21, 5, 'battery', 1, 'b1');
    },
    start: 'start', startYaw: DIR.E,
    steps: [
      { type: 'reach', spot: 'control', r: 3, text: 'Доберитесь до пульта управления', on: [['think', 'Пульт управления должен показать, что творится в секторе.', 4]] },
      { type: 'use', id: 'term1', text: 'Включите терминал', done: [['wait', 1], ['scare', 'burst'], ['sound', 'slam', 'westSpawn', { volume: 1 }], ['wait', 0.6], ['spawn', 'turned', 'westSpawn', { id: 'beast', aggressive: true }], ['scare', 'stinger'], ['say', 'БЕГИ!', 2, 'Вы']] },
      { type: 'reach', spot: 'safe', r: 2.5, text: 'Бегите к гермодвери на востоке!', checkpoint: false },
      { type: 'use', id: 'hermLever', text: 'Закройте гермодверь!', checkpoint: false, done: [['door', 'herm1', 'seal'], ['wait', 1.5], ['sound', 'slam', 'hermDoor'], ['shake', 0.5], ['wait', 1.4], ['sound', 'slam', 'hermDoor'], ['shake', 0.5]] },
      { type: 'survive', time: 14, text: 'Не шевелитесь... Ждите', timerLabel: '', on: [['wait', 3], ['sound', 'growl', 'hermDoor', { volume: 1 }], ['wait', 3], ['sound', 'slam', 'hermDoor'], ['shake', 0.4], ['wait', 4], ['sound', 'scream', 'westSpawn', { volume: 0.6 }]], done: [['despawnAll'], ['think', 'Ушло... Что это было? Это был человек... когда-то.', 5], ['wait', 4], ['complete']] },
    ],
  },
  // ---------------------------------------------------------------- 7. Подземный лабиринт
  {
    id: 'c1m7', chapter: 1, num: 7, title: 'Подземный лабиринт', desc: 'Выбраться из запутанной системы тоннелей.', reward: 220,
    size: [52, 40],
    env: { power: 'on', lampBroken: 0.6, lampFlicker: 0.25, fog: 0.05, battery: 70, inventory: { battery: 1 }, director: { intensity: 1.3 } },
    map(m, rng) {
      const N = tunnelMaze(m, 2, 2, 10, 8, rng);
      const e = N(9, 7);
      m.rect(e.x + 2, e.y, 6, 2, '=');
      m.rect(e.x + 2, e.y - 4, 6, 4, '.');
      m.stairs(e.x + 4, e.y - 1);
      m.spot('start', 2, 2); m.spot('exit', e.x + 5, e.y - 3);
      const s1 = N(4, 3), s2 = N(7, 1), s3 = N(2, 6), s4 = N(8, 5);
      m.spot('c1', s1.x, s1.y); m.spot('c2', s2.x, s2.y); m.spot('c3', s3.x, s3.y); m.spot('half', s4.x, s4.y);
      note(m, N(1, 0).x, N(1, 0).y, 'n_maze', 'Обрывок схемы перегонов', 'Старые служебные ветки петляют. Обходчики говорили: держись юго-востока, всегда вниз и вправо. Где отметки мелом — там безопасно.');
      item(m, N(3, 2).x, N(3, 2).y, 'battery', 1, 'b1'); item(m, N(6, 4).x, N(6, 4).y, 'battery', 1, 'b2'); item(m, N(5, 6).x, N(5, 6).y, 'medkit', 1, 'm1');
      item(m, N(2, 1).x, N(2, 1).y, 'bottle', 1, 'bt1'); item(m, N(8, 2).x, N(8, 2).y, 'bottle', 1, 'bt2');
      body(m, N(5, 3).x, N(5, 3).y, 'lostman', { text: 'Он пытался выбраться... Записка в кармане: «вниз и вправо».', skin: 'stalker' });
    },
    start: 'start', startYaw: DIR.S,
    monsters: [{ kind: 'crawler', spot: 'c1', wander: 8, id: 'cr1' }, { kind: 'crawler', spot: 'c2', wander: 8, id: 'cr2' }, { kind: 'turned', spot: 'c3', wander: 10, id: 'tu1' }],
    steps: [
      { type: 'reach', spot: 'exit', r: 3.5, text: 'Найдите выход из тоннелей', sub: 'Служебные ветки перегонов', hint: 'Двигайтесь на юго-восток', on: [['think', 'Здесь легко заблудиться. Нужно держать направление.', 4]], done: [['say', 'Платформа! Отсюда до «Зари» один перегон.', 4, 'Вы'], ['wait', 4], ['complete']] },
    ],
    triggers: [{ spot: 'half', r: 4, actions: [['scare', 'burst'], ['wait', 1], ['scare', 'whisper']] }],
  },
  // ---------------------------------------------------------------- 8. Последний поезд
  {
    id: 'c1m8', chapter: 1, num: 8, title: 'Последний поезд', desc: 'Запустить поезд и покинуть станцию.', reward: 300,
    size: [60, 24],
    env: { power: 'emergency', emergency: true, lampBroken: 0.3, lampFlicker: 0.3, fog: 0.04, battery: 90, inventory: { battery: 2, medkit: 1, flare: 1 } },
    map(m) {
      m.station(4, 6, 40, { pw: 6, name: 'ЗАРЯ' });
      m.path([[3, 10], [1, 10], [1, 2], [19, 2]], '-');
      m.door(3, 10, { id: 'dWest' });
      m.room(20, 1, 6, 3, '-');
      m.door(44, 10, { id: 'dOffice', locked: true, key: 'key_tech', keepKey: true });
      m.room(45, 8, 6, 5, '-');
      m.tunnel([[44, 6], [59, 6]]); m.tunnel([[44, 14], [59, 14]]);
      m.tunnel([[0, 14], [3, 14]]);
      m.stairs(43, 13); m.stairs(4, 8);
      m.spot('start', 22, 11); m.spot('cabDoor', 34, 8); m.spot('wE', 56, 7); m.spot('wE2', 56, 15); m.spot('wW', 1, 15); m.spot('trainEnd', 58, 6);
      m.ent('train', 30, 6, { id: 'train1', axis: 'x', cars: 2, oz: 1.25, lit: false });
      item(m, 49, 11, 'keycard', 1, 'reverser');
      note(m, 46, 9, 'n_boss', 'Приказ начальника станции', 'Последний состав оставить на северном пути. Реверсивный ключ — у меня в столе.\nПеред запуском подать напряжение на контактный рельс (рубильник в северной подсобке).\nДа поможет нам Бог.');
      dev(m, 'lever', 23, 1, 'tractionLever', { rotY: FACE.S, oz: -0.9, hold: 1.2, prompt: 'Подать напряжение на рельс' });
      dev(m, 'trainControls', 33, 8, 'cab', { needs: 'keycard', needText: 'Нужен реверсивный ключ', prompt: 'Запустить поезд', hold: 2, requiresFlag: 'traction', requiresText: 'Нет напряжения на контактном рельсе', oz: -0.8 });
      item(m, 21, 2, 'flare', 1, 'fl1'); item(m, 12, 10, 'medkit', 1, 'm1');
    },
    start: 'start', startYaw: DIR.E,
    monsters: [{ kind: 'turned', spot: 'wE', id: 'd1', dormant: true }, { kind: 'turned', spot: 'wW', id: 'd2', dormant: true }],
    steps: [
      { type: 'collect', item: 'keycard', text: 'Найдите реверсивный ключ в кабинете начальника', hint: 'Кабинет за дверью в восточном торце платформы (ключ техсектора)', on: [['think', 'Последний поезд... Если его запустить — можно уехать к «Ковчегу».', 4.5]] },
      { type: 'use', id: 'tractionLever', text: 'Подайте напряжение на контактный рельс', hint: 'Северная подсобка — через западную дверь', done: [['flag', 'traction'], ['power', 'on'], ['train', 'train1', 'lit'], ['say', 'Поезд ожил! Скорее к кабине.', 3.5, 'Вы'], ['wake', 'd1'], ['wake', 'd2']] },
      { type: 'use', id: 'cab', text: 'Запустите поезд из кабины', done: [['sound', 'train_horn', 'cabDoor', { volume: 1 }], ['scare', 'scream']] },
      { type: 'defend', time: 45, text: 'Продержитесь, пока поезд прогревается', timerLabel: 'Прогрев', waves: [{ t: 3, kind: 'turned', spot: 'wE' }, { t: 12, kind: 'crawler', spot: 'wW' }, { t: 22, kind: 'turned', spot: 'wE2' }, { t: 32, kind: 'crawler', spot: 'wE' }], on: [['aggro']] },
      { type: 'reach', spot: 'cabDoor', r: 2.5, text: 'Садитесь в поезд!', checkpoint: false, done: [['despawnAll'], ['fade', 'out', 0.8], ['train', 'train1', 'move', 'trainEnd', 6, true], ['wait', 1], ['say', 'Поезд тронулся. Станция «Заря» осталась позади.', 5, 'Вы'], ['wait', 4], ['complete']] },
    ],
    outro: 'Поезд уходит в темноту перегона. Глава 1 завершена.',
  },
];
