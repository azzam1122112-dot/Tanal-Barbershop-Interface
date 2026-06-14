import type { Service } from "@prisma/client";

export function toSafeService(service: Service, includeManagementFields = false) {
  return {
    id: service.id,
    name: service.name,
    defaultPrice: Number(service.defaultPrice),
    ...(includeManagementFields
      ? {
          isActive: service.isActive,
          sortOrder: service.sortOrder,
          createdAt: service.createdAt.toISOString(),
          updatedAt: service.updatedAt.toISOString(),
        }
      : {}),
  };
}

export function onlyActiveServices<T extends { isActive: boolean; sortOrder: number; name: string }>(services: T[]) {
  return services
    .filter((service) => service.isActive)
    .sort((first, second) => first.sortOrder - second.sortOrder || first.name.localeCompare(second.name, "ar"));
}
