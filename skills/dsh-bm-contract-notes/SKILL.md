---
name: dsh-bm-contract-notes
description: Basic Memory 知识库笔记规范——写前判断、目录骨架、文件名与 frontmatter、标签与 Relations、移动归档、写前检查单。人工输入 /dsh-bm-contract-notes 时加载。
---

# Basic Memory 知识库笔记规范

知识库 = Basic Memory 的一个 project（本机为 `project: kb`，vault 在 `~/.knowledge-base`）。
**只通过 MCP 工具读写**（`search_notes`、`read_note`、`write_note`、`edit_note`、`move_note`、`delete_note`、`list_directory`），不要直接改 vault 里的文件。

## 先判断：该不该写

写之前过三关，任何一关过不了就别写：

1. 这条内容对**以后**的某个任务还有用吗？只是本次对话的过程记录，不写。
2. 已经有笔记覆盖它了吗？有就 `edit_note` 补充那一条，不要再建重复笔记。
3. 它是代码仓库自己的文档吗？README、API 设计、变更日志留在仓库，不复制进知识库。

拿不准时先问用户，不要默认复制。

## 四个维度，各司其职

| 维度 | 载体 | 管什么 |
| --- | --- | --- |
| 主领域 | 文件夹路径 | 一篇笔记只落在一个领域 |
| 类型/成熟度/场景 | frontmatter 字段 | 机器检索与排序 |
| 跨领域主题 | frontmatter `tags` | 人的横向浏览 |
| 跨学科桥 | 正文 `## Relations` | 知识之间的关联 |

不要互相兼职：目录不表达主题，标签不表达领域，关系不用标签模拟。

## 目录骨架

```
00-meta/                 分类法、模板、MOC、知识库自身的文档
computer-science/        software/ ai/ algorithms/ hardware/
mechanical-engineering/  design/ cad/ 3d-printing/
arts/                    music/ visual-arts/
science/                 mathematics/ physics/ chemistry/ biology/ geography/
humanities/              economics/ finance/ politics/ history/ military/ culture/ management/
projects/                跨领域的具体项目（游戏、机械装置…）
99-inbox/                还没想好放哪的
```

- 目录名全小写、连字符、用全名（`ai`、`cad`、`3d-printing`、`dsh` 这类公认缩写例外）。
- **不加数字前缀**：顺序由 `00-meta/domains.md` 目录页表达，数字会让改名和插入变成全面搬家。
- 第三层按需生长：某目录满 5 篇才拆子目录；`99-inbox/` 同一子域攒到 3–5 篇再建目录。
- `projects/` 只放有明确交付物的项目笔记；项目依赖的领域知识仍留在领域目录，用 Relations 连过去。

## 文件名与三个必填字段

- 文件名用 **kebab-case 英文**（如 `semantic-search-ranking.md`），可读、稳定、URL 友好。
- 标题写 frontmatter `title`（中文标题写这里，不写进文件名）。
- 一条笔记只讲一个主题；跨学科内容拆成原子笔记再用 Relations 连起来。

```yaml
---
title: 语义检索排序
type: note        # note | decision | howto | reference | log | question | source
status: seed      # seed | growing | evergreen | deprecated
context: explore  # work | hobby | explore
permalink: kb/computer-science/ai/semantic-search-ranking
tags: [search, ranking]
---
```

- `type`：结论、操作方法、参考资料，还是一次记录。
- `status`：`seed` 刚记下、`growing` 在补充、`evergreen` 已稳定可引用、`deprecated` 已过时。
- `context`：同一主题在 work / hobby / explore 场景下写法不同，用这个字段区分。

## 标签是跨领域主题词

- 2–5 个，小写英文连字符，只放跨领域主题词；中文放 `title`。
- 不建和目录重复的标签（不要 `#computer-science`、`#arts`）。
- 新词出现两次以上才"转正"；同义词合并，宽泛词（`knowledge`、`important`）不用。

## 关系用 Relations

```markdown
## Relations
- depends_on [[引擎架构]]
- relates_to [[乐理基础]]
- applied_in [[独立游戏项目 A]]
```

关系是图上的一条边，不是四个标签堆在同一篇上。链接目标写笔记标题或文件名。

## Observation 写法

正文里的观察记成 `- [类别] 内容 #标签`，如：

```markdown
- [决策] 全局知识库放在 ~/.knowledge-base，project 名 kb
- [要点] hybrid 返回融合分大于 1，不能当相似度用
```

## 移动、提升、归档

- 移动或重命名用 `move_note`，保持 permalink 前缀一致，移动后检查 Relations 断链。
- 一条项目笔记被**第二个项目**引用后，从 `projects/` 提升到对应领域目录。
- 删除用 `delete_note`；重要内容先归档或确认用户同意，目录移动很便宜，链接才是真正的结构。

## 写之前的检查单

- 这条笔记只表达一个主题吗？
- 目录选对了吗（领域目录 / `projects/` / `99-inbox/`）？没想清楚就放 `99-inbox/` + `status: seed`。
- 文件名是 kebab-case 英文、标题在 frontmatter `title` 吗？
- `type` / `status` / `context` 三个必填字段都写了吗？
- 标签 2–5 个、小写英文、没有和目录重复吗？
- 关系用 `## Relations` + wiki-link 表达，不是标签？
- permalink 与已有笔记的风格一致吗？

## 探索期

`context: explore` + `status: seed` 先放 `99-inbox/`。不要为了"整齐"提前开空目录——目录跟着内容长。
