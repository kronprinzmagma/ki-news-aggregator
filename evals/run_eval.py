#!/usr/bin/env python3
"""Compatibility wrapper for the shared JavaScript scoring eval."""

import subprocess
import sys
from pathlib import Path


if __name__ == "__main__":
    script = Path(__file__).with_suffix(".js")
    completed = subprocess.run(["node", str(script)], check=False)
    sys.exit(completed.returncode)
