import { useMemo, useState } from "react";
import type { FieldPlan } from "../content/form-engine-types";
import { describeIntent } from "../content/field-classifier";
import type { FillPlanResult } from "../content/form-agent";
import { autoPlans } from "../content/form-agent";

interface ReviewPanelProps {
  result: FillPlanResult;
  onApply: (plans: FieldPlan[]) => void;
  onCancel: () => void;
}

export function ReviewPanel({ result, onApply, onCancel }: ReviewPanelProps) {
  const initialSelected = useMemo(
    () => new Set(autoPlans(result).map((plan) => plan.controlId)),
    [result],
  );
  const [selected, setSelected] = useState<Set<string>>(initialSelected);

  const auto = result.plans.filter((plan) => plan.disposition.kind === "auto");
  const blocked = result.plans.filter((plan) => plan.disposition.kind === "blocked");
  const skipped = result.plans.filter((plan) => plan.disposition.kind === "skip");
  const count = auto.filter((plan) => selected.has(plan.controlId)).length;

  function toggle(controlId: string): void {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(controlId)) {
        next.delete(controlId);
      } else {
        next.add(controlId);
      }
      return next;
    });
  }

  function apply(): void {
    const chosen = auto.filter((plan) => selected.has(plan.controlId));
    onApply(chosen);
  }

  return (
    <div className="jh-review">
      <div className="jh-review__header">
        <h3 className="jh-review__title">Application form assistant</h3>
        <p className="jh-review__subtitle">
          {auto.length} field{auto.length === 1 ? "" : "s"} can be filled from your confirmed profile. Nothing is
          submitted — review the form and submit yourself.
        </p>
      </div>

      {auto.length > 0 && (
        <ul className="jh-fill-list">
          {auto.map((plan) => (
            <li key={plan.controlId} className="jh-fill-item">
              <label className="jh-fill-item__row">
                <input
                  type="checkbox"
                  aria-label={plan.descriptor}
                  checked={selected.has(plan.controlId)}
                  onChange={() => toggle(plan.controlId)}
                />
                <span className="jh-fill-item__body">
                  <span className="jh-fill-item__line">
                    <span className="jh-fill-item__descriptor">{plan.descriptor}</span>
                    {plan.disposition.kind === "auto" && (
                      <span className="jh-pill jh-pill--source">{plan.disposition.answer.source}</span>
                    )}
                  </span>
                  <span className="jh-fill-item__meta">
                    {describeIntent(plan.intent)} · {plan.disposition.kind === "auto" ? plan.disposition.answer.value : ""}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {blocked.length > 0 && (
        <div className="jh-review__section">
          <h4 className="jh-review__section-title">Will not auto-fill</h4>
          <ul className="jh-warn-list">
            {blocked.map((plan) => (
              <li key={plan.controlId} className="jh-warn-item">
                <strong>{plan.descriptor}</strong> — {plan.disposition.kind === "blocked" ? plan.disposition.reason : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {skipped.length > 0 && (
        <div className="jh-review__section">
          <h4 className="jh-review__section-title">Skipped</h4>
          <ul className="jh-warn-list">
            {skipped.map((plan) => (
              <li key={plan.controlId} className="jh-warn-item">
                <strong>{plan.descriptor}</strong> — {plan.disposition.kind === "skip" ? plan.disposition.reason : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="jh-review__actions">
        <button type="button" className="jh-button jh-button--primary" onClick={apply} disabled={count === 0}>
          Fill {count} field{count === 1 ? "" : "s"}
        </button>
        <button type="button" className="jh-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}