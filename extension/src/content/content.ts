import { mountIsolated } from "./isolate";

const ISOLATED_STYLES = `
  .jh-badge {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 2147483647;
    padding: 8px 12px;
    border-radius: 999px;
    background: #1a1a2e;
    color: #eaeaea;
    font: 12px/1.4 system-ui, sans-serif;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
    user-select: none;
  }
`;

function bootstrap(): void {
  const mount = mountIsolated(ISOLATED_STYLES);
  const badge = document.createElement("div");
  badge.className = "jh-badge";
  badge.textContent = "Job Copilot foundation loaded";
  mount.shadow.appendChild(badge);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
} else {
  bootstrap();
}