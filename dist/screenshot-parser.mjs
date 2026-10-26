import {FIELDS, validateStats} from './engine.mjs';

// Match complete labels, longest first. Unknown labels are never guessed.
const labels = {
  attack:['공격력','ATK','Attack','Attack Power'],
  damage:['데미지','대미지','Damage','DMG'],
  amplification:['데미지 증폭','대미지 증폭','Damage Amplification','DMG Amplification'],
  statDamage:['스탯 비례 데미지','스탯 비례 대미지','주스탯 비례 데미지','Stat Damage','Stat-based Damage'],
  boss:['보스 몬스터 데미지','보스 몬스터 대미지','보스 데미지','Boss Monster Damage','Boss DMG','Boss Damage'],
  normal:['일반 몬스터 데미지','일반 몬스터 대미지','Normal Monster Damage','Normal Monster DMG'],
  basic:['기본 공격 데미지','기본 공격 대미지','Basic Attack Damage','Basic Attack DMG'],
  skill:['스킬 데미지','스킬 대미지','Skill Damage','Skill DMG'],
  critChance:['크리티컬 확률','치명타 확률','Critical Rate','Crit Rate','Critical Chance'],
  critDamage:['크리티컬 데미지 배율','크리티컬 데미지','크리티컬 대미지','치명타 피해','Critical Damage','Crit DMG'],
  minDamage:['최소 데미지 배율','최소 데미지','최소 대미지','Min Damage Multiplier','Min DMG Multiplier','Min Damage','Min DMG'],
  maxDamage:['최대 데미지 배율','최대 데미지','최대 대미지','Max Damage Multiplier','Max DMG Multiplier','Max Damage','Max DMG'],
  finalDamage:['최종 데미지','최종 대미지','Final Damage','Final DMG'],
  penetration:['방어 관통력','방어력 관통','방어 관통','Defense Penetration','DEF Penetration'],
  statusDamage:['상태이상 데미지','상태 이상 대미지','Status Effect Damage','Status Effect DMG'],
  mainStat:['주스탯','Main Stat'],
  mainPercent:['주스탯 %','Main Stat %'],
  attackPercent:['공격력 %','ATK %','Attack %'],
  attackSpeed:['공격 속도','공격속도','Attack Speed','ATK Speed'],
  cooldown:['재사용 대기시간 감소','쿨타임 감소','Cooldown Reduction'],
};
const escapeRE = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const aliases = Object.entries(labels).flatMap(([key, names]) => names.map(name => ({
  key, name, re:new RegExp('^' + [...name].map(c => /\s/.test(c) ? '' : escapeRE(c)).join('\\s*'), 'i'),
}))).sort((a,b) => b.name.length - a.name.length);
const fields = new Map(FIELDS.map(f => [f[0], f]));
const units = {조:1e12,억:1e8,만:1e4,천:1e3,k:1e3,m:1e6,b:1e9,t:1e12};

export function parseStatNumber(raw) {
  let text = String(raw).normalize('NFKC').trim().replace(/\s*%\s*$/, '').replace(/^\+\s*/, '');
  // Reject broken grouping, ambiguous whitespace and OCR substitutions such as O→0.
  const number = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?';
  if(new RegExp('^'+number+'$').test(text)) return Number(text.replaceAll(',',''));
  const token = new RegExp('('+number+')\\s*([조억만천kmbt])', 'igy');
  let total=0, offset=0, previous=Infinity, count=0;
  while(offset < text.length) {
    token.lastIndex=offset;
    const match=token.exec(text);
    if(!match) {
      const tail=text.slice(offset).trim();
      if(count && new RegExp('^'+number+'$').test(tail)) {
        const value=Number(tail.replaceAll(',',''));
        return value < previous ? total+value : null;
      }
      return null;
    }
    const unit=units[match[2].toLowerCase()];
    if(unit>=previous) return null;
    total+=Number(match[1].replaceAll(',',''))*unit;
    previous=unit; count++;
    offset=token.lastIndex;
    while(/\s/.test(text[offset]??'') && offset<text.length) offset++;
  }
  return count && Number.isFinite(total) ? total : null;
}

