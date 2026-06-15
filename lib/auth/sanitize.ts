import type { Barber, User, UserRole } from "@prisma/client";

export type SafeAdminUser = {
  id: string;
  name: string;
  email: string | null;
  role: Exclude<UserRole, "BARBER">;
  phone?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string | null;
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

export function toSafeAdminUser(user: User, includeManagementFields = false): SafeAdminUser {
  const safeUser: SafeAdminUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as Exclude<UserRole, "BARBER">,
  };

  if (includeManagementFields) {
    safeUser.phone = user.phone;
    safeUser.isActive = user.isActive;
    safeUser.createdAt = user.createdAt.toISOString();
    safeUser.updatedAt = user.updatedAt.toISOString();
    safeUser.lastLoginAt = user.lastLoginAt?.toISOString() ?? null;
  }

  return safeUser;
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
