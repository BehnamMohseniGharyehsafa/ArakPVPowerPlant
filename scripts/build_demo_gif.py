"""Combine actual browser-captured field frames for the repository demonstration."""

from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
frames = [
    Image.open(p).convert("RGB")
    for p in sorted((root / "docs/screenshots/demo-frames").glob("*.png"))
]
if not frames:
    raise SystemExit(
        "Run node scripts/capture-demo.mjs with the local application serving first"
    )
frames[0].save(
    root / "docs/screenshots/field-demo.gif",
    save_all=True,
    append_images=frames[1:],
    duration=700,
    loop=0,
    optimize=True,
)
for frame in frames:
    frame.close()
