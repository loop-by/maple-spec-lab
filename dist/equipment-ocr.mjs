import {bounded,imageCanvas} from './screenshot-ocr.mjs';
import {createOcrSession} from './screenshot-worker-client.mjs';
import {visualStatLines,parseStatNumber} from './screenshot-parser.mjs';
import {equipmentLine,parseEquipment} from './equipment-parser.mjs';
import {identifyEquipmentName,equipmentStars} from './equipment-identification.mjs';

export function checkEquipmentFiles(files) {
  if(!files.length||files.length>12)throw Error('장비 사진은 한 번에 1~12장 선택하세요.');
  if(files.some(f=>!['image/png','image/jpeg','image/webp'].includes(f.type)))throw Error('PNG, JPG, WebP 사진을 선택하세요.');
  if(files.some(f=>f.size>15*1024*1024)||files.reduce((s,f)=>s+f.size,0)>50*1024*1024)throw Error('사진은 한 장당 15MB, 전체 50MB 이내로 선택하세요.');
}
function crop(image,rect,width) {
  const [x,y,w,h]=rect,c=document.createElement('canvas');c.width=width??Math.round(w);c.height=Math.max(1,Math.round(h*c.width/w));
  c.getContext('2d').drawImage(image,x,y,w,h,0,0,c.width,c.height);return c;
}
function contrast(image,threshold=135) {
  const c=crop(image,[0,0,image.width,image.height]),ctx=c.getContext('2d'),p=ctx.getImageData(0,0,c.width,c.height);
  for(let i=0;i<p.data.length;i+=4){const g=p.data[i]*.299+p.data[i+1]*.587+p.data[i+2]*.114;p.data[i]=p.data[i+1]=p.data[i+2]=g>threshold?0:255;}
  ctx.putImageData(p,0,0);return c;
}
function withoutComparisonDeltas(panel) {
  const canvas=crop(panel,[0,0,panel.width,panel.height]),ctx=canvas.getContext('2d'),pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
  // The comparison view prints a red/green difference after the white total.
  // Remove only colored pixels in the effect-value region before OCR, so a
  // white "30" followed by a green "2" never becomes a total of "302".
  for(let y=Math.floor(canvas.width*.77);y<canvas.height;y++)for(let x=Math.floor(canvas.width*.60);x<canvas.width;x++){
    const i=(y*canvas.width+x)*4,r=pixels.data[i],g=pixels.data[i+1],b=pixels.data[i+2];
    if(Math.max(r,g,b)-Math.min(r,g,b)>55)pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=40;
  }
  ctx.putImageData(pixels,0,0);return canvas;
}
function rowScore(row) {
  const parsed=equipmentLine(row.text);
  return (parsed?.type&&parsed.type!=='unread'?1000:0)+(/장착\s*효과|잠재\s*옵션|슬롯\s*강화|Lv\./i.test(row.text)?500:0)+(row.confidence??0);
}
function combineRows(first,second) {
  const result=[];
  for(const row of [...first,...second].sort((a,b)=>(a.bbox?.y0??0)-(b.bbox?.y0??0))){
    if(!row.bbox){result.push(row);continue;}
    const center=(row.bbox.y0+row.bbox.y1)/2;
    const match=result.findIndex(r=>r.bbox&&Math.abs((r.bbox.y0+r.bbox.y1)/2-center)<Math.max(18,row.bbox.y1-row.bbox.y0,r.bbox.y1-r.bbox.y0)*.75);
    if(match<0)result.push(row);else {
      const previous=result[match],a=equipmentLine(previous.text),b=equipmentLine(row.text);
      const agreement=a&&b&&a.type!=='unread'&&a.type===b.type&&a.value===b.value&&a.unit===b.unit;
      if(rowScore(row)>rowScore(previous))result[match]=row;
      if(agreement)result[match].agreedNumber=true;
    }
  }
  return result.sort((a,b)=>(a.bbox?.y0??0)-(b.bbox?.y0??0));
}
function valueColumns(row) {
  const words=row.words??[];if(words.length<2)return null;
  const gaps=words.slice(1).map((w,i)=>w.bbox.x0-words[i].bbox.x1),gap=Math.max(...gaps),split=gaps.indexOf(gap)+1;
  if(gap<20)return null;
  const label=words.slice(0,split),number=words.slice(split),box=ws=>({x0:Math.min(...ws.map(w=>w.bbox.x0)),x1:Math.max(...ws.map(w=>w.bbox.x1)),y0:Math.min(...ws.map(w=>w.bbox.y0)),y1:Math.max(...ws.map(w=>w.bbox.y1))});
  return {label:box(label),number:box(number),labelText:label.map(w=>w.text).join(' ')};
}
function rowCrop(image,bbox,padding=8) {
  const x=Math.max(0,bbox.x0-padding),y=Math.max(0,bbox.y0-padding);
  return crop(image,[x,y,Math.min(image.width-x,bbox.x1-x+padding),Math.min(image.height-y,bbox.y1-y+padding)]);
}
export async function readEquipmentScreenshots(files,{signal,mode='combined',knownNames=[],onProgress=()=>{},onPhoto=()=>{}}={}) {
  checkEquipmentFiles(files);let worker,index=0;
  const abort=()=>worker?.terminate();signal?.addEventListener('abort',abort,{once:true});
  const results=[];
  try {
    if(signal?.aborted)throw new DOMException('취소했습니다.','AbortError');
    onProgress({index,total:files.length,stage:'글자 인식 준비 중'});
    worker=createOcrSession();await bounded(worker.ready,signal);
    let language='kor+eng',parameters='';
    const recognize=async(canvas,lang='kor+eng',psm='6',whitelist='')=>{
      if(language!==lang){await bounded(worker.reinitialize(lang,1),signal);language=lang;parameters='';}
      const next=psm+'|'+whitelist;
      if(parameters!==next){await bounded(worker.setParameters({tessedit_pageseg_mode:psm,tessedit_char_whitelist:whitelist,preserve_interword_spaces:'1'}),signal);parameters=next;}
      return (await bounded(worker.recognize(canvas,{}, {text:true,blocks:true}),signal)).data;
    };
    for(index=0;index<files.length;index++) {
      let image,panels=[],originalItemPanel=null;
      try {
        onProgress({index,total:files.length,stage:'장비 정보 읽는 중'});
        image=await imageCanvas(files[index],signal);
        const full=image.width/image.height>1.4;
        let comparison=false,relative=full?[[.332,.103,.272,.82],[.609,.103,.263,.59]]:[[0,0,.505,1],[.51,0,.49,.72]];
        if(mode==='inventory'&&full){
          const comparisons=[[.125,.103,.272,.82],[.4,.103,.272,.82]];
          const headers=comparisons.map(r=>crop(image,[r[0]*image.width,r[1]*image.height,r[2]*image.width,r[2]*image.width*.16],520));
          try{if(headers.every(c=>equipmentStars(c.getContext('2d').getImageData(0,0,c.width,c.height))!==null)){relative=comparisons.slice(1);comparison=true;}}
          finally{for(const c of headers){c.width=1;c.height=1;}}
        }
        if(mode==='inventory')relative=relative.slice(0,1);
        panels=relative.map(r=>crop(image,[r[0]*image.width,r[1]*image.height,r[2]*image.width,r[3]*image.height],1040));
        if(comparison){originalItemPanel=panels[0];panels[0]=withoutComparisonDeltas(originalItemPanel);}
        const starStrip=crop(panels[0],[0,0,panels[0].width,panels[0].width*.16]);
        let stars=null;
        try{stars=equipmentStars(starStrip.getContext('2d').getImageData(0,0,starStrip.width,starStrip.height));}
        finally{starStrip.width=1;starStrip.height=1;}
        const readings=[];
        for(const panel of panels){
          const clean=contrast(panel);
          try{
            const mixed=await recognize(clean),korean=await recognize(clean,'kor');
            readings.push(combineRows(visualStatLines(mixed),visualStatLines(korean)));
          }finally{clean.width=1;clean.height=1;}
        }
        onProgress({index,total:files.length,stage:'주 옵션·부 옵션·잠재 수치 확인 중'});
        for(let group=0;group<readings.length;group++){
        let effectsStarted=group===1;
        for(const row of readings[group]) {
          if(!group&&row.text.replace(/\s/g,'').includes('장착효과')){effectsStarted=true;continue;}
          if(!effectsStarted)continue;
          const columns=valueColumns(row);
          if(!columns){if(!group){const hint=equipmentLine(row.text+' 0');if(hint&&hint.type!=='unread'){row.numberUnread=true;row.labelHint=row.text;}}continue;}
          const original=equipmentLine(row.text)??equipmentLine(columns.labelText+' 0');
          if(!original)continue;
          if(row.agreedNumber&&original.type!=='unread')continue;
          let label=columns.labelText;
          if(!group&&original.type==='unread') {
            const c=contrast(rowCrop(panels[group],{...columns.label,x0:15,x1:panels[group].width*.61}));
            try{
              for(const mode of ['7','13']){const korean=await recognize(c,'kor',mode);const next=korean.text.trim(),parsed=equipmentLine(next+' 0');if(parsed&&parsed.type!=='unread'){label=next;break;}}
              if(equipmentLine(label+' 0')?.type==='unread'){
                const latin=(await recognize(c,'eng','7','ABCDEFGHIJKLMNOPQRSTUVWXYZ')).text.replace(/\s/g,'');
                if(/(HP|MP)$/.test(latin)&&/^최/.test(label.replace(/\s/g,'')))label=latin.endsWith('HP')?'최대 HP':'최대 MP';
                else if(/^(HP|MP|STR|DEX|INT|LUK)$/.test(latin))label=latin==='HP'?'최대 HP':latin==='MP'?'최대 MP':latin;
              }
            }finally{c.width=1;c.height=1;}
          }
          if(group&&original.type==='unread') {
            const c=contrast(rowCrop(panels[group],columns.label));
            try{
              const latin=await recognize(c,'eng','7','ABCDEFGHIJKLMNOPQRSTUVWXYZ');
              const text=latin.text.replace(/\s/g,'');
              if(/^(STR|DEX|INT|LUK)$/.test(text)&&latin.confidence>=50)label=text;
            }finally{c.width=1;c.height=1;}
          }
          const numericBox=!group?{...columns.number,x0:panels[group].width*.64,x1:panels[group].width-12}:columns.number;
          const c=contrast(rowCrop(panels[group],numericBox));
          try {
            const number=await recognize(c,'eng','7','0123456789.,%');
            const raw=number.text.trim();
            if(number.confidence>=70&&parseStatNumber(raw)!==null)row.text=label+' '+raw;
            else if(!group&&!equipmentLine(row.text)){const hint=equipmentLine(label+' 0');if(hint&&hint.type!=='unread'){row.numberUnread=true;row.labelHint=label;}}
          }finally{c.width=1;c.height=1;}
        }
        }
        const metaCanvas=contrast(crop(panels[0],[270,320,760,255]));
        let metadata='';try{metadata=(await recognize(metaCanvas,'kor','6')).text;}finally{metaCanvas.width=1;metaCanvas.height=1;}
        const titleCanvas=contrast(crop(panels[0],[10,160,1020,140]));
        let title='',titleConfidence=0;try{
          let read=await recognize(titleCanvas,'kor','7');
          if(read.confidence<85){const alternative=await recognize(titleCanvas,'kor','13');if(alternative.confidence>read.confidence)read=alternative;}
          title=read.text.trim();titleConfidence=read.confidence;
        }finally{titleCanvas.width=1;titleCanvas.height=1;}
        let grade='';
        if(panels[1]){const gradeCanvas=contrast(crop(panels[1],[735,410,295,130]),85);try{grade=(await recognize(gradeCanvas,'kor','7')).text.trim();}finally{gradeCanvas.width=1;gradeCanvas.height=1;}}
        const record=parseEquipment(readings[0],readings[1]??[],{title,grade,metadata});
        record.item.stars=stars;
        if(mode==='inventory'){
          const icon=crop(panels[0],[36,330,250,250],80);
          try{record.item.icon=icon.toDataURL('image/webp',.7);}finally{icon.width=1;icon.height=1;}
        }
        const identified=identifyEquipmentName(record.item.name,record.slotKey,{confidence:titleConfidence,knownNames});
        if(identified){record.item.name=identified.name;if(identified.corrected)record.nameCorrection=identified;}
        if(record.additional&&panels[1]?.height>950){
          const additionalGrade=contrast(crop(panels[1],[735,820,295,130]),85);
          try{record.additionalGrade=(await recognize(additionalGrade,'kor','7')).text.match(/레전드리|유니크|에픽|레어/)?.[0]??'';}finally{additionalGrade.width=1;additionalGrade.height=1;}
        }
        record.nameConfidence=titleConfidence;
        record.source=index;results.push(record);
        const preview=panels.map((panel,n)=>{const source=n===0&&originalItemPanel?originalItemPanel:panel,c=crop(source,[0,0,source.width,source.height],520);try{return c.toDataURL('image/png');}finally{c.width=1;c.height=1;}});
        onPhoto({index,record,error:null,preview});
      }catch(error){
        if(signal?.aborted||error.name==='AbortError')throw error;
        onPhoto({index,record:null,error:error.message||'장비 사진을 읽지 못했어요.'});
      }finally{
        for(const panel of panels){panel.width=1;panel.height=1;}
        if(originalItemPanel){originalItemPanel.width=1;originalItemPanel.height=1;}
        if(image){image.width=1;image.height=1;}
      }
    }
    return results;
  }finally{signal?.removeEventListener('abort',abort);worker?.terminate();}
}
