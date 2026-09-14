import type { FillRecord } from "../content/form-engine-types";

interface ApplyPanelProps {
  active: boolean;
  done: boolean;
  progress: number;
  total: number;
  records: FillRecord[];
  onStop: () => void;
  onClose: () => void;
  error?: string | null;
}

export function ApplyPanel({ active, done, progress, total, records, onStop, onClose, error }: ApplyPanelProps) {
  const succeeded = records.filter((record) => record.status === "applied").length;
  const blocked = records.filter((record) => record.status === "blocked").length;
  const skipped = records.filter((record) => record.status === "skipped").length;

  return (
    <div className="jh-apply-panel">
      <div className="jh-apply-panel__header">
        <strong className="jh-apply-panel__title">Form fill progress</strong>
        <span className="jh-apply-panel__meta">
          {progress}/{total} processed
        </span>
      </div>

      <ul className="jh-apply-panel__stats">
        <li>
          Applied: <strong>{succeeded}</strong>
        </li>
        <li>
          Blocked: <strong>{blocked}</strong>
        </li>
        <li>
          Skipped: <strong>{skipped}</strong>
        </li>
      </ul>

      {error && <p className="jh-error">{error}</p>}

      {active && (
        <button type="button" className="jh-button jh-button--danger" onClick={onStop}>
          Stop filling
        </button>
      )}

      {done && (
        <p className="jh-success">
          Fill complete. Review the form and submit it yourself — we never submit for you.
        </p>
      )}

      {done && (
        <button type="button" className="jh-button" onClick={onClose}>
          Close
        </button>
      )}
    </div>
  );
}