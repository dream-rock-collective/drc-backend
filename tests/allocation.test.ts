import { describe, expect, test } from "bun:test";
import { allocationSubmissionSchema } from "../src/allocation";

describe("allocation formats", () => {
  test("legacy payload without format remains dollars, without a 100 total requirement", () => {
    expect(
      allocationSubmissionSchema.parse({
        allocation: { charityA: 5, charityB: 10 },
      }),
    ).toEqual({ allocation: { charityA: 5, charityB: 10 }, format: "dollars" });
    expect(allocationSubmissionSchema.parse({ allocation: {} }).format).toBe(
      "dollars",
    );
  });
  test("explicit dollars retains legacy validation", () => {
    expect(
      allocationSubmissionSchema.safeParse({
        allocation: { charityA: 15 },
        format: "dollars",
      }).success,
    ).toBe(true);
  });
  test.each([
    { charityA: 33, charityB: 67 },
    { charityA: 0, charityB: 100 },
  ])("accepts whole percentage splits %p", (allocation) => {
    expect(
      allocationSubmissionSchema.parse({ allocation, format: "percentage" })
        .format,
    ).toBe("percentage");
  });
  test.each([
    { a: -1, b: 101 },
    { a: 33.5, b: 66.5 },
    { a: 99 },
    { a: 101 },
    {},
  ])("rejects invalid percentages %p", (allocation) => {
    expect(
      allocationSubmissionSchema.safeParse({ allocation, format: "percentage" })
        .success,
    ).toBe(false);
  });
  test.each([null, "percent", "", 100])(
    "rejects invalid format %p",
    (format) => {
      expect(
        allocationSubmissionSchema.safeParse({ allocation: { a: 100 }, format })
          .success,
      ).toBe(false);
    },
  );
  test.each(["dollars", "percentage"])(
    "rejects invalid recipient values for %s",
    (format) => {
      for (const allocation of [{ a: -1 }, { a: 0.5 }, { a: "100" }]) {
        expect(
          allocationSubmissionSchema.safeParse({ allocation, format }).success,
        ).toBe(false);
      }
    },
  );
});
