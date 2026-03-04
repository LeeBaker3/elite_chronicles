from scripts.bootstrap_known_star_systems import RealStarNameCatalog
from scripts.bootstrap_known_star_systems import _extract_real_star_names_from_rows
from scripts.bootstrap_known_star_systems import _select_real_star_name


def test_extract_real_star_names_prefers_clean_unique_values() -> None:
    rows = [
        {"proper": "Altair", "bf": "Alp CMa"},
        {"proper": "", "bf": "Bet Ori"},
        {"proper": "Altair", "bf": ""},
        {"proper": "Sol", "bf": ""},
        {"proper": "", "bf": "12345"},
    ]

    catalog = _extract_real_star_names_from_rows(rows, max_names=10)
    names = catalog.names

    assert "Altair" in names
    assert "Bet Ori" in names
    assert "Sol" not in names
    assert "12345" not in names
    assert catalog.preferred_count >= 1


def test_extract_real_star_names_respects_max_names_limit() -> None:
    rows = [
        {"proper": "Altair", "bf": ""},
        {"proper": "Rigel", "bf": ""},
        {"proper": "Vega", "bf": ""},
    ]

    names = _extract_real_star_names_from_rows(rows, max_names=2).names

    assert len(names) == 2
    assert names == ("Altair", "Rigel")


def test_select_real_star_name_uses_deterministic_unused_choice() -> None:
    catalog = RealStarNameCatalog(
        names=("Altair", "Rigel", "Vega"),
        preferred_count=2,
    )
    used_names: set[str] = {"altair"}

    selected = _select_real_star_name(
        base_key="procedural-chart-system-0001-v1",
        real_star_catalog=catalog,
        used_real_names=used_names,
    )

    assert selected in {"Rigel", "Vega"}
    assert selected is not None
    assert selected.casefold() in used_names
