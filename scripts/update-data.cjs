/* Runs on the job runner, never on a student's iPad. */
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {gzipSync}=require('node:zlib');
const {parseCalendar,FEED_URL}=require('../.build/lib/schedule.js');
const {parseBulletinMenu,BULLETIN_URL}=require('../.build/lib/lunch.js');
const DATA=path.resolve('.data');
const hash=text=>createHash('sha256').update(text).digest('hex');
function readJSON(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}}
function writeJSON(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(value)+'\n');fs.renameSync(file+'.tmp',file);}
function schoolYear(now=new Date()){
  const [year,month]=new Intl.DateTimeFormat('en-CA',{timeZone:'Pacific/Honolulu',year:'numeric',month:'2-digit',day:'2-digit'}).format(now).split('-').map(Number);
  const start=month>=8?year:year-1;
  return {label:`${start}-${start+1}`,start:`${start}-08-01T00:00:00-10:00`,end:`${start+1}-08-01T00:00:00-10:00`};
}
async function download(url,maxBytes){
  const response=await fetch(url,{headers:{'User-Agent':'Iobot/1.0 (student schedule data job)',Accept:url===BULLETIN_URL?'application/pdf':'text/calendar'},cache:'no-store',signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw new Error(`Official source returned HTTP ${response.status}`);
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>maxBytes)throw new Error('Official source exceeded the download size limit');chunks.push(Buffer.from(chunk));}
  return Buffer.concat(chunks);
}
function publishSchedule(ics,dir=DATA,now=new Date()){
  const range=schoolYear(now);
  const events=parseCalendar(ics,new Date(range.start),new Date(range.end));
  if(!events.length)throw new Error('No school-year events found; keeping the previous schedule');
  const value={schemaVersion:1,schoolYear:range.label,range,source:FEED_URL,events};
  const text=JSON.stringify(value)+'\n',digest=hash(text),file=`schedule.${digest.slice(0,16)}.json`;
  fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,file),text);fs.writeFileSync(path.join(dir,'schedule.json'),text);
  return {schemaVersion:1,schoolYear:range.label,source:FEED_URL,scheduleFile:file,scheduleHash:digest,checkedAt:now.toISOString(),attemptedAt:now.toISOString(),eventCount:events.length,sourceBytes:Buffer.byteLength(ics),scheduleBytes:Buffer.byteLength(text),gzipBytes:gzipSync(text).length};
}
async function pdfText(bytes){
  if(bytes.subarray(0,5).toString()!=='%PDF-')throw new Error('Bulletin source was not a PDF');
  if(!globalThis.DOMMatrix)globalThis.DOMMatrix=class {a=1;b=0;c=0;d=1;e=0;f=0;};
  const [pdf,worker]=await Promise.all([import('../vendor/pdfjs/pdf.mjs'),import('../vendor/pdfjs/pdf.worker.mjs')]);
  globalThis.pdfjsWorker={WorkerMessageHandler:worker.WorkerMessageHandler};
  const loading=pdf.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:false,disableFontFace:true,useWasm:false,verbosity:0});
  try{const document=await loading.promise;const page=await document.getPage(1);const content=await page.getTextContent();return content.items.map(item=>(item.str||'')+(item.hasEOL?'\n':' ')).join('');}
  finally{await loading.destroy();}
}
async function main({dir=DATA,now=new Date(),fetchSource=download}={}){
  const old=readJSON(path.join(dir,'status.json'));let status;
  try{const bytes=await fetchSource(FEED_URL,20_000_000);status=publishSchedule(bytes.toString('utf8'),dir,now);}
  catch(error){
    if(!old||old.schoolYear!==schoolYear(now).label||!/^schedule\.[a-f0-9]{16}\.json$/.test(old.scheduleFile||'')||!fs.existsSync(path.join(dir,old.scheduleFile)))throw error;
    status={...old,attemptedAt:now.toISOString(),scheduleError:error.message};
    console.warn('Keeping last successful schedule:',error.message);
  }
  // Food retrieval is independent: a blocked PDF must not stop bell schedules.
  try{
    const menu=parseBulletinMenu(await pdfText(await fetchSource(BULLETIN_URL,8_000_000)));
    writeJSON(path.join(dir,'lunch.json'),{schemaVersion:1,bulletinDate:menu.date,items:menu.items,source:BULLETIN_URL,fetchedAt:new Date().toISOString()});
    delete status.lunchError;
  }catch(error){status.lunchError=error.message;console.warn('Bulletin could not be refreshed:',error.message);}
  if(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(process.env.GITHUB_REPOSITORY||''))status.repoUrl='https://github.com/'+process.env.GITHUB_REPOSITORY;
  writeJSON(path.join(dir,'status.json'),status);
  // Keep recent generations so an older cached status file can still resolve.
  const versions=fs.readdirSync(dir).filter(name=>/^schedule\.[a-f0-9]{16}\.json$/.test(name)).sort((a,b)=>fs.statSync(path.join(dir,b)).mtimeMs-fs.statSync(path.join(dir,a)).mtimeMs);
  for(const name of versions.slice(4))if(name!==status.scheduleFile)fs.unlinkSync(path.join(dir,name));
  console.log(JSON.stringify(status,null,2));
}
module.exports={schoolYear,publishSchedule,pdfText,hash,updateData:main};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
