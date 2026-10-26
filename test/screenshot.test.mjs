import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_STATS} from '../dist/engine.mjs';
import {parseStatNumber,parseStatLines,mergeStatCandidates,reviewedStats,visualStatLines} from '../dist/screenshot-parser.mjs';
import {checkScreenshotFiles} from '../dist/screenshot-ocr.mjs';

const base=()=>({...DEFAULT_STATS,target:'boss',attackType:'skill',content:'field'});
const read=text=>parseStatLines(text.split('\n').map(text=>({text,confidence:95})),0);

test('screenshot numbers preserve Korean units, grouped decimals, zero and English suffixes',()=>{
  for(const [text,value] of [['1억 2,500만',125000000],['1.2억',120000000],['2조 3억 4만 5',2000300040005],['1,234.56%',1234.56],['0%',0],['+ 15.2 %',15.2],['2.5M',2500000],['１２．５％',12.5]]) assert.equal(parseStatNumber(text),value,text);
});
test('ambiguous numbers are never silently repaired or replaced with zero',()=>{
  for(const text of ['', 'O.5%', '1,23', '1 234', '1.2.3', '10 → 20', '-5%', 'NaN', 'Infinity','1e3','2만 3억','5% 추가','1만 20000','100 / 200']) assert.equal(parseStatNumber(text),null,text);
});
test('long stat labels take precedence and ordinary player defense is not enemy defense',()=>{
  const rows=read('보스 몬스터 데미지 45%\n일반 몬스터 데미지 25%\n데미지 증폭 12%\n데미지 100%\n공격력 % 30%\n공격력 1.2억\n방어력 5000\n공격력 증가 효과 20%');
  assert.deepEqual(rows.map(r=>[r.key,r.value]),[['boss',45],['normal',25],['amplification',12],['damage',100],['attackPercent',30],['attack',120000000]]);
});
test('English and space-separated Korean labels work across multiple columns',()=>{
  const rows=read('Boss DMG 45%    Crit Rate 75%\n공 격 력 : 1,234\n공격력 10%');
  assert.deepEqual(rows.map(r=>[r.key,r.value]),[['boss',45],['critChance',75],['attack',1234],['attack',null]]);
});
test('duplicate photos agree without double counting; conflicting values require a choice',()=>{
  const first=read('공격력 1,000\n데미지 100%');
  const second=parseStatLines([{text:'공격력 2,000',confidence:99},{text:'데미지 100%',confidence:95}],1);
  const rows=mergeStatCandidates([...first,...second]);
  assert.equal(rows.find(r=>r.key==='attack').conflict,true);
  assert.equal(rows.find(r=>r.key==='attack').selected,false);
  assert.equal(rows.find(r=>r.key==='damage').conflict,false);
  assert.equal(rows.find(r=>r.key==='damage').selected,true);
});
test('adding photos preserves edited values, exclusions and critical damage interpretation',()=>{
  const first=read('공격력 1,000\n데미지 100%\n크리티컬 데미지 50%');
  const previous=mergeStatCandidates(first);
  Object.assign(previous.find(r=>r.key==='attack'),{raw:'1,500',reviewed:true,selected:true});
  Object.assign(previous.find(r=>r.key==='damage'),{reviewed:true,selected:false});
  Object.assign(previous.find(r=>r.key==='critDamage'),{reviewed:true,selected:true,basis:'extra'});
  const combined=mergeStatCandidates([...first,...read('공격력 2,000\n데미지 100%\n크리티컬 데미지 60%\n보스 데미지 45%')],previous);
  assert.equal(combined.find(r=>r.key==='attack').raw,'1,500');
  assert.equal(combined.find(r=>r.key==='attack').conflict,true);
  assert.equal(combined.find(r=>r.key==='damage').selected,false);
  assert.equal(combined.find(r=>r.key==='critDamage').basis,'extra');
  assert.equal(reviewedStats(base(),combined).critDamage,150);
  assert.equal(reviewedStats(base(),combined).attack,1500);
  assert.equal(reviewedStats(base(),combined).boss,45);
});
test('new conflicting readings unselect an automatic suggestion until reviewed',()=>{
  const first=read('공격력 1,000');
  const previous=mergeStatCandidates(first);
  assert.equal(previous[0].selected,true);
  const updated=mergeStatCandidates([...first,...read('공격력 2,000')],previous);
  assert.equal(updated[0].conflict,true);
  assert.equal(updated[0].selected,false);
});
test('uncertain OCR is unselected and unknown fields stay unchanged after a partial import',()=>{
  const stats=base();
  const rows=mergeStatCandidates([{...read('공격력 200')[0],confidence:50},...read('데미지 0%')]);
  const result=reviewedStats(stats,rows);
  assert.equal(result.attack,stats.attack);
  assert.equal(result.damage,0);
  assert.equal(result.critChance,stats.critChance);
  assert.equal(stats.damage,100);
});
test('a missing percent symbol is never trusted even when numeric OCR is confident',()=>{
  const rows=mergeStatCandidates(read('데미지 12096\n크리티컬 확률 7596'));
  assert.equal(rows.length,2);
  assert.ok(rows.every(row=>row.unitMissing && !row.selected));
});
test('critical damage requires explicit total vs additional semantics',()=>{
  const row=mergeStatCandidates(read('크리티컬 데미지 50%'))[0];
  assert.equal(row.selected,false);
  row.selected=true;
  assert.throws(()=>reviewedStats(base(),[row]),/총 배율/);
  row.basis='extra';assert.equal(reviewedStats(base(),[row]).critDamage,150);
  row.basis='total';assert.throws(()=>reviewedStats(base(),[row]),/100/);
  const explicit=mergeStatCandidates(read('크리티컬 데미지 배율 150%'));
  assert.equal(reviewedStats(base(),explicit).critDamage,150);
});
test('review rejects invalid and out of range edits before any change is applied',()=>{
  const stats=base(),rows=mergeStatCandidates(read('방어 관통력 25%'));
  rows[0].raw='101';assert.throws(()=>reviewedStats(stats,rows),/방어 관통력/);
  rows[0].raw='';assert.throws(()=>reviewedStats(stats,rows),/숫자/);
  assert.equal(stats.penetration,30);
  assert.throws(()=>reviewedStats(stats,[]),/하나 이상/);
});
test('separate OCR blocks are joined by visual baseline without crossing stat rows',()=>{
  const word=(text,x,y)=>({text,confidence:95,bbox:{x0:x,x1:x+100,y0:y,y1:y+22}});
  const data={blocks:[{paragraphs:[{lines:[{words:[word('공격력',20,20),word('데미지',20,70)]}]}]},{paragraphs:[{lines:[{words:[word('1,000',400,21),word('50%',400,69)]}]}]}]};
  assert.deepEqual(parseStatLines(visualStatLines(data)).map(r=>[r.key,r.value]),[['attack',1000],['damage',50]]);
});
test('photo input limits reject unsupported types and oversized batches',()=>{
  const photo={type:'image/png',size:1024};
  checkScreenshotFiles([photo]);
  assert.throws(()=>checkScreenshotFiles([]));
  assert.throws(()=>checkScreenshotFiles(Array(7).fill(photo)));
  assert.throws(()=>checkScreenshotFiles([{type:'image/heic',size:1024}]));
  assert.throws(()=>checkScreenshotFiles([{...photo,size:16*1024*1024}]));
});
