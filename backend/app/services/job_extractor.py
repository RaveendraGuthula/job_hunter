import re

from app.services.resume_parser import _SKILL_LEXICON, _lexicon_matches

_EXPERIENCE_RANGE = re.compile(
    r"(\d{1,2})\s*[-–]\s*(\d{1,2})\s*(?:years?|yrs?)\b", re.IGNORECASE
)
_EXPERIENCE_SINGLE = re.compile(
    r"(\d{1,2})\+?\s*(?:years?|yrs?)\b", re.IGNORECASE
)


def normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    collapsed = re.sub(r"\s+", " ", value).strip()
    return collapsed or None


def extract_skills(description: str) -> list[str]:
    if not description.strip():
        return []
    return _lexicon_matches(description, _SKILL_LEXICON)


def extract_required_experience(description: str) -> str:
    pool = f"{description} "
    match = _EXPERIENCE_RANGE.search(pool)
    if match:
        return f"{int(match.group(1))}-{int(match.group(2))} years"
    match = _EXPERIENCE_SINGLE.search(pool)
    if match:
        return f"{int(match.group(1))} years"
    return ""


def parse_required_experience(value: str | None) -> tuple[int | None, int | None]:
    """Returns (min_years, max_years); a single 'N years' yields (N, N)."""
    if not value:
        return None, None
    match = _EXPERIENCE_RANGE.search(value)
    if match:
        return int(match.group(1)), int(match.group(2))
    match = _EXPERIENCE_SINGLE.search(value)
    if match:
        years = int(match.group(1))
        return years, years
    return None, None


def normalize_job_input(
    *,
    title: str,
    company: str | None,
    location: str | None,
    description: str | None,
    required_experience: str | None,
    skills: list[str],
    salary: str | None,
    job_url: str,
    source: str,
    external_application_url: str | None,
) -> dict:
    """Normalize PRD §9 job fields; extract skills and required experience from the
    description, then merge provided skills with extracted ones (deduped, order kept)."""
    normalized = normalize_text(job_url) or ""
    desc = normalize_text(description) or ""
    provided_skills = [
        normalize_text(skill) for skill in skills if normalize_text(skill)
    ]
    extracted = extract_skills(desc)
    merged: list[str] = []
    for skill in [*provided_skills, *extracted]:
        if skill and skill not in merged:
            merged.append(skill)

    experience = normalize_text(required_experience)
    if not experience and desc:
        experience = extract_required_experience(desc)

    return {
        "title": normalize_text(title) or "",
        "company": normalize_text(company),
        "location": normalize_text(location),
        "description": desc or None,
        "required_experience": experience or None,
        "skills": merged or None,
        "salary": normalize_text(salary),
        "job_url": normalized,
        "source": normalize_text(source) or "",
        "external_application_url": normalize_text(external_application_url),
    }