# Modern CLI Tools 설정 가이드

기존 전통적인 CLI 도구들을 모던 대체제로 교체하고 설정하는 가이드입니다.

## 빠른 시작

```bash
npx tsx docs/modern-cli/setup.ts
source ~/.zshrc
```

이게 전부입니다! 스크립트가 알아서 설치와 설정을 진행합니다.

---

## 설치되는 도구들

| 기존 도구 | 모던 대체제 | 설명 |
|-----------|-------------|------|
| `find` | `fd` | 빠르고 직관적인 파일 검색 |
| `grep` | `rg` (ripgrep) | 초고속 텍스트 검색 |
| `cat` | `bat` | 구문 강조 + 라인 번호 |
| `ls` | `eza` | 아이콘 + Git 상태 표시 |
| `cd` | `z` (zoxide) | 자주 가는 디렉토리 자동 학습 |
| `rm` | `trash` | 휴지통으로 이동 (안전한 삭제) |
| `top` | `btop` | 화려한 시스템 모니터 |
| `man` | `tldr` | 간결한 사용 예시 |
| - | `fzf` | 퍼지 파인더 |
| - | `lazygit` | 터미널 Git UI |
| - | `delta` | Git diff 뷰어 |
| - | `jq` | JSON 프로세서 |
| - | `AltTab` | 윈도우 스타일 앱 스위처 |
| - | `Hack Nerd Font` | 아이콘 폰트 |

---

## 설치 후 설정

### 1. iTerm2 폰트 설정 (아이콘 표시용)

`eza`의 파일 아이콘이 깨져 보인다면 Nerd Font 설정이 필요합니다.

1. **iTerm2** → **Settings** (⌘+,)
2. **Profiles** → 사용 중인 프로필 선택
3. **Text** 탭
4. **Non-ASCII Font** 체크박스 활성화
5. Non-ASCII Font를 **Hack Nerd Font** 또는 **Hack Nerd Font Mono**로 선택

> 기본 Font는 그대로 두고 Non-ASCII Font만 변경하면 됩니다.

### 2. VSCode 터미널 폰트 설정 (선택사항)

VSCode 터미널에서도 아이콘을 보고 싶다면:

1. **Settings** (⌘+,)
2. `terminal.integrated.fontFamily` 검색
3. 값을 `'Hack Nerd Font Mono'`로 설정

또는 `settings.json`에 직접 추가:
```json
{
  "terminal.integrated.fontFamily": "'Hack Nerd Font Mono'"
}
```

### 3. Starship 프롬프트 사용 (선택사항)

기본적으로 **oh-my-zsh** 테마를 유지하도록 설정되어 있습니다.

만약 더 빠르고 모던한 **starship** 프롬프트를 사용하고 싶다면:

```bash
# ~/.config/zsh/modern-cli.zsh 파일을 열어서
# 아래 라인의 주석을 해제하세요:

eval "$(starship init zsh)"
```

그리고 `~/.zshrc`에서 oh-my-zsh 테마를 비활성화:
```bash
# ZSH_THEME="robbyrussell"  # 주석 처리
```

---

## 주요 명령어 사용법

### 파일 검색 (fd)
```bash
find .ts              # .ts로 끝나는 파일
find -t d node        # node가 포함된 디렉토리
find -e json          # .json 확장자 파일
```

### 텍스트 검색 (ripgrep)
```bash
grep "TODO"           # 현재 디렉토리에서 TODO 검색
grep -i "error" -g "*.log"  # .log 파일에서 대소문자 무시하고 검색
```

### 파일 보기 (bat)
```bash
cat file.ts           # 구문 강조된 파일 내용
cat -A file.ts        # 모든 문자 표시 (공백 등)
```

### 디렉토리 목록 (eza)
```bash
ls                    # 기본 목록
ll                    # 상세 목록 + Git 상태
la                    # 숨김 파일 포함
lt                    # 트리 뷰
```

### 디렉토리 이동 (zoxide)
```bash
cd                    # 홈 디렉토리로 이동 (원래 동작)
z projects            # 학습된 경로로 바로 점프
zi                    # fzf로 인터랙티브 선택
```

### 안전한 삭제 (trash)
```bash
rm file.txt           # 경고 출력 + 휴지통으로 이동
del file.txt          # 휴지통으로 이동 (경고 없음)
command rm file.txt   # 진짜 삭제 (주의!)
```

### Git UI (lazygit)
```bash
tig                   # lazygit 실행
```

### 명령어 도움말 (tldr)
```bash
help tar              # tar 사용 예시
help git-rebase       # git rebase 사용 예시
```

---

## Claude Code 연동

스크립트가 자동으로 `~/.claude/settings.json`에 모던 CLI 도구들을 허용 목록에 추가합니다.

추가되는 항목:
```
fd, rg, fzf, bat, eza, z, zi, zoxide, trash, btop, lazygit, delta, jq, tldr
```

---

## 문제 해결

### 아이콘이 깨져 보여요
→ iTerm2에서 Non-ASCII Font를 Nerd Font로 설정했는지 확인하세요.

### 프롬프트가 이상해요
→ starship과 oh-my-zsh가 충돌할 수 있습니다. `~/.config/zsh/modern-cli.zsh`에서 starship 라인이 주석 처리되어 있는지 확인하세요.

### 특정 도구가 동작하지 않아요
→ 새 터미널을 열거나 `source ~/.zshrc`를 실행하세요.

### 기존 명령어를 쓰고 싶어요
→ 백슬래시를 붙이면 원래 명령어를 사용할 수 있습니다:
```bash
\rm file.txt    # 진짜 rm
\cat file.txt   # 진짜 cat
\ls             # 진짜 ls
```

---

## 파일 구조

```
~/.config/zsh/modern-cli.zsh   # 모든 alias와 설정
~/.zshrc                       # source 라인만 추가됨
~/.claude/settings.json        # Claude Code 허용 도구 목록
```

스크립트를 다시 실행하면 `modern-cli.zsh`가 재생성됩니다.
