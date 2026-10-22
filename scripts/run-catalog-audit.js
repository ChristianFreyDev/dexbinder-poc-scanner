/**
 * Entrega 0 - PoC A: auditoria real do catálogo TCGdex (API REST v2).
 * Executa consultas reais (sem mocks), salva fixtures JSON e gera um
 * resumo estruturado em reports/catalog-audit-raw.json para o relatório
 * markdown final (reports/catalog-audit.md).
 *
 * Uso: node scripts/run-catalog-audit.js
 */

const fs = require("fs");
const path = require("path");

const FIXTURES_DIR = path.join(__dirname, "..", "fixtures", "cards");
const REPORTS_DIR = path.join(__dirname, "..", "reports");
const BASE_URL = "https://api.tcgdex.net/v2";

// Lista real de casos auditados, cobrindo a matriz mínima da seção 16.1
// da especificação. Cada item é uma impressão física-conceitual distinta
// a ser consultada na API real (idioma + id do catálogo).
const TARGETS = [
  { lang: "en", id: "sv03.5-001", note: "Baseline 151 - Bulbasaur (inglês)" },
  { lang: "pt", id: "sv03.5-001", note: "Mesmo id, idioma pt (comparação EN/PT)" },
  { lang: "de", id: "sv03.5-001", note: "Mesmo id, idioma de (bônus)" },
  { lang: "fr", id: "sv03.5-001", note: "Mesmo id, idioma fr (bônus)" },
  { lang: "ja", id: "SV2a-001", note: "Equivalente conceitual em japonês (ID de set DIFERENTE)" },
  { lang: "en", id: "30th-005", note: "Expansão mais recente observada (30th, 2026-09-16) - Tropius comum" },
  { lang: "en", id: "sv03.5-003", note: "Venusaur ex - variante holo/ex" },
  { lang: "pt", id: "sv03.5-003", note: "Venusaur ex em pt - nome localizado" },
  { lang: "en", id: "sv03.5-165", note: "Limite da contagem oficial (165) - Rigid Band (Trainer)" },
  { lang: "en", id: "sv03.5-166", note: "Primeiro número além do oficial - Bulbasaur illustration rare" },
  { lang: "en", id: "sv03.5-180", note: "Dentro da faixa extra/secreta - Omanyte illustration rare" },
  { lang: "en", id: "sv03.5-206", note: "Trainer na faixa extra - Switch" },
  { lang: "en", id: "sv03.5-207", note: "Energy - Basic Psychic Energy" },
  { lang: "en", id: "svp-004", note: "Carta promocional - Mimikyu ex" },
  { lang: "fr", id: "svp-004", note: "Promocional em fr - Mimiqui-ex" },
  { lang: "en", id: "dpp-DP01", note: "localId atípico (DP01) - promo Diamond & Pearl" },
  { lang: "en", id: "swshp-SWSH001", note: "localId atípico (SWSH001) - promo Sword & Shield" },
  { lang: "en", id: "swsh12.5gg-GG01", note: "Subset Galarian Gallery - localId atípico GG01" },
  { lang: "en", id: "sm9-33", note: "Multi-espécie - Pikachu & Zekrom GX (dexId x2)" },
  { lang: "en", id: "sm12-143", note: "Multi-espécie - Togepi & Cleffa & Igglybuff GX (dexId x3)" },
  { lang: "en", id: "base1-58", note: "Pikachu impressão #1 (vintage Base Set 1999)" },
  { lang: "en", id: "sv03.5-025", note: "Pikachu impressão #2 (151 moderno)" },
  { lang: "ja", id: "SV2a-025", note: "Pikachu equivalente em japonês" },
  { lang: "en", id: "sv03.5-173", note: "Pikachu impressão #3 (dentro do mesmo set 151)" },
  { lang: "en", id: "2011bw-1", note: "Sem campo image - promo McDonald's 2011" },
  { lang: "en", id: "cel25-2", note: "localId sem zero-padding - Celebrations (Reshiram)" },
  { lang: "en", id: "neo1-1", note: "Vintage Neo Genesis - Ampharos" },
  { lang: "en", id: "gym1-1", note: "Vintage Gym Heroes - Blaine's Moltres" },
  { lang: "en", id: "xy1-1", note: "Era XY - Venusaur EX" },
  { lang: "en", id: "swsh9-001", note: "Brilliant Stars (era VSTAR) - Exeggcute" },
  { lang: "en", id: "B2-001", note: "Pokémon TCG Pocket (produto digital DISTINTO) - Ledyba" },
];

