import sys
import os

# Add backend directory to sys.path so we can import modules correctly
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

# pyrefly: ignore [missing-import]
from main import app

class PrefixRemovalMiddleware:
    def __init__(self, app, prefix: str):
        self.app = app
        self.prefix = prefix

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            path = scope.get("path", "")
            if path.startswith(self.prefix):
                scope["path"] = path[len(self.prefix):]
                raw_path = scope.get("raw_path", b"")
                prefix_bytes = self.prefix.encode("utf-8")
                if raw_path.startswith(prefix_bytes):
                    scope["raw_path"] = raw_path[len(prefix_bytes):]
        await self.app(scope, receive, send)

# Set root path for correct URL generation in FastAPI/Swagger
app.root_path = "/_/backend"

# Wrap the application with the prefix removal middleware
app = PrefixRemovalMiddleware(app, "/_/backend")
