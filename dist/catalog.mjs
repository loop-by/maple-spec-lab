import {CURVES} from './catalog-data.mjs';
export {JOBS,SHARED,SOURCES,COVERAGE,CATALOG_DATE} from './catalog-data.mjs';

// Rank factors are factual lookup rows from the referenced client table.
// This is a display/reference projection, not a claim of 1.17 live-game parity.
export function scaleFact(fact,level) {
  let value=fact.base;
  if(fact.curve!=null) {
    const factor=CURVES[fact.curve]?.[level];
    if(!Number.isSafeInteger(factor))throw Error('이 스킬 레벨의 참고 수치가 없습니다.');
    value += Math.trunc(value*(factor-1000)/1000);
  }
  return value/(fact.divisor??1);
}
export function catalogRank(entry,level) {
  if(!entry.effectModel && !entry.facts)return null;
  const facts=entry.facts??[];
  const effects=(entry.effectModel??[]).map(f=>({type:f.type,value:scaleFact(f,level)}));
  const description=facts.map(f=>`${f.label} ${scaleFact(f,level).toLocaleString('ko-KR',{maximumFractionDigits:3})}${f.unit??''}`).join(' · ') || entry.description || '별도 발동·이동 효과입니다. 상세 내용은 원본 툴팁을 확인하세요.';
  return {level,description,effects,unresolved:entry.unresolved??''};
}
