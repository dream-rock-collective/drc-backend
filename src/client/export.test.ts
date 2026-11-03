import { describe, expect, test } from "bun:test";
import { defaultExportSelection, filterExportRegistrations, parseExportSelection, registrationsCsv } from "./export";
import type { Registration } from "./types";

const registration: Registration = {
  id: 1, name: 'River "Rock", Jr.', email: "river@example.com",
  address: "123 Main St\nUnit 2", birthday: null, notes: null,
  stripe_payment_intent_id: null, stripe_customer_id: null, stripe_subscription_id: null,
  plan: "monthly", payment_status: "pending", latest_allocation: null,
  created_at: "2026-01-01T00:00:00Z", deleted: false,
};

describe("CSV exports", () => {
  test("filters by plan, excludes deleted rows, and preserves order regardless of status", () => {
    const rows: Registration[] = [
      registration,
      { ...registration, id: 2, plan: null },
      { ...registration, id: 3, deleted: true },
      { ...registration, id: 4, plan: "yearly", payment_status: "paid" },
      { ...registration, id: 5, payment_status: "failed" },
      { ...registration, id: 6, plan: "once" },
    ];
    expect(filterExportRegistrations(rows, defaultExportSelection()).map(({ id }) => id)).toEqual([1, 2, 4, 5, 6]);
    expect(filterExportRegistrations(rows, { plans: ["monthly", null], columns: ["name"] }).map(({ id }) => id)).toEqual([1, 2, 5]);
    expect(filterExportRegistrations(rows, { plans: [], columns: ["name"] })).toEqual([]);
  });

  test("exports only selected columns in fixed order with CSV escaping and blank nulls", () => {
    expect(registrationsCsv([registration], {
      plans: ["monthly"], columns: ["birthday", "address", "name"],
    })).toBe('Name,Address,Birthday\r\n"River ""Rock"", Jr.","123 Main St\nUnit 2",');
    expect(registrationsCsv([registration], defaultExportSelection()).split("\r\n")[0])
      .toBe("Name,Email,Address,Birthday");
  });

  test("restores valid preferences and falls back for malformed or empty selections", () => {
    expect(parseExportSelection('{"plans":[null,"monthly","monthly"],"columns":["birthday","name"]}'))
      .toEqual({ plans: ["monthly", null], columns: ["name", "birthday"] });
    for (const stored of [null, "{", "null", "[]", '{}',
      '{"plans":["other"],"columns":["name"]}',
      '{"plans":[null],"columns":["notes"]}',
      '{"plans":[],"columns":["name"]}',
      '{"plans":[null],"columns":[]}']) {
      expect(parseExportSelection(stored)).toEqual(defaultExportSelection());
    }
  });
});
