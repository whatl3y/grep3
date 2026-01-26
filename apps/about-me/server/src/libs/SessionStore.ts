import { EventEmitter } from "events";
import {
  GenerationSession,
  SocialLinksInput,
  GenerationStatus,
  GenerationProgress,
  Platform,
  PlatformStatus,
  ProfileData,
  PersonalityAnalysis,
  GeneratedPortfolio,
} from "../types";
import config from "../config";
import log from "../logger";

const PLATFORMS: Platform[] = [
  "twitter",
  "linkedin",
  "facebook",
  "instagram",
  "tiktok",
  "github",
  "website",
];

class SessionStore {
  private sessions: Map<string, GenerationSession> = new Map();
  private eventEmitter: EventEmitter = new EventEmitter();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup interval
    this.cleanupInterval = setInterval(
      () => this.cleanupExpiredSessions(),
      60 * 1000 // Check every minute
    );
  }

  /**
   * Create a new generation session
   */
  createSession(socialLinks: SocialLinksInput): GenerationSession {
    const id = this.generateId();
    const now = new Date();

    // Initialize platform statuses based on provided links
    const platformStatuses: Record<Platform, PlatformStatus> = {} as Record<
      Platform,
      PlatformStatus
    >;

    for (const platform of PLATFORMS) {
      const linkKey = platform as keyof SocialLinksInput;
      platformStatuses[platform] = socialLinks[linkKey] ? "pending" : "skipped";
    }

    const session: GenerationSession = {
      id,
      socialLinks,
      status: "pending",
      progress: {
        step: "Initializing...",
        progress: 0,
        platformStatuses,
      },
      profiles: [],
      analysis: null,
      portfolio: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(id, session);
    log.info(`Created session: ${id}`);

    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(id: string): GenerationSession | undefined {
    return this.sessions.get(id);
  }

  /**
   * Update session status
   */
  updateStatus(id: string, status: GenerationStatus): void {
    const session = this.sessions.get(id);
    if (session) {
      session.status = status;
      session.updatedAt = new Date();
      this.emitProgress(id);
    }
  }

  /**
   * Update session progress
   */
  updateProgress(
    id: string,
    step: string,
    progress: number,
    platform?: Platform
  ): void {
    const session = this.sessions.get(id);
    if (session) {
      session.progress.step = step;
      session.progress.progress = progress;
      if (platform) {
        session.progress.platform = platform;
      }
      session.updatedAt = new Date();
      this.emitProgress(id);
    }
  }

  /**
   * Update platform status
   */
  updatePlatformStatus(
    id: string,
    platform: Platform,
    status: PlatformStatus
  ): void {
    const session = this.sessions.get(id);
    if (session) {
      session.progress.platformStatuses[platform] = status;
      session.updatedAt = new Date();
      this.emitProgress(id);
    }
  }

  /**
   * Add a scraped profile to the session
   */
  addProfile(id: string, profile: ProfileData): void {
    const session = this.sessions.get(id);
    if (session) {
      session.profiles.push(profile);
      session.updatedAt = new Date();
    }
  }

  /**
   * Set the personality analysis
   */
  setAnalysis(id: string, analysis: PersonalityAnalysis): void {
    const session = this.sessions.get(id);
    if (session) {
      session.analysis = analysis;
      session.updatedAt = new Date();
    }
  }

  /**
   * Set the generated portfolio
   */
  setPortfolio(id: string, portfolio: GeneratedPortfolio): void {
    const session = this.sessions.get(id);
    if (session) {
      session.portfolio = portfolio;
      session.updatedAt = new Date();
    }
  }

  /**
   * Set an error on the session
   */
  setError(id: string, error: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.error = error;
      session.status = "error";
      session.updatedAt = new Date();
      this.emitError(id, error);
    }
  }

  /**
   * Mark session as complete
   */
  markComplete(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.status = "complete";
      session.progress.progress = 100;
      session.progress.step = "Complete!";
      session.updatedAt = new Date();
      this.emitComplete(id);
    }
  }

  /**
   * Subscribe to progress events for a session
   */
  subscribeToProgress(
    id: string,
    callback: (event: {
      type: "progress" | "complete" | "error";
      data: GenerationProgress | GeneratedPortfolio | { error: string };
    }) => void
  ): () => void {
    const progressHandler = (data: GenerationProgress) => {
      callback({ type: "progress", data });
    };
    const completeHandler = () => {
      const session = this.sessions.get(id);
      if (session?.portfolio) {
        callback({ type: "complete", data: session.portfolio });
      }
    };
    const errorHandler = (error: string) => {
      callback({ type: "error", data: { error } });
    };

    this.eventEmitter.on(`progress:${id}`, progressHandler);
    this.eventEmitter.on(`complete:${id}`, completeHandler);
    this.eventEmitter.on(`error:${id}`, errorHandler);

    // Return unsubscribe function
    return () => {
      this.eventEmitter.off(`progress:${id}`, progressHandler);
      this.eventEmitter.off(`complete:${id}`, completeHandler);
      this.eventEmitter.off(`error:${id}`, errorHandler);
    };
  }

  private emitProgress(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      this.eventEmitter.emit(`progress:${id}`, session.progress);
    }
  }

  private emitComplete(id: string): void {
    this.eventEmitter.emit(`complete:${id}`);
  }

  private emitError(id: string, error: string): void {
    this.eventEmitter.emit(`error:${id}`, error);
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const ttlMs = config.sessions.ttlMinutes * 60 * 1000;
    let cleaned = 0;

    for (const [id, session] of this.sessions) {
      if (now - session.createdAt.getTime() > ttlMs) {
        this.sessions.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      log.info(`Cleaned up ${cleaned} expired sessions`);
    }
  }

  /**
   * Stop the cleanup interval (for shutdown)
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Export singleton instance
export const sessionStore = new SessionStore();
