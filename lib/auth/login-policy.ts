import type { Barber, User } from "@prisma/client";

export function canAdminLogin(user: Pick<User, "role" | "isActive"> | null, passwordOk: boolean) {
  return Boolean(user && user.isActive && passwordOk && (user.role === "ADMIN" || user.role === "SUPERVISOR"));
}

export function canBarberLogin(barber: Pick<Barber, "isActive"> | null, pinOk: boolean) {
  return Boolean(barber && barber.isActive && pinOk);
}
