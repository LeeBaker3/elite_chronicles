from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/elite"
    log_dir: str = "data/logs"
    environment: str = "development"
    flight_collision_enabled: bool = True
    dock_approach_enabled: bool = True
    flight_collision_cooldown_seconds: int = 2
    flight_collision_radius_scale: float = 1.0
    flight_collision_damage_scale: float = 1.0
    flight_collision_glancing_multiplier: float = 1.08
    flight_collision_critical_multiplier: float = 0.58


settings = Settings()
