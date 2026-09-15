"""Provider abstraction for AI inference.

The rest of the application depends on `AIProvider`, not on any specific model
vendor. Groq is the supported provider for this phase (see ARCHITECTURE.md §3.3);
raw Groq API calls are used for standard JSON completions, and Agno-style agent
runners are intentionally NOT required here.
"""

import time
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class ProviderUsage:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


@dataclass(frozen=True)
class ProviderResponse:
    content: str
    usage: ProviderUsage
    latency_ms: int


class AIProvider(Protocol):
    name: str
    model: str

    async def complete(
        self,
        *,
        system: str,
        prompt: str,
        max_tokens: int,
        timeout_seconds: float,
    ) -> ProviderResponse: ...


class GroqProvider:
    name = "groq"

    def __init__(self, api_key: str, model: str) -> None:
        self._api_key = api_key
        self.model = model

    async def complete(
        self,
        *,
        system: str,
        prompt: str,
        max_tokens: int,
        timeout_seconds: float,
    ) -> ProviderResponse:
        # Imported lazily so the rest of the app and the test-suite never require
        # the Groq SDK (or network access) unless a real AI call is performed.
        from groq import AsyncGroq

        client = AsyncGroq(api_key=self._api_key, timeout=timeout_seconds)
        started = time.perf_counter()
        response = await client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            temperature=0,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )
        elapsed_ms = max(1, round((time.perf_counter() - started) * 1000))

        content = ""
        if response.choices:
            message = response.choices[0].message
            content = message.content if message.content is not None else ""

        usage = response.usage
        usages = ProviderUsage(
            prompt_tokens=usage.prompt_tokens if usage else 0,
            completion_tokens=usage.completion_tokens if usage else 0,
            total_tokens=usage.total_tokens if usage else 0,
        )
        return ProviderResponse(content=content, usage=usages, latency_ms=elapsed_ms)