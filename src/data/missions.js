// Campaign index: 4 chapters × 8 missions.
import { CH1 } from './ch1.js';
import { CH2 } from './ch2.js';
import { CH3 } from './ch3.js';
import { CH4 } from './ch4.js';

export const CHAPTERS = [
  { n: 1, title: 'Последняя станция', missions: CH1 },
  { n: 2, title: 'Глубже во тьму', missions: CH2 },
  { n: 3, title: 'Подземный кошмар', missions: CH3 },
  { n: 4, title: 'Последний поезд', missions: CH4 },
];
export const MISSIONS = [...CH1, ...CH2, ...CH3, ...CH4];
export const missionById = (id) => MISSIONS.find((m) => m.id === id);
export const missionIndex = (id) => MISSIONS.findIndex((m) => m.id === id);
