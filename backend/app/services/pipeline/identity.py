"""What identifies a student, and how to find and mask it in text."""

import re
import unicodedata

# Name particles that are too common to redact on their own.
PARTICLES = {"del", "las", "los", "van", "von", "der", "san", "mac"}
# Chilean RUT, e.g. 12.345.678-9 or 12345678-K.
RUT_PATTERN = r"\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b"
MASK_CHAR = "█"

_ACCENTS = {"a": "aáàäâ", "e": "eéèëê", "i": "iíìïî", "o": "oóòöô", "u": "uúùüû", "n": "nñ", "c": "cç"}


def strip_accents(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")


def identity_terms(name: str, email: str | None) -> list[str]:
    """Strings to redact: full name, each meaningful name token, email and its local part.
    Longest first, so the full name is masked before its parts."""
    terms: set[str] = set()
    name = " ".join(name.split())
    if name:
        terms.add(name)
        for token in re.split(r"[\s\-]+", name):
            if len(token) >= 3 and token.lower() not in PARTICLES:
                terms.add(token)
    if email:
        terms.add(email)
        local = email.split("@", 1)[0]
        if len(local) >= 3:
            terms.add(local)
    return sorted(terms, key=len, reverse=True)


def search_variants(terms: list[str]) -> list[str]:
    """Terms plus their accent-less spelling (for exact-match searches like PDF text search)."""
    variants = {v for t in terms for v in (t, strip_accents(t))}
    return sorted(variants, key=len, reverse=True)


def _accent_insensitive(term: str) -> str:
    out = []
    for char in strip_accents(term).lower():
        out.append(f"[{_ACCENTS[char]}]" if char in _ACCENTS else re.escape(char))
    return "".join(out)


def identity_regex(terms: list[str]) -> re.Pattern[str] | None:
    """Whole-word, case- and accent-insensitive matcher for the terms, plus RUT-like ids."""
    parts = [rf"(?<!\w){_accent_insensitive(t)}(?!\w)" for t in terms if t.strip()]
    parts.append(RUT_PATTERN)
    return re.compile("|".join(parts), re.IGNORECASE)


def mask_same_length(text: str, pattern: re.Pattern[str] | None) -> str:
    """Replace matches with a run of MASK_CHAR of the same length, so monospace
    layout (and therefore PDF page breaks) doesn't change."""
    if pattern is None:
        return text
    return pattern.sub(lambda m: MASK_CHAR * len(m.group(0)), text)


def replace_with_label(text: str, pattern: re.Pattern[str] | None, label: str = "[ESTUDIANTE]") -> str:
    if pattern is None:
        return text
    return pattern.sub(label, text)
