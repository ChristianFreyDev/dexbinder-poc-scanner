/**
 * Testes reais (node:test) do cadastro mestre da Pokédex Nacional —
 * especificação da Entrega 1, seção 6.1: "testes para contagem esperada,
 * IDs únicos, ausência de lacunas e metadados da fonte."
 *
 * Roda contra o ARQUIVO REAL gerado por scripts/build-national-dex.js
 * (app/assets/data/national-dex.json, 1025 espécies buscadas de verdade na
 * PokeAPI em 25/10/2026) — não uma fixture sintética pequena.
 *
 * Executar: node --test scripts/run-national-dex-tests.js
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { validateNationalDex } = require("../src/data/nationalDexValidation");

const DEX_PATH = path.join(__dirname, "..", "app", "assets", "data", "national-dex.json");

test("arquivo real existe (rode npm run build:national-dex se faltar)", () => {
  assert.ok(fs.existsSync(DEX_PATH), `${DEX_PATH} não encontrado`);
});

test("arquivo real passa em toda a validação (contagem, unicidade, lacunas, nomes, checksum)", () => {
  const data = JSON.parse(fs.readFileSync(DEX_PATH, "utf8"));
  const { valid, errors } = validateNationalDex(data);
  assert.deepEqual(errors, []);
  assert.equal(valid, true);
});

test("exatamente 1025 espécies, numeradas 1 a 1025 sem lacunas (meta da especificação)", () => {
  const data = JSON.parse(fs.readFileSync(DEX_PATH, "utf8"));
  assert.equal(data.species.length, 1025);
  const numbers = data.species.map((s) => s.nationalNumber).sort((a, b) => a - b);
  for (let i = 0; i < 1025; i++) assert.equal(numbers[i], i + 1);
});

test("metadados da fonte registrados (especificação, item 5: fonte, versão/data, licença)", () => {
  const data = JSON.parse(fs.readFileSync(DEX_PATH, "utf8"));
  assert.ok(data.source && data.source.includes("pokeapi.co"));
  assert.ok(data.sourceDescription && data.sourceDescription.length > 0);
  assert.ok(data.generatedAt);
  assert.ok(Array.isArray(data.knownLimitations) && data.knownLimitations.length > 0);
});

test("achado real documentado: português NÃO está entre os idiomas (a fonte não tem)", () => {
  const data = JSON.parse(fs.readFileSync(DEX_PATH, "utf8"));
  assert.ok(!data.languages.includes("pt"));
  assert.ok(!data.languages.includes("pt-br"));
});

test("casos de referência reais: #1 Bulbasaur, #25 Pikachu, #150 Mewtwo, #1025 Pecharunt", () => {
  const data = JSON.parse(fs.readFileSync(DEX_PATH, "utf8"));
  const byNumber = Object.fromEntries(data.species.map((s) => [s.nationalNumber, s]));
  assert.equal(byNumber[1].slug, "bulbasaur");
  assert.equal(byNumber[25].slug, "pikachu");
  assert.equal(byNumber[150].slug, "mewtwo");
  assert.equal(byNumber[1025].slug, "pecharunt");
});

test("validateNationalDex: detecta lacuna no intervalo (achado sintético)", () => {
  const data = {
    totalSpecies: 3,
    species: [
      { nationalNumber: 1, slug: "a", names: { en: "A" } },
      { nationalNumber: 3, slug: "c", names: { en: "C" } },
    ],
  };
  data.totalSpecies = 2;
  const { valid, errors } = validateNationalDex(data, { expectedTotal: 3 });
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes("lacuna") && e.includes("2")));
});

test("validateNationalDex: detecta número duplicado", () => {
  const data = {
    totalSpecies: 2,
    species: [
      { nationalNumber: 1, slug: "a", names: { en: "A" } },
      { nationalNumber: 1, slug: "a-dup", names: { en: "A" } },
    ],
  };
  const { valid, errors } = validateNationalDex(data, { expectedTotal: 2 });
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes("duplicado")));
});

test("validateNationalDex: detecta nome em inglês vazio", () => {
  const data = {
    totalSpecies: 1,
    species: [{ nationalNumber: 1, slug: "a", names: {} }],
  };
  const { valid, errors } = validateNationalDex(data, { expectedTotal: 1 });
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes("sem nome em inglês")));
});

test("validateNationalDex: detecta checksum adulterado", () => {
  const data = {
    totalSpecies: 1,
    species: [{ nationalNumber: 1, slug: "a", names: { en: "A" } }],
    checksum: "checksum-errado-de-propósito",
  };
  const { valid, errors } = validateNationalDex(data, { expectedTotal: 1 });
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes("checksum")));
});
