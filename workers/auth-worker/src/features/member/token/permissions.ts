import { WEBHOOK_TRIGGER_PERMISSION } from '../workflows/domain/constant.js';
import { WEBSOCKET_PERMISSIONS } from '../../ws/constant.js';

export type ServicePermissionRow = {
  id?: number;
  name: string;
  endpoint: string;
  model?: string | null;
};

export type PermissionItem = {
  path: string;
  labelKey?: string;
  label?: string;
  description?: string;
};

export type PermissionGroup = {
  id: string;
  labelKey: string;
  permissions: PermissionItem[];
};

export const STATIC_API_PERMISSIONS = [
  WEBHOOK_TRIGGER_PERMISSION,
  ...WEBSOCKET_PERMISSIONS,
] as const;

export function isApprovedActiveService(row: Record<string, unknown>): boolean {
  const status = row.approvalStatus ?? row.approval_status ?? 'approved';
  const active = row.isActive ?? row.is_active;
  return status === 'approved' && (active === true || active === 1 || active === '1');
}

export function toServicePermissionRow(row: Record<string, unknown>): ServicePermissionRow | null {
  const endpoint = String(row.endpoint ?? '').trim();
  const name = String(row.name ?? '').trim();
  if (!endpoint || !name) return null;
  return {
    id: typeof row.id === 'number' ? row.id : undefined,
    name,
    endpoint,
    model: typeof row.model === 'string' ? row.model : null,
  };
}

export function buildServicePermissions(services: ServicePermissionRow[]): PermissionItem[] {
  return services.map((service) => ({
    path: service.endpoint,
    label: service.name,
    description: service.model?.trim() || undefined,
  }));
}

export function getPermissionGroups(services: ServicePermissionRow[] = []): PermissionGroup[] {
  const servicePerms = buildServicePermissions(services);
  const groups: PermissionGroup[] = [
    {
      id: 'webhook',
      labelKey: 'perm_group_webhook',
      permissions: [{ path: WEBHOOK_TRIGGER_PERMISSION, labelKey: 'perm_webhook_trigger' }],
    },
  ];

  if (servicePerms.length > 0) {
    groups.push({
      id: 'service',
      labelKey: 'perm_group_service',
      permissions: servicePerms,
    });
  }

  groups.push({
    id: 'websocket',
    labelKey: 'perm_group_websocket',
    permissions: WEBSOCKET_PERMISSIONS.map((path) => ({
      path,
      labelKey: path === 'websocket:connect' ? 'perm_ws_connect' : 'perm_ws_broadcast',
    })),
  });

  return groups;
}

export function getAllowedPermissionPaths(services: ServicePermissionRow[]): string[] {
  return [...STATIC_API_PERMISSIONS, ...buildServicePermissions(services).map((p) => p.path)];
}
