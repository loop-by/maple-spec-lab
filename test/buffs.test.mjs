import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_STATS} from '../dist/engine.mjs';
import {JOBS,SHARED,scaleFact,catalogRank} from '../dist/catalog.mjs';
import {normalizeLoadout,selection,eligibility,isLearned,collectEffects,resolveLoadout,captureReference,rebaseLoadout,repairUnknownReference,autoLearn} from '../dist/buff-engine.mjs';

function profile() {
  const p={job:'unknown',level:100,stats:{...DEFAULT_STATS,target:'boss',attackType:'skill',content:'field'},calibration:{}};
  normalizeLoadout(p);return p;
}
function custom(p,type,value) {
  const e={id:'custom-fixture',name:'독립 검산 효과',kind:'buff',category:'custom',maxRank:1};
  p.loadout.custom.push(e);
  Object.assign(selection(p,e,true),{enabled:true,manual:[{type,value}]});return e;
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('old profile migration preserves stats and records the user Global PC build',()=>{
  const p=profile();assert.equal(p.region,'global');assert.equal(p.platform,'pc');assert.equal(p.clientVersion,'1.17.0');assert.equal(p.loadout.reference,null);assert.equal(p.stats.attack,DEFAULT_STATS.attack);
  p.clientVersion='1.17.1';normalizeLoadout(p);assert.equal(p.clientVersion,'1.17.1');
});
test('catalog integrity: 14 jobs, 434 basic entries, 812 research entries, unique source IDs',()=>{
  const entries=JOBS.flatMap(j=>j.skills);
  assert.equal(JOBS.length,14);assert.equal(entries.filter(e=>e.kind!=='mastery').length,434);assert.equal(entries.filter(e=>e.kind==='mastery').length,812);
  assert.equal(new Set([...entries,...SHARED].map(e=>e.id)).size,entries.length+SHARED.length);
});
test('reference rank facts truncate the internal per-mille product before converting percent',()=>{
  near(scaleFact({base:150,curve:22,divisor:10},1),15);
  near(scaleFact({base:150,curve:22,divisor:10},2),15);
  near(scaleFact({base:150,curve:22,divisor:10},3),15.1);
  assert.throws(()=>scaleFact({base:150,curve:22,divisor:10},1001),/수치/);
});
test('no reference means explicitly pending and no second addition to the snapshot',()=>{
  const p=profile();custom(p,'damage',20);const r=resolveLoadout(p);
  assert.equal(r.pending,true);assert.equal(r.stats.damage,p.stats.damage);
});
test('unknown but identical included sources cancel without requiring speculative conversions',()=>{
  const p=profile();p.job='hero';p.loadout.advancement=3;captureReference(p);
  assert.ok(p.loadout.reference.some(c=>c.unresolved));const r=resolveLoadout(p);
  assert.equal(r.error,null);assert.deepEqual(r.stats,p.stats);assert.equal(r.changes.length,0);
});
test('independent final-damage replacement and rebase do not double count the active buff',()=>{
  const p=profile();p.stats.finalDamage=32;const e=custom(p,'finalDamage',10);captureReference(p);
  selection(p,e,true).manual[0].value=20;near(resolveLoadout(p).stats.finalDamage,44);
  rebaseLoadout(p);near(p.stats.finalDamage,44);near(resolveLoadout(p).stats.finalDamage,44);assert.equal(resolveLoadout(p).changes.length,0);
});
test('turning off an included final-damage source divides it out',()=>{
  const p=profile();p.stats.finalDamage=32;const e=custom(p,'finalDamage',10);captureReference(p);
  selection(p,e,true).enabled=false;near(resolveLoadout(p).stats.finalDamage,20);
});
test('missing combat data blocks a changed source instead of returning a plausible zero gain',()=>{
  const p=profile(),e=SHARED.find(e=>e.id==='guild-noblesse-damage');p.loadout.reference=[];
  selection(p,e,true).enabled=true;assert.match(resolveLoadout(p).error,/전투 수치/);
});
test('a same-rank measured correction repairs an unknown included source even when now disabled',()=>{
  const p=profile(),e=SHARED.find(e=>e.id==='guild-noblesse-damage'),s=selection(p,e,true);s.enabled=true;captureReference(p);
  s.enabled=false;s.manual=[{type:'damage',value:10}];repairUnknownReference(p,e);
  assert.equal(resolveLoadout(p).error,null);near(resolveLoadout(p).stats.damage,p.stats.damage-10);
});
test('a KR-only source requires Global verification or explicit user numbers',()=>{
  const p=profile(),e=SHARED.find(e=>e.id==='relic-horn-own'),s=selection(p,e,true);s.enabled=true;
  assert.equal(eligibility(p,e).eligible,false);
  s.manual=[{type:'boss',value:15}];assert.equal(eligibility(p,e).eligible,true);
  p.loadout.reference=[];near(resolveLoadout(p).stats.boss,p.stats.boss+15);
});
test('chapter-idle booster cannot affect other content',()=>{
  const p=profile(),e=SHARED.find(e=>e.id==='halloween-pumpkin'),s=selection(p,e,true);s.enabled=true;
  assert.equal(eligibility(p,e).eligible,false);p.encounter='chapterIdle';assert.equal(eligibility(p,e).eligible,true);
});
test('level and completed advancement both gate a learned passive',()=>{
  const p=profile();p.job='windBreaker';p.level=74;p.loadout.advancement=3;
  const e=JOBS.find(j=>j.id===p.job).skills.find(e=>e.name==='알바트로스'),s=selection(p,e,true);s.learned='yes';
  assert.equal(isLearned(p,e),false);p.level=75;assert.equal(isLearned(p,e),true);p.loadout.advancement=2;assert.equal(isLearned(p,e),false);
});
test('masteries remain research records and never become global damage just from character level',()=>{
  const p=profile();p.job='hero';p.loadout.advancement=4;autoLearn(p);
  const e=JOBS[0].skills.find(e=>e.kind==='mastery');assert.equal(selection(p,e).learned,'no');
  Object.assign(selection(p,e,true),{learned:'yes',enabled:true});assert.equal(collectEffects(p).some(c=>c.id===e.id),false);
});
test('skill-specific modifiers do not become a global final-damage source',()=>{
  const e=JOBS.find(j=>j.id==='hero').skills.find(e=>e.id==='hero-14080');
  assert.deepEqual(catalogRank(e,1).effects,[]);assert.ok(catalogRank(e,1).unresolved);
});
test('ring-of-cycles condition variants are mutually exclusive and cap excess-crit stacks',()=>{
  const e=SHARED.find(e=>e.id==='relic-ring-equip');
  assert.deepEqual(e.ranks[0].effects,[{type:'critChance',value:30}]);
  assert.deepEqual(e.ranks[1].effects,[{type:'skill',value:40}]);
  assert.deepEqual(e.ranks[11].effects,[{type:'skill',value:40},{type:'basic',value:60}]);
});
test('invalid saved loadouts are rejected and custom catalog payloads are sanitized',()=>{
  const p=profile();p.loadout.selections.invalid={learned:'yes',enabled:true,rank:1,unlock:null,manual:[{type:'damage',value:Infinity}]};assert.throws(()=>normalizeLoadout(p),/수치/);
  delete p.loadout.selections.invalid;custom(p,'damage',1);p.loadout.custom[0].ranks={invalid:true};normalizeLoadout(p);assert.equal('ranks' in p.loadout.custom[0],false);
});
