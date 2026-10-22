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

// Número de colecionador: "123/207", "001", "DP01", "SWSH 001", "GG-01", "1"
const COLLECTOR_NUMBER_PATTERN = /\b([A-Z]{1,5}[\s-]?\d{1,4}|\d{1,4})\s*\/?\s*(\d{1,4})?\b/;

/**
 * Extrai candidatos a nome, número de colecionador e expansão a partir de
 * blocos de texto do OCR. Mantém o texto bruto para depuração local.
 *
 * @param {string[]} rawTextBlocks - linhas/blocos devolvidos pelo OCR
 * @returns {{
 *   rawText: string,
 *   normalizedText: string,
 *   nameGuess: string|null,
 *   numberGuess: string|null,
 *   totalGuess: string|null,
 *   setAbbreviationGuess: string|null,
 * }}
 */
function parseCardText(rawTextBlocks) {
  const blocks = (rawTextBlocks || []).filter(Boolean);
  const rawText = blocks.join("\n");
  const normalizedText = normalizeForComparison(rawText);

  // Heurística simples para a PoC: a primeira linha "significativa" (letras,
  // não apenas números/símbolos) tende a ser o nome da carta na maioria dos
  // layouts físicos. Isso é uma heurística de PoC, não uma regra validada
  // com fotos reais (ver limitação no relatório de decisão).
  const nameLine = blocks.find((line) => /[A-Za-zÀ-ÿ]{2,}/.test(line) && !/^\d+\/\d+$/.test(line.trim()));
  const nameGuess = nameLine ? nameLine.trim() : null;

  let numberGuess = null;
  let totalGuess = null;
  for (const line of blocks) {
    const m = line.match(/([A-Za-z]{0,5}\s?\d{1,4})\s*\/\s*(\d{1,4})/);
    if (m) {
      numberGuess = m[1].replace(/\s+/g, "");
      totalGuess = m[2];
      break;
    }
  }
  if (!numberGuess) {
    for (const line of blocks) {
      const m = line.match(COLLECTOR_NUMBER_PATTERN);
      if (m && m[0].trim() !== nameGuess) {
        numberGuess = m[1].replace(/\s+/g, "").toUpperCase();
        break;
      }
    }
  }

  // Sigla de expansão: tokens curtos em maiúsculas isolados (ex.: "SV03.5", "TG", "GG")
  const setAbbrLine = blocks.find((line) => /^[A-Z]{2,6}[\d.]*$/.test(line.trim()));
  const setAbbreviationGuess = setAbbrLine ? setAbbrLine.trim() : null;

  return {
    rawText,
    normalizedText,
    nameGuess,
    numberGuess,
    totalGuess,
    setAbbreviationGuess,
  };
}

module.exports = { parseCardText, normalizeForComparison };
