/* Minimal ambient types for `web-push` (the package ships none, and we avoid
 * pulling @types/web-push for the small surface we use). Covers exactly the
 * functions the send path touches. */
declare module "web-push" {
  export interface PushSubscription {
    endpoint: string;
    expirationTime?: number | null;
    keys: { p256dh: string; auth: string };
  }
  export interface SendResult {
    statusCode: number;
    body: string;
    headers: Record<string, string>;
  }
  export interface WebPushError extends Error {
    statusCode: number;
    body: string;
    headers: Record<string, string>;
    endpoint: string;
  }
  export function generateVAPIDKeys(): { publicKey: string; privateKey: string };
  export function setVapidDetails(
    subject: string,
    publicKey: string,
    privateKey: string
  ): void;
  export function sendNotification(
    subscription: PushSubscription,
    payload?: string | Buffer,
    options?: Record<string, unknown>
  ): Promise<SendResult>;
  const _default: {
    generateVAPIDKeys: typeof generateVAPIDKeys;
    setVapidDetails: typeof setVapidDetails;
    sendNotification: typeof sendNotification;
  };
  export default _default;
}
