/**
 * Testes reais (node:test) de src/storage/physicalClassification.js.
 * Caso de referência explícito da especificação da Entrega 1: `B2-001`
 * (Pokémon TCG Pocket) não pode aparecer como carta física elegível.
 *
 * Executar: node --test scripts/run-physical-classification-tests.js
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { classifyPhysical, isConfirmedPhysical, PHYSICAL, DIGITAL, UNCONFIRMED } = require("../src/storage/physicalClassification");

test("série física conhecida (ex.: base) -> physical", () => {
  assert.equal(classifyPhysical("base", ["tcgp"]), PHYSICAL);
});

test("série digital conhecida (tcgp) -> digital, nunca physical", () => {
  assert.equal(classifyPhysical("tcgp", ["tcgp"]), DIGITAL);
  assert.equal(isConfirmedPhysical("tcgp", ["tcgp"]), false);
});

test("caso de referência da especificação: B2-001 (série tcgp) não é física elegível", () => {
  // B2-001 é o card de referência citado na especificação (seção 4.6) para
  // o teste do filtro de séries digitais — a série real dele é "tcgp".
  assert.equal(classifyPhysical("tcgp"), DIGITAL);
  assert.equal(isConfirmedPhysical("tcgp"), false);
});

test("série desconhecida (null/undefined) -> unconfirmed, NUNCA physical silenciosamente", () => {
  // Regra explícita da especificação da Entrega 1 (mais estrita que a PoC
  // antiga, que tratava desconhecido como física por padrão).
  assert.equal(classifyPhysical(null), UNCONFIRMED);
  assert.equal(classifyPhysical(undefined), UNCONFIRMED);
  assert.equal(isConfirmedPhysical(null), false);
});

test("lista de séries digitais customizada é respeitada", () => {
  assert.equal(classifyPhysical("outra-digital", ["tcgp", "outra-digital"]), DIGITAL);
  assert.equal(classifyPhysical("tcgp", ["outra-digital"]), PHYSICAL);
});
