from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/elite"
    log_dir: str = "data/logs"
    environment: str = "development"


settings = Settings()
