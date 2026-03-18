import math

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/elite"
    log_dir: str = "data/logs"
    environment: str = "development"
    starter_credits: int = 2000
    starter_ship_cargo_capacity: int = 40
    flight_control_max_speed_units: float = 12.0
    flight_control_forward_acceleration: float = 7.5
    flight_control_reverse_acceleration: float = 6.0
    flight_control_yaw_rate_deg_per_sec: float = math.degrees(1.6)
    flight_control_pitch_rate_deg_per_sec: float = math.degrees(1.2)
    flight_control_roll_rate_deg_per_sec: float = math.degrees(1.6)
    flight_control_input_timeout_seconds: float = 1.6
    flight_control_simulation_max_step_seconds: float = 5.0
    flight_control_active_poll_interval_ms: int = 450
    flight_collision_enabled: bool = True
    dock_approach_enabled: bool = True
    flight_collision_cooldown_seconds: int = 2
    flight_collision_radius_scale: float = 1.0
    flight_collision_damage_scale: float = 1.0
    flight_collision_glancing_multiplier: float = 1.08
    flight_collision_critical_multiplier: float = 0.58


settings = Settings()
