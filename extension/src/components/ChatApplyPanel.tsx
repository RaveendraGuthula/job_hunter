import type { ChatPhase, ChatSendRecord } from "../content/chat-engine-types";

interface ChatApplyPanelProps {
  phase: ChatPhase;
  lastRecord: ChatSendRecord | null;
  paused: boolean;
  stopped: boolean;
  error?: string | null;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onClose: () => void;
}

function phaseLabel(phase: ChatPhase): string {
  switch (phase) {
    case "reading":
    case "classifying":
      return "Reading the conversation…";
    case "answering":
      return "Answering…";
    case "waiting_for_response":
      return "Waiting for the next question…";
    case "completed":
      return "No further questions detected.";
    case "review":
      return "Waiting for your review.";
    case "paused":
      return "Paused.";
    case "stopped":
      return "Automation halted.";
    case "errored":
      return "An error occurred.";
    default:
      return "Detecting the conversation…";
  }
}

export function ChatApplyPanel({ phase, lastRecord, paused, stopped, error, onPause, onResume, onStop, onClose }: ChatApplyPanelProps) {
  return (
    <div className="jh-apply-panel">
      <div className="jh-apply-panel__header">
        <strong className="jh-apply-panel__title">Chat application assistant</strong>
        <span className="jh-apply-panel__meta">{phase}</span>
      </div>

      <p className="jh-apply-panel__meta">{phaseLabel(phase)}</p>

      {lastRecord !== null && (
        <p className="jh-apply-panel__meta">
          Last: {lastRecord.status === "sent" ? `answered "${lastRecord.value}"` : lastRecord.note}
        </p>
      )}

      {error && <p className="jh-error">{error}</p>}

      {paused ? (
        <button type="button" className="jh-button jh-button--primary" onClick={onResume}>
          Resume
        </button>
      ) : (
        !stopped && (
          <button type="button" className="jh-button" onClick={onPause}>
            Pause
          </button>
        )
      )}

      {!stopped && (
        <button type="button" className="jh-button jh-button--danger" onClick={onStop}>
          Emergency STOP
        </button>
      )}

      <button type="button" className="jh-button" onClick={onClose}>
        Close
      </button>
    </div>
  );
}