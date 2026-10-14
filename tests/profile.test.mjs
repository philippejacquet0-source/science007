import test from 'node:test';
import assert from 'node:assert/strict';
import {groupAnalyses} from '../dist/core.mjs';
import {distanceMetres,riverPath,positionStations,profileValues,latestProfileDay} from '../dist/profile.mjs';

const geometry=lines=>({features:[{geometry:{type:'MultiLineString',coordinates:lines}}]});
const station=(code,longitude,latitude)=>({code_station:code,longitude,latitude});
const sample=(code,day,value,remark='1',qualification='1',fraction='23',unit='mg/L')=>({code_station:code,code_parametre:'1340',date_prelevement:day,resultat:value,code_remarque:remark,code_qualification:qualification,code_fraction:fraction,symbole_unite:unit});

test('Les kilomètres suivent les méandres plutôt que la distance à vol d’oiseau ou les codes des stations',()=>{
 const path=riverPath(geometry([[[0,45],[.1,45],[.1,45.1]]]));
 const placed=positionStations(path,[station('Z',0,45),station('A',.1,45.1),station('M',.1,45)]).positions;
 const points=profileValues([],placed,{mode:'mean'});
 assert.equal(placed.length,3);assert.equal(points[0].x,0);
 assert.ok(points.at(-1).x>distanceMetres([0,45],[.1,45.1])/1000+3);
 const middle=points.find(p=>p.station.code_station==='M');assert.ok(middle.x>0&&middle.x<points.at(-1).x);
});
test('Les tronçons inversés sont raccordés et une branche n’est pas ajoutée à la distance principale',()=>{
 const path=riverPath(geometry([[[.1,45],[0,45]],[[.1,45],[.2,45]],[[.1,45],[.1,45.01]]]));
 assert.equal(path.omittedLines,1);assert.ok(Math.abs(path.length-distanceMetres([0,45],[.2,45]))<1);
 const result=positionStations(path,[station('A',0,45),station('B',.1,45),station('C',.2,45),station('branch',.1,45.009)]);
 assert.equal(result.positions.length,3);assert.equal(result.excluded[0].station.code_station,'branch');
});
test('Une discontinuité ne devient pas une liaison kilométrique inventée, une boucle reste ambiguë',()=>{
 const path=riverPath(geometry([[[0,45],[.2,45]],[[2,45],[2.1,45]]]));
 assert.ok(path.length<16000);assert.equal(positionStations(path,[station('remote',2.05,45)]).positions.length,0);
 assert.throws(()=>riverPath(geometry([[[0,45],[.1,45],[0,45]]])),/boucle/);
});
test('Les stations éloignées du tracé sont exclues et inverser l’axe conserve les distances entre stations',()=>{
 const path=riverPath(geometry([[[0,45],[.2,45]]]));
 const result=positionStations(path,[station('A',0,45),station('B',.08,45),station('C',.2,45),station('far',.1,46)]);
 assert.equal(result.excluded.length,1);
 const normal=profileValues([],result.positions,{mode:'mean'}),reversed=profileValues([],result.positions,{mode:'mean',reverse:true});
 assert.equal(reversed[0].x,0);assert.equal(reversed[0].station.code_station,normal.at(-1).station.code_station);
 for(const p of normal){const r=reversed.find(r=>r.station===p.station);assert.ok(Math.abs(p.x+r.x-normal.at(-1).x)<1e-9);}
});
test('La date choisit des prélèvements réels dans la tolérance, sans interpolation ni seuil transformé en valeur',()=>{
 const positions=['A','B','C'].map((code,i)=>({station:station(code,0,45),metres:i*1000}));
 const rows=[sample('A','2024-01-01',5),sample('A','2024-01-20',10),sample('B','2024-01-10',.1,'2'),sample('C','2024-01-11',4)];
 let points=profileValues(rows,positions,{day:'2024-01-10',tolerance:7});
 assert.equal(points[0].y,null);assert.equal(points[1].y,null);assert.equal(points[1].sample.resultat,.1);assert.equal(points[2].y,4);
 points=profileValues(rows,positions,{day:'2024-01-10',tolerance:9});assert.equal(points[0].y,5);assert.equal(points[0].sample.date_prelevement,'2024-01-01');
});
test('Les moyennes incluent toutes les mesures quantifiées, y compris zéro, et comptent les exclusions',()=>{
 const positions=[{station:station('A',0,45),metres:0},{station:station('B',.1,45),metres:1000}];
 const rows=[sample('A','2024-01-01',0),sample('A','2024-01-10',6),sample('A','2024-02-01',.1,'2'),sample('A','2024-03-01',99,'1','2'),sample('B','2024-02-01',.1,'2')];
 const points=profileValues(rows,positions,{mode:'mean'});assert.equal(points[0].y,3);assert.equal(points[0].count,2);assert.equal(points[0].excluded,1);assert.equal(points[0].first,'2024-01-01');assert.equal(points[0].last,'2024-01-10');assert.equal(points[1].y,null);
});
test('Les moyennes de fractions et unités différentes sont calculées dans des groupes distincts',()=>{
 const positions=[{station:station('A',0,45),metres:0}];
 const groups=groupAnalyses([sample('A','2024-01-01',2),sample('A','2024-01-02',4),sample('A','2024-01-01',20,'1','1','3'),sample('A','2024-01-01',200,'1','1','23','µg/L')]);
 assert.equal(groups.length,3);assert.deepEqual(groups.map(g=>profileValues(g.rows,positions,{mode:'mean'})[0].y).sort((a,b)=>a-b),[3,20,200]);
});
test('La date initiale est la plus récente permettant au moins trois stations, même si un prélèvement isolé est plus récent',()=>{
 const positions=['A','B','C'].map((code,i)=>({station:station(code,0,45),metres:i*1000}));
 const rows=[sample('A','2024-01-01',2),sample('B','2024-01-03',3),sample('C','2024-01-05',4),sample('A','2024-04-01',5)];
 assert.equal(latestProfileDay(rows,positions,7),'2024-01-05');assert.equal(latestProfileDay(rows,positions,0),'2024-04-01');
});
