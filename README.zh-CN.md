# omp-superkit

[English](README.md) | [한국어](README.ko.md) | 简体中文

面向 [Oh My Pi (OMP)](https://github.com/can1357/oh-my-pi) 的模型提示词、代码模式和 SUPER 工作流扩展。工具、权限和执行仍由 OMP 管理；扩展适配模型的工作方式，并提供规划、研究及专业技能。

## 快速开始

安装 Git、Bun 和 OMP 后运行：

```bash
git clone --recurse-submodules https://github.com/dbc-hbin/omp-superkit.git
bun ./omp-superkit/upstream/materialize-frontend-refs.mjs
omp -e ./omp-superkit
```

在交互式 TUI 中输入 `/super <任务>` 或 `super <任务>`，即可启用 SUPER。自动续行未停止且没有需要保留的目标时，还会启动 OMP 原生目标。已有目标（包括暂停或达到预算限制的目标）保持不变。RPC 客户端须单独创建原生目标。

命令必须位于输入开头；`Explain /super` 等提及不会启用工作流。基础 SUPER 命令不会自动选择专用工作流，专用命令也不会另外启动基础原生目标。修改已安装的扩展后，请重启 OMP。

目标处于活动状态时，单个步骤失败并不意味着模型可以暂停整个目标或通过提问等待用户。只有用户明确要求该操作，或有证据表明外部障碍阻断了所有剩余工作，才允许中断。会话模型在不调用工具的情况下评估证据（消耗模型 token，不弹出确认框）。如果仍有工作可做，在相同证据下交替尝试 `pause` 和 `ask` 不会重复评估。新的用户指示或从新结果中引用的阻塞证据可以触发重新评估。如果用户明确要求停止整个目标，拒绝多余的提问并不会阻止 `pause`。用户直接控制目标和宿主中断的行为不变。

### 何时使用 `/super` 或 `/superstack`

- `/super 修复重复通知并验证重试路径` 使用 SUPER 的目标和自动续行机制，但不自动选择工作流。
- `/superstack 为什么重试时会发两次通知？先别改代码。` 把调查方法交给 Superkit，只解释原因，不修改文件。接着说 `现在修好它，并确认重试时只发一次通知。` 即可要求修复并验证，无需重复输入 `/superstack`。
- 需要组合多个步骤时，可在 Superstack 模式下说 `在设置页面加上这个选项，再用窄窗口确认显示效果。` 它会为实现和界面验证分别选择合适的流程，无需指定技能名称。

单独输入 `/superstack` 只开启模式，不启动任务。也可用 `/superstack <任务>`、位于输入开头的 `superstack <任务>` 或 OMP 的 `/skill:superstack <任务>` 开启模式并交代任务。模式会继续用于当前会话分支中的后续请求，压缩对话或恢复该分支后仍然有效；新会话和子任务不会继承它。要关闭，请输入 `/superstack off`，让 `off` 成为唯一参数。关闭此模式不会关闭 SUPER，也不会改变已有目标或其暂停状态。

[Superstack](skills/superstack/SKILL.md) 只新增一个命令，不引入一套子命令。它复用现有技能，不添加 OMP 关键词，也不会覆盖明确指定的工作流。它不会自动配置外部机器人、定时任务或隧道；启用模式不等于授权安装工具、提交代码、创建 PR、部署或产生费用。

## 工作流与技能

| 命令 | 用途 | 默认 OMP 关键词 |
| --- | --- | --- |
| `/super` | 为当前会话启用 SUPER | — |
| `/superstack` | 为当前会话分支的请求选择工作流 | — |
| `/super-plan` | 创建经过审查的计划，不进行实现 | `ultrathink` |
| `/super-run` | 执行并跟踪计划 | `orchestrate` |
| `/super-loop` | 跟踪目标、依赖和证据 | `orchestrate` |
| `/super-graph` | 执行持久化依赖图 | `workflowz` |
| `/super-research` | 开展有来源和反证的研究 | `workflowz` |

表中的命令可以省略开头的 `/`。正式技能 ID 与表中的命令名一致。旧调用方式和已发布的入口路径继续保留以兼容旧版本。CLI 标志和已保存的会话、目标及工作流数据无需迁移。

`/stop-continuation` 暂停当前会话的 SUPER 自动续行，不删除计划或证据。`/resume-continuation` 重新允许符合条件的工作继续。这两个命令不会取消正在运行的子任务。在 TUI 中，它们还可以暂停当前会话通过基础 SUPER 命令（包括旧别名）创建的原生目标，但只会恢复由该命令暂停的同一目标，不会接管其他目标。如果 OMP 提示原生目标正忙，则仅停止了 SUPER 自动续行；要暂停该目标，请在当前回合结束后再次运行 `/stop-continuation`。RPC 客户端须通过 goal API 单独控制原生目标。

有默认关键词的命令会在尚未指定关键词时添加默认值，并遵守 OMP 的关键词设置与工具要求。RPC 请使用带相应 `streamingBehavior` 的 `prompt`；独立的 `steer` 和 `follow_up` 请求会跳过关键词处理。通过 `/skill:` 直接调用时仍使用已安装的技能 ID。对于使用关键词的工作流，如果直接调用或初始 CLI 文本绕过了输入钩子，请显式指定关键词。

其他入口：

- **代码与审查：** `/debugging`、`/programming`、`/review-work`、`/ast-grep`、`/lsp-setup`、`/refactor`
- **UI 与评估：** `/frontend`、`/visual-qa`、`/visualize`、`/data-scientist`、`/eval-integrity`
- **浏览器与桌面：** `/web-browser`、`/ultimate-browsing`、`/computer-use` 使用 OMP 的原生 Eval API 和权限；OMP 自带的 `/browser`、`/computer` 控制保持不变。
- **会话与记忆：** `/coding-agent-sessions`、`/init-deep`、`/reflection`、`/memory-advisor`

详细说明见 [skills/](skills/)。跨产品会话发现需要 Python 3.11+；OMP 会话历史和摘要使用原生 Eval `archive` 查看。

## 提示词与代码模式

受支持的模型提示词会适配到 OMP，并分别应用于主会话和受支持的子会话。专业角色、项目指令、权限与完成协议保持不变。自定义模板和不受支持的模型保留原生行为。明确的调查或仅规划请求会暂时抑制 prewalk；转入实现时，只恢复本扩展拥有的 override。

Gemini 保留原生角色。请求提供 Eval 时，即使同一工具可直接调用，Superkit 也引导模型优先通过 Eval 执行普通桥接调用，包括单次调用。没有 Eval 的请求保留原有路径。自定义角色与恢复的子任务保留原有指令。Superkit 不隐藏工具声明，也不复制参数定义。

- 默认使用 JavaScript。需要 Python 库、API、已有内核状态，或 JS 不可用时，使用 Python。通过 `await tool["name"](args)` 调用工具，通过 `tool.bash` 查询挂载命令的帮助。
- 通过 `tool.task` 启动异步子任务。阻塞式子任务直接调用 `task`，以保留用量统计。Prewalk 模型切换、审批、等待、会话控制和附件交付沿用原生路径。挂载的 `propose`、`resolve`、`reject` 通过外层 `bash` 调用，不在 Eval 内执行。
- 独立的读取、搜索和查询可并行执行；修改、审批、等待和有依赖的调用顺序执行。

**代码模式是面向模型的调用指引，不是沙箱，也不是执行安全边界。**

实现位置：[模型适配](presets.ts)、[代码模式](code-mode.ts)、[会话集成](index.ts)、[原生指令](host-guidance.ts)。

## 更新与测试

更新仓库后，从固定版本的子模块重新生成前端参考：

```bash
git submodule update --init --recursive
bun upstream/materialize-frontend-refs.mjs
```

GitHub 源码压缩包不包含子模块和生成的参考文件。无需 Git 的部署应复制生成后的完整 `skills/` 目录。初始化和上游更新需要网络；参考生成在本地完成。

所有模型模板（包括 [GPT‑6.2 Astra/Sol](prompts/models/gpt-6.2.ts)）都在 [prompts/models/](prompts/models/) 中直接编辑。[模型路由](prompts/models/model-routing.js) 识别模型别名，[presets.ts](presets.ts) 根据 OMP 的活动工具和会话组合提示。预设不再从 OMO 或 Senpi 下载或生成。

```bash
bun test
bun run typecheck
bun run test:host
```

宿主检查在隔离状态下使用已安装的 OMP 和脚本化本地 provider，验证集成与传输路径，而非外部模型是否遵循指令。

## 来源

预设的原始来源和 [MIT 许可证](prompts/models/LICENSE) 随[目录](prompts/models/catalog.js)保留。技能的来源和许可证记录在各自的 attribution 文件中，例如 [Superstack 的来源说明](skills/superstack/ATTRIBUTION.md)。
