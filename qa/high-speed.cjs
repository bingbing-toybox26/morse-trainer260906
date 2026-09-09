const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_PATH||undefined});
  const page=await browser.newPage({viewport:{width:1440,height:1080}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const check=async(name,fn)=>{assert.ok(await page.evaluate(fn),name);console.log('PASS',name);};
  const setting=async(id,value)=>page.evaluate(({id,value})=>{const el=$(id);if(el.type==='checkbox')el.checked=value;else el.value=value;el.dispatchEvent(new Event('input'));},{id,value});
  const key=async(code)=>page.evaluate(code=>{const el=$('keyButton');el.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));el.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));},code);
  const tick=ms=>page.clock.runFor(ms);
  try{
    await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
    await page.clock.install();await page.clock.pauseAt(new Date());
    await check('Beginner defaults unchanged',()=>settings.threshold===180&&settings.gap===900&&settings.speed===10&&!settings.wpmSync&&settings.inputMode==='hold');
    await setting('threshold',123);await setting('gap',987);
    await setting('wpmSync',true);await setting('speed',60);
    await check('60 WPM has 20 ms units, 40 ms boundary, 60 ms commit',()=>timing().unit===20&&timing().threshold===40&&timing().gap===60&&$('threshold').disabled);
    await setting('speed',5);
    await check('5 WPM has 240 ms units and 720 ms commit',()=>timing().unit===240&&timing().gap===720);
    await setting('wpmSync',false);
    await check('Manual timings survive WPM sync',()=>settings.threshold===123&&settings.gap===987&&timing().gap===987&&!$('gap').disabled);
    await setting('speed',60);await setting('wpmSync',true);await setting('autoCommit',false);
    await page.evaluate(()=>beginPress('test'));await tick(39);await page.evaluate(()=>endPress('test'));
    await check('Below boundary is a dot',()=>state.code==='.');
    await key('Escape');await page.evaluate(()=>beginPress('test'));await tick(40);await page.evaluate(()=>endPress('test'));
    await check('At boundary is a dash',()=>state.code==='-');
    await key('Escape');await setting('inputMode','separate');
    const codes=await page.evaluate(()=>CODES);
    for(const [letter,code] of Object.entries(codes)){
      for(const c of code)await key(c==='.'?'KeyF':'KeyJ');
      await tick(500);
      assert.equal(await page.evaluate(()=>LETTERS[state.code]),letter);
      await key('Enter');
      assert.equal(await page.evaluate(()=>state.history[0].letter),letter);
    }
    console.log('PASS all 26 letters from queued F/J at 60 WPM');
    await setting('autoCommit',true);
    await key('KeyF');await key('KeyJ');await tick(110);
    await check('Queued elements cannot auto-commit midway',()=>state.code==='.-');
    await tick(51);
    await check('Auto-commit follows last tone by 3 units',()=>!state.code&&state.history[0].letter==='A');
    await setting('autoCommit',false);
    await page.evaluate(()=>{const el=$('keyButton');el.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyF',bubbles:true}));el.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyF',repeat:true,bubbles:true}));});
    await tick(400);await check('Held F never repeats or becomes a dash',()=>state.code==='.');
    await key('Escape');
    await page.evaluate(()=>{$('speed').dispatchEvent(new KeyboardEvent('keydown',{code:'KeyJ',bubbles:true}));});
    await tick(100);await check('Settings retain normal keyboard editing',()=>!state.code&&!keyer.active);
    await key('KeyJ');await key('KeyF');await tick(10);await key('Escape');await tick(500);
    await check('Escape cancels the active tone and queue',()=>!state.code&&!keyer.active&&!keyer.queue.length&&!voice);
    await key('KeyJ');await tick(10);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await tick(500);
    await check('Blur cancels queued input',()=>!state.code&&!state.pressed&&!keyer.active&&!voice);
    await key('KeyJ');await tick(10);await setting('speed',40);await tick(500);
    await check('Speed change cancels active symbol without a phantom input',()=>!state.code&&!keyer.active&&!voice);
    await page.evaluate(()=>setMode('receive'));await key('KeyF');await tick(500);
    await check('F/J cannot enter Morse in receive mode',()=>!state.code&&!keyer.active);
    await page.evaluate(()=>{state.target='A';playTarget();});
    await check('Playback schedules one oscillator per symbol',()=>state.playing&&playbackVoices.size===2);
    await check('Audio-clock timing uses dot:dash:gap = 1:3:1',()=>{
      const [a,b]=[...playbackVoices],near=(x,y)=>Math.abs(x-y)<.00001;
      return near(a.end-a.start,.03)&&near(b.end-b.start,.09)&&near(b.start-a.end,.03);
    });
    await setting('volume',0);await setting('frequency',800);
    await page.evaluate(()=>setMode('free'));await tick(500);
    await check('Mode change cancels all scheduled audio',()=>!state.playing&&playbackVoices.size===0&&!voice);
    await setting('speed',999);
    await check('Out-of-range WPM is not saved',()=>settings.speed===40);
    await page.reload();
    await check('New settings persist',()=>settings.speed===40&&settings.wpmSync&&settings.inputMode==='separate'&&settings.threshold===123&&settings.gap===987);
    await page.evaluate(()=>{localStorage.setItem('morse-room-settings-v1',JSON.stringify({speed:999,threshold:0,gap:-1,inputMode:'bad',wpmSync:'yes'}));});
    await page.reload();
    await check('Invalid saved values fall back to defaults',()=>settings.speed===10&&settings.threshold===180&&settings.gap===900&&settings.inputMode==='hold'&&!settings.wpmSync);
    await page.locator('.settings').evaluate(el=>el.open=true);
    for(const width of [320,390,768,1440]){
      await page.setViewportSize({width,height:900});
      await check('Settings fit viewport '+width,()=>document.documentElement.scrollWidth<=innerWidth);
    }
    await page.setViewportSize({width:390,height:900});
    await page.screenshot({path:path.resolve(__dirname,'../tests/high-speed-mobile.png'),fullPage:true});
    assert.deepEqual(errors,[]);console.log('PASS no browser errors');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

