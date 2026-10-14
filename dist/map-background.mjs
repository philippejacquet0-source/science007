export const BACKGROUNDS={
 ign:{url:'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',attribution:'&copy; <a href="https://cartes.gouv.fr/" target="_blank" rel="noopener">IGN — Plan IGN</a>',maxNativeZoom:19,maxZoom:19},
 osm:{url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',maxNativeZoom:19,maxZoom:19},
 local:null
};

export function usableBackground(requested,protocol){
 // File URLs do not send the HTTP Referer required by OSM's tile policy.
 return requested==='osm'&&protocol==='file:'?'ign':(Object.hasOwn(BACKGROUNDS,requested)?requested:'ign');
}

export function installMapBackground(map,{select,status,protocol}){
 let layer=null,generation=0;
 const osm=select.querySelector('option[value="osm"]');if(osm&&protocol==='file:'){osm.disabled=true;osm.textContent='OpenStreetMap (version web)';}
 function setBackground(requested,message=''){
  const key=usableBackground(requested,protocol),current=++generation;
  if(layer){map.removeLayer(layer);layer=null;}
  select.value=key;status.textContent=message;status.hidden=!message;
  const container=map.getContainer();container.dataset.background=key;container.dataset.loadedTiles='0';container.dataset.failedTiles='0';
  const background=BACKGROUNDS[key];if(!background)return;
  let loaded=0,failed=0;
  layer=L.tileLayer(background.url,{attribution:background.attribution,maxNativeZoom:background.maxNativeZoom,maxZoom:background.maxZoom,keepBuffer:1,updateWhenIdle:true}).addTo(map);
  layer.on('tileload',()=>{if(current!==generation)return;container.dataset.loadedTiles=String(++loaded);});
  layer.on('tileerror',()=>{
   if(current!==generation)return;container.dataset.failedTiles=String(++failed);
   if(failed>=3&&!loaded){if(key==='osm')setBackground('ign','Fond OpenStreetMap indisponible ; fond IGN affiché.');else setBackground('local','Fond IGN indisponible ; contours locaux affichés. Vous pouvez réessayer avec le menu du fond de carte.');}
  });
 }
 select.addEventListener('change',()=>setBackground(select.value));setBackground('ign');
 return {setBackground};
}
