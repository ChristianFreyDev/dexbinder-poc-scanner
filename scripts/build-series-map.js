/**
 * Constrói, com dados REAIS da API TCGdex, o mapeamento `set_id -> serie_id`
 * necessário para filtrar o Pokémon TCG Pocket (e qualquer série digital
 * futura) do catálogo físico — ver especificação, seção 17.2 ("Usar o
 * relacionamento entre conjunto e série para aplicar esse filtro"), e
 * reports/catalog-audit.md, achado 6.
 *
 * Por que isto é necessário: a resposta de `GET /{lang}/cards/{id}` NÃO
 * inclui `serie` dentro de `set` (confirmado na auditoria de catálogo —
 * ver fixtures/cards/B2-001_en.json). Só `GET /{lang}/series/{serieId}`
 * traz a lista de sets de cada série. Por isso este mapeamento precisa
 * ser construído e persistido separadamente, não inferido carta por carta.
 *
 * Uso: node scripts/build-series-map.js
 */

const fs = require("fs");
const path = require("path");
const { createTcgdexClient } = require("../src/catalog/tcgdexClient");

const OUTPUT_PATH = path.join(__dirname, "..", "fixtures", "catalog", "set-series-map.json");
const LANG = "en"; // a relação set->série é estrutural; o idioma só afeta nomes exibidos

async function main() {
  const client = createTcgdexClient();

  console.log(`Consultando séries reais em /${LANG}/series ...`);
  const series = await client.listSeries(LANG);
  console.log(`${series.length} séries encontradas. Resolvendo sets de cada uma...`);

  const setToSeries = {};
  const seriesInfo = {};
  let totalSets = 0;
  let failures = [];

  for (const serie of series) {
    process.stdout.write(`  série "${serie.id}" (${serie.name}) ... `);
    try {
      const detail = await client.getSeriesDetail(LANG, serie.id);
      seriesInfo[serie.id] = { id: serie.id, name: serie.name };
      const sets = detail.sets || [];
      for (const set of sets) {
        setToSeries[set.id] = serie.id;
      }
      totalSets += sets.length;
      console.log(`${sets.length} sets`);
    } catch (e) {
      console.log(`ERRO: ${e.message}`);
      failures.push({ serieId: serie.id, error: e.message });
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    source: `${client ? "https://api.tcgdex.net/v2" : ""}/${LANG}/series/{id}`,
    totalSeries: series.length,
    totalSetsMapped: Object.keys(setToSeries).length,
    failures,
    seriesInfo,
    setToSeries,
    // Séries conhecidas que NÃO representam cartas físicas do TCG colecionável.
    // "tcgp" confirmado na auditoria (seção 6 de catalog-audit.md) como
    // Pokémon TCG Pocket (jogo digital). Revisar esta lista se a TCGdex
    // adicionar outros produtos digitais no futuro.
    digitalOnlySeries: ["tcgp"],
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf8");

  console.log(`\n${totalSets} sets mapeados em ${series.length} séries (${failures.length} falhas).`);
  console.log(`Salvo em: ${OUTPUT_PATH}`);

  if (failures.length > 0) {
    console.log("Séries com falha (não cobertas pelo mapa):", failures.map((f) => f.serieId).join(", "));
  }
}

main().catch((e) => {
  console.error("Falha ao construir o mapa set->série:", e.message);
  process.exit(1);
});
