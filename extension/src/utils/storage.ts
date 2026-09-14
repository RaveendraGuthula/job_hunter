const ACCESS_TOKEN_KEY = "accessToken";

function localStorageArea(): chrome.storage.LocalStorageArea | null {
  return globalThis.chrome?.storage?.local ?? null;
}

export async function getToken(): Promise<string | null> {
  const store = localStorageArea();
  if (store === null) {
    return null;
  }
  const data = await store.get(ACCESS_TOKEN_KEY);
  const value = data?.[ACCESS_TOKEN_KEY];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function setToken(token: string): Promise<void> {
  const store = localStorageArea();
  if (store === null) {
    return;
  }
  await store.set({ [ACCESS_TOKEN_KEY]: token });
}

export async function clearToken(): Promise<void> {
  const store = localStorageArea();
  if (store === null) {
    return;
  }
  await store.remove(ACCESS_TOKEN_KEY);
}