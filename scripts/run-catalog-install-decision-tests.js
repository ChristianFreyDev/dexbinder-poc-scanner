/**
 * Testes reais (node:test) de src/storage/catalogInstallDecision.js — os
 * cenários de aceite explícitos da especificação da Entrega 1 (seção 6.1):
 * checksum incorreto, arquivo incompleto/interrompido (mesmo efeito: checksum
 * não bate) e banco SQLite inválido.
 *
 * Executar: node --test scripts/run-catalog-install-decision-tests.js
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { decideInstall, REASON } = require("../src/storage/catalogInstallDecision");

test("checksum e integridade OK -> instala", () => {
  const { install, reason } = decideInstall({
    downloadedChecksum: "abc123",
    expectedChecksum: "abc123",
    sqliteIntegrityOk: true,
  });
  assert.equal(install, true);
  assert.equal(reason, REASON.OK);
});

test("checksum incorreto -> NÃO instala, mesmo com SQLite válido", () => {
  const { install, reason } = decideInstall({
    downloadedChecksum: "abc123",
    expectedChecksum: "def456",
    sqliteIntegrityOk: true,
  });
  assert.equal(install, false);
  assert.equal(reason, REASON.CHECKSUM_MISMATCH);
});

test("download incompleto/interrompido (checksum vazio) -> NÃO instala", () => {
  const { install, reason } = decideInstall({
    downloadedChecksum: "",
    expectedChecksum: "def456",
    sqliteIntegrityOk: true,
  });
  assert.equal(install, false);
  assert.equal(reason, REASON.CHECKSUM_MISMATCH);
});

test("comparação de checksum é case-insensitive (hex maiúsculo/minúsculo)", () => {
  const { install } = decideInstall({
    downloadedChecksum: "ABC123",
    expectedChecksum: "abc123",
    sqliteIntegrityOk: true,
  });
  assert.equal(install, true);
});

test("checksum OK mas SQLite inválido -> NÃO instala (arquivo corrompido)", () => {
  const { install, reason } = decideInstall({
    downloadedChecksum: "abc123",
    expectedChecksum: "abc123",
    sqliteIntegrityOk: false,
  });
  assert.equal(install, false);
  assert.equal(reason, REASON.SQLITE_INVALID);
});

test("checksum errado E SQLite inválido -> rejeita pelo checksum primeiro (razão determinística)", () => {
  const { install, reason } = decideInstall({
    downloadedChecksum: "abc123",
    expectedChecksum: "def456",
    sqliteIntegrityOk: false,
  });
  assert.equal(install, false);
  assert.equal(reason, REASON.CHECKSUM_MISMATCH);
});
