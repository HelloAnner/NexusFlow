
export const needsCenterApproval=(requesterOrg:string|null|undefined,targets:string[])=>targets.some(org=>org!==String(requesterOrg||""));
