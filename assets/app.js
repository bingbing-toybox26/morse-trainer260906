'use strict';
const CODES={A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',J:'.---',K:'-.-',L:'.-..',M:'--',N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',S:'...',T:'-',U:'..-',V:'...-',W:'.--',X:'-..-',Y:'-.--',Z:'--..'};
const LETTERS=Object.fromEntries(Object.entries(CODES).map(([a,b])=>[b,a]));
const $=id=>document.getElementById(id);
const pretty=(code='')=>code.replaceAll('.','・').replaceAll('-','－');
const state={mode:'free',code:'',target:'',pressed:false,invalid:false,source:null,pressTime:0,timer:0,frame:0,playing:false,playTimers:[],playToken:0,roundDone:false,history:[],count:0,stats:{send:{correct:0,total:0},receive:{correct:0,total:0}}};
const settings={threshold:180,gap:900,frequency:600,volume:35,pool:'all',speed:10,autoCommit:true,hideTree:false,showGuide:true};
try{const saved=JSON.parse(localStorage.getItem('morse-room-settings-v1')||'{}');for(const id of ['threshold','gap','frequency','volume','speed']){const n=Number(saved[id]);const bounds={threshold:[120,400],gap:[400,2000],frequency:[300,1000],volume:[0,100],speed:[6,20]}[id];if(Number.isFinite(n)&&n>=bounds[0]&&n<=bounds[1])settings[id]=n;}for(const id of ['autoCommit','hideTree','showGuide'])if(typeof saved[id]==='boolean')settings[id]=saved[id];if(['all','basic','short'].includes(saved.pool))settings.pool=saved.pool;}catch{}
let audioContext=null,voice=null;
function audioReady(){try{audioContext ||= new (window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume().catch(()=>audioError());return audioContext;}catch{audioError();return null;}}
function audioError(){feedback('音声を開始できませんでした。ブラウザの音声設定を確認してください。','bad');}
function startTone(){stopTone();const ctx=audioReady();if(!ctx)return;const oscillator=ctx.createOscillator(),gain=ctx.createGain();oscillator.type='sine';oscillator.frequency.value=settings.frequency;gain.gain.setValueAtTime(0,ctx.currentTime);gain.gain.linearRampToValueAtTime(settings.volume/100*.22,ctx.currentTime+.006);oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start();voice={oscillator,gain};}
function stopTone(){if(!voice)return;const v=voice;voice=null;try{const t=audioContext.currentTime;v.gain.gain.cancelScheduledValues(t);v.gain.gain.setValueAtTime(v.gain.gain.value,t);v.gain.gain.linearRampToValueAtTime(0,t+.008);v.oscillator.stop(t+.012);v.oscillator.onended=()=>{v.oscillator.disconnect();v.gain.disconnect();};}catch{}}
function signal(on){$('signalLed').classList.toggle('on',on);$('boardStatus').textContent=on?'SIGNAL ON':state.playing?'LISTENING…':'READY TO TRANSMIT';}
const svgNS='http://www.w3.org/2000/svg';
function svgEl(name,attrs,parent){const el=document.createElementNS(svgNS,name);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);parent.append(el);return el;}
let compactTree=false, treeWidth=850, displayedCode='';
function position(code){
  const tail=compactTree?code.slice(1):code;
  let index=0;
  for(const ch of tail)index=index*2+(ch==='-'?1:0);
  if(compactTree)return {x:8+(index+.5)*(treeWidth-16)/2**tail.length,y:46+tail.length*57+(code[0]==='-'?235:0)};
  return {x:28+(index+.5)*794/2**code.length,y:26+code.length*70};
}
function buildTree(){const svg=$('tree');svg.replaceChildren();svg.setAttribute('viewBox',compactTree?'0 0 '+treeWidth+' 478':'0 0 850 340');
if(compactTree){
  for(const [y,label] of [[15,'START · 短点から'],[250,'START − 長点から']]){
    const root=svgEl('g',{class:'tree-root'},svg);
    svgEl('text',{x:treeWidth/2,y},root).textContent=label;
  }
}else{
  const root=svgEl('g',{class:'tree-root'},svg);
  svgEl('circle',{cx:425,cy:26,r:4},root);
  svgEl('text',{x:425,y:10},root).textContent='START';
}const codes=Object.keys(LETTERS).sort((a,b)=>a.length-b.length||a.localeCompare(b));for(const code of codes){if(compactTree&&code.length===1)continue;const p=position(code.slice(0,-1)),q=position(code);svgEl('path',{d:`M ${p.x} ${p.y+9} V ${p.y+29} H ${q.x} V ${q.y-18}`,class:'edge','data-code':code},svg);if(code.length===1)svgEl('text',{x:(p.x+q.x)/2,y:p.y+21,class:'branch-label'},svg).textContent=code==='.'?'・ 短点':'－ 長点';}for(const code of codes){const p=position(code),g=svgEl('g',{class:'node','data-code':code},svg);svgEl('title',{},g).textContent=LETTERS[code]+' '+pretty(code);if(code.endsWith('.'))svgEl('circle',{cx:p.x,cy:p.y,r:compactTree?14:17},g);else svgEl('rect',{x:p.x-(compactTree?14:18),y:p.y-16,width:compactTree?28:36,height:32,rx:3},g);svgEl('text',{x:p.x,y:p.y},g).textContent=LETTERS[code];}}
function renderTree(code=state.code){displayedCode=code;document.querySelectorAll('.node').forEach(el=>{const c=el.dataset.code;el.classList.toggle('trail',code.startsWith(c));el.classList.toggle('current',code===c);});document.querySelectorAll('.edge').forEach(el=>el.classList.toggle('active',code.startsWith(el.dataset.code)));}
function renderCover(){const concealed=settings.hideTree||(state.mode==='receive'&&!state.roundDone);$('blindCover').hidden=!concealed;$('tree').style.visibility=concealed?'hidden':'visible';$('tree').setAttribute('aria-hidden',String(concealed));$('coverTitle').textContent=state.mode==='receive'&&!state.roundDone?'耳をすませて、音を見つけよう。':'頭の中で、道をたどろう。';$('coverDesc').innerHTML=state.mode==='receive'&&!state.roundDone?'聞こえた文字を A–Z で回答してください。<br>何度でも、もう一度聞くことができます。':'ツリーを隠して練習中です。<br>音とリズムを頼りに入力してみましょう。';}
function feedback(text,type=''){syncKeyPanel();$('feedback').textContent=text;$('feedback').className='feedback'+(type?' '+type:'');}
function renderInput(){syncKeyPanel();renderTree();if(state.mode==='free'){$('letter').textContent=state.code?(settings.hideTree?'?':LETTERS[state.code]||'?'):'—';$('symbols').textContent=state.code?pretty(state.code):'···';}else if(state.mode==='send'){$('symbols').textContent=state.code?pretty(state.code):(settings.showGuide?pretty(CODES[state.target]):'···');}$('mainAction').disabled=state.mode==='free'&&!state.code;$('commitAction').disabled=!state.code||state.playing||state.roundDone;}
function clearTimer(){clearTimeout(state.timer);state.timer=0;}
function resetInput(){clearTimer();state.code='';state.invalid=false;renderInput();$('holdMeter').style.width='0%';}
function armCommit(){clearTimer();if(settings.autoCommit&&state.code&&!state.pressed&&!state.invalid)state.timer=setTimeout(commit,settings.gap);}
function beginPress(source){if(document.hidden||state.pressed||state.playing||state.mode==='receive'||(state.mode==='send'&&state.roundDone))return;audioReady();clearTimer();state.pressed=true;state.source=source;state.pressTime=performance.now();$('keyButton').classList.add('pressed');startTone();signal(true);syncKeyPanel();function animate(){if(!state.pressed)return;const elapsed=performance.now()-state.pressTime;$('holdMeter').style.width=Math.min(100,elapsed/settings.threshold*60)+'%';$('keyTitle').textContent=elapsed>=settings.threshold?'長点 －':'短点 ・';$('dockSymbols').textContent=$('keyTitle').textContent;state.frame=requestAnimationFrame(animate);}animate();}
function endPress(source,cancel=false){if(!state.pressed||(source&&state.source!==source))return;const duration=performance.now()-state.pressTime;state.pressed=false;state.source=null;cancelAnimationFrame(state.frame);stopTone();signal(false);$('keyButton').classList.remove('pressed');$('holdMeter').style.width='0%';$('keyTitle').textContent='押す長さで、音が変わる。';if(cancel){syncKeyPanel();armCommit();return;}const symbol=duration>=settings.threshold?'-':'.';const next=state.code+symbol;if(!LETTERS[next]){state.invalid=true;feedback('この先に英字はありません。⌫ で戻すか、Enter で確定してください。','bad');armCommit();return;}state.invalid=false;state.code=next;renderInput();feedback('入力：'+pretty(state.code)+(settings.autoCommit?'　少し待つと確定します。':'　Enter または「文字を確定」で確定。'));armCommit();}
function undo(){if(state.pressed||state.playing||state.mode==='receive'||state.roundDone)return;clearTimer();state.invalid=false;state.code=state.code.slice(0,-1);renderInput();feedback('1符号戻しました。続けて入力できます。');armCommit();}
function addHistory(letter,code){state.count++;state.history.unshift({letter,code});state.history=state.history.slice(0,18);renderHistory();$('sessionCount').textContent=String(state.count).padStart(2,'0');}
function renderHistory(){const h=$('history');h.replaceChildren();if(!state.history.length){const el=document.createElement('span');el.className='history-placeholder';el.textContent='ここに、あなたが打った文字が並びます。';h.append(el);}for(const entry of state.history){const el=document.createElement('div');el.className='history-item';const b=document.createElement('b'),small=document.createElement('small');b.textContent=entry.letter;small.textContent=pretty(entry.code);el.append(b,small);h.append(el);}}
function renderStats(){const s=state.stats[state.mode];$('stats').hidden=!s;if(s){$('correctCount').textContent=s.correct;$('attemptCount').textContent=s.total;$('accuracy').textContent=s.total?Math.round(s.correct/s.total*100)+'%':'—';}}
function commit(){clearTimer();if(state.pressed||state.playing||!state.code||state.mode==='receive'||state.roundDone)return;const code=state.code,letter=LETTERS[code];addHistory(letter,code);state.code='';state.invalid=false;$('commitAction').disabled=true;if(state.mode==='free'){renderTree(code);$('letter').textContent=letter;$('symbols').textContent=pretty(code);$('mainAction').disabled=true;feedback(letter+' を確定しました。次の文字を打ってみましょう。','good');}else{const s=state.stats.send;s.total++;if(letter===state.target){s.correct++;state.roundDone=true;$('commitAction').hidden=true;feedback('正解！ '+letter+' のリズムを覚えました。','good');$('otherAction').hidden=false;$('mainAction').textContent='お手本を聞く';$('keyButton').disabled=true;renderTree(code);}else{feedback(letter+' が入力されました。'+state.target+' にもう一度挑戦！','bad');renderTree(code);}$('symbols').textContent=pretty(code);renderStats();}}
function chooseTarget(){const pool=Object.keys(CODES).filter(x=>settings.pool==='basic'?CODES[x].length<=2:settings.pool==='short'?CODES[x].length<=3:true);const candidates=pool.filter(x=>x!==state.target);state.target=candidates[Math.floor(Math.random()*candidates.length)];}
function newRound(){endPress(null,true);stopPlayback();resetInput();state.roundDone=false;$('commitAction').hidden=state.mode!=='send';chooseTarget();$('answer').value='';$('answer').disabled=false;$('answerForm').querySelector('button').disabled=false;$('otherAction').hidden=true;$('revealAction').hidden=state.mode!=='receive';$('keyButton').disabled=state.mode==='receive';$('letter').textContent=state.mode==='send'?state.target:'?';$('symbols').textContent=state.mode==='send'&&settings.showGuide?pretty(CODES[state.target]):'···';$('mainAction').textContent=state.mode==='send'?'お手本を聞く':'音を聞く';$('mainAction').disabled=false;renderCover();renderTree('');feedback(state.mode==='send'?'表示された文字を、KEY またはSpaceで打ちましょう。':'「音を聞く」を押して、聞こえた文字を回答しましょう。');renderStats();}
function stopPlayback(){state.playToken++;for(const t of state.playTimers)clearTimeout(t);state.playTimers=[];state.playing=false;stopTone();signal(false);$('mainAction').disabled=state.mode==='free'&&!state.code;$('commitAction').disabled=!state.code||state.playing||state.roundDone;syncKeyPanel();}
function playTarget(){if(state.playing||state.pressed)return;const ctx=audioReady();if(!ctx)return;clearTimer();const previousFeedback={text:$('feedback').textContent,type:$('feedback').classList.contains('good')?'good':$('feedback').classList.contains('bad')?'bad':''};state.playing=true;$('commitAction').disabled=true;const token=++state.playToken;$('mainAction').disabled=true;const code=CODES[state.target],unit=1200/settings.speed;let cursor=200;for(const ch of code){const start=cursor,duration=unit*(ch==='.'?1:3);state.playTimers.push(setTimeout(()=>{if(token!==state.playToken)return;startTone();signal(true);},start));state.playTimers.push(setTimeout(()=>{if(token!==state.playToken)return;stopTone();signal(false);},start+duration));cursor+=duration+unit;}state.playTimers.push(setTimeout(()=>{if(token!==state.playToken)return;state.playing=false;state.playTimers=[];signal(false);$('mainAction').disabled=false;$('mainAction').textContent=state.mode==='receive'?'もう一度聞く':'お手本を聞く';if(state.mode==='receive'&&!state.roundDone){feedback('聞こえた文字を入力してください。もう一度聞くこともできます。');$('answer').focus({preventScroll:true});}else{feedback(previousFeedback.text,previousFeedback.type);$('commitAction').disabled=!state.code||state.roundDone;armCommit();}},cursor));feedback('再生中… 音の長さと間隔を聞いてみましょう。');}
function answerReceive(reveal=false){if(state.roundDone)return;const answer=$('answer').value.trim().toUpperCase();if(!reveal&&!/^[A-Z]$/.test(answer)){feedback('A から Z の英字を1文字入力してください。','bad');return;}stopPlayback();state.roundDone=true;const s=state.stats.receive;s.total++;const good=!reveal&&answer===state.target;if(good)s.correct++;$('letter').textContent=state.target;$('symbols').textContent=pretty(CODES[state.target]);feedback(reveal?'答えは '+state.target+'。音をもう一度聞いて覚えましょう。':good?'正解！ 音を聞き分けられました。':'入力は '+answer+'。正解は '+state.target+' でした。',good?'good':reveal?'':'bad');$('answer').disabled=true;$('answerForm').querySelector('button').disabled=true;$('otherAction').hidden=false;$('revealAction').hidden=true;renderCover();renderTree(CODES[state.target]);renderStats();}
function setMode(mode){document.body.dataset.mode=mode;endPress(null,true);stopPlayback();state.mode=mode;state.roundDone=false;resetInput();document.querySelectorAll('.tab').forEach(b=>{const active=b.dataset.mode===mode;b.classList.toggle('active',active);b.setAttribute('aria-selected',active);if(active)$('practicePanel').setAttribute('aria-labelledby',b.id);b.tabIndex=active?0:-1;});$('answerForm').hidden=mode!=='receive';$('commitAction').hidden=mode!=='send';$('guideRow').hidden=mode!=='send';$('revealAction').hidden=mode!=='receive';$('otherAction').hidden=true;const info={free:['FREE PLAY','自分のペースで','まずは、打ってみよう。','KEY またはスペースキーで音が鳴ります。<br>指を離すと、ツリーが一歩進みます。','CURRENT LETTER'],send:['TRANSMIT PRACTICE','文字 → 符号','この文字、打てるかな？','表示された文字をモールスで入力。<br>お手本の音も聞いてみましょう。','YOUR TARGET'],receive:['LISTENING PRACTICE','音 → 文字','耳で、文字を見つけよう。','モールス音を聞いて、英字で回答。<br>何度聞いても大丈夫です。','MYSTERY LETTER']}[mode];['modeKicker','modeBadge','panelTitle','panelDesc','readoutLabel'].forEach((id,i)=>$(id).innerHTML=info[i]);$('keyButton').disabled=mode==='receive';$('keyHelp').innerHTML=mode==='receive'?'「音を聞く」で再生します。<br>回答欄に英字を入力して Enter。':'短押し ・ ／ 長押し －<br>'+(settings.autoCommit?'ひと呼吸おくと、1文字が確定します。':'Enter で1文字を確定します。');if(mode==='free'){$('mainAction').textContent='文字を確定 ↵';feedback('短点・長点を組み合わせてみましょう。');renderInput();renderCover();renderStats();}else newRound();}
function saveSettings(){try{localStorage.setItem('morse-room-settings-v1',JSON.stringify(settings));}catch{}}
function updateSettings(){for(const id of ['threshold','gap','frequency','volume']){$(id).value=settings[id];$(id+'Value').textContent=settings[id]+(id==='frequency'?' Hz':id==='volume'?' %':' ms');}for(const id of ['autoCommit','hideTree','showGuide'])$(id).checked=settings[id];$('pool').value=settings.pool;$('speed').value=settings.speed;}
for(const id of Object.keys(settings)){$(id).addEventListener('input',()=>{const el=$(id);settings[id]=el.type==='checkbox'?el.checked:id==='pool'?el.value:Number(el.value);saveSettings();updateSettings();if(id==='hideTree'){renderCover();if(state.code)renderInput();}if(id==='showGuide'&&state.mode==='send'&&!state.code)$('symbols').textContent=settings.showGuide?pretty(CODES[state.target]):'···';if(id==='pool'&&state.mode!=='free')newRound();if(id==='autoCommit'||id==='gap'){armCommit();if(state.mode!=='receive')$('keyHelp').innerHTML='短押し ・ ／ 長押し －<br>'+(settings.autoCommit?'ひと呼吸おくと、1文字が確定します。':'Enter で1文字を確定します。');}if(voice&&id==='volume')voice.gain.gain.setTargetAtTime(settings.volume/100*.22,audioContext.currentTime,.01);if(voice&&id==='frequency')voice.oscillator.frequency.setTargetAtTime(settings.frequency,audioContext.currentTime,.01);});}
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
$('commitAction').addEventListener('click',commit);$('mainAction').addEventListener('click',()=>state.mode==='free'?commit():playTarget());$('otherAction').addEventListener('click',newRound);$('answerForm').addEventListener('submit',e=>{e.preventDefault();answerReceive();});$('revealAction').addEventListener('click',()=>answerReceive(true));$('undoButton').addEventListener('click',undo);$('clearButton').addEventListener('click',()=>{endPress(null,true);stopPlayback();resetInput();feedback('入力をリセットしました。');});$('clearHistory').addEventListener('click',()=>{state.history=[];renderHistory();});
// One owner per press: a second finger or keyboard event cannot end another input.
const keyButton=$('keyButton');
keyButton.addEventListener('pointerdown',e=>{
  if(e.button!==0||!e.isPrimary||state.pressed||keyButton.disabled)return;
  e.preventDefault();
  keyButton.focus({preventScroll:true});
  beginPress('pointer:'+e.pointerId);
  if(state.source==='pointer:'+e.pointerId)keyButton.setPointerCapture(e.pointerId);
});
keyButton.addEventListener('pointerup',e=>endPress('pointer:'+e.pointerId));
keyButton.addEventListener('pointercancel',e=>endPress('pointer:'+e.pointerId,true));
keyButton.addEventListener('lostpointercapture',e=>endPress('pointer:'+e.pointerId,true));
keyButton.addEventListener('contextmenu',e=>e.preventDefault());
keyButton.addEventListener('dragstart',e=>e.preventDefault());
// KEY is handled entirely by pointer events; suppress touch compatibility gestures.
keyButton.addEventListener('touchstart',e=>e.preventDefault(),{passive:false});
// Assistive activation has no measurable hold duration, so it enters a short point.
keyButton.addEventListener('click',e=>{
  if(e.detail===0&&!state.pressed&&!keyButton.disabled){beginPress('assistive');endPress('assistive');}
});
function isEditing(el){
  return el instanceof Element&&el!==keyButton&&!!el.closest('input,select,textarea,button,a,summary,[contenteditable]:not([contenteditable="false"])');
}
document.addEventListener('keydown',e=>{
  if(e.isComposing||e.ctrlKey||e.altKey||e.metaKey)return;
  if(e.code==='Escape'){
    endPress(null,true);stopPlayback();
    if(state.mode!=='receive'){resetInput();feedback('入力をリセットしました。');}
    else if(!state.roundDone)feedback('再生を停止しました。「音を聞く」で再生できます。');
    return;
  }
  if(isEditing(e.target))return;
  if(e.code==='Space'){e.preventDefault();if(!e.repeat)beginPress('keyboard');}
  if(e.code==='Backspace'&&state.mode!=='receive'){e.preventDefault();undo();}
  if(e.code==='Enter'&&state.mode!=='receive'){
    e.preventDefault();
    if(!e.repeat){if(state.roundDone)newRound();else commit();}
  }
});
document.addEventListener('keyup',e=>{
  if(e.code==='Space'&&state.source==='keyboard'){e.preventDefault();endPress('keyboard');}
});
document.querySelectorAll('.tab').forEach((tab,index,tabs)=>tab.addEventListener('keydown',e=>{
  let next;
  if(e.key==='ArrowRight')next=(index+1)%tabs.length;
  if(e.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;
  if(e.key==='Home')next=0;
  if(e.key==='End')next=tabs.length-1;
  if(next===undefined)return;
  e.preventDefault();tabs[next].focus();setMode(tabs[next].dataset.mode);
}));
$('dockCommit').addEventListener('click',()=>state.roundDone?newRound():commit());
function syncKeyPanel(){
  const blocked=state.mode==='receive'||state.playing||state.pressed;
  $('dockLetter').textContent=state.mode==='send'?state.target:state.code?(settings.hideTree?'?':LETTERS[state.code]||'?'):'—';
  $('dockSymbols').textContent=state.code?pretty(state.code):state.roundDone?'正解！ 次の文字へ':'短く ・ ／ 長く －';
  $('dockCommit').textContent=state.roundDone?'次へ →':'確定 ↵';
  $('dockCommit').disabled=blocked||(!state.roundDone&&!state.code);
  $('undoButton').disabled=blocked||state.roundDone||!state.code;
}
function pause(){
  endPress(null,true);clearTimer();
  if(state.playing){stopPlayback();feedback('再生を停止しました。もう一度聞くには再生ボタンを押してください。');}
}
window.addEventListener('blur',pause);
window.addEventListener('pagehide',pause);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();else armCommit();});
window.addEventListener('focus',()=>armCommit());
function resizeTree(){
  const compact=matchMedia('(max-width: 1000px)').matches;
  const width=compact?Math.round($('tree').parentElement.clientWidth):850;
  if(compact!==compactTree||width!==treeWidth||!$('tree').childElementCount){
    compactTree=compact;treeWidth=width;
    const code=displayedCode;buildTree();renderTree(code);
  }
}
if('ResizeObserver' in window)new ResizeObserver(resizeTree).observe($('tree').parentElement);
else window.addEventListener('resize',resizeTree);
resizeTree();updateSettings();setMode('free');
