# Docker 이미지 빌드 및 배포 가이드

이 문서에서는 Docker 이미지를 빌드하고, ECR Public 레지스트리에 배포하는 방법을 안내합니다.

## 사전 준비

- **AWS 퍼블릭 ECR에 이미지를 배포하기 전에 반드시 [`aws configure`](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-quickstart.html) 명령어로 AWS IAM Access Key와 Secret Key를 등록해 두셔야 합니다.**
- 적절한 권한(IAM 권한: ECR Public push 권한)이 부여되어 있는지 확인하세요.

## 1. Docker 빌더 초기 설정 (최초 1회 필요)

Docker의 멀티 아키텍처 이미지를 빌드하려면 buildx 빌더를 한 번만 생성하면 됩니다.

```bash
# 빌더가 존재하지 않는 경우 새로 생성
docker buildx create --use
```

기존에 빌더를 만들었다면 이 단계는 생략해도 됩니다.

## 2. Docker 이미지 배포

아래 명령어로 스크립트를 실행하면, 이미지가 빌드되어 퍼블릭 레지스트리에 업로드됩니다.

```bash
mise run publish:image
```

스크립트는 `package.json`의 버전을 읽어서, 동일한 버전 태그가 레지스트리에 이미 배포되어 있으면 건너뜁니다. 만약 신규 버전이라면 멀티 아키텍처(amd64/arm64)로 빌드 후 배포합니다.

## 3. 참고 사항

- 퍼블리시 스크립트(예: `scripts/publish-image.ts`)에서 ECR Public 레지스트리 로그인, 태그 관리가 자동으로 처리됩니다.
- 이미지가 성공적으로 배포되면, 지정된 레지스트리(`public.ecr.aws/m9z8n2p9/cartanova/sonamu-postgres:<버전>`)에서 pull 할 수 있습니다.
