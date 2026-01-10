import Anthropic from "@anthropic-ai/sdk";
import { VoiceProfile } from "./VoiceAnalyzer";
import {
  EngagementOptimizer,
  OptimizationContext,
  getEngagementOptimizer,
} from "./EngagementOptimizer";
import config from "../config";
import log from "../logger";

export interface GeneratedTweet {
  text: string;
  topic: string;
  format: string;
  engagementScore: number;
  suggestedPostTime: Date;
  reasoning: string;
}

export interface GenerationRequest {
  topic: string;
  voiceProfile: VoiceProfile;
  count?: number;
  formatPreference?: string;
}

/**
 * Claude-powered content generator that creates authentic tweets
 * matching user's voice while optimizing for engagement
 */
export class ContentGenerator {
  private client: Anthropic;
  private optimizer: EngagementOptimizer;

  constructor() {
    this.client = new Anthropic({
      apiKey: config.anthropic.apiKey,
    });
    this.optimizer = getEngagementOptimizer();
  }

  /**
   * Generate tweets based on voice profile and optimization context
   */
  async generateTweets(request: GenerationRequest): Promise<GeneratedTweet[]> {
    const { topic, voiceProfile, count = 3, formatPreference } = request;

    log.info(`Generating ${count} tweets about: ${topic}`);

    const context = this.optimizer.buildOptimizationContext(
      voiceProfile,
      topic
    );

    const prompt = this.buildPrompt(voiceProfile, context, count, formatPreference);

    const response = await this.client.messages.create({
      model: config.anthropic.model,
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }

    const tweets = this.parseResponse(content.text, topic, context);

    log.info(`Generated ${tweets.length} tweets`);
    return tweets;
  }

  /**
   * Regenerate a single tweet with specific feedback
   */
  async regenerateTweet(
    originalTweet: string,
    feedback: string,
    voiceProfile: VoiceProfile,
    topic: string
  ): Promise<GeneratedTweet> {
    const context = this.optimizer.buildOptimizationContext(voiceProfile, topic);

    const prompt = `You are rewriting a tweet based on feedback. Your goal is to maintain authenticity while improving it.

ORIGINAL TWEET:
${originalTweet}

FEEDBACK:
${feedback}

VOICE PROFILE:
${this.formatVoiceProfile(voiceProfile)}

REQUIREMENTS:
- Apply the feedback while maintaining the authentic voice
- Keep it under ${context.constraints.maxLength} characters
- Must NOT sound like AI-generated content
- No corporate speak, buzzwords, or overly formal language

Respond with ONLY the new tweet text, nothing else.`;

    const response = await this.client.messages.create({
      model: config.anthropic.model,
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type");
    }

    const text = content.text.trim();
    const score = this.optimizer.scoreTweet(text, context);

    return {
      text,
      topic,
      format: "regenerated",
      engagementScore: score,
      suggestedPostTime: this.optimizer.getOptimalPostingTime(voiceProfile),
      reasoning: `Regenerated based on feedback: ${feedback}`,
    };
  }

  private buildPrompt(
    voiceProfile: VoiceProfile,
    context: OptimizationContext,
    count: number,
    formatPreference?: string
  ): string {
    const formatsSection = formatPreference
      ? `Use this format: ${formatPreference}`
      : `Choose from these high-engagement formats:\n${context.strategy.formats
          .slice(0, 4)
          .map((f) => `- ${f.name}: ${f.description}`)
          .join("\n")}`;

    return `You are ghostwriting tweets for a real person. Your job is to write tweets that:
1. Sound EXACTLY like this person wrote them (not like AI)
2. Are engaging and likely to get high engagement on Twitter
3. Cover the topic naturally without being forced

CRITICAL: You must sound human. No AI tells. No corporate speak. No buzzwords.

VOICE PROFILE OF THE PERSON YOU'RE WRITING FOR:
${this.formatVoiceProfile(voiceProfile)}

SAMPLE TWEETS FROM THIS PERSON (study their style closely):
${voiceProfile.sampleTweets.slice(0, 10).map((t, i) => `${i + 1}. "${t}"`).join("\n")}

TOPIC TO WRITE ABOUT:
${context.topic}

${formatsSection}

ENGAGEMENT HOOKS THAT WORK FOR THIS VOICE:
${context.strategy.hooks.slice(0, 5).join("\n")}

CONSTRAINTS:
- Max length: ${context.constraints.maxLength} characters
- ${context.constraints.includeHashtags ? `Include up to ${context.constraints.maxHashtags} relevant hashtag(s)` : "No hashtags"}
- ${context.constraints.includeEmojis ? "Can include emojis (this person uses them)" : "No emojis (this person doesn't use them)"}
- ${context.constraints.endWithQuestion ? "Consider ending with a question to drive replies" : ""}

THINGS TO AVOID (AI tells that make content sound fake):
- "Excited to announce" or "Thrilled to share"
- "It's important to note" or "In conclusion"
- "Furthermore" or "Additionally" or "Moreover"
- "Delve into" or "Deep dive"
- "Leverage" or "Utilize" instead of "use"
- "Unlock" or "Unleash potential"
- Starting with "As a..." or "As someone who..."
- Perfect grammar and punctuation (keep it casual like the samples)
- Overexplaining or being too thorough
- Generic advice that could apply to anyone

WHAT MAKES TWEETS GO VIRAL:
- Contrarian takes that make people think
- Personal stories with a surprising insight
- Specific numbers and concrete examples
- Emotional resonance (frustration, excitement, curiosity)
- Short, punchy sentences that are easy to read
- Questions that invite engagement

Generate exactly ${count} tweets. For each tweet, provide:
1. The tweet text
2. Which format you used
3. Brief reasoning for why this will perform well

Format your response as:
---
TWEET 1:
[tweet text]

FORMAT: [format name]
REASONING: [1 sentence on why this works]
---
TWEET 2:
[tweet text]

FORMAT: [format name]
REASONING: [1 sentence on why this works]
---
(continue for all ${count} tweets)`;
  }

  private formatVoiceProfile(profile: VoiceProfile): string {
    return `- Typical tweet length: ${profile.avgTweetLength} characters
- Tone: ${profile.toneDescriptors.join(", ")}
- Vocabulary: ${profile.vocabularyLevel}
- Sentence style: ${profile.sentenceStructures.join(", ")}
- Uses emojis: ${profile.usesEmojis ? `Yes (about ${profile.emojiFrequency} per tweet)` : "Rarely/Never"}
- Uses hashtags: ${profile.usesHashtags ? `Yes (about ${profile.hashtagFrequency} per tweet)` : "Rarely/Never"}
- Ends with questions: ${profile.questionFrequency > 0.2 ? "Often" : profile.questionFrequency > 0.1 ? "Sometimes" : "Rarely"}
- Common phrases: ${profile.commonPhrases.slice(0, 5).join(", ")}
- Topics they cover: ${Object.keys(profile.topicDistribution).slice(0, 5).join(", ")}`;
  }

  private parseResponse(
    responseText: string,
    topic: string,
    context: OptimizationContext
  ): GeneratedTweet[] {
    const tweets: GeneratedTweet[] = [];
    const sections = responseText.split(/---+/).filter((s) => s.trim());

    for (const section of sections) {
      const tweetMatch = section.match(/TWEET\s*\d*:?\s*\n([\s\S]*?)(?=\nFORMAT:|$)/i);
      const formatMatch = section.match(/FORMAT:\s*(.+)/i);
      const reasoningMatch = section.match(/REASONING:\s*(.+)/i);

      if (tweetMatch) {
        const text = tweetMatch[1].trim();

        // Skip if too long or empty
        if (!text || text.length > 280) continue;

        const score = this.optimizer.scoreTweet(text, context);

        tweets.push({
          text,
          topic,
          format: formatMatch?.[1]?.trim() || "unknown",
          engagementScore: score,
          suggestedPostTime: this.optimizer.getOptimalPostingTime(
            context.voiceProfile
          ),
          reasoning: reasoningMatch?.[1]?.trim() || "",
        });
      }
    }

    // Sort by engagement score
    return tweets.sort((a, b) => b.engagementScore - a.engagementScore);
  }
}

// Singleton
let generator: ContentGenerator | null = null;

export function getContentGenerator(): ContentGenerator {
  if (!generator) {
    generator = new ContentGenerator();
  }
  return generator;
}
