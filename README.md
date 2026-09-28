# E-Hentai Fetcher

一个提供 E-Hentai 图库搜索与浏览的代理工具，通过本地代理请求目标站点，解析并展示搜索结果与画廊内容。

在线使用：[Gallery Lens](https://e-fetcher.bugstack.top)

## 功能

- **搜索与筛选**：支持 E-Hentai 搜索语法、标签联想，以及页数、评分、种子等高级筛选；可保存常用搜索或上传者链接。
- **搜索结果**：提供缩略图、扩展列表和紧凑列表，支持分页、相对时间和浏览进度提示；同一标签页内可恢复上次查询状态。
- **标签增强**：使用 EhTagTranslation 数据库显示中文译名、标签介绍和搜索建议；支持缓存、自动检查与手动更新。
- **画廊详情**：展示封面、基本信息、标签、图片目录和评论；可调整每页数量、每行数量并跳转页码。标签较多时可在标签区域内滚动。
- **图片浏览**：可逐页查看图片、下载预览图及源站提供的原图；沉浸式浏览支持翻页、全屏、进度跳转和可选的图片预载入。
- **种子与调试**：可在搜索结果中查看、下载画廊种子；`/debug` 页面可查看原始响应和解析结果。

## 快速开始

### Cookie 和数据安全

首次使用时，在主页右上角的“配置”中保存 E-Hentai 的 Cookie 请求头值。

如何获取自己的 E-Hentai 账号的 Cookie ：👇

<img src="https://cdn.jsdelivr.net/gh/01Petard/imageURL@main/img/202609281017332.jpg" style="zoom:25%;" />

Cookie 保存在当前浏览器的 `eh_cookie` 中，页面不会回显；不同浏览器互不共享。

⚠️**注意**：未设置浏览器 Cookie 时，代理可读取项目根目录的 **`.env.local`** 作为本地调试兜底。**多用户部署不要配置该兜底文件**（⚠️‼️非常重要‼️⚠️），以免未配置 Cookie 的用户共用账号，泄露个人隐私。

快捷链接和浏览偏好保存在浏览器中，搜索状态保存在当前标签页会话中。标签数据库使用服务端缓存和浏览器 IndexedDB；沉浸式图片预载入缓存可在配置中清理。**不要将 Cookie 提交到版本库或写入日志**。

### 正确的内容展示模式（dm_）

如果一切配置妥当后打开页面提示：

```
响应中没有 Extended 结果表格，可在下方查看原始 HTML。
```

此时，你需要去Eh/Ex上，将浏览模式改为“扩展”（‼️非常重要‼️）

<img src="https://cdn.jsdelivr.net/gh/01Petard/imageURL@main/img/202609281621945.png" alt="image-20260928162107820" style="zoom:50%;" />

### 如何开启EX？

> 参考来源：
>
> - https://github.com/xiaojieonly/Ehviewer_CN_SXJ/issues/2662
> - https://github.com/xiaojieonly/Ehviewer_CN_SXJ/issues/1065

这是一个老生常谈的话题，简单来说，里站会检测你的 IP 风险，欧美节点风险较低，香港日韩偏高，高风险节点可能会导致访问失败，每当访问失败时，里站都会以浏览器Cookie的形式进行记录，并阻止此后的任何访问。所以，如果想要测试账号是否获得权限，务必首先清除里站的Cookie，然后再重新[登录](https://forums.e-hentai.org)，并去[用户配置](https://e-hentai.org/uconfig.php)中确认是否欧美。

## 本地运行

需要 Node.js `^20.19.0` 或 `>=22.12.0`，建议采用pnpm

```bash
pnpm i
```

打开 <http://127.0.0.1:8765/>，调试页位于 <http://127.0.0.1:8765/debug>

## 线上部署

该项目目前通过 Vercel 以项目根目录部署，使用 Vite 构建并将输出目录设为 `dist`，`api/` 中的函数处理线上接口，`vercel.json` 提供 `/fetch`、`/debug` 和 `/development-log` 路由；只上传 `dist` 会导致接口返回 404。线上不要配置 `.env.local`。

## 使用限制

解析依赖 E-Hentai 当前的 HTML 结构，站点改版后可能需要更新解析逻辑。标签增强首次加载需要联网；搜索结果总数和浏览进度可能是估算值。即使 Cookie 已配置，目标站点仍可能返回 `403` 等访问错误，可通过 `/debug` 查看响应。

## 鸣谢

标签翻译、介绍和搜索建议使用 [EhTagTranslation](https://github.com/EhTagTranslation/Database) 社区数据库，并参考了 [EhSyringe](https://github.com/EhTagTranslation/EhSyringe) 的开源工作和功能设计。
