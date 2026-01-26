import {
  ProfileData,
  PersonalityAnalysis,
  GeneratedPortfolio,
  Platform,
} from "../types";
import { createClaudeCompletion, extractHtmlFromResponse } from "./ClaudeService";
import log from "../logger";

// Frontend-design skill inspired system prompt for high-quality, distinctive portfolios
const PORTFOLIO_SYSTEM_PROMPT = `You are an expert frontend designer creating distinctive, production-grade portfolio websites. Your designs should avoid generic AI aesthetics and instead feel handcrafted and unique.

CRITICAL REQUIREMENTS:
1. Return ONLY valid HTML5 - no explanations, no markdown code blocks
2. All CSS must be embedded in a <style> tag in the <head>
3. All JavaScript (if any) must be embedded in <script> tags
4. The design must be fully responsive (mobile-first approach)
5. Use modern CSS features: CSS Grid, Flexbox, CSS custom properties (variables)
6. Include subtle, tasteful animations and transitions
7. Make it visually distinctive - NOT generic bootstrap-style templates

DESIGN PRINCIPLES:
- Start with a clear visual hierarchy
- Use whitespace intentionally and generously
- Typography should be deliberate - pair fonts thoughtfully
- Colors should reflect the person's personality
- Include micro-interactions that feel polished
- Make the layout feel dynamic, not cookie-cutter

STRUCTURE (customize based on personality):
1. Hero section with name, tagline, and optionally a profile image
2. About section highlighting their personality and interests
3. Skills/Expertise section with visual representation
4. Social proof section (followers, posts, engagement highlights)
5. Links section connecting to all their social profiles
6. Footer with generation info

STYLE VARIATIONS based on designRecommendation.style:
- "developer": Dark theme, terminal aesthetics, monospace fonts, code-inspired UI elements, accent colors like cyan/green/purple
- "creative": Bold colors, asymmetric layouts, artistic typography, large imagery, dynamic shapes
- "professional": Clean corporate feel, blues and grays, serif or clean sans-serif fonts, structured grid layouts
- "casual": Warm colors, rounded corners, friendly fonts, playful elements, emoji-friendly
- "minimal": Maximum whitespace, few colors, elegant typography, subtle details, refined simplicity

Remember: This portfolio represents a real person. Make it feel personal and authentic, not templated.`;

export interface PortfolioGenerationResult {
  portfolio: GeneratedPortfolio;
  tokensUsed: number;
}

/**
 * Generate a portfolio website using Claude
 */
export async function generatePortfolio(
  profiles: ProfileData[],
  analysis: PersonalityAnalysis
): Promise<PortfolioGenerationResult> {
  // Build the context for Claude
  const profilesSummary = buildProfilesSummary(profiles);
  const socialLinks = buildSocialLinks(profiles);

  const userPrompt = `Create a beautiful, personalized portfolio website for this person.

## Person Overview
${analysis.summary}

## Personality Analysis
- Communication Style: ${analysis.communicationStyle}
- Tone: ${analysis.toneDescriptors.join(", ")}
- Key Interests: ${analysis.interests.join(", ") || "Not specified"}
- Areas of Expertise: ${analysis.topicsOfExpertise.join(", ") || "General"}

## Professional Information
${analysis.professionalInfo
  ? `
- Role: ${analysis.professionalInfo.currentRole || "Not specified"}
- Company: ${analysis.professionalInfo.company || "Not specified"}
- Industry: ${analysis.professionalInfo.industry || "Not specified"}
- Skills: ${analysis.professionalInfo.skills.join(", ") || "Various"}
`
  : "Professional details not available"}

## Social Metrics
- Total Followers: ${formatNumber(analysis.socialMetrics.totalFollowers)}
- Total Posts: ${formatNumber(analysis.socialMetrics.totalPosts)}
- Most Active On: ${analysis.socialMetrics.mostActivePlatform}

## Design Recommendation
- Style: ${analysis.designRecommendation.style}
- Color Scheme: ${analysis.designRecommendation.colorScheme}
- Typography: ${analysis.designRecommendation.typography}
- Layout: ${analysis.designRecommendation.layoutStyle}
- Reasoning: ${analysis.designRecommendation.reasoning}

## Profile Details
${profilesSummary}

## Social Links to Include
${socialLinks}

## Content Themes (for about section inspiration)
${analysis.contentThemes
  .slice(0, 3)
  .map((t) => `- ${t.theme} (frequently discussed)`)
  .join("\n") || "- General content"}

## Personality Traits (for design personality)
${analysis.personalityTraits
  .slice(0, 3)
  .map((t) => `- ${t.trait}: ${t.evidence}`)
  .join("\n") || "- Friendly and approachable"}

Now generate a complete, self-contained HTML file that creates a stunning portfolio. Make it feel unique and personal to this individual. Do not use placeholder images - use their actual profile image URLs if available, or use CSS-based avatars/initials.`;

  log.info("Generating portfolio with Claude");

  try {
    const result = await createClaudeCompletion(
      [{ role: "user", content: userPrompt }],
      {
        maxTokens: 16000,
        temperature: 0.8,
        systemPrompt: PORTFOLIO_SYSTEM_PROMPT,
      }
    );

    const html = extractHtmlFromResponse(result.content);

    // Validate HTML has basic structure
    if (!html.includes("<html") && !html.includes("<!DOCTYPE")) {
      throw new Error("Invalid HTML generated");
    }

    const portfolio: GeneratedPortfolio = {
      html,
      metadata: {
        generatedAt: new Date(),
        platformsAnalyzed: profiles
          .filter((p) => p.success)
          .map((p) => p.platform),
        platformsFailed: profiles
          .filter((p) => !p.success)
          .map((p) => p.platform),
        tokensUsed: result.tokensUsed,
      },
    };

    return {
      portfolio,
      tokensUsed: result.tokensUsed,
    };
  } catch (err: unknown) {
    const error = err as Error;
    log.error(`Portfolio generation failed: ${error.message}`);
    throw error;
  }
}

