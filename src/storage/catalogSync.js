/**
 * Metade "baixar/sincronizar o pacote publicado" da arquitetura de catálogo
 * completo (Entrega 1 — ver reports/decision.md, seção 11). Completa o que
 * faltava em catalogIndex.js: baixar o banco SQLite gerado por
 * scripts/sync-full-catalog.js (publicado como asset da Release "catalog-data"
 * deste repositório, ver .github/workflows/sync-catalog.yml) e instalar como
 * o banco local que catalogIndex.js lê.
 *
 * NÃO conectado ainda à tela do scanner (app/index.jsx) — que continua usando
 * o bundle JSON estático desta PoC (app/assets/catalog-index.json), já
 * validado com cartas físicas reais. Ligar os dois é uma decisão deliberada
 * de Entrega 1, não desta PoC.
 *
 * Achado real (23/10/2026): a Release de dados precisa estar num repositório
 * PÚBLICO — um app publicado não pode ter um token do GitHub embutido só
 * para baixar assets de um repositório privado (risco de segurança real:
 * qualquer pessoa poderia extrair esse token do app). Por isso o repositório
 * foi tornado público nesta sessão (conferido antes: nenhum segredo no
 * histórico do git) — ver reports/decision.md, seção 11.3.
 *
 * API real usada (confirmada na documentação/tipos instalados, 23/10/2026):
 * - expo-file-system (nova API orientada a objeto do SDK 58): `File`,
 *   `File.downloadFileAsync(url, destination, { idempotent: true })`.
 * - expo-sqlite: `openDatabaseAsync(nome, opções?, diretório?)` e a
 *   constante `defaultDatabaseDirectory`, usada como destino do download
 *   para que o banco baixado fique exatamente onde `openDatabaseAsync`
 *   (sem `directory` explícito) espera encontrá-lo.
 */

const { File } = require("expo-file-system");
const { defaultDatabaseDirectory, openDatabaseAsync } = require("expo-sqlite");

const GITHUB_OWNER = "ChristianFreyDev";
const GITHUB_REPO = "dexbinder-poc-scanner";
const RELEASE_TAG = "catalog-data";
const RELEASE_BASE_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${RELEASE_TAG}`;

const MANIFEST_URL = `${RELEASE_BASE_URL}/catalog-version.json`;
const DB_URL = `${RELEASE_BASE_URL}/catalog.db`;

const LOCAL_DB_NAME = "dexbinder_catalog.db";
const LOCAL_MANIFEST_NAME = "dexbinder_catalog_manifest.json";

/** Manifesto da última sincronização bem-sucedida NESTE aparelho, ou null se nunca sincronizou. */
async function getLocalManifest() {
  try {
    const file = new File(defaultDatabaseDirectory, LOCAL_MANIFEST_NAME);
    if (!file.exists) return null;
    const text = await file.text();
    return JSON.parse(text);
  } catch {
    // Arquivo corrompido/ilegível: trata como "nunca sincronizou", nunca
    // inventa um manifesto — a próxima chamada a syncCatalog() corrige.
    return null;
  }
}

async function saveLocalManifest(manifest) {
  const file = new File(defaultDatabaseDirectory, LOCAL_MANIFEST_NAME);
  await file.write(JSON.stringify(manifest));
}

/** Busca o manifesto publicado (sem baixar o banco inteiro) para checar se há algo novo. */
async function fetchRemoteManifest() {
  const res = await fetch(MANIFEST_URL, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    throw new Error(`catalogSync: HTTP ${res.status} ao buscar o manifesto do catálogo (${MANIFEST_URL})`);
  }
  return res.json();
}

/**
 * Compara o manifesto local (última sincronização deste aparelho) com o
 * publicado, pelo checksum do banco — não pela data, que muda a cada
 * execução do workflow mesmo sem conteúdo novo relevante (ver
 * scripts/sync-full-catalog.js, que grava `generatedAt` toda vez).
 * @returns {Promise<{ updateAvailable: boolean, localManifest: object|null, remoteManifest: object }>}
 */
async function checkForUpdate() {
  const [localManifest, remoteManifest] = await Promise.all([getLocalManifest(), fetchRemoteManifest()]);
  const updateAvailable = !localManifest || localManifest.dbSha256 !== remoteManifest.dbSha256;
  return { updateAvailable, localManifest, remoteManifest };
}

/**
 * Baixa o banco publicado e o instala como o banco SQLite local (mesmo nome/
 * diretório que `openSyncedCatalogDb()` abre depois). Idempotente: pode ser
 * chamada mesmo sem uma atualização disponível, só repete o download.
 * @returns {Promise<object>} o manifesto da versão instalada
 */
async function downloadAndInstallCatalog() {
  const remoteManifest = await fetchRemoteManifest();
  const destination = new File(defaultDatabaseDirectory, LOCAL_DB_NAME);
  await File.downloadFileAsync(DB_URL, destination, { idempotent: true });
  await saveLocalManifest(remoteManifest);
  return remoteManifest;
}

/**
 * Sincroniza só se houver uma versão nova publicada (compara checksum).
 * Uso típico: chamar na abertura do app (ou sob demanda, "atualizar
 * catálogo"), sem forçar um download quando já está atualizado.
 * @returns {Promise<{ updated: boolean, manifest: object }>}
 */
async function syncCatalogIfNeeded() {
  const { updateAvailable, localManifest, remoteManifest } = await checkForUpdate();
  if (!updateAvailable) {
    return { updated: false, manifest: localManifest };
  }
  const manifest = await downloadAndInstallCatalog();
  return { updated: true, manifest };
}

/** Abre o banco já baixado (lança erro se `syncCatalogIfNeeded()` nunca rodou com sucesso). */
function openSyncedCatalogDb() {
  return openDatabaseAsync(LOCAL_DB_NAME);
}

module.exports = {
  checkForUpdate,
  downloadAndInstallCatalog,
  syncCatalogIfNeeded,
  openSyncedCatalogDb,
  getLocalManifest,
  LOCAL_DB_NAME,
  MANIFEST_URL,
  DB_URL,
};
