/** Cloudflare Worker: keep TRAFIKLAB_KEY in Worker secrets. */
const BASE = 'https://realtime-api.trafiklab.se/v1';
const IDS = {viking:'740000868', forskning:'740056358', nobel:'740073926', central:'740000009'};
const TZ = 'Europe/Stockholm';
const headers = { 'Content-Type':'application/json; charset=utf-8', 'Access-Control-Allow-Origin':'*', 'Cache-Control':'no-store' };
const dateTime = s => s ? new Date(s + (s.endsWith('Z') ? '' : '+02:00')) : null;
// Compare local ISO strings without forcing an incorrect UTC offset during winter time.
const epoch = s => s ? Date.parse(s.replace(/([+-]\d\d:\d\d|Z)$/,'')+'Z') : NaN;
const time = item => epoch(item.realtime || item.scheduled);
const callTime = (c, type) => epoch(c[`realtime${type}`] || c[`scheduled${type}`]);
const is575 = d => d.route?.designation === '575' && d.route?.transport_mode === 'BUS';
const is4 = d => d.route?.designation === '4' && d.route?.transport_mode === 'BUS';
const isTrain = d => d.route?.transport_mode === 'TRAIN' && /pendeln/i.test(d.route?.name || d.agency?.operator || '');
const valid = d => d && d.trip?.trip_id && d.trip?.start_date;
const absMin = (a,b) => (a-b)/60000;
const simple = d => ({scheduled:d.scheduled, realtime:d.realtime, delay:d.delay, canceled:d.canceled, is_realtime:d.is_realtime, platform:d.realtime_platform?.designation || d.scheduled_platform?.designation || '', designation:d.route?.designation, direction:d.route?.direction, trip_id:d.trip?.trip_id, start_date:d.trip?.start_date, alerts:d.alerts || []});
const timed = (d) => d.realtime || d.scheduled;
const at = (calls,id) => calls.find(c => String(c.stop?.area_id)===id);
async function api(path,key) {
 const res=await fetch(`${BASE}/${path}?key=${encodeURIComponent(key)}`);
 if(!res.ok) throw new Error(`Trafiklab svarade HTTP ${res.status} för ${path.split('/')[0]}`);
 return res.json();
}
async function collect(key, mode) {
 const from = mode==='home' ? [['forskning','departures'],['nobel','departures'],['central','departures']] : [['viking','departures'],['central','departures']];
 const pairs=await Promise.all(from.map(async ([stop,kind])=>[stop,(await api(`${kind}/${IDS[stop]}`,key)).departures || []]));
 const boards=Object.fromEntries(pairs);
 let bus575 = (boards[mode==='home'?'forskning':'viking']||[]).filter(d=>is575(d) && (mode==='home' ? /Vikingstad/i.test(d.route.direction) : /Resecentrum/i.test(d.route.direction)));
 let four = (boards[mode==='home'?'nobel':'central']||[]).filter(d=>is4(d) && (mode==='home' ? /Resecentrum/i.test(d.route.direction) : /Lambohov/i.test(d.route.direction)));
 let trains = (boards[mode==='home'?'central':'viking']||[]).filter(isTrain);
 // Trip details, rather than destination strings, verify both ends of every leg.
 const candidates=[...bus575,...four,...trains].filter(valid);
 const unique=new Map(candidates.map(d=>[`${d.trip.trip_id}/${d.trip.start_date}`,d]));
 const trips=await Promise.all([...unique.entries()].map(async([id])=>{
  try { const data=await api(`trips/${id}`,key); return [id,data.calls || []]; }
  catch(e) { return [id,[]]; }
 }));
 const byTrip=Object.fromEntries(trips);
 const callsFor=d=>byTrip[`${d.trip.trip_id}/${d.trip.start_date}`] || [];
 const leg=(d,start,end)=>{
  const calls=callsFor(d), a=at(calls,start), b=at(calls,end);
  if(!a || !b || calls.indexOf(b)<=calls.indexOf(a)) return null;
  if(a.departureCanceled || b.arrivalCanceled || d.canceled) return null;
  return {departure: simple(d), depart: a.realtimeDeparture || a.scheduledDeparture, arrive: b.realtimeArrival || b.scheduledArrival, realtime: !!(a.is_realtime || b.is_realtime), arrivalStop:b.stop?.name};
 };
 const direct=bus575.map(d=>leg(d,mode==='home'?IDS.forskning:IDS.viking,mode==='home'?IDS.viking:IDS.forskning))
   .filter(Boolean).map(l=>({kind:'575',start:l.depart,end:l.arrive,legs:[l]}));
 const first=mode==='home'?four.map(d=>leg(d,IDS.nobel,IDS.central)).filter(Boolean):trains.map(d=>leg(d,IDS.viking,IDS.central)).filter(Boolean);
 const second=mode==='home'?trains.map(d=>leg(d,IDS.central,IDS.viking)).filter(Boolean):four.map(d=>leg(d,IDS.central,IDS.nobel)).filter(Boolean);
 const connections=[];
 for(const a of first) {
   const viable=second.filter(b=>absMin(epoch(b.depart),epoch(a.arrive))>=5 && absMin(epoch(b.depart),epoch(a.arrive))<=35)
     .sort((x,y)=>epoch(x.depart)-epoch(y.depart));
   if(viable.length) connections.push({kind:'byte',start:a.depart,end:viable[0].arrive,connectionMinutes:Math.round(absMin(epoch(viable[0].depart),epoch(a.arrive))),legs:[a,viable[0]]});
 }
 return [...direct,...connections].sort((a,b)=>epoch(a.start)-epoch(b.start)).slice(0,20);
}
export default {
 async fetch(request,env) {
  if(request.method==='OPTIONS') return new Response(null,{headers:{...headers,'Access-Control-Allow-Methods':'GET, OPTIONS'}});
  const url=new URL(request.url);
  if(url.pathname!=='/api') return new Response(JSON.stringify({error:'Använd /api?mode=work eller /api?mode=home'}),{status:404,headers});
  if(!env.TRAFIKLAB_KEY) return new Response(JSON.stringify({error:'Saknar Worker-hemligheten TRAFIKLAB_KEY'}),{status:500,headers});
  const mode=url.searchParams.get('mode')==='home'?'home':'work';
  try {
   const journeys=await collect(env.TRAFIKLAB_KEY,mode);
   return new Response(JSON.stringify({mode,journeys,updated:new Date().toISOString(),info:'Anslutning kräver minst 5 minuters byte. GPS-position kontrolleras inte.'}),{headers});
  } catch(err) { return new Response(JSON.stringify({error:err.message}),{status:502,headers}); }
 }
};
