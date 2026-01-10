import { TwitterBotVoiceProfileData } from "@grep3/core";
import { TweetData } from "../api/twitter";
import log from "../logger";

// Re-export the type from core for use elsewhere in the app
export type VoiceProfile = TwitterBotVoiceProfileData;

export interface TweetPattern {
  pattern: string;
  description: string;
  avgEngagement: number;
  examples: string[];
}

export class VoiceAnalyzer {
  /**
   * Analyze tweets to extract a voice profile
   */
  async analyzeVoice(tweets: TweetData[]): Promise<VoiceProfile> {
    log.info(`Analyzing voice from ${tweets.length} tweets`);

    const originalTweets = tweets.filter((t) => !t.isReply && !t.isRetweet);

    if (originalTweets.length < 10) {
      throw new Error(
        "Not enough original tweets to analyze. Need at least 10 non-reply, non-retweet tweets."
      );
    }

    const profile: VoiceProfile = {
      avgTweetLength: this.calculateAvgLength(originalTweets),
      avgSentenceLength: this.calculateAvgSentenceLength(originalTweets),
      usesEmojis: this.detectEmojiUsage(originalTweets),
      emojiFrequency: this.calculateEmojiFrequency(originalTweets),
      usesHashtags: this.detectHashtagUsage(originalTweets),
      hashtagFrequency: this.calculateHashtagFrequency(originalTweets),
      usesMentions: this.detectMentionUsage(originalTweets),
      mentionFrequency: this.calculateMentionFrequency(originalTweets),
      toneDescriptors: this.analyzeTone(originalTweets),
      commonPhrases: this.extractCommonPhrases(originalTweets),
      vocabularyLevel: this.assessVocabularyLevel(originalTweets),
      sentenceStructures: this.analyzeSentenceStructures(originalTweets),
      topicDistribution: this.analyzeTopics(originalTweets),
      questionFrequency: this.calculateQuestionFrequency(originalTweets),
      exclamationFrequency: this.calculateExclamationFrequency(originalTweets),
      threadFrequency: 0, // Would need additional API calls to detect
      bestPerformingPatterns: this.extractBestPatterns(originalTweets),
      postingTimePreferences: this.analyzePostingTimes(originalTweets),
      sampleTweets: this.selectSampleTweets(originalTweets),
    };

    log.info(`Voice profile created with ${profile.toneDescriptors.length} tone descriptors`);
    return profile;
  }

  private calculateAvgLength(tweets: TweetData[]): number {
    const total = tweets.reduce((sum, t) => sum + t.text.length, 0);
    return Math.round(total / tweets.length);
  }

  private calculateAvgSentenceLength(tweets: TweetData[]): number {
    const allText = tweets.map((t) => t.text).join(" ");
    const sentences = allText.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    if (sentences.length === 0) return 0;

    const wordCounts = sentences.map((s) => s.trim().split(/\s+/).length);
    return Math.round(wordCounts.reduce((a, b) => a + b, 0) / sentences.length);
  }

  private detectEmojiUsage(tweets: TweetData[]): boolean {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
    const tweetsWithEmojis = tweets.filter((t) => emojiRegex.test(t.text));
    return tweetsWithEmojis.length / tweets.length > 0.1; // More than 10% have emojis
  }

  private calculateEmojiFrequency(tweets: TweetData[]): number {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
    const totalEmojis = tweets.reduce((sum, t) => {
      const matches = t.text.match(emojiRegex);
      return sum + (matches ? matches.length : 0);
    }, 0);
    return Math.round((totalEmojis / tweets.length) * 100) / 100;
  }

  private detectHashtagUsage(tweets: TweetData[]): boolean {
    const tweetsWithHashtags = tweets.filter((t) => t.hashtags.length > 0);
    return tweetsWithHashtags.length / tweets.length > 0.15;
  }

  private calculateHashtagFrequency(tweets: TweetData[]): number {
    const totalHashtags = tweets.reduce((sum, t) => sum + t.hashtags.length, 0);
    return Math.round((totalHashtags / tweets.length) * 100) / 100;
  }

  private detectMentionUsage(tweets: TweetData[]): boolean {
    const tweetsWithMentions = tweets.filter((t) => t.mentions.length > 0);
    return tweetsWithMentions.length / tweets.length > 0.1;
  }

  private calculateMentionFrequency(tweets: TweetData[]): number {
    const totalMentions = tweets.reduce((sum, t) => sum + t.mentions.length, 0);
    return Math.round((totalMentions / tweets.length) * 100) / 100;
  }

