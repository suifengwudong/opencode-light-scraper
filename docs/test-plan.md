# 测试计划

## 测试服务器

`test/server.js` 提供以下端点供测试：

| 端点 | 用途 |
|------|------|
| `/static` | 标准静态 HTML 页面 |
| `/spa` | JS 渲染 SPA 页面（含 `<div id="root">`） |
| `/page1`, `/page2`, `/page1-sub` | 多级子页面（测试 crawl） |
| `/empty` | 内容极少的页面 |
| `/redirect` | 301 重定向到 `/static` |
| `/not-found` | 404 页面 |
| `/pdf` | 非 HTML 内容 |
| `/sitemap.xml` | 站点地图（测试 map） |
| `/slow` | 5 秒延迟（测试超时） |

启动：`node test/server.js`

---

## 测试用例

### scrape 测试

| # | 测试场景 | 输入 | 预期结果 |
|---|---------|------|---------|
| 1 | 静态页面 | `/static`, format=markdown | 返回 markdown 含 h1、p、链接 |
| 2 | 静态页面 JSON 格式 | `/static`, format=json | 返回 JSON 含 metadata、links、markdown |
| 3 | SPA 自动检测 | `/spa`, mode=auto | 检测到 `<div id="root">`，自动走 headless |
| 4 | 强制 JS 渲染 | `/static`, mode=js | 强制走 headless（即使页面是静态的） |
| 5 | 404 页面 | `/not-found` | status_code=404，不抛异常 |
| 6 | 重定向 | `/redirect` | final_url 指向 `/static`，内容正确 |
| 7 | 超时 | `/slow`, timeout=1000 | 超时错误，不挂起 |
| 8 | 非 HTML（PDF） | `/pdf` | 检测 content-type，标记 is_pdf |
| 9 | 空内容 | `/empty` | 返回空 markdown，无错误 |
| 10 | 元数据提取 | `/static` | title、description、og、headings 正确 |

### crawl 测试

| # | 测试场景 | 输入 | 预期结果 |
|---|---------|------|---------|
| 1 | depth=0 | `/`, depth=0 | 只返回 1 页 |
| 2 | depth=1 | `/`, depth=1 | 返回首页 + /page1、/page2 |
| 3 | depth=2 | `/`, depth=2 | 额外抓取 /page1-sub |
| 4 | 同域限制 | `/`, stayOnDomain=true | 不抓 external.com |
| 5 | maxPages 限制 | `/`, maxPages=2 | 最多返回 2 页 |
| 6 | 重复 URL | 页面有重复链接 | 去重，每 URL 只抓一次 |
| 7 | 空站点 | `/empty` | 只返回 1 页 |
| 8 | robots 禁止 | 站点 robots.txt `Disallow: /secret` | 该 URL 进入 `blocked`，不抓取 |
| 9 | Crawl-delay | robots.txt `Crawl-delay: 2` | 每请求间隔 ≥ 2s |

### map 测试

| # | 测试场景 | 输入 | 预期结果 |
|---|---------|------|---------|
| 1 | 有 sitemap | `/` | 从 sitemap.xml 提取 URL，`sitemap_found=true` |
| 2 | 无 sitemap | `/static`（无 sitemap.xml） | 从页面链接提取，`sitemap_found=false` |
| 3 | filter | `/`, filter="page1" | 只返回含 "page1" 的 URL |
| 4 | limit | `/`, limit=1 | 最多返回 1 个 URL |

### citations 测试

| # | 测试场景 | 输入 | 预期结果 |
|---|---------|------|---------|
| 1 | 单个链接 | `"check [this](https://a.com)"` | 内容变 `check this[1]`，references 长度 1 |
| 2 | 多个链接 | `"[a](https://a.com) and [b](https://b.com)"` | 内容含 [1][2]，references 长度 2 |
| 3 | 无链接 | `"plain text"` | 原样返回，references 为空 |
| 4 | 重复链接 | `"[a](https://x.com) and [b](https://x.com)"` | 合并为同一引用 |

### 安全测试（safety）

实现见 `src/safety.js`；离线跑 `node test/safety.test.mjs`（35 项）。

