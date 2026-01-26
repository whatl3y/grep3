import {
  ProfileData,
  PersonalityAnalysis,
  DesignRecommendation,
  Platform,
} from "../types";
import { createChatCompletion, parseJsonResponse } from "./OpenAIService";
import log from "../logger";

const ANALYSIS_SYSTEM_PROMPT = `You are an expert personality analyst and digital identity specialist. Your task is to analyze social media data and create a comprehensive personality profile that will be used to generate a personalized portfolio website.

IMPORTANT: Return ONLY a valid JSON object matching the exact structure specified. No explanations or markdown.

Analyze the provided social media profiles to identify:
1. Core interests and topics they discuss
2. Communication style (professional, casual, technical, creative, humorous)
3. Personality traits with evidence
4. Areas of expertise
5. Professional background (if detectable)
6. Design recommendation based on their personality

For the design recommendation:
- "developer": For tech-focused individuals (programmers, engineers, data scientists)
- "creative": For artistic individuals (designers, artists, photographers, musicians)
- "professional": For business/corporate individuals (executives, consultants, marketers)
- "casual": For social/lifestyle-focused individuals (influencers, lifestyle bloggers)
- "minimal": For individuals who prefer clean, understated aesthetics`;

export interface AnalysisResult {
  analysis: PersonalityAnalysis;
  tokensUsed: number;
}

/**
 * Analyze scraped profiles to generate a personality profile
 */
