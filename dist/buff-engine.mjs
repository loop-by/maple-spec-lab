import {JOBS, SHARED, catalogRank} from './catalog.mjs';
import {EFFECTS, replaceLines, validateStats} from './engine.mjs?v=0.3.1';

const types = new Set(EFFECTS.map(([type])=>type));
const jobKey = value => String(value??'').replace(/\s/g,'').toLowerCase();
export const jobOf = p => JOBS.find(j=>[j.id,j.name,j.enName].some(name=>jobKey(name)===jobKey(p.job))) ?? null;
export const entriesFor = p => [...(jobOf(p)?.skills ?? []), ...SHARED, ...p.loadout.custom];
export const entryFor = (p,id) => entriesFor(p).find(e=>e.id===id);
export function normalizeLoadout(p) {
  p.region ??= 'global';
  p.platform ??= 'pc';
  p.clientVersion ??= '1.17.0';
  p.encounter ??= 'other';
  if(!['global','kr'].includes(p.region) || !['pc','ios','android','unknown'].includes(p.platform) || typeof p.clientVersion!=='string' || p.clientVersion.length>30) throw Error('게임 지역·플랫폼·버전을 확인하세요.');
  if(!['other','chapterIdle','chapterChallenge','growth','zakum','horntail','pinkbean'].includes(p.encounter)) throw Error('버프 적용 콘텐츠를 확인하세요.');
  p.loadout ??= {advancement:0, selections:{}, custom:[], reference:null, referenceAt:null};
  const l=p.loadout;
  if(!l || typeof l!=='object' || !Number.isInteger(l.advancement) || l.advancement<0 || l.advancement>4 || !l.selections || typeof l.selections!=='object' || Array.isArray(l.selections) || Object.keys(l.selections).length>1500 || !Array.isArray(l.custom) || l.custom.length>50 || (l.reference!==null && (!Array.isArray(l.reference)||l.reference.length>1000))) throw Error('스킬·버프 설정 형식을 확인하세요.');
  for(const [id,s] of Object.entries(l.selections)) {
    if(id.length>200 || ['__proto__','constructor','prototype'].includes(id) || !s || !['auto','yes','no'].includes(s.learned) || typeof s.enabled!=='boolean' || !Number.isInteger(s.rank) || s.rank<1 || s.rank>1000 || !(s.unlock===null || Number.isInteger(s.unlock)&&s.unlock>=1&&s.unlock<=10000)) throw Error('스킬 습득 설정을 확인하세요.');
    validateEffects(s.manual);
  }
  for(const e of l.custom) if(!e || typeof e.id!=='string' || !e.id.startsWith('custom-') || typeof e.name!=='string' || e.name.length>100 || !['buff','passive'].includes(e.kind) || e.category!=='custom') throw Error('직접 등록 효과를 확인하세요.');
  l.custom=l.custom.map(e=>({id:e.id,name:e.name,kind:e.kind,category:'custom',maxRank:1,description:'게임 툴팁 또는 실측으로 확인한 전체 스탯 변화량을 입력하세요.'}));
  if(l.reference) for(const c of l.reference) {
    if(!c || typeof c.id!=='string' || c.id.length>200 || typeof c.name!=='string' || c.name.length>150 || typeof c.unresolved!=='string' || c.unresolved.length>2000 || !Array.isArray(c.effects) || c.rank!==undefined&&(!Number.isInteger(c.rank)||c.rank<1||c.rank>1000)) throw Error('버프 기준 상태를 확인하세요.');
    validateEffects(c.effects);
  }
  if(l.referenceAt!==null && typeof l.referenceAt!=='string') throw Error('버프 기준 날짜를 확인하세요.');
  return l;
}
function validateEffects(a) {
  if(a===null) return;
  if(!Array.isArray(a) || a.length>20 || a.some(e=>!e || !types.has(e.type) || !Number.isFinite(e.value) || e.value<0 || e.value>1e30)) throw Error('효과의 종류와 수치를 확인하세요.');
}
export function selection(p,e,write=false) {
  let s=Object.hasOwn(p.loadout.selections,e.id)?p.loadout.selections[e.id]:null;
  if(!s) {
    s={learned:e.kind==='mastery'?'no':e.jobId?'auto':'yes',enabled:!!e.jobId&&e.kind==='passive',rank:1,unlock:null,manual:e.category==='custom'?[{type:'damage',value:0}]:null};
    if(write)p.loadout.selections[e.id]=s;
  }
  return s;
}
export function eligibility(p,e,s=selection(p,e)) {
  const unlock=s.unlock??e.unlock;
  if(e.regions && !e.regions.includes(p.region) && s.manual===null) return {eligible:false,label:'선택한 지역의 수치 확인 필요',locked:false};
  if(e.contexts && !e.contexts.includes(p.encounter)) return {eligible:false,label:'콘텐츠 적용 조건 불충족',locked:true};
  if(unlock!=null && p.level<unlock) return {eligible:false,label:`Lv.${unlock} 필요`,locked:true};
  if(e.jobId && e.tier && p.loadout.advancement>0 && e.tier>p.loadout.advancement) return {eligible:false,label:`${e.tier}차 전직 필요`,locked:true};
  if(e.jobId && s.learned!=='yes' && (unlock==null || !p.loadout.advancement)) return {eligible:false,label:unlock==null?'해금 레벨 확인 필요':'전직 완료 선택 필요',locked:false};
  return {eligible:true,label:unlock!=null?`Lv.${unlock} 조건 충족`:'습득 직접 확인',locked:false};
}
export function isLearned(p,e,s=selection(p,e)) {return s.learned!=='no' && eligibility(p,e,s).eligible;}
export function rankFor(e,s) {return e.ranks?.find(r=>r.level===s.rank) ?? catalogRank(e,s.rank);}
export function contribution(p,e) {
  const s=selection(p,e);
  if(!s.enabled || !isLearned(p,e,s) || ['attack','mastery','info'].includes(e.kind)) return null;
  return numericContribution(e,s);
}
function numericContribution(e,s) {
  if(s.manual!==null) return {id:e.id,name:e.name,rank:s.rank,effects:structuredClone(s.manual),unresolved:''};
  const r=rankFor(e,s);
  const effects=(r?.effects??e.effects??[]).filter(x=>types.has(x.type));
  let unresolved='';
  if(e.combat!==false && (!r && !e.effects || r?.unresolved || e.unresolved)) unresolved=r?.unresolved || e.unresolved || `스킬 Lv.${s.rank}의 전투 수치 미확인`;
  return {id:e.id,name:e.name,rank:s.rank,effects:structuredClone(effects),unresolved};
}
export function repairUnknownReference(p,e) {
  const ref=p.loadout.reference?.find(c=>c.id===e.id),s=selection(p,e);
  if(ref && (ref.unresolved || ref.manualCalibration) && (ref.rank??s.rank)===s.rank) {
    Object.assign(ref,numericContribution(e,s),{manualCalibration:s.manual!==null});
  }
}
export function collectEffects(p) {return entriesFor(p).map(e=>contribution(p,e)).filter(Boolean);}
const signature=c=>JSON.stringify([c.effects,c.unresolved]);
export function resolveLoadout(p) {
  const active=collectEffects(p), reference=p.loadout.reference;
  if(reference===null)return {stats:{...p.stats},pending:true,active,changes:[],error:null};
  const old=new Map(reference.map(c=>[c.id,c])), next=new Map(active.map(c=>[c.id,c]));
  const removed=[],added=[],changes=[];
  for(const id of new Set([...old.keys(),...next.keys()])) {
    const a=old.get(id), b=next.get(id);
    if(a && b && signature(a)===signature(b))continue;
    if(a)removed.push(a);
    if(b)added.push(b);
    changes.push({id,name:(b??a).name,before:a??null,after:b??null});
  }
  const unknown=[...removed,...added].filter(c=>c.unresolved);
  if(unknown.length)return {stats:null,pending:false,active,changes,error:`${[...new Set(unknown.map(c=>c.name))].join(', ')}: 변경한 효과의 전투 수치를 확인하거나 ‘직접 수치로 대체’를 입력하세요.`};
  try {
    // Identical sources cancel before inversion, including uncalibrated source types.
    const stats=replaceLines(p.stats,removed.flatMap(c=>c.effects),added.flatMap(c=>c.effects),p.calibration);
    validateStats(stats);
    return {stats,pending:false,active,changes,error:null};
  } catch(e) {return {stats:null,pending:false,active,changes,error:e.message};}
}
export function effectiveStats(p) {const r=resolveLoadout(p);if(r.error)throw Error(r.error);return r.stats;}
export function captureReference(p) {p.loadout.reference=collectEffects(p);p.loadout.referenceAt=new Date().toISOString();}
export function rebaseLoadout(p,stats=effectiveStats(p)) {p.stats={...stats};captureReference(p);}
export function autoLearn(p) {
  if(!p.loadout.advancement)throw Error('실제로 완료한 전직 단계를 먼저 선택하세요.');
  for(const e of jobOf(p)?.skills??[]) {
    if(e.kind==='mastery')continue;
    const s=selection(p,e,true),unlock=s.unlock??e.unlock;
    if(unlock==null)continue;
    s.learned=unlock!=null&&p.level>=unlock&&e.tier<=p.loadout.advancement?'yes':'no';
  }
}
