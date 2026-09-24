"""Pin a rehearsed demo photo to a preset for offline demos.
Usage: python scripts/register_fixture.py path/to/photo.jpg compliant|non_compliant|low_confidence|suspicious"""

import hashlib
import json
import sys
from pathlib import Path

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "vision_fixtures.json"

photo, preset = Path(sys.argv[1]), sys.argv[2]
data = json.loads(FIXTURES.read_text())
data["photos"][hashlib.sha256(photo.read_bytes()).hexdigest()] = preset
FIXTURES.write_text(json.dumps(data, indent=2))
print(f"{photo.name} -> {preset}")
