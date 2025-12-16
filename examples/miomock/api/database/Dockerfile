FROM pgvector/pgvector:pg18

RUN apt-get update && \
    apt-get install -y wget && \
    wget -O /usr/share/keyrings/groonga-archive-keyring.gpg https://packages.groonga.org/debian/groonga-archive-keyring.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/groonga-archive-keyring.gpg] https://packages.groonga.org/debian bookworm main" > /etc/apt/sources.list.d/groonga.list && \
    apt-get update && \
    apt-get install -y postgresql-18-pgdg-pgroonga && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*