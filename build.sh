#!/bin/bash

# Build frontend
cd /opt/render/project/src/frontend
yarn install
yarn build

# Copy build to backend static folder
mkdir -p /opt/render/project/src/backend/static
cp -r build/* /opt/render/project/src/backend/static/

# Install backend dependencies
cd /opt/render/project/src/backend
pip install -r requirements.txt
