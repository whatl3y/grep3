import { IFactoryOptions, BackgroundWorker } from "@grep3/core";
import { getTwitterClient } from "../api/twitter";
import { getVoiceAnalyzer } from "../services/VoiceAnalyzer";
import { saveVoiceProfile, getVoiceProfile } from "../database/queries";
import config from "../config";

export default function AnalysisWorkers({ log, db, redis }: IFactoryOptions) {
  const worker = BackgroundWorker(redis);
  const twitterClient = getTwitterClient();
  const voiceAnalyzer = getVoiceAnalyzer();

  return {
    /**
     * Analyze user's tweets to build voice profile
     */
    analyzeUserVoice: {
      plugins: ["Retry"],
      pluginOptions: {
        retry: {
          retryLimit: 3,
          retryDelay: 1000 * 60, // 1 minute
        },
      },
      perform: async ({
        username,
        forceRefresh = false,
      }: {
        username: string;
        forceRefresh?: boolean;
      }) => {
        log.info(`Starting voice analysis for @${username}`);

        // Check if we have a recent profile
        if (!forceRefresh) {
          const existing = await getVoiceProfile(username);
          if (existing) {
            const hoursSinceUpdate =
              (Date.now() - new Date(existing.updated_at).getTime()) /
              (1000 * 60 * 60);

            // Skip if analyzed within last 24 hours
            if (hoursSinceUpdate < 24) {
              log.info(
                `Voice profile for @${username} is recent (${Math.round(hoursSinceUpdate)}h old), skipping`
              );
              return {
                skipped: true,
                reason: "recent_profile_exists",
                lastUpdated: existing.updated_at,
              };
            }
          }
        }

        // Fetch user's tweets
        const tweets = await twitterClient.fetchUserTweets(
          username,
          config.posting.maxTweetsToAnalyze
        );

        if (tweets.length < 20) {
          log.warn(
            `Not enough tweets for @${username} (found ${tweets.length}, need 20+)`
          );
          return {
            error: "insufficient_tweets",
            tweetsFound: tweets.length,
            required: 20,
          };
        }

        // Analyze voice
        const voiceProfile = await voiceAnalyzer.analyzeVoice(tweets);

        // Save to database
        await saveVoiceProfile(username, voiceProfile, tweets.length);

        log.info(
          `Voice profile created for @${username} from ${tweets.length} tweets`
        );

        return {
          success: true,
          username,
          tweetsAnalyzed: tweets.length,
          toneDescriptors: voiceProfile.toneDescriptors,
          avgTweetLength: voiceProfile.avgTweetLength,
        };
      },
    },

    /**
     * Refresh all voice profiles (scheduled daily)
     */
    refreshAllVoiceProfiles: {
      perform: async () => {
        log.info("Starting daily voice profile refresh");

        // For now, just refresh the main configured user
        const username = config.twitter.username;
        if (!username) {
          log.warn("No TWITTER_USERNAME configured");
          return { error: "no_username_configured" };
        }

        await worker.enqueue(
          "analyzeUserVoice",
          { username, forceRefresh: true },
          config.resque.analysis
        );

        return { queued: [username] };
      },
    },
  };
}
