// Percent inputs use percentage points, e.g. 30 means 30%.
// Source: Nexon official combat guide, 2026-10-15 revision.
export const MODEL_VERSION = 'nexon-pve-2026-10-15-v1';
export const FIELDS = [
  ['attack','공격력','',0,1e30], ['damage','데미지','%',0,1e6],
  ['amplification','데미지 증폭','%',0,1e6], ['statDamage','스탯 비례 데미지','%',0,1e6],
  ['boss','보스 몬스터 데미지','%',0,1e6], ['normal','일반 몬스터 데미지','%',0,1e6],
  ['basic','기본 공격 데미지','%',0,1e6], ['skill','스킬 데미지','%',0,1e6],
  ['critChance','크리티컬 확률','%',0,10000], ['critDamage','크리티컬 데미지 배율','%',100,1e6],
  ['minDamage','최소 데미지 배율','%',0,1e6], ['maxDamage','최대 데미지 배율','%',0,1e6],
  ['finalDamage','최종 데미지 증가량','%',0,1e6], ['penetration','방어 관통력','%',0,100],
  ['statusDamage','상태이상 데미지','%',0,1e6], ['statusUptime','상태이상 유지 비율','%',0,100],
  ['enemyDefense','대상 방어력','',0,1e12], ['critResistance','대상 크리티컬 저항','%',0,10000],
  ['vulnerability','대상 받는 피해 증가','%',0,1e6], ['reduction','대상 받는 피해 감소','%',0,95],
  ['mastery','마스터리 배율','배',0,1000], ['other','기타·던전 보정 배율','배',0,1000],
  ['coefficient','스킬 계수','%',0,1e9], ['contentScale','콘텐츠 상수','배',0,1e30],
  ['mainStat','주스탯 (기록용)','',0,1e15], ['mainPercent','주스탯 % (기록용)','%',0,1e6],
  ['attackPercent','공격력 % (기록용)','%',0,1e6], ['attackSpeed','공격 속도 (기록용)','%',0,150],
  ['cooldown','재사용 대기시간 감소 (기록용)','%',0,100]
];
export const DEFAULT_STATS = Object.fromEntries(FIELDS.map(([k])=>[k,0]));
Object.assign(DEFAULT_STATS,{attack:1000000,damage:100,amplification:20,statDamage:200,boss:40,normal:20,basic:20,skill:30,critChance:70,critDamage:150,minDamage:65,maxDamage:100,finalDamage:20,penetration:30,enemyDefense:5000,mastery:1,other:1,coefficient:100,contentScale:1,mainStat:5000,mainPercent:100,attackPercent:100});
export const EFFECTS = [
  ['none','효과 없음 / 기록용'], ['damage','데미지 %'], ['amplification','데미지 증폭 %'],
  ['boss','보스 몬스터 데미지 %'], ['normal','일반 몬스터 데미지 %'],
  ['critChance','크리티컬 확률 %'], ['critDamage','크리티컬 데미지 배율 %'],
  ['minDamage','최소 데미지 배율 %'], ['maxDamage','최대 데미지 배율 %'],
  ['finalDamage','최종 데미지 % (독립 효과)'], ['penetration','방어 관통력 % (출처별)'],
  ['basic','기본 공격 데미지 %'], ['skill','스킬 데미지 %'], ['statDamage','스탯 비례 데미지 %'],
  ['attack','표시 공격력 증감'], ['mainFlat','주스탯 고정값 (실측 환산 필요)'], ['mainPercent','주스탯 % (실측 환산 필요)'],
  ['attackPercent','공격력 % (실측 환산 필요)'], ['statusDamage','상태이상 데미지 %'],
  ...['STR','DEX','INT','LUK'].flatMap(stat=>[[stat.toLowerCase(),`${stat} (고정)`],[stat.toLowerCase()+'Percent',`${stat} %`]]),
  ['attackSpeed','공격 속도 % (기록)'],['cooldown','재사용 대기시간 감소 % (기록)'],
  ['hp','최대 HP (기록)'],['hpPercent','최대 HP % (기록)'],['mp','최대 MP (기록)'],['mpPercent','최대 MP % (기록)'],
  ['defense','방어력 (기록)'],['defensePercent','방어력 % (기록)'],['accuracy','명중 (기록)'],['evade','회피 (기록)'],['itemAttack','장비 공격력 고정값 (기록)']
];
const attributeTypes=new Set(['str','dex','int','luk','strPercent','dexPercent','intPercent','lukPercent']);
const recordTypes=new Set(['attackSpeed','cooldown','hp','hpPercent','mp','mpPercent','defense','defensePercent','accuracy','evade','itemAttack']);
const additive = new Set(EFFECTS.map(([k])=>k).filter(k=>!['none','finalDamage','penetration','mainFlat','mainPercent','attackPercent'].includes(k)&&!attributeTypes.has(k)&&!recordTypes.has(k)));
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function validateStats(s) {
  for(const [key,label,,min,max] of FIELDS) if(!Number.isFinite(s[key]) || s[key]<min || s[key]>max) throw new Error(`${label}: ${min}~${max} 범위의 숫자를 입력하세요.`);
  if(!['field','sqrt','cbrt'].includes(s.content)) throw new Error('지원하지 않는 콘텐츠입니다.');
  if(!['basic','skill'].includes(s.attackType)) throw new Error('공격 유형을 확인하세요.');
  if(!['boss','normal'].includes(s.target)) throw new Error('공격 대상을 확인하세요.');
}
export function damage(s, mode='average') {
  validateStats(s);
  const crit=clamp((s.critChance-s.critResistance)/100,0,1);
  const critical=mode==='critical'?s.critDamage/100:mode==='noncritical'?1:1+crit*(s.critDamage/100-1);
  // Official guide: minimum above maximum collapses to maximum.
  const low=Math.min(s.minDamage,s.maxDamage)/100, high=s.maxDamage/100;
  const r=s.content==='sqrt'?0.5:s.content==='cbrt'?1/3:1;
  // E[f(X)] != f(E[X]) for root-adjusted content; integrate before averaging.
  const randomMoment=high===low?Math.pow(high,r):(Math.pow(high,r+1)-Math.pow(low,r+1))/((r+1)*(high-low));
  const critMoment=mode==='critical'?Math.pow(s.critDamage/100,r):mode==='noncritical'?1:(1-crit)+crit*Math.pow(s.critDamage/100,r);
  const statusMoment=(1-s.statusUptime/100)+s.statusUptime/100*Math.pow(1+s.statusDamage/100,r);
  const defenseFactor=5000/(6000+s.enemyDefense*(1-s.penetration/100));
  const factors = {
    attack:s.attack, defense:defenseFactor, target:(1+s.vulnerability/100)*(1-s.reduction/100),
    damage:1+s.damage/100, amplification:1+s.amplification/100,
    monster:1+s[s.target==='boss'?'boss':'normal']/100,
    attackType:1+s[s.attackType]/100, stat:1+s.statDamage/100,
    mastery:s.mastery, other:s.other, final:1+s.finalDamage/100
  };
  const raw=Object.values(factors).reduce((a,b)=>a*b,1);
  const expected=Math.pow(raw,r)*randomMoment*critMoment*statusMoment*s.contentScale*s.coefficient/100;
  const noncritMin=Math.pow(raw*low,r)*s.contentScale*s.coefficient/100;
  const critMax=Math.pow(raw*high*s.critDamage/100*(1+s.statusDamage/100),r)*s.contentScale*s.coefficient/100;
  if(!Number.isFinite(expected)) throw new Error('계산 범위를 초과했습니다.');
  return {expected,noncritMin,critMax,critChance:crit,critical,factors,r};
}
export function replaceLines(snapshot, oldLines, newLines, calibration={}) {
  const result={...snapshot};
  let mainDelta=0;
  for(const line of [...oldLines,...newLines])if(!Number.isFinite(line.value)||line.value<0)throw Error('옵션 수치는 0 이상의 유한수여야 합니다.');
  // An unchanged raw stat needs no conversion. Cancel matching source lines
  // without mutating the saved equipment or hiding a genuinely changed stat.
  const oldRemaining=oldLines.map(l=>({...l})),newRemaining=newLines.map(l=>({...l}));
  for(let i=oldRemaining.length-1;i>=0;i--){
    const line=oldRemaining[i];
    if(!attributeTypes.has(line.type)&&!recordTypes.has(line.type)&&!['mainFlat','mainPercent','attackPercent'].includes(line.type))continue;
    const match=newRemaining.findIndex(l=>l.type===line.type&&l.value===line.value);
    if(match>=0){oldRemaining.splice(i,1);newRemaining.splice(match,1);}
  }
  const accumulate=(lines,sign)=> {
    for(const {type,value} of lines) {
      if(!Number.isFinite(value)||value<0) throw new Error('옵션 수치는 0 이상의 유한수여야 합니다.');
      if(type==='none'||value===0) continue;
      if(recordTypes.has(type))throw Error(`${EFFECTS.find(([k])=>k===type)?.[1]} 변경은 현재 1회 피해 모델에서 계산하지 않습니다.`);
      if(attributeTypes.has(type)) {
        const percent=type.endsWith('Percent'),stat=type.replace('Percent','').toUpperCase();
        const c=calibration.mainAttribute===stat?calibration[percent?'mainPercent':'mainFlat']:calibration[type];
        if(!c||!Number.isFinite(c.attack)||!Number.isFinite(c.statDamage))throw Error(calibration.mainAttribute===stat?`${stat}${percent?' %':''}의 실측 환산값을 내 스펙에서 입력하세요.`:`${stat}${percent?' %':''}의 별도 실측 환산이 없어 변경 효율을 계산할 수 없습니다.`);
        result.attack+=sign*value*c.attack;result.statDamage+=sign*value*c.statDamage;
        if(!percent&&calibration.mainAttribute===stat)mainDelta+=sign*value;
        continue;
      }
      if(additive.has(type)) result[type]+=sign*value;
      else if(type==='finalDamage') result.finalDamage=100*((1+result.finalDamage/100)*Math.pow(1+value/100,sign)-1);
      else if(type==='penetration') {
        if(value>=100&&sign<0) throw new Error('방관 100% 출처는 나머지 출처를 역산할 수 없습니다.');
        if(value>100) throw new Error('출처별 방관은 100% 이하여야 합니다.');
        result.penetration=100*(1-(1-result.penetration/100)*Math.pow(1-value/100,sign));
      } else if(['mainFlat','mainPercent','attackPercent'].includes(type)) {
        const c=calibration[type];
        if(!c||!Number.isFinite(c.attack)||!Number.isFinite(c.statDamage)) throw new Error(`${type==='attackPercent'?'공격력 %':type==='mainPercent'?'주스탯 %':'주스탯 고정값'}의 실측 환산값을 먼저 입력하세요.`);
        result.attack+=sign*value*c.attack; result.statDamage+=sign*value*c.statDamage;
        if(type==='mainFlat')mainDelta+=sign*value;
      } else throw new Error('지원하지 않는 옵션입니다.');
    }
  };
  accumulate(oldRemaining,-1);
  for(const [key] of FIELDS) if(result[key]<0&&result[key]>-1e-8) result[key]=0;
  validateStats(result);
  accumulate(newRemaining,1);
  if(mainDelta){if(snapshot.mainStat<=0)throw Error('현재 주스탯 수치를 내 스펙에서 먼저 입력하세요.');result.mainStat+=mainDelta;}
  // Permit only numerical roundoff, never silently accept inconsistent snapshots.
  for(const [key] of FIELDS) if(result[key]<0&&result[key]>-1e-8) result[key]=0;
  validateStats(result);
  return result;
}
export function compare(s,oldLines,newLines,calibration={}) {
  const before=damage(s).expected;
  if(before<=0) throw new Error('기준 데미지는 0보다 커야 합니다.');
  const afterStats=replaceLines(s,oldLines,newLines,calibration);
  const after=damage(afterStats).expected;
  return {before,after,gain:(after/before-1)*100,afterStats};
}
export function poissonBinomial(probabilities,minimum) {
  if(!Number.isInteger(minimum)||minimum<0||minimum>probabilities.length) throw new Error('목표 줄 수를 확인하세요.');
  const dp=Array(probabilities.length+1).fill(0); dp[0]=1;
  for(const p of probabilities) {
    if(!Number.isFinite(p)||p<0||p>1) throw new Error('확률은 0~100%여야 합니다.');
    for(let j=probabilities.length;j>=0;j--) dp[j]=dp[j]*(1-p)+(j?dp[j-1]*p:0);
  }
  return dp.slice(minimum).reduce((a,b)=>a+b,0);
}
export function expectation(p,{cost=1,budget=100,pity=0}={}) {
  if(!Number.isFinite(p)||p<0||p>1||!Number.isFinite(cost)||cost<0||!Number.isSafeInteger(budget)||budget<0||!Number.isSafeInteger(pity)||pity<0) throw new Error('확률·비용·시도 횟수를 확인하세요.');
  const logFail=p===1?-Infinity:Math.log1p(-p);
  const within=n=>pity>0&&n>=pity?1:p===1?(n>0?1:0):p===0?0:-Math.expm1(n*logFail);
  const quantile=q=>{
    let n=p===1?1:p===0?Infinity:Math.max(1,Math.ceil(Math.log1p(-q)/logFail));
    return pity>0?Math.min(n,pity):n;
  };
  const attempts=p===0?(pity||Infinity):pity>0?-Math.expm1(pity*logFail)/p:1/p;
  return {p,attempts,cost:attempts===Infinity?Infinity:attempts*cost,median:quantile(.5),p90:quantile(.9),p95:quantile(.95),success:within(budget),within};
}
export function abilityProbability({grade,option,min,max,step,threshold}) {
  if(![grade,option,min,max,step,threshold].every(Number.isFinite)||grade<0||grade>1||option<0||option>1||step<=0||max<min) throw new Error('어빌리티 등급·옵션 확률과 수치 범위를 확인하세요.');
  const intervals=(max-min)/step;
  if(Math.abs(intervals-Math.round(intervals))>1e-7) throw new Error('수치 간격으로 최솟값~최댓값을 나눌 수 있어야 합니다.');
  const total=Math.round(intervals)+1;
  const first=clamp(Math.ceil((threshold-min)/step-1e-9),0,total);
  return {p:grade*option*(total-first)/total,total,qualifying:total-first};
}
export function fitScale(rows) {
  const usable=rows.filter(r=>r.predicted>0&&r.observed>0&&Number.isFinite(r.predicted)&&Number.isFinite(r.observed));
  if(!usable.length) throw new Error('유효한 실측값을 추가하세요.');
  const scale=usable.reduce((a,r)=>a+r.predicted*r.observed,0)/usable.reduce((a,r)=>a+r.predicted*r.predicted,0);
  return {scale,count:usable.length,mape:100*usable.reduce((a,r)=>a+Math.abs(r.predicted*scale-r.observed)/r.observed,0)/usable.length};
}
