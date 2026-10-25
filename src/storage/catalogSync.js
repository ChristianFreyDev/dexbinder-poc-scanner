/**
 * Metade "baixar/sincronizar o pacote publicado" da arquitetura de catálogo
 * completo (Entrega 1 — ver reports/decision.md, seção 11, e
 * especificação da Entrega 1, seção 4.2). Baixa o banco SQLite gerado por
 * scripts/sync-full-catalog.js (publicado como asset da Release "catalog-data"
 * deste repositório, ver .github/workflows/sync-catalog.yml) e instala como
 * o banco local que catalogIndex.js lê.
 *
 * Reescrito na Entrega 1 para cumprir os requisitos explícitos da
 * especificação (seção 4.2, itens 5-9) que a versão da Entrega 0 NÃO
 * cumpria (download ia direto pro arquivo final, sem checksum nem
 * verificação de integridade pós-download):
 *   1. Baixa SEMPRE para um arquivo TEMPORÁRIO, nunca direto no destino final.
 *   2. Valida o checksum (`File.digest("SHA-256")`, API real do
 *      expo-file-system — confirmado nos tipos instalados, não precisa de
 *      expo-crypto) contra `dbSha256` do manifesto.
 *   3. Valida a integridade abrindo o arquivo temporário como SQLite de
 *      verdade e rodando uma query simples.
 *   4. Só então instala atomicamente (`File.move()`) por cima do banco
 *      anterior — nunca sobrescreve direto; se qualquer validação falhar,
 *      o arquivo temporário é descartado e o banco anterior (se existir)
 *      permanece intocado e funcional.
 *   5. Nunca duas sincronizações concorrentes (lock em memória).
 *
 * A decisão "instalar ou não" (dado checksum batendo e integridade OK) é
 * pura e testada em catalogInstallDecision.js — esta função aqui só faz a
 * parte de I/O real (download, hash, abrir SQLite, mover arquivo), que
 * não roda em Node puro (confirmado: ERR_MODULE_NOT_FOUND ao exigir
 * expo-file-system/expo-sqlite fora do runtime React Native).
 *
 * Achado real (23/10/2026): a Release de dados precisa estar num repositório
 * PÚBLICO — um app publicado não pode ter um token do GitHub embutido só
 * para baixar assets de um repositório privado (risco de segurança real:
 * qualquer pessoa poderia extrair esse token do app). Por isso o repositório
 * foi tornado público nesta sessão (conferido antes: nenhum segredo no
 * histórico do git) — ver reports/decision.md, seção 11.3.
 *
 * Achado real EM DISPOSITIVO FÍSICO (25/10/2026): `defaultDatabaseDirectory`
 * (expo-sqlite) é um PATH CRU de sistema de arquivos (ex.:
 * "/data/user/0/<pacote>/files/SQLite"), convenção interna do SQLite — não
 * uma URI `file://`. Passar esse path cru direto pro construtor de `File`/
 * `Directory` do expo-file-system (que EXIGE uma URI) quebrava de verdade
 * no Android físico com `java.lang.IllegalArgumentException: URI is not
 * absolute` ao checar `file.exists`. Corrigido: `DB_DIRECTORY_URI` abaixo é
 * só pra uso com `File`/`Directory` (prefixo "file://"); `openDatabaseAsync`
 * continua recebendo `defaultDatabaseDirectory` SEM alteração (é ele quem
 * espera o path cru, confirmado em expo-sqlite/build/pathUtils.js).
 */

const { File, Directory } = require("expo-file-system");
const { defaultDatabaseDirectory, openDatabaseAsync } = require("expo-sqlite");
const { shouldUpdate } = require("./catalogSyncDecision");
const { decideInstall } = require("./catalogInstallDecision");
const { toFileUri } = require("./pathUtils");

const DB_DIRECTORY_URI = toFileUri(defaultDatabaseDirectory);

