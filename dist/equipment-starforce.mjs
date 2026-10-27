// User observations supplied on 2026-10-26. Values are added amplification:
// 1.05 means +105%, so the total multiplier is 2.05. Unknown cells stay null.
export const STARFORCE_RATES={
  0:{main:0,sub:0},1:{main:null,sub:0},2:{main:null,sub:0},3:{main:null,sub:0},4:{main:null,sub:0},
  8:{main:1.05,sub:.10},9:{main:1.20,sub:.10},10:{main:1.50,sub:.25},
  11:{main:1.75,sub:.25},12:{main:2,sub:.25},13:{main:2.25,sub:.25},
};
export function starforceEstimate(item,effect,targetStars) {
  const key=effect.source==='base'?'main':effect.source==='random'?'sub':null;
  if(!key)return {reason:'주·부 옵션 분류 필요'};
  const observed=item.observation?.basis==='base'?0:item.observation?.stars??item.stars;
  if(!Number.isInteger(observed))return {reason:'촬영 당시 슬롯 별 개수 확인 필요'};
  if(!Number.isInteger(targetStars)||targetStars<0||targetStars>30)return {reason:'목표 별 개수 확인 필요'};
  if(observed===targetStars){
    const rate=STARFORCE_RATES[observed]?.[key];
    return rate===null||rate===undefined?{predicted:effect.value}:{predicted:effect.value,base:effect.value/(1+rate),added:effect.value-effect.value/(1+rate)};
  }
  const current=STARFORCE_RATES[observed]?.[key],target=STARFORCE_RATES[targetStars]?.[key];
  if(current===null||current===undefined)return {reason:`${observed}성 ${key==='main'?'주':'부'} 옵션 증폭 미확인`};
  if(!Number.isFinite(effect.value)||effect.value<0)return {reason:'현재 수치 확인 필요'};
  const base=effect.value/(1+current),added=effect.value-base;
  if(target===null||target===undefined)return {base,added,reason:`${targetStars}성 ${key==='main'?'주':'부'} 옵션 증폭 미확인`};
  return {base,added,predicted:base*(1+target)};
}
export function itemAtSlot(item,slot) {
  // Only the photographed item's values are normalized to the destination
  // slot stars. Scroll attack/amplification already live in the character
  // snapshot and remain fixed throughout an item comparison.
  if(!item)return {item:null,estimated:false};
  if(!slot)return {item,estimated:false};
  if(slot.needsStatsReview)return {error:'슬롯 강화가 바뀌었습니다. 현재 스펙을 확인한 뒤 슬롯 강화 기준을 확인하세요.'};
  if(!Number.isInteger(slot.stars))return {error:'슬롯의 별 개수를 먼저 기록하세요.'};
  const observed=item.observation?.basis==='base'?0:item.observation?.stars;
  if(!Number.isInteger(observed))return {error:'장비 수치를 촬영한 당시의 슬롯 별 개수를 확인하세요.'};
  if(observed===slot.stars)return {item,estimated:false};
  const effects=[];
  for(const effect of item.effects){
    const result=starforceEstimate(item,effect,slot.stars);
    if(result.predicted===undefined)return {error:result.reason};
    effects.push({...effect,value:result.predicted});
  }
  return {item:{...item,effects,observation:{basis:'applied',stars:slot.stars}},estimated:true};
}