export async function analyzeProfiles(
  profiles: ProfileData[]
): Promise<AnalysisResult> {
  // Build the data payload for analysis
  const profilesData = profiles
    .filter((p) => p.success || p.displayName || p.bio || p.posts.length > 0)
    .map((profile) => ({
      platform: profile.platform,
      username: profile.username,
      displayName: profile.displayName,
      bio: profile.bio,
      followerCount: profile.followerCount,
      followingCount: profile.followingCount,
      postCount: profile.postCount,
      // Include GitHub-specific data
      repos: profile.repos?.slice(0, 5),
      languages: profile.languages,
      // Include website content
      websiteContent: profile.websiteContent
        ? {
            title: profile.websiteContent.title,
            description: profile.websiteContent.description,
            mainContent: profile.websiteContent.mainContent?.substring(0, 1000),
          }
        : undefined,
      // Include posts for analysis
      posts: profile.posts.slice(0, 10).map((post) => ({
        text: post.text,
        likes: post.likes,
        comments: post.comments,
        hashtags: post.hashtags,
      })),
    }));

  if (profilesData.length === 0) {
    log.warn("No valid profile data to analyze");
    return {
      analysis: createDefaultAnalysis(profiles),
      tokensUsed: 0,
    };
  }

  const userPrompt = `Analyze these social media profiles and return a JSON object with the following structure:

{
  "summary": "2-3 sentence personality summary",
  "interests": ["interest1", "interest2", ...],
  "communicationStyle": "professional|casual|technical|creative|humorous",
  "toneDescriptors": ["descriptor1", "descriptor2", ...],
  "topicsOfExpertise": ["topic1", "topic2", ...],
  "contentThemes": [
    {"theme": "theme name", "frequency": 85, "samplePosts": ["post excerpt"]}
  ],
  "professionalInfo": {
    "currentRole": "Job Title or null",
    "company": "Company Name or null",
    "industry": "Industry or null",
    "skills": ["skill1", "skill2"],
    "experience": "Brief summary or null"
  },
  "personalityTraits": [
    {"trait": "Trait Name", "score": 85, "evidence": "Why this trait applies"}
  ],
  "socialMetrics": {
    "totalFollowers": 15000,
    "totalPosts": 500,
    "avgEngagement": 2.5,
    "mostActivePlatform": "twitter"
  },
  "designRecommendation": {
    "style": "developer|creative|professional|casual|minimal",
    "colorScheme": "Description of recommended colors",
    "typography": "Description of recommended fonts",
    "layoutStyle": "Description of layout approach",
    "reasoning": "Why this design fits the person"
  }
}

Profile Data:
${JSON.stringify(profilesData, null, 2)}`;

  log.info(`Analyzing ${profilesData.length} profiles with OpenAI`);

  try {
    const result = await createChatCompletion(
      [
        { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      {
        maxTokens: 4000,
        temperature: 0.7,
        jsonMode: true,
      }
    );

    const analysis = parseJsonResponse<PersonalityAnalysis>(result.content);

    // Validate and fill in defaults for any missing fields
    const validatedAnalysis = validateAnalysis(analysis, profiles);

    return {
      analysis: validatedAnalysis,
      tokensUsed: result.tokensUsed,
    };
  } catch (err: unknown) {
    const error = err as Error;
    log.error(`Profile analysis failed: ${error.message}`);

    // Return default analysis on error
    return {
      analysis: createDefaultAnalysis(profiles),
      tokensUsed: 0,
    };
  }
}

function validateAnalysis(
  analysis: Partial<PersonalityAnalysis>,
  profiles: ProfileData[]
): PersonalityAnalysis {
  const defaults = createDefaultAnalysis(profiles);

  return {
    summary: analysis.summary || defaults.summary,
    interests: analysis.interests?.length ? analysis.interests : defaults.interests,
    communicationStyle: analysis.communicationStyle || defaults.communicationStyle,
    toneDescriptors: analysis.toneDescriptors?.length
      ? analysis.toneDescriptors
      : defaults.toneDescriptors,
    topicsOfExpertise: analysis.topicsOfExpertise?.length
      ? analysis.topicsOfExpertise
      : defaults.topicsOfExpertise,
    contentThemes: analysis.contentThemes?.length
      ? analysis.contentThemes
      : defaults.contentThemes,
    professionalInfo: analysis.professionalInfo || defaults.professionalInfo,
    personalityTraits: analysis.personalityTraits?.length
      ? analysis.personalityTraits
      : defaults.personalityTraits,
    socialMetrics: analysis.socialMetrics || defaults.socialMetrics,
    designRecommendation:
      analysis.designRecommendation || defaults.designRecommendation,
  };
}

function createDefaultAnalysis(profiles: ProfileData[]): PersonalityAnalysis {
  // Calculate basic metrics from available data
  let totalFollowers = 0;
  let totalPosts = 0;
  let mostActivePlatform: Platform = "twitter";
  let maxPosts = 0;

  for (const profile of profiles) {
    if (profile.followerCount) {
      totalFollowers += profile.followerCount;
    }
    if (profile.postCount) {
      totalPosts += profile.postCount;
      if (profile.postCount > maxPosts) {
        maxPosts = profile.postCount;
        mostActivePlatform = profile.platform;
      }
    }
  }

  // Determine style based on platforms used
  const hasGitHub = profiles.some((p) => p.platform === "github" && p.success);
  const hasLinkedIn = profiles.some((p) => p.platform === "linkedin" && p.success);
  const hasSocialMedia = profiles.some(
    (p) =>
      (p.platform === "instagram" || p.platform === "tiktok") && p.success
  );

  let style: DesignRecommendation["style"] = "minimal";
  if (hasGitHub) {
    style = "developer";
  } else if (hasLinkedIn) {
    style = "professional";
  } else if (hasSocialMedia) {
    style = "creative";
  }

  return {
    summary: "A digital presence across multiple platforms.",
    interests: [],
    communicationStyle: "casual",
    toneDescriptors: ["friendly", "approachable"],
    topicsOfExpertise: [],
    contentThemes: [],
    professionalInfo: null,
    personalityTraits: [],
    socialMetrics: {
      totalFollowers,
      totalPosts,
      avgEngagement: 0,
      mostActivePlatform,
    },
    designRecommendation: {
      style,
      colorScheme:
        style === "developer"
          ? "Dark theme with accent colors"
          : "Clean, modern palette",
      typography:
        style === "developer"
          ? "Monospace headings, clean sans-serif body"
          : "Modern sans-serif throughout",
      layoutStyle: "Clean, organized layout with clear sections",
      reasoning: "Based on available profile data and platform presence.",
    },
  };
}
