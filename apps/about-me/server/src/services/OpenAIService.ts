import OpenAI from "openai";
import config from "../config";
import log from "../logger";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    if (!config.openai.apiKey) {
      throw new Error("OpenAI API key not configured");
    }
    client = new OpenAI({
      apiKey: config.openai.apiKey,
    });
  }
  return client;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

export interface ChatCompletionResult {
  content: string;
  tokensUsed: number;
}

/**
 * Create a chat completion with OpenAI
 */
export async function createChatCompletion(
  messages: ChatMessage[],
  options: ChatCompletionOptions = {}
): Promise<ChatCompletionResult> {
  const {
    model = config.openai.model,
    maxTokens = 4000,
    temperature = 0.7,
    jsonMode = false,
  } = options;

  const openai = getClient();

  log.info(`Calling OpenAI ${model} with ${messages.length} messages`);

  const response = await openai.chat.completions.create({
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
    response_format: jsonMode ? { type: "json_object" } : undefined,
  });

  const content = response.choices[0]?.message?.content || "";
  const tokensUsed =
    (response.usage?.prompt_tokens || 0) +
    (response.usage?.completion_tokens || 0);

  log.info(`OpenAI response received, ${tokensUsed} tokens used`);

  return {
    content,
    tokensUsed,
  };
}

/**
 * Parse a JSON response from OpenAI, handling potential formatting issues
 */
export function parseJsonResponse<T>(content: string): T {
  // Try to extract JSON from markdown code blocks if present
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();

  try {
    return JSON.parse(jsonStr);
  } catch (err) {
    log.error("Failed to parse JSON response from OpenAI:", err);
    log.error("Content was:", content.substring(0, 500));
    throw new Error("Invalid JSON response from OpenAI");
  }
}
