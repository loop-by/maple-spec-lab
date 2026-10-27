import {EQUIPMENT_SLOTS,findEquipmentIndex,slotKey,itemEffectGroups} from './equipment-data.mjs?v=0.3.1';
import {STARFORCE_RATES,starforceEstimate} from './equipment-starforce.mjs?v=0.3.1';
import {equippedEntry} from './inventory-data.mjs?v=0.3.1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>value.toLocaleString('ko-KR',{maximumFractionDigits:3});
export function starforceRows(profile,slot,target) {
  const item=equippedEntry(profile,slot)?.item;
  if(!item)return '<p class="inline-note">착용 장비를 연결하면 이 슬롯의 별 단계별 장비 수치를 미리 볼 수 있습니다.</p>';
  return `<div class="table-scroll"><table><thead><tr><th>항목</th><th>등록 원본</th><th>역산 기본값 ≈</th><th>슬롯 ${target}성 추정 ≈</th></tr></thead><tbody>${item.effects.map(effect=>{
    const estimate=starforceEstimate(item,effect,target),format=value=>value===undefined?'—':number(value)+effect.unit;
    return `<tr><td>${esc(effect.label)}</td><td>${format(effect.value)}</td><td>${format(estimate.base)}</td><td>${estimate.predicted===undefined?esc(estimate.reason):format(estimate.predicted)}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}
