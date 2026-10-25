import {JOBS,SHARED,SOURCES,CATALOG_DATE,COVERAGE} from './catalog.mjs';
import {EFFECTS,damage} from './engine.mjs';
import {jobOf,entriesFor,selection,eligibility,isLearned,rankFor,resolveLoadout} from './buff-engine.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number(v).toLocaleString('ko-KR',{maximumFractionDigits:3});
const names={passive:'패시브',buff:'버프',attack:'공격 스킬',mastery:'마스터리',info:'정보'};
const categories={job:'직업 스킬',guild:'길드',cash:'캐시 상품',consumable:'소모품',collection:'보유·수집',growth:'성장·기타',custom:'직접 등록'};
export const buffFilters={category:'job',kind:'skills',query:''};
export function jobSelect(p,id='job') {
  const job=jobOf(p);
  return `<label class="field"><span>직업</span><select id="${id}"><option value="unknown" ${!job?'selected':''}>직업을 선택하세요${!job&&!['unknown','직접 입력'].includes(p.job)?` · 기존 기록: ${esc(p.job)}`:''}</option>${['전사','마법사','궁수','도적','해적'].map(group=>`<optgroup label="${group}">${JOBS.filter(j=>j.group===group).map(j=>`<option value="${j.id}" ${job?.id===j.id?'selected':''}>${esc(j.name)} / ${esc(j.enName??j.name)}</option>`).join('')}</optgroup>`).join('')}</select></label>`;
}
export function buffSummary(p) {
  const r=resolveLoadout(p);
  return `<a href="#buffs" data-goto="buffs" class="loadout-link"><span>◉ ${p.region==='global'?'Global / US':'한국'} · ${esc(p.platform.toUpperCase())} ${esc(p.clientVersion||'버전 미입력')}</span><b>${r.pending?'입력 스탯의 버프 기준을 설정하세요':r.error?'변경 효과의 수치 확인 필요':`${r.active.length}개 적용 · 기준 대비 ${r.changes.length}개 변경`}</b><span>설정 열기 ↗</span></a>`;
}
function sourceLinks(e) {
  return (e.sourceIds??[]).map(id=>SOURCES[id]).filter(Boolean).map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)} ↗</a>`).join(' · ');
}
function statusLabel(e,s,r) {
  if(s.manual!==null)return '<span class="tag">직접 입력 수치</span>';
  if(e.kind==='mastery')return '<span class="tag gray">연구 정보 · 효과 자동 합성 전</span>';
  if(e.recordOnly)return '<span class="tag gray">기록용 · 1회 피해 제외</span>';
  if(e.combat===false)return '<span class="tag gray">성장·편의 / 피해 계산 제외</span>';
  if(['attack','mastery'].includes(e.kind))return '<span class="tag gray">설명·조건 조회</span>';
  if(r?.unresolved||e.unresolved||!r&&!e.effects)return '<span class="tag orange">전투 수치 입력 필요</span>';
  return '<span class="tag">수치 반영 가능</span>';
}
function effectText(effects) {
  return effects.map(x=>`${EFFECTS.find(([k])=>k===x.type)?.[1]??x.type} +${num(x.value)}`).join(' · ');
}
function card(p,e) {
  const s=selection(p,e), gate=eligibility(p,e,s),learned=isLearned(p,e,s), r=rankFor(e,s),isCustom=e.category==='custom';
  const max=e.maxRank??1;
  const source=(e.sourceIds??[]).map(id=>SOURCES[id]).find(Boolean);
  const canToggle=!['attack','mastery','info'].includes(e.kind);
  return `<article class="skill-card ${gate.locked?'locked':''}" data-entry-card="${esc(e.id)}">
    <div class="skill-card-head"><div><div class="skill-kicker">${esc(categories[e.category]??'직업 스킬')} ${e.tier?`· ${e.tier}차`:''} · ${names[e.kind]??'효과'}</div>${isCustom?`<label class="field"><span>효과 이름</span><input data-custom-name="${esc(e.id)}" value="${esc(e.name)}" maxlength="100"></label>`:`<h3>${esc(e.name)}</h3>`}</div>${canToggle?`<label class="switch-label"><input type="checkbox" role="switch" data-buff-prop="enabled" data-effect-id="${esc(e.id)}" ${s.enabled&&learned?'checked':''} ${!learned?'disabled':''} aria-label="${esc(e.name)} 적용"><span class="switch-track"></span><span>${s.enabled&&learned?'켜짐':'꺼짐'}</span></label>`:'<span class="skill-symbol">✧</span>'}</div>
    <div class="skill-tags"><span class="tag ${gate.eligible?'gray':'orange'}">${esc(gate.label)}</span>${statusLabel(e,s,r)}${e.regions&&!e.regions.includes(p.region)?'<span class="tag orange">KR 자료 · Global 미확인</span>':''}${source?`<span class="provenance">${source.official?'공식':'보조 자료'}${e.dataDate?` · ${esc(e.dataDate)}`:''}</span>`:''}</div>
    <div class="skill-controls">${e.jobId?`<label class="field"><span>습득 여부</span><select data-buff-prop="learned" data-effect-id="${esc(e.id)}" aria-label="${esc(e.name)} 습득 여부">${e.kind!=='mastery'?`<option value="auto" ${s.learned==='auto'?'selected':''}>레벨·전직 기준 자동</option>`:''}<option value="yes" ${s.learned==='yes'?'selected':''}>배웠음 (직접 확인)</option><option value="no" ${s.learned==='no'?'selected':''}>배우지 않음</option></select></label>`:''}${e.variants?`<label class="field"><span>효과의 적용 조건</span><select data-buff-prop="rank" data-effect-id="${esc(e.id)}" aria-label="${esc(e.name)} 적용 조건">${e.variants.map(([v,n])=>`<option value="${v}" ${s.rank===v?'selected':''}>${esc(n)}</option>`).join('')}</select></label>`:max>1?`<label class="field"><span>실제 스킬 레벨</span><input type="number" min="1" max="${max}" step="1" value="${s.rank}" data-buff-prop="rank" data-effect-id="${esc(e.id)}" aria-label="${esc(e.name)} 스킬 레벨"></label>`:''}</div>
    <p class="skill-description">${esc(r?.description??e.description??'이 단계의 수치 자료를 확보하지 못했습니다. 게임 툴팁을 확인해 직접 입력할 수 있습니다.')}</p>
    ${r?.effects?.length?`<div class="skill-effect-values">${esc(effectText(r.effects))}</div>`:''}
    ${e.condition?`<p class="skill-condition">조건: ${esc(e.condition)}</p>`:''}
    ${r?.cooldown!=null||r?.duration!=null?`<p class="mini">${r.cooldown!=null?`재사용 ${r.cooldown}초`:''} ${r.duration!=null?`· 지속 ${r.duration}초`:''} · 켜짐 상태의 1회 피해 비교</p>`:''}
    ${e.note?`<p class="inline-note">${esc(e.note)}</p>`:''}
    ${canToggle?`<details class="effect-manual" data-details="${esc(e.id)}:manual"><summary>수치 보정 · 직접 수치로 대체</summary><p class="inline-note">게임 수치 또는 같은 조건에서 관측한 변화량을 입력하세요. 직접 입력하면 이 효과의 자동 수치를 전부 대체합니다. 같은 스킬 레벨의 미확인 기준 수치도 함께 보정합니다. 주스탯 %·공격력 %는 내 스펙의 실측 환산이 필요합니다.</p>${(s.manual??[]).map((l,i)=>`<div class="manual-effect-row"><select data-override="${esc(e.id)}|${i}|type" aria-label="${esc(e.name)} 직접 효과 ${i+1} 종류">${EFFECTS.map(([k,n])=>`<option value="${k}" ${l.type===k?'selected':''}>${n}</option>`).join('')}</select><input type="number" min="0" step="any" value="${l.value}" data-override="${esc(e.id)}|${i}|value" aria-label="${esc(e.name)} 직접 효과 ${i+1} 수치"><button class="icon" data-remove-override="${esc(e.id)}|${i}" aria-label="직접 효과 ${i+1} 삭제">×</button></div>`).join('')}<div class="actions space-top"><button class="small" data-add-override="${esc(e.id)}">＋ 수치 추가</button>${s.manual!==null?`<button class="small" data-reset-override="${esc(e.id)}">자동 자료로 복원</button>`:''}</div></details>`:''}
    ${e.jobId?`<details class="effect-manual" data-details="${esc(e.id)}:unlock"><summary>습득 레벨 수정</summary><label class="field space-top"><span>내가 확인한 습득 레벨 (빈칸은 자료 기준)</span><input type="number" min="1" max="10000" step="1" value="${s.unlock??''}" data-buff-prop="unlock" data-effect-id="${esc(e.id)}" aria-label="${esc(e.name)} 습득 레벨 수정"></label><p class="inline-note">자료의 습득 레벨: ${e.unlock??'미확인'}. 수동 설정은 출처 자료를 수정하지 않습니다.</p></details>`:''}
    <div class="skill-source">${sourceLinks(e)||'사용자가 직접 등록한 효과'}${isCustom?`<button class="small danger" data-delete-custom="${esc(e.id)}">삭제</button>`:''}</div>
  </article>`;
}
export function catalogList(p) {
  const job=jobOf(p),f=buffFilters;
  const list=entriesFor(p).filter(e=>(f.category==='job'?!!e.jobId:e.category===f.category)&&(f.kind==='all'||f.kind==='skills'&&e.kind!=='mastery'||e.kind===f.kind)&&(!f.query||`${e.name} ${e.description??''} ${(e.facts??[]).map(f=>f.label).join(' ')} ${(e.ranks??[]).map(r=>r.description).join(' ')}`.toLowerCase().includes(f.query.toLowerCase())));
  if(!list.length)return `<div class="empty">${f.category==='job'&&!job?'직업을 선택하면 해당 직업의 스킬 목록이 나타납니다.':'조건에 맞는 항목이 없습니다.'}</div>`;
  return `<p class="catalog-count">${num(list.length)}개 항목 · 해금 조건을 충족해도 실제 습득·스킬 레벨을 확인하세요.</p><div class="skill-grid">${list.map(e=>card(p,e)).join('')}</div>`;
}
export function scenarioPanel(p) {
  const r=resolveLoadout(p),before=damage(p.stats).expected;
  let after=r.stats?damage(r.stats).expected:null;
  return `<section class="panel buff-result"><div class="section-heading"><h2>버프 적용 결과</h2><span class="tag ${r.pending?'orange':''}">${r.pending?'기준 미설정':'기준 저장됨'}</span></div><div class="factor-row"><span>입력 스탯의 1회 피해</span><b>${num(before)}</b></div>${r.error?`<div class="error space-top">${esc(r.error)}</div>`:`<div class="buff-total"><small>${r.pending?'현재는 입력 스탯만 계산합니다':'현재 선택의 평균 1회 피해'}</small><strong>${num(after)}</strong><b>${r.pending?'기준을 저장하면 토글 비교가 시작됩니다':before>0?`${after>=before?'+':''}${num((after/before-1)*100)}%`:'기준 피해가 0이면 증가율을 비교할 수 없습니다'}</b></div>`}<p class="inline-note">버프가 켜진 순간의 정적 피해입니다. 지속시간·사용 주기·추가타를 합친 DPM은 계산하지 않습니다.</p><div class="factor-row"><span>활성 효과</span><b>${r.active.length}개</b></div><div class="factor-row"><span>기준에서 달라진 효과</span><b>${r.changes.length}개</b></div>${r.changes.length?`<div class="scenario-changes">${r.changes.map(c=>`<div><span>${esc(c.name)}</span><b>${c.before&&c.after?'수치 변경':c.after?'켜짐':'꺼짐'}</b></div>`).join('')}</div>`:''}<div class="tip"><b>스탯을 찍었을 때의 버프를 먼저 선택하세요.</b><br>아래 버튼은 현재 선택이 이미 입력 스탯에 포함되어 있다고 기록합니다. 이후 토글을 바꾸면 기준 효과를 빼고 새 효과를 적용합니다.</div><button class="primary wide space-top" id="capture-buff-reference">현재 선택을 입력 스탯의 기준으로 저장</button>${!r.pending&&!r.error?'<button class="small wide space-top" id="rebase-buffs">현재 계산 결과를 새 스탯 기준으로 저장</button>':''}<details class="details"><summary>입력 스탯에 목록의 효과가 전혀 없을 때</summary><p class="inline-note">아래 선택은 이 목록의 모든 효과가 제외된 스탯을 입력했을 때만 사용합니다. 이미 포함된 패시브를 다시 더하면 중복 적용됩니다.</p><button class="small space-top" id="empty-buff-reference">모든 효과가 제외된 스탯으로 계산</button></details>${p.loadout.referenceAt?`<p class="mini space-top">기준 저장: ${esc(new Date(p.loadout.referenceAt).toLocaleString('ko-KR'))}</p>`:''}</section>`;
}
export function buffsView(p,profileBar) {
  const job=jobOf(p), count=job?.skills.length??0;
  return `${profileBar}${regionControls(p)}<section class="panel"><div class="section-heading"><div><h2>내 직업과 스킬</h2><p>${job?`${esc(job.name)} · ${esc(job.group)} · 주스탯 ${esc(job.main)} · ${count}개 스킬/마스터리`:'직업을 선택하고 실제 완료한 전직을 알려주세요.'}</p></div><span class="tag gray">자료 확인 ${CATALOG_DATE}</span></div><div class="form-grid">${jobSelect(p,'buff-job')}<label class="field"><span>캐릭터 레벨</span><input type="number" min="1" max="10000" step="1" value="${p.level}" data-meta="level" aria-label="캐릭터 레벨"></label><label class="field"><span>실제로 완료한 전직</span><select id="advancement">${[[0,'선택 안 함 · 개별 습득 확인'],[1,'1차 전직 완료'],[2,'2차 전직 완료'],[3,'3차 전직 완료'],[4,'4차 전직 완료']].map(([v,n])=>`<option value="${v}" ${p.loadout.advancement===v?'selected':''}>${n}</option>`).join('')}</select></label></div>${encounterSelect(p)}<div class="actions space-top"><button class="small" id="auto-learn">레벨·전직에 맞춰 습득 설정</button><span class="inline-note">레벨은 해금 판정에 사용합니다. 레벨 상승 자체의 스탯은 직접 입력하세요.</span></div></section>
  <div class="buff-layout"><div><div class="catalog-tabs" role="group" aria-label="효과 분류">${Object.entries(categories).map(([id,n])=>`<button data-buff-category="${id}" class="${buffFilters.category===id?'selected':''}">${n}${id==='job'?` <small>${count}</small>`:''}</button>`).join('')}</div><section class="panel catalog-controls"><label class="field"><span>스킬·효과 검색</span><input id="effect-search" type="search" value="${esc(buffFilters.query)}" placeholder="스킬명 또는 효과 검색"></label><label class="field"><span>종류</span><select id="effect-kind"><option value="skills" ${buffFilters.kind==='skills'?'selected':''}>기본 스킬 (마스터리 제외)</option><option value="all" ${buffFilters.kind==='all'?'selected':''}>모든 종류</option>${Object.entries(names).map(([v,n])=>`<option value="${v}" ${buffFilters.kind===v?'selected':''}>${n}</option>`).join('')}</select></label><button class="small" id="add-custom-buff">＋ 직접 효과 추가</button></section><div id="buff-catalog">${catalogList(p)}</div><details class="panel coverage-panel"><summary>조사 범위 · 출처 · 미확보 자료</summary><p class="inline-note">공식 자료를 우선 반영했습니다. 직업 상세 표는 클라이언트 1.15.0의 보조 자료입니다. Global PC 1.17.0 전체 스킬을 감사한 최신 표는 아니며, 게임 툴팁으로 확인하거나 직접 수치를 보정하세요. 전체 게임 데이터를 자동으로 동기화하지 않습니다.</p><div class="table-scroll space-top"><table><thead><tr><th>종류</th><th>자료 상태</th></tr></thead><tbody>${COVERAGE.map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.status)}</td></tr>`).join('')}</tbody></table></div>${Object.values(SOURCES).map(s=>`<div class="source"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)} ↗</a>${s.official?'넥슨 공식':'보조 자료'} · ${esc(s.date??'기준일 미표기')}${s.note?' · '+esc(s.note):''}</div>`).join('')}</details></div><aside id="buff-scenario">${scenarioPanel(p)}</aside></div>`;
}

