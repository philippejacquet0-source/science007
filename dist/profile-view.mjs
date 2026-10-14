import {groupAnalyses,deduplicate,resultLabel,thresholdKind,validDateRange,csvCell,csvText} from './core.mjs';
import {riverPath,positionStations,profileValues,latestProfileDay} from './profile.mjs';

export function installRiverProfile({parameters,context,loadRows,loadGeometry,stationName}){
 const $=id=>document.getElementById(id),panel=$('profile-panel'),cache=new Map();
 const format=new Intl.NumberFormat('fr-FR',{maximumFractionDigits:3}),dateFormat=new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeZone:'UTC'});
 const date=v=>dateFormat.format(new Date(v)),element=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el;};
 let signature='',generation=0,controller,loaded,chart,points=[],reverse=false,frame;
 for(const parameter of parameters){const option=element('option',parameter.label);option.value=parameter.code;$('profile-parameter').append(option);}
 function destroy(){chart?.destroy();chart=null;$('profile-chart-wrap').hidden=true;$('profile-table-details').hidden=true;$('profile-export').disabled=true;}
 function update(){
  const target=context(),key=JSON.stringify([target?.key,target?.stations.map(s=>s.code_station).sort(),target?.start,target?.end]);
  if(key===signature)return;signature=key;controller?.abort();generation++;loaded=null;reverse=false;destroy();
  const count=target?.stations.length||0,ready=count>=3;
  $('profile-summary').textContent=target?`${target.name} · ${count} stations sélectionnées`:'Sélectionnez des stations sur un même cours d’eau.';
  $('profile-load').disabled=!ready;$('profile-controls').hidden=!ready;$('profile-readout').hidden=true;$('profile-date-controls').hidden=true;$('profile-group-label').hidden=true;
  $('profile-status').textContent=ready?'Ouvrez ce panneau pour charger le profil sur la période des analyses.':`Le profil nécessite au moins 3 stations du même cours d’eau${target?` (${count} sélectionnée${count>1?'s':''})`:''}. Utilisez « Sélectionner ce cours d’eau » sur la carte.`;
  if(panel.open&&ready)load();
 }
 async function load(){
  const target=context();if(!target||target.stations.length<3)return;
  controller?.abort();controller=new AbortController();const signal=controller.signal,token=++generation,param=$('profile-parameter').value;
  destroy();loaded=null;$('profile-readout').hidden=true;$('profile-date-controls').hidden=true;$('profile-group-label').hidden=true;$('profile-load').disabled=true;
  $('profile-status').textContent=`Chargement du tracé et des analyses de ${target.name}…`;
  try{
   const key=JSON.stringify([target.key,target.stations.map(s=>s.code_station).sort(),param,target.start,target.end]);
   const [geometry,rows]=await Promise.all([loadGeometry(target.key),cache.has(key)?cache.get(key):loadRows(target.stations.map(s=>s.code_station),param,target.start,target.end,signal)]);
   if(token!==generation||signal.aborted)return;
   const located=positionStations(riverPath(geometry),target.stations);
   if(located.positions.length<3)throw Error(`Seulement ${located.positions.length} stations peuvent être placées sur un tracé continu. Il en faut au moins 3.`);
   if(!cache.has(key)){cache.set(key,rows);if(cache.size>8)cache.delete(cache.keys().next().value);}
   const groups=groupAnalyses(deduplicate(rows).filter(r=>String(r.code_parametre)===param&&r.date_prelevement>=target.start&&r.date_prelevement<=target.end)).sort((a,b)=>b.rows.length-a.rows.length);
   loaded={target,param,located,groups};const select=$('profile-group');select.replaceChildren();
   for(const [index,group] of groups.entries()){const option=element('option',`${group.unit||'Sans unité'} · ${group.fraction}`);option.value=index;select.append(option);}
   $('profile-group-label').hidden=groups.length<2;
   const last=latestProfileDay(groups[0]?.rows||[],located.positions,Number($('profile-tolerance').value))||target.end;
   const current=$('profile-date').value;$('profile-date').min=target.start;$('profile-date').max=target.end;$('profile-date').value=current>=target.start&&current<=target.end?current:last;
   $('profile-slider').min=Date.parse(target.start)/86400000;$('profile-slider').max=Date.parse(target.end)/86400000;$('profile-slider').value=Date.parse($('profile-date').value)/86400000;
   $('profile-range-start').textContent=date(target.start);$('profile-range-end').textContent=date(target.end);$('profile-readout').hidden=false;render();
  }catch(error){if(token!==generation||signal.aborted)return;controller.abort();$('profile-status').textContent=`Profil indisponible : ${error.message} Vous pouvez réessayer.`;}
  finally{if(token===generation)$('profile-load').disabled=false;}
 }
 function render(){
  if(!loaded)return;const {target,param,located,groups}=loaded,group=groups[Number($('profile-group').value)||0],mode=$('profile-mode').value,inputDay=$('profile-date').value,tolerance=Number($('profile-tolerance').value);
  const validDay=validDateRange(inputDay,inputDay)&&inputDay>=target.start&&inputDay<=target.end;
  if(mode==='date'&&!validDay){destroy();$('profile-date-controls').hidden=false;$('profile-status').textContent='Choisissez une date dans la période des analyses.';return;}
  const day=validDay?inputDay:target.end;
  $('profile-date-controls').hidden=mode!=='date';$('profile-date-caption').textContent=date(day);
  $('profile-slider').setAttribute('aria-valuetext',date(day));
  points=profileValues(group?.rows||[],located.positions,{mode,day,tolerance,reverse});
  const usable=points.filter(p=>p.y!==null).length,omitted=located.excluded.length,thresholds=points.reduce((sum,p)=>sum+p.excluded,0),origin=points[0]?.station;
  $('profile-title').textContent=`${parameters.find(p=>p.code===param)?.label} · ${target.name}`;
  $('profile-unit').textContent=group?`${group.unit||'Sans unité'} · ${group.fraction}`:'Aucune analyse';
  $('profile-origin').textContent=`0 km : ${origin?stationName(origin):'—'} · Distance approximative sur le tracé Sandre. Le sens de l’axe n’est pas un sens d’écoulement certifié.`;
  $('profile-reverse').textContent='Inverser l’axe';$('profile-reverse').setAttribute('aria-pressed',String(reverse));
  const period=mode==='mean'?`Moyennes du ${date(target.start)} au ${date(target.end)}`:`${date(day)}${tolerance?` ± ${tolerance} jours`:' · date exacte'}`;
  $('profile-status').textContent=`${period} · ${usable}/${points.length} stations avec une valeur quantifiée${omitted?` · ${omitted} hors du tracé retenu`:''}${thresholds?` · ${thresholds} résultat${thresholds>1?'s':''} de seuil ou non quantifié${thresholds>1?'s':''} exclu${thresholds>1?'s':''}`:''}.${usable<3?' Il faut au moins 3 stations avec une valeur pour tracer la courbe.':''}`;
  $('profile-method').textContent=mode==='mean'?'Moyenne arithmétique des résultats quantifiés de chaque station sur la période. Ni pondération par le temps, ni remplacement des seuils par une valeur. Les dates et les fréquences de prélèvement peuvent différer entre stations.':'Prélèvement réel le plus proche de la date choisie, dans l’écart accepté. Aucune interpolation dans le temps. Les dates réelles figurent dans les infobulles et le tableau. Les lignes relient des stations ; elles ne représentent pas une mesure continue.';
  $('profile-chart-wrap').dataset.usableStations=usable;$('profile-chart-wrap').dataset.mode=mode;$('profile-chart-wrap').dataset.day=day;
  $('profile-chart-wrap').dataset.points=JSON.stringify(points.map(p=>({code:p.station.code_station,km:Number(p.x.toFixed(3)),value:p.y,date:p.sample?.date_prelevement,count:p.count})));
  if(usable>=3){
   $('profile-chart-wrap').hidden=false;
   const datasets=[{label:'Valeurs quantifiées',data:points.map(p=>({...p,y:p.y})),borderColor:'#207a83',backgroundColor:'#207a83',pointRadius:5,pointHoverRadius:7,borderWidth:2,spanGaps:false,tension:0}];
   if(mode==='date')datasets.push({label:'Seuils analytiques',data:points.filter(p=>p.sample&&p.y===null&&['below','above'].includes(thresholdKind(p.sample))).map(p=>({...p,y:p.sample.resultat})),showLine:false,pointStyle:'triangle',pointRotation:context=>thresholdKind(context.raw?.sample||{})==='below'?180:0,pointRadius:6,backgroundColor:'#fff',borderColor:'#667d78',pointBorderWidth:2});
   const label=point=>point.y===null?'Sans valeur quantifiée':mode==='mean'?`Moyenne : ${format.format(point.y)} ${group?.unit||''}`:`${resultLabel(point.sample)} ${group?.unit||''}`;
   const options={responsive:true,maintainAspectRatio:false,animation:false,parsing:false,interaction:{mode:'nearest',intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{title:items=>items.length?stationName(items[0].raw.station):'',label:item=>`${format.format(item.raw.x)} km · ${label(item.raw)}`,afterLabel:item=>mode==='mean'?`${item.raw.count} mesures · ${date(item.raw.first)} — ${date(item.raw.last)}`:`Prélèvement : ${date(item.raw.sample.date_prelevement)}`}}},scales:{x:{type:'linear',min:0,title:{display:true,text:'Distance depuis la première station (km)'},grid:{display:false},ticks:{maxTicksLimit:7}},y:{title:{display:true,text:group?.unit||'Valeur'},grid:{color:'#eef2ed'}}}};
   if(chart){chart.data.datasets=datasets;chart.options=options;chart.update('none');}else chart=new Chart($('profile-chart'),{type:'line',data:{datasets},options});
   $('profile-chart').setAttribute('aria-label',`${$('profile-title').textContent}. ${usable} stations avec une valeur. Axe : distance en kilomètres. Valeurs dans le tableau.`);
  }else{chart?.destroy();chart=null;$('profile-chart-wrap').hidden=true;}
  const tbody=$('profile-table');tbody.replaceChildren();
  for(const point of points){const tr=document.createElement('tr'),when=mode==='mean'?(point.count?`${date(point.first)} — ${date(point.last)}`:'—'):(point.sample?date(point.sample.date_prelevement):'—');
   const value=point.y!==null?format.format(point.y)+(group?.unit?` ${group.unit}`:''):point.sample?`${resultLabel(point.sample)} ${group?.unit||''} (${thresholdKind(point.sample)==='unknown'?'non quantifié':'seuil'})`:'Aucune valeur';
   for(const text of [stationName(point.station),format.format(point.x),value,when,mode==='mean'?`${point.count}${point.excluded?` · ${point.excluded} exclues`:''}`:point.count?'1':'0'])tr.append(element('td',text));tbody.append(tr);
  }
  for(const item of located.excluded){const tr=document.createElement('tr');for(const text of [stationName(item.station),'—',item.reason,'—','0'])tr.append(element('td',text));tbody.append(tr);}
  $('profile-table-details').hidden=false;$('profile-export').disabled=!usable;
 }
 function exportProfile(){
  if(!loaded||!points.length)return;const group=loaded.groups[Number($('profile-group').value)||0],mode=$('profile-mode').value;
  const headers=['Station','Identifiant station','Distance km','Valeur quantifiée','Unité','Fraction','Mode','Date cible','Date de prélèvement / début','Fin','Nombre de mesures','Résultats exclus'];
  const rows=points.map(p=>[csvText(stationName(p.station)),csvCell(p.station.code_station),csvCell(p.x),csvCell(p.y),csvText(group?.unit),csvText(group?.fraction),csvCell(mode),csvCell(mode==='date'?$('profile-date').value:''),csvCell(mode==='mean'?p.first:p.sample?.date_prelevement),csvCell(p.last),csvCell(p.count),csvCell(p.excluded)].join(';'));
  const url=URL.createObjectURL(new Blob(['\ufeff'+headers.map(csvCell).join(';')+'\r\n'+rows.join('\r\n')],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=`profil_${loaded.target.key}_${loaded.param}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
 }
 panel.addEventListener('toggle',()=>{if(panel.open&&!loaded)load();else if(panel.open)chart?.resize();});
 $('profile-load').addEventListener('click',load);$('profile-parameter').addEventListener('change',load);
 for(const id of ['profile-mode','profile-tolerance','profile-group'])$(id).addEventListener('change',render);
 $('profile-date').addEventListener('change',()=>{if(!loaded)return;if($('profile-date').checkValidity()&&$('profile-date').value)$('profile-slider').value=Date.parse($('profile-date').value)/86400000;render();});
 $('profile-slider').addEventListener('input',()=>{$('profile-date').value=new Date(Number($('profile-slider').value)*86400000).toISOString().slice(0,10);cancelAnimationFrame(frame);frame=requestAnimationFrame(render);});
 $('profile-reverse').addEventListener('click',()=>{reverse=!reverse;render();});$('profile-export').addEventListener('click',exportProfile);
 return {update};
}
