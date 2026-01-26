export type Platform =
  | "twitter"
  | "linkedin"
  | "facebook"
  | "instagram"
  | "tiktok"
  | "github"
  | "website";

export interface SocialLinksInput {
  twitter?: string;
  linkedin?: string;
  facebook?: string;
  instagram?: string;
  tiktok?: string;
  github?: string;
  website?: string;
}

export type PlatformStatus = "pending" | "scraping" | "success" | "failed" | "skipped";

export interface GenerationProgress {
  step: string;
  platform?: Platform;
  progress: number;
  platformStatuses: Record<Platform, PlatformStatus>;
}

export interface PortfolioMetadata {
  generatedAt: string;
  platformsAnalyzed: Platform[];
  platformsFailed: Platform[];
  tokensUsed: number;
}

export interface GeneratedPortfolio {
  html: string;
  metadata: PortfolioMetadata;
}

export type GenerationStatus =
  | "pending"
  | "scraping"
  | "analyzing"
  | "generating"
  | "complete"
  | "error";

export interface GenerateResponse {
  sessionId: string;
  status: GenerationStatus;
}

export interface StatusEvent {
  type: "progress" | "complete" | "error";
  data: GenerationProgress | GeneratedPortfolio | { error: string };
}
