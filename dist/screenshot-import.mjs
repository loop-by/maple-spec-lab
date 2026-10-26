import {mergeStatCandidates,reviewedStats} from './screenshot-parser.mjs';
import {checkScreenshotFiles,readScreenshots} from './screenshot-ocr.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>Number(v).toLocaleString('ko-KR',{maximumFractionDigits:6});

export function screenshotEntry(profile,canUndo=false) {
  const imported=profile.screenshotImport;
  return `<section class="screenshot-entry" aria-labelledby="screenshot-entry-title">
    <div><span class="tag">사진으로 간편 입력</span><h2 id="screenshot-entry-title">스탯을 하나씩 옮겨 적지 마세요</h2>
    <p>게임의 상세 스탯 창을 캡처해 가져오세요. 여러 장을 함께 읽고, 확인한 값만 반영해요.</p>
    <small>사진은 이 기기 안에서 처리합니다. 서버에 전송하거나 저장하지 않아요.</small></div>
    <button type="button" class="primary" id="import-screenshots">스탯 사진 가져오기</button>
    ${imported?`<div class="screenshot-last"><span>최근 사진에서 ${Number(imported.count)||0}개 항목 반영 · 나머지는 기존 입력값 유지</span>${canUndo?'<button type="button" class="small" id="undo-screenshot-import">이번 반영 되돌리기</button>':''}</div>`:''}
  </section>`;
}

