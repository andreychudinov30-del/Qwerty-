// Static game data: cars, tracks, upgrades, cosmetics
export const CLASSES = { sedan: 'Седан', sport: 'Спорткар', muscle: 'Маслкар', super: 'Суперкар', hyper: 'Гиперкар', offroad: 'Внедорожник' };

// body: L/W/H scale of the base chassis, ride = extra clearance (m), wheel = wheel scale, kit = body kit preset
export const CARS = [
  { id: 'vega', name: 'Vega Sedan S', cls: 'sedan', price: 0, hp: 190, nm: 280, mass: 1420, drive: 'FWD', gears: 6, redline: 6800, vmax: 215, brake: 0.85, grip: 0.92, cyl: 4, turbo: 0.0, color: '#8a9aa8', body: { L: 1.05, W: 0.97, H: 1.1, ride: 0.04, wheel: 0.98, kit: 'sedan' } },
  { id: 'orion', name: 'Orion GT Sedan', cls: 'sedan', price: 28000, hp: 340, nm: 450, mass: 1610, drive: 'AWD', gears: 7, redline: 7000, vmax: 255, brake: 0.95, grip: 0.98, cyl: 6, turbo: 0.6, color: '#1d2a44', body: { L: 1.07, W: 1.0, H: 1.09, ride: 0.03, wheel: 1.0, kit: 'sedan' } },
  { id: 'kaiser', name: 'Kaiser M-Line', cls: 'sedan', price: 52000, hp: 510, nm: 650, mass: 1730, drive: 'RWD', gears: 8, redline: 7200, vmax: 290, brake: 1.0, grip: 1.0, cyl: 8, turbo: 0.8, color: '#0b0d10', body: { L: 1.08, W: 1.02, H: 1.07, ride: 0.02, wheel: 1.03, kit: 'sedan' } },
  { id: 'kestrel', name: 'Kestrel RS', cls: 'sport', price: 22000, hp: 300, nm: 340, mass: 1240, drive: 'RWD', gears: 6, redline: 8200, vmax: 250, brake: 1.0, grip: 1.02, cyl: 4, turbo: 0.0, color: '#c8102e', body: { L: 0.9, W: 0.95, H: 1.05, ride: 0.0, wheel: 0.95, kit: 'sport' } },
  { id: 'hikari', name: 'Hikari Type-R', cls: 'sport', price: 34000, hp: 320, nm: 420, mass: 1380, drive: 'FWD', gears: 6, redline: 7500, vmax: 272, brake: 1.02, grip: 1.04, cyl: 4, turbo: 0.9, color: '#f2f2f2', body: { L: 0.95, W: 0.98, H: 1.08, ride: 0.0, wheel: 0.98, kit: 'hatch' } },
  { id: 'nordic', name: 'Nordic Turbo S', cls: 'sport', price: 68000, hp: 580, nm: 750, mass: 1640, drive: 'AWD', gears: 8, redline: 7200, vmax: 320, brake: 1.12, grip: 1.1, cyl: 6, turbo: 1.0, color: '#5a5f66', body: { L: 0.96, W: 1.02, H: 1.06, ride: 0.0, wheel: 1.02, kit: 'gt' } },
  { id: 'stallion', name: 'Stallion 5.0', cls: 'muscle', price: 30000, hp: 460, nm: 570, mass: 1680, drive: 'RWD', gears: 6, redline: 7400, vmax: 270, brake: 0.92, grip: 0.95, cyl: 8, turbo: 0.0, color: '#1a3d8f', body: { L: 1.04, W: 1.03, H: 1.12, ride: 0.03, wheel: 1.0, kit: 'muscle' } },
  { id: 'hammer', name: 'Hammer V10', cls: 'muscle', price: 58000, hp: 645, nm: 815, mass: 1520, drive: 'RWD', gears: 6, redline: 6400, vmax: 330, brake: 1.05, grip: 1.0, cyl: 10, turbo: 0.0, color: '#d41f1f', body: { L: 1.02, W: 1.05, H: 1.02, ride: 0.0, wheel: 1.03, kit: 'muscle' } },
  { id: 'brute', name: 'Brute SS 454', cls: 'muscle', price: 74000, hp: 760, nm: 880, mass: 1870, drive: 'RWD', gears: 8, redline: 6600, vmax: 325, brake: 1.0, grip: 0.98, cyl: 8, turbo: 0.7, color: '#141414', body: { L: 1.07, W: 1.05, H: 1.12, ride: 0.02, wheel: 1.04, kit: 'muscle' } },
  { id: 'corsa', name: 'Corsa V8 Italia', cls: 'super', price: 95000, hp: 570, nm: 540, mass: 1480, drive: 'RWD', gears: 7, redline: 9000, vmax: 325, brake: 1.15, grip: 1.12, cyl: 8, turbo: 0.0, color: '#b00000', body: { L: 1.0, W: 1.0, H: 1.0, ride: 0.0, wheel: 1.0, kit: 'stock' } },
  { id: 'aurora', name: 'Aurora V10', cls: 'super', price: 125000, hp: 640, nm: 600, mass: 1520, drive: 'AWD', gears: 7, redline: 8700, vmax: 330, brake: 1.18, grip: 1.15, cyl: 10, turbo: 0.0, color: '#7bc142', body: { L: 1.01, W: 1.03, H: 0.97, ride: 0.0, wheel: 1.02, kit: 'super' } },
  { id: 'falcon', name: 'Falcon 720', cls: 'super', price: 160000, hp: 720, nm: 770, mass: 1420, drive: 'RWD', gears: 7, redline: 8500, vmax: 341, brake: 1.22, grip: 1.17, cyl: 8, turbo: 1.0, color: '#f06a00', body: { L: 1.02, W: 1.03, H: 0.95, ride: 0.0, wheel: 1.03, kit: 'super' } },
  { id: 'phantom', name: 'Phantom Hybrid', cls: 'hyper', price: 260000, hp: 950, nm: 900, mass: 1550, drive: 'AWD', gears: 7, redline: 9200, vmax: 350, brake: 1.3, grip: 1.24, cyl: 8, turbo: 0.8, color: '#e8e8e8', body: { L: 1.04, W: 1.05, H: 0.92, ride: 0.0, wheel: 1.04, kit: 'hyper' } },
  { id: 'valkyr', name: 'Valkyr W16', cls: 'hyper', price: 380000, hp: 1500, nm: 1600, mass: 1990, drive: 'AWD', gears: 7, redline: 6800, vmax: 420, brake: 1.35, grip: 1.25, cyl: 16, turbo: 1.0, color: '#13284f', body: { L: 1.06, W: 1.06, H: 0.95, ride: 0.0, wheel: 1.05, kit: 'hyper' } },
  { id: 'zenith', name: 'Zenith Electric', cls: 'hyper', price: 450000, hp: 1900, nm: 2300, mass: 2150, drive: 'AWD', gears: 1, redline: 16000, vmax: 412, brake: 1.35, grip: 1.26, cyl: 0, turbo: 0.0, ev: true, color: '#2bb3a8', body: { L: 1.05, W: 1.05, H: 0.94, ride: 0.0, wheel: 1.04, kit: 'hyper' } },
  { id: 'ranger', name: 'Ranger Trail 4x4', cls: 'offroad', price: 26000, hp: 290, nm: 470, mass: 2050, drive: 'AWD', gears: 6, redline: 6000, vmax: 195, brake: 0.8, grip: 0.9, cyl: 6, turbo: 0.0, offroad: true, color: '#55603b', body: { L: 1.02, W: 1.06, H: 1.3, ride: 0.2, wheel: 1.18, kit: 'offroad' } },
  { id: 'raptor', name: 'Dune Raptor', cls: 'offroad', price: 62000, hp: 450, nm: 690, mass: 2400, drive: 'AWD', gears: 10, redline: 6200, vmax: 180, brake: 0.85, grip: 0.92, cyl: 6, turbo: 0.9, offroad: true, color: '#c2a07a', body: { L: 1.1, W: 1.1, H: 1.32, ride: 0.24, wheel: 1.22, kit: 'offroad' } },
  { id: 'atlas', name: 'Atlas Overland', cls: 'offroad', price: 88000, hp: 560, nm: 850, mass: 2300, drive: 'AWD', gears: 8, redline: 6500, vmax: 250, brake: 1.0, grip: 0.97, cyl: 8, turbo: 1.0, offroad: true, color: '#2a2d31', body: { L: 1.06, W: 1.06, H: 1.26, ride: 0.16, wheel: 1.13, kit: 'offroad' } },
];

