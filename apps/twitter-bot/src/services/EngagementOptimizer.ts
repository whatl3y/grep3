import { VoiceProfile } from "./VoiceAnalyzer";
import log from "../logger";

/**
 * Engagement optimization strategies based on Twitter algorithm research
 */
export interface EngagementStrategy {
  hooks: string[];
  formats: TweetFormat[];
  timingAdvice: string;
  hashtagStrategy: string;
  callToAction: string[];
}

export interface TweetFormat {
  name: string;
  description: string;
  template: string;
  engagementMultiplier: number;
}

export interface OptimizedTweetRequest {
  topic: string;
  format?: string;
  includeQuestion?: boolean;
  includeCallToAction?: boolean;
  targetLength?: "short" | "medium" | "long";
}

export interface OptimizationContext {
  voiceProfile: VoiceProfile;
  topic: string;
  strategy: EngagementStrategy;
  constraints: TweetConstraints;
}

export interface TweetConstraints {
  maxLength: number;
  includeHashtags: boolean;
  maxHashtags: number;
  includeEmojis: boolean;
  endWithQuestion: boolean;
  includeCallToAction: boolean;
}

/**
 * Optimizes tweet content for maximum engagement based on
 * Twitter algorithm patterns and user's voice profile
 */
export class EngagementOptimizer {
  // Viral hook patterns that perform well on Twitter
  private readonly hookPatterns = [
    "Unpopular opinion:",
    "Hot take:",
    "Here's what nobody tells you about",
    "I've spent [X] years",
    "Stop [doing X]. Start [doing Y].",
    "The secret to [X]:",
    "Most people [do X]. Top performers [do Y].",
    "I used to think [X]. Then I learned [Y].",
    "[Number] things I wish I knew earlier:",
    "This might be controversial, but",
    "The biggest mistake I see:",
    "What [successful people] do differently:",
    "Let me tell you about the time",
    "Everyone talks about [X]. Nobody talks about [Y].",
    "After [X years/months] of [Y], here's what I learned:",
  ];

  // High-engagement tweet formats
  private readonly formats: TweetFormat[] = [
    {
      name: "contrarian",
      description: "Challenge conventional wisdom",
      template: "[Contrarian take on {topic}]",
      engagementMultiplier: 1.8,
    },
    {
      name: "personal-story",
      description: "Share personal experience with a lesson",
      template: "I [personal experience]. Here's what it taught me about {topic}:",
      engagementMultiplier: 1.6,
    },
    {
      name: "listicle",
      description: "Numbered insights",
      template: "[X] [insights/tips/mistakes] about {topic}:\n\n1. [Point]\n2. [Point]\n3. [Point]",
      engagementMultiplier: 1.5,
    },
    {
      name: "before-after",
      description: "Transformation or evolution",
      template: "[Time period] ago: [Old state]\nToday: [New state]\n\nWhat changed: [Insight about {topic}]",
      engagementMultiplier: 1.4,
    },
    {
      name: "question-hook",
      description: "Start with an engaging question",
      template: "Why do [people/developers/founders] [do X] when {topic} [better approach]?",
      engagementMultiplier: 1.5,
    },
    {
      name: "myth-buster",
      description: "Debunk common misconceptions",
      template: "Myth: [Common belief about {topic}]\n\nReality: [Actual truth]",
      engagementMultiplier: 1.6,
    },
    {
      name: "quick-insight",
      description: "Short, punchy observation",
      template: "[Single powerful sentence about {topic}]",
      engagementMultiplier: 1.3,
    },
    {
      name: "thread-teaser",
      description: "Promise value to drive engagement",
      template: "I've [done X] for [Y years]. Here's everything I know about {topic}:\n\n[Thread teaser]",
      engagementMultiplier: 1.7,
    },
  ];

  // Call-to-action patterns that drive engagement
  private readonly callToActions = [
    "What's your take?",
    "Agree or disagree?",
    "What would you add?",
    "Share your experience below.",
    "Drop a [emoji] if you agree.",
    "Tag someone who needs to see this.",
    "Save this for later.",
    "What am I missing?",
    "Let me know your thoughts.",
    "RT if this resonates.",
  ];

  /**
   * Generate engagement strategy based on voice profile and topic
   */
  generateStrategy(voiceProfile: VoiceProfile, topic: string): EngagementStrategy {
    log.info(`Generating engagement strategy for topic: ${topic}`);

    // Filter hooks based on voice profile
    const appropriateHooks = this.hookPatterns.filter((hook) => {
      // If user is casual, allow all hooks
      if (voiceProfile.toneDescriptors.includes("casual")) return true;
      // If professional, avoid overly casual hooks
      if (voiceProfile.toneDescriptors.includes("professional")) {
        return !hook.includes("Hot take") && !hook.includes("controversial");
      }
      return true;
    });

    // Select formats based on user's patterns
    const appropriateFormats = this.formats.filter((format) => {
      // If user does short tweets, favor quick-insight format
      if (voiceProfile.avgTweetLength < 100 && format.name === "listicle") {
        return false;
      }
      return true;
    });

    // Determine hashtag strategy based on profile
    let hashtagStrategy = "none";
    if (voiceProfile.usesHashtags) {
      if (voiceProfile.hashtagFrequency > 1) {
        hashtagStrategy = "moderate (1-2 relevant hashtags)";
      } else {
        hashtagStrategy = "minimal (1 hashtag max)";
      }
    }

    // Filter CTAs based on voice
    const appropriateCTAs = this.callToActions.filter((cta) => {
      if (voiceProfile.toneDescriptors.includes("professional")) {
        return !cta.includes("Drop a") && !cta.includes("RT if");
      }
      return true;
    });

    return {
      hooks: appropriateHooks.slice(0, 10),
      formats: appropriateFormats,
      timingAdvice: this.getTimingAdvice(voiceProfile),
      hashtagStrategy,
      callToAction: appropriateCTAs,
    };
  }

