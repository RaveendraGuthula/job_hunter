import type { ChatPhase, ChatSessionState } from "./chat-engine-types";

export const CHAT_SESSION_KEY_PREFIX = "chat-session:";

interface StorageArea {
  get(keys: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface ChatSessionAdapter {
  load(key: string): Promise<ChatSessionState | null>;
  save(key: string, state: ChatSessionState): Promise<void>;
}

function clone(state: ChatSessionState): ChatSessionState {
  return JSON.parse(JSON.stringify(state)) as ChatSessionState;
}

const memory = new Map<string, ChatSessionState>();

export const MEMORY_SESSION_ADAPTER: ChatSessionAdapter = {
  async load(key) {
    const state = memory.get(key);
    return state === undefined ? null : clone(state);
  },
  async save(key, state) {
    memory.set(key, clone(state));
  },
};

function runtimeChrome(): { storage?: { session?: StorageArea } } | undefined {
  return (globalThis as { chrome?: { storage?: { session?: StorageArea } } }).chrome;
}

function chromeSessionArea(): StorageArea | null {
  const area = runtimeChrome()?.storage?.session;
  return area ?? null;
}

function chromeAdapter(area: StorageArea): ChatSessionAdapter {
  return {
    async load(key) {
      const result = await area.get(key);
      const value = result[key] as unknown;
      return value === undefined || typeof value !== "object" || value === null
        ? null
        : (value as ChatSessionState);
    },
    async save(key, state) {
      await area.set({ [key]: clone(state) });
    },
  };
}

export function getSessionAdapter(): ChatSessionAdapter {
  const area = chromeSessionArea();
  return area === null ? MEMORY_SESSION_ADAPTER : chromeAdapter(area);
}

export function sessionStorageKey(fingerprint: string): string {
  return `${CHAT_SESSION_KEY_PREFIX}${fingerprint}`;
}

export function createSession(fingerprint: string, sessionId: string): ChatSessionState {
  return {
    sessionId,
    containerFingerprint: fingerprint,
    phase: "detecting",
    processedMessageFingerprints: [],
    processedQuestionFingerprints: [],
    emergencyStop: false,
  };
}

export async function loadChatSession(fingerprint: string): Promise<ChatSessionState | null> {
  const adapter = getSessionAdapter();
  return adapter.load(sessionStorageKey(fingerprint));
}

export async function saveChatSession(state: ChatSessionState): Promise<void> {
  const adapter = getSessionAdapter();
  await adapter.save(sessionStorageKey(state.containerFingerprint), state);
}

export class ChatSessionController {
  private state: ChatSessionState;

  constructor(initial: ChatSessionState) {
    this.state = clone(initial);
  }

  getState(): ChatSessionState {
    return clone(this.state);
  }

  replace(state: ChatSessionState): void {
    this.state = clone(state);
  }

  hasProcessedMessage(fingerprint: string): boolean {
    return this.state.processedMessageFingerprints.includes(fingerprint);
  }

  markMessageProcessed(fingerprint: string): void {
    if (!this.state.processedMessageFingerprints.includes(fingerprint)) {
      this.state.processedMessageFingerprints = [...this.state.processedMessageFingerprints, fingerprint];
    }
  }

  hasProcessedQuestion(fingerprint: string): boolean {
    return this.state.processedQuestionFingerprints.includes(fingerprint);
  }

  markQuestionProcessed(fingerprint: string): void {
    if (!this.state.processedQuestionFingerprints.includes(fingerprint)) {
      this.state.processedQuestionFingerprints = [...this.state.processedQuestionFingerprints, fingerprint];
    }
  }

  setPhase(phase: ChatPhase): void {
    this.state.phase = phase;
  }

  pause(): void {
    if (!this.state.emergencyStop) {
      this.state.phase = "paused";
    }
  }

  resume(): void {
    if (this.state.emergencyStop) {
      return;
    }
    this.state.phase = "reading";
  }

  emergencyStop(): void {
    this.state.emergencyStop = true;
    this.state.phase = "stopped";
  }

  isPaused(): boolean {
    return this.state.phase === "paused";
  }

  isStopped(): boolean {
    return this.state.emergencyStop || this.state.phase === "stopped";
  }
}