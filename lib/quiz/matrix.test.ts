import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  matrixShapeFromAnswerKey,
  parseWholeMatrixResponse,
  resolveMatrixShape,
  serializeWholeMatrix,
} from "./matrix.js";

describe("matrixShapeFromAnswerKey", () => {
  it("reads matrix_whole dimensions from answer key", () => {
    assert.deepEqual(
      matrixShapeFromAnswerKey(
        "matrix_whole",
        JSON.stringify({ matrix: [[1, 2, 3], [4, 5, 6]] })
      ),
      { rows: 2, cols: 3 }
    );
  });

  it("reads matrix_per_cell dimensions from cell keys", () => {
    assert.deepEqual(
      matrixShapeFromAnswerKey(
        "matrix_per_cell",
        JSON.stringify({ cells: { "0,0": 1, "2,1": 9 } })
      ),
      { rows: 3, cols: 2 }
    );
  });
});

describe("resolveMatrixShape", () => {
  it("prefers answer key dimensions over choices config", () => {
    const shape = resolveMatrixShape(
      "matrix_whole",
      JSON.stringify({ matrix: [[1], [2], [3]] }),
      { rows: 2, cols: 2 }
    );
    assert.equal(shape.rows, 3);
    assert.equal(shape.cols, 1);
  });
});

describe("whole matrix response serialization", () => {
  it("round-trips through parse and serialize", () => {
    const grid = [["1", "2"], ["3", "4"]];
    const serialized = serializeWholeMatrix(grid);
    assert.equal(serialized, "[[1,2],[3,4]]");
    assert.deepEqual(parseWholeMatrixResponse(serialized, 2, 2), grid);
  });
});
