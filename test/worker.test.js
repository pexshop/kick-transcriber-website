import test from "node:test";
import assert from "node:assert/strict";
import { stamp } from "../worker.js";

test("formats timestamps with hours, minutes and fractional seconds", () => {
  assert.equal(stamp(0), "0:00:00.00");
  assert.equal(stamp(65.25), "0:01:05.25");
  assert.equal(stamp(3661.5), "1:01:01.50");
});