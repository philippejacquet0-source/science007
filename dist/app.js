import {PARAMETERS,PRESETS,COLORS,normalize,prettyName,basinLabel,matchesStation,stationSearchText,validDateRange,quantified,thresholdKind,resultLabel,groupAnalyses,deduplicate,splitDateRange,csvCell,csvText} from './core.mjs';
import {unpackCatalogue,mercatorPoint} from './catalogue.mjs';
import {createStationLayer,installRectangleSelection} from './station-layer.mjs';
import {riverKey,riverColor,riverGroups,riverMatches,preidentifiedRiver,stationLinks,dateWindow,closestMeasurements,concentrationColor} from './river.mjs';
import {installMapBackground} from './map-background.mjs';
import {installRiverProfile} from './profile-view.mjs';

const $=id=>document.getElementById(id);
const API='https://hubeau.eaufrance.fr/api/v2/qualite_rivieres/';
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const defaultStart=`${Number(today.slice(0,4))-5}-01-01`;
const number=v=>Number(v).toLocaleString('fr-FR');
const dateFormatter=new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}),shortDateFormatter=new Intl.DateTimeFormat('fr-FR',{month:'short',year:'2-digit',timeZone:'UTC'});
const date=v=>dateFormatter.format(new Date(v));
const dateShort=v=>shortDateFormatter.format(new Date(v));
const state={stations:[],stationByCode:new Map(),filtered:[],selected:[],selectedSet:new Set(),parameters:new Set(PRESETS.essentials),rows:[],charts:[],examples:null,cache:new Map(),colorMap:new Map(),multi:false,availability:null,analysisGeneration:0,availabilityGeneration:0,coverage:null,rivers:new Map(),activeRiver:null,riverCandidate:null,boxMode:false,historyPage:0,snapshot:null,snapshotGeneration:0,links:new Map()};
const HISTORY_PAGE_SIZE=12;
const geometryCache=new Map(),geometryQueue=[];let geometryActive=0;
const geometryWaiters=new Map();let riverProfile;
const places={metro:{center:[46.6,2.4],zoom:6},antilles:{center:[15.3,-61],zoom:7},guyane:{center:[4,-53.1],zoom:7},reunion:{center:[-21.12,55.53],zoom:10},mayotte:{center:[-12.8,45.15],zoom:10}};
let map,stationLayer,linkLayer,analysisController,availabilityController,snapshotController,searchTimer,queryTimer,availabilityTimer,toastTimer;

function node(tag,className='',text=''){const el=document.createElement(tag);if(className)el.className=className;if(text!=='')el.textContent=text;return el;}
function stationName(s){return s._name??=prettyName(s.libelle_station||s.nom_cours_eau||s.libelle_commune||'Station sans nom');}
function stationContext(s){return s._context??=([prettyName(s.libelle_commune),prettyName(s.nom_cours_eau)].filter(Boolean).join(' · ')||prettyName(s.libelle_departement)||'Localisation du catalogue');}
function stationColor(code){if(!state.colorMap.has(code))state.colorMap.set(code,COLORS[state.colorMap.size%COLORS.length]);return state.colorMap.get(code);}
function showToast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function showStatus(text,error=false,retry=false){const parent=$('analysis-status');parent.replaceChildren();if(!text)return;const message=node('div','status-message'+(error?' error':''));if(!error&&text.startsWith('Chargement'))message.append(node('span','spinner'));message.append(node('span','',text));if(retry){const button=node('button','','Réessayer');button.addEventListener('click',()=>refreshAnalyses());message.append(button);}parent.append(message);}
function validInputs(){const start=$('date-start').value,end=$('date-end').value;const valid=validDateRange(start,end);$('date-error').hidden=valid;if(!valid)$('date-error').textContent='Choisissez deux dates valides, avec la date de début avant la date de fin.';return valid;}
function persistSelection(){const hash=new URLSearchParams();if(state.selected.length)hash.set('stations',state.selected.join(','));hash.set('params',[...state.parameters].join(','));hash.set('du',$('date-start').value);hash.set('au',$('date-end').value);if(state.activeRiver)hash.set('river',state.activeRiver);if(state.riverCandidate)hash.set('cours',state.riverCandidate);if(state.snapshot){hash.set('jour',state.snapshot.day);hash.set('mesure',state.snapshot.param);hash.set('ecart',state.snapshot.tolerance);}history.replaceState(null,'',`${location.href.split('#')[0]}#${hash}`);}
function parameterLabel(code){return PARAMETERS.find(p=>p.code===code)?.label||code;}
function historyCodes(){return state.selected.slice(state.historyPage*HISTORY_PAGE_SIZE,(state.historyPage+1)*HISTORY_PAGE_SIZE);}
function stationStyle(s){const snapshot=state.snapshot,measurement=snapshot?.measurements.get(s.code_station);let color=riverColor(riverKey(s));if(snapshot)color=measurement&&quantified(measurement.row)?concentrationColor(measurement.row.resultat,snapshot.min,snapshot.max):'#aeb8b4';return {color,selected:state.selectedSet.has(s.code_station)};}
function mapStationLabel(s){const sample=state.snapshot?.measurements.get(s.code_station);return stationName(s)+(state.snapshot?(sample?` · ${resultLabel(sample.row)} ${sample.row.symbole_unite||''} · ${date(sample.row.date_prelevement)}`:' · Aucune mesure dans la fenêtre choisie'):` · ${prettyName(s.nom_cours_eau)||'Cours d’eau non renseigné'}`);}
function hasChosenMeasurements(s){if($('show-empty').checked||!state.coverage)return true;const recent=state.coverage.recent,useRecent=recent&&$('date-start').value>=recent.start&&$('date-end').value<=recent.end;const codes=(useRecent?recent.stations:state.coverage.stations)[s.code_station]||0;return Boolean(codes&state.parameterMask);}

