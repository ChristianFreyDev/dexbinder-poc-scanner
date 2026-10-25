/**
 * Testes reais (node:test) de src/catalog/scannerCandidateSearch.js, usando
 * texto OCR real já transcrito de prints de dispositivo físico nesta sessão
 * (não inventado) — ver reports/decision.md e reports/ocr-test-results.csv.
 *
 * Executar: node --test scripts/run-scanner-candidate-search-tests.js
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { parseCardText } = require("../src/scanner/parseCardText");
const { extractCandidateSearchTerms } = require("../src/catalog/scannerCandidateSearch");

test("texto OCR real (Cubone #104, print real do dispositivo): extrai o número certo", () => {
  const parsed = parseCardText([
    "ASICO Cubone",
    "„7",
    "BASICO",
    "Cubone",
    "N° 0104 Pokémon Solitário Altura: 0,4 m Peso: 6,5 kg",
    "GMEW104/165 @",
  ]);
  const { numbers, names } = extractCandidateSearchTerms(parsed);
  assert.ok(numbers.includes("104"));
  assert.ok(names.length > 0 && names.length <= 3);
});

test("sem número legível (só nome): ainda extrai termos de nome", () => {
  const parsed = parseCardText(["Charizard", "ruído de fundo qualquer"]);
  const { numbers, names } = extractCandidateSearchTerms(parsed);
  assert.deepEqual(numbers, []);
  assert.ok(names.includes("Charizard") || names.some((n) => n.includes("Charizard")));
});

test("várias leituras do mesmo número (OCR ruidoso): todas viram termos de busca distintos", () => {
  // Achado real documentado em rankCandidates.js: o OCR às vezes lê o MESMO
  // número de duas formas diferentes em linhas distintas de um recorte.
  const parsed = parseCardText(["025/165", "GMEWRl 022/165"]);
  const { numbers } = extractCandidateSearchTerms(parsed);
  assert.ok(numbers.includes("025"));
  assert.ok(numbers.includes("022"));
});

test("limita a no máximo maxNameLines nomes, os mais compridos primeiro (evita buscas demais)", () => {
  const parsed = {
    nameGuess: "a",
    nameLines: ["linha curta", "uma linha bem mais comprida de verdade", "média aqui ok", "outra curtinha"],
    numberCandidates: [],
  };
  const { names } = extractCandidateSearchTerms(parsed, { maxNameLines: 2 });
  assert.equal(names.length, 2);
  assert.equal(names[0], "uma linha bem mais comprida de verdade");
});

test("linhas de nome curtas demais (< 3 caracteres úteis) são descartadas", () => {
  const parsed = { nameGuess: null, nameLines: ["a", "xy", "nome válido"], numberCandidates: [] };
  const { names } = extractCandidateSearchTerms(parsed);
  assert.ok(!names.includes("a"));
  assert.ok(!names.includes("xy"));
  assert.ok(names.includes("nome válido"));
});

test("sem nome nem número nenhum (OCR vazio/falhou): não quebra, devolve listas vazias", () => {
  const parsed = parseCardText([]);
  const { numbers, names } = extractCandidateSearchTerms(parsed);
  assert.deepEqual(numbers, []);
  assert.deepEqual(names, []);
});
