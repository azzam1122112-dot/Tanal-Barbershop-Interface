import type { AuthSession } from "./session";

export function canAccessDashboard(session: AuthSession | null) {
  return session?.type === "dashboard" && (session.role === "ADMIN" || session.role === "SUPERVISOR");
}

export function canManageStaff(session: AuthSession | null) {
  return session?.type === "dashboard" && session.role === "ADMIN";
}

export function canAccessBarberApp(session: AuthSession | null) {
  return session?.type === "barber" && session.role === "BARBER";
}
