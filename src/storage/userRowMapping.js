/**
 * Lógica pura (sem I/O): mapeia linhas cruas das tabelas pessoais
 * (user_collections, checklist_items, owned_card_copies, card_species_links)
 * para os objetos camelCase usados pelo domínio/repositórios — mesma
 * convenção de src/storage/catalogRowMapping.js.
 */

function mapCollectionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    collectionType: row.collection_type,
    creationMode: row.creation_mode,
    sourceSetId: row.source_set_id ?? null,
    sourceLanguage: row.source_language ?? null,
    languagePolicy: row.language_policy ?? null,
    checklistScope: row.checklist_scope ?? null,
    organizationMode: row.organization_mode,
    columnsPerPage: row.columns_per_page,
    rowsPerPage: row.rows_per_page,
    sortMode: row.sort_mode,
    isArchived: Boolean(row.is_archived),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null,
  };
}

function mapChecklistItemRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    collectionId: row.collection_id,
    targetType: row.target_type,
    nationalDexNumber: row.national_dex_number ?? null,
    catalogCardKey: row.catalog_card_key ?? null,
    targetLabelSnapshot: row.target_label_snapshot ?? null,
    targetSetSnapshot: row.target_set_snapshot ?? null,
    targetNumberSnapshot: row.target_number_snapshot ?? null,
    targetLanguageSnapshot: row.target_language_snapshot ?? null,
    sortOrder: row.sort_order,
    requiredQuantity: row.required_quantity,
    source: row.source,
    isExcluded: Boolean(row.is_excluded),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOwnedCopyRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    catalogCardKey: row.catalog_card_key,
    provider: row.provider,
    sourceLanguage: row.source_language,
    sourceCardId: row.source_card_id,
    sourceSetId: row.source_set_id ?? null,
    localId: row.local_id != null ? String(row.local_id) : null,
    cardNameSnapshot: row.card_name_snapshot ?? null,
    setNameSnapshot: row.set_name_snapshot ?? null,
    imageBaseUrlSnapshot: row.image_base_url_snapshot ?? null,
    collectionId: row.collection_id ?? null,
    pageNumber: row.page_number ?? null,
    slotIndex: row.slot_index ?? null,
    checklistItemId: row.checklist_item_id ?? null,
    finishVariant: row.finish_variant ?? null,
    conditionCode: row.condition_code ?? null,
    acquiredAt: row.acquired_at ?? null,
    purchasePrice: row.purchase_price ?? null,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null,
  };
}

function mapSpeciesLinkRow(row) {
  if (!row) return null;
  return {
    catalogCardKey: row.catalog_card_key,
    nationalDexNumber: row.national_dex_number,
    associationStatus: row.association_status,
    associationSource: row.association_source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = { mapCollectionRow, mapChecklistItemRow, mapOwnedCopyRow, mapSpeciesLinkRow };
