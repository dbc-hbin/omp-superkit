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

목표가 활성 상태일 때 한 단계가 실패했다고 모델이 전체 목표를 멈추거나 질문을 띄워 기다릴 수는 없습니다. 사용자가 그 동작을 요청했거나 외부 장애가 남은 작업 전체를 막는지 세션 모델이 확인합니다(모델 토큰 사용, 확인 창 없음). 계속할 일이 있으면 같은 근거로 `pause`와 `ask`를 번갈아 시도해도 다시 판정하지 않습니다. 새 사용자 지시나 새 결과에서 인용한 장애 근거가 있으면 다시 판정할 수 있습니다. 사용자가 전체 중지를 지시한 경우, 불필요한 질문을 거절해도 `pause`까지 막지는 않습니다. 사용자의 직접 goal 제어나 호스트 인터럽트는 바뀌지 않습니다.

### `/super`와 `/superstack`, 언제 쓰나요?

- `/super 중복 알림을 고치고 재시도 경로를 검증해`는 SUPER의 목표와 자동 이어가기 기능을 사용하되, 워크플로는 자동으로 선택하지 않습니다.
- `/superstack 재시도하면 왜 알림이 두 번 가? 수정하지 마.`는 조사 방법을 Superkit에 맡깁니다. 파일을 수정하지 않고 원인을 설명합니다. 이어서 `그럼 고치고, 재시도해도 알림이 한 번만 가는지 확인해.`라고 하면 `/superstack`을 다시 입력하지 않아도 수정과 검증을 요청할 수 있습니다.
- 여러 작업을 한 번에 맡기려면 Superstack 모드에서 `설정 화면에 옵션을 추가하고 좁은 화면에서도 확인해.`라고 해 보세요. 스킬 이름을 지정하지 않아도 구현과 화면 검증에 필요한 절차를 각각 선택합니다.

`/superstack`만 입력하면 작업을 시작하지 않고 모드만 켭니다. `/superstack <작업>`, 맨 앞의 `superstack <작업>`, OMP의 `/skill:superstack <작업>`으로 모드를 켜면서 작업을 요청할 수 있습니다. 모드는 현재 세션 브랜치의 후속 요청에 계속 적용되며, 대화가 압축되거나 해당 브랜치를 다시 열어도 유지됩니다. 새 세션이나 하위 작업자에게는 물려주지 않습니다. 끄려면 `off`만 인자로 전달하는 `/superstack off`를 사용하세요. SUPER를 끄거나 기존 목표의 일시정지 상태를 변경하지 않습니다.

[Superstack](skills/superstack/SKILL.md)은 명령 하나만 추가하며, 하위 명령을 따로 늘리지 않습니다. 기존 스킬을 사용하고 OMP 키워드를 추가하거나 명시적으로 요청한 워크플로를 다른 것으로 바꾸지 않습니다. 외부 봇·예약 작업·터널을 자동으로 설정하지 않으며, 모드를 켠다고 도구 설치·커밋·PR 생성·배포·비용 지출이 허용되는 것도 아닙니다.

## 워크플로와 스킬

| 명령 | 용도 | 기본 OMP 키워드 |
| --- | --- | --- |
| `/super` | 세션에서 SUPER 활성화 | — |
| `/superstack` | 현재 세션 브랜치의 요청에 맞는 워크플로 선택 | — |
| `/super-plan` | 구현 없이 검토된 계획 작성 | `ultrathink` |
| `/super-run` | 계획 실행과 진행 추적 | `orchestrate` |
| `/super-loop` | 목표·의존성·증거 추적 | `orchestrate` |
| `/super-graph` | 영속 의존성 그래프 실행 | `workflowz` |
| `/super-research` | 출처와 반론을 포함한 조사 | `workflowz` |

표의 명령은 앞의 `/` 없이도 사용할 수 있습니다. 정식 스킬 ID는 표의 명령 이름과 같습니다. 기존 호출과 공개 진입 경로는 호환용으로 유지합니다. CLI 플래그와 저장된 세션·목표·워크플로 데이터는 옮길 필요가 없습니다.

`/stop-continuation`은 계획이나 증거를 삭제하지 않고 현재 세션의 SUPER 자동 이어가기를 멈춥니다. `/resume-continuation`은 이어갈 수 있는 작업을 다시 허용합니다. 실행 중인 작업자를 취소하지는 않습니다. TUI에서는 이 세션의 기본 SUPER 호출(기존 별칭 포함)이 만든 네이티브 목표도 일시정지하고, 그때 멈춘 목표만 재개할 수 있습니다. OMP가 사용 중이라 목표를 멈추지 못했다는 안내가 나오면 자동 이어가기만 멈춘 상태입니다. 목표까지 멈추려면 현재 턴이 끝난 뒤 `/stop-continuation`을 다시 실행하세요. 다른 목표에는 손대지 않습니다. RPC 클라이언트는 네이티브 목표를 별도의 goal API로 제어합니다.

기본 키워드가 있는 명령은 이미 지정한 키워드가 없을 때 이를 추가하며, OMP의 키워드 설정과 도구 조건을 따릅니다. RPC에서는 `prompt`와 적절한 `streamingBehavior`를 사용합니다. 별도 `steer`·`follow_up` 요청은 키워드 처리를 건너뜁니다. `/skill:`로 직접 호출할 때는 설치된 스킬 ID를 사용합니다. 키워드를 사용하는 워크플로는 직접 호출이나 초기 CLI 텍스트가 입력 훅을 거치지 않을 때 키워드를 명시해야 합니다.

그 밖의 진입점:

- **코드·리뷰:** `/debugging`, `/programming`, `/review-work`, `/ast-grep`, `/lsp-setup`, `/refactor`
- **UI·평가:** `/frontend`, `/visual-qa`, `/visualize`, `/data-scientist`, `/eval-integrity`
- **브라우저·데스크톱:** `/web-browser`, `/ultimate-browsing`, `/computer-use`는 OMP의 native Eval API와 권한을 사용합니다. 기존 `/browser`·`/computer` 제어 명령은 유지합니다.
- **세션·메모리:** `/coding-agent-sessions`, `/init-deep`, `/reflection`, `/memory-advisor`

상세 지침은 [skills/](skills/)에서 확인합니다. 여러 제품의 세션 탐색에는 Python 3.11+가 필요하며, OMP 세션 기록과 요약은 네이티브 Eval `archive`로 확인합니다.

## 프롬프트와 코드모드

슈퍼킷이 자체 관리하는 모델 프리셋을 메인 세션과 지원되는 자식 세션에 각각 적용합니다. 전문 역할·프로젝트 지침·권한·완료 프로토콜은 보존합니다. 커스텀 템플릿과 미지원 모델은 native 동작을 유지합니다. 명시적인 조사·계획 전용 요청에서는 prewalk를 잠시 억제하고, 구현 요청으로 전환하면 이 확장이 소유한 override만 복원합니다.

Gemini는 기본 역할을 유지합니다. Eval이 있는 요청에서는 같은 도구가 직접 노출돼 있어도, 단건을 포함한 일반 브리지 호출에 Eval을 우선하도록 안내합니다. Eval이 없는 요청은 기존 호출 경로를 유지합니다. 커스텀 역할과 재개한 작업자의 지시는 보존하며 도구 정의를 숨기거나 복제하지 않습니다.

- JS가 기본입니다. Python 라이브러리·API나 기존 셀 상태가 필요하거나 JS를 쓸 수 없을 때 Python을 사용합니다. 등록 도구는 `await tool["name"](args)`로 호출하고, 마운트된 명령의 도움말은 `tool.bash`로 봅니다.
- 비동기 작업자는 `tool.task`로 시작합니다. 블로킹 작업자는 사용량 집계를 위해 `task`를 직접 호출합니다. Prewalk의 모델 전환, 승인·대기·세션 제어·첨부는 네이티브 경로를 따릅니다. 마운트된 `propose`, `resolve`, `reject`는 Eval이 아닌 바깥쪽 `bash`에서 실행합니다.
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

[GPT‑6.2 Astra/Sol](prompts/models/gpt-6.2.ts)을 포함한 모델별 템플릿은 [prompts/models/](prompts/models/)에서 직접 수정합니다. [모델 라우팅](prompts/models/model-routing.js)이 별칭을 판별하고, [presets.ts](presets.ts)가 OMP의 활성 도구와 세션에 맞춰 템플릿을 조합합니다. OMO·Senpi에서 프리셋을 가져오거나 다시 생성하지 않습니다.

```bash
bun test
bun run typecheck
bun run test:host
```

호스트 검증은 설치된 OMP를 격리된 상태와 로컬 응답기로 실행합니다. 통합·전송 경로를 확인하며, 외부 모델의 지침 준수까지 검증하지는 않습니다.

## 출처

프리셋 원본 출처와 [MIT 라이선스](prompts/models/LICENSE)는 [카탈로그](prompts/models/catalog.js)와 함께 보존합니다. 스킬 출처와 라이선스는 [Superstack 출처](skills/superstack/ATTRIBUTION.md)처럼 각 스킬의 attribution 파일에 기록합니다.
