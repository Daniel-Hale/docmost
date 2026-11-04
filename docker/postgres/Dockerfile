# Preserve the exact PostgreSQL binary/data format used by this deployment.
FROM postgres@sha256:3a4264520e121176619f54ff867d12774bc81e95e7b84db58d63bccdb6144b81
ARG PGVECTOR_VERSION=0.8.7-1.pgdg13+1
LABEL org.opencontainers.image.source="https://github.com/Daniel-Hale/docmost"
RUN printf '%s\n' '4944085dba4adcf0f65b8fb4e698c5ac353ecff890fdc89afe8007c2547b1469  /usr/lib/postgresql/18/bin/postgres' > /tmp/postgres.sha256 \
 && sha256sum --check /tmp/postgres.sha256 \
 && apt-get update \
 && apt-get install -y --no-install-recommends "postgresql-18-pgvector=${PGVECTOR_VERSION}" \
 && sha256sum --check /tmp/postgres.sha256 \
 && postgres --version \
 && rm -f /tmp/postgres.sha256 \
 && rm -rf /var/lib/apt/lists/*
ARG VCS_REF
LABEL org.opencontainers.image.revision=$VCS_REF
