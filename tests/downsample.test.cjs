const test = require("node:test");
const assert = require("node:assert/strict");
const { downsample } = require("../electron/downsample.cjs");

test("chart reduction preserves ends and a missing-data break", () => {
  const points = Array.from({ length: 10000 }, (_, index) => ({ at: String(index), value: index, segment: 0 }));
  points[5001] = { at: "5001", value: null, segment: 1 };
  points[5002] = { at: "5002", value: 5002, segment: 1 };
  const result = downsample(points, 1000);
  assert.ok(result.length <= 1005);
  assert.equal(result[0], points[0]);
  assert.equal(result.at(-1), points.at(-1));
  assert.ok(result.includes(points[5001]));
  assert.ok(result.includes(points[5002]));
});
