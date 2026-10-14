export const PARAMETERS = [
  {code:'1340',label:'Nitrates',group:'nutrients',description:'Une forme d’azote dissous, liée notamment aux apports du bassin versant.'},
  {code:'1311',label:'Oxygène dissous',group:'essentials',description:'L’oxygène disponible dans l’eau pour les organismes aquatiques.'},
  {code:'1301',label:'Température',group:'essentials',description:'Elle influence la vie aquatique et la quantité d’oxygène que l’eau peut contenir.'},
  {code:'1302',label:'pH',group:'essentials',description:'Un indicateur de l’acidité ou de l’alcalinité de l’eau.'},
  {code:'1303',label:'Conductivité à 25 °C',short:'Conductivité',group:'physics',description:'Un indicateur de la quantité d’ions dissous, ramené à une température de référence de 25 °C.'},
  {code:'1335',label:'Ammonium',group:'nutrients',description:'Une forme d’azote qui aide à suivre les apports et les transformations de la matière organique.'},
  {code:'1339',label:'Nitrites',group:'nutrients',description:'Une forme d’azote intermédiaire dans les transformations de l’azote.'},
  {code:'1433',label:'Orthophosphates',group:'nutrients',description:'Une forme de phosphore disponible pour les végétaux et les algues.'},
  {code:'1350',label:'Phosphore total',group:'nutrients',description:'Le phosphore mesuré sous différentes formes dans le prélèvement.'},
  {code:'1305',label:'Matières en suspension',short:'Suspensions',group:'physics',description:'Les particules transportées par l’eau, sensibles notamment au ruissellement.'},
  {code:'1313',label:'Demande en oxygène (DBO5)',short:'DBO5',group:'chemistry',description:'L’oxygène consommé par la dégradation biologique de la matière organique en cinq jours.'},
  {code:'1317',label:'Carbone total',group:'chemistry',description:'Carbone organique et minéral réunis ; distinct du carbone organique seul.'},
  {code:'1841',label:'Carbone organique',group:'chemistry',description:'Carbone organique total (COT) sur eau brute, ou dissous (COD) sur eau filtrée : les fractions sont séparées.'},
  {code:'1314',label:'Demande chimique en oxygène (DCO)',short:'DCO',group:'chemistry',description:'L’oxygène équivalent consommé par une oxydation chimique du prélèvement.'},
  {code:'1312',label:'Saturation en oxygène',short:'Saturation O₂',group:'essentials',description:'Quantité d’oxygène dissous rapportée à la quantité à saturation, en pourcentage.'},
  {code:'1319',label:'Azote Kjeldahl',group:'nutrients',description:'L’azote organique et ammoniacal mesuré par la méthode Kjeldahl.'},
  {code:'1551',label:'Azote global',group:'nutrients',description:'Somme de l’azote Kjeldahl et des formes oxydées de l’azote.'},
  {code:'1337',label:'Chlorures',group:'minerals',description:'Ions chlorure dissous dans l’eau.'},
  {code:'1338',label:'Sulfates',group:'minerals',description:'Ions sulfate dissous dans l’eau.'},
  {code:'1295',label:'Turbidité',group:'physics',description:'Turbidité par néphélométrie à la formazine : une mesure optique du trouble de l’eau.'}
];
export const PRESETS = {essentials:['1340','1311','1301','1302','1303','1305','1841','1317'],nutrients:['1340','1335','1339','1433','1350','1319','1551'],organic:['1841','1317','1313','1314'],all:PARAMETERS.map(p=>p.code)};
export const COLORS = ['#db7951','#238c99','#8b76b0','#4a9670','#c2a33e','#aa6388','#628ed0','#727e4b','#ac503a','#345987','#786055','#398674'];
export const normalize = value => String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,' ');
export const prettyName = value => String(value??'').toLocaleLowerCase('fr-FR').split(' ').map((word,index)=>index>0&&['à','a','au','aux','de','des','du','en','et','la','le','les','sur','sous'].includes(word)?word:word.replace(/(^|[-’'])\p{L}/gu,c=>c.toLocaleUpperCase('fr-FR'))).join(' ').replace(/^Rau /,'Ruisseau ');
export function basinLabel(name){const n=normalize(name);if(n.includes('garonne'))return 'Adour-Garonne';if(n.includes('loire'))return 'Loire-Bretagne';if(n.includes('seine'))return 'Seine-Normandie';if(n.includes('rhone'))return 'Rhône-Méditerranée';if(n.includes('meuse'))return 'Meuse';if(n.includes('rhin'))return 'Rhin';if(n.includes('corse'))return 'Corse';if(n.includes('reunion'))return 'La Réunion';if(n.includes('escaut')||n.includes('somme'))return 'Artois-Picardie';return prettyName(name);}
export function stationSearchText(s){return normalize([s.nom_cours_eau,s.libelle_station,s.libelle_commune,s.libelle_departement,s.nom_bassin,s.code_station].join(' '));}
export function matchesStation(station,query,basin='',territory=''){
  if(basin && station.nom_bassin!==basin)return false;
  const department=String(station.code_departement??'');
  if(territory==='metro' && (/^97|^98/.test(department)||Math.abs(station.longitude)>12||station.latitude<40||station.latitude>52))return false;
  if(territory && territory!=='metro' && department!==territory)return false;
  const tokens=Array.isArray(query)?query:normalize(query).trim().split(/\s+/).filter(Boolean);
  if(!tokens.length)return true;
  const text=station._search??=stationSearchText(station);
  return tokens.every(token=>text.includes(token));
}
export function validDateRange(start,end){return /^\d{4}-\d{2}-\d{2}$/.test(start)&&/^\d{4}-\d{2}-\d{2}$/.test(end)&&Number.isFinite(Date.parse(start))&&Number.isFinite(Date.parse(end))&&new Date(start).toISOString().slice(0,10)===start&&new Date(end).toISOString().slice(0,10)===end&&start<=end;}
export function quantified(row){return String(row.code_remarque)==='1'&&Number.isFinite(row.resultat);}
export function thresholdKind(row){
  if(quantified(row))return null;
  const note=normalize(row.mnemo_remarque);
  if(note.includes('inferieur')||note.includes('<')||['2','3','5'].includes(String(row.code_remarque)))return 'below';
  if(note.includes('superieur')||note.includes('>'))return 'above';
  return 'unknown';
}
export function resultLabel(row){
  if(!Number.isFinite(row.resultat))return 'Non renseigné';
  const prefix=quantified(row)?'':thresholdKind(row)==='below'?'< ':thresholdKind(row)==='above'?'> ':'';
  return prefix+new Intl.NumberFormat('fr-FR',{maximumSignificantDigits:7}).format(row.resultat);
}
export function groupAnalyses(rows){
  const groups=new Map();
  for(const row of rows){
    if(String(row.code_qualification)!=='1'||!Number.isFinite(row.resultat))continue;
    const key=JSON.stringify([String(row.code_parametre),row.symbole_unite??'',String(row.code_unite??''),String(row.code_fraction??'')]);
    if(!groups.has(key))groups.set(key,{code:String(row.code_parametre),unit:row.symbole_unite??'',unitCode:String(row.code_unite??''),fraction:row.libelle_fraction??'Fraction non précisée',fractionCode:String(row.code_fraction??''),rows:[]});
    groups.get(key).rows.push(row);
  }
  return [...groups.values()].map(g=>({...g,rows:g.rows.sort((a,b)=>a.date_prelevement.localeCompare(b.date_prelevement))}));
}
export function deduplicate(rows){
  const seen=new Set();return rows.filter(r=>{const key=r.code_analyse??JSON.stringify([r.code_station,r.code_parametre,r.date_prelevement,r.heure_prelevement,r.code_fraction,r.code_unite,r.resultat,r.code_remarque]);if(seen.has(key))return false;seen.add(key);return true;});
}
export function splitDateRange(start,end){
  const first=Date.parse(start),last=Date.parse(end);if(first>=last)return null;
  const day=86400000,mid=first+Math.floor((last-first)/day/2)*day;
  return [[start,new Date(mid).toISOString().slice(0,10)],[new Date(mid+day).toISOString().slice(0,10),end]];
}
export function csvCell(value){const v=String(value??'');return '"'+v.replaceAll('"','""')+'"';}
export function csvText(value){const v=String(value??'');return csvCell(/^[=+\-@]/.test(v)?"'"+v:v);}
