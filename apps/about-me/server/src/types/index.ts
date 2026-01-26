// Social platform identifiers
export type Platform =
  | "twitter"
  | "linkedin"
  | "facebook"
  | "instagram"
  | "tiktok"
  | "github"
  | "website";

// Input from user
export interface SocialLinksInput {
  twitter?: string; // @username or full URL
  linkedin?: string; // Full profile URL
  facebook?: string; // Full profile/page URL
  instagram?: string; // @username or full URL
  tiktok?: string; // @username or full URL
  github?: string; // Username or full URL
  website?: string; // Full URL to personal website
}

// Scraped profile data
export interface ProfileData {
  platform: Platform;
  username: string;
  displayName: string | null;
  bio: string | null;
  profileImageUrl: string | null;
  followerCount: number | null;
  followingCount: number | null;
  postCount: number | null;
  posts: PostData[];
  // GitHub-specific fields
  repos?: RepoData[];
  languages?: Record<string, number>;
  contributions?: number;
  // Website-specific fields
  websiteContent?: WebsiteContent;
  // Status
  error: string | null;
  success: boolean;
}

export interface PostData {
  id: string;
  text: string;
  timestamp: Date;
  likes: number;
  comments: number;
  shares: number;
  mediaUrls: string[];
  hashtags: string[];
}

export interface RepoData {
  name: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  url: string;
  topics: string[];
}

export interface WebsiteContent {
  title: string | null;
  description: string | null;
  mainContent: string;
  links: string[];
  images: string[];
}

// AI Analysis Result
export interface PersonalityAnalysis {
  summary: string;
  interests: string[];
  communicationStyle: string;
  toneDescriptors: string[];
  topicsOfExpertise: string[];
  contentThemes: ContentTheme[];
  professionalInfo: ProfessionalInfo | null;
  personalityTraits: PersonalityTrait[];
  socialMetrics: SocialMetrics;
  designRecommendation: DesignRecommendation;
}

export interface ContentTheme {
  theme: string;
  frequency: number; // 0-100
  samplePosts: string[];
}

export interface ProfessionalInfo {
  currentRole: string | null;
  company: string | null;
  industry: string | null;
  skills: string[];
  experience: string | null;
}

export interface PersonalityTrait {
  trait: string;
  score: number; // 0-100
  evidence: string;
}

export interface SocialMetrics {
  totalFollowers: number;
  totalPosts: number;
  avgEngagement: number;
  mostActivePlatform: Platform;
}

export interface DesignRecommendation {
  style: "developer" | "creative" | "professional" | "casual" | "minimal";
  colorScheme: string;
  typography: string;
  layoutStyle: string;
  reasoning: string;
}

// Generated Portfolio
export interface GeneratedPortfolio {
  html: string;
  metadata: PortfolioMetadata;
}

export interface PortfolioMetadata {
  generatedAt: Date;
  platformsAnalyzed: Platform[];
  platformsFailed: Platform[];
  tokensUsed: number;
}

// Session & Progress
export interface GenerationSession {
  id: string;
  socialLinks: SocialLinksInput;
  status: GenerationStatus;
  progress: GenerationProgress;
  profiles: ProfileData[];
  analysis: PersonalityAnalysis | null;
  portfolio: GeneratedPortfolio | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type GenerationStatus =
  | "pending"
  | "scraping"
  | "analyzing"
  | "generating"
  | "complete"
  | "error";

export interface GenerationProgress {
  step: string;
  platform?: Platform;
  progress: number; // 0-100
  platformStatuses: Record<Platform, PlatformStatus>;
}

export type PlatformStatus = "pending" | "scraping" | "success" | "failed" | "skipped";

// API Types
export interface GenerateRequest {
  socialLinks: SocialLinksInput;
}

export interface GenerateResponse {
  sessionId: string;
  status: GenerationStatus;
}

export interface StatusEvent {
  type: "progress" | "complete" | "error";
  data: GenerationProgress | GeneratedPortfolio | { error: string };
}
