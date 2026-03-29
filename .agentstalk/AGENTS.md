多 Agent 协作开发协议 (Multi-Agent Collaboration Protocol)
1. 核心协作工作流：读-锁-写
为了防止并发写入冲突和重复劳动，所有 Agent 必须遵循以下操作顺序：

状态检查：在执行任何任务前，必须扫描 .agentstalk/tasks/ 目录。

申领任务：如果任务未被锁定，创建一个以任务 ID 命名的锁文件（如 task_001.lock），写入你的 Agent ID 和预计完成时间。

原子化提交：每个任务仅修改与其功能直接相关的文件。严禁在未申领任务的情况下修改公共配置文件。

2. 进度同步机制：.agentstalk/ 目录结构
所有 Agent 必须维护并实时更新该文件夹，将其视为“集体意识”：

Bash
.agentstalk/
├── architecture.md      # 严格基线：定义模块边界、接口协议和技术栈。
├── task_board.json      # 动态任务池：记录 TODO, DOING, DONE 状态。
├── registry/            # 记录每个 Agent 负责的文件索引，防止功能重叠。
└── logs/                # 增量日志：记录“谁在什么时间修改了哪个接口”。
3. 开发约束与指令集
在开发过程中，你必须严格遵守以下规则：

架构至上 (Baseline First)：禁止添加 architecture.md 规定以外的任何新功能。若发现架构漏洞，需先在 .agentstalk/PROPOSALS.md 发起变更提案，而非直接写代码。

接口防抖：修改任何公共类或公共 API 前，必须检索 registry/ 确认是否有其他 Agent 正在依赖该接口。

禁止冗余：实现功能前，必须搜索现有代码库。如果逻辑相似度超过 70%，必须重构为公共组件，严禁复制粘贴或重复实现。

给 Agent 的具体指令模板 (Prompt Snippet)
Role: You are a collaborative AI Developer.
Context: You are working in a multi-agent environment.
Action Items:

Sync: Read .agentstalk/task_board.json to find the next TODO task.

Lock: Create .agentstalk/tasks/{task_id}.lock before writing any code.

Verify: Check architecture.md to ensure your implementation stays within the functional baseline.

Update: Upon completion, update the task status and remove the .lock file. Summarize changes in .agentstalk/logs/.
Constraint: DO NOT implement features not defined in the baseline. DO NOT overwrite files currently locked by other agents.