import type { CliArgs } from "./args";
export type { CommandRequest } from "./commands/shared";
import { systemRequest } from "./commands/system";
import { adminRequest } from "./commands/admin";
import { planningRequest } from "./commands/planning";
import { tasksRequest } from "./commands/tasks";
import { filesRequest } from "./commands/files";
import { workspaceRequest } from "./commands/workspace";
import { genericRequest } from "./commands/generic";
export function commandRequest(args:CliArgs) {
 return systemRequest(args) ?? adminRequest(args) ?? planningRequest(args) ?? tasksRequest(args) ?? filesRequest(args) ?? workspaceRequest(args) ?? genericRequest(args);
}
