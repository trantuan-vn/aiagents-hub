export interface NotificationItem {
  id: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  createdAt: number;
  read?: boolean;
}

export type NotificationPayload = Partial<NotificationItem> & {
  title: string;
  body?: string;
};
