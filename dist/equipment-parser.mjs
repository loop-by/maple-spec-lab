import {parseStatNumber} from './screenshot-parser.mjs';
import {slotKey} from './equipment-data.mjs';

const aliases={
  attack:['공격력','attack','atk'],hp:['최대HP','HP','maxhp'],mp:['최대MP','MP','maxmp'],defense:['방어력','defense'],
  accuracy:['명중'],evade:['회피'],damage:['데미지','대미지','damage'],amplification:['데미지증폭'],statDamage:['스탯비례데미지'],
  boss:['보스몬스터데미지','보스몬스터대미지'],normal:['일반몬스터데미지','일반몬스터대미지'],basic:['기본공격데미지'],skill:['스킬데미지'],
  critChance:['크리티컬확률','치명타확률'],critDamage:['크리티컬데미지','치명타데미지'],minDamage:['최소데미지배율'],maxDamage:['최대데미지배율'],
  finalDamage:['최종데미지'],penetration:['방어관통력'],attackSpeed:['공격속도'],cooldown:['스킬재사용대기시간감소','재사용대기시간감소'],
  str:['STR'],dex:['DEX'],int:['INT'],luk:['LUK'],mainFlat:['주스탯'],skillLevel3:['3차스킬레벨'],
};
const normalized=s=>s.normalize('NFKC').replace(/[\s|:：·]/g,'').toLowerCase();
const labels=new Map(Object.entries(aliases).flatMap(([key,names])=>names.map(name=>[normalized(name),key])));
export function equipmentLine(text) {
  const clean=String(text).normalize('NFKC').replace(/^[\s|]+|[\s|]+$/g,'');
  const match=clean.match(/^(.*?)\s*([+]?\d[\d,]*(?:\.\d+)?)\s*(%)?$/);
  if(!match||!match[1].trim())return null;
  const value=parseStatNumber(match[2]);if(value===null)return null;
  const label=match[1].trim(),unit=match[3]??'',base=labels.get(normalized(label));
  let type=base??'unread';
  if(unit==='%'&&['str','dex','int','luk','hp','mp','defense'].includes(type))type+='Percent';
  if(type==='attack'&&unit==='%')type='attackPercent';
  if(type==='mainFlat'&&unit==='%')type='mainPercent';
  return {type,label,value,unit,raw:clean};
}
const slots=['어깨장식','모자','상의','하의','망토','장갑','신발','벨트','반지','목걸이','눈장식','얼굴장식','귀고리'];
export function parseEquipment(itemLines,potentialLines,{title='',grade='',metadata=''}={}) {
  const itemText=itemLines.map(r=>typeof r==='string'?r:r.text).join('\n');
  const potentialText=potentialLines.map(r=>typeof r==='string'?r:r.text).join('\n');
  const compactItem=(itemText+'\n'+metadata).replace(/\s/g,''),compactPotential=potentialText.replace(/\s/g,'');
  const slotName=slots.find(s=>compactPotential.includes(s+'슬롯강화'))??slots.find(s=>new RegExp('(유니크|레전드리|에픽|레어|일반)'+s).test(compactItem));
  const rarity=compactItem.match(/레전드리|유니크|에픽|레어/)?.[0]??'';
  const quality=compactItem.match(/최상급|상급|중급|하급/)?.[0]??'';
  const level=itemText.match(/Lv\.?\s*(\d{1,4})/i)?.[1];
  let name=(title.trim().split('\n').filter(Boolean)[0]??'').replace(/^[\s,，·|]+/,'').replace(/\s+/g,' ');
  if(!name||name.length>80||/장착|슬롯|강화|Lv\./i.test(name))name='';
  const item={name,rarity,quality,level:level?Number(level):null,effects:[]};
  let inEffects=false;
  for(const row of itemLines){const text=typeof row==='string'?row:row.text;if(text.replace(/\s/g,'').includes('장착효과')){inEffects=true;continue;}if(!inEffects)continue;const line=equipmentLine(text);if(line)item.effects.push({label:line.label,value:line.value,unit:line.unit});else if(row.numberUnread&&row.labelHint)item.effects.push({label:row.labelHint,value:null,unit:''});}
  const groups={potential:[],additional:[]};let section='potential',started=false;
  for(const row of potentialLines){
    const text=typeof row==='string'?row:row.text;
    const compact=text.replace(/\s/g,'');
    if(compact.includes('에디셔널잠재')){section='additional';started=true;continue;}
    if(compact.includes('잠재옵션')){started=true;continue;}
    const line=equipmentLine(text);
    if(!started||!line||groups[section].length>=3)continue;
    if(line.type==='unread'&&!/[가-힣A-Za-z×]/.test(line.label))continue;
    groups[section].push(line);
  }
  const convert=lines=>lines.length?lines.map(l=>({type:l.type==='attack'?'itemAttack':l.type,value:l.value,label:l.label,unit:l.unit})):null;
  return {slotKey:slotName?slotKey(slotName):null,item,potential:convert(groups.potential),additional:convert(groups.additional),potentialGrade:grade.match(/레전드리|유니크|에픽|레어/)?.[0]??'',additionalGrade:''};
}
