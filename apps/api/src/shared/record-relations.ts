// Compatibility exports for existing domain callers; implementations belong to their domains.
export { allowedTaskTypes } from "../domains/config/service.ts";
export { orgExists } from "../domains/org/service.ts";
export { orgDescendant } from "../domains/org/service.ts";
export { assignmentOrgAllowed } from "../domains/org/service.ts";
export { activeUsers } from "../domains/people/service.ts";
export { taskTargetOrganizations } from "../domains/tasks/service.ts";