export function parseStatLines(lines, source=0) {
  const found=[];
  for(const row of lines) {
    let rest=String(typeof row==='string' ? row : row.text).normalize('NFKC').trim();
    const original=rest;
    // More than one label/value pair can occupy the same visual row.
    for(let column=0; rest && column<4; column++) {
      rest=rest.replace(/^[\s|:：·•]+/, '');
      const alias=aliases.find(a => {
        const m=rest.match(a.re);
        return m && /^(?:\s*[:：]?\s*[+\d]|\s*$)/.test(rest.slice(m[0].length));
      });
      if(!alias) break;
      const labelMatch=rest.match(alias.re);
      const after=rest.slice(labelMatch[0].length).replace(/^\s*[:：]?\s*/, '');
      // Stop at the next label, retaining the full number for strict validation.
      let boundary=after.length;
      for(let i=1;i<after.length;i++) {
        if(!/\s|\|/.test(after[i-1])) continue;
        if(aliases.some(a => a.re.test(after.slice(i)))) {boundary=i;break;}
      }
      const raw=after.slice(0,boundary).replace(/[\s|]+$/, '');
      const value=parseStatNumber(raw);
      const [,label,unit,min,max]=fields.get(alias.key);
      const ambiguousCrit=alias.key==='critDamage' && !alias.name.includes('배율');
      const percentMismatch=unit!=='%' && /%/.test(raw);
      const unitMissing=unit==='%' && !/%\s*$/.test(raw);
      const valid=value!==null && value>= (ambiguousCrit ? 0 : min) && value<=max && !percentMismatch;
      const rawStart=original.indexOf(raw,original.length-rest.length+labelMatch[0].length);
      let offset=0;
      const valueWords=(row.words??[]).filter(w=>{
        const start=offset;offset+=w.text.length+1;
        return rawStart>=0 && start+w.text.length>rawStart && start<rawStart+raw.length;
      });
      const valueBbox=valueWords.length?{x0:Math.min(...valueWords.map(w=>w.bbox.x0)),y0:Math.min(...valueWords.map(w=>w.bbox.y0)),x1:Math.max(...valueWords.map(w=>w.bbox.x1)),y1:Math.max(...valueWords.map(w=>w.bbox.y1))}:null;
      found.push({key:alias.key,label,unit,raw,value:valid?value:null,source,
        confidence:typeof row==='string'?0:Number(row.confidence)||0,
        bbox:typeof row==='string'?null:row.bbox,valueBbox,matchedLabel:alias.name,unitMissing,text:original,ambiguousCrit,
        reason:valid?'':'숫자 또는 단위를 확인하세요.'});
      rest=after.slice(boundary);
    }
  }
  return found;
}

export function mergeStatCandidates(candidates,previousRows=[]) {
  return FIELDS.flatMap(([key,label,unit]) => {
    const readings=candidates.filter(c=>c.key===key);
    if(!readings.length) return [];
    const distinct=new Set(readings.filter(r=>r.value!==null).map(r=>`${r.value}:${r.ambiguousCrit}`));
    const best=[...readings].sort((a,b)=>Number(b.value!==null)-Number(a.value!==null)||b.confidence-a.confidence)[0];
    const conflict=distinct.size>1;
    const row={key,label,unit,readings,conflict,value:best.value,raw:best.raw,
      ambiguousCrit:best.ambiguousCrit,confidence:best.confidence,unitMissing:best.unitMissing,
      selected:!conflict && best.value!==null && best.confidence>=85 && !best.ambiguousCrit && !best.unitMissing,
      basis:best.ambiguousCrit?'':'total'};
    const previous=previousRows.find(r=>r.key===key);
    if(previous?.reviewed) {
      row.raw=previous.raw;row.basis=previous.basis;row.selected=previous.selected;row.reviewed=true;
    }
    return [row];
  });
}

export function reviewedStats(stats, rows) {
  const next={...stats};
  let count=0;
  for(const row of rows) {
    if(!row.selected) continue;
    if(!fields.has(row.key)) throw Error('지원하지 않는 스탯입니다.');
    let value=parseStatNumber(row.raw);
    if(value===null) throw Error(`${fields.get(row.key)[1]} 숫자를 확인하세요.`);
    if(row.key==='critDamage') {
      if(!['total','extra'].includes(row.basis)) throw Error('크리티컬 데미지가 총 배율인지 추가 피해인지 선택하세요.');
      if(row.basis==='extra') value+=100;
    }
    next[row.key]=value; count++;
  }
  if(!count) throw Error('반영할 항목을 하나 이상 선택하세요.');
  validateStats(next);
  return next;
}

// OCR sometimes returns labels and right-aligned values in separate blocks.
// Reassemble words on the same baseline before matching label/value pairs.
export function visualStatLines(data) {
  const words=(data.blocks??[]).flatMap(b=>(b.paragraphs??[]).flatMap(p=>(p.lines??[]).flatMap(l=>l.words??[])))
    .filter(w=>w.text?.trim() && w.bbox).sort((a,b)=>a.bbox.y0-b.bbox.y0);
  if(!words.length) return (data.text??'').split(/\r?\n/).map(text=>({text,confidence:data.confidence??0}));
  const rows=[];
  for(const word of words) {
    const box=word.bbox, center=(box.y0+box.y1)/2, height=box.y1-box.y0;
    let row=rows.find(r=>Math.abs(r.center-center)<=Math.min(r.height,height)*0.45);
    if(!row) {row={center,height,words:[]};rows.push(row);}
    row.words.push(word);
  }
  return rows.sort((a,b)=>a.center-b.center).map(row=>{
    const ws=row.words.sort((a,b)=>a.bbox.x0-b.bbox.x0);
    return {text:ws.map(w=>w.text).join(' '),words:ws,confidence:Math.min(...ws.map(w=>w.confidence??0)),
      bbox:{x0:Math.min(...ws.map(w=>w.bbox.x0)),y0:Math.min(...ws.map(w=>w.bbox.y0)),
        x1:Math.max(...ws.map(w=>w.bbox.x1)),y1:Math.max(...ws.map(w=>w.bbox.y1))}};
  });
}
