FROM alpine:3.19

# PostgreSQL 15 client (matches server version)
RUN apk add --no-cache bash curl gzip tar unzip postgresql15-client ca-certificates

# supercronic — cron designed for containers; inherits Docker env vars correctly
ENV SUPERCRONIC_VERSION=v0.2.29
RUN ARCH="$(uname -m)" && \
    case "$ARCH" in \
      x86_64)  SC_ARCH=amd64 ;; \
      aarch64) SC_ARCH=arm64 ;; \
      *)        SC_ARCH=amd64 ;; \
    esac && \
    curl -fsSL "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-${SC_ARCH}" \
      -o /usr/local/bin/supercronic && \
    chmod +x /usr/local/bin/supercronic

# rclone — remote sync (configured entirely via RCLONE_CONFIG_* env vars, no config file needed)
ENV RCLONE_VERSION=v1.73.3
RUN ARCH="$(uname -m)" && \
    case "$ARCH" in \
      x86_64)  RCLONE_ARCH=amd64 ;; \
      aarch64) RCLONE_ARCH=arm64 ;; \
      *)        RCLONE_ARCH=amd64 ;; \
    esac && \
    mkdir -p /tmp/rclone && \
    curl -fsSL "https://github.com/rclone/rclone/releases/download/${RCLONE_VERSION}/rclone-${RCLONE_VERSION}-linux-${RCLONE_ARCH}.zip" \
      -o /tmp/rclone/rclone.zip && \
    unzip -j /tmp/rclone/rclone.zip "*/rclone" -d /usr/local/bin/ && \
    rm -rf /tmp/rclone && \
    chmod +x /usr/local/bin/rclone

COPY backup/entrypoint.sh  /scripts/entrypoint.sh
COPY backup/backup-pg.sh   /scripts/backup-pg.sh
RUN chmod +x /scripts/*.sh

VOLUME ["/backups"]

ENTRYPOINT ["/scripts/entrypoint.sh"]
