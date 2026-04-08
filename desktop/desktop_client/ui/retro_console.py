"""Retro-modern cockpit HUD presenter for the desktop client."""

from __future__ import annotations

from dataclasses import dataclass

from desktop_client.models import RuntimeBootstrapState
from desktop_client.system_renderer import DebugSceneSnapshot


@dataclass(frozen=True, slots=True)
class RetroHudTheme:
    """Visual theme tokens for the retro desktop cockpit shell."""

    theme_name: str
    phosphor_primary: str
    phosphor_secondary: str
    phosphor_warning: str
    phosphor_alert: str
    bezel_light: str
    bezel_shadow: str
    surface_background: str
    panel_fill: str
    panel_inner: str
    gauge_background: str
    gauge_bevel_light: str
    gauge_bevel_shadow: str
    gauge_tick: str
    panel_text: str


@dataclass(frozen=True, slots=True)
class CockpitArchGeometry:
    """Geometry tokens for the lower cockpit console shell."""

    lower_console_profile: str
    arch_height_ratio: float
    lower_console_inset_ratio: float
    viewport_corner_radius_px: int
    console_corner_radius_px: int
    bezel_thickness_px: int


@dataclass(frozen=True, slots=True)
class RetroGauge:
    """One compact cockpit gauge suitable for left-side status stacks."""

    key: str
    label: str
    current: int
    maximum: int
    fill_ratio: float
    unit: str
    tone: str


@dataclass(frozen=True, slots=True)
class RetroScannerSummary:
    """Center scanner and situational summary for the lower cockpit."""

    active_scene_name: str
    current_system_name: str
    snapshot_version: str | None
    total_entities: int
    nearby_entities: int
    target_name: str
    target_type: str
    target_distance_km: int | None


@dataclass(frozen=True, slots=True)
class RetroCommsSummary:
    """Right-side comms panel data for the desktop cockpit shell."""

    relay_state: str
    unread_count: int
    focus_channel: str
    preview_lines: tuple[str, ...]
    composition_hint: str


@dataclass(frozen=True, slots=True)
class RetroCommandButton:
    """One lower-band command button in the retro cockpit shell."""

    key: str
    label: str
    enabled: bool
    highlighted: bool


@dataclass(frozen=True, slots=True)
class RetroCockpitHudLayout:
    """Stable desktop HUD layout spec for debug output and future Panda3D UI."""

    theme: RetroHudTheme
    geometry: CockpitArchGeometry
    left_gauges: tuple[RetroGauge, ...]
    center_scanner: RetroScannerSummary
    right_comms: RetroCommsSummary
    command_bar: tuple[RetroCommandButton, ...]
    footer_label: str


@dataclass(frozen=True, slots=True)
class RetroHudPreset:
    """Named HUD preset combining palette and shell geometry."""

    theme: RetroHudTheme
    geometry: CockpitArchGeometry


RETRO_HUD_PRESETS = {
    "circuit-teal": RetroHudPreset(
        theme=RetroHudTheme(
            theme_name="circuit-teal",
            phosphor_primary="#8ff7b2",
            phosphor_secondary="#b7d9c3",
            phosphor_warning="#ffd36b",
            phosphor_alert="#ff7b57",
            bezel_light="#d7c98a",
            bezel_shadow="#2d3325",
            surface_background="#040705",
            panel_fill="#1a2017",
            panel_inner="#08100b",
            gauge_background="#030504",
            gauge_bevel_light="#9eb3a6",
            gauge_bevel_shadow="#263129",
            gauge_tick="#b7d9c3",
            panel_text="#8ff7b2",
        ),
        geometry=CockpitArchGeometry(
            lower_console_profile="arch",
            arch_height_ratio=0.18,
            lower_console_inset_ratio=0.06,
            viewport_corner_radius_px=22,
            console_corner_radius_px=28,
            bezel_thickness_px=16,
        ),
    ),
    "merchant-amber": RetroHudPreset(
        theme=RetroHudTheme(
            theme_name="merchant-amber",
            phosphor_primary="#ffd06a",
            phosphor_secondary="#f4e4bf",
            phosphor_warning="#ff9b42",
            phosphor_alert="#ff644f",
            bezel_light="#d2b56a",
            bezel_shadow="#3e2b14",
            surface_background="#090705",
            panel_fill="#332613",
            panel_inner="#120c07",
            gauge_background="#050402",
            gauge_bevel_light="#d0c19a",
            gauge_bevel_shadow="#4b3720",
            gauge_tick="#f4e4bf",
            panel_text="#ffd06a",
        ),
        geometry=CockpitArchGeometry(
            lower_console_profile="arch",
            arch_height_ratio=0.15,
            lower_console_inset_ratio=0.07,
            viewport_corner_radius_px=24,
            console_corner_radius_px=32,
            bezel_thickness_px=18,
        ),
    ),
    "acorn-classic": RetroHudPreset(
        theme=RetroHudTheme(
            theme_name="acorn-classic",
            phosphor_primary="#efe6a5",
            phosphor_secondary="#cfc684",
            phosphor_warning="#ff3d3d",
            phosphor_alert="#51d2d2",
            bezel_light="#f3eab3",
            bezel_shadow="#8d8542",
            surface_background="#020201",
            panel_fill="#eeeeb1",
            panel_inner="#0a0904",
            gauge_background="#080804",
            gauge_bevel_light="#c8ccd2",
            gauge_bevel_shadow="#565b62",
            gauge_tick="#b8af6a",
            panel_text="#050505",
        ),
        geometry=CockpitArchGeometry(
            lower_console_profile="arch",
            arch_height_ratio=0.16,
            lower_console_inset_ratio=0.06,
            viewport_corner_radius_px=20,
            console_corner_radius_px=30,
            bezel_thickness_px=18,
        ),
    ),
}


