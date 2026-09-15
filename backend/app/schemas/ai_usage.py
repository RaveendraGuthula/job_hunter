from datetime import datetime

from pydantic import BaseModel


class AiUsageSummary(BaseModel):
    total_calls: int = 0
    ai_generated_answers: int = 0
    failed_calls: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    average_latency_ms: float = 0.0
    last_used_at: datetime | None = None