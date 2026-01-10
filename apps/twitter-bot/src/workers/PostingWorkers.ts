import { IFactoryOptions, BackgroundWorker } from "@grep3/core";
import { getTwitterClient } from "../api/twitter";
import {
  getApprovedTweetsForPosting,
  updateTweetStatus,
  updateLastPostTime,
  canPostNow,
  getPostingSchedule,
} from "../database/queries";
import config from "../config";

export default function PostingWorkers({ log, db, redis }: IFactoryOptions) {
  const worker = BackgroundWorker(redis);
  const twitterClient = getTwitterClient();

  return {
    /**
     * Post a specific tweet
     */
    postTweet: {
      plugins: ["Retry"],
      pluginOptions: {
        retry: {
          retryLimit: 2,
          retryDelay: 1000 * 60 * 5, // 5 minutes
        },
      },
      perform: async ({
        tweetId,
        skipRateLimit = false,
      }: {
        tweetId: number;
        skipRateLimit?: boolean;
      }) => {
        log.info(`Attempting to post tweet ID: ${tweetId}`);

        // Get the tweet from DB
        const tweets = await getApprovedTweetsForPosting();
        const tweet = tweets.find((t) => t.id === tweetId);

        if (!tweet) {
          log.warn(`Tweet ${tweetId} not found or not approved`);
          return { error: "tweet_not_found_or_not_approved" };
        }

        // Check rate limits (skip for manual approvals)
        if (!skipRateLimit) {
          const canPost = await canPostNow(tweet.twitter_username);
          if (!canPost) {
            log.info(
              `Rate limit: too soon to post for @${tweet.twitter_username}`
            );
            return { error: "rate_limited", retryLater: true };
          }
        }

        try {
          // Post to Twitter
          const result = await twitterClient.postTweet({ text: tweet.text });

          // Update database
          await updateTweetStatus(tweetId, "posted", {
            twitter_tweet_id: result.id,
            posted_at: new Date().toISOString(),
          });

          await updateLastPostTime(tweet.twitter_username);

          log.info(
            `Successfully posted tweet ${tweetId} as Twitter ID: ${result.id}`
          );

          return {
            success: true,
            tweetId,
            twitterId: result.id,
            text: result.text,
          };
        } catch (error: any) {
          log.error(`Failed to post tweet ${tweetId}:`, error);

          // Mark as failed and throw for permanent errors
          if (error.code === 403 || error.code === 401) {
            await updateTweetStatus(tweetId, "failed");
            throw new Error(
              `Twitter API error ${error.code}: ${error.data?.detail || error.message}`
            );
          }

          throw error; // Let retry handle transient errors
        }
      },
    },

    /**
     * Process all approved tweets ready for posting
     */
    processScheduledPosts: {
      perform: async () => {
        log.info("Processing scheduled posts");

        const approvedTweets = await getApprovedTweetsForPosting();
        log.info(`Found ${approvedTweets.length} approved tweets ready to post`);

        let queued = 0;
        const byUser = new Map<string, typeof approvedTweets>();

        // Group by user
        for (const tweet of approvedTweets) {
          const userTweets = byUser.get(tweet.twitter_username) || [];
          userTweets.push(tweet);
          byUser.set(tweet.twitter_username, userTweets);
        }

        // Queue one tweet per user (respecting rate limits)
        for (const [username, tweets] of byUser) {
          const canPost = await canPostNow(username);
          if (!canPost) {
            log.debug(`Skipping @${username}: too soon since last post`);
            continue;
          }

          // Post the highest-scoring tweet
          const bestTweet = tweets.sort(
            (a, b) => (b.engagement_score ?? 0) - (a.engagement_score ?? 0)
          )[0];

          await worker.enqueue(
            "postTweet",
            { tweetId: bestTweet.id },
            config.resque.posting
          );
          queued++;
        }

        log.info(`Queued ${queued} tweets for posting`);
        return { processed: approvedTweets.length, queued };
      },
    },

    /**
     * Auto-approve and schedule tweets for auto-post users
     */
    autoApproveAndSchedule: {
      perform: async ({ username }: { username: string }) => {
        log.info(`Auto-approving tweets for @${username}`);

        const schedule = await getPostingSchedule(username);
        if (!schedule || !schedule.auto_post) {
          log.info(`Auto-post not enabled for @${username}`);
          return { skipped: true, reason: "auto_post_disabled" };
        }

        // This would approve pending tweets automatically
        // For safety, we'll require manual approval by default
        // Users can enable auto_post in their schedule settings

        return {
          message: "Auto-approve feature available when auto_post is enabled",
        };
      },
    },
  };
}