function initControls(){
  const narrow=matchMedia('(max-width:780px)');$('filter-panel').open=!narrow.matches;narrow.addEventListener('change',()=>{$('filter-panel').open=!narrow.matches;setTimeout(()=>map?.invalidateSize(),0);});
  $('date-start').value=defaultStart;$('date-end').value=today;
  const hash=new URLSearchParams(location.hash.slice(1));
  if(validDateRange(hash.get('du')??'',hash.get('au')??'')){$('date-start').value=hash.get('du');$('date-end').value=hash.get('au');}
  if(hash.has('params'))state.parameters=new Set((hash.get('params')??'').split(',').filter(code=>PARAMETERS.some(p=>p.code===code)));
  const groups={physics:'Physique',essentials:'Oxygène et pH',chemistry:'Carbone et demande en oxygène',nutrients:'Azote et phosphore',minerals:'Ions dissous'};
  for(const [group,title] of Object.entries(groups)){ $('parameter-list').append(node('strong','parameter-group',title));for(const parameter of PARAMETERS.filter(p=>p.group===group)){const label=node('label','parameter-option');const input=document.createElement('input');input.type='checkbox';input.value=parameter.code;input.checked=state.parameters.has(parameter.code);input.addEventListener('change',()=>{input.checked?state.parameters.add(parameter.code):state.parameters.delete(parameter.code);updatePresets();applyFilters();queueAnalyses();queueAvailability();});label.title=parameter.description;label.append(input,node('span','',parameter.short||parameter.label));$('parameter-list').append(label);}}
  document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{state.parameters=new Set(PRESETS[button.dataset.preset]);syncParameters();applyFilters();queueAnalyses();queueAvailability();}));
  $('search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>applyFilters(true),260);});
  $('basin').addEventListener('change',()=>applyFilters(true));
  $('all-environments').addEventListener('change',()=>{updateCatalogueCount();applyFilters(false);});
  $('show-empty').addEventListener('change',()=>applyFilters());
  $('territory').addEventListener('change',()=>{applyFilters(false);const territory=$('territory').value;if(territory==='metro')goToPlace('metro');else if(territory==='971'||territory==='972')goToPlace('antilles');else if(territory==='973')goToPlace('guyane');else if(territory==='974')goToPlace('reunion');else if(territory==='976')goToPlace('mayotte');});
  $('reset-filters').addEventListener('click',()=>{$('search').value='';$('basin').value='';$('territory').value='';$('show-empty').checked=false;state.activeRiver=null;updateRiverControls();$('availability').checked=false;clearAvailability(false);applyFilters(false);goToPlace('metro');});
  $('availability').addEventListener('change',()=>{$('availability').checked?refreshAvailability():clearAvailability();});
  for(const id of ['date-start','date-end'])$(id).addEventListener('change',()=>{if(validInputs()){applyFilters();queueAnalyses();queueAvailability();}});
  $('five-years').addEventListener('click',()=>{$('date-start').value=defaultStart;$('date-end').value=today;validInputs();applyFilters();queueAnalyses();queueAvailability();});
  $('multi-select').addEventListener('click',()=>{state.multi=!state.multi;$('multi-select').setAttribute('aria-pressed',String(state.multi));showToast(state.multi?'Mode comparaison : chaque clic ajoute ou retire une station.':'Un clic sélectionne une station ; Maj + clic permet de comparer.');});
  $('box-select').addEventListener('click',()=>{state.boxMode=!state.boxMode;$('box-select').setAttribute('aria-pressed',String(state.boxMode));$('map').classList.toggle('box-select-active',state.boxMode);});
  $('river-search').addEventListener('input',renderRiverResults);
  $('clear-river').addEventListener('click',()=>{state.activeRiver=null;$('river-search').value='';updateRiverControls();applyFilters();});
  $('select-river').addEventListener('click',()=>{const group=state.rivers.get(state.riverCandidate||state.activeRiver);if(!group)return;state.activeRiver=group.key;state.riverCandidate=group.key;$('river-search').value=prettyName(group.name);$('river-results').hidden=true;$('search').value='';$('basin').value='';$('territory').value='';state.selected=group.stations.filter(s=>hasChosenMeasurements(s)&&(!state.availability||state.availability.has(s.code_station))).map(s=>s.code_station);state.historyPage=0;clearSnapshot();updateSelection();applyFilters(true);queueAnalyses();showToast(`${number(state.selected.length)} stations sélectionnées sur ${prettyName(group.name)}.`);});
  $('river-lines').addEventListener('change',renderRiverLinks);
  for(const p of PARAMETERS){const option=node('option','',p.label);option.value=p.code;$('map-parameter').append(option);}
  riverProfile=installRiverProfile({parameters:PARAMETERS,stationName,context:()=>{const group=state.rivers.get(state.riverCandidate||state.activeRiver);if(!group)return null;return {key:group.key,name:prettyName(group.name),stations:state.selected.map(code=>state.stationByCode.get(code)).filter(s=>s&&riverKey(s)===group.key),start:$('date-start').value,end:$('date-end').value};},loadGeometry:ensureRiverGeometry,loadRows:loadProfileRows});
  $('map-date').value=today;$('load-date-view').addEventListener('click',refreshSnapshot);$('clear-date-view').addEventListener('click',()=>clearSnapshot());$('snapshot-fraction').addEventListener('change',()=>applySnapshotGroup());
  $('history-prev').addEventListener('click',()=>{if(state.historyPage>0){state.historyPage--;updateSelection();queueAnalyses();}});
  $('history-next').addEventListener('click',()=>{if((state.historyPage+1)*HISTORY_PAGE_SIZE<state.selected.length){state.historyPage++;updateSelection();queueAnalyses();}});
  $('fit-stations').addEventListener('click',()=>fitResults());
  document.querySelectorAll('[data-place]').forEach(button=>button.addEventListener('click',()=>goToPlace(button.dataset.place)));
  $('clear-selection').addEventListener('click',()=>{state.selected=[];state.historyPage=0;clearSnapshot();updateSelection();queueAnalyses();});
  $('export-csv').addEventListener('click',exportCsv);
  for(const id of ['help-open','help-bottom'])$(id).addEventListener('click',()=>$('help-dialog').showModal());
  $('help-close').addEventListener('click',()=>$('help-dialog').close());
  $('help-dialog').addEventListener('click',event=>{if(event.target===$('help-dialog')){const r=$('help-dialog').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)$('help-dialog').close();}});
  updatePresets();
}
function updatePresets(){state.parameterMask=(state.coverage?.codes||PARAMETERS.map(p=>p.code)).reduce((mask,code,i)=>state.parameters.has(code)?mask|2**i:mask,0);$('mobile-filter-summary').textContent=`${state.parameters.size} paramètre${state.parameters.size>1?'s':''}`;document.querySelectorAll('[data-preset]').forEach(button=>{const preset=PRESETS[button.dataset.preset];button.classList.toggle('active',preset.length===state.parameters.size&&preset.every(p=>state.parameters.has(p)));});}
function syncParameters(){document.querySelectorAll('#parameter-list input').forEach(input=>input.checked=state.parameters.has(input.value));updatePresets();}
function goToPlace(place){const p=places[place];if(!p||!map)return;if(place==='metro')map.fitBounds([[41.2,-5.3],[51.2,9.7]],{padding:[18,22]});else map.setView(p.center,p.zoom);}

