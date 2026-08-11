import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ToolCall,
  ToolDef,
} from "./contracts.js";

/** Anthropic requires max_tokens; callers use this conservative default. */
export const DEFAULT_MAX_TOKENS = 8000;

export type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string; signature?: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicBlock[];
}

export interface AnthropicRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: AnthropicMessage[];
  temperature?: number;
  tools?: Array<{
    name: string;
    description: string;
    input_schema: ToolDef["function"]["parameters"];
  }>;
  tool_choice?: { type: "auto" | "any" | "none" };
  thinking?: { type: "enabled"; budget_tokens: number };
  stream?: boolean;
}

export interface AnthropicResponseBlock {
  type: string;
  text?: string;
  thinking?: string;
  signature?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

export interface AnthropicResponse {
  id?: string;
  model?: string;
  stop_reason?: string;
  content?: AnthropicResponseBlock[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

/** OpenAI-shaped application request → Anthropic Messages request. */
export function toAnthropicRequest(req: ChatCompletionRequest): AnthropicRequest {
  const system = req.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content ?? "")
    .filter(Boolean)
    .join("\n\n");

  const messages: AnthropicMessage[] = [];
  for (const message of req.messages) {
    if (message.role === "system") continue;

    if (message.role === "tool") {
      const block: AnthropicBlock = {
        type: "tool_result",
        tool_use_id: message.tool_call_id ?? "",
        content: message.content ?? "",
      };
      const last = messages[messages.length - 1];
      if (last && last.role === "user" && Array.isArray(last.content)) {
        last.content.push(block);
      } else {
        messages.push({ role: "user", content: [block] });
      }
      continue;
    }

    if (
      message.role === "assistant" &&
      message.tool_calls &&
      message.tool_calls.length > 0
    ) {
      const blocks: AnthropicBlock[] = [];
      if (message.content) blocks.push({ type: "text", text: message.content });
      for (const toolCall of message.tool_calls) {
        blocks.push({
          type: "tool_use",
          id: toolCall.id,
          name: toolCall.function.name,
          input: safeJsonParse(toolCall.function.arguments),
        });
      }
      messages.push({ role: "assistant", content: blocks });
      continue;
    }

    messages.push({
      role: message.role as "user" | "assistant",
      content: message.content ?? "",
    });
  }

  const result: AnthropicRequest = {
    model: req.model,
    max_tokens: req.max_tokens ?? DEFAULT_MAX_TOKENS,
    messages,
  };
  if (system) result.system = system;
  if (req.tools?.length) {
    result.tools = req.tools.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters,
    }));
  }
  if (req.tool_choice && result.tools?.length) {
    result.tool_choice = {
      type: req.tool_choice === "required" ? "any" : req.tool_choice,
    };
  }
  if (req.enable_thinking) {
    result.thinking = {
      type: "enabled",
      budget_tokens: req.thinking_budget ?? 1024,
    };
  } else if (req.temperature != null) {
    result.temperature = req.temperature;
  }
  return result;
}

function mapStopReason(reason?: string): string | undefined {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "tool_use":
      return "tool_calls";
    case "max_tokens":
      return "length";
    default:
      return reason;
  }
}

/** Anthropic Messages response → OpenAI-shaped application response. */
export function fromAnthropicResponse(
  response: AnthropicResponse,
): ChatCompletionResponse {
  const text: string[] = [];
  const thinking: string[] = [];
  const toolCalls: ToolCall[] = [];
  for (const block of response.content ?? []) {
    if (block.type === "text" && typeof block.text === "string") {
      text.push(block.text);
    } else if (
      block.type === "thinking" &&
      typeof block.thinking === "string"
    ) {
      thinking.push(block.thinking);
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id ?? "",
        type: "function",
        function: {
          name: block.name ?? "",
          arguments: JSON.stringify(block.input ?? {}),
        },
      });
    }
  }
  const joined = text.join("");
  const inputTokens = response.usage?.input_tokens;
  const outputTokens = response.usage?.output_tokens;
  return {
    id: response.id,
    model: response.model,
    choices: [
      {
        message: {
          role: "assistant",
          content: joined.length > 0 ? joined : toolCalls.length > 0 ? null : "",
          reasoning_content:
            thinking.length > 0 ? thinking.join("") : undefined,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        },
        finish_reason: mapStopReason(response.stop_reason),
      },
    ],
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens:
        inputTokens != null && outputTokens != null
          ? inputTokens + outputTokens
          : undefined,
    },
  };
}
