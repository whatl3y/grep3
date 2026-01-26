import { TwitterApi, TweetV2 } from "twitter-api-v2";
import { BaseScraper, ScraperResult } from "./BaseScraper";
import { ProfileData, PostData } from "../types";
import config from "../config";
import log from "../logger";

export class TwitterScraper extends BaseScraper {
  private client: TwitterApi | null = null;

  constructor() {
    super("twitter");
  }

  private getClient(): TwitterApi {
    if (!this.client) {
      if (!config.twitter.bearerToken) {
        throw new Error("Twitter bearer token not configured");
      }
      this.client = new TwitterApi(config.twitter.bearerToken);
    }
    return this.client;
  }

  async scrape(identifier: string): Promise<ScraperResult> {
    const username = this.parseUsername(identifier);

    try {
      const client = this.getClient();

      // Fetch user profile
      log.info(`Fetching Twitter profile for @${username}`);

      const userResponse = await this.withTimeout(
        client.v2.userByUsername(username, {
          "user.fields": [
            "id",
            "name",
            "username",
            "description",
            "profile_image_url",
            "public_metrics",
            "url",
            "location",
          ],
        })
      );

      if (!userResponse.data) {
        return this.createErrorResult(`User @${username} not found`, username);
      }

      const user = userResponse.data;
      const userId = user.id;

      // Fetch user's tweets
      log.info(`Fetching tweets for @${username}`);

      const tweetsResponse = await this.withTimeout(
        client.v2.userTimeline(userId, {
          max_results: Math.min(config.scraping.maxPostsPerPlatform, 100),
          "tweet.fields": [
            "created_at",
            "public_metrics",
            "entities",
            "referenced_tweets",
            "attachments",
          ],
          exclude: ["retweets"], // Include replies but not pure retweets
        })
      );

      const posts: PostData[] = [];

      if (tweetsResponse.data.data) {
        for (const tweet of tweetsResponse.data.data) {
          posts.push(this.parseTweet(tweet));
        }
      }

      const metrics = user.public_metrics;

      const profileData: ProfileData = {
        platform: "twitter",
        username: user.username,
        displayName: user.name,
        bio: user.description || null,
        profileImageUrl: user.profile_image_url?.replace("_normal", "_400x400") || null,
        followerCount: metrics?.followers_count || null,
        followingCount: metrics?.following_count || null,
        postCount: metrics?.tweet_count || null,
        posts,
        error: null,
        success: true,
      };

      return this.createSuccessResult(profileData);
    } catch (err: unknown) {
      const error = err as Error;
      log.error(`Twitter scrape error for @${username}: ${error.message}`);

      // Check for specific Twitter API errors
      if (error.message.includes("401") || error.message.includes("403")) {
        return this.createErrorResult(
          "Twitter API authentication failed - check your bearer token",
          username
        );
      }

      if (error.message.includes("404")) {
        return this.createErrorResult(`User @${username} not found`, username);
      }

      if (error.message.includes("429")) {
        return this.createErrorResult(
          "Twitter API rate limit exceeded - try again later",
          username
        );
      }

      return this.createErrorResult(error.message, username);
    }
  }

  private parseTweet(tweet: TweetV2): PostData {
    const metrics = tweet.public_metrics || {
      like_count: 0,
      retweet_count: 0,
      reply_count: 0,
    };

    // Extract hashtags
    const hashtags = tweet.entities?.hashtags?.map((h) => h.tag) || [];

    // Check for media
    const mediaUrls: string[] = [];
    if (tweet.attachments?.media_keys) {
      // Note: Would need to include media in expansions to get actual URLs
      // For now, just note that media exists
    }

    return this.createPost({
      id: tweet.id,
      text: tweet.text,
      timestamp: this.parseDate(tweet.created_at),
      likes: metrics.like_count || 0,
      comments: metrics.reply_count || 0,
      shares: metrics.retweet_count || 0,
      mediaUrls,
      hashtags,
    });
  }
}

// Export singleton factory
let instance: TwitterScraper | null = null;

export function getTwitterScraper(): TwitterScraper {
  if (!instance) {
    instance = new TwitterScraper();
  }
  return instance;
}
