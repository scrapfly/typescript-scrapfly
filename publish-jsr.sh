#!/bin/bash

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

# Publish the package
# deno task test
rm -r __tests__
deno publish --allow-dirty
