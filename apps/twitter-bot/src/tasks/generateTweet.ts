#!/usr/bin/env node
import dotenv from "dotenv";
import { getVoiceProfile, saveGeneratedTweet } from "../database/queries";
import { getContentGenerator } from "../services/ContentGenerator";
import config from "../config";

dotenv.config({ quiet: true } as any);

async function main() {
  const topics = config.posting.topics;
  const randomTopic = topics[Math.floor(Math.random() * topics.length)];
  const topic = process.argv[2] || randomTopic;
  const count = parseInt(process.argv[3] || "3", 10);
  const username = config.twitter.username;

  if (!username) {
    console.error("TWITTER_USERNAME not set in .env");
    process.exit(1);
  }

  console.log(`Generating ${count} tweet(s) about "${topic}"...`);

  // Get voice profile
  const profileRecord = await getVoiceProfile(username);
  if (!profileRecord) {
    console.error(
      `No voice profile found for @${username}. Run 'npm run analyze' first.`
    );
    process.exit(1);
  }

  const voiceProfile = profileRecord.profile_data;
  const generator = getContentGenerator();

  // Generate tweets
  const tweets = await generator.generateTweets({
    topic,
    voiceProfile,
    count,
  });

  console.log(`\n=== Generated ${tweets.length} Tweet(s) ===\n`);

  for (let i = 0; i < tweets.length; i++) {
    const tweet = tweets[i];
    console.log(`--- Tweet ${i + 1} ---`);
    console.log(`Text: ${tweet.text}`);
    console.log(`Format: ${tweet.format}`);
    console.log(`Engagement Score: ${tweet.engagementScore}/100`);
    console.log(`Reasoning: ${tweet.reasoning}`);
    console.log(`Suggested Post Time: ${tweet.suggestedPostTime.toISOString()}`);
    console.log(`Length: ${tweet.text.length} chars`);
    console.log("");

    // Save to database
    const saved = await saveGeneratedTweet(username, tweet);
    console.log(`Saved as pending tweet ID: ${saved.id}`);
    console.log("");
  }

  console.log(
    "Tweets saved as pending. Use the web dashboard to approve and post."
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
