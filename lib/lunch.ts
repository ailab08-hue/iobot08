export const BULLETIN_URL='https://www.iolani.org/uploaded/PDF/DAILY_BULLETIN.pdf';
export type LunchItem={location:string;food:string};
export type BulletinMenu={date:string;items:LunchItem[]};
export const LUNCH_LOCATIONS=['Weinberg Snack Bar','One Team Wagon','ASC Dining Hall'] as const;
/** Only the dated header before TODAY'S SCHEDULE is a source of lunch items. */
export function parseBulletinMenu(text:string):BulletinMenu{
  const head=text.replace(/\u00a0/g,' ').split(/TODAY[’']?S\s+SCHEDULE|EVERYONE\s*:/i)[0];
  const match=head.match(/DAILY\s+BULLETIN\s*:\s*(?:[A-Za-z]+,?\s+)?([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/i);
  const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
  const month=match?months.indexOf(match[1].toLowerCase())+1:0;
  if(!match||!month)throw new Error('The bulletin’s publication date could not be read.');
  const date=`${match[3]}-${String(month).padStart(2,'0')}-${match[2].padStart(2,'0')}`;
  if(new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw new Error('Invalid bulletin publication date.');
  const pattern=/(Weinberg\s+Snack\s+Bar|One\s+Team\s+Wagon|ASC\s+Dining\s+Hall)\s*:/gi;
  const labels=[...head.matchAll(pattern)];
  const listings=labels.flatMap((label,index)=>{
    const start=label.index!+label[0].length;const end=labels[index+1]?.index??head.length;
    const food=head.slice(start,end).split(/\n?\s*-{5,}|US\s+SCHEDULE\s*:|\bPeriods\s*:/i)[0].replace(/\s+/g,' ').trim();
    return food?[{location:label[1].replace(/\s+/g,' '),food}]:[];
  });
  // Return at most one listing for each requested venue, in a stable order.
  // These names are filters, not a hardcoded menu: food still comes from PDF text.
  const items=LUNCH_LOCATIONS.flatMap(location=>{
    const listing=listings.find(item=>item.location.toLowerCase()===location.toLowerCase());
    return listing?[{location,food:listing.food}]:[];
  });
  return{date,items};
}
