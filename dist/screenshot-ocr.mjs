import {visualStatLines,parseStatLines} from './screenshot-parser.mjs';
import {createOcrSession} from './screenshot-worker-client.mjs';

const abortError = () => new DOMException('사진 읽기를 취소했습니다.', 'AbortError');

function bounded(promise, signal, timeout=120000) {
  return new Promise((resolve,reject) => {
    const abort=()=>finish(reject,abortError());
    const timer=setTimeout(()=>finish(reject,Error('사진을 읽는 데 시간이 오래 걸립니다. 스탯 부분을 크게 캡처해서 다시 선택해 주세요.')),timeout);
    function finish(fn,value) {clearTimeout(timer);signal?.removeEventListener('abort',abort);fn(value);}
    promise.then(value=>finish(resolve,value),error=>finish(reject,error));
    if(signal?.aborted) {abort();return;}
    signal?.addEventListener('abort',abort,{once:true});
  });
}

export function checkScreenshotFiles(files) {
  if(!files.length) throw Error('스탯 창 사진을 선택해 주세요.');
  if(files.length>6) throw Error('한 번에 최대 6장까지 선택할 수 있어요.');
  if(files.some(f=>!['image/png','image/jpeg','image/webp'].includes(f.type))) throw Error('PNG, JPG, WebP 사진을 선택해 주세요. HEIC 사진은 PNG나 JPG로 바꿔 주세요.');
  if(files.some(f=>f.size>15*1024*1024)||files.reduce((n,f)=>n+f.size,0)>50*1024*1024) throw Error('사진은 한 장당 15MB, 전체 50MB 이내로 선택해 주세요.');
}

async function imageCanvas(file,signal) {
  const url=URL.createObjectURL(file), img=new Image();
  try {
    img.src=url;
    await bounded(img.decode(),signal,15000);
    if(img.naturalWidth<80 || img.naturalHeight<80) throw Error('사진이 너무 작아요. 원본 스크린샷을 선택해 주세요.');
    const scale=Math.min(2,1800/img.naturalWidth,2600/img.naturalHeight);
    const canvas=document.createElement('canvas');
    canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    return canvas;
  } finally {URL.revokeObjectURL(url);}
}

function cropLine(canvas,bbox) {
  if(!bbox) return null;
  const x=Math.max(0,bbox.x0-12),y=Math.max(0,bbox.y0-10);
  const crop=document.createElement('canvas');
  crop.width=Math.max(1,Math.min(canvas.width-x,bbox.x1-x+12));
  crop.height=Math.max(1,Math.min(canvas.height-y,bbox.y1-y+10));
  crop.getContext('2d').drawImage(canvas,x,y,crop.width,crop.height,0,0,crop.width,crop.height);
  return crop.toDataURL('image/png');
}

export async function readScreenshots(files,{signal,onProgress=()=>{},onPhoto=()=>{}}={}) {
  checkScreenshotFiles(files);
  let worker,index=0,ready=false;
  let phase='글자 읽는 중',completed=0,segment=0.8;
  const terminate=()=>{void worker?.terminate();};
  signal?.addEventListener('abort',terminate,{once:true});
  try {
    onProgress({index:0,total:files.length,stage:'준비 중',progress:0});
    if(signal?.aborted)throw abortError();
    worker=createOcrSession({onProgress:message=>{
        if(signal?.aborted) return;
        const recognizing=message.status==='recognizing text';
        if(ready && !recognizing)return;
        onProgress({index,total:files.length,stage:recognizing?phase:'준비 중',progress:recognizing?completed+message.progress*segment:0});
      }});
    await bounded(worker.ready,signal);ready=true;
    // Sparse text handles stat lists embedded in game UI without assuming a paragraph.
    await bounded(worker.setParameters({tessedit_pageseg_mode:'11',preserve_interword_spaces:'1'}),signal);
    const candidates=[];
    for(index=0;index<files.length;index++) {
      if(signal?.aborted) throw abortError();
      let canvas;
      try {
        phase='글자 읽는 중';completed=0;segment=0.8;
        onProgress({index,total:files.length,stage:'사진 여는 중',progress:0});
        canvas=await imageCanvas(files[index],signal);
        await bounded(worker.reinitialize('kor+eng',1),signal);
        await bounded(worker.setParameters({tessedit_pageseg_mode:'11',preserve_interword_spaces:'1',tessedit_char_whitelist:''}),signal);
        const {data}=await bounded(worker.recognize(canvas,{}, {text:true,blocks:true}),signal);
        const parsed=parseStatLines(visualStatLines(data),index);
        // Korean OCR can read '%' as '96'. Re-read only the number crop in
        // English; never guess that a trailing 96 should be a percent sign.
        const retry=parsed.filter(c=>c.unitMissing && c.valueBbox && /^[+\d.,\s]+$/.test(c.raw));
        if(retry.length) {
          await bounded(worker.reinitialize('eng',1),signal);
          await bounded(worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'0123456789.,%+'}),signal);
          phase='숫자 확인 중';segment=0.2/retry.length;
          for(const [numberIndex,candidate] of retry.entries()) {
            completed=0.8+numberIndex*segment;
            const crop=cropLine(canvas,candidate.valueBbox);
            const {data:number}=await bounded(worker.recognize(crop),signal);
            if(!/%\s*$/.test(number.text))continue;
            const checked=parseStatLines([{text:`${candidate.matchedLabel} ${number.text.trim()}`,confidence:Math.min(candidate.confidence,number.confidence)}],index)[0];
            if(checked?.value!==null && checked?.key===candidate.key) {
              candidate.raw=checked.raw;candidate.value=checked.value;candidate.unitMissing=false;
              candidate.confidence=checked.confidence;
            }
          }
        }
        for(const c of parsed) c.crop=cropLine(canvas,c.bbox);
        candidates.push(...parsed);
        onPhoto({index,count:parsed.length,text:data.text??'',error:null,candidates:parsed});
        onProgress({index,total:files.length,stage:'사진 확인 완료',progress:1});
      } catch(error) {
        if(signal?.aborted||error.name==='AbortError') throw error;
        // Keep successfully read photos, but release a failed or timed out worker.
        onPhoto({index,count:0,text:'',error:error.message||'이 사진을 읽지 못했어요.'});
        if(canvas) throw error;
      } finally {if(canvas){canvas.width=1;canvas.height=1;}}
    }
    return candidates;
  } finally {
    signal?.removeEventListener('abort',terminate);
    await worker?.terminate();
  }
}
