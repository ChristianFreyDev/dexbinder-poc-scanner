/**
 * Lógica pura de grade/posição física (especificação da Entrega 2, seção 7):
 * modelos predefinidos (1×1, 2×2, 3×3, 4×3, 5×4) + grade personalizada
 * (1–10 colunas × 1–10 linhas, limite seguro de UI). Nomenclatura sempre
 * "colunas × linhas"; `page_number`/`slot_index` são inteiros de BASE 1.
 */

const MIN_DIMENSION = 1;
const MAX_DIMENSION = 10;

const GRID_PRESETS = [
  { columns: 1, rows: 1, label: "1×1" },
  { columns: 2, rows: 2, label: "2×2" },
  { columns: 3, rows: 3, label: "3×3" },
  { columns: 4, rows: 3, label: "4×3" },
  { columns: 5, rows: 4, label: "5×4" },
];

const DEFAULT_GRID = { columns: 3, rows: 3 };

function isValidGridDimensions(columns, rows) {
  return (
    Number.isInteger(columns) &&
    Number.isInteger(rows) &&
    columns >= MIN_DIMENSION &&
    columns <= MAX_DIMENSION &&
    rows >= MIN_DIMENSION &&
    rows <= MAX_DIMENSION
  );
}

function computeCapacity(columns, rows) {
  return columns * rows;
}

function isValidSlotIndex(slotIndex, columns, rows) {
  if (!Number.isInteger(slotIndex)) return false;
  return slotIndex >= 1 && slotIndex <= computeCapacity(columns, rows);
}

/** Posição visual (1-based) de um slotIndex dentro de uma página com `columns` colunas. */
function slotIndexToRowCol(slotIndex, columns) {
  const zeroBased = slotIndex - 1;
  return { row: Math.floor(zeroBased / columns) + 1, col: (zeroBased % columns) + 1 };
}

/**
 * Prévia do impacto de mudar a grade de um fichário (especificação, seção
 * 7.3): se a nova capacidade por página for MENOR, cópias que ocupavam um
 * slot agora inválido (slotIndex > nova capacidade) precisam de decisão do
 * usuário antes de aplicar — nunca descartadas/sobrescritas silenciosamente.
 *
 * @param {Array<{id, pageNumber, slotIndex}>} copies cópias atualmente posicionadas (collection_id já filtrado pelo chamador)
 * @param {number} newColumns
 * @param {number} newRows
 * @returns {{ newCapacity: number, affectedCopies: Array, safe: boolean }}
 */
function previewGridResizeImpact(copies, newColumns, newRows) {
  const newCapacity = computeCapacity(newColumns, newRows);
  const affectedCopies = copies.filter(
    (c) => c.pageNumber != null && c.slotIndex != null && c.slotIndex > newCapacity
  );
  return { newCapacity, affectedCopies, safe: affectedCopies.length === 0 };
}

module.exports = {
  MIN_DIMENSION,
  MAX_DIMENSION,
  GRID_PRESETS,
  DEFAULT_GRID,
  isValidGridDimensions,
  computeCapacity,
  isValidSlotIndex,
  slotIndexToRowCol,
  previewGridResizeImpact,
};
