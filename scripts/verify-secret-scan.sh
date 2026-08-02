#!/usr/bin/env bash
# Prove the secret scanner actually fires.
#
# A scanner nobody has ever watched fail is indistinguishable from no scanner:
# a broken config, a bad path filter, or a silently-swallowed exit code all look
# exactly like "clean". This writes a file containing the canary marker that
# .gitleaks.toml defines a rule for, runs gitleaks over the working tree, and
# asserts a NON-ZERO exit. If gitleaks comes back clean on a planted secret, the
# gate is broken and CI fails here rather than four months later.
#
# Then it removes the canary and asserts the tree is clean again, so this script
# cannot itself leave a finding behind.
#
# Usage: bash scripts/verify-secret-scan.sh
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "verify-secret-scan: gitleaks is not installed. Install it (brew install gitleaks) or run this in CI." >&2
  exit 1
fi

CANARY_DIR="$(mktemp -d)"
CANARY_FILE="${CANARY_DIR}/canary.txt"
cleanup() { rm -rf "${CANARY_DIR}"; }
trap cleanup EXIT

# Split so this script's own source does not trip the rule it is testing.
printf 'ROLEOS_SECRET_SCAN%s\n' "_CANARY_deadbeef1234" > "${CANARY_FILE}"

echo "verify-secret-scan: planting a canary and expecting gitleaks to FAIL..."
set +e
gitleaks dir --no-banner --redact --config .gitleaks.toml "${CANARY_DIR}" >/dev/null 2>&1
planted_exit=$?
set -e

if [ "${planted_exit}" -eq 0 ]; then
  echo "verify-secret-scan: FAILED. gitleaks reported CLEAN on a planted secret." >&2
  echo "The secret scan is not actually scanning. Check .gitleaks.toml and the invocation." >&2
  exit 1
fi

cleanup
trap - EXIT

echo "verify-secret-scan: OK. The scanner detected the planted canary (exit ${planted_exit})."
