import { ProgressData } from '../types';
import './ProgressBar.css';

interface ProgressBarProps {
  progress: ProgressData;
}

export function ProgressBar({ progress }: ProgressBarProps) {
  return (
    <div className="progress-container">
      <div className="progress-header">
        <span className="progress-message">{progress.message}</span>
        <span className="progress-percent">{progress.percent}%</span>
      </div>
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      {progress.currentBatch && progress.totalBatches && (
        <div className="progress-batch">
          Batch {progress.currentBatch} of {progress.totalBatches}
        </div>
      )}
    </div>
  );
}
