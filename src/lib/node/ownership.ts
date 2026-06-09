import type { UserRole } from '@/lib/edge/jwt'

type OwnershipResult =
  | { ok: true }
  | { ok: false; status: number; error: string }

export function assertOwnership(opts: {
  role: UserRole
  userId: number
  resourceOwnerId: number
}): OwnershipResult {
  if (opts.role === 'ADMIN') return { ok: true }
  if (opts.resourceOwnerId !== opts.userId) {
    return { ok: false, status: 403, error: 'Chỉ được thao tác trên bản ghi của mình' }
  }
  return { ok: true }
}
