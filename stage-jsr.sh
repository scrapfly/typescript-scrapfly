#!/bin/bash
# Stage a JSR-publishable tree under ./build. Used by both the local
# publish-jsr.sh wrapper and the CI build job.
set -euo pipefail

rm -rf build
mkdir build

cp -R src build/
cp deno.json build/
cp README.md build/
cp LICENSE build/

# __tests__ is intentionally NOT copied — JSR ships src + manifest only.
