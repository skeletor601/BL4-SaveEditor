from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
import sys
import os
import traceback
from datetime import datetime

APP_NAME_DEFAULT = "BL4_AIO"

def get_log_dir(app_name: str = APP_NAME_DEFAULT) -> Path:
    # Windows: %APPDATA%\<app_name>\logs
    # Fallback to ~/. for non-Windows
    appdata = Path(os.getenv("APPDATA") or (Path.home() / "AppData" / "Roaming"))
    log_dir = appdata / app_name / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    return log_dir

def setup_logger(app_name: str = APP_NAME_DEFAULT) -> logging.Logger:
    log_dir = get_log_dir(app_name)
    log_path = log_dir / f"{app_name}.log"

    logger = logging.getLogger(app_name)
    logger.setLevel(logging.INFO)

    if logger.handlers:
        return logger

    fmt = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )

    file_handler = RotatingFileHandler(
        log_path, maxBytes=2_000_000, backupCount=5, encoding="utf-8"
    )
    file_handler.setFormatter(fmt)
    logger.addHandler(file_handler)

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(fmt)
    logger.addHandler(console_handler)

    logger.info("==== %s start: %s ====", app_name, datetime.now().isoformat(timespec="seconds"))
    logger.info("Python: %s", sys.version.replace("\n", " "))
    logger.info("Executable: %s", sys.executable)
    return logger

def install_global_exception_hook(logger: logging.Logger) -> None:
    def excepthook(exc_type, exc, tb):
        logger.critical("UNHANDLED EXCEPTION:\n%s", "".join(traceback.format_exception(exc_type, exc, tb)))
        sys.__excepthook__(exc_type, exc, tb)
    sys.excepthook = excepthook
