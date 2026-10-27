import {EFFECTS} from './engine.mjs?v=0.3.1';
import {EQUIPMENT_SLOTS,itemEffectGroups} from './equipment-data.mjs?v=0.3.1';
import {registerInventory,registerSlotPotentials} from './inventory-data.mjs?v=0.3.1';
import {readEquipmentScreenshots,checkEquipmentFiles} from './equipment-ocr.mjs?v=0.3.1';
import {equipmentLine} from './equipment-parser.mjs?v=0.3.1';
import {EQUIPMENT_OPTIONS,equipmentOption} from './equipment-options.mjs?v=0.3.1';
import {parseStatNumber} from './screenshot-parser.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function setupEquipmentImport({getProfile,getSelectedSlot=()=>null,getMode=()=>'inventory',onApply}) {
  const picker=document.createElement('input');picker.type='file';picker.multiple=true;picker.accept='image/png,image/jpeg,image/webp';picker.hidden=true;picker.id='equipment-files';
  const dialog=document.createElement('dialog');dialog.className='equipment-dialog';dialog.setAttribute('aria-labelledby','equipment-import-title');
  dialog.innerHTML=`<div class="equipment-import-header"><h2 id="equipment-import-title">사진으로 장비 등록</h2><button type="button" data-eq-close aria-label="장비 사진 등록 닫기">×</button></div><div class="equipment-import-body"><p class="equipment-import-guide">장비 정보와 슬롯 강화 효과가 함께 보이는 사진을 선택하세요. 전체 게임 화면이나 두 패널을 함께 자른 사진을 지원합니다. 최대 12장을 한 번에 등록할 수 있어요.</p><div class="equipment-import-warning">선택한 장비의 현재 옵션과 비교 목표를 사진 값으로 설정합니다. 장착 효과는 기록으로 저장하며 내 스펙의 합계에 다시 더하지 않습니다.</div><p id="equipment-import-progress" class="equipment-import-progress" role="status" aria-live="polite"></p><p id="equipment-import-message" class="equipment-import-error" role="alert"></p><fieldset id="equipment-import-results" style="border:0;padding:0;margin:0;min-width:0"></fieldset></div><div class="equipment-import-footer"><p id="equipment-import-selection" role="status"></p><div class="actions"><button type="button" data-eq-retry>다른 사진 선택</button><button type="button" id="equipment-import-apply" class="primary" disabled>장비 등록</button></div></div>`;
  document.body.append(picker,dialog);
  const $=s=>dialog.querySelector(s);
  let state=null,controller=null,token=0,pendingMode='inventory',pendingEditId=null;
  const message=s=>{$('#equipment-import-message').textContent=s;};
  const register=()=>state.mode==='inventory'?registerInventory(state.profile,selected()):registerSlotPotentials(state.profile,selected());
  function explain(){
    $('#equipment-import-title').textContent=state.mode==='inventory'?'장비 보관함에 등록':'슬롯 별·잠재·에디셔널 등록';
    $('.equipment-import-guide').textContent=state.mode==='inventory'?'주·부 옵션이 보이는 장비 사진을 선택하세요. 장비 두 개의 비교 화면에서는 오른쪽 후보를 읽습니다. 같은 부위의 장비를 여러 개 보관할 수 있어요.':'장비 정보와 슬롯 강화 효과가 함께 보이는 사진을 선택하세요. 별·잠재·에디셔널은 각각 선택해 슬롯에 등록합니다.';
    $('.equipment-import-warning').textContent=state.mode==='inventory'?'주·부 옵션은 보관함에, 체크한 별 기록은 슬롯에 저장합니다. 잠재·주문서와 현재 스펙은 그대로 유지합니다.':'잠재·에디셔널은 장비 아이템이 아닌 슬롯에 저장됩니다. 현재/목표 옵션을 같은 값으로 등록하며 현재 스펙은 유지합니다.';
  }
  function release(){token++;controller?.abort();controller=null;for(const photo of state?.photos??[])URL.revokeObjectURL(photo.url);state=null;$('#equipment-import-results').replaceChildren();}
  function close(){release();dialog.close();document.querySelector('#import-equipment')?.focus();}
  function lineFields(record,index,key) {
    const lines=record[key]??Array.from({length:3},()=>({type:'none',value:0}));
    return `<h4><label class="equipment-layer-check"><input type="checkbox" data-eq-layer="${index}:${key}" ${record[key]!==null?'checked':''}>${key==='potential'?'잠재 옵션':'에디셔널 잠재 옵션'}</label></h4>
      <label class="field"><span>등급</span><select data-eq-grade="${index}:${key}"><option value="">등급 미확인</option>${['레어','에픽','유니크','레전드리'].map(v=>`<option ${record[key+'Grade']===v?'selected':''}>${v}</option>`).join('')}</select></label>
      ${Array.from({length:3},(_,n)=>{const line=lines[n]??{type:'unread',value:0};return `<div class="equipment-import-line"><select data-eq-line="${index}:${key}:${n}:type" aria-label="사진 ${index+1} ${key==='potential'?'잠재':'에디셔널'} ${n+1}줄 종류">${line.type==='unread'?`<option value="unread">인식 확인: ${esc(line.label??'미인식')}</option>`:''}${EFFECTS.map(([type,label])=>`<option value="${type}" ${type===line.type?'selected':''}>${esc(label)}</option>`).join('')}</select><input type="text" inputmode="decimal" data-eq-line="${index}:${key}:${n}:value" value="${esc(line.value)}" aria-label="사진 ${index+1} ${key==='potential'?'잠재':'에디셔널'} ${n+1}줄 수치"></div>`;}).join('')}`;
  }
  function itemFields(item,index) {
    return itemEffectGroups(item).map(({source,label,effects})=>`<section class="equipment-effect-edit-group"><div class="equipment-effect-edit-heading"><h4>${label} (${effects.length}개)</h4><button type="button" class="small" data-eq-effect-add="${index}:${source}">＋ 옵션 추가</button></div>${item.effects.map((effect,n)=>{
      if((effect.source??'unclassified')!==source)return '';
      const type=effect.type??equipmentLine(`${effect.label} ${effect.value}${effect.unit}`)?.type??'unread',option=equipmentOption(type);
      return `<div class="equipment-effect-edit-row"><select data-eq-effect="${index}:${n}:type" aria-label="장비 ${index+1} ${label} ${n+1} 옵션 종류">${!option?`<option value="unread">확인 필요: ${esc(effect.label||'옵션 선택')}</option>`:''}${EQUIPMENT_OPTIONS.map(o=>`<option value="${o.type}" ${option?.type===o.type?'selected':''}>${esc(o.name)}</option>`).join('')}</select><span class="equipment-effect-value"><input type="text" inputmode="decimal" data-eq-effect="${index}:${n}:value" value="${effect.value??''}" aria-label="장비 ${index+1} ${n+1} 옵션 수치"><em>${effect.unit}</em></span><button type="button" data-eq-effect-remove="${index}:${n}" aria-label="${n+1}번 옵션 삭제">×</button><select class="equipment-effect-source" data-eq-effect="${index}:${n}:source" aria-label="${n+1}번 옵션 주·부 구분">${[['base','주 옵션'],['random','부 옵션'],['unclassified','분류 확인 필요']].map(([key,name])=>`<option value="${key}" ${source===key?'selected':''}>${name}</option>`).join('')}</select></div>`;
    }).join('')}${!effects.length?'<p class="inline-note">옵션 추가를 눌러 종류와 수치를 선택하세요.</p>':''}</section>`).join('');
  }
  function draw() {
    $('#equipment-import-results').innerHTML=state.photos.map((photo,index)=>{
      const record=photo.record;
      if(!record)return `<div class="equipment-import-card"><b>사진 ${index+1}</b><p>${esc(photo.error||'읽기 대기 중')}</p></div>`;
      return `<details class="equipment-import-card" open><summary><input type="checkbox" data-eq-select="${index}" ${photo.selected?'checked':''} aria-label="${index+1}번 등록 선택"><b>${photo.url?'사진':'장비'} ${index+1} · ${state.mode==='slots'?'슬롯 옵션':esc(record.item.name||'장비 이름 확인 필요')}</b><span class="tag">${esc(EQUIPMENT_SLOTS.find(s=>s.key===record.slotKey)?.name??'부위 확인 필요')}</span></summary>
        <div class="form-grid"><label class="field"><span>등록할 부위</span><select data-eq-meta="${index}:slotKey"><option value="">부위 선택</option>${EQUIPMENT_SLOTS.map(s=>`<option value="${s.key}" ${record.slotKey===s.key?'selected':''}>${s.name}</option>`).join('')}</select></label>${state.mode==='inventory'?`<label class="field"><span>장비 이름</span><input data-eq-meta="${index}:name" value="${esc(record.item.name)}" maxlength="100"></label><label class="field"><span>레벨</span><input type="number" min="0" max="10000" step="1" data-eq-meta="${index}:level" value="${record.item.level??''}"></label><label class="field"><span>장비 등급</span><select data-eq-meta="${index}:rarity"><option value="">미확인</option>${['레어','에픽','유니크','레전드리'].map(s=>`<option ${record.item.rarity===s?'selected':''}>${s}</option>`).join('')}</select></label><label class="field"><span>품질</span><select data-eq-meta="${index}:quality"><option value="">미확인</option>${['하급','중급','상급','최상급'].map(s=>`<option ${record.item.quality===s?'selected':''}>${s}</option>`).join('')}</select></label>`:''}</div>
        <div class="equipment-photo-slot"><h4>슬롯 촬영 정보</h4><p class="inline-note">별 강화는 장비가 아닌 슬롯에 적용됩니다.${state.mode==='inventory'?' 아래 별 개수는 사진 수치의 기준이며, 장비 교체 시 대상 슬롯의 별에 맞춰 비교합니다.':''}</p><label class="field equipment-star-field"><span>${state.mode==='inventory'?'촬영 당시 슬롯 별':'슬롯 별 강화'} (성)</span><input type="number" min="0" max="30" step="1" data-eq-upgrade="${index}:stars" value="${record.slotUpgrades?.stars??record.item.observation?.stars??''}" aria-label="${index+1}번 슬롯 별 강화"></label><label class="equipment-layer-check"><input type="checkbox" data-eq-upgrade="${index}:importStars" ${record.slotUpgrades?.importStars?'checked':''}>이 별 개수를 슬롯에 기록</label></div>
        ${state.mode==='inventory'?`
        <label class="field"><span>입력 수치 기준</span><select data-eq-observation="${index}:basis"><option value="applied" ${record.item.observation?.basis!=='base'?'selected':''}>사진에 표시된 슬롯 강화 적용 후 수치</option><option value="base" ${record.item.observation?.basis==='base'?'selected':''}>슬롯 강화 적용 전 장비 기본 수치</option></select></label>
        ${record.nameCorrection?`<p class="equipment-name-correction">장비명 대조: ${esc(record.nameCorrection.raw)} → <b>${esc(record.nameCorrection.name)}</b><br>확인된 장비명으로 보정했습니다. 다른 장비라면 이름 입력란에서 수정하세요.</p>`:record.nameConfidence<85?'<p class="equipment-import-warning">장비 이름을 원본과 확인해 주세요. 이름 입력란에서 바로 고칠 수 있어요.</p>':''}
        ${itemFields(record.item,index)}
        `:lineFields(record,index,'potential')+lineFields(record,index,'additional')}
        ${photo.url?`<details><summary>원본 패널 크게 확인</summary><div class="equipment-source-panels">${(photo.preview??[]).map((src,n)=>`<figure><figcaption>${n?'잠재 옵션 원본':'장비 정보 원본'}</figcaption><img class="equipment-panel-preview" loading="lazy" src="${src}" alt="사진 ${index+1} ${n?'잠재 옵션':'장비 정보'} 원본 패널"></figure>`).join('')}</div><a href="${photo.url}" target="_blank" rel="noopener">전체 원본 사진 열기 ↗</a></details>`:''}
      </details>`;
    }).join('');update();
  }
  function selected(){return state.photos.filter(p=>p.selected&&p.record).map(p=>p.record);}
  function update(){
    const count=selected().length;let error='';
    if(count)try{register();}catch(e){error=e.message;}
    $('#equipment-import-selection').textContent=error||`${count}개 ${state.mode==='inventory'?'장비':'슬롯'} 선택 · 확인한 값만 등록합니다`;
    $('#equipment-import-apply').disabled=state.busy||!count||!!error;
    $('#equipment-import-apply').textContent=count?`${count}개 ${state.mode==='inventory'?'장비':'슬롯'} 등록`:'등록';
    $('#equipment-import-results').disabled=state.busy;
  }
  async function start(files) {
    release();const run=token;controller=new AbortController();state={profile:structuredClone(getProfile()),selectedSlot:getSelectedSlot(),mode:pendingMode,editId:pendingEditId,photos:[],busy:true};message('');explain();
    $('#equipment-import-progress').hidden=false;$('#equipment-import-progress').textContent='사진을 준비하고 있어요.';
    dialog.querySelector('[data-eq-retry]').disabled=true;if(!dialog.open)dialog.showModal();update();
    try {
      checkEquipmentFiles(files);if(state.editId&&files.length!==1)throw Error('장비 수정은 사진 한 장을 선택하세요.');state.photos=files.map(file=>({url:URL.createObjectURL(file),record:null,selected:false,error:null}));draw();
      const knownNames=state.profile.inventory.filter(entry=>entry.item.nameVerified).map(entry=>({slotKey:entry.slotKey,name:entry.item.name}));
      await readEquipmentScreenshots(files,{signal:controller.signal,mode:state.mode,knownNames,onProgress:p=>{if(run===token)$('#equipment-import-progress').textContent=`사진 ${p.index+1}/${p.total} · ${p.stage}`;},onPhoto:p=>{
        if(run!==token)return;const photo=state.photos[p.index];photo.record=p.record;photo.error=p.error;photo.preview=p.preview;
        if(files.length===1&&photo.record?.slotKey==='ring1'&&state.selectedSlot==='ring2')photo.record.slotKey='ring2';
        if(photo.record&&state.editId)photo.record.inventoryId=state.editId;
        if(state.mode==='inventory'&&photo.record?.slotUpgrades){const slot=state.profile.equipment.find(s=>s.slotKey===photo.record.slotKey);photo.record.slotUpgrades.importStars=slot?.stars==null&&photo.record.slotUpgrades.stars!==null;}
        photo.selected=!!p.record?.slotKey&&(state.mode==='slots'||!!p.record?.item.name);
        draw();
      }});
    }catch(e){if(run===token&&!controller.signal.aborted)message(e.message||'장비 사진을 읽지 못했어요.');}
    finally{if(run===token){state.busy=false;$('#equipment-import-progress').hidden=true;dialog.querySelector('[data-eq-retry]').disabled=false;draw();}}
  }
  function manual(entry){
    release();state={profile:structuredClone(getProfile()),selectedSlot:getSelectedSlot(),mode:'inventory',photos:[{url:'',selected:true,record:entry?{slotKey:entry.slotKey,item:structuredClone(entry.item),inventoryId:entry.id,slotUpgrades:{stars:entry.item.observation?.stars??null,importStars:false}}:{slotKey:getSelectedSlot(),item:{name:'',level:null,rarity:'',quality:'',effects:[],observation:{basis:'applied',stars:getProfile().equipment.find(s=>s.slotKey===getSelectedSlot())?.stars??null}},slotUpgrades:{stars:getProfile().equipment.find(s=>s.slotKey===getSelectedSlot())?.stars??null,importStars:false}}}],busy:false};message('');explain();$('#equipment-import-progress').hidden=true;dialog.querySelector('[data-eq-retry]').disabled=false;draw();if(!dialog.open)dialog.showModal();
  }
  document.addEventListener('click',e=>{
    const trigger=e.target.closest('[data-import-equipment]');
    if(trigger){pendingMode=trigger.dataset.importEquipment||getMode();pendingEditId=pendingMode==='inventory'?trigger.closest('[data-inventory-detail]')?.dataset.inventoryDetail??null:null;picker.click();}
    if(e.target.closest('[data-new-inventory]'))manual();
    const edit=e.target.closest('[data-edit-inventory]');if(edit)manual(getProfile().inventory.find(entry=>entry.id===edit.dataset.editInventory));
  });
  picker.addEventListener('change',()=>{const files=[...picker.files];picker.value='';if(files.length)void start(files);});
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('close',()=>{if(state)release();});
  dialog.addEventListener('click',e=>{
    const add=e.target.closest('[data-eq-effect-add]');if(add){const [i,source]=add.dataset.eqEffectAdd.split(':');const effects=state.photos[Number(i)].record.item.effects;if(effects.length>=30){message('옵션은 최대 30개입니다.');return;}message('');effects.push({type:'unread',label:'옵션 선택',value:null,unit:'',source});draw();return;}
    const remove=e.target.closest('[data-eq-effect-remove]');if(remove){const [i,n]=remove.dataset.eqEffectRemove.split(':');state.photos[Number(i)].record.item.effects.splice(Number(n),1);message('');draw();return;}
    if(e.target.closest('[data-eq-close]')){close();return;}
    if(e.target.closest('[data-eq-retry]')){pendingMode=state.mode;pendingEditId=state.editId??state.photos[0]?.record?.inventoryId??null;picker.click();return;}
    if(e.target.closest('#equipment-import-apply'))try{const profile=register();onApply({profileId:state.profile.id,profile,count:selected().length,mode:state.mode});close();}catch(error){message(error.message);}
  });
  function edit(e){
    if(!state||state.busy)return;const t=e.target;
    try {
      if(t.dataset.eqSelect!==undefined)state.photos[Number(t.dataset.eqSelect)].selected=t.checked;
      else if(t.dataset.eqMeta){const [i,key]=t.dataset.eqMeta.split(':'),record=state.photos[Number(i)].record;if(key==='slotKey')record.slotKey=t.value;else{record.item[key]=key==='level'?(t.value===''?null:Number(t.value)):t.value;if(key==='name')record.item.nameVerified=true;}}
      else if(t.dataset.eqUpgrade){const [i,key]=t.dataset.eqUpgrade.split(':'),record=state.photos[Number(i)].record;record.slotUpgrades??={stars:null,importStars:false};record.slotUpgrades[key]=key==='importStars'?t.checked:t.value===''?null:Number(t.value);if(key==='stars'){record.item.observation??={basis:'applied',stars:null};record.item.observation.stars=record.slotUpgrades.stars;}}
      else if(t.dataset.eqObservation){const i=Number(t.dataset.eqObservation.split(':')[0]),record=state.photos[i].record;record.item.observation??={basis:'applied',stars:null};record.item.observation.basis=t.value;}
      else if(t.dataset.eqLayer){const [i,key]=t.dataset.eqLayer.split(':'),record=state.photos[Number(i)].record;record[key]=t.checked?Array.from({length:3},(_,n)=>({type:dialog.querySelector(`[data-eq-line="${i}:${key}:${n}:type"]`).value,value:parseStatNumber(dialog.querySelector(`[data-eq-line="${i}:${key}:${n}:value"]`).value)})):null;}
      else if(t.dataset.eqGrade){const [i,key]=t.dataset.eqGrade.split(':');state.photos[Number(i)].record[key+'Grade']=t.value;}
      else if(t.dataset.eqLine){const [i,key,n,field]=t.dataset.eqLine.split(':'),record=state.photos[Number(i)].record;if(!record[key])return;record[key][Number(n)]??={type:'unread',value:0};record[key][Number(n)][field]=field==='value'?parseStatNumber(t.value):t.value;}
      else if(t.dataset.eqEffect){
        const [i,n,key]=t.dataset.eqEffect.split(':'),effect=state.photos[Number(i)].record.item.effects[Number(n)];
        if(key==='type'){const option=equipmentOption(t.value);if(!option)throw Error('옵션 종류를 선택하세요.');Object.assign(effect,{type:option.type,label:option.label,unit:option.unit});message('');draw();return;}
        if(key==='source'){effect.source=t.value;message('');draw();return;}
        effect.value=parseStatNumber(t.value);
      }
      else return;
      message('');update();
    }catch(error){message(error.message);$('#equipment-import-apply').disabled=true;}
  }
  dialog.addEventListener('input',edit);dialog.addEventListener('change',edit);
}
