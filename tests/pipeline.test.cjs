const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {schoolYear,publishSchedule,pdfText,hash}=require('../scripts/update-data.cjs');
const {updateData}=require('../scripts/update-data.cjs');
test('a failed upstream refresh preserves last successful data and its real timestamp',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'iobot-last-good-'));
 const old={schoolYear:'2026-2027',checkedAt:'2026-10-29T18:00:00Z',scheduleFile:'schedule.0123456789abcdef.json'};
 fs.writeFileSync(path.join(dir,'status.json'),JSON.stringify(old));fs.writeFileSync(path.join(dir,old.scheduleFile),'original schedule');fs.writeFileSync(path.join(dir,'lunch.json'),'original dated menu');
 try{
  await updateData({dir,now:new Date('2026-10-29T18:15:00Z'),fetchSource:async()=>{throw new Error('HTTP 403');}});
  const result=JSON.parse(fs.readFileSync(path.join(dir,'status.json'),'utf8'));
  assert.equal(result.checkedAt,old.checkedAt);assert.equal(result.scheduleError,'HTTP 403');assert.equal(result.lunchError,'HTTP 403');
  assert.equal(fs.readFileSync(path.join(dir,old.scheduleFile),'utf8'),'original schedule');assert.equal(fs.readFileSync(path.join(dir,'lunch.json'),'utf8'),'original dated menu');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('school year changes on August 1 in Honolulu, not UTC midnight',()=>{
  assert.equal(schoolYear(new Date('2026-08-01T09:59:59Z')).label,'2025-2026');
  assert.equal(schoolYear(new Date('2026-08-01T10:00:00Z')).label,'2026-2027');
});
test('a job publishes only the school year, with stable hashed data and separate freshness',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'iobot-'));
  const calendar='BEGIN:VCALENDAR\nVERSION:2.0\n'+[
    ['old','20250701','Old holiday'],['normal','20261029','B Schedule'],['new','20270810','Future year']
  ].map(([id,date,title])=>`BEGIN:VEVENT\nUID:${id}\nDTSTART;VALUE=DATE:${date}\nSUMMARY:${title}\nEND:VEVENT`).join('\n')+'\nEND:VCALENDAR';
  try{
    const first=publishSchedule(calendar,dir,new Date('2026-10-29T18:00:00Z'));
    const second=publishSchedule(calendar,dir,new Date('2026-10-29T18:15:00Z'));
    assert.equal(first.scheduleHash,second.scheduleHash);assert.notEqual(first.checkedAt,second.checkedAt);
    const bytes=fs.readFileSync(path.join(dir,first.scheduleFile),'utf8');assert.equal(hash(bytes),first.scheduleHash);
    const value=JSON.parse(bytes);assert.deepEqual(value.events.map(e=>e.title),['B Schedule']);
    assert.equal(fs.readFileSync(path.join(dir,'schedule.json'),'utf8'),bytes);
    const before=fs.readFileSync(path.join(dir,'schedule.json'),'utf8');
    assert.throws(()=>publishSchedule('not a calendar',dir),/calendar/i);
    assert.equal(fs.readFileSync(path.join(dir,'schedule.json'),'utf8'),before);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('job PDF extractor reads the dated header without a browser or native canvas',async()=>{
 const text=await pdfText(fs.readFileSync('tests/fixtures/bulletin.pdf'));
 assert.match(text,/October 28, 2026/);assert.match(text,/Weinberg Snack Bar/);
});
