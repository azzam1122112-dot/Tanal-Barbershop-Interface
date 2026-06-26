import type { AuthSession } from "./session";

export function canAccessDashboard(session: AuthSession | null) {
  return session?.type === "dashboard" && (session.role === "OWNER" || session.role === "ADMIN" || session.role === "SUPERVISOR");
}

export function canManageStaff(session: AuthSession | null) {
  return session?.type === "dashboard" && (session.role === "OWNER" || session.role === "ADMIN");
}

export function canManageOrganization(session: AuthSession | null) {
  return session?.type === "dashboard" && session.role === "OWNER";
}

export function canAccessBarberApp(session: AuthSession | null) {
  return session?.type === "barber" && session.role === "BARBER";
}

export function canAccessPlatform(session: AuthSession | null) {
  return session?.type === "platform";
}
