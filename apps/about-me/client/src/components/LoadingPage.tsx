import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useProfileGeneration } from "../hooks/useProfileGeneration";
import { PlatformStatus } from "./PlatformStatus";

export function LoadingPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { progress, portfolio, error, isComplete } = useProfileGeneration(
    sessionId || null
  );

  // Redirect to portfolio page when complete
  useEffect(() => {
    if (isComplete && portfolio) {
      navigate(`/portfolio/${sessionId}`);
    }
  }, [isComplete, portfolio, sessionId, navigate]);

  // Handle error state
  if (error) {
    return (
      <div className="loading-page">
        <div className="loading-container">
          <div className="error-state">
            <h2>Generation Failed</h2>
            <p>{error}</p>
            <button onClick={() => navigate("/")} className="retry-button">
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  const getStepMessage = () => {
    if (!progress) return "Connecting...";

    const progressNum = progress.progress;
    if (progressNum < 10) return "Starting up...";
    if (progressNum < 40) return "Scraping your social profiles...";
    if (progressNum < 70) return "Analyzing your online presence...";
    if (progressNum < 95) return "Generating your portfolio...";
    return "Almost done...";
  };

  return (
    <div className="loading-page">
      <div className="loading-container">
        <div className="loading-header">
          <h1>Creating Your Portfolio</h1>
          <p>{progress?.step || getStepMessage()}</p>
        </div>

        <div className="progress-section">
          <div className="progress-bar-container">
            <div
              className="progress-bar"
              style={{ width: `${progress?.progress || 0}%` }}
            />
          </div>
          <span className="progress-text">{progress?.progress || 0}%</span>
        </div>

        <PlatformStatus statuses={progress?.platformStatuses} />

        <div className="loading-tips">
          <p>This usually takes 30-60 seconds</p>
          <ul>
            <li>We're gathering public information from your profiles</li>
            <li>AI is analyzing your online presence</li>
            <li>Creating a personalized design just for you</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
