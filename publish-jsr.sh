#!/bin/bash
set -euo pipefail

# Clean up any existing build directory
rm -rf build

# Create a fresh build directory
mkdir build

# Copy necessary files to the build directory
cp -R src build/
cp -R __tests__ build/
cp deno.json build/
cp README.md build/
cp LICENSE build/

# Change to the build directory
cd build

# Publish the package.
# __tests__ was copied in above; strip it so JSR doesn't index tests.
rm -rf __tests__
deno publish --allow-dirty
