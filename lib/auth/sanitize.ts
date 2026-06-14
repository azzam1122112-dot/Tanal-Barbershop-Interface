import type { Barber, User, UserRole } from "@prisma/client";

export type SafeAdminUser = {
  id: string;
  name: string;
  email: string | null;
  role: Exclude<UserRole, "BARBER">;
};

export type SafeBarber = {
  id: string;
  name: string;
  phone: string;
  role: "BARBER";
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string | null;
};

export function toSafeAdminUser(user: User): SafeAdminUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as Exclude<UserRole, "BARBER">,
  };
}

export function toSafeBarber(barber: Barber, includeManagementFields = false): SafeBarber {
  const safeBarber: SafeBarber = {
    id: barber.id,
    name: barber.name,
    phone: barber.phone,
    role: "BARBER",
  };

  if (includeManagementFields) {
    safeBarber.isActive = barber.isActive;
    safeBarber.createdAt = barber.createdAt.toISOString();
    safeBarber.updatedAt = barber.updatedAt.toISOString();
    safeBarber.lastLoginAt = barber.lastLoginAt?.toISOString() ?? null;
  }

  return safeBarber;
}
