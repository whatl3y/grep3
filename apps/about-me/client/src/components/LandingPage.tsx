import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { SocialLinksInput, GenerateResponse } from "../types";
import { apiPost } from "../utils/api";

const PLATFORM_CONFIG = [
  {
    key: "twitter" as const,
    label: "Twitter / X",
    placeholder: "@username or profile URL",
    icon: "X",
  },
  {
    key: "github" as const,
    label: "GitHub",
    placeholder: "username or profile URL",
    icon: "GH",
  },
  {
    key: "linkedin" as const,
    label: "LinkedIn",
    placeholder: "linkedin.com/in/username",
    icon: "in",
  },
  {
    key: "instagram" as const,
    label: "Instagram",
    placeholder: "@username or profile URL",
    icon: "IG",
  },
  {
    key: "tiktok" as const,
    label: "TikTok",
    placeholder: "@username or profile URL",
    icon: "TT",
  },
  {
    key: "facebook" as const,
    label: "Facebook",
    placeholder: "facebook.com/username",
    icon: "FB",
  },
  {
    key: "website" as const,
    label: "Personal Website",
    placeholder: "yourwebsite.com",
    icon: "WEB",
  },
];

export function LandingPage() {
  const navigate = useNavigate();
  const [links, setLinks] = useState<SocialLinksInput>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = (key: keyof SocialLinksInput, value: string) => {
    setLinks((prev) => ({
      ...prev,
      [key]: value.trim() || undefined,
    }));
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate at least one link is provided
    const filledLinks = Object.values(links).filter((v) => v && v.trim());
    if (filledLinks.length === 0) {
      setError("Please enter at least one social media link");
      return;
    }

    setIsSubmitting(true);

    try {
      const data = await apiPost<GenerateResponse>("/api/generate", { socialLinks: links });
      navigate(`/loading/${data.sessionId}`);
    } catch (err) {
      const error = err as Error;
      setError(error.message);
      setIsSubmitting(false);
    }
  };

  const hasAnyInput = Object.values(links).some((v) => v && v.trim());

  return (
    <div className="landing-page">
      <div className="landing-container">
        <header className="landing-header">
          <h1>About Me</h1>
          <p className="tagline">
            Transform your social presence into a beautiful portfolio
          </p>
        </header>

        <form onSubmit={handleSubmit} className="social-form">
          <div className="form-description">
            <p>
              Enter your social media profiles below. We'll analyze your online
              presence and generate a personalized portfolio website just for
              you.
            </p>
          </div>

          <div className="input-grid">
            {PLATFORM_CONFIG.map(({ key, label, placeholder, icon }) => (
              <div key={key} className="input-group">
                <label htmlFor={key}>
                  <span className="platform-icon">{icon}</span>
                  {label}
                </label>
                <input
                  type="text"
                  id={key}
                  placeholder={placeholder}
                  value={links[key] || ""}
                  onChange={(e) => handleInputChange(key, e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            ))}
          </div>

          {error && <div className="error-message">{error}</div>}

          <button
            type="submit"
            className="submit-button"
            disabled={isSubmitting || !hasAnyInput}
          >
            {isSubmitting ? (
              <>
                <span className="spinner"></span>
                Starting...
              </>
            ) : (
              "Generate My Portfolio"
            )}
          </button>

          <p className="privacy-note">
            We only access publicly available information. Your data is not stored.
          </p>
        </form>
      </div>
    </div>
  );
}
