"""Deterministic classification of free-text questions into field intents.

Mirrors the intent catalog used by the extension's `question-classifier.ts` so the
backend and client agree on intents and confidence values.
"""

import re
from dataclasses import dataclass

from app.services.form_intents import FieldIntent

SKILL_LIST_INTENT = FieldIntent.SKILL_LIST
FREE_TEXT_INTENT = FieldIntent.FREE_TEXT
UNKNOWN_INTENT = FieldIntent.UNKNOWN


@dataclass(frozen=True)
class QuestionClassification:
    intent: FieldIntent
    confidence: float
    skill_hint: str | None = None


@dataclass(frozen=True)
class _KeywordRule:
    intent: FieldIntent
    keywords: list[str]
    weight: int


_RULES: list[_KeywordRule] = [
    _KeywordRule(
        FieldIntent.SKILL_LIST,
        [
            "list your skills",
            "key skills",
            "top skills",
            "primary skills",
            "strongest skills",
            "what are your skills",
            "tell us your skills",
            "your skill set",
            "which skills do you have",
        ],
        3,
    ),
    _KeywordRule(
        FieldIntent.NAME,
        ["what is your name", "your full name", "please tell me your name", "your name please", "what is your full name"],
        4,
    ),
    _KeywordRule(
        FieldIntent.EMAIL,
        ["your email", "what is your email", "your email address", "what is your email address", "email address"],
        4,
    ),
    _KeywordRule(
        FieldIntent.PHONE,
        ["your phone number", "phone number", "contact number", "what is your mobile number", "mobile number", "your phone"],
        3,
    ),
    _KeywordRule(
        FieldIntent.LOCATION,
        ["current location", "where are you based", "your location", "what is your location", "city of residence", "where do you currently live", "what is your current city"],
        3,
    ),
    _KeywordRule(
        FieldIntent.TOTAL_EXPERIENCE,
        ["how many years of experience", "years of experience", "total experience", "how much experience do you have", "years of work experience", "your experience in years", "overall experience"],
        3,
    ),
    _KeywordRule(
        FieldIntent.EDUCATION,
        ["highest level of education", "your education", "educational background", "your academic background", "tell me about your education"],
        3,
    ),
    _KeywordRule(
        FieldIntent.DEGREE,
        ["what is your degree", "your degree", "highest degree", "degree", "qualification"],
        3,
    ),
    _KeywordRule(
        FieldIntent.EDUCATION_LEVEL,
        ["education level", "level of education", "education qualification"],
        3,
    ),
    _KeywordRule(
        FieldIntent.CERTIFICATION,
        ["certifications", "certification", "do you have any certificates", "professional certificates"],
        3,
    ),
    _KeywordRule(
        FieldIntent.SALARY_CURRENT,
        ["current salary", "current ctc", "present salary", "current compensation", "your current salary"],
        3,
    ),
    _KeywordRule(
        FieldIntent.SALARY_EXPECTED,
        ["expected salary", "expected ctc", "expected compensation", "salary expectation", "salary expectations", "desired salary", "what salary are you looking for", "what is your expected salary"],
        3,
    ),
    _KeywordRule(
        FieldIntent.NOTICE_PERIOD,
        ["notice period", "how long is your notice period", "current notice period"],
        3,
    ),
    _KeywordRule(
        FieldIntent.WORK_AUTHORIZATION,
        ["work authorization", "work authorisation", "visa status", "your visa", "authorization to work", "eligible to work", "right to work", "your work status"],
        4,
    ),
    _KeywordRule(
        FieldIntent.RELOCATION,
        ["willing to relocate", "relocate for", "ready to relocate", "relocation", "are you willing to move"],
        3,
    ),
    _KeywordRule(
        FieldIntent.REMOTE_WORK,
        ["prefer to work remotely", "work remotely", "remote work", "work from home", "remote or onsite", "do you want remote"],
        3,
    ),
    _KeywordRule(
        FieldIntent.AVAILABILITY,
        ["when can you join", "when are you available", "your availability", "how soon can you join", "availability to join", "when can you start", "start date", "joining date", "days needed to join"],
        3,
    ),
    _KeywordRule(
        FieldIntent.CURRENT_COMPANY,
        ["current company", "current employer", "where do you currently work", "name of the company you work for", "your current organisation"],
        3,
    ),
    _KeywordRule(
        FieldIntent.JOB_TITLE,
        ["current job title", "current designation", "your current role", "what is your job title", "present designation"],
        3,
    ),
]