function initMap(){
  map=L.map('map',{preferCanvas:true,zoomControl:false,minZoom:2,zoomSnap:.25,worldCopyJump:false,boxZoom:false,scrollWheelZoom:true}).setView(places.metro.center,places.metro.zoom);goToPlace('metro');
  L.control.zoom({position:'topright'}).addTo(map);
  installMapBackground(map,{select:$('map-background'),status:$('background-status'),protocol:location.protocol});
  map.createPane('stations').style.zIndex='450';map.getPane('stations').style.pointerEvents='none';
  map.createPane('river-links').style.zIndex='440';map.getPane('river-links').style.pointerEvents='none';
  stationLayer=createStationLayer({label:mapStationLabel,onSelect:selectStation,style:stationStyle}).addTo(map);linkLayer=L.layerGroup().addTo(map);
  installRectangleSelection(map,stationLayer,{isActive:()=>state.boxMode,onBounds:(bounds,code)=>{if(code){selectStation(code,true);return;}const added=state.filtered.filter(s=>bounds.contains([s.latitude,s.longitude])).map(s=>s.code_station);state.selected=[...new Set([...state.selected,...added])];state.historyPage=0;identifySelectedRiver();clearSnapshot();updateSelection();queueAnalyses();showToast(`${number(added.length)} stations dans le rectangle · ${number(state.selected.length)} sélectionnées.`);},onComplete:()=>{state.boxMode=false;$('box-select').setAttribute('aria-pressed','false');$('map').classList.remove('box-select-active');}});
  map.on('moveend',renderStationList);
  const geo=globalThis.RIVER_BOOT_DATA?.departments;if(geo)L.geoJSON(geo,{interactive:false,style:{color:'#b6ccc3',weight:.65,fillColor:'#f3f6ee',fillOpacity:.35}}).addTo(map).bringToBack();
}

function applyFilters(fit=false){
  const query=$('search').value,basin=$('basin').value,territory=$('territory').value,tokens=normalize(query).trim().split(/\s+/).filter(Boolean);
  state.filtered=state.stations.filter(s=>($('all-environments').checked||String(s.type_entite_hydro)==='2')&&hasChosenMeasurements(s)&&(!state.activeRiver||riverKey(s)===state.activeRiver)&&(!state.snapshot||state.snapshot.target.has(s.code_station))&&matchesStation(s,tokens,basin,territory)&&(!state.availability||state.availability.has(s.code_station)));
  $('filtered-count').textContent=`${number(state.filtered.length)} station${state.filtered.length>1?'s':''} affichée${state.filtered.length>1?'s':''}`;
  $('filter-summary').textContent=[state.activeRiver&&prettyName(state.rivers.get(state.activeRiver)?.name),query&&`« ${query} »`,basin&&basinLabel(basin),state.availability&&'Mesures disponibles sur la période'].filter(Boolean).join(' · ')||`${$('all-environments').checked?'Cours d’eau et plans d’eau':'Cours d’eau'} · France et outre-mer`;
  const recent=state.coverage?.recent,useRecent=recent&&$('date-start').value>=recent.start&&$('date-end').value<=recent.end;
  if(state.coverage)$('coverage-note').textContent=`Au moins une analyse choisie ${useRecent?`entre ${recent.start.slice(0,4)} et ${recent.end.slice(0,4)}`:'dans l’historique complet'}. Index du ${date(state.coverage.retrievedAt)}.`;
  updateCatalogueCount();
  updateRiverControls();renderMarkers();renderStationList();renderRiverLinks();
  if(fit&&state.filtered.length&&(query.trim().length>=2||basin||state.activeRiver))fitResults();
}
function fitResults(){
  if(!state.filtered.length){showToast('Aucune station pour ces filtres.');return;}
  const metro=state.filtered.filter(s=>s.latitude>40&&s.latitude<52&&s.longitude>-6&&s.longitude<10);
  const points=(!($('search').value||$('basin').value||$('territory').value)&&metro.length)?metro:state.filtered;
  map.fitBounds(L.latLngBounds(points.map(s=>[s.latitude,s.longitude])),{padding:[35,35],maxZoom:12});
}
function renderMarkers(){
  stationLayer.setStations([...state.filtered.filter(s=>!state.selectedSet.has(s.code_station)),...state.filtered.filter(s=>state.selectedSet.has(s.code_station))]);$('map-loading').hidden=true;
}
function renderSelectionMarkers(){
  renderMarkers();renderRiverLinks();
}
function renderStationList(){
  if(!map)return;const bounds=map.getBounds();let visible=state.filtered.filter(s=>bounds.contains([s.latitude,s.longitude]));
  if($('search').value.trim()&&visible.length===0)visible=state.filtered;
  const center=map.getCenter();const ranked=visible.map(s=>({s,d:(s.latitude-center.lat)**2+(s.longitude-center.lng)**2})).sort((a,b)=>a.d-b.d);
  $('nearby-count').textContent=`${number(visible.length)} dans cette vue`;
  $('nearby-title').textContent=$('search').value.trim()?'Résultats de recherche':'Stations dans cette zone';
  const list=$('station-list');list.replaceChildren();
  const shortlist=[],seenNames=new Set();for(const entry of ranked){const key=stationName(entry.s)+'|'+stationContext(entry.s);if(!seenNames.has(key)){shortlist.push(entry);seenNames.add(key);}if(shortlist.length===8)break;}
  for(const {s} of shortlist){const wrapper=node('div');wrapper.setAttribute('role','listitem');const item=node('button','station-item');item.type='button';item.dataset.station=s.code_station;item.setAttribute('aria-pressed',String(state.selected.includes(s.code_station)));item.title=stationName(s);const dot=node('span','station-dot');if(state.selected.includes(s.code_station))dot.style.background=stationColor(s.code_station);const text=node('span');text.append(node('strong','',stationName(s)),node('small','',stationContext(s)));item.append(dot,text);item.addEventListener('click',e=>{selectStation(s.code_station,e.shiftKey);if(!bounds.contains([s.latitude,s.longitude]))map.setView([s.latitude,s.longitude],11);});wrapper.append(item);list.append(wrapper);}
  if(!ranked.length)list.append(node('p','muted tiny','Aucune station dans cette zone. Dézoomez ou ajustez vos filtres.'));
}

function selectStation(code,shift=false){
  if(!state.stationByCode.has(code))return;
  if(shift||state.multi){if(state.selected.includes(code))state.selected=state.selected.filter(c=>c!==code);else state.selected.push(code);}
  else state.selected=[code];
  state.historyPage=Math.max(0,Math.floor(Math.max(0,state.selected.indexOf(code))/HISTORY_PAGE_SIZE));identifySelectedRiver(code);clearSnapshot();updateSelection();queueAnalyses();
}
function updateSelection(){
  state.selectedSet=new Set(state.selected);state.historyPage=Math.min(state.historyPage,Math.max(0,Math.ceil(state.selected.length/HISTORY_PAGE_SIZE)-1));
  if(!state.riverCandidate||!state.selected.some(code=>riverKey(state.stationByCode.get(code))===state.riverCandidate))identifySelectedRiver();
  updateRiverControls();
  const selected=$('selected-stations');selected.replaceChildren();
  for(const code of historyCodes()){const s=state.stationByCode.get(code);if(!s)continue;const chip=node('span','station-chip');const dot=node('span','chip-dot');dot.style.background=stationColor(code);const remove=node('button','','×');remove.setAttribute('aria-label',`Retirer ${stationName(s)}`);remove.addEventListener('click',()=>{state.selected=state.selected.filter(c=>c!==code);clearSnapshot();updateSelection();queueAnalyses();});chip.append(dot,node('span','',stationName(s)),remove);selected.append(chip);}
  $('history-pages').hidden=state.selected.length<=HISTORY_PAGE_SIZE;$('history-prev').disabled=state.historyPage===0;$('history-next').disabled=(state.historyPage+1)*HISTORY_PAGE_SIZE>=state.selected.length;
  $('history-page-label').textContent=`Courbes : stations ${state.historyPage*HISTORY_PAGE_SIZE+1}–${Math.min((state.historyPage+1)*HISTORY_PAGE_SIZE,state.selected.length)} sur ${number(state.selected.length)} · toutes restent sélectionnées sur la carte`;
  $('clear-selection').disabled=!state.selected.length;
  const period=validDateRange($('date-start').value,$('date-end').value)?`Du ${date($('date-start').value)} au ${date($('date-end').value)}`:'Période à préciser';
  $('analysis-subtitle').textContent=state.selected.length?`${state.selected.length} station${state.selected.length>1?'s':''} sélectionnée${state.selected.length>1?'s':''} · ${period}`:'Sélectionnez une station pour afficher ses mesures.';
  renderSelectionMarkers();renderStationList();persistSelection();
}
function queueAnalyses(){analysisController?.abort();state.analysisGeneration++;$('export-csv').disabled=true;if(state.selected.length)showStatus('Mise à jour des mesures…');clearTimeout(queryTimer);queryTimer=setTimeout(()=>refreshAnalyses(),240);persistSelection();}

