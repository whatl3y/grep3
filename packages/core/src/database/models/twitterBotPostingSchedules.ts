import { db } from "../database";
import {
  TwitterBotPostingSchedule,
  NewTwitterBotPostingSchedule,
  TwitterBotPostingScheduleUpdate,
} from "../types";

export async function findTwitterBotPostingScheduleById(id: number) {
  return await db
    .selectFrom("twitter_bot_posting_schedules")
    .where("id", "=", id)
    .selectAll()
    .executeTakeFirst();
}

export async function findTwitterBotPostingScheduleByUsername(username: string) {
  return await db
    .selectFrom("twitter_bot_posting_schedules")
    .where("twitter_username", "=", username)
    .selectAll()
    .executeTakeFirst();
}

export async function findActiveTwitterBotPostingSchedules() {
  return await db
    .selectFrom("twitter_bot_posting_schedules")
    .where("is_active", "=", true)
    .selectAll()
    .execute();
}

export async function findTwitterBotPostingSchedules(
  criteria: Partial<TwitterBotPostingSchedule>
) {
  let query = db.selectFrom("twitter_bot_posting_schedules");

  if (criteria.id) {
    query = query.where("id", "=", criteria.id);
  }

  if (criteria.twitter_username) {
    query = query.where("twitter_username", "=", criteria.twitter_username);
  }

  if (criteria.is_active !== undefined) {
    query = query.where("is_active", "=", criteria.is_active);
  }

  return await query.selectAll().execute();
}

export async function createTwitterBotPostingSchedule(
  schedule: NewTwitterBotPostingSchedule
) {
  return await db
    .insertInto("twitter_bot_posting_schedules")
    .values(schedule)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function upsertTwitterBotPostingSchedule(
  username: string,
  schedule: Partial<Omit<NewTwitterBotPostingSchedule, "twitter_username">>
) {
  const now = new Date().toISOString();

  return await db
    .insertInto("twitter_bot_posting_schedules")
    .values({
      twitter_username: username,
      tweets_per_day: schedule.tweets_per_day ?? 3,
      min_hours_between_posts: schedule.min_hours_between_posts ?? 4,
      topics: schedule.topics ?? JSON.stringify(["software development", "crypto", "web3"]),
      auto_post: schedule.auto_post ?? false,
      is_active: schedule.is_active ?? true,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.column("twitter_username").doUpdateSet({
        tweets_per_day: schedule.tweets_per_day,
        min_hours_between_posts: schedule.min_hours_between_posts,
        topics: schedule.topics,
        auto_post: schedule.auto_post,
        is_active: schedule.is_active,
        updated_at: now,
      })
    )
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateTwitterBotPostingSchedule(
  id: number,
  updateWith: TwitterBotPostingScheduleUpdate
) {
  return await db
    .updateTable("twitter_bot_posting_schedules")
    .set({ ...updateWith, updated_at: new Date().toISOString() })
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}

export async function updateTwitterBotLastPostTime(username: string) {
  const now = new Date().toISOString();

  return await db
    .updateTable("twitter_bot_posting_schedules")
    .set({ last_post_at: now, updated_at: now })
    .where("twitter_username", "=", username)
    .returningAll()
    .executeTakeFirst();
}

export async function canTwitterBotPostNow(username: string): Promise<boolean> {
  const schedule = await findTwitterBotPostingScheduleByUsername(username);
  if (!schedule) return false;

  if (!schedule.last_post_at) return true;

  const hoursSinceLastPost =
    (Date.now() - new Date(schedule.last_post_at).getTime()) / (1000 * 60 * 60);

  return hoursSinceLastPost >= schedule.min_hours_between_posts;
}

export async function deleteTwitterBotPostingSchedule(id: number) {
  return await db
    .deleteFrom("twitter_bot_posting_schedules")
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}
