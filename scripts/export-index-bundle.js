/**
 * Gera um único arquivo JSON consolidado (`app/assets/catalog-index.json`)
 * a partir das fixtures reais + do mapa set->série, já filtrando séries
 * digitais (tcgp). Isso existe porque, dentro do bundle Metro/Expo, só é
 * seguro importar JSON por `require()` ESTÁTICO (resolvido em tempo de
 * build) — `fs.readdirSync` (usado por catalogFixtures.js) não existe em
 * React Native. Gerando um único arquivo agregado, a tela do app só
 * precisa de UM `require()` estático, sem depender de Node em runtime.
 *
 * Reexecutar sempre que novas fixtures forem adicionadas ou o mapa de
 * séries for atualizado.
 *
 * Uso: node scripts/export-index-bundle.js
 */

const fs = require("fs");
const path = require("path");

const { loadFixtureCards, loadSeriesMap, filterPhysicalCards } = require("../src/catalog/catalogFixtures");

const OUTPUT_PATH = path.join(__dirname, "..", "app", "assets", "catalog-index.json");

function main() {
  const seriesMap = loadSeriesMap();
  if (!seriesMap) {
    console.warn(
      "AVISO: fixtures/catalog/set-series-map.json não encontrado. Rode `node scripts/build-series-map.js` " +
        "antes para que o filtro de séries digitais (tcgp) funcione de verdade. Gerando o bundle sem esse filtro."
    );
  }

  const allRecords = loadFixtureCards();
  const physicalRecords = filterPhysicalCards(allRecords, { seriesMap });
  const removedCount = allRecords.length - physicalRecords.length;

  const bundle = {
    generatedAt: new Date().toISOString(),
    totalRecords: physicalRecords.length,
    removedDigitalOnlyRecords: removedCount,
    records: physicalRecords,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(bundle, null, 2), "utf8");

  console.log(
    `Bundle gerado com ${physicalRecords.length} registros físicos (${removedCount} removidos por serem de séries digitais).`
  );
  console.log(`Salvo em: ${OUTPUT_PATH}`);
}

main();
