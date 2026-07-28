#!/usr/bin/env python3
"""Regression tests for the public-evidence claim-register validator."""

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


PACKAGE_DIR = Path(__file__).parent


class ClaimRegisterValidationTests(unittest.TestCase):
    def test_rejects_capture_path_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            package_copy = Path(temp_dir) / "package"
            shutil.copytree(PACKAGE_DIR, package_copy)
            register_path = package_copy / "claim_register.json"
            claims = json.loads(register_path.read_text(encoding="utf-8"))
            claims[0]["evidence_capture"] = "captures/../claim_register.json"
            register_path.write_text(json.dumps(claims), encoding="utf-8")

            result = subprocess.run(
                [sys.executable, str(package_copy / "validate_claim_register.py")],
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
