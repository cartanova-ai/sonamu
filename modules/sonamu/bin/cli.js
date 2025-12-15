#!/usr/bin/env node

/**
 * 이 스크립트는 터미널 또는 기타 환경에서 pnpm sonamu 또는 sonamu 명령어를 호출하였을 때 실행되는 스크립트입니다.
 * 
 * sonamu 패키지 package.json의 bin 필드는 dist/bin/cli.js를 직접 가리키지 않습니다. 대신 이 스크립트를 가리킵니다.
 * 이는 개발 환경(TypeScript + pnpm workspace + clone 받으면 dist가 없음)에서 발생할 수 있는 문제를 해결하기 위함입니다. 
 * 
 * pnpm은 패키지 설치 시점에 bin 필드가 가리키는 파일이 존재하기를 요구합니다.
 * 가령 bin에 dist/bin/cli.js가 명시되어 있다면, sonamu를 install 하는 시점에 해당 파일을 pnpm이 찾아서 읽습니다.
 * 그런데 install 시점에 sonamu의 src는 있어도 dist는 없는 상황이 발생할 수 있습니다(주로 새로 clone 받아서 작업할 때).
 * 이 경우에는 pnpm이 install 시점에 해당 bin(=dist/bin/cli.js)을 처리하지 못 하여 sonamu 명령을 사용할 수 없는 상태가 됩니다.
 * 이렇게 된다면 sonamu를 빌드한 후에 다시 install을 해야 하는 불편함이 발생합니다.
 * 
 * 이를 해결하기 위해 dist 존재 유무와 무관하게 **항상** 존재하는 이 wrapper 스크립트를 추가하였습니다.
 * pnpm이 실행하는 실제 스크립트는 이 스크립트이며, 이 스크립트는 dist/bin/cli.js를 동적으로 찾아서 실행(eval)해줍니다.
 * 만약 sonamu가 아직 빌드되지 않은 상태에서 sonamu 명령을 사용하려 하면 아래와 같이 console.error를 출력하고 process.exit(1)을 호출합니다.
 * 
 * 이 스크립트를 실행시킬 때 넘어온 인자와 환경변수 등은 모두 dist/bin/cli.js에 그대로 전달됩니다.
 */
import('../dist/bin/cli.js').catch((e) => {
  console.error("Sonamu CLI를 실행하는 과정에 문제가 발생하였습니다. 보통은 dist/bin/cli.js 파일이 없는 경우입니다만, 아래 에러 메시지를 자세히 읽어보시면 힌트를 얻으실 수 있을 것입니다.");
  console.error("There was an error while executing Sonamu CLI. Usually it's because dist/bin/cli.js file is not found. Please read the error message below for more information.");
  console.error("=".repeat(80));
  console.error(e);

  process.exit(1);
});