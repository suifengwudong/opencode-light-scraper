# opencode-light-web-tools 开发文档

## 1. 项目概述

opencode 轻量级网页抓取插件。对标 crawlberg 核心功能，去掉重量级依赖（Rust 编译链、内置 Chromium），用纯 JS 实现。

### 设计目标

| 指标 | 实际 |
|------|------|
| 依赖 | turndown + @opencode-ai/plugin |
| 编译 | 零编译，纯 JS，opencode 启动时 bun install 秒级完成 |
| Chromium | 借系统安装的 Edge/Chrome，不捆绑 |
| 插件体积 | 6 模块，~550 行 JS |

### 与 crawlberg 功能对比

| 功能 | crawlberg | light-scraper |
|------|-----------|---------------|
| 单页 scrape | ✅ | ✅ |
| YAML frontmatter | ✅ | ✅ |
| 内容提取（去导航/侧栏） | ❌ | ✅ |
| 代码块语言标注 | ✅ | ✅ |
| 整站 crawl | ✅ | ✅ |
| URL map | ✅ | ✅ |
| batch-scrape | ✅ | ❌ |
| batch-crawl | ✅ | ❌ |
| interact（浏览器交互） | ✅ | ❌ |
| download | ✅ | ❌ |
| citations | ✅ | ✅ |
| serve / mcp | ✅ | ❌ |
| robots.txt 合规 | ✅ | ✅ |
| SSRF 防护 | ❌ | ✅ |
| web 检索（SearxNG） | ❌ | ✅ |

---

## 2. 架构设计

### 请求处理流程

```
用户请求 scrape/crawl
        │
        ▼
    fetch() 请求
        │
        ├── 成功 + 内容完整 ──► turndown 转 Markdown ──► 返回
        │
        └── 内容空 / JS 占位 / mode:"js"
                │
                ▼
        找系统 Edge/Chrome
                │
                ├── 找到 ──► --headless --dump-dom ──► turndown ──► 返回
                │
                └── 未找到 ──► 报错，提示安装浏览器
```

### Chromium 发现策略

按顺序检测：

1. 环境变量 `EDGE_PATH` / `CHROME_PATH` / `CHROMIUM_PATH`
2. Windows: `%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe`
3. Windows: `%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe`
4. Windows: `C:\Program Files\Google\Chrome\Application\chrome.exe`
5. Windows: `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`
6. macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
7. macOS: `/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge`
8. Linux: `which google-chrome chromium chromium-browser`

> 不使用 chrome-launcher 包以减少依赖，改为手动路径扫描 + `which` 检测。

### JS 渲染检测

如何判断一个页面需要 JS 渲染：

1. 响应内容为空或极短（`body_size < 500`）
2. 内容含 `<div id="root"></div>`、`<div id="app"></div>` 等 SPA 标记
3. 内容含 `<script>` 但无实质 HTML
4. 用户显式指定 `mode: "js"`

---

## 3. 工具设计

### 3.1 `scrape(url, options?)`

抓取单个 URL 并返回结构化结果。

**参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| url | string | 必填 | 目标 URL |
| options.format | "markdown" \| "json" | "markdown" | 输出格式 |
| options.mode | "auto" \| "js" \| "fetch" | "auto" | 渲染模式 |
| options.timeout | number | 30000 | 超时(ms) |
| options.userAgent | string | 自动 | User-Agent |
| options.proxy | string | - | 代理 URL |

**返回 (format=json)：**

```json
{
  "status_code": 200,
  "final_url": "https://example.com",
  "content_type": "text/html",
  "body_size": 559,
  "metadata": {
    "title": "Example Domain",
    "description": null,
    "canonical_url": null,
    "og_title": null,
    "og_description": null,
    "og_image": null,
    "twitter_card": null,
    "headings": [{ "level": 1, "text": "Example Domain" }],
    "word_count": 17
  },
  "links": [
    { "url": "https://iana.org/domains/example", "text": "Learn more" }
  ],
  "images": [],
  "markdown": "# Example Domain\n\n...",
  "browser_used": false,
  "error": null
}
```

### 3.2 `crawl(url, options?)`

从种子 URL 开始递归爬取。

