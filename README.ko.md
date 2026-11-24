# omp-superkit

[English](README.md) | 한국어 | [简体中文](README.zh-CN.md)

[Oh My Pi (OMP)](https://github.com/can1357/oh-my-pi)용 모델 프롬프트·코드모드·SUPER 워크플로 확장입니다. 도구·권한·실행은 OMP가 관리하고, 확장은 모델별 작업 방식과 계획·리서치·전문 스킬을 제공합니다.

## 시작하기

Git·Bun·OMP가 설치된 환경에서 실행합니다.

```bash
git clone --recurse-submodules https://github.com/dbc-hbin/omp-superkit.git
bun ./omp-superkit/upstream/materialize-frontend-refs.mjs
omp -e ./omp-superkit
```

대화형 TUI에서 `/super <작업>` 또는 `super <작업>`을 입력하면 SUPER가 활성화됩니다. 자동 이어가기가 멈춰 있지 않고 유지할 기존 목표가 없으면 OMP 네이티브 목표도 시작합니다. 일시정지·예산 제한 상태를 포함해 기존 목표는 유지합니다. RPC 클라이언트는 네이티브 목표를 별도로 생성해야 합니다.

명령은 입력 맨 앞에 놓습니다. `Explain /super` 같은 언급만으로는 활성화되지 않습니다. 기본 SUPER 명령은 전문 워크플로를 자동으로 선택하지 않으며, 전문 명령은 기본 네이티브 목표를 따로 시작하지 않습니다. 설치된 확장을 변경한 뒤에는 OMP를 재시작합니다.

## 워크플로와 스킬

| 명령 | 용도 | 기본 OMP 키워드 |
| --- | --- | --- |
| `/super` | 세션에서 SUPER 활성화 | — |
| `/super-plan` | 구현 없이 검토된 계획 작성 | `ultrathink` |
| `/super-run` | 계획 실행과 진행 추적 | `orchestrate` |
| `/super-loop` | 목표·의존성·증거 추적 | `orchestrate` |
| `/super-graph` | 영속 의존성 그래프 실행 | `workflowz` |
| `/super-research` | 출처와 반론을 포함한 조사 | `workflowz` |

표의 명령은 앞의 `/` 없이도 사용할 수 있습니다. 정식 스킬 ID는 표의 명령 이름과 같습니다. 기존 호출과 공개 진입 경로는 호환용으로 유지합니다. CLI 플래그와 저장된 세션·목표·워크플로 데이터는 옮길 필요가 없습니다.

`/stop-continuation`은 계획이나 증거를 삭제하지 않고 현재 세션의 SUPER 자동 이어가기를 멈춥니다. `/resume-continuation`은 이어갈 수 있는 작업을 다시 허용합니다. 실행 중인 작업자를 취소하지는 않습니다. TUI에서는 이 세션의 기본 SUPER 호출(기존 별칭 포함)이 만든 네이티브 목표도 일시정지하고, 그때 멈춘 목표만 재개할 수 있습니다. OMP가 사용 중이라 목표를 멈추지 못했다는 안내가 나오면 자동 이어가기만 멈춘 상태입니다. 목표까지 멈추려면 현재 턴이 끝난 뒤 `/stop-continuation`을 다시 실행하세요. 다른 목표에는 손대지 않습니다. RPC 클라이언트는 네이티브 목표를 별도의 goal API로 제어합니다.

전문 명령은 이미 지정한 키워드가 없을 때 기본 키워드를 추가하며, OMP의 키워드 설정과 도구 조건을 따릅니다. RPC에서는 `prompt`와 적절한 `streamingBehavior`를 사용합니다. 별도 `steer`·`follow_up` 요청은 키워드 처리를 건너뜁니다. `/skill:`로 직접 호출할 때는 설치된 스킬 ID를 사용합니다. 직접 호출이나 초기 CLI 텍스트가 입력 훅을 거치지 않으면 키워드를 명시해야 합니다.

그 밖의 진입점:

- **코드·리뷰:** `/debugging`, `/programming`, `/review-work`, `/ast-grep`, `/lsp-setup`, `/refactor`
- **UI·평가:** `/frontend`, `/visual-qa`, `/visualize`, `/data-scientist`, `/eval-integrity`
- **브라우저·데스크톱:** `/web-browser`, `/ultimate-browsing`, `/computer-use`는 OMP의 native Eval API와 권한을 사용합니다. 기존 `/browser`·`/computer` 제어 명령은 유지합니다.
- **세션·메모리:** `/coding-agent-sessions`, `/init-deep`, `/reflection`, `/memory-advisor`

상세 지침은 [skills/](skills/)에서 확인합니다. 여러 제품의 세션 탐색에는 Python 3.11+가 필요하며, OMP 세션 기록과 요약은 네이티브 Eval `archive`로 확인합니다.

## 프롬프트와 코드모드

슈퍼킷이 자체 관리하는 모델 프리셋을 메인 세션과 지원되는 자식 세션에 각각 적용합니다. 전문 역할·프로젝트 지침·권한·완료 프로토콜은 보존합니다. 커스텀 템플릿과 미지원 모델은 native 동작을 유지합니다. 명시적인 조사·계획 전용 요청에서는 prewalk를 잠시 억제하고, 구현 요청으로 전환하면 이 확장이 소유한 override만 복원합니다.

Gemini에는 슈퍼킷 프리셋이나 코드모드를 적용하지 않습니다. 다른 모델에는 해당 요청에서 Eval을 호출할 수 있을 때만, 사용 가능한 커널에 맞춰 안내합니다. 커스텀 역할과 재개한 작업자의 지시는 보존하며, 도구 없는 보조 요청에는 Eval 안내를 넣지 않습니다. 직접 노출할 도구와 필요할 때 조회할 도구는 OMP가 결정하며, 슈퍼킷은 도구 정의를 삭제하거나 복사하지 않습니다.

- `task`를 포함한 모든 브리지 호출은 `language="js"`가 기본입니다. Python 라이브러리·API나 기존 Python 셀의 상태가 필요할 때, 또는 JS 커널을 사용할 수 없을 때만 `language="py"`를 사용합니다.
- 등록된 도구는 `await tool["name"](args)`로, 일반 작업자는 `await tool.task(...)`로 호출합니다. OMP 19.1.1에서 Eval로 실행한 blocking 작업자는 결과를 반환하지만 사용량은 세션 합계에서 빠집니다. 세션 통계나 목표 예산에 포함해야 한다면 최상위 `task`를 사용하고, 제공되지 않으면 해당 blocking 작업자를 실행하지 않습니다. 마운트된 명령의 인자는 `await tool.bash({"command": "<name> --help"})`로 조회합니다.
- 승인·세션 제어·첨부 전달처럼 OMP가 최상위 호출의 결과를 받아야 하는 작업은 직접 호출합니다. `propose`, `resolve`, `reject`가 도구로 제공되면 그 도구를 직접 호출하고, 마운트된 명령이면 바깥쪽 `bash`로 실행합니다. 어느 경우에도 Eval 안에서 승인 결정을 실행하지 않습니다. 호스트 권한과 도구 선언은 그대로입니다.
- 독립적인 읽기·검색·조회는 병렬 실행할 수 있습니다. 변경·승인·대기·의존 호출은 순차 실행합니다.

**코드모드는 모델의 호출 방식을 유도하는 지침이며 샌드박스나 실행 보안 경계가 아닙니다.**

구현 위치: [모델 보정](presets.ts), [코드모드](code-mode.ts), [세션 통합](index.ts), [native 지침](host-guidance.ts).

## 업데이트와 테스트

저장소를 갱신한 뒤 고정된 서브모듈에서 frontend 참조를 다시 생성합니다.

```bash
git submodule update --init --recursive
bun upstream/materialize-frontend-refs.mjs
```

GitHub 소스 압축 파일에는 서브모듈과 생성 참조가 없습니다. Git 없이 배포할 때는 생성이 완료된 `skills/` 트리 전체를 복사합니다. 초기화와 upstream 갱신에는 네트워크가 필요하며, 참조 생성은 로컬에서 수행합니다.

모델별 템플릿은 [prompts/models/](prompts/models/)에서 직접 수정합니다. GPT‑6.2 Astra/Sol은 [prompts/gpt-6.2.ts](prompts/gpt-6.2.ts)를 사용합니다. [모델 라우팅](prompts/models/model-routing.js)이 별칭을 판별하고, [presets.ts](presets.ts)가 OMP의 활성 도구와 세션에 맞춰 템플릿을 조합합니다. OMO·Senpi에서 프리셋을 가져오거나 다시 생성하지 않습니다.

```bash
bun test
bun run typecheck
bun run test:host
```

호스트 검증은 설치된 OMP를 격리된 상태와 로컬 응답기로 실행합니다. 통합·전송 경로를 확인하며, 외부 모델의 지침 준수까지 검증하지는 않습니다.

## 변경 이력과 출처

[변경 이력](CHANGELOG.ko.md). 프리셋 원본 출처와 [MIT 라이선스](prompts/models/LICENSE)는 [카탈로그](prompts/models/catalog.js)와 함께 보존합니다. 스킬 출처와 라이선스는 각 스킬의 attribution 파일에 기록합니다.
