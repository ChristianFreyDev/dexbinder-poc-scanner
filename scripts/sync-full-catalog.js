/**
 * Base da arquitetura de catálogo completo/auto-atualizável (Entrega 1,
 * ver reports/decision.md, seção 11). Gera um banco SQLite com os metadados
 * de TODAS as cartas de TODOS os sets de um conjunto de idiomas, consultando
 * a API real do TCGdex — não mais um bundle estático de uma amostra de 30
 * cartas (ver scripts/export-index-bundle.js, usado só por esta PoC).
 *
 * Achado real (22/10/2026): `GET /{lang}/sets/{setId}` já devolve TODOS os
 * cards do set numa única resposta (forma reduzida: id/image/localId/name),
 * junto com `abbreviation.official` — o código de expansão impresso na
 * carta de verdade (confirmado: "MEW" para o set "151", igual ao que havia
 * sido descoberto manualmente via OCR real e hardcoded em
 * catalogFixtures.js). Isso elimina duas limitações da PoC:
 *   1. Não precisa de uma chamada por carta (`getCard`) — uma por SET basta,
 *      já que esta forma reduzida tem tudo que rankCandidates.js precisa
 *      (nome, número, imagem); campos como `rarity`/`category`/`dexId` só
 *      existem na forma completa e não são usados pela lógica de matching
 *      (confirmado: nenhuma referência a .rarity/.category/.dexIds fora de
 *      catalogFixtures.js).
 *   2. O mapa manual `setPrintedCode` (catalogFixtures.js) não precisa mais
 *      ser preenchido um set de cada vez com evidência fotográfica — a API
 *      já publica esse código oficialmente.
 *
 * Pedido real (23/10/2026): buscar o catálogo todo aos poucos (não de uma
 * vez), retomando de onde parou a cada execução — usado pelo workflow
 * .github/workflows/sync-catalog.yml, que roda de hora em hora processando
 * um lote até completar, e depois passa a rodar de tempos em tempos maiores
 * só pra achar cartas/sets novos. Por isso este script suporta --resume
 * (não apaga o banco existente, pula pares set×idioma já presentes) e
 * --batch=N (processa só N pares NOVOS nesta execução).
 *
 * IMPORTANTE — escala: isto faz 1 requisição HTTP por (set × idioma). Com
 * ~220 sets reais (ver fixtures/catalog/set-series-map.json) e os 5 idiomas
 * já usados nas fixtures desta PoC (en/pt/fr/de/ja), isso são ~1100
 * requisições à API pública do TCGdex no total — por isso rodar aos poucos
 * (--batch) em vez de tudo de uma vez só.
 *
 * Uso:
 *   node scripts/sync-full-catalog.js                               # amostra pequena (teste/dev)
 *   node scripts/sync-full-catalog.js --full                        # catálogo completo real, tudo de uma vez (não recomendado em produção)
 *   node scripts/sync-full-catalog.js --full --resume --batch=25     # continua de onde parou, só 25 pares novos nesta execução
 *   node scripts/sync-full-catalog.js --langs=en,pt --sets=sv03.5,base1   # escopo customizado
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");
const { createTcgdexClient } = require("../src/catalog/tcgdexClient");
const { loadSeriesMap } = require("../src/catalog/catalogFixtures");

const DEFAULT_LANGS = ["en", "pt", "fr", "de", "ja"];
const DIGITAL_ONLY_SERIES = ["tcgp"];

const OUTPUT_DIR = path.join(__dirname, "..", "dist", "catalog");
const DB_PATH = path.join(OUTPUT_DIR, "catalog.db");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "catalog-version.json");

function parseArgs(argv) {
  const args = { full: false, resume: false, batch: null, langs: null, sets: null };
  for (const a of argv) {
    if (a === "--full") args.full = true;
    else if (a === "--resume") args.resume = true;
    else if (a.startsWith("--batch=")) args.batch = Number(a.slice("--batch=".length));
    else if (a.startsWith("--langs=")) args.langs = a.slice("--langs=".length).split(",").filter(Boolean);
    else if (a.startsWith("--sets=")) args.sets = a.slice("--sets=".length).split(",").filter(Boolean);
  }
  return args;
}

/** Amostra pequena e determinística para testar o pipeline sem varrer o catálogo inteiro. */
function safeDefaultSample() {
  return { langs: ["en", "pt"], sets: ["sv03.5", "base1"] };
}

function createSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS card_index (
      source_card_id TEXT NOT NULL,
      source_language TEXT NOT NULL,
      name TEXT,
      local_id TEXT,
      set_id TEXT,
      set_name TEXT,
      set_serie_id TEXT,
      set_official INTEGER,
      set_total INTEGER,
      set_printed_code TEXT,
      has_image INTEGER,
      image_base_url TEXT,
      PRIMARY KEY (source_card_id, source_language)
    );
    CREATE INDEX IF NOT EXISTS idx_card_index_local_id ON card_index(local_id);
    CREATE INDEX IF NOT EXISTS idx_card_index_set_id ON card_index(set_id);
    -- Um registro por (set, idioma) já processado com sucesso, pra retomar
    -- sem refazer chamadas (uma carta sem nenhuma linha em card_index é uma
    -- coisa real: alguns sets vintage não têm tradução num idioma, ex.:
    -- base1/pt — ver achado real nesta mesma sessão).
    CREATE TABLE IF NOT EXISTS synced_pairs (
      set_id TEXT NOT NULL,
      lang TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      card_count INTEGER NOT NULL,
      PRIMARY KEY (set_id, lang)
    );
  `);
}

async function fetchSetRecords(client, lang, setId) {
  const data = await client.getSet(lang, setId);
  const setOfficial = data.cardCount ? data.cardCount.official ?? null : null;
  const setTotal = data.cardCount ? data.cardCount.total ?? null : null;
  const setPrintedCode = data.abbreviation ? data.abbreviation.official ?? null : null;
  const setSerieId = data.serie ? data.serie.id ?? null : null;

  return (data.cards || []).map((card) => ({
    sourceCardId: card.id,
    sourceLanguage: lang,
    name: card.name ?? null,
    localId: card.localId != null ? String(card.localId) : null,
    setId: data.id ?? setId,
    setName: data.name ?? null,
    setSerieId,
    setOfficial,
    setTotal,
    setPrintedCode,
    hasImage: Boolean(card.image),
    imageBaseUrl: card.image ?? null,
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let langs = args.langs || DEFAULT_LANGS;
  let setIds = args.sets;

  if (!args.full && !args.langs && !args.sets) {
    const sample = safeDefaultSample();
    langs = sample.langs;
    setIds = sample.sets;
    console.log("Sem --full/--langs/--sets: rodando amostra pequena de teste (use --full para o catálogo real completo).");
  }

  if (!setIds) {
    const seriesMap = loadSeriesMap();
    if (!seriesMap) {
      console.error(
        "fixtures/catalog/set-series-map.json não encontrado. Rode `node scripts/build-series-map.js` antes, ou passe --sets explicitamente."
      );
      process.exit(1);
    }
    setIds = Object.keys(seriesMap.setToSeries);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const dbAlreadyExists = fs.existsSync(DB_PATH);
  if (!args.resume && dbAlreadyExists) {
    fs.unlinkSync(DB_PATH);
  }

  const db = new Database(DB_PATH);
  createSchema(db);

  // Pares (set, idioma) já sincronizados com sucesso em execuções anteriores
  // (só relevante com --resume) — pula esses, processa só os que faltam.
  const alreadySynced = args.resume
    ? new Set(db.prepare(`SELECT set_id || '::' || lang AS k FROM synced_pairs`).all().map((r) => r.k))
    : new Set();

  const allTargetPairs = [];
  for (const setId of setIds) {
    for (const lang of langs) {
      allTargetPairs.push({ setId, lang });
    }
  }
  const pendingPairs = allTargetPairs.filter((p) => !alreadySynced.has(`${p.setId}::${p.lang}`));
  const pairsThisRun = args.batch ? pendingPairs.slice(0, args.batch) : pendingPairs;

  console.log(
    `Alvo total: ${allTargetPairs.length} pares set×idioma. Já sincronizados: ${alreadySynced.size}. ` +
      `Pendentes: ${pendingPairs.length}. Nesta execução: ${pairsThisRun.length}.`
  );

  const client = createTcgdexClient();
  const failures = [];
  let done = 0;

  const insertCard = db.prepare(`
    INSERT OR REPLACE INTO card_index
      (source_card_id, source_language, name, local_id, set_id, set_name, set_serie_id, set_official, set_total, set_printed_code, has_image, image_base_url)
    VALUES (@sourceCardId, @sourceLanguage, @name, @localId, @setId, @setName, @setSerieId, @setOfficial, @setTotal, @setPrintedCode, @hasImage, @imageBaseUrl)
  `);
  const insertSyncedPair = db.prepare(`
    INSERT OR REPLACE INTO synced_pairs (set_id, lang, synced_at, card_count) VALUES (?, ?, ?, ?)
  `);
  const commitPair = db.transaction((setId, lang, records) => {
    const physical = records.filter((r) => !r.setSerieId || !DIGITAL_ONLY_SERIES.includes(r.setSerieId));
    for (const r of physical) insertCard.run({ ...r, hasImage: r.hasImage ? 1 : 0 });
    insertSyncedPair.run(setId, lang, new Date().toISOString(), physical.length);
  });

  for (const { setId, lang } of pairsThisRun) {
    done++;
    process.stdout.write(`  [${done}/${pairsThisRun.length}] ${lang}/${setId} ... `);
    try {
      const records = await fetchSetRecords(client, lang, setId);
      commitPair(setId, lang, records);
      console.log(`${records.length} cartas`);
    } catch (e) {
      console.log(`ERRO: ${e.message}`);
      failures.push({ lang, setId, error: e.message });
    }
  }

  const totalRows = db.prepare(`SELECT COUNT(*) AS c FROM card_index`).get().c;
  const totalSyncedPairs = db.prepare(`SELECT COUNT(*) AS c FROM synced_pairs`).get().c;
  db.close();

  const dbBuffer = fs.readFileSync(DB_PATH);
  const checksum = crypto.createHash("sha256").update(dbBuffer).digest("hex");
  const remaining = allTargetPairs.length - totalSyncedPairs;

  const manifest = {
    generatedAt: new Date().toISOString(),
    langs,
    targetPairs: allTargetPairs.length,
    syncedPairs: totalSyncedPairs,
    remainingPairs: Math.max(remaining, 0),
    complete: remaining <= 0,
    totalRecords: totalRows,
    failuresThisRun: failures,
    dbFile: path.basename(DB_PATH),
    dbSizeBytes: dbBuffer.length,
    dbSha256: checksum,
  };
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");

  console.log(`\n${totalRows} registros no banco (${totalSyncedPairs}/${allTargetPairs.length} pares set×idioma sincronizados).`);
  console.log(`${failures.length} falhas nesta execução.`);
  console.log(manifest.complete ? "CATÁLOGO COMPLETO." : `${manifest.remainingPairs} pares ainda pendentes.`);
  console.log(`Banco: ${DB_PATH} (${(dbBuffer.length / 1024).toFixed(1)} KB)`);
  console.log(`Manifesto: ${MANIFEST_PATH}`);
}

main().catch((e) => {
  console.error("Falha ao sincronizar o catálogo completo:", e.message);
  process.exit(1);
});
