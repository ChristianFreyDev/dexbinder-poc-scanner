/**
 * Identidade estável de uma IMPRESSÃO de carta (especificação da Entrega 2,
 * seção 4.3): `variantId` do TCGdex não é confiável e IDs de set podem
 * divergir entre idiomas (achados reais documentados em
 * reports/catalog-audit.md e reports/delivery-1.md). `catalog_card_key` é
 * gerada aqui, centralizada e testada, a partir de provider + idioma + ID
 * externo da carta + set externo + localId (texto) — nunca o `variantId`.
 *
 * Serialização delimitada (não concatenação ingênua com hífen): os
 * componentes reais já contêm hífen (ex.: `source_card_id` "sv03.5-001",
 * `source_set_id` "sv03.5"), então um delimitador "|" sozinho ainda corre
 * risco de colisão SE algum componente contivesse "|" — por isso cada
 * segmento tem "\" e "|" escapados antes de juntar, igual um CSV com escape
 * manual. Isso garante que dois conjuntos de entrada diferentes nunca podem
 * produzir a mesma chave serializada.
 */

const DELIMITER = "|";

function escapeSegment(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

/**
 * @param {{ provider?: string, sourceLanguage: string, sourceCardId: string, sourceSetId?: string|null, localId?: string|null }} identity
 * @returns {string}
 */
function buildCatalogCardKey({ provider = "tcgdex", sourceLanguage, sourceCardId, sourceSetId = null, localId = null }) {
  if (!sourceLanguage) throw new Error("buildCatalogCardKey: sourceLanguage é obrigatório");
  if (!sourceCardId) throw new Error("buildCatalogCardKey: sourceCardId é obrigatório");
  return [provider, sourceLanguage, sourceCardId, sourceSetId ?? "", localId != null ? String(localId) : ""]
    .map(escapeSegment)
    .join(DELIMITER);
}

/** A partir de um registro do catálogo (ver src/storage/catalogRowMapping.js) — mesmos campos, nomes diferentes. */
function buildCatalogCardKeyFromRecord(record) {
  return buildCatalogCardKey({
    sourceLanguage: record.sourceLanguage,
    sourceCardId: record.sourceCardId,
    sourceSetId: record.setId,
    localId: record.localId,
  });
}

/** Desserializa uma chave gerada por buildCatalogCardKey (uso: exibir/depurar, nunca para decidir identidade por partes soltas). */
function parseCatalogCardKey(key) {
  const segments = [];
  let current = "";
  let escaped = false;
  for (const ch of String(key ?? "")) {
    if (escaped) {
      current += ch;
      escaped = false;
    } else if (ch === "\\") {
      escaped = true;
    } else if (ch === DELIMITER) {
      segments.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  segments.push(current);
  const [provider, sourceLanguage, sourceCardId, sourceSetId, localId] = segments;
  return {
    provider,
    sourceLanguage,
    sourceCardId,
    sourceSetId: sourceSetId || null,
    localId: localId || null,
  };
}

module.exports = { buildCatalogCardKey, buildCatalogCardKeyFromRecord, parseCatalogCardKey };
