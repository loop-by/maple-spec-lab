import {equipmentBoard,starforceRows} from './equipment-view.mjs';
import {inventoryPage} from './inventory-view.mjs';
import {normalizeInventory,validateInventory,equippedEntry,setEquipped,slotFamily} from './inventory-data.mjs';
import {compareItems,slotContribution} from './inventory-engine.mjs';
import {setupEquipmentImport} from './equipment-import.mjs';
import {newEquipment,findEquipmentIndex,slotKey,validateEquipmentItem} from './equipment-data.mjs';
import {GAME_STAT_KEYS} from './stat-layout.mjs';
import {screenshotEntry,setupScreenshotImport} from './screenshot-import.mjs';
import {MODEL_VERSION,FIELDS,DEFAULT_STATS,EFFECTS,damage,compare,replaceLines,expectation,poissonBinomial,abilityProbability,fitScale,validateStats} from './engine.mjs';
import {normalizeLoadout,effectiveStats,rebaseLoadout,captureReference,selection,entryFor,autoLearn,jobOf,repairUnknownReference} from './buff-engine.mjs';
import {buffsView,buffSummary,jobSelect,buffFilters,catalogList,encounterSelect} from './buff-view.mjs';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=2)=>Number.isFinite(v)?v.toLocaleString('ko-KR',{maximumFractionDigits:d}):'∞';
const pct=v=>`${v>0?'+':''}${fmt(v,3)}%`;
const compact=v=>v>=1e12?`${fmt(v/1e12)}조`:v>=1e8?`${fmt(v/1e8)}억`:v>=1e4?`${fmt(v/1e4)}만`:fmt(v);
const line=(type='none',value=0)=>({type,value});
const layer=(type='none',v=0)=>({old:[line(type,v),line(),line()],next:[line(type,v),line(),line()],p:null,cost:1,grade:'직접 입력'});
const slot=(name,type='none',v=0,target=v)=>{const miracle=layer(type,v);miracle.next[0].value=target;return {name,miracle,additional:layer()};};
const fresh=()=>({id:crypto.randomUUID(),name:'예제 캐릭터',job:'unknown',level:100,stats:{...DEFAULT_STATS,target:'boss',attackType:'skill',content:'field'},equipment:[slot('모자','damage',5,10),slot('장갑','critDamage',10,20),slot('상의','boss',5,10),slot('하의'),slot('신발'),slot('망토'),slot('어깨장식'),slot('벨트'),slot('반지 1'),slot('반지 2'),slot('목걸이'),slot('눈장식'),slot('얼굴장식'),slot('귀고리')],ability:{old:[line(),line(),line()],next:[line(),line(),line()],p:null,cost:1},calibration:{},measurements:[],probability:{mode:'direct',p:null,lineP:[null,null,null],minimum:1,cost:1,budget:100,pity:0,source:'',ability:{grade:0,option:0,min:1,max:10,step:1,threshold:8}}});
const KEY='maple-spec-lab.v1';
let profiles=[],activeId,page='spec',selectedSlot=0,selectedLayer='miracle',toastTimer;
let loadWarning='';
let screenshotUndo=null;
let equipmentUndo=null;
let selectedItemId=null,inventoryFilter='slot',inventorySort='recent',inventoryMetric='compare';
const mainAttribute=p=>p.mainAttribute&&p.mainAttribute!=='auto'?p.mainAttribute:(jobOf(p)?.main??'');
function validateProfile(p){
  if(!p||typeof p!=='object'||typeof p.name!=='string'||p.name.length>100||!p.stats)throw new Error('프로필 형식이 올바르지 않습니다.');
  validateStats(p.stats);
  if(!['boss','normal'].includes(p.stats.target))throw new Error('대상을 확인하세요.');
  if(!Array.isArray(p.equipment)||p.equipment.length<1||p.equipment.length>30)throw new Error('장비는 1~30개여야 합니다.');
  const types=new Set(EFFECTS.map(([k])=>k));
  for(const e of [...p.equipment.flatMap(s=>[s.miracle,s.additional]),p.ability]){
    if(!e||!['old','next'].every(k=>Array.isArray(e[k])&&e[k].length===3))throw new Error('옵션은 세 줄씩 입력하세요.');
    for(const l of [...e.old,...e.next])if(!types.has(l.type)||!Number.isFinite(l.value)||l.value<0||l.value>1e30)throw new Error('옵션 값이 올바르지 않습니다.');
    if(e.p!==null&&(!Number.isFinite(e.p)||e.p<0||e.p>100))throw new Error('목표 확률을 확인하세요.');
    if(!Number.isFinite(e.cost)||e.cost<0)throw new Error('시도 비용을 확인하세요.');
  }
  for(const s of p.equipment)if(typeof s.name!=='string'||s.name.length>100)throw new Error('장비 이름을 확인하세요.');
  if(!Array.isArray(p.measurements)||p.measurements.length>500)throw new Error('검증 기록은 최대 500개입니다.');
  if(!p.probability||!['direct','independent','ability'].includes(p.probability.mode))throw new Error('확률 설정을 확인하세요.');
  if(!p.calibration||typeof p.calibration!=='object')throw new Error('환산 설정을 확인하세요.');
  if(typeof p.id!=='string'||typeof p.job!=='string'||p.job.length>100||!Number.isInteger(p.level)||p.level<1||p.level>10000)throw new Error('캐릭터 정보를 확인하세요.');
  const nullablePercent=v=>v===null||(Number.isFinite(v)&&v>=0&&v<=100);
  const q=p.probability;
  if(!nullablePercent(q.p)||!Array.isArray(q.lineP)||q.lineP.length!==3||!q.lineP.every(nullablePercent)||!Number.isInteger(q.minimum)||q.minimum<1||q.minimum>3||!Number.isFinite(q.cost)||q.cost<0||!Number.isSafeInteger(q.budget)||q.budget<0||!Number.isSafeInteger(q.pity)||q.pity<0||typeof q.source!=='string'||q.source.length>500)throw new Error('확률 설정의 형식이나 범위를 확인하세요.');
  if(!q.ability||!['grade','option','min','max','step','threshold'].every(k=>Number.isFinite(q.ability[k])))throw new Error('어빌리티 확률 설정을 확인하세요.');
  for(const [key,value] of Object.entries(p.calibration))if(key!=='mainAttribute'&&(!value||typeof value!=='object'||!['attack','statDamage'].every(f=>value[f]===undefined||Number.isFinite(value[f]))))throw new Error('환산값은 유한수여야 합니다.');
  for(const r of p.measurements){
    if(!r||!Number.isFinite(r.predicted)||r.predicted<=0||!Number.isFinite(r.observed)||r.observed<=0||typeof r.note!=='string'||r.note.length>500||typeof r.at!=='string'||typeof r.model!=='string'||!['average','noncritical','critical'].includes(r.mode))throw new Error('실측 기록의 형식을 확인하세요.');
    validateStats(r.stats);
  }
  if(p.mainAttribute!==undefined&&!['auto','STR','DEX','INT','LUK'].includes(p.mainAttribute))throw Error('주스탯 종류를 확인하세요.');
  for(const equipment of p.equipment){if(equipment.item)validateEquipmentItem(equipment.item);if(equipment.slotKey!==undefined&&typeof equipment.slotKey!=='string')throw Error('장비 슬롯을 확인하세요.');}
  normalizeLoadout(p);
  normalizeInventory(p);
  p.calibration.mainAttribute=mainAttribute(p);
  return p;
}
try{const saved=JSON.parse(localStorage.getItem(KEY));if(saved){if(saved.version!==1||!Array.isArray(saved.profiles)||saved.profiles.length>20)throw Error();profiles=saved.profiles.map(validateProfile);activeId=saved.activeId;}}catch{loadWarning='저장 데이터를 읽지 못했습니다. 원본 저장소는 자동으로 덮어쓰지 않으며, 새 입력을 변경하면 새 데이터로 저장됩니다.';}
if(!profiles.length)profiles=[fresh()];
profiles.forEach(p=>{normalizeLoadout(p);normalizeInventory(p);p.calibration.mainAttribute=mainAttribute(p);});
if(!profiles.some(p=>p.id===activeId))activeId=profiles[0].id;
const current=()=>profiles.find(p=>p.id===activeId);
function toast(msg){$('#toast').textContent=msg;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4200);}
function save({keepScreenshotUndo=false,keepEquipmentUndo=false}={}){current().calibration.mainAttribute=mainAttribute(current());if(!keepEquipmentUndo){equipmentUndo=null;$('#undo-equipment-import')?.remove();}if(!keepScreenshotUndo){screenshotUndo=null;$('#undo-screenshot-import')?.remove();}try{localStorage.setItem(KEY,JSON.stringify({version:1,model:MODEL_VERSION,activeId,profiles}));$('#save-status').textContent='저장됨 · 이 기기';return true;}catch{$('#save-status').textContent='저장 실패 · JSON으로 백업하세요';return false;}}
function input(key,label,value,unit='',extra=''){return `<label class="field"><span>${esc(label)}</span><span class="input-wrap"><input type="number" data-${key} value="${value===null?'':esc(value)}" step="any" ${extra}><em>${unit}</em></span></label>`;}
function statInput(key){const [,label,unit,min,max]=FIELDS.find(([k])=>k===key);return input(`stat="${key}"`,label,current().stats[key],unit,`min="${min}" max="${max}" aria-label="${label}"`);}
function select(id,label,items,value){return `<label class="field"><span>${label}</span><select id="${id}">${items.map(([v,n])=>`<option value="${v}" ${value===v?'selected':''}>${n}</option>`).join('')}</select></label>`;}
function profileBar(){return `<div class="profile-bar"><label for="profile-select">프리셋</label><select id="profile-select">${profiles.map(p=>`<option value="${esc(p.id)}" ${p.id===activeId?'selected':''}>${esc(p.name)}</option>`).join('')}</select><button class="small" id="new-profile">＋ 새 프리셋</button><button class="small" id="rename-profile">이름 변경</button><button class="small" id="delete-profile" ${profiles.length===1?'disabled':''}>삭제</button><span class="push"></span><button class="small" id="export">↓ 백업</button><button class="small" id="import">↑ 불러오기</button></div>`;}
function rankings(){const p=current(),results=[];for(const [i,s]of p.equipment.entries())for(const k of ['miracle','additional']){const l=s[k];try{const c=compare(effectiveStats(p),l.old,l.next,p.calibration);const exp=l.p===null?null:expectation(l.p/100,{cost:l.cost});results.push({i,layer:k,name:s.name,label:k==='miracle'?'미라클':'에디셔널',...c,p:l.p,exp,efficiency:c.gain>0&&exp&&Number.isFinite(exp.attempts)?(exp.cost===0?Infinity:c.gain/exp.cost):0});}catch(error){results.push({i,layer:k,name:s.name,label:k==='miracle'?'미라클':'에디셔널',error:error.message,efficiency:0});}}try{const l=p.ability,c=compare(effectiveStats(p),l.old,l.next,p.calibration),exp=l.p===null?null:expectation(l.p/100,{cost:l.cost});results.push({i:-1,layer:'ability',name:'어빌리티',label:'명예의 훈장',...c,p:l.p,exp,efficiency:c.gain>0&&exp&&Number.isFinite(exp.attempts)?(exp.cost===0?Infinity:c.gain/exp.cost):0});}catch{}return results.sort((a,b)=>b.efficiency-a.efficiency||(b.gain||0)-(a.gain||0));}
function metrics(){let d;try{d=damage(effectiveStats(current()));}catch(error){return `<div class="error">${esc(error.message)}</div>`;}const best=rankings().find(r=>r.efficiency>0);return `<div class="stats-cards"><div class="metric accent"><div class="metric-label">현재 스펙의 평균 1회 피해<span class="tag">${current().stats.content==='field'?'일반식':current().stats.content==='sqrt'?'제곱근 보정':'세제곱근 보정'}</span></div><strong>${compact(d.expected)}</strong><small>정적 평균 모델 · 전체 전투 DPS와 다릅니다</small></div><div class="metric"><div class="metric-label">실효 크리티컬 확률<span>◌</span></div><strong>${fmt(d.critChance*100)}<span class="unit">%</span></strong><small>대상의 크리티컬 저항 및 100% 상한 반영</small></div><div class="metric"><div class="metric-label">입력한 목표 중 비용 대비 1순위<span>↗</span></div><strong style="font-size:22px">${best?esc(best.name):'확률을 입력해주세요'}</strong><small>${best?`${best.label} · ${pct(best.gain)} · 공통 비용 ${fmt(best.exp.cost)}`:'잠재 · 에디셔널에서 목표와 비용 설정'}</small></div></div>`;}
function factorPanel(){let d;try{d=damage(effectiveStats(current()));}catch(error){return `<div class="panel"><h2>버프 설정 확인</h2><p class="error space-top">${esc(error.message)}</p><a href="#buffs" data-goto="buffs">직업 · 버프 설정 열기 ↗</a></div>`;}return `<div class="panel right-panel"><div class="section-heading"><h2>데미지의 구성</h2><span class="tag gray">평균 기준</span></div>${[['공격력',compact(d.factors.attack)],['방어력 보정',`× ${fmt(d.factors.defense,4)}`],['데미지',`× ${fmt(d.factors.damage)}`],['데미지 증폭',`× ${fmt(d.factors.amplification)}`],['스탯 비례',`× ${fmt(d.factors.stat)}`],['몬스터 데미지',`× ${fmt(d.factors.monster)}`],['공격 유형',`× ${fmt(d.factors.attackType)}`],['최종 데미지',`× ${fmt(d.factors.final)}`]].map(([k,v])=>`<div class="factor-row"><span>${k}</span><b>${v}</b></div>`).join('')}<p class="formula-note">마스터리·기타 배율, 치명타·랜덤 배율·상태이상의 평균과 콘텐츠 보정을 추가로 적용합니다.</p><a class="quick-link" href="#potentials" data-goto="potentials"><b>어떤 잠재를 먼저 바꿀까요? ↗</b>현재 줄과 목표 줄을 입력해<br>데미지 증가율을 비교해보세요.</a><div class="leaf-decoration"><svg viewBox="0 0 260 82" aria-hidden="true"><path d="M10 73Q80 34 132 67T255 48" fill="none" stroke="#dfe8cd"/><path d="M44 66q12-40 42-26-4 27-42 26m43-5q6-44 36-33-1 30-36 33m49 7q17-36 42-20-10 28-42 20m54-6q-1-31 25-33 9 25-25 33" fill="#e7eed9"/><path d="M44 66l33-20m10 15l26-24m23 31l32-15m22 9l17-24" stroke="#c9d9af" fill="none"/></svg></div></div><div class="panel right-panel"><h3>입력 전에 확인해주세요</h3><p class="muted">장비와 버프가 반영된 <b>현재 최종 합계</b>를 넣으세요. 장비 탭은 이 합계에서 기존 옵션을 빼고 새 옵션을 넣습니다.</p><div class="tip">크리티컬 데미지는 <b>총 배율</b>입니다. 추가 피해가 30%라면 130을 입력하세요.</div></div>`;}
function specView(){
  const p=current();
  return `${profileBar()}${screenshotEntry(p,screenshotUndo?.id===p.id)}${buffSummary(p)}<div id="metrics">${metrics()}</div>
  <div class="layout"><div><section class="panel">
    <div class="section-heading"><div><h2>캐릭터 스펙</h2><p>게임 스탯 창과 같은 순서로 현재 합계를 입력하세요.</p></div><span class="step">01 / CHARACTER</span></div>
    <div id="field-error" class="error"></div>
    <div class="form-grid"><label class="field"><span>캐릭터 이름</span><input id="character-name" value="${esc(p.name)}" maxlength="100"></label>${jobSelect(p)}${input('meta="level"','캐릭터 레벨',p.level,'Lv.','min="1" max="10000"')}</div>
    <section class="main-stat-panel" aria-labelledby="main-stat-title"><h3 id="main-stat-title">내 주스탯 ${esc(mainAttribute(p))}</h3><div class="form-grid">${select('main-stat-type','주스탯 종류',[['auto',`직업 기준 자동${mainAttribute(p)?' · '+mainAttribute(p):' · 직업 선택 필요'}`],['STR','STR · 힘'],['DEX','DEX · 민첩'],['INT','INT · 지능'],['LUK','LUK · 행운']],p.mainAttribute??'auto')}${input('stat="mainStat"',`${mainAttribute(p)||'주스탯'} 현재 수치`,p.stats.mainStat,'','min="0" max="1000000000000000" aria-label="현재 주스탯"')}</div><p>직업에 맞는 현재 주스탯과 게임의 표시 공격력·스탯 비례 데미지를 입력하세요. 장비의 고정값·% 옵션은 구분해 저장하며, 변경 효율은 실측 환산을 설정한 뒤 비교합니다.</p><a href="#main-stat-calibration" class="mini" id="open-stat-calibration">주스탯 환산 설정 열기 ↗</a></section>
    <div class="subsection"><span></span>게임 스탯 순서</div>
    <div class="game-stat-list">${GAME_STAT_KEYS.map(statInput).join('')}</div>
    <p class="inline-note">공격 속도·재사용 대기시간 감소는 기록용이며, 현재의 평균 1회 피해 계산에는 반영하지 않습니다.</p>
    <details class="details" id="main-stat-calibration" data-details="main-stat-calibration"><summary>추가 캐릭터 능력치 · 주스탯 · 실측 환산</summary>
      <div class="form-grid">${['damage','amplification','statDamage','penetration','mainPercent','attackPercent'].map(statInput).join('')}</div>
      <div class="tip warning">주스탯 %·공격력 %는 현재 합계에 이미 포함되어 있습니다. 이 옵션을 교체하려면 아래 실측 환산을 입력하세요.</div>${calibrationForm()}
    </details>
    <div class="subsection"><span></span>전투 조건</div>
    <div class="form-grid">${select('target','공격 대상',[['boss','보스 몬스터'],['normal','일반 몬스터']],p.stats.target)}${select('attack-type','공격 유형',[['skill','스킬 공격'],['basic','기본 공격']],p.stats.attackType)}${select('content','콘텐츠 보정',[['field','일반 PVE · 거듭제곱 없음'],['sqrt','레이드·파티 퀘스트 · 제곱근'],['cbrt','길드 수련장 · 세제곱근']],p.stats.content)}</div>
    ${encounterSelect(p)}
    <div class="form-grid space-top">${statInput('enemyDefense')}</div>
    <p class="inline-note">대상 방어력은 캐릭터의 방어력과 다릅니다. PVP는 계산 범위에서 제외되며, 동일 콘텐츠의 상대 비교에서는 콘텐츠 상수가 약분됩니다.</p>
    <details class="details"><summary>상태이상 · 대상 저항 · 스킬 계수 · 상세 보정</summary>
      <div class="form-grid">${['critResistance','statusDamage','statusUptime','vulnerability','reduction','mastery','other','coefficient','contentScale'].map(statInput).join('')}</div>
      <p class="inline-note">콘텐츠 상수 기본값 1은 실제 레이드 피해를 뜻하지 않습니다. 상태이상 유지 비율은 해당 상태에서 발생하는 타격의 비중으로 입력하세요.</p>
    </details>
    <div class="info-line">ⓘ 입력값은 변경 시 자동 저장됩니다. 저장 위치는 현재 브라우저이며, 다른 기기로 옮기려면 백업하세요.</div>
  </section></div><aside id="factors">${factorPanel()}</aside></div>`;
}
function calibrationForm(){
  const pair=([key,label])=>`<div class="calibration-row"><p class="mini">${esc(label)}</p><div class="form-grid two">${input(`cal="${key}.attack"`,'표시 공격력 증가량',current().calibration[key]?.attack??null,'')}${input(`cal="${key}.statDamage"`,'스탯 비례 데미지 증가',current().calibration[key]?.statDamage??null,'%p')}</div></div>`;
  return `<div class="subsection"><span></span>옵션 +1당 현재 스펙 주변 실측 변화</div>${[['mainFlat',`${mainAttribute(current())||'주스탯'} 고정값 +1당`],['mainPercent',`${mainAttribute(current())||'주스탯'} % +1%p당`],['attackPercent','공격력 % +1%p당']].map(pair).join('')}<details class="details" data-details="attribute-calibration"><summary>장비 공격력 · STR / DEX / INT / LUK 주·부스탯 환산</summary>${[['itemAttack','장비 공격력 고정값 +1당'],...['STR','DEX','INT','LUK'].flatMap(stat=>[[stat.toLowerCase(),`${stat} 고정값 +1당`],[stat.toLowerCase()+'Percent',`${stat} % +1%p당`]])].map(pair).join('')}</details><details class="details" data-details="skill-level-calibration"><summary>스킬 레벨 부 옵션 환산</summary>${Array.from({length:5},(_,i)=>[`skillLevel${i+1}`,`${i+1}차 스킬 레벨 +1당`]).map(pair).join('')}<p class="inline-note">이 설정은 표시 공격력·스탯 비례 데미지로 관측한 영향만 반영합니다. 스킬 계수·회전 변화는 별도이며 전체 DPM을 뜻하지 않습니다.</p></details><p class="inline-note">각 항목의 두 수치를 모두 입력하세요. 영향이 없음을 실측한 항목은 0을 입력합니다. STR/DEX/INT/LUK별 값은 해당 스탯에만 사용하며, 직업이 바뀌면 해제합니다.</p>`;
}
function inventoryCalibration(){return `<section class="panel" id="inventory-calibration"><details data-details="inventory-calibration"><summary>장비 비교에 필요한 주스탯 · 부스탯 환산 설정</summary><p class="inline-note">장비 공격력은 캐릭터의 표시 공격력과 구분합니다. 장비 교체로 각 원시 스탯이 표시 공격력과 스탯 비례 데미지에 주는 영향을 실측한 값을 입력하세요.</p>${calibrationForm()}</details></section>`;}
function equipmentView(){
  let snapshot,snapshotError;try{snapshot=effectiveStats(current());}catch(error){snapshotError=error.message;}
  return profileBar()+inventoryPage(current(),{selectedSlot,selectedItemId,filter:inventoryFilter,sort:inventorySort,mode:inventoryMetric,snapshot,snapshotError,canUndo:equipmentUndo?.id===current().id,calibration:inventoryCalibration()});
}
function potentialContributions(p){
  const results={};let snapshot,error;try{snapshot=effectiveStats(p);}catch(e){error=e.message;}
  for(const slot of p.equipment)results[slot.slotKey]=snapshot?slotContribution(snapshot,slot,p.calibration):{error};
  return results;
}
function potentialSummary(p){
  const slot=p.equipment[selectedSlot];let snapshot,error;try{snapshot=effectiveStats(p);}catch(e){error=e.message;}
  const parts=[['all','잠재 + 에디셔널'],['miracle','잠재'],['additional','에디셔널']];
  return `<div class="slot-contribution-summary"><h2>${esc(slot.name)} 슬롯</h2><div class="slot-contribution-cards">${parts.map(([key,label])=>{const result=snapshot?slotContribution(snapshot,slot,p.calibration,key):{error};return `<div><small>${label} 기여도</small><b title="${esc(result.error??'현재 피해에서 해당 슬롯 옵션을 제외했을 때의 감소 비율')}">${result.error?'환산 필요':pct(result.share)}</b>${result.error?`<p class="mini">${esc(result.error)}</p>`:''}</div>`;}).join('')}</div><p class="inline-note">기여도 = (현재 피해 − 해당 슬롯 옵션 제외 후 피해) ÷ 현재 피해. 슬롯별 기여도는 합산해 100%가 되지 않습니다. 공속·쿨감·생존 효과는 1회 피해 기여도에 포함하지 않습니다.</p><details data-details="slot-calibration"><summary>주·부스탯 환산 설정</summary>${calibrationForm()}</details></div>`;
}

