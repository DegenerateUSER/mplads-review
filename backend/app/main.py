"""ASGI entry point used by the project run command."""

from backend.main import app, create_app

__all__ = ["app", "create_app"]
