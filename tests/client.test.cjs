const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const {createHash,webcrypto}=require('node:crypto');
test('repeated browser checks download only status until the schedule content changes',async()=>{
 const source=fs.readFileSync('web/app.js','utf8');
 const code=source.slice(0,source.indexOf("    $('previous').addEventListener"));
 assert.ok(code.length>1000);
 let generation=0;const calls=[];
 const documents=[0,1].map(index=>JSON.stringify({schemaVersion:1,range:{start:'2026-08-01T00:00:00-10:00',end:'2027-08-01T00:00:00-10:00'},events:[{title:'Period '+index}]}));
 const hashes=documents.map(text=>createHash('sha256').update(text).digest('hex'));
 const nodes=new Map();
 const context={Intl,Date,URL,TextEncoder,AbortSignal,crypto:webcrypto,navigator:{onLine:true},document:{getElementById(id){if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}},fetch:async url=>{
  calls.push(url);
  if(url.endsWith('/status.json'))return Response.json({checkedAt:'2026-10-29T18:00:00Z',scheduleFile:'schedule.'+hashes[generation].slice(0,16)+'.json',scheduleHash:hashes[generation]});
  return new Response(documents[generation]);
 }};
 vm.createContext(context);vm.runInContext(code,context);
 await vm.runInContext('loadSchedule()',context);await vm.runInContext('loadSchedule()',context);
 assert.equal(calls.filter(url=>url.includes('/schedule.')).length,1);
 generation=1;await vm.runInContext('loadSchedule()',context);
 assert.equal(calls.filter(url=>url.includes('/schedule.')).length,2);
 assert.equal(calls.filter(url=>url.endsWith('/status.json')).length,3);
});

test('November 3 numbered schedule renders E Day in the browser rotation labels',()=>{
 const source=fs.readFileSync('web/app.js','utf8');
 const code=source.slice(0,source.indexOf("    $('previous').addEventListener"));
 const context={Intl,Date,document:{getElementById(){return {};}}};
 vm.createContext(context);vm.runInContext(code,context);
 for(const [title, expected] of [['E3 Schedule (1,2,3,4) (Grs. 9&10 Chapel)','E Day'],['F1 Schedule (7,8,5,6)','F Day'],['F2 Schedule','F Day'],['F3 Schedule','F Day']]){
  vm.runInContext(`events=[{title:${JSON.stringify(title)},allDay:true,date:'2026-11-03',endDate:'2026-11-04'}]`,context);
  assert.equal(vm.runInContext("rotation('2026-11-03')",context),expected);
  assert.equal(vm.runInContext("rotation('2026-11-04')",context),'Not listed');
 }
});

test('calendar labels holidays, breaks, exams, special schedules and weekends',()=>{
 const source=fs.readFileSync('web/app.js','utf8');
 const context={Intl,Date,document:{getElementById(){return {};}}};
 vm.createContext(context);vm.runInContext(source.slice(0,source.indexOf("    $('previous').addEventListener")),context);
 for(const [date,title,expected] of [
  ['2026-09-07','LABOR DAY SCHOOL HOLIDAY','Holiday'],
  ['2026-10-14','FALL BREAK','Break'],
  ['2026-12-25','MERRY CHRISTMAS!','Holiday'],
  ['2027-03-26','GOOD FRIDAY SCHOOL HOLY DAY','Holiday'],
  ['2027-06-01','US FINAL EXAMS','Exams'],
  ['2026-10-19','PSAT Schedule Day','PSAT'],
  ['2026-12-15','Special Christmas Schedule (7,8,5,6)','Special schedule'],
  ['2026-12-17','NO US CLASSES','Exams'],
  ['2027-02-12','NO US & LS CLASSES','No classes'],
  ['2027-06-18','','Holiday'],['2027-06-14','','Summer school'],
  ['2027-07-19','','Break'],['2026-08-03','','Break'],
  ['2026-11-07','','Weekend'],['2027-08-03','','Not listed']
 ]){
  vm.runInContext(`events=${JSON.stringify(title?[{title,allDay:true,date,endDate:date}]:[])}`,context);
  assert.equal(vm.runInContext(`rotation('${date}')`,context),expected,date);
 }
});
