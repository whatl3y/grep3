import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { GeneratedPortfolio } from "../types";
import { apiGet } from "../utils/api";

export function PortfolioPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [portfolio, setPortfolio] = useState<GeneratedPortfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      navigate("/");
      return;
    }

    const fetchPortfolio = async () => {
      try {
        const data = await apiGet<GeneratedPortfolio>(`/api/result/${sessionId}`);
        if (data.html) {
          setPortfolio(data);
        } else {
          throw new Error("Invalid portfolio data");
        }
      } catch (err) {
        const error = err as Error;
        // Check if still processing
        if (error.message.includes("in progress")) {
          navigate(`/loading/${sessionId}`);
          return;
        }
        setError(error.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPortfolio();
  }, [sessionId, navigate]);

  const handleDownload = () => {
    if (!portfolio) return;

    const blob = new Blob([portfolio.html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "my-portfolio.html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCreateNew = () => {
    navigate("/");
  };

  if (isLoading) {
    return (
      <div className="portfolio-page">
        <div className="portfolio-loading">
          <span className="spinner"></span>
          <p>Loading your portfolio...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="portfolio-page">
        <div className="portfolio-error">
          <h2>Error</h2>
          <p>{error}</p>
          <button onClick={() => navigate("/")} className="action-button">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!portfolio) {
    return null;
  }

  return (
    <div className="portfolio-page">
      <div className="portfolio-toolbar">
        <div className="toolbar-left">
          <h2>Your Portfolio</h2>
          <button
            className="info-toggle"
            onClick={() => setShowInfo(!showInfo)}
            title="Show generation info"
          >
            {showInfo ? "Hide Info" : "Info"}
          </button>
        </div>
        <div className="toolbar-right">
          <button onClick={handleDownload} className="action-button download">
            Download HTML
          </button>
          <button onClick={handleCreateNew} className="action-button new">
            Create New
          </button>
        </div>
      </div>

      {showInfo && portfolio.metadata && (
        <div className="portfolio-info">
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Generated</span>
              <span className="info-value">
                {new Date(portfolio.metadata.generatedAt).toLocaleString()}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">Platforms Analyzed</span>
              <span className="info-value">
                {portfolio.metadata.platformsAnalyzed.join(", ") || "None"}
              </span>
            </div>
            {portfolio.metadata.platformsFailed.length > 0 && (
              <div className="info-item">
                <span className="info-label">Limited Data</span>
                <span className="info-value">
                  {portfolio.metadata.platformsFailed.join(", ")}
                </span>
              </div>
            )}
            <div className="info-item">
              <span className="info-label">AI Tokens Used</span>
              <span className="info-value">
                {portfolio.metadata.tokensUsed.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="portfolio-preview">
        <iframe
          srcDoc={portfolio.html}
          title="Your Portfolio Preview"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  );
}
