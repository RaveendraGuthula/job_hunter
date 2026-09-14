import type { Profile } from "../utils/api";
import { classifyField } from "./field-classifier";
import { detectControls, groupRadios } from "./form-detector";
import type { DetectedControl, FieldPlan, FillRecord } from "./form-engine-types";
import { tryFill } from "./interaction-engine";
import { proposeValue } from "./profile-mapper";
import { validateFill } from "./value-validator";

export interface FillPlanOptions {
  profile: Profile | null;
}

export interface FillPlanResult {
  plans: FieldPlan[];
  controls: DetectedControl[];
}

export function descriptorOf(control: DetectedControl): string {
  return control.labelText ?? control.placeholder ?? control.ariaLabel ?? control.name ?? "Field";
}

export function buildFillPlan(root: Document | HTMLElement, options: FillPlanOptions): FillPlanResult {
  const controls = groupRadios(detectControls(root));
  const plans: FieldPlan[] = [];
  for (const control of controls) {
    const classification = classifyField(control);
    const proposal = proposeValue(classification.intent, options.profile);

    let disposition: FieldPlan["disposition"];
    if (proposal.outcome === "answer") {
      const validationError = validateFill(control, proposal.answer.value);
      disposition = validationError
        ? { kind: "skip", reason: validationError }
        : { kind: "auto", answer: proposal.answer };
    } else if (proposal.outcome === "blocked") {
      disposition = { kind: "blocked", reason: proposal.reason };
    } else {
      disposition = { kind: "skip", reason: proposal.reason };
    }

    plans.push({
      controlId: control.id,
      intent: classification.intent,
      confidence: classification.confidence,
      kind: control.kind,
      descriptor: descriptorOf(control),
      disposition,
    });
  }
  return { plans, controls };
}

export function autoPlans(result: FillPlanResult): FieldPlan[] {
  return result.plans.filter((plan) => plan.disposition.kind === "auto");
}

export interface FillFormOptions {
  signal?: AbortSignal;
  onProgress?: (record: FillRecord) => void;
}

export async function fillForm(result: FillPlanResult, options: FillFormOptions = {}): Promise<FillRecord[]> {
  const { signal, onProgress } = options;
  const byId = new Map(result.controls.map((control) => [control.id, control]));
  const records: FillRecord[] = [];
  for (const plan of result.plans) {
    if (signal?.aborted) {
      break;
    }
    if (plan.disposition.kind !== "auto") {
      continue;
    }
    const control = byId.get(plan.controlId);
    if (!control) {
      continue;
    }
    const record = tryFill(control, plan.intent, plan.disposition.answer);
    records.push(record);
    onProgress?.(record);
  }
  return records;
}