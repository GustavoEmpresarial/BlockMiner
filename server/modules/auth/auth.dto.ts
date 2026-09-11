import type { AuthPublicUserDto } from "./auth.types.js";

type UserLike = {
  id: number;
  name: string;
  username?: string | null;
  email: string;
  emailVerifiedAt?: Date | null;
  refCode?: string | null;
};

export function toAuthPublicUserDto(
  user: UserLike,
  options?: {
    usernameOverride?: string | null;
    hasReferral?: boolean;
    energyHasPendingTax?: boolean;
  },
): AuthPublicUserDto {
  const dto: AuthPublicUserDto = {
    id: user.id,
    name: user.name,
    username: options?.usernameOverride ?? user.username ?? null,
    email: user.email,
  };
  if (options?.hasReferral !== undefined) dto.hasReferral = options.hasReferral;
  if (options?.energyHasPendingTax !== undefined) dto.energyHasPendingTax = options.energyHasPendingTax;
  if (user.emailVerifiedAt !== undefined) dto.emailVerified = user.emailVerifiedAt != null;
  if (user.refCode !== undefined) dto.refCode = user.refCode;
  return dto;
}