export const TRACKS = [
  { id: 'mountain', name: 'Mountain Highway', desc: 'Горы, хвойные леса, серпантины, мост над озером и тоннели', biome: 'mountain', laps: 3, seed: 11, R: 620,
    harm: [[2, 0.16, 0.3], [3, 0.11, 1.4], [5, 0.07, 2.1], [7, 0.045, 0.2], [9, 0.025, 4.0]], width: 11 },
  { id: 'city', name: 'Coastal City', desc: 'Мегаполис с небоскрёбами, набережной и пляжем', biome: 'city', laps: 3, seed: 23, R: 640,
    harm: [[2, 0.2, 1.2], [3, 0.08, 0.4], [4, 0.09, 2.5], [6, 0.035, 1.0]], width: 15 },
  { id: 'desert', name: 'Desert Valley', desc: 'Пустыня, каньоны, столовые горы, шоссе и грунтовые участки', biome: 'desert', laps: 3, seed: 37, R: 700,
    harm: [[2, 0.22, 2.2], [3, 0.12, 0.8], [5, 0.06, 1.9], [8, 0.02, 0.7]], width: 13 },
];

export const MODES = { free: 'Свободный заезд', time: 'Круги на время', race: 'Гонка (7 соперников)' };
export const DIFFICULTY = [
  { id: 'easy', name: 'Новичок', skill: 0.84, mistakes: 0.035, reward: 0.7 },
  { id: 'normal', name: 'Пилот', skill: 0.93, mistakes: 0.02, reward: 1.0 },
  { id: 'hard', name: 'Профи', skill: 0.99, mistakes: 0.01, reward: 1.4 },
  { id: 'legend', name: 'Легенда', skill: 1.05, mistakes: 0.004, reward: 1.9 },
];

