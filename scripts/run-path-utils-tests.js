/**
 * Testes reais (node:test) de src/storage/pathUtils.js — trava o bug real
 * encontrado em dispositivo físico Android (25/10/2026): path cru do
 * expo-sqlite usado direto no expo-file-system quebrava com
 * "URI is not absolute". Ver src/storage/catalogSync.js.
 *
 * Executar: node --test scripts/run-path-utils-tests.js
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { toFileUri } = require("../src/storage/pathUtils");

test("path cru (sem esquema) ganha o prefixo file://", () => {
  // Formato real visto em dispositivo físico Android.
  assert.equal(toFileUri("/data/user/0/com.dexbinder.app/files/SQLite"), "file:///data/user/0/com.dexbinder.app/files/SQLite");
});

test("URI que já começa com file:// não é alterada (idempotente)", () => {
  const uri = "file:///data/user/0/com.dexbinder.app/files/SQLite";
  assert.equal(toFileUri(uri), uri);
});
