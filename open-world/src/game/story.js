// Story «Обратная сторона города»: 5 chapters × 5 missions, 3 endings
import { G, rand, pick } from '../core/util.js';
import { CURB } from '../world/citygen.js';
import { addBust } from '../ai/traffic.js';

export const LOOKS = {
  denis: { skin: '#e0ac88', hair: '#1a1410', shirt: '#3a3a3a', jacket: '#2a3a2a', pants: '#2a2a2a', shoes: '#1a1a1a', hairStyle: 'bald', beard: true, scale: 1.04, sleeves: 1 },
  mira: { skin: '#f1c8a8', hair: '#6a2010', shirt: '#e8e8e8', jacket: '#8a1a2a', pants: '#1a2a4a', shoes: '#1a1a1a', hairStyle: 'long', female: true, scale: 0.96, sleeves: 1 },
  rico: { skin: '#a06a48', hair: '#1a1410', shirt: '#c8a020', jacket: '#1a1a1a', pants: '#3a3a3a', shoes: '#e8e8e8', hairStyle: 'cap', scale: 1.0 },
  zoya: { skin: '#f4d4bc', hair: '#111111', shirt: '#3fd0ff', jacket: '#2a2a4a', pants: '#1a1a1a', shoes: '#e8e8e8', hairStyle: 'bun', female: true, glasses: true, scale: 0.94 },
  lanskoy: { skin: '#f1c8a8', hair: '#a0a0a0', shirt: '#f0f0f0', jacket: '#1a1c22', pants: '#1a1c22', shoes: '#111111', hairStyle: 'short', scale: 1.02, sleeves: 1 },
  gromov: { skin: '#e0ac88', hair: '#3a2618', shirt: '#1a2a5a', jacket: '#141c38', pants: '#141a2a', shoes: '#111111', hairStyle: 'cap', beard: true, scale: 1.06, vest: '#20283a' },
  belova: { skin: '#f1c8a8', hair: '#c8a060', shirt: '#e8e8e8', jacket: '#3a3a3a', pants: '#1a1a1a', shoes: '#1a1a1a', hairStyle: 'bun', female: true, scale: 0.97, sleeves: 1 },
  sedoy: { skin: '#e8b898', hair: '#e8e0d0', shirt: '#2a6a9a', jacket: '#1a1a1a', pants: '#1a1a1a', shoes: '#1a1a1a', hairStyle: 'short', beard: true, scale: 1.03 },
  marat: { skin: '#c68e68', hair: '#1a1410', shirt: '#c8a020', jacket: '#5a1a1a', pants: '#2a2a2a', shoes: '#5a3a20', hairStyle: 'beanie', beard: true, scale: 1.05 },
  vershinin: { skin: '#f1c8a8', hair: '#5a3a20', shirt: '#c8c0b0', jacket: '#5a5a5a', pants: '#3a3a3a', shoes: '#3a2a1a', hairStyle: 'short', glasses: true, scale: 0.98, sleeves: 1 },
  klyk: { skin: '#e0ac88', hair: '#e8c22a', shirt: '#1a1a1a', jacket: '#c81a1a', pants: '#1a1a1a', shoes: '#e8e8e8', hairStyle: 'short', scale: 1.0 },
  gosha: { skin: '#f1c8a8', hair: '#8a6a3a', shirt: '#e8a83a', jacket: null, pants: '#6a5a3a', shoes: '#e8e8e8', hairStyle: 'long', scale: 0.95, sleeves: 0 },
  thug: { skin: '#e0ac88', hair: '#1a1410', shirt: '#2a2a2a', jacket: '#1a1a1a', pants: '#1a1a1a', shoes: '#1a1a1a', hairStyle: 'bald', scale: 1.05 },
  merc: { skin: '#c68e68', hair: '#1a1410', shirt: '#2a3a2a', jacket: '#1a2a1a', pants: '#2a3a2a', shoes: '#1a1a1a', hairStyle: 'beanie', vest: '#1a1a1a', scale: 1.05 },
};
const P = (x, z, y) => ({ x, z, y });
// position on the road lane next to a block edge; heading towards +z (h=0) etc.
const lane = (x, z) => ({ x, z, y: 0 });
const A = 'Алекс', D = 'Денис', Mi = 'Мира', R = 'Рико', Z = 'Зоя', L = 'Ланской', Gr = 'Громов', B = 'Белова', S = 'Седой', Ma = 'Марат', Ve = 'Вершинин', K = 'Клык', Go = 'Гоша';

function near(p, dx, dz, y) { return { x: p.x + dx, z: p.z + dz, y }; }
function face(from, to) { return Math.atan2(to.x - from.x, to.z - from.z); }

// --------------------------------------------------------------------------------------------
const CH1 = 'Глава 1. Новое начало', CH2 = 'Глава 2. Большие деньги', CH3 = 'Глава 3. Тайны мегаполиса', CH4 = 'Глава 4. Город в хаосе', CH5 = 'Глава 5. Цена свободы';

