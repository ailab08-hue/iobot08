/** A deliberately bounded iCalendar reader. Unsupported recurrence rules fail visibly. */
export type Property = { name: string; params: Record<string,string>; value: string };
export type Component = { properties: Property[] };
export const property = (event: Component, name: string) => event.properties.find(p => p.name === name);
export const properties = (event: Component, name: string) => event.properties.filter(p => p.name === name);
export function unescapeText(s: string) { return s.replace(/\\([nN,;\\])/g, (_,c) => c.toLowerCase() === 'n' ? '\n' : c); }
export function readICS(source: string): Component[] {
  if (!source.includes('BEGIN:VCALENDAR') || !source.includes('END:VCALENDAR')) throw new Error('The source did not return a complete iCalendar feed.');
  const lines = source.replace(/\r\n/g,'\n').replace(/\r/g,'\n').replace(/\n[ \t]/g,'').split('\n');
  const events: Component[]=[]; let current: Component | null=null; let depth=0;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { current={properties:[]}; depth=0; continue; }
    if (line === 'END:VEVENT') { if(current)events.push(current); current=null; continue; }
    if (!current) continue;
    if (line.startsWith('BEGIN:')) {depth++;continue;}
    if (line.startsWith('END:')) {depth--;continue;}
    if (depth)continue;
    let quoted=false, colon=-1;
    for(let i=0;i<line.length;i++){if(line[i]==='"')quoted=!quoted;if(line[i]===':'&&!quoted){colon=i;break;}}
    if(colon<0)continue;
    const parts=line.slice(0,colon).match(/(?:[^;"\n]|"[^"]*")+/g)||[];
    const name=(parts.shift()||'').toUpperCase();const params: Record<string,string>={};
    for(const part of parts){const equal=part.indexOf('=');if(equal>0)params[part.slice(0,equal).toUpperCase()]=part.slice(equal+1).replace(/^"|"$/g,'');}
    current.properties.push({name,params,value:line.slice(colon+1)});
  }
  return events;
}
export type Stamp={ day:string; hour:number; minute:number; second:number; zone:string; allDay:boolean; ms:number };
const pad=(n:number)=>String(n).padStart(2,'0');
export const addDays=(day:string,amount:number)=>new Date(Date.parse(day+'T12:00:00Z')+amount*86400000).toISOString().slice(0,10);
const dayNumber=(day:string)=>Date.parse(day+'T00:00:00Z')/86400000;
const weekday=(day:string)=>new Date(day+'T12:00:00Z').getUTCDay();
export function instant(day:string,hour:number,minute:number,second:number,zone:string) {
  const target=Date.parse(`${day}T${pad(hour)}:${pad(minute)}:${pad(second)}Z`);
  if(zone==='UTC')return target;
  if(zone==='Pacific/Honolulu')return target+36000000;
  let guess=target;
  try {
    const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    for(let i=0;i<3;i++){
      const fields: Record<string,string>={};for(const p of formatter.formatToParts(new Date(guess)))fields[p.type]=p.value;
      const wall=Date.parse(`${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}:${fields.second}Z`);
      const correction=target-wall;guess+=correction;if(correction===0)return guess;
    }
  }catch {throw new Error(`Unsupported calendar time zone: ${zone}.`);}
  throw new Error('An ambiguous calendar time could not be resolved safely.');
}
export function stamp(p: Property): Stamp {
  const match=p.value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if(!match)throw new Error(`Unsupported calendar date: ${p.value}.`);
  const [,y,m,d,h,min,sec,z]=match;const day=`${y}-${m}-${d}`;
  const allDay=!h;const zone=z?'UTC':p.params.TZID||'Pacific/Honolulu';
  const hour=Number(h||0),minute=Number(min||0),second=Number(sec||0);
  if(hour>23||minute>59||second>59||new Date(day+'T12:00:00Z').toISOString().slice(0,10)!==day)throw new Error('Invalid calendar date or time.');
  return{day,hour,minute,second,zone,allDay,ms:instant(day,hour,minute,second,zone)};
}
export function duration(event:Component,start:Stamp) {
  const end=property(event,'DTEND');if(end)return stamp(end).ms-start.ms;
  const d=property(event,'DURATION')?.value;
  if(!d)return start.allDay?86400000:0;
  const m=d.match(/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if(!m)throw new Error('Unsupported calendar duration.');
  return(Number(m[1]||0)*7*86400+Number(m[2]||0)*86400+Number(m[3]||0)*3600+Number(m[4]||0)*60+Number(m[5]||0))*1000;
}
const weekdays=['SU','MO','TU','WE','TH','FR','SA'];
function numberList(value:string|undefined) {return value?value.split(',').map(Number):[];}
function daysInMonth(day:string) {const[y,m]=day.split('-').map(Number);return new Date(Date.UTC(y,m,0)).getUTCDate();}
function dayMatches(day:string, rule:Record<string,string>, start:Stamp) {
  const [y,m,d]=day.split('-').map(Number);const[sy,sm,sd]=start.day.split('-').map(Number);
  if(rule.BYMONTH&&!numberList(rule.BYMONTH).includes(m))return false;
  if(rule.BYMONTHDAY&&!numberList(rule.BYMONTHDAY).some(n=>d===(n>0?n:daysInMonth(day)+n+1)))return false;
  if(rule.BYDAY){
    const ok=rule.BYDAY.split(',').some(token=>{
      const match=token.match(/^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/);if(!match)throw new Error('Unsupported BYDAY rule.');
      if(weekdays[weekday(day)]!==match[2])return false;
      if(!match[1])return true;
      if(rule.FREQ==='WEEKLY'||rule.FREQ==='DAILY')throw new Error('Unsupported ordinal BYDAY rule.');
      const ordinal=Number(match[1]);
      // For yearly rules without BYMONTH, the ordinal is counted within the year.
      const position=rule.FREQ==='YEARLY'&&!rule.BYMONTH?dayNumber(day)-dayNumber(`${y}-01-01`)+1:d;
      const total=rule.FREQ==='YEARLY'&&!rule.BYMONTH?dayNumber(`${y+1}-01-01`)-dayNumber(`${y}-01-01`):daysInMonth(day);
      return ordinal>0?Math.ceil(position/7)===ordinal:Math.ceil((total-position+1)/7)===-ordinal;
    });if(!ok)return false;
  }
  if(rule.FREQ==='WEEKLY'&&!rule.BYDAY&&weekday(day)!==weekday(start.day))return false;
  if(['MONTHLY','YEARLY'].includes(rule.FREQ)&&!rule.BYDAY&&!rule.BYMONTHDAY&&d!==sd)return false;
  if(rule.FREQ==='YEARLY'&&!rule.BYMONTH&&!rule.BYDAY&&!rule.BYMONTHDAY&&m!==sm)return false;
  const interval=Number(rule.INTERVAL||1);
  if(!Number.isInteger(interval)||interval<1)throw new Error('Invalid recurrence interval.');
  if(rule.FREQ==='DAILY')return (dayNumber(day)-dayNumber(start.day))%interval===0;
  if(rule.FREQ==='WEEKLY'){
    const wkst=weekdays.indexOf(rule.WKST||'MO');if(wkst<0)throw new Error('Invalid week start.');
    const anchor=dayNumber(start.day)-(weekday(start.day)-wkst+7)%7;
    return Math.floor((dayNumber(day)-anchor)/7)%interval===0;
  }
  if(rule.FREQ==='MONTHLY')return ((y-sy)*12+m-sm)%interval===0;
  return (y-sy)%interval===0;
}
export function occurrences(event:Component, limit:Date, earliest?:Date): Stamp[] {
  const p=property(event,'DTSTART');if(!p)throw new Error('A calendar event has no start date.');
  const start=stamp(p);const ruleText=property(event,'RRULE')?.value;
  const result:Stamp[]=[];
  const lower=earliest?+earliest:-Infinity;
  if(!ruleText)result.push(start);
  else {
    const rule=Object.fromEntries(ruleText.split(';').map(pair=>pair.split('=')));
    const allowed=['FREQ','INTERVAL','BYDAY','BYMONTH','BYMONTHDAY','BYSETPOS','WKST','UNTIL','COUNT'];
    if(Object.keys(rule).some(k=>!allowed.includes(k))||!['DAILY','WEEKLY','MONTHLY','YEARLY'].includes(rule.FREQ))throw new Error('The feed uses a recurrence rule this app cannot safely expand.');
    if(properties(event,'RRULE').length>1||property(event,'EXRULE'))throw new Error('Multiple or excluded recurrence rules are unsupported.');
    const until=rule.UNTIL?stamp({...p,value:rule.UNTIL}):null;
    const maxCount=rule.COUNT?Number(rule.COUNT):Infinity;
    if(maxCount<=0||(maxCount!==Infinity&&!Number.isInteger(maxCount)))throw new Error('Invalid recurrence count.');
    const wkst=weekdays.indexOf(rule.WKST||'MO');if(wkst<0)throw new Error('Invalid week start.');
    const groupKey=(day:string)=>rule.FREQ==='MONTHLY'?day.slice(0,7):rule.FREQ==='YEARLY'?day.slice(0,4):addDays(day,-(weekday(day)-wkst+7)%7);
    const groupStart=(day:string)=>rule.FREQ==='MONTHLY'?day.slice(0,7)+'-01':rule.FREQ==='YEARLY'?day.slice(0,4)+'-01-01':groupKey(day);
    const groupEnd=(day:string)=>rule.FREQ==='MONTHLY'?`${day.slice(0,7)}-${daysInMonth(day)}`:rule.FREQ==='YEARLY'?day.slice(0,4)+'-12-31':addDays(groupKey(day),6);
    if(rule.BYSETPOS&&!['MONTHLY','YEARLY','WEEKLY'].includes(rule.FREQ))throw new Error('Unsupported BYSETPOS frequency.');
    const positions=numberList(rule.BYSETPOS);
    if(positions.some(n=>!n||!Number.isInteger(n)))throw new Error('Invalid BYSETPOS rule.');
    let count=0;let done=false;
    function consume(day:string){
      const next={...start,day,ms:instant(day,start.hour,start.minute,start.second,start.zone)};
      if(until&&next.ms>until.ms){done=true;return;}
      if(++count>maxCount){done=true;return;}
      if(next.ms>=lower&&next.ms<+limit)result.push(next);
      if(count===maxCount)done=true;
    }
    // COUNT includes DTSTART and excluded instances. Never restart counting at
    // the query month. Rules without COUNT can jump directly to the window.
    consume(start.day);
    let scanStart=start.day;
    if(earliest&&!rule.COUNT){
      const windowDay=addDays(earliest.toISOString().slice(0,10),-1);
      scanStart=rule.BYSETPOS?groupStart(windowDay):windowDay;
      if(scanStart<start.day)scanStart=start.day;
    }
    let scanEnd=addDays(limit.toISOString().slice(0,10),1);
    if(until&&until.day<scanEnd)scanEnd=addDays(until.day,1);
    if(rule.BYSETPOS)scanEnd=groupEnd(scanEnd);
    if(dayNumber(scanEnd)-dayNumber(scanStart)>150000)throw new Error('Calendar recurrence exceeds the safe date range.');
    if(until&&until.ms<lower)done=true;
    let group:string[]=[];let key='';
    function flush(){
      const selected=new Set<string>();
      for(const n of positions){const item=group[n>0?n-1:group.length+n];if(item)selected.add(item);}
      for(const day of [...selected].sort()){if(day!==start.day&&!done)consume(day);}
      group=[];
    }
    for(let day=scanStart;day<=scanEnd&&!done;day=addDays(day,1)){
      if(rule.BYSETPOS){const nextKey=groupKey(day);if(key&&nextKey!==key)flush();key=nextKey;if(done)break;}
      if(!dayMatches(day,rule,start))continue;
      if(rule.BYSETPOS)group.push(day);else if(day!==start.day)consume(day);
    }
    if(rule.BYSETPOS&&!done)flush();
  }
  for(const rdate of properties(event,'RDATE'))for(const value of rdate.value.split(',')) {if(value.includes('/'))throw new Error('RDATE periods are unsupported.');result.push(stamp({...rdate,value}));}
  const excluded=new Set(properties(event,'EXDATE').flatMap(p=>p.value.split(',').map(value=>stamp({...p,value}).ms)));
  return [...new Map(result.filter(s=>!excluded.has(s.ms)&&s.ms>=lower&&s.ms<+limit).map(s=>[s.ms,s])).values()];
}