export function slotUpgradesView(profile,slot) {
  const target=Number.isInteger(slot.stars)?slot.stars:8;
  return `<section class="slot-upgrades"><h3>슬롯 별 · 주문서</h3><p class="inline-note">별과 주문서는 장비를 바꿔도 이 슬롯에 남습니다.</p><div class="form-grid"><label class="field"><span>이 슬롯의 별 강화 (성)</span><input type="number" min="0" max="30" step="1" value="${slot.stars??''}" data-slot-upgrade="stars" aria-label="슬롯 별 강화"></label></div>${slot.needsStatsReview?'<div class="tip warning">별 단계가 바뀌었습니다. 게임의 현재 스펙을 반영한 후 아래에서 기준을 확인하세요. <a href="#spec" data-goto="spec">내 스펙 열기 ↗</a></div><button class="small" data-confirm-slot-stats>현재 합계를 이 슬롯 강화 기준으로 확인</button>':''}<details class="details" data-details="slot-scrolls"><summary>주문서 · 공격력 / 데미지 증폭 (선택 기록)</summary><p class="inline-note">주문서는 현재 스펙 합계에 포함된 슬롯 효과로 유지합니다. 세부 수치를 몰라도 장비 비교에 다시 더하지 않습니다. 아래 값은 선택 기록이며 현재 합계를 변경하지 않습니다.</p><div class="form-grid two"><label class="field"><span>주문서 공격력 증가량</span><input type="number" min="0" step="any" value="${slot.scrolls.attack??''}" data-slot-upgrade="attack"></label><label class="field"><span>주문서 데미지 증폭 (%)</span><input type="number" min="0" step="any" value="${slot.scrolls.amplification??''}" data-slot-upgrade="amplification"></label></div></details><details class="equipment-starforce" data-details="slot-star-preview"><summary>슬롯 별 단계별 장비 수치 미리보기</summary><p class="inline-note">사용자 제공 관측표로 주·부 옵션을 각각 계산합니다. 1.05는 +105% (총 2.05배)이며, 알려지지 않은 단계와 반올림 규칙은 추측하지 않습니다.</p><label class="field"><span>미리 볼 슬롯 별</span><select data-slot-star-target>${Array.from({length:31},(_,i)=>`<option value="${i}" ${i===target?'selected':''}>${i}성${STARFORCE_RATES[i]?'':' · 증폭 미확인'}</option>`).join('')}</select></label><div data-starforce-values>${starforceRows(profile,slot,target)}</div><p class="inline-note">미리보기는 장비 원본·슬롯 설정·현재 합계를 바꾸지 않습니다. 주문서 효과는 별도로 유지합니다.</p></details></section>`;
}
export function equipmentBoard(p,selectedIndex,selectedLayer,canUndo=false,{kind='inventory',contributions={}}={}) {
  const potentials=kind==='slots';
  return `<section class="panel equipment-board-panel"><div class="section-heading"><div><h2>${potentials?'슬롯 강화 · 잠재 기여도':'착용 장비'}</h2><p>${potentials?'슬롯 옵션을 제외했을 때 줄어드는 피해 비율':'부위를 선택해 보유 장비를 비교하세요.'}</p></div><button type="button" class="primary" id="import-equipment" data-import-equipment="${potentials?'slots':'inventory'}">${potentials?'슬롯 사진 등록':'장비 사진 등록'}</button></div>
    <div class="equipment-board" aria-label="인게임 배치의 장비 슬롯">
    <div class="equipment-character"><svg viewBox="0 0 100 155" aria-hidden="true"><path d="M25 48Q19 8 50 8T75 48" fill="#49685c"/><circle cx="50" cy="48" r="25" fill="#f0dabb"/><path d="M30 42h40M41 50v4m18-4v4" stroke="#385648" stroke-width="3"/><path d="M35 73Q50 85 65 73l13 54H22z" fill="#376757"/><path d="M35 127v18m30-18v18" stroke="#40594f" stroke-width="12"/></svg><b>${esc(p.name)}</b><small>선택한 장비를 비교해요</small></div>
    ${EQUIPMENT_SLOTS.map(s=>{
      const index=findEquipmentIndex(p,s.key),slot=index<0?null:p.equipment[index],item=equippedEntry(p,slot)?.item,registered=!!item;
      const result=contributions[s.key],share=result?.share;
      return `<button type="button" class="equipment-slot ${index===selectedIndex&&selectedLayer!=='ability'?'selected':''} ${registered?'registered':''}" data-equipment-key="${s.key}" style="grid-row:${s.row};grid-column:${s.col}" aria-label="${s.name}${!potentials&&registered?' · '+esc(item.name):''}" aria-pressed="${index===selectedIndex&&selectedLayer!=='ability'}">${result?`<span class="slot-impact ${result.error?'pending':''}" title="${esc(result.error??'현재 피해에서 차지하는 비율')}">${Number.isFinite(share)?number(share)+'%':result.empty?'미등록':'환산 필요'}</span>`:''}${!potentials&&item?.icon?`<img class="slot-item-icon" src="${item.icon}" alt="">`:`<span class="slot-symbol" aria-hidden="true">${s.symbol}</span>`}<b>${s.name}</b><small>${potentials?'별 · 주문서 · 잠재':registered?esc(item.name):'착용 장비 미등록'}</small><em>${!potentials&&registered&&item.level!==null?'Lv.'+item.level+' · ':''}${Number.isInteger(slot?.stars)?'슬롯 ★'+slot.stars:'별 미확인'}</em></button>`;
    }).join('')}
    <div class="equipment-reserved" style="grid-row:5;grid-column:2" aria-label="게임의 잠금 슬롯">▧<small>잠금 슬롯</small></div>
    </div><div class="actions equipment-board-actions">${potentials?'<button id="select-ability" class="small">어빌리티 비교</button><button id="add-slot" class="small">＋ 기타 슬롯</button>':''}${canUndo?'<button id="undo-equipment-import" class="small">이번 등록 되돌리기</button>':''}</div>
    ${p.equipment.map((s,i)=>({s,i})).filter(({s})=>!EQUIPMENT_SLOTS.some(x=>(s.slotKey??slotKey(s.name))===x.key)).map(({s,i})=>`<button class="small" data-slot="${i}">${esc(s.name)}</button>`).join('')}
  </section>`;
}
export function equipmentDetails(slot) {
  const item=slot.item;
  if(!item)return '<div class="equipment-empty"><b>장비 사진으로 현재 옵션을 등록하세요.</b><p>장비 정보와 슬롯 강화 효과가 함께 보이는 화면을 선택하면 잠재 옵션까지 읽습니다.</p><button type="button" data-import-equipment class="primary">이 부위 사진 등록</button></div>';
  const groups=itemEffectGroups(item).filter(group=>group.effects.length).map(({source,label,effects})=>`<section class="equipment-effect-group ${source==='random'?'equipment-random-options':''}"><h4>${label}</h4><div class="equipment-effects">${effects.map(effect=>`<div><span>${esc(effect.label)}</span><b>${Number(effect.value).toLocaleString('ko-KR')}${effect.unit}</b></div>`).join('')}</div></section>`).join('');
  const hasSkillLevel=item.effects.some(effect=>/^skillLevel/.test(effect.type??'')||/차\s*스킬\s*레벨/.test(effect.label));
  return `<section class="equipped-item"><span class="tag">${esc(item.rarity)} · ${esc(item.quality)}</span><h3>${esc(item.name)}</h3><small>${item.level!==null?'Lv. '+item.level:''}</small>${groups}<p class="inline-note">${item.observation?.basis==='base'?'슬롯 적용 전 기본 수치로 등록했습니다.':'사진의 슬롯 강화 적용 후 수치를 보존합니다.'} 비교 시 같은 슬롯 별 단계로 맞추고, 주문서는 현재 합계에 포함된 공통 효과로 유지합니다.${hasSkillLevel?' 스킬 레벨 부 옵션은 기록하며 스킬 피해로 자동 환산하지 않습니다.':''}</p><details><summary>등록 수치의 촬영 기준</summary><p class="inline-note">${item.observation?.basis==='base'?'슬롯 강화 전 기본 수치':Number.isInteger(item.observation?.stars)?'촬영 당시 슬롯 '+item.observation.stars+'성 적용 후 수치':'촬영 당시 슬롯 별 미확인'}입니다. 별·주문서는 장비 속성이 아니며, 비교할 때 대상 슬롯의 강화 기준을 유지합니다.</p></details>${item.effects.some(effect=>!effect.source||effect.source==='unclassified')?'<p class="inline-note">기존 기록 또는 경계가 불확실한 항목입니다. 사진을 다시 등록하면 주·부 옵션을 구분할 수 있어요.</p>':''}<button type="button" data-import-equipment class="small">사진 다시 등록</button></section>`;
}