function safeFileName(lang, id) {
  return `${id}_${lang}.json`.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (e) {
    // resposta não é JSON válido
  }
  return { ok: res.ok, status: res.status, json, raw: text };
}

function classify(card) {
  if (!card) return "ausente";
  const issues = [];
  if (!card.image) issues.push("sem image");
  if (card.category === "Pokemon" && !card.dexId) issues.push("Pokemon sem dexId");
  if (!card.set || !card.set.id) issues.push("sem set.id");
  if (issues.length === 0) return "OK";
  return "parcial (" + issues.join("; ") + ")";
}

async function main() {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const summary = [];
  const errors = [];
  const startedAt = new Date().toISOString();

  for (const target of TARGETS) {
    const url = `${BASE_URL}/${target.lang}/cards/${target.id}`;
    process.stdout.write(`Consultando ${url} ... `);
    let result;
    try {
      result = await fetchJson(url);
    } catch (e) {
      console.log("ERRO DE REDE:", e.message);
      errors.push({ ...target, url, error: e.message });
      summary.push({
        ...target,
        url,
        httpStatus: null,
        name: null,
        setId: null,
        setName: null,
        localId: null,
        dexId: null,
        variants: null,
        hasImage: false,
        category: null,
        rarity: null,
        status: "erro de rede",
      });
      continue;
    }

    console.log(`HTTP ${result.status}`);

    if (!result.ok || !result.json) {
      errors.push({ ...target, url, httpStatus: result.status });
      summary.push({
        ...target,
        url,
        httpStatus: result.status,
        name: null,
        setId: null,
        setName: null,
        localId: null,
        dexId: null,
        variants: null,
        hasImage: false,
        category: null,
        rarity: null,
        status: `ausente (HTTP ${result.status})`,
      });
      continue;
    }

    const card = result.json;
    const fileName = safeFileName(target.lang, target.id);
    fs.writeFileSync(path.join(FIXTURES_DIR, fileName), JSON.stringify(card, null, 2), "utf8");

    summary.push({
      ...target,
      url,
      httpStatus: result.status,
      name: card.name ?? null,
      setId: card.set ? card.set.id : null,
      setName: card.set ? card.set.name : null,
      setOfficial: card.set && card.set.cardCount ? card.set.cardCount.official : null,
      setTotal: card.set && card.set.cardCount ? card.set.cardCount.total : null,
      localId: card.localId ?? null,
      localIdType: typeof card.localId,
      dexId: Array.isArray(card.dexId) ? card.dexId.join(",") : (card.dexId ?? null),
      dexIdCount: Array.isArray(card.dexId) ? card.dexId.length : (card.dexId ? 1 : 0),
      variants: card.variants ? JSON.stringify(card.variants) : null,
      variantIds: Array.isArray(card.variants_detailed)
        ? card.variants_detailed.map((v) => v.variantId).join(",")
        : null,
      hasImage: Boolean(card.image),
      category: card.category ?? null,
      rarity: card.rarity ?? null,
      fixtureFile: `fixtures/cards/${fileName}`,
      status: classify(card),
    });
  }

  const finishedAt = new Date().toISOString();

  fs.writeFileSync(
    path.join(REPORTS_DIR, "catalog-audit-raw.json"),
    JSON.stringify({ startedAt, finishedAt, baseUrl: BASE_URL, totalTargets: TARGETS.length, summary, errors }, null, 2),
    "utf8"
  );

  // CSV simples para inspeção tabular
  const csvHeader = [
    "lang", "id", "httpStatus", "name", "setId", "setName", "setOfficial", "setTotal",
    "localId", "localIdType", "dexId", "dexIdCount", "variants", "variantIds", "hasImage",
    "category", "rarity", "status", "note",
  ];
  const csvRows = summary.map((row) =>
    csvHeader
      .map((key) => {
        const val = row[key];
        const str = val === null || val === undefined ? "" : String(val);
        return `"${str.replace(/"/g, '""')}"`;
      })
      .join(",")
  );
  fs.writeFileSync(
    path.join(REPORTS_DIR, "catalog-audit-table.csv"),
    [csvHeader.join(","), ...csvRows].join("\n"),
    "utf8"
  );

  console.log(`\nConcluído. ${summary.length} consultas realizadas, ${errors.length} com erro/ausência.`);
  console.log(`Fixtures salvas em: ${FIXTURES_DIR}`);
  console.log(`Resumo bruto: ${path.join(REPORTS_DIR, "catalog-audit-raw.json")}`);
  console.log(`Tabela CSV: ${path.join(REPORTS_DIR, "catalog-audit-table.csv")}`);
}

main().catch((e) => {
  console.error("Falha na auditoria:", e);
  process.exit(1);
});
