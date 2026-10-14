import test from 'node:test';
import assert from 'node:assert/strict';
import {usableBackground} from '../dist/map-background.mjs';

test('Le mode fichier ne contacte pas les tuiles OSM qui nécessitent un référent HTTP',()=>{
 assert.equal(usableBackground('osm','file:'),'ign');assert.equal(usableBackground('ign','file:'),'ign');assert.equal(usableBackground('local','file:'),'local');assert.equal(usableBackground('osm','https:'),'osm');assert.equal(usableBackground('osm','http:'),'osm');assert.equal(usableBackground('inconnu','https:'),'ign');
});
