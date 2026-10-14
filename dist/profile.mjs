import {quantified} from './core.mjs';
import {closestMeasurements} from './river.mjs';

const RAD=Math.PI/180,EARTH=6371008.8,DAY=86400000;
export function distanceMetres(a,b){
 const lat=(b[1]-a[1])*RAD,lon=(b[0]-a[0])*RAD;
 const h=Math.sin(lat/2)**2+Math.cos(a[1]*RAD)*Math.cos(b[1]*RAD)*Math.sin(lon/2)**2;
 return 2*EARTH*Math.asin(Math.sqrt(Math.min(1,h)));
}
// Course geometries can contain reversed pieces, branches and disconnected parts.
// Use the longest continuous path in the largest tree component. Never bridge gaps
// or substitute schematic station links for river kilometres.
export function riverPath(collection){
 const lines=[];
 for(const feature of collection?.features||[]){const g=feature.geometry;if(g?.type==='LineString')lines.push(g.coordinates);else if(g?.type==='MultiLineString')lines.push(...g.coordinates);}
 if(!lines.length||lines.length>1000)throw Error('Tracé absent ou trop complexe pour établir un profil.');
 const nodes=[],edges=[];
 const endpoint=point=>{let id=nodes.findIndex(n=>distanceMetres(n.point,point)<=5);if(id<0){id=nodes.length;nodes.push({point,edges:[]});}return id;};
 for(const [id,coords] of lines.entries()){
  if(coords.length<2||!coords.every(p=>p.length>=2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90))throw Error('Coordonnées du tracé invalides.');
  const length=coords.slice(1).reduce((total,p,i)=>total+distanceMetres(coords[i],p),0);if(!length)continue;
  const a=endpoint(coords[0]),b=endpoint(coords.at(-1)),edge={id,a,b,coords,length};edges.push(edge);nodes[a].edges.push(edge);nodes[b].edges.push(edge);
 }
 const visited=new Set(),components=[];
 for(let root=0;root<nodes.length;root++){
  if(visited.has(root))continue;const stack=[root],ids=[],componentEdges=new Set();
  while(stack.length){const id=stack.pop();if(visited.has(id))continue;visited.add(id);ids.push(id);for(const edge of nodes[id].edges){componentEdges.add(edge);stack.push(edge.a===id?edge.b:edge.a);}}
  components.push({ids,edges:[...componentEdges],length:[...componentEdges].reduce((sum,e)=>sum+e.length,0)});
 }
 const component=components.sort((a,b)=>b.length-a.length)[0];
 if(!component||component.edges.length!==component.ids.length-1)throw Error('Le tracé contient une boucle : l’itinéraire kilométrique est ambigu.');
 const walk=start=>{const stack=[{id:start,parent:-1,distance:0}],parents=new Map();let farthest={id:start,distance:0};
  while(stack.length){const item=stack.pop();if(item.distance>farthest.distance)farthest=item;for(const edge of nodes[item.id].edges){const next=edge.a===item.id?edge.b:edge.a;if(next===item.parent)continue;parents.set(next,{id:item.id,edge});stack.push({id:next,parent:item.id,distance:item.distance+edge.length});}}
  return {farthest,parents};
 };
 const first=walk(component.ids[0]).farthest.id,route=walk(first);let current=route.farthest.id;const pieces=[];
 while(current!==first){const {id,edge}=route.parents.get(current);pieces.push({edge,coords:edge.a===id?edge.coords:edge.coords.slice().reverse()});current=id;}
 pieces.reverse();const segments=[];let length=0;
 for(const {edge,coords} of pieces){
  // A join of at most 5 m reflects coordinate precision, and is counted explicitly.
  if(segments.length)length+=distanceMetres(segments.at(-1).b,coords[0]);
  for(let i=1;i<coords.length;i++){const size=distanceMetres(coords[i-1],coords[i]);if(size)segments.push({a:coords[i-1],b:coords[i],start:length,length:size,line:edge.id});length+=size;}
 }
 if(!segments.length)throw Error('Tracé sans longueur exploitable.');
 return {segments,length,lines,usedLines:new Set(pieces.map(p=>p.edge.id)),omittedLines:lines.length-pieces.length};
}
function project(point,a,b){
 const scale=Math.cos(point[1]*RAD),ax=(a[0]-point[0])*RAD*EARTH*scale,ay=(a[1]-point[1])*RAD*EARTH;
 const dx=(b[0]-a[0])*RAD*EARTH*scale,dy=(b[1]-a[1])*RAD*EARTH;
 const t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1)));
 return {t,distance:Math.hypot(ax+t*dx,ay+t*dy)};
}
export function positionStations(path,stations,maxOffset=1000){
 const positions=[],excluded=[];
 for(const station of stations){
  const point=[station.longitude,station.latitude];if(!point.every(Number.isFinite)){excluded.push({station,reason:'Coordonnées absentes'});continue;}
  let nearest=null;
  for(const segment of path.segments){const projection=project(point,segment.a,segment.b);if(!nearest||projection.distance<nearest.offset)nearest={station,metres:segment.start+segment.length*projection.t,offset:projection.distance};}
  if(nearest.offset>maxOffset){excluded.push({station,reason:'À plus de 1 km du tracé retenu'});continue;}
  let otherDistance=Infinity;
  for(const [id,coords] of path.lines.entries())if(!path.usedLines.has(id))for(let i=1;i<coords.length;i++)otherDistance=Math.min(otherDistance,project(point,coords[i-1],coords[i]).distance);
  if(otherDistance+5<nearest.offset){excluded.push({station,reason:'Sur une branche ou un tronçon hors du profil'});continue;}
  positions.push(nearest);
 }
 positions.sort((a,b)=>a.metres-b.metres);
 return {positions,excluded};
}
export function profileValues(rows,positions,{mode='date',day,tolerance=30,reverse=false}={}){
 const byStation=new Map(),nearest=mode==='date'?closestMeasurements(rows,day):null;
 if(mode==='mean')for(const row of rows){if(String(row.code_qualification)!=='1'||!Number.isFinite(row.resultat))continue;const item=byStation.get(row.code_station)||{sum:0,count:0,excluded:0,first:null,last:null};if(quantified(row)){item.sum+=row.resultat;item.count++;item.first=!item.first||row.date_prelevement<item.first?row.date_prelevement:item.first;item.last=!item.last||row.date_prelevement>item.last?row.date_prelevement:item.last;}else item.excluded++;byStation.set(row.code_station,item);}
 const ordered=reverse?positions.slice().reverse():positions,origin=ordered[0]?.metres||0;
 return ordered.map(position=>{
  const code=position.station.code_station,sample=nearest?.get(code),mean=byStation.get(code);
  const accepted=sample&&sample.distance<=Number(tolerance)*DAY;
  return {...position,x:Math.abs(position.metres-origin)/1000,y:mode==='mean'?(mean?.count?mean.sum/mean.count:null):(accepted&&quantified(sample.row)?sample.row.resultat:null),sample:accepted?sample.row:null,count:mode==='mean'?mean?.count||0:accepted&&quantified(sample.row)?1:0,excluded:mode==='mean'?mean?.excluded||0:accepted&&!quantified(sample.row)?1:0,first:mean?.first,last:mean?.last};
 });
}
export function latestProfileDay(rows,positions,tolerance=30){
 const dates=[...new Set(rows.map(r=>r.date_prelevement))].sort().reverse();
 for(const day of dates)if(profileValues(rows,positions,{day,tolerance}).filter(p=>p.y!==null).length>=3)return day;
 return dates[0]||null;
}
