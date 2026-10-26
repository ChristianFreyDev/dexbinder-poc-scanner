/**
 * Validação pura de entrada ao criar/editar um fichário (especificação da
 * Entrega 2, seção 4.2: "name — obrigatório, com espaços removidos nas
 * pontas"; seção 7.1: grade dentro dos limites seguros de UI).
 */
const { isValidGridDimensions } = require("./gridLayout");

const COLLECTION_TYPES = ["pokedex", "expansion", "custom"];
const CREATION_MODES = ["automatic", "manual"];

function validateCollectionInput({ name, collectionType, creationMode, columnsPerPage, rowsPerPage }) {
  const errors = {};
  const trimmedName = (name ?? "").trim();
  if (!trimmedName) errors.name = "Nome é obrigatório.";
  if (collectionType && !COLLECTION_TYPES.includes(collectionType)) errors.collectionType = "Tipo de fichário inválido.";
  if (creationMode && !CREATION_MODES.includes(creationMode)) errors.creationMode = "Modo de criação inválido.";
  if (columnsPerPage != null && rowsPerPage != null && !isValidGridDimensions(columnsPerPage, rowsPerPage)) {
    errors.grid = "Grade inválida (colunas e linhas devem ser inteiros de 1 a 10).";
  }
  return { valid: Object.keys(errors).length === 0, errors, trimmedName };
}

module.exports = { validateCollectionInput, COLLECTION_TYPES, CREATION_MODES };
