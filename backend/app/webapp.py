"""Serve the exported web app from the same address as the API (hosted deployment)."""
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse


def serve_web_app(app: FastAPI, web_dir: Path) -> bool:
    """Add a catch-all route that serves `web_dir` (output of `npx expo export -p web`).

    Register it after the API routes: those, and the docs, always win. Any other path is a file from
    the build or, for app routes like /home or /child/3, the single-page app's index.html.
    Returns False (and adds nothing) when there is no build.
    """
    if not (web_dir / "index.html").is_file():
        return False
    root = web_dir.resolve()

    @app.get("/{path:path}", include_in_schema=False)
    def web_app(path: str):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        target = (root / path).resolve()
        if path and path != "index.html" and target.is_file() and target.is_relative_to(root):
            # Expo puts a content hash in these file names, so a cached copy never goes stale.
            hashed = path.startswith(("_expo/static/", "assets/"))
            return FileResponse(target, headers={"Cache-Control": "public, max-age=31536000, immutable"} if hashed else None)
        # index.html names the current bundles: always revalidate it so a new release is picked up.
        return FileResponse(root / "index.html", headers={"Cache-Control": "no-cache"})

    return True
