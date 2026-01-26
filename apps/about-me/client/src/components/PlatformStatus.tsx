import { Platform, PlatformStatus as Status } from "../types";

interface PlatformStatusProps {
  statuses: Record<Platform, Status> | undefined;
}

const PLATFORM_LABELS: Record<Platform, string> = {
  twitter: "Twitter",
  github: "GitHub",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  website: "Website",
};

const PLATFORM_ORDER: Platform[] = [
  "twitter",
  "github",
  "linkedin",
  "instagram",
  "tiktok",
  "facebook",
  "website",
];

export function PlatformStatus({ statuses }: PlatformStatusProps) {
  if (!statuses) return null;

  // Filter to only show platforms that are not skipped
  const activePlatforms = PLATFORM_ORDER.filter(
    (platform) => statuses[platform] !== "skipped"
  );

  if (activePlatforms.length === 0) return null;

  return (
    <div className="platform-status">
      <h3>Scraping Progress</h3>
      <div className="platform-list">
        {activePlatforms.map((platform) => {
          const status = statuses[platform];
          return (
            <div key={platform} className={`platform-item status-${status}`}>
              <span className="platform-name">{PLATFORM_LABELS[platform]}</span>
              <span className="platform-indicator">
                {status === "pending" && <span className="dot pending"></span>}
                {status === "scraping" && <span className="spinner small"></span>}
                {status === "success" && <span className="checkmark">&#10003;</span>}
                {status === "failed" && <span className="cross">&#10007;</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