const GITHUB_OWNER = "ChristianFreyDev";
const GITHUB_REPO = "dexbinder-poc-scanner";
const RELEASE_TAG = "catalog-data";
const RELEASE_BASE_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${RELEASE_TAG}`;

const MANIFEST_URL = `${RELEASE_BASE_URL}/catalog-version.json`;
const DB_URL = `${RELEASE_BASE_URL}/catalog.db`;

const LOCAL_DB_NAME = "dexbinder_catalog.db";
const LOCAL_MANIFEST_NAME = "dexbinder_catalog_manifest.json";
const TEMP_DB_NAME = "dexbinder_catalog.download.db";

/**
 * Estados expostos para a interface (especificação, seção 4.2, item 10).
 * `offline_using_local` e `error_recoverable` só existem quando a
 * checagem de rede falha; os demais são a progressão normal.
 */
const SYNC_STATUS = {
  NOT_INSTALLED: "not_installed",
  CHECKING: "checking",
  DOWNLOADING: "downloading",
  VALIDATING: "validating",
  READY: "ready",
  OFFLINE_USING_LOCAL: "offline_using_local",
  ERROR_RECOVERABLE: "error_recoverable",
};

function notify(onStatusChange, status, extra) {
  if (typeof onStatusChange === "function") onStatusChange(status, extra);
}

/** Manifesto da última sincronização bem-sucedida NESTE aparelho, ou null se nunca sincronizou. */
async function getLocalManifest() {
  try {
    const file = new File(DB_DIRECTORY_URI, LOCAL_MANIFEST_NAME);
    if (!file.exists) return null;
    const text = await file.text();
    return JSON.parse(text);
  } catch {
    // Arquivo corrompido/ilegível: trata como "nunca sincronizou", nunca
    // inventa um manifesto — a próxima chamada a ensureCatalogReady() corrige.
    return null;
  }
}

async function saveLocalManifest(manifest) {
  const file = new File(DB_DIRECTORY_URI, LOCAL_MANIFEST_NAME);
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
 * Checagem rápida, sem rede: existe um banco local instalado utilizável
 * agora mesmo? (Especificação, seção 4.2, item 1: "Na primeira abertura,
 * verificar se já existe banco de catálogo local válido".)
 */
function getInstalledCatalogInfo() {
  const dbFile = new File(DB_DIRECTORY_URI, LOCAL_DB_NAME);
  return { installed: dbFile.exists, dbPath: dbFile.exists ? dbFile.uri : null };
}

/** Compara o manifesto local com o publicado, pelo checksum do banco (ver catalogSyncDecision.js). */
async function checkForUpdate() {
  const [localManifest, remoteManifest] = await Promise.all([getLocalManifest(), fetchRemoteManifest()]);
  const updateAvailable = shouldUpdate(localManifest, remoteManifest);
  return { updateAvailable, localManifest, remoteManifest };
}

/** Verifica a integridade SQLite real do arquivo temporário baixado antes de instalar. */
async function checkSqliteIntegrity(tempFileName) {
  let db;
  try {
    db = await openDatabaseAsync(tempFileName, {}, defaultDatabaseDirectory);
    const row = await db.getFirstAsync(`SELECT COUNT(*) AS c FROM card_index`);
    return typeof row?.c === "number";
  } catch {
    return false;
  } finally {
    if (db) {
      try {
        await db.closeAsync();
      } catch {
        // já fechado/corrompido — nada a fazer
      }
    }
  }
}

/**
 * Baixa o banco publicado para um arquivo TEMPORÁRIO, valida checksum +
 * integridade SQLite, e só então instala atomicamente. Se qualquer
 * validação falhar, o banco anterior (se existir) permanece intocado.
 *
 * @returns {Promise<{ installed: boolean, manifest: object|null, reason: string }>}
 */
async function downloadAndInstallCatalog({ onStatusChange } = {}) {
  const remoteManifest = await fetchRemoteManifest();

  notify(onStatusChange, SYNC_STATUS.DOWNLOADING);
  // Achado real em dispositivo físico (app novo, 1ª instalação, 25/10/2026):
  // o diretório "SQLite/" de defaultDatabaseDirectory só é criado de
  // verdade quando o expo-sqlite abre/cria um banco nele pela 1ª vez — como
  // o download acontece ANTES de qualquer openDatabaseAsync(), o diretório
  // ainda não existia, e File.downloadFileAsync() falhava com
  // "ENOENT: No such file or directory". Garantido aqui, idempotente (não
  // erra se já existir).
  new Directory(DB_DIRECTORY_URI).create({ intermediates: true, idempotent: true });
  const tempFile = new File(DB_DIRECTORY_URI, TEMP_DB_NAME);
  if (tempFile.exists) tempFile.delete();
  await File.downloadFileAsync(DB_URL, tempFile, { idempotent: true });

  notify(onStatusChange, SYNC_STATUS.VALIDATING);
  const downloadedChecksum = await tempFile.digest("SHA-256");
  const sqliteIntegrityOk = await checkSqliteIntegrity(TEMP_DB_NAME);

  const { install, reason } = decideInstall({
    downloadedChecksum,
    expectedChecksum: remoteManifest.dbSha256,
    sqliteIntegrityOk,
  });

  if (!install) {
    // Nunca substitui um banco válido por um arquivo parcial/corrompido —
    // descarta o temporário e deixa o banco anterior (se houver) intocado.
    if (tempFile.exists) tempFile.delete();
    return { installed: false, manifest: null, reason };
  }

  const destination = new File(DB_DIRECTORY_URI, LOCAL_DB_NAME);
  await tempFile.move(destination, { overwrite: true });
  await saveLocalManifest(remoteManifest);
  return { installed: true, manifest: remoteManifest, reason };
}

/**
 * Orquestra o fluxo completo (especificação, seção 4.2): checa se há
 * catálogo instalado, consulta o manifesto público, decide se precisa
 * baixar, baixa/valida/instala com segurança, e cobre os casos de rede
 * indisponível (usa o catálogo local se existir; erro recuperável claro se
 * não existir nenhum catálogo e não houver rede).
 *
 * Nunca roda duas sincronizações ao mesmo tempo — chamadas concorrentes
 * recebem a MESMA promise em andamento (especificação, item 9).
 *
 * @returns {Promise<{ status: string, manifest: object|null, updated: boolean, error: string|null }>}
 */
let inFlightSync = null;
async function ensureCatalogReady({ onStatusChange } = {}) {
  if (inFlightSync) return inFlightSync;

  inFlightSync = (async () => {
    notify(onStatusChange, SYNC_STATUS.CHECKING);
    const { installed } = getInstalledCatalogInfo();

    let checkResult;
    try {
      checkResult = await checkForUpdate();
    } catch (networkError) {
      if (installed) {
        const localManifest = await getLocalManifest();
        notify(onStatusChange, SYNC_STATUS.OFFLINE_USING_LOCAL);
        return { status: SYNC_STATUS.OFFLINE_USING_LOCAL, manifest: localManifest, updated: false, error: null };
      }
      notify(onStatusChange, SYNC_STATUS.ERROR_RECOVERABLE);
      return {
        status: SYNC_STATUS.ERROR_RECOVERABLE,
        manifest: null,
        updated: false,
        error: "Sem catálogo instalado e sem conexão com a internet. Conecte-se e tente novamente.",
      };
    }

    const { updateAvailable, localManifest, remoteManifest } = checkResult;
    if (!updateAvailable && installed) {
      notify(onStatusChange, SYNC_STATUS.READY);
      return { status: SYNC_STATUS.READY, manifest: localManifest, updated: false, error: null };
    }

    try {
      const { installed: didInstall, manifest, reason } = await downloadAndInstallCatalog({ onStatusChange });
      if (!didInstall) {
        if (installed) {
          // Instalação nova falhou, mas o banco anterior continua válido —
          // não é um erro bloqueante, só não atualizou desta vez.
          notify(onStatusChange, SYNC_STATUS.READY);
          return { status: SYNC_STATUS.READY, manifest: localManifest, updated: false, error: `Atualização rejeitada (${reason}); catálogo anterior mantido.` };
        }
        notify(onStatusChange, SYNC_STATUS.ERROR_RECOVERABLE);
        return { status: SYNC_STATUS.ERROR_RECOVERABLE, manifest: null, updated: false, error: `Falha ao instalar o catálogo (${reason}).` };
      }
      notify(onStatusChange, SYNC_STATUS.READY);
      return { status: SYNC_STATUS.READY, manifest, updated: true, error: null };
    } catch (downloadError) {
      if (installed) {
        notify(onStatusChange, SYNC_STATUS.READY);
        return { status: SYNC_STATUS.READY, manifest: localManifest, updated: false, error: downloadError.message };
      }
      notify(onStatusChange, SYNC_STATUS.ERROR_RECOVERABLE);
      return { status: SYNC_STATUS.ERROR_RECOVERABLE, manifest: null, updated: false, error: downloadError.message };
    }
  })();

  try {
    return await inFlightSync;
  } finally {
    inFlightSync = null;
  }
}

/** Abre o banco já instalado (lança erro se nunca instalado com sucesso). */
function openSyncedCatalogDb() {
  return openDatabaseAsync(LOCAL_DB_NAME);
}

module.exports = {
  SYNC_STATUS,
  ensureCatalogReady,
  checkForUpdate,
  downloadAndInstallCatalog,
  getInstalledCatalogInfo,
  openSyncedCatalogDb,
  getLocalManifest,
  LOCAL_DB_NAME,
  MANIFEST_URL,
  DB_URL,
};
