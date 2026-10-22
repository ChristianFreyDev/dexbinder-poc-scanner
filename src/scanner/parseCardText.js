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

// Número de colecionador: "123/207", "001", "DP01", "SWSH 001", "1".
// Achado real: um hífen entre letra(s) e número costuma ser outra coisa
// lida com ruído (ex.: "D-170®" = leitura ruidosa do indicador de HP
// "HP 170", não um número de coleção) — por isso só espaço é aceito como
// separador aqui, nunca hífen. Nenhum número de coleção real observado na
// auditoria de catálogo usa hífen entre prefixo e dígitos.
const COLLECTOR_NUMBER_PATTERN = /\b([A-Z]{1,5}\s?\d{1,4}|\d{1,4})\s*\/?\s*(\d{1,4})?\b/;

/**
 * Extrai candidatos a nome, número de colecionador e expansão a partir de
 * blocos de texto do OCR. Mantém o texto bruto para depuração local.
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
 * @param {string[]} rawTextBlocks - linhas/blocos devolvidos pelo OCR
 * @returns {{
 *   rawText: string,
 *   normalizedText: string,
 *   nameGuess: string|null,
 *   nameLines: string[],
 *   numberGuess: string|null,
 *   totalGuess: string|null,
 *   setAbbreviationGuess: string|null,
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
      const trimmed = line.trim();
      // Só aceita se a linha for curta e o próprio número já ocupar a maior
      // parte dela — evita capturar "GEEK-5"/"D-170®" de dentro de frases.
      if (trimmed.length > 10) continue;
      const m = trimmed.match(COLLECTOR_NUMBER_PATTERN);
      if (m && m[0].length >= trimmed.length * 0.7) {
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
    nameLines,
    numberGuess,
    totalGuess,
    setAbbreviationGuess,
  };
}

module.exports = { parseCardText, normalizeForComparison };
