export interface IsolatedMount {
  host: HTMLDivElement;
  shadow: ShadowRoot;
}

export const HOST_ID = "job-hunter-root";

export function mountIsolated(styles?: string): IsolatedMount {
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.dataset.extension = "job-hunter";

  const shadow = host.attachShadow({ mode: "open" });

  if (styles) {
    const styleEl = document.createElement("style");
    styleEl.textContent = styles;
    shadow.appendChild(styleEl);
  }

  document.documentElement.appendChild(host);
  return { host, shadow };
}

export function unmountIsolated(mount: IsolatedMount): void {
  mount.host.remove();
}