/**
 * Testes reais (node:test) de src/scanner/parseManualQuery.js — cobrem o
 * bug real relatado pelo usuário (25/10/2026): buscar "001", "025", "050"
 * manualmente não achava nada.
 *
 * Executar: node --test scripts/run-parse-manual-query-tests.js
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { parseManualQuery } = require("../src/scanner/parseManualQuery");

test("achado real do usuário: número puro '001' vira candidato de número (não era descartado)", () => {
  const parsed = parseManualQuery("001");
  assert.deepEqual(parsed.numberCandidates, [{ number: "001", total: null }]);
  assert.equal(parsed.numberGuess, "001");
  assert.deepEqual(parsed.nameLines, []);
});

test("achado real do usuário: '025' e '050' também viram candidatos de número", () => {
  assert.equal(parseManualQuery("025").numberGuess, "025");
  assert.equal(parseManualQuery("050").numberGuess, "050");
});

test("nome e número juntos (placeholder sugerido pelo app: 'Bulbasaur 001')", () => {
  const parsed = parseManualQuery("Bulbasaur 001");
  assert.equal(parsed.nameGuess, "Bulbasaur");
  assert.equal(parsed.numberGuess, "001");
});

test("número com barra (NNN/NNN) extrai número e total", () => {
  const parsed = parseManualQuery("001/165");
  assert.deepEqual(parsed.numberCandidates, [{ number: "001", total: "165" }]);
});

test("só nome, sem número nenhum", () => {
  const parsed = parseManualQuery("Pikachu");
  assert.equal(parsed.nameGuess, "Pikachu");
  assert.deepEqual(parsed.numberCandidates, []);
});

test("nome com várias palavras junta tudo em nameGuess", () => {
  const parsed = parseManualQuery("Venusaur ex");
  assert.equal(parsed.nameGuess, "Venusaur ex");
});

test("localId atípico com letra (GG01, DP01) sem espaço vira candidato de número", () => {
  assert.equal(parseManualQuery("GG01").numberGuess, "GG01");
  assert.equal(parseManualQuery("DP01").numberGuess, "DP01");
});

test("texto vazio não quebra", () => {
  const parsed = parseManualQuery("");
  assert.equal(parsed.nameGuess, null);
  assert.equal(parsed.numberGuess, null);
  assert.deepEqual(parsed.numberCandidates, []);
});

test("espaços extras/múltiplos não quebram a separação de tokens", () => {
  const parsed = parseManualQuery("  Bulbasaur    001  ");
  assert.equal(parsed.nameGuess, "Bulbasaur");
  assert.equal(parsed.numberGuess, "001");
});
