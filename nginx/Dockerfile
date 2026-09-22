FROM nginx:1.25-alpine

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# CORS allowlist included by the $cors_origin map. Shipped with localhost-only
# defaults; regenerated from CORS_ALLOWED_ORIGINS at container start. The file
# must exist at build time or nginx refuses to start on the missing include.
COPY cors_allowlist.conf /etc/nginx/cors_allowlist.conf
COPY 20-cors-allowlist.sh /docker-entrypoint.d/20-cors-allowlist.sh
RUN chmod +x /docker-entrypoint.d/20-cors-allowlist.sh

# Remove default nginx config
RUN rm -f /etc/nginx/conf.d/default.conf.bak

# Add healthcheck
#
# *** 127.0.0.1, NOT localhost, AND THIS IS NOT COSMETIC (D-285). ***
# Every container built from this image reported `unhealthy` for its whole
# life while serving every real request correctly. The container's /etc/hosts
# maps `localhost` to BOTH 127.0.0.1 and ::1, busybox wget tries the IPv6
# entry first, and this image's `listen 80;` binds 0.0.0.0:80 — IPv4 only. So
# the probe gets `Connection refused` from a healthy server.
#
# Measured inside three running containers: `wget http://127.0.0.1/health`
# OK, `wget http://localhost/health` refused, in all three. `docker ps` showed
# `finpal-llm-demo-nginx Up About an hour (unhealthy)` — the public demo had
# been in that state indefinitely and nobody had read the health column.
#
# Why it matters: a `depends_on: condition: service_healthy` naming this
# container can NEVER be satisfied, so anything ordered behind nginx deadlocks
# instead of starting. And it destroys the signal — a container that is always
# unhealthy cannot report becoming genuinely unhealthy.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1/health || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
