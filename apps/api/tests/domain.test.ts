import { expect, test } from "bun:test";
import { dailyLoad, validateRange } from "../src/index.ts";
import { rangeDays } from "../src/load.ts";
test("load detects overload and full-day lock",()=>{expect(dailyLoad([4,5]).overloaded).toBe(true);expect(dailyLoad([8]).locked).toBe(true);expect(dailyLoad([2,3]).ratio).toBe(63);});
test("date range requires ordered endpoints and bounds workload expansion",()=>{expect(validateRange("2026-01-01","2026-01-02")).toBe(true);expect(validateRange("2026-02-01","2026-01-01")).toBe(false);expect(()=>rangeDays("2020-01-01","2031-01-01")).toThrow("10 years");});
