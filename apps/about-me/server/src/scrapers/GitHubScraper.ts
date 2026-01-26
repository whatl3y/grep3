import { BaseScraper, ScraperResult } from "./BaseScraper";
import { ProfileData, PostData, RepoData } from "../types";
import config from "../config";
import log from "../logger";

interface GitHubUser {
  login: string;
  name: string | null;
  bio: string | null;
  avatar_url: string;
  followers: number;
  following: number;
  public_repos: number;
  company: string | null;
  location: string | null;
  blog: string | null;
  twitter_username: string | null;
  html_url: string;
}

interface GitHubRepo {
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  topics: string[];
  created_at: string;
  updated_at: string;
  pushed_at: string;
}

interface GitHubEvent {
  id: string;
  type: string;
  created_at: string;
  repo: {
    name: string;
  };
  payload: {
    commits?: Array<{ message: string }>;
    action?: string;
    issue?: { title: string };
    pull_request?: { title: string };
  };
}

export class GitHubScraper extends BaseScraper {
  private baseUrl = "https://api.github.com";

  constructor() {
    super("github");
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "about-me-portfolio-generator",
    };

    if (config.github.token) {
      headers.Authorization = `Bearer ${config.github.token}`;
    }

    return headers;
  }

  async scrape(identifier: string): Promise<ScraperResult> {
    const username = this.parseUsername(identifier);

    try {
      log.info(`Fetching GitHub profile for ${username}`);

      // Fetch user profile
      const userResponse = await this.withTimeout(
        fetch(`${this.baseUrl}/users/${username}`, {
          headers: this.getHeaders(),
        })
      );

      if (!userResponse.ok) {
        if (userResponse.status === 404) {
          return this.createErrorResult(`User ${username} not found`, username);
        }
        if (userResponse.status === 403) {
          return this.createErrorResult(
            "GitHub API rate limit exceeded - try again later or configure GITHUB_TOKEN",
            username
          );
        }
        throw new Error(`GitHub API error: ${userResponse.status}`);
      }

      const user: GitHubUser = await userResponse.json();

      // Fetch repos (sorted by stars)
      log.info(`Fetching repos for ${username}`);
      const reposResponse = await this.withTimeout(
        fetch(
          `${this.baseUrl}/users/${username}/repos?sort=updated&per_page=30`,
          { headers: this.getHeaders() }
        )
      );

      let repos: RepoData[] = [];
      let languages: Record<string, number> = {};

      if (reposResponse.ok) {
        const repoData: GitHubRepo[] = await reposResponse.json();

        // Sort by stars and take top repos
        repos = repoData
          .sort((a, b) => b.stargazers_count - a.stargazers_count)
          .slice(0, 10)
          .map((repo) => ({
            name: repo.name,
            description: repo.description,
            language: repo.language,
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            url: repo.html_url,
            topics: repo.topics || [],
          }));

        // Calculate language distribution
        for (const repo of repoData) {
          if (repo.language) {
            languages[repo.language] = (languages[repo.language] || 0) + 1;
          }
        }
      }

      // Fetch recent activity
      log.info(`Fetching activity for ${username}`);
      const eventsResponse = await this.withTimeout(
        fetch(`${this.baseUrl}/users/${username}/events/public?per_page=30`, {
          headers: this.getHeaders(),
        })
      );

      const posts: PostData[] = [];
      let contributions = 0;

      if (eventsResponse.ok) {
        const events: GitHubEvent[] = await eventsResponse.json();

        // Convert events to posts for analysis
        for (const event of events.slice(0, config.scraping.maxPostsPerPlatform)) {
          const post = this.eventToPost(event);
          if (post) {
            posts.push(post);
          }
          contributions++;
        }
      }

      const profileData: ProfileData = {
        platform: "github",
        username: user.login,
        displayName: user.name,
        bio: user.bio,
        profileImageUrl: user.avatar_url,
        followerCount: user.followers,
        followingCount: user.following,
        postCount: user.public_repos,
        posts,
        repos,
        languages,
        contributions,
        error: null,
        success: true,
      };

      return this.createSuccessResult(profileData);
    } catch (err: unknown) {
      const error = err as Error;
      log.error(`GitHub scrape error for ${username}: ${error.message}`);
      return this.createErrorResult(error.message, username);
    }
  }

  private eventToPost(event: GitHubEvent): PostData | null {
    let text = "";

    switch (event.type) {
      case "PushEvent":
        const commits = event.payload.commits || [];
        if (commits.length > 0) {
          text = `Pushed to ${event.repo.name}: ${commits[0].message}`;
          if (commits.length > 1) {
            text += ` (+${commits.length - 1} more commits)`;
          }
        }
        break;

      case "CreateEvent":
        text = `Created repository ${event.repo.name}`;
        break;

      case "IssuesEvent":
        text = `${event.payload.action} issue in ${event.repo.name}: ${event.payload.issue?.title}`;
        break;

      case "PullRequestEvent":
        text = `${event.payload.action} PR in ${event.repo.name}: ${event.payload.pull_request?.title}`;
        break;

      case "WatchEvent":
        text = `Starred ${event.repo.name}`;
        break;

      case "ForkEvent":
        text = `Forked ${event.repo.name}`;
        break;

      default:
        return null;
    }

    if (!text) return null;

    return this.createPost({
      id: event.id,
      text,
      timestamp: this.parseDate(event.created_at),
      likes: 0,
      comments: 0,
      shares: 0,
      hashtags: [],
      mediaUrls: [],
    });
  }
}

// Export singleton factory
let instance: GitHubScraper | null = null;

export function getGitHubScraper(): GitHubScraper {
  if (!instance) {
    instance = new GitHubScraper();
  }
  return instance;
}
