"""Deploy NutriSense to a Hugging Face Space (Docker), then wait until it is live.

Docker Spaces need a Hugging Face PRO subscription; the free plan only hosts static pages.

    HF_TOKEN=hf_... python deploy/hf_space.py            # deploy to <your-username>/nutrisense
    HF_TOKEN=hf_... HF_SPACE=me/other python deploy/hf_space.py
    python deploy/hf_space.py --dry-run                  # only build the upload folder and list it

Runs from GitHub Actions (.github/workflows/deploy-hf.yml) or from any computer with Python.
The Space is built from the root Dockerfile: one address serves the app and the API.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INCLUDE = ("backend/", "mobile/", "Dockerfile", ".dockerignore", "deploy/docker-entrypoint.sh")
# Space variables (public, not secrets) that make the Space a throwaway demo: demo accounts are seeded,
# production mode allows it (ALLOW_DEMO), and missing secrets are made up at random on every start.
DEMO_VARIABLES = {
    "NUTRISENSE_SEED_DEMO_DATA": "true",
    "NUTRISENSE_ALLOW_DEMO": "1",
    "NUTRISENSE_EPHEMERAL_SECRETS": "1",
}
GITHUB_URL = "https://github.com/kkurniawan-blip/Nutrisense"

SPACE_README = f"""---
title: NutriSense
emoji: 🌱
colorFrom: pink
colorTo: green
sdk: docker
app_port: 8000
pinned: false
short_description: Stunting prevention app for mothers and Kaders (demo)
---

# NutriSense (demo)

Growth monitoring, nutrition and symptom checks for mothers and Kaders in East Nusa Tenggara,
with health-worker review and N.E.X.U.S. logistics. Source code and documentation: {GITHUB_URL}

Log in with a demo account (password `Demo1234!`): `ibu.maria@nutrisense.id` (mother),
`kader.oesapa@nutrisense.id` (Kader), `officer@nutrisense.id` (officer), `doctor@nutrisense.id` (doctor).

All people and data here are fictional, and the demo resets to fresh data whenever the Space restarts.
Do not enter real personal or health data. AI results are decision support, not a medical diagnosis.
"""


def build_folder(dest: Path) -> list[str]:
    files = subprocess.run(["git", "ls-files"], cwd=ROOT, check=True, capture_output=True, text=True).stdout.split()
    picked = [f for f in files if f.startswith(INCLUDE) and (ROOT / f).is_file()]
    for f in picked:
        (dest / f).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / f, dest / f)
    (dest / "README.md").write_text(SPACE_README, encoding="utf-8")
    return picked + ["README.md"]


def wait_until_live(api, repo_id: str, url: str, timeout_s: int = 1500) -> None:
    time.sleep(30)  # let the new build register
    deadline, last = time.time() + timeout_s, None
    while time.time() < deadline:
        raw = api.get_space_runtime(repo_id).stage
        stage = str(getattr(raw, "value", raw))
        if stage != last:
            print(f"  Space status: {stage}", flush=True)
            last = stage
        if stage in ("BUILD_ERROR", "RUNTIME_ERROR", "CONFIG_ERROR", "NO_APP_FILE"):
            sys.exit(f"The Space failed ({stage}). Open https://huggingface.co/spaces/{repo_id} → Logs to see why.")
        if stage == "RUNNING":
            try:
                with urllib.request.urlopen(f"{url}/api/health", timeout=30) as r:
                    if r.status == 200:
                        with urllib.request.urlopen(url, timeout=30) as page:
                            if b"<html" in page.read(2000).lower():
                                return
            except OSError:
                pass  # still starting up
        time.sleep(20)
    sys.exit(f"The Space did not come up within {timeout_s // 60} minutes. Check https://huggingface.co/spaces/{repo_id}")


def space_url(api, repo_id: str) -> str:
    info = api.space_info(repo_id)
    return (getattr(info, "host", None) or f"https://{repo_id.replace('/', '-').replace('_', '-').replace('.', '-').lower()}.hf.space").rstrip("/")


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        files = build_folder(folder)
        if "--dry-run" in sys.argv:
            print("\n".join(files))
            print(f"\n{len(files)} files would be uploaded.")
            return

        token = os.environ.get("HF_TOKEN")
        if not token:
            sys.exit("Set HF_TOKEN to a Hugging Face access token with write permission.")
        from huggingface_hub import HfApi

        api = HfApi(token=token)
        repo_id = os.environ.get("HF_SPACE") or f"{api.whoami()['name']}/nutrisense"
        print(f"Deploying {len(files)} files to https://huggingface.co/spaces/{repo_id}", flush=True)
        api.create_repo(repo_id, repo_type="space", space_sdk="docker", exist_ok=True)
        url = space_url(api, repo_id)
        # Set before the upload, so the build that the upload starts already runs as a demo.
        for key, value in {**DEMO_VARIABLES, "NUTRISENSE_CORS_ORIGINS": url}.items():
            api.add_space_variable(repo_id, key, value)
        print(f"Space variables set: {', '.join(DEMO_VARIABLES)}, NUTRISENSE_CORS_ORIGINS={url}", flush=True)
        api.upload_folder(
            folder_path=folder, repo_id=repo_id, repo_type="space",
            commit_message=f"Deploy {os.environ.get('GITHUB_SHA', 'local build')[:12]}",
            delete_patterns=["backend/**", "mobile/**", "deploy/**"],  # remove files deleted from the repo
        )

    print(f"Uploaded. Waiting for the build (usually 5–10 minutes): {url}", flush=True)
    wait_until_live(api, repo_id, url)
    print(f"\nNutriSense is live: {url}")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as fh:
            fh.write(f"## NutriSense is live\n\n**Open on any phone:** {url}\n\n"
                     f"Demo login: `ibu.maria@nutrisense.id` / `Demo1234!`\n\nSpace: https://huggingface.co/spaces/{repo_id}\n")


if __name__ == "__main__":
    main()
