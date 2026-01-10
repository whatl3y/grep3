#!/usr/bin/env node
import dotenv from "dotenv";
import { getTwitterClient } from "../api/twitter";
import { getVoiceAnalyzer } from "../services/VoiceAnalyzer";
import { saveVoiceProfile } from "../database/queries";
import config from "../config";

dotenv.config({ quiet: true } as any);

async function main() {
  const username = process.argv[2] || config.twitter.username;

  if (!username) {
    console.error("Usage: npm run analyze [username]");
    console.error("Or set TWITTER_USERNAME in .env");
    process.exit(1);
  }

  console.log(`Analyzing tweets for @${username}...`);

  const twitterClient = getTwitterClient();
  const voiceAnalyzer = getVoiceAnalyzer();

  // Fetch tweets
  console.log(`Fetching up to ${config.posting.maxTweetsToAnalyze} tweets...`);
  const tweets = await twitterClient.fetchUserTweets(
    username,
    config.posting.maxTweetsToAnalyze
  );

  console.log(`Fetched ${tweets.length} tweets`);

  if (tweets.length < 20) {
    console.error("Not enough tweets for analysis (need at least 20)");
    process.exit(1);
  }

  // Analyze voice
  console.log("Analyzing voice patterns...");
  const voiceProfile = await voiceAnalyzer.analyzeVoice(tweets);

  // Save to database
  console.log("Saving voice profile...");
  await saveVoiceProfile(username, voiceProfile, tweets.length);

  // Print summary
  console.log("\n=== Voice Profile Summary ===");
  console.log(`Tweets analyzed: ${tweets.length}`);
  console.log(`Average tweet length: ${voiceProfile.avgTweetLength} chars`);
  console.log(`Tone: ${voiceProfile.toneDescriptors.join(", ")}`);
  console.log(`Vocabulary level: ${voiceProfile.vocabularyLevel}`);
  console.log(`Uses emojis: ${voiceProfile.usesEmojis ? "Yes" : "No"}`);
  console.log(`Uses hashtags: ${voiceProfile.usesHashtags ? "Yes" : "No"}`);
  console.log(
    `Question frequency: ${(voiceProfile.questionFrequency * 100).toFixed(1)}%`
  );
  console.log(`\nCommon phrases:`);
  voiceProfile.commonPhrases.slice(0, 10).forEach((phrase) => {
    console.log(`  - "${phrase}"`);
  });
  console.log(`\nTop topics:`);
  Object.entries(voiceProfile.topicDistribution)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .forEach(([topic, count]) => {
      console.log(`  - ${topic}: ${count} mentions`);
    });

  console.log("\nVoice profile saved successfully!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