**参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| url | string | 必填 | 种子 URL |
| options.depth | number | 2 | 最大递归深度 |
| options.maxPages | number | 50 | 最大页面数 |
| options.concurrent | number | 5 | 并发数 |
| options.rateLimit | number | 500 | 请求间隔(ms) |
| options.stayOnDomain | boolean | true | 是否限制同域 |
| options.format | "json" \| "markdown" | "json" | 输出格式 |

**返回：**

```json
{
  "pages": [
    {
      "url": "https://example.com",
      "depth": 0,
      "status_code": 200,
      "metadata": { ... },
      "markdown": "...",
      "links_found": 2
    }
  ],
  "total_pages": 1,
  "errors": [],
  "blocked": [],
  "started_at": "...",
  "duration_ms": 123
}
```

> `blocked` 为被 `robots.txt` 拒绝、因而跳过的 URL 列表。

### 3.3 `map(url, options?)`

发现站点上的所有 URL。

**参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| url | string | 必填 | 目标 URL |
| options.limit | number | 100 | 最大返回数 |
| options.filter | string | - | 过滤子串 |

**返回：**

```json
{
  "urls": [
    { "url": "https://example.com/page1", "source": "sitemap" },
    { "url": "https://example.com/page2", "source": "link_extraction" }
  ],
  "total": 2,
  "sitemap_found": false
}
```

### 3.4 `citations(input)`

将 Markdown 文本中的链接转为编号引用。

**参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| input | string | 必填 | 含链接的 Markdown 文本 |

**返回：**

```json
{
  "content": "# Hello\n\nCheck this[1] and that[2]",
  "references": [
    { "index": 1, "url": "https://example.com", "text": "this" },
    { "index": 2, "url": "https://iana.org", "text": "that" }
  ]
}
```

### 3.5 `search(query, options?)`

通过自托管 SearxNG 实例检索（需先按第 12 节部署并配置 `searxUrl`）。

**参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| query | string | 必填 | 检索词 |
| options.limit | number | 8 | 最多返回条数（上限 50） |
| options.language | string | 配置值 | 语言，如 `zh-CN`；不传则由配置/引擎决定 |
| options.timeRange | "day"\|"month"\|"year" | - | 限定时间范围 |
| options.categories | string | general | SearxNG 分类，逗号分隔 |

**返回（拼成 markdown 交给模型，契约与 opencode websearch 一致）：**

```
## [标题](url)
Published: <ISO 时间>

摘要…
```

无结果时返回固定文案，并附 `Unresponsive engines: …` 便于诊断。

---

## 4. 项目结构

```
opencode-light-web-tools/
├── package.json          # 依赖: turndown, @opencode/plugin
├── index.js              # 根入口（V2 只发现包根目录的 index.*，re-export src/index.js）
├── src/
│   ├── index.js          # 插件入口，Plugin.define + 工具定义
│   ├── scraper.js        # scrape 核心逻辑 + 字符集解码
│   ├── crawler.js        # crawl 递归爬取（含 robots 检查）
│   ├── mapper.js         # map URL 发现
│   ├── citations.js      # 引用编号工具
│   ├── downloader.js     # 文件下载
│   ├── html.js           # HTML 提取（正文/元数据/链接/图片）
│   ├── safety.js         # SSRF 防护 + robots.txt 解析/判定
│   ├── search.js         # SearxNG 检索
│   ├── browser.js        # Edge/Chrome 发现 + headless 调用
│   ├── platform.js       # 浏览器路径探测
│   └── defaults.js       # 配置读取（scraper.config.json / env）
├── test/
│   ├── p0.test.mjs       # 选择器/字符集/sitemap 离线单测
│   ├── safety.test.mjs   # SSRF IP 分类 + robots 解析离线单测
│   ├── search.test.mjs   # search 映射/错误处理离线单测（假 SearxNG）
│   ├── server.js         # 测试用本地服务器
│   └── debug_*.mjs       # 调试脚本
├── docs/
│   ├── dev-guide.md      # 本文件
│   └── test-plan.md      # 测试计划
└── README.md
```

---

## 5. 实现顺序