// Performance upgrades: levels 0..3, price multiplier of base
export const PERF = {
  engine: { name: 'Двигатель', desc: '+мощность и крутящий момент', levels: ['Сток', 'Street', 'Sport', 'Race'], price: [0, 4000, 9000, 18000], eff: [0, 0.08, 0.17, 0.28] },
  turbo: { name: 'Турбина', desc: 'Наддув: +момент, турбояма', levels: ['Сток', 'Stage 1', 'Stage 2', 'Stage 3'], price: [0, 5000, 11000, 22000], eff: [0, 0.12, 0.24, 0.38] },
  brakes: { name: 'Тормоза', desc: 'Сила и стойкость торможения', levels: ['Сток', 'Street', 'Sport', 'Карбон-керамика'], price: [0, 2500, 6000, 14000], eff: [0, 0.1, 0.2, 0.34] },
  suspension: { name: 'Подвеска', desc: 'Жёсткость, крены, отклик', levels: ['Сток', 'Street', 'Sport', 'Race койловеры'], price: [0, 3000, 7000, 15000], eff: [0, 0.1, 0.2, 0.32] },
  transmission: { name: 'Коробка', desc: 'Скорость переключения, передаточные числа', levels: ['Сток', 'Street', 'Sport', 'Race секвентальная'], price: [0, 3000, 7500, 16000], eff: [0, 0.3, 0.55, 0.8] },
  weight: { name: 'Снижение массы', desc: 'Облегчение кузова и салона', levels: ['Сток', '-4%', '-8%', '-13%'], price: [0, 3500, 9000, 20000], eff: [0, 0.04, 0.08, 0.13] },
};
export const TIRES = {
  street: { name: 'Дорожные', price: 0, mu: { asphalt: 0.95, wet: 0.72, dirt: 0.62, grass: 0.5, sand: 0.42 } },
  sport: { name: 'Спортивные', price: 4000, mu: { asphalt: 1.08, wet: 0.74, dirt: 0.58, grass: 0.47, sand: 0.38 } },
  race: { name: 'Гоночный слик', price: 12000, mu: { asphalt: 1.22, wet: 0.6, dirt: 0.5, grass: 0.4, sand: 0.32 } },
  offroad: { name: 'Внедорожные', price: 5000, mu: { asphalt: 0.86, wet: 0.7, dirt: 0.86, grass: 0.74, sand: 0.7 } },
};

