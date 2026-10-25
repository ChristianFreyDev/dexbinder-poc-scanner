/**
 * Adiciona mais fixtures REAIS do set "151" (sv03.5, versão impressa básica,
 * números 1-165) ao índice da PoC — pedido real do usuário (24-25/10/2026):
 * ele só tem a coleção básica desse set (não as raridades secretas acima de
 * 165) e queria mais cartas reais pra testar com o app, além das 4 que já
 * estavam no bundle (#001, #003, #025, #165).
 *
 * Mesma metodologia de scripts/run-catalog-audit.js (consulta real
 * `GET /{lang}/cards/{id}`, salva a resposta bruta em fixtures/cards/) —
 * script separado, não reaproveita a lista TARGETS da auditoria original
 * (essa é uma lista curada pra Entrega 0, não deve crescer por este motivo).
 *
 * Uso: node scripts/add-more-151-cards.js
 */

const fs = require("fs");
const path = require("path");

const FIXTURES_DIR = path.join(__dirname, "..", "fixtures", "cards");
const BASE_URL = "https://api.tcgdex.net/v2";
const LANG = "pt";
const SET_ID = "sv03.5";

// Espalhados entre 1 e 165 (faixa da coleção básica do usuário, sem
// raridades secretas) — Pokémon comuns/conhecidos + algumas Trainer/Energy.
const LOCAL_IDS = [
  "004", "007", "012", "016", "035", "039", "052", "054", "058", "063",
  "066", "074", "077", "081", "092", "094", "104", "113", "123", "131",
  "132", "133", "143", "144", "150", "160", "161", "163",
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
  return { ok: res.ok, status: res.status, json };
}

async function main() {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });

  let added = 0;
  let skipped = 0;
  let failed = 0;

  for (const localId of LOCAL_IDS) {
    const cardId = `${SET_ID}-${localId}`;
    const fileName = safeFileName(LANG, cardId);
    const filePath = path.join(FIXTURES_DIR, fileName);
    if (fs.existsSync(filePath)) {
      console.log(`  ${cardId} (${LANG}) já existe — pulando.`);
      skipped++;
      continue;
    }

    const url = `${BASE_URL}/${LANG}/cards/${cardId}`;
    process.stdout.write(`  Consultando ${url} ... `);
    const result = await fetchJson(url);
    if (!result.ok || !result.json) {
      console.log(`sem dado (HTTP ${result.status}) — pulando.`);
      failed++;
      continue;
    }
    fs.writeFileSync(filePath, JSON.stringify(result.json, null, 2), "utf8");
    console.log(`OK — ${result.json.name}`);
    added++;
  }

  console.log(`\n${added} fixtures novas adicionadas, ${skipped} já existiam, ${failed} sem dado real na API.`);
  console.log("Rode `node scripts/export-index-bundle.js` para atualizar app/assets/catalog-index.json.");
}

main().catch((e) => {
  console.error("Falha ao adicionar cartas do 151:", e.message);
  process.exit(1);
});