| 步骤 | 内容 | 依赖 |
|------|------|------|
| 1 | 项目初始化：package.json、基础结构 | 无 |
| 2 | `browser.js` — Chromium 发现 + headless 调用 | 无 |
| 3 | `scraper.js` — fetch + turndown + JS 降级 | turndown, browser.js |
| 4 | `citations.js` — Markdown 链接→编号引用 | 无 |
| 5 | `crawler.js` — 递归爬取 + 并发控制 | scraper.js |
| 6 | `mapper.js` — sitemap + 链接提取 | scraper.js |
| 7 | `index.js` — 插件入口，工具定义 | 以上全部 |
| 8 | 测试全部 | 以上全部 |
| 9 | 集成到 opencode | 发布/本地引用 |

---

## 6. 测试策略

### 6.1 测试工具

- 运行时: Node.js 或 Bun（opencode 内置 Bun）
- 测试框架: 简单的 assert + 手动验证，不引入额外依赖

### 6.2 测试用例

**scrape：**
- 静态 HTML 页面 → 正确返回 markdown + metadata
- SPA 页面（含 `<div id="root">`）→ 自动降级 headless
- 显式 `mode: "js"` → 强制走 headless
- 404 页面 → 返回 status_code + error 信息
- 超时 → 优雅错误处理
- 大页面 → body_size 正确

**crawl：**
- depth=0 → 只抓种子页
- depth=1 → 种子页 + 直接子链接
- stayOnDomain=true → 不抓外部链接
- maxPages 限制 → 不超过上限
- 重复 URL 去重

**map：**
- 有 sitemap.xml → 优先从 sitemap 提取
- 无 sitemap → 从页面链接提取
- filter 参数 → 只返回匹配的 URL

**citations：**
- 单个链接 → 正确编号
- 多个链接 → 正确编号 + 引用列表
- 无链接文本 → 原样返回
- 重复链接 → 合并引用

### 6.3 手动测试命令

```bash
# 节点服务器（供测试用）
cd test && node server.js

# 测试 scrape
curl http://localhost:3000/static
curl http://localhost:3000/spa
```

---

## 7. 边界情况处理

| 场景 | 处理方式 |
|------|----------|
| URL 格式错误 | 返回清晰错误信息 |
| DNS 解析失败 | 超时后报 DNS 错误 |
| 非 HTML 响应(PDF/图片) | 检测 content-type，返回 is_pdf 标记 |
| 重定向(301/302) | 记录 final_url，逐跳做 SSRF 检查 |
| gzip 编码 | fetch() 自动解压 |
| 中文/GBK/Big5 编码 | 按 `content-type` charset 解码（含 `<meta charset>` 兜底） |
| 空响应体 | 返回 "empty response" 错误 |
| 无限重定向循环 | 手动跟随，最多 5 跳后报错 |
| 并发请求过多 | 受 concurrent 参数 + rateLimit 控制 |
| 大文件/大页面 | 受 timeout 限制，可设 maxBodySize |
| 内网/回环/云元数据地址 | 拦截并报错；`OC_ALLOW_PRIVATE=1` 可放行 |
| `<article>`/`<main>` 无 id | 标签级选择器，正文提取生效 |
| 被 robots.txt 禁止的 URL | crawl 跳过并记入 `blocked` |
| robots 的 Crawl-delay | 并入每请求限速 |

---

## 8. 依赖说明

```json
{
  "dependencies": {
    "turndown": "^7.2.0",
    "@opencode/plugin": "^2.0.27"
  }
}
```

**turndown**: HTML 转 Markdown，~30KB gzip，纯 JS，无子依赖。

不使用的常见轮子及原因：

| 包 | 为什么不使用 |
|----|-------------|
| puppeteer/playwright | 捆绑 Chromium(~300MB)，太重 |
| chrome-launcher | 轻但没必要，手动扫描路径更简单 |
| cheerio/jsdom | 不需要 DOM 解析，fetch + 正则就够了 |
| axios | fetch() 已内置在 Bun/Node |
| robots-parser | v1 暂不实现 robots.txt 合规 |

---

## 9. 发布与集成

本地开发时，在 opencode.json 中引用本地路径：

```json
{
  "plugins": ["<absolute-path-to>/opencode-light-web-tools"]
}
```