  /**
   * Build optimization context for content generation
   */
  buildOptimizationContext(
    voiceProfile: VoiceProfile,
    topic: string,
    request?: OptimizedTweetRequest
  ): OptimizationContext {
    const strategy = this.generateStrategy(voiceProfile, topic);

    const constraints: TweetConstraints = {
      maxLength: this.getMaxLength(request?.targetLength, voiceProfile),
      includeHashtags: voiceProfile.usesHashtags,
      maxHashtags: Math.min(2, Math.ceil(voiceProfile.hashtagFrequency)),
      includeEmojis: voiceProfile.usesEmojis,
      endWithQuestion: request?.includeQuestion ?? voiceProfile.questionFrequency > 0.15,
      includeCallToAction: request?.includeCallToAction ?? true,
    };

    return {
      voiceProfile,
      topic,
      strategy,
      constraints,
    };
  }

  /**
   * Score a generated tweet for expected engagement
   */
  scoreTweet(tweet: string, context: OptimizationContext): number {
    let score = 50; // Base score

    // Length optimization (Twitter sweet spot is 70-100 chars for max engagement)
    const length = tweet.length;
    if (length >= 70 && length <= 100) {
      score += 15;
    } else if (length >= 50 && length <= 150) {
      score += 10;
    } else if (length > 250) {
      score -= 5;
    }

    // Hook detection
    const hasHook = context.strategy.hooks.some((hook) =>
      tweet.toLowerCase().includes(hook.toLowerCase().split(":")[0])
    );
    if (hasHook) score += 20;

    // Question engagement
    if (tweet.includes("?")) score += 10;

    // Call to action
    if (context.strategy.callToAction.some((cta) =>
      tweet.toLowerCase().includes(cta.toLowerCase().split(" ")[0])
    )) {
      score += 10;
    }

    // Number pattern (lists perform well)
    if (/\d+/.test(tweet)) score += 5;

    // Negative markers (reduce score for AI-sounding content)
    const aiMarkers = [
      "as an ai",
      "i cannot",
      "it's important to note",
      "in conclusion",
      "furthermore",
      "additionally",
      "it is worth noting",
      "one must consider",
      "delve into",
      "in the realm of",
    ];
    if (aiMarkers.some((marker) => tweet.toLowerCase().includes(marker))) {
      score -= 30;
    }

    // Check for authentic voice markers
    const commonPhrases = context.voiceProfile.commonPhrases;
    if (commonPhrases.some((phrase) => tweet.toLowerCase().includes(phrase))) {
      score += 15;
    }

    // Emoji alignment
    const hasEmoji = /[\u{1F300}-\u{1F9FF}]/u.test(tweet);
    if (hasEmoji === context.voiceProfile.usesEmojis) {
      score += 5;
    } else {
      score -= 10; // Mismatch with usual style
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Suggest optimal posting time based on profile
   */
  getOptimalPostingTime(voiceProfile: VoiceProfile): Date {
    const now = new Date();
    const currentHour = now.getUTCHours();

    // Find next optimal hour
    const preferredHours = voiceProfile.postingTimePreferences.length > 0
      ? voiceProfile.postingTimePreferences
      : [9, 12, 15, 18, 21]; // Defaults

    const nextHour = preferredHours.find((h) => h > currentHour) ?? preferredHours[0];

    const scheduledTime = new Date(now);
    if (nextHour <= currentHour) {
      scheduledTime.setUTCDate(scheduledTime.getUTCDate() + 1);
    }
    scheduledTime.setUTCHours(nextHour, 0, 0, 0);

    return scheduledTime;
  }

  private getTimingAdvice(voiceProfile: VoiceProfile): string {
    const hours = voiceProfile.postingTimePreferences;
    if (hours.length === 0) {
      return "Post during peak hours: 9am-12pm and 5pm-8pm in your timezone";
    }

    const formatted = hours.slice(0, 3).map((h) => {
      const ampm = h >= 12 ? "pm" : "am";
      const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
      return `${hour12}${ampm} UTC`;
    });

    return `Your best performing times: ${formatted.join(", ")}`;
  }

  private getMaxLength(
    target: "short" | "medium" | "long" | undefined,
    profile: VoiceProfile
  ): number {
    if (target === "short") return 100;
    if (target === "long") return 280;
    if (target === "medium") return 180;

    // Base on user's typical length
    if (profile.avgTweetLength < 100) return 120;
    if (profile.avgTweetLength > 200) return 280;
    return 180;
  }
}

// Singleton
let optimizer: EngagementOptimizer | null = null;

export function getEngagementOptimizer(): EngagementOptimizer {
  if (!optimizer) {
    optimizer = new EngagementOptimizer();
  }
  return optimizer;
}
