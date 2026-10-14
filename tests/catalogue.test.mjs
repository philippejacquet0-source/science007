import test from 'node:test';
import assert from 'node:assert/strict';
import {packCatalogue,unpackCatalogue,mercatorPoint,addGridPoint,nearestGridPoint} from '../dist/catalogue.mjs';

test('Le catalogue compact conserve les identifiants, les coordonnées et les champs nuls',()=>{
 const stations=[{code_station:'00001234',latitude:48.23456789,longitude:-1.23456789,nom_cours_eau:'La Vilaine',nom_bassin:'Bretagne',libelle_commune:'Rennes',code_departement:'35',type_entite_hydro:'2'},{code_station:'00001235',latitude:-12.8,longitude:45.15,nom_cours_eau:null,nom_bassin:null,type_entite_hydro:'0'}];
 const packed=packCatalogue({stations,retrievedAt:'2026-10-13',sourceCount:2}),restored=unpackCatalogue(packed);
 for(let i=0;i<stations.length;i++)for(const field of packed.columns)assert.equal(restored[i][field],stations[i][field]??null);
 assert.equal(packed.dictionaries.type_entite_hydro.length,2);
});
test('La projection Mercator correspond au centre du monde et reste finie aux pôles',()=>{
 assert.deepEqual(mercatorPoint(0,0),{x:.5,y:.5});
 assert.equal(mercatorPoint(0,180).x,1);
 assert.ok(mercatorPoint(48,-1).y<.5);
 assert.ok(Number.isFinite(mercatorPoint(90,0).y));
});
test('Un clic trouve la station la plus proche, y compris à la limite de deux cellules',()=>{
 const grid=new Map(),a={x:15,y:16,station:{code_station:'A'}},b={x:19,y:16,station:{code_station:'B'}};
 addGridPoint(grid,a);addGridPoint(grid,b);
 assert.equal(nearestGridPoint(grid,16,16).station.code_station,'A');
 assert.equal(nearestGridPoint(grid,19,16).station.code_station,'B');
 assert.equal(nearestGridPoint(grid,100,100),null);
});
