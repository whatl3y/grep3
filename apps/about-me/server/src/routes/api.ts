import { Router, Request, Response } from "express";
import type { Router as IRouter } from "express";
import { sessionStore } from "../libs/SessionStore";
import { scrapeAllProfiles } from "../scrapers";
import { analyzeProfiles } from "../services/ProfileAnalyzer";
import { generatePortfolio } from "../services/PortfolioGenerator";
import { GenerateRequest, Platform } from "../types";
import log from "../logger";

const router: IRouter = Router();

/**
 * POST /api/generate
 * Start the portfolio generation process
 */
router.post("/generate", async (req: Request, res: Response) => {
  try {
    const { socialLinks } = req.body as GenerateRequest;

    if (!socialLinks || Object.keys(socialLinks).length === 0) {
      res.status(400).json({ error: "At least one social link is required" });
      return;
    }

    // Validate that at least one valid link is provided
    const validLinks = Object.entries(socialLinks).filter(
      ([_, value]) => value && typeof value === "string" && value.trim().length > 0
    );

    if (validLinks.length === 0) {
      res.status(400).json({ error: "At least one valid social link is required" });
      return;
    }

    // Create a new session
    const session = sessionStore.createSession(socialLinks);

    log.info(`Starting generation for session ${session.id}`);

    // Start the async processing
    processGeneration(session.id).catch((err) => {
      log.error(`Generation error for session ${session.id}:`, err);
      sessionStore.setError(session.id, err.message);
    });

    res.json({
      sessionId: session.id,
      status: session.status,
    });
  } catch (err: unknown) {
    const error = err as Error;
    log.error("Error starting generation:", error);
    res.status(500).json({ error: "Failed to start generation" });
  }
});

/**
 * GET /api/status/:sessionId
 * Server-Sent Events endpoint for progress updates
 */
router.get("/status/:sessionId", (req: Request, res: Response) => {
  const { sessionId } = req.params;

  const session = sessionStore.getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // Send initial status
  const initialData = {
    type: "progress",
    data: session.progress,
  };
  res.write(`data: ${JSON.stringify(initialData)}\n\n`);

  // If already complete, send complete event and close
  if (session.status === "complete" && session.portfolio) {
    res.write(`data: ${JSON.stringify({ type: "complete", data: session.portfolio })}\n\n`);
    res.end();
    return;
  }

  // If already errored, send error event and close
  if (session.status === "error" && session.error) {
    res.write(`data: ${JSON.stringify({ type: "error", data: { error: session.error } })}\n\n`);
    res.end();
    return;
  }

  // Subscribe to progress updates
  const unsubscribe = sessionStore.subscribeToProgress(sessionId, (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);

    // Close connection on complete or error
    if (event.type === "complete" || event.type === "error") {
      setTimeout(() => {
        res.end();
      }, 100);
    }
  });

  // Handle client disconnect
  req.on("close", () => {
    unsubscribe();
  });
});

/**
 * GET /api/result/:sessionId
 * Get the final generated portfolio
 */
router.get("/result/:sessionId", (req: Request, res: Response) => {
  const { sessionId } = req.params;

  const session = sessionStore.getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (session.status === "error") {
    res.status(500).json({ error: session.error || "Generation failed" });
    return;
  }

  if (session.status !== "complete" || !session.portfolio) {
    res.status(202).json({
      status: session.status,
      message: "Generation in progress",
      progress: session.progress,
    });
    return;
  }

  res.json(session.portfolio);
});

/**
 * GET /api/session/:sessionId
 * Get full session details (for debugging)
 */
router.get("/session/:sessionId", (req: Request, res: Response) => {
  const { sessionId } = req.params;

  const session = sessionStore.getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  // Return session without the full portfolio HTML (it's large)
  res.json({
    id: session.id,
    status: session.status,
    progress: session.progress,
    profilesCount: session.profiles.length,
    hasAnalysis: !!session.analysis,
    hasPortfolio: !!session.portfolio,
    error: session.error,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  });
});

/**
 * Main processing function - runs asynchronously
 */
async function processGeneration(sessionId: string): Promise<void> {
  const session = sessionStore.getSession(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  let totalTokensUsed = 0;

  try {
    // Phase 1: Scraping
    sessionStore.updateStatus(sessionId, "scraping");
    sessionStore.updateProgress(sessionId, "Scraping social profiles...", 10);

    log.info(`[${sessionId}] Starting scraping phase`);

    const profiles = await scrapeAllProfiles(
      session.socialLinks,
      (platform: Platform, status) => {
        sessionStore.updatePlatformStatus(sessionId, platform, status);
      }
    );

    // Add profiles to session
    for (const profile of profiles) {
      sessionStore.addProfile(sessionId, profile);
    }

    sessionStore.updateProgress(sessionId, "Profiles scraped", 40);
    log.info(`[${sessionId}] Scraped ${profiles.length} profiles`);

    // Check if we have any useful data
    const successfulProfiles = profiles.filter((p) => p.success);
    if (successfulProfiles.length === 0) {
      // Check if we have any partial data
      const hasAnyData = profiles.some(
        (p) => p.displayName || p.bio || p.posts.length > 0
      );
      if (!hasAnyData) {
        throw new Error(
          "Could not retrieve data from any platform. Please check your links and try again."
        );
      }
    }

    // Phase 2: Analysis
    sessionStore.updateStatus(sessionId, "analyzing");
    sessionStore.updateProgress(sessionId, "Analyzing personality...", 50);

    log.info(`[${sessionId}] Starting analysis phase`);

    const analysisResult = await analyzeProfiles(profiles);
    totalTokensUsed += analysisResult.tokensUsed;

    sessionStore.setAnalysis(sessionId, analysisResult.analysis);
    sessionStore.updateProgress(sessionId, "Analysis complete", 70);

    log.info(`[${sessionId}] Analysis complete`);

    // Phase 3: Portfolio Generation
    sessionStore.updateStatus(sessionId, "generating");
    sessionStore.updateProgress(sessionId, "Generating portfolio...", 80);

    log.info(`[${sessionId}] Starting portfolio generation`);

    const portfolioResult = await generatePortfolio(
      profiles,
      analysisResult.analysis
    );
    totalTokensUsed += portfolioResult.tokensUsed;

    // Update metadata with total tokens
    portfolioResult.portfolio.metadata.tokensUsed = totalTokensUsed;

    sessionStore.setPortfolio(sessionId, portfolioResult.portfolio);
    sessionStore.updateProgress(sessionId, "Portfolio generated", 95);

    log.info(`[${sessionId}] Portfolio generated`);

    // Complete
    sessionStore.markComplete(sessionId);
    log.info(`[${sessionId}] Generation complete, ${totalTokensUsed} total tokens used`);
  } catch (err: unknown) {
    const error = err as Error;
    log.error(`[${sessionId}] Generation failed: ${error.message}`);
    sessionStore.setError(sessionId, error.message);
    throw error;
  }
}

export default router;
