import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { ApplyPanel } from "../components/ApplyPanel";
import { ReviewPanel } from "../components/ReviewPanel";
import { FORM_ENGINE_ARMED } from "../config";
import { getProfile } from "../utils/api";
import type { Profile } from "../utils/api";
import { buildFillPlan, fillForm } from "./form-agent";
import type { FillPlanResult } from "./form-agent";
import type { FieldPlan, FillRecord } from "./form-engine-types";
import { mountIsolated, unmountIsolated, type IsolatedMount } from "./isolate";

export const FORM_ENGINE_STYLES = `
  .jh-review, .jh-apply-panel {
    position: fixed;
    right: 16px;
    top: 16px;
    width: 340px;
    max-height: 70vh;
    overflow: auto;
    z-index: 2147483647;
    background: #ffffff;
    color: #1a1a2e;
    font: 13px/1.45 system-ui, sans-serif;
    border: 1px solid rgba(26, 26, 46, 0.15);
    border-radius: 10px;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22);
    padding: 14px;
  }
  .jh-review__header { margin-bottom: 10px; }
  .jh-review__title { margin: 0 0 4px; font-size: 14px; }
  .jh-review__subtitle { margin: 0; color: #5b5b6e; }
  .jh-fill-list { list-style: none; margin: 0 0 10px; padding: 0; }
  .jh-fill-item { padding: 6px 0; border-bottom: 1px solid #eef0f6; }
  .jh-fill-item__row { display: flex; gap: 8px; align-items: flex-start; cursor: pointer; }
  .jh-fill-item__line { display: flex; gap: 6px; align-items: center; }
  .jh-fill-item__descriptor { font-weight: 600; }
  .jh-fill-item__meta { color: #5b5b6e; }
  .jh-pill { border-radius: 999px; padding: 1px 8px; font-size: 10px; letter-spacing: 0.4px; }
  .jh-pill--source { background: #e8f4ff; color: #0b5aa7; }
  .jh-review__section { margin-top: 8px; }
  .jh-review__section-title { margin: 0 0 4px; font-size: 12px; text-transform: uppercase; color: #8a8aa0; }
  .jh-warn-list { list-style: none; margin: 0 0 8px; padding: 0; }
  .jh-warn-item { color: #6b6b80; margin: 3px 0; }
  .jh-review__actions { display: flex; gap: 8px; margin-top: 10px; }
  .jh-button {
    border: 1px solid #c9c9d6;
    background: #ffffff;
    color: #1a1a2e;
    border-radius: 7px;
    padding: 6px 12px;
    cursor: pointer;
    font: inherit;
  }
  .jh-button--primary { background: #1a1a2e; border-color: #1a1a2e; color: #ffffff; }
  .jh-button--danger { background: #b3261e; border-color: #b3261e; color: #ffffff; }
  .jh-button:disabled { opacity: 0.5; cursor: not-allowed; }
  .jh-apply-panel__header { display: flex; justify-content: space-between; align-items: center; }
  .jh-apply-panel__title { font-size: 13px; }
  .jh-apply-panel__meta { color: #5b5b6e; }
  .jh-apply-panel__stats { display: flex; gap: 12px; list-style: none; padding: 6px 0; margin: 0; }
  .jh-error { color: #b3261e; }
  .jh-success { color: #0b6b3a; }
`;

interface AssistantProps {
  onClose: () => void;
}

function Assistant({ onClose }: AssistantProps) {
  const [result, setResult] = useState<FillPlanResult | null>(null);
  const [phase, setPhase] = useState<"loading" | "review" | "filling" | "done">("loading");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [records, setRecords] = useState<FillRecord[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const form = useMemo<HTMLElement | null>(() => document.querySelector<HTMLElement>("form"), []);

  useEffect(() => {
    let cancelled = false;
    async function prepare(): Promise<void> {
      if (form === null) {
        setResult({ plans: [], controls: [] });
        setPhase("review");
        return;
      }
      try {
        const profile: Profile | null = await getProfile().catch(() => null);
        if (cancelled) {
          return;
        }
        setResult(buildFillPlan(form, { profile }));
        setPhase("review");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not prepare the form");
          setPhase("done");
        }
      }
    }
    void prepare();
    return () => {
      cancelled = true;
    };
  }, [form]);

  async function apply(plans: FieldPlan[]): Promise<void> {
    if (result === null) {
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("filling");
    setRecords([]);
    setProgress(0);
    const chosenIds = new Set(plans.map((plan) => plan.controlId));
    const chosen: FillPlanResult = {
      plans: result.plans.filter((plan) => chosenIds.has(plan.controlId)),
      controls: result.controls,
    };
    await fillForm(chosen, {
      signal: controller.signal,
      onProgress: (record) => {
        setRecords((previous) => [...previous, record]);
        setProgress((previous) => previous + 1);
      },
    });
    setPhase("done");
  }

  function stop(): void {
    abortRef.current?.abort();
    setPhase("done");
  }

  if (phase === "loading") {
    return <div className="jh-apply-panel">Preparing form&hellip;</div>;
  }

  if (phase === "review" && result !== null) {
    return <ReviewPanel result={result} onApply={(plans) => void apply(plans)} onCancel={onClose} />;
  }

  const total = result === null ? 0 : result.plans.filter((plan) => plan.disposition.kind === "auto").length;
  return (
    <ApplyPanel
      active={phase === "filling"}
      done={phase === "done"}
      progress={progress}
      total={total}
      records={records}
      error={error}
      onStop={stop}
      onClose={onClose}
    />
  );
}

interface AssistantHandle {
  mount: IsolatedMount;
  root: Root;
}

let active: AssistantHandle | null = null;

export function unmountAssistant(): void {
  if (active === null) {
    return;
  }
  active.root.unmount();
  unmountIsolated(active.mount);
  active = null;
}

export function maybeArmFormEngine(armed: boolean = FORM_ENGINE_ARMED): boolean {
  if (!armed || active !== null) {
    return false;
  }
  const form = document.querySelector<HTMLElement>("form");
  if (form === null) {
    return false;
  }
  const mount = mountIsolated(FORM_ENGINE_STYLES);
  const root = createRoot(mount.shadow);
  active = { mount, root };
  root.render(<Assistant onClose={unmountAssistant} />);
  return true;
}