function effectSelect(value,attr){return `<select ${attr}>${EFFECTS.map(([k,n])=>`<option value="${k}" ${value===k?'selected':''}>${n}</option>`).join('')}</select>`;}
function selected(){return selectedLayer==='ability'?current().ability:current().equipment[selectedSlot][selectedLayer];}
function potentialView(){const p=current(),l=selected();let c,error;try{c=compare(effectiveStats(p),l.old,l.next,p.calibration);}catch(e){error=e.message;}return `${profileBar()}<div class="equipment-workspace">${equipmentBoard(p,selectedSlot,selectedLayer,equipmentUndo?.id===p.id,{kind:'slots',contributions:potentialContributions(p)})}<div><div class="layout"><div><section class="panel">${selectedLayer==='ability'?'':potentialSummary(p)}<div class="equipment-header">${selectedLayer==='ability'?'<h2>어빌리티 목표 비교</h2>':`<input id="slot-name" aria-label="장비 슬롯 이름" maxlength="100" value="${esc(p.equipment[selectedSlot].name)}"><button class="small danger" id="delete-slot" ${p.equipment.length===1?'disabled':''}>슬롯 삭제</button>`}<span class="tag orange">직접 입력 · 목표 후보</span></div>${selectedLayer!=='ability'?`<div class="segmented layer-tabs"><button data-layer="miracle" class="${selectedLayer==='miracle'?'selected':''}">잠재 옵션 · 미라클</button><button data-layer="additional" class="${selectedLayer==='additional'?'selected':''}">에디셔널 잠재 옵션</button></div>`:''}<p class="card-subtitle">잠재·에디셔널은 장비 슬롯에 적용됩니다. 장비를 교체해도 이 옵션은 유지됩니다. 현재 옵션과 목표 옵션을 비교하세요.</p><div class="line-head"><span>현재 옵션</span><span>목표 옵션</span></div>${l.old.map((v,i)=>`<div class="line-grid"><span class="number">0${i+1}</span>${effectSelect(v.type,`data-line="old.${i}.type" aria-label="현재 ${i+1}번 줄 옵션"`)}<input type="number" min="0" step="any" value="${v.value}" data-line="old.${i}.value" aria-label="현재 ${i+1}번 줄 수치"><span class="arrow">→</span>${effectSelect(l.next[i].type,`data-line="next.${i}.type" aria-label="목표 ${i+1}번 줄 옵션"`)}<input type="number" min="0" step="any" value="${l.next[i].value}" data-line="next.${i}.value" aria-label="목표 ${i+1}번 줄 수치"></div>`).join('')}${error?`<div class="error space-top">${esc(error)}</div>`:`<div class="gain-strip"><div><small>세 줄을 함께 교체할 때</small><p>동일 전투 조건에서의 평균 1회 피해 변화</p></div><strong class="${c.gain<0?'negative':''}">${pct(c.gain)}</strong></div>`}<div class="per-line">${l.old.map((_,i)=>{let val;try{val=compare(effectiveStats(p),[l.old[i]],[l.next[i]],p.calibration).gain;}catch{}return `<div class="factor-row"><span>${i+1}번 줄만 교체한 효율</span><b class="${val<0?'negative':'positive'}">${val===undefined?'환산 확인 필요':pct(val)}</b></div>`;}).join('')}</div><p class="inline-note">각 줄의 증가율은 동일한 현재 스펙 대비입니다. 줄별 증가율을 더한 값은 전체 교체 증가율과 다를 수 있습니다. ‘최종 데미지 환산’은 데미지 비율을 뜻하며, 게임 내 최종 데미지 옵션 %p와 다릅니다.</p><div class="subsection"><span></span>목표 조합의 비용</div><div class="form-grid two">${input('layer-setting="p"','1회에 목표 조합을 얻을 확률',l.p,'%','min="0" max="100" placeholder="확률 확인 후 입력"')}${input('layer-setting="cost"','1회 비용 (공통 환산 단위)',l.cost,'','min="0"')}</div><div class="tip warning">확률은 <b>목표 세 줄 전체를 만족하는 1회 확률</b>입니다. 줄별 확률이나 등급 상승 확률을 그대로 넣으면 안 됩니다. 모든 부위의 비용을 같은 재화 가치로 환산해야 순위를 비교할 수 있습니다. 등급 상승·잠금·변환 레벨 변화는 이 고정 확률 계산에 포함되지 않습니다.</div><div class="actions end"><button id="send-probability">기댓값 자세히 보기 ↗</button><button class="primary" id="apply-lines" ${error?'disabled':''}>목표 옵션을 새 기준으로 저장</button></div></section><section class="panel"><div class="section-heading"><div><h2>입력한 목표 후보의 스펙업 순서</h2><p>데미지 증가율 ÷ 기대 공통 비용 순서 · 양수 개선안만 추천</p></div><span class="tag gray">전역 최적화 아님</span></div><div class="table-scroll"><table><thead><tr><th>순위</th><th>부위 · 재화</th><th>데미지 변화</th><th>평균 시도</th><th>기대 비용</th><th>1%당 비용</th></tr></thead><tbody>${rankings().filter(r=>r.gain!==0||r.error).slice(0,30).map((r,i)=>`<tr><td>${r.efficiency>0?i+1:'—'}</td><td><button class="small" data-rank="${r.i}:${r.layer}">${esc(r.name)}</button><br><small>${r.label}</small></td><td class="${r.gain<0?'negative':'positive'}">${r.error?esc(r.error):pct(r.gain)}</td><td>${r.exp?fmt(r.exp.attempts):'확률 미입력'}</td><td>${r.exp?fmt(r.exp.cost):'—'}</td><td>${r.gain>0&&r.exp?fmt(r.exp.cost/r.gain):'—'}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">목표 옵션을 변경하면 비교 결과가 나타납니다.</td></tr>'}</tbody></table></div></section></div><aside><div class="panel right-panel"><h2>같은 10%, 다른 효율</h2><p class="muted space-top">데미지 100%에 10%p를 더하면 배율은 2.0 → 2.1배로 변합니다.</p><div class="gain-strip"><small>일반 PVE의 증가율</small><strong>+5%</strong></div><p class="inline-note">제곱근 보정에서는 약 +2.47%, 세제곱근에서는 약 +1.64%입니다. 현재 콘텐츠를 기준으로 비교하세요.</p><div class="tip">장비 탭에 적은 <b>현재 옵션을 다시 스펙에 더하지 않습니다.</b> 이미 합계에 포함된 출처를 교체합니다.</div></div><div class="panel right-panel"><h3>어빌리티 여러 슬롯</h3><p class="muted">한 비교안에 최대 세 줄을 묶을 수 있습니다. 더 많은 슬롯은 부위를 추가해 ‘어빌리티 4~6’처럼 묶어 기록할 수 있습니다. 실제 재설정의 슬롯·잠금 규칙에 맞는 전체 성공 확률을 입력하세요.</p></div></aside></div></div></div>`;}
function getProbability(){const q=current().probability;if(q.mode==='direct'){if(q.p===null)throw Error('확인한 목표 확률을 입력하세요.');return q.p/100;}if(q.mode==='independent'){if(q.lineP.some(v=>v===null))throw Error('각 줄의 확률을 모두 입력하세요.');return poissonBinomial(q.lineP.map(v=>v/100),q.minimum);}return abilityProbability({...q.ability,grade:q.ability.grade/100,option:q.ability.option/100}).p;}
function probabilityView(){const q=current().probability;return `${profileBar()}<div class="layout"><div><section class="panel"><div class="section-heading"><div><h2>목표까지 얼마나 필요할까요?</h2><p>미라클 · 에디셔널 · 어빌리티를 같은 확률 모형으로 계산합니다.</p></div><span class="step">02 / EXPECTATION</span></div><div class="segmented"><button data-prob-mode="direct" class="${q.mode==='direct'?'selected':''}">전체 목표 확률</button><button data-prob-mode="independent" class="${q.mode==='independent'?'selected':''}">독립 줄 가정</button><button data-prob-mode="ability" class="${q.mode==='ability'?'selected':''}">어빌리티 수치</button></div><div class="space-top">${q.mode==='direct'?`<div class="form-grid two">${input('prob="p"','1회 목표 성공 확률',q.p,'%','min="0" max="100" placeholder="검증된 확률을 입력"')}<label class="field"><span>확률 출처 · 기준일 (기록용)</span><input id="prob-source" maxlength="500" value="${esc(q.source)}" placeholder="공식 URL, 등급, 부위, 기준일"></label></div>`:q.mode==='independent'?`<div class="form-grid">${q.lineP.map((v,i)=>input(`line-prob="${i}"`,`${i+1}번째 줄의 목표 확률`,v,'%','min="0" max="100"')).join('')}</div><div class="space-top">${select('minimum-lines','세 줄 중 필요한 목표 줄 수',[['1','1줄 이상'],['2','2줄 이상'],['3','3줄 모두']],String(q.minimum))}</div><div class="tip warning">세 줄이 <b>독립</b>일 때만 적용됩니다. 중복 제한·앞줄 조건·등급 연동이 있으면 실제 큐브 확률과 다릅니다. 공식 결합 확률이 확인되면 ‘전체 목표 확률’에 입력하세요.</div>`:`<div class="form-grid">${[['grade','목표 등급 확률','%'],['option','등급 내 목표 종류 확률','%'],['min','가능 최솟값',''],['max','가능 최댓값',''],['step','수치 간격',''],['threshold','목표 수치 이상','']].map(([k,n,u])=>input(`ability-prob="${k}"`,n,q.ability[k],u)).join('')}</div><div class="tip warning">등급 → 옵션 종류 → 수치의 조건부 확률을 곱합니다. 최소~최대가 같은 간격의 <b>이산 균등 분포</b>일 때만 사용하세요. 변환 레벨·슬롯이 고정된 1슬롯 계산이며 현재 공식 테이블은 자동 연결되어 있지 않습니다.</div>`}</div><div class="subsection"><span></span>비용과 예산</div><div class="form-grid">${input('prob="cost"','1회 소모 비용',q.cost,'','min="0"')}${input('prob="budget"','예산 내 시도 횟수',q.budget,'회','min="0" step="1"')}${input('prob="pity"','해당 목표의 확정 시도',q.pity,'회','min="0" step="1"')}</div><p class="inline-note">확정 시도 0은 천장 없음입니다. N회째에 <b>해당 목표 자체가 확정</b>될 때만 N을 입력하세요. 등급업 천장이 원하는 옵션을 보장하는 것은 아닙니다. 이미 실패한 횟수를 제외한 남은 시도 기준입니다.</p><div id="prob-result"></div><div class="actions end"><button class="small" id="prob-example">연습용 1% 예제 불러오기</button></div></section><section class="panel"><h2>평균과 예산을 구분하세요</h2><ol class="help-steps"><li>평균 시도 횟수는 1 ÷ 성공 확률입니다. 성공을 보장하지 않습니다.</li><li>예산 계획에는 중앙값·90%·95% 달성 횟수를 함께 보세요.</li><li>등급업·변환 레벨·실패 누적이 확률을 바꾸면 상태 전이 계산이 필요합니다.</li></ol></section></div><aside><div class="panel right-panel"><h2>확률 데이터 기준</h2><span class="tag orange space-top">사용자 입력 · 미검증</span><p class="muted space-top">현재 버전은 공식 확률표를 자동으로 가져오지 않습니다. 게임 내 확률 정보 또는 NEXON NOW와 대조한 값을 넣어주세요.</p><a href="https://now.nexon.com/service/maplestoryidle" target="_blank" rel="noopener" class="quick-link"><b>NEXON NOW 열기 ↗</b>설정 확률과 실측 확률 확인</a><p class="inline-note">NEXON NOW 실측 빈도는 설정 확률의 대체값이 아닙니다. 표본 수와 기준 시점을 확인하세요.</p></div></aside></div>`;}
function probabilityResults(){const q=current().probability;try{const p=getProbability(),e=expectation(p,q);$('#prob-result').innerHTML=`<div class="gain-strip"><div><small>1회 목표 성공 확률</small><p>${q.mode==='ability'?`가능 수치 ${abilityProbability({...q.ability,grade:q.ability.grade/100,option:q.ability.option/100}).total}개 중 조건을 만족하는 수치 기준`:'입력한 조건과 확률 모형 기준'}</p></div><strong>${fmt(p*100,7)}%</strong></div><div class="table-scroll space-top"><table><tbody>${[['평균 시도 횟수',`${fmt(e.attempts)}회`],['기대 소모 비용',fmt(e.cost)],['50% 달성 (중앙값)',`${fmt(e.median,0)}회`],['90% 달성',`${fmt(e.p90,0)}회`],['95% 달성',`${fmt(e.p95,0)}회`],['예산 내 달성 확률',`${fmt(e.success*100)}%`]].map(([k,v])=>`<tr><td>${k}</td><td><strong>${v}</strong></td></tr>`).join('')}</tbody></table></div><div class="probability-plot" aria-label="시도 횟수별 누적 성공 확률">${[1,10,50,100,500].map(n=>`<div class="plot-bar" style="height:${Math.max(2,e.within(n)*126)}px"><span>${fmt(e.within(n)*100,1)}%</span><small>${n}회</small></div>`).join('')}</div>`;}catch(error){$('#prob-result').innerHTML=`<div class="tip space-top">${esc(error.message)}</div>`;}}
function validationView(){const p=current();return `${profileBar()}<div class="two-cols"><div><section class="panel"><div class="section-heading"><h2>공식 기반 계산 모델</h2><span class="tag">공식 식 확인</span></div><p class="card-subtitle">넥슨 전투 가이드 · KO 2026.10.15 / EN 2026.09.22 일반식 대조</p><div class="formula">공격력 × 5000 / (6000 + 방어력 × (1 − 방관))
× (1 + 데미지) × (1 + 데미지 증폭)
× (1 + 보스/일반) × (1 + 기본/스킬)
× (1 + 스탯 비례) × 마스터리 × 기타 보정
× 치명타 배율 × 최소~최대 랜덤 배율
× 상태이상 효과 × 최종 데미지 배율
→ 콘텐츠 보정 → 스킬 계수</div><div class="tip">입력은 % 단위입니다. 일반 가산 10% + 20%는 30%, 최종 데미지 10%와 20%는 1.1 × 1.2 = 1.32배, 방관 30%와 20%는 44%로 계산합니다.</div><h3 class="space-top">정확도가 확보된 범위</h3><p class="muted">공식 일반식의 산술, 출처별 옵션 교체, 고정 확률의 수학적 기댓값을 계산합니다. 제곱근·세제곱근 콘텐츠는 랜덤과 치명타를 보정한 뒤 평균을 구합니다.</p><h3 class="space-top">아직 확인이 필요한 범위</h3><p class="muted">실제 타격의 정수 반올림 순서, 랜덤 수치의 이산 분포, 직업별 주·부스탯 원시 환산, 스킬·유물·동료의 시간 흐름, 공속·쿨감 DPM, PVP, 콘텐츠별 상수, 현행 전체 확률표와 상태 전이입니다. 랜덤 배율은 연속 균등 분포로 가정합니다.</p><p class="inline-note">스킬 계수는 콘텐츠 거듭제곱 뒤에 적용됩니다. 크리티컬·상태이상 여부가 상관되거나 특정 타격이 일반식을 생략하는 경우 별도 모델이 필요합니다.</p></section><section class="panel"><h2>실측 기록으로 검산하기</h2><p class="card-subtitle space-top">동일 대상·버프·스킬 계수를 고정하세요. 평균값은 충분한 타격 표본을 모아 입력하세요.</p><div class="form-grid two">${select('measurement-mode','비교할 타격',[['average','평균 타격'],['noncritical','비치명 평균'],['critical','치명 평균']],'average')}<label class="field"><span>실제 관측 평균 데미지</span><input type="number" id="observed" min="0" step="any" placeholder="예: 1234567"></label></div><label class="field space-top"><span>측정 조건 · 표본 수 · 버전</span><input id="measurement-note" maxlength="500" placeholder="예: 허수아비, 버프 없음, 스킬 이름, 200타"></label><div class="actions end"><button class="primary" id="add-measurement">현재 스펙으로 검산 기록</button></div><div id="measurements" class="space-top">${measurementTable()}</div></section></div><div><section class="panel"><h2>자료와 기준일</h2><div class="source"><a href="https://maplestoryidle.nexon.com/en/guide" target="_blank" rel="noopener">Global 공식 전투 가이드 ↗</a>영문 일반 피해식 대조 · 직업 상세 표의 버전은 직업·버프 페이지에서 별도 확인</div><div class="source"><a href="https://maplestoryidle.nexon.com/ko/guide" target="_blank" rel="noopener">넥슨 공식 전투 시스템 · 능력치 사전 ↗</a>문서 기준 2026.10.15 · 기본식, 합산법, 콘텐츠 보정</div><div class="source"><a href="https://now.nexon.com/service/maplestoryidle" target="_blank" rel="noopener">NEXON NOW 확률 정보 ↗</a>공식 확률 데이터의 확인 경로. 현재 앱에 테이블 자동 탑재 전</div><div class="source"><a href="https://forum.nexon.com/maplestoryidle-kr/board_view?board=6633&thread=3443917" target="_blank" rel="noopener">실측 확률 공개 서비스 오픈 안내 ↗</a>2026.05.14 공지 · 실측 빈도와 설정 확률을 구분</div><div class="source"><a href="https://developers.cloudflare.com/pages/functions/pricing/" target="_blank" rel="noopener">Cloudflare Pages 공식 요금 ↗</a>2026.10.24 확인 · 정적 파일 요청 무료</div></section><section class="panel"><h2>역산은 검증과 다릅니다</h2><p class="muted space-top">미지의 콘텐츠 상수 하나는 측정값 ÷ 모델값으로 역산할 수 있습니다. 한 계수를 맞춘 것만으로 전체 공식이 검증되지는 않습니다.</p><div id="fit-result">${fitResult()}</div><p class="inline-note">아래 값은 기록 중 현재 콘텐츠·공격 유형·대상이 같은 표본의 최소제곱 공통 배율입니다. 기록마다 스펙 원본과 모델 버전을 함께 저장합니다. 학습에 쓴 표본의 오차이므로 독립 표본 검증을 추가해야 합니다. 보정은 자동 적용하지 않습니다.</p><div class="actions end"><button id="export-measurements" class="small">검증 기록 CSV</button></div></section><section class="panel"><h2>최저 비용 운영 구조</h2><p class="muted space-top">브라우저 계산 + 이 기기 저장 + 정적 파일 배포. 서버와 사용자 DB가 없어 운영 구성이 단순합니다.</p><div class="cost-grid space-top"><div class="cost-card recommended"><span class="tag">추천 구조</span><h3>정적 웹</h3><strong>$0부터</strong><p>Cloudflare Pages 무료 범위<br>기본 도메인 사용<br>계정 동기화는 추후 추가</p></div><div class="cost-card"><span class="tag gray">검증 보조</span><h3>Google Sheets</h3><strong>공유 시트</strong><p>수식과 실측 기록 검산에 적합<br>개인별 입력은 사본 필요<br>메인 서비스는 정적 웹 추천</p></div></div><p class="inline-note">이 서비스는 ChatGPT Sites의 공개 URL로 배포됩니다. Sites 비용이 Cloudflare 무료 요금과 같다는 뜻은 아닙니다. 별도 도메인·로그인·동기화·API를 추가하면 비용을 다시 산정해야 합니다.</p></section></div></div>`;}
function measurementTable(){const rows=current().measurements;if(!rows.length)return '<div class="empty">아직 실측 기록이 없습니다. 예제 데이터로 검증되었다고 표시하지 않습니다.</div>';return `<div class="table-scroll"><table><thead><tr><th>조건</th><th>예측</th><th>관측</th><th>오차</th><th></th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${esc(r.note||r.mode)}<br><small>${esc(r.stats.content)}</small></td><td>${compact(r.predicted)}</td><td>${compact(r.observed)}</td><td>${pct((r.predicted/r.observed-1)*100)}</td><td><button class="icon" data-delete-measurement="${i}" aria-label="${i+1}번 기록 삭제">×</button></td></tr>`).join('')}</tbody></table></div>`;}
function fitResult(){const s=current().stats,rows=current().measurements.filter(r=>r.stats?.content===s.content&&r.stats?.target===s.target&&r.stats?.attackType===s.attackType&&r.model===MODEL_VERSION);try{const f=fitScale(rows);return `<div class="gain-strip"><div><small>조건 일치 ${f.count}개 표본</small><p>훈련 표본 평균 절대 오차 ${fmt(f.mape)}%</p></div><strong>× ${fmt(f.scale,5)}</strong></div>`;}catch{return '<div class="tip">현재 조건의 실측 기록을 넣으면 미지의 공통 배율을 역산합니다.</div>';}}
const pageMeta={buffs:['직업 · 스킬 · 버프','내 스킬과 버프를 한눈에','직업과 레벨을 선택하고, 습득한 스킬과 켜진 효과를 간편하게 관리하세요.'],spec:['내 스펙','내 다음 스펙업, 숫자로 확인하기','지금의 스펙을 기준으로, 더 나은 선택을 찾아보세요.'],equipment:['장비 보관함','보유 장비를 모으고, 더 좋은 장비를 찾으세요','같은 부위의 장비를 비교하고 아이콘 위에서 최종 피해 차이를 확인하세요.'],potentials:['잠재 · 에디셔널','슬롯마다 얼마나 기여하고 있을까요?','장비와 독립된 슬롯 잠재·에디셔널의 기여도와 교체 효율을 확인하세요.'],probability:['강화 기댓값','운을 기다리기 전에, 기대 비용부터','목표 성공 확률과 예산을 함께 살펴보세요.'],validation:['공식 · 실측 검증','숫자의 근거까지, 투명하게','공식의 적용 범위와 실측 오차를 확인하고 기록하세요.']};
function render(){const openDetails=new Set([...document.querySelectorAll('details[open][data-details]')].map(d=>d.dataset.details));if(!pageMeta[page])page='spec';const meta=pageMeta[page];$('#page-label').textContent=meta[0];$('#page-title').textContent=meta[1];$('#page-desc').textContent=meta[2];document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));$('#view').innerHTML=({spec:specView,buffs:()=>buffsView(current(),profileBar()),equipment:equipmentView,potentials:potentialView,probability:probabilityView,validation:validationView})[page]();document.querySelectorAll('details[data-details]').forEach(d=>{if(openDetails.has(d.dataset.details))d.open=true;});if(page==='probability')probabilityResults();if(loadWarning){toast(loadWarning);loadWarning='';}}
function navigate(p){page=p;history.replaceState(null,'',`#${p}`);render();window.scrollTo({top:0,behavior:'instant'});}
function inventoryMutation(mutate){const p=current(),previous=structuredClone(p),previousEquipmentUndo=equipmentUndo,previousScreenshotUndo=screenshotUndo;try{mutate(p);validateInventory(p);if(!save())throw Error('저장 공간이 부족합니다. 변경 전 상태를 유지했습니다.');}catch(error){Object.assign(p,previous);equipmentUndo=previousEquipmentUndo;screenshotUndo=previousScreenshotUndo;render();throw error;}}
function resultUpdate(){try{validateStats(current().stats);$('#field-error').textContent='';$('#metrics').innerHTML=metrics();$('#factors').innerHTML=factorPanel();}catch(e){$('#field-error').textContent=e.message;}}
function exportData(){return JSON.stringify({version:1,model:MODEL_VERSION,exportedAt:new Date().toISOString(),profiles:[current()]},null,2);}
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function csvCell(s){let v=String(s??'');if(/^[=+\-@\t\r]/.test(v))v="'"+v;return '"'+v.replaceAll('"','""')+'"';}
// Update the numerical summary while typing without replacing focused inputs.
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.id==='effect-search'){buffFilters.query=t.value;$('#buff-catalog').innerHTML=catalogList(current());return;}
  if(!t.dataset.stat||t.value==='')return;
  const p=current(),value=Number(t.value),prev=p.stats[t.dataset.stat];
  p.stats[t.dataset.stat]=value;
  try{validateStats(p.stats);save();resultUpdate();}catch{p.stats[t.dataset.stat]=prev;}
});
document.addEventListener('change',e=>{const t=e.target,p=current();try{
  if(handleBuffChange(t,p)){save();render();return;}
  if(t.dataset.starTarget!==undefined){const id=t.closest('[data-inventory-detail]')?.dataset.inventoryDetail,item=p.inventory.find(entry=>entry.id===id)?.item;if(item)t.closest('[data-starforce-preview]').querySelector('[data-starforce-values]').innerHTML=starforceRows(item,Number(t.value));return;}
  if(t.dataset.inventorySort!==undefined){inventorySort=t.value;render();return;}
  if(t.dataset.stat){if(t.value==='')throw Error('스탯 값은 비워둘 수 없습니다.');const value=Number(t.value),prev=p.stats[t.dataset.stat];p.stats[t.dataset.stat]=value;try{validateStats(p.stats);}catch(error){p.stats[t.dataset.stat]=prev;throw error;}save();resultUpdate();return;}
  if(t.dataset.meta){if(!Number.isInteger(Number(t.value))||Number(t.value)<1||Number(t.value)>10000)throw Error('레벨을 확인하세요.');p.level=Number(t.value);}
  else if(t.dataset.cal){const [k,f]=t.dataset.cal.split('.');p.calibration[k]??={};if(t.value==='')delete p.calibration[k][f];else{const v=Number(t.value);if(!Number.isFinite(v))throw Error('유한수를 입력하세요.');p.calibration[k][f]=v;}}
  else if(t.id==='profile-select'){activeId=t.value;selectedSlot=0;selectedItemId=null;}
  else if(t.id==='main-stat-type'){const previous=mainAttribute(p);p.mainAttribute=t.value;if(previous!==mainAttribute(p)){p.stats.mainStat=0;p.calibration={};toast('주스탯 종류를 변경했습니다. 현재 수치와 실측 환산값을 확인하세요.');}}
  else if(t.id==='character-name'){p.name=t.value||'이름 없음';}
  else if(['target','attack-type','content'].includes(t.id)){p.stats[{'target':'target','attack-type':'attackType','content':'content'}[t.id]]=t.value;}
  else if(t.id==='slot-name')p.equipment[selectedSlot].name=t.value||'장비';
  else if(t.dataset.line){const [side,i,k]=t.dataset.line.split('.');const v=k==='value'?Number(t.value):t.value;if(k==='value'&&(!Number.isFinite(v)||v<0))throw Error('옵션 수치를 확인하세요.');selected()[side][Number(i)][k]=v;}
  else if(t.dataset.layerSetting){const k=t.dataset.layerSetting,v=t.value===''&&k==='p'?null:Number(t.value);if(v!==null&&(!Number.isFinite(v)||v<0||(k==='p'&&v>100)))throw Error('확률 또는 비용을 확인하세요.');selected()[k]=v;}
  else if(t.dataset.prob){const k=t.dataset.prob,v=t.value===''&&k==='p'?null:Number(t.value);if(v!==null&&(!Number.isFinite(v)||v<0||(k==='p'&&v>100)))throw Error('확률·비용·횟수를 확인하세요.');if(['pity','budget'].includes(k)&&!Number.isSafeInteger(v))throw Error('횟수는 0 이상의 정수여야 합니다.');p.probability[k]=v;save();probabilityResults();return;}
  else if(t.dataset.lineProb){const v=t.value===''?null:Number(t.value);if(v!==null&&(!Number.isFinite(v)||v<0||v>100))throw Error('확률은 0~100%입니다.');p.probability.lineP[Number(t.dataset.lineProb)]=v;save();probabilityResults();return;}
  else if(t.dataset.abilityProb){const v=Number(t.value);if(!Number.isFinite(v))throw Error('수치 범위를 확인하세요.');p.probability.ability[t.dataset.abilityProb]=v;save();probabilityResults();return;}
  else if(t.id==='minimum-lines'){p.probability.minimum=Number(t.value);save();probabilityResults();return;}
  else if(t.id==='prob-source'){p.probability.source=t.value;save();return;}
  else return;
  save();render();
}catch(error){toast(error.message);if(page==='spec'&&$('#field-error'))$('#field-error').textContent=error.message;else render();}});
document.addEventListener('click',async e=>{const t=e.target.closest('button,a');if(!t)return;const p=current();try{
  if(handleBuffClick(t,p)){save();render();return;}
  if(t.dataset.page||t.dataset.goto){e.preventDefault();navigate(t.dataset.page||t.dataset.goto);return;}
  if(t.dataset.openInventoryCalibration!==undefined){e.preventDefault();const panel=$('#inventory-calibration');if(panel){panel.querySelector('details').open=true;panel.querySelector('[data-details="attribute-calibration"]').open=true;panel.scrollIntoView({behavior:'smooth',block:'start'});}return;}
  if(t.dataset.inventoryFilter){inventoryFilter=t.dataset.inventoryFilter;render();return;}
  if(t.dataset.inventoryMetric){inventoryMetric=t.dataset.inventoryMetric;render();return;}
  if(t.dataset.inventoryItem){const entry=p.inventory.find(item=>item.id===t.dataset.inventoryItem);if(!entry)return;selectedItemId=entry.id;if(slotFamily(p.equipment[selectedSlot].slotKey)!==slotFamily(entry.slotKey))selectedSlot=p.equipment.findIndex(slot=>slot.slotKey===entry.slotKey);render();return;}
  if(t.dataset.baselineInventory){inventoryMutation(profile=>setEquipped(profile,t.dataset.baselineInventory,profile.equipment[selectedSlot].slotKey));render();toast('현재 착용 장비를 기록했습니다. 현재 스펙과 슬롯 잠재는 유지합니다.');return;}
  if(t.dataset.clearEquipmentBaseline!==undefined){inventoryMutation(profile=>{profile.equipment[selectedSlot].equippedId=null;});render();toast('착용 연결을 해제했습니다. 현재 스펙과 슬롯 잠재는 유지합니다.');return;}
  if(t.dataset.equipInventory){inventoryMutation(profile=>{const slot=profile.equipment[selectedSlot],old=equippedEntry(profile,slot),next=profile.inventory.find(entry=>entry.id===t.dataset.equipInventory);if(!old||!next)throw Error('현재 착용 장비와 후보를 확인하세요.');const result=compareItems(effectiveStats(profile),old.item,next.item,profile.calibration);if(result.error)throw Error(result.error);setEquipped(profile,next.id,slot.slotKey);rebaseLoadout(profile,result.afterStats);});render();toast('장비와 계산 스펙을 새 기준으로 저장했습니다. 슬롯 잠재는 그대로입니다.');return;}
  if(t.dataset.deleteInventory){inventoryMutation(profile=>{if(profile.equipment.some(slot=>slot.equippedId===t.dataset.deleteInventory))throw Error('착용 중인 장비는 삭제할 수 없습니다.');profile.inventory=profile.inventory.filter(entry=>entry.id!==t.dataset.deleteInventory);});selectedItemId=null;render();toast('장비를 보관함에서 삭제했습니다.');return;}
  if(t.id==='open-stat-calibration'){e.preventDefault();$('#main-stat-calibration').open=true;$('#main-stat-calibration').scrollIntoView({block:'start',behavior:'smooth'});return;}
  if(t.dataset.equipmentKey){let index=findEquipmentIndex(p,t.dataset.equipmentKey);if(index<0){if(p.equipment.length>=30)throw Error('장비는 최대 30개입니다.');p.equipment.push({...newEquipment(t.dataset.equipmentKey),equippedId:null});index=p.equipment.length-1;save();}selectedSlot=index;selectedItemId=null;selectedLayer='miracle';render();return;}
  if(t.dataset.slot){selectedSlot=Number(t.dataset.slot);if(selectedLayer==='ability')selectedLayer='miracle';render();return;}
  if(t.dataset.layer){selectedLayer=t.dataset.layer;render();return;}
  if(t.dataset.rank){const [i,l]=t.dataset.rank.split(':');selectedSlot=i==='-1'?0:Number(i);selectedLayer=l;render();return;}
  if(t.dataset.probMode){p.probability.mode=t.dataset.probMode;save();render();return;}
  if(t.dataset.deleteMeasurement){p.measurements.splice(Number(t.dataset.deleteMeasurement),1);save();render();return;}
  switch(t.id){
    case 'undo-equipment-import':{
      if(!equipmentUndo||equipmentUndo.id!==p.id)throw Error('되돌릴 장비 등록 기록이 없습니다.');
      const now=structuredClone(p),previous=equipmentUndo;Object.assign(p,structuredClone(previous));
      if(!save({keepEquipmentUndo:true})){Object.assign(p,now);throw Error('저장 공간이 부족해 되돌리지 못했습니다.');}
      equipmentUndo=null;selectedSlot=Math.min(selectedSlot,p.equipment.length-1);render();toast('장비 등록 전 상태로 되돌렸습니다.');return;
    }
    case 'undo-screenshot-import':{
      if(!screenshotUndo||screenshotUndo.id!==p.id)throw Error('되돌릴 사진 반영 기록이 없습니다.');
      const now=structuredClone(p),previous=screenshotUndo;
      Object.assign(p,structuredClone(previous));
      if(!previous.screenshotImport)delete p.screenshotImport;
      if(!save({keepScreenshotUndo:true})){Object.assign(p,now);throw Error('저장 공간이 부족해 되돌리지 못했습니다.');}
      screenshotUndo=null;render();toast('사진 반영 전 스탯과 버프 기준으로 되돌렸습니다.');return;
    }
    case 'new-profile':{if(profiles.length>=20)throw Error('프리셋은 최대 20개입니다.');const next=structuredClone(p);next.id=crypto.randomUUID();next.name=`${p.name} 사본`;profiles.push(next);activeId=next.id;toast('현재 설정을 복사한 프리셋을 만들었습니다.');break;}
    case 'rename-profile':{const name=prompt('프리셋 이름',p.name);if(name?.trim())p.name=name.trim().slice(0,100);break;}
    case 'delete-profile':if(profiles.length>1){profiles=profiles.filter(x=>x.id!==activeId);activeId=profiles[0].id;selectedSlot=0;}break;
    case 'export':$('#backup-text').value=exportData();$('#json-dialog').showModal();return;
    case 'download-json':download('maple-spec-backup.json',exportData(),'application/json');return;
    case 'import':$('#import-file').click();return;
    case 'select-ability':selectedLayer='ability';render();return;
    case 'add-slot':if(p.equipment.length>=30)throw Error('장비는 최대 30개입니다.');p.equipment.push({...slot('새 슬롯'),slotKey:'custom-'+crypto.randomUUID(),equippedId:null});selectedSlot=p.equipment.length-1;selectedLayer='miracle';break;
    case 'delete-slot':if(p.equipment.length>1){if(p.inventory.some(entry=>entry.slotKey===p.equipment[selectedSlot].slotKey)||p.equipment[selectedSlot].equippedId)throw Error('보관함 장비가 연결된 슬롯은 삭제할 수 없습니다.');p.equipment.splice(selectedSlot,1);selectedSlot=Math.max(0,selectedSlot-1);}break;
    case 'apply-lines':{const l=selected(),s=replaceLines(effectiveStats(p),l.old,l.next,p.calibration);rebaseLoadout(p,s);l.old=structuredClone(l.next);toast('목표 옵션과 변경된 합계를 새 기준으로 저장했습니다.');break;}
    case 'send-probability':{const l=selected();p.probability.mode='direct';p.probability.p=l.p;p.probability.cost=l.cost;p.probability.pity=0;p.probability.source='장비 목표 조합 · 사용자 입력';save();navigate('probability');return;}
    case 'prob-example':p.probability={...p.probability,mode:'direct',p:1,cost:1,budget:100,pity:0,source:'연습용 가상 확률 1% · 게임 공시값 아님'};toast('게임 확률이 아닌 연습용 예제를 불러왔습니다.');break;
    case 'add-measurement':{const observed=Number($('#observed').value);if(!Number.isFinite(observed)||observed<=0)throw Error('0보다 큰 실제 관측 데미지를 입력하세요.');if(p.measurements.length>=500)throw Error('검증 기록은 최대 500개입니다.');const mode=$('#measurement-mode').value;p.measurements.push({at:new Date().toISOString(),mode,observed,predicted:damage(effectiveStats(p),mode).expected,note:$('#measurement-note').value,stats:structuredClone(effectiveStats(p)),context:{job:p.job,level:p.level,region:p.region,platform:p.platform,clientVersion:p.clientVersion,catalog:'1.15.0'},model:MODEL_VERSION});toast('스펙 원본과 실측값을 함께 기록했습니다.');break;}
    case 'export-measurements':{const rows=[['시간','모드','조건','예측','관측','오차 %','모델','스펙 JSON'],...p.measurements.map(r=>[r.at,r.mode,r.note,r.predicted,r.observed,(r.predicted/r.observed-1)*100,r.model,JSON.stringify(r.stats)])];download('maple-measurements.csv','\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');return;}
    default:return;
  }
  save();render();
}catch(error){toast(error.message);}});
$('#import-file').addEventListener('change',async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>10000000)throw Error('10MB 이하 JSON만 불러올 수 있습니다.');const data=JSON.parse(await file.text());if(data.version!==1||!Array.isArray(data.profiles)||data.profiles.length<1||data.profiles.length>20)throw Error('지원하지 않는 백업 형식입니다.');if(data.model!==MODEL_VERSION)throw Error('모델 버전이 다른 백업입니다. 버전별 이관 검토가 필요합니다.');if(profiles.length+data.profiles.length>20)throw Error('불러온 뒤 프리셋이 20개를 초과합니다.');const imported=data.profiles.map(p=>{validateProfile(p);return {...p,id:crypto.randomUUID(),name:p.name+' (불러옴)'};});profiles.push(...imported);activeId=imported[0].id;selectedSlot=0;save();render();toast('기존 프리셋을 보존하고 백업을 추가했습니다.');}catch(error){toast(error.message);}finally{e.target.value='';}});
setupEquipmentImport({getProfile:current,getSelectedSlot:()=>current().equipment[selectedSlot].slotKey??slotKey(current().equipment[selectedSlot].name),getMode:()=>page==='potentials'?'slots':'inventory',onApply({profileId,profile,count,mode}) {
  const p=current();if(p.id!==profileId)throw Error('프리셋이 바뀌었습니다. 사진을 다시 선택하세요.');
  const previous=structuredClone(p);Object.assign(p,profile);
  if(!save({keepEquipmentUndo:true})){Object.assign(p,previous);throw Error('저장 공간이 부족합니다. 장비 등록 전 상태를 유지했습니다.');}
  equipmentUndo=previous;render();toast(`${count}개 ${mode==='slots'?'슬롯 옵션을':'장비를 보관함에'} 등록했습니다. 현재 스펙은 유지합니다.`);
}});
setupScreenshotImport({getProfile:current,onApply({profileId,stats,keys}) {
  const p=current();
  if(p.id!==profileId)throw Error('프리셋이 바뀌었습니다. 사진을 다시 가져와 주세요.');
  const previous=structuredClone(p);
  p.stats=stats;
  p.loadout.reference=null;p.loadout.referenceAt=null;
  p.screenshotImport={at:new Date().toISOString(),count:keys.length};
  if(!save({keepScreenshotUndo:true})) {
    Object.assign(p,previous);if(!previous.screenshotImport)delete p.screenshotImport;
    throw Error('저장 공간이 부족합니다. 기존 데이터는 유지했습니다. 백업 후 다시 시도해 주세요.');
  }
  screenshotUndo=previous;render();toast(`${keys.length}개 스탯을 반영했습니다. 사진에 없는 값은 기존 입력을 유지합니다.`);
}});
page=location.hash.slice(1)||'spec';render();

