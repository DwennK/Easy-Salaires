import { describe, expect, it } from "vitest";
import legacy from "./fixtures/data/model-v1.json";
import type { State } from "../src/domain/types";
import { upgradeState } from "../src/domain/service";
import { DATA_MODEL_VERSION } from "../src/domain/data-format";
import { readFileSync, readdirSync } from "node:fs";

const fixtures = readdirSync("tests/fixtures/data").filter((name) =>
  /^model-v\d+\.json$/.test(name),
);

const fixture = () => structuredClone(legacy) as unknown as State;

describe("frozen historical payroll format", () => {
  it.each(fixtures)(
    "opens and upgrades %s while preserving archives and payments",
    (name) => {
      const state: State = JSON.parse(
        readFileSync(`tests/fixtures/data/${name}`, "utf8"),
      );
      const before = structuredClone(state);
      upgradeState(state);
      expect(state.dataModel).toBe(DATA_MODEL_VERSION);
      expect(state.revisions).toEqual(before.revisions);
      expect(state.exports.map((x) => x.data)).toEqual(
        before.exports.map((x) => x.data),
      );
      for (const payroll of before.payrolls) {
        const after = state.payrolls.find((p) => p.id === payroll.id)!;
        expect(after.paidDate).toBe(payroll.paidDate);
        expect(after.paidAmount).toBe(
          payroll.paidAmount ?? (payroll.paidDate ? payroll.result.net : null),
        );
      }
      const upgraded = structuredClone(state);
      upgradeState(state);
      expect(state).toEqual(upgraded);
    },
  );
  it("upgrades payments and monthly exceptions without rewriting archives", () => {
    const state = fixture();
    const original = structuredClone(state);
    upgradeState(state);
    expect(state.dataModel).toBe(DATA_MODEL_VERSION);
    expect(state.company.modelVersion).toBe(DATA_MODEL_VERSION);
    expect(state.revisions).toEqual(original.revisions);
    expect(state.exports.map((x) => x.data)).toEqual(
      original.exports.map((x) => x.data),
    );
    expect(state.payrolls[0]!.paidDate).toBe(original.payrolls[0]!.paidDate);
    expect(state.payrolls[0]!.paidAmount).toBe(
      original.payrolls[0]!.result.net,
    );
    expect(state.payrolls[0]!.termOverrides?.salary).toBe("6100");
    const once = structuredClone(state);
    upgradeState(state);
    expect(state).toEqual(once);
  });

  it.each(["dataModel", "modelVersion"])(
    "rejects a future %s without mutations",
    (key) => {
      const state = fixture();
      if (key === "dataModel") state.dataModel = DATA_MODEL_VERSION + 1;
      else state.company.modelVersion = DATA_MODEL_VERSION + 1;
      const before = structuredClone(state);
      expect(() => upgradeState(state)).toThrow("incompatibleDatabase");
      expect(state).toEqual(before);
    },
  );

  it("checks both markers even when the other marker is already current", () => {
    const state = fixture();
    state.dataModel = DATA_MODEL_VERSION;
    state.company.modelVersion = DATA_MODEL_VERSION + 1;
    expect(() => upgradeState(state)).toThrow("incompatibleDatabase");
  });
});
