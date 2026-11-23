// Глава 2 — «Глубже во тьму»
import { DIR, FACE, note, item, dev, lamp, locker, body, npc, LIDA } from './kit.js';

export const CH2 = [
  // ---------------------------------------------------------------- 9. Заброшенное депо
  {
    id: 'c2m1', chapter: 2, num: 1, title: 'Заброшенное депо', desc: 'Исследовать огромное железнодорожное депо.', reward: 220,
    size: [56, 40],
    env: { power: 'on', lampBroken: 0.55, lampFlicker: 0.25, fog: 0.032, battery: 85, inventory: { battery: 1 }, director: { intensity: 1 } },
    map(m) {
      m.tunnel([[0, 18], [9, 18]]);
      m.rect(10, 6, 36, 26, 'd');
      for (const y of [10, 16, 22, 27]) m.rect(12, y, 32, 2, 'r');
      m.stairs(10, 18); m.stairs(10, 19);
      m.door(46, 12, { id: 'dOffice', locked: true, noUse: true, lockText: 'Кабинет мастера заперт на кодовый замок' });
      m.room(47, 9, 7, 7, '-');
      m.door(28, 32, { id: 'gS', type: 'gate', locked: true, key: 'key_depot' });
      m.path([[28, 33], [28, 38]], '-', 2);
      m.spot('start', 2, 18); m.spot('center', 28, 19); m.spot('officeDoor', 45, 12); m.spot('tunnelS', 28, 37);
      m.spot('cr1', 14, 30); m.spot('cr2', 42, 7); m.spot('t1', 15, 14); m.spot('t2', 40, 25);
      m.ent('train', 24, 10, { id: 'tr1', axis: 'x', cars: 1, oz: 1.25 });
      m.ent('train', 34, 16, { id: 'tr2', axis: 'x', cars: 1, oz: 1.25 });
      m.ent('train', 20, 27, { id: 'tr3', axis: 'x', cars: 1, oz: 1.25 });
      body(m, 30, 19, 'worker', { text: 'Слесарь депо. На запястье ручкой: «1409».', skin: 'lineman' });
      note(m, 31, 20, 'depotCode', 'Записка слесаря', 'Мастер опять сменил код на кабинет. Говорит — дата, которую никто из нас не забудет.\n14.09 — день, когда всё началось.');
      dev(m, 'keypad', 45, 11, 'kpOffice', { code: '1409', rotY: FACE.W, ox: 0.9 });
      item(m, 50, 12, 'key_depot', 1, 'kdepot');
      note(m, 52, 10, 'n_master', 'Журнал мастера депо', 'Составы с «Глубины» шли по ночам. Опечатанные вагоны, охрана.\nОдин вагон вскрыли у нас на седьмом пути. Внутри — ящики со слизью и... коконы.\nСледующей ночью седьмой путь опустел. И бригада тоже.', 'Мастер Гуров');
      item(m, 20, 13, 'battery', 1, 'b1'); item(m, 38, 25, 'medkit', 1, 'm1'); item(m, 16, 24, 'bottle', 1, 'bt1'); item(m, 42, 18, 'flare', 1, 'fl1');
    },
    start: 'start', startYaw: DIR.E,
    monsters: [{ kind: 'crawler', spot: 'cr1', wander: 8 }, { kind: 'crawler', spot: 'cr2', wander: 8 }, { kind: 'turned', spot: 't1', patrol: ['t1', 't2'] }],
    steps: [
      { type: 'reach', spot: 'center', r: 4, text: 'Исследуйте депо', sub: 'Поезд дальше не пройдёт — пути завалены', on: [['think', 'Депо «Северное»... Здесь отстаивались составы. Огромное, тёмное место.', 4.5]] },
      { type: 'read', note: 'depotCode', text: 'Узнайте код от кабинета мастера', hint: 'Тело слесаря у второго состава' },
      { type: 'use', id: 'kpOffice', text: 'Откройте кабинет мастера (восток)', done: [['door', 'dOffice', 'open']] },
      { type: 'collect', item: 'key_depot', text: 'Возьмите ключ от южных ворот' },
      { type: 'event', event: 'unlock:gS', text: 'Откройте южные ворота депо' },
      { type: 'reach', spot: 'tunnelS', r: 3, text: 'Уходите в южный коридор', done: [['complete']] },
    ],
    triggers: [{ spot: 'center', r: 5, actions: [['wait', 3], ['sound', 'metal_screech', 'cr2', { volume: 0.9 }]] }],
  },
  // ---------------------------------------------------------------- 10. Затопленные тоннели
  {
    id: 'c2m2', chapter: 2, num: 2, title: 'Затопленные тоннели', desc: 'Пройти через затопленную станцию «Набережная».', reward: 230,
    size: [58, 36],
    env: { power: 'on', lampBroken: 0.55, lampFlicker: 0.3, fog: 0.05, wet: 1, battery: 85, inventory: { battery: 1 } },
    map(m) {
      m.tunnel([[2, 4], [30, 4], [30, 18]], '~');
      m.stairs(32, 17); m.door(33, 17, { id: 'dPump' });
      m.room(34, 15, 8, 7, 'w');
      m.tunnel([[30, 19], [30, 23]], '~');
      m.station(14, 24, 24, { pw: 4, name: 'НАБЕРЕЖНАЯ', columns: false });
      m.rect(14, 24, 24, 2, '~'); m.rect(14, 30, 24, 2, '~');
      m.stairs(37, 26);
      m.door(38, 28, { id: 'floodGate', type: 'gate', locked: true, noUse: true, lockText: 'Шлюз закрыт давлением воды' });
      m.path([[39, 28], [49, 28]], '-');
      m.room(50, 25, 6, 6, '-');
      m.spot('start', 3, 4); m.spot('pumpDoor', 32, 17); m.spot('platform', 26, 27); m.spot('exit', 53, 28);
      m.spot('w1', 14, 4); m.spot('w2', 30, 12); m.spot('w3', 22, 25);
      dev(m, 'valve', 36, 15, 'valve1', { rotY: FACE.S, oz: -0.8 });
      dev(m, 'valve', 40, 21, 'valve2', { rotY: FACE.N, oz: 0.8 });
      dev(m, 'lever', 37, 27, 'gateLever', { rotY: FACE.W, ox: 0.9, requiresFlag: 'pumped', requiresText: 'Сначала запустите насосы', prompt: 'Открыть шлюз' });
      note(m, 38, 18, 'n_pump', 'Инструкция насосной', 'При затоплении перегона открыть обе задвижки. Насосы снизят давление на шлюз, после чего его можно открыть рычагом на платформе.');
      note(m, 20, 27, 'n_flood', 'Записка на скамейке', 'Вода пришла снизу, тёплая и вонючая. Что-то плавало в ней. Мы ушли на «Сокол». Не лезь в воду — они слышат всплески.');
      item(m, 18, 4, 'battery', 1, 'b1'); item(m, 39, 19, 'medkit', 1, 'm1'); item(m, 24, 28, 'bottle', 2, 'bt1'); item(m, 30, 27, 'flare', 1, 'f1');
    },
    start: 'start', startYaw: DIR.E,
    monsters: [{ kind: 'turned', spot: 'w1', wander: 7 }, { kind: 'turned', spot: 'w2', wander: 6 }, { kind: 'crawler', spot: 'w3', wander: 8 }],
    steps: [
      { type: 'reach', spot: 'pumpDoor', r: 2.5, text: 'Пройдите затопленный перегон к насосной', sub: 'В воде шаги слышно гораздо дальше', on: [['think', 'Вода по колено. Каждый шаг — всплеск...', 3.5]] },
      { type: 'use', ids: ['valve1', 'valve2'], text: 'Откройте задвижки насосов (2)', done: [['flag', 'pumped'], ['sound', 'water_flow', 'pumpDoor', { volume: 0.9 }], ['say', 'Насосы загудели. Давление на шлюз падает.', 4, 'Вы']] },
      { type: 'reach', spot: 'platform', r: 3, text: 'Доберитесь до станции «Набережная»' },
      { type: 'use', id: 'gateLever', text: 'Откройте шлюзовые ворота', done: [['door', 'floodGate', 'open']] },
      { type: 'reach', spot: 'exit', r: 3, text: 'Уходите со станции', done: [['complete']] },
    ],
  },
  // ---------------------------------------------------------------- 11. Сигнал бедствия
  {
    id: 'c2m3', chapter: 2, num: 3, title: 'Сигнал бедствия', desc: 'Найти пропавшую группу «Сокол».', reward: 260,
    size: [54, 40],
    env: { power: 'on', lampBroken: 0.45, lampFlicker: 0.3, fog: 0.045, battery: 80, inventory: { battery: 1 } },
    map(m) {
      m.tunnel([[2, 6], [20, 6]]);
      m.stairs(21, 6); m.stairs(21, 7);
      m.room(22, 3, 8, 8, 'k');
      m.path([[26, 11], [26, 24]], '-');
      m.path([[10, 24], [44, 24]], '-');
      m.room(8, 26, 8, 6, 'k'); m.set(11, 25, '-');
      m.room(30, 13, 8, 6, 'k'); m.path([[27, 15], [29, 15]], '-'); m.door(28, 15, { id: 'dStore' });
      m.door(44, 25, { id: 'kotovDoor', locked: true, noUse: true, lockText: 'Заперто изнутри. Там кто-то есть...' });
      m.room(40, 26, 10, 7, 'k');
      m.path([[44, 33], [44, 38]], '-');
      m.spot('start', 3, 6); m.spot('kotovSpot', 44, 24); m.spot('exit', 44, 37);
      m.spot('t1', 18, 24); m.spot('t2', 36, 24); m.spot('t3', 26, 17);
      body(m, 12, 6, 'body1', { skin: 'military', text: 'Боец группы «Сокол». Жетон: «рядовой Беляев». Следы когтей...' });
      body(m, 25, 8, 'body2', { skin: 'military', text: 'Ещё один из «Сокола». Рядом пустая рация и гильзы.', item: 'battery' });
      body(m, 12, 29, 'body3', { skin: 'military', text: 'Радист группы. В руке сигнальный фальшфейер.', item: 'flare' });
      note(m, 27, 4, 'n_sokol', 'Боевой журнал группы «Сокол»', 'День 3. Задача: найти источник заражения ниже «Набережной».\nДень 4. Петров кашляет кровью. Глаза мутные.\nДень 5. Петров ушёл ночью. Утром его видели в тоннеле — он ползал по потолку.\nДень 6. Котов увёл раненого Лиса на склад. Остальные... я не знаю.', 'Лейтенант Ершов');
      npc(m, 46, 29, 'kotov', { name: 'Сержант Котов', skin: 'military', rotY: FACE.W, lines: [['Свой?.. Живой! Я сержант Котов, группа «Сокол». Нас было пятеро.', 5], ['Остальные обратились. Лис ранен — без аптечки до утра не дотянет.', 5], ['Если поможешь — мы дойдём до «Ковчега». Обещаю.', 4]] });
      npc(m, 42, 31, 'lis', { name: 'Ефрейтор Лис', skin: 'military', sit: true, rotY: FACE.N, prompt: 'Осмотреть раненого', lines: [['Ты... пришёл... Больно...', 3]] });
      dev(m, 'device', 43, 31, 'giveMed', { needs: 'medkit', needText: 'Нужна аптечка', prompt: 'Перевязать раненого', hold: 1.5, text: 'Лис: «Спасибо... Я не забуду».', who: 'Ефрейтор Лис' });
      item(m, 35, 16, 'medkit', 1, 'med1');
      item(m, 31, 17, 'bottle', 1, 'bt1');
    },
    start: 'start', startYaw: DIR.E,
    monsters: [{ kind: 'turned', spot: 't1', wander: 6 }, { kind: 'turned', spot: 't2', wander: 6 }, { kind: 'turned', spot: 't3', wander: 5 }],
    steps: [
      { type: 'use', ids: ['body1', 'body2', 'body3'], text: 'Найдите следы группы «Сокол» (3)', sub: 'Сигнал бедствия шёл с военного поста', hint: 'Тела лежат в тоннеле, на посту и в западной комнате', on: [['radio', '...группа «Сокол»... кто-нибудь... склад... мы на складе...', 5, 'Рация «Сокола»']] },
      { type: 'reach', spot: 'kotovSpot', r: 2, text: 'Найдите выживших', hint: 'Запертая дверь в восточном конце коридора', done: [['sound', 'knock', 'kotovSpot'], ['say', 'Кто там?! Назовись!', 3, 'Голос за дверью'], ['wait', 3], ['door', 'kotovDoor', 'open']] },
      { type: 'use', id: 'kotov', text: 'Поговорите с сержантом Котовым' },
      { type: 'choice', id: 'help', title: 'Помочь раненому Лису?', text: 'Примите решение', options: [{ text: 'Помочь: найти аптечку для Лиса', value: true, flag: 'savedSurvivors' }, { text: 'Уйти: самому бы выжить', value: false, flag: 'savedSurvivors' }] },
      { type: 'custom', check: (g, m) => m.flags.savedSurvivors === false || m.used.has('giveMed'), text: 'Найдите аптечку и перевяжите Лиса', hint: 'Аптечка на складе (северная комната)' },
      { type: 'reach', spot: 'exit', r: 3, text: 'Уходите на юг', on: [['call', (g, m) => { if (m.flags.savedSurvivors) g.hud.subtitle('Мы пойдём следом. Удачи, брат.', 4, 'Сержант Котов'); else g.hud.subtitle('Иди. Бог тебе судья.', 4, 'Сержант Котов'); }]], done: [['complete']] },
    ],
  },
  // ---------------------------------------------------------------- 12. Охотник
  {
    id: 'c2m4', chapter: 2, num: 4, title: 'Охотник', desc: 'Скрываться от монстра, реагирующего на звуки.', reward: 280,
    size: [56, 40],
    env: { power: 'on', lampBroken: 0.4, lampFlicker: 0.2, fog: 0.04, battery: 85, inventory: { battery: 1, bottle: 1 }, noiseMeter: true, director: { intensity: 0.6, silhouettes: false } },
    map(m) {
      m.path([[2, 20], [52, 20]], '-', 2);
      for (const x of [12, 28, 44]) m.path([[x, 4], [x, 36]], '-');
      m.path([[12, 4], [44, 4]], '-'); m.path([[12, 36], [44, 36]], '-');
      m.room(4, 8, 6, 6, '-'); m.door(10, 10, { id: 'd1' }); m.set(11, 10, '-');
      m.room(16, 8, 9, 7, 'd'); m.path([[13, 11], [15, 11]], '-');
      m.room(32, 8, 9, 7, 'd'); m.path([[29, 11], [31, 11]], '-');
      m.room(16, 25, 9, 8, 'd'); m.path([[13, 28], [15, 28]], '-');
      m.room(32, 25, 9, 8, 'd'); m.path([[29, 28], [31, 28]], '-');
      m.room(47, 8, 6, 8, '-'); m.path([[45, 12], [46, 12]], '-'); m.door(46, 12, { id: 'd6' });
      m.room(47, 28, 6, 6, '-'); m.path([[45, 30], [46, 30]], '-'); m.door(46, 30, { id: 'dExit' });
      m.spot('start', 3, 20); m.spot('hunter', 28, 21); m.spot('exit', 50, 31);
      item(m, 20, 11, 'radio_part', 1, 'rp1'); item(m, 36, 29, 'radio_part', 1, 'rp2'); item(m, 50, 10, 'radio_part', 1, 'rp3');
      locker(m, 17, 9, FACE.S); locker(m, 33, 9, FACE.S); locker(m, 17, 31, FACE.N); locker(m, 39, 31, FACE.N); locker(m, 5, 9, FACE.S); locker(m, 51, 14, FACE.N); locker(m, 24, 21, FACE.N);
      item(m, 8, 12, 'bottle', 2, 'bt1'); item(m, 22, 30, 'bottle', 1, 'bt2'); item(m, 40, 13, 'medkit', 1, 'm1');
      note(m, 6, 11, 'n_hunter', 'Записка охранника', 'Оно почти слепое. Но если уронишь гвоздь — через секунду будет рядом.\nПрисядь. Не беги. Брось что-нибудь в сторону, чтобы отвлечь.\nИ молись, чтобы рядом был шкаф.');
    },
    start: 'start', startYaw: DIR.E,
    monsters: [{ kind: 'hunter', spot: 'hunter', wander: 14, id: 'hunter' }],
    steps: [
      { type: 'collect', item: 'radio_part', count: 3, text: 'Соберите радиодетали (3)', sub: 'Охотник реагирует на звук. Приседайте, бросайте бутылки [Q], прячьтесь в шкафах', on: [['wait', 2], ['sound', 'growl', 'hunter', { volume: 1, rate: 0.7 }], ['think', 'Тише... Оно реагирует на звук.', 4]] },
      { type: 'reach', spot: 'exit', r: 2.5, text: 'Доберитесь до выхода (юго-восток)', done: [['door', 'dExit', 'close'], ['complete']] },
    ],
    triggers: [{ on: 'pickup:radio_part', actions: [['scare', 'slam']] }],
  },
  // ---------------------------------------------------------------- 13. Красный сектор
  {
    id: 'c2m5', chapter: 2, num: 5, title: 'Красный сектор', desc: 'Восстановить аварийную вентиляцию.', reward: 280,
    size: [56, 38],
    env: { power: 'off', emergency: true, fog: 0.055, fogColor: 0x070202, battery: 90, inventory: { battery: 1 }, director: { intensity: 1.2 } },
    map(m) {
      m.path([[2, 4], [50, 4]], '-'); m.path([[50, 4], [50, 12]], '-'); m.path([[50, 12], [6, 12]], '-'); m.path([[6, 12], [6, 20]], '-');
      m.path([[6, 20], [50, 20]], '-'); m.path([[50, 20], [50, 28]], '-'); m.path([[50, 28], [20, 28]], '-');
      m.set(30, 3, '-'); m.set(28, 13, '-'); m.set(16, 21, '-'); m.set(46, 27, '-');
      m.room(14, 25, 6, 6, '-');
      m.door(16, 31, { id: 'exitGate', type: 'gate', locked: true, noUse: true });
      m.path([[16, 32], [16, 35]], '-');
      m.spot('start', 2, 4); m.spot('exit', 16, 34); m.spot('c1', 24, 12); m.spot('c2', 36, 20); m.spot('c3', 40, 28);
      dev(m, 'valve', 30, 3, 'v1', { rotY: FACE.S, oz: -0.8 }); dev(m, 'valve', 28, 13, 'v2', { rotY: FACE.N, oz: 0.8 });
      dev(m, 'valve', 16, 21, 'v3', { rotY: FACE.N, oz: 0.8 }); dev(m, 'valve', 46, 27, 'v4', { rotY: FACE.S, oz: -0.8 });
      for (const [i, x, y] of [[1, 40, 4], [2, 20, 12], [3, 30, 20], [4, 35, 28]]) m.ent('steam', x, y, { id: 's' + i });
      dev(m, 'terminal', 16, 25, 'ventTerm', { rotY: FACE.S, oz: -0.6, text: 'Аварийная вентиляция: ЗАПУСК... Давление в норме.', who: 'Терминал' });
      for (const [x, y] of [[8, 4], [24, 4], [44, 4], [50, 8], [36, 12], [12, 12], [6, 16], [20, 20], [42, 20], [50, 24], [30, 28], [17, 27]]) lamp(m, x, y, 'beacon', { oy: 2.8 });
      note(m, 4, 4, 'n_red', 'Предупреждение', 'КРАСНЫЙ СЕКТОР. Магистрали под давлением!\nВентили перекрывать по порядку — каждый глушит следующий участок.\nПосле — запустить вентиляцию с терминала, иначе задохнёмся.');
      item(m, 26, 12, 'battery', 1, 'b1'); item(m, 48, 20, 'medkit', 1, 'm1'); item(m, 10, 20, 'flare', 1, 'f1');
    },
    start: 'start', startYaw: DIR.E,
    monsters: [{ kind: 'crawler', spot: 'c1', wander: 6 }, { kind: 'crawler', spot: 'c2', wander: 6 }, { kind: 'crawler', spot: 'c3', wander: 5 }],
    steps: [
      { type: 'use', ids: ['v1', 'v2', 'v3', 'v4'], text: 'Перекройте паровые магистрали (4 вентиля)', sub: 'Пар обжигает — не проходите сквозь него', hint: 'Вентили в нишах по ходу коридора', on: [['think', 'Аварийный свет... Воздух горячий. Надо перекрыть пар.', 4]] },
      { type: 'use', id: 'ventTerm', text: 'Запустите аварийную вентиляцию', done: [['door', 'exitGate', 'open'], ['say', 'Вентиляция загудела. Ворота открыты.', 3.5, 'Вы']] },
      { type: 'reach', spot: 'exit', r: 2.5, text: 'Покиньте красный сектор', done: [['complete']] },
    ],
    triggers: [1, 2, 3, 4].map((i) => ({ on: 'use:v' + i, actions: [['steam', 's' + i, false], ['toast', `Магистраль ${i} перекрыта`]] })),
  },
  // ---------------------------------------------------------------- 14. Подземная лаборатория
  {
    id: 'c2m6', chapter: 2, num: 6, title: 'Подземная лаборатория', desc: 'Изучить происхождение существ.', reward: 300,
    size: [58, 40],
    env: { power: 'on', lampBroken: 0.35, lampFlicker: 0.35, fog: 0.035, battery: 85, inventory: { battery: 1 }, director: { intensity: 1 } },
    map(m) {
      m.path([[2, 20], [9, 20]], '-');
      m.path([[10, 20], [50, 20]], 'l', 2);
      for (const [x, i] of [[12, 1], [26, 2], [40, 3]]) {
        m.room(x, 8, 10, 9, 'l'); m.path([[x + 4, 17], [x + 4, 19]], 'l'); m.door(x + 4, 18, { id: 'dN' + i, ...(i === 3 ? { locked: true, key: 'keycard', keepKey: true } : {}) });
        m.room(x, 25, 10, 9, 'l'); m.path([[x + 4, 22], [x + 4, 24]], 'l'); m.door(x + 4, 23, { id: 'dS' + i, ...(i === 3 ? { locked: true, key: 'keycard', keepKey: true } : {}) });
      }
      m.set(51, 21, '#'); m.door(51, 20, { id: 'labExit', type: 'gate', locked: true, noUse: true, lockText: 'Шлюз заблокирован системой безопасности' });
      m.path([[52, 20], [56, 20]], '-');
      m.spot('start', 3, 20); m.spot('exit', 55, 20); m.spot('c1', 20, 21); m.spot('c2', 36, 20); m.spot('a1', 5, 20); m.spot('a2', 30, 28); m.spot('a3', 16, 12);
      body(m, 17, 29, 'sci1', { skin: 'scientist', item: 'keycard', text: 'Сотрудник «Глубины». На бейдже: «доступ: категория Б».' });
      dev(m, 'terminal', 17, 9, 't1', { rotY: FACE.S, oz: -0.6, who: 'Терминал', text: 'Проект «Глубина», отчёт 41: на отметке −217 м обнаружена полость с живой органической массой. Масса реагирует на звук.' });
      dev(m, 'terminal', 31, 9, 't2', { rotY: FACE.S, oz: -0.6, who: 'Терминал', text: 'Отчёт 58: споры Объекта-217 вызывают у подопытных мутации за 48 часов. Подопытные теряют зрение, но слышат за сотню метров.' });
      dev(m, 'terminal', 45, 9, 't3', { rotY: FACE.S, oz: -0.6, who: 'Терминал', text: 'Отчёт 63: масса формирует «матку». Директор Белов запрещает эвакуацию: «Образцы важнее персонала». Куратор проекта — Л. Воронцова.' });
      item(m, 45, 30, 'sample', 1, 'sample1', { ox: 0, oz: 0, h: 0.9 });
      m.ent('prop', 45, 30, { model: 'metal_office_desk', solid: true });
      note(m, 30, 31, 'n_lab', 'Личная записка', 'Лида говорит, что мы всё контролируем. Но я видел, как масса проросла сквозь бетон в третьем боксе.\nЕсли образцы попадут наверх — это конец.', 'Лаборант Ким');
      item(m, 28, 12, 'battery', 1, 'b1'); item(m, 14, 30, 'medkit', 1, 'm1'); item(m, 42, 12, 'bottle', 1, 'bt1');
    },
    start: 'start', startYaw: DIR.E,
    monsters: [{ kind: 'crawler', spot: 'c1', wander: 6 }, { kind: 'crawler', spot: 'c2', wander: 8 }, { kind: 'turned', spot: 'a2', id: 'sciT', dormant: true }],
    steps: [
      { type: 'collect', item: 'keycard', text: 'Найдите ключ-карту сотрудника', hint: 'Тела учёных — в южных лабораториях', on: [['think', 'Лаборатория... Так вот откуда всё началось.', 4]] },
      { type: 'use', ids: ['t1', 't2', 't3'], text: 'Изучите отчёты на терминалах (3)' },
      { type: 'collect', item: 'sample', text: 'Возьмите образец Объекта-217', hint: 'Защищённая лаборатория — юго-восток', done: [['power', 'emergency'], ['circuit', 'emergency', true], ['sound', 'buzz', null, { volume: 1 }], ['say', 'ТРЕВОГА! Нарушение изоляции!', 3, 'Система'], ['wake', 'sciT', true], ['spawn', 'turned', 'a1', { aggressive: true }], ['spawn', 'crawler', 'a3', {}], ['door', 'labExit', 'open']] },
      { type: 'reach', spot: 'exit', r: 3, text: 'Бегите к шлюзу на востоке!', done: [['complete']] },
    ],
  },
  // ---------------------------------------------------------------- 15. Побег
  {
    id: 'c2m7', chapter: 2, num: 7, title: 'Побег', desc: 'Пережить преследование нескольких монстров.', reward: 320,
    size: [72, 22],
    env: { power: 'on', lampBroken: 0.4, lampFlicker: 0.35, fog: 0.04, battery: 90, inventory: { battery: 1, flare: 2, medkit: 1 }, director: { intensity: 0.3 } },
    map(m) {
      m.room(2, 8, 6, 6, 'l');
      m.path([[8, 10], [24, 10]], 'l', 2);
      m.path([[25, 10], [25, 4]], '-'); m.path([[25, 4], [40, 4]], '-');
      m.door(25, 9, { id: 'dA', open: true }); m.set(26, 9, 'l');
      m.door(33, 4, { id: 'dB', open: true, metal: true });
      m.path([[40, 4], [40, 16]], '-');
      m.stairs(41, 15); m.stairs(41, 16);
      m.tunnel([[42, 15], [61, 15]]);
      m.stairs(62, 15); m.stairs(62, 16);
      m.rect(63, 12, 7, 6, '.');
      m.spot('start', 4, 10); m.spot('A', 25, 6); m.spot('B', 40, 14); m.spot('C', 52, 15); m.spot('exit', 66, 14);
      m.spot('sp1', 3, 9); m.spot('sp2', 12, 10); m.spot('sp3', 30, 4); m.spot('sp4', 42, 16);
      item(m, 18, 11, 'battery', 1, 'b1'); item(m, 36, 4, 'flare', 1, 'f1'); item(m, 48, 16, 'medkit', 1, 'm1');
    },
    start: 'start', startYaw: DIR.E,
    steps: [
      { type: 'reach', spot: 'A', r: 2.5, text: 'Бегите! Выход через служебный коридор', on: [['wait', 1.5], ['scare', 'scream'], ['spawn', 'turned', 'sp1', { aggressive: true }], ['spawn', 'turned', 'sp2', { aggressive: true }], ['say', 'Они идут за мной!', 2.5, 'Вы']] },
      { type: 'reach', spot: 'B', r: 3, text: 'Закрывайте двери за собой — так вы их задержите', on: [['spawn', 'crawler', 'sp3', { aggressive: true }]] },
      { type: 'reach', spot: 'C', r: 4, text: 'В тоннель! Не останавливайтесь', on: [['spawn', 'hunter', 'sp4', { aggressive: true }], ['scare', 'stinger']] },
      { type: 'reach', spot: 'exit', r: 3, text: 'Доберитесь до платформы', done: [['despawnAll'], ['say', 'Оторвался... кажется.', 3, 'Вы'], ['wait', 3], ['complete']] },
    ],
  },
  // ---------------------------------------------------------------- 16. Заблокированный путь
  {
    id: 'c2m8', chapter: 2, num: 8, title: 'Заблокированный путь', desc: 'Открыть проход в нижние уровни метро.', reward: 340,
    size: [56, 30],
    env: { power: 'on', lampBroken: 0.4, lampFlicker: 0.3, fog: 0.045, battery: 85, inventory: { battery: 1 } },
    map(m) {
      m.station(2, 4, 18, { pw: 4, name: 'СОКОЛ' });
      m.tunnel([[20, 10], [52, 10]]);
      m.set(36, 11, '#'); m.door(36, 10, { id: 'collapse', rubble: true });
      m.path([[20, 7], [24, 7]], '-'); m.door(20, 7, { id: 'dN' }); m.set(24, 6, '-');
      m.room(22, 1, 8, 5, 'k');
      m.door(30, 12, { id: 'dSide' }); m.room(28, 13, 6, 5, '-');
      m.stairs(16, 12); m.door(16, 13, { id: 'herm', type: 'hermetic', open: true }); m.room(14, 14, 6, 5, 'k');
      m.stairs(19, 9);
      m.spot('start', 6, 7); m.spot('collapseSpot', 34, 10); m.spot('safe', 17, 16); m.spot('beyond', 48, 10); m.spot('t1', 10, 7); m.spot('t2', 26, 11); m.spot('hole', 38, 10);
      item(m, 26, 3, 'detonator', 1, 'det'); item(m, 31, 15, 'wire', 1, 'wire');
      dev(m, 'device', 35, 11, 'charge', { needs: 'detonator', needText: 'Нужен детонатор', prompt: 'Заложить заряд', hold: 2 });
      dev(m, 'device', 34, 10, 'wireDev', { needs: 'wire', needText: 'Нужен провод', prompt: 'Протянуть провод', hold: 1.5 });
      dev(m, 'device', 18, 17, 'plunger', { prompt: 'Подорвать заряд', requiresFlag: 'armed', requiresText: 'Заряд не готов', rotY: FACE.N, oz: 0.6 });
      note(m, 24, 2, 'n_arms', 'Опись склада ГО', 'Взрывчатка — 2 ящика (вскрыты).\nДетонатор — 1 шт.\nПровод — в подсобке у тоннеля.\nПодрывать только из укрытия за гермодверью!');
      item(m, 12, 8, 'battery', 1, 'b1'); item(m, 24, 4, 'medkit', 1, 'm1');
    },
    start: 'start', startYaw: DIR.E,
    monsters: [{ kind: 'turned', spot: 't1', wander: 5 }, { kind: 'turned', spot: 't2', wander: 6 }],
    steps: [
      { type: 'reach', spot: 'collapseSpot', r: 3, text: 'Найдите путь в нижние уровни', on: [['think', 'Путь вниз — через перегон за «Соколом».', 3.5]], done: [['think', 'Завал. Голыми руками не разобрать... Нужно взорвать.', 4]] },
      { type: 'collect', item: 'detonator', text: 'Найдите детонатор', hint: 'Склад гражданской обороны к северу от платформы' },
      { type: 'collect', item: 'wire', text: 'Найдите провод', hint: 'Подсобка у тоннеля' },
      { type: 'use', ids: ['charge', 'wireDev'], text: 'Заложите заряд и протяните провод', done: [['flag', 'armed']] },
      { type: 'reach', spot: 'safe', r: 2.5, text: 'Укройтесь за гермодверью' },
      { type: 'use', id: 'plunger', text: 'Подорвите завал', done: [['door', 'herm', 'close'], ['wait', 1.2], ['sound', 'hit', null, { volume: 1 }], ['sound', 'slam', 'collapseSpot', { volume: 1 }], ['shake', 1.2], ['door', 'collapse', 'open'], ['wait', 2], ['door', 'herm', 'open'], ['spawn', 'crawler', 'hole', { aggressive: true }], ['scare', 'stinger']] },
      { type: 'reach', spot: 'beyond', r: 3, text: 'Пройдите в открывшийся проход', done: [['complete']] },
    ],
    outro: 'Проход в нижние уровни открыт. Глава 2 завершена.',
  },
];
