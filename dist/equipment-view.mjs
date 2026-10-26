import {EQUIPMENT_SLOTS,findEquipmentIndex,slotKey,itemEffectGroups} from './equipment-data.mjs';
import {STARFORCE_RATES,starforceEstimate} from './equipment-starforce.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>value.toLocaleString('ko-KR',{maximumFractionDigits:3});
export function starforceRows(item,target) {
  return `<div class="table-scroll"><table><thead><tr><th>항목</th><th>현재</th><th>역산 기본값 ≈</th><th>${target}성 추정 ≈</th></tr></thead><tbody>${item.effects.map(effect=>{
    const estimate=starforceEstimate(item,effect,target),format=value=>value===undefined?'—':number(value)+effect.unit;
    return `<tr><td>${esc(effect.label)}<br><small>${effect.source==='base'?'주 옵션':effect.source==='random'?'부 옵션':'분류 확인'}</small></td><td>${format(effect.value)}</td><td>${format(estimate.base)}</td><td>${estimate.predicted===undefined?esc(estimate.reason):format(estimate.predicted)}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function starforcePanel(item) {
  const target=Number.isInteger(item.stars)?item.stars:8;
  return `<details class="equipment-starforce" data-starforce-preview><summary>별 강화 수치 미리보기</summary><p class="inline-note">사용자 제공 관측표로 주·부 옵션을 각각 계산합니다. 1.05는 +105% (총 2.05배)로 해석합니다.</p><label class="field"><span>비교할 별 강화</span><select data-star-target aria-label="비교할 별 강화">${Array.from({length:31},(_,i)=>`<option value="${i}" ${i===target?'selected':''}>${i}성${STARFORCE_RATES[i]?'':' · 증폭 미확인'}</option>`).join('')}</select></label><div data-starforce-values>${starforceRows(item,target)}</div><p class="inline-note">현재 표시값 ÷ (1 + 현재 증폭) × (1 + 목표 증폭). 역산한 기본값과 목표 수치는 반올림 전 추정치이며, 스킬 레벨의 게임 내 정수 처리도 미확인입니다. 빈 단계는 보간하지 않으며 내 스펙과 등록 수치는 바꾸지 않습니다.</p><details><summary>사용 중인 증폭표 · 사용자 제공</summary><div class="table-scroll"><table><thead><tr><th>별</th><th>주 옵션 증가</th><th>부 옵션 증가</th></tr></thead><tbody>${Object.entries(STARFORCE_RATES).map(([stars,rates])=>`<tr><td>${stars}성</td><td>${rates.main===null?'미확인':'+'+number(rates.main*100)+'%'}</td><td>${rates.sub===null?'미확인':'+'+number(rates.sub*100)+'%'}</td></tr>`).join('')}</tbody></table></div></details></details>`;
}
export function equipmentBoard(p,selectedIndex,selectedLayer,canUndo=false) {
  return `<section class="panel equipment-board-panel"><div class="section-heading"><div><h2>내 장비</h2><p>게임과 같은 위치에서 부위를 선택하세요.</p></div><button type="button" class="primary" id="import-equipment" data-import-equipment>장비 사진 등록</button></div>
    <div class="equipment-board" aria-label="인게임 배치의 장비 슬롯">
    <div class="equipment-character"><svg viewBox="0 0 100 155" aria-hidden="true"><path d="M25 48Q19 8 50 8T75 48" fill="#49685c"/><circle cx="50" cy="48" r="25" fill="#f0dabb"/><path d="M30 42h40M41 50v4m18-4v4" stroke="#385648" stroke-width="3"/><path d="M35 73Q50 85 65 73l13 54H22z" fill="#376757"/><path d="M35 127v18m30-18v18" stroke="#40594f" stroke-width="12"/></svg><b>${esc(p.name)}</b><small>선택한 장비를 비교해요</small></div>
    ${EQUIPMENT_SLOTS.map(s=>{
      const index=findEquipmentIndex(p,s.key),item=index<0?null:p.equipment[index],registered=!!item?.item;
      return `<button type="button" class="equipment-slot ${index===selectedIndex&&selectedLayer!=='ability'?'selected':''} ${registered?'registered':''}" data-equipment-key="${s.key}" style="grid-row:${s.row};grid-column:${s.col}" aria-label="${s.name}${registered?' · '+esc(item.item.name):''}" aria-pressed="${index===selectedIndex&&selectedLayer!=='ability'}"><span class="slot-symbol" aria-hidden="true">${s.symbol}</span><b>${s.name}</b><small>${registered?esc(item.item.name):'사진 / 직접 입력'}</small>${registered?`<em>${item.item.level!==null?'Lv.'+item.item.level:''}${Number.isInteger(item.item.stars)?' · ★'+item.item.stars:''}</em>`:''}</button>`;
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
  return `<section class="equipped-item"><span class="tag">${esc(item.rarity)} · ${esc(item.quality)}</span><h3>${esc(item.name)}</h3><small>${item.level!==null?'Lv. '+item.level:''} · ${Number.isInteger(item.stars)?'★ '+item.stars+'성':'별 강화 미확인'}</small>${groups}<p class="inline-note">장비 수치는 사진에 표시된 강화 후 합계입니다. 별 강화 증가량을 다시 더하지 않습니다.${hasSkillLevel?' 스킬 레벨 부 옵션은 기록하며 스킬 피해로 자동 환산하지 않습니다.':''}</p>${starforcePanel(item)}${item.effects.some(effect=>!effect.source||effect.source==='unclassified')?'<p class="inline-note">기존 기록 또는 경계가 불확실한 항목입니다. 사진을 다시 등록하면 주·부 옵션을 구분할 수 있어요.</p>':''}<button type="button" data-import-equipment class="small">사진 다시 등록</button></section>`;
}
