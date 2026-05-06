import { z } from "zod";

export const MutedSessionIdsSchema = z.array(z.string().min(1));
export type MutedSessionIds = z.infer<typeof MutedSessionIdsSchema>;

const QuietHourSchema = z.number().int().min(0).max(23);

export const NotificationSettingsSchema = z.object({
  enabled: z.boolean(),
  fireCritical: z.boolean(),
  fireImportant: z.boolean(),
  fireNotable: z.boolean(),
  quietStartHour: QuietHourSchema,
  quietEndHour: QuietHourSchema,
});
export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>;

export const PartialNotificationSettingsSchema =
  NotificationSettingsSchema.partial();
export type PartialNotificationSettings = z.infer<
  typeof PartialNotificationSettingsSchema
>;
