import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {prepareData} from './prepare-data.mjs';

// Usage: node scripts/sync-data.mjs [--start=2021-01-01] [--end=2026-10-13]
//        node scripts/sync-data.mjs --only=examples (or stations or assets)
// Public source: Hub'Eau / Naïades. No API key, personal data or proxy required.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'dist', 'data');
const vendorDir = path.join(root, 'dist', 'vendor');
const API = 'https://hubeau.eaufrance.fr/api/v2/qualite_rivieres';
const args = Object.fromEntries(process.argv.slice(2).map(x => x.replace(/^--/, '').split('=')));
const start = args.start || '2021-01-01';
const end = args.end || new Date().toISOString().slice(0, 10);
const exampleStations = ['02115725', '02115660'];
const parameters = ['1340', '1335', '1339', '1433', '1350', '1301', '1302', '1311', '1303', '1305', '1313'];
const stationFields = ['code_station', 'libelle_station', 'longitude', 'latitude', 'code_commune', 'libelle_commune', 'code_departement', 'libelle_departement', 'nom_cours_eau', 'code_cours_eau', 'nom_bassin', 'code_bassin', 'nom_sous_bassin', 'type_entite_hydro', 'date_arret'];
const analysisFields = ['code_analyse', 'code_station', 'code_parametre', 'libelle_parametre', 'date_prelevement', 'heure_prelevement', 'resultat', 'symbole_unite', 'code_unite', 'code_remarque', 'mnemo_remarque', 'code_qualification', 'libelle_qualification', 'code_support', 'libelle_support', 'code_fraction', 'libelle_fraction', 'limite_quantification'];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request(url, binary = false) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60000), headers: { 'User-Agent': 'Rivieres-en-clair/1.0 (public static educational project)' } });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
      return binary ? Buffer.from(await response.arrayBuffer()) : await response.json();
    } catch (error) {
      if (attempt === 5) throw error;
      console.log(`Retry ${attempt + 1}: ${error.message.split(' ').slice(0, 4).join(' ')}`);
      await pause(1000 * 2 ** attempt);
    }
  }
}

function endpoint(name, filters) {
  const url = new URL(`${API}/${name}`);
  for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, value);
  return url;
}

async function pages(name, filters, countLimit = 20000, maxRecords = Infinity, exactCount = true) {
  let url = endpoint(name, { ...filters, size: 5000, page: 1, exact_count: exactCount });
  const records = [];
  let sourceCount = 0;
  while (url) {
    const payload = await request(url);
    sourceCount = payload.count;
    if (sourceCount > countLimit) throw new Error(`Partition exceeds API pagination limit (${sourceCount})`);
    records.push(...payload.data);
    console.log(`${name}: ${records.length} / ${sourceCount} records in partition`);
    url = records.length >= maxRecords ? null : payload.next;
  }
  return { records, sourceCount };
}

