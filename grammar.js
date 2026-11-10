/** Reviewed facts become varied exercises; Hebrew forms are never guessed at runtime. */
export const GRAMMAR_MODES=['identify','form','judge','cloze'];
export const grammarKey=id=>`grammar:${id}:form`;
function shuffle(input,random){const a=[...input];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function availableModes(fact){return ['identify',...(fact.reverse&&fact.forms.length?['form']:[]),'judge',...(fact.context&&fact.forms.length?['cloze']:[])];}
export function grammarRound({facts,progress={},maxLesson,limit=12,history=[],random=Math.random}){
 const eligible=facts.filter(f=>f.lesson<=maxLesson),latest=Math.max(0,...eligible.map(f=>f.lesson));
 const recent=eligible.filter(f=>f.lesson>=latest-1),older=eligible.filter(f=>f.lesson<latest-1);
 const rank=pool=>shuffle(pool,random).sort((a,b)=>{
  const x=progress[grammarKey(a.id)],y=progress[grammarKey(b.id)];
  return (x?.reviews||0)-(y?.reviews||0)||(x?.streak||0)-(y?.streak||0)||(x?.lastReviewed||0)-(y?.lastReviewed||0);
 });
 const pools=[rank(recent),rank(older)],result=[];let lastMode=history.filter(h=>h.type==='grammar').at(-1)?.mode;
 // Every fourth task revisits older material. Counters make the phase survive short rounds.
 const offset=history.filter(h=>h.type==='grammar').length;
 for(let i=0;i<Math.min(limit,eligible.length);i++){
  const preferred=(offset+i)%4===3?1:0, pool=pools[preferred].length?pools[preferred]:pools[1-preferred];
  const wanted=['identify','form','judge','cloze','form'][(offset+i)%5];
  const least=progress[grammarKey(pool[0].id)]?.reviews||0;
  const preferredIndex=pool.findIndex(f=>(progress[grammarKey(f.id)]?.reviews||0)===least&&availableModes(f).includes(wanted));
  const f=pool.splice(Math.max(0,preferredIndex),1)[0],modes=availableModes(f);
  const mode=modes.includes(wanted)&&wanted!==lastMode?wanted:modes.find(m=>m!==lastMode)||modes[0];
  result.push({id:f.id,key:grammarKey(f.id),type:'grammar',direction:'form',isNew:!progress[grammarKey(f.id)],mode});lastMode=mode;
 }
 return result;
}
export function grammarExercise(fact,mode,random=Math.random){
 const count=Math.min(3,fact.distractors.length),labelChoices=shuffle(fact.distractors,random).slice(0,count);
 if(mode==='judge'){
  const positive=random()<.5,claim=positive?fact.answer:labelChoices[0];
  return {mode,prompt:fact.form,question:'Stimmt diese Bestimmung?',claim,options:['Richtig','Falsch'],correct:positive?0:1,solution:fact.answer};
 }
 const form=mode==='form'||mode==='cloze',correct=form?fact.form:fact.answer;
 const wrong=form?shuffle(fact.forms,random).slice(0,3):labelChoices;
 const options=shuffle([correct,...wrong],random);
 return {mode,prompt:mode==='cloze'?fact.context:form?fact.answer:fact.form,question:mode==='cloze'?'Setze die passende Form ein.':form?'Welche Form passt zur Bestimmung?':'Welche Bestimmung passt?',claim:mode==='cloze'?fact.answer:'',options,correct:options.indexOf(correct),solution:correct,hebrewOptions:form};
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const heb=s=>/[א-ת]/u.test(s)&&!/[A-Za-zÄÖÜäöüß]/u.test(s);
const display=s=>`<span ${heb(s)?'class="hebrew" lang="he" dir="rtl"':'dir="auto"'}>${esc(s)}</span>`;
const modeLabel={identify:'Bestimmen',form:'Form wählen',judge:'Richtig oder falsch',cloze:'Lücke ergänzen'};
export function renderGrammarExercise(session){const {item,exercise:e,selected,feedback}=session.current;return `<div class="session-page"><div class="session-top"><button class="icon-btn" data-action="exit" aria-label="Lernrunde beenden">×</button><div class="bar" role="progressbar" aria-label="Fortschritt der Lernrunde" aria-valuenow="${session.index}" aria-valuemin="0" aria-valuemax="${session.queue.length}"><span style="width:${session.index/session.queue.length*100}%"></span></div><span class="session-count">${session.index+1} / ${session.queue.length}</span></div><section class="exercise grammar-exercise"><div class="exercise-head"><span>LEKTION ${String(item.lesson).padStart(2,'0')} · ${esc(modeLabel[e.mode])}</span><button class="text-button" data-learning-card="${esc(item.card)}">Lernkarte ${esc(item.card)} ↗</button></div><p class="grammar-topic">${esc(item.topic)}</p><h1>${esc(e.question)}</h1><div class="grammar-prompt">${display(e.prompt)}</div>${e.claim?`<p class="grammar-claim">${esc(e.claim)}</p>`:''}${e.mode==='cloze'&&item.hint?`<p class="source-note">${esc(item.hint)}</p>`:''}<div class="choices grammar-choices">${e.options.map((o,i)=>`<button class="choice ${e.hebrewOptions?'hebrew':''} ${selected===i?'selected':''} ${feedback&&i===e.correct?'correct':''} ${feedback&&!feedback.correct&&selected===i?'incorrect':''}" ${e.hebrewOptions?'lang="he" dir="rtl"':''} data-choice="${i}" aria-pressed="${selected===i}" ${feedback?'disabled':''}>${esc(o)}</button>`).join('')}</div></section>${feedback?`<section class="feedback ${feedback.correct?'':'wrong'}" role="status"><h2>${feedback.correct?'Das passt.':'Noch einmal in Ruhe.'}</h2><p>${display(item.form)} — ${esc(item.answer)}</p><p class="note">${esc(item.note)}</p><button class="text-button" data-learning-card="${esc(item.card)}">In Lernkarte ${esc(item.card)} nachlesen ↗</button></section>`:''}<div class="session-actions">${feedback?`<span></span><button class="btn" data-action="next">${session.index+1===session.queue.length?'Runde abschließen':'Weiter →'}</button>`:`<button class="btn ghost" data-action="unknown">Noch nicht gewusst</button><button class="btn" data-action="check" ${selected===null?'disabled':''}>Prüfen ✓</button>`}</div></div>`;}
export function renderGrammarDashboard({grammar,settings,progress,history}){
 const available=grammar.facts.filter(f=>f.lesson<=settings.maxLesson),seen=available.filter(f=>progress[grammarKey(f.id)]).length,answers=history.filter(h=>h.type==='grammar'),correct=answers.filter(h=>h.correct).length;
 const rows=Object.entries(grammar.lessons).filter(([n])=>Number(n)<=settings.maxLesson);
 return `<div class="page"><div class="page-heading"><div><div class="eyebrow muted">Formen erkennen. Zusammenhänge verstehen.</div><h1>Grammatik wird vertraut.</h1><p>Bestimmen, ergänzen und entscheiden – passend zu deiner Lektion.</p></div></div><section class="hero"><div class="hero-text"><div class="eyebrow">Deine Grammatikrunde</div><h2>Ein Muster.<br>Viele Formen.</h2><p>Aktueller Stoff kommt häufiger dran, ältere Formen bleiben dabei. Selten geübte Formen haben Vorrang.</p><button class="btn lime" data-action="start-grammar" ${available.length?'':'disabled'}>Grammatik üben →</button></div><div class="hero-art" aria-hidden="true"><div class="orbit"></div><span class="hebrew" lang="he" dir="rtl" style="font-size:65px">כָּתַב</span></div></section><div class="metric-grid"><div class="metric"><div class="metric-top">Grundaufgaben</div><div class="metric-value">${available.length}</div><small>mit wechselnden Varianten</small></div><div class="metric"><div class="metric-top">Schon geübt</div><div class="metric-value">${seen}</div><small>verschiedene Formen & Regeln</small></div><div class="metric"><div class="metric-top">Trefferquote</div><div class="metric-value">${answers.length?Math.round(correct/answers.length*100)+' %':'–'}</div><small>bei ${answers.length} Antworten</small></div></div>${settings.maxLesson>grammar.throughLesson?`<p class="intro-note">Grammatik ist in dieser Version bis Lektion ${grammar.throughLesson} enthalten. Du kannst den Stoff bis dahin vollständig üben.</p>`:''}<section class="panel"><h2>Dein Grammatikstoff</h2><p class="source-note">Die Übungsarten wechseln. Jede vierte Aufgabe greift früheren Stoff auf, sobald genügend Lektionen freigeschaltet sind. Die Lernkarte ist vor und nach jeder Antwort erreichbar. Kein Tageslimit.</p>${rows.map(([n,title])=>{const items=available.filter(f=>f.lesson===Number(n)),done=items.filter(f=>progress[grammarKey(f.id)]).length;return `<div class="lesson-row"><span class="lesson-index">${n.padStart(2,'0')}</span><div><div class="lesson-title">${esc(title)}</div><small>${done} / ${items.length} Grundaufgaben geübt</small></div></div>`;}).join('')}</section><p class="source-note" style="margin-top:18px">Lektionsfolge, Lernkarten und Paradigmen: Kurs von Dr. Johannes Diehl. Die Aufgaben sind eigens für Davar erstellt.</p></div>`;
}
export function showLearningCard(dialog,card,id){
 if(!card)return;
 const previous=document.activeElement;dialog.classList.add('learning-card-dialog');
 dialog.innerHTML=`<h2>Lernkarte ${esc(id)}</h2><p class="source-note">Kurs von Dr. Johannes Diehl · Original-Lernkarte · Seite ${card.page}</p><p class="source-note">Zum Vergrößern die Karte antippen. Horizontal verschieben, um die ganze Karte zu lesen.</p><div class="learning-card-scroll"><button class="learning-card-zoom" aria-label="Lernkarte vergrößern" aria-pressed="false"><img src="data:image/webp;base64,${card.image}" alt="Original-Lernkarte ${esc(id)} von Dr. Johannes Diehl"></button></div><div class="dialog-actions"><button class="btn" data-close-card>Zurück zur Aufgabe</button></div>`;
 const zoom=dialog.querySelector('.learning-card-zoom');zoom.onclick=()=>{const on=zoom.classList.toggle('zoomed');zoom.setAttribute('aria-pressed',String(on));zoom.setAttribute('aria-label',on?'Lernkarte verkleinern':'Lernkarte vergrößern');};
 dialog.querySelector('[data-close-card]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{dialog.classList.remove('learning-card-dialog');previous?.focus();},{once:true});dialog.showModal();
}
