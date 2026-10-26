/**
 * Testes reais (node:test) de src/domain/gridLayout.js.
 * Executar: node --test scripts/run-grid-layout-tests.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  GRID_PRESETS,
  isValidGridDimensions,
  computeCapacity,
  isValidSlotIndex,
  slotIndexToRowCol,
  previewGridResizeImpact,
} = require("../src/domain/gridLayout");

test("presets predefinidos batem com a especificação (1x1, 2x2, 3x3, 4x3, 5x4)", () => {
  const labels = GRID_PRESETS.map((p) => p.label);
  assert.deepEqual(labels, ["1×1", "2×2", "3×3", "4×3", "5×4"]);
});

test("isValidGridDimensions aceita 1..10 em cada dimensão", () => {
  assert.equal(isValidGridDimensions(1, 1), true);
  assert.equal(isValidGridDimensions(10, 10), true);
  assert.equal(isValidGridDimensions(0, 5), false);
  assert.equal(isValidGridDimensions(5, 11), false);
  assert.equal(isValidGridDimensions(3.5, 3), false);
});

test("computeCapacity multiplica colunas x linhas", () => {
  assert.equal(computeCapacity(4, 3), 12);
});

test("isValidSlotIndex respeita a capacidade da grade (base 1)", () => {
  assert.equal(isValidSlotIndex(1, 3, 3), true);
  assert.equal(isValidSlotIndex(9, 3, 3), true);
  assert.equal(isValidSlotIndex(10, 3, 3), false);
  assert.equal(isValidSlotIndex(0, 3, 3), false);
});

test("slotIndexToRowCol calcula posição visual 1-based", () => {
  assert.deepEqual(slotIndexToRowCol(1, 3), { row: 1, col: 1 });
  assert.deepEqual(slotIndexToRowCol(3, 3), { row: 1, col: 3 });
  assert.deepEqual(slotIndexToRowCol(4, 3), { row: 2, col: 1 });
});

test("previewGridResizeImpact: aumentar a grade nunca afeta cópias existentes", () => {
  const copies = [{ id: "a", pageNumber: 1, slotIndex: 9 }];
  const result = previewGridResizeImpact(copies, 5, 4);
  assert.equal(result.safe, true);
  assert.equal(result.affectedCopies.length, 0);
});

test("previewGridResizeImpact: diminuir a grade aponta as cópias que ficariam fora da nova capacidade", () => {
  const copies = [
    { id: "a", pageNumber: 1, slotIndex: 9 },
    { id: "b", pageNumber: 1, slotIndex: 2 },
  ];
  const result = previewGridResizeImpact(copies, 2, 2); // nova capacidade = 4
  assert.equal(result.newCapacity, 4);
  assert.equal(result.safe, false);
  assert.deepEqual(result.affectedCopies.map((c) => c.id), ["a"]);
});

test("previewGridResizeImpact: cópia sem posição (aguardando organização) nunca é afetada", () => {
  const copies = [{ id: "a", pageNumber: null, slotIndex: null }];
  const result = previewGridResizeImpact(copies, 1, 1);
  assert.equal(result.safe, true);
});