function regionControls(p) {
  return `<section class="panel region-panel"><div class="section-heading"><div><h2>내 게임 버전</h2><p>앱 버전과 스킬 참고표 버전을 구분해 기록합니다.</p></div><span class="tag orange">스킬 표 1.15.0 참고</span></div><div class="form-grid"><label class="field"><span>서비스 지역</span><select id="game-region"><option value="global" ${p.region==='global'?'selected':''}>Global / US · MapleStory: Idle RPG</option><option value="kr" ${p.region==='kr'?'selected':''}>한국 · 메이플 키우기</option></select></label><label class="field"><span>플랫폼</span><select id="game-platform">${[['pc','PC'],['ios','iOS'],['android','Android'],['unknown','미확인']].map(([id,name])=>`<option value="${id}" ${p.platform===id?'selected':''}>${name}</option>`).join('')}</select></label><label class="field"><span>시작 화면에 표시된 버전</span><input id="game-client-version" value="${esc(p.clientVersion)}" maxlength="30" placeholder="예: 1.17.0"></label></div><p class="inline-note">기본 입력은 Global / PC 1.17.0입니다. 사용하는 환경에 맞게 수정하세요. 미국·한국 iOS 스토어는 동일 앱 ID의 1.17.1을 표시합니다. 주요 업데이트는 같아도 지역별 공지의 조건·상품 문구가 다를 수 있습니다. 현재 확보한 상세 스킬 표는 1.15.0이며, 자동 갱신되지 않습니다.</p><div class="actions space-top"><a href="https://forum.nexon.com/maplestoryidle/board_view?thread=3563772" target="_blank" rel="noopener">Global 10/15 패치 ↗</a><a href="https://maplestoryidle.nexon.com/en/guide" target="_blank" rel="noopener">Global 공식 전투 가이드 ↗</a></div></section>`;
}

export function encounterSelect(p) {
  return `<label class="field encounter-field space-top"><span>버프의 콘텐츠 조건</span><select id="buff-encounter">${[['other','일반 / 기타'],['chapterIdle','챕터 방치 전투'],['chapterChallenge','챕터 도전 / 보스'],['growth','성장 던전'],['zakum','자쿰 레이드'],['horntail','혼테일 레이드'],['pinkbean','핑크빈 레이드']].map(([id,name])=>`<option value="${id}" ${p.encounter===id?'selected':''}>${name}</option>`).join('')}</select><small>기간제·콘텐츠 전용 버프의 적용 여부를 판정합니다. 내 스펙의 피해 보정 방식은 별도로 맞추세요.</small></label>`;
}
