import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'dist');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.geojson':'application/geo+json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
const buffers=new Map();
async function cachedFile(file,info){const previous=buffers.get(file);if(previous?.mtime===info.mtimeMs)return previous.body;const body=await readFile(file);buffers.set(file,{mtime:info.mtimeMs,body});return body;}
const server=http.createServer(async(req,res)=>{
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    let requested=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(requested==='/')requested='/index.html';
    const file=path.resolve(root,'.'+requested);
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end('Forbidden');return;}
    const info=await stat(file);if(!info.isFile())throw Error('Not a file');
    const etag=`"${info.size.toString(16)}-${info.mtimeMs.toString(16)}"`;
    const headers={'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','ETag':etag,'Vary':'Accept-Encoding','X-Content-Type-Options':'nosniff'};
    if(req.headers['if-none-match']===etag){res.writeHead(304,headers);res.end();return;}
    let served=file,servedInfo=info;
    if(/\bgzip\b/.test(req.headers['accept-encoding']||'')){
      try{const compressed=await stat(file+'.gz');if(compressed.mtimeMs>=info.mtimeMs){served=file+'.gz';servedInfo=compressed;headers['Content-Encoding']='gzip';}}catch{}
    }
    headers['Content-Length']=servedInfo.size;
    res.writeHead(200,headers);
    res.end(req.method==='HEAD'?undefined:await cachedFile(served,servedInfo));
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Fichier introuvable');}
});
let port=Number(process.env.RIVER_PORT||4173);
server.on('error',error=>{if(error.code==='EADDRINUSE'&&port<4183){port++;server.listen(port,'127.0.0.1');}else{console.error(error.message);process.exitCode=1;}});
server.on('listening',()=>{
 const url=`http://127.0.0.1:${port}`;
 console.log(`Local: ${url}\nAppuyez sur Ctrl+C pour arrêter le serveur.`);
 if(process.argv.includes('--open')&&process.platform==='win32'){
  const opener=spawn('powershell.exe',['-NoProfile','-WindowStyle','Hidden','-Command',`Start-Process '${url}'`],{windowsHide:true,stdio:'ignore'});
  opener.on('error',()=>console.log('Ouvrez l’adresse locale ci-dessus dans votre navigateur.'));
 }
});
server.listen(port,'127.0.0.1');
