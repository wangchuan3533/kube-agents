import { z } from 'zod';

export const FilesystemPermissionsSchema = z.object({
  read: z.array(z.string()).default([]),  // glob patterns
  write: z.array(z.string()).default([]), // glob patterns
});

export type FilesystemPermissions = z.infer<typeof FilesystemPermissionsSchema>;

export const NetworkPermissionsSchema = z.object({
  allowedHosts: z.array(z.string()).default([]), // hostnames or patterns
  deniedHosts: z.array(z.string()).default([]),
});

export type NetworkPermissions = z.infer<typeof NetworkPermissionsSchema>;

export const PermissionsSchema = z.object({
  filesystem: FilesystemPermissionsSchema.default({}),
  network: NetworkPermissionsSchema.default({}),
  tools: z.array(z.string()).default([]), // allowed tool names, empty = all
  maxConcurrentToolCalls: z.number().positive().default(5),
});

export type Permissions = z.infer<typeof PermissionsSchema>;
