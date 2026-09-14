import re

from app.services.job_extractor import parse_required_experience
from app.services.resume_parser import _DEGREE_KEYWORDS

WEIGHTS = {"skills": 0.40, "experience": 0.25, "education": 0.15, "location": 0.20}


def _norm(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip().lower()


def _reason(dimension: str, outcome: str, message: str) -> dict:
    return {"dimension": dimension, "outcome": outcome, "message": message}


def _skills_score(profile_skills: list[str], job_skills: list[str]) -> tuple[int, list[dict]]:
    reasons: list[dict] = []
    if not job_skills:
        return 0, [
            _reason(
                "skills",
                "insufficient",
                "The job lists no skills, so a skills score cannot be computed.",
            )
        ]
    owned = {_norm(skill) for skill in profile_skills}
    matched = [skill for skill in job_skills if _norm(skill) in owned]
    missed = [skill for skill in job_skills if _norm(skill) not in owned]
    score = round(100 * len(matched) / len(job_skills))
    if matched:
        reasons.append(
            _reason(
                "skills",
                "match",
                f"Profile covers {len(matched)} of {len(job_skills)} listed skills: {', '.join(matched)}.",
            )
        )
    if missed:
        reasons.append(
            _reason(
                "skills",
                "miss",
                f"Skills listed in the job not found in the profile: {', '.join(missed)}.",
            )
        )
    return score, reasons


def _experience_score(
    profile_total: int | None, required_experience: str | None
) -> tuple[int, list[dict]]:
    reasons: list[dict] = []
    if profile_total is None:
        return 0, [
            _reason(
                "experience",
                "insufficient",
                "The profile has no confirmed total experience to compare.",
            )
        ]
    minimum, maximum = parse_required_experience(required_experience)
    if minimum is None or maximum is None:
        return 0, [
            _reason(
                "experience",
                "insufficient",
                "The job states no parseable required experience.",
            )
        ]
    if profile_total >= maximum:
        score = 100
        reasons.append(
            _reason(
                "experience",
                "match",
                f"{profile_total} years meets or exceeds the required {minimum}-{maximum} years.",
            )
        )
    elif profile_total >= minimum:
        span = maximum - minimum
        score = round(60 + 40 * (profile_total - minimum) / span) if span > 0 else 100
        reasons.append(
            _reason(
                "experience",
                "partial",
                f"{profile_total} years is within the required {minimum}-{maximum} years.",
            )
        )
    else:
        score = min(round(40 * profile_total / minimum), 40)
        reasons.append(
            _reason(
                "experience",
                "miss",
                f"{profile_total} years is below the required {minimum}-{maximum} years.",
            )
        )
    return score, reasons


def _education_score(
    profile_degrees: list[str], description: str | None
) -> tuple[int, list[dict]]:
    lower = _norm(description)
    required = [
        keyword
        for keyword in _DEGREE_KEYWORDS
        if re.search(
            rf"(?<![a-z0-9]){re.escape(keyword)}(?![a-z0-9])", lower
        )
    ]
    if not required:
        return 100, [
            _reason(
                "education",
                "match",
                "The job states no degree requirement, so education is not a constraint.",
            )
        ]
    degrees = [_norm(degree) for degree in profile_degrees]
    matched = [keyword for keyword in required if any(keyword in degree for degree in degrees)]
    if matched:
        return 100, [
            _reason(
                "education",
                "match",
                f"Profile education matches the stated requirement ({', '.join(matched)}).",
            )
        ]
    if not degrees:
        return 0, [
            _reason(
                "education",
                "miss",
                "The job states a degree requirement but the profile has no confirmed education.",
            )
        ]
    return 30, [
        _reason(
            "education",
            "partial",
            "The profile has education, but it does not match the stated requirement.",
        )
    ]


def _location_score(
    job_location: str | None,
    profile_location: str | None,
    preferred_locations: list[str] | None,
    remote_preference: bool | None,
    relocation_preference: bool | None,
) -> tuple[int, list[dict]]:
    job = _norm(job_location)
    if not job:
        return 100, [
            _reason(
                "location",
                "match",
                "The job location is not provided, so location is not a constraint.",
            )
        ]
    if remote_preference and "remote" in job:
        return 100, [
            _reason("location", "match", "The job allows remote work and the user prefers remote.")
        ]
    for location in preferred_locations or []:
        if _norm(location) and _norm(location) in job:
            return 100, [
                _reason("location", "match", f"Matches the preferred location '{location}'.")
            ]
    if relocation_preference:
        return 60, [
            _reason("location", "partial", "The job is outside preferred locations, but the user will relocate.")
        ]
    if _norm(profile_location) and _norm(profile_location) in job:
        return 80, [
            _reason("location", "partial", "The job location matches the user's current location.")
        ]
    return 0, [
        _reason("location", "miss", "The job location does not match the user's location preferences.")
    ]


def match_job(profile, job) -> dict:
    """Deterministic, explainable match of a confirmed profile against a normalized job.

    `profile` is a loaded Profile ORM object; `job` is a loaded Job ORM object.
    Returns a dict with overall 0-100 score, per-dimension scores, and reasons.
    """
    skills_score, skills_reasons = _skills_score(
        [skill.name for skill in profile.skills], job.skills or []
    )
    experience_score, experience_reasons = _experience_score(
        profile.total_experience, job.required_experience
    )
    education_score, education_reasons = _education_score(
        [education.degree for education in profile.education], job.description
    )
    location_score, location_reasons = _location_score(
        job.location,
        profile.location,
        profile.preferences.preferred_locations if profile.preferences else [],
        profile.preferences.remote_preference if profile.preferences else None,
        profile.preferences.relocation_preference if profile.preferences else None,
    )

    overall = round(
        WEIGHTS["skills"] * skills_score
        + WEIGHTS["experience"] * experience_score
        + WEIGHTS["education"] * education_score
        + WEIGHTS["location"] * location_score
    )

    reasons: list[dict] = [
        *skills_reasons,
        *experience_reasons,
        *education_reasons,
        *location_reasons,
    ]
    return {
        "overall_score": overall,
        "skills_score": skills_score,
        "experience_score": experience_score,
        "education_score": education_score,
        "location_score": location_score,
        "reasons": reasons,
    }