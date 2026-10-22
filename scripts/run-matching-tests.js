/**
 * Testes automatizados REAIS (node:test) para a lógica de correspondência
 * (parseCardText.js + rankCandidates.js), usando os 31 registros REAIS
 * coletados pela auditoria de catálogo (fixtures/cards/*.json).
 *
 * IMPORTANTE — o que isto prova e o que NÃO prova:
 * - PROVA: dado um texto "limpo" (equivalente ao que um OCR perfeito
 *   devolveria) ou um texto com ruído simulado, o algoritmo de
 *   pontuação escolhe o candidato certo, desambigua corretamente entre
 *   impressões da mesma espécie e sinaliza confirmação manual quando
 *   apropriado. Esta parte é determinística e 100% executada aqui.
 * - NÃO PROVA: que a câmera + OCR real (rn-mlkit-ocr) em um Android
 *   físico, fotografando um cartão de papel sob luz real, produz esse
 *   texto "limpo". Isso exige o dataset de 60 fotos da seção 16.3 da
 *   especificação, que requer dispositivo físico e cartas físicas —
 *   não disponível neste ambiente (ver reports/decision.md).
 *
 * Executar: node --test scripts/run-matching-tests.js
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { loadFixtureCards, normalizeCard, loadSeriesMap, filterPhysicalCards } = require("../src/catalog/catalogFixtures");
const { parseCardText, normalizeForComparison } = require("../src/scanner/parseCardText");
const { rankCandidates } = require("../src/scanner/rankCandidates");
const { naturalCompare, sortByLocalId } = require("../src/scanner/naturalSort");
const { resolveImageUrl } = require("../src/scanner/resolveImageUrl");

const allRecords = loadFixtureCards();

test("auditoria carregou os 31 registros reais esperados", () => {
  assert.equal(allRecords.length, 31, "esperado 31 fixtures reais salvas pela auditoria de catálogo");
});

function findRecord(sourceCardId, sourceLanguage) {
  const r = allRecords.find((x) => x.sourceCardId === sourceCardId && x.sourceLanguage === sourceLanguage);
  assert.ok(r, `fixture não encontrada: ${sourceCardId} (${sourceLanguage}) — rode scripts/run-catalog-audit.js`);
  return r;
}

test("parseCardText reconhece número no formato 'NNN/NNN'", () => {
  const parsed = parseCardText(["Bulbasaur", "001/207", "151"]);
  assert.equal(parsed.nameGuess, "Bulbasaur");
  assert.equal(parsed.numberGuess, "001");
  assert.equal(parsed.totalGuess, "207");
});

test("parseCardText reconhece localId atípico com prefixo de era (DP01)", () => {
  const parsed = parseCardText(["Turtwig", "DP01"]);
  assert.equal(parsed.numberGuess, "DP01");
});

test("parseCardText reconhece localId sem zero-padding", () => {
  const parsed = parseCardText(["Reshiram", "2/25"]);
  assert.equal(parsed.numberGuess, "2");
  assert.equal(parsed.totalGuess, "25");
});

test("rankCandidates: texto limpo com nome+número exatos identifica a carta certa (sv03.5-001)", () => {
  const target = findRecord("sv03.5-001", "en");
  const parsed = parseCardText(["Bulbasaur", "001/207"]);
  // ACHADO REAL (descoberto rodando este teste contra o índice completo):
  // sv03.5-001 em "en" e em "pt" têm o MESMO nome ("Bulbasaur") e o MESMO
  // localId ("001") — "Bulbasaur" não foi traduzido para pt. Rankear contra
  // os 31 registros misturando todos os idiomas de uma vez produz dois
  // candidatos empatados (0.85 cada) e força confirmação manual, o que é
  // correto para um índice sem filtro de idioma, mas não é como o app real
  // deve operar: o índice local de uma sessão de garimpo deve ser escopado
  // ao idioma de catálogo escolhido pelo usuário (ver reports/decision.md).
  // Por isso este teste escopa por idioma, como a aplicação real faria.
  const singleLanguageIndex = allRecords.filter((r) => r.sourceLanguage === "en");
  const { candidates, needsManualConfirmation } = rankCandidates(parsed, singleLanguageIndex, { topN: 3 });

  assert.equal(candidates[0].record.sourceCardId, target.sourceCardId);
  // Sem sinal de expansão extraído, o score máximo possível é 0.85 (peso
  // nome 0.45 + peso número 0.40; o peso de expansão, 0.15, fica a zero).
  // Isso é um resultado real da execução do teste, não um valor escolhido
  // a dedo — documenta que o limiar de "confiança alta" não deve passar de ~0.85
  // quando a expansão não é lida.
  assert.ok(candidates[0].score > 0.8, `score esperado alto, obtido ${candidates[0].score}`);
  assert.equal(needsManualConfirmation, false);
});

test("rankCandidates: mesma espécie em 3 impressões diferentes — número desambigua corretamente", () => {
  // base1-58 (Pikachu vintage), sv03.5-025 (Pikachu 151) e sv03.5-173 (Pikachu 151, illustration rare)
  // têm o MESMO nome. Sem o número, isso é ambíguo de propósito.
  const parsedWithNumber = parseCardText(["Pikachu", "025/207"]);
  const { candidates: withNumber, needsManualConfirmation: ambigWithNumber } = rankCandidates(
    parsedWithNumber,
    allRecords,
    { topN: 5 }
  );
  assert.equal(withNumber[0].record.sourceCardId, "sv03.5-025");
  assert.equal(ambigWithNumber, false);

  const parsedNoNumber = parseCardText(["Pikachu"]);
  const { needsManualConfirmation: ambigNoNumber } = rankCandidates(parsedNoNumber, allRecords, { topN: 5 });
  assert.equal(
    ambigNoNumber,
    true,
    "sem número extraído e com várias impressões homônimas, deve exigir confirmação manual"
  );
});

test("rankCandidates: carta Trainer (sem dexId) ainda é identificável por nome+número", () => {
  const target = findRecord("sv03.5-165", "en"); // "Rigid Band"
  const parsed = parseCardText(["Rigid Band", "165/207"]);
  const { candidates } = rankCandidates(parsed, allRecords, { topN: 3 });
  assert.equal(candidates[0].record.sourceCardId, target.sourceCardId);
  assert.deepEqual(target.dexIds, [], "Trainer não deve ter dexId");
});

test("rankCandidates: texto sem relação com o catálogo não produz falso positivo confiante", () => {
  const parsed = parseCardText(["xyzxyz não é uma carta", "999999"]);
  const { candidates, needsManualConfirmation } = rankCandidates(parsed, allRecords, { topN: 3 });
  assert.equal(needsManualConfirmation, true);
  if (candidates.length > 0) {
    assert.ok(candidates[0].score < 0.6, "nenhum candidato deveria ter score alto para texto sem relação");
  }
});

test("rankCandidates: nome com ruído de OCR (case/acentuação) ainda aproxima o candidato certo", () => {
  const target = findRecord("sv03.5-003", "en"); // "Venusaur ex"
  const parsed = parseCardText(["VENU5AUR EX", "003/207"]); // '5' no lugar de 'S', ruído comum de OCR
  // Escopado a um único idioma pelo mesmo motivo do teste de Bulbasaur acima:
  // "Venusaur ex" (en) e "Venusaur ex" (pt) têm o nome textualmente idêntico.
  const singleLanguageIndex = allRecords.filter((r) => r.sourceLanguage === "en");
  const { candidates } = rankCandidates(parsed, singleLanguageIndex, { topN: 3 });
  assert.equal(candidates[0].record.sourceCardId, target.sourceCardId);
});

test("normalizeCard preserva localId como string (nunca converte para número)", () => {
  const raw = { id: "x", localId: "001", name: "Teste", set: { id: "s" } };
  const normalized = normalizeCard(raw, "en", "x_en.json");
  assert.equal(typeof normalized.localId, "string");
  assert.equal(normalized.localId, "001");
});

test("normalizeCard resolve setSerieId real via mapa set->série (gap da auditoria resolvido)", () => {
  // Requer que `node scripts/build-series-map.js` já tenha sido executado
  // (gera fixtures/catalog/set-series-map.json com dados reais da API).
  const seriesMap = loadSeriesMap();
  assert.ok(seriesMap, "mapa set->série não encontrado — rode scripts/build-series-map.js primeiro");

  const r = findRecord("B2-001", "en"); // "Fantastical Parade" — confirmado TCG Pocket
  assert.equal(r.setSerieId, "tcgp", "B2 deveria resolver para a série tcgp (TCG Pocket)");

  const physicalExample = findRecord("sv03.5-001", "en");
  assert.equal(physicalExample.setSerieId, "sv", "sv03.5 deveria resolver para a série sv (Scarlet & Violet, física)");
});

test("filterPhysicalCards remove cartas de séries digitais (tcgp) e mantém as físicas", () => {
  const seriesMap = loadSeriesMap();
  const filtered = filterPhysicalCards(allRecords, { seriesMap });

  const stillHasTcgp = filtered.some((r) => r.setSerieId === "tcgp");
  assert.equal(stillHasTcgp, false, "nenhum registro tcgp deveria sobrar após o filtro");

  const stillHasBulbasaur = filtered.some((r) => r.sourceCardId === "sv03.5-001" && r.sourceLanguage === "en");
  assert.equal(stillHasBulbasaur, true, "cartas físicas reais não devem ser removidas pelo filtro");

  assert.equal(filtered.length, allRecords.length - 1, "só o registro B2-001 (tcgp) deveria ser removido desta amostra");
});

test("filterPhysicalCards mantém registros com série desconhecida (nunca descarta por falta de mapa)", () => {
  // Construído diretamente com normalizeCard SEM seriesMap, para simular de
  // verdade o cenário "mapa ainda não gerado" (setSerieId fica null) — usar
  // registros de loadFixtureCards() não serve aqui porque ela já resolve o
  // mapa real internamente.
  const semSerieResolvida = [
    normalizeCard({ id: "a", name: "A", set: { id: "sv03.5" } }, "en", "a_en.json", null),
    normalizeCard({ id: "b", name: "B", set: { id: "B2" } }, "en", "b_en.json", null),
  ];
  assert.equal(semSerieResolvida[0].setSerieId, null);
  assert.equal(semSerieResolvida[1].setSerieId, null);

  const filtered = filterPhysicalCards(semSerieResolvida, { seriesMap: null });
  assert.equal(filtered.length, 2, "sem mapa, nenhum registro deve ser descartado (desconhecido != digital)");
});

test("naturalCompare ordena corretamente os formatos reais de localId encontrados na auditoria", () => {
  const ids = ["207", "001", "2", "166", "DP01", "SWSH001", "GG01", "025", "1"];
  const sorted = [...ids].sort(naturalCompare);
  // Numéricos (com ou sem padding) ficam em ordem numérica; "1" e "001" têm
  // o mesmo valor (1) e por isso ficam adjacentes, desempatados pelo padding
  // (sem padding primeiro) — nunca pela conversão da string inteira a número.
  assert.deepEqual(sorted.filter((x) => /^\d+$/.test(x)), ["1", "001", "2", "025", "166", "207"]);
  assert.ok(sorted.includes("DP01") && sorted.includes("SWSH001") && sorted.includes("GG01"));
});

test("naturalCompare nunca converte o localId para inteiro (preserva string original)", () => {
  const ids = ["DP01", "DP02", "DP10"];
  const sorted = [...ids].sort(naturalCompare);
  assert.deepEqual(sorted, ["DP01", "DP02", "DP10"]);
  assert.equal(typeof sorted[0], "string");
});

test("sortByLocalId ordena os registros reais de um mesmo set pela numeração física", () => {
  const sv151 = allRecords.filter((r) => r.setId === "sv03.5" && r.sourceLanguage === "en");
  const sorted = sortByLocalId(sv151);
  const localIds = sorted.map((r) => r.localId);
  // 001 (Bulbasaur) deve vir antes de 003, que deve vir antes de 165, 166, 173, 180, 206, 207.
  assert.ok(localIds.indexOf("001") < localIds.indexOf("003"));
  assert.ok(localIds.indexOf("003") < localIds.indexOf("165"));
  assert.ok(localIds.indexOf("166") < localIds.indexOf("180"));
  assert.ok(localIds.indexOf("180") < localIds.indexOf("206"));
});

test("resolveImageUrl constrói a URL só quando há image base, sem inventar asset", () => {
  const withImage = findRecord("sv03.5-001", "en");
  const url = resolveImageUrl(withImage, "low");
  assert.equal(url, `${withImage.imageBaseUrl}/low.webp`);

  const withoutImage = findRecord("2011bw-1", "en"); // confirmado sem campo image na auditoria
  assert.equal(withoutImage.hasImage, false);
  assert.equal(resolveImageUrl(withoutImage, "low"), null, "sem imageBaseUrl, não deve inventar URL");
});

test("normalizeForComparison remove pontuação, mantendo letras/números/espaços", () => {
  assert.equal(normalizeForComparison("Blaine's Moltres"), "BLAINE S MOLTRES");
  assert.equal(normalizeForComparison("Mr. Mime"), "MR MIME");
  assert.equal(normalizeForComparison("Farfetch'd"), "FARFETCH D");
});

test("rankCandidates: apóstrofo ausente no OCR (comum em fotos reais) ainda aproxima 'Blaine's Moltres'", () => {
  const target = findRecord("gym1-1", "en"); // nome real do catálogo: "Blaine's Moltres"
  // Simula o que o OCR tipicamente devolve: sem apóstrofo, às vezes sem espaço correto.
  const parsed = parseCardText(["Blaines Moltres", "1/132"]);
  const { candidates } = rankCandidates(parsed, allRecords, { topN: 3 });
  assert.equal(candidates[0].record.sourceCardId, target.sourceCardId);
});

test("rankCandidates: carta de categoria Pokemon sem dexId (30th-005) não é tratada como associação completa", () => {
  const target = findRecord("30th-005", "en"); // Tropius, categoria Pokemon, mas SEM dexId na resposta real
  assert.equal(target.category, "Pokemon");
  assert.deepEqual(target.dexIds, [], "confirmado na auditoria: nem toda carta Pokemon tem dexId");

  const parsed = parseCardText(["Tropius", "005/158"]);
  const { candidates } = rankCandidates(parsed, allRecords, { topN: 3 });
  assert.equal(candidates[0].record.sourceCardId, target.sourceCardId);
  assert.deepEqual(
    candidates[0].record.dexIds,
    [],
    "o pipeline não deve inventar uma associação de espécie que a fonte não forneceu"
  );
});

test("rankCandidates: carta sem imagem (2011bw-1) não quebra o fluxo de ranking", () => {
  const target = findRecord("2011bw-1", "en"); // Snivy, sem campo image, promo McDonald's 2011
  assert.equal(target.hasImage, false);
  // Nota: esta carta TEM dexId (495, Snivy) — a auditoria confirmou que a
  // ausência de imagem e a ausência de dexId são lacunas independentes
  // (ver sv03.5-206/207 e swsh12.5gg-GG01 para outras combinações reais).

  const parsed = parseCardText(["Snivy", "1"]);
  const { candidates, needsManualConfirmation } = rankCandidates(parsed, allRecords, { topN: 3 });
  // Não deve lançar excecão nem retornar candidato malformado; o importante
  // aqui é que o pipeline continua funcionando normalmente mesmo com um
  // registro incompleto presente no índice.
  assert.ok(Array.isArray(candidates));
  assert.equal(typeof needsManualConfirmation, "boolean");
});

test("rankCandidates: '001/165' usa o total do set para não misturar cartas de sets não relacionados (achado real de uso)", () => {
  // Achado relatado pelo usuário testando o app de verdade: buscar "001/165"
  // (o número impresso na carta física de Bulbasaur do set 151) retornava
  // várias outras cartas numeradas "001" de sets completamente diferentes
  // (ex.: neo1-1, gym1-1, xy1-1, 2011bw-1 — todos localId "1", sets sem
  // nenhuma relação com 151). "165" é o total oficial do set 151 — deve
  // desambiguar.
  const parsed = parseCardText(["001/165"]);
  const seriesMap = loadSeriesMap();
  const physicalRecords = filterPhysicalCards(allRecords, { seriesMap });
  const { candidates } = rankCandidates(parsed, physicalRecords, { topN: 10 });

  const top = candidates[0];
  assert.equal(top.record.setId, "sv03.5", "o melhor candidato deve ser do set 151 (sv03.5), que tem total 165/207");

  // Cartas de outros sets com o MESMO número "001"/"1" não devem aparecer
  // com crédito de número — devem ficar com score baixo (sem "número e
  // total do set exatos" nem "número exato" nos motivos).
  const unrelated = candidates.filter((c) =>
    ["neo1-1", "gym1-1", "xy1-1", "2011bw-1"].includes(c.record.sourceCardId)
  );
  for (const c of unrelated) {
    assert.ok(
      !c.reasons.includes("número exato") && !c.reasons.includes("número e total do set exatos"),
      `${c.record.sourceCardId} não deveria receber crédito de número só por coincidência de set diferente`
    );
  }
});

test("totalMatches: sem totalGuess não afeta o score (comportamento antigo preservado)", () => {
  const parsed = parseCardText(["Bulbasaur", "001/207"]); // com "/total" desta vez
  assert.equal(parsed.totalGuess, "207");
  const singleLanguageIndex = allRecords.filter((r) => r.sourceLanguage === "en");
  const { candidates } = rankCandidates(parsed, singleLanguageIndex, { topN: 3 });
  assert.equal(candidates[0].record.sourceCardId, "sv03.5-001");
  assert.ok(candidates[0].reasons.includes("número e total do set exatos"));
});

test("achado real: dígito isolado sem letra ('2') NÃO é tratado como número de coleção (evita colidir com cartas erradas)", () => {
  // As três fotos reais testadas (Bulbasaur, Pikachu, Venusaur ex) tinham
  // uma linha curta só com "2" (provável ícone de custo de fuga/HP), que
  // batia por coincidência com o localId "2" de Reshiram (Celebrations) e
  // o colocava acima do candidato certo, mesmo quando o NOME certo já
  // tinha sido lido corretamente em outra linha.
  const parsed = parseCardText(["Bulbasaur", "2", "70"]);
  assert.equal(parsed.numberGuess, null, "dígito isolado sem letra não deve virar numberGuess");

  const singleLanguageIndex = allRecords.filter((r) => r.sourceLanguage === "en");
  const { candidates } = rankCandidates(parsed, singleLanguageIndex, { topN: 3 });
  assert.equal(
    candidates[0].record.sourceCardId,
    "sv03.5-001",
    "Bulbasaur (nome exato) deve vencer mesmo sem sinal de número, não uma carta não relacionada cujo localId coincide com '2'"
  );
});

// Texto OCR REAL, capturado por quem testou o app em um Android físico com
// uma carta física real (Charizard, 22/10/2026) — não é um exemplo
// sintético. "Charizard" só aparece na 2ª linha; a 1ª é ruído de fundo.
const REAL_CHARIZARD_OCR_LINES = [
  "ma Aventura Inesquecível!GEEK-5",
  "Charizard",
  "AblEy",
  "ncdurino",
  "Battle Sense",
  "Royal Blaze",
  "D-170®",
  "100+",
  "THSatLack doe 0 mordamae oeach Leon card in",
  "our discard pil",
  "Vendas nos Útimos 3 meses",
  "nicladeS",
  "mon 2",
  "Comprase dei",
  "lace",
  "+ LE",
];

test("parseCardText: com ruído real antes do nome, 'Charizard' aparece em nameLines mesmo não sendo a 1ª linha", () => {
  const parsed = parseCardText(REAL_CHARIZARD_OCR_LINES);
  assert.ok(parsed.nameLines.includes("Charizard"), "nameLines deveria conter 'Charizard' (2ª linha do texto real)");
  assert.notEqual(parsed.nameGuess, "Charizard", "nameGuess (só para exibição) ainda é a 1ª linha, como antes");
});

test("parseCardText: não extrai 'GEEK-5' nem 'D-170' como número de coleção (achado real)", () => {
  const parsed = parseCardText(REAL_CHARIZARD_OCR_LINES);
  assert.notEqual(parsed.numberGuess, "GEEK-5", "GEEK-5 é ruído de fundo embutido numa frase longa, não um número de coleção");
  assert.notEqual(parsed.numberGuess, "D-170", "D-170 é uma leitura ruidosa do indicador de HP, não um número de coleção");
});

test("rankCandidates: com o texto OCR real e ruidoso, ainda encontra 'Charizard' no índice graças às múltiplas linhas de nome", () => {
  // Charizard não está nas 31 fixtures reais da auditoria (índice pequeno
  // de demonstração desta PoC) — por isso construímos um registro sintético
  // aqui só para provar que a lógica de múltiplas linhas funciona com o
  // texto OCR real. Isso NÃO afirma que o catálogo de produção tem Charizard.
  const charizardRecord = normalizeCard(
    { id: "swsh4-25", localId: "025", name: "Charizard", set: { id: "swsh4", name: "Vivid Voltage" } },
    "en",
    "synthetic_test_only.json"
  );
  const parsed = parseCardText(REAL_CHARIZARD_OCR_LINES);
  const { candidates } = rankCandidates(parsed, [charizardRecord, ...allRecords], { topN: 5 });
  assert.equal(candidates[0].record.sourceCardId, "swsh4-25", "deveria achar Charizard apesar do ruído antes do nome");
});

// Três fotos reais (Android físico, 22/10/2026) de cartas do set "151" que
// ESTÃO no índice de 30 cartas desta PoC — diferente do Charizard acima,
// aqui um match correto era possível de verdade.
const REAL_BULBASAUR_OCR_LINES = [
  "a Aventura Inesquecivel!EE",
  "EEK-5",
  "Bulbasaur",
  "2",
  "„70",
  "Semente Sanguessuga 20",
  "RF Reverse Foil",
  "mon ?",
  "omprased",
  "lace",
];

const REAL_PIKACHU_OCR_LINES = [
  "P Pokédex",
  "DS MA|S ÉPICOS",
  "ATISO Pikachu",
  "Carga",
  "rocure por uma carca de EnergaBsica no seu barlho",
  "Emepuida embaralhe o seu",
  "ligue-a esne",
  "barala",
  "44 Soco Pikachu",
  "2",
  "Produtos",
  "F Foil",
  "50",
  "EPIC",
  "Ion 2",
  "Compras e deixe :",
  "lace",
  "+ LISTA",
];

const REAL_VENUSAUR_OCR_LINES = [
  "DS MAIS ÉPICOS",
  "50",
  "Venusaurex340",
  "Habidade Ho erena",
  "Campa ra",
  "Ernn",
  "2",
  "Chicot0xico Perigoso 150",
  "Vendas nos Ütimos 3 meses",
  "Mais de 50 unidades",
  "EPIC",
  "TIOn ?",
  "omprase deix",
  "lace",
  "LIS",
];

test("achado real (foto 1/3, Bulbasaur): nome exato vence mesmo com ruído e um '2' solto no meio", () => {
  const parsed = parseCardText(REAL_BULBASAUR_OCR_LINES);
  assert.ok(parsed.nameLines.includes("Bulbasaur"));
  assert.equal(parsed.numberGuess, null);

  const singleLanguageIndex = allRecords.filter((r) => r.sourceLanguage === "en");
  const { candidates } = rankCandidates(parsed, singleLanguageIndex, { topN: 3 });
  assert.equal(candidates[0].record.sourceCardId, "sv03.5-001");
});

test("achado real (foto 2/3, Pikachu): nome parcial ('ATISO Pikachu') ainda identifica a carta certa", () => {
  const parsed = parseCardText(REAL_PIKACHU_OCR_LINES);
  const singleLanguageIndex = allRecords.filter((r) => r.sourceLanguage === "en");
  const { candidates } = rankCandidates(parsed, singleLanguageIndex, { topN: 5 });
  // Há 3 impressões de Pikachu no índice (base1-58, sv03.5-025, sv03.5-173);
  // sem um número confiável, qualquer uma delas é uma resposta aceitável —
  // o importante é que NENHUMA carta não relacionada (ex.: Reshiram) vença.
  assert.equal(candidates[0].record.name, "Pikachu");
});

test("achado real (foto 3/3, Venusaur ex): nome ruidoso ('Venusaurex340') ainda identifica a carta certa", () => {
  const parsed = parseCardText(REAL_VENUSAUR_OCR_LINES);
  const singleLanguageIndex = allRecords.filter((r) => r.sourceLanguage === "en");
  const { candidates } = rankCandidates(parsed, singleLanguageIndex, { topN: 3 });
  assert.equal(candidates[0].record.sourceCardId, "sv03.5-003");
});
