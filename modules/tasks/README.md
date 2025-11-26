# Sonamu Task Queue

## Q&A

1. 패키지 설치 중에 에러가 납니다.
   - `@sonamu-kit/tasks`는 성능 상의 이슈로 인해 optional dependency로 `pg-native` 패키지를 사용합니다.
   - [`pg-native` 문서](https://github.com/brianc/node-postgres/tree/master/packages/pg-native#install)에서는 설치 전 필요한 작업에 대해 안내해주고 있습니다.
