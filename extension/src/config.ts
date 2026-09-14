export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export const API_PREFIX = `${API_BASE_URL}/api`;

// The Form Engine never touches a live page unless this is explicitly armed.
// Keep it false for production-safe behavior; tests exercise the engine modules
// directly and may mount the assistant with the flag overridden.
export const FORM_ENGINE_ARMED = false;

// The Chatbot Engine (conversational application flows) is gated the same way.
// Keep it false for production-safe behavior.
export const CHAT_ENGINE_ARMED = false;