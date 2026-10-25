/**
 * Dublês (test doubles) de expo-file-system/expo-sqlite usados SÓ pelo teste
 * de simulação de falha de atualização (scripts/run-catalog-sync-failure-
 * simulation-tests.js). Mockam exatamente a borda nativa que já era
 * documentada como intestável em Node puro (ver topo de
 * scripts/run-catalog-sync-tests.js e reports/decision.md, seção 11.3) —
 * tudo que é lógica real do projeto (catalogSync.js, catalogInstallDecision.js,
 * catalogSyncDecision.js, pathUtils.js) continua rodando sem alteração.
 *
 * Isto é uma SIMULAÇÃO em Node, não um teste no dispositivo físico real: prova
 * que a orquestração (downloadAndInstallCatalog/ensureCatalogReady) nunca
 * sobrescreve o banco anterior quando checksum ou integridade SQLite falham,
 * mas não substitui a confirmação em Android real (pendência documentada em
 * reports/delivery-1.md, seção 8).
 */

const crypto = require("crypto");

function createFakeExpoFileSystem({ store, remoteDbBytesRef }) {
  class File {
    constructor(dirUri, name) {
      this.dirUri = dirUri;
      this.name = name;
      this.key = `${dirUri}::${name}`;
      this.uri = this.key;
    }
    get exists() {
      return store.has(this.key);
    }
    async text() {
      const entry = store.get(this.key);
      if (entry == null) throw new Error(`ENOENT (simulado): ${this.key}`);
      return entry.toString("utf8");
    }
    async write(content) {
      store.set(this.key, Buffer.from(content, "utf8"));
    }
    async digest(_algorithm) {
      const entry = store.get(this.key);
      if (entry == null) throw new Error(`ENOENT (simulado): ${this.key}`);
      return crypto.createHash("sha256").update(entry).digest("hex");
    }
    delete() {
      store.delete(this.key);
    }
    async move(destFile, _opts) {
      const entry = store.get(this.key);
      store.set(destFile.key, entry);
      store.delete(this.key);
    }
  }

  // Simula File.downloadFileAsync: "baixa" os bytes controlados pelo teste
  // (remoteDbBytesRef.bytes) para o arquivo temporário, sem rede real.
  File.downloadFileAsync = async function (_url, destFile, _opts) {
    store.set(destFile.key, Buffer.from(remoteDbBytesRef.bytes));
  };

  class Directory {
    constructor(uri) {
      this.uri = uri;
    }
    create() {
      // No store baseado em Map, o "diretório" é implícito na chave —
      // criar é sempre idempotente, igual ao comportamento real esperado.
    }
  }

  return { File, Directory };
}

function createFakeExpoSqlite({ defaultDatabaseDirectory, sqliteIntegrityOkRef }) {
  async function openDatabaseAsync(_nameOrUri, _options, _directory) {
    if (!sqliteIntegrityOkRef.ok) {
      throw new Error("file is not a database (simulado)");
    }
    return {
      getFirstAsync: async () => ({ c: 13500 }),
      closeAsync: async () => {},
    };
  }
  return { defaultDatabaseDirectory, openDatabaseAsync };
}

module.exports = { createFakeExpoFileSystem, createFakeExpoSqlite };
