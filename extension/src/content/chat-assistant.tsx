import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { ChatApplyPanel } from "../components/ChatApplyPanel";
import { ChatReviewPanel } from "../components/ChatReviewPanel";
import { AI_ANSWER_ENGINE_ARMED, CHAT_ENGINE_ARMED } from "../config";
import { answerQuestion, getProfile } from "../utils/api";
import type { Profile } from "../utils/api";
import { buildAiProposal, isAiEligibleIntent, minimalProfileForAi } from "./ai-fallback";
import { isExecutable, runChat } from "./chat-agent";
import type { ChatDecision } from "./chat-agent";
import type { ChatContainerDetection } from "./chatbot-detector";
import { detectChatContainer } from "./chatbot-detector";
import { clickOption, sendAnswer, typeInput } from "./chat-interaction";
import type { ChatMessage, ChatPhase, ChatProposal, ChatSendRecord } from "./chat-engine-types";
import type { AnswerSource } from "./form-engine-types";
import { fingerprintOf, fingerprintOfMessage, toChatMessages } from "./message-segmenter";
import { ChatSessionController, createSession, loadChatSession, saveChatSession } from "./chat-session-manager";
import { FORM_ENGINE_STYLES } from "./form-assistant";
import { mountIsolated, unmountIsolated, type IsolatedMount } from "./isolate";

const RESPONSE_TIMEOUT_MS = 20000;
const POLL_INTERVAL_MS = 2000;

const CHAT_ENGINE_STYLES = `
  ${FORM_ENGINE_STYLES}
  .jh-chat-question { font-weight: 600; margin: 0 0 6px; }
  .jh-chat-intent { color: #5b5b6e; margin: 0 0 8px; }
  .jh-chat-proposal { margin: 0 0 8px; }
  .jh-textarea { width: 100%; box-sizing: border-box; min-height: 64px; margin-bottom: 8px; font: inherit; padding: 6px; }
  .jh-emergency-stop {
    position: fixed;
    left: 16px;
    bottom: 16px;
    z-index: 2147483647;
  }
  .jh-emergency-stop button {
    background: #b3261e;
    border: none;
    color: #ffffff;
    border-radius: 999px;
    padding: 8px 14px;
    font: 700 12px/1 system-ui, sans-serif;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  }
`;

function randomId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `session-${Date.now()}`;
}

function containerFingerprint(container: HTMLElement): string {
  const className = typeof container.className === "string" ? container.className : "";
  const marker = container.id || className || "conversation";
  return `${globalThis.location.host}${globalThis.location.pathname}#${marker}`.replace(/\s+/g, " ").trim();
}

interface ChatAssistantProps {
  container: HTMLElement;
  onClose: () => void;
}

