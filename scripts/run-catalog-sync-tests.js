/**
 * Testes automatizados reais (node:test) da lógica pura de
 * src/storage/catalogSyncDecision.js. O restante de catalogSync.js (download,
 * leitura/escrita de arquivo local) depende de expo-file-system/expo-sqlite
 * e só roda no runtime React Native — não testável em Node puro (ver
 * reports/decision.md, seção 11.3). Esta é a parte que dá pra provar aqui.
 *
 * Executar: node --test scripts/run-catalog-sync-tests.js
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { shouldUpdate } = require("../src/storage/catalogSyncDecision");

test("sem manifesto local (nunca sincronizou) -> precisa atualizar", () => {
  assert.equal(shouldUpdate(null, { dbSha256: "abc" }), true);
});

test("checksum igual -> não precisa atualizar", () => {
  const local = { dbSha256: "abc", generatedAt: "2026-10-23T10:00:00.000Z" };
  const remote = { dbSha256: "abc", generatedAt: "2026-10-23T18:00:00.000Z" };
  assert.equal(shouldUpdate(local, remote), false);
});

test("checksum diferente -> precisa atualizar", () => {
  const local = { dbSha256: "abc", generatedAt: "2026-10-23T10:00:00.000Z" };
  const remote = { dbSha256: "def", generatedAt: "2026-10-23T18:00:00.000Z" };
  assert.equal(shouldUpdate(local, remote), true);
});

test("generatedAt diferente sozinho (sem mudar o checksum) não conta como atualização", () => {
  // Achado real: o workflow grava um generatedAt novo a cada execução horária
  // mesmo sem conteúdo relevante novo (ver scripts/sync-full-catalog.js) —
  // comparar por data em vez de checksum geraria downloads desnecessários
  // a cada hora, pra sempre.
  const local = { dbSha256: "mesmo-checksum", generatedAt: "2026-10-20T00:00:00.000Z" };
  const remote = { dbSha256: "mesmo-checksum", generatedAt: "2026-10-23T23:00:00.000Z" };
  assert.equal(shouldUpdate(local, remote), false);
});
