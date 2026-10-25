/**
 * Testes reais (node:test) de src/catalog/candidateOrdering.js.
 *
 * Executar: node --test scripts/run-candidate-ordering-tests.js
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { preferLanguageOnTie } = require("../src/catalog/candidateOrdering");

function candidate(sourceCardId, sourceLanguage, score) {
  return { record: { sourceCardId, sourceLanguage }, score, reasons: [] };
}

test("empate real de score: português vem primeiro (pedido real do usuário)", () => {
  // Mesmo caso real documentado em reports/decision.md: sv03.5-001
  // empatado entre en/de/pt/fr (Bulbasaur/Bisasam/Bulbasaur/Bulbizarre).
  const candidates = [
    candidate("sv03.5-001", "en", 0.85),
    candidate("sv03.5-001", "de", 0.85),
    candidate("sv03.5-001", "pt", 0.85),
    candidate("sv03.5-001", "fr", 0.85),
  ];
  const reordered = preferLanguageOnTie(candidates);
  assert.equal(reordered[0].record.sourceLanguage, "pt");
});

test("sem empate: ordem por score já correta não muda (maior confiança continua primeiro)", () => {
  const candidates = [candidate("a", "en", 0.9), candidate("b", "pt", 0.5)];
  const reordered = preferLanguageOnTie(candidates);
  assert.equal(reordered[0].record.sourceCardId, "a");
});

test("empate entre dois idiomas não-preferidos: mantém a ordem original (sort estável)", () => {
  const candidates = [candidate("a", "en", 0.7), candidate("b", "fr", 0.7)];
  const reordered = preferLanguageOnTie(candidates);
  assert.equal(reordered[0].record.sourceCardId, "a"); // "en" veio primeiro no array original
});

test("não muda o array original (função pura)", () => {
  const candidates = [candidate("a", "en", 0.7), candidate("b", "pt", 0.7)];
  const original = [...candidates];
  preferLanguageOnTie(candidates);
  assert.deepEqual(candidates, original);
});

test("idioma preferido customizável (não fica hardcoded em 'pt' por acidente)", () => {
  const candidates = [candidate("a", "en", 0.7), candidate("b", "ja", 0.7)];
  const reordered = preferLanguageOnTie(candidates, { preferredLanguage: "ja" });
  assert.equal(reordered[0].record.sourceCardId, "b");
});

test("lista vazia não quebra", () => {
  assert.deepEqual(preferLanguageOnTie([]), []);
});

test("um só candidato não quebra", () => {
  const candidates = [candidate("a", "en", 0.7)];
  assert.deepEqual(preferLanguageOnTie(candidates), candidates);
});
