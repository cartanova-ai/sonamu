---
title: 파일 동기화 작업
description: 파일 동기화 작업 레퍼런스 문서
tableOfContents:
  minHeadingLevel: 4
  maxHeadingLevel: 4
---

Sonamu는 파일의 변경을 추적하여 동기화 작업을 수행합니다.

변경을 확인하는 파일은 다음과 같습니다.

- **엔티티 파일**: `/src/application/**/*.entity.json`
- **타입 파일**: `/src/application/**/*.types.ts`
- **공유함수 파일**: `/src/application/**/*.functions.ts`
- **Sonamu 생성 파일**: `/src/application/sonamu.generated.ts`
- **모델 파일**(컴파일결과): `/dist/application/**/*.model.js`

서버를 시작하면 위 경로에 해당하는 파일에 대한 해시값을 `.so-checksum` 파일에 저장합니다. 이후에 서버가 재시작되면 현재 파일 상태로 계산한 해시값과 `.so-checksum`에 저장된 해시값을 비교하여 변경된 파일을 확인합니다.

파일 종류별로 실행하는 작업은 다음과 같습니다.

- **엔티티, 타입 파일**: 스키마 생성
- **타입, 공유함수, Sonamu 생성 파일**: 파일 싱크
- **모델 파일**: 프론트엔드 서비스 코드, REST Client 파일 생성

<br/>

---

#### 스키마 생성

엔티티 파일 혹은 타입 파일에 변경이 발생할 경우, `sonamu.generated` 파일과 `sonamu.generated_sso` 파일을 생성합니다.
`sonamu.generated` 파일은 프론트엔드와 백엔드 양쪽에서 사용하고, `sonamu.generated_sso` 파일은 백엔드만 사용합니다.

`sonamu.generated`는 `.entity.json`의 엔티티 정의를 기반으로 `BaseSchema`, `BaseListParams`, `Subsets`, `Enum`의 Zod 스키마와 타입을 생성합니다. 엔티티 정의에서 `.types.ts`의 사용자 정의 타입을 참조하는 경우, `sonamu.generated`에서 그대로 참조하게 되면 순환참조가 발생하므로 해당 타입을 읽어서 인라인으로 처리합니다.

`sonamu.generated_sso`는 엔티티 정의 파일(`.entity.json`)을 기반으로 `SubsetQueries`의 Zod 스키마와 타입을 생성합니다. (`sso`: server-side only)

| 이름             | 설명                                                           |
| ---------------- | -------------------------------------------------------------- |
| `BaseSchema`     | 엔티티 정의와 일치하는 타입                                    |
| `BaseListParams` | 페이지네이션, 검색 등 리스트 조회 시 필요한 기본 파라미터 타입 |
| `Subsets`        | Sonamu UI를 통해 생성된 서브셋 타입                            |
| `Enum`           | Sonamu UI를 통해 생성된 Zod Enum                               |
| `SubsetQueries`  | DB 쿼리 빌딩 시 사용하는 타입으로, 서버에서만 사용             |

<br/>

---

#### 파일 싱크

백엔드에서 타입 파일, 공유함수 파일 혹은 Sonamu 생성 파일이 변경될 때마다 해당 파일을 프론트엔드로 복사합니다. 이러한 파일의 경로는 다음과 같습니다.

- `/src/application/${entityId}/${entityId}.types.ts`
- `/src/application/${entityId}/${entityId}.functions.ts`
- `/src/application/sonamu.generated.ts`

프론트엔드로 복사되는 과정에서는 `application` 디렉터리가 `services`로 변경됩니다.

- `/src/services/${entityId}/${entityId}.types.ts`
- `/src/services/${entityId}/${entityId}.functions.ts`
- `/src/services/sonamu.generated.ts`

<br/>

---

#### 프론트엔드 서비스 코드 생성

모델 파일의 API 정보를 사용하여 프론트엔드에서 사용할 서비스 코드를 생성합니다.

> 컨벤션 파일 경로: `/src/services/${entityId}/${entityId}.service.ts`

클라이언트의 종류에 따라 다른 코드가 생성됩니다. 기본적으로 서비스의 메소드명은 API 핸들러 메소드명과 일치하지만, `resourceName`을 따로 기재한 경우에는 클라이언트 종류별로 네이밍이 적용됩니다. 자세한 사항은 [API 데코레이터 - 데코레이터 옵션](/reference/api-decorator/#데코레이터-옵션) 부분을 참고해주세요.

:::note
백엔드에서 복사된 코드를 프론트엔드에서 사용하기 위해서는 추가적인 함수나 클래스, 타입 등이 필요합니다. 이렇게 프론트엔드에서만 사용하는 코드를 `sonamu.shared.ts`라는 파일에서 관리합니다. 해당 파일은 백엔드 서버가 시작할 때 프론트엔드의 `/src/services` 경로 아래에 복사됩니다.
:::

<br/>

---

#### REST Client 파일 생성

Sonamu에 등록된 API 정보를 사용하여 VSCode Extension인 [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) 요청을 생성합니다. Sonamu는 메소드에 명시된 타입을 참고하여 요청에 임시 데이터를 추가합니다. `GET` 요청일 경우 **querystring**을, `POST` 요청일 경우 **body**를 생성합니다.
