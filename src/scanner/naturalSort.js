/**
 * Ordenação natural de `localId`, exigida pela especificação (seção 17.2):
 * "implementar ordenação natural que compare segmentos numéricos quando
 * possível e mantenha fallback textual. Nunca converter o identificador
 * bruto para inteiro."
 *
 * Formatos reais confirmados na auditoria (reports/catalog-audit.md,
 * achado 4): "001", "1", "2", "DP01", "SWSH001", "GG01". Este módulo não
 * converte a string inteira para número em nenhum momento — só compara
 * segmentos numéricos extraídos dela, preservando o valor original em
 * todo o pipeline (o `localId` do registro nunca é mutado).
 */

/** Divide uma string em segmentos alternados de dígitos e não-dígitos. */
function splitSegments(value) {
  const str = String(value ?? "");
  return str.match(/\d+|\D+/g) || [];
}

/**
 * Compara duas strings de forma "natural": segmentos numéricos são
 * comparados pelo valor numérico (sem perder o texto original em nenhum
 * outro lugar do sistema — isso é só para ORDENAR), segmentos textuais são
 * comparados lexicograficamente. Quando os tipos de segmento divergem no
 * mesmo ponto, cai para comparação textual (fallback), nunca lança erro.
 */
function naturalCompare(a, b) {
  const segA = splitSegments(a);
  const segB = splitSegments(b);
  const len = Math.max(segA.length, segB.length);

  for (let i = 0; i < len; i++) {
    const partA = segA[i];
    const partB = segB[i];

    if (partA === undefined) return -1;
    if (partB === undefined) return 1;

    const aIsNumeric = /^\d+$/.test(partA);
    const bIsNumeric = /^\d+$/.test(partB);

    if (aIsNumeric && bIsNumeric) {
      // Comparação numérica por segmento, sem converter a string inteira:
      // segmentos razoavelmente curtos (localId não passa de poucos dígitos
      // nas amostras reais), então Number() é seguro aqui.
      const diff = Number(partA) - Number(partB);
      if (diff !== 0) return diff;
      // Mesmo valor numérico mas padding diferente (ex.: "01" vs "1"):
      // desempate textual estável, sem perder a distinção entre os dois.
      if (partA !== partB) return partA.length - partB.length;
      continue;
    }

    if (partA !== partB) return partA < partB ? -1 : 1;
  }

  return 0;
}

/** Ordena uma lista de registros do índice pelo campo `localId`, sem mutar os originais. */
function sortByLocalId(records) {
  return [...records].sort((a, b) => naturalCompare(a.localId, b.localId));
}

module.exports = { naturalCompare, sortByLocalId, splitSegments };
