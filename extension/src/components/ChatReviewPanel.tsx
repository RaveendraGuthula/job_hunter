import { useState } from "react";
import type { ChatPlan } from "../content/chat-engine-types";
import { describeIntent } from "../content/field-classifier";

interface ChatReviewPanelProps {
  plan: ChatPlan;
  onApprove: () => void;
  onEditSubmit: (value: string) => void;
  onSkip: () => void;
  onPause: () => void;
  onStop: () => void;
  onClose: () => void;
}

export function ChatReviewPanel({ plan, onApprove, onEditSubmit, onSkip, onPause, onStop, onClose }: ChatReviewPanelProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(plan.proposal.outcome === "review" ? plan.proposal.answer.value : "");

  const isAnswer = plan.proposal.outcome === "review" || plan.proposal.outcome === "auto";
  const proposedValue = plan.proposal.outcome === "review" || plan.proposal.outcome === "auto" ? plan.proposal.answer.value : "";
  const proposedSource = plan.proposal.outcome === "review" || plan.proposal.outcome === "auto" ? plan.proposal.answer.source : null;
  const reason = plan.proposal.outcome === "review" ? plan.proposal.reason : plan.proposal.outcome === "blocked" ? plan.proposal.reason : null;

  function submitEdit(): void {
    const value = editValue.trim();
    if (value.length > 0) {
      onEditSubmit(value);
    }
  }

  return (
    <div className="jh-review">
      <div className="jh-review__header">
        <h3 className="jh-review__title">Chat answer needs review</h3>
        <p className="jh-review__subtitle">Review the proposed answer before it is sent. Nothing else is automated until you decide.</p>
      </div>

      <p className="jh-chat-question">{plan.text}</p>
      <p className="jh-chat-intent">{describeIntent(plan.intent)}</p>

      {reason && <div className="jh-warn-item">{reason}</div>}

      {editing ? (
        <textarea
          className="jh-textarea"
          aria-label="Edited answer"
          rows={3}
          value={editValue}
          onChange={(event) => setEditValue(event.target.value)}
        />
      ) : (
        isAnswer && plan.proposal.outcome !== "blocked" && plan.proposal.outcome !== "skip" && (
          <p className="jh-chat-proposal">
            <strong>{proposedValue}</strong>{" "}
            <span className="jh-pill jh-pill--source">{proposedSource}</span>
          </p>
        )
      )}

      <div className="jh-review__actions">
        {!editing && isAnswer && plan.proposal.outcome !== "blocked" && plan.proposal.outcome !== "skip" && (
          <button type="button" className="jh-button jh-button--primary" onClick={onApprove} disabled={proposedValue.trim().length === 0}>
            Send as is
          </button>
        )}
        {!editing && (
          <button type="button" className="jh-button" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
        {editing && (
          <button type="button" className="jh-button jh-button--primary" onClick={submitEdit}>
            Send edited answer
          </button>
        )}
        {editing && (
          <button type="button" className="jh-button" onClick={() => setEditing(false)}>
            Back
          </button>
        )}
        <button type="button" className="jh-button" onClick={onSkip}>
          Skip question
        </button>
        <button type="button" className="jh-button" onClick={onPause}>
          Pause
        </button>
      </div>

      <div className="jh-review__actions">
        <button type="button" className="jh-button jh-button--danger" onClick={onStop}>
          Emergency STOP
        </button>
        <button type="button" className="jh-button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}