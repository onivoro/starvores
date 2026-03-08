#!/bin/bash

# Script to load .env file and serve the datavore application
# Usage: ./tools/scripts/serve-datavore.sh [path-to-env-file]

set -e  # Exit on any error

# Default .env file path (can be overridden by first argument)
ENV_FILE="${1:-.env}"

# Function to display usage
usage() {
    echo "Usage: $0 [path-to-env-file]"
    echo "  path-to-env-file: Path to the .env file (default: .env)"
    echo ""
    echo "Examples:"
    echo "  $0                    # Uses .env in current directory"
    echo "  $0 .env.local         # Uses .env.local file"
    echo "  $0 dev/.env           # Uses dev/.env file"
    exit 1
}

# Check if help is requested
if [[ "$1" == "-h" || "$1" == "--help" ]]; then
    usage
fi

# Check if .env file exists
if [[ ! -f "$ENV_FILE" ]]; then
    echo "Error: Environment file '$ENV_FILE' not found!"
    echo "Please create the file or specify a different path."
    echo ""
    usage
fi

echo "Loading environment variables from: $ENV_FILE"

# Export variables from .env file
# This handles comments, empty lines, and properly quotes values
set -a  # Automatically export all variables
source "$ENV_FILE"
set +a  # Stop automatically exporting

echo "Environment variables loaded successfully"
echo "Starting datavore server..."
echo ""

# Run the nx serve command with loaded environment
npx nx serve app-server-datavore
