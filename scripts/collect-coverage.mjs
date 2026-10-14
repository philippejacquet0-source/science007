import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// node scripts/collect-coverage.mjs [--union-only] [--resume] [--with-recent]
// node scripts/collect-coverage.mjs --recent-only [--end=2026-10-14]
// node scripts/collect-coverage.mjs --rivers-only
// Public GET requests only. At most two concurrent requests; bounded retries.
// This indexes availability, not concentrations or water-quality classes.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist', 'data', 'coverage.json');
const API = 'https://hubeau.eaufrance.fr/api/v2/qualite_rivieres/station_pc';
const SANDRE = 'https://api.sandre.eaufrance.fr/referentiels/v1/par';
const codes = ['1340', '1335', '1339', '1433', '1350', '1301', '1302', '1311', '1303', '1305', '1313', '1841', '1317', '1314', '1312', '1319', '1551', '1337', '1338', '1295'];
const filters = { code_support: '3', code_qualification: '1' };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function get(url, format = 'json') {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(180000), headers: { 'User-Agent': 'Rivieres-en-clair/1.0 (public educational project)' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return format === 'text' ? await response.text() : await response.json();
    } catch (error) {
      if (attempt === 4) throw new Error(`${url}: ${error.message}`);
      console.log(`Retry ${attempt + 1} (${error.message})`);
      await sleep(1500 * 2 ** attempt);
    }
  }
}

