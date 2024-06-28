---
title: Error
description: Error
---

# Error

Sonamu 사용 중 발생할 수 있는 주요 오류와 그에 대한 설명을 제공합니다.

#### TypeError: Cannot read properties of undefined (reading 'partial')

이 오류는 git 브랜치를 변경했을 때 발생할 수 있습니다. `dist` 디렉토리를 삭제하고 다시 빌드하면 해결됩니다.

```bash
rm -rf dist
yarn build
```

#### mysqldump: Got error: 2002: Can't connect to local MySQL server through socket '/tmp/mysql.sock' (2) when trying to connect

DB HOST를 `localhost`로 기재할 경우 `mysqldump` 명령어가 동작하지 않습니다. `0.0.0.0`으로 변경하여 사용하시기 바랍니다.
(외부 네트워크로부터 패킷을 받을 수 없어서?)

#### Error: typeNode undefined

이 오류는 Sonamu가 AST를 사용하여 메서드의 파라미터와 반환값의 타입을 분석할 때 발생합니다. 메서드 파라미터에 기본값이 지정되어 있는지 확인하고, 있을 경우 제거하거나 타입을 정확하게 작성하세요.
