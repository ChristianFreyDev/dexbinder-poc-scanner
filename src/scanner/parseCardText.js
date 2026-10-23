/**
 * Normalização e extração de sinais a partir do texto bruto devolvido pelo OCR.
 * Função pura, sem dependência de câmera/OCR/React Native — testável isoladamente
 * (ver scripts/run-matching-tests.js).
 *
 * Os formatos de `localId` abaixo foram confirmados com dados REAIS da auditoria
 * de catálogo (reports/catalog-audit.md, achado 4):
 *   - zero-padded numérico: "001"
 *   - numérico sem padding: "1", "2"
 *   - prefixo de era: "DP01", "SWSH001"
 *   - prefixo de subset: "GG01"
 * O formato "SVP 001" citado na especificação (com espaço) NÃO apareceu nas
 * amostras reais testadas (a amostra svp real usa "004" sem espaço/prefixo),
 * mas o regex abaixo aceita variantes com espaço/hífen para não quebrar caso
 * uma carta física realmente imprima esse formato.
 */

/**
 * Normaliza texto para COMPARAÇÃO (nunca para exibição): maiúsculas, sem
 * acentos e sem pontuação. Usado só por nameSimilarity() em rankCandidates
 * — o `rawText` original (com acentos/pontuação) é sempre preservado em
 * `parseCardText()` para depuração, conforme a especificação pede.
 */
function normalizeForComparison(text) {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .toUpperCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // remove pontuação (apóstrofos, pontos, hífens...)
    .replace(/\s+/g, " ")
    .trim();
}

// Número de colecionador SEM barra, exige prefixo de letra(s): "DP01",
// "SWSH 001". Achados reais (três fotos de cartas físicas diferentes,
// 22/10/2026): um dígito isolado como "2" aparece em QUALQUER carta
// (custo de fuga, multiplicador de fraqueza, fragmento de HP) e não é um
// sinal confiável de número de coleção — nos três testes, um "2" solto
// bateu por coincidência com `localId` de uma carta errada (Reshiram,
// Celebrations #2) e a superou em pontuação mesmo quando o NOME certo já
// tinha sido lido em outra linha. Por isso o fallback sem barra exige
// prefixo de letra(s); dígitos isolados só contam via o padrão "NNN/NNN"
// abaixo, que é inequívoco. Um hífen entre letra(s) e número também não é
// aceito aqui (ex.: "D-170®" = leitura ruidosa de "HP 170", não um número
// de coleção — nenhum número real observado na auditoria usa hífen).
const COLLECTOR_NUMBER_PATTERN = /\b([A-Z]{1,5}\s?\d{1,4})\b/;

/**
 * Extrai candidatos a nome e número de colecionador a partir de blocos de
 * texto do OCR. Mantém o texto bruto (`normalizedText`) para depuração
 * local e para rankCandidates.js buscar o código de expansão impresso
 * (ver setPrintedCode em catalogFixtures.js) — colado perto do número, não
 * extraível como uma linha isolada, por isso não é tratado aqui.
 *
 * Achado real (foto de carta física real, Charizard, 22/10/2026): o OCR
 * muitas vezes devolve uma linha de RUÍDO (texto de fundo, overlay, etc.)
 * ANTES do nome de verdade da carta — "Charizard" apareceu como a 2ª linha,
 * não a 1ª. Por isso `nameLines` traz TODAS as linhas plausíveis como nome
 * (não só uma "melhor escolha"), para que rankCandidates() teste cada uma
 * contra o catálogo em vez de confiar cegamente na posição da linha.
 * `nameGuess` continua existindo só para exibição (a 1ª linha plausível).
 *
 * Mesmo achado real expôs uma falsa extração de número: a linha "D-170®"
 * (leitura ruidosa do indicador de HP "HP 170") e "GEEK-5" (ruído de fundo)
 * batiam com o padrão solto de número de coleção. Por isso o fallback sem
 * barra só aceita uma linha CURTA e dominada pelo próprio número — números
 * de coleção reais aparecem sozinhos numa linha pequena, não embutidos em
 * frases longas.
 *
 * Achado real adicional (segunda rodada de fotos, mesmo dia): quando o OCR
 * roda em múltiplos recortes (cabeçalho/foto inteira/rodapé), o MESMO
 * número às vezes aparece lido de duas formas diferentes em linhas
 * distintas — uma correta, outra com um erro de leitura (ex.: o final "5"
 * de "165" lido como a letra "S", virando "16S"). Pegar só a PRIMEIRA
 * leitura encontrada descartava a correta quando ela vinha depois. Por
 * isso `numberCandidates` guarda TODAS as combinações número/total lidas
 * nas linhas, e rankCandidates() testa todas, não só a primeira.
 *
 * @param {string[]} rawTextBlocks - linhas/blocos devolvidos pelo OCR
 * @returns {{
 *   rawText: string,
 *   normalizedText: string,
 *   nameGuess: string|null,
 *   nameLines: string[],
 *   numberGuess: string|null,
 *   totalGuess: string|null,
 *   numberCandidates: Array<{ number: string, total: string|null }>,
 * }}
 */
