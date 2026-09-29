from app.services.pipeline.identity import (
    identity_regex,
    identity_terms,
    mask_same_length,
    replace_with_label,
    search_variants,
)


def test_terms_skip_short_tokens_and_particles():
    terms = identity_terms("María José de los Ángeles Pérez", "mjperez@uchile.cl")
    assert terms[0] == "María José de los Ángeles Pérez"  # longest first
    assert {"María", "José", "Ángeles", "Pérez", "mjperez", "mjperez@uchile.cl"} <= set(terms)
    assert "de" not in terms and "los" not in terms


def test_regex_is_accent_and_case_insensitive_whole_word():
    pattern = identity_regex(identity_terms("José Pérez", None))
    assert replace_with_label("Autor: JOSE perez", pattern) == "Autor: [ESTUDIANTE]"
    assert replace_with_label("por Perez, J.", pattern) == "por [ESTUDIANTE], J."
    assert replace_with_label("Nombre: José Pérez", pattern) == "Nombre: [ESTUDIANTE]"
    # Not inside other words.
    assert replace_with_label("perezoso", pattern) == "perezoso"


def test_rut_is_masked():
    pattern = identity_regex([])
    assert replace_with_label("RUT 12.345.678-k", pattern) == "RUT [ESTUDIANTE]"


def test_mask_keeps_length():
    pattern = identity_regex(identity_terms("Ana Soto", None))
    text = "# Autora: Ana Soto\nx = 1"
    masked = mask_same_length(text, pattern)
    assert len(masked) == len(text) and "Ana" not in masked and "Soto" not in masked


def test_search_variants_add_unaccented():
    assert "Perez" in search_variants(["Pérez"])
