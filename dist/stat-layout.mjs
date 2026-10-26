import {FIELDS} from './engine.mjs';

// Relative order of supported fields in the supplied in-game stat screens.
export const GAME_STAT_KEYS = [
  'attack','critChance','critDamage','attackSpeed',
  'basic','skill','boss','normal',
  'minDamage','maxDamage','finalDamage','cooldown',
];
export const GAME_STAT_FIELDS = GAME_STAT_KEYS.map(key=>FIELDS.find(field=>field[0]===key));
const gameKeys=new Set(GAME_STAT_KEYS);
export const DISPLAY_STAT_FIELDS = [...GAME_STAT_FIELDS,...FIELDS.filter(([key])=>!gameKeys.has(key))];