> V2 只发现**包根目录**的 `index.js`/`index.mjs`/`index.ts`，因此目录里必须有根 `index.js`（本仓库已加，re-export `src/index.js`）。

发布到 npm（未来）：

```json
{
  "plugin": ["@my-org/opencode-light-web-tools"]
}
```

---

## 10. 性能基准（warm cache）

| 站点 | crawlberg | light-scraper | 倍数 |
|------|-----------|---------------|------|
| example.com | 618ms | 771ms | 1.2x |
| Wikipedia | 885ms | 1975ms | 2.2x |
| github.com | 1008ms | 1184ms | 1.2x |

差距主要来自 Rust 二进制 vs JS 解释执行 + turndown 的 domino DOM 解析。1.2-2.2x 是 JS 方案的合理范围。

### SPA 检测优化

初始版本中 SPA 检测模式 `/script.*react/` 在 GitHub 等 SSR React 站点上误触发，导致每请求额外 6s 的 Edge headless 启动开销。

修复：用 `hasVisibleContent()` 检测 body 中实际可见文字量（>200 字视为 SSR 完成），大幅降低误报率。

### P0 增强（v0.1）

| 功能 | 状态 | 说明 |
|------|------|------|
| YAML frontmatter | ✅ | 输出 `---\ntitle:\ndescription:\n---` 元数据头 |
| 内容提取 | ✅ | 正则识别 main/article/content/mw-content 等容器，提取正文 |
| 代码块语言 | ✅ | turndown 自定义规则：`<code class="language-js">` → ` ```js` |
| 去除导航噪音 | ✅ | stripNoise 移除 nav/footer/header/aside/script/style |
| user-agent 可配 | ✅ | scrape 工具暴露 args.userAgent |

---

## 11. 安全与合规（SSRF / robots.txt）

实现集中在 `src/safety.js`，被 `scraper.js` / `crawler.js` / `mapper.js` / `downloader.js` 调用。

### 11.1 SSRF 防护

- `assertPublicUrl(url)`：仅允许 `http`/`https`；解析主机名并逐个 IP 判定，命中即抛错。
  - 拦截 IPv4：`0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.0.0/24, 192.0.2/24, 192.168/16, 198.18/15, 198.51.100/24, 203.0.113/24, 224/4, 240/4`
  - 拦截 IPv6：`::`, `::1`, `fc00::/7`, `fe80::/10`, `ff00::/8`, `2001:db8::/32`, IPv4-mapped
  - 拦截主机名：`localhost` 及 `.localhost` / `.local` / `.internal` / `.home.arpa` 后缀
  - DNS 结果缓存 5 分钟，避免 crawl 时重复解析
- `safeFetch(url, opts)`：`redirect:"manual"` 手动跟随，**每一跳都过 `assertPublicUrl`**，最多 5 跳，防止“公网跳内网”的重定向 SSRF。
- 应用点：`scrape` 入口（覆盖 `mode:"js"` 分支）、`download`、`map`、`crawl`（种子 + 每个发现链接）。

### 11.2 robots.txt

- `robotsAllowed(url)`：按 origin 拉取 `/robots.txt`（缓存 1 小时），选最匹配的 `User-agent` 组（无则 `*`）；支持 `Allow`/`Disallow`、`*` 与 `$` 通配，最长匹配优先、同长 Allow 优先；无 robots 或拉取失败一律放行。
- `robotsCrawlDelayMs(url)`：读取 `Crawl-delay`，与 `rateLimit` 取较大值作为每请求间隔（上限 30s）。
- 应用点：仅 `crawl`。`scrape` 是单次显式抓取（同内置 `webfetch`），只做 SSRF 不做 robots。
- 被拒 URL 记入 crawl 结果的 `blocked` 数组。

### 11.3 逃生开关

- 环境变量 `OC_ALLOW_PRIVATE=1`：放行内网/回环（自建文档、局域网场景）。默认关闭。

### 11.4 顺带修复（P0）

| 项 | 说明 |
|----|------|
| `<article>`/`<main>` 选择器 | 原逻辑拼出 `id="undefined"` 的空选择器；改为标签级匹配 |
| `<title>` 取值 | 由最后一个改为第一个 |
| `map.sitemap_found` | 由“找到任意 URL”改为“确实命中 sitemap.xml” |
| `browser.js` | `execSync` 字符串拼接 → `execFileSync` 参数数组（无 shell，杜绝注入） |
| 字符集 | 固定 UTF-8 → 按声明 charset 解码 |
| 正文提取 | `extractMainContent` 只算一次 |

---

## 12. search（SearxNG 集成）

### 12.1 定位

插件原本只能抓“已知 URL”，SearxNG 补上“发现 URL”的能力。它是自托管元搜索引擎，聚合 Google/Bing/DuckDuckGo 等，对外提供 HTTP API，不绑定任何一家 API key。

### 12.2 部署（本仓库当前使用方式）

本机没有 Windows 版 Docker，改用 **WSL 内的 Docker** 跑官方镜像；容器用 `--network host` 以复用 WSL 的代理设置：

```bash
# 在 WSL 内执行
mkdir -p ~/searxng-config
cat > ~/searxng-config/settings.yml <<'YAML'
use_default_settings: true
search:
  safe_search: 0
  formats: [html, json]        # 必须开 json，否则 format=json 返回 403
