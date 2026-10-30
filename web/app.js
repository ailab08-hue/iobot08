
    'use strict';
    /* A static client: the scheduled job reads the official sources.
       iPads fetch status.json, then a hash-named schedule only when it changes.
       All paths are relative so this works under a GitHub repository URL. */
    const ZONE='Pacific/Honolulu';
    const $=id=>document.getElementById(id);
    const key=d=>new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
    const noon=d=>new Date(d+'T12:00:00-10:00');
    const shift=(d,n)=>key(new Date(+noon(d)+n*86400000));
    const format=(d,options)=>new Intl.DateTimeFormat('en-US',{timeZone:ZONE,...options}).format(noon(d));
    const time=d=>new Intl.DateTimeFormat('en-US',{timeZone:ZONE,hour:'numeric',minute:'2-digit'}).format(new Date(d));
    let selected=key(new Date()),events=[],fetchedAt=0,verified=false,serial=0;
    let scheduleCache=null,scheduleHash='',statusCache=null;
    const LOCATIONS=['Weinberg Snack Bar','One Team Wagon','ASC Dining Hall'];
    const element=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
    const onDay=(event,date)=>event.date===date||(event.allDay&&event.date<date&&event.endDate>date);
    function rotation(date){
      const days=events.filter(e=>e.allDay&&onDay(e,date));
      const titles=days.map(e=>e.title);
      const has=pattern=>titles.some(title=>pattern.test(title));
      // Official 2026–27 Year-at-a-Glance supplements gaps in the bell feed.
      // https://www.iolani.org/uploaded/PDF/Year_at_a_Glance_2026-27.pdf
      // Bound these dates to this academic year; never infer future-year holidays.
      const academicYear=date>='2026-08-01'&&date<'2027-08-01';
      const holiday=has(/\bholiday\b|\bholy day\b|^MERRY CHRISTMAS|^HAPPY NEW YEAR/i)
        ||(academicYear&&['2027-06-11','2027-06-18','2027-07-05'].includes(date));
      if(holiday)return 'Holiday';
      if(has(/\bbreak\b|\bvacation\b/i))return 'Break';
      if(has(/\bexams?\b/i)||['2026-12-17','2026-12-18'].includes(date))return 'Exams';
      if(has(/\bPSAT\b/i))return 'PSAT';
      if(has(/\bno\s+(?:US|LS|school)\b.*\bclasses\b/i))return 'No classes';
      const letters=new Set();
      for(const event of days){
        const title=event.title.trim().replace(/[–—]/g,'-').replace(/^(?:(?:upper school|lower school|US|LS|bell|rotation|cycle|schedule)\s*[:\-]?\s*)+/i,'');
        const match=title.match(/^([A-Z])\d*\s*[- ]?\s*(?:day|schedule)\b/i)||title.match(/^day\s*[:\-]?\s*([A-Z])\b/i)||title.match(/^([A-Z])(?:\s*\((?:alt|alternate|modified|special)[^)]*\))?$/i);
        if(match)letters.add(match[1].toUpperCase());
      }
      if(letters.size)return letters.size===1?[...letters][0]+' Day':'Check day';
      if(has(/\bschedule\b/i))return 'Special schedule';
      if(events.some(e=>!e.allDay&&onDay(e,date)))return 'School day';
      if([0,6].includes(noon(date).getUTCDay()))return 'Weekend';
      if(academicYear&&(date<'2026-08-10'||date>='2027-06-04')){
        if(date>='2027-06-14'&&date<='2027-07-16')return 'Summer school';
        return 'Break';
      }
      return 'Not listed';
    }
    function bellEvents(){return events.filter(e=>!e.allDay&&onDay(e,selected)&&Number.isFinite(Date.parse(e.start))&&Number.isFinite(Date.parse(e.end))).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));}
    function timer(milliseconds){const value=Math.max(0,Math.ceil(milliseconds/1000));return [Math.floor(value/3600),Math.floor(value/60)%60,value%60].map(n=>String(n).padStart(2,'0')).join(':');}
    function liveState(){
      const now=Date.now(),bells=bellEvents();
      const fresh=verified&&now-fetchedAt<1800000&&selected===key(new Date());
      return {now,bells,fresh,current:fresh?bells.find(e=>Date.parse(e.start)<=now&&Date.parse(e.end)>now):null,next:fresh?bells.find(e=>Date.parse(e.start)>now):null};
    }
    function updateClock(){
      $('clock').textContent=' · '+time(new Date().toISOString());
      const {now,bells,fresh,current,next}=liveState(),active=current||next;
      $('live-label').textContent=current?'Happening now':next?'Up next':'Live schedule';
      $('live-name').textContent=active?active.title:selected!==key(new Date())?'Viewing another date':!verified?'Waiting for a verified refresh':!fresh?'Refresh to update':bells.length?'No more periods today':'No official period times listed';
      $('countdown').textContent=active?timer(Date.parse(current?active.end:active.start)-now):'—';
      $('live-detail').textContent=active?(current?'Until this period ends':'Until this period starts'):'Times use Hawaiʻi Standard Time.';
      for(const row of $('periods').children){
        const event=bells[Number(row.dataset.index)];if(!event)continue;
        row.classList.toggle('active',event===current);
        const label=row.querySelector('.remaining');
        label.textContent=!fresh?'':Date.parse(event.end)<=now?'Finished':event===current?'Ends in '+timer(Date.parse(event.end)-now):'Starts in '+timer(Date.parse(event.start)-now);
      }
    }
    function render(){
      $('date').value=selected;$('date-title').textContent=format(selected,{weekday:'long',month:'long',day:'numeric',year:'numeric'});$('rotation').textContent=rotation(selected);
      const monday=shift(selected,-((noon(selected).getUTCDay()+6)%7));$('week').replaceChildren();
      for(let i=0;i<7;i++){
        const date=shift(monday,i),button=element('button');button.type='button';button.setAttribute('aria-pressed',String(date===selected));
        button.append(element('span',format(date,{weekday:'short',day:'numeric'}).toUpperCase()));const label=rotation(date);button.append(element('strong',label,label.includes('Day')?'':'unknown'));button.addEventListener('click',()=>choose(date));$('week').append(button);
      }
      $('period-title').textContent='Periods · '+format(selected,{month:'short',day:'numeric'});$('periods').replaceChildren();
      const bells=bellEvents();
      if(!bells.length){
        const label=rotation(selected);
        const message=label==='Holiday'?'School holiday — no regular classes.':label==='Break'?'School break — no regular classes.':label==='Weekend'?'Weekend — no regular classes.':label==='No classes'?'No regular classes. See the official day details below.':label==='Exams'||label==='PSAT'?label+' day. Exam times are not published in the bell-schedule feed.':label==='Summer school'?'Summer school is in session; times are not published in the regular bell-schedule feed.':verified?'No timed periods were published for this date. Check the day details below.':'No verified schedule is available yet.';
        $('periods').append(element('p',message));
      }
      bells.forEach((event,index)=>{
        const row=element('article',undefined,'period');row.dataset.index=String(index);const info=element('div');info.append(element('h3',event.title));
        if(event.location)info.append(element('p',event.location));if(event.description){const detail=element('details');detail.append(element('summary','Official details'),element('p',event.description));info.append(detail);}
        const timing=element('div');timing.append(element('time',time(event.start)+' – '+time(event.end)),element('div','','remaining'));row.append(info,timing);$('periods').append(row);
      });
      $('notices').replaceChildren();const notices=events.filter(e=>e.allDay&&onDay(e,selected));
      if(!notices.length)$('notices').append(element('p','No all-day details returned for this date.'));
      notices.forEach(event=>{const note=element('article',undefined,'notice');note.append(element('h3',event.title));if(event.description)note.append(element('p',event.description));$('notices').append(note);});updateClock();
    }
    async function readJSON(url,expectedHash){
      const response=await fetch(url,{cache:'no-cache',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('Published data could not be loaded (HTTP '+response.status+').');
      const text=await response.text();
      if(expectedHash&&globalThis.crypto?.subtle){
        const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
        const hash=Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
        if(hash!==expectedHash)throw new Error('Schedule version mismatch. Please refresh.');
      }
      let value;try{value=JSON.parse(text);}catch{throw new Error('The published data is not valid JSON.');}
      if(!value||typeof value!=='object')throw new Error('The published data is invalid.');
      Object.defineProperty(value,'_offline',{value:response.headers.get('X-Iobot-Offline')==='1'});
      return value;
    }
    async function loadSchedule(){
      const status=await readJSON('./data/status.json');
      if(!/^schedule\.[a-f0-9]{16}\.json$/.test(status.scheduleFile||'')||!Number.isFinite(Date.parse(status.checkedAt)))throw new Error('The school schedule has not been published yet.');
      statusCache=status;
      if(/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(status.repoUrl||'')){$('source-link').href=status.repoUrl;$('source-link').hidden=false;}
      if(!scheduleCache||scheduleHash!==status.scheduleHash){
        const value=await readJSON('./data/'+status.scheduleFile,status.scheduleHash);
        if(!Array.isArray(value.events)||value.schemaVersion!==1)throw new Error('Invalid school-year schedule.');
        scheduleCache=value;scheduleHash=status.scheduleHash;
      }
      const range=scheduleCache.range;
      if(range){$('date').min=key(new Date(range.start));$('date').max=shift(key(new Date(range.end)),-1);}
      return {...scheduleCache,fetchedAt:status.checkedAt,offline:status._offline||!navigator.onLine,refreshError:status.scheduleError};
    }
    async function loadLunch(id,date){
      $('lunch').replaceChildren(element('p','Checking the latest bulletin…'));$('lunch-status').textContent='';
      try{
        const data=await readJSON('./data/lunch.json');if(id!==serial)return;
        $('lunch').replaceChildren();const grid=element('div',undefined,'food-grid');
        for(const location of LOCATIONS){
          const food=data.bulletinDate===date&&Array.isArray(data.items)?data.items.find(item=>item.location===location)?.food:null;
          const card=element('article');card.append(element('h3',location),element('p',food||'No confirmed menu for this date.'));grid.append(card);
        }
        $('lunch').append(grid);
        $('lunch-status').textContent=data.bulletinDate?'Bulletin dated '+format(data.bulletinDate,{month:'long',day:'numeric',year:'numeric'})+(data._offline?' · Saved offline copy':''):'No dated bulletin available.';
        if(statusCache?.lunchError)$('lunch-status').textContent+=' · The latest automatic bulletin check failed.';
      }catch{
        if(id===serial){$('lunch').replaceChildren();const grid=element('div',undefined,'food-grid');for(const location of LOCATIONS){const card=element('article');card.append(element('h3',location),element('p','Menu unavailable'));grid.append(card);}$('lunch').append(grid);$('lunch-status').textContent='The bulletin could not be loaded. Use the official bulletin link above.';}
      }
    }
    async function refresh(){
      const id=++serial,date=selected,month=date.slice(0,7);$('refresh').disabled=true;$('sync-status').textContent='Refreshing…';$('error').hidden=true;
      const lunchRequest=loadLunch(id,date);
      try{
        const data=await loadSchedule();if(id!==serial)return;
        if(!Array.isArray(data.events))throw new Error('The schedule response is invalid.');
        events=data.events;fetchedAt=Date.parse(data.fetchedAt);verified=Number.isFinite(fetchedAt)&&!data.offline&&!data.refreshError&&Date.now()-fetchedAt<1800000;
        $('sync-status').textContent=(data.offline?'Saved offline · ':data.refreshError?'Saved · refresh failed · ':'Source checked ')+time(data.fetchedAt);
        if(!verified){$('error').textContent=data.offline?'Offline: showing the saved schedule. Countdown is paused.':'Showing a saved schedule. The source has not been verified within 30 minutes; countdown is paused.';$('error').hidden=false;}
      }catch(error){if(id!==serial)return;verified=false;$('error').textContent=error.message+' Previously loaded times may be outdated.';$('error').hidden=false;$('sync-status').textContent='Refresh failed';}
      finally{if(id===serial){$('refresh').disabled=false;render();}}
      await lunchRequest;
    }
    function choose(date){if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;selected=date;render();refresh();}
    $('previous').addEventListener('click',()=>choose(shift(selected,-1)));$('next').addEventListener('click',()=>choose(shift(selected,1)));$('today').addEventListener('click',()=>choose(key(new Date())));$('date').addEventListener('change',event=>choose(event.target.value));$('refresh').addEventListener('click',refresh);
    window.addEventListener('focus',refresh);
    window.addEventListener('offline',()=>{verified=false;$('error').textContent='Offline: showing saved times. Countdown is paused.';$('error').hidden=false;updateClock();});
    window.addEventListener('online',refresh);
    if('serviceWorker' in navigator){
      navigator.serviceWorker.addEventListener('controllerchange',()=>refresh());
      navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).catch(()=>{ $('sync-status').textContent+=' · Offline setup unavailable'; });
    }
    // Spread repeat checks out after the initial load. Only the tiny status file
    // is requested when the schedule hash is unchanged.
    setTimeout(()=>{refresh();setInterval(refresh,300000);},300000+Math.random()*30000);
    setInterval(updateClock,1000);render();refresh();
  