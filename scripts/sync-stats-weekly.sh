#!/bin/bash
# Rebu AI — sync settimanale player_stats (sezione 5 INTEGRAZIONE.md).
# Martedi 07:00, a voti ufficiali pubblicati. Solo stagione live 2026-27.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
cd "/Users/vittorio/Desktop/Rebu AI/rebu-ai" || exit 1
npm run sync-stats -- --seasons 2026-27 >> .data/sync.log 2>&1
