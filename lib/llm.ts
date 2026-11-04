import OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { z } from "zod";
import { RunStatsSchema, type RunStats } from "@/types";

type ChatOptions = {
  json?: boolean;
  stats?: RunStats;
};

type ChatResult = {
  completion: ChatCompletion;
  stats: RunStats;
};

function createClient(): OpenAI {
  const baseURL = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  if (!baseURL) throw new Error("LLM_BASE_URL is not configured.");
  if (!apiKey) throw new Error("LLM_API_KEY is not configured.");

  return new OpenAI({ baseURL, apiKey, maxRetries: 0 });
}

export function createRunStats(): RunStats {
  return RunStatsSchema.parse({
    models: [],
    tokens: { input: 0, output: 0, total: 0 },
    costEstimate: null,
    latencyMs: 0,
    fallbacks: 0,
    cacheHits: 0,
    droppedClaims: 0,
  });
}

function addModel(stats: RunStats, model: string) {
  if (!stats.models.includes(model)) stats.models.push(model);
}

function recordUsage(stats: RunStats, completion: ChatCompletion) {
  const usage = completion.usage;
  if (!usage) return;

  stats.tokens.input += usage.prompt_tokens;
  stats.tokens.output += usage.completion_tokens;
  stats.tokens.total +=
    usage.total_tokens ?? usage.prompt_tokens + usage.completion_tokens;
}

function isJsonModeUnsupported(error: unknown): boolean {
  if (!(error instanceof OpenAI.APIError)) return false;
  if (error.status !== 400 && error.status !== 422) return false;

  const message = error.message.toLowerCase();
  return (
    /response[_ ]format|json[_ ]object|json mode/.test(message) &&
    /unsupported|not support|invalid|unavailable/.test(message)
  );
}

async function requestCompletion(
  client: OpenAI,
  model: string,
  messages: ChatCompletionMessageParam[],
  json: boolean,
): Promise<ChatCompletion> {
  try {
    return await client.chat.completions.create({
      model,
      messages,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    });
  } catch (error) {
    if (!json || !isJsonModeUnsupported(error)) throw error;

    return client.chat.completions.create({ model, messages });
  }
}

export async function chat(
  model: string,
  messages: ChatCompletionMessageParam[],
  { json = false, stats = createRunStats() }: ChatOptions = {},
): Promise<ChatResult> {
  if (!model.trim()) throw new Error("model must not be empty.");

  const client = createClient();
  const fallbackModel = process.env.MODEL_FALLBACK?.trim();
  const startedAt = performance.now();
  let completion: ChatCompletion;

  try {
    addModel(stats, model);
    completion = await requestCompletion(client, model, messages, json);
  } catch (error) {
    if (!fallbackModel || fallbackModel === model) {
      stats.latencyMs += performance.now() - startedAt;
      throw error;
    }

    stats.fallbacks += 1;
    addModel(stats, fallbackModel);
    try {
      completion = await requestCompletion(
        client,
        fallbackModel,
        messages,
        json,
      );
    } catch (fallbackError) {
      stats.latencyMs += performance.now() - startedAt;
      throw fallbackError;
    }
  }

  stats.latencyMs += performance.now() - startedAt;
  recordUsage(stats, completion);
  return { completion, stats };
}

function getJsonText(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

export function parseAndValidateJson<T>(
  content: string | null,
  schema: z.ZodType<T>,
): T {
  if (!content) throw new Error("The model returned an empty response.");

  let value: unknown;
  try {
    value = JSON.parse(getJsonText(content));
  } catch (error) {
    throw new Error("The model response is not valid JSON.", { cause: error });
  }

  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `The model response failed schema validation: ${parsed.error.message}`,
    );
  }

  return parsed.data;
}

export async function chatJson<T>(
  model: string,
  messages: ChatCompletionMessageParam[],
  schema: z.ZodType<T>,
  { stats = createRunStats() }: ChatOptions = {},
): Promise<{ data: T; stats: RunStats }> {
  const first = await chat(model, messages, { json: true, stats });
  const firstContent = first.completion.choices[0]?.message.content ?? null;

  try {
    return { data: parseAndValidateJson(firstContent, schema), stats };
  } catch (firstError) {
    const retryMessages: ChatCompletionMessageParam[] = [
      ...messages,
      ...(firstContent
        ? [{ role: "assistant" as const, content: firstContent }]
        : []),
      {
        role: "user",
        content: `Return corrected JSON only. The previous response failed to parse or validate: ${
          firstError instanceof Error
            ? firstError.message
            : "Invalid JSON response."
        }`,
      },
    ];
    const retry = await chat(model, retryMessages, { json: true, stats });
    const retryContent = retry.completion.choices[0]?.message.content ?? null;

    return { data: parseAndValidateJson(retryContent, schema), stats };
  }
}
