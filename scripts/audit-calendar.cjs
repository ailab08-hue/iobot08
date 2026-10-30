// Audit the browser's labels against the generated official school-year data.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const data=JSON.parse(fs.readFileSync('.data/schedule.json','utf8'));
const source=fs.readFileSync('web/app.js','utf8');
const context={Intl,Date,document:{getElementById(){return {};}}};
vm.createContext(context);vm.runInContext(source.slice(0,source.indexOf("    $('previous').addEventListener")),context);
vm.runInContext('events='+JSON.stringify(data.events),context);
const rows=[],counts={};
for(let day=new Date(data.range.start);day<new Date(data.range.end);day.setUTCDate(day.getUTCDate()+1)){
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Pacific/Honolulu'}).format(day);
 if([0,6].includes(new Date(date+'T12:00:00-10:00').getUTCDay()))continue;
 const label=vm.runInContext(`rotation('${date}')`,context);
 const events=data.events.filter(e=>e.date===date||(e.allDay&&e.date<date&&e.endDate>date));
 const periods=events.filter(e=>!e.allDay).length;
 rows.push({date,label,periods,details:events.filter(e=>e.allDay).map(e=>e.title).join(' | ')});
 counts[label]=(counts[label]||0)+1;
}
fs.writeFileSync('calendar-audit.json',JSON.stringify({schoolYear:data.schoolYear,weekdays:rows.length,counts,days:rows},null,2)+'\n');
const gaps=rows.filter(row=>['Not listed','Check day'].includes(row.label)||(/^[A-Z] Day$/.test(row.label)&&!row.periods));
console.log(JSON.stringify({weekdays:rows.length,counts,gaps},null,2));
assert.equal(gaps.length,0,'Unclassified weekdays or rotation days without period times');
