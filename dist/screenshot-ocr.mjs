import {visualStatLines,parseStatLines} from './screenshot-parser.mjs';
import {createOcrSession} from './screenshot-worker-client.mjs';

const abortError = () => new DOMException('사진 읽기를 취소했습니다.', 'AbortError');

export function bounded(promise, signal, timeout=120000) {
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

export async function imageCanvas(file,signal) {
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

function recognitionImage(canvas) {
  const ctx=canvas.getContext('2d'),pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
  let luminance=0,samples=0;
  for(let i=0;i<pixels.data.length;i+=64) {
    luminance+=(pixels.data[i]+pixels.data[i+1]+pixels.data[i+2])/3;samples++;
  }
  // Normalize plain light/dark panels to dark text on white. Keep mixed-color
  // game scenes untouched instead of thresholding away parts of their text.
  const average=luminance/samples,invert=average<100;
  if(!invert&&average<180)return canvas;
  const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
  for(let i=0;i<pixels.data.length;i+=4) {
    let gray=pixels.data[i]*0.299+pixels.data[i+1]*0.587+pixels.data[i+2]*0.114;
    if(invert)gray=255-gray;
    pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=gray<195?0:255;
  }
  copy.getContext('2d').putImageData(pixels,0,0);
  return copy;
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
      let canvas,recognition;
      try {
        phase='글자 읽는 중';completed=0;segment=0.4;
        onProgress({index,total:files.length,stage:'사진 여는 중',progress:0});
        canvas=await imageCanvas(files[index],signal);
        recognition=recognitionImage(canvas);
        await bounded(worker.reinitialize('kor+eng',1),signal);
        await bounded(worker.setParameters({tessedit_pageseg_mode:'11',preserve_interword_spaces:'1',tessedit_char_whitelist:''}),signal);
        const {data}=await bounded(worker.recognize(recognition,{}, {text:true,blocks:true}),signal);
        const parsed=parseStatLines(visualStatLines(data),index);
        const textResults=[data.text??''];
        const hasKorean=(data.text?.match(/[가-힣]/g)??[]).length>=8;
        if(hasKorean || (data.text?.match(/[a-z]/gi)??[]).length>=8) {
          // Mixed-language recognition can confuse short gray labels. Keep
          // its readings and verify labels in the detected script as well.
          phase='항목명 확인 중';completed=0.4;segment=0.3;
          await bounded(worker.reinitialize(hasKorean?'kor':'eng',1),signal);
          await bounded(worker.setParameters({tessedit_pageseg_mode:hasKorean&&recognition!==canvas?'6':'11'}),signal);
          const {data:labels}=await bounded(worker.recognize(recognition,{}, {text:true,blocks:true}),signal);
          parsed.push(...parseStatLines(visualStatLines(labels),index));
          textResults.push(labels.text??'');
        }
        // Read the right-aligned value independently of the gray Korean label
        // and help icon. Do not assume a missing '%' or decimal point.
        const retry=parsed.filter(c=>c.valueBbox && /^[+\d.,%\s]+$/.test(c.raw));
        if(retry.length) {
          await bounded(worker.reinitialize('eng',1),signal);
          await bounded(worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'0123456789.,%+'}),signal);
          phase='숫자 확인 중';segment=0.2/retry.length;
          for(const [numberIndex,candidate] of retry.entries()) {
            completed=0.8+numberIndex*segment;
            const crop=cropLine(canvas,candidate.valueBbox);
            const {data:number}=await bounded(worker.recognize(crop),signal);
            if(candidate.unit==='%'&&!/%\s*$/.test(number.text))continue;
            const checked=parseStatLines([{text:`${candidate.matchedLabel} ${number.text.trim()}`,confidence:number.confidence}],index)[0];
            if(!checked||checked.value===null||checked.key!==candidate.key||checked.confidence<70)continue;
            if(checked.confidence<85 && candidate.value!==null && !candidate.unitMissing && candidate.value!==checked.value) {
              // A borderline isolated read must not silently replace another
              // plausible value. Strong isolated reads use the number crop.
              parsed.push({...candidate,raw:checked.raw,value:checked.value,confidence:checked.confidence});
            } else {
              const agreement=!candidate.unitMissing&&candidate.value===checked.value?candidate.confidence:0;
              candidate.raw=checked.raw;candidate.value=checked.value;candidate.unitMissing=checked.unitMissing;
              candidate.confidence=Math.max(agreement,checked.confidence);
            }
          }
        }
        for(const c of parsed) c.crop=cropLine(canvas,c.bbox);
        candidates.push(...parsed);
        onPhoto({index,count:new Set(parsed.map(c=>c.key)).size,text:textResults.join('\n\n'),error:null,candidates:parsed});
        onProgress({index,total:files.length,stage:'사진 확인 완료',progress:1});
      } catch(error) {
        if(signal?.aborted||error.name==='AbortError') throw error;
        // Keep successfully read photos, but release a failed or timed out worker.
        onPhoto({index,count:0,text:'',error:error.message||'이 사진을 읽지 못했어요.'});
        if(canvas) throw error;
      } finally {
        if(recognition&&recognition!==canvas){recognition.width=1;recognition.height=1;}
        if(canvas){canvas.width=1;canvas.height=1;}
      }
    }
    return candidates;
  } finally {
    signal?.removeEventListener('abort',terminate);
    await worker?.terminate();
  }
}
