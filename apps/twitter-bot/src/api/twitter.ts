import { TwitterApi, TweetV2, UserV2 } from "twitter-api-v2";
import config from "../config";
import log from "../logger";

export interface TweetData {
  id: string;
  text: string;
  createdAt: Date;
  metrics: {
    likes: number;
    retweets: number;
    replies: number;
    impressions: number;
    quotes: number;
    bookmarks: number;
  };
  isReply: boolean;
  isRetweet: boolean;
  hasMedia: boolean;
  hasLinks: boolean;
  hashtags: string[];
  mentions: string[];
}

export interface PostTweetOptions {
  text: string;
  replyToId?: string;
  quoteId?: string;
}

export class TwitterClient {
  private client: TwitterApi;
  private readOnlyClient: TwitterApi;

  constructor() {
    // Read-write client for posting
    this.client = new TwitterApi({
      appKey: config.twitter.apiKey!,
      appSecret: config.twitter.apiSecret!,
      accessToken: config.twitter.accessToken!,
      accessSecret: config.twitter.accessSecret!,
    });

    // Read-only client with bearer token for fetching data
    this.readOnlyClient = new TwitterApi(config.twitter.bearerToken!);
  }

  /**
   * Post a new tweet
   */
  async postTweet(options: PostTweetOptions): Promise<{ id: string; text: string }> {
    const { text, replyToId, quoteId } = options;

    log.info(`Posting tweet: ${text.substring(0, 50)}...`);

    const tweetOptions: any = {};

    if (replyToId) {
      tweetOptions.reply = { in_reply_to_tweet_id: replyToId };
    }

    if (quoteId) {
      tweetOptions.quote_tweet_id = quoteId;
    }

    const result = await this.client.v2.tweet(text, tweetOptions);

    log.info(`Tweet posted successfully: ${result.data.id}`);

    return {
      id: result.data.id,
      text: result.data.text,
    };
  }

  /**
   * Fetch user's tweet history for voice analysis
   */
  async fetchUserTweets(
    username: string,
    maxResults: number = 100
  ): Promise<TweetData[]> {
    log.info(`Fetching tweets for @${username}, max: ${maxResults}`);

    // First, get the user ID
    const user = await this.readOnlyClient.v2.userByUsername(username, {
      "user.fields": ["id", "public_metrics"],
    });

    if (!user.data) {
      throw new Error(`User @${username} not found`);
    }

    const userId = user.data.id;
    const tweets: TweetData[] = [];
    let paginationToken: string | undefined;

    while (tweets.length < maxResults) {
      const remaining = Math.min(100, maxResults - tweets.length);

      const response = await this.readOnlyClient.v2.userTimeline(userId, {
        max_results: remaining,
        pagination_token: paginationToken,
        "tweet.fields": [
          "created_at",
          "public_metrics",
          "entities",
          "referenced_tweets",
          "attachments",
        ],
        exclude: ["replies", "retweets"], // Focus on original tweets
      });

      if (!response.data.data) break;

      for (const tweet of response.data.data) {
        tweets.push(this.parseTweet(tweet));
      }

      paginationToken = response.data.meta.next_token;
      if (!paginationToken) break;

      // Rate limit protection
      await this.delay(1000);
    }

    log.info(`Fetched ${tweets.length} tweets for @${username}`);
    return tweets;
  }

  /**
   * Fetch user's top performing tweets for learning viral patterns
   */
  async fetchTopTweets(
    username: string,
    limit: number = 50
  ): Promise<TweetData[]> {
    const allTweets = await this.fetchUserTweets(username, 200);

    // Sort by engagement (weighted score)
    const sorted = allTweets.sort((a, b) => {
      const scoreA = this.calculateEngagementScore(a);
      const scoreB = this.calculateEngagementScore(b);
      return scoreB - scoreA;
    });

    return sorted.slice(0, limit);
  }

  /**
   * Get current user info
   */
  async getCurrentUser(): Promise<UserV2> {
    const me = await this.client.v2.me({
      "user.fields": ["public_metrics", "description", "created_at"],
    });
    return me.data;
  }

  /**
   * Check rate limits
   */
  async getRateLimits(): Promise<{ remaining: number; reset: Date }> {
    // Twitter API v2 doesn't expose rate limits directly
    // We'll track this manually in the service
    return {
      remaining: 50, // Conservative estimate
      reset: new Date(Date.now() + 15 * 60 * 1000), // 15 min window
    };
  }

  private parseTweet(tweet: TweetV2): TweetData {
    const metrics = tweet.public_metrics || {
      like_count: 0,
      retweet_count: 0,
      reply_count: 0,
      impression_count: 0,
      quote_count: 0,
      bookmark_count: 0,
    };

    return {
      id: tweet.id,
      text: tweet.text,
      createdAt: new Date(tweet.created_at || Date.now()),
      metrics: {
        likes: metrics.like_count || 0,
        retweets: metrics.retweet_count || 0,
        replies: metrics.reply_count || 0,
        impressions: metrics.impression_count || 0,
        quotes: metrics.quote_count || 0,
        bookmarks: metrics.bookmark_count || 0,
      },
      isReply: !!tweet.referenced_tweets?.some((r) => r.type === "replied_to"),
      isRetweet: !!tweet.referenced_tweets?.some((r) => r.type === "retweeted"),
      hasMedia: !!tweet.attachments?.media_keys?.length,
      hasLinks: !!tweet.entities?.urls?.length,
      hashtags: tweet.entities?.hashtags?.map((h) => h.tag) || [],
      mentions: tweet.entities?.mentions?.map((m) => m.username) || [],
    };
  }

  private calculateEngagementScore(tweet: TweetData): number {
    const { likes, retweets, replies, quotes, bookmarks } = tweet.metrics;

    // Weighted engagement score
    // Retweets and quotes are most valuable (amplification)
    // Bookmarks indicate high-value content
    // Likes and replies are base engagement
    return (
      likes * 1 +
      replies * 2 +
      retweets * 3 +
      quotes * 4 +
      bookmarks * 2
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
let twitterClient: TwitterClient | null = null;

export function getTwitterClient(): TwitterClient {
  if (!twitterClient) {
    twitterClient = new TwitterClient();
  }
  return twitterClient;
}
