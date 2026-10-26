/**
 * Testes reais (node:test) de src/domain/expansionEligibility.js —
 * especificação da Entrega 2, seção 10.
 * Executar: node --test scripts/run-expansion-eligibility-tests.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const { evaluateExpansionEligibility } = require("../src/domain/expansionEligibility");

test("set×idioma nunca sincronizado (zero registros) nunca é elegível", () => {
  const result = evaluateExpansionEligibility([], { scope: "complete_catalog" });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "not_synced");
});

test("complete_catalog: elegível quando a contagem distinta bate com set_total", () => {
  const records = [
    { localId: "001", setTotal: 2 },
    { localId: "002", setTotal: 2 },
  ];
  const result = evaluateExpansionEligibility(records, { scope: "complete_catalog" });
  assert.equal(result.eligible, true);
});

test("complete_catalog: parcial (ainda sincronizando) nunca finge estar completo", () => {
  const records = [{ localId: "001", setTotal: 182 }];
  const result = evaluateExpansionEligibility(records, { scope: "complete_catalog" });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "partial");
});

test("official: só conta impressões dentro do escopo oficial contra set_official", () => {
  const records = [
    { localId: "001", setOfficial: 1, setTotal: 2 },
    { localId: "GG01", setOfficial: 1, setTotal: 2 }, // secreta, fora do escopo oficial
  ];
  const result = evaluateExpansionEligibility(records, { scope: "official" });
  assert.equal(result.eligible, true, "1 impressão oficial válida == setOfficial(1)");
  assert.equal(result.recordCount, 1);
});

test("set_official/set_total ausentes (dado desconhecido): nunca finge elegibilidade", () => {
  const records = [{ localId: "001", setOfficial: null, setTotal: null }];
  const result = evaluateExpansionEligibility(records, { scope: "complete_catalog" });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "unknown_expected_count");
});
