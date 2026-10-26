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
  if(!Number.isInteger(item.stars))return {reason:'현재 별 개수 확인 필요'};
  if(!Number.isInteger(targetStars)||targetStars<0||targetStars>30)return {reason:'목표 별 개수 확인 필요'};
  const current=STARFORCE_RATES[item.stars]?.[key],target=STARFORCE_RATES[targetStars]?.[key];
  if(current===null||current===undefined)return {reason:`${item.stars}성 ${key==='main'?'주':'부'} 옵션 증폭 미확인`};
  if(!Number.isFinite(effect.value)||effect.value<0)return {reason:'현재 수치 확인 필요'};
  const base=effect.value/(1+current),added=effect.value-base;
  if(target===null||target===undefined)return {base,added,reason:`${targetStars}성 ${key==='main'?'주':'부'} 옵션 증폭 미확인`};
  return {base,added,predicted:base*(1+target)};
}