function handleBuffChange(t,p) {
  if(['job','buff-job'].includes(t.id)) {
    const previousMain=mainAttribute(p);p.job=t.value;if(previousMain!==mainAttribute(p))p.stats.mainStat=0;p.calibration={}; p.loadout.reference=null; p.loadout.referenceAt=null; buffFilters.category='job';buffFilters.query='';buffFilters.kind='skills';
    toast('직업을 변경했습니다. 스탯을 확인하고 현재 버프 상태를 기준으로 저장하세요.');return true;
  }
  if(t.id==='game-region'){p.region=t.value;p.loadout.reference=null;p.loadout.referenceAt=null;toast('지역을 변경했습니다. 입력 스탯의 버프 기준을 다시 저장하세요.');return true;}
  if(t.id==='game-platform'){p.platform=t.value;return true;}
  if(t.id==='game-client-version'){p.clientVersion=t.value.trim().slice(0,30);return true;}
  if(t.id==='buff-encounter'){p.encounter=t.value;return true;}
  if(t.id==='advancement'){p.loadout.advancement=Number(t.value);return true;}
  if(t.id==='effect-kind'){buffFilters.kind=t.value;return true;}
  if(t.dataset.buffProp){
    const entry=entryFor(p,t.dataset.effectId);if(!entry)throw Error('효과를 찾을 수 없습니다.');
    const state=selection(p,entry,true),key=t.dataset.buffProp;
    if(key==='enabled')state.enabled=t.checked;
    else if(key==='learned'){if(!['auto','yes','no'].includes(t.value))throw Error('습득 여부를 확인하세요.');state.learned=t.value;}
    else if(key==='rank'){const v=Number(t.value);if(!Number.isInteger(v)||v<1||v>(entry.maxRank??1))throw Error('스킬 레벨 범위를 확인하세요.');state.rank=v;}
    else if(key==='unlock'){const v=t.value===''?null:Number(t.value);if(v!==null&&(!Number.isInteger(v)||v<1||v>10000))throw Error('습득 레벨을 확인하세요.');state.unlock=v;}
    else return false;
    return true;
  }
  if(t.dataset.override){
    const [id,index,key]=t.dataset.override.split('|'),entry=entryFor(p,id);if(!entry)throw Error('효과를 찾을 수 없습니다.');
    const state=selection(p,entry,true),row=state.manual?.[Number(index)];if(!row)throw Error('보정 수치를 확인하세요.');
    if(key==='value'){const v=Number(t.value);if(t.value===''||!Number.isFinite(v)||v<0||v>1e30)throw Error('보정 수치는 0 이상의 숫자입니다.');row.value=v;}
    else if(key==='type'){if(!EFFECTS.some(([k])=>k===t.value))throw Error('효과 종류를 확인하세요.');row.type=t.value;}
    repairUnknownReference(p,entry);return true;
  }
  if(t.dataset.customName){const e=p.loadout.custom.find(e=>e.id===t.dataset.customName);if(e)e.name=t.value.trim().slice(0,100)||'직접 등록 효과';return true;}
  return false;
}
function handleBuffClick(t,p) {
  if(t.dataset.buffCategory){buffFilters.category=t.dataset.buffCategory;buffFilters.kind=t.dataset.buffCategory==='job'?'skills':'all';buffFilters.query='';return true;}
  if(t.dataset.addOverride){const e=entryFor(p,t.dataset.addOverride);if(!e)throw Error('효과를 찾을 수 없습니다.');const s=selection(p,e,true);s.manual??=[];if(s.manual.length>=20)throw Error('효과 수치는 최대 20개입니다.');s.manual.push({type:'damage',value:0});repairUnknownReference(p,e);return true;}
  if(t.dataset.removeOverride){const [id,index]=t.dataset.removeOverride.split('|'),s=selection(p,entryFor(p,id),true);s.manual.splice(Number(index),1);if(!s.manual.length)s.manual=null;repairUnknownReference(p,entryFor(p,id));return true;}
  if(t.dataset.resetOverride){selection(p,entryFor(p,t.dataset.resetOverride),true).manual=null;repairUnknownReference(p,entryFor(p,t.dataset.resetOverride));return true;}
  if(t.dataset.deleteCustom){p.loadout.custom=p.loadout.custom.filter(e=>e.id!==t.dataset.deleteCustom);delete p.loadout.selections[t.dataset.deleteCustom];return true;}
  if(t.id==='auto-learn'){autoLearn(p);toast('확인된 해금 레벨과 완료한 전직으로 습득 여부를 설정했습니다. 실제 스킬 레벨은 별도로 확인하세요.');return true;}
  if(t.id==='capture-buff-reference'){captureReference(p);toast('현재 선택이 입력 스탯에 포함된 상태로 저장했습니다. 이제 버프를 바꿔 비교하세요.');return true;}
  if(t.id==='empty-buff-reference'){p.loadout.reference=[];p.loadout.referenceAt=new Date().toISOString();toast('목록의 효과가 제외된 입력 스탯을 기준으로 계산합니다.');return true;}
  if(t.id==='rebase-buffs'){rebaseLoadout(p);toast('현재 버프 적용 결과와 선택 상태를 새 기준으로 저장했습니다.');return true;}
  if(t.id==='add-custom-buff'){
    if(p.loadout.custom.length>=50)throw Error('직접 효과는 최대 50개입니다.');
    const e={id:'custom-'+crypto.randomUUID(),name:'직접 등록 버프',kind:'buff',category:'custom',maxRank:1,description:'게임 툴팁 또는 실측으로 확인한 전체 스탯 변화량을 입력하세요.'};p.loadout.custom.push(e);selection(p,e,true);buffFilters.category='custom';buffFilters.query='';buffFilters.kind='all';return true;
  }
  return false;
}
