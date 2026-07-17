# opencode-light-scraper 开发文档

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
| robots.txt 合规 | ✅ | ❌ |

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
  "started_at": "...",
  "duration_ms": 123
}
```

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

---

## 4. 项目结构

```
opencode-light-scraper/
├── package.json          # 依赖: turndown, @opencode-ai/plugin
├── src/
│   ├── index.js          # 插件入口，导出工具定义
│   ├── scraper.js        # scrape 核心逻辑
│   ├── crawler.js        # crawl 递归爬取
│   ├── mapper.js         # map URL 发现
│   ├── citations.js      # 引用编号工具
│   └── browser.js        # Edge/Chrome 发现 + headless 调用
├── test/
│   ├── scraper.test.js   # scrape 测试
│   ├── crawler.test.js   # crawl 测试
│   ├── mapper.test.js    # map 测试
│   ├── citations.test.js # citations 测试
│   └── browser.test.js   # 浏览器发现测试
├── docs/
│   └── dev-guide.md      # 本文件
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
| 重定向(301/302) | 记录 final_url |
| gzip 编码 | fetch() 自动解压 |
| 中文/UTF-8 编码 | 正确解码 |
| 空响应体 | 返回 "empty response" 错误 |
| 无限重定向循环 | 设置最大重定向次数 |
| 并发请求过多 | 受 concurrent 参数 + rateLimit 控制 |
| 大文件/大页面 | 受 timeout 限制，可设 maxBodySize |

---

## 8. 依赖说明

```json
{
  "dependencies": {
    "turndown": "^7.2.0"
  },
  "devDependencies": {
    "@opencode-ai/plugin": "latest"
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
  "plugin": ["F:\\myweb\\Projects\\opencode-light-scraper\\src\\index.js"]
}
```

发布到 npm（未来）：

```json
{
  "plugin": ["@my-org/opencode-light-scraper"]
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
