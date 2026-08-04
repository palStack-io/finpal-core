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
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/health || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
