import { expect, test } from "bun:test";
import { orgParentAllowed } from "../src/domains/org/validation.ts";
import { peopleSchema } from "../src/domains/people/schema.ts";

test("organization hierarchy allows only company > second level > center > department", () => {
  expect(orgParentAllowed("company", null)).toBe(true);
  expect(orgParentAllowed("company", "company")).toBe(false);
  expect(orgParentAllowed("second_level", "company")).toBe(true);
  expect(orgParentAllowed("center", "second_level")).toBe(true);
  expect(orgParentAllowed("department", "center")).toBe(true);
  expect(orgParentAllowed("department", "company")).toBe(false);
  expect(orgParentAllowed("center", null)).toBe(false);
  expect(orgParentAllowed("studio", "center")).toBe(true);
  expect(orgParentAllowed("studio", "department")).toBe(true);
  expect(orgParentAllowed("studio", "company")).toBe(false);
});

test("person profile keeps levels, duties, studios and dispatch state", () => {
  const parsed = peopleSchema.parse({
    name: "张三", org_id: "org-1", employee_no: "A001", management_level: "department_director",
    professional_level: "engineer_1", duties: ["personnel_coordination"], studio_ids: ["studio-1"],
    skills: ["Go"], status: "training", dispatchable: false,
  });
  expect(parsed.employee_no).toBe("A001");
  expect(parsed.duties).toEqual(["personnel_coordination"]);
  expect(parsed.status).toBe("training");
  expect(parsed.dispatchable).toBe(false);
  const defaults = peopleSchema.parse({ name: "李四", org_id: "org-2" });
  expect(defaults.duties).toEqual([]);
  expect(defaults.studio_ids).toEqual([]);
  expect(defaults.dispatchable).toBe(true);
});
