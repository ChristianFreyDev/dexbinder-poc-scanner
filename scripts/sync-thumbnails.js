/**
 * Versão resumível/automatizável de build-thumbnails.js (que continua
 * existindo, inalterado, para amostras manuais pequenas — ver seu
 * cabeçalho). Gera miniaturas reais (uma por IDIOMA IMPRESSO de cada
 * carta, não uma por carta só — decisão real, 23/10/2026: mais fiel ao
 * print físico exato que a pessoa tem na mão) a partir do banco de
 * metadados já publicado (scripts/sync-full-catalog.js), em lotes,
 * retomando de onde parou — mesmo padrão de sync-full-catalog.js.
 *
 * Decisão real (23/10/2026): só roda de verdade DEPOIS que o banco de
 * metadados completar o primeiro ciclo inteiro (ver
 * .github/workflows/sync-thumbnails.yml, que checa `complete:true` no
 * manifesto de metadados antes de chamar este script) — evita competir
 * por banda/requisições com a sincronização de metadados ainda em
 * andamento, e só processa depois de saber o tamanho real do catálogo.
 *
 * Diferente do banco de metadados (só JSON pequeno por set), isto baixa
 * uma IMAGEM REAL por carta×idioma — bem mais pesado. Por isso empacota
 * as miniaturas como BLOBs dentro de um único banco SQLite
 * (dist/catalog/thumbnails.db), igual ao catalog.db de metadados, em vez
 * de milhares de arquivos soltos — mais simples de publicar/baixar como
 * um único asset de Release.
 *
 * Uso:
 *   node scripts/sync-thumbnails.js                              # amostra pequena seguro (5 cartas, teste/dev)
 *   node scripts/sync-thumbnails.js --resume --batch=40           # usado pelo workflow real
 *   node scripts/sync-thumbnails.js --full --resume               # processa tudo que estiver pendente agora (não recomendado em produção)
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");
const sharp = require("sharp");

const OUTPUT_DIR = path.join(__dirname, "..", "dist", "catalog");
const METADATA_DB_PATH = path.join(OUTPUT_DIR, "catalog.db");
const THUMBS_DB_PATH = path.join(OUTPUT_DIR, "thumbnails.db");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "thumbnails-version.json");

// Mesmas constantes reais já validadas em build-thumbnails.js (5 cartas
// reais testadas, ~1130 bytes/miniatura em média, legibilidade confirmada
// visualmente — ver reports/decision.md, seção 11.1).
const THUMB_WIDTH = 60;
const THUMB_HEIGHT = 84;
const WEBP_QUALITY = 55;

function parseArgs(argv) {
  const args = { full: false, resume: false, batch: null };
  for (const a of argv) {
    if (a === "--full") args.full = true;
    else if (a === "--resume") args.resume = true;
    else if (a.startsWith("--batch=")) args.batch = Number(a.slice("--batch=".length));
  }
  return args;
}

function createSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS thumbnails (
      source_card_id TEXT NOT NULL,
      source_language TEXT NOT NULL,
      webp BLOB NOT NULL,
      byte_size INTEGER NOT NULL,
      PRIMARY KEY (source_card_id, source_language)
    );
    CREATE TABLE IF NOT EXISTS synced_thumbnails (
      source_card_id TEXT NOT NULL,
      source_language TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      PRIMARY KEY (source_card_id, source_language)
    );
    -- Mesma ideia de not_found_pairs em sync-full-catalog.js: uma carta
    -- sem imagem de verdade (404 real no download, não erro transitório)
    -- não deve ser tentada de novo em toda execução futura.
    CREATE TABLE IF NOT EXISTS not_found_thumbnails (
      source_card_id TEXT NOT NULL,
      source_language TEXT NOT NULL,
      checked_at TEXT NOT NULL,
      PRIMARY KEY (source_card_id, source_language)
    );
  `);
}

async function downloadBuffer(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ao baixar ${url}`);
    err.status = res.status;
    throw err;
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(METADATA_DB_PATH)) {
    console.error(
      `Banco de metadados não encontrado em ${METADATA_DB_PATH}. Rode "node scripts/sync-full-catalog.js" (ou baixe a Release "catalog-data") antes.`
    );
    process.exit(1);
  }

  const metadataDb = new Database(METADATA_DB_PATH, { readonly: true });
  const allTargets = metadataDb
    .prepare(
      `SELECT source_card_id, source_language, image_base_url FROM card_index
       WHERE has_image = 1
       ORDER BY source_card_id, source_language`
    )
    .all();
  metadataDb.close();

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const dbAlreadyExists = fs.existsSync(THUMBS_DB_PATH);
  if (!args.resume && dbAlreadyExists) {
    fs.unlinkSync(THUMBS_DB_PATH);
  }

  const db = new Database(THUMBS_DB_PATH);
  createSchema(db);

  const alreadySynced = args.resume
    ? new Set(
        db.prepare(`SELECT source_card_id || '::' || source_language AS k FROM synced_thumbnails`).all().map((r) => r.k)
      )
    : new Set();
  const knownNotFound = args.resume
    ? new Set(
        db.prepare(`SELECT source_card_id || '::' || source_language AS k FROM not_found_thumbnails`).all().map((r) => r.k)
      )
    : new Set();

  const pendingTargets = allTargets.filter(
    (t) =>
      !alreadySynced.has(`${t.source_card_id}::${t.source_language}`) &&
      !knownNotFound.has(`${t.source_card_id}::${t.source_language}`)
  );

  let targetsThisRun = pendingTargets;
  if (!args.full && args.batch == null) {
    targetsThisRun = pendingTargets.slice(0, 5);
    console.log("Sem --full/--batch: rodando amostra pequena de teste (5 miniaturas). Use --batch=N ou --full para mais.");
  } else if (args.batch != null) {
    targetsThisRun = pendingTargets.slice(0, args.batch);
  }

  console.log(
    `Alvo total (cartas com imagem no banco de metadados): ${allTargets.length}. Já geradas: ${alreadySynced.size}. ` +
      `Confirmadas sem imagem (404): ${knownNotFound.size}. Pendentes de verdade: ${pendingTargets.length}. Nesta execução: ${targetsThisRun.length}.`
  );

  const insertThumb = db.prepare(`
    INSERT OR REPLACE INTO thumbnails (source_card_id, source_language, webp, byte_size)
    VALUES (?, ?, ?, ?)
  `);
  const insertSynced = db.prepare(`
    INSERT OR REPLACE INTO synced_thumbnails (source_card_id, source_language, synced_at) VALUES (?, ?, ?)
  `);
  const insertNotFound = db.prepare(`
    INSERT OR REPLACE INTO not_found_thumbnails (source_card_id, source_language, checked_at) VALUES (?, ?, ?)
  `);

  let ok = 0;
  let notFound = 0;
  let transientFailures = 0;

  for (const [i, row] of targetsThisRun.entries()) {
    process.stdout.write(`  [${i + 1}/${targetsThisRun.length}] ${row.source_card_id} (${row.source_language}) ... `);
    const sourceUrl = `${row.image_base_url}/low.webp`;
    try {
      const original = await downloadBuffer(sourceUrl);
      const resized = await sharp(original)
        .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: "cover" })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
      insertThumb.run(row.source_card_id, row.source_language, resized, resized.length);
      insertSynced.run(row.source_card_id, row.source_language, new Date().toISOString());
      ok++;
      console.log(`${resized.length} bytes`);
    } catch (e) {
      if (e.status === 404) {
        insertNotFound.run(row.source_card_id, row.source_language, new Date().toISOString());
        notFound++;
        console.log("404 real (sem imagem nesse idioma) — não tenta de novo");
      } else {
        transientFailures++;
        console.log(`ERRO (pode ser transitório, tenta de novo na próxima execução): ${e.message}`);
      }
    }
  }

  const totalThumbs = db.prepare(`SELECT COUNT(*) AS c FROM thumbnails`).get().c;
  const totalSynced = db.prepare(`SELECT COUNT(*) AS c FROM synced_thumbnails`).get().c;
  const totalNotFound = db.prepare(`SELECT COUNT(*) AS c FROM not_found_thumbnails`).get().c;
  db.close();

  const dbBuffer = fs.readFileSync(THUMBS_DB_PATH);
  const checksum = crypto.createHash("sha256").update(dbBuffer).digest("hex");
  const remaining = allTargets.length - totalSynced - totalNotFound;

  const manifest = {
    generatedAt: new Date().toISOString(),
    targetThumbnails: allTargets.length,
    syncedThumbnails: totalSynced,
    notFoundThumbnails: totalNotFound,
    remainingThumbnails: Math.max(remaining, 0),
    complete: remaining <= 0,
    totalThumbnailRows: totalThumbs,
    failuresThisRun: transientFailures,
    dbFile: path.basename(THUMBS_DB_PATH),
    dbSizeBytes: dbBuffer.length,
    dbSha256: checksum,
  };
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");

  console.log(
    `\n${totalThumbs} miniaturas no banco (${totalSynced}/${allTargets.length} geradas, ${totalNotFound} sem imagem confirmada).`
  );
  console.log(`${ok} geradas nesta execução, ${notFound} 404 reais, ${transientFailures} falhas transitórias.`);
  console.log(manifest.complete ? "MINIATURAS COMPLETAS." : `${manifest.remainingThumbnails} ainda pendentes.`);
  console.log(`Banco: ${THUMBS_DB_PATH} (${(dbBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`Manifesto: ${MANIFEST_PATH}`);
}

main().catch((e) => {
  console.error("Falha ao sincronizar miniaturas:", e.message);
  process.exit(1);
});