_FREE_TEXT_PATTERNS: list[_KeywordRule] = [
    _KeywordRule(
        FREE_TEXT_INTENT,
        ["tell us about yourself", "introduce yourself", "about yourself", "cover letter", "pitch yourself", "why do you want to work"],
        4,
    ),
    _KeywordRule(
        FREE_TEXT_INTENT,
        ["write a summary", "summarize your career", "summarise your career"],
        3,
    ),
]

_SKILL_EXPERIENCE_PATTERN = re.compile(
    r"(?:how many years of experience do you have (?:with|in|using)|years of experience (?:with|in|using)|how much experience do you have (?:with|in|using)|experience (?:with|in|using))\s+([A-Za-z0-9][A-Za-z0-9+#.\- /]{1,50}?)(?=\s*\?|$)",
    re.IGNORECASE,
)

_SKILL_BOOLEAN_PATTERN = re.compile(
    r"(?:do you (?:know|have|use|work with)|do you have (?:any )?(?:experience|expertise|proficiency|knowledge|hands-on experience|working experience)\s+(?:with|in|using)|have you (?:worked with|worked on|used|built|dealt with)|are you (?:proficient in|familiar with|experienced with|comfortable with|good with|strong with|hands-on with)|proficient in|proficiency with|knowledge of|strong in|expertise in)\s+([A-Za-z0-9][A-Za-z0-9+#.\- /]{1,50}?)(?=\s*\?|$)",
    re.IGNORECASE,
)

_SKILL_STOP_WORDS = (
    "any",
    "your",
    "the",
    "any of the",
    "any of these",
    "any of those",
    "following",
    "these",
    "those",
    "technologies",
    "technology",
    "languages",
    "language",
    "programming language",
    "programming languages",
    "scripting language",
    "frameworks",
    "framework",
    "tools",
    "tool",
    "platforms",
    "platform",
    "libraries",
    "library",
    "skills",
    "skill",
    "areas",
    "area",
    "things",
    "stuff",
    "certifications",
    "certification",
    "experience",
    "it",
    "that",
)

_LEADING_PHRASES_PATTERN = re.compile(
    r"^(what is|what are|please tell me|please share|can you tell me|do you have|are you|how about)\s+"
)


def normalize_question_text(value: str) -> str:
    """Lowercase, collapse non-letter/non-number characters, strip lead-ins."""
    normalized = re.sub(r"[^\w]+", " ", value.lower())
    return _LEADING_PHRASES_PATTERN.sub("", normalized).strip()


def extract_skill_hint(text: str) -> str | None:
    match = _SKILL_EXPERIENCE_PATTERN.search(text) or _SKILL_BOOLEAN_PATTERN.search(text)
    if match is None:
        return None
    hint = re.sub(r"\s+", " ", match.group(1)).strip()
    if len(hint) == 0:
        return None
    for _ in range(3):
        non_stop = next((word for word in _SKILL_STOP_WORDS if hint.lower() == word), None)
        if non_stop is not None:
            return None
        stop = next((word for word in _SKILL_STOP_WORDS if hint.lower().endswith(word)), None)
        if stop is None:
            break
        hint = re.sub(r"\s+", " ", hint[: len(hint) - len(stop)]).strip()
    return hint if len(hint) >= 2 else None


def _has_rule_keyword(normalized: str, keywords: list[str]) -> int:
    score = 0
    for keyword in keywords:
        normalized_keyword = normalize_question_text(keyword)
        if normalized_keyword in normalized:
            score += 3 if len(keyword) >= 12 else 2
        if normalized == normalized_keyword:
            score += 2
    return score


def classify_question(text: str) -> QuestionClassification:
    normalized = normalize_question_text(text)
    if len(normalized) == 0:
        return QuestionClassification(UNKNOWN_INTENT, 0.0)

    skill_hint = extract_skill_hint(text)
    if skill_hint is not None:
        is_experience = _SKILL_EXPERIENCE_PATTERN.search(text) is not None
        return QuestionClassification(
            intent=FieldIntent.SKILL_EXPERIENCE if is_experience else FieldIntent.SKILL_BOOLEAN,
            confidence=0.9,
            skill_hint=skill_hint,
        )

    for pattern in _FREE_TEXT_PATTERNS:
        score = _has_rule_keyword(normalized, pattern.keywords)
        if score > 0:
            return QuestionClassification(
                FREE_TEXT_INTENT, min(0.95, 0.4 + score * 0.15)
            )

    best_intent: FieldIntent = UNKNOWN_INTENT
    best_score = 0
    for rule in _RULES:
        score = _has_rule_keyword(normalized, rule.keywords)
        if score > best_score:
            best_score = score
            best_intent = rule.intent

    if best_intent == UNKNOWN_INTENT:
        return QuestionClassification(UNKNOWN_INTENT, 0.0)

    return QuestionClassification(best_intent, min(0.95, 0.3 + best_score * 0.2))