export function setupScreenshotImport({getProfile,onApply}) {
  const picker=document.createElement('input');
  picker.type='file';picker.accept='image/png,image/jpeg,image/webp';picker.multiple=true;picker.hidden=true;
  picker.id='screenshot-files';
  const dialog=document.createElement('dialog');
  dialog.className='screenshot-dialog';dialog.setAttribute('aria-labelledby','shot-title');
  dialog.innerHTML=`<div class="shot-header"><div><h2 id="shot-title">사진에서 스탯 가져오기</h2><p id="shot-profile"></p></div><button type="button" id="shot-close" aria-label="사진 가져오기 닫기">×</button></div>
    <div class="shot-body"><p class="shot-guide">장비 옵션 창 대신 <b>현재 합계가 표시된 상세 스탯 창</b>을 선택해 주세요. 스크롤하며 찍은 사진도 최대 6장까지 함께 읽을 수 있어요.</p>
    <div id="shot-progress" role="status" aria-live="polite"><p></p><progress max="1" value="0" aria-label="사진 읽기 진행률"></progress></div>
    <div id="shot-message" role="status"></div><div id="shot-photos" class="shot-photos"></div>
    <div class="shot-photo-actions"><button type="button" id="shot-add">사진 추가</button><span>빠진 스탯 사진을 추가해도 수정한 값은 유지해요.</span></div>
    <fieldset id="shot-review" aria-label="사진에서 읽은 스탯"></fieldset></div>
    <div class="shot-footer"><p id="shot-selection" role="status"></p><div class="actions"><button type="button" id="shot-retry">다른 사진 선택</button><button type="button" id="shot-apply" class="primary" disabled>선택한 값 반영</button></div></div>`;
  document.body.append(picker,dialog);
  const $=selector=>dialog.querySelector(selector);
  let state=null,controller=null,run=0,returnFocus=null,pickerMode='replace';

  function release() {
    run++;controller?.abort();controller=null;
    for(const photo of state?.photos??[]) URL.revokeObjectURL(photo.url);
    $('#shot-photos').replaceChildren();$('#shot-review').replaceChildren();
    state=null;
  }
  function close() {release();dialog.close();document.querySelector('#import-screenshots')?.focus();}
  function message(text) {$('#shot-message').textContent=text;}
  function photos() {
    $('#shot-photos').innerHTML=(state?.photos??[]).map((p,i)=>`<details class="shot-photo"><summary><img src="${p.url}" alt="" loading="lazy"><span>사진 ${i+1}<small>${p.error?esc(p.error):p.count===null?'읽기 대기':`${p.count}개 항목 찾음`}</small></span><span>원본 보기</span></summary><img class="shot-original" src="${p.url}" alt="선택한 스탯 사진 ${i+1}"><details><summary>읽어낸 글자 보기</summary><pre>${esc(p.text||'읽어낸 글자가 없습니다.')}</pre></details></details>`).join('');
  }
  function rowHTML(row) {
    const needCheck=row.conflict||row.confidence<85||row.value===null||row.ambiguousCrit||row.unitMissing;
    const reason=row.reviewed?'직접 확인한 값':row.conflict?'사진마다 값이 달라요':row.value===null?'숫자 확인 필요':row.ambiguousCrit?'배율 의미 확인 필요':row.unitMissing?'% 기호를 읽지 못했어요':row.confidence<85?'원본과 확인해 주세요':'읽은 값';
    return `<article class="shot-row ${needCheck?'needs-review':''}" data-shot-row="${row.key}">
      <div class="shot-row-title"><label><input type="checkbox" data-shot-select="${row.key}" ${row.selected?'checked':''}><b>${esc(row.label)}</b></label><span class="tag ${needCheck?'orange':'gray'}">${reason}</span></div>
      <div class="shot-values"><div><span>기존 값</span><strong>${fmt(state.profile.stats[row.key])}${esc(row.unit)}</strong></div><span aria-hidden="true">→</span><label><span>반영할 값 ${esc(row.unit)}</span><input type="text" inputmode="decimal" autocomplete="off" data-shot-value="${row.key}" value="${esc(row.raw)}" aria-label="${esc(row.label)} 반영할 값"></label></div>
      ${row.key==='critDamage'?`<label class="shot-basis">사진의 크리티컬 데미지 표기<select data-shot-basis="${row.key}" aria-label="크리티컬 데미지 표기 방식"><option value="" ${!row.basis?'selected':''}>표기 방식을 선택하세요</option><option value="total" ${row.basis==='total'?'selected':''}>총 배율 (예: 150%)</option><option value="extra" ${row.basis==='extra'?'selected':''}>추가 피해 (예: 50% → 총 150%)</option></select></label>`:''}
      ${row.conflict?`<div class="shot-choices" role="group" aria-label="${esc(row.label)} 사진별 값">${row.readings.map((r,i)=>`<button type="button" data-shot-choice="${row.key}:${i}">사진 ${r.source+1} · ${esc(r.raw||'미인식')}</button>`).join('')}</div>`:''}
      <details class="shot-evidence"><summary>사진의 해당 부분 확인</summary>${row.readings.map(r=>`<div><small>사진 ${r.source+1}</small>${r.crop?`<img src="${r.crop}" alt="${esc(row.label)}를 읽은 사진 부분">`:''}<p>${esc(r.text)}</p></div>`).join('')}</details>
    </article>`;
  }
  function review(previousRows=[]) {
    state.rows=mergeStatCandidates(state.candidates,previousRows);
    const issues=state.rows.filter(r=>!r.selected),ready=state.rows.filter(r=>r.selected);
    $('#shot-review').innerHTML=state.rows.length?`<div class="shot-review-heading"><h3>${state.rows.length}개 스탯을 찾았어요</h3><p>기존 값과 비교한 뒤 반영하세요. 사진에 없는 항목은 현재 프리셋의 값을 유지합니다. 처음 사용 중이면 예제 수치가 남아 있을 수 있어요.</p><p>사진을 새 기준으로 반영하면 이전 버프 비교 기준을 해제합니다. 버프 변경을 비교할 때 촬영 당시 상태를 다시 지정해 주세요.</p></div>
      ${issues.length?`<h3 class="shot-group-title">확인이 필요한 항목 ${issues.length}개</h3>${issues.map(rowHTML).join('')}`:''}
      ${ready.length?`<details class="shot-ready" ${issues.length?'':'open'}><summary>읽힌 항목 ${ready.length}개 · 반영할 값 확인</summary>${ready.map(rowHTML).join('')}</details>`:''}`:
      '<div class="shot-empty"><h3>스탯 항목을 찾지 못했어요</h3><p>항목명과 숫자가 함께 보이는 상세 스탯 창을 크게 캡처해 주세요. 장비 옵션이나 전투 화면은 지원하지 않아요.</p><button type="button" id="shot-manual">직접 입력으로 돌아가기</button></div>';
    updateSelection();
  }
  function updateSelection() {
    if(!state) return;
    const count=state.rows.filter(r=>r.selected).length;
    let error='';
    if(count) {try{reviewedStats(state.profile.stats,state.rows);}catch(e){error=e.message;}}
    $('#shot-selection').textContent=error||`${count}개 선택 · 선택하지 않은 값은 유지`;
    $('#shot-apply').disabled=state.busy||!count||!!error;
    $('#shot-apply').textContent=count?`${count}개 스탯 반영`:'선택한 값 반영';
    $('#shot-add').disabled=state.busy||state.photos.length>=6;
    $('#shot-add').textContent=`사진 추가 (${state.photos.length}/6)`;
    $('#shot-review').disabled=state.busy;
  }
  async function start(files,{append=false}={}) {
    if(append) {
      if(!state||state.busy)return;
      try{checkScreenshotFiles([...state.photos.map(p=>p.file),...files]);}
      catch(error){message(error.message);return;}
      run++;controller?.abort();
    } else release();
    const token=run;
    controller=new AbortController();
    const previousRows=append?state.rows:[];
    if(!append)state={profile:structuredClone(getProfile()),photos:[],candidates:[],rows:[],busy:true};
    state.busy=true;
    const offset=state.photos.length;
    $('#shot-profile').textContent=state.profile.name;
    if(!append){$('#shot-review').replaceChildren();$('#shot-photos').replaceChildren();}
    message('');
    $('#shot-progress').hidden=false;$('#shot-progress p').textContent='사진을 준비하고 있어요. 첫 사용 시 글자 인식 자료를 불러옵니다.';
    $('#shot-progress progress').value=0;$('#shot-retry').disabled=true;updateSelection();
    if(!dialog.open) {returnFocus=document.activeElement;dialog.showModal();}
    try {
      checkScreenshotFiles(files);
      state.photos.push(...files.map(file=>({file,url:URL.createObjectURL(file),count:null,error:null,text:''})));photos();
      await readScreenshots(files,{
        signal:controller.signal,
        onProgress:p=>{
          if(token!==run)return;
          $('#shot-progress p').textContent=`사진 ${offset+p.index+1}/${state.photos.length} · ${p.stage}${p.stage==='준비 중'?' · 처음에는 잠시 걸릴 수 있어요':''}`;
          $('#shot-progress progress').value=(p.index+p.progress)/p.total;
        },
        onPhoto:p=>{
          if(token!==run)return;
          Object.assign(state.photos[offset+p.index],p);
          state.candidates.push(...(p.candidates??[]).map(c=>({...c,source:c.source+offset})));photos();
        },
      });
    } catch(error) {
      if(token!==run||error.name==='AbortError')return;
      message(error.message||'사진을 읽지 못했어요. 다른 사진으로 다시 시도해 주세요.');
    } finally {
      if(token===run) {
        state.busy=false;$('#shot-progress').hidden=true;$('#shot-retry').disabled=false;
        review(previousRows);$('#shot-selection').focus();
      }
    }
  }
  function choose(mode) {pickerMode=mode;picker.click();}
  document.addEventListener('click',e=>{if(e.target.closest('#import-screenshots'))choose('replace');});
  picker.addEventListener('change',()=>{const files=[...picker.files];picker.value='';if(files.length)void start(files,{append:pickerMode==='add'});});
  document.addEventListener('paste',e=>{
    if(dialog.open||!document.querySelector('#import-screenshots'))return;
    const files=[...(e.clipboardData?.files??[])].filter(f=>f.type.startsWith('image/'));
    if(files.length) {e.preventDefault();void start(files);}
  });
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.addEventListener('close',()=>{if(state)release();if(returnFocus?.isConnected)returnFocus.focus();});
  dialog.addEventListener('click',e=>{
    const button=e.target.closest('button');if(!button)return;
    if(['shot-close','shot-manual'].includes(button.id)) {close();return;}
    if(button.id==='shot-retry') {choose('replace');return;}
    if(button.id==='shot-add') {choose('add');return;}
    if(button.dataset.shotChoice) {
      const [key,index]=button.dataset.shotChoice.split(':'),row=state.rows.find(r=>r.key===key),reading=row.readings[Number(index)];
      row.raw=reading.raw;row.basis=reading.ambiguousCrit?'':'total';row.selected=true;row.reviewed=true;
      const article=button.closest('.shot-row');article.querySelector('[data-shot-value]').value=row.raw;
      article.querySelector('[data-shot-select]').checked=true;
      const basis=article.querySelector('[data-shot-basis]');if(basis)basis.value=row.basis;
      updateSelection();return;
    }
    if(button.id==='shot-apply') {
      try {
        const stats=reviewedStats(state.profile.stats,state.rows);
        onApply({profileId:state.profile.id,stats,keys:state.rows.filter(r=>r.selected).map(r=>r.key)});
        close();
      } catch(error) {message(error.message);}
    }
  });
  dialog.addEventListener('input',e=>{
    const key=e.target.dataset.shotValue;if(!key)return;
    const row=state.rows.find(r=>r.key===key);row.raw=e.target.value;row.selected=true;row.reviewed=true;
    e.target.closest('.shot-row').querySelector('[data-shot-select]').checked=true;
    updateSelection();
  });
  dialog.addEventListener('change',e=>{
    const key=e.target.dataset.shotSelect||e.target.dataset.shotBasis;if(!key)return;
    const row=state.rows.find(r=>r.key===key);
    row.reviewed=true;
    if(e.target.dataset.shotSelect)row.selected=e.target.checked;
    else {row.basis=e.target.value;row.selected=true;e.target.closest('.shot-row').querySelector('[data-shot-select]').checked=true;}
    updateSelection();
  });
}
