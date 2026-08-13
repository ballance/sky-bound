#!/usr/bin/env bash
# Deploy the Skybound static site to S3 and invalidate CloudFront.
# Infra (bucket, CDN, cert, DNS) is provisioned by Terraform in ./infra.
set -euo pipefail

BUCKET="skybound.bastionforge.com"

echo "Syncing site to s3://$BUCKET ..."
# Whitelist just the site files — never upload infra/, docs, tests, or git.
aws s3 sync . "s3://$BUCKET" \
  --delete \
  --cache-control "no-cache" \
  --exclude "*" \
  --include "index.html" \
  --include "css/*" \
  --include "js/*" \
  --exclude "js/*.test.js"

echo "Invalidating CloudFront cache..."
DISTRIBUTION_ID=$(cd infra && terraform output -raw cloudfront_distribution_id)
aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/*" \
  --query 'Invalidation.Id' \
  --output text

echo "Deployed to https://$BUCKET"
