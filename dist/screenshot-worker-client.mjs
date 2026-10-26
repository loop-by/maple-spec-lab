// Session owns all pending requests and all OCR workers, so cancel/retry is
// bounded even when Tesseract's createWorker promise has not settled yet.
export function createOcrSession({onProgress=()=>{}}={}) {
  const worker=new Worker(new URL('./ocr-session-worker.mjs',import.meta.url),{type:'module'});
  const pending=new Map();
  let sequence=0,closed=false;
  const aborted=()=>new DOMException('사진 읽기를 취소했습니다.','AbortError');
  function stop(error=aborted()) {
    if(closed)return;
    closed=true;worker.terminate();
    for(const {reject} of pending.values())reject(error);
    pending.clear();
  }
  function request(method,...args) {
    if(closed)return Promise.reject(aborted());
    return new Promise((resolve,reject)=>{
      const id=++sequence;
      pending.set(id,{resolve,reject});
      try{worker.postMessage({id,method,args});}
      catch(error){pending.delete(id);reject(error);}
    });
  }
  worker.addEventListener('message',({data})=>{
    if(closed)return;
    if(data.fatal){stop(Error(data.fatal));return;}
    if(data.progress){onProgress(data.progress);return;}
    const job=pending.get(data.id);
    if(!job)return;
    pending.delete(data.id);
    if(data.error)job.reject(Error(data.error));else job.resolve(data.value);
  });
  worker.addEventListener('error',event=>{
    event.preventDefault();
    stop(Error('글자 인식을 준비하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.'));
  });
  worker.addEventListener('messageerror',()=>stop(Error('사진 인식 결과를 읽지 못했어요. 다시 시도해 주세요.')));
  return {
    ready:request('initialize'),
    setParameters:(...args)=>request('setParameters',...args),
    reinitialize:(...args)=>request('reinitialize',...args),
    recognize:async (image,...args)=>{
      if(closed)throw aborted();
      // Blob crosses the worker boundary without retaining a DOM canvas.
      const transferable=typeof image?.toBlob==='function' ? await new Promise((resolve,reject)=>{
        image.toBlob(blob=>blob?resolve(blob):reject(Error('사진을 준비하지 못했어요.')),'image/png');
      }) : image;
      return request('recognize',transferable,...args);
    },
    terminate:()=>stop(),
  };
}