| # | 测试场景 | 输入 | 预期结果 |
|---|---------|------|---------|
| 1 | 回环地址 | `http://127.0.0.1/`、`http://localhost/`、`http://[::1]/` | 拦截 |
| 2 | 私网/链路本地 | `10.0.0.5`、`192.168.1.1`、`169.254.169.254` | 拦截 |
| 3 | 非 http(s)/内网域名 | `file://`、`.internal`、`.local` | 拦截 |
| 4 | 公网地址 | `http://1.1.1.1/` | 放行 |
| 5 | 重定向到内网 | 公网 URL 301 → `127.0.0.1` | 第二跳被拦截 |
| 6 | robots Disallow | `Disallow: /tmp` 命中 | `robotsAllowed=false` |
| 7 | robots Allow 覆盖 | `Disallow: /a/` + `Allow: /a/b/` | `/a/b/` 放行 |
| 8 | Crawl-delay | `Crawl-delay: 2` | `robotsCrawlDelayMs=2000` |
| 9 | 无 robots | 404 | 全部放行 |
| 10 | 逃生开关 | `OC_ALLOW_PRIVATE=1` | 放行内网 |

离线单测覆盖：IP 分类（IPv4/IPv6）、URL 拦截、robots 解析与匹配、`pathMatches` 通配/锚点。

### search 测试（SearxNG）

实现见 `src/search.js`；离线跑 `node test/search.test.mjs`（本地假实例，10 项）。需要真实实例时按 dev-guide 第 12 节部署。

| # | 测试场景 | 输入 | 预期结果 |
|---|---------|------|---------|
| 1 | 结果映射 | 假实例返回 3 条 | `{url,title,content,time}`，`publishedDate`→ms |
| 2 | limit | `limit=2` | 只返回 2 条 |
| 3 | 空结果 | `results:[]` + unresponsive | 空数组 + `unresponsive_engines` |
| 4 | 语言/时间/分类 | `language/timeRange/categories` | 请求带上参数且不报错 |
| 5 | json 未开 | HTTP 403 | 报错提示开 `search.formats` |
| 6 | 限流 | HTTP 429 | 报错提示 429 |
| 7 | 非 JSON | `content-type: text/html` | 报错提示检查 format |
| 8 | 未配置实例 | `searxUrl: ""` | 报“未配置” |
| 9 | 本地实例放行 | `allowPrivateSearch` 默认 true | localhost 实例可用 |
| 10 | 真实实例冒烟 | `search("opencode ai")` | 返回真实结果（需联网/代理） |
| 11 | 自愈 | 先 `docker stop searxng` 再调用 | 自动拉起实例并返回结果 |
| 12 | 自愈关闭/失败 | `autoStart:false` 且实例停 | 报错含 `docker start searxng` 命令 |

### browser 发现测试

| # | 测试场景 | 输入 | 预期结果 |
|---|---------|------|---------|
| 1 | Edge 在常见路径 | 无 env 变量 | 找到 msedge.exe（Windows） |
| 2 | 环境变量覆盖 | EDGE_PATH="..." | 优先使用环境变量路径 |
| 3 | 找不到浏览器 | 无浏览器 | 返回 null，不抛异常 |

---

## 手动测试流程

```bash
cd <path-to-opencode-light-web-tools>

# 离线单测（无需网络）
node test/p0.test.mjs
node test/safety.test.mjs

# 终端 1：启动测试服务器
node test/server.js
# 输出: Test server running at http://localhost:xxxxx

# 终端 2：直接调用模块（ESM）
node --input-type=module -e "import { scrape } from './src/scraper.js'; console.log(await scrape('http://localhost:xxxxx/static'))"

# 注意：本地服务器是 127.0.0.1，会被 SSRF 默认拦截；测本地时先设 OC_ALLOW_PRIVATE=1
```

## 集成测试（在 opencode 中）

```bash
# 将插件目录加入 opencode.json（V2 用 plugins；目录须有根 index.js）
# "plugins": ["<absolute-path-to>/opencode-light-web-tools"]

# 重启 opencode，在对话中测试：
# "抓取 https://example.com"
# "爬取 https://example.com 深度2"
```
