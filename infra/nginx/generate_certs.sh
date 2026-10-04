#!/usr/bin/env bash
set -euo pipefail

CERT_DIR="$(dirname "$0")/certs"
mkdir -p "$CERT_DIR"

if [ ! -f "$CERT_DIR/server.key" ]; then
    echo "🔐 Generating 4096-bit RSA TLS Private Key and Self-Signed Certificate..."
    openssl req -x509 -nodes -days 3650 -newkey rsa:4096 \
        -keyout "$CERT_DIR/server.key" \
        -out "$CERT_DIR/server.crt" \
        -subj "/C=IN/ST=Maharashtra/L=Pune/O=RescueNet Control Room/CN=rescuenet.local"
    chmod 600 "$CERT_DIR/server.key"
    chmod 644 "$CERT_DIR/server.crt"
    echo "✓ TLS certificates generated in $CERT_DIR"
else
    echo "✓ TLS certificates already present in $CERT_DIR"
fi
