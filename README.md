# dsh-bm-contract

把 Basic Memory 知识库的相关笔记召回进 DSH 会话，并附带一个手动触发的写作规范 skill。

## 它做什么

- **召回（每条真人消息一次）**：用消息原文调 `bm_search`（hybrid），取相似度 ≥ 0.5
  的前 2 条，渲染成一个 markdown 块，通过 `systemPrompt.context` 注入。同一条笔记在一个
  会话里只出现一次；没有命中就整块消失；工具失败时静默跳过，连续 3 次失败后本会话熔断。
- **档位**：第 1 条且相似度 ≥ 0.8 标 `必读`（模型应先 `bm_read` 读全文再回答）；其余标
  `参考`（摘要够用就别读）。
- **写作规范**：内置 `skills/dsh-bm-contract-notes/SKILL.md`，在 `apply()` 里注册成
  runtime skill，`modelInvocable: false`。模型在目录里看不到它，只有你在聊天里输入
  `/dsh-bm-contract-notes` 才会加载。

注入块长这样（N 条，按相似度排序）：

```markdown
## 知识库相关笔记（2 条，按相似度排序）

1. **Gmail MCP 凭据配置** — `main/reference/computer/gmail-mcp-config` [0.86 必读]
   OAuth 客户端须建 Desktop 类型，redirect URI 固定为 http://localhost:8765/oauth/callback。
2. **Basic Memory 部署** — `main/projects/basic-memory/deploy` [0.66 参考]
   systemd unit 用 uv run 启动，端口 8765。

必读 = 先用 bm_read 读全文再回答；参考 = 摘要够用就别读；不要复述本块。
```

## 安装

在 profile 的 patch 里加一行：

```yaml
- insert:
    - id: bm-contract
      name: dsh-bm-contract
      config:
        project: main
```

前提：会话里有 `mcp__basic-memory__bm_search`（basic-memory MCP server）。没有就不召回。

## 配置

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `project` | `main` | Basic Memory project |
| `toolName` | `mcp__basic-memory__bm_search` | MCP 工具名 |
| `mode` | `hybrid` | 传给 `bm_search` |
| `minSimilarity` | `0.2` | 传给 `bm_search` |
| `topK` | `5` | 传给 `bm_search` 的 `page_size` |

其余全部写死：进块门槛 `0.5`、必读 `0.8`、最多 2 条、整块 ≤ 600 字符。

## skill

`/dsh-bm-contract-notes`：判断该不该写、放 `projects/` `reference/` `inbox/` 哪个目录、
文件名怎么起、标签怎么打、关系怎么连、什么时候移动归档。技能正文随包发布，不读写任何
外部目录，装完即用。

## 移除

删掉 profile 里 `id: bm-contract` 那一行。插件没有任何后台文件：不写 ledger、不复制
配置模板、不注册 web 路由。

## 隐私

插件只在内存里记录"这个会话展示过哪些笔记"（用于去重），不落盘、不联网。
