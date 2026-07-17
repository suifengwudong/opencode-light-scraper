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

### map 测试

| # | 测试场景 | 输入 | 预期结果 |
|---|---------|------|---------|
| 1 | 有 sitemap | `/` | 从 sitemap.xml 提取 3 个 URL |
| 2 | 无 sitemap | `/static`（设置无 sitemap） | 从页面链接提取 |
| 3 | filter | `/`, filter="page1" | 只返回含 "page1" 的 URL |
| 4 | limit | `/`, limit=1 | 最多返回 1 个 URL |

### citations 测试

| # | 测试场景 | 输入 | 预期结果 |
|---|---------|------|---------|
| 1 | 单个链接 | `"check [this](https://a.com)"` | 内容变 `check this[1]`，references 长度 1 |
| 2 | 多个链接 | `"[a](https://a.com) and [b](https://b.com)"` | 内容含 [1][2]，references 长度 2 |
| 3 | 无链接 | `"plain text"` | 原样返回，references 为空 |
| 4 | 重复链接 | `"[a](https://x.com) and [b](https://x.com)"` | 合并为同一引用 |

### browser 发现测试

| # | 测试场景 | 输入 | 预期结果 |
|---|---------|------|---------|
| 1 | Edge 在常见路径 | 无 env 变量 | 找到 msedge.exe（Windows） |
| 2 | 环境变量覆盖 | EDGE_PATH="..." | 优先使用环境变量路径 |
| 3 | 找不到浏览器 | 无浏览器 | 返回 null，不抛异常 |

---

## 手动测试流程

```bash
# 终端 1：启动测试服务器
cd F:\myweb\Projects\opencode-light-scraper
node test\server.js
# 输出: Test server running at http://localhost:xxxxx

# 终端 2：用 node 直接测试各模块
node -e "
const { scrape } = require('./src/scraper.js')
scrape('http://localhost:xxxxx/static').then(console.log)
"
```

## 集成测试（在 opencode 中）

```bash
# 将插件路径加入 opencode.json
# "plugin": ["F:\\myweb\\Projects\\opencode-light-scraper\\src\\index.js"]

# 重启 opencode，在对话中测试：
# "抓取 https://example.com"
# "爬取 https://example.com 深度2"
```
