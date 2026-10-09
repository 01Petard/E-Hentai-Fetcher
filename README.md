# Gallery Lens

> 本项目为面向 E-Hentai / ExHentai 的第三方图库客户端与替代前端，与 E-Hentai / ExHentai 官方无关。Gallery Lens 不托管图库内容，内容仍由源站提供。

在线使用：https://e-fetcher.bugstack.top

**Gallery Lens** 为通过代理访问并解析 E-Hentai / ExHentai 内容，在保留源站搜索与图库能力的基础上，提供标签增强、信息重组以及更现代的浏览和沉浸式阅读体验，为用户提供更便捷的 E-Hentai 搜索与浏览体验。

## 功能

- **搜索与筛选**：支持 E-Hentai 搜索语法、标签联想，以及页数、评分、种子等高级筛选；可保存常用搜索和上传者链接。
- **搜索结果**：提供缩略图、扩展列表和紧凑列表，支持分页、相对时间、浏览位置提示和搜索状态恢复。
- **标签增强**：集成 [EhTagTranslation](https://github.com/EhTagTranslation/Database)，提供中文译名、标签介绍和搜索建议，并支持缓存与自动更新。
- **画廊详情**：展示封面、基本信息、上传者、标签、评分、图片目录、评论和 Torrent；悬停目录缩略图可查看放大预览。
- **图片浏览**：支持单页浏览、预览图与原图下载；沉浸式阅读支持双页、全屏、进度跳转、进度保存和图片预加载。
- **隐私模式**：所有内容图片默认高斯模糊，鼠标悬停 500ms 后解除，移开后立即恢复；悬浮预览额外等待 500ms。
- **E-Hentai / ExHentai**：支持切换数据源，并自动接续 ExHentai 返回的 `igneous` 会话令牌。
- **调试工具**：`/debug` 页面可查看请求、原始响应和解析结果。

## 快速开始

### 配置 Cookie

首次使用时，在主页右上角的 **配置** 中保存自己的 E-Hentai / ExHentai Cookie。

<img src="https://cdn.jsdelivr.net/gh/01Petard/imageURL@main/img/202609281017332.jpg" style="zoom:25%;" />

Cookie 保存为当前站点的 `eh_cookie`，并设置为 HttpOnly，前端不会直接读取或回显。

> ⚠️ **安全说明** ⚠️
>
> Gallery Lens 的服务端需要使用该 Cookie 代替用户请求源站。因此使用公共实例意味着需要信任实例运营者；长期使用或对凭据安全要求较高时，建议自行部署。
>
> 不要将 Cookie 提交到 Git 仓库或写入日志。

本地调试时，如果浏览器没有配置 Cookie，可以在项目根目录的 `.env.local` 中设置：

```
EH_COOKIE=your_cookie
```

> `.env.local` 仅用于个人调试。多用户或线上部署不要配置共享 Cookie，否则未配置 Cookie 的访问者可能共用同一账号会话。

### 设置展示模式

Gallery Lens 当前的搜索结果解析依赖源站的 **Extended** 展示模式。

如果出现：

```
响应中没有 Extended 结果表格，可在下方查看原始 HTML。
```

请前往 E-Hentai / ExHentai 用户设置，将图库列表展示模式调整为 **Extended**。

<img src="https://cdn.jsdelivr.net/gh/01Petard/imageURL@main/img/202609290859512.png" alt="Extended 展示模式" style="zoom:100%;" width="500" />



### 隐私模式

在主页右上角的 **配置 → 浏览体验** 中开启 **隐私模式**。该选项默认关闭，并保存在当前浏览器的本地存储中。

开启后，搜索、画廊详情、单页浏览、沉浸式阅读和调试页的内容图片默认高斯模糊，鼠标悬停 500ms 后显示清晰图片，移开后立即恢复模糊。搜索结果标题与画廊详情页的悬浮预览额外等待 500ms 才会解除模糊。

### *ExHentai 访问*

ExHentai 本身会根据账号、Cookie 和网络环境决定访问结果。Gallery Lens 不会绕过源站权限控制。

如果提示：

```
ExHentai 拒绝了当前会话（igneous 失效或出口 IP 被里站风控）。请在配置中更新 Cookie，或更换网络节点后重试。
```

请重新从正常登录 ExHentai 的浏览器复制完整 Cookie，或更换网络环境后重新建立会话。

该问题的相关讨论：

- [EhViewer issue #2662](https://github.com/xiaojieonly/Ehviewer_CN_SXJ/issues/2662)
- [EhViewer issue #1065](https://github.com/xiaojieonly/Ehviewer_CN_SXJ/issues/1065)

## 项目定位

Gallery Lens 不是 E-Hentai / ExHentai 的镜像站，也不仅是网页代理。

它更接近一个 **Alternative Front-end（第三方替代前端）**：

```
E-Hentai / ExHentai
        ↓
   Proxy / Fetch
        ↓
   HTML / API
        ↓
 Structured Data
        ↓
 Translation / Enhancement
        ↓
    Gallery Lens
```

源站负责提供内容，Gallery Lens 负责重新组织内容并提供新的交互体验。

## 使用限制

Gallery Lens 目前部分能力依赖 E-Hentai / ExHentai HTML 页面解析，因此：

- 源站修改页面结构后，相关解析逻辑可能需要同步调整。
- 标签增强首次使用需要联网加载数据库。
- 搜索结果总数及浏览位置可能为估算值。
- 即使 Cookie 正确，源站仍可能因为账号、会话或网络环境返回 `403` 等错误。
- ExHentai 的实际访问权限仍由 ExHentai 决定。

出现异常时，可以通过 `/debug` 查看原始响应和解析结果。

## 本地运行

需要 Node.js `^20.19.0` 或 `>=22.12.0`，推荐使用 pnpm。

```
pnpm install
pnpm dev
```

访问：

```
http://127.0.0.1:8765/
```

调试页面：

```
http://127.0.0.1:8765/debug
```

## 部署

### Vercel

项目支持直接以仓库根目录部署到 Vercel。

Vite 输出目录为 `dist`，`api/` 中的 Serverless Functions 负责代理和服务端接口，`vercel.json` 提供路由配置。

> 不要只部署 `dist`，否则代理、下载和部分数据增强能力无法工作。线上环境不要配置个人调试用的 `.env.local` Cookie。

### Docker

在项目根目录执行：

```
./deploy-docker.sh
```

也可以指定镜像 Tag：

```
./deploy-docker.sh 20260901
```

默认监听 `127.0.0.1:8765`，可通过环境变量修改：

```
PORT=9000 ./deploy-docker.sh
```

Docker 会创建命名卷 `e-hentai-fetcher-data`，用于持久化快捷链接。快捷链接由同一实例的所有访问者共享，用户 Cookie 仍保存在各自浏览器中，不写入数据卷。

## 数据存储

| 数据            | 保存位置               |
| --------------- | ---------------------- |
| Cookie          | 浏览器站点 Cookie      |
| 搜索状态        | 当前标签页会话         |
| 浏览偏好（含隐私模式） | 浏览器本地存储         |
| 标签数据库      | 服务端缓存 + IndexedDB |
| 沉浸式图片缓存  | 浏览器缓存             |
| Docker 快捷链接 | Docker 数据卷          |

## 鸣谢

标签翻译、标签介绍和搜索建议使用 [EhTagTranslation Database](https://github.com/EhTagTranslation/Database)，并参考了 [EhSyringe](https://github.com/EhTagTranslation/EhSyringe) 和 [E-Hentai-Downloader](https://github.com/ccloli/E-Hentai-Downloader) 的开源工作与功能设计。
