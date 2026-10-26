// Names confirmed by the user and the supplied item screenshot. These are
// spelling references, never a fallback when the image contains no name.
const confirmedNames=[{slotKey:'ring1',name:'물컹물컹한 반지'}];
const compact=text=>String(text??'').normalize('NFKC').replace(/\s/g,'');
const slotFamily=key=>/^ring[12]$/.test(key??'')?'ring':key;
function distance(a,b) {
  let previous=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=0;i<a.length;i++){
    const next=[i+1];
    for(let j=0;j<b.length;j++)next.push(Math.min(next[j]+1,previous[j+1]+1,previous[j]+(a[i]===b[j]?0:1)));
    previous=next;
  }
  return previous[b.length];
}
export function identifyEquipmentName(raw,slotKey,{confidence=0,knownNames=[]}={}) {
  const text=compact(raw),candidates=new Map();
  if(text.length<4)return null;
  for(const item of [...confirmedNames,...knownNames]){
    if(slotFamily(item.slotKey)!==slotFamily(slotKey)||typeof item.name!=='string')continue;
    const name=compact(item.name);
    if(Math.abs(name.length-text.length)>1||name.slice(-2)!==text.slice(-2))continue;
    const a=text.normalize('NFD'),b=name.normalize('NFD');
    const score=1-distance(a,b)/Math.max(a.length,b.length);
    if(score>=.8)candidates.set(name,{name:item.name,raw,score,corrected:name!==text});
  }
  const ranked=[...candidates.values()].sort((a,b)=>b.score-a.score);
  const best=ranked[0];
  if(!best||best.corrected&&confidence>=85||ranked[1]&&best.score-ranked[1].score<.08)return null;
  return best;
}

// Count the filled yellow star shapes, keeping gray empty stars out of the
// count. The grid is the two-row, 15-column item header in the supplied layout.
export function equipmentStars({data,width,height}) {
  const mask=new Uint8Array(width*height),components=[];
  for(let i=0;i<mask.length;i++){
    const p=i*4,r=data[p],g=data[p+1],b=data[p+2];
    mask[i]=r>170&&g>130&&b<165&&r-b>65&&g-b>40?1:0;
  }
  for(let seed=0;seed<mask.length;seed++){
    if(!mask[seed])continue;
    const queue=[seed];mask[seed]=0;let count=0,x0=width,y0=height,x1=0,y1=0;
    for(let n=0;n<queue.length;n++){
      const p=queue[n],x=p%width,y=Math.floor(p/width);count++;
      x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
      for(const q of [x>0?p-1:-1,x+1<width?p+1:-1,y>0?p-width:-1,y+1<height?p+width:-1])if(q>=0&&mask[q]){mask[q]=0;queue.push(q);}
    }
    const w=(x1-x0+1)/width,h=(y1-y0+1)/width;
    if(w>=.032&&w<=.06&&h>=.032&&h<=.06&&count/(width*width)>.0005)components.push({x:(x0+x1)/2/width,y:(y0+y1)/2/width});
  }
  if(!components.length||components.length>30)return null;
  const slots=new Set();
  for(const shape of components){
    const row=Math.round((shape.y-.041)/.062);
    if(row<0||row>1||Math.abs(shape.y-(.041+row*.062))>.015)return null;
    let match=-1;
    for(let col=0;col<15;col++)if(Math.abs(shape.x-(.122+.2525*Math.floor(col/5)+.0425*(col%5)))<.015){match=row*15+col;break;}
    if(match<0||slots.has(match))return null;
    slots.add(match);
  }
  // A partial or unexpected header must not become a confident lower count.
  for(let i=0;i<slots.size;i++)if(!slots.has(i))return null;
  return slots.size;
}
