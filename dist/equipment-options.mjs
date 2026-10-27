import {EFFECTS} from './engine.mjs?v=0.3.1';
const fixed=new Set(['itemAttack','mainFlat','str','dex','int','luk','hp','mp','defense','accuracy','evade',...Array.from({length:5},(_,i)=>`skillLevel${i+1}`)]);
const names={itemAttack:'공격력',attackPercent:'공격력',mainFlat:'주스탯',mainPercent:'주스탯',hp:'최대 HP',hpPercent:'최대 HP',mp:'최대 MP',mpPercent:'최대 MP',defense:'방어력',defensePercent:'방어력',critDamage:'크리티컬 데미지'};
export const EQUIPMENT_OPTIONS=EFFECTS.filter(([type])=>!['none','attack'].includes(type)).map(([type,name])=>{
  const label=names[type]??name.replace(/\s*\(.*\)/,'').replace(/\s*%.*$/,'').trim(),unit=fixed.has(type)?'':'%';
  return {type,label,unit,name:label+(unit?' %':/^(STR|DEX|INT|LUK|주스탯)$/.test(label)?' (고정)':''),integer:type.startsWith('skillLevel')};
});
export const equipmentOption=type=>EQUIPMENT_OPTIONS.find(option=>option.type===(type==='attack'?'itemAttack':type));