export const STORY = [
  // ========================== CHAPTER 1 ==========================
  { chapter: CH1, title: 'Возвращение домой', letter: 'А', reward: 200, get start() { return near(G.city.landmarks.safehouse, 0, 1.5); },
    async run(M) {
      const sh = M.LM.safehouse, car = M.LM.safehouseCar;
      M.setTime(Math.max(G.hour, 8)); M.weather('clear');
      const old = M.car('rust', { x: car.x, z: car.z, y: CURB }, car.rot, { keep: true });
      await M.cutscene([
        M.shot([sh.x - 60, 70, sh.z + 90], [sh.x, 20, sh.z], { to: [sh.x - 20, 30, sh.z + 50], dur: 7 }),
        M.around(sh, 0.6, 7, 2.2, { orbit: 0.5, dur: 6 }),
        M.around(old.pos, 2.2, 5, 1.6, { orbit: -0.4, dur: 5, lookH: 0.5 }),
      ], [
        [A, 'Семь лет. Семь лет я не видел этот город.'],
        [A, 'Небоскрёбы выросли, а дворы остались прежними.'],
        [A, 'Отец говорил: у каждого города есть обратная сторона. Тогда я не понимал, о чём он.'],
        [A, 'Ладно. Ключи от старой «Волны» всё ещё у меня. Посмотрим, заведётся ли.'],
      ]);
      await M.enterCar(old, 'Сядьте в свою старую машину «Волна»');
      M.say(A, 'Заводится! Старушка, ты меня дождалась.');
      await M.wait(2.5);
      M.say(D, '(звонок) Алекс?! Чтоб меня… Ты правда вернулся? Приезжай ко мне в автосервис, в промзону. Есть разговор.');
      await M.goto(near(M.LM.garage, 0, 6), { text: 'Приезжайте в <b>гараж Дениса</b> в промзоне', r: 6, car: 'vehicle' });
      const den = M.ped(near(M.LM.garage, 2, 1), { look: LOOKS.denis, name: 'Денис', heading: Math.PI });
      await M.goto(near(M.LM.garage, 0, 2.5), { text: 'Подойдите к Денису', r: 3, car: 'none', marker: false });
      await M.cutscene([M.around(den.h.pos, 2.5, 4, 1.7, { orbit: 0.6, dur: 9 })], [
        [D, 'Морган! Живой! А мы тут думали, тебя где-нибудь на севере волки съели.'],
        [A, 'Почти угадал. Как бизнес, Денис?'],
        [D, 'Чиню тачки, иногда перегоняю — не задавай лишних вопросов. Город изменился, брат. Всем теперь заправляет «Вертекс».'],
        [A, 'Корпорация Ланского? Та, что строила башню, когда я уезжал?'],
        [D, 'Она самая. Скупают кварталы, полиция у них с руки ест. Ладно, ты с дороги. Деньги нужны? Есть работа.'],
      ]);
    } },
  { chapter: CH1, title: 'Первая работа', letter: 'Д', reward: 800, get start() { return near(G.city.landmarks.garage, 0, 2.5); },
    async run(M) {
      const g = M.LM.garage, docks = M.LM.docks;
      await M.cutscene([M.around(near(g, 0, 0, CURB), 3.0, 5, 1.8, { orbit: 0.4, dur: 7 })], [
        [D, 'Клиент заказал перегон седана в порт. Машина дорогая — довези без царапин.'],
        [D, 'И быстро: у него паром через три минуты. Опоздаешь — не заплатит.'],
        [A, 'Перегнать машину. Звучит легко.'],
        [D, 'В этом городе ничего не бывает легко. Удачи.'],
      ]);
      const v = M.car('sedan', { x: g.x + 8, z: g.z + 8, y: 0 }, Math.PI / 2, { color: '#1a1a1a' });
      await M.enterCar(v, 'Сядьте в чёрный седан');
      M.timer(185, 'Паром ушёл — клиент недоволен');
      M.protectCar(v, 'Седан');
      M.failIf(() => v.health < 450 ? 'Машина слишком сильно повреждена' : null);
      await M.goto({ x: docks.x - 40, z: docks.z }, { text: 'Доставьте седан в <b>порт</b> (повреждения не более 50%)', r: 8, car: v });
      M.stopTimer();
      M.say('Клиент', 'Отличная работа. Денис не соврал — ты профи.');
      await M.wait(3);
    } },
  { chapter: CH1, title: 'Уличные гонки', letter: 'Р', reward: 2500, get start() { return near(G.city.landmarks.stadium, 0, 1); },
    async run(M) {
      const st = M.LM.stadium;
      M.setTime(21.5);
      const rico = M.ped(near(st, 3, 2), { look: LOOKS.rico, name: 'Рико', heading: Math.PI });
      await M.cutscene([M.around(rico.h.pos, 0.5, 5, 1.8, { orbit: 0.7, dur: 9 })], [
        [R, 'Так ты и есть тот Морган, про которого Денис трещит? Говорят, ты раньше гонял.'],
        [A, 'Раньше много чего было.'],
        [R, 'Покажи. Круг по кварталу: три соперника, пять контрольных точек. Победишь — приму в команду.'],
        [R, 'Возьми мою «Вектор GT». Разобьёшь — будешь должен.'],
      ]);
      const sx = 501.75, sz = 330;
      const mine = M.car('sport', { x: sx, z: sz }, Math.PI, { color: '#d8201a' });
      const opps = [M.car('sport', { x: sx + 3.5, z: sz }, Math.PI, { color: '#1a5ad8', driver: true }), M.car('muscle', { x: sx, z: sz + 9 }, Math.PI, { color: '#1a1a1a', driver: true }), M.car('sport', { x: sx + 3.5, z: sz + 9 }, Math.PI, { color: '#f0d020', driver: true })];
      opps.forEach((o, i) => { o.raceMax = 33 + i * 2; });
      await M.enterCar(mine, 'Сядьте в красный «Вектор GT»');
      M.text('Приготовьтесь…');
      for (const n of [3, 2, 1]) { G.hud.banner(String(n), '', 0.9); G.audio.beep(600, 0.15, 0.2); await M.wait(1); }
      G.hud.banner('ВПЕРЁД!', '', 1); G.audio.beep(1200, 0.3, 0.2);
      await M.race([lane(500, 0), lane(200, 0), lane(200, -300), lane(600, -300), lane(600, 300), lane(500, 300)], opps, { text: 'Уличная гонка' });
      M.say(R, 'Ха! Ну ты даёшь! Добро пожаловать в семью, Морган.');
      await M.wait(3);
    } },
  { chapter: CH1, title: 'Старый знакомый', letter: 'Д', reward: 1500, get start() { return near(G.city.landmarks.garage, 0, 2.5); },
    async run(M) {
      const mall = M.LM.mall;
      M.say(D, 'Есть тут один тип — Гоша. Занял у меня пять кусков и пропал. Видели его у ТЦ «Галактика».');
      M.say(D, 'Только аккуратно. Он мой двоюродный брат… к сожалению.');
      await M.goto(near(mall, 0, 4), { text: 'Найдите Гошу у <b>ТЦ «Галактика»</b>', r: 25 });
      const gv = M.car('compact', { x: mall.x + 6, z: mall.z + 9.5 }, Math.PI / 2, { color: '#e8c22a', driver: true, driverLook: LOOKS.gosha, health: 900 });
      M.say(Go, 'Алекс?! Морган?! Нет-нет-нет, я не при делах!');
      await M.wait(1.5);
      M.drive(gv, { mode: 'flee', max: 30 });
      await M.chase(gv, { mode: 'stop', text: 'Остановите машину Гоши — <b>протараньте её</b>', hp: 0.45 });
      gv.throttle = 0; gv.brake = 1;
      M.say(Go, 'Всё! Всё, сдаюсь! Вот деньги, все до копейки! Передай Денису, что я больше не буду!');
      await M.wait(2);
      M.say(A, 'И держись подальше от неприятностей, Гоша.');
      M.say(Go, 'Кстати… слышал, ты сын Михаила Моргана? Того, что погиб на стройке «Вертекса»? Странная была история…');
      await M.wait(5);
      M.say(A, '(про себя) Странная история? Отец погиб в аварии. Так нам сказали.');
      await M.wait(4);
    } },
  { chapter: CH1, title: 'Неожиданная встреча', letter: 'М', reward: 1200, get start() { return near(G.city.landmarks.club, 1.5, 0); },
    async run(M) {
      const c = M.LM.club;
      M.setTime(22.5);
      const mira = M.ally(near(c, -4, 2), { look: LOOKS.mira, name: 'Мира', heading: Math.PI / 2 });
      const thugs = M.enemies(near(c, -6, 2), 3, { weapon: 'fists', look: LOOKS.thug, spread: 2, passive: true });
      thugs.forEach((t) => { t.weapon = null; t.h.hold(null); t.state = 'stand'; t.faceTo = mira.h.pos; });
      await M.cutscene([M.around(near(c, -5, 2, CURB), -1.2, 6, 1.9, { orbit: 0.5, dur: 8 })], [
        ['Громила', 'Журналисточка, тебе же сказали — не лезь в дела «Вертекса».'],
        [Mi, 'Руки убрал! Я напишу про вас всё, что знаю!'],
        [A, 'Мира?.. Мира Соколова?'],
        ['Громила', 'А ты кто такой? Иди своей дорогой, герой.'],
      ]);
      M.protect(mira, 'Мира');
      for (const t of thugs) { t.state = 'fight'; t.threat = G.player; t.angryAt = G.player; }
      await M.eliminate(thugs, 'Разберитесь с громилами (кулаками)');
      await M.talk([[Mi, 'Алекс Морган! Глазам не верю. Ты всё такой же — сначала бьёшь, потом здороваешься.'], [A, 'Привет, Мира. Кто эти парни?'], [Mi, 'Охрана «Вертекса». Потом расскажу. Увези меня отсюда, пока не приехали остальные!']]);
      const v = M.car('sedan', { x: c.x + 5, z: c.z + 6, y: 0 }, 0, { color: '#2a3a5a' });
      await M.enterCar(v, 'Сядьте в машину вместе с Мирой');
      M.passenger(mira, v);
      const chaser = M.car('suv', { x: c.x + 8.7, z: c.z - 140 }, 0, { color: '#1a1a1a', driver: true });
      M.drive(chaser, { mode: 'pursue', max: 32, aggr: 0.9 }).setTarget(() => G.player.wpos());
      M.say(Mi, 'За нами хвост! Чёрный внедорожник!');
      const home = { x: -350, z: -591 };
      await M.goto(home, { text: 'Отвезите Миру домой, в <b>спальный район</b>', r: 8, car: 'vehicle' });
      M.unpassenger(mira, v);
      await M.talk([[Mi, 'Спасибо. Я пишу расследование про «Вертекс». Про стройку, где погибли люди… и твой отец тоже.'], [A, 'Мой отец погиб в аварии.'], [Mi, 'Ты правда в это веришь? Позвони мне, когда будешь готов узнать правду.']]);
    } },
  // ========================== CHAPTER 2 ==========================
  { chapter: CH2, title: 'Загадочный заказ', letter: 'З', reward: 5000, get start() { return near(G.city.landmarks.mall, -6, 4); },
    async run(M) {
      M.say(Z, '(незнакомый номер) Алекс Морган? Меня зовут Зоя. Я знаю, кто ты, и знаю, что тебе нужны деньги.');
      M.say(Z, 'В парке на севере тайник с кейсом. Доставь его в деловой центр. Плачу пять тысяч. Без вопросов.');
      await M.wait(4);
      await M.collect([{ x: 50, z: -440, y: CURB, note: 'Металлический кейс с логотипом «В». Тяжёлый.' }], 'Заберите кейс из тайника в парке');
      M.say(A, 'Логотип «Вертекса». Интересно, что внутри.');
      const drop = { x: -150, z: 109 };
      M.give('pistol', 48);
      await M.goto(drop, { text: 'Доставьте кейс в <b>деловой центр</b>', r: 6 });
      const en = M.enemies({ x: drop.x + 14, z: drop.z - 6 }, 4, { look: LOOKS.thug });
      M.say(Z, 'Чёрт, это засада! Они знали о сделке. Отбивайся!');
      await M.eliminate(en, 'Отбейтесь от засады');
      const zoya = M.ally({ x: drop.x - 3, z: drop.z - 6 }, { look: LOOKS.zoya, name: 'Зоя' });
      await M.goto(near(zoya.h.pos, 0, 1.5), { text: 'Отдайте кейс Зое', r: 2.5, car: 'none' });
      await M.cutscene([M.around(zoya.h.pos, 1, 3.5, 1.7, { orbit: 0.5, dur: 8 })], [
        [Z, 'Внутри жёсткие диски бухгалтерии «Вертекса». Черновики, которые забыли уничтожить.'],
        [A, 'Ты хакер?'], [Z, 'Я — тот, кому Ланской задолжал. Как и тебе, Морган. Мы ещё поработаем.'],
      ]);
    } },
  { chapter: CH2, title: 'Ночной город', letter: 'З', reward: 4000, get start() { return near(G.city.landmarks.vertex, 10, 2); },
    async run(M) {
      M.setTime(23.3); M.weather('rain');
      const vx = M.LM.vertex;
      M.say(Z, 'Каждую ночь помощник Ланского возит что-то в порт. Проследи за ним. Не приближайся — он нервный.');
      const v = M.car('rust', { x: vx.x + 14, z: vx.z + 8, y: 0 }, 0, { color: '#4a4a4a', keep: false });
      if (G.player.state !== 'car') await M.enterCar(v, 'Сядьте в неприметную машину');
      const limo = M.car('sedan', { x: vx.x - 6, z: vx.z + 11 }, Math.PI / 2, { color: '#0a0a0a', driver: true });
      const ai = M.drive(limo, { mode: 'route', max: 17, arrive: 10 }); ai.setTarget({ x: M.LM.docks.x - 40, z: M.LM.docks.z });
      await M.tail(limo, { until: () => M.dist(limo.pos, { x: M.LM.docks.x - 40, z: M.LM.docks.z }) < 14 });
      M.stopDrive(limo);
      const a = M.ped(near(limo.pos, 3, 0), { look: LOOKS.lanskoy, name: 'Помощник' }), b = M.ped(near(limo.pos, 5, 1.5), { look: LOOKS.marat, name: 'Незнакомец' });
      a.faceTo = b.h.pos; b.faceTo = a.h.pos;
      await M.photo(() => ({ x: a.h.pos.x, y: 1.5, z: a.h.pos.z }), 'Сфотографируйте встречу помощника');
      M.say(Z, 'Снимок есть! Это Марат — глава Портовых. «Вертекс» работает с бандами. Уходи тихо.');
      await M.wait(4);
    } },
  { chapter: CH2, title: 'Опасный соперник', letter: 'Р', reward: 8000, get start() { return { x: 990, z: 40, y: 0 }; },
    async run(M) {
      M.setTime(19.8);
      const klyk = M.ped({ x: 1012, z: 30, y: 0 }, { look: LOOKS.klyk, name: 'Клык', heading: -Math.PI / 2 });
      await M.cutscene([M.around(klyk.h.pos, -0.8, 5, 1.7, { orbit: 0.6, dur: 8 })], [
        [K, 'Это ты обогнал ребят Рико? Новичкам везёт.'],
        [A, 'А ты, наверное, Клык. Рико говорил, что ты гоняешь на деньги «Вертекса».'],
        [K, 'Я гоняю на свои. Кольцевая, восемь километров. Ставка — восемь тысяч. Боишься?'],
      ]);
      const mine = M.car('super', { x: 1001.75, z: 10 }, Math.PI, { color: '#2adf6a' });
      const opps = [M.car('super', { x: 1005.25, z: 10 }, Math.PI, { color: '#e83a1a', driver: true }), M.car('sport', { x: 1001.75, z: 20 }, Math.PI, { color: '#1a1a1a', driver: true }), M.car('sport', { x: 1005.25, z: 20 }, Math.PI, { color: '#e86a1a', driver: true }), M.car('muscle', { x: 1001.75, z: 30 }, Math.PI, { color: '#1a3ac8', driver: true })];
      opps.forEach((o, i) => { o.raceMax = i === 0 ? 52 : 44 + i; });
      await M.enterCar(mine, 'Сядьте в «Феникс R»');
      for (const n of [3, 2, 1]) { G.hud.banner(String(n), '', 0.9); G.audio.beep(600, 0.15, 0.2); await M.wait(1); }
      G.hud.banner('ВПЕРЁД!', '', 1);
      await M.race([lane(1000, -500), lane(1000, -1000), lane(500, -1000), lane(0, -1000), lane(0, -800), lane(0, -400), lane(0, 0), lane(500, 0), lane(1000, 0)], opps, { text: 'Гонка по кольцевой' });
      M.say(K, 'Ладно… Ты быстрый. Но помни: в этом городе быстрые долго не живут.');
      await M.wait(3);
    } },
  { chapter: CH2, title: 'Пропавший автомобиль', letter: 'Д', reward: 6000, get start() { return near(G.city.landmarks.garage, 0, 2.5); },
    async run(M) {
      M.say(D, 'Алекс, беда! Портовые угнали мой «Буйвол 70». Это не просто машина — это память об отце!');
      M.say(D, 'Говорят, его спрятали где-то в порту, среди контейнеров. Верни его — в долгу не останусь.');
      const spot = { x: 860, z: 559 };
      await M.goto(spot, { text: 'Найдите «Буйвол 70» в <b>порту</b>', r: 45, marker: false });
      const car = M.car('muscle', { x: spot.x + 6, z: spot.z, y: 0 }, Math.PI / 2, { color: '#c81a1a' });
      const g = M.enemies({ x: spot.x + 2, z: spot.z - 5 }, 4, { look: LOOKS.thug, weapon: 'pistol' });
      M.say(A, 'Вот он. И охрана. Ну конечно.');
      await M.eliminate(g, 'Разберитесь с охраной');
      await M.enterCar(car, 'Сядьте в «Буйвол 70»');
      M.protectCar(car, '«Буйвол 70»');
      await M.loseCops(2, 'Портовые вызвали полицию — <b>оторвитесь</b>');
      await M.goto(near(M.LM.garage, 0, 7), { text: 'Верните машину в гараж Дениса', r: 7, car });
      M.say(D, 'Родной мой! Алекс, ты — человек. С меня причитается.');
      await M.wait(3);
    } },
  { chapter: CH2, title: 'Сделка с последствиями', letter: 'С', reward: (st) => st.flags.keptMoney ? 20000 : 2000, get start() { return near(G.city.landmarks.factory, 4, 0); },
    async run(M, st) {
      const f = M.LM.factory;
      M.setTime(20.5);
      const sedoy = M.ped(near(f, 8, 4), { look: LOOKS.sedoy, name: 'Седой', heading: -Math.PI / 2 });
      const buyer = M.ped(near(f, 5, 4), { look: LOOKS.lanskoy, name: 'Покупатель', heading: Math.PI / 2 });
      await M.cutscene([M.around(near(f, 6.5, 4, CURB), 0.3, 6, 1.9, { orbit: 0.6, dur: 9 })], [
        [S, 'Ты — тот самый Морган? Денис сказал, тебе можно доверять. Будешь посредником.'],
        ['Покупатель', 'Деньги в сумке. Двадцать тысяч. Товар?'],
        [S, 'Товар у моих ребят. Морган, проверь сумку.'],
        [A, 'Что-то тут не так… Слишком тихо.'],
      ]);
      const cops = M.enemies(near(f, 30, 10), 5, { look: LOOKS.gromov, weapon: 'pistol' });
      sedoy.team = 'ally'; sedoy.weapon = 'pistol'; sedoy.state = 'combat'; sedoy.h.hold('pistol');
      buyer.state = 'flee'; buyer.threat = cops[0];
      M.say(Gr, 'Всем лечь! Полиция! … Взять Моргана, остальных — не жалеть!');
      M.give('smg', 96);
      await M.eliminate(cops, 'Это подстава Громова! Отбейтесь');
      M.say(S, 'Громов… Продажный пёс. Морган, хватай деньги и уходи!');
      await M.collect([near(f, 6, 4, CURB)], 'Заберите сумку с деньгами');
      await M.loseCops(3, 'Сбегите с деньгами — <b>оторвитесь от полиции</b>');
      const c = await M.choice('Двадцать тысяч в сумке. Денис по уши в долгах перед бандитами. Что сделать с деньгами?', ['Оставить себе — заслужил', 'Отдать Денису, чтобы закрыть его долги']);
      st.flags.keptMoney = c === 0; st.karma += c === 0 ? -1 : 2;
      M.say(A, c === 0 ? 'Мне эти деньги нужнее. Денис взрослый, разберётся.' : 'Денис, это тебе. Закрой долги и спи спокойно.');
      if (c === 1) M.say(D, '(звонок) Брат… Я не знаю, что сказать. Ты меня спас.');
      await M.wait(4);
    } },
  // ========================== CHAPTER 3 ==========================
  { chapter: CH3, title: 'Исчезнувший журналист', letter: 'М', reward: 3000, get start() { return { x: -350, z: -591, y: CURB }; },
    async run(M) {
      const mira = M.ally({ x: -346, z: -592 }, { look: LOOKS.mira, name: 'Мира' });
      await M.cutscene([M.around(mira.h.pos, 2, 4, 1.7, { orbit: 0.5, dur: 9 })], [
        [Mi, 'Алексей Вершинин, мой коллега, пропал три дня назад. Он копал под «Вертекс» — под ту самую стройку.'],
        [Mi, 'Его квартира в соседнем дворе. Полиция даже не приезжала. Поможешь найти зацепки?'],
        [A, 'Показывай дорогу.'],
      ]);
      const base = { x: -450, z: -650 };
      await M.collect([
        { x: base.x + 2, z: base.z + 3, y: CURB, note: 'Блокнот: «Стройка 2009 — 7 погибших, отчёт подменён. М. Морган знал».' },
        { x: base.x - 6, z: base.z - 4, y: CURB, note: 'Фото склада в промзоне с номером «С-17».' },
        { x: base.x + 9, z: base.z - 8, y: CURB, note: 'Квитанция: аренда склада «С-17» оплачена «Вертекс Девелопмент».' },
      ], 'Осмотрите двор Вершинина');
      M.say(A, 'Мира, тут про моего отца… Он знал о подмене отчёта.');
      M.say(Mi, 'Значит, это правда. Склад С-17 в промзоне — Алексей там.');
      const wh = { x: -620, z: 380, y: 3 };
      await M.goto({ x: wh.x, z: wh.z + 20 }, { text: 'Найдите склад <b>С-17</b> в промзоне', r: 10 });
      await M.photo(wh, 'Сфотографируйте склад С-17 как улику');
      M.say(Mi, 'Отправила фото Зое. Внутри охрана — нужен план. Завод «Прогресс» рядом… Алексея держат там.');
      await M.wait(4);
    } },
  { chapter: CH3, title: 'Заброшенный завод', letter: 'М', reward: 7000, get start() { return near(G.city.landmarks.factory, 16, 0); },
    async run(M) {
      const f = M.LM.factory;
      M.setTime(1.5); M.weather('fog');
      M.give('shotgun', 24);
      M.say(Mi, '(рация) Я в машине за углом. Будь осторожен, Алекс.');
      const g1 = M.enemies(near(f, 0, -18), 3, { look: LOOKS.merc, weapon: 'smg' }), g2 = M.enemies(near(f, 4, 18), 3, { look: LOOKS.merc, weapon: 'pistol' });
      await M.eliminate([...g1, ...g2], 'Зачистите территорию завода');
      const ver = M.ally(near(f, -6, 26), { look: LOOKS.vershinin, name: 'Вершинин', state: 'cower' });
      ver.h.pose = 'cower';
      await M.goto(near(ver.h.pos, 1, 1), { text: 'Найдите Вершинина', r: 2.5, car: 'none' });
      ver.h.pose = null;
      await M.talk([[Ve, 'Вы… вы не из «Вертекса»? Слава богу!'], [A, 'Я Алекс Морган. Мира прислала.'], [Ve, 'Морган?! Ваш отец… он пытался остановить стройку. Ланской… Нет, потом. Вытащите меня отсюда!']]);
      const v = M.car('van', { x: f.x + 30, z: f.z + 6, y: 0 }, 0, { color: '#e8e8e8' });
      M.protect(ver, 'Вершинин');
      await M.enterCar(v, 'Сядьте в фургон');
      M.passenger(ver, v);
      const chase = M.car('suv', { x: f.x + 120, z: f.z - 60 }, 0, { color: '#1a1a1a', driver: true });
      M.drive(chase, { mode: 'pursue', max: 30, aggr: 0.9 }).setTarget(() => G.player.wpos());
      await M.goto(near(M.LM.hospital, 0, 4), { text: 'Отвезите Вершинина в <b>больницу</b>', r: 7, car: 'vehicle' });
      M.unpassenger(ver, v);
      M.say(Ve, 'Спасибо… Мой ноутбук спрятан в «Вертексе», в их архиве. Там всё — и про вашего отца.');
      await M.wait(4);
    } },
  { chapter: CH3, title: 'Секреты корпорации', letter: 'З', reward: 8000, get start() { return near(G.city.landmarks.vertex, -14, 6); },
    async run(M) {
      const vx = M.LM.vertex;
      M.setTime(13);
      M.say(Z, 'Сегодня Ланской встречается с капитаном Громовым у подножия башни. Нужен снимок — их вместе.');
      const lan = M.ped(near(vx, 2, 0), { look: LOOKS.lanskoy, name: 'Ланской', heading: Math.PI / 2 }), gro = M.ped(near(vx, 4.5, 0), { look: LOOKS.gromov, name: 'Громов', heading: -Math.PI / 2 });
      const guards = M.enemies(near(vx, 3, -2), 4, { look: LOOKS.merc, weapon: 'smg', passive: true, spread: 3 });
      lan.h.talkT = 99; gro.h.talkT = 99;
      await M.photo(() => ({ x: (lan.h.pos.x + gro.h.pos.x) / 2, y: 1.6, z: lan.h.pos.z }), 'Сфотографируйте Ланского и Громова вместе');
      await M.cutscene([M.around(near(vx, 3.2, 0, CURB), 0.2, 5, 1.8, { orbit: 0.8, dur: 8 })], [
        [L, '…Морган. Сын Михаила. Он уже задаёт вопросы, капитан.'],
        [Gr, 'Он никто. Мелкий угонщик. Я его закрою за неделю.'],
        [L, 'Закройте. Навсегда. Его отец тоже задавал вопросы.'],
        [Gr, '…Стоп. Там фотограф! Взять его!'],
      ]);
      for (const g of guards) { g.state = 'combat'; g.threat = G.player; }
      lan.state = 'flee'; gro.state = 'flee';
      await M.loseCops(2, 'Вас заметили! Уходите и оторвитесь от погони');
      M.say(Z, 'Снимок у меня. «Его отец тоже задавал вопросы»… Алекс, мне очень жаль.');
      await M.wait(4);
    } },
  { chapter: CH3, title: 'Предательство', letter: 'Д', reward: (st) => 5000, get start() { return near(G.city.landmarks.garage, 0, 2.5); },
    async run(M, st) {
      const g = M.LM.garage;
      M.setTime(18.5);
      const den = M.ped(near(g, 1, 1), { look: LOOKS.denis, name: 'Денис', heading: Math.PI });
      await M.cutscene([M.around(den.h.pos, 2.8, 4, 1.7, { orbit: 0.5, dur: 8 })], [
        [D, 'Алекс… Прости. Они пришли ко мне. Громов сказал, что посадит меня, если я тебя не сдам.'],
        [A, 'Денис? Что ты наделал?'], [D, 'У меня дочь, брат. Беги!'],
      ]);
      const en = M.enemies(near(g, 20, 14), 5, { look: LOOKS.gromov, weapon: 'smg' });
      const dv = M.car('sedan', { x: g.x - 10, z: g.z + 8, y: 0 }, -Math.PI / 2, { color: '#3a3a3a' });
      den.state = 'flee'; den.threat = en[0];
      await M.eliminate(en, 'Засада! Отбейтесь от людей Громова');
      den.inCar = dv; den.h.setVisible(false); addBustSafe(dv, LOOKS.denis);
      M.drive(dv, { mode: 'flee', max: 28 });
      M.say(A, 'Денис! Стой!');
      await M.chase(dv, { mode: 'stop', text: 'Догоните Дениса', hp: 0.5 });
      dv.throttle = 0; dv.brake = 1;
      den.inCar = null; den.h.setVisible(true); den.h.pos.set(dv.pos.x + 2, CURB, dv.pos.z); den.state = 'handsup'; den.t = 99; if (dv.bust) dv.bust.visible = false;
      await M.talk([[D, 'Не стреляй! Я… я всё понимаю. Делай что должен.']]);
      const c = await M.choice('Денис предал тебя, но его заставили. Как поступить?', ['Отпустить Дениса — пусть уезжает из города', 'Наказать предателя']);
      st.flags.sparedDenis = c === 0; st.karma += c === 0 ? 2 : -2;
      if (c === 0) { M.say(A, 'Уезжай, Денис. Забирай дочь и уезжай. Сегодня же.'); M.say(D, 'Я этого не забуду, брат.'); den.state = 'flee'; den.t = 20; }
      else { M.say(A, 'Ты выбрал свою сторону, Денис.'); den.hurt(500, G.player, { x: 0, y: 0, z: 1 }); }
      await M.wait(4);
    } },
  { chapter: CH3, title: 'Побег из города', letter: 'М', reward: 3000, get start() { return near(G.city.landmarks.safehouse, 0, 1.5); },
    async run(M) {
      const sh = M.LM.safehouse;
      M.setTime(5.5); M.weather('storm');
      const mira = M.ally(near(sh, 3, 1), { look: LOOKS.mira, name: 'Мира' });
      await M.cutscene([M.around(near(sh, 1.5, 1, CURB), 1.2, 4.5, 1.8, { orbit: 0.4, dur: 8 })], [
        ['Новости', '…разыскивается Алекс Морган, подозреваемый в нападении на полицейских и убийстве…'],
        [Mi, 'Громов повесил на тебя всё! Твоё лицо на всех экранах.'],
        [A, 'Нужно исчезнуть. У отца был домик в лесу, на западе. Туда никто не сунется.'],
      ]);
      const v = M.car('suv', { x: sh.x + 8, z: sh.z + 8, y: 0 }, Math.PI / 2, { color: '#3a4a3a' });
      await M.enterCar(v, 'Сядьте во внедорожник');
      M.passenger(mira, v); M.protect(mira, 'Мира');
      M.wanted(4);
      await M.goto(M.LM.cabin, { text: 'Прорвитесь к <b>лесному домику</b> на западе', r: 10, car: 'vehicle' });
      await M.loseCops(Math.max(1, Math.floor(G.wanted)), 'Оторвитесь от полиции в лесу');
      M.unpassenger(mira, v);
      await M.talk([[Mi, 'Здесь тихо… Сколько мы тут продержимся?'], [A, 'Столько, сколько нужно. А потом вернёмся. И город узнает правду.']]);
    } },
  // ========================== CHAPTER 4 ==========================
  { chapter: CH4, title: 'Возвращение', letter: 'Б', reward: 2000, get start() { return near(G.city.landmarks.cabin, 4, 4); },
    async run(M) {
      M.setTime(10);
      M.noWanted(false); M.game.police.setWanted(0);
      M.say(B, '(звонок) Алекс Морган? Детектив Ирина Белова. Я знаю, что вас подставили. Мне нужна ваша помощь — и вам моя.');
      M.say(B, 'Встретимся у старой церкви. И не привлекайте внимания — полиция ищет вас по всему городу.');
      M.failIf(() => G.wanted >= 2 ? 'Вы привлекли внимание полиции' : null);
      await M.goto(near(M.LM.church, 0, 2), { text: 'Приезжайте к <b>старой церкви</b>, не привлекая внимания', r: 6 });
      const bel = M.ped(near(M.LM.church, 2, 1), { look: LOOKS.belova, name: 'Белова', heading: Math.PI });
      await M.cutscene([M.around(bel.h.pos, 2.6, 4.5, 1.7, { orbit: 0.5, dur: 9 })], [
        [B, 'Три года я собираю дело на Громова. Каждый раз доказательства исчезают.'],
        [A, 'Почему вы верите мне?'], [B, 'Потому что Громов боится вас. А это значит, что вы на правильном пути.'],
        [B, 'Ланской стравливает банды, чтобы скупить их районы за бесценок. Скоро начнётся война.'],
      ]);
    } },
  { chapter: CH4, title: 'Конфликт группировок', letter: 'С', reward: 10000, get start() { return near(G.city.landmarks.factory, 4, 0); },
    async run(M) {
      const f = M.LM.factory;
      M.setTime(16);
      const sedoy = M.ally(near(f, 10, 0), { look: LOOKS.sedoy, name: 'Седой', weapon: 'rifle', state: 'combat', invuln: false, health: 400 });
      sedoy.weapon = 'rifle'; sedoy.h.hold('rifle');
      const crew = [0, 1, 2].map((i) => { const p = M.ally(near(f, 12, -4 + i * 4), { look: { ...LOOKS.thug, shirt: '#2a6a9a' }, weapon: 'pistol', state: 'combat', health: 150 }); p.weapon = 'pistol'; p.h.hold('pistol'); return p; });
      M.say(S, 'Морган! Портовые идут на нас — их кто-то вооружил до зубов. Говорят, «Вертекс». Поможешь?');
      M.give('rifle', 120);
      M.protect(sedoy, 'Седой');
      await M.defend(near(f, 10, 0), [4, 5, 6], 'Защитите территорию Северных волков');
      await M.talk([[S, 'Мы их отбили. Я твой должник, Морган. Когда придёт время — Волки будут с тобой.']]);
    } },
  { chapter: CH4, title: 'Спасение друга', letter: 'М', reward: 5000, get start() { return { x: -350, z: -591, y: CURB }; },
    async run(M) {
      M.setTime(12);
      M.say(Z, 'Алекс! Миру похитили прямо у её дома! Белый фургон, едет на восток. Я веду его по камерам!');
      const v = M.car('van', { x: -150, z: -596.5, y: 0 }, Math.PI / 2, { color: '#e8e8e8', driver: true, health: 1400 });
      M.drive(v, { mode: 'flee', max: 26 });
      if (G.player.state !== 'car') { const c = M.car('sport', { x: -340, z: -596.5, y: 0 }, Math.PI / 2, { color: '#1a1a1a' }); await M.enterCar(c, 'Сядьте в машину — быстро!'); }
      await M.chase(v, { mode: 'stop', text: 'Остановите фургон похитителей', hp: 0.5, escape: 260 });
      v.throttle = 0; v.brake = 1;
      const g = M.enemies(near(v.pos, 3, 3), 3, { look: LOOKS.merc, weapon: 'smg' });
      await M.eliminate(g, 'Разберитесь с похитителями');
      const mira = M.ally(near(v.pos, -2, -2), { look: LOOKS.mira, name: 'Мира' });
      await M.goto(near(mira.h.pos, 1, 0), { text: 'Освободите Миру', r: 2.5, car: 'none' });
      await M.talk([[Mi, 'Алекс! Я знала, что ты придёшь.'], [Mi, 'Они спрашивали про флешку твоего отца. Они думают, что она у тебя.'], [A, 'Флешка отца? Значит, он оставил улики.']]);
    } },
  { chapter: CH4, title: 'Последний союзник', letter: 'М', reward: 10000, get start() { return near(G.city.landmarks.docks, -40, 0); },
    async run(M) {
      const d = M.LM.docks;
      M.setTime(17.5);
      const marat = M.ally({ x: d.x - 30, z: d.z + 4 }, { look: LOOKS.marat, name: 'Марат', weapon: 'shotgun', health: 400 });
      marat.weapon = 'shotgun'; marat.h.hold('shotgun'); marat.state = 'combat';
      M.say(Ma, 'Ты — Морган? Ланской решил избавиться от меня. Его наёмники уже здесь!');
      const en = [...M.enemies({ x: d.x + 10, z: d.z - 20 }, 4, { look: LOOKS.merc, weapon: 'rifle' }), ...M.enemies({ x: d.x + 20, z: d.z + 10 }, 3, { look: LOOKS.merc, weapon: 'smg' })];
      M.protect(marat, 'Марат');
      await M.eliminate(en, 'Защитите Марата от наёмников');
      await M.talk([[Ma, 'Ланской использовал нас, как пешек. Сначала оружие, потом пули в спину.'], [A, 'Помоги мне его остановить. Ты и Седой.'], [Ma, 'С Седым? Мы двадцать лет воюем… Ладно. Ради такого — один раз можно.']]);
    } },
  { chapter: CH4, title: 'Большое противостояние', letter: 'М', reward: 25000, get start() { return near(G.city.landmarks.docks, -40, 0); },
    async run(M) {
      const d = M.LM.docks;
      M.setTime(21); M.weather('rain');
      const allies = [M.ally({ x: d.x - 34, z: d.z }, { look: LOOKS.marat, name: 'Марат', weapon: 'shotgun', health: 500 }), M.ally({ x: d.x - 34, z: d.z + 4 }, { look: LOOKS.sedoy, name: 'Седой', weapon: 'rifle', health: 500 })];
      for (const a of allies) { a.weapon = a.name === 'Марат' ? 'shotgun' : 'rifle'; a.h.hold(a.weapon); a.state = 'combat'; }
      await M.cutscene([M.around({ x: d.x - 34, z: d.z + 2, y: 0 }, 2.2, 6, 2, { orbit: 0.6, dur: 8 })], [
        [S, 'Волки и Портовые плечом к плечу. Расскажу внукам — не поверят.'],
        [Ma, 'Если доживём до внуков. Частная армия «Вертекса» уже едет.'],
        [A, 'Пусть едут. Сегодня Ланской потеряет порт.'],
      ]);
      M.give('rifle', 180);
      await M.defend({ x: d.x - 30, z: d.z }, [5, 6, 7], 'Отразите атаку частной армии');
      const tank = M.car('suv', { x: d.x - 50, z: d.z - 150, y: 0 }, 0, { color: '#2a2a2a', driver: true, health: 3000 });
      M.drive(tank, { mode: 'pursue', max: 26, aggr: 1 }).setTarget(() => G.player.wpos());
      await M.chase(tank, { mode: 'destroy', text: 'Уничтожьте бронированный внедорожник «Вертекса»', escape: 400 });
      M.say(Ma, 'Порт наш! Ланской остался без армии.');
      await M.wait(4);
    } },
  // ========================== CHAPTER 5 ==========================
  { chapter: CH5, title: 'Тайна прошлого', letter: 'Б', reward: 3000, get start() { return near(G.city.landmarks.church, 0, 2); },
    async run(M) {
      M.setTime(7.5); M.weather('fog');
      const bel = M.ped(near(M.LM.church, 2, -4), { look: LOOKS.belova, name: 'Белова', heading: Math.PI });
      await M.cutscene([M.around(near(M.LM.church, 0, -3, CURB), 3.0, 6, 1.8, { orbit: 0.4, dur: 10 })], [
        [B, 'Я нашла дело вашего отца в архиве. Его не закрыли — его спрятали.'],
        [B, 'Михаил Морган был инженером-контролёром на стройке «Вертекса». Он отказался подписать акт. Через два дня его машина «упала» с моста.'],
        [A, 'Ланской убил его…'],
        [B, 'Доказательств нет. Но ваш отец был осторожным человеком. В вашем старом доме могло что-то остаться.'],
      ]);
      const house = { x: 250, z: -956 };
      await M.goto(house, { text: 'Поезжайте к <b>старому дому</b> в пригороде', r: 10 });
      await M.collect([
        { x: house.x + 4, z: house.z + 5, y: CURB, note: 'Детская фотография: ты и отец у моря. На обороте: «Смотри глубже».' },
        { x: house.x - 6, z: house.z + 3, y: CURB, note: 'Старый ящик с инструментами. Двойное дно…' },
        { x: house.x + 1, z: house.z - 7, y: CURB, note: 'Ключ от ячейки банка «Империал» №217 и записка: «Если со мной что-то случится».' },
      ], 'Обыщите двор старого дома');
      M.say(A, 'Ячейка 217. Отец, ты знал, что тебя убьют…');
      await M.wait(4);
    } },
  { chapter: CH5, title: 'Последняя улика', letter: 'А', reward: 30000, get start() { return { x: -250, z: 109, y: CURB }; },
    async run(M) {
      M.setTime(14);
      M.say(Z, 'Банк «Империал» принадлежит «Вертексу». Как только откроешь ячейку — сработает тревога. У тебя будет минута.');
      await M.collect([{ x: -262, z: 109.5, y: CURB, note: 'Флешка и записи отца: подменённые акты, подписи Ланского, переводы Громову.' }], 'Заберите содержимое ячейки №217');
      M.timer(90, 'Охрана перекрыла выходы');
      const g = M.enemies({ x: -240, z: 95 }, 4, { look: LOOKS.merc, weapon: 'smg' });
      await M.eliminate(g, 'Тревога! Прорвитесь через охрану');
      M.stopTimer();
      await M.loseCops(3, 'Уходите от погони с уликами');
      M.say(Z, 'Я посмотрела флешку. Алекс… этого хватит, чтобы похоронить «Вертекс». Или чтобы стать его хозяином.');
      await M.wait(4);
    } },
  { chapter: CH5, title: 'Решающий выбор', letter: 'Л', reward: 0, get start() { return near(G.city.landmarks.vertex, 0, 6); },
    async run(M, st) {
      const vx = M.LM.vertex;
      M.setTime(19.2); M.weather('clear');
      const lan = M.ped(near(vx, 0, 0), { look: LOOKS.lanskoy, name: 'Ланской', heading: 0 });
      const gs = M.enemies(near(vx, 0, -3), 2, { look: LOOKS.merc, weapon: 'rifle', passive: true, spread: 3 });
      await M.cutscene([M.shot([vx.x - 30, 4, vx.z + 40], [vx.x, 80, vx.z], { to: [vx.x - 10, 3, vx.z + 25], at2: [vx.x, 2, vx.z], dur: 8 }), M.around(lan.h.pos, 0.2, 4, 1.7, { orbit: 0.5, dur: 10 })], [
        [L, 'Алекс Морган. Вы так похожи на отца. Тот же упрямый взгляд.'],
        [A, 'Вы убили его.'],
        [L, 'Я построил этот город. Ваш отец хотел остановить прогресс из-за нескольких трещин в бетоне.'],
        [L, 'У вас флешка. Назовите цену. Деньги, место в совете директоров — весь город может стать вашим.'],
        [A, 'Весь город…'],
      ]);
      const c = await M.choice('Флешка с уликами в твоих руках. Это решит судьбу города.', [
        'ПРАВОСУДИЕ: передать улики детективу Беловой',
        'ВЛАСТЬ: шантажировать Ланского и забрать «Вертекс»',
        'СВОБОДА: уничтожить улики и уехать с Мирой',
      ]);
      st.ending = c; st.flags.ending = c;
      const lines = [
        [[A, 'Цена такая: суд. Белова уже едет, Ланской.'], [L, 'Глупец… Охрана!']],
        [[A, 'Я согласен. Только условия буду ставить я. С этого дня «Вертекс» отвечает передо мной.'], [L, 'Вы… вы блефуете. Громов! Громов, где вы?!']],
        [[A, 'Мне не нужен ваш город. И ваша месть тоже.'], [A, '(ломает флешку) Отец бы понял. Я выбираю жизнь.'], [L, 'Вы ещё пожалеете, что не взяли деньги.']],
      ][c];
      await M.talk(lines);
    } },
  { chapter: CH5, title: 'Финальная погоня', letter: '!', reward: 15000, get start() { return near(G.city.landmarks.vertex, 0, 6); },
    async run(M, st) {
      const e = st.ending ?? 0, vx = M.LM.vertex;
      M.setTime(20);
      const mine = M.car('super', { x: vx.x + 10, z: vx.z + 11, y: 0 }, Math.PI / 2, { color: '#d8d8d8' });
      if (G.player.state !== 'car') await M.enterCar(mine, 'Сядьте в машину');
      if (e === 0) {
        M.say(B, '(рация) Ланской бежит в аэропорт! У него частный самолёт. Остановите его, Морган!');
        const t = M.car('suv', { x: vx.x - 20, z: vx.z + 12 }, Math.PI / 2, { color: '#0a0a0a', driver: true, health: 2200 });
        const ai = M.drive(t, { mode: 'route', max: 34 }); ai.setTarget({ x: 0, z: 1100 });
        M.failIf(() => M.dist(t.pos, { x: 0, z: 1100 }) < 25 ? 'Ланской улетел' : null);
        await M.chase(t, { mode: 'stop', text: 'Остановите кортеж Ланского до аэропорта', hp: 0.4, escape: 350 });
        st.flags.lanskoyCaught = true;
      } else if (e === 1) {
        M.say(Z, 'Громов сбежал с копией флешки! Если он отдаст её прокурору — твой план рухнет.');
        const t = M.car('police', { x: vx.x - 20, z: vx.z + 12 }, Math.PI / 2, { driver: true, health: 1800 });
        t.siren = true; M.drive(t, { mode: 'flee', max: 33 });
        await M.chase(t, { mode: 'destroy', text: 'Уничтожьте машину Громова', escape: 320 });
      } else {
        M.say(Mi, '(звонок) Я на пирсе, лодка готова. Но люди Ланского перекрыли город. Прорывайся, Алекс!');
        for (let i = 0; i < 3; i++) { const t = M.car('suv', { x: vx.x - 60 - i * 30, z: vx.z + 12 + i * 4 }, Math.PI / 2, { color: '#0a0a0a', driver: true }); M.drive(t, { mode: 'pursue', max: 31, aggr: 1 }).setTarget(() => G.player.wpos()); }
        await M.goto(M.LM.pier, { text: 'Прорвитесь к <b>пирсу</b> на пляже', r: 12, car: 'any' });
      }
      await M.wait(2);
    } },
  { chapter: CH5, title: 'Судьба города', letter: '★', reward: 50000, get start() { const e = G.state.ending ?? 0; return e === 0 ? { x: 0, z: 1108, y: 0 } : e === 1 ? near(G.city.landmarks.vertex, 0, 6) : near(G.city.landmarks.pier, 0, 0); },
    async run(M, st) {
      const e = st.ending ?? 0;
      if (e === 0) {
        M.setTime(21);
        const bel = M.ally({ x: 4, z: 1104 }, { look: LOOKS.belova, name: 'Белова', weapon: 'pistol', health: 300 }); bel.weapon = 'pistol'; bel.h.hold('pistol'); bel.state = 'combat';
        M.protect(bel, 'Белова');
        M.say(B, 'Наёмники Ланского пытаются отбить босса! Держитесь, подкрепление в пути!');
        await M.defend({ x: 0, z: 1104 }, [5, 6], 'Защитите Белову до прибытия подкрепления');
        await M.cutscene([M.shot([30, 6, 1080], [0, 1.5, 1104], { to: [12, 3, 1092], dur: 9 }), M.shot([-20, 40, 1000], [0, 0, 1104], { dur: 8 })], [
          [B, 'Виктор Ланской, вы арестованы по обвинению в убийстве Михаила Моргана, коррупции и организации преступного сообщества.'],
          [L, 'Этот город построен на мне. Без меня он рухнет.'],
          [A, 'Он построен на людях вроде моего отца. И теперь он станет честнее.'],
          ['Новости', 'Капитан Громов задержан. «Вертекс» под следствием. Город впервые за годы дышит свободно.'],
        ]);
      } else if (e === 1) {
        M.setTime(23);
        const en = M.enemies(near(M.LM.vertex, 0, 10), 6, { look: LOOKS.merc, weapon: 'rifle' });
        await M.eliminate(en, 'Охрана Ланского не сдаётся. Зачистите площадь');
        await M.cutscene([M.shot([M.LM.vertex.x - 40, 10, M.LM.vertex.z + 60], [M.LM.vertex.x, 150, M.LM.vertex.z], { to: [M.LM.vertex.x - 20, 30, M.LM.vertex.z + 40], dur: 10 })], [
          [L, 'Вы… теперь вы такой же, как я.'],
          [A, 'Нет. Я хуже. Я знаю, где хранятся все ваши секреты.'],
          [Z, 'Совет директоров единогласно утвердил нового председателя. Поздравляю, мистер Морган.'],
          ['Новости', 'Неожиданная смена руководства «Вертекса». Новый глава корпорации обещает «новую эру» для города…'],
        ]);
      } else {
        M.setTime(19.4); M.weather('clear');
        const mira = M.ally(near(M.LM.pier, 30, 0, 0.6), { look: LOOKS.mira, name: 'Мира' });
        await M.goto(near(mira.h.pos, -1.5, 0), { text: 'Подойдите к Мире на пирсе', r: 3, car: 'none' });
        await M.cutscene([M.shot([1190, 4, 18], [1130, 1.5, 0], { to: [1200, 8, -20], dur: 10 }), M.shot([1240, 30, 0], [1000, 40, 0], { dur: 10 })], [
          [Mi, 'Ты правда сломал флешку?'],
          [A, 'Месть съела моего отца. Я не позволю ей съесть нас.'],
          [Mi, 'Город останется таким же…'],
          [A, 'Может быть. Но у него всегда будет обратная сторона. Та, где есть мы.'],
        ]);
      }
    } },
];

function addBustSafe(v, look) { addBust(v, look); }

export const ENDINGS = [
  { title: 'Концовка: ПРАВОСУДИЕ', text: 'Ланской и Громов за решёткой. Детектив Белова возглавила управление полиции, а Мира получила премию за расследование. Алекс Морган остался в городе — теперь у него есть дом и честное имя.' },
  { title: 'Концовка: ВЛАСТЬ', text: 'Алекс Морган возглавил «Вертекс». Банды подчинились, полиция молчит, город растёт быстрее, чем когда-либо. Но по ночам ему снится отец — и всё чаще у отца лицо Ланского.' },
  { title: 'Концовка: СВОБОДА', text: 'Улики уничтожены. Алекс и Мира уплыли навстречу закату, оставив город его тайнам. Иногда свобода — это просто не оглядываться назад.' },
];
