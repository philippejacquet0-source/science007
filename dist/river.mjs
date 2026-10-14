import {normalize,quantified} from './core.mjs';

export function riverKey(station){
 // Never group unnamed or homonymous rivers without an official identifier.
 return station.code_cours_eau?String(station.code_cours_eau):null;
}
export function riverColor(key){
 if(!key)return '#72928d';let hash=0;for(const c of key)hash=(hash*31+c.charCodeAt(0))>>>0;
 return `hsl(${hash%360} 48% 43%)`;
}
export function riverGroups(stations){
 const groups=new Map();
 for(const station of stations){const key=riverKey(station);if(!key)continue;if(!groups.has(key))groups.set(key,{key,name:station.nom_cours_eau||'',basin:station.nom_bassin,stations:[]});const group=groups.get(key);group.name||=station.nom_cours_eau;group.basin||=station.nom_bassin;group.stations.push(station);}
 for(const group of groups.values())group.name||='Cours d’eau sans nom';
 return groups;
}
export function riverMatches(group,query){return normalize(group.name).includes(normalize(query).trim());}
export function preidentifiedRiver(codes,stationsByCode,preferredCode=''){
 const preferred=stationsByCode.get(preferredCode);
 if(preferred&&codes.includes(preferredCode)&&riverKey(preferred))return riverKey(preferred);
 const keys=new Set(codes.map(code=>stationsByCode.get(code)).filter(Boolean).map(riverKey).filter(Boolean));
 return keys.size===1?[...keys][0]:null;
}
// These segments are explicitly schematic station links, never hydrography or a
// flow direction. A minimum spanning tree avoids a long zigzag caused by code order.
export function stationLinks(stations){
 if(stations.length<2)return [];const visited=new Uint8Array(stations.length),distances=new Float64Array(stations.length).fill(Infinity),parents=new Int32Array(stations.length).fill(-1),edges=[];distances[0]=0;
 for(let step=0;step<stations.length;step++){
  let nearest=-1;for(let i=0;i<stations.length;i++)if(!visited[i]&&(nearest<0||distances[i]<distances[nearest]))nearest=i;
  if(nearest<0)break;visited[nearest]=1;if(parents[nearest]>=0)edges.push([stations[parents[nearest]],stations[nearest]]);
  const a=stations[nearest];for(let i=0;i<stations.length;i++)if(!visited[i]){const b=stations[i],distance=(a._mercatorX-b._mercatorX)**2+(a._mercatorY-b._mercatorY)**2;if(distance<distances[i]){distances[i]=distance;parents[i]=nearest;}}
 }
 return edges;
}
export function dateWindow(day,tolerance){
 const ms=Date.parse(day+'T00:00:00Z'),delta=Number(tolerance)*86400000;
 return [new Date(ms-delta).toISOString().slice(0,10),new Date(ms+delta).toISOString().slice(0,10)];
}
export function closestMeasurements(rows,day){
 const target=Date.parse(day),result=new Map();
 for(const row of rows){if(String(row.code_qualification)!=='1'||!Number.isFinite(row.resultat))continue;const distance=Math.abs(Date.parse(row.date_prelevement)-target),old=result.get(row.code_station);
  // At equal distance prefer the earlier sample, then a quantified measurement.
  if(!old||distance<old.distance||(distance===old.distance&&(row.date_prelevement<old.row.date_prelevement||(row.date_prelevement===old.row.date_prelevement&&quantified(row)&&!quantified(old.row)))))result.set(row.code_station,{row,distance});
 }
 return result;
}
export function concentrationColor(value,min,max){
 const t=max===min?.5:Math.max(0,Math.min(1,(value-min)/(max-min)));
 // A sequential palette represents a measured magnitude, not an ecological grade.
 return `hsl(${215-t*30} ${45+t*20}% ${88-t*58}%)`;
}