async function syncStations() {
  const countResponse = await request(endpoint('station_pc', { size: 1, fields: 'code_station', exact_count: true }));
  // Hub'Eau refuses offsets past 20,000. Two opposite traversals of its stable
  // official code_station ordering cover the complete current catalogue, without
  // the spherical geometry ambiguity of a worldwide bbox whose corners are poles.
  // Count is exact only once; page counts are approximate but data are unchanged.
  const cap = Math.ceil(countResponse.count / 2 / 5000) * 5000;
  if (cap > 20000) throw new Error('Catalogue exceeds 40,000 references; add department partitions before refreshing.');
  const ascending = await pages('station_pc', { sort: 'asc', fields: stationFields.join(',') }, Infinity, cap, false);
  const descending = await pages('station_pc', { sort: 'desc', fields: stationFields.join(',') }, Infinity, cap, false);
  const unique = [...new Map([...ascending.records, ...descending.records].map(row => [row.code_station, row])).values()];
  if (unique.length !== countResponse.count) throw new Error(`Catalogue completeness mismatch: ${unique.length} unique / ${countResponse.count} source records. Retry; no partial catalogue saved.`);
  const stations = unique
    .filter(row => Number.isFinite(row.longitude) && Number.isFinite(row.latitude))
    .sort((a, b) => a.code_station.localeCompare(b.code_station));
  const payload = {
    retrievedAt: new Date().toISOString(), source: `${API}/station_pc`,
    sourceCount: countResponse.count,
    coverage: {
      scope: 'All geolocated Hub’Eau physico-chemical stations, metropolitan France and overseas territories; rivers and lakes, including discontinued stations.',
      records: stations.length,
      omittedWithoutCoordinates: countResponse.count - stations.length,
      partitionMethod: `First ${cap} records ascending and descending by code_station; 5,000-record pages; all offsets <= 20,000; deduplicate by code_station; verify unique count against exact national count.`,
      completeForGeolocatedRecords: true
    },
    stations
  };
  await writeFile(path.join(dataDir, 'stations.json'), JSON.stringify(payload));
  console.log(`Catalogue: ${stations.length} geolocated / ${countResponse.count} total; ${payload.coverage.omittedWithoutCoordinates} without coordinates.`);
}

async function syncExamples() {
  const filters = {
    code_station: exampleStations.join(','), code_parametre: parameters.join(','),
    code_support: 3, code_qualification: 1,
    date_debut_prelevement: start, date_fin_prelevement: end,
    fields: analysisFields.join(',')
  };
  const { records, sourceCount } = await pages('analyse_pc', filters);
  const data = [...new Map(records.map(row => [row.code_analyse, row])).values()];
  const payload = {
    retrievedAt: new Date().toISOString(), source: `${API}/analyse_pc`, start, end,
    stations: [...new Set(data.map(row => row.code_station))], parameters,
    filters: { code_support: '3', code_qualification: '1' },
    sourceCount, data
  };
  await writeFile(path.join(dataDir, 'examples.json'), JSON.stringify(payload));
  const summary = parameters.map(code => {
    const rows = data.filter(x => x.code_parametre === code);
    return { code, name: rows[0]?.libelle_parametre || 'No data', records: rows.length, units: [...new Set(rows.map(x => x.symbole_unite))], fractions: [...new Set(rows.map(x => x.code_fraction))] };
  });
  console.log(`Examples: ${data.length} measurements. ${JSON.stringify(summary)}`);
}

async function syncAssets() {
  const assets = [
    ['leaflet.css', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'],
    ['leaflet.js', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'],
    ['chart.umd.js', 'https://cdn.jsdelivr.net/npm/chart.js@4.4.8/dist/chart.umd.js'],
    ['images/layers.png', 'https://unpkg.com/leaflet@1.9.4/dist/images/layers.png'],
    ['images/layers-2x.png', 'https://unpkg.com/leaflet@1.9.4/dist/images/layers-2x.png'],
    ['images/marker-icon.png', 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png'],
    ['images/marker-icon-2x.png', 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png'],
    ['images/marker-shadow.png', 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png']
  ];
  for (const [name, url] of assets) await writeFile(path.join(vendorDir, name), await request(url, true));
  const departmentsUrl = 'https://etalab-datasets.geo.data.gouv.fr/contours-administratifs/2026/geojson/departements-1000m.geojson';
  await writeFile(path.join(dataDir, 'departments.geojson'), await request(departmentsUrl, true));
  console.log('Leaflet 1.9.4, Chart.js 4.4.8, images and local department boundaries saved.');
}

await mkdir(dataDir, { recursive: true });
await mkdir(path.join(vendorDir, 'images'), { recursive: true });
const phases = { stations: syncStations, examples: syncExamples, assets: syncAssets };
for (const name of args.only ? args.only.split(',') : Object.keys(phases)) {
  if (!phases[name]) throw new Error(`Unknown sync phase: ${name}`);
  await phases[name]();
}
await prepareData();
