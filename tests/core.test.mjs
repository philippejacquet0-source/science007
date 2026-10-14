import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesStation,validDateRange,quantified,thresholdKind,resultLabel,groupAnalyses,deduplicate,splitDateRange,csvText} from '../dist/core.mjs';

test('La recherche accepte accents, apostrophes, noms de cours d’eau et commune',()=>{
 const station={nom_cours_eau:'L’Yèvre',libelle_station:'L’YÈVRE À BOURGES',libelle_commune:'Bourges',nom_bassin:'Loire-Bretagne',code_departement:'18',latitude:47,longitude:2.4};
 assert.equal(matchesStation(station,'yevre bourges'),true);
 assert.equal(matchesStation(station,'Bourges','Loire-Bretagne','metro'),true);
 assert.equal(matchesStation(station,'','Rhin-Meuse'),false);
 assert.equal(matchesStation(station,'','','971'),false);
});
test('Les résultats sous seuil ne deviennent pas des concentrations exactes',()=>{
 const measured={resultat:0,code_remarque:'1'};
 const threshold={resultat:0.05,code_remarque:'5',mnemo_remarque:'Résultat inférieur au seuil de quantification'};
 assert.equal(quantified(measured),true);
 assert.equal(quantified(threshold),false);
 assert.equal(thresholdKind(threshold),'below');
 assert.equal(resultLabel(threshold),'< 0,05');
 assert.equal(resultLabel({resultat:null,code_remarque:'1'}),'Non renseigné');
});
test('Les graphiques séparent unités et fractions et excluent les qualifications incorrectes',()=>{
 const common={code_parametre:'1340',code_qualification:'1',resultat:4,date_prelevement:'2024-01-01'};
 const groups=groupAnalyses([{...common,symbole_unite:'mg/L',code_unite:'162',code_fraction:'23'},{...common,symbole_unite:'µg/L',code_unite:'133',code_fraction:'23'},{...common,symbole_unite:'mg/L',code_unite:'162',code_fraction:'3'},{...common,symbole_unite:'mg/L',code_unite:'162',code_fraction:'23',code_qualification:'3'}]);
 assert.equal(groups.length,3);
 assert.equal(groups.reduce((n,g)=>n+g.rows.length,0),3);
});
test('Les découpages de période couvrent tous les jours sans doublon',()=>{
 assert.deepEqual(splitDateRange('2024-02-27','2024-03-02'),[['2024-02-27','2024-02-29'],['2024-03-01','2024-03-02']]);
 assert.equal(splitDateRange('2024-01-01','2024-01-01'),null);
 assert.equal(validDateRange('2024-02-29','2024-03-01'),true);
 assert.equal(validDateRange('2025-02-29','2025-03-01'),false);
 assert.equal(validDateRange('2025-03-01','2025-01-01'),false);
});
test('La déduplication conserve les réplicats distincts et le CSV neutralise les formules texte',()=>{
 const a={code_analyse:'analysis1',resultat:3},b={code_analyse:'analysis2',resultat:3};
 assert.equal(deduplicate([a,a,b]).length,2);
 assert.equal(csvText('=SUM(1,2)'),"\"'=SUM(1,2)\"");
 assert.equal(csvText('La "Loire"'),'"La ""Loire"""');
});
