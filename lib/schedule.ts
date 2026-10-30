export const FEED_URL = 'https://calendar.google.com/calendar/ical/iolani.org_ds7482aj4fh4uortauf8vuquso%40group.calendar.google.com/public/basic.ics';
export const ZONE = 'Pacific/Honolulu';
export type BellEvent = { id: string; title: string; description: string; location: string; date: string; endDate: string; start: string | null; end: string | null; allDay: boolean; special: boolean; derived?: boolean };
const schoolDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
export function localDate(date: Date) {
  return schoolDateFormatter.format(date);
}
export function plainText(value: string) {
  return value.replace(/<br\s*\/?\s*>|<\/(?:p|div|li)>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}
// Only explicit time ranges are converted to bells. Never guess a rotating timetable.
export function descriptionBells(event: BellEvent): BellEvent[] {
  const text = event.description;
  const pattern = /(\d{1,2}[:.]\d{2})\s*([ap]\.?m\.?)?\s*[-–—]\s*(\d{1,2}[:.]\d{2})\s*([ap]\.?m\.?)?/gi;
  const found = [...text.matchAll(pattern)];
  let previous = 0;
  return found.flatMap((match, index) => {
    const minutes = (time: string, meridiem?: string) => {
      let [hour, minute] = time.split(/[:.]/).map(Number);
      if (hour > 23 || minute > 59) return NaN;
      if (meridiem) { if (hour > 12 || hour < 1) return NaN; hour %= 12; if (meridiem.toLowerCase().startsWith('p')) hour += 12; }
      return hour * 60 + minute;
    };
    let start = minutes(match[1], match[2]);
    let end = minutes(match[3], match[4]);
    // In a school timetable, unmarked 1:00 follows 12:00. Also handle 11:30–1:00 pm.
    if (!match[2] && start < 7 * 60) start += 720;
    if (!match[4] && end < 7 * 60) end += 720;
    if (!match[2] && match[4] && end < start && start >= 720) start -= 720;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end > 1440) return [];
    const at = match.index!;
    const lineStart = text.lastIndexOf('\n', at) + 1;
    const lineEnd = text.indexOf('\n', at + match[0].length);
    const prefix = text.slice(Math.max(lineStart, previous), at).trim().replace(/[:|\-–—]+$/, '').trim();
    const suffix = text.slice(at + match[0].length, lineEnd < 0 ? text.length : lineEnd).trim().replace(/^[:|\-–—]+/, '').trim();
    const label = prefix || suffix;
    previous = at + match[0].length;
    if (!label) return [];
    const iso = (m: number) => `${event.date}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00-10:00`;
    return [{ ...event, id: `${event.id}:bell:${index}`, title: label, description: `From the official description of “${event.title}”.`, start: iso(start), end: iso(end), allDay: false, derived: true }];
  });
}
import { readICS, property, stamp, duration, occurrences, unescapeText, type Component } from './ical';
export function parseCalendar(text: string, from: Date, to: Date): BellEvent[] {
  const components=readICS(text);
  const prop=(c:Component,key:string)=>unescapeText(property(c,key)?.value||'');
  const output:BellEvent[]=[];
  function emit(component:Component,start:number,end:number,allDay:boolean,id:string){
    if(prop(component,'STATUS')==='CANCELLED'||start>=+to||Math.max(end,start+1)<=+from)return;
    const title=plainText(prop(component,'SUMMARY')||'School event');
    const row:BellEvent={id,title,description:plainText(prop(component,'DESCRIPTION')),location:plainText(prop(component,'LOCATION')),date:localDate(new Date(start)),endDate:localDate(new Date(end)),start:allDay?null:new Date(start).toISOString(),end:allDay?null:new Date(end).toISOString(),allDay,special:/\balt\b|alternate|assembl|chapel|special|modified|community|holiday|no school|break|vacation/i.test(title)};
    output.push(row);if(allDay)output.push(...descriptionBells(row));
  }
  // Google feeds can contain revisions. The latest SEQUENCE/LAST-MODIFIED wins per UID/instance.
  const latest=new Map<string,Component>();
  for(const component of components){const uid=prop(component,'UID');if(!uid)throw new Error('A calendar event is missing its UID.');const key=uid+':'+prop(component,'RECURRENCE-ID');const old=latest.get(key);if(!old||Number(prop(component,'SEQUENCE')||0)>Number(prop(old,'SEQUENCE')||0)||(Number(prop(component,'SEQUENCE')||0)===Number(prop(old,'SEQUENCE')||0)&&prop(component,'LAST-MODIFIED')>=prop(old,'LAST-MODIFIED')))latest.set(key,component);}
  // Index each series once. Scanning all VEVENTs for each UID made large school
  // archives quadratic and exhausted the production Worker's CPU allowance.
  const masters=new Map<string,Component>();
  const exceptionsByUid=new Map<string,Component[]>();
  for(const component of latest.values()){
    const uid=prop(component,'UID');
    if(property(component,'RECURRENCE-ID')){
      const group=exceptionsByUid.get(uid)||[];group.push(component);exceptionsByUid.set(uid,group);
    }else masters.set(uid,component);
  }
  for(const [uid,component] of masters){
    if(prop(component,'STATUS')==='CANCELLED')continue;
    const startProperty=property(component,'DTSTART');if(!startProperty)throw new Error('A calendar event has no start date.');
    const start=stamp(startProperty);const length=duration(component,start);
    if(length<0)throw new Error('A calendar event ends before it starts.');
    const exceptions=exceptionsByUid.get(uid)||[];
    const replaced=new Set<number>();
    for(const exception of exceptions){
      const recurrence=property(exception,'RECURRENCE-ID')!;
      if(recurrence.params.RANGE)throw new Error('THISANDFUTURE recurrence exceptions are unsupported.');
      replaced.add(stamp(recurrence).ms);
    }
    if(!property(component,'RRULE')&&!property(component,'RDATE')&&!property(component,'EXDATE')){
      if(!replaced.has(start.ms))emit(component,start.ms,start.ms+length,start.allDay,`${uid}:${start.ms}`);
      continue;
    }
    for(const occurrence of occurrences(component,to,new Date(+from-length))){
      if(!replaced.has(occurrence.ms))emit(component,occurrence.ms,occurrence.ms+length,start.allDay,`${uid}:${occurrence.ms}`);
    }
  }
  // Moved instances are processed separately so moves into this month survive.
  for(const [uid,exceptions] of exceptionsByUid){
    const master=masters.get(uid);
    if(master&&prop(master,'STATUS')==='CANCELLED')continue;
    for(const component of exceptions){
      if(prop(component,'STATUS')==='CANCELLED')continue;
      const p=property(component,'DTSTART');if(!p)throw new Error('A recurrence exception has no start date.');
      const start=stamp(p);
      const inherited=master?{properties:[...component.properties,...master.properties.filter(p=>!component.properties.some(q=>q.name===p.name)&&!['DTSTART','DTEND','DURATION','RRULE','RDATE','EXDATE','RECURRENCE-ID'].includes(p.name))]}:component;
      const length=property(component,'DTEND')||property(component,'DURATION')?duration(component,start):master?duration(master,stamp(property(master,'DTSTART')!)):start.allDay?86400000:0;
      emit(inherited,start.ms,start.ms+length,start.allDay,`${uid}:${prop(component,'RECURRENCE-ID')}`);
    }
  }
  return [...new Map(output.map(e=>[e.id,e])).values()].sort((a,b)=>Date.parse(a.start||a.date+'T00:00:00-10:00')-Date.parse(b.start||b.date+'T00:00:00-10:00'));
}
