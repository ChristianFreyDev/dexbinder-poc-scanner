/**
 * Simulação real (em Node) da falha de atualização do catálogo — item
 * pendente da especificação da Entrega 1 (seção 6.2/6.3): "mantém a versão
 * anteriormente instalada quando uma atualização falha".
 *
 * src/storage/catalogSync.js (download, checksum, integridade SQLite,
 * instalação atômica) depende de expo-file-system/expo-sqlite e por isso não
 * rodava em Node puro (ver scripts/run-catalog-sync-tests.js). Este arquivo
 * injeta dublês dessas duas dependências (scripts/fakeExpoModulesForSyncFailureTest.js)
 * no module loader do Node ANTES de exigir catalogSync.js, para exercitar o
 * código REAL de orquestração (downloadAndInstallCatalog/ensureCatalogReady)
 * — não uma reimplementação — contra um "download" controlado que falha de
 * propósito, e confirmar que o catálogo e o manifesto já instalados
 * continuam intactos depois.
 *
 * Isto é uma simulação, não um teste no dispositivo físico real — ver nota
 * no topo de fakeExpoModulesForSyncFailureTest.js e a pendência registrada em
 * reports/delivery-1.md, seção 8.
 *
 * Executar: node --test scripts/run-catalog-sync-failure-simulation-tests.js
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("module");
const crypto = require("crypto");

const { createFakeExpoFileSystem, createFakeExpoSqlite } = require("./fakeExpoModulesForSyncFailureTest");

const CATALOG_SYNC_PATH = require.resolve("../src/storage/catalogSync");
const FAKE_DB_DIR_RAW = "/data/user/0/com.dexbinder.pocscanner/files/SQLite";

function sha256(bufferOrString) {
  return crypto.createHash("sha256").update(bufferOrString).digest("hex");
}

/**
 * Exige catalogSync.js "do zero" (fora do cache) com expo-file-system/
 * expo-sqlite substituídos pelos dublês — só durante esta chamada, o
 * Module._load original é restaurado logo em seguida (inclusive se o
 * require falhar), pra nunca vazar o mock pros outros testes do projeto.
 */
function requireCatalogSyncWithFakes({ store, remoteDbBytesRef, sqliteIntegrityOkRef }) {
  const fakeFs = createFakeExpoFileSystem({ store, remoteDbBytesRef });
  const fakeSqlite = createFakeExpoSqlite({ defaultDatabaseDirectory: FAKE_DB_DIR_RAW, sqliteIntegrityOkRef });

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "expo-file-system") return fakeFs;
    if (request === "expo-sqlite") return fakeSqlite;
    return originalLoad.apply(this, arguments);
  };

  delete require.cache[CATALOG_SYNC_PATH];
  try {
    return require(CATALOG_SYNC_PATH);
  } finally {
    Module._load = originalLoad;
  }
}

function setUpInstalledCatalog(store) {
  const dirUri = `file://${FAKE_DB_DIR_RAW}`;
  const oldDbBytes = Buffer.from("FAKE-SQLITE-BYTES-CATALOGO-JA-INSTALADO-V1");
  const oldManifest = {
    dbSha256: sha256(oldDbBytes),
    generatedAt: "2026-10-24T12:00:00.000Z",
    totalRecords: 13191,
  };
  store.set(`${dirUri}::dexbinder_catalog.db`, oldDbBytes);
  store.set(`${dirUri}::dexbinder_catalog_manifest.json`, Buffer.from(JSON.stringify(oldManifest), "utf8"));
  return { dirUri, oldDbBytes, oldManifest };
}

