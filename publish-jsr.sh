#!/bin/bash
# Local-dev wrapper: stage the JSR tree and publish it. CI splits these
# two steps so the staged tree becomes a build artifact shared with the
# npm publish job (see .github/workflows/publish.yaml).
set -euo pipefail

./stage-jsr.sh
cd build
deno publish --allow-dirty
