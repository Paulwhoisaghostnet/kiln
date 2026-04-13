# Cleanup and Verification Checklist

## Cleanup
- Remove temporary round directories.
- Preserve synthesis reports in stable location.
- Close all spawned agents.

## Verification
- Confirm deleted temp paths no longer exist.
- Confirm patch reports and updated skills exist.
- Confirm global skill sync matches local (`diff -qr`).
