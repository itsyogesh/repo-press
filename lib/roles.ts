export const ROLE_VALUES = ["owner", "editor", "viewer"] as const

export type Role = (typeof ROLE_VALUES)[number]

export const ROLE_HIERARCHY: Record<Role, number> = {
  owner: 3,
  editor: 2,
  viewer: 1,
}

export function roleAtLeast(actual: Role, minimum: Role): boolean {
  return ROLE_HIERARCHY[actual] >= ROLE_HIERARCHY[minimum]
}
