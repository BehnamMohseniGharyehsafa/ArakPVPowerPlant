"""Record only the project's runtime/test dependency closure, not unrelated host packages."""

import importlib.metadata as metadata
import tomllib
from pathlib import Path
from packaging.requirements import Requirement

ROOT = Path(__file__).resolve().parents[1]
project = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))[
    "project"
]
pending = project["dependencies"] + project["optional-dependencies"]["test"]
found = {}
while pending:
    req = Requirement(pending.pop())
    if req.marker and not req.marker.evaluate():
        continue
    dist = metadata.distribution(req.name)
    name = dist.metadata["Name"]
    if name.lower() in found:
        continue
    found[name.lower()] = f"{name}=={dist.version}"
    pending.extend(dist.requires or [])
(ROOT / "requirements.lock").write_text(
    "# Tested dependency closure; regenerate with scripts/lock_dependencies.py\n"
    + "\n".join(found[k] for k in sorted(found))
    + "\n",
    encoding="utf-8",
)
