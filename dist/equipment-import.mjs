import {EFFECTS} from './engine.mjs';
import {EQUIPMENT_SLOTS,registerEquipment} from './equipment-data.mjs';
import {readEquipmentScreenshots,checkEquipmentFiles} from './equipment-ocr.mjs';
import {equipmentLine} from './equipment-parser.mjs';
import {parseStatNumber} from './screenshot-parser.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function setupEquipmentImport({getProfile,getSelectedSlot=()=>null,onApply}) {
  const picker=document.createElement('input');picker.type='file';picker.multiple=true;picker.accept='image/png,image/jpeg,image/webp';picker.hidden=true;picker.id='equipment-files';
  const dialog=document.createElement('dialog');dialog.className='equipment-dialog';dialog.setAttribute('aria-labelledby','equipment-import-title');
  dialog.innerHTML=`<div class="equipment-import-header"><h2 id="equipment-import-title">사진으로 장비 등록</h2><button type="button" data-eq-close aria-label="장비 사진 등록 닫기">×</button></div><div class="equipment-import-body"><p class="equipment-import-guide">장비 정보와 슬롯 강화 효과가 함께 보이는 사진을 선택하세요. 전체 게임 화면이나 두 패널을 함께 자른 사진을 지원합니다. 최대 12장을 한 번에 등록할 수 있어요.</p><div class="equipment-import-warning">선택한 장비의 현재 옵션과 비교 목표를 사진 값으로 설정합니다. 장착 효과는 기록으로 저장하며 내 스펙의 합계에 다시 더하지 않습니다.</div><p id="equipment-import-progress" class="equipment-import-progress" role="status" aria-live="polite"></p><p id="equipment-import-message" class="equipment-import-error" role="alert"></p><fieldset id="equipment-import-results" style="border:0;padding:0;margin:0;min-width:0"></fieldset></div><div class="equipment-import-footer"><p id="equipment-import-selection" role="status"></p><div class="actions"><button type="button" data-eq-retry>다른 사진 선택</button><button type="button" id="equipment-import-apply" class="primary" disabled>장비 등록</button></div></div>`;
  document.body.append(picker,dialog);
  const $=s=>dialog.querySelector(s);
  let state=null,controller=null,token=0;
  const message=s=>{$('#equipment-import-message').textContent=s;};
  function release(){token++;controller?.abort();controller=null;for(const photo of state?.photos??[])URL.revokeObjectURL(photo.url);state=null;$('#equipment-import-results').replaceChildren();}
  function close(){release();dialog.close();document.querySelector('#import-equipment')?.focus();}
  function lineFields(record,index,key) {
    const lines=record[key]??Array.from({length:3},()=>({type:'none',value:0}));
    return `<h4><label class="equipment-layer-check"><input type="checkbox" data-eq-layer="${index}:${key}" ${record[key]!==null?'checked':''}>${key==='potential'?'잠재 옵션':'에디셔널 잠재 옵션'}</label></h4>
      <label class="field"><span>등급</span><select data-eq-grade="${index}:${key}"><option value="">등급 미확인</option>${['레어','에픽','유니크','레전드리'].map(v=>`<option ${record[key+'Grade']===v?'selected':''}>${v}</option>`).join('')}</select></label>
      ${Array.from({length:3},(_,n)=>{const line=lines[n]??{type:'unread',value:0};return `<div class="equipment-import-line"><select data-eq-line="${index}:${key}:${n}:type" aria-label="사진 ${index+1} ${key==='potential'?'잠재':'에디셔널'} ${n+1}줄 종류">${line.type==='unread'?`<option value="unread">인식 확인: ${esc(line.label??'미인식')}</option>`:''}${EFFECTS.map(([type,label])=>`<option value="${type}" ${type===line.type?'selected':''}>${esc(label)}</option>`).join('')}</select><input type="text" inputmode="decimal" data-eq-line="${index}:${key}:${n}:value" value="${esc(line.value)}" aria-label="사진 ${index+1} ${key==='potential'?'잠재':'에디셔널'} ${n+1}줄 수치"></div>`;}).join('')}`;
  }
  function draw() {
    $('#equipment-import-results').innerHTML=state.photos.map((photo,index)=>{
      const record=photo.record;
      if(!record)return `<div class="equipment-import-card"><b>사진 ${index+1}</b><p>${esc(photo.error||'읽기 대기 중')}</p></div>`;
      const checkEffects=record.item.effects.some(e=>e.value===null||equipmentLine(`${e.label} ${e.value}${e.unit}`)?.type==='unread');
      return `<details class="equipment-import-card" open><summary><input type="checkbox" data-eq-select="${index}" ${photo.selected?'checked':''} aria-label="사진 ${index+1} 등록 선택"><b>사진 ${index+1} · ${esc(record.item.name||'장비 이름 확인 필요')}</b><span class="tag">${esc(EQUIPMENT_SLOTS.find(s=>s.key===record.slotKey)?.name??'부위 확인 필요')}</span></summary>
        <div class="form-grid"><label class="field"><span>등록할 부위</span><select data-eq-meta="${index}:slotKey"><option value="">부위 선택</option>${EQUIPMENT_SLOTS.map(s=>`<option value="${s.key}" ${record.slotKey===s.key?'selected':''}>${s.name}</option>`).join('')}</select></label><label class="field"><span>장비 이름</span><input data-eq-meta="${index}:name" value="${esc(record.item.name)}" maxlength="100"></label><label class="field"><span>레벨</span><input type="number" min="0" max="10000" step="1" data-eq-meta="${index}:level" value="${record.item.level??''}"></label><label class="field"><span>장비 등급</span><select data-eq-meta="${index}:rarity"><option value="">미확인</option>${['레어','에픽','유니크','레전드리'].map(s=>`<option ${record.item.rarity===s?'selected':''}>${s}</option>`).join('')}</select></label><label class="field"><span>품질</span><select data-eq-meta="${index}:quality"><option value="">미확인</option>${['하급','중급','상급','최상급'].map(s=>`<option ${record.item.quality===s?'selected':''}>${s}</option>`).join('')}</select></label></div>
        ${record.nameConfidence<85?'<p class="equipment-import-warning">장비 이름을 원본과 확인해 주세요. 이름 입력란에서 바로 고칠 수 있어요.</p>':''}
        <details class="equipment-import-effects" ${checkEffects?'open':''}><summary>장착 효과 확인 · 수정 (${record.item.effects.length}개)</summary><p class="inline-note">한 줄에 항목명과 값을 적으세요. 같은 항목이 두 번 나와도 각각 보존합니다. ${checkEffects?'인식이 불확실한 항목은 원본과 확인해 수정하세요.':''}</p><textarea data-eq-effects="${index}" aria-label="사진 ${index+1} 장착 효과">${esc(record.item.effects.map(e=>`${e.label} ${e.value===null?'숫자 확인':e.value}${e.unit}`).join('\n'))}</textarea></details>
        ${lineFields(record,index,'potential')}${lineFields(record,index,'additional')}
        <details><summary>원본 패널 크게 확인</summary><div class="equipment-source-panels">${(photo.preview??[]).map((src,n)=>`<figure><figcaption>${n?'잠재 옵션 원본':'장비 정보 원본'}</figcaption><img class="equipment-panel-preview" loading="lazy" src="${src}" alt="사진 ${index+1} ${n?'잠재 옵션':'장비 정보'} 원본 패널"></figure>`).join('')}</div><a href="${photo.url}" target="_blank" rel="noopener">전체 원본 사진 열기 ↗</a></details>
      </details>`;
    }).join('');update();
  }
  function selected(){return state.photos.filter(p=>p.selected&&p.record).map(p=>p.record);}
  function update(){
    const count=selected().length;let error='';
    if(state.photos.some(p=>p.selected&&p.effectsError))error='장착 효과의 항목과 수치를 확인하세요.';
    if(count)try{registerEquipment(state.profile,selected());}catch(e){error=e.message;}
    $('#equipment-import-selection').textContent=error||`${count}개 장비 선택 · 확인한 값만 등록합니다`;
    $('#equipment-import-apply').disabled=state.busy||!count||!!error;
    $('#equipment-import-apply').textContent=count?`${count}개 장비 등록`:'장비 등록';
    $('#equipment-import-results').disabled=state.busy;
  }
  async function start(files) {
    release();const run=token;controller=new AbortController();state={profile:structuredClone(getProfile()),selectedSlot:getSelectedSlot(),photos:[],busy:true};message('');
    $('#equipment-import-progress').hidden=false;$('#equipment-import-progress').textContent='사진을 준비하고 있어요.';
    dialog.querySelector('[data-eq-retry]').disabled=true;if(!dialog.open)dialog.showModal();update();
    try {
      checkEquipmentFiles(files);state.photos=files.map(file=>({url:URL.createObjectURL(file),record:null,selected:false,error:null}));draw();
      await readEquipmentScreenshots(files,{signal:controller.signal,onProgress:p=>{if(run===token)$('#equipment-import-progress').textContent=`사진 ${p.index+1}/${p.total} · ${p.stage}`;},onPhoto:p=>{
        if(run!==token)return;const photo=state.photos[p.index];photo.record=p.record;photo.error=p.error;photo.preview=p.preview;
        if(files.length===1&&photo.record?.slotKey==='ring1'&&state.selectedSlot==='ring2')photo.record.slotKey='ring2';
        photo.selected=!!p.record?.slotKey&&!!p.record?.item.name;
        draw();
      }});
    }catch(e){if(run===token&&!controller.signal.aborted)message(e.message||'장비 사진을 읽지 못했어요.');}
    finally{if(run===token){state.busy=false;$('#equipment-import-progress').hidden=true;dialog.querySelector('[data-eq-retry]').disabled=false;draw();}}
  }
  document.addEventListener('click',e=>{if(e.target.closest('[data-import-equipment]'))picker.click();});
  picker.addEventListener('change',()=>{const files=[...picker.files];picker.value='';if(files.length)void start(files);});
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('close',()=>{if(state)release();});
  dialog.addEventListener('click',e=>{
    if(e.target.closest('[data-eq-close]')){close();return;}
    if(e.target.closest('[data-eq-retry]')){picker.click();return;}
    if(e.target.closest('#equipment-import-apply'))try{const profile=registerEquipment(state.profile,selected());onApply({profileId:state.profile.id,profile,count:selected().length});close();}catch(error){message(error.message);}
  });
  function edit(e){
    if(!state||state.busy)return;const t=e.target;
    try {
      if(t.dataset.eqSelect!==undefined)state.photos[Number(t.dataset.eqSelect)].selected=t.checked;
      else if(t.dataset.eqMeta){const [i,key]=t.dataset.eqMeta.split(':'),record=state.photos[Number(i)].record;if(key==='slotKey')record.slotKey=t.value;else record.item[key]=key==='level'?(t.value===''?null:Number(t.value)):t.value;}
      else if(t.dataset.eqLayer){const [i,key]=t.dataset.eqLayer.split(':'),record=state.photos[Number(i)].record;record[key]=t.checked?Array.from({length:3},(_,n)=>({type:dialog.querySelector(`[data-eq-line="${i}:${key}:${n}:type"]`).value,value:parseStatNumber(dialog.querySelector(`[data-eq-line="${i}:${key}:${n}:value"]`).value)})):null;}
      else if(t.dataset.eqGrade){const [i,key]=t.dataset.eqGrade.split(':');state.photos[Number(i)].record[key+'Grade']=t.value;}
      else if(t.dataset.eqLine){const [i,key,n,field]=t.dataset.eqLine.split(':'),record=state.photos[Number(i)].record;if(!record[key])return;record[key][Number(n)]??={type:'unread',value:0};record[key][Number(n)][field]=field==='value'?parseStatNumber(t.value):t.value;}
      else if(t.dataset.eqEffects!==undefined){const photo=state.photos[Number(t.dataset.eqEffects)],record=photo.record;const effects=t.value.split('\n').filter(s=>s.trim()).map(equipmentLine);photo.effectsError=effects.some(e=>!e);if(photo.effectsError)throw Error('장착 효과는 「공격력 100」처럼 항목과 수치를 입력하세요.');record.item.effects=effects.map(e=>({label:e.label,value:e.value,unit:e.unit}));}
      else return;
      message('');update();
    }catch(error){message(error.message);$('#equipment-import-apply').disabled=true;}
  }
  dialog.addEventListener('input',edit);dialog.addEventListener('change',edit);
}
