"""Minimal Panda3D HUD shell for the desktop cockpit presenter."""

from __future__ import annotations

from datetime import datetime, timezone
import math
from typing import TYPE_CHECKING

from desktop_client.errors import DesktopContractError
from desktop_client.system_renderer import build_debug_scene_snapshot

from .retro_console import build_retro_cockpit_hud, sanitize_display_text

if TYPE_CHECKING:
    from direct.gui.DirectButton import DirectButton
    from desktop_client.models import LocalScannerContact, RuntimeBootstrapState
    from desktop_client.runtime import DesktopRuntime


def launch_panda3d_hud_shell(
    *,
    runtime: "DesktopRuntime",
    state: "RuntimeBootstrapState",
    theme_name: str,
) -> None:
    """Open a first Panda3D window that renders the desktop cockpit HUD."""

    try:
        from direct.gui.DirectGui import DirectButton, DirectEntry, DirectFrame
        from direct.gui.OnscreenText import OnscreenText
        from direct.showbase.ShowBase import ShowBase
        from direct.task import Task
        from panda3d.core import (
            Geom,
            GeomNode,
            GeomTriangles,
            GeomVertexData,
            GeomVertexFormat,
            GeomVertexWriter,
            LineSegs,
            NodePath,
            TextNode,
            Triangulator,
            TransparencyAttrib,
            loadPrcFileData,
        )
    except ModuleNotFoundError as exc:
        raise DesktopContractError(
            "Panda3D is not installed in the active desktop environment."
        ) from exc

    def _hex_to_rgba(
        hex_color: str,
        alpha: float = 1.0,
    ) -> tuple[float, float, float, float]:
        """Convert one hex color token to Panda-compatible RGBA floats."""

        color = hex_color.lstrip("#")
        return (
            int(color[0:2], 16) / 255.0,
            int(color[2:4], 16) / 255.0,
            int(color[4:6], 16) / 255.0,
            alpha,
        )

    def _button_text(label: str) -> tuple[str, str, str, str]:
        """Return one Panda button label tuple."""

        return (label, label, label, label)

    loadPrcFileData(
        "",
        "\n".join(
            (
                "window-title Elite Chronicles Desktop",
                "win-size 1600 960",
                "show-frame-rate-meter 0",
                "sync-video 0",
                "audio-library-name null",
            )
        ),
    )

    class RetroCockpitShowBase(ShowBase):
        """Small Panda3D shell that paints the cockpit overlay."""

        def __init__(self) -> None:
            super().__init__()
            self.runtime = runtime
            self.runtime_state = state
            self.theme_name = theme_name
            self._arc_node: NodePath | None = None
            self._channel_buttons: list[DirectButton] = []
            self._contact_buttons: list[DirectButton] = []
            self._command_buttons: dict[str, DirectButton] = {}
            self._quick_action_buttons: dict[str, DirectButton] = {}
            self._active_console_view = "local"
            self._selected_contact_id: str | None = None
            self._jump_plan = None
            self._left_metric_rows: list[dict[str, object]] = []
            self._right_metric_rows: list[dict[str, object]] = []
            self._missile_slots: list[dict[str, object]] = []
            self._dock_stage_blocks: list[dict[str, object]] = []
            self._scanner_grid_node: NodePath | None = None
            self._scanner_fov_node: NodePath | None = None
            self._scanner_blips: list[DirectFrame] = []
            self._scanner_marker_nodes: list[NodePath] = []
            self._scanner_frame_nodes: list[NodePath] = []
            self._command_band_node: NodePath | None = None
            self._command_button_faces: dict[str, NodePath] = {}
            self._command_button_outlines: dict[str, NodePath] = {}
            self._contact_button_bevels: list[dict[str, object]] = []
            self._scanner_summary_labels: list[OnscreenText] = []
            self._scanner_summary_values: list[OnscreenText] = []
            self._panel_top_arc_nodes: list[NodePath] = []
            self._panel_top_fill_nodes: list[NodePath] = []
            self._detail_lines: tuple[str, ...] = ()
            self._active_hud_theme = None
            self._command_status_message = (
                "Cockpit shell online. Use the arch keys or switch to COM for channel controls."
            )
            self._comms_status_message = "Click a channel, then Compose or press /."
            self.accept("escape", self.userExit)
            self.accept("slash", self._focus_comms_entry)
            self.accept("tab", self._cycle_comms_channel)
            self.accept("shift-tab", self._cycle_comms_channel, [-1])
            self.accept("control-r", self._mark_active_channel_read)
            self.disableMouse()
            self._build_static_shell()
            self._refresh_overlay()
            self.taskMgr.doMethodLater(
                self._poll_delay_seconds(),
                self._tick_runtime,
                "elite-runtime-tick",
            )

        def _poll_delay_seconds(self) -> float:
            """Return the next runtime poll delay in seconds."""

            return max(
                0.5,
                self.runtime_state.snapshot.suggested_poll_interval_ms / 1000.0,
            )

        def _build_static_shell(self) -> None:
            """Construct the cockpit frame, text anchors, and clickable controls."""

            self.setBackgroundColor(0.01, 0.02, 0.03, 1.0)
            self.viewport_frame = DirectFrame(
                parent=self.aspect2d,
                frameColor=(0.01, 0.03, 0.04, 0.98),
                frameSize=(-1.23, 1.23, -0.10, 0.92),
                pos=(0, 0, 0),
            )
            self.viewport_glow = DirectFrame(
                parent=self.aspect2d,
                frameColor=(0.08, 0.08, 0.06, 0.06),
                frameSize=(-1.18, 1.18, 0.68, 0.86),
                pos=(0, 0, 0),
            )
            self.left_panel_border = DirectFrame(
                parent=self.aspect2d,
                frameColor=(0.12, 0.10, 0.05, 0.26),
                frameSize=(-1.08, -0.52, -0.88, -0.45),
                pos=(0, 0, 0),
            )
            self.left_panel = DirectFrame(
                parent=self.aspect2d,
                frameColor=(0.06, 0.05, 0.03, 0.94),
                frameSize=(-1.06, -0.54, -0.86, -0.45),
                pos=(0, 0, 0),
            )
            self.center_panel_border = DirectFrame(
                parent=self.aspect2d,
                frameColor=(0.12, 0.10, 0.05, 0.26),
                frameSize=(-0.54, 0.54, -0.88, -0.45),
                pos=(0, 0, 0),
            )
            self.center_panel = DirectFrame(
                parent=self.aspect2d,
                frameColor=(0.02, 0.03, 0.04, 0.96),
                frameSize=(-0.52, 0.52, -0.86, -0.45),
                pos=(0, 0, 0),
            )
            self.right_panel_border = DirectFrame(
                parent=self.aspect2d,
                frameColor=(0.12, 0.10, 0.05, 0.26),
                frameSize=(0.52, 1.08, -0.88, -0.45),
                pos=(0, 0, 0),
            )
            self.right_panel = DirectFrame(
                parent=self.aspect2d,
                frameColor=(0.06, 0.05, 0.03, 0.94),
                frameSize=(0.54, 1.06, -0.86, -0.45),
                pos=(0, 0, 0),
            )
            self.command_band_border = DirectFrame(
                parent=self.aspect2d,
                frameColor=(0.0, 0.0, 0.0, 0.0),
                frameSize=(-1.18, 1.18, -0.995, -0.865),
                pos=(0, 0, 0),
            )
            self.command_band = DirectFrame(
                parent=self.aspect2d,
                frameColor=(0.0, 0.0, 0.0, 0.0),
                frameSize=(-1.16, 1.16, -0.985, -0.875),
                pos=(0, 0, 0),
            )

            self.title_text = OnscreenText(
                text="",
                parent=self.aspect2d,
                pos=(-1.14, 0.845),
                scale=0.055,
                align=TextNode.ALeft,
                mayChange=True,
            )
            self.system_text = OnscreenText(
                text="",
                parent=self.aspect2d,
                pos=(0.0, 0.80),
                scale=0.040,
                align=TextNode.ACenter,
                mayChange=True,
            )
            self.left_header_text = OnscreenText(
                text="SHIP SYSTEMS",
                parent=self.aspect2d,
                pos=(-0.78, -0.345),
                scale=0.030,
                align=TextNode.ACenter,
                mayChange=True,
            )
            self.center_header_text = OnscreenText(
                text="SCANNER",
                parent=self.aspect2d,
                pos=(0.0, -0.345),
                scale=0.032,
                align=TextNode.ACenter,
                mayChange=True,
            )
            self.right_header_text = OnscreenText(
                text="FLIGHT CONTEXT",
                parent=self.aspect2d,
                pos=(0.78, -0.345),
                scale=0.030,
                align=TextNode.ACenter,
                mayChange=True,
            )
            self.gauge_text = OnscreenText(
                text="",
                parent=self.aspect2d,
                pos=(-0.935, -0.36),
                scale=0.048,
                align=TextNode.ALeft,
                mayChange=True,
            )
            for label_x, value_x in (
                (-0.47, -0.445),
                (-0.25, -0.225),
                (-0.03, -0.005),
                (0.19, 0.215),
                (0.40, 0.425),
            ):
                self._scanner_summary_labels.append(
                    OnscreenText(
                        text="",
                        parent=self.aspect2d,
                        pos=(label_x, -0.738),
                        scale=0.026,
                        align=TextNode.ARight,
                        mayChange=True,
                    )
                )
                self._scanner_summary_values.append(
                    OnscreenText(
                        text="",
                        parent=self.aspect2d,
                        pos=(value_x, -0.738),
                        scale=0.026,
                        align=TextNode.ALeft,
                        mayChange=True,
                    )
                )
            self.comms_text = OnscreenText(
                text="",
                parent=self.aspect2d,
                pos=(0.60, -0.83),
                scale=0.016,
                align=TextNode.ALeft,
                wordwrap=10,
                mayChange=True,
            )
            self.command_status_text = OnscreenText(
                text="",
                parent=self.aspect2d,
                pos=(0.0, -0.93),
                scale=0.021,
                align=TextNode.ACenter,
                mayChange=True,
            )
            self.comms_status_text = OnscreenText(
                text="",
                parent=self.aspect2d,
                pos=(0.785, -0.765),
                scale=0.020,
                align=TextNode.ACenter,
                wordwrap=14,
                mayChange=True,
            )
            self.footer_text = OnscreenText(
                text="",
                parent=self.aspect2d,
                pos=(0.0, -0.994),
                scale=0.021,
                align=TextNode.ACenter,
                mayChange=True,
            )

            self.compose_button = DirectButton(
                parent=self.aspect2d,
                text=_button_text("COMPOSE"),
                command=self._focus_comms_entry,
                pos=(0.63, 0.0, -0.79),
                scale=0.036,
                frameSize=(-1.4, 1.4, -0.42, 0.46),
                relief=1,
            )
            self.read_button = DirectButton(
                parent=self.aspect2d,
                text=_button_text("READ"),
                command=self._mark_active_channel_read,
                pos=(0.81, 0.0, -0.79),
                scale=0.036,
                frameSize=(-1.1, 1.1, -0.42, 0.46),
                relief=1,
            )
            self.send_button = DirectButton(
                parent=self.aspect2d,
                text=_button_text("SEND"),
                command=self._submit_comms_entry,
                pos=(0.97, 0.0, -0.79),
                scale=0.036,
                frameSize=(-1.1, 1.1, -0.42, 0.46),
                relief=1,
            )
            self.comms_entry = DirectEntry(
                parent=self.aspect2d,
                pos=(0.60, 0.0, -0.86),
                scale=0.034,
                width=16,
                numLines=1,
                focus=0,
                suppressKeys=False,
                command=self._submit_comms_message,
                initialText="",
                overflow=1,
                relief=1,
            )

            command_specs = (
                ("launch", -0.91),
                ("trade", -0.65),
                ("equip", -0.39),
                ("galaxy", -0.13),
                ("local", 0.13),
                ("data", 0.39),
                ("status", 0.65),
                ("comms", 0.91),
            )
            for key, x_pos in command_specs:
                button = DirectButton(
                    parent=self.aspect2d,
                    text=_button_text(key.upper()),
                    command=self._handle_command_button,
                    extraArgs=[key],
                    pos=(x_pos, 0.0, -0.93),
                    scale=0.034,
                    frameSize=(-1.45, 1.45, -0.34, 0.38),
                    relief=1,
                )
                button["text_align"] = TextNode.ACenter
                button["text_pos"] = (0.0, -0.11)
                button["frameSize"] = (-1.56, 1.56, -0.18, 0.22)
                button["pressEffect"] = 0
                button["frameColor"] = (0.0, 0.0, 0.0, 0.0)
                button["relief"] = 0
                self._command_buttons[key] = button

            quick_action_specs = (
                ("refresh", "REFRESH", -0.68, -0.76),
                ("ops", "OPS", -0.90, -0.76),
            )
            for action_key, label, x_pos, z_pos in quick_action_specs:
                button = DirectButton(
                    parent=self.aspect2d,
                    text=_button_text(label),
                    command=self._handle_quick_action,
                    extraArgs=[action_key],
                    pos=(x_pos, 0.0, z_pos),
                    scale=0.024,
                    frameSize=(-1.40, 1.40, -0.34, 0.40),
                    relief=1,
                )
                self._style_overlay_button_label(button)
                self._quick_action_buttons[action_key] = button

            left_metric_specs = (
                ("SH", -0.40, 0),
                ("FU", -0.46, 12),
                ("CT", -0.52, 0),
                ("LT", -0.58, 0),
                ("AL", -0.64, 0),
            )
            for label, z_pos, tick_count in left_metric_specs:
                self._left_metric_rows.append(
                    self._create_metric_row(
                        label=label,
                        label_x=-0.99,
                        value_x=-0.58,
                        track_x=-0.92,
                        z_pos=z_pos,
                        width=0.22,
                        tick_count=tick_count,
                    )
                )

            self.missile_label = OnscreenText(
                text="MSL",
                parent=self.aspect2d,
                pos=(-0.99, -0.7),
                scale=0.032,
                align=TextNode.ALeft,
                mayChange=True,
            )
            self.missile_state_text = OnscreenText(
                text="",
                parent=self.aspect2d,
                pos=(-0.58, -0.7),
                scale=0.026,
                align=TextNode.ARight,
                mayChange=True,
            )
            for index in range(4):
                slot = self._create_indicator_box(
                    center_x=-0.895 + (index * 0.060),
                    center_z=-0.69,
                    half_width=0.022,
                    half_height=0.018,
                )
                self._missile_slots.append(slot)

            self.scanner_scope = DirectFrame(
                parent=self.aspect2d,
                frameColor=(0.02, 0.03, 0.04, 0.0),
                frameSize=(-0.23, 0.23, -0.58, -0.35),
                pos=(0.0, 0.0, 0.0),
            )

            contact_positions = (
                (-0.37, -0.792),
                (-0.125, -0.792),
                (0.125, -0.792),
                (0.37, -0.792),
                (-0.37, -0.836),
                (-0.125, -0.836),
                (0.125, -0.836),
                (0.37, -0.836),
            )
            for x_pos, z_pos in contact_positions:
                self._contact_button_bevels.append(
                    self._create_overlay_button_bevel(
                        center_x=x_pos,
                        center_z=z_pos,
                        half_width=0.110,
                        half_height=0.020,
                    )
                )
                button = DirectButton(
                    parent=self.aspect2d,
                    text=_button_text("NO CONTACT"),
                    command=self._select_contact,
                    extraArgs=[""],
                    pos=(x_pos, 0.0, z_pos),
                    scale=0.029,
                    frameSize=(-3.85, 3.85, -0.56, 0.62),
                    relief=1,
                )
                self._style_overlay_button_label(button)
                button["text_scale"] = 0.7
                button["text_pos"] = (0.0, -0.05)
                button["relief"] = 0
                self._contact_buttons.append(button)

            right_metric_specs = (
                ("SP", -0.38, 8),
                ("RL", -0.44, 8),
                ("EN", -0.50, 8),
            )
            for label, z_pos, tick_count in right_metric_specs:
                self._right_metric_rows.append(
                    self._create_metric_row(
                        label=label,
                        label_x=0.57,
                        value_x=0.99,
                        track_x=0.64,
                        z_pos=z_pos,
                        width=0.24,
                        tick_count=tick_count,
                    )
                )

            self.docking_label_text = OnscreenText(
                text="DC",
                parent=self.aspect2d,
                pos=(0.57, -0.7),
                scale=0.032,
                align=TextNode.ALeft,
                mayChange=True,
            )
            for index in range(4):
                block = self._create_indicator_box(
                    center_x=0.66 + (index * 0.069),
                    center_z=-0.69,
                    half_width=0.022,
                    half_height=0.018,
                )
                self._dock_stage_blocks.append(block)

        def _refresh_overlay(self) -> None:
            """Repaint text, framing, and controls from the current HUD layout."""

            self._jump_plan = None
            if self.runtime_state.ship.status == "in-space":
                try:
                    self._jump_plan = self.runtime.fetch_jump_plan(
                        self.runtime_state)
                except Exception:
                    self._jump_plan = None

            debug_scene = build_debug_scene_snapshot(self.runtime_state)
            hud = build_retro_cockpit_hud(
                state=self.runtime_state,
                debug_scene=debug_scene,
                theme_name=self.theme_name,
            )
            self._active_hud_theme = hud.theme

            surface_rgba = _hex_to_rgba(hud.theme.surface_background)
            frame_rgba = _hex_to_rgba(hud.theme.panel_fill, alpha=0.98)
            border_rgba = _hex_to_rgba(hud.theme.bezel_light, alpha=0.30)
            panel_border_rgba = _hex_to_rgba(
                hud.theme.bezel_shadow, alpha=0.78)
            center_rgba = _hex_to_rgba(hud.theme.panel_inner, alpha=0.98)
            accent_rgba = _hex_to_rgba(hud.theme.phosphor_warning, alpha=0.88)
            glow_rgba = _hex_to_rgba(hud.theme.bezel_light, alpha=0.06)
            primary_rgba = _hex_to_rgba(hud.theme.phosphor_primary)
            secondary_rgba = _hex_to_rgba(hud.theme.phosphor_secondary)
            panel_text_rgba = _hex_to_rgba(hud.theme.panel_text)

            self.setBackgroundColor(*surface_rgba)
            self.viewport_frame["frameColor"] = _hex_to_rgba(
                hud.theme.surface_background,
                alpha=0.98,
            )
            self.viewport_glow["frameColor"] = glow_rgba

            for border in (
                self.left_panel_border,
                self.center_panel_border,
                self.right_panel_border,
            ):
                border["frameColor"] = panel_border_rgba
            self.left_panel["frameColor"] = frame_rgba
            self.center_panel["frameColor"] = center_rgba
            self.right_panel["frameColor"] = frame_rgba
            self.command_band_border["frameColor"] = (0.0, 0.0, 0.0, 0.0)
            self.command_band["frameColor"] = (0.0, 0.0, 0.0, 0.0)

            for label in (
                self.title_text,
                self.system_text,
                self.center_header_text,
                self.gauge_text,
                self.comms_text,
                self.command_status_text,
                self.comms_status_text,
            ):
                label["fg"] = primary_rgba
            for label in self._scanner_summary_labels:
                label["fg"] = primary_rgba
            for value in self._scanner_summary_values:
                value["fg"] = primary_rgba
            self.left_header_text["fg"] = panel_text_rgba
            self.right_header_text["fg"] = (
                primary_rgba
                if self._active_console_view == "comms"
                else panel_text_rgba
            )
            self.system_text["fg"] = secondary_rgba
            self.footer_text["fg"] = secondary_rgba

            self.title_text.setText(
                sanitize_display_text(
                    f"COMMANDER {self.runtime_state.player.username.upper()}"
                )
            )
            self.system_text.setText(
                sanitize_display_text(
                    f"{hud.center_scanner.current_system_name} | "
                    f"SCENE {hud.center_scanner.active_scene_name.upper()}"
                )
            )
            self.gauge_text.setText(
                ""
            )

            header_text, center_rows = self._center_panel_rows(hud)
            self.center_header_text.setText(sanitize_display_text(header_text))
            for index, label in enumerate(self._scanner_summary_labels):
                summary_label = ""
                if index < len(center_rows):
                    summary_label = f"{center_rows[index][0]}: "
                label.setText(sanitize_display_text(summary_label))
            for index, value in enumerate(self._scanner_summary_values):
                summary_value = ""
                if index < len(center_rows):
                    summary_value = center_rows[index][1]
                value.setText(sanitize_display_text(summary_value))

            self.right_header_text.setText(
                "COMM ARRAY" if self._active_console_view == "comms" else "FLIGHT CONTEXT"
            )
            self.comms_text.setText(
                sanitize_display_text(self._build_comms_panel_text(hud))
            )
            self.command_status_text.setText(
                sanitize_display_text(self._command_status_message)
            )
            self.comms_status_text.setText(
                sanitize_display_text(self._comms_status_message)
            )
            self.footer_text.setText(sanitize_display_text(hud.footer_label))

            self.comms_entry["text_fg"] = primary_rgba
            self.comms_entry["frameColor"] = center_rgba
            self.comms_entry["cursorKeys"] = 1

            for button in (
                self.compose_button,
                self.read_button,
                self.send_button,
            ):
                button["text_fg"] = primary_rgba
                button["frameColor"] = frame_rgba
            self.send_button["frameColor"] = accent_rgba
            self._refresh_comms_controls(primary_rgba, frame_rgba, center_rgba)

            self._refresh_quick_action_buttons(
                panel_text_rgba, frame_rgba, accent_rgba)
            self._refresh_command_buttons(
                hud, primary_rgba, frame_rgba, accent_rgba)
            self._redraw_command_band(
                hud, primary_rgba, accent_rgba, frame_rgba)
            self._redraw_panel_top_arcs(
                panel_border_rgba, frame_rgba, center_rgba)
            self._refresh_contact_buttons(
                panel_text_rgba, frame_rgba, accent_rgba)
            self._refresh_channel_buttons(
                hud, primary_rgba, frame_rgba, accent_rgba)
            self._refresh_classic_consoles(
                panel_text_rgba, secondary_rgba, accent_rgba)
            self._redraw_scanner_scope(
                primary_rgba, secondary_rgba, accent_rgba)
            self._redraw_arch(hud)

        def _refresh_comms_controls(self, text_rgba, frame_rgba, center_rgba) -> None:
            """Show dense comms widgets only when the comms console is active."""

            comms_active = self._active_console_view == "comms"
            for widget in (
                self.compose_button,
                self.read_button,
                self.send_button,
                self.comms_entry,
            ):
                widget["state"] = "normal" if comms_active else "disabled"
            self.compose_button["text_fg"] = text_rgba
            self.read_button["text_fg"] = text_rgba
            self.send_button["text_fg"] = text_rgba
            self.comms_entry["text_fg"] = text_rgba
            self.comms_entry["frameColor"] = center_rgba if comms_active else frame_rgba
            if comms_active:
                self.compose_button.show()
                self.read_button.show()
                self.send_button.show()
                self.comms_entry.show()
                self.comms_status_text.show()
            else:
                self.compose_button.hide()
                self.read_button.hide()
                self.send_button.hide()
                self.comms_entry.hide()
                self.comms_status_text.hide()

        def _sorted_contacts(self) -> list["LocalScannerContact"]:
            """Return visible contacts ordered for the lower control panel."""

            return sorted(
                self.runtime_state.contacts.contacts,
                key=lambda contact: (
                    contact.distance_km,
                    contact.contact_type,
                    contact.name.lower(),
                ),
            )

        def _selected_contact(self):
            """Return the currently selected contact, defaulting to the nearest."""

            contacts = self._sorted_contacts()
            visible_contacts = contacts[:8]
            if not visible_contacts:
                self._selected_contact_id = None
                return None
            selected_contact = next(
                (
                    contact
                    for contact in visible_contacts
                    if contact.id == self._selected_contact_id
                ),
                None,
            )
            if selected_contact is None:
                selected_contact = visible_contacts[0]
                self._selected_contact_id = selected_contact.id
            return selected_contact

        def _command_button_position(self, x_pos: float) -> tuple[float, float, float]:
            """Project one command button onto the lower cockpit curve."""

            return x_pos, 0.0, self._command_curve_z(x_pos) + 0.002

        def _command_curve_z(self, x_pos: float) -> float:
            """Return the cockpit command-rail height at one horizontal position."""

            span = 1.12
            side_height = -0.238
            lift = 0.084
            normalized = max(-1.0, min(1.0, x_pos / span))
            return side_height + (lift * (1.0 - (normalized * normalized)))

        def _command_curve_angle_deg(self, x_pos: float) -> float:
            """Return the tangent angle for one point on the command rail."""

            span = 1.12
            lift = 0.084
            slope = (-2.0 * lift * x_pos) / (span * span)
            return math.degrees(math.atan(slope))

        def _rotate_points(
            self,
            points: list[tuple[float, float]],
            *,
            center_x: float,
            center_z: float,
            angle_deg: float,
        ) -> list[tuple[float, float]]:
            """Rotate one local point set around a screen-space center."""

            angle_radians = math.radians(angle_deg)
            cos_angle = math.cos(angle_radians)
            sin_angle = math.sin(angle_radians)
            rotated_points: list[tuple[float, float]] = []
            for point_x, point_z in points:
                rotated_points.append(
                    (
                        center_x + (point_x * cos_angle) -
                        (point_z * sin_angle),
                        center_z + (point_x * sin_angle) +
                        (point_z * cos_angle),
                    )
                )
            return rotated_points

        def _style_command_button_label(self, button: DirectButton, x_pos: float) -> None:
            """Center one command label and tilt it opposite to the keycap."""

            curve_angle = self._command_curve_angle_deg(x_pos)
            button["text_align"] = TextNode.ACenter
            button["text_pos"] = (0.0, -0.192)
            button["text_scale"] = 0.88
            button.setBin("fixed", 30)
            button.setDepthTest(False)
            button.setDepthWrite(False)
            for index in range(4):
                try:
                    text_node = button.component(f"text{index}")
                except Exception:
                    continue
                text_node.setR(-(curve_angle * 2.0))

        def _style_overlay_button_label(self, button: DirectButton) -> None:
            """Apply one consistent readable label treatment to overlay buttons."""

            button["text_align"] = TextNode.ACenter
            button["text_scale"] = 0.64
            button["text_pos"] = (0.0, -0.09)
            button["pressEffect"] = 0

        def _create_overlay_button_bevel(
            self,
            *,
            center_x: float,
            center_z: float,
            half_width: float,
            half_height: float,
        ) -> dict[str, object]:
            """Create one beveled backing frame for a lower overlay action button."""

            shadow = DirectFrame(
                parent=self.aspect2d,
                frameColor=(0.0, 0.0, 0.0, 0.0),
                frameSize=(-half_width, half_width, -half_height, half_height),
                pos=(center_x + 0.0018, 0.0, center_z - 0.0018),
            )
            highlight = DirectFrame(
                parent=self.aspect2d,
                frameColor=(0.0, 0.0, 0.0, 0.0),
                frameSize=(
                    -(half_width - 0.0025),
                    half_width - 0.0025,
                    -(half_height - 0.0025),
                    half_height - 0.0025,
                ),
                pos=(center_x - 0.0010, 0.0, center_z + 0.0010),
            )
            fill = DirectFrame(
                parent=self.aspect2d,
                frameColor=(0.0, 0.0, 0.0, 0.0),
                frameSize=(
                    -(half_width - 0.0055),
                    half_width - 0.0055,
                    -(half_height - 0.0055),
                    half_height - 0.0055,
                ),
                pos=(center_x - 0.0002, 0.0, center_z + 0.0002),
            )
            return {
                "shadow": shadow,
                "highlight": highlight,
                "fill": fill,
            }

        def _command_button_outline_points(
            self,
            *,
            width: float,
            height: float,
        ) -> list[tuple[float, float]]:
            """Return one beveled keycap outline for the command rail."""

            half_width = width / 2.0
            top_width = half_width * 0.72
            shoulder_width = half_width * 0.90
            top_y = height / 2.0
            mid_y = top_y * 0.55
            bottom_y = -height / 2.0
            base_y = bottom_y - 0.010
            points = [
                (-half_width, bottom_y),
                (-shoulder_width, mid_y),
                (-top_width, top_y),
                (top_width, top_y),
                (shoulder_width, mid_y),
                (half_width, bottom_y),
                (half_width * 0.82, base_y),
                (-half_width * 0.82, base_y),
            ]
            points.append(points[0])
            return points

        def _filled_polygon_node(
            self,
            *,
            points: list[tuple[float, float]],
            rgba: tuple[float, float, float, float],
        ) -> NodePath:
            """Create one filled 2D polygon node for the command key face."""

            triangulator = Triangulator()
            unique_points = points[:-1] if len(
                points) > 1 and points[0] == points[-1] else points
            for point_x, point_z in unique_points:
                triangulator.addPolygonVertex(
                    triangulator.addVertex(point_x, point_z))
            triangulator.triangulate()

            vertex_data = GeomVertexData(
                "command-button-face",
                GeomVertexFormat.getV3cp(),
                Geom.UHStatic,
            )
            vertex_writer = GeomVertexWriter(vertex_data, "vertex")
            color_writer = GeomVertexWriter(vertex_data, "color")
            for point_x, point_z in unique_points:
                vertex_writer.addData3(point_x, 0.0, point_z)
                color_writer.addData4(*rgba)

            triangles = GeomTriangles(Geom.UHStatic)
            for index in range(triangulator.getNumTriangles()):
                triangles.addVertices(
                    triangulator.getTriangleV0(index),
                    triangulator.getTriangleV1(index),
                    triangulator.getTriangleV2(index),
                )

            geom = Geom(vertex_data)
            geom.addPrimitive(triangles)
            geom_node = GeomNode("command-button-face")
            geom_node.addGeom(geom)
            node = self.aspect2d.attachNewNode(geom_node)
            node.setTransparency(TransparencyAttrib.MAlpha)
            node.setBin("fixed", 10)
            node.setDepthTest(False)
            node.setDepthWrite(False)
            return node

        def _ellipse_points(
            self,
            *,
            center_x: float,
            center_z: float,
            radius_x: float,
            radius_z: float,
            steps: int = 48,
            start_angle: float = 0.0,
            end_angle: float = math.tau,
        ) -> list[tuple[float, float]]:
            """Return screen-space points for one ellipse or arc."""

            points: list[tuple[float, float]] = []
            for step in range(steps + 1):
                ratio = step / steps
                angle = start_angle + ((end_angle - start_angle) * ratio)
                points.append(
                    (
                        center_x + (math.cos(angle) * radius_x),
                        center_z + (math.sin(angle) * radius_z),
                    )
                )
            return points

        def _quadratic_curve_points(
            self,
            *,
            start: tuple[float, float],
            control: tuple[float, float],
            end: tuple[float, float],
            steps: int = 24,
        ) -> list[tuple[float, float]]:
            """Return one quadratic Bezier polyline for scanner meridians."""

            points: list[tuple[float, float]] = []
            for step in range(steps + 1):
                ratio = step / steps
                inverse = 1.0 - ratio
                point_x = (
                    (inverse * inverse * start[0])
                    + (2.0 * inverse * ratio * control[0])
                    + (ratio * ratio * end[0])
                )
                point_z = (
                    (inverse * inverse * start[1])
                    + (2.0 * inverse * ratio * control[1])
                    + (ratio * ratio * end[1])
                )
                points.append((point_x, point_z))
            return points

        def _draw_polyline(
            self,
            *,
            points: list[tuple[float, float]],
            rgba: tuple[float, float, float, float],
            thickness: float,
        ) -> NodePath:
            """Attach one line strip to aspect2d and return its node."""

            line = LineSegs()
            line.setThickness(thickness)
            line.setColor(*rgba)
            for index, (point_x, point_z) in enumerate(points):
                if index == 0:
                    line.moveTo(point_x, 0.0, point_z)
                else:
                    line.drawTo(point_x, 0.0, point_z)
            node = self.aspect2d.attachNewNode(line.create())
            node.setTransparency(TransparencyAttrib.MAlpha)
            node.setDepthTest(False)
            node.setDepthWrite(False)
            return node

        def _scanner_bar_polygon(
            self,
            *,
            start: tuple[float, float],
            end: tuple[float, float],
            start_width: float,
            end_width: float,
        ) -> list[tuple[float, float]]:
            """Return one tapered scanner-frame bar polygon."""

            delta_x = end[0] - start[0]
            delta_z = end[1] - start[1]
            length = math.hypot(delta_x, delta_z)
            if length <= 1e-6:
                return [start, end, end, start, start]
            normal_x = -delta_z / length
            normal_z = delta_x / length
            start_offset_x = normal_x * (start_width / 2.0)
            start_offset_z = normal_z * (start_width / 2.0)
            end_offset_x = normal_x * (end_width / 2.0)
            end_offset_z = normal_z * (end_width / 2.0)
            return [
                (start[0] + start_offset_x, start[1] + start_offset_z),
                (end[0] + end_offset_x, end[1] + end_offset_z),
                (end[0] - end_offset_x, end[1] - end_offset_z),
                (start[0] - start_offset_x, start[1] - start_offset_z),
                (start[0] + start_offset_x, start[1] + start_offset_z),
            ]

        def _panel_top_curve_z(self, x_pos: float) -> float:
            """Return the shared curved top edge for the lower cockpit panels."""

            return self._command_curve_z(x_pos) - 0.040

        def _panel_cap_points(
            self,
            *,
            left_x: float,
            right_x: float,
            bottom_z: float,
            steps: int = 19,
        ) -> list[tuple[float, float]]:
            """Return one filled panel-cap polygon that follows the command rail."""

            points = [(left_x, bottom_z)]
            for step in range(steps):
                ratio = step / (steps - 1)
                x_pos = left_x + ((right_x - left_x) * ratio)
                points.append((x_pos, self._panel_top_curve_z(x_pos)))
            points.append((right_x, bottom_z))
            points.append(points[0])
            return points

        def _redraw_panel_top_arcs(self, border_rgba, frame_rgba, center_rgba) -> None:
            """Draw curved upper caps and borders for the three lower cockpit panels."""

            for node in self._panel_top_arc_nodes:
                node.removeNode()
            for node in self._panel_top_fill_nodes:
                node.removeNode()
            self._panel_top_arc_nodes = []
            self._panel_top_fill_nodes = []

            panel_specs = (
                ((-1.08, -0.52, -0.45), border_rgba),
                ((-1.06, -0.54, -0.45), frame_rgba),
                ((-0.54, 0.54, -0.45), border_rgba),
                ((-0.52, 0.52, -0.45), center_rgba),
                ((0.52, 1.08, -0.45), border_rgba),
                ((0.54, 1.06, -0.45), frame_rgba),
            )
            for (left_x, right_x, bottom_z), fill_rgba in panel_specs:
                fill_node = self._filled_polygon_node(
                    points=self._panel_cap_points(
                        left_x=left_x,
                        right_x=right_x,
                        bottom_z=bottom_z,
                    ),
                    rgba=fill_rgba,
                )
                fill_node.setBin("fixed", 8)
                self._panel_top_fill_nodes.append(fill_node)

            panel_ranges = (
                (-1.08, -0.52),
                (-0.54, 0.54),
                (0.52, 1.08),
            )
            for left_x, right_x in panel_ranges:
                curve = LineSegs()
                curve.setThickness(3.0)
                curve.setColor(*border_rgba)
                for step in range(19):
                    ratio = step / 18.0
                    x_pos = left_x + ((right_x - left_x) * ratio)
                    z_pos = self._panel_top_curve_z(x_pos)
                    if step == 0:
                        curve.moveTo(x_pos, 0.0, z_pos)
                    else:
                        curve.drawTo(x_pos, 0.0, z_pos)
                node = self.aspect2d.attachNewNode(curve.create())
                node.setTransparency(TransparencyAttrib.MAlpha)
                self._panel_top_arc_nodes.append(node)

        def _redraw_command_band(
            self,
            hud,
            primary_rgba,
            accent_rgba,
            frame_rgba,
        ) -> None:
            """Draw the curved command rail and rounded button bezels."""

            if self._command_band_node is not None:
                self._command_band_node.removeNode()
            for face in self._command_button_faces.values():
                face.removeNode()
            for outline in self._command_button_outlines.values():
                outline.removeNode()
            self._command_button_faces = {}
            self._command_button_outlines = {}

            band = LineSegs()
            band.setThickness(2.6)
            band.setColor(*frame_rgba)
            top_offset = 0.030
            bottom_offset = -0.040
            first_point = True
            for step in range(61):
                x_pos = -1.08 + ((2.16 / 60.0) * step)
                curve_z = self._command_curve_z(x_pos)
                if first_point:
                    band.moveTo(x_pos, 0.0, curve_z + top_offset)
                    first_point = False
                else:
                    band.drawTo(x_pos, 0.0, curve_z + top_offset)
            first_point = True
            for step in range(61):
                x_pos = -1.08 + ((2.16 / 60.0) * step)
                curve_z = self._command_curve_z(x_pos)
                if first_point:
                    band.moveTo(x_pos, 0.0, curve_z + bottom_offset)
                    first_point = False
                else:
                    band.drawTo(x_pos, 0.0, curve_z + bottom_offset)
            for x_pos in (-1.08, 1.08):
                curve_z = self._command_curve_z(x_pos)
                band.moveTo(x_pos, 0.0, curve_z + top_offset)
                band.drawTo(x_pos, 0.0, curve_z + bottom_offset)

            button_positions = sorted(
                float(button.getPos()[0])
                for button in self._command_buttons.values()
            )
            divider_positions = [
                (left_x + right_x) / 2.0
                for left_x, right_x in zip(button_positions, button_positions[1:])
            ]
            for x_pos in divider_positions:
                curve_z = self._command_curve_z(x_pos)
                band.moveTo(x_pos, 0.0, curve_z + top_offset - 0.004)
                band.drawTo(x_pos, 0.0, curve_z + bottom_offset + 0.010)

            self._command_band_node = self.aspect2d.attachNewNode(
                band.create())
            self._command_band_node.setTransparency(TransparencyAttrib.MAlpha)

            button_models = {
                button_model.key: button_model for button_model in hud.command_bar}
            for key, button in self._command_buttons.items():
                x_pos = float(button.getPos()[0])
                _, _, z_pos = self._command_button_position(x_pos)
                curve_angle = self._command_curve_angle_deg(x_pos)
                button.setPos(x_pos, 0.0, z_pos)
                button.setR(curve_angle)
                self._style_command_button_label(button, x_pos)
                button_model = button_models[key]
                button_enabled = button_model.enabled
                button_highlighted = button_model.highlighted
                if key == "launch":
                    button_enabled = self._launch_command_enabled()
                    button_highlighted = self.runtime_state.ship.status == "docked"
                    if self.runtime_state.ship.status != "docked":
                        button_highlighted = self._selected_station_id() is not None
                if not button_enabled:
                    face_color = (0.30, 0.31, 0.33, 0.82)
                elif self._active_console_view == key or button_highlighted:
                    face_color = (0.78, 0.80, 0.82, 0.96)
                else:
                    face_color = (0.60, 0.62, 0.65, 0.94)
                if self._active_console_view == key:
                    outline_color = (0.78, 0.82, 0.84, 1.0)
                elif button_highlighted:
                    outline_color = (0.62, 0.66, 0.69, 1.0)
                else:
                    outline_color = (0.36, 0.39, 0.41, 1.0)
                face_points = self._rotate_points(
                    self._command_button_outline_points(
                        width=0.156, height=0.032),
                    center_x=x_pos,
                    center_z=z_pos + 0.001,
                    angle_deg=curve_angle,
                )
                self._command_button_faces[key] = self._filled_polygon_node(
                    points=face_points,
                    rgba=face_color,
                )
                points = self._rotate_points(
                    self._command_button_outline_points(
                        width=0.175, height=0.043),
                    center_x=x_pos,
                    center_z=z_pos,
                    angle_deg=curve_angle,
                )
                outline = LineSegs()
                outline.setThickness(2.2)
                outline.setColor(*outline_color)
                for index, (point_x, point_z) in enumerate(points):
                    if index == 0:
                        outline.moveTo(point_x, 0.0, point_z)
                    else:
                        outline.drawTo(point_x, 0.0, point_z)
                outline_node = self.aspect2d.attachNewNode(outline.create())
                outline_node.setTransparency(TransparencyAttrib.MAlpha)
                self._command_button_outlines[key] = outline_node

        def _set_metric_row(
            self,
            row: dict[str, object],
            *,
            label: str,
            value: str,
            ratio: float,
            text_rgba,
            fill_rgba,
            track_rgba,
            bezel_light_rgba,
            bezel_shadow_rgba,
            tick_rgba,
        ) -> None:
            """Update one console gauge row."""

            clamped_ratio = max(0.0, min(1.0, ratio))
            label_text = row["label"]
            value_text = row["value"]
            bezel_shadow = row["bezel_shadow"]
            bezel_light = row["bezel_light"]
            track = row["track"]
            fill = row["fill"]
            max_width = row["max_width"]
            label_text.setText(label)
            value_text.setText(sanitize_display_text(value))
            label_text["fg"] = text_rgba
            value_text["fg"] = text_rgba
            bezel_shadow["frameColor"] = bezel_shadow_rgba
            bezel_light["frameColor"] = bezel_light_rgba
            track["frameColor"] = track_rgba
            fill["frameColor"] = fill_rgba
            for tick in row["ticks"]:
                tick["frameColor"] = tick_rgba
            fill["frameSize"] = (
                0.0,
                max(0.001, max_width * clamped_ratio),
                -0.009,
                0.009,
            )

        def _create_metric_row(
            self,
            *,
            label: str,
            label_x: float,
            value_x: float,
            track_x: float,
            z_pos: float,
            width: float,
            tick_count: int,
        ) -> dict[str, object]:
            """Create one beveled gauge row with optional ruler ticks."""

            label_text = OnscreenText(
                text=label,
                parent=self.aspect2d,
                pos=(label_x, z_pos),
                scale=0.034,
                align=TextNode.ALeft,
                mayChange=True,
            )
            value_text = OnscreenText(
                text="",
                parent=self.aspect2d,
                pos=(value_x, z_pos),
                scale=0.030,
                align=TextNode.ARight,
                mayChange=True,
            )
            bezel_shadow = DirectFrame(
                parent=self.aspect2d,
                frameColor=(0.0, 0.0, 0.0, 0.0),
                frameSize=(0.0, width + 0.018, -0.018, 0.018),
                pos=(track_x, 0.0, z_pos + 0.008),
            )
            bezel_light = DirectFrame(
                parent=self.aspect2d,
                frameColor=(0.0, 0.0, 0.0, 0.0),
                frameSize=(0.0, width + 0.014, -0.016, 0.016),
                pos=(track_x - 0.004, 0.0, z_pos + 0.011),
            )
            track = DirectFrame(
                parent=self.aspect2d,
                frameColor=(0.0, 0.0, 0.0, 0.0),
                frameSize=(0.0, width, -0.011, 0.011),
                pos=(track_x - 0.002, 0.0, z_pos + 0.010),
            )
            fill = DirectFrame(
                parent=track,
                frameColor=(0.0, 0.0, 0.0, 0.0),
                frameSize=(0.0, 0.001, -0.009, 0.009),
                pos=(0.0, 0.0, 0.0),
            )
            ticks: list[DirectFrame] = []
            if tick_count > 1:
                tick_spacing = width / tick_count
                for index in range(1, tick_count):
                    ticks.append(
                        DirectFrame(
                            parent=track,
                            frameColor=(0.0, 0.0, 0.0, 0.0),
                            frameSize=(-0.0012, 0.0012, -0.0085, 0.0085),
                            pos=(tick_spacing * index, 0.0, 0.0),
                        )
                    )

            return {
                "label": label_text,
                "value": value_text,
                "bezel_shadow": bezel_shadow,
                "bezel_light": bezel_light,
                "track": track,
                "fill": fill,
                "ticks": ticks,
                "max_width": width,
            }

        def _create_indicator_box(
            self,
            *,
            center_x: float,
            center_z: float,
            half_width: float,
            half_height: float,
        ) -> dict[str, object]:
            """Create one small beveled status box for missiles and docking."""

            shadow = DirectFrame(
                parent=self.aspect2d,
                frameColor=(0.0, 0.0, 0.0, 0.0),
                frameSize=(-half_width, half_width, -half_height, half_height),
                pos=(center_x, 0.0, center_z),
            )
            highlight = DirectFrame(
                parent=self.aspect2d,
                frameColor=(0.0, 0.0, 0.0, 0.0),
                frameSize=(
                    -(half_width - 0.0025),
                    half_width - 0.0025,
                    -(half_height - 0.0025),
                    half_height - 0.0025,
                ),
                pos=(center_x - 0.0015, 0.0, center_z + 0.0015),
            )
            fill = DirectFrame(
                parent=self.aspect2d,
                frameColor=(0.0, 0.0, 0.0, 0.0),
                frameSize=(
                    -(half_width - 0.0055),
                    half_width - 0.0055,
                    -(half_height - 0.0055),
                    half_height - 0.0055,
                ),
                pos=(center_x - 0.0005, 0.0, center_z + 0.0005),
            )
            return {
                "shadow": shadow,
                "highlight": highlight,
                "fill": fill,
            }

        def _set_indicator_box(
            self,
            box: dict[str, object],
            *,
            fill_rgba: tuple[float, float, float, float],
            bevel_light_rgba: tuple[float, float, float, float],
            bevel_shadow_rgba: tuple[float, float, float, float],
            visible: bool,
        ) -> None:
            """Apply one beveled appearance to a small indicator box."""

            for key, rgba in (
                ("shadow", bevel_shadow_rgba),
                ("highlight", bevel_light_rgba),
                ("fill", fill_rgba),
            ):
                frame = box[key]
                frame["frameColor"] = rgba
                if visible:
                    frame.show()
                else:
                    frame.hide()

        def _metric_palette(self, label: str) -> dict[str, tuple[float, ...]]:
            """Return the track and fill colors for one named gauge row."""

            theme = self._active_hud_theme
            if theme is None:
                return {
                    "fill": (1.0, 0.26, 0.26, 1.0),
                    "track": (0.03, 0.03, 0.02, 1.0),
                    "bezel_light": (0.78, 0.80, 0.82, 1.0),
                    "bezel_shadow": (0.32, 0.34, 0.36, 1.0),
                    "tick": (0.82, 0.80, 0.62, 0.50),
                }
            default_palette = {
                "fill": _hex_to_rgba(theme.phosphor_warning),
                "track": _hex_to_rgba(theme.gauge_background),
                "bezel_light": _hex_to_rgba(theme.gauge_bevel_light),
                "bezel_shadow": _hex_to_rgba(theme.gauge_bevel_shadow),
                "tick": _hex_to_rgba(theme.gauge_tick, alpha=0.50),
            }
            if self.theme_name != "acorn-classic":
                return default_palette

            palette_map = {
                "SH": {"fill": (1.0, 0.24, 0.24, 1.0)},
                "FU": {"fill": (0.92, 0.84, 0.28, 1.0)},
                "CT": {"fill": (0.20, 0.34, 0.92, 1.0)},
                "LT": {"fill": (0.24, 0.32, 0.88, 1.0)},
                "AL": {"fill": (0.21, 0.42, 0.96, 1.0)},
                "SP": {"fill": (0.35, 0.86, 0.84, 1.0)},
                "RL": {"fill": (0.88, 0.82, 0.45, 1.0)},
                "EN": {"fill": (1.0, 0.26, 0.26, 1.0)},
            }
            return default_palette | palette_map.get(label, {})

        def _nearest_body_surface_distance(self) -> int | None:
            """Return the nearest surface distance for planet-like bodies."""

            nearest_surface_distance = None
            for contact in self.runtime_state.contacts.contacts:
                if contact.contact_type not in {"planet", "moon", "star"}:
                    continue
                if contact.radius_km is None:
                    continue
                surface_distance = max(
                    0, contact.distance_km - contact.radius_km)
                if (
                    nearest_surface_distance is None
                    or surface_distance < nearest_surface_distance
                ):
                    nearest_surface_distance = surface_distance
            return nearest_surface_distance

        def _cabin_temp_percent(self) -> tuple[int, float]:
            """Derive one cockpit temperature estimate from local flight conditions."""

            movement = self.runtime_state.ship.movement_control
            speed_kps = math.sqrt(
                movement.velocity_x ** 2
                + movement.velocity_y ** 2
                + movement.velocity_z ** 2
            )
            nearest_surface_distance = self._nearest_body_surface_distance()
            proximity_heat = 0.0
            if nearest_surface_distance is not None and nearest_surface_distance < 2000:
                proximity_heat = 1.0 - (nearest_surface_distance / 2000.0)
            cabin_ratio = min(1.0, 0.22 + min(speed_kps / 8.0,
                              0.43) + (proximity_heat * 0.35))
            return int(round(cabin_ratio * 100)), cabin_ratio

        def _altitude_surface_distance(self) -> int | None:
            """Return a derived altitude estimate when the ship is near a body."""

            nearest_surface_distance = self._nearest_body_surface_distance()
            if nearest_surface_distance is None or nearest_surface_distance > 5000:
                return None
            return nearest_surface_distance

        def _laser_heat_percent(self) -> tuple[int, float]:
            """Estimate laser thermal load from backend-owned control inputs."""

            ship = self.runtime_state.ship
            movement = ship.movement_control
            speed_ratio = min(
                1.0,
                math.sqrt(
                    movement.velocity_x ** 2
                    + movement.velocity_y ** 2
                    + movement.velocity_z ** 2
                ) / 12.0,
            )
            control_load = (
                abs(movement.thrust_input) * 0.42
                + abs(movement.yaw_input) * 0.10
                + abs(movement.pitch_input) * 0.10
                + abs(movement.roll_input) * 0.18
                + (0.24 if movement.brake_active else 0.0)
            )
            energy_ratio = (
                ship.energy_current / ship.energy_cap if ship.energy_cap else 0.0
            )
            heat_ratio = min(
                1.0,
                0.10 + control_load + (speed_ratio * 0.18) +
                ((1.0 - energy_ratio) * 0.16),
            )
            if movement.control_updated_at is not None:
                control_age_seconds = max(
                    0.0,
                    (
                        datetime.now(timezone.utc) -
                        movement.control_updated_at
                    ).total_seconds(),
                )
                if control_age_seconds > 2.0:
                    cooling_scale = max(
                        0.18, 1.0 - min(0.72, control_age_seconds / 8.0))
                    heat_ratio *= cooling_scale
            elif ship.status == "docked":
                heat_ratio *= 0.35
            return int(round(heat_ratio * 100)), heat_ratio

        def _missile_rack_state(self) -> tuple[int, int, bool, str]:
            """Return ship-specific missile rack capacity and ready-state hint."""

            rack_capacity_by_visual_key = {
                "cobra-mk1": 4,
                "viper-mk1": 2,
                "python": 4,
                "boa": 4,
                "adder": 2,
            }
            capacity = rack_capacity_by_visual_key.get(
                self.runtime_state.ship.ship_visual_key,
                2,
            )
            ship = self.runtime_state.ship
            armed = ship.status == "in-space" and ship.energy_current > max(
                10, ship.energy_cap // 4)
            ready_slots = capacity if armed else 0
            status_label = "ARM" if armed else "SAFE"
            return capacity, ready_slots, armed, status_label

        def _docking_block_count(self) -> int:
            """Map the current flight phase into four docking-computer blocks."""

            if self.runtime_state.ship.status == "docked":
                return 4
            phase = self.runtime_state.ship.flight_phase.lower()
            if phase in {"docking-approach", "destination-locked"}:
                return 3
            if phase in {"launching", "charging", "jumping"}:
                return 2
            if phase in {"inbound", "undocking"}:
                return 1
            return 0

        def _refresh_classic_consoles(
            self,
            text_rgba,
            secondary_rgba,
            accent_rgba,
        ) -> None:
            """Populate the left and right lower consoles with live cockpit data."""

            ship = self.runtime_state.ship
            movement = ship.movement_control
            speed_kps = math.sqrt(
                movement.velocity_x ** 2
                + movement.velocity_y ** 2
                + movement.velocity_z ** 2
            )
            roll_deg = abs(movement.heading_roll_deg)
            shield_ratio = (
                ship.shields_current / ship.shields_max if ship.shields_max else 0.0
            )
            fuel_ratio = ship.fuel_current / ship.fuel_cap if ship.fuel_cap else 0.0
            cabin_temp_value, cabin_temp_ratio = self._cabin_temp_percent()
            altitude_km = self._altitude_surface_distance()
            altitude_ratio = (
                1.0 - min(1.0, altitude_km / 5000.0)
                if altitude_km is not None
                else 0.0
            )
            laser_temp_value, laser_temp_ratio = self._laser_heat_percent()

            left_rows = (
                ("SH", f"{ship.shields_current:>3}/{ship.shields_max:<3}", shield_ratio),
                ("FU", f"{ship.fuel_current:>2}/{ship.fuel_cap:<2}", fuel_ratio),
                ("CT", f"{cabin_temp_value:>3}%", cabin_temp_ratio),
                ("LT", f"{laser_temp_value:>3}%", laser_temp_ratio),
                ("AL", f"{altitude_km:>4}KM" if altitude_km is not None else "----", altitude_ratio),
            )
            for row, (label, value, ratio) in zip(self._left_metric_rows, left_rows):
                palette = self._metric_palette(label)
                self._set_metric_row(
                    row,
                    label=label,
                    value=value,
                    ratio=ratio,
                    text_rgba=text_rgba,
                    fill_rgba=palette["fill"],
                    track_rgba=palette["track"],
                    bezel_light_rgba=palette["bezel_light"],
                    bezel_shadow_rgba=palette["bezel_shadow"],
                    tick_rgba=palette["tick"],
                )

            self.missile_label["fg"] = text_rgba
            self.missile_state_text["fg"] = text_rgba
            rack_capacity, ready_slots, armed, status_label = self._missile_rack_state()
            self.missile_state_text.setText(
                f"{status_label} {ready_slots}/{rack_capacity}")
            indicator_bevel_light = (0.80, 0.83, 0.85, 1.0)
            indicator_bevel_shadow = (0.32, 0.35, 0.38, 1.0)
            for index, slot in enumerate(self._missile_slots):
                if index < rack_capacity:
                    if self.theme_name == "acorn-classic":
                        fill_rgba = (
                            (0.44, 0.72, 0.46, 1.0)
                            if index < ready_slots
                            else (0.48, 0.54, 0.49, 1.0)
                        )
                    else:
                        fill_rgba = (
                            accent_rgba if index < ready_slots else text_rgba
                        )
                    self._set_indicator_box(
                        slot,
                        fill_rgba=fill_rgba,
                        bevel_light_rgba=indicator_bevel_light,
                        bevel_shadow_rgba=indicator_bevel_shadow,
                        visible=True,
                    )
                else:
                    self._set_indicator_box(
                        slot,
                        fill_rgba=(0.0, 0.0, 0.0, 0.0),
                        bevel_light_rgba=indicator_bevel_light,
                        bevel_shadow_rgba=indicator_bevel_shadow,
                        visible=False,
                    )

            speed_ratio = min(1.0, speed_kps / 8.0)
            roll_ratio = min(1.0, roll_deg / 180.0)
            energy_ratio = ship.energy_current / ship.energy_cap if ship.energy_cap else 0.0
            right_rows = (
                ("SP", f"{speed_kps:>4.1f}K", speed_ratio),
                ("RL", f"{movement.heading_roll_deg:+5.1f}", roll_ratio),
                ("EN", f"{ship.energy_current:>3}/{ship.energy_cap:<3}", energy_ratio),
            )
            for row, (label, value, ratio) in zip(self._right_metric_rows, right_rows):
                palette = self._metric_palette(label)
                self._set_metric_row(
                    row,
                    label=label,
                    value=value,
                    ratio=ratio,
                    text_rgba=text_rgba,
                    fill_rgba=palette["fill"],
                    track_rgba=palette["track"],
                    bezel_light_rgba=palette["bezel_light"],
                    bezel_shadow_rgba=palette["bezel_shadow"],
                    tick_rgba=palette["tick"],
                )

            self.docking_label_text["fg"] = text_rgba
            active_blocks = self._docking_block_count()
            dock_ready_rgba = (0.44, 0.72, 0.46, 1.0)
            dock_idle_rgba = (0.34, 0.47, 0.32, 1.0)
            for index, block in enumerate(self._dock_stage_blocks):
                self._set_indicator_box(
                    block,
                    fill_rgba=(dock_ready_rgba if index <
                               active_blocks else dock_idle_rgba),
                    bevel_light_rgba=indicator_bevel_light,
                    bevel_shadow_rgba=indicator_bevel_shadow,
                    visible=True,
                )

        def _redraw_scanner_scope(
            self,
            primary_rgba,
            secondary_rgba,
            accent_rgba,
        ) -> None:
            """Render the classic scanner ellipse, FOV wedge, and contact blips."""

            if self._scanner_grid_node is not None:
                self._scanner_grid_node.removeNode()
            if self._scanner_fov_node is not None:
                self._scanner_fov_node.removeNode()
            for marker_node in self._scanner_marker_nodes:
                marker_node.removeNode()
            for frame_node in self._scanner_frame_nodes:
                frame_node.removeNode()
            self._scanner_marker_nodes = []
            self._scanner_frame_nodes = []

            left = -0.38
            right = 0.38
            top = -0.355
            bottom = -0.63
            center_x = 0.0
            center_z = (top + bottom) / 2.0
            radius_x = (right - left) / 2.0
            radius_z = (top - bottom) / 2.0

            if self.theme_name == "acorn-classic":
                rim_shadow_rgba = (0.95, 0.22, 0.20, 1.0)
                housing_shadow_rgba = (0.36, 0.37, 0.40, 1.0)
                housing_light_rgba = (0.60, 0.64, 0.68, 1.0)
                housing_base_rgba = (0.69, 0.71, 0.75, 1.0)
                inner_screen_rgba = (0.02, 0.02, 0.02, 0.98)
                grid_rgba = (0.95, 0.22, 0.20, 1.0)
                fov_rgba = (0.20, 0.36, 0.95, 1.0)
                blip_rgba = (0.94, 0.89, 0.58, 1.0)
                selected_rgba = (0.99, 0.96, 0.70, 1.0)
            else:
                rim_shadow_rgba = secondary_rgba
                housing_shadow_rgba = (0.30, 0.32, 0.36, 1.0)
                housing_light_rgba = (0.66, 0.68, 0.72, 1.0)
                housing_base_rgba = (0.74, 0.76, 0.80, 1.0)
                inner_screen_rgba = (0.02, 0.03, 0.04, 0.98)
                grid_rgba = secondary_rgba
                fov_rgba = primary_rgba
                blip_rgba = primary_rgba
                selected_rgba = accent_rgba

            outer_points = self._ellipse_points(
                center_x=center_x,
                center_z=center_z,
                radius_x=radius_x,
                radius_z=radius_z,
                steps=64,
            )
            inner_points = self._ellipse_points(
                center_x=center_x,
                center_z=center_z,
                radius_x=radius_x - 0.016,
                radius_z=radius_z - 0.014,
                steps=64,
            )
            top_left = (center_x - (radius_x * 0.56),
                        center_z + (radius_z * 1.05))
            top_right = (center_x + (radius_x * 0.56),
                         center_z + (radius_z * 1.05))
            upper_left = (center_x - (radius_x * 1.10),
                          center_z + (radius_z * 0.12))
            upper_right = (center_x + (radius_x * 1.10),
                           center_z + (radius_z * 0.12))
            lower_left = (center_x - (radius_x * 1.10),
                          center_z - (radius_z * 0.20))
            lower_right = (center_x + (radius_x * 1.10),
                           center_z - (radius_z * 0.20))
            front_left = (center_x - (radius_x * 0.76),
                          center_z - (radius_z * 1.28))
            front_right = (center_x + (radius_x * 0.76),
                           center_z - (radius_z * 1.28))
            # Build one deeper front bezel and keep all three visible faces
            # inside it. The top stays just below the scanner oval; the extra
            # depth is pushed downward toward the contact readout.
            # Top outer edge of the whole front bezel.
            front_bar_top_z = front_left[1] + 0.018
            # Lower edge of the bright upper face.
            front_bar_light_bottom_z = front_left[1] + 0.000
            # Lower edge of the middle grey face.
            front_bar_mid_bottom_z = front_left[1] - 0.024
            # Bottom outer edge of the darkest lower face.
            front_bar_bottom_z = front_left[1] - 0.058
            # Render the front rim as three thick horizontal strokes because
            # line primitives are reading reliably in this scene, whereas the
            # filled faces are not visibly surviving the UI stack.
            front_bar_left_x = front_left[0]
            front_bar_right_x = front_right[0]
            front_bar_light_z = front_left[1] + 0.008
            front_bar_mid_z = front_left[1] - 0.0010
            front_bar_dark_z = front_left[1] - 0.015
            left_front_converge = (
                lower_left[0] - 0.006, lower_left[1] - 0.010)
            right_front_converge = (
                lower_right[0] + 0.006, lower_right[1] - 0.010)
            left_front_runs = (
                (
                    [(front_bar_left_x - 0.01, front_bar_dark_z-0.007),
                     (left_front_converge[0] - 0.002,
                      left_front_converge[1] + 0.019)],
                    (0.60, 0.64, 0.68, 1.0),
                    7,
                ),
                (
                    [
                        (front_bar_left_x - 0.018, front_bar_mid_z),
                        (left_front_converge[0] + 0.000,
                         left_front_converge[1] + 0.014),
                    ],
                    (0.96, 0.97, 0.99, 1.0),
                    2.8,
                ),
            )
            right_front_runs = (
                (
                    [(front_bar_right_x + 0.01, front_bar_dark_z-0.007),
                     (right_front_converge[0] + 0.002,
                      right_front_converge[1] + 0.019)],
                    (0.60, 0.64, 0.68, 1.0),
                    7,
                ),
                (
                    [
                        (front_bar_right_x + 0.018, front_bar_mid_z),
                        (right_front_converge[0] - 0.000,
                         right_front_converge[1] + 0.014),
                    ],
                    (0.96, 0.97, 0.99, 1.0),
                    2.8,
                ),
            )

            frame_bars = (
                {
                    "polygon": self._scanner_bar_polygon(
                        start=top_left,
                        end=top_right,
                        start_width=0.01,
                        end_width=0.01,
                    ),
                    "top_edge": [
                        (top_left[0] - 0.006, top_left[1] + 0.005),
                        (top_right[0] + 0.006, top_right[1] + 0.005),
                    ],
                    "bottom_edge": [
                        (top_left[0] - 0.004, top_left[1] - 0.005),
                        (top_right[0] + 0.004, top_right[1] - 0.005),
                    ],
                    "fill": housing_base_rgba,
                },
                {
                    "polygon": self._scanner_bar_polygon(
                        start=upper_left,
                        end=top_left,
                        start_width=0.036,
                        end_width=0.022,
                    ),
                    "top_edge": [
                        (upper_left[0] - 0.010, upper_left[1] + 0.010),
                        (top_left[0] - 0.004, top_left[1] + 0.008),
                    ],
                    "bottom_edge": [
                        (upper_left[0] + 0.010, upper_left[1] - 0.014),
                        (top_left[0] + 0.004, top_left[1] - 0.010),
                    ],
                    "fill": housing_base_rgba,
                },
                {
                    "polygon": self._scanner_bar_polygon(
                        start=top_right,
                        end=upper_right,
                        start_width=0.022,
                        end_width=0.036,
                    ),
                    "top_edge": [
                        (top_right[0] + 0.004, top_right[1] + 0.008),
                        (upper_right[0] + 0.010, upper_right[1] + 0.010),
                    ],
                    "bottom_edge": [
                        (top_right[0] - 0.004, top_right[1] - 0.010),
                        (upper_right[0] - 0.010, upper_right[1] - 0.014),
                    ],
                    "fill": housing_base_rgba,
                },
                {
                    "polygon": self._scanner_bar_polygon(
                        start=lower_left,
                        end=upper_left,
                        start_width=0.042,
                        end_width=0.036,
                    ),
                    "top_edge": [
                        (lower_left[0] - 0.010, lower_left[1] + 0.012),
                        (upper_left[0] - 0.010, upper_left[1] + 0.010),
                    ],
                    "bottom_edge": [
                        (lower_left[0] + 0.012, lower_left[1] - 0.016),
                        (upper_left[0] + 0.010, upper_left[1] - 0.014),
                    ],
                    "fill": housing_base_rgba,
                },
                {
                    "polygon": self._scanner_bar_polygon(
                        start=upper_right,
                        end=lower_right,
                        start_width=0.036,
                        end_width=0.042,
                    ),
                    "top_edge": [
                        (upper_right[0] + 0.010, upper_right[1] + 0.010),
                        (lower_right[0] + 0.010, lower_right[1] + 0.012),
                    ],
                    "bottom_edge": [
                        (upper_right[0] - 0.010, upper_right[1] - 0.014),
                        (lower_right[0] - 0.012, lower_right[1] - 0.016),
                    ],
                    "fill": housing_base_rgba,
                },
                {
                    "polygon": self._scanner_bar_polygon(
                        start=front_left,
                        end=lower_left,
                        start_width=0.050,
                        end_width=0.042,
                    ),
                    "top_edge": [
                        (front_bar_left_x - 0.015, front_bar_light_z),
                        (lower_left[0] - 0.010, lower_left[1] + 0.012),
                    ],
                    "bottom_edge": [
                        (front_left[0] + 0.010, front_left[1] - 0.018),
                        (lower_left[0] + 0.012, lower_left[1] - 0.016),
                    ],
                    "fill": housing_base_rgba,
                },
                {
                    "polygon": self._scanner_bar_polygon(
                        start=lower_right,
                        end=front_right,
                        start_width=0.042,
                        end_width=0.050,
                    ),
                    "top_edge": [
                        (lower_right[0] + 0.010, lower_right[1] + 0.012),
                        (front_bar_right_x + 0.015, front_bar_light_z),
                    ],
                    "bottom_edge": [
                        (lower_right[0] - 0.012, lower_right[1] - 0.016),
                        (front_right[0] - 0.014, front_right[1] - 0.018),
                    ],
                    "fill": housing_base_rgba,
                },
                {
                    "polygon": self._scanner_bar_polygon(
                        start=front_left,
                        end=front_right,
                        start_width=0.058,
                        end_width=0.058,
                    ),
                    "top_edge": [
                        (front_left[0] - 0.018, front_left[1] + 0.020),
                        (front_right[0] + 0.018, front_right[1] + 0.020),
                    ],
                    "bottom_edge": [
                        (front_left[0] + 0.006, front_left[1] - 0.018),
                        (front_right[0] - 0.006, front_right[1] - 0.018),
                    ],
                    "fill": housing_base_rgba,
                    "skip_fill": True,
                    "skip_edges": True,
                },
            )
            for polygon_points, rgba in (
                (inner_points, inner_screen_rgba),
            ):
                frame_node = self._filled_polygon_node(
                    points=polygon_points,
                    rgba=rgba,
                )
                frame_node.setBin("fixed", 4)
                self._scanner_frame_nodes.append(frame_node)
            for bar in frame_bars:
                if not bar.get("skip_fill", False):
                    bar_node = self._filled_polygon_node(
                        points=bar["polygon"],
                        rgba=bar["fill"],
                    )
                    bar_node.setBin("fixed", 3)
                    self._scanner_frame_nodes.append(bar_node)
                if not bar.get("skip_edges", False):
                    self._scanner_frame_nodes.append(
                        self._draw_polyline(
                            points=bar["top_edge"],
                            rgba=housing_light_rgba,
                            thickness=5.6,
                        )
                    )
            # This matches the last visible three-bar layout: light on top,
            # medium in the middle, darkest and slightly thickest at the bottom.
            for points, rgba, thickness in (
                (
                    [
                        (front_bar_left_x - 0.016, front_bar_dark_z),
                        (front_bar_right_x + 0.016, front_bar_dark_z),
                    ],
                    (0.60, 0.64, 0.68, 1.0),
                    11.0,
                ),
                (
                    [
                        (front_bar_left_x - 0.018, front_bar_mid_z),
                        (front_bar_right_x + 0.018, front_bar_mid_z),
                    ],
                    (0.96, 0.97, 0.99, 1.0),
                    4.0,
                ),
                (
                    [
                        (front_bar_left_x - 0.016, front_bar_light_z),
                        (front_bar_right_x + 0.016, front_bar_light_z),
                    ],
                    (0.60, 0.64, 0.68, 1.0),
                    4.0,
                ),
            ):
                strip_node = self._draw_polyline(
                    points=points,
                    rgba=rgba,
                    thickness=thickness,
                )
                self._scanner_frame_nodes.append(strip_node)
            for points, rgba, thickness in (*left_front_runs, *right_front_runs):
                self._scanner_frame_nodes.append(
                    self._draw_polyline(
                        points=points,
                        rgba=rgba,
                        thickness=thickness,
                    )
                )
            # Front accent lines are intentionally omitted here while we check
            # whether the three filled faces are visible on their own.
            self._scanner_frame_nodes.append(
                self._draw_polyline(
                    points=outer_points,
                    rgba=rim_shadow_rgba,
                    thickness=3.8,
                )
            )
            ship_marker_points = [
                (center_x - 0.008, center_z - 0.010),
                (center_x + 0.008, center_z - 0.010),
                (center_x + 0.008, center_z + 0.010),
                (center_x - 0.008, center_z + 0.010),
                (center_x - 0.008, center_z - 0.010),
            ]
            ship_marker = self._filled_polygon_node(
                points=ship_marker_points,
                rgba=selected_rgba,
            )
            ship_marker.setBin("fixed", 12)
            self._scanner_frame_nodes.append(ship_marker)

            grid = LineSegs()
            grid.setThickness(1.2)
            grid.setColor(*grid_rgba)
            for line_ratio in (0.82, 0.68, 0.54, 0.38, 0.18, -0.08, -0.40, -0.72):
                width_scale = math.sqrt(
                    max(0.0, 1.0 - (line_ratio * line_ratio)))
                line_z = center_z + (radius_z * line_ratio)
                line_half_width = radius_x * width_scale
                grid.moveTo(center_x - line_half_width, 0.0, line_z)
                grid.drawTo(center_x + line_half_width, 0.0, line_z)
            for meridian_ratio in (-0.72, -0.38, 0.0, 0.38, 0.72):
                bottom_x = center_x + (meridian_ratio * radius_x * 0.92)
                top_x = center_x + (meridian_ratio * radius_x * 0.46)
                bottom_z = center_z - (
                    radius_z * math.sqrt(
                        max(0.0, 1.0 - (((bottom_x - center_x) / radius_x) ** 2))
                    )
                )
                top_z = center_z + (
                    radius_z * math.sqrt(
                        max(0.0, 1.0 - (((top_x - center_x) / radius_x) ** 2))
                    )
                )
                grid.moveTo(bottom_x, 0.0, bottom_z)
                grid.drawTo(top_x, 0.0, top_z)
            self._scanner_grid_node = self.aspect2d.attachNewNode(
                grid.create())
            self._scanner_grid_node.setTransparency(TransparencyAttrib.MAlpha)
            self._scanner_grid_node.setDepthTest(False)
            self._scanner_grid_node.setDepthWrite(False)

            fov = LineSegs()
            fov.setThickness(2.0)
            fov.setColor(*fov_rgba)
            fov.moveTo(center_x, 0.0, center_z)
            fov.drawTo(center_x - (radius_x * 0.46),
                       0.0, center_z + (radius_z * 0.78))
            fov.moveTo(center_x, 0.0, center_z)
            fov.drawTo(center_x + (radius_x * 0.46),
                       0.0, center_z + (radius_z * 0.78))
            fov.moveTo(center_x, 0.0, center_z)
            fov.drawTo(center_x, 0.0, center_z + (radius_z * 0.62))
            self._scanner_fov_node = self.aspect2d.attachNewNode(fov.create())
            self._scanner_fov_node.setTransparency(TransparencyAttrib.MAlpha)
            self._scanner_fov_node.setDepthTest(False)
            self._scanner_fov_node.setDepthWrite(False)

            while len(self._scanner_blips) < 10:
                self._scanner_blips.append(
                    DirectFrame(
                        parent=self.aspect2d,
                        frameColor=blip_rgba,
                        frameSize=(-0.008, 0.008, -0.008, 0.008),
                        pos=(0.0, 0.0, center_z),
                    )
                )

            selected_contact = self._selected_contact()
            contacts = self._sorted_contacts()[: len(self._scanner_blips)]
            scanner_range_km = max(
                25, max((contact.distance_km for contact in contacts), default=25))
            vertical_range_km = max(8.0, scanner_range_km / 2.0)
            for index, blip in enumerate(self._scanner_blips):
                if index >= len(contacts):
                    blip.hide()
                    continue
                contact = contacts[index]
                plane_x = max(-1.0, min(1.0,
                                        contact.relative_x_km / scanner_range_km))
                plane_z = max(-1.0, min(1.0, -
                                        contact.relative_z_km / scanner_range_km))
                altitude_offset = max(
                    -1.0,
                    min(1.0, contact.relative_y_km / vertical_range_km),
                )
                screen_x = center_x + (plane_x * radius_x * 0.84)
                base_z = center_z + (plane_z * radius_z * 0.70)
                screen_z = base_z + (altitude_offset * 0.055)
                stalk = LineSegs()
                stalk.setThickness(1.5)
                stalk_color = (
                    selected_rgba
                    if selected_contact is not None and contact.id == selected_contact.id
                    else grid_rgba
                )
                stalk.setColor(*stalk_color)
                stalk.moveTo(screen_x, 0.0, base_z)
                stalk.drawTo(screen_x, 0.0, screen_z)
                marker_node = self.aspect2d.attachNewNode(stalk.create())
                marker_node.setTransparency(TransparencyAttrib.MAlpha)
                marker_node.setDepthTest(False)
                marker_node.setDepthWrite(False)
                self._scanner_marker_nodes.append(marker_node)

                contact_size = 0.008
                if contact.contact_type == "station":
                    contact_size = 0.011
                elif contact.contact_type in {"planet", "moon", "star"}:
                    contact_size = 0.010
                elif contact.contact_type == "ship":
                    contact_size = 0.007
                if selected_contact is not None and contact.id == selected_contact.id:
                    contact_size += 0.004
                blip.setPos(screen_x, 0.0, screen_z)
                blip["frameColor"] = (
                    selected_rgba
                    if selected_contact is not None and contact.id == selected_contact.id
                    else blip_rgba
                )
                blip["frameSize"] = (
                    -contact_size,
                    contact_size,
                    -contact_size,
                    contact_size,
                )
                blip.show()

        def _refresh_quick_action_buttons(
            self,
            text_rgba,
            frame_rgba,
            accent_rgba,
        ) -> None:
            """Update the left-panel quick controls."""

            button_labels = {
                "refresh": "SYNC",
                "ops": "LOG",
            }
            for action_key, button in self._quick_action_buttons.items():
                button["text"] = _button_text(button_labels[action_key])
                button["text_fg"] = text_rgba
                button["frameColor"] = frame_rgba
                button["state"] = "normal"

        def _refresh_contact_buttons(
            self,
            text_rgba,
            frame_rgba,
            accent_rgba,
        ) -> None:
            """Populate the local-contact list for the scanner control panel."""

            contacts = self._sorted_contacts()[:8]
            selected_contact = self._selected_contact()
            disabled_text_rgba = (
                text_rgba[0] * 0.62,
                text_rgba[1] * 0.62,
                text_rgba[2] * 0.62,
                text_rgba[3],
            )
            disabled_fill_rgba = (0.28, 0.30, 0.32, 0.96)
            button_bevel_light_rgba = (0.82, 0.84, 0.86, 1.0)
            button_bevel_shadow_rgba = (0.24, 0.26, 0.28, 1.0)
            for index, button in enumerate(self._contact_buttons):
                if index < len(contacts):
                    contact = contacts[index]
                    contact_selected = (
                        selected_contact is not None
                        and contact.id == selected_contact.id
                    )
                    button["text"] = _button_text(
                        self._format_contact_button_text(contact)
                    )
                    button["extraArgs"] = [contact.id]
                    button["state"] = "normal"
                    button["text_fg"] = text_rgba
                    button["frameColor"] = (0.0, 0.0, 0.0, 0.0)
                    self._set_indicator_box(
                        self._contact_button_bevels[index],
                        fill_rgba=(
                            accent_rgba if contact_selected else frame_rgba),
                        bevel_light_rgba=button_bevel_light_rgba,
                        bevel_shadow_rgba=button_bevel_shadow_rgba,
                        visible=True,
                    )
                else:
                    button["text"] = _button_text("NO CONTACT")
                    button["extraArgs"] = [""]
                    button["state"] = "disabled"
                    button["text_fg"] = disabled_text_rgba
                    button["frameColor"] = (0.0, 0.0, 0.0, 0.0)
                    self._set_indicator_box(
                        self._contact_button_bevels[index],
                        fill_rgba=disabled_fill_rgba,
                        bevel_light_rgba=button_bevel_light_rgba,
                        bevel_shadow_rgba=button_bevel_shadow_rgba,
                        visible=True,
                    )

        def _format_distance_km(self, distance_km: int | float) -> str:
            """Return a compact distance label using KM, K KM, or M KM."""

            distance_value = max(0, int(round(distance_km)))
            if distance_value >= 1_000_000:
                return f"{round(distance_value / 1_000_000):,}M KM"
            if distance_value >= 1_000:
                return f"{round(distance_value / 1_000):,}K KM"
            return f"{distance_value:,} KM"

        def _format_contact_button_text(self, contact) -> str:
            """Return a compact one-line contact label for the center grid."""

            compact_name = contact.name.upper().replace(" ", "")[:6]
            return sanitize_display_text(
                f"{compact_name} {self._format_distance_km(contact.distance_km)}"
            )

        def _center_panel_rows(
            self,
            hud,
        ) -> tuple[str, tuple[tuple[str, str], ...]]:
            """Return the header and compact summary rows for the center panel."""

            if self._active_console_view == "status":
                return (
                    "SHIP STATUS",
                    (
                        ("SHIP", self.runtime_state.ship.name[:8]),
                        ("MODE", self.runtime_state.ship.status.upper()),
                        ("PHASE", self.runtime_state.ship.flight_phase.upper()),
                        ("SYS",
                         self.runtime_state.snapshot.current_system_name[:8]),
                        ("CONTACTS", str(len(self.runtime_state.contacts.contacts))),
                    ),
                )
            if self._active_console_view == "data":
                return (
                    "OPERATIONS LOG",
                    tuple(
                        (f"LOG {index}", line[:8])
                        for index, line in enumerate(
                            (self._detail_lines or ("No operations",))[:5],
                            start=1,
                        )
                    ),
                )
            if self._active_console_view == "trade":
                return (
                    "MARKET PREVIEW",
                    tuple(
                        (f"ITEM {index}", line[:8])
                        for index, line in enumerate(
                            (self._detail_lines or ("Trade offline",))[:5],
                            start=1,
                        )
                    ),
                )
            if self._active_console_view == "galaxy":
                return (
                    "STATION INDEX",
                    tuple(
                        (f"NODE {index}", line[:8])
                        for index, line in enumerate(
                            (self._detail_lines or ("No stations",))[:5],
                            start=1,
                        )
                    ),
                )
            if self._active_console_view == "equip":
                return (
                    "SHIP CONFIG",
                    (
                        (
                            "DOCKING",
                            self.runtime_state.ship.docking_computer_tier.upper()[
                                :8],
                        ),
                        (
                            "RANGE",
                            self._format_distance_km(
                                self.runtime_state.ship.docking_computer_range_km
                            ),
                        ),
                        (
                            "VISUAL",
                            self.runtime_state.ship.ship_visual_key.upper()[
                                :8],
                        ),
                        (
                            "HULL",
                            f"{self.runtime_state.ship.hull_current}/{self.runtime_state.ship.hull_max}"[
                                :8],
                        ),
                        ("SCENE",
                         hud.center_scanner.active_scene_name.upper()[:8]),
                    ),
                )
            if self._active_console_view == "comms":
                return (
                    "COMMS ROUTING",
                    (
                        ("CHANNELS", str(len(self.runtime_state.comms.channels))),
                        ("ACTIVE", hud.right_comms.focus_channel[:8]),
                        ("UNREAD", str(self.runtime_state.comms.unread_total)),
                        ("RELAY", hud.right_comms.relay_state.upper()[:8]),
                        ("STATUS", "SELECT CHAN"),
                    ),
                )

            selected_contact = self._selected_contact()
            if selected_contact is None:
                return (
                    "SCANNER",
                    (
                        ("STATUS", "NO CONTACTS"),
                        ("SYSTEM",
                         self.runtime_state.snapshot.current_system_name[:8]),
                        ("TOTAL", str(len(self.runtime_state.contacts.contacts))),
                        ("MODE", self.runtime_state.ship.flight_phase.upper()),
                        ("SCENE",
                         hud.center_scanner.active_scene_name.upper()[:8]),
                    ),
                )

            clearance_distance = None
            clearance_required = None
            clearance_name = None
            if self._jump_plan is not None:
                clearance_distance = self._jump_plan.nearest_clearance_distance_km
                clearance_required = self._jump_plan.clearance_required_km
                clearance_name = self._jump_plan.nearest_clearance_contact_name

            contact_type_label = {
                "station": "STN",
                "planet": "PLT",
                "moon": "MON",
                "star": "STR",
                "ship": "SHIP",
            }.get(selected_contact.contact_type.lower(), selected_contact.contact_type.upper()[:4])

            clearance_value = "--"
            if clearance_distance is not None and clearance_required is not None:
                clearance_value = (
                    f"{self._format_distance_km(clearance_distance)} / "
                    f"{self._format_distance_km(clearance_required)}"
                )[:12]

            phase_label = "PHASE"
            phase_value = self.runtime_state.ship.flight_phase.upper()
            if self.runtime_state.ship.flight_locked_destination_contact_id:
                phase_label = "LOCK"
                phase_value = (
                    self.runtime_state.ship.flight_locked_destination_contact_id.upper()[
                        :13]
                )

            vector_value = (
                f"{selected_contact.relative_x_km:+} "
                f"{selected_contact.relative_y_km:+} "
                f"{selected_contact.relative_z_km:+}"
            )

            return (
                "SCANNER",
                (
                    ("TGT", selected_contact.name[:7]),
                    (
                        "TYP",
                        f"{contact_type_label} {self._format_distance_km(selected_contact.distance_km)}"[
                            :9],
                    ),
                    ("VEC", vector_value[:7]),
                    ("CLR", clearance_value[:7]),
                    (
                        (("PHS", phase_value[:6]) if phase_label == "PHASE" else (
                            "LCK", phase_value[:6]))
                        if clearance_name is None
                        else ("NAR", clearance_name.upper()[:6])
                    ),
                ),
            )

        def _build_comms_panel_text(self, hud) -> str:
            """Return the message body text for the comms panel."""

            selected_contact = self._selected_contact()
            contact_line = "TARGET NONE"
            if selected_contact is not None:
                contact_line = (
                    f"TARGET {selected_contact.name[:14].upper()} {selected_contact.distance_km:>4}KM"
                )

            clearance_line = "CLR STBY"
            docking_line = f"DOCK {self.runtime_state.ship.flight_phase.upper()}"
            if self._jump_plan is not None:
                if (
                    self._jump_plan.nearest_clearance_distance_km is not None
                    and self._jump_plan.clearance_required_km is not None
                ):
                    clearance_line = (
                        f"CLR {self._jump_plan.nearest_clearance_distance_km}/"
                        f"{self._jump_plan.clearance_required_km}KM"
                    )
                if self._jump_plan.next_action_message:
                    docking_line = self._jump_plan.next_action_message[:22].upper(
                    )

            if self._active_console_view == "comms":
                lines = [
                    f"CH {hud.right_comms.focus_channel[:10]}",
                    f"U{hud.right_comms.unread_count} {hud.right_comms.relay_state.upper()[:6]}",
                    contact_line[:20],
                    (hud.right_comms.preview_lines[0][:20]
                     if hud.right_comms.preview_lines else clearance_line[:20]),
                ]
            else:
                lines = [
                    contact_line[:20],
                    clearance_line[:20],
                    docking_line[:20],
                ]
            return "\n".join(lines)

        def _refresh_command_buttons(
            self,
            hud,
            text_rgba,
            frame_rgba,
            accent_rgba,
        ) -> None:
            """Sync the clickable command-band buttons to the HUD model."""

            metal_face_rgba = (0.58, 0.60, 0.62, 0.92)
            metal_face_active_rgba = (0.73, 0.76, 0.78, 0.96)
            metal_face_disabled_rgba = (0.34, 0.35, 0.36, 0.74)
            command_text_rgba = (0.94, 0.95, 0.96, 1.0)
            launch_enabled = self._launch_command_enabled()

            for button_model in hud.command_bar:
                button = self._command_buttons[button_model.key]
                button["text"] = _button_text(button_model.label)
                button["text_fg"] = command_text_rgba
                button_enabled = button_model.enabled
                if button_model.key == "launch":
                    button_enabled = launch_enabled
                button["state"] = "normal" if button_enabled else "disabled"
                button["frameColor"] = (0.0, 0.0, 0.0, 0.0)
                button["frameSize"] = (-1.56, 1.56, -0.18, 0.22)

        def _refresh_channel_buttons(
            self,
            hud,
            text_rgba,
            frame_rgba,
            accent_rgba,
        ) -> None:
            """Rebuild the on-screen comms channel list."""

            for button in self._channel_buttons:
                button.destroy()
            self._channel_buttons = []

            if self._active_console_view != "comms":
                return

            if not self.runtime_state.comms.channels:
                return

            for index, channel in enumerate(self.runtime_state.comms.channels[:5]):
                label = sanitize_display_text(channel.name[:18].upper())
                button = DirectButton(
                    parent=self.aspect2d,
                    text=_button_text(label),
                    command=self._select_comms_channel,
                    extraArgs=[channel.id],
                    pos=(0.785, 0.0, -0.36 - (index * 0.08)),
                    scale=0.031,
                    frameSize=(-2.65, 2.65, -0.42, 0.44),
                    relief=1,
                )
                button["text_fg"] = text_rgba
                button["frameColor"] = (
                    accent_rgba
                    if channel.id == self.runtime_state.comms.active_channel_id
                    else frame_rgba
                )
                self._channel_buttons.append(button)

        def _handle_quick_action(self, action_key: str) -> None:
            """Dispatch the left-panel quick controls."""

            if action_key == "refresh":
                try:
                    self.runtime_state = self.runtime.refresh_runtime(
                        self.runtime_state)
                    self._command_status_message = "Runtime state refreshed from the backend."
                except Exception as exc:
                    self._command_status_message = str(exc)
                self._refresh_overlay()
                return
            if action_key == "ops":
                self._handle_command_button("data")
                return

        def _select_contact(self, contact_id: str) -> None:
            """Select one local contact for center-panel actions."""

            if not contact_id:
                return
            self._selected_contact_id = contact_id
            selected_contact = self._selected_contact()
            if selected_contact is not None:
                self._command_status_message = (
                    f"Selected {selected_contact.name} at {selected_contact.distance_km} km."
                )
            self._refresh_overlay()

        def _selected_station_id(self) -> int | None:
            """Parse the selected contact into a numeric station id when possible."""

            selected_contact = self._selected_contact()
            if selected_contact is None or selected_contact.contact_type != "station":
                return None
            try:
                return int(selected_contact.id.split("-", 1)[-1])
            except ValueError:
                return None

        def _launch_command_enabled(self) -> bool:
            """Return whether the command-rail launch/dock action is allowed."""

            if self.runtime_state.ship.status == "docked":
                return True
            return self._selected_station_id() is not None

        def _redraw_arch(self, hud) -> None:
            """Redraw the curved cockpit lip for the selected HUD preset."""

            if self._arc_node is not None:
                self._arc_node.removeNode()
            self._arc_node = self.aspect2d.attachNewNode("cockpit-arch-hidden")

        def _tick_runtime(self, task):
            """Poll the authoritative desktop runtime and refresh the overlay."""

            try:
                tick_result = self.runtime.tick(self.runtime_state)
                self.runtime_state = tick_result.state
                self._refresh_overlay()
                task.delayTime = self._poll_delay_seconds()
                return Task.again
            except Exception as exc:
                self._command_status_message = str(exc)
                self._refresh_overlay()
                return Task.done

        def _handle_command_button(self, key: str) -> None:
            """Dispatch one command-rail action or switch the active console."""

            if key == "launch":
                if self.runtime_state.ship.status == "docked":
                    try:
                        self.runtime_state = self.runtime.trigger_launch_or_dock(
                            self.runtime_state,
                        )
                        self._active_console_view = "status"
                        self._command_status_message = (
                            "Launch sequence engaged."
                        )
                    except Exception as exc:
                        self._command_status_message = str(exc)
                    self._refresh_overlay()
                    return

                station_id = self._selected_station_id()
                selected_contact = self._selected_contact()
                if station_id is None or selected_contact is None:
                    self._command_status_message = (
                        "Select a station contact before requesting docking."
                    )
                    self._refresh_overlay()
                    return
                try:
                    self.runtime_state = self.runtime.dock_at_station(
                        self.runtime_state,
                        station_id=station_id,
                    )
                    self._active_console_view = "status"
                    self._command_status_message = (
                        f"Docking clamps secured at {selected_contact.name}."
                    )
                except Exception as exc:
                    self._command_status_message = str(exc)
                self._refresh_overlay()
                return

            if key == "trade":
                try:
                    inventory = self.runtime.fetch_active_station_inventory(
                        self.runtime_state,
                    )
                    self._detail_lines = tuple(
                        f"{item.name[:12].upper()} {item.quantity:>3} @ {item.buy_price}"
                        for item in inventory[:5]
                    ) or ("No station inventory available.",)
                    self._active_console_view = "trade"
                    self._command_status_message = "Loaded dockside market preview."
                except Exception as exc:
                    self._command_status_message = str(exc)
                self._refresh_overlay()
                return

            if key == "equip":
                self._active_console_view = "equip"
                self._command_status_message = "Ship configuration readout selected."
                self._refresh_overlay()
                return

            if key == "galaxy":
                try:
                    stations = self.runtime.list_known_stations()
                    self._detail_lines = tuple(
                        f"{station.name[:16].upper()} SYS {station.system_id}"
                        for station in stations[:5]
                    ) or ("No known stations available.",)
                    self._active_console_view = "galaxy"
                    self._command_status_message = "Loaded station index."
                except Exception as exc:
                    self._command_status_message = str(exc)
                self._refresh_overlay()
                return

            if key == "local":
                self._active_console_view = "local"
                self._command_status_message = "Local tactical scanner selected."
                self._refresh_overlay()
                return

            if key == "data":
                try:
                    operations = self.runtime.fetch_recent_operations(
                        self.runtime_state)
                    self._detail_lines = tuple(
                        f"{entry.operation[:14].upper()} {entry.status.upper()}"
                        for entry in operations[:5]
                    ) or ("No recent operations logged.",)
                    self._active_console_view = "data"
                    self._command_status_message = "Loaded recent ship operations."
                except Exception as exc:
                    self._command_status_message = str(exc)
                self._refresh_overlay()
                return

            if key == "status":
                self._active_console_view = "status"
                self._command_status_message = "Ship status overview selected."
                self._refresh_overlay()
                return

            if key == "comms":
                self._active_console_view = "comms"
                self._focus_comms_entry()
                return

        def _focus_comms_entry(self) -> None:
            """Move keyboard focus into the comms entry field."""

            self.comms_entry["focus"] = 1
            self._active_console_view = "comms"
            self._comms_status_message = (
                "Comms input active. Enter or Send transmits to the selected channel."
            )
            self._refresh_overlay()

        def _blur_comms_entry(self) -> None:
            """Return keyboard focus to the shell."""

            self.comms_entry["focus"] = 0

        def _select_comms_channel(self, channel_id: str) -> None:
            """Select one channel from the on-screen list and mark it read."""

            try:
                self.runtime_state = self.runtime.refresh_comms(
                    self.runtime_state,
                    active_channel_id=channel_id,
                    mark_read=True,
                )
                self._active_console_view = "comms"
                self._comms_status_message = f"Active comms channel: {channel_id}"
            except Exception as exc:
                self._comms_status_message = str(exc)
            self._refresh_overlay()

        def _cycle_comms_channel(self, step: int = 1) -> None:
            """Move to the next or previous comms channel and reload its history."""

            try:
                self.runtime_state = self.runtime.cycle_comms_channel(
                    self.runtime_state,
                    step=step,
                )
                active_channel_id = self.runtime_state.comms.active_channel_id or "NONE"
                self._active_console_view = "comms"
                self._comms_status_message = f"Active comms channel: {active_channel_id}"
            except Exception as exc:
                self._comms_status_message = str(exc)
            self._refresh_overlay()

        def _mark_active_channel_read(self) -> None:
            """Mark the selected comms channel as read when requested."""

            try:
                self.runtime_state = self.runtime.refresh_comms(
                    self.runtime_state,
                    mark_read=True,
                )
                self._active_console_view = "comms"
                self._comms_status_message = "Active comms channel marked read."
            except Exception as exc:
                self._comms_status_message = str(exc)
            self._refresh_overlay()

        def _submit_comms_entry(self) -> None:
            """Send the current entry field contents via the clickable Send button."""

            self._submit_comms_message(self.comms_entry.get())

        def _submit_comms_message(self, text: str) -> None:
            """Send one outbound comms message through the runtime adapter."""

            try:
                self.runtime_state = self.runtime.send_comms_message(
                    self.runtime_state,
                    body=text,
                )
                self._active_console_view = "comms"
                self.comms_entry.enterText("")
                self._blur_comms_entry()
                self._comms_status_message = "Message transmitted."
            except Exception as exc:
                self._comms_status_message = str(exc)
            self._refresh_overlay()

    app = RetroCockpitShowBase()
    app.run()