function parseCardText(rawTextBlocks) {
  const blocks = (rawTextBlocks || []).filter(Boolean);
  const rawText = blocks.join("\n");
  const normalizedText = normalizeForComparison(rawText);

  // Todas as linhas plausíveis como nome (têm letras, não são só um número
  // de coleção isolado). Mantém a ordem original; rankCandidates() decide
  // qual delas de fato bate com o catálogo.
  const nameLines = blocks.map((l) => l.trim()).filter((line) => /[A-Za-zÀ-ÿ]{2,}/.test(line) && !/^\d+\/\d+$/.test(line));
  const nameGuess = nameLines.length > 0 ? nameLines[0] : null;

  // Achados reais (fotos físicas, 22/10/2026): o OCR às vezes lê o zero do
  // número como a letra "o" minúscula ("o25/165"), e o "5" final de um
  // total como a letra "S" ("16S" em vez de "165") — corrigido convertendo
  // O/o para 0 e S para 5 quando colados a dígitos, só para reconhecer o
  // número, nunca para o texto bruto exibido.
  const fixOcrDigitConfusion = (s) =>
    s.replace(/([Oo])(?=\d)|(?<=\d)([Oo])/g, "0").replace(/(S)(?=\d)|(?<=\d)(S)/g, "5");

  const numberCandidates = [];
  for (const line of blocks) {
    // Achado real: uma palavra de ruído antes do número (ex.: "GWEN
    // 001/165") era incluída como se fosse parte dele — por isso o padrão
    // de número com barra não aceita prefixo de letras, só dígitos.
    const digitsOnly = fixOcrDigitConfusion(line);
    const m = digitsOnly.match(/(\d{1,4})\s*\/\s*(\d{1,4})/);
    if (m) {
      numberCandidates.push({ number: m[1], total: m[2] });
    }
  }
  if (numberCandidates.length === 0) {
    for (const line of blocks) {
      const trimmed = line.trim();
      // Só aceita se a linha for curta e o próprio número já ocupar a maior
      // parte dela — evita capturar "GEEK-5"/"D-170®" de dentro de frases.
      if (trimmed.length > 10) continue;
      const m = trimmed.match(COLLECTOR_NUMBER_PATTERN);
      if (m && m[0].length >= trimmed.length * 0.7) {
        numberCandidates.push({ number: m[1].replace(/\s+/g, "").toUpperCase(), total: null });
      }
    }
  }
  const numberGuess = numberCandidates.length > 0 ? numberCandidates[0].number : null;
  const totalGuess = numberCandidates.length > 0 ? numberCandidates[0].total : null;

  return {
    rawText,
    normalizedText,
    nameGuess,
    nameLines,
    numberGuess,
    totalGuess,
    numberCandidates,
  };
}

module.exports = { parseCardText, normalizeForComparison };