async function fetchJson(url,signal){
  let lastError;
  for(let attempt=0;attempt<3;attempt++){
    try{const requestSignal=AbortSignal.any([signal,AbortSignal.timeout(45000)].filter(Boolean));const response=await fetch(url,{signal:requestSignal});if(!response.ok){if(response.status===429||response.status>=500){lastError=new Error(`Hub’Eau temporairement indisponible (${response.status}).`);if(attempt<2){await new Promise((resolve,reject)=>{const timeout=setTimeout(resolve,900*(attempt+1));signal?.addEventListener('abort',()=>{clearTimeout(timeout);reject(new DOMException('Requête annulée','AbortError'));},{once:true});});continue;}}throw Error(`Réponse Hub’Eau ${response.status}.`);}return await response.json();}
    catch(error){if(error.name==='AbortError')throw error;lastError=error;if(attempt===2)throw error;}
  }throw lastError;
}
const analysisFields='code_analyse,code_station,code_parametre,libelle_parametre,date_prelevement,heure_prelevement,resultat,symbole_unite,code_unite,code_remarque,mnemo_remarque,code_fraction,libelle_fraction,code_qualification,libelle_qualification,limite_quantification';
async function fetchAnalysisRange(codes,params,start,end,signal){
  if(codes.length>150){const rows=[];for(let i=0;i<codes.length;i+=150)rows.push(...await fetchAnalysisRange(codes.slice(i,i+150),params,start,end,signal));return rows;}
  const query=new URLSearchParams({code_station:codes.join(','),code_parametre:params.join(','),code_support:'3',code_qualification:'1',date_debut_prelevement:start,date_fin_prelevement:end,fields:analysisFields,size:'20000',sort:'asc',exact_count:'true'});
  const payload=await fetchJson(API+'analyse_pc?'+query,signal);
  if(!Array.isArray(payload.data)||!Number.isInteger(payload.count))throw Error('Réponse Hub’Eau incomplète.');
  if(Number(payload.count)>20000){const ranges=splitDateRange(start,end);if(!ranges){if(codes.length>1){const half=Math.ceil(codes.length/2);return [...await fetchAnalysisRange(codes.slice(0,half),params,start,end,signal),...await fetchAnalysisRange(codes.slice(half),params,start,end,signal)];}throw Error('Trop de résultats sur une seule journée pour cette station.');}let rows=[];for(const [a,b] of ranges)rows.push(...await fetchAnalysisRange(codes,params,a,b,signal));return rows;}
  let rows=payload.data??[];let next=payload.next;
  while(next){if(new URL(next).origin!==new URL(API).origin)throw Error('Adresse de pagination inattendue.');const page=await fetchJson(next.replace(/^http:/,'https:'),signal);rows.push(...(page.data??[]));next=page.next;}
  return rows;
}
async function refreshAnalyses(){
  if(!validInputs())return;analysisController?.abort();analysisController=new AbortController();const signal=analysisController.signal,generation=++state.analysisGeneration;
  state.rows=[];$('export-csv').disabled=true;$('data-details').hidden=true;$('chart-reading').hidden=true;destroyCharts();
  if(!state.selected.length){showStatus('');renderEmpty();return;}
  updateSelection();
  if(!state.parameters.size){showStatus('Choisissez au moins un paramètre dans les filtres.');$('charts').replaceChildren();return;}
  const codes=historyCodes(),params=[...state.parameters].sort(),start=$('date-start').value,end=$('date-end').value;
  const key=JSON.stringify([codes.slice().sort(),params,start,end]);
  showStatus('Chargement des analyses des stations sélectionnées…');$('charts').replaceChildren();
  try{
    let rows=[],localCount=0;
    if(state.cache.has(key)){const cached=state.cache.get(key);rows=cached.rows;localCount=cached.localCount;}
    else{
      const remote=[];const example=state.examples;
      for(const code of codes){
        if(example&&example.stations.includes(code)&&params.every(p=>example.parameters.includes(p))&&start>=example.start&&end<=example.end){rows.push(...example.data.filter(r=>r.code_station===code&&params.includes(String(r.code_parametre))&&r.date_prelevement>=start&&r.date_prelevement<=end));localCount++;}
        else remote.push(code);
      }
      if(remote.length)rows.push(...await fetchAnalysisRange(remote,params,start,end,signal));
      rows=deduplicate(rows).filter(r=>codes.includes(r.code_station)&&params.includes(String(r.code_parametre))&&r.date_prelevement>=start&&r.date_prelevement<=end&&String(r.code_qualification)==='1');
      state.cache.set(key,{rows,localCount});if(state.cache.size>24)state.cache.delete(state.cache.keys().next().value);
    }
    if(generation!==state.analysisGeneration||signal.aborted)return;
    state.rows=rows;
    showStatus(rows.length?`${number(rows.length)} analyses qualifiées · ${localCount===codes.length?'Instantané local du '+date(state.examples.retrievedAt):'Données Naïades via Hub’Eau'}${rows.some(r=>thresholdKind(r)==='unknown'&&!quantified(r))?' · Certaines valeurs de remarque inconnue figurent uniquement dans le tableau.':''}`:'Aucune analyse qualifiée disponible pour ces paramètres et cette période.');
    renderCharts();renderDataTable();$('export-csv').disabled=!rows.length;$('chart-reading').hidden=!rows.length;$('data-details').hidden=!rows.length;
  }catch(error){if(error.name==='AbortError'||generation!==state.analysisGeneration)return;showStatus('Les analyses n’ont pas pu être chargées. Vérifiez votre connexion ou essayez l’exemple conservé localement.',true,true);$('charts').replaceChildren();}
}
function destroyCharts(){for(const chart of state.charts)chart.destroy();state.charts=[];}
function renderEmpty(){
  const empty=node('div','empty-state');const icon=node('div','empty-icon');icon.innerHTML='<svg viewBox="0 0 80 54" aria-hidden="true"><path d="M2 48h76M9 42l14-15 14 6 17-25 18 12"/><circle cx="23" cy="27" r="3"/><circle cx="54" cy="8" r="3"/></svg>';
  empty.append(icon,node('h3','','Aucune station sélectionnée'),node('p','','Cliquez sur un point. Maj + clic ajoute une station à la comparaison.'));
  const button=node('button','solid-button','Exemple : la Crusnes');button.id='example-button';button.disabled=!state.examples;button.addEventListener('click',loadExample);empty.append(button);$('charts').replaceChildren(empty);
}
function loadExample(){
  const codes=(state.examples?.stations??[]).filter(code=>state.stationByCode.has(code));if(!codes.length){showToast('L’exemple local est indisponible. Sélectionnez une station sur la carte.');return;}
  state.selected=codes.slice(0,2);state.historyPage=0;state.activeRiver=null;clearSnapshot();state.parameters=new Set(['1340','1311','1301','1302']);syncParameters();$('date-start').value=state.examples.start;$('date-end').value=state.examples.end;$('availability').checked=false;clearAvailability(false);$('search').value='Crusnes';$('basin').value='';$('territory').value='';applyFilters(true);updateSelection();refreshAnalyses();$('analysis').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
}

