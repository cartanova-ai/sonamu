# @sonamu-kit/hmr-runner

> 이 문서는 사람이 썼습니다.

`@hot-hook/runner`([NPM](https://www.npmjs.com/package/@hot-hook/runner), [GitHub](https://github.com/Julien-R44/hot-hook/tree/main/packages/runner))를 fork하여 뜯어고친 패키지입니다.

## 얘가 하는 일

> 이 친구는 `hmr-hook`과 함께 사용될 것을 염두에 두고 만들어졌습니다.

프로세스 매니저입니다. `nodemon`과 비슷한 runner입니다.

그런데 `hmr-hook`과의 사용에 특화되어 있습니다. `hmr-hook`이 *이건 HMR 못하겠다*라고 할 때 이를 듣고서 앱을 재시작해줍니다.

이런 식으로 씁니다:

```bash
hmr-runner --node-args=--import=@sonamu-kit/hmr-hook/register index.js
```

`hmr-hook`은 내부적으로 HMR을 처리하다가, 스스로 판단하기에 HMR이 불가능한 모듈이 변경되었음을 감지하면 `process.send`로 이를 알립니다. 그러나 알리는 것 까지만 하지, 얘가 알아서 프로세스를 재시작해주지는 못합니다.

그래서 누군가는 애플리케이션 바깥에서 돌아가면서 `hmr-hook`이 보내는 메시지를 받아다가 재시작을 처리해주어야 합니다. 걔가 바로 이 `hmr-runner`입니다.

## Fork해서 뜯어고친 부분

### 1. `SIGUSR2`에 반응하게 함

원본은 애플리케이션이 보내는 `SIGUSR2`에 반응하지 않습니다.

이에 반응하여 재시작하도록 바꾸었습니다.
