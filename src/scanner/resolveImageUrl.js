/**
 * Resolve a URL de imagem de um registro do catálogo.
 *
 * Achado real da auditoria (reports/catalog-audit.md, achado 5): o campo
 * `image` da API TCGdex é só a BASE da URL — é preciso concatenar
 * qualidade+extensão (`/high.webp`, `/low.webp`) para obter um asset real.
 * Quando `image` está ausente, a URL "convencional" retorna HTTP 404 de
 * verdade (confirmado nos casos `2011bw-1` e `swsh12.5gg-GG01`) — por isso
 * esta função NUNCA fabrica uma URL quando não há base real.
 *
 * @param {{ imageBaseUrl: string|null, hasImage: boolean }} record
 * @param {"low"|"high"} quality
 * @returns {string|null}
 */
function resolveImageUrl(record, quality = "low") {
  if (!record || !record.imageBaseUrl) return null;
  return `${record.imageBaseUrl}/${quality}.webp`;
}

module.exports = { resolveImageUrl };