  private analyzeTone(tweets: TweetData[]): string[] {
    const tones: string[] = [];
    const allText = tweets.map((t) => t.text.toLowerCase()).join(" ");

    // Technical indicators
    const techTerms = /\b(api|code|deploy|build|debug|refactor|ship|pr|merge|git|docker|kubernetes|aws|react|node|python|rust|typescript)\b/gi;
    if ((allText.match(techTerms) || []).length > tweets.length * 0.2) {
      tones.push("technical");
    }

    // Casual indicators
    const casualTerms = /\b(lol|lmao|gonna|wanna|kinda|tbh|ngl|fr|bruh|vibe|lowkey|highkey)\b/gi;
    if ((allText.match(casualTerms) || []).length > tweets.length * 0.05) {
      tones.push("casual");
    }

    // Professional indicators
    const professionalTerms = /\b(strategy|leverage|optimize|scale|growth|revenue|metrics|stakeholders|roadmap)\b/gi;
    if ((allText.match(professionalTerms) || []).length > tweets.length * 0.1) {
      tones.push("professional");
    }

    // Humor indicators (questions, wordplay, irony markers)
    if (this.calculateQuestionFrequency(tweets) > 0.2) {
      tones.push("conversational");
    }

    // Direct/confident indicators
    const directTerms = /\b(just|simply|here's|stop|start|never|always|best|worst)\b/gi;
    if ((allText.match(directTerms) || []).length > tweets.length * 0.3) {
      tones.push("direct");
    }

    // Add default if none detected
    if (tones.length === 0) {
      tones.push("neutral");
    }

    return tones;
  }

  private extractCommonPhrases(tweets: TweetData[]): string[] {
    const phrases: Map<string, number> = new Map();

    for (const tweet of tweets) {
      // Extract 2-4 word phrases
      const words = tweet.text
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 2);

      for (let i = 0; i < words.length - 1; i++) {
        const bigram = `${words[i]} ${words[i + 1]}`;
        phrases.set(bigram, (phrases.get(bigram) || 0) + 1);

        if (i < words.length - 2) {
          const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
          phrases.set(trigram, (phrases.get(trigram) || 0) + 1);
        }
      }
    }

    // Filter common stopword phrases and sort by frequency
    const stopwords = new Set([
      "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
      "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
      "this", "that", "it", "its", "i", "you", "we", "they", "he", "she",
    ]);

    return Array.from(phrases.entries())
      .filter(([phrase, count]) => {
        const words = phrase.split(" ");
        const isStopwordPhrase = words.every((w) => stopwords.has(w));
        return count >= 3 && !isStopwordPhrase;
      })
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([phrase]) => phrase);
  }

  private assessVocabularyLevel(tweets: TweetData[]): "simple" | "moderate" | "advanced" {
    const allText = tweets.map((t) => t.text).join(" ");
    const words = allText.split(/\s+/).filter((w) => w.length > 0);
    const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;

    // Complex/technical word patterns
    const complexWords = /\b\w{10,}\b/g;
    const complexWordCount = (allText.match(complexWords) || []).length;
    const complexRatio = complexWordCount / words.length;

    if (avgWordLength > 6 && complexRatio > 0.1) {
      return "advanced";
    } else if (avgWordLength > 5 || complexRatio > 0.05) {
      return "moderate";
    }
    return "simple";
  }

  private analyzeSentenceStructures(tweets: TweetData[]): string[] {
    const structures: string[] = [];

    // Analyze sentence length distribution
    const lengths = tweets.map((t) => t.text.length);
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;

    if (avgLength < 100) {
      structures.push("short and punchy");
    } else if (avgLength > 200) {
      structures.push("detailed and elaborate");
    } else {
      structures.push("balanced length");
    }

    // Check for lists/bullet points
    const listTweets = tweets.filter((t) => /^\d+\.|^[-•]/m.test(t.text));
    if (listTweets.length / tweets.length > 0.1) {
      structures.push("uses lists");
    }

    // Check for question-based engagement
    const questionTweets = tweets.filter((t) => t.text.includes("?"));
    if (questionTweets.length / tweets.length > 0.2) {
      structures.push("question-driven");
    }

    return structures;
  }

  private analyzeTopics(tweets: TweetData[]): Record<string, number> {
    const topicKeywords: Record<string, string[]> = {
      "software development": ["code", "coding", "programming", "developer", "software", "engineer", "build", "ship", "deploy", "bug", "debug", "refactor"],
      "crypto": ["crypto", "bitcoin", "btc", "eth", "ethereum", "blockchain", "defi", "nft", "web3", "token", "wallet", "dex"],
      "web3": ["web3", "decentralized", "dao", "smart contract", "dapp", "onchain", "offchain"],
      "ai": ["ai", "ml", "machine learning", "gpt", "llm", "chatgpt", "claude", "artificial intelligence", "neural", "model"],
      "startups": ["startup", "founder", "vc", "fundraise", "pitch", "mvp", "product", "launch", "growth", "scale"],
      "career": ["career", "job", "hire", "hiring", "interview", "resume", "salary", "promotion", "team", "leadership"],
      "life": ["life", "health", "fitness", "productivity", "habits", "mindset", "motivation", "learn", "grow"],
    };

    const distribution: Record<string, number> = {};
    const allText = tweets.map((t) => t.text.toLowerCase()).join(" ");

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      let count = 0;
      for (const keyword of keywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, "gi");
        count += (allText.match(regex) || []).length;
      }
      if (count > 0) {
        distribution[topic] = count;
      }
    }

    return distribution;
  }

  private calculateQuestionFrequency(tweets: TweetData[]): number {
    const questionsCount = tweets.filter((t) => t.text.includes("?")).length;
    return Math.round((questionsCount / tweets.length) * 100) / 100;
  }

  private calculateExclamationFrequency(tweets: TweetData[]): number {
    const exclamationCount = tweets.filter((t) => t.text.includes("!")).length;
    return Math.round((exclamationCount / tweets.length) * 100) / 100;
  }

  private extractBestPatterns(tweets: TweetData[]): TweetPattern[] {
    // Sort by engagement
    const sorted = [...tweets].sort((a, b) => {
      const scoreA = a.metrics.likes + a.metrics.retweets * 2 + a.metrics.replies;
      const scoreB = b.metrics.likes + b.metrics.retweets * 2 + b.metrics.replies;
      return scoreB - scoreA;
    });

    const topTweets = sorted.slice(0, 20);
    const patterns: TweetPattern[] = [];

    // Detect common patterns in top tweets
    const startsWithI = topTweets.filter((t) => /^I\s/i.test(t.text));
    if (startsWithI.length >= 3) {
      patterns.push({
        pattern: "personal-story",
        description: "Starts with personal narrative (I...)",
        avgEngagement: this.avgEngagement(startsWithI),
        examples: startsWithI.slice(0, 3).map((t) => t.text),
      });
    }

    const hasQuestion = topTweets.filter((t) => t.text.includes("?"));
    if (hasQuestion.length >= 3) {
      patterns.push({
        pattern: "question-hook",
        description: "Includes questions to drive engagement",
        avgEngagement: this.avgEngagement(hasQuestion),
        examples: hasQuestion.slice(0, 3).map((t) => t.text),
      });
    }

    const shortTweets = topTweets.filter((t) => t.text.length < 100);
    if (shortTweets.length >= 3) {
      patterns.push({
        pattern: "concise-insight",
        description: "Short, punchy observations",
        avgEngagement: this.avgEngagement(shortTweets),
        examples: shortTweets.slice(0, 3).map((t) => t.text),
      });
    }

    const listTweets = topTweets.filter((t) => /\d+[.)]|\n[-•]/.test(t.text));
    if (listTweets.length >= 2) {
      patterns.push({
        pattern: "list-format",
        description: "Numbered or bulleted lists",
        avgEngagement: this.avgEngagement(listTweets),
        examples: listTweets.slice(0, 3).map((t) => t.text),
      });
    }

    return patterns;
  }

  private avgEngagement(tweets: TweetData[]): number {
    if (tweets.length === 0) return 0;
    const total = tweets.reduce(
      (sum, t) =>
        sum + t.metrics.likes + t.metrics.retweets * 2 + t.metrics.replies,
      0
    );
    return Math.round(total / tweets.length);
  }

  private analyzePostingTimes(tweets: TweetData[]): number[] {
    const hourCounts: Map<number, { count: number; engagement: number }> = new Map();

    for (const tweet of tweets) {
      const hour = tweet.createdAt.getUTCHours();
      const engagement =
        tweet.metrics.likes + tweet.metrics.retweets + tweet.metrics.replies;

      const existing = hourCounts.get(hour) || { count: 0, engagement: 0 };
      hourCounts.set(hour, {
        count: existing.count + 1,
        engagement: existing.engagement + engagement,
      });
    }

    // Sort by average engagement per hour
    const hourlyEngagement = Array.from(hourCounts.entries())
      .map(([hour, data]) => ({
        hour,
        avgEngagement: data.engagement / data.count,
      }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement);

    // Return top 5 hours
    return hourlyEngagement.slice(0, 5).map((h) => h.hour);
  }

  private selectSampleTweets(tweets: TweetData[]): string[] {
    // Sort by engagement
    const sorted = [...tweets].sort((a, b) => {
      const scoreA = a.metrics.likes + a.metrics.retweets * 2 + a.metrics.replies;
      const scoreB = b.metrics.likes + b.metrics.retweets * 2 + b.metrics.replies;
      return scoreB - scoreA;
    });

    return sorted.slice(0, 20).map((t) => t.text);
  }
}

// Singleton
let voiceAnalyzer: VoiceAnalyzer | null = null;

export function getVoiceAnalyzer(): VoiceAnalyzer {
  if (!voiceAnalyzer) {
    voiceAnalyzer = new VoiceAnalyzer();
  }
  return voiceAnalyzer;
}
