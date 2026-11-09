import {cardKey,normalizeText} from './scheduler.js';
const normalized=text=>normalizeText(String(text)).toLocaleLowerCase('de');
export function shuffled(items,random=Math.random){const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
export function sentenceBank(item,{sentences,maxLesson,direction,random=Math.random}){
 const he=direction==='de-he',target=he?item.hebrew:item.german,used=new Set(target.map(normalized));
 const candidates=shuffled(sentences.filter(s=>s.lesson<=maxLesson).flatMap(s=>he?s.hebrew:s.german),random),extras=[];
 const needed=Math.max(4,Math.min(7,Math.ceil(target.length*.8)));
 for(const token of candidates){const key=normalized(token);if(!key||used.has(key))continue;used.add(key);extras.push(token);if(extras.length===needed)break;}
 return shuffled([...target,...extras].map((text,id)=>({text,id})),random);
}
export function matchesSentence(tokens,item,direction){const he=direction==='de-he',target=he?item.hebrew:item.german,alternatives=(he?item.alternativesHebrew:item.alternativesGerman)||[];return [target,...alternatives].some(answer=>normalized(answer.join(' '))===normalized(tokens.join(' ')));}
export function sentenceRound({sentences,progress,maxLesson,direction='mixed',limit=12,random=Math.random}){
 const ids=new Set(),candidates=shuffled(sentences.filter(s=>{if(s.lesson>maxLesson||ids.has(s.id))return false;ids.add(s.id);return true;}),random).map(item=>{const records=['he-de','de-he'].map(d=>progress[cardKey('sentence',item.id,d)]);return {item,seen:records.reduce((sum,p)=>sum+(p?.reviews||0),0),last:Math.max(...records.map(p=>p?.lastReviewed||0))};}).sort((a,b)=>a.seen-b.seen||a.last-b.last);
 return candidates.slice(0,limit).map(({item},i)=>{let d=direction;if(d==='mixed'){const he=progress[cardKey('sentence',item.id,'he-de')]?.reviews||0,de=progress[cardKey('sentence',item.id,'de-he')]?.reviews||0;d=he===de?(i%2?'de-he':'he-de'):he<de?'he-de':'de-he';}const key=cardKey('sentence',item.id,d);return {key,type:'sentence',id:item.id,direction:d,isNew:!progress[key]};});
}

export function activeWordReviews({vocabulary,progress,maxLesson,direction='mixed'}){
 const ids=new Set(vocabulary.filter(w=>w.lesson<=maxLesson).map(w=>w.id));
 return Object.entries(progress).filter(([key])=>{const [type,id,d]=key.split(':');return type==='word'&&ids.has(id)&&(direction==='mixed'||d===direction);}).map(([key,record])=>({key,...record}));
}
