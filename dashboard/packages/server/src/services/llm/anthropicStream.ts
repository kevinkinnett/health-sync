import type {
  AnthropicResponse,
  AnthropicResponseBlock,
} from "./anthropicCodec.js";
import { LlmHttpError, LlmStreamError } from "./errors.js";

interface SseFrame {
  event?: string;
  data: string;
}

interface StreamEvent {
  type: string;
  [key: string]: unknown;
}

function parseFrame(frame: string): SseFrame | null {
  let event: string | undefined;
  const data: string[] = [];
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trimStart();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (data.length === 0) return null;
  return { event, data: data.join("\n") };
}

async function* readSseFrames(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SseFrame> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const separator = /\r?\n\r?\n/.exec(buffer);
        if (!separator || separator.index == null) break;
        const rawFrame = buffer.slice(0, separator.index);
        buffer = buffer.slice(separator.index + separator[0].length);
        const frame = parseFrame(rawFrame);
        if (frame) yield frame;
      }
    }
    buffer += decoder.decode();
    const finalFrame = parseFrame(buffer);
    if (finalFrame) yield finalFrame;
  } finally {
    reader.releaseLock();
  }
}

function decodeEvent(frame: SseFrame): StreamEvent {
  let candidate: unknown;
  try {
    candidate = JSON.parse(frame.data);
  } catch {
    throw new LlmStreamError(
      "protocol_error",
      `Invalid JSON in ${frame.event ?? "unnamed"} event`,
      false,
    );
  }
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    !("type" in candidate) ||
    typeof candidate.type !== "string"
  ) {
    throw new LlmStreamError(
      "protocol_error",
      `Missing event type in ${frame.event ?? "unnamed"} event`,
      false,
    );
  }
  return candidate as StreamEvent;
}

function streamError(event: StreamEvent): Error {
  const error = event.error;
  const detail =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : {};
  const type = typeof detail.type === "string" ? detail.type : "stream_error";
  const message =
    typeof detail.message === "string" ? detail.message : "Unknown stream error";
  if (type === "session_expired") {
    return new LlmHttpError(410, JSON.stringify(event));
  }
  return new LlmStreamError(
    type,
    message,
    ["api_error", "overloaded_error", "timeout_error"].includes(type),
  );
}

function eventIndex(event: StreamEvent): number | null {
  return typeof event.index === "number" && Number.isInteger(event.index)
    ? event.index
    : null;
}

/** Accumulate Anthropic's SSE event protocol into a normal Messages response. */
export async function accumulateAnthropicStream(
  stream: ReadableStream<Uint8Array>,
): Promise<AnthropicResponse> {
  const result: AnthropicResponse = { content: [], usage: {} };
  const blocks = new Map<number, AnthropicResponseBlock>();
  const toolJson = new Map<number, string>();
  let started = false;
  let stopped = false;

  for await (const frame of readSseFrames(stream)) {
    const event = decodeEvent(frame);
    switch (event.type) {
      case "message_start": {
        const message = event.message as AnthropicResponse | undefined;
        if (!message) {
          throw new LlmStreamError(
            "protocol_error",
            "message_start did not contain a message",
            false,
          );
        }
        started = true;
        result.id = message.id;
        result.model = message.model;
        result.stop_reason = message.stop_reason;
        result.usage = { ...message.usage };
        break;
      }
      case "content_block_start": {
        const index = eventIndex(event);
        const block = event.content_block;
        if (index == null || typeof block !== "object" || block === null) break;
        blocks.set(index, { ...(block as AnthropicResponseBlock) });
        if ((block as AnthropicResponseBlock).type === "tool_use") {
          toolJson.set(index, "");
        }
        break;
      }
      case "content_block_delta": {
        const index = eventIndex(event);
        const delta = event.delta;
        if (index == null || typeof delta !== "object" || delta === null) break;
        const typedDelta = delta as Record<string, unknown>;
        const block = blocks.get(index);
        if (!block || typeof typedDelta.type !== "string") break;
        if (typedDelta.type === "text_delta" && typeof typedDelta.text === "string") {
          block.text = `${block.text ?? ""}${typedDelta.text}`;
        } else if (
          typedDelta.type === "thinking_delta" &&
          typeof typedDelta.thinking === "string"
        ) {
          block.thinking = `${block.thinking ?? ""}${typedDelta.thinking}`;
        } else if (
          typedDelta.type === "signature_delta" &&
          typeof typedDelta.signature === "string"
        ) {
          block.signature = typedDelta.signature;
        } else if (
          typedDelta.type === "input_json_delta" &&
          typeof typedDelta.partial_json === "string"
        ) {
          toolJson.set(index, `${toolJson.get(index) ?? ""}${typedDelta.partial_json}`);
        }
        break;
      }
      case "content_block_stop": {
        const index = eventIndex(event);
        if (index == null || !toolJson.has(index)) break;
        const block = blocks.get(index);
        if (!block) break;
        const json = toolJson.get(index) ?? "";
        try {
          block.input = json.length > 0 ? JSON.parse(json) : block.input ?? {};
        } catch {
          throw new LlmStreamError(
            "protocol_error",
            `Invalid tool input JSON for content block ${index}`,
            false,
          );
        }
        break;
      }
      case "message_delta": {
        const delta = event.delta;
        if (typeof delta === "object" && delta !== null) {
          const stopReason = (delta as Record<string, unknown>).stop_reason;
          if (typeof stopReason === "string") result.stop_reason = stopReason;
        }
        const usage = event.usage;
        if (typeof usage === "object" && usage !== null) {
          result.usage = {
            ...result.usage,
            ...(usage as AnthropicResponse["usage"]),
          };
        }
        break;
      }
      case "message_stop":
        stopped = true;
        break;
      case "error":
        throw streamError(event);
      case "ping":
      default:
        // Anthropic may add event variants; unknown events are forward-compatible.
        break;
    }
  }

  if (!started || !stopped) {
    throw new LlmStreamError(
      "stream_incomplete",
      "Anthropic stream ended before message_stop",
      true,
    );
  }
  result.content = [...blocks.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, block]) => block);
  return result;
}