async function pool(items, worker) {
  let next = 0;
  const results = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(2, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

async function verifyParameter(code) {
  const source = `${SANDRE}/${code}.json`;
  const doc = await get(source);
  const ref = doc.REFERENTIELS?.Referentiel;
  const rows = Array.isArray(ref?.Parametre) ? ref.Parametre : [ref?.Parametre];
  const row = rows.find(x => x?.CdParametre === code);
  if (!row || row.StParametre !== 'Validé') throw new Error(`Parameter ${code} is not validated by Sandre`);
  const quantity = row.ParametreChimique?.ParChimiqueQuant || row.ParametrePhysique?.ParPhysiqueQuant;
  const units = quantity?.UniteReference;
  const liquidUnits = (Array.isArray(units) ? units : [units]).filter(x => x && x.NatureFractionAnalysee?.CdNatureFractionAnalysee === '1');
  const parameter = {
    code, label: row.NomParametre, name: row.NomParametre, longName: row.LbLongParametre,
    status: row.StParametre, updatedAt: row.DateMajParametre,
    definition: row.DfParametre, comment: row.ComParametre || null,
    units: liquidUnits.map(x => ({ code: x.CdUniteReference, symbol: x.SymUniteReference })), source
  };
  console.log(`Sandre ${code}: ${parameter.name}`);
  return parameter;
}

function requestURL(parameterCodes, sort, exactCount, period = null) {
  const url = new URL(API);
  const query = { ...filters, code_parametre: parameterCodes.join(','), fields: 'code_station', size: 20000, page: 1, sort, exact_count: exactCount };
  if (period) {
    query.date_debut_prelevement = period.start;
    query.date_fin_prelevement = period.end;
  }
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url;
}

async function stationCodes(parameterCodes, period = null) {
  const label = (parameterCodes.length === 1 ? parameterCodes[0] : 'union') + (period ? ' 2021+' : '');
  const ascURL = requestURL(parameterCodes, 'asc', true, period);
  const asc = await get(ascURL);
  if (!Number.isInteger(asc.count) || !Array.isArray(asc.data)) throw new Error(`Invalid availability response ${label}`);
  if (asc.count > 40000) throw new Error(`Filtered catalogue ${label} exceeds opposite-order pagination capacity; department partitions required.`);
  let data = asc.data;
  if (asc.count > data.length) {
    const desc = await get(requestURL(parameterCodes, 'desc', false, period));
    if (!Array.isArray(desc.data)) throw new Error(`Invalid descending response ${label}`);
    data = [...data, ...desc.data];
  }
  const result = [...new Set(data.map(row => row.code_station))].sort();
  if (result.length !== asc.count) throw new Error(`Availability ${label} incomplete: ${result.length} unique versus ${asc.count} exact source count. No partial list accepted.`);
  console.log(`Hub'Eau ${label}: ${result.length} stations, exact count verified`);
  return { codes: result, sourceCount: asc.count, sourceQuery: ascURL.toString() };
}

async function exampleRiver() {
  const service = 'https://services.sandre.eaufrance.fr/geo/eth';
  const code = 'B41-0200';
  const filter = `<ogc:Filter xmlns:ogc="http://www.opengis.net/ogc"><ogc:PropertyIsEqualTo><ogc:PropertyName>CdEntiteHydrographique</ogc:PropertyName><ogc:Literal>${code}</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>`;
  const url = new URL(service);
  const query = {
    service: 'WFS', request: 'GetFeature', version: '1.0.0',
    typeName: 'sa:CoursEau_Carthage2017',
    srsName: 'EPSG:4326', filter, maxFeatures: 2
  };
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  // The advertised GeoJSON writer currently fails on the server (invalid FILENAME
  // option). Native WFS 1.0 GML2 works and emits x=longitude,y=latitude for EPSG:4326.
  // Convert the official coordinates without simplifying or inventing a path.
  const data = await get(url, 'text');
  if (/<ServiceException/.test(data)) throw new Error(data.slice(0, 1200));
  const features = [...data.matchAll(/<sa:CoursEau_Carthage2017\b[^>]*>([\s\S]*?)<\/sa:CoursEau_Carthage2017>/g)].map(match => {
    const body = match[1];
    const officialCode = body.match(/<sa:CdEntiteHydrographique>([^<]+)<\//)?.[1];
    const name = body.match(/<sa:NomEntiteHydrographique>([^<]+)<\//)?.[1];
    const geometry = body.match(/<sa:msGeometry>([\s\S]*?)<\/sa:msGeometry>/)?.[1] || '';
    const lines = [...geometry.matchAll(/<gml:LineString\b[^>]*>([\s\S]*?)<\/gml:LineString>/g)].map(line => {
      const coordinates = line[1].match(/<gml:coordinates[^>]*>([\s\S]*?)<\/gml:coordinates>/)?.[1] || '';
      return coordinates.trim().split(/\s+/).map(pair => pair.split(',').map(Number));
    }).filter(line => line.length >= 2 && line.every(pair => pair.length >= 2 && pair.every(Number.isFinite)));
    return {
      type: 'Feature',
      properties: { CdEntiteHydrographique: officialCode, NomEntiteHydrographique: name, code_cours_eau: officialCode },
      geometry: lines.length === 1 ? { type: 'LineString', coordinates: lines[0] } : { type: 'MultiLineString', coordinates: lines }
    };
  }).filter(feature => feature.properties.code_cours_eau === code);
  if (!features.length || features.some(x => !['LineString', 'MultiLineString'].includes(x.geometry?.type))) throw new Error('No official line geometry for the Crusnes; no schematic replacement saved.');
  for (const feature of features) feature.properties.code_cours_eau = code;
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(path.join(path.dirname(out), 'rivers.json'), JSON.stringify({
    source: service, sourceQuery: url.toString(), reference: 'BD CARTHAGE 2017 (Sandre)',
    conversion: 'Official GML2 EPSG:4326 to GeoJSON, original coordinates retained without simplification.',
    retrievedAt: new Date().toISOString(), features
  }));
  console.log(`Official Crusnes geometry: ${features.length} feature(s), GeoJSON EPSG:4326. ${url}`);
}

if (process.argv.includes('--rivers-only')) {
  await exampleRiver();
} else {
await mkdir(path.dirname(out), { recursive: true });
let previous = null;
const recentOnly = process.argv.includes('--recent-only');
if (process.argv.includes('--resume') || recentOnly) {
  try { previous = JSON.parse(await readFile(out, 'utf8')); } catch {}
  if (!previous || JSON.stringify(previous.parameterCodes) !== JSON.stringify(codes) || !(previous.coverage?.nationalUnionComplete || previous.unionComplete)) throw new Error('No compatible verified national union to resume.');
  if (recentOnly && !previous.complete) throw new Error('Finish the historical availability masks before collecting recent masks.');
}
const parameters = previous ? previous.parameters.map(x => ({ ...x, label: x.label || x.name })) : await pool(codes, verifyParameter);
const union = previous ? { codes: previous.stationCodes, sourceCount: previous.sourceCount, sourceQuery: previous.sourceQuery } : await stationCodes(codes);
let local = null;
try { local = JSON.parse(await readFile(path.join(root, 'dist', 'data', 'stations.json'), 'utf8')); } catch {}
const localCodes = new Set(local?.stations?.map(row => row.code_station) || []);
const payload = recentOnly ? previous : {
  schemaVersion: 1, retrievedAt: new Date().toISOString(), source: API,
  sourceQuery: union.sourceQuery, filters, support: '3', qualification: '1',
  period: null,
  periodLabel: 'Tout l’historique disponible ; au moins une analyse sur le support Eau, de qualification Correcte.',
  parameterCodes: codes, parameters, stationCodes: union.codes,
  stations: Object.fromEntries(union.codes.map(code => [code, []])),
  byParameter: {}, unionComplete: true, complete: false,
  sourceCount: union.sourceCount,
  coverage: {
    nationalUnionComplete: true, byParameterComplete: false,
    verification: 'Exact Hub’Eau count; ascending and descending code_station order if needed; unique station identifiers equal source count. No offsets beyond 20,000.',
    localCatalogueCount: localCodes.size,
    matchingLocalStations: union.codes.filter(code => localCodes.has(code)).length,
    absentFromLocalCatalogue: union.codes.filter(code => !localCodes.has(code)),
    meaning: 'Availability only. An old analysis qualifies; date filters in the app may return no observations. Lakes and discontinued stations are included in this source index.'
  }
};
// Make a verified national union available immediately; masks enrich the same file.
if (!recentOnly) {
  await writeFile(out, JSON.stringify(payload));
  console.log(`National union ready: ${union.codes.length} stations.`);
}

if (!process.argv.includes('--union-only') && !recentOnly) {
  let writeQueue = Promise.resolve();
  const masks = await pool(codes, async code => {
    const mask = { code, ...await stationCodes([code]) };
    payload.byParameter[mask.code] = mask.codes;
    const parameter = parameters.find(x => x.code === mask.code);
    parameter.count = mask.sourceCount;
    parameter.stationCount = mask.sourceCount;
    for (const station of mask.codes) {
      if (!payload.stations[station]) throw new Error(`Unexpected station ${station} outside verified national union.`);
      payload.stations[station].push(mask.code);
    }
    // Checkpoints are explicitly incomplete. Serial writes avoid concurrent file mutation.
    const snapshot = JSON.stringify(payload);
    writeQueue = writeQueue.then(() => writeFile(out, snapshot));
    await writeQueue;
    return mask;
  });
  const maskedUnion = new Set(masks.flatMap(x => x.codes));
  if (maskedUnion.size !== union.codes.length || union.codes.some(code => !maskedUnion.has(code))) throw new Error('Per-parameter union differs from national query; verified national file preserved without masks.');
  payload.coverage.byParameterComplete = true;
  payload.complete = true;
  payload.retrievedAt = new Date().toISOString();
  await writeFile(out, JSON.stringify(payload));
  console.log(`Final availability index: ${union.codes.length} stations, ${masks.length} complete parameter masks.`);
}

if (recentOnly || process.argv.includes('--with-recent')) {
  const end = process.argv.find(x => x.startsWith('--end='))?.slice(6) || new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date());
  const period = { start: '2021-01-01', end };
  const recentUnion = await stationCodes(codes, period);
  payload.recent = {
    ...period, retrievedAt: new Date().toISOString(), source: API,
    sourceQuery: recentUnion.sourceQuery, support: '3', qualification: '1',
    parameters: parameters.map(x => ({ code: x.code, label: x.label || x.name, count: null })),
    stationCount: recentUnion.sourceCount,
    stations: Object.fromEntries(recentUnion.codes.map(code => [code, []])),
    byParameter: {}, unionComplete: true, complete: false
  };
  await writeFile(out, JSON.stringify(payload));
  let writeQueue = Promise.resolve();
  const masks = await pool(codes, async code => {
    const mask = { code, ...await stationCodes([code], period) };
    payload.recent.byParameter[code] = mask.codes;
    payload.recent.parameters.find(x => x.code === code).count = mask.sourceCount;
    for (const station of mask.codes) {
      if (!payload.recent.stations[station]) throw new Error(`Recent station ${station} outside verified recent union.`);
      payload.recent.stations[station].push(code);
    }
    const snapshot = JSON.stringify(payload);
    writeQueue = writeQueue.then(() => writeFile(out, snapshot));
    await writeQueue;
    return mask;
  });
  const maskedUnion = new Set(masks.flatMap(x => x.codes));
  if (maskedUnion.size !== recentUnion.codes.length || recentUnion.codes.some(code => !maskedUnion.has(code))) throw new Error('Recent per-parameter union differs from exact national query.');
  payload.recent.complete = true;
  payload.recent.retrievedAt = new Date().toISOString();
  await writeFile(out, JSON.stringify(payload));
  console.log(`Recent availability index: ${recentUnion.codes.length} stations, ${masks.length} complete masks, ${period.start}–${period.end}.`);
}
}
