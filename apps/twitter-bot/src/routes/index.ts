import { Express, Request, Response } from "express";
import { BackgroundWorker } from "@grep3/core";
import {
  getPendingTweets,
  getRecentPostedTweets,
  getVoiceProfile,
  getPostingSchedule,
  approveTweet,
  rejectTweet,
  savePostingSchedule,
  updateTweetText,
} from "../database/queries";
import config from "../config";
import log from "../logger";
import redis from "../redis";

export default function bindRoutes(app: Express) {
  const worker = BackgroundWorker(redis);

  // Health check
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", app: config.appName });
  });

  // Dashboard - main page
  app.get("/", async (req: Request, res: Response) => {
    try {
      const username = config.twitter.username || "";

      const [pendingTweets, recentPosts, voiceProfile, schedule] =
        await Promise.all([
          getPendingTweets(username),
          getRecentPostedTweets(username, 10),
          getVoiceProfile(username),
          getPostingSchedule(username),
        ]);

      res.render("dashboard", {
        username,
        pendingTweets,
        recentPosts,
        voiceProfile: voiceProfile?.profile_data,
        schedule,
        config: {
          tweetsPerDay: config.posting.tweetsPerDay,
          topics: config.posting.topics,
          autoPost: config.posting.autoPost,
        },
      });
    } catch (error: any) {
      log.error("Dashboard error:", error);
      res.status(500).render("error", { error: error.message });
    }
  });

  // API: Get pending tweets
  app.get("/api/tweets/pending", async (req: Request, res: Response) => {
    try {
      const username = config.twitter.username || "";
      const tweets = await getPendingTweets(username);
      res.json({ tweets });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // API: Approve a tweet
  app.post("/api/tweets/:id/approve", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const scheduledFor = req.body?.scheduledFor
        ? new Date(req.body.scheduledFor)
        : new Date();

      await approveTweet(id, scheduledFor);

      // Queue for posting if scheduled for now
      // skipRateLimit=true for manual approvals since user explicitly chose to post
      if (scheduledFor <= new Date()) {
        await worker.enqueue(
          "postTweet",
          { tweetId: id, skipRateLimit: true },
          config.resque.posting
        );
      }

      res.json({ success: true, id });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // API: Reject a tweet
  app.post("/api/tweets/:id/reject", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      await rejectTweet(id);
      res.json({ success: true, id });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // API: Update tweet text
  app.put("/api/tweets/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { text } = req.body;

      if (!text || typeof text !== "string") {
        res.status(400).json({ error: "text is required" });
        return;
      }

      if (text.length > 280) {
        res.status(400).json({ error: "Tweet exceeds 280 characters" });
        return;
      }

      const updated = await updateTweetText(id, text);
      res.json({ success: true, tweet: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // API: Generate new tweets
  app.post("/api/generate", async (req: Request, res: Response) => {
    try {
      const { topic, count = 3 } = req.body;
      const username = config.twitter.username || "";

      await worker.enqueue(
        "generateTweets",
        { username, topic, count },
        config.resque.generation
      );

      res.json({
        success: true,
        message: `Queued generation of ${count} tweets about "${topic}"`,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // API: Analyze voice
  app.post("/api/analyze", async (req: Request, res: Response) => {
    try {
      const username = config.twitter.username || "";
      const forceRefresh = req.body.forceRefresh === true;

      await worker.enqueue(
        "analyzeUserVoice",
        { username, forceRefresh },
        config.resque.analysis
      );

      res.json({
        success: true,
        message: `Queued voice analysis for @${username}`,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // API: Get voice profile
  app.get("/api/voice-profile", async (req: Request, res: Response) => {
    try {
      const username = config.twitter.username || "";
      const profile = await getVoiceProfile(username);

      if (!profile) {
        res.status(404).json({ error: "No voice profile found" });
        return;
      }

      res.json({
        username: profile.twitter_username,
        tweetsAnalyzed: profile.tweets_analyzed,
        lastAnalyzed: profile.last_analyzed_at,
        profile: profile.profile_data,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // API: Update schedule
  app.post("/api/schedule", async (req: Request, res: Response) => {
    try {
      const username = config.twitter.username || "";
      const schedule = await savePostingSchedule(username, req.body);
      res.json({ success: true, schedule });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // API: Regenerate tweet with feedback
  app.post("/api/tweets/:id/regenerate", async (req: Request, res: Response) => {
    try {
      const { originalText, feedback, topic } = req.body;
      const username = config.twitter.username || "";

      await worker.enqueue(
        "regenerateTweet",
        { username, originalText, feedback, topic },
        config.resque.generation
      );

      res.json({
        success: true,
        message: "Queued tweet regeneration with feedback",
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}