export function ChatAssistant({ container, onClose }: ChatAssistantProps) {
  const sessionRef = useRef<ChatSessionController | null>(null);
  const detectionRef = useRef<ChatContainerDetection | null>(null);
  const pendingRef = useRef<ChatDecision[]>([]);
  const recordsRef = useRef<ChatSendRecord[]>([]);
  const busyRef = useRef(false);
  const waitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileRef = useRef<Profile | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);

  const [phase, setPhase] = useState<ChatPhase>("detecting");
  const [profileReady, setProfileReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<ChatDecision | null>(null);
  const [records, setRecords] = useState<ChatSendRecord[]>([]);

  const fingerprint = useMemo(() => containerFingerprint(container), [container]);

  useEffect(() => {
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | null = null;

    async function init(): Promise<void> {
      const persisted = await loadChatSession(fingerprint).catch(() => null);
      if (cancelled) {
        return;
      }
      const controller = new ChatSessionController(persisted ?? createSession(fingerprint, randomId()));
      sessionRef.current = controller;
      setPhase(controller.getState().phase);

      const detection = detectChatContainer(document);
      detectionRef.current = detection;
      if (detection !== null) {
        observerRef.current = new MutationObserver(() => reconcile());
        observerRef.current.observe(detection.container, { childList: true, subtree: true });
        poll = globalThis.setInterval(() => reconcile(), POLL_INTERVAL_MS);
      }

      profileRef.current = await getProfile().catch(() => null);
      if (cancelled) {
        return;
      }
      setProfileReady(true);
      setPhase("reading");
      reconcile();
    }

    void init();

    return () => {
      cancelled = true;
      if (poll !== null) {
        globalThis.clearInterval(poll);
      }
      observerRef.current?.disconnect();
      if (waitTimerRef.current !== null) {
        globalThis.clearTimeout(waitTimerRef.current);
      }
    };
  }, [fingerprint]);

  function persist(): void {
    const controller = sessionRef.current;
    if (controller !== null) {
      void saveChatSession(controller.getState()).catch(() => undefined);
    }
  }

  function clearWaitTimer(): void {
    if (waitTimerRef.current !== null) {
      globalThis.clearTimeout(waitTimerRef.current);
      waitTimerRef.current = null;
    }
  }

  function armWaitTimer(): void {
    clearWaitTimer();
    waitTimerRef.current = globalThis.setTimeout(() => {
      sessionRef.current?.setPhase("completed");
      setPhase("completed");
      persist();
    }, RESPONSE_TIMEOUT_MS);
  }

  function reconcile(): void {
    const controller = sessionRef.current;
    if (controller === null || controller.isStopped() || controller.isPaused()) {
      return;
    }
    const detection = detectChatContainer(document);
    if (detection === null) {
      return;
    }
    detectionRef.current = detection;

    const messages: ChatMessage[] = toChatMessages(detection.rawMessages);
    const botMessages = messages
      .filter((message) => message.role === "BOT")
      .filter((message) => !controller.hasProcessedMessage(fingerprintOfMessage(message)));

    if (botMessages.length === 0) {
      return;
    }

    const run = runChat({
      profile: profileRef.current,
      session: controller.getState(),
      newMessages: botMessages,
      optionButtons: detection.optionButtons,
    });

    controller.replace(run.session);
    persist();
    pendingRef.current.push(...run.decisions);
    setPhase(run.decisions.length > 0 ? "classifying" : "reading");
    void drainPending();
  }

  function isReviewLike(decision: ChatDecision): boolean {
    if (decision.plan.proposal.outcome === "review") {
      return true;
    }
    return (
      decision.plan.proposal.outcome === "auto" &&
      decision.plan.interactionType === "select" &&
      decision.matchedOption === null
    );
  }

  function skipOrBlockedRecord(decision: ChatDecision): ChatSendRecord {
    const proposal = decision.plan.proposal;
    return {
      questionId: decision.question.id,
      intent: decision.question.intent,
      text: decision.question.text,
      value: null,
      source: null,
      status: proposal.outcome === "skip" ? "skipped" : "blocked",
      note: proposal.outcome === "skip" || proposal.outcome === "blocked" ? proposal.reason : "No confirmed profile.",
    };
  }

  async function aiProposalFor(decision: ChatDecision): Promise<ChatProposal | null> {
    if (!AI_ANSWER_ENGINE_ARMED) {
      return null;
    }
    if (!isAiEligibleIntent(decision.question.intent)) {
      return null;
    }
    const profile = profileRef.current;
    if (profile === null) {
      return null;
    }
    try {
      const result = await answerQuestion({
        question: decision.question.text,
        relevant_profile: minimalProfileForAi(profile),
      });
      return buildAiProposal(result);
    } catch {
      return null;
    }
  }

  async function drainPending(): Promise<void> {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    try {
      let drained = 0;
      while (true) {
        const controller = sessionRef.current;
        if (controller === null || controller.isStopped() || controller.isPaused()) {
          break;
        }
        const next = pendingRef.current[0];
        if (next === undefined) {
          break;
        }
        if (isExecutable(next)) {
          pendingRef.current.shift();
          const record = executeDecision(next);
          controller.markQuestionProcessed(fingerprintOf(next.question.text));
          recordsRef.current.push(record);
          setRecords([...recordsRef.current]);
          drained += 1;
          await new Promise((resolve) => globalThis.setTimeout(resolve, 80));
        } else if (isReviewLike(next)) {
          pendingRef.current.shift();
          clearWaitTimer();
          const proposal = await aiProposalFor(next);
          setReviewDecision(
            proposal === null ? next : { ...next, plan: { ...next.plan, proposal } },
          );
          setPhase("review");
          return;
        } else {
          const proposal = await aiProposalFor(next);
          if (proposal !== null) {
            pendingRef.current.shift();
            clearWaitTimer();
            setReviewDecision({ ...next, plan: { ...next.plan, proposal } });
            setPhase("review");
            return;
          }
          pendingRef.current.shift();
          const record = skipOrBlockedRecord(next);
          controller.markQuestionProcessed(fingerprintOf(next.question.text));
          recordsRef.current.push(record);
          setRecords([...recordsRef.current]);
          drained += 1;
          continue;
        }
      }
      if (drained > 0) {
        sessionRef.current?.setPhase("waiting_for_response");
        setPhase("waiting_for_response");
        armWaitTimer();
        persist();
      }
    } finally {
      busyRef.current = false;
    }
  }

  function executeDecision(decision: ChatDecision): ChatSendRecord {
    const proposal = decision.plan.proposal;
    const base = {
      questionId: decision.question.id,
      intent: decision.question.intent,
      text: decision.question.text,
      value: proposal.outcome === "auto" ? proposal.answer.value : null,
      source: proposal.outcome === "auto" ? proposal.answer.source : null,
    };

    if (proposal.outcome !== "auto") {
      return { ...base, status: "no_input", note: "Nothing was sent for this question." };
    }

    if (decision.matchedOption !== null) {
      clickOption(decision.matchedOption);
      return { ...base, status: "sent", note: `Selected option "${decision.matchedOption.text}".` };
    }

    const detection = detectionRef.current;
    const input = detection?.input ?? null;
    if (input === null) {
      return { ...base, status: "no_input", note: "No chat input was found; nothing was sent." };
    }

    typeInput(input, proposal.answer.value);
    const sent = sendAnswer(input);
    if (!sent) {
      input.element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      return { ...base, status: "sent", note: "Sent via Enter (no send button was found)." };
    }
    return { ...base, status: "sent", note: "Typed and sent the answer." };
  }

  function sendValue(value: string, source: AnswerSource): void {
    const controller = sessionRef.current;
    const decision = reviewDecision;
    if (controller === null || decision === null || value.trim().length === 0) {
      return;
    }
    const detection = detectionRef.current;
    const input = detection?.input ?? null;
    if (input !== null) {
      typeInput(input, value);
      const sent = sendAnswer(input);
      if (!sent) {
        input.element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      }
    }
    const record: ChatSendRecord = {
      questionId: decision.question.id,
      intent: decision.question.intent,
      text: decision.question.text,
      value,
      source,
      status: "sent",
      note: "Sent after review.",
    };
    controller.markQuestionProcessed(fingerprintOf(decision.question.text));
    recordsRef.current.push(record);
    setRecords([...recordsRef.current]);
    setReviewDecision(null);
    setPhase("waiting_for_response");
    armWaitTimer();
    persist();
  }

  function pause(): void {
    clearWaitTimer();
    sessionRef.current?.pause();
    setPaused(true);
    setPhase("paused");
    persist();
  }

  function resume(): void {
    const controller = sessionRef.current;
    if (controller === null || controller.isStopped()) {
      return;
    }
    controller.resume();
    setPaused(false);
    setPhase("reading");
    persist();
    void drainPending();
    reconcile();
  }

  function emergencyStop(): void {
    clearWaitTimer();
    sessionRef.current?.emergencyStop();
    setStopped(true);
    setPhase("stopped");
    persist();
  }

  const lastRecord = records.length > 0 ? records[records.length - 1] : null;

  return (
    <div className="jh-chat-host">
      {reviewDecision !== null && phase === "review" && (
        <ChatReviewPanel
          plan={reviewDecision.plan}
          onApprove={() => {
            const decision = reviewDecision;
            if (decision === null) {
              return;
            }
            const proposal = decision.plan.proposal;
            const value = proposal.outcome === "review" || proposal.outcome === "auto" ? proposal.answer.value : "";
            sendValue(value, proposal.outcome === "auto" ? proposal.answer.source : "PROFILE");
          }}
          onEditSubmit={(value: string) => sendValue(value, "USER")}
          onSkip={() => {
            const decision = reviewDecision;
            if (decision !== null) {
              sessionRef.current?.markQuestionProcessed(fingerprintOf(decision.question.text));
              const record: ChatSendRecord = {
                questionId: decision.question.id,
                intent: decision.question.intent,
                text: decision.question.text,
                value: null,
                source: null,
                status: "skipped",
                note: "Skipped by the user.",
              };
              recordsRef.current.push(record);
              setRecords([...recordsRef.current]);
              persist();
            }
            setReviewDecision(null);
            setPhase("reading");
            void drainPending();
          }}
          onPause={pause}
          onStop={emergencyStop}
          onClose={onClose}
        />
      )}
      {phase !== "review" && (
        <ChatApplyPanel
          phase={phase}
          lastRecord={lastRecord}
          paused={paused}
          stopped={stopped}
          onPause={pause}
          onResume={resume}
          onStop={emergencyStop}
          onClose={onClose}
        />
      )}
      <div className="jh-emergency-stop">
        <button type="button" disabled={stopped} onClick={emergencyStop}>
          STOP
        </button>
      </div>
      {profileReady === false && <div className="jh-badge">Job Copilot: loading profile…</div>}
    </div>
  );
}

interface AssistantHandle {
  mount: IsolatedMount;
  root: Root;
}

let active: AssistantHandle | null = null;

export function unmountChatAssistant(): void {
  if (active === null) {
    return;
  }
  active.root.unmount();
  unmountIsolated(active.mount);
  active = null;
}

export function maybeArmChatEngine(armed: boolean = CHAT_ENGINE_ARMED): boolean {
  if (!armed || active !== null) {
    return false;
  }
  const detection = detectChatContainer(document);
  if (detection === null) {
    return false;
  }
  const mount = mountIsolated(CHAT_ENGINE_STYLES);
  const root = createRoot(mount.shadow);
  active = { mount, root };
  root.render(<ChatAssistant container={detection.container} onClose={unmountChatAssistant} />);
  return true;
}