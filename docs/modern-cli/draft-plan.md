# Modern CLI Tools Setup Plan

## 목표

기존 전통적인 CLI 도구들을 모던 대체제로 교체하고, 일관된 alias 설정을 통해 자연스럽게 사용할 수 있도록 설정

## 현재 환경 파악 필요사항

### 1. 쉘 환경 확인

```bash
echo $SHELL
# 예상: /bin/zsh 또는 /bin/bash
```

### 2. 설정 파일 위치

- Zsh: `~/.zshrc`
- Bash: `~/.bashrc` 또는 `~/.bash_profile`
- 추가 확인: `~/.config/` 하위에 별도 설정 파일 존재 여부

### 3. 기존 도구 설치 여부 확인

```bash
# 각 도구가 이미 설치되어 있는지 확인
which fd
which rg
which fzf
which bat
which eza
which zoxide
which trash
which starship
which btop
which lazygit
which delta
which jq
which tldr
```

## 설치 플랜

### Phase 1: 도구 설치

#### Homebrew를 통한 일괄 설치

```bash
brew install \
  fd \
  ripgrep \
  fzf \
  bat \
  eza \
  zoxide \
  trash-cli \
  starship \
  btop \
  lazygit \
  git-delta \
  jq \
  tldr
```

#### 설치 후 확인

각 도구의 버전 확인으로 정상 설치 검증

### Phase 2: Alias 설정

#### ~/.zshrc (또는 ~/.bashrc)에 추가할 내용

```bash
# ============================================
# Modern CLI Tools Aliases
# ============================================

# fd: find의 모던 대체제
alias find='fd'

# rg (ripgrep): grep의 모던 대체제
alias grep='rg'

# bat: cat의 모던 대체제
alias cat='bat'
alias less='bat'  # bat이 자동 페이징 지원

# eza: ls의 모던 대체제
alias ls='eza'
alias ll='eza -l --git'
alias la='eza -la --git'
alias lt='eza -T'  # tree view
alias l='eza -lah --git'

# trash: rm의 안전한 대체제
alias rm='echo "Use trash instead of rm. Use \\rm for actual rm"; false'
alias del='trash'

# zoxide: cd의 스마트 대체제
# Note: zoxide는 eval로 초기화 필요 (아래 별도 섹션)
alias cd='z'
alias cdi='zi'  # interactive cd with fzf

# Git related
alias tig='lazygit'
alias gdiff='delta'  # git diff with delta

# Others
alias top='btop'
alias help='tldr'
alias man='tldr'  # tldr 우선, 실제 man은 command man으로
```

### Phase 3: 특수 초기화 설정

#### fzf 설정

```bash
# fzf 키 바인딩 및 자동완성
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh

# fzf 기본 옵션
export FZF_DEFAULT_OPTS='
  --height 40%
  --layout=reverse
  --border
  --inline-info
  --preview-window=:hidden
  --preview "([[ -f {} ]] && (bat --style=numbers --color=always {} || cat {})) || ([[ -d {} ]] && (tree -C {} | less)) || echo {} 2> /dev/null | head -200"
  --bind "?:toggle-preview"
'

# fzf에서 fd 사용하도록 설정
export FZF_DEFAULT_COMMAND='fd --type f --hidden --follow --exclude .git'
export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
export FZF_ALT_C_COMMAND='fd --type d --hidden --follow --exclude .git'
```

#### zoxide 설정

```bash
# zoxide 초기화 (반드시 필요)
eval "$(zoxide init zsh)"  # zsh인 경우
# eval "$(zoxide init bash)"  # bash인 경우
```

#### starship 설정

```bash
# starship 프롬프트 초기화
eval "$(starship init zsh)"  # zsh인 경우
# eval "$(starship init bash)"  # bash인 경우
```

#### bat 설정

```bash
# bat 테마 설정 (선택사항)
export BAT_THEME="gruvbox-dark"  # 또는 다른 선호 테마

# bat 스타일 설정
export BAT_STYLE="numbers,changes,header"
```

#### eza 설정 (추가 옵션)

```bash
# eza 아이콘 표시 (Nerd Font 필요)
export EZA_ICONS_AUTO='1'
```

## Phase 4: 설정 파일 구조화

### 권장 구조

```
~/.config/
├── zsh/
│   ├── aliases.zsh        # 모든 alias 정의
│   ├── exports.zsh        # 환경변수
│   └── functions.zsh      # 커스텀 함수
├── starship.toml          # starship 설정
└── bat/
    └── config             # bat 설정
```

