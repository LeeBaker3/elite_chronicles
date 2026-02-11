import logging
import os
from logging.handlers import RotatingFileHandler


def setup_logging(log_dir: str) -> None:
    os.makedirs(log_dir, exist_ok=True)

    logging.basicConfig(level=logging.INFO)
    formatter = logging.Formatter(
        "%(asctime)s %(levelname)s %(name)s %(message)s"
    )

    app_handler = RotatingFileHandler(
        os.path.join(log_dir, "app.log"), maxBytes=2_000_000, backupCount=5
    )
    app_handler.setFormatter(formatter)

    error_handler = RotatingFileHandler(
        os.path.join(log_dir, "error.log"), maxBytes=2_000_000, backupCount=5
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(formatter)

    api_handler = RotatingFileHandler(
        os.path.join(log_dir, "api.log"), maxBytes=2_000_000, backupCount=5
    )
    api_handler.setFormatter(formatter)

    logging.getLogger().handlers = [app_handler, error_handler]
    logging.getLogger("api").handlers = [api_handler]
