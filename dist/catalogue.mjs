const columns=['code_station','libelle_station','longitude','latitude','code_commune','libelle_commune','code_departement','libelle_departement','nom_cours_eau','nom_bassin','type_entite_hydro','date_arret','code_cours_eau'];
const indexed=new Set(['libelle_commune','code_departement','libelle_departement','nom_cours_eau','nom_bassin','type_entite_hydro','code_cours_eau']);

export function packCatalogue(catalogue){
 const dictionaries={},indices={};
 for(const name of indexed){dictionaries[name]=[];indices[name]=new Map();}
 const rows=catalogue.stations.map(station=>columns.map(name=>{
  const value=station[name]??null;
  if(!indexed.has(name)||value===null)return value;
  const index=indices[name];
  if(!index.has(value)){index.set(value,dictionaries[name].length);dictionaries[name].push(value);}
  return index.get(value);
 }));
 return {version:1,retrievedAt:catalogue.retrievedAt,source:catalogue.source,sourceCount:catalogue.sourceCount,coverage:catalogue.coverage,columns,dictionaries,rows};
}

export function unpackCatalogue(packed){
 if(packed.version!==1||!Array.isArray(packed.rows))throw Error('Format du catalogue non reconnu.');
 return packed.rows.map(row=>{
  const station={};
  for(let i=0;i<packed.columns.length;i++){
   const name=packed.columns[i],value=row[i],dictionary=packed.dictionaries[name];
   station[name]=dictionary&&value!==null?dictionary[value]:value;
  }
  return station;
 });
}

export function mercatorPoint(latitude,longitude){
 const sin=Math.sin(Math.max(-85.05112878,Math.min(85.05112878,latitude))*Math.PI/180);
 return {x:(longitude+180)/360,y:.5-Math.log((1+sin)/(1-sin))/(4*Math.PI)};
}

export function addGridPoint(grid,point,cellSize=16){
 const key=`${Math.floor(point.x/cellSize)}:${Math.floor(point.y/cellSize)}`;
 if(!grid.has(key))grid.set(key,[]);
 grid.get(key).push(point);
}

export function nearestGridPoint(grid,x,y,radius=7,cellSize=16){
 let result=null,best=radius*radius;
 for(let col=Math.floor((x-radius)/cellSize);col<=Math.floor((x+radius)/cellSize);col++){
  for(let row=Math.floor((y-radius)/cellSize);row<=Math.floor((y+radius)/cellSize);row++){
   for(const point of grid.get(`${col}:${row}`)??[]){
    const distance=(x-point.x)**2+(y-point.y)**2;
    if(distance<=best){result=point;best=distance;}
   }
  }
 }
 return result;
}