### ~/.zshrc 메인 파일

```bash
# Source modular config files
[ -f ~/.config/zsh/exports.zsh ] && source ~/.config/zsh/exports.zsh
[ -f ~/.config/zsh/aliases.zsh ] && source ~/.config/zsh/aliases.zsh
[ -f ~/.config/zsh/functions.zsh ] && source ~/.config/zsh/functions.zsh

# Tool initializations
eval "$(starship init zsh)"
eval "$(zoxide init zsh)"
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
```

## Phase 5: 검증 및 테스트

### 1. 설정 리로드

```bash
source ~/.zshrc
# 또는
exec zsh  # 새 쉘 시작
```

### 2. 각 alias 테스트

```bash
# 기본 동작 확인
ls
cat README.md
grep "test"
find . -name "*.ts"

# 새 기능 확인
z ~/projects  # zoxide
jj  # zoxide interactive (zi)
ll  # eza long format
```

### 3. 문제 해결 체크리스트

- [ ] Nerd Font 설치 확인 (eza, starship 아이콘용)
- [ ] fzf 키 바인딩 동작 확인 (Ctrl+T, Ctrl+R, Alt+C)
- [ ] bat 테마 확인 (`bat --list-themes`)
- [ ] zoxide 학습 시작 (자주 가는 디렉토리 방문)

## 추가 고려사항

### 1. AltTab CLI (macOS 전용)

```bash
# AltTab 설치
brew install --cask alt-tab

# Alias 추가 (선택사항)
alias alttab='/Applications/AltTab.app/Contents/MacOS/AltTab'
alias winlist='alttab --list'
alias windetail='alttab --detailed-list'
```

### 2. 기존 rm 습관 전환

```bash
# 초기에는 rm 대신 trash 사용 강제
# 정말 rm이 필요할 때는 \rm 사용
# 예: \rm -rf node_modules
```

### 3. 성능 최적화

```bash
# zsh 시작 시간 측정
time zsh -i -c exit

# 느리다면 lazy loading 고려
# zsh-defer 또는 zinit 같은 플러그인 매니저 사용
```

## Starship 기본 설정 (선택사항)

### ~/.config/starship.toml

```toml
# 간단한 한 줄 프롬프트
add_newline = false

[line_break]
disabled = true

# Git 상태
[git_status]
conflicted = "⚔️ "
ahead = "🏎️ 💨 ×${count}"
behind = "🐢 ×${count}"
diverged = "🔱 🏎️ 💨 ×${ahead_count} 🐢 ×${behind_count}"
untracked = "🛤️  ×${count}"
stashed = "📦 "
modified = "📝 ×${count}"
staged = "🗃️  ×${count}"
renamed = "📛 ×${count}"
deleted = "🗑️  ×${count}"

# 명령 실행 시간 표시
[cmd_duration]
min_time = 500
format = "took [$duration](bold yellow) "

# 디렉토리 경로
[directory]
truncation_length = 3
truncate_to_repo = true
```

## 참고 링크

- fd: https://github.com/sharkdp/fd
- ripgrep: https://github.com/BurntSushi/ripgrep
- fzf: https://github.com/junegunn/fzf
- bat: https://github.com/sharkdp/bat
- eza: https://github.com/eza-community/eza
- zoxide: https://github.com/ajeetdsouza/zoxide
- trash-cli: https://github.com/andreafrancia/trash-cli
- starship: https://starship.rs
- lazygit: https://github.com/jesseduffield/lazygit
- delta: https://github.com/dandavison/delta

## 작업 순서 요약

1. ✅ 현재 환경 파악 (쉘, 기존 설치)
2. ✅ Homebrew로 일괄 설치
3. ✅ ~/.config/zsh/ 구조 생성
4. ✅ aliases.zsh, exports.zsh 작성
5. ✅ ~/.zshrc에 source 추가
6. ✅ 초기화 스크립트 추가 (starship, zoxide, fzf)
7. ✅ 설정 리로드 및 테스트
8. ✅ Nerd Font 설치 (필요시)
9. ✅ starship.toml 커스터마이징 (선택)
10. ✅ 사용하며 미세 조정

---

**Note**: 이 문서를 Claude Code에게 전달하여 자동화된 설치 스크립트 작성을 요청하세요.
