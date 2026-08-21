import type { PrepareRecoverySessionActionBody } from "@health-dashboard/shared";
import type { ToolDef } from "./llmClient.js";
import type { RecoveryActionService } from "./recoveryActionService.js";

export const PREPARE_RECOVERY_SESSION_TOOL = "prepare_log_recovery_session";

export function buildRecoveryActionTools(): ToolDef[] {
  return [{
    type: "function",
    function: {
      name: PREPARE_RECOVERY_SESSION_TOOL,
      description: "Prepare a recovery session for user review. This does not save the session. Use only after activity, local start time, and duration are explicit or the activity has a configured default.",
      parameters: {
        type: "object",
        properties: {
          activity: { type: "string", description: "Recovery activity code or exact name, such as hot_blanket or Massage." },
          startedLocal: { type: "string", description: "Start time in the user's America/New_York timezone, formatted YYYY-MM-DDTHH:mm." },
          durationMinutes: { type: "integer", description: "Positive whole number of minutes. Omit only when the activity has a configured default." },
          intensity: { type: "integer", description: "Optional intensity from 1 through 5." },
          temperatureF: { type: "number", description: "Optional hot blanket temperature in degrees Fahrenheit." },
          massageType: { type: "string", description: "Optional massage type, such as deep tissue." },
          notes: { type: "string", description: "Optional user-provided notes." },
        },
        required: ["activity", "startedLocal"],
      },
    },
  }];
}

export async function executeRecoveryActionTool(
  name: string,
  args: Record<string, unknown>,
  conversationId: string,
  service: RecoveryActionService,
): Promise<string> {
  if (name !== PREPARE_RECOVERY_SESSION_TOOL) {
    return JSON.stringify({ error: `Unknown recovery action '${name}'` });
  }
  try {
    const action = await service.prepare(conversationId, args as unknown as PrepareRecoverySessionActionBody);
    return JSON.stringify({ pendingAction: action, saved: false, requiresConfirmation: true });
  } catch (error) {
    return JSON.stringify({ error: (error as Error).message, saved: false });
  }
}
