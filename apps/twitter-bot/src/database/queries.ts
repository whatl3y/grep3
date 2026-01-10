// Wrapper functions for twitter-bot app that use the core model functions
// with the interface expected by this app's services and workers

import {
  findTwitterBotVoiceProfileByUsername,
  upsertTwitterBotVoiceProfile,
  createTwitterBotGeneratedTweet,
  findPendingTwitterBotTweets,
  findApprovedTwitterBotTweetsForPosting,
  findRecentPostedTwitterBotTweets,
  updateTwitterBotGeneratedTweet,
  approveTwitterBotTweet,
  rejectTwitterBotTweet,
  markTwitterBotTweetAsPosted,
  markTwitterBotTweetAsFailed,
  findTwitterBotPostingScheduleByUsername,
  upsertTwitterBotPostingSchedule,
  findActiveTwitterBotPostingSchedules,
  updateTwitterBotLastPostTime,
  canTwitterBotPostNow,
  type TwitterBotVoiceProfile,
  type TwitterBotGeneratedTweet,
  type TwitterBotPostingSchedule,
  type TwitterBotVoiceProfileData,
} from "@grep3/core";
import { GeneratedTweet } from "../services/ContentGenerator";

// Type aliases for backward compatibility
export type VoiceProfileRecord = TwitterBotVoiceProfile;
export type GeneratedTweetRecord = TwitterBotGeneratedTweet;
export type PostingScheduleRecord = TwitterBotPostingSchedule;

// Re-export types
export type { TwitterBotVoiceProfileData };

// Voice Profile functions
export async function getVoiceProfile(username: string) {
  return await findTwitterBotVoiceProfileByUsername(username);
}

export async function saveVoiceProfile(
  username: string,
  profile: TwitterBotVoiceProfileData,
  tweetsAnalyzed: number
) {
  return await upsertTwitterBotVoiceProfile(username, profile, tweetsAnalyzed);
}

// Generated Tweet functions
export async function saveGeneratedTweet(
  username: string,
  tweet: GeneratedTweet
) {
  const now = new Date().toISOString();
  return await createTwitterBotGeneratedTweet({
    twitter_username: username,
    text: tweet.text,
    topic: tweet.topic,
    format: tweet.format,
    engagement_score: tweet.engagementScore,
    reasoning: tweet.reasoning,
    status: "pending",
    scheduled_for: tweet.suggestedPostTime.toISOString(),
    updated_at: now,
  });
}

export async function getPendingTweets(username: string) {
  return await findPendingTwitterBotTweets(username);
}

export async function getApprovedTweetsForPosting() {
  return await findApprovedTwitterBotTweetsForPosting();
}

export async function getRecentPostedTweets(username: string, limit = 10) {
  return await findRecentPostedTwitterBotTweets(username, limit);
}

export async function updateTweetStatus(
  id: number,
  status: string,
  additionalFields?: {
    twitter_tweet_id?: string;
    posted_at?: string;
  }
) {
  if (status === "posted" && additionalFields?.twitter_tweet_id) {
    return await markTwitterBotTweetAsPosted(id, additionalFields.twitter_tweet_id);
  } else if (status === "failed") {
    return await markTwitterBotTweetAsFailed(id);
  } else {
    return await updateTwitterBotGeneratedTweet(id, { status });
  }
}

export async function approveTweet(id: number, scheduledFor?: Date) {
  return await approveTwitterBotTweet(id, scheduledFor);
}

export async function rejectTweet(id: number) {
  return await rejectTwitterBotTweet(id);
}

export async function updateTweetText(id: number, text: string) {
  return await updateTwitterBotGeneratedTweet(id, { text });
}

// Posting Schedule functions
export async function getPostingSchedule(username: string) {
  return await findTwitterBotPostingScheduleByUsername(username);
}

export async function savePostingSchedule(
  username: string,
  schedule: Partial<PostingScheduleRecord>
) {
  return await upsertTwitterBotPostingSchedule(username, {
    tweets_per_day: schedule.tweets_per_day,
    min_hours_between_posts: schedule.min_hours_between_posts,
    topics: schedule.topics ? JSON.stringify(schedule.topics) : undefined,
    auto_post: schedule.auto_post,
    is_active: schedule.is_active,
  });
}

export async function getActiveSchedules() {
  return await findActiveTwitterBotPostingSchedules();
}

export async function updateLastPostTime(username: string) {
  return await updateTwitterBotLastPostTime(username);
}

export async function canPostNow(username: string) {
  return await canTwitterBotPostNow(username);
}
