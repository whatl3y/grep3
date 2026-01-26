import Anthropic from "@anthropic-ai/sdk";
import config from "../config";
import log from "../logger";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    if (!config.anthropic.apiKey) {
      throw new Error("Anthropic API key not configured");
    }
    client = new Anthropic({
      apiKey: config.anthropic.apiKey,
    });
  }
  return client;
}

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ClaudeCompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface ClaudeCompletionResult {
  content: string;
  tokensUsed: number;
}

/**
 * Create a completion with Claude
 */
export async function createClaudeCompletion(
  messages: ClaudeMessage[],
  options: ClaudeCompletionOptions = {}
): Promise<ClaudeCompletionResult> {
  const {
    model = config.anthropic.model,
    maxTokens = 8000,
    temperature = 0.7,
    systemPrompt,
  } = options;

  const claude = getClient();

  log.info(`Calling Claude ${model} with ${messages.length} messages`);

  const response = await claude.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages,
  });

  // Extract text content from response
  let content = "";
  for (const block of response.content) {
    if (block.type === "text") {
      content += block.text;
    }
  }

  const tokensUsed =
    (response.usage?.input_tokens || 0) +
    (response.usage?.output_tokens || 0);

  log.info(`Claude response received, ${tokensUsed} tokens used`);

  return {
    content,
    tokensUsed,
  };
}

/**
 * Extract HTML from Claude's response
 * Claude may wrap HTML in code blocks or other formatting
 */
export function extractHtmlFromResponse(content: string): string {
  // Try to extract from code blocks first
  const htmlBlockMatch = content.match(/```html\s*([\s\S]*?)```/);
  if (htmlBlockMatch) {
    return htmlBlockMatch[1].trim();
  }

  // Try generic code block
  const codeBlockMatch = content.match(/```\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    const code = codeBlockMatch[1].trim();
    if (code.startsWith("<!DOCTYPE") || code.startsWith("<html")) {
      return code;
    }
  }

  // Check if content is already HTML
  if (content.includes("<!DOCTYPE") || content.includes("<html")) {
    // Find start of HTML
    const htmlStart = content.indexOf("<!DOCTYPE") !== -1
      ? content.indexOf("<!DOCTYPE")
      : content.indexOf("<html");

    // Find end of HTML
    const htmlEnd = content.lastIndexOf("</html>");
    if (htmlEnd !== -1) {
      return content.substring(htmlStart, htmlEnd + 7);
    }

    return content.substring(htmlStart);
  }

  // Return as-is if we can't identify HTML structure
  return content;
}
