"""Render-compatible startup honours the assigned PORT without a shell command."""

import os
import sys
from pathlib import Path
import uvicorn

if __name__ == "__main__":
    # Prefer the image's source checkout over the installed package: its sibling
    # frontend/dist directory contains the built application and public assets.
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    uvicorn.run(
        "backend.app.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        proxy_headers=True,
        forwarded_allow_ips=os.getenv("FORWARDED_ALLOW_IPS", "127.0.0.1"),
    )
