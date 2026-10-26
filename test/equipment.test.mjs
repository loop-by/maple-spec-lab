import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseEquipment,equipmentLine} from '../dist/equipment-parser.mjs';
import {newEquipment,registerEquipment} from '../dist/equipment-data.mjs';
import {DEFAULT_STATS,compare,replaceLines} from '../dist/engine.mjs';

const stats=()=>({...DEFAULT_STATS,mainStat:1000,target:'boss',attackType:'skill',content:'field'});
const profile=()=>({id:'test',stats:stats(),equipment:[newEquipment('gloves')],calibration:{},loadout:{reference:[]}});
const record=()=>({slotKey:'gloves',item:{name:'블러드 로버',rarity:'유니크',quality:'상급',level:74,effects:[{label:'공격력',value:4203,unit:''},{label:'명중',value:30,unit:''},{label:'명중',value:7,unit:''}]},potential:[{type:'critDamage',value:20},{type:'dex',value:200},{type:'critChance',value:6}],additional:[{type:'maxDamage',value:6},{type:'luk',value:50},{type:'mpPercent',value:3}],potentialGrade:'유니크',additionalGrade:'레어'});

test('equipment parser keeps fixed and percentage primary/secondary stats distinct',()=>{
  for(const [text,type,value]of [['LUK 50','luk',50],['LUK 4.5%','lukPercent',4.5],['DEX 200','dex',200],['DEX 4.5%','dexPercent',4.5],['STR 200','str',200],['공격 속도 3.5%','attackSpeed',3.5],['최대 MP 3%','mpPercent',3],['주스탯 207','mainFlat',207]])assert.deepEqual([equipmentLine(text).type,equipmentLine(text).value],[type,value]);
});
test('spaced OCR headers preserve the additional potential group and slot identity',()=>{
  const r=parseEquipment(['유니크 장갑','상급','Lv.74','장착 효과','공격력 4,203','명중 30','명중 7'],['장갑 슬롯 강화 효과','잠재 옵션','크리티컬 데미지 20%','DEX 200','크리티컬 확률 6%','에 디 셔널 잠재 옵션 레어','최대 데미지 배율 6%','LUK 50','최대 MP 3%'],{title:'블러드 로버',grade:'유니크'});
  assert.equal(r.slotKey,'gloves');assert.deepEqual(r.additional.map(l=>[l.type,l.value]),[['maxDamage',6],['luk',50],['mpPercent',3]]);assert.equal(r.item.effects.length,3);
  assert.equal(parseEquipment([],['어 깨 장식 슬롯 강화 효과'],{title:'숄더'}).slotKey,'shoulder');
});
test('registering equipment captures sources without adding them again to displayed stats',()=>{
  const p=profile(),original=structuredClone(p),result=registerEquipment(p,[record()]);
  assert.deepEqual(p,original);assert.deepEqual(result.stats,p.stats);assert.deepEqual(result.loadout,p.loadout);
  assert.deepEqual(result.equipment[0].miracle.old,result.equipment[0].miracle.next);
  assert.equal(result.equipment[0].additional.old[1].type,'luk');assert.equal(result.equipment[0].item.effects.length,3);
});
test('unread additional potential preserves previous additional options, and duplicate slots are rejected',()=>{
  const p=registerEquipment(profile(),[record()]);const r=record();r.additional=null;
  assert.deepEqual(registerEquipment(p,[r]).equipment[0].additional,p.equipment[0].additional);
  assert.throws(()=>registerEquipment(p,[r,r]),/한 번에 하나/);
  r.potential[1].type='unread';assert.throws(()=>registerEquipment(p,[r]),/옵션 종류/);
  const unread=record();unread.item.effects.push({label:'명중',value:null,unit:''});assert.throws(()=>registerEquipment(p,[unread]),/장착 효과/);
});
test('unchanged raw stats cancel while a damage option can still be compared',()=>{
  const before=[{type:'lukPercent',value:4.5},{type:'attackSpeed',value:3.5},{type:'damage',value:12}],after=[{type:'lukPercent',value:4.5},{type:'attackSpeed',value:3.5},{type:'damage',value:18}];
  assert.ok(Math.abs(compare(stats(),before,after).gain-3)<1e-9);
  assert.equal(compare(stats(),[{type:'mainFlat',value:50}],[{type:'mainFlat',value:50}]).gain,0);
  assert.throws(()=>compare(stats(),[{type:'dex',value:Infinity}],[{type:'dex',value:Infinity}]),/유한수/);
  assert.throws(()=>compare(stats(),[{type:'attackSpeed',value:3.5}],[{type:'attackSpeed',value:5}]),/계산하지 않습니다/);
});
test('job-specific main-stat conversion never reuses the main stat slope for another stat',()=>{
  const s=stats(),cal={mainAttribute:'LUK',mainFlat:{attack:2,statDamage:.01},mainPercent:{attack:100,statDamage:2}};
  const r=replaceLines(s,[{type:'luk',value:50}],[{type:'luk',value:100}],cal);
  assert.equal(r.attack,s.attack+100);assert.equal(r.mainStat,1050);assert.ok(Math.abs(r.statDamage-s.statDamage-.5)<1e-9);
  assert.throws(()=>replaceLines(s,[{type:'dex',value:100}],[{type:'dex',value:200}],cal),/DEX/);
  assert.throws(()=>replaceLines(s,[],[{type:'luk',value:50}]),/실측/);
  const percent=replaceLines(s,[{type:'lukPercent',value:4.5}],[{type:'lukPercent',value:6}],cal);assert.equal(percent.attack,s.attack+150);
  assert.throws(()=>replaceLines({...s,mainStat:0},[],[{type:'luk',value:50}],cal),/현재 주스탯/);
});
