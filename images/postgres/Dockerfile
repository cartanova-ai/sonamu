FROM pgvector/pgvector:pg18

# PGroonga + TokenMecab 설치
RUN apt-get update && \
    apt-get install -y wget && \
    wget -O /usr/share/keyrings/groonga-archive-keyring.gpg https://packages.groonga.org/debian/groonga-archive-keyring.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/groonga-archive-keyring.gpg] https://packages.groonga.org/debian bookworm main" > /etc/apt/sources.list.d/groonga.list && \
    apt-get update && \
    apt-get install -y postgresql-18-pgdg-pgroonga groonga-tokenizer-mecab && \
    apt-get install -y mecab libmecab-dev build-essential curl && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# MeCab-ko-dic 설치
RUN cd /tmp && \
    curl -LO https://bitbucket.org/eunjeon/mecab-ko-dic/downloads/mecab-ko-dic-2.1.1-20180720.tar.gz && \
    tar xzf mecab-ko-dic-2.1.1-20180720.tar.gz && \
    cd mecab-ko-dic-2.1.1-20180720 && \
    ./configure && make && make install && \
    rm -rf /tmp/mecab-ko-dic*

# 한국어 사전 경로 설정
# lib 폴더의 실제 아키텍처명은 uname -m을 쓰는게 더 명확할 수도 있음
RUN echo "dicdir = /usr/lib/$(dpkg-architecture --query DEB_BUILD_GNU_TYPE)/mecab/dic/mecab-ko-dic" > /etc/mecabrc

# 버전 라벨링 (Sonamu 버전과 동일하게 설정)
LABEL version="0.7.0"
