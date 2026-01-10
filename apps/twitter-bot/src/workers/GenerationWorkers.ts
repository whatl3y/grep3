import { IFactoryOptions, BackgroundWorker } from "@grep3/core";
import { getContentGenerator } from "../services/ContentGenerator";
import {
  getVoiceProfile,
  saveGeneratedTweet,
  getPostingSchedule,
  getPendingTweets,
} from "../database/queries";
import config from "../config";

export default function GenerationWorkers({ log, db, redis }: IFactoryOptions) {
  const worker = BackgroundWorker(redis);
  const contentGenerator = getContentGenerator();

  return {
    /**
     * Generate tweets for a specific topic
     */
    generateTweets: {
      plugins: ["Retry"],
      pluginOptions: {
        retry: {
          retryLimit: 2,
          retryDelay: 1000 * 30,
        },
      },
      perform: async ({
        username,
        topic,
        count = 3,
      }: {
        username: string;
        topic: string;
        count?: number;
      }) => {
        log.info(`Generating ${count} tweets about "${topic}" for @${username}`);

        // Get voice profile
        const profileRecord = await getVoiceProfile(username);
        if (!profileRecord) {
          log.error(`No voice profile found for @${username}`);
          return { error: "no_voice_profile" };
        }

        const voiceProfile = profileRecord.profile_data;

        // Generate tweets
        const tweets = await contentGenerator.generateTweets({
          topic,
          voiceProfile,
          count,
        });

        // Save to database
        const savedTweets = [];
        for (const tweet of tweets) {
          const saved = await saveGeneratedTweet(username, tweet);
          savedTweets.push({
            id: saved.id,
            text: tweet.text,
            score: tweet.engagementScore,
          });
        }

        log.info(`Generated and saved ${savedTweets.length} tweets for @${username}`);

        return {
          success: true,
          username,
          topic,
          tweetsGenerated: savedTweets,
        };
      },
    },

    /**
     * Generate daily tweets based on user's schedule and topics
     */
    generateDailyTweets: {
      perform: async ({ username }: { username: string }) => {
        log.info(`Starting daily tweet generation for @${username}`);

        // Get schedule
        const schedule = await getPostingSchedule(username);
        if (!schedule || !schedule.is_active) {
          log.info(`No active schedule for @${username}`);
          return { skipped: true, reason: "no_active_schedule" };
        }

        // Check existing pending tweets
        const pending = await getPendingTweets(username);
        const neededTweets = schedule.tweets_per_day - pending.length;

        if (neededTweets <= 0) {
          log.info(
            `@${username} already has ${pending.length} pending tweets, skipping generation`
          );
          return {
            skipped: true,
            reason: "sufficient_pending_tweets",
            pendingCount: pending.length,
          };
        }

        // Generate for each topic
        const topics = schedule.topics;
        const tweetsPerTopic = Math.ceil(neededTweets / topics.length);

        for (const topic of topics) {
          await worker.enqueue(
            "generateTweets",
            {
              username,
              topic,
              count: tweetsPerTopic,
            },
            config.resque.generation
          );
        }

        log.info(
          `Queued generation of ${neededTweets} tweets across ${topics.length} topics for @${username}`
        );

        return {
          success: true,
          username,
          tweetsToGenerate: neededTweets,
          topics,
        };
      },
    },

    /**
     * Master job: Generate daily tweets for all active users
     */
    generateAllDailyTweets: {
      perform: async () => {
        log.info("Starting daily tweet generation for all users");

        // For now, just the configured user
        const username = config.twitter.username;
        if (!username) {
          return { error: "no_username_configured" };
        }

        await worker.enqueue(
          "generateDailyTweets",
          { username },
          config.resque.generation
        );

        return { queued: [username] };
      },
    },

    /**
     * Regenerate a specific tweet with feedback
     */
    regenerateTweet: {
      perform: async ({
        username,
        originalText,
        feedback,
        topic,
      }: {
        username: string;
        originalText: string;
        feedback: string;
        topic: string;
      }) => {
        log.info(`Regenerating tweet for @${username} with feedback`);

        const profileRecord = await getVoiceProfile(username);
        if (!profileRecord) {
          return { error: "no_voice_profile" };
        }

        const newTweet = await contentGenerator.regenerateTweet(
          originalText,
          feedback,
          profileRecord.profile_data,
          topic
        );

        const saved = await saveGeneratedTweet(username, newTweet);

        return {
          success: true,
          newTweet: {
            id: saved.id,
            text: newTweet.text,
            score: newTweet.engagementScore,
          },
        };
      },
    },
  };
}
