import {readFile,stat} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const html=await readFile(path.join(root,'index.html'),'utf8');
if(/<script[^>]*type=["']module["']/i.test(html))throw Error('Browser module still present');
const resources=[...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/g)].map(m=>m[1]).filter(url=>!/^data:|^https?:|^#/.test(url));
for(const resource of resources)if(!(await stat(path.join(root,resource))).isFile())throw Error(`Missing local asset ${resource}`);
const scope={};runInNewContext(await readFile(path.join(root,'data/bootstrap.js'),'utf8'),scope,{timeout:2000});
const packed=scope.RIVER_BOOT_DATA.coverage,source=JSON.parse(await readFile(path.join(root,'data/coverage.json'),'utf8'));
if(!source.complete||!source.recent?.complete||!packed?.recent)throw Error('Availability index incomplete');
let checks=0;
for(const [label,original,compressed] of [['historical',source.stations,packed.stations],['recent',source.recent.stations,packed.recent.stations]]){
 if(Object.keys(original).length!==Object.keys(compressed).length)throw Error(`Lost ${label} stations`);
 for(const [station,codes] of Object.entries(original))for(let i=0;i<packed.codes.length;i++){
  if(codes.includes(packed.codes[i])!==Boolean(compressed[station]&(2**i)))throw Error(`Changed ${label} availability for ${station}/${packed.codes[i]}`);
  checks++;
 }
}
console.log(JSON.stringify({localResources:resources.length,classicScripts:true,catalogueStations:scope.RIVER_BOOT_DATA.catalogue.rows.length,availabilityChecks:checks,valuesPreserved:true,bootstrapGzipBytes:(await stat(path.join(root,'data/bootstrap.js.gz'))).size}));