export const FINISHES = { gloss: ['Глянец', 0], metallic: ['Металлик', 1200], matte: ['Матовая', 2000], pearl: ['Перламутр', 3000], chrome: ['Хром', 9000] };
export const RIMS = { oem: ['Заводские', 0], fivespoke: ['5 спиц Forged', 2500], mesh: ['Сетка Mesh', 3500], multi: ['Multi-spoke 20', 4000], dish: ['Deep Dish', 4500], beadlock: ['Beadlock Off-road', 3000], turbine: ['Turbine Aero', 5500] };
export const SPOILERS = { none: ['Нет', 0], lip: ['Губа', 1200], ducktail: ['Ducktail', 2500], gt: ['GT-крыло', 5000], swan: ['Swan-neck', 7000] };
export const FRONTS = { stock: ['Стандарт', 0], splitter: ['Сплиттер', 2000], canards: ['Сплиттер + канарды', 3800] };
export const SKIRTS = { stock: ['Стандарт', 0], sport: ['Спортивные пороги', 1800] };
export const WIDEBODY = { stock: ['Стандарт', 0], flares: ['Расширители арок', 6000] };
export const LIVERIES = { none: ['Нет', 0], stripes: ['Двойные полосы', 1500], center: ['Центральная полоса', 1200], side: ['Боковая полоса', 1400], twotone: ['Двухцветная', 2200], fade: ['Градиент', 2600], carbonhood: ['Карбон капот', 3200] };
export const DECALS = { none: ['Нет', 0], number: ['Гоночный номер', 800], sponsor: ['Спонсоры', 1500], both: ['Номер + спонсоры', 2000] };
export const PAINTS = ['#b00000', '#d41f1f', '#f06a00', '#f4c20d', '#7bc142', '#0f7b3e', '#2bb3a8', '#1e88e5', '#1a3d8f', '#13284f', '#6a1b9a', '#e91e63', '#f2f2f2', '#c0c4c8', '#8a9aa8', '#5a5f66', '#2a2d31', '#0b0d10', '#c2a07a', '#55603b'];
export const NEONS = ['#00e5ff', '#ff00d4', '#7c4dff', '#00ff6a', '#ff3d00', '#ffd600', '#ffffff'];
export const HEADLIGHTS = ['#ffffff', '#cfe6ff', '#fff1c2', '#9fd3ff', '#c6a2ff', '#ffe066'];

export const QUALITY = [
  { name: 'Эконом', pr: 0.6, shadow: 0, ao: false, bloom: false, msaa: 0, trees: 0.35, grass: 0, water: false, draw: 900, envRes: 64, mblur: false, reflections: false },
  { name: 'Низкая', pr: 0.75, shadow: 1024, ao: false, bloom: true, msaa: 0, trees: 0.55, grass: 0, water: false, draw: 1300, envRes: 128, mblur: false, reflections: false },
  { name: 'Средняя', pr: 1.0, shadow: 2048, ao: false, bloom: true, msaa: 2, trees: 0.8, grass: 0.4, water: true, draw: 1900, envRes: 128, mblur: true, reflections: true },
  { name: 'Высокая', pr: 1.25, shadow: 2048, ao: true, bloom: true, msaa: 4, trees: 1.0, grass: 0.75, water: true, draw: 2600, envRes: 256, mblur: true, reflections: true },
  { name: 'Ультра', pr: 1.6, shadow: 4096, ao: true, bloom: true, msaa: 4, trees: 1.25, grass: 1.0, water: true, draw: 3400, envRes: 256, mblur: true, reflections: true },
];
