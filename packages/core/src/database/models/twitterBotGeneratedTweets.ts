import { db } from "../database";
import {
  TwitterBotGeneratedTweet,
  NewTwitterBotGeneratedTweet,
  TwitterBotGeneratedTweetUpdate,
} from "../types";

export async function findTwitterBotGeneratedTweetById(id: number) {
  return await db
    .selectFrom("twitter_bot_generated_tweets")
    .where("id", "=", id)
    .selectAll()
    .executeTakeFirst();
}

export async function findTwitterBotGeneratedTweets(
  criteria: Partial<TwitterBotGeneratedTweet>
) {
  let query = db.selectFrom("twitter_bot_generated_tweets");

  if (criteria.id) {
    query = query.where("id", "=", criteria.id);
  }

  if (criteria.twitter_username) {
    query = query.where("twitter_username", "=", criteria.twitter_username);
  }

  if (criteria.status) {
    query = query.where("status", "=", criteria.status);
  }

  return await query.selectAll().orderBy("created_at", "desc").execute();
}

export async function findPendingTwitterBotTweets(username: string) {
  return await db
    .selectFrom("twitter_bot_generated_tweets")
    .where("twitter_username", "=", username)
    .where("status", "=", "pending")
    .selectAll()
    .orderBy("engagement_score", "desc")
    .execute();
}

export async function findApprovedTwitterBotTweetsForPosting() {
  const now = new Date();
  return await db
    .selectFrom("twitter_bot_generated_tweets")
    .where("status", "=", "approved")
    .where("scheduled_for", "<=", now as any)
    .selectAll()
    .orderBy("scheduled_for", "asc")
    .execute();
}

export async function findRecentPostedTwitterBotTweets(
  username: string,
  limit: number = 10
) {
  return await db
    .selectFrom("twitter_bot_generated_tweets")
    .where("twitter_username", "=", username)
    .where("status", "=", "posted")
    .selectAll()
    .orderBy("posted_at", "desc")
    .limit(limit)
    .execute();
}

export async function createTwitterBotGeneratedTweet(
  tweet: NewTwitterBotGeneratedTweet
) {
  return await db
    .insertInto("twitter_bot_generated_tweets")
    .values(tweet)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateTwitterBotGeneratedTweet(
  id: number,
  updateWith: TwitterBotGeneratedTweetUpdate
) {
  return await db
    .updateTable("twitter_bot_generated_tweets")
    .set({ ...updateWith, updated_at: new Date().toISOString() })
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}

export async function approveTwitterBotTweet(id: number, scheduledFor?: Date) {
  return await db
    .updateTable("twitter_bot_generated_tweets")
    .set({
      status: "approved",
      scheduled_for: scheduledFor?.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}

export async function rejectTwitterBotTweet(id: number) {
  return await updateTwitterBotGeneratedTweet(id, { status: "rejected" });
}

export async function markTwitterBotTweetAsPosted(
  id: number,
  twitterTweetId: string
) {
  return await db
    .updateTable("twitter_bot_generated_tweets")
    .set({
      status: "posted",
      twitter_tweet_id: twitterTweetId,
      posted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}

export async function markTwitterBotTweetAsFailed(id: number) {
  return await updateTwitterBotGeneratedTweet(id, { status: "failed" });
}

export async function deleteTwitterBotGeneratedTweet(id: number) {
  return await db
    .deleteFrom("twitter_bot_generated_tweets")
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}
