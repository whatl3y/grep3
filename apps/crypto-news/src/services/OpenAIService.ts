import OpenAI from "openai";
import config from "../config";
import log from "../logger";

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openaiClient) {
    if (!config.openai.apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }
    openaiClient = new OpenAI({
      apiKey: config.openai.apiKey,
    });
  }
  return openaiClient;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionResult {
  content: string;
  tokensUsed: number;
  model: string;
}

export async function createChatCompletion(
  messages: ChatMessage[],
  options?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    jsonMode?: boolean;
  }
): Promise<CompletionResult> {
  const client = getClient();
  const model = options?.model || config.openai.model;

  log.debug(`Creating chat completion with ${messages.length} messages`, {
    model,
  });

  const response = await client.chat.completions.create({
    model,
    messages,
    max_tokens: options?.maxTokens || 4000,
    temperature: options?.temperature ?? 0.3,
    ...(options?.jsonMode && { response_format: { type: "json_object" } }),
  });

  const content = response.choices[0]?.message?.content || "";
  const tokensUsed =
    (response.usage?.prompt_tokens || 0) +
    (response.usage?.completion_tokens || 0);

  log.debug(`Completion finished`, { tokensUsed, model: response.model });

  return {
    content,
    tokensUsed,
    model: response.model,
  };
}

export async function scoreNewsItems(
  items: { id: number; title: string; content: string | null }[]
): Promise<{ id: number; score: number; reason: string }[]> {
  const SCORING_PROMPT = `You are a crypto news analyst. Score each news item from 0-100 based on:
- Market impact (price movements, major trades, large volumes)
- Regulatory significance (new laws, enforcement actions, government decisions)
- Technological importance (protocol upgrades, security issues, major releases)
- Industry relevance (major partnerships, funding rounds over $10M, exchange news)
- Breaking news vs routine updates

Higher scores for:
- Bitcoin/Ethereum news (major cryptos)
- SEC/regulatory decisions
- Major hacks or security issues
- Billion-dollar+ funding/acquisitions
- Exchange listings/delistings of major tokens

Lower scores for:
- Minor altcoin news
- Opinion pieces
- Old news rehashed
- Sponsored/promotional content

Return JSON: { "scores": [{ "id": number, "score": number, "reason": string }] }`;

  const itemsForPrompt = items.map((i) => ({
    id: i.id,
    title: i.title,
    excerpt: i.content?.substring(0, 300) || "",
  }));

  const result = await createChatCompletion(
    [
      { role: "system", content: SCORING_PROMPT },
      { role: "user", content: JSON.stringify(itemsForPrompt) },
    ],
    { jsonMode: true, maxTokens: 2000 }
  );

  try {
    const parsed = JSON.parse(result.content);
    return parsed.scores || [];
  } catch (err) {
    log.error("Failed to parse scoring response", err);
    return [];
  }
}

export async function generateDailySummaryContent(
  date: string,
  items: {
    id: number;
    title: string;
    content: string | null;
    url: string;
    source_name: string;
    relevance_score: number | null;
  }[],
  recentEventHeadlines: string[] = []
): Promise<{
  html: string;
  events: any[];
  tokensUsed: number;
  model: string;
}> {
  // Build the exclusion instruction if there are recent events
  const exclusionInstruction = recentEventHeadlines.length > 0
    ? `

IMPORTANT - EXCLUDE DUPLICATES: The following stories have ALREADY been covered in recent daily summaries. Do NOT include any events about these same topics, even if today's articles use different wording. Skip news items that are about the same underlying story:
${recentEventHeadlines.map(h => `- ${h}`).join('\n')}`
    : '';

  const SUMMARY_PROMPT = `You are a professional crypto news summarizer creating a daily digest for investors and enthusiasts.

Create a summary of the TOP 5-10 most important crypto events for ${date}.

Guidelines:
- Focus on the most significant, market-moving, or industry-changing news
- Group related stories into single events (e.g., multiple articles about same Bitcoin move)
- Write clear, factual headlines (no clickbait)
- Include specific numbers when relevant (prices, percentages, amounts)
- Each event should have 2-3 sentences of context
- Vary categories: markets, regulation, technology, business, security
- Be objective and professional in tone${exclusionInstruction}

Return a JSON object with this structure:
{
  "events": [
    {
      "rank": 1,
      "headline": "Clear, factual headline",
      "summary": "2-3 sentence summary with key details and numbers.",
      "category": "market|regulation|technology|business|security",
      "impact_score": 85,
      "reference_ids": [123, 456]
    }
  ],
  "html": "<article><h3>1. Headline</h3><p>Summary text...</p></article>..."
}

The HTML should be clean, semantic markup ready to display. Use <article> for each event, <h3> for headlines (numbered), <p> for summaries.`;

  const itemsForPrompt = items.slice(0, 30).map((i) => ({
    id: i.id,
    title: i.title,
    excerpt: i.content?.substring(0, 400) || "",
    source: i.source_name,
    score: i.relevance_score,
  }));

  const result = await createChatCompletion(
    [
      { role: "system", content: SUMMARY_PROMPT },
      {
        role: "user",
        content: `Here are the news items for ${date}, ordered by relevance:\n\n${JSON.stringify(itemsForPrompt, null, 2)}`,
      },
    ],
    { jsonMode: true, maxTokens: 3000, temperature: 0.4 }
  );

  try {
    const parsed = JSON.parse(result.content);
    return {
      html: parsed.html || "",
      events: parsed.events || [],
      tokensUsed: result.tokensUsed,
      model: result.model,
    };
  } catch (err) {
    log.error("Failed to parse summary response", err);
    return {
      html: "<p>Failed to generate summary.</p>",
      events: [],
      tokensUsed: result.tokensUsed,
      model: result.model,
    };
  }
}