server:
  secret_key: <随机串>
  limiter: false               # 关闭反爬，允许非浏览器请求
outgoing:
  proxies:
    all://:
      - http://127.0.0.1:<proxy-port>  # WSL 侧可见的 HTTP 代理（按需替换）
YAML

docker run -d --name searxng --restart unless-stopped --network host \
  -v /home/<user>/searxng-config:/etc/searxng \
  searxng/searxng
```

WSL2 的 localhost 转发让 Windows 侧可直接访问 `http://127.0.0.1:8080`。没有代理时删掉 `outgoing.proxies` 整段即可。

### 12.3 配置

`~/.config/opencode/scraper.config.json`（或 `SEARX_URL` / `SEARX_LANGUAGE` 环境变量）：

```json
{
  "searxUrl": "http://127.0.0.1:8080",
  "searchLanguage": "",
  "allowPrivateSearch": true,
  "autoStart": true,
  "wslDistro": "Ubuntu",
  "searxContainer": "searxng"
}
```

| 键 | 说明 |
|----|------|
| `searxUrl` | 实例地址；为空时 search 工具报“未配置” |
| `searchLanguage` | 默认语言（留空交给 Agent/引擎决定） |
| `allowPrivateSearch` | 是否允许 search 访问内网地址（默认 true，因为是本地实例） |
| `autoStart` | 连不上时自动执行启动命令拉起实例（默认 true，仅 Windows） |
| `wslDistro` | WSL 发行版名（默认 `Ubuntu`） |
| `searxContainer` | 容器名（默认 `searxng`） |

### 12.4 协议与错误处理

- 请求：`GET {searxUrl}/search?q=…&format=json[&language=…][&time_range=…][&categories=…]`
- 响应：`results[].{url,title,content,engine,publishedDate}`，另有 `unresponsive_engines`。
- 映射到 opencode `WebSearch.Result`：`{ url, title, content?, time.published? }`。
- 错误：403 → 提示开 json；429 → 限流；非 JSON → 提示检查 format；引擎全超时 → 空结果 + `Unresponsive engines`。

### 12.5 SSRF 边界

search 请求走 `safeFetch(..., { allowPrivate: true })`，**只对 `searxUrl` 这一个地址**放行内网；`scrape/crawl/map/download` 仍严格拦截 `127.0.0.1` 等（见第 11 节）。`allowPrivateSearch: false` 可关闭该放行。

### 12.6 自愈（使用前无需手动启动）

`search` 调用时若连不上 `searxUrl`，会自动执行一次启动命令（默认仅 Windows）：

```
wsl -d Ubuntu -e bash -lc "setsid nohup sleep 1000000 >/dev/null 2>&1 </dev/null & docker start searxng"
```

- `setsid nohup sleep …` 保活 WSL VM（否则空闲会被关掉），`docker start` 拉起容器；
- 等待 2.5s 后重试一次；
- 仍失败则抛出可直接照做的错误信息（含上面的命令）；
- `autoStart: false` 可关闭自愈。

因此 **LLM 不需要在使用前手动启动 Ubuntu**，直接调用 `search` 即可。`search` 工具描述里也写明了这一点。
