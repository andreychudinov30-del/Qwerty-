// Character skins (shop). Colours are suit tint / accent; attachments are bone-mounted gear.
export const SKINS = [
  { id: 'stalker', name: 'Сталкер', price: 0, desc: 'Потёртый тактический костюм. Стандартное снаряжение.', tint: [0.42, 0.44, 0.38], accent: [0.55, 0.5, 0.4], amt: 0.55, att: ['backpack', 'headlamp'], swatch: '#5a5d4e' },
  { id: 'rescuer', name: 'Спасатель МЧС', price: 600, desc: 'Ярко-оранжевая форма спасательной службы.', tint: [0.85, 0.32, 0.06], accent: [0.9, 0.9, 0.85], amt: 0.85, att: ['helmet', 'vest', 'backpack'], swatch: '#d4561a' },
  { id: 'military', name: 'Военный', price: 900, desc: 'Камуфляж и шлем армейского образца.', tint: [0.26, 0.3, 0.18], accent: [0.35, 0.32, 0.22], amt: 0.8, att: ['helmet', 'backpack', 'gasmask'], camo: true, swatch: '#3e4a2a' },
  { id: 'lineman', name: 'Обходчик', price: 750, desc: 'Рабочий метрополитена: сигнальный жилет и каска.', tint: [0.2, 0.24, 0.36], accent: [1.0, 0.85, 0.1], amt: 0.8, att: ['helmet', 'vest', 'headlamp'], swatch: '#2f3a5a' },
  { id: 'liquidator', name: 'Ликвидатор', price: 1400, desc: 'Защитный костюм химзащиты и противогаз.', tint: [0.78, 0.68, 0.18], accent: [0.25, 0.25, 0.22], amt: 0.9, att: ['gasmask', 'hood', 'backpack'], swatch: '#b9a12d' },
  { id: 'hunter', name: 'Ночной охотник', price: 1800, desc: 'Чёрная тактика. Почти невидим в темноте.', tint: [0.06, 0.06, 0.07], accent: [0.2, 0.2, 0.22], amt: 0.92, att: ['gasmask', 'backpack', 'headlamp'], swatch: '#141418' },
  { id: 'scientist', name: 'Учёный', price: 1200, desc: 'Белый лабораторный комбинезон объекта «Глубина».', tint: [0.85, 0.86, 0.84], accent: [0.3, 0.55, 0.75], amt: 0.85, att: ['gasmask'], swatch: '#d9dcd8' },
  { id: 'driver', name: 'Машинист', price: 1000, desc: 'Синяя форма машиниста последнего поезда.', tint: [0.08, 0.14, 0.4], accent: [0.85, 0.7, 0.3], amt: 0.85, att: ['cap'], swatch: '#1b2e6b' },
  { id: 'ghost', name: 'Призрак', price: 2500, desc: 'Тот, кто вернулся из тоннелей. Светящиеся линии.', tint: [0.12, 0.12, 0.14], accent: [0.2, 0.9, 1.0], amt: 0.9, att: ['hood', 'glow'], glow: [0.2, 1.4, 2.0], swatch: '#1d2a33' },
  { id: 'legend', name: 'Легенда', price: 4000, desc: 'Для тех, кто увидел рассвет. Золотая отделка.', tint: [0.1, 0.1, 0.1], accent: [1.0, 0.75, 0.25], amt: 0.9, att: ['helmet', 'backpack', 'glow'], glow: [2.0, 1.4, 0.4], swatch: '#2a2418', unlock: 'ending' },
];
export const skinById = (id) => SKINS.find((s) => s.id === id) || SKINS[0];
