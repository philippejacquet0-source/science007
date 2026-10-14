import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {packCatalogue,unpackCatalogue} from '../dist/catalogue.mjs';
import {buildStatic} from './build-static.mjs';

const directory=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist/data');
export async function prepareData(){
 const source=await readFile(path.join(directory,'stations.json'));
 const catalogue=JSON.parse(source),packed=packCatalogue(catalogue),compact=Buffer.from(JSON.stringify(packed));
 const restored=unpackCatalogue(packed);
 if(restored.length!==catalogue.stations.length)throw Error('Catalogue incomplet après préparation.');
 for(let i=0;i<restored.length;i++)for(const field of packed.columns){
  if((catalogue.stations[i][field]??null)!==restored[i][field])throw Error(`Valeur modifiée : ${i}, ${field}`);
 }
 await writeFile(path.join(directory,'stations.compact.json'),compact);
 await writeFile(path.join(directory,'stations.compact.json.gz'),gzipSync(compact,{level:9}));
 for(const name of ['examples.json','departments.geojson']){
  try{const data=await readFile(path.join(directory,name));await writeFile(path.join(directory,name+'.gz'),gzipSync(data,{level:9}));}catch(error){if(error.code!=='ENOENT')throw error;}
 }
 const compressed=gzipSync(compact,{level:9});
 console.log(JSON.stringify({stations:restored.length,sourceBytes:source.length,compactBytes:compact.length,gzipBytes:compressed.length,valuesPreserved:true}));
 await buildStatic();
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await prepareData();