function buildProfilesSummary(profiles: ProfileData[]): string {
  return profiles
    .map((profile) => {
      const lines: string[] = [];
      lines.push(`### ${capitalizeFirst(profile.platform)}`);

      if (profile.displayName) {
        lines.push(`Name: ${profile.displayName}`);
      }
      if (profile.username) {
        lines.push(`Username: @${profile.username}`);
      }
      if (profile.bio) {
        lines.push(`Bio: ${profile.bio}`);
      }
      if (profile.followerCount) {
        lines.push(`Followers: ${formatNumber(profile.followerCount)}`);
      }

      // GitHub-specific
      if (profile.repos && profile.repos.length > 0) {
        lines.push(
          `Top Repos: ${profile.repos
            .slice(0, 3)
            .map((r) => `${r.name} (${r.stars} stars)`)
            .join(", ")}`
        );
      }
      if (profile.languages && Object.keys(profile.languages).length > 0) {
        const topLangs = Object.entries(profile.languages)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([lang]) => lang);
        lines.push(`Languages: ${topLangs.join(", ")}`);
      }

      // Profile image
      if (profile.profileImageUrl) {
        lines.push(`Profile Image: ${profile.profileImageUrl}`);
      }

      if (!profile.success && profile.error) {
        lines.push(`Note: Limited data available - ${profile.error}`);
      }

      return lines.join("\n");
    })
    .join("\n\n");
}

function buildSocialLinks(profiles: ProfileData[]): string {
  const platformUrls: Record<Platform, (username: string) => string> = {
    twitter: (u) => `https://twitter.com/${u}`,
    github: (u) => `https://github.com/${u}`,
    linkedin: (u) => `https://linkedin.com/in/${u}`,
    facebook: (u) => `https://facebook.com/${u}`,
    instagram: (u) => `https://instagram.com/${u}`,
    tiktok: (u) => `https://tiktok.com/@${u}`,
    website: (u) => u.startsWith("http") ? u : `https://${u}`,
  };

  return profiles
    .map((profile) => {
      const url = platformUrls[profile.platform](profile.username);
      const icon = getPlatformIcon(profile.platform);
      return `- ${icon} ${capitalizeFirst(profile.platform)}: ${url}`;
    })
    .join("\n");
}

function getPlatformIcon(platform: Platform): string {
  const icons: Record<Platform, string> = {
    twitter: "X/Twitter",
    github: "GitHub",
    linkedin: "LinkedIn",
    facebook: "Facebook",
    instagram: "Instagram",
    tiktok: "TikTok",
    website: "Website",
  };
  return icons[platform];
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
