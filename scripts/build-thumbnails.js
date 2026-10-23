/**
 * Segunda metade da arquitetura de catálogo completo (ver reports/decision.md,
 * seção 11): gera miniaturas bem pequenas, pré-empacotadas, para as cartas do
 * banco gerado por scripts/sync-full-catalog.js — a garantia de que o app
 * mostra uma imagem de referência mesmo offline desde o primeiro uso, mesmo
 * sem nunca ter baixado a versão "low"/"high" de melhor qualidade do TCGdex.
 *
 * IMPORTANTE — escala: diferente do script de sincronização (só JSON
 * pequeno), este baixa uma IMAGEM REAL por carta. Rodar contra o catálogo
 * inteiro significa dezenas de milhares de downloads — não rodar em escala
 * completa sem combinar antes. Por padrão, roda só contra uma amostra
 * pequena (--limit, padrão 5 cartas) do banco gerado.
 *
 * Uso:
 *   node scripts/build-thumbnails.js                 # amostra pequena (padrão: 5 cartas, teste/dev)
 *   node scripts/build-thumbnails.js --limit=20       # amostra maior
 *   node scripts/build-thumbnails.js --full           # TODAS as cartas do banco (uso real, combinar antes)
 */

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const sharp = require("sharp");

const DB_PATH = path.join(__dirname, "..", "dist", "catalog", "catalog.db");
const THUMBS_DIR = path.join(__dirname, "..", "dist", "catalog", "thumbnails");

// Miniatura deliberadamente pequena: só para confirmação visual básica
// offline, não para leitura de texto da carta (isso já é resolvido pelo OCR
// + texto no card da UI, não pela imagem — ver decision.md seção 11).
const THUMB_WIDTH = 60;
const THUMB_HEIGHT = 84; // proporção ~2.5:3.5 da carta física
const WEBP_QUALITY = 55;

function parseArgs(argv) {
  const args = { full: false, limit: 5 };
  for (const a of argv) {
    if (a === "--full") args.full = true;
    else if (a.startsWith("--limit=")) args.limit = Number(a.slice("--limit=".length));
  }
  return args;
}

async function downloadBuffer(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(DB_PATH)) {
    console.error(`Banco não encontrado em ${DB_PATH}. Rode "node scripts/sync-full-catalog.js" antes.`);
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: true });
  const rows = db
    .prepare(
      `SELECT source_card_id, source_language, image_base_url FROM card_index
       WHERE has_image = 1
       ORDER BY source_card_id, source_language`
    )
    .all();
  db.close();

  const targets = args.full ? rows : rows.slice(0, args.limit);
  if (!args.full) {
    console.log(`Sem --full: gerando miniatura só para ${targets.length} carta(s) de ${rows.length} com imagem (use --full para todas).`);
  }

  fs.mkdirSync(THUMBS_DIR, { recursive: true });

  let ok = 0;
  let failed = 0;
  let totalBytes = 0;

  for (const [i, row] of targets.entries()) {
    const fileName = `${row.source_card_id}_${row.source_language}.webp`.replace(/[^a-zA-Z0-9._-]/g, "_");
    const outPath = path.join(THUMBS_DIR, fileName);
    const sourceUrl = `${row.image_base_url}/low.webp`;
    process.stdout.write(`  [${i + 1}/${targets.length}] ${row.source_card_id} (${row.source_language}) ... `);
    try {
      const original = await downloadBuffer(sourceUrl);
      const resized = await sharp(original)
        .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: "cover" })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
      fs.writeFileSync(outPath, resized);
      totalBytes += resized.length;
      ok++;
      console.log(`${resized.length} bytes (original ${original.length} bytes)`);
    } catch (e) {
      failed++;
      console.log(`ERRO: ${e.message}`);
    }
  }

  console.log(`\n${ok} miniaturas geradas, ${failed} falhas.`);
  if (ok > 0) {
    console.log(`Tamanho médio: ${Math.round(totalBytes / ok)} bytes/miniatura.`);
    console.log(`Estimativa para o catálogo completo (${rows.length} cartas com imagem neste banco): ${((totalBytes / ok) * rows.length / 1024 / 1024).toFixed(1)} MB.`);
  }
  console.log(`Salvas em: ${THUMBS_DIR}`);
}

main().catch((e) => {
  console.error("Falha ao gerar miniaturas:", e.message);
  process.exit(1);
});
