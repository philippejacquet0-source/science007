import test from 'node:test';
import assert from 'node:assert/strict';
import {riverKey,riverGroups,riverMatches,preidentifiedRiver,stationLinks,dateWindow,closestMeasurements} from '../dist/river.mjs';

test('Deux cours d’eau homonymes ne sont pas regroupés, les noms seuls ne font pas office d’identifiant',()=>{
 const stations=[{code_station:'A',code_cours_eau:'R1',nom_cours_eau:'Le Ruisseau'},{code_station:'B',code_cours_eau:'R2',nom_cours_eau:'Le Ruisseau'},{code_station:'C',nom_cours_eau:'Le Ruisseau'}];
 const groups=riverGroups(stations);assert.equal(groups.size,2);assert.equal(groups.get('R1').stations.length,1);assert.equal(riverKey(stations[2]),null);
});
test('Les liaisons schématiques relient chaque station sans cycle ni zigzag dicté par l’identifiant',()=>{
 const stations=[{code_station:'A',_mercatorX:0,_mercatorY:0},{code_station:'B',_mercatorX:2,_mercatorY:0},{code_station:'C',_mercatorX:1,_mercatorY:0},{code_station:'D',_mercatorX:3,_mercatorY:0}];
 const links=stationLinks(stations);assert.equal(links.length,3);for(const [a,b] of links)assert.equal(Math.abs(a._mercatorX-b._mercatorX),1);assert.equal(new Set(links.flat()).size,4);
});
test('Une recherche de fleuve ne renvoie pas tous les affluents de son bassin',()=>{
 assert.equal(riverMatches({name:'LA LOIRE',basin:'La Loire et ses affluents'},'La Loire'),true);assert.equal(riverMatches({name:'Le Cher',basin:'La Loire et ses affluents'},'La Loire'),false);assert.equal(riverMatches({name:'La Sèvre',basin:''},'sevre'),true);
});
test('Une station préidentifie son cours d’eau et une sélection ambiguë reste explicite',()=>{
 const stations=new Map([['A',{code_cours_eau:'R1'}],['B',{code_cours_eau:'R1'}],['C',{code_cours_eau:'R2'}],['D',{nom_cours_eau:'Sans identifiant'}]]);
 assert.equal(preidentifiedRiver(['A'],stations,'A'),'R1');assert.equal(preidentifiedRiver(['A','B'],stations),'R1');assert.equal(preidentifiedRiver(['A','C'],stations,'C'),'R2');assert.equal(preidentifiedRiver(['A','C'],stations),null);assert.equal(preidentifiedRiver(['D'],stations,'D'),null);assert.equal(preidentifiedRiver([],stations,'A'),null);
});
test('La fenêtre autour d’une date traverse les mois et années sans changer de fuseau',()=>{
 assert.deepEqual(dateWindow('2024-01-01',7),['2023-12-25','2024-01-08']);assert.deepEqual(dateWindow('2024-02-29',0),['2024-02-29','2024-02-29']);
});
test('La vue par date choisit un prélèvement réel, garde les seuils et exclut les qualifications incorrectes',()=>{
 const sample=(station,day,value,remark='1',qualification='1')=>({code_station:station,date_prelevement:day,resultat:value,code_remarque:remark,code_qualification:qualification});
 const rows=[sample('A','2024-01-09',5),sample('A','2024-01-11',6),sample('A','2024-01-10',9,'1','2'),sample('B','2024-01-10',.1,'2')];
 const result=closestMeasurements(rows,'2024-01-10');assert.equal(result.get('A').row.resultat,5);assert.equal(result.get('A').row.date_prelevement,'2024-01-09');assert.equal(result.get('B').row.code_remarque,'2');assert.equal(result.size,2);
});
