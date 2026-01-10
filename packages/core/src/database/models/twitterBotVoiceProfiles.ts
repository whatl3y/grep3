import { db } from "../database";
import {
  TwitterBotVoiceProfile,
  NewTwitterBotVoiceProfile,
  TwitterBotVoiceProfileUpdate,
  TwitterBotVoiceProfileData,
} from "../types";

export async function findTwitterBotVoiceProfileById(id: number) {
  return await db
    .selectFrom("twitter_bot_voice_profiles")
    .where("id", "=", id)
    .selectAll()
    .executeTakeFirst();
}

export async function findTwitterBotVoiceProfileByUsername(username: string) {
  return await db
    .selectFrom("twitter_bot_voice_profiles")
    .where("twitter_username", "=", username)
    .selectAll()
    .executeTakeFirst();
}

export async function findTwitterBotVoiceProfiles(
  criteria: Partial<TwitterBotVoiceProfile>
) {
  let query = db.selectFrom("twitter_bot_voice_profiles");

  if (criteria.id) {
    query = query.where("id", "=", criteria.id);
  }

  if (criteria.twitter_username) {
    query = query.where("twitter_username", "=", criteria.twitter_username);
  }

  return await query.selectAll().execute();
}

export async function createTwitterBotVoiceProfile(
  profile: NewTwitterBotVoiceProfile
) {
  return await db
    .insertInto("twitter_bot_voice_profiles")
    .values(profile)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function upsertTwitterBotVoiceProfile(
  username: string,
  profileData: TwitterBotVoiceProfileData,
  tweetsAnalyzed: number
) {
  const now = new Date().toISOString();

  return await db
    .insertInto("twitter_bot_voice_profiles")
    .values({
      twitter_username: username,
      profile_data: JSON.stringify(profileData),
      tweets_analyzed: tweetsAnalyzed,
      last_analyzed_at: now,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.column("twitter_username").doUpdateSet({
        profile_data: JSON.stringify(profileData),
        tweets_analyzed: tweetsAnalyzed,
        last_analyzed_at: now,
        updated_at: now,
      })
    )
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateTwitterBotVoiceProfile(
  id: number,
  updateWith: TwitterBotVoiceProfileUpdate
) {
  return await db
    .updateTable("twitter_bot_voice_profiles")
    .set({ ...updateWith, updated_at: new Date().toISOString() })
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}

export async function deleteTwitterBotVoiceProfile(id: number) {
  return await db
    .deleteFrom("twitter_bot_voice_profiles")
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirst();
}
