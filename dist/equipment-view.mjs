import {EQUIPMENT_SLOTS,findEquipmentIndex,slotKey,itemEffectGroups} from './equipment-data.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function equipmentBoard(p,selectedIndex,selectedLayer,canUndo=false) {
  return `<section class="panel equipment-board-panel"><div class="section-heading"><div><h2>내 장비</h2><p>게임과 같은 위치에서 부위를 선택하세요.</p></div><button type="button" class="primary" id="import-equipment" data-import-equipment>장비 사진 등록</button></div>
    <div class="equipment-board" aria-label="인게임 배치의 장비 슬롯">
    <div class="equipment-character"><svg viewBox="0 0 100 155" aria-hidden="true"><path d="M25 48Q19 8 50 8T75 48" fill="#49685c"/><circle cx="50" cy="48" r="25" fill="#f0dabb"/><path d="M30 42h40M41 50v4m18-4v4" stroke="#385648" stroke-width="3"/><path d="M35 73Q50 85 65 73l13 54H22z" fill="#376757"/><path d="M35 127v18m30-18v18" stroke="#40594f" stroke-width="12"/></svg><b>${esc(p.name)}</b><small>선택한 장비를 비교해요</small></div>
    ${EQUIPMENT_SLOTS.map(s=>{
      const index=findEquipmentIndex(p,s.key),item=index<0?null:p.equipment[index],registered=!!item?.item;
      return `<button type="button" class="equipment-slot ${index===selectedIndex&&selectedLayer!=='ability'?'selected':''} ${registered?'registered':''}" data-equipment-key="${s.key}" style="grid-row:${s.row};grid-column:${s.col}" aria-label="${s.name}${registered?' · '+esc(item.item.name):''}" aria-pressed="${index===selectedIndex&&selectedLayer!=='ability'}"><span class="slot-symbol" aria-hidden="true">${s.symbol}</span><b>${s.name}</b><small>${registered?esc(item.item.name):'사진 / 직접 입력'}</small>${registered&&item.item.level!==null?`<em>Lv.${item.item.level}</em>`:''}</button>`;
    }).join('')}
    <div class="equipment-reserved" style="grid-row:5;grid-column:2" aria-label="게임의 잠금 슬롯">▧<small>잠금 슬롯</small></div>
    </div><div class="actions equipment-board-actions"><button id="select-ability" class="small">어빌리티 비교</button><button id="add-slot" class="small">＋ 기타 부위</button>${canUndo?'<button id="undo-equipment-import" class="small">장비 등록 되돌리기</button>':''}</div>
    ${p.equipment.map((s,i)=>({s,i})).filter(({s})=>!EQUIPMENT_SLOTS.some(x=>(s.slotKey??slotKey(s.name))===x.key)).map(({s,i})=>`<button class="small" data-slot="${i}">${esc(s.name)}</button>`).join('')}
  </section>`;
}
export function equipmentDetails(slot) {
  const item=slot.item;
  if(!item)return '<div class="equipment-empty"><b>장비 사진으로 현재 옵션을 등록하세요.</b><p>장비 정보와 슬롯 강화 효과가 함께 보이는 화면을 선택하면 잠재 옵션까지 읽습니다.</p><button type="button" data-import-equipment class="primary">이 부위 사진 등록</button></div>';
  const groups=itemEffectGroups(item).filter(group=>group.effects.length).map(({source,label,effects})=>`<section class="equipment-effect-group ${source==='random'?'equipment-random-options':''}"><h4>${label}</h4><div class="equipment-effects">${effects.map(effect=>`<div><span>${esc(effect.label)}</span><b>${Number(effect.value).toLocaleString('ko-KR')}${effect.unit}</b></div>`).join('')}</div></section>`).join('');
  const hasSkillLevel=item.effects.some(effect=>/^skillLevel/.test(effect.type??'')||/차\s*스킬\s*레벨/.test(effect.label));
  return `<section class="equipped-item"><span class="tag">${esc(item.rarity)} · ${esc(item.quality)}</span><h3>${esc(item.name)}</h3><small>${item.level!==null?'Lv. '+item.level:''}</small>${groups}<p class="inline-note">기본 장착 효과와 추가 옵션은 내 스펙의 현재 합계에 이미 포함된 장비 기록입니다.${hasSkillLevel?' 스킬 레벨 추가 옵션은 기록하며 스킬 피해로 자동 환산하지 않습니다.':''}</p>${item.effects.some(effect=>!effect.source||effect.source==='unclassified')?'<p class="inline-note">기존 기록 또는 경계가 불확실한 항목입니다. 사진을 다시 등록하면 기본·추가 옵션을 구분할 수 있어요.</p>':''}<button type="button" data-import-equipment class="small">사진 다시 등록</button></section>`;
}
