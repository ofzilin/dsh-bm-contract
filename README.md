# dsh-bm-contract

把 Basic Memory 知识库里的相关笔记召回进 DSH 会话，并附带一个手动触发的笔记写作规范 skill。

## 它做什么

- **召回（每条真人消息一次）**：用消息原文调 `search_notes`（默认 `search_type: vector`），
  取相似度 ≥ 0.5 的前 2 条，渲染成一个 markdown 块，通过 `systemPrompt.context`
  （name `bm:recall`）注入。同一条笔记在一个会话里只出现一次；没有命中就整块消失；
  工具失败时静默跳过，连续 3 次失败后本会话熔断。块随每条消息更新，不会在历史里堆叠。
- **档位**：排第 1 且相似度 ≥ 0.8 标 `必读`（模型应先用 `read_note` 读全文再回答）；
  其余标 `参考`（摘要够用就别读）。阈值只对 0–1 的向量/语义分数有意义。
- **写作规范**：内置 `skills/dsh-bm-contract-notes/SKILL.md`，在 `apply()` 里注册成
  runtime skill，`modelInvocable: false`。模型在技能目录里看不到它，只有你在聊天里输入
  `/dsh-bm-contract-notes` 才会加载。

注入块长这样（N 条，按相似度排序）：

```markdown
## 知识库相关笔记（2 条，按相似度排序）

1. **Gmail MCP 凭据配置** — `kb/projects/basic-memory/gmail-mcp-config` [0.86 必读]
   OAuth 客户端须建 Desktop 类型，redirect URI 固定为 http://localhost:8765/oauth/callback。
2. **语义检索排序** — `kb/computer-science/ai/semantic-search-ranking` [0.66 参考]
   决策：hybrid 返回融合分大于 1，不能当相似度用。

必读 = 先用 read_note 读全文再回答；参考 = 摘要够用就别读；不要复述本块。
```

## 安装

会话里有 basic-memory MCP server（默认工具名 `mcp__basic-memory__search_notes`），没有就
不召回。安装用 DSH 的插件管理：

```
plugin_manager install_bundle target=<本包绝对路径>
```

或在 profile patch 里加一行：

```yaml
- insert:
    - id: bm-contract
      name: dsh-bm-contract
```

## 配置

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `project` | 空 | Basic Memory project；空 = 用服务器的 `default_project` |
| `toolName` | `mcp__basic-memory__search_notes` | MCP 工具名 |
| `searchType` | `vector` | `vector` / `semantic` / `text` / `title` / `permalink` |
| `minSimilarity` | `0.2` | 传给服务器的 `min_similarity` |
| `topK` | `5` | 传给服务器的 `page_size` |

其余全部写死：进块门槛 `0.5`、必读 `0.8`、最多 2 条、整块 ≤ 600 字符。

分数口径：`vector`/`semantic` 返回 0–1 余弦相似度，`hybrid` 返回大于 1 的融合分，`text`/
`title` 返回负 BM25 分。用 `hybrid` 时 0.5/0.8 两个阈值没有意义，需自定 `minSimilarity`。

## skill

`/dsh-bm-contract-notes`：判断该不该写、落在哪个目录、文件名与 frontmatter、标签与
Relations、移动归档、写前检查单。技能正文随包发布，不读写任何外部目录，装完即用。

## 移除

删掉 profile 里的 `id: bm-contract`。插件没有任何落盘行为：不写 ledger、不复制配置模板、
不注册 web 路由、不建自带的状态文件。

## 隐私

插件只在内存里记录"这个会话展示过哪些笔记"（用于去重）和失败计数，不落盘、不联网。
