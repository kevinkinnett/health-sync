/**
 * Shape of the `/api/config` response. Single source of truth for runtime
 * config the client needs to know — currently just the user's timezone.
 */
export interface AppConfig {
  /**
   * IANA timezone (e.g. `America/New_York`). The client uses this for
   * date-range presets and any user-day bucketing it does locally.
   */
  userTimezone: string;
}