DISPLAY_TEXT_TRANSLATIONS = str.maketrans(
    {
        "↔": "<->",
        "→": "->",
        "←": "<-",
        "•": "*",
        "·": "-",
        "—": "-",
        "–": "-",
    }
)


def available_retro_hud_themes() -> tuple[str, ...]:
    """Return supported HUD preset names for CLI and renderer selection."""

    return tuple(RETRO_HUD_PRESETS.keys())


def sanitize_display_text(value: str) -> str:
    """Map runtime text to an ASCII-safe form for Panda3D fallback fonts."""

    normalized = value.translate(DISPLAY_TEXT_TRANSLATIONS)
    return normalized.encode("ascii", "replace").decode("ascii")


def _resolve_preset(theme_name: str) -> RetroHudPreset:
    """Return one named HUD preset, falling back to the primary variant."""

    return RETRO_HUD_PRESETS.get(theme_name, RETRO_HUD_PRESETS["acorn-classic"])


def _ratio(current: int, maximum: int) -> float:
    """Return one safe gauge ratio."""

    if maximum <= 0:
        return 0.0
    return max(0.0, min(1.0, current / maximum))


def _gauge_tone(fill_ratio: float, *, low_threshold: float) -> str:
    """Map a fill ratio to a named gauge tone."""

    return "warning" if fill_ratio < low_threshold else "primary"


def _nearest_entity(debug_scene: DebugSceneSnapshot):
    """Return the nearest non-player scene entity for scanner summaries."""

    if not debug_scene.entities:
        return None
    return min(debug_scene.entities, key=lambda entity: entity.distance_km)


def _trim_preview_line(author: str, body: str, limit: int = 52) -> str:
    """Return one compact comms preview line."""

    prefix = f"{sanitize_display_text(author)}: "
    body_text = sanitize_display_text(body.strip().replace("\n", " "))
    available = max(8, limit - len(prefix))
    if len(body_text) > available:
        body_text = f"{body_text[:available - 3].rstrip()}..."
    return f"{prefix}{body_text}"


def _active_channel(state: RuntimeBootstrapState):
    """Return the selected comms channel from runtime state."""

    if state.comms.active_channel_id is None:
        return None
    return next(
        (
            channel
            for channel in state.comms.channels
            if channel.id == state.comms.active_channel_id
        ),
        None,
    )


def _build_comms_summary(state: RuntimeBootstrapState) -> RetroCommsSummary:
    """Build the cockpit comms pane from live desktop comms state."""

    active_channel = _active_channel(state)
    if active_channel is None:
        return RetroCommsSummary(
            relay_state="offline",
            unread_count=0,
            focus_channel="NO CHANNEL",
            preview_lines=(
                "No comms channels are available for this commander.",),
            composition_hint=(
                "Comms sync will populate this pane once channels are "
                "available."
            ),
        )

    relay_state = "delayed" if active_channel.scope == "interstellar" else "live"
    recent_messages = state.comms.messages[-3:]
    preview_lines = tuple(
        _trim_preview_line(message.author, message.body)
        for message in recent_messages
    )
    if not preview_lines:
        preview_lines = ("No message history in the selected channel.",)

    return RetroCommsSummary(
        relay_state=relay_state,
        unread_count=state.comms.unread_total,
        focus_channel=sanitize_display_text(active_channel.name),
        preview_lines=preview_lines,
        composition_hint=(
            f"{active_channel.scope.upper()} | "
            f"{sanitize_display_text(active_channel.delay_label)} | "
            f"{active_channel.unread} unread"
        ),
    )


