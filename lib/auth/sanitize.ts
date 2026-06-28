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
  // فروع المشرف المسندة (تظهر فقط عند طلب حقول الإدارة وللمشرفين).
  assignedSalons?: { id: string; name: string }[];
};

export type SafeBarber = {
  id: string;
  name: string;
  phone: string;
  role: "BARBER";
  salonId?: string | null;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string | null;
};

export function toSafeAdminUser(
  user: User & { salonAssignments?: { salon: { id: string; name: string } }[] },
  includeManagementFields = false,
): SafeAdminUser {
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
    if (user.salonAssignments) {
      safeUser.assignedSalons = user.salonAssignments.map((assignment) => assignment.salon);
    }
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
    safeBarber.salonId = barber.salonId;
    safeBarber.isActive = barber.isActive;
    safeBarber.createdAt = barber.createdAt.toISOString();
    safeBarber.updatedAt = barber.updatedAt.toISOString();
    safeBarber.lastLoginAt = barber.lastLoginAt?.toISOString() ?? null;
  }

  return safeBarber;
}
