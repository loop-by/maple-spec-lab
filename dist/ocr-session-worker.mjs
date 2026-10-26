// Own the Tesseract child worker in a disposable session. Terminating this
// parent also terminates its children, including during engine initialization.
import Tesseract from './vendor/ocr/tesseract.esm.min.mjs';

const base=new URL('./vendor/ocr/',import.meta.url).href;
let engine;
self.addEventListener('message',async ({data:{id,method,args=[]}})=>{
  try {
    if(method==='initialize') {
      engine=await Tesseract.createWorker('kor+eng',1,{
        workerPath:base+'worker.min.js',corePath:base,langPath:base,
        workerBlobURL:false,legacyCore:false,legacyLang:false,
        logger:progress=>self.postMessage({progress}),
        errorHandler:()=>self.postMessage({fatal:'글자 인식 자료를 불러오지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.'}),
      });
      self.postMessage({id,value:null});
      return;
    }
    if(!engine||!['recognize','setParameters','reinitialize'].includes(method))throw Error('글자 인식 준비가 완료되지 않았어요.');
    const result=await engine[method](...args);
    self.postMessage({id,value:method==='recognize'?result:null});
  } catch {
    self.postMessage({id,error:method==='initialize'?'글자 인식을 준비하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.':'사진을 읽지 못했어요. 다른 사진으로 다시 시도해 주세요.'});
  }
});