def _command_bar(
    state: RuntimeBootstrapState,
) -> tuple[RetroCommandButton, ...]:
    """Build the lower-band command strip for the cockpit shell."""

    return (
        RetroCommandButton(
            key="launch",
            label="LCH" if state.ship.status == "docked" else "DCK",
            enabled=True,
            highlighted=state.ship.status == "docked",
        ),
        RetroCommandButton(
            key="trade",
            label="MKT",
            enabled=state.ship.status == "docked",
            highlighted=False,
        ),
        RetroCommandButton(
            key="equip",
            label="FIT",
            enabled=state.ship.status == "docked",
            highlighted=False,
        ),
        RetroCommandButton(
            key="galaxy",
            label="GLX",
            enabled=True,
            highlighted=False,
        ),
        RetroCommandButton(
            key="local",
            label="SCN",
            enabled=True,
            highlighted=state.ship.status != "docked",
        ),
        RetroCommandButton(
            key="data",
            label="INFO",
            enabled=True,
            highlighted=False,
        ),
        RetroCommandButton(
            key="status",
            label="STAT",
            enabled=True,
            highlighted=True,
        ),
        RetroCommandButton(
            key="comms",
            label="COM",
            enabled=bool(state.comms.channels),
            highlighted=bool(state.comms.unread_total),
        ),
    )


def _footer_label(
    *,
    state: RuntimeBootstrapState,
    theme_name: str,
) -> str:
    """Return one concise footer line for the cockpit shell."""

    return (
        "ELITE CHRONICLES DESKTOP COCKPIT | "
        f"{theme_name.upper()} | {state.snapshot.current_system_name}"
    )


def build_retro_cockpit_hud(
    *,
    state: RuntimeBootstrapState,
    debug_scene: DebugSceneSnapshot,
    theme_name: str = "acorn-classic",
) -> RetroCockpitHudLayout:
    """Build the desktop retro cockpit HUD layout from runtime state."""

    preset = _resolve_preset(theme_name)
    ship = state.ship
    target = _nearest_entity(debug_scene)
    cargo_used = max(
        0,
        int(ship.cargo_capacity)
        - int(getattr(ship, "cargo_free", ship.cargo_capacity)),
    )
    fuel_ratio = _ratio(int(ship.fuel_current), int(ship.fuel_cap))
    hull_ratio = _ratio(int(ship.hull_current), int(ship.hull_max))
    shield_ratio = _ratio(int(ship.shields_current), int(ship.shields_max))
    energy_ratio = _ratio(int(ship.energy_current), int(ship.energy_cap))
    cargo_ratio = _ratio(cargo_used, int(ship.cargo_capacity))
    left_gauges = (
        RetroGauge(
            key="fuel",
            label="FU",
            current=int(ship.fuel_current),
            maximum=int(ship.fuel_cap),
            fill_ratio=fuel_ratio,
            unit="CR",
            tone=_gauge_tone(fuel_ratio, low_threshold=0.25),
        ),
        RetroGauge(
            key="hull",
            label="HU",
            current=int(ship.hull_current),
            maximum=int(ship.hull_max),
            fill_ratio=hull_ratio,
            unit="%",
            tone="alert" if hull_ratio < 0.35 else "primary",
        ),
        RetroGauge(
            key="shield",
            label="SH",
            current=int(ship.shields_current),
            maximum=int(ship.shields_max),
            fill_ratio=shield_ratio,
            unit="%",
            tone="primary",
        ),
        RetroGauge(
            key="energy",
            label="EN",
            current=int(ship.energy_current),
            maximum=int(ship.energy_cap),
            fill_ratio=energy_ratio,
            unit="%",
            tone="secondary",
        ),
        RetroGauge(
            key="cargo",
            label="CG",
            current=cargo_used,
            maximum=int(ship.cargo_capacity),
            fill_ratio=cargo_ratio,
            unit="t",
            tone="warning" if cargo_ratio > 0.85 else "secondary",
        ),
    )
    nearby_entities = sum(
        1 for entity in debug_scene.entities if entity.distance_km <= 5000
    )
    center_scanner = RetroScannerSummary(
        active_scene_name=debug_scene.active_scene_name,
        current_system_name=debug_scene.current_system_name,
        snapshot_version=debug_scene.local_snapshot_version,
        total_entities=debug_scene.entity_count,
        nearby_entities=nearby_entities,
        target_name=target.name if target is not None else "No target",
        target_type=target.entity_type if target is not None else "none",
        target_distance_km=target.distance_km if target is not None else None,
    )
    return RetroCockpitHudLayout(
        theme=preset.theme,
        geometry=preset.geometry,
        left_gauges=left_gauges,
        center_scanner=center_scanner,
        right_comms=_build_comms_summary(state),
        command_bar=_command_bar(state),
        footer_label=_footer_label(
            state=state,
            theme_name=preset.theme.theme_name,
        ),
    )
