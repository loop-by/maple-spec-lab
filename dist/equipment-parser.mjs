import {parseStatNumber} from './screenshot-parser.mjs';
import {slotKey} from './equipment-data.mjs';

const aliases={
  attack:['공격력','attack','atk'],hp:['최대HP','HP','maxhp'],mp:['최대MP','MP','maxmp'],defense:['방어력','defense'],
  accuracy:['명중'],evade:['회피'],damage:['데미지','대미지','damage'],amplification:['데미지증폭'],statDamage:['스탯비례데미지'],
  boss:['보스몬스터데미지','보스몬스터대미지'],normal:['일반몬스터데미지','일반몬스터대미지'],basic:['기본공격데미지'],skill:['스킬데미지'],
  critChance:['크리티컬확률','치명타확률'],critDamage:['크리티컬데미지','치명타데미지'],minDamage:['최소데미지배율'],maxDamage:['최대데미지배율'],
  finalDamage:['최종데미지'],penetration:['방어관통력'],attackSpeed:['공격속도'],cooldown:['스킬재사용대기시간감소','재사용대기시간감소'],
  str:['STR'],dex:['DEX'],int:['INT'],luk:['LUK'],mainFlat:['주스탯'],
  ...Object.fromEntries(Array.from({length:5},(_,i)=>[`skillLevel${i+1}`,[`${i+1}차스킬레벨`]])),
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
export function itemEffect(line,source='unclassified') {
  return {label:line.label,value:line.value,unit:line.unit,type:line.type==='attack'?'itemAttack':line.type,source};
}
function parseItemEffects(rows) {
  const effects=[];let started=false,source='unclassified';
  const rowCenter=row=>{
    if(!row.bbox)return null;
    // Use the label baseline: a cursor over the right-hand number can extend
    // its bounding box and otherwise look like the gap before a random roll.
    const cutoff=row.bbox.x0+(row.bbox.x1-row.bbox.x0)*.6;
    const centers=(row.words??[]).filter(word=>word.bbox&&word.bbox.x0<cutoff&&/[가-힣A-Za-z0-9]/.test(word.text))
      .map(word=>(word.bbox.y0+word.bbox.y1)/2).sort((a,b)=>a-b);
    return centers.length?centers[Math.floor(centers.length/2)]:(row.bbox.y0+row.bbox.y1)/2;
  };
  for(const row of rows){
    const text=typeof row==='string'?row:row.text,compact=text.replace(/\s/g,'');
    if(/^(장착효과|기본(?:장착)?(?:효과|옵션))$/.test(compact)){started=true;source=compact==='장착효과'?'unclassified':'base';continue;}
    if(/^(?:랜덤)?추가옵션$/.test(compact)){started=true;source='random';continue;}
    if(!started)continue;
    if(/^(잠재옵션|에디셔널잠재|보유효과|세트효과)/.test(compact))break;
    const line=equipmentLine(text)??(row.numberUnread&&row.labelHint?{...equipmentLine(row.labelHint+' 0'),label:row.labelHint,value:null,unit:''}:null);
    if(line)effects.push({effect:itemEffect(line,source),center:rowCenter(row)});
  }
  // The item panel separates the random rolls with a larger vertical gap,
  // even when a roll repeats a base stat (e.g. defense or accuracy).
  // Do not guess from the stat name or assume that every item has three bases.
  const gaps=effects.slice(1).map((row,i)=>row.center!==null&&effects[i].center!==null?row.center-effects[i].center:null);
  const distances=gaps.filter(gap=>gap>0).sort((a,b)=>a-b);
  const spacing=distances.length>=2?distances[Math.floor((distances.length-1)/2)]:null;
  const boundary=spacing?gaps.findIndex((gap,i)=>i>=1&&gap>=spacing*1.25&&gap<=spacing*1.8):-1;
  if(boundary>=0)for(let i=0;i<effects.length;i++)if(effects[i].effect.source==='unclassified')effects[i].effect.source=i<=boundary?'base':'random';
  return effects.map(row=>row.effect);
}
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
  const item={name,rarity,quality,level:level?Number(level):null,effects:parseItemEffects(itemLines)};
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
