import type { Role } from "@/lib/roles"

interface ResolveProjectAccessRoleOptions {
  actingUserId?: string | null
  projectOwnerId?: string | null
  resolvedRepoRole: Role | null
}

export function resolveProjectAccessRole({
  actingUserId,
  projectOwnerId,
  resolvedRepoRole,
}: ResolveProjectAccessRoleOptions): Role | null {
  return actingUserId && projectOwnerId === actingUserId ? "owner" : resolvedRepoRole
}
