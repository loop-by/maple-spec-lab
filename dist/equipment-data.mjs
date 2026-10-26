import {EFFECTS} from './engine.mjs';

export const ITEM_EFFECT_GROUPS=[['base','기본 장착 효과'],['random','추가 옵션'],['unclassified','분류 확인 필요']];
const itemEffectTypes=new Set([...EFFECTS.map(([key])=>key),'unread',...Array.from({length:5},(_,i)=>`skillLevel${i+1}`)]);
export function itemEffectGroups(item) {
  return ITEM_EFFECT_GROUPS.map(([source,label])=>({source,label,effects:item.effects.filter(effect=>(effect.source??'unclassified')===source)}));
}

export const EQUIPMENT_SLOTS=[
  {key:'hat',name:'모자',row:1,col:1,symbol:'♧'},
  {key:'cape',name:'망토',row:1,col:4,symbol:'◇'},
  {key:'top',name:'상의',row:2,col:1,symbol:'♜'},
  {key:'shoulder',name:'어깨장식',row:2,col:4,symbol:'◒'},
  {key:'bottom',name:'하의',row:3,col:1,symbol:'Ⅱ'},
  {key:'belt',name:'벨트',row:3,col:4,symbol:'▰'},
  {key:'gloves',name:'장갑',row:4,col:1,symbol:'✋'},
  {key:'shoes',name:'신발',row:4,col:4,symbol:'♟'},
  {key:'eye',name:'눈장식',row:5,col:1,symbol:'◎'},
  {key:'necklace',name:'목걸이',row:5,col:4,symbol:'♧'},
  {key:'ring1',name:'반지 1',row:6,col:1,symbol:'◯'},
  {key:'ring2',name:'반지 2',row:6,col:2,symbol:'◯'},
  {key:'earring',name:'귀고리',row:6,col:3,symbol:'♢'},
  {key:'face',name:'얼굴장식',row:6,col:4,symbol:'◡'},
];
export function slotKey(name='') {
  const s=name.replace(/\s/g,'');
  if(s==='반지')return 'ring1';
  return EQUIPMENT_SLOTS.find(x=>x.name.replace(/\s/g,'')===s)?.key??null;
}
export const emptyLayer=()=>({old:Array.from({length:3},()=>({type:'none',value:0})),next:Array.from({length:3},()=>({type:'none',value:0})),p:null,cost:1,grade:'직접 입력'});
export function newEquipment(key) {
  const slot=EQUIPMENT_SLOTS.find(x=>x.key===key);
  if(!slot)throw Error('장비 부위를 선택하세요.');
  return {name:slot.name,slotKey:key,miracle:emptyLayer(),additional:emptyLayer()};
}
export function findEquipmentIndex(profile,key) {
  return profile.equipment.findIndex(s=>(s.slotKey??slotKey(s.name))===key);
}
export function validateEquipmentItem(item) {
  if(!item||typeof item!=='object'||typeof item.name!=='string'||!item.name.trim()||item.name.length>100)throw Error('장비 이름을 확인하세요.');
  for(const key of ['rarity','quality'])if(typeof item[key]!=='string'||item[key].length>30)throw Error('장비 등급을 확인하세요.');
  if(item.level!==null&&(!Number.isInteger(item.level)||item.level<0||item.level>10000))throw Error('장비 레벨을 확인하세요.');
  if(!Array.isArray(item.effects)||item.effects.length>30)throw Error('장착 효과는 최대 30개입니다.');
  for(const effect of item.effects){
    if(!effect||typeof effect.label!=='string'||!effect.label.trim()||effect.label.length>60||!Number.isFinite(effect.value)||effect.value<0||effect.value>1e30||!['','%'].includes(effect.unit))throw Error('장착 효과의 항목·수치를 확인하세요.');
    if(effect.source!==undefined&&!ITEM_EFFECT_GROUPS.some(([source])=>effect.source===source))throw Error('장비 효과의 기본·추가 옵션 구분을 확인하세요.');
    if(effect.type!==undefined&&!itemEffectTypes.has(effect.type))throw Error('장비 효과의 종류를 확인하세요.');
    if(/^skillLevel[1-5]$/.test(effect.type??'')&&(effect.unit!==''||!Number.isInteger(effect.value)))throw Error('스킬 레벨 추가 옵션은 % 없는 정수로 입력하세요.');
  }
  return item;
}
export function validateEquipmentLines(lines) {
  if(!Array.isArray(lines)||lines.length!==3)throw Error('잠재 옵션은 세 줄입니다.');
  for(const line of lines)if(!EFFECTS.some(([k])=>k===line.type)||!Number.isFinite(line.value)||line.value<0||line.value>1e30)throw Error('잠재 옵션 종류와 수치를 확인하세요.');
}
export function registerEquipment(profile,records) {
  const next=structuredClone(profile),seen=new Set();
  for(const record of records) {
    if(!EQUIPMENT_SLOTS.some(s=>s.key===record.slotKey)||seen.has(record.slotKey))throw Error('같은 부위는 한 번에 하나만 등록하세요. 반지는 1·2 슬롯을 확인하세요.');
    seen.add(record.slotKey);validateEquipmentItem(record.item);
    let index=findEquipmentIndex(next,record.slotKey);
    if(index<0){if(next.equipment.length>=30)throw Error('장비는 최대 30개입니다.');next.equipment.push(newEquipment(record.slotKey));index=next.equipment.length-1;}
    const target=next.equipment[index];target.slotKey=record.slotKey;target.item=structuredClone(record.item);
    for(const [source,layer]of [['potential','miracle'],['additional','additional']])if(record[source]!==null){
      validateEquipmentLines(record[source]);target[layer].old=structuredClone(record[source]);target[layer].next=structuredClone(record[source]);
      target[layer].p=null;target[layer].grade=record[source+'Grade']||'사진 등록';
    }
  }
  if(!seen.size)throw Error('등록할 장비를 선택하세요.');
  // Current displayed totals already include equipped items. Registration only
  // captures their sources; it never adds item facts to aggregate stats again.
  return next;
}
