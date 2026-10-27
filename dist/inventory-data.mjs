import {EQUIPMENT_SLOTS,emptyLayer,newEquipment,findEquipmentIndex,slotKey,validateEquipmentItem,validateEquipmentLines} from './equipment-data.mjs?v=0.3.1';
import {equipmentOption} from './equipment-options.mjs?v=0.3.1';
import {equipmentLine} from './equipment-parser.mjs?v=0.3.1';

export const slotFamily=key=>/^ring[12]$/.test(key??'')?'ring':key;
export function normalizeSlotUpgrades(profile) {
  for(const slot of profile.equipment){
    const item=profile.inventory.find(entry=>entry.id===slot.equippedId)?.item;
    if(slot.stars===undefined||slot.stars===null&&Object.hasOwn(item??{},'stars'))slot.stars=item?.stars??item?.observation?.stars??null;
    slot.scrolls??={attack:null,amplification:null};
  }
  for(const entry of profile.inventory){
    entry.item.observation??={basis:'applied',stars:entry.item.stars??null};
    delete entry.item.stars;
  }
}
export function normalizeInventory(profile) {
  if(profile.inventory===undefined)profile.inventory=[];
  if(!Array.isArray(profile.inventory))throw Error('장비 보관함 형식을 확인하세요.');
  const keys=new Set();
  for(const [index,slot] of profile.equipment.entries()){
    const inferred=slotKey(slot.name);
    slot.slotKey??=inferred&&!keys.has(inferred)?inferred:`custom-${index}`;
    if(typeof slot.slotKey!=='string'||!slot.slotKey||slot.slotKey.length>100||keys.has(slot.slotKey))throw Error('장비 슬롯의 고유 부위를 확인하세요.');
    keys.add(slot.slotKey);
    if(slot.item){
      const entry={id:crypto.randomUUID(),slotKey:slot.slotKey,item:slot.item};
      profile.inventory.push(entry);slot.equippedId=entry.id;delete slot.item;
    }
    slot.equippedId??=null;
  }
  normalizeSlotUpgrades(profile);validateInventory(profile);return profile;
}
export function validateInventory(profile) {
  if(!Array.isArray(profile.inventory)||profile.inventory.length>300)throw Error('보관함은 최대 300개입니다.');
  const ids=new Set(),equipped=new Set(),keys=new Set(profile.equipment.map(s=>s.slotKey));
  for(const slot of profile.equipment){
    if(slot.stars!==null&&(!Number.isInteger(slot.stars)||slot.stars<0||slot.stars>30))throw Error('슬롯의 별 강화는 0~30성으로 입력하세요.');
    if(slot.needsStatsReview!==undefined&&typeof slot.needsStatsReview!=='boolean')throw Error('슬롯 강화의 스펙 확인 상태를 확인하세요.');
    if(!slot.scrolls||!['attack','amplification'].every(key=>slot.scrolls[key]===null||Number.isFinite(slot.scrolls[key])&&slot.scrolls[key]>=0&&slot.scrolls[key]<=1e30))throw Error('슬롯 주문서의 공격력·데미지 증폭을 확인하세요.');
  }
  for(const entry of profile.inventory){
    if(!entry||typeof entry.id!=='string'||entry.id.length>100||!entry.id||ids.has(entry.id))throw Error('보관함 장비 ID가 올바르지 않습니다.');
    if(typeof entry.slotKey!=='string'||!keys.has(entry.slotKey))throw Error('보관함 장비 부위를 확인하세요.');
    validateEquipmentItem(entry.item);ids.add(entry.id);
  }
  for(const slot of profile.equipment)if(slot.equippedId!==null&&slot.equippedId!==undefined){
    const entry=profile.inventory.find(item=>item.id===slot.equippedId);
    if(!entry||slotFamily(entry.slotKey)!==slotFamily(slot.slotKey)||equipped.has(entry.id))throw Error('착용 장비와 슬롯 연결을 확인하세요.');
    equipped.add(entry.id);
  }
}
export function equippedEntry(profile,slot) {return profile.inventory?.find(entry=>entry.id===slot?.equippedId)??null;}
export function ensureEquipmentSlot(profile,key) {
  let index=findEquipmentIndex(profile,key);
  if(index<0){if(profile.equipment.length>=30)throw Error('장비 슬롯은 최대 30개입니다.');const slot=newEquipment(key);slot.equippedId=null;slot.stars=null;slot.scrolls={attack:null,amplification:null};profile.equipment.push(slot);index=profile.equipment.length-1;}
  return profile.equipment[index];
}
export function registerInventory(profile,records) {
  const next=normalizeInventory(structuredClone(profile));
  if(!records.length)throw Error('등록할 장비를 선택하세요.');
  const updated=new Set(),starRecords=new Map();
  for(const record of records){
    if(!EQUIPMENT_SLOTS.some(slot=>slot.key===record.slotKey))throw Error('등록할 장비 부위를 선택하세요.');
    validateEquipmentItem(record.item);const slot=ensureEquipmentSlot(next,record.slotKey);
    if(record.slotUpgrades?.importStars){
      if(starRecords.has(record.slotKey)&&starRecords.get(record.slotKey)!==record.slotUpgrades.stars)throw Error('같은 슬롯의 별 기록이 다릅니다. 적용할 별 개수 하나만 선택하세요.');
      starRecords.set(record.slotKey,record.slotUpgrades.stars);
      if(slot.stars!==null&&slot.stars!==record.slotUpgrades.stars)slot.needsStatsReview=true;
      slot.stars=record.slotUpgrades.stars;
    }
    for(const effect of record.item.effects){
      const option=equipmentOption(effect.type??equipmentLine(`${effect.label} ${effect.value}${effect.unit}`)?.type);
      if(!option)throw Error('주·부 옵션 종류를 목록에서 선택하세요.');
      if(option.unit!==effect.unit)throw Error('옵션 종류와 고정값·% 단위를 확인하세요.');
    }
    if(record.inventoryId){
      const entry=next.inventory.find(item=>item.id===record.inventoryId);
      if(!entry||updated.has(entry.id))throw Error('수정할 장비 기록을 확인하세요.');
      entry.item=structuredClone(record.item);entry.slotKey=record.slotKey;updated.add(entry.id);
    }else{
      if(next.inventory.length>=300)throw Error('보관함은 최대 300개입니다.');
      next.inventory.push({id:crypto.randomUUID(),slotKey:record.slotKey,item:structuredClone(record.item)});
    }
  }
  normalizeSlotUpgrades(next);
  validateInventory(next);return next;
}
export function registerSlotPotentials(profile,records) {
  const next=normalizeInventory(structuredClone(profile)),seen=new Set();
  for(const record of records){
    if(seen.has(record.slotKey))throw Error('같은 슬롯은 한 번에 하나만 등록하세요.');
    const slot=ensureEquipmentSlot(next,record.slotKey);seen.add(record.slotKey);
    let changed=false;
    if(record.slotUpgrades?.importStars){if(slot.stars!==null&&slot.stars!==record.slotUpgrades.stars)slot.needsStatsReview=true;slot.stars=record.slotUpgrades.stars;changed=true;}
    for(const [source,key] of [['potential','miracle'],['additional','additional']])if(record[source]!==null){
      validateEquipmentLines(record[source]);slot[key]??=emptyLayer();
      slot[key].old=structuredClone(record[source]);slot[key].next=structuredClone(record[source]);
      slot[key].p=null;slot[key].grade=record[source+'Grade']||'사진 등록';changed=true;
    }
    if(!changed)throw Error('등록할 별·잠재·에디셔널을 선택하세요.');
  }
  if(!seen.size)throw Error('등록할 슬롯을 선택하세요.');
  validateInventory(next);return next;
}
export function setEquipped(profile,id,key) {
  const entry=profile.inventory.find(item=>item.id===id);
  if(!entry||slotFamily(entry.slotKey)!==slotFamily(key))throw Error('이 슬롯에 착용할 수 없는 장비입니다.');
  if(profile.equipment.some(slot=>slot.equippedId===id&&slot.slotKey!==key))throw Error('다른 슬롯에 착용 중인 장비입니다.');
  ensureEquipmentSlot(profile,key).equippedId=id;validateInventory(profile);
}
