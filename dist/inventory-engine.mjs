import {compare,damage,replaceLines,EFFECTS} from './engine.mjs?v=0.3.1';
import {equipmentLine} from './equipment-parser.mjs?v=0.3.1';
import {itemAtSlot} from './equipment-starforce.mjs?v=0.3.1';

const neutral=new Set(['hp','hpPercent','mp','mpPercent','defense','defensePercent','accuracy','evade','attackSpeed','cooldown']);
const attributes=new Set(['str','dex','int','luk','strPercent','dexPercent','intPercent','lukPercent','mainFlat','mainPercent','attackPercent']);
const labels=new Map(EFFECTS);
export function itemLines(item) {
  return (item?.effects??[]).map(effect=>{
    const parsed=equipmentLine(`${effect.label} ${effect.value}${effect.unit}`);
    let type=effect.type??parsed?.type??'unread';if(type==='attack')type='itemAttack';
    return {...effect,type,typeKey:type==='unread'?`unread:${effect.label.replace(/\s/g,'')}:${effect.unit}`:type};
  });
}
export function itemDifferences(current,candidate) {
  const rows=new Map();
  for(const [item,key] of [[current,'old'],[candidate,'next']])for(const effect of itemLines(item)){
    const id=`${effect.source??'unclassified'}:${effect.typeKey}:${effect.unit}`;
    if(!rows.has(id))rows.set(id,{label:effect.label,source:effect.source,unit:effect.unit,type:effect.type,old:0,next:0});
    rows.get(id)[key]+=effect.value;
  }
  return [...rows.values()].map(row=>({...row,delta:row.next-row.old}));
}
function prepare(oldLines,newLines,calibration) {
  const old=[],next=[],totals=new Map(),issues=[],excluded=new Set();
  for(const [lines,sign,target] of [[oldLines,-1,old],[newLines,1,next]])for(const line of lines){
    if(!Number.isFinite(line.value)||line.value<0)throw Error('장비 옵션 수치를 확인하세요.');
    const type=line.type,key=line.typeKey??type;
    if(neutral.has(type)){if(line.value)excluded.add(labels.get(type)??line.label);continue;}
    if(attributes.has(type)||type==='itemAttack'||/^skillLevel/.test(type)||type==='unread'){
      const row=totals.get(key)??{type,delta:0,label:line.label??labels.get(type)??type};row.delta+=sign*line.value;totals.set(key,row);
    }else target.push({type,value:line.value});
  }
  for(const {type,delta,label} of totals.values()){
    if(Math.abs(delta)<1e-9)continue;
    const target=delta>0?next:old,value=Math.abs(delta);
    if(attributes.has(type)){target.push({type,value});continue;}
    if(type==='unread'){issues.push(`${label}: 항목 종류 확인 필요`);continue;}
    const conversion=calibration[type];
    if(!conversion||!Number.isFinite(conversion.attack)||!Number.isFinite(conversion.statDamage)){issues.push(`${label}: 실측 환산 필요`);continue;}
    for(const field of ['attack','statDamage']){
      const change=delta*conversion[field];
      if(change)(change>0?next:old).push({type:field,value:Math.abs(change)});
    }
  }
  return {old,next,issues,excluded:[...excluded]};
}
export function compareItems(snapshot,current,candidate,calibration={},slot=null) {
  let differences=itemDifferences(current,candidate);
  try{
    if([current,candidate].some(item=>item&&!item.effects?.length))throw Error('장비의 주·부 옵션을 먼저 등록하세요.');
    const before=itemAtSlot(current,slot),after=itemAtSlot(candidate,slot);
    if(before.error||after.error)throw Error(before.error??after.error);
    differences=itemDifferences(before.item,after.item);
    const prepared=prepare(itemLines(before.item),itemLines(after.item),calibration);
    if(prepared.issues.length)return {error:prepared.issues.join(' · '),issues:prepared.issues,differences,excluded:prepared.excluded};
    const result=compare(snapshot,prepared.old,prepared.next,calibration);
    return {...result,differences,excluded:prepared.excluded,estimated:before.estimated||after.estimated};
  }catch(error){return {error:error.message,differences,excluded:[]};}
}
export function itemContribution(snapshot,item,calibration={},slot=null) {
  const removed=compareItems(snapshot,item,null,calibration,slot);
  return removed.error?removed:{...removed,share:(1-removed.after/removed.before)*100};
}
export function slotContribution(snapshot,slot,calibration={},layer='all') {
  try{
    if(slot.needsStatsReview)throw Error('슬롯 강화 변경 후 현재 스펙 확인이 필요합니다.');
    const lines=layer==='all'?[...slot.miracle.old,...slot.additional.old]:slot[layer].old;
    const prepared=prepare(lines,[],calibration);
    if(prepared.issues.length)return {error:prepared.issues.join(' · ')};
    const before=damage(snapshot).expected;if(before<=0)throw Error('기준 피해는 0보다 커야 합니다.');
    const after=damage(replaceLines(snapshot,prepared.old,prepared.next,calibration)).expected;
    return {share:(1-after/before)*100,excluded:prepared.excluded};
  }catch(error){return {error:error.message};}
}