function renderCharts(){
  const parent=$('charts');parent.replaceChildren();const groups=groupAnalyses(state.rows);
  for(const code of state.parameters){const matching=groups.filter(g=>g.code===code);const parameter=PARAMETERS.find(p=>p.code===code);
    if(!matching.length){const card=node('article','chart-card');card.append(node('h3','',parameter.label),node('p','chart-description',parameter.description),node('div','chart-empty','Aucune mesure disponible pour les stations et la période sélectionnées.'));parent.append(card);continue;}
    for(const group of matching){
      const card=node('article','chart-card'),head=node('div','chart-card-head');head.append(node('h3','',parameter.label),node('span','unit-badge',group.unit||'Sans unité'));card.append(head,node('p','chart-description',parameter.description));
      const canvasWrap=node('div','chart-canvas'),canvas=document.createElement('canvas');canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${parameter.label}, ${group.unit||'sans unité'}, ${group.fraction} : ${group.rows.length} analyses. Valeurs disponibles dans le tableau ci-dessous.`);canvasWrap.append(canvas);card.append(canvasWrap);
      const sorted=group.rows.map(r=>r.date_prelevement).sort();const meta=node('div','chart-meta');meta.append(node('span','',`${number(group.rows.length)} analyses · ${group.fraction}`),node('span','',`${date(sorted[0])} — ${date(sorted.at(-1))}`));card.append(meta);parent.append(card);
      const datasets=[];
      for(const station of historyCodes()){const s=state.stationByCode.get(station);const rows=group.rows.filter(r=>r.code_station===station);const color=stationColor(station);
        const points=rows.map(row=>({x:Date.parse(row.date_prelevement+'T'+(row.heure_prelevement||'12:00:00')+'Z'),y:quantified(row)?row.resultat:null,row}));
        datasets.push({label:stationName(s),data:points,borderColor:color,backgroundColor:color,borderWidth:1.6,pointRadius:rows.length>120?1.6:2.5,pointHoverRadius:5,tension:0,spanGaps:false});
        const thresholds=rows.filter(r=>['below','above'].includes(thresholdKind(r))).map(row=>({x:Date.parse(row.date_prelevement+'T'+(row.heure_prelevement||'12:00:00')+'Z'),y:row.resultat,row}));
        if(thresholds.length)datasets.push({label:stationName(s),data:thresholds,showLine:false,borderColor:color,backgroundColor:'#fff',pointBorderWidth:1.5,pointRadius:4,pointStyle:'triangle',pointRotation:context=>thresholdKind(context.raw?.row??{})==='below'?180:0});
      }
      const chart=new Chart(canvas,{type:'line',data:{datasets},options:{responsive:true,maintainAspectRatio:false,animation:false,parsing:false,normalized:false,interaction:{mode:'nearest',intersect:false},plugins:{legend:{display:false},tooltip:{backgroundColor:'#173f4b',padding:10,displayColors:true,callbacks:{title:items=>items.length?date(items[0].raw.row.date_prelevement):'',label:item=>`${item.dataset.label} : ${resultLabel(item.raw.row)} ${group.unit}`,afterLabel:item=>quantified(item.raw.row)?'':item.raw.row.mnemo_remarque||'Valeur de seuil'}}},scales:{x:{type:'linear',min:Date.parse($('date-start').value),max:Date.parse($('date-end').value)+86399999,grid:{display:false},border:{display:false},ticks:{maxTicksLimit:6,color:'#7b9089',font:{size:9},callback:value=>dateShort(value)}},y:{grid:{color:'#eef2ed'},border:{display:false},ticks:{maxTicksLimit:5,color:'#7b9089',font:{size:9},callback:value=>new Intl.NumberFormat('fr-FR',{maximumFractionDigits:3}).format(value)}}}}});
      state.charts.push(chart);
    }
  }
}
function renderDataTable(){
  const rows=state.rows.slice().sort((a,b)=>b.date_prelevement.localeCompare(a.date_prelevement)||a.code_station.localeCompare(b.code_station));const table=$('data-table');table.replaceChildren();
  for(const row of rows.slice(0,400)){const tr=node('tr'),s=state.stationByCode.get(row.code_station);for(const text of [date(row.date_prelevement),s?stationName(s):row.code_station,parameterLabel(String(row.code_parametre)),`${resultLabel(row)} ${row.symbole_unite||''}`,row.libelle_fraction||'Non précisée',[row.libelle_qualification,row.mnemo_remarque].filter(Boolean).join(' · ')])tr.append(node('td','',text));table.append(tr);}
  $('table-count').textContent=`(${number(rows.length)} analyses)`;$('table-note').textContent=rows.length>400?'Les 400 analyses les plus récentes sont affichées ici. L’export CSV contient toutes les analyses chargées.':'Le tableau et l’export conservent les unités, les fractions d’eau et les remarques analytiques de la source.';
}
function exportCsv(){
  if(!state.rows.length)return;
  const header=['Date du prélèvement','Heure','Station','Identifiant station','Paramètre','Identifiant paramètre','Résultat source','Unité','Remarque','Fraction','Qualification','Identifiant analyse'];
  const rows=state.rows.slice().sort((a,b)=>a.date_prelevement.localeCompare(b.date_prelevement)).map(r=>{const s=state.stationByCode.get(r.code_station);return [csvCell(r.date_prelevement),csvCell(r.heure_prelevement),csvText(s?stationName(s):r.code_station),csvCell(r.code_station),csvText(parameterLabel(String(r.code_parametre))),csvCell(r.code_parametre),csvCell(r.resultat),csvText(r.symbole_unite),csvText(r.mnemo_remarque),csvText(r.libelle_fraction),csvText(r.libelle_qualification),csvCell(r.code_analyse)].join(';');});
  const blob=new Blob(['\ufeff'+header.map(csvCell).join(';')+'\r\n'+rows.join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`au-fil-de-leau_${$('date-start').value}_${$('date-end').value}.csv`;link.hidden=true;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);showToast(`${number(state.rows.length)} analyses préparées pour l’export.`);
}

function clearAvailability(render=true){availabilityController?.abort();state.availabilityGeneration++;state.availability=null;$('availability-status').textContent='';if(render)applyFilters(false);}
function queueAvailability(){if(!$('availability').checked)return;clearTimeout(availabilityTimer);availabilityTimer=setTimeout(refreshAvailability,450);}
async function fetchAvailableStationIds(params,start,end,signal){
  const query=new URLSearchParams({code_parametre:params.join(','),code_support:'3',code_qualification:'1',date_debut_prelevement:start,date_fin_prelevement:end,fields:'code_station',size:'20000',sort:'asc',exact_count:'true'});
  const payload=await fetchJson(API+'station_pc?'+query,signal);
  if(!Array.isArray(payload.data)||!Number.isInteger(payload.count))throw Error('Réponse Hub’Eau incomplète.');
  if(Number(payload.count)>40000)throw Error('Le catalogue dépasse la profondeur de cette première version.');
  let ids=(payload.data??[]).map(s=>s.code_station);
  if(Number(payload.count)>20000){query.set('sort','desc');const last=await fetchJson(API+'station_pc?'+query,signal);ids.push(...(last.data??[]).map(s=>s.code_station));}
  ids=[...new Set(ids)];if(ids.length!==Number(payload.count))throw Error('La réponse des stations est incomplète.');return ids;
}
async function refreshAvailability(){
  if(!validInputs())return;if(!state.parameters.size){$('availability-status').textContent='Choisissez au moins un paramètre.';return;}
  availabilityController?.abort();availabilityController=new AbortController();const signal=availabilityController.signal,generation=++state.availabilityGeneration;
  $('availability-status').textContent='Recherche des stations avec au moins une de ces mesures…';
  try{const ids=await fetchAvailableStationIds([...state.parameters],$('date-start').value,$('date-end').value,signal);if(generation!==state.availabilityGeneration||signal.aborted)return;state.availability=new Set(ids);$('availability-status').textContent=`${number(state.availability.size)} stations avec au moins un paramètre choisi. Les autres filtres restent actifs.`;applyFilters(false);}
  catch(error){if(error.name==='AbortError')return;state.availability=null;$('availability').checked=false;$('availability-status').textContent='Vérification de la période indisponible ; l’index local reste utilisé.';applyFilters(false);}
}

function renderRiverResults(){
 const query=$('river-search').value.trim(),list=$('river-results');list.replaceChildren();if(query.length<2){list.hidden=true;return;}
 const results=[...state.rivers.values()].filter(group=>riverMatches(group,query)&&group.stations.some(hasChosenMeasurements)).sort((a,b)=>a.name.localeCompare(b.name,'fr')).slice(0,15);
 for(const group of results){const button=node('button','river-result'),dot=node('span','station-dot');dot.style.background=riverColor(group.key);const count=group.stations.filter(hasChosenMeasurements).length,context=basinLabel(group.basin)||[...new Set(group.stations.map(s=>prettyName(s.libelle_departement)).filter(Boolean))].slice(0,2).join(', ')||'Bassin non renseigné';button.append(dot,node('span','',`${prettyName(group.name)} · ${context} · ${number(count)} station${count>1?'s':''}`));button.title=`Identifiant officiel : ${group.key}`;button.addEventListener('click',()=>{state.activeRiver=group.key;$('river-search').value=prettyName(group.name);list.hidden=true;$('search').value='';$('basin').value='';$('territory').value='';state.selected=[];state.historyPage=0;clearSnapshot();updateSelection();applyFilters(true);queueAnalyses();});list.append(button);}
 if(!results.length)list.append(node('p','muted tiny','Aucun cours d’eau avec ces mesures.'));
 list.hidden=false;
}
function identifySelectedRiver(preferredCode=''){
 state.riverCandidate=preidentifiedRiver(state.selected,state.stationByCode,preferredCode);
 const group=state.rivers.get(state.riverCandidate||state.activeRiver);if(group){$('river-search').value=prettyName(group.name);$('river-results').hidden=true;}else if($('river-results').hidden)$('river-search').value='';
}
function updateRiverControls(){
 const group=state.rivers.get(state.riverCandidate||state.activeRiver),count=group?.stations.filter(s=>hasChosenMeasurements(s)&&(!state.availability||state.availability.has(s.code_station))).length||0;
 $('select-river').disabled=!group||!count;$('clear-river').hidden=!state.activeRiver;$('river-active').textContent=group?`${prettyName(group.name)} · ${number(count)} stations avec analyses`:'Cliquez sur une station pour identifier son cours d’eau';
 $('select-river').textContent='Sélectionner ce cours d’eau';$('select-river').title=group?`${number(count)} stations sur ${prettyName(group.name)}`:'';
 riverProfile?.update();
}
function renderRiverLinks(){
 if(!linkLayer)return;linkLayer.clearLayers();$('river-geometry-note').textContent='';if(!$('river-lines').checked)return;
 const keys=new Set(state.activeRiver?[state.activeRiver]:state.selected.map(code=>riverKey(state.stationByCode.get(code))).filter(Boolean));
 if(keys.size>15){$('river-geometry-note').textContent='Ciblez un cours d’eau pour afficher son tracé.';return;}
 const visible=new Set(state.filtered.map(s=>s.code_station));let real=0,schematic=0;
 for(const key of keys){
  const group=state.rivers.get(key);if(!group)continue;
  const geometry=geometryCache.get(key);
  if(geometry){L.geoJSON(geometry,{pane:'river-links',interactive:false,style:{color:riverColor(key),weight:3,opacity:.72}}).addTo(linkLayer);real++;continue;}
  if(!geometryCache.has(key)){geometryCache.set(key,null);geometryQueue.push(key);pumpGeometry();}
  if(!state.links.has(key))state.links.set(key,stationLinks(group.stations.filter(s=>String(s.type_entite_hydro)==='2')));
  const segments=state.links.get(key).filter(([a,b])=>visible.has(a.code_station)&&visible.has(b.code_station));
  L.polyline(segments.map(([a,b])=>[[a.latitude,a.longitude],[b.latitude,b.longitude]]),{pane:'river-links',interactive:false,color:riverColor(key),weight:2,opacity:.6,dashArray:'5 5'}).addTo(linkLayer);
  if(segments.length)schematic++;
 }
 $('river-geometry-note').textContent=real?`Trait plein : tracé Sandre, BD CARTHAGE 2017${schematic?' · pointillés : liaisons schématiques':''}.`:schematic?'Pointillés : liaisons schématiques entre stations, sans sens d’écoulement.':'';
}
function pumpGeometry(){
 while(geometryActive<2&&geometryQueue.length){const key=geometryQueue.shift();geometryActive++;loadRiverGeometry(key).then(geo=>{geometryCache.set(key,geo);for(const waiter of geometryWaiters.get(key)||[])waiter.resolve(geo);geometryWaiters.delete(key);}).catch(error=>{geometryCache.set(key,false);for(const waiter of geometryWaiters.get(key)||[])waiter.reject(error);geometryWaiters.delete(key);}).finally(()=>{geometryActive--;renderRiverLinks();pumpGeometry();});}
}
function ensureRiverGeometry(key){
 const cached=geometryCache.get(key);if(cached)return Promise.resolve(cached);
 const pending=new Promise((resolve,reject)=>{if(!geometryWaiters.has(key))geometryWaiters.set(key,[]);geometryWaiters.get(key).push({resolve,reject});});
 if(!geometryCache.has(key)||cached===false){geometryCache.set(key,null);geometryQueue.push(key);pumpGeometry();}return pending;
}
async function loadProfileRows(codes,param,start,end,signal){
 if(!validDateRange(start,end))throw Error('La période des analyses est invalide.');
 // Reuse a temporal cache only when it covers every requested station and date.
 // Pagination of temporal charts must never restrict the longitudinal profile.
 for(const [key,value] of state.cache){const parts=JSON.parse(key);if(Array.isArray(parts[0])&&codes.every(code=>parts[0].includes(code))&&parts[1].includes(param)&&start>=parts[2]&&end<=parts[3])return value.rows.filter(r=>codes.includes(r.code_station)&&String(r.code_parametre)===param&&r.date_prelevement>=start&&r.date_prelevement<=end);}
 const local=[],remote=[];for(const code of codes){const example=state.examples;if(example&&example.stations.includes(code)&&example.parameters.includes(param)&&start>=example.start&&end<=example.end)local.push(...example.data.filter(r=>r.code_station===code&&String(r.code_parametre)===param&&r.date_prelevement>=start&&r.date_prelevement<=end));else remote.push(code);}
 return deduplicate([...local,...(remote.length?await fetchAnalysisRange(remote,[param],start,end,signal):[])]);
}
async function loadRiverGeometry(key){
 if(!/^[\w-]+$/.test(key))throw Error('Identifiant hydrographique invalide');
 const filter=`<ogc:Filter xmlns:ogc="http://www.opengis.net/ogc"><ogc:PropertyIsEqualTo><ogc:PropertyName>CdEntiteHydrographique</ogc:PropertyName><ogc:Literal>${key}</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>`;
 const query=new URLSearchParams({service:'WFS',request:'GetFeature',version:'1.0.0',typeName:'sa:CoursEau_Carthage2017',srsName:'EPSG:4326',filter,maxFeatures:'2'});
 const response=await fetch('https://services.sandre.eaufrance.fr/geo/eth?'+query,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Tracé indisponible');
 const xml=new DOMParser().parseFromString(await response.text(),'application/xml');if(xml.getElementsByTagName('parsererror').length)throw Error('Tracé invalide');
 const features=[];for(const member of xml.getElementsByTagNameNS('*','CoursEau_Carthage2017')){
  const code=member.getElementsByTagNameNS('*','CdEntiteHydrographique')[0]?.textContent?.trim();if(code!==key)continue;
  const lines=[];for(const line of member.getElementsByTagNameNS('*','LineString')){const text=line.getElementsByTagNameNS('*','coordinates')[0]?.textContent?.trim();if(!text)continue;const coordinates=text.split(/\s+/).map(pair=>pair.split(',').slice(0,2).map(Number));if(coordinates.length>=2&&coordinates.every(([x,y])=>Number.isFinite(x)&&Number.isFinite(y)&&Math.abs(x)<=180&&Math.abs(y)<=90))lines.push(coordinates);}
  if(lines.length)features.push({type:'Feature',properties:{code_cours_eau:key},geometry:{type:'MultiLineString',coordinates:lines}});
 }
 if(!features.length)throw Error('Aucun tracé dans ce référentiel');return {type:'FeatureCollection',features};
}
function clearSnapshot(){
 snapshotController?.abort();state.snapshotGeneration++;state.snapshot=null;state.snapshotContext=null;$('load-date-view').disabled=false;$('clear-date-view').hidden=true;$('snapshot-fraction-label').hidden=true;$('snapshot-table-wrap').hidden=true;$('map-legend').replaceChildren(document.createTextNode('Couleur : cours d’eau · Cercle bordé : sélection'));$('snapshot-status').textContent='Sélectionnez des stations ou un cours d’eau. Le prélèvement le plus proche sera retenu dans l’écart accepté.';if(stationLayer)applyFilters();persistSelection();
}
async function refreshSnapshot(){
 const day=$('map-date').value,param=$('map-parameter').value,tolerance=Number($('map-tolerance').value);
 if(!validDateRange(day,day)){showToast('Choisissez une date valide.');return;}
 const codes=state.selected.length?[...state.selected]:(state.rivers.get(state.activeRiver)?.stations.filter(hasChosenMeasurements).map(s=>s.code_station)||[]);
 if(!codes.length){$('snapshot-status').textContent='Sélectionnez d’abord des stations, par rectangle ou par cours d’eau.';return;}
 snapshotController?.abort();snapshotController=new AbortController();const signal=snapshotController.signal,generation=++state.snapshotGeneration;
 const [start,end]=dateWindow(day,tolerance),key=JSON.stringify(['snapshot',codes.slice().sort(),param,start,end]);
 $('snapshot-status').textContent=`Chargement de ${parameterLabel(param)} pour ${number(codes.length)} stations…`;$('load-date-view').disabled=true;
 try{
  let rows=state.cache.get(key)?.rows;
  if(!rows){const local=[],remote=[];for(const code of codes){const example=state.examples;if(example&&example.stations.includes(code)&&example.parameters.includes(param)&&start>=example.start&&end<=example.end)local.push(...example.data.filter(r=>r.code_station===code&&String(r.code_parametre)===param&&r.date_prelevement>=start&&r.date_prelevement<=end));else remote.push(code);}rows=deduplicate([...local,...(remote.length?await fetchAnalysisRange(remote,[param],start,end,signal):[])]);state.cache.set(key,{rows});}
  if(generation!==state.snapshotGeneration||signal.aborted)return;
  const groups=groupAnalyses(rows.filter(r=>codes.includes(r.code_station)&&String(r.code_parametre)===param&&r.date_prelevement>=start&&r.date_prelevement<=end));groups.sort((a,b)=>b.rows.length-a.rows.length);
  state.snapshotContext={codes,day,tolerance,param,start,end,groups};const select=$('snapshot-fraction');select.replaceChildren();
  groups.forEach((group,index)=>{const option=node('option','',`${group.unit||'Sans unité'} · ${group.fraction} · ${number(group.rows.length)} analyses`);option.value=String(index);select.append(option);});
  $('snapshot-fraction-label').hidden=groups.length<2;applySnapshotGroup();
 }catch(error){if(error.name!=='AbortError'&&generation===state.snapshotGeneration)$('snapshot-status').textContent=`Chargement impossible : ${error.message} Réessayez.`;}
 finally{if(generation===state.snapshotGeneration)$('load-date-view').disabled=false;}
}
function applySnapshotGroup(){
 const context=state.snapshotContext;if(!context)return;const group=context.groups[Number($('snapshot-fraction').value)||0],measurements=closestMeasurements(group?.rows||[],context.day),values=[...measurements.values()].filter(m=>quantified(m.row)).map(m=>m.row.resultat);
 const min=values.length?Math.min(...values):0,max=values.length?Math.max(...values):0;
 state.snapshot={...context,measurements,min,max,group,target:new Set(context.codes)};$('clear-date-view').hidden=false;$('snapshot-table-wrap').hidden=false;
 const missing=context.codes.length-measurements.size,censored=measurements.size-values.length;
 $('snapshot-status').textContent=`${parameterLabel(context.param)} · ${date(context.day)}${context.tolerance?` ± ${context.tolerance} jours`:' · date exacte'} · ${number(measurements.size)}/${number(context.codes.length)} stations avec une mesure${censored?` · ${censored} sous/au-dessus d’un seuil (gris)`:''}${group?` · ${group.unit||'Sans unité'} · ${group.fraction}`:''}. ${number(missing)} sans mesure dans cette fenêtre.`;
 const legend=$('map-legend');legend.replaceChildren();if(values.length){legend.append(node('span','',`${number(min)} ${group.unit}`),node('span','concentration-scale'),node('span','',`${number(max)} ${group.unit}`));}legend.append(node('span','',`Gris : absence ou seuil · intensité de la mesure`));
 const table=$('snapshot-table');table.replaceChildren();for(const code of context.codes){const station=state.stationByCode.get(code),sample=measurements.get(code),tr=node('tr');for(const text of [station?stationName(station):code,sample?date(sample.row.date_prelevement):'—',sample?`${resultLabel(sample.row)} ${sample.row.symbole_unite||''}`:'Aucune mesure'])tr.append(node('td','',text));table.append(tr);}
 $('snapshot-table-summary').textContent=`${parameterLabel(context.param)} : dates et valeurs des ${number(context.codes.length)} stations`;
 applyFilters();persistSelection();
}

async function boot(){
  initControls();
  if(!window.L||!window.Chart){$('map-loading').textContent='Les bibliothèques locales sont absentes. Relancez la préparation des données.';return;}
  initMap();
  const local=globalThis.RIVER_BOOT_DATA;state.examples=local?.examples;state.coverage=local?.coverage;updatePresets();
  for(const feature of local?.rivers?.features||[]){const key=feature.properties?.code_cours_eau;if(key){if(!geometryCache.has(key))geometryCache.set(key,{type:'FeatureCollection',features:[]});geometryCache.get(key).features.push(feature);}}
  $('example-button').disabled=true;
  try{
    const catalogue=local?.catalogue;if(!catalogue)throw Error('Catalogue local absent');
    state.stations=unpackCatalogue(catalogue).filter(s=>Number.isFinite(s.latitude)&&Number.isFinite(s.longitude)&&Math.abs(s.latitude)<=90&&Math.abs(s.longitude)<=180);
    for(const station of state.stations){const world=mercatorPoint(station.latitude,station.longitude);station._mercatorX=world.x;station._mercatorY=world.y;state.stationByCode.set(station.code_station,station);}
    state.rivers=riverGroups(state.stations);
    $('coverage-note').textContent=state.coverage?`Stations avec au moins une analyse choisie, toutes dates. Index du ${date(state.coverage.retrievedAt)}.`:'Index des analyses absent : catalogue complet affiché.';
    updateCatalogueCount();
    const basins=[...new Set(state.stations.map(s=>s.nom_bassin).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'));
    for(const basin of basins){const option=node('option','',basinLabel(basin));option.value=basin;option.title=basin;$('basin').append(option);}
    $('catalogue-note').textContent=`Catalogue du ${date(catalogue.retrievedAt)} · ${number(state.stations.length)} stations`;
    if(catalogue.sourceCount&&state.stations.length<catalogue.sourceCount)$('catalogue-note').title=`${number(catalogue.sourceCount)} stations dans la source ; les stations sans coordonnées valides ne sont pas cartographiées.`;
    const saved=new URLSearchParams(location.hash.slice(1));state.selected=[...new Set((saved.get('stations')??'').split(',').filter(code=>state.stationByCode.has(code)))];state.selectedSet=new Set(state.selected);
    if(state.rivers.has(saved.get('river'))){state.activeRiver=saved.get('river');$('river-search').value=prettyName(state.rivers.get(state.activeRiver).name);}
    state.riverCandidate=state.rivers.has(saved.get('cours'))?saved.get('cours'):preidentifiedRiver(state.selected,state.stationByCode);if(state.riverCandidate)$('river-search').value=prettyName(state.rivers.get(state.riverCandidate).name);
    applyFilters(!!state.activeRiver);$('map').dataset.readyMs=performance.now().toFixed(1);$('map').dataset.stationCount=String(state.stations.length);
    if(state.selected.length){updateSelection();showStatus('Chargement des analyses…');$('charts').replaceChildren();}
    if($('example-button'))$('example-button').disabled=!state.examples;
    $('example-button')?.addEventListener('click',loadExample);
    if(state.selected.length)refreshAnalyses();
    if(validDateRange(saved.get('jour')||'',saved.get('jour')||'')&&PARAMETERS.some(p=>p.code===saved.get('mesure'))){$('date-view-panel').open=true;$('map-date').value=saved.get('jour');$('map-parameter').value=saved.get('mesure');$('map-tolerance').value=['0','7','15','30','90'].includes(saved.get('ecart'))?saved.get('ecart'):'30';refreshSnapshot();}
  }catch(error){$('map-loading').hidden=false;$('map-loading').replaceChildren(node('span','',`Données locales indisponibles : ${error.message}`));$('filtered-count').textContent='Catalogue indisponible';$('catalogue-note').textContent='Données locales absentes';console.error(error);}
}
function updateCatalogueCount(){const all=$('all-environments').checked,count=state.stations.filter(s=>(all||String(s.type_entite_hydro)==='2')&&hasChosenMeasurements(s)).length;$('total-stations').textContent=number(count);$('catalogue-stat-label').replaceChildren(node('span','',all?'stations géolocalisées':'stations de cours d’eau'),document.createElement('br'),document.createTextNode(state.coverage&&!$('show-empty').checked?'avec les analyses choisies':'dans le catalogue national'));}
boot();
