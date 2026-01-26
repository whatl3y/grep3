import { useState, useEffect, useCallback } from "react";
import {
  GenerationProgress,
  GeneratedPortfolio,
  StatusEvent,
  Platform,
  PlatformStatus,
} from "../types";
import { getSSEUrl, apiGet } from "../utils/api";

const PLATFORMS: Platform[] = [
  "twitter",
  "linkedin",
  "facebook",
  "instagram",
  "tiktok",
  "github",
  "website",
];

const initialPlatformStatuses = (): Record<Platform, PlatformStatus> => {
  const statuses: Record<Platform, PlatformStatus> = {} as Record<Platform, PlatformStatus>;
  for (const platform of PLATFORMS) {
    statuses[platform] = "skipped";
  }
  return statuses;
};

export interface UseProfileGenerationResult {
  progress: GenerationProgress | null;
  portfolio: GeneratedPortfolio | null;
  error: string | null;
  isLoading: boolean;
  isComplete: boolean;
}

export function useProfileGeneration(
  sessionId: string | null
): UseProfileGenerationResult {
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [portfolio, setPortfolio] = useState<GeneratedPortfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setProgress(null);
      setPortfolio(null);
      setError(null);
      setIsLoading(false);
      setIsComplete(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setIsComplete(false);

    // Set initial progress
    setProgress({
      step: "Connecting...",
      progress: 0,
      platformStatuses: initialPlatformStatuses(),
    });

    // Connect to SSE endpoint
    const eventSource = new EventSource(getSSEUrl(`/api/status/${sessionId}`));

    eventSource.onmessage = (event) => {
      try {
        const statusEvent: StatusEvent = JSON.parse(event.data);

        switch (statusEvent.type) {
          case "progress":
            setProgress(statusEvent.data as GenerationProgress);
            break;

          case "complete":
            setPortfolio(statusEvent.data as GeneratedPortfolio);
            setIsComplete(true);
            setIsLoading(false);
            eventSource.close();
            break;

          case "error":
            const errorData = statusEvent.data as { error: string };
            setError(errorData.error);
            setIsLoading(false);
            eventSource.close();
            break;
        }
      } catch (err) {
        console.error("Error parsing SSE event:", err);
      }
    };

    eventSource.onerror = () => {
      // If we haven't completed yet, try to fetch the result
      if (!isComplete) {
        fetchResult(sessionId);
      }
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [sessionId]);

  const fetchResult = useCallback(async (id: string) => {
    try {
      const data = await apiGet<GeneratedPortfolio>(`/api/result/${id}`);
      if (data.html) {
        setPortfolio(data);
        setIsComplete(true);
        setIsLoading(false);
      }
    } catch (err) {
      const error = err as Error;
      console.error("Error fetching result:", error);
      setError(error.message || "Connection lost. Please refresh the page.");
      setIsLoading(false);
    }
  }, []);

  return {
    progress,
    portfolio,
    error,
    isLoading,
    isComplete,
  };
}