test("falha de checksum (download incompleto/corrompido): catálogo anterior continua intacto", async () => {
  const store = new Map();
  const { dirUri, oldDbBytes, oldManifest } = setUpInstalledCatalog(store);

  // Manifesto remoto anuncia um catálogo novo (checksum diferente do local).
  const intendedNewDbBytes = Buffer.from("FAKE-SQLITE-BYTES-CATALOGO-NOVO-COMPLETO-V2");
  const remoteManifest = {
    dbSha256: sha256(intendedNewDbBytes),
    generatedAt: "2026-10-25T20:00:00.000Z",
    totalRecords: 13500,
  };
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).endsWith("catalog-version.json")) {
      return { ok: true, json: async () => remoteManifest };
    }
    throw new Error(`fetch não mockado nesta simulação: ${url}`);
  };

  // "Download" real que a simulação entrega: só a METADE dos bytes
  // pretendidos — simula uma conexão que caiu no meio, achado real já
  // documentado em reports/decision.md (ENOENT por diretório ausente foi
  // outro bug real da mesma área). O checksum do que chegou não bate com o
  // esperado no manifesto.
  const remoteDbBytesRef = { bytes: intendedNewDbBytes.subarray(0, Math.floor(intendedNewDbBytes.length / 2)) };
  const sqliteIntegrityOkRef = { ok: true }; // irrelevante aqui: decideInstall já rejeita pelo checksum antes

  const catalogSync = requireCatalogSyncWithFakes({ store, remoteDbBytesRef, sqliteIntegrityOkRef });

  try {
    const result = await catalogSync.ensureCatalogReady();

    assert.equal(result.status, catalogSync.SYNC_STATUS.READY);
    assert.equal(result.updated, false);
    assert.equal(result.manifest.dbSha256, oldManifest.dbSha256);
    assert.match(result.error, /checksum_mismatch/);
    assert.match(result.error, /catálogo anterior mantido/);

    // O banco e o manifesto instalados continuam exatamente como estavam —
    // nada foi sobrescrito por um download incompleto.
    assert.deepEqual(store.get(`${dirUri}::dexbinder_catalog.db`), oldDbBytes);
    assert.deepEqual(JSON.parse(store.get(`${dirUri}::dexbinder_catalog_manifest.json`).toString("utf8")), oldManifest);

    // O arquivo temporário (baixado pela metade) foi descartado, não ficou lixo pra trás.
    assert.equal(store.has(`${dirUri}::dexbinder_catalog.download.db`), false);

    const info = catalogSync.getInstalledCatalogInfo();
    assert.equal(info.installed, true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("falha de integridade SQLite (checksum bate, mas o arquivo não abre como banco válido): catálogo anterior continua intacto", async () => {
  const store = new Map();
  const { dirUri, oldDbBytes, oldManifest } = setUpInstalledCatalog(store);

  const remoteDbBytes = Buffer.from("FAKE-SQLITE-BYTES-CATALOGO-NOVO-CORROMPIDO-V3");
  const remoteManifest = {
    dbSha256: sha256(remoteDbBytes),
    generatedAt: "2026-10-25T21:00:00.000Z",
    totalRecords: 13500,
  };
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).endsWith("catalog-version.json")) {
      return { ok: true, json: async () => remoteManifest };
    }
    throw new Error(`fetch não mockado nesta simulação: ${url}`);
  };

  // Desta vez o download chega completo e o checksum bate — mas o arquivo
  // falha ao abrir como SQLite de verdade (segunda camada de validação da
  // especificação, seção 4.2, item 7).
  const remoteDbBytesRef = { bytes: remoteDbBytes };
  const sqliteIntegrityOkRef = { ok: false };

  const catalogSync = requireCatalogSyncWithFakes({ store, remoteDbBytesRef, sqliteIntegrityOkRef });

  try {
    const result = await catalogSync.ensureCatalogReady();

    assert.equal(result.status, catalogSync.SYNC_STATUS.READY);
    assert.equal(result.updated, false);
    assert.match(result.error, /sqlite_invalid/);
    assert.match(result.error, /catálogo anterior mantido/);

    assert.deepEqual(store.get(`${dirUri}::dexbinder_catalog.db`), oldDbBytes);
    assert.deepEqual(JSON.parse(store.get(`${dirUri}::dexbinder_catalog_manifest.json`).toString("utf8")), oldManifest);
    assert.equal(store.has(`${dirUri}::dexbinder_catalog.download.db`), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("sanity check do dublê: quando checksum E integridade passam, a instalação É aplicada (garante que os 2 testes acima falham pelo motivo certo, não porque o mock nunca instala nada)", async () => {
  const store = new Map();
  const { dirUri, oldManifest } = setUpInstalledCatalog(store);

  const remoteDbBytes = Buffer.from("FAKE-SQLITE-BYTES-CATALOGO-NOVO-VALIDO-V4");
  const remoteManifest = {
    dbSha256: sha256(remoteDbBytes),
    generatedAt: "2026-10-25T22:00:00.000Z",
    totalRecords: 13600,
  };
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).endsWith("catalog-version.json")) {
      return { ok: true, json: async () => remoteManifest };
    }
    throw new Error(`fetch não mockado nesta simulação: ${url}`);
  };

  const remoteDbBytesRef = { bytes: remoteDbBytes };
  const sqliteIntegrityOkRef = { ok: true };

  const catalogSync = requireCatalogSyncWithFakes({ store, remoteDbBytesRef, sqliteIntegrityOkRef });

  try {
    const result = await catalogSync.ensureCatalogReady();

    assert.equal(result.status, catalogSync.SYNC_STATUS.READY);
    assert.equal(result.updated, true);
    assert.equal(result.error, null);
    assert.equal(result.manifest.dbSha256, remoteManifest.dbSha256);
    assert.notEqual(result.manifest.dbSha256, oldManifest.dbSha256);

    assert.deepEqual(store.get(`${dirUri}::dexbinder_catalog.db`), remoteDbBytes);
  } finally {
    global.fetch = originalFetch;
  }
});
