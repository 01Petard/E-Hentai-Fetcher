<div align="center">
  <img src="public/favicon.svg" width="80" height="80" alt="Gallery Lens 标志">
  <h1>Gallery Lens</h1>
  <p><strong>让搜索更顺手，让阅读更沉浸。</strong></p>
  <p>面向 E-Hentai / ExHentai 的第三方图库客户端：重新组织源站内容，提供标签增强、搜索与沉浸式阅读。</p>
  <p>
    <img src="https://img.shields.io/badge/Vue-3-42b883" alt="Vue 3">
    <img src="https://img.shields.io/badge/Vite-7-646cff" alt="Vite 7">
    <img src="https://img.shields.io/badge/deploy-Docker-2496ed" alt="Docker 部署">
    <img src="https://img.shields.io/badge/deploy-Vercel-111111" alt="Vercel 部署">
  </p>
  <p>
    <a href="#你可以用它做什么">功能</a> ·
    <a href="#开始使用">开始使用</a> ·
    <a href="#本地运行">本地运行</a> ·
    <a href="#部署与更新">部署</a>
  </p>
  <p>
    <a href="https://e-gallery.bugstack.top">在线访问</a> ·
    <a href="https://github.com/01Petard/E-Hentai-Fetcher">GitHub</a> ·
    <a href="https://github.com/01Petard/E-Hentai-Bridger">配套扩展</a>
  </p>
</div>

Gallery Lens 与 E-Hentai / ExHentai 官方无关，不托管图库内容。源站继续提供内容并决定账号的访问权限，本项目负责代理请求、解析与浏览交互。

## 你可以用它做什么

| 能力 | 使用体验 |
| --- | --- |
| 搜索与筛选 | 源站搜索语法、标签联想，以及页数、评分、种子等高级筛选 |
| 结果展示 | 缩略图、扩展列表、紧凑列表、分页和搜索状态恢复 |
| 标签增强 | EhTagTranslation 中文译名、标签介绍、搜索建议及缓存更新 |
| 画廊详情 | 封面、上传者、标签、评分、目录、评论和 Torrent |
| 沉浸式阅读 | 双页、全屏、进度跳转与保存、图片预加载 |
| 图片下载 | 单页浏览，预览图与原图下载 |
| 快捷导航 | 常用搜索和上传者链接，排序、编辑、导入与导出 |
| 隐私模式 | 内容图片默认模糊，悬停后临时显示 |
| 调试 | `/debug` 查看请求、原始响应与解析结果 |

切换 E-Hentai / ExHentai 时，快捷导航按当前模式选择源站，保留保存链接中的路径和查询参数。ExHentai 返回的新 `igneous` 会话令牌会由服务端接续。

## 开始使用

### 1. 配置自己的 Cookie

在主页右上角 **配置** 中保存从正常登录源站的浏览器获取的 Cookie。

Cookie 保存在当前站点的 HttpOnly `eh_cookie` 中，前端不会直接读取或回显；服务端会使用它请求源站。**使用公共实例意味着信任实例运营者**，长期使用建议自行部署。不要把 Cookie 放进 Git、日志或问题反馈。

<details>
<summary>查看原有配置示意</summary>

<img src="https://cdn.jsdelivr.net/gh/01Petard/imageURL@main/img/202609281017332.jpg" width="640" alt="Gallery Lens Cookie 配置示意">

</details>

### 2. 将源站展示模式设为 Extended

当前搜索结果解析依赖源站的 **Extended** 模式。若提示“响应中没有 Extended 结果表格”，请在 E-Hentai / ExHentai 用户设置中切换列表展示模式。

<details>
<summary>查看 Extended 设置位置</summary>

<img src="https://cdn.jsdelivr.net/gh/01Petard/imageURL@main/img/202609290859512.png" width="500" alt="源站 Extended 展示模式设置">

</details>

若你觉得 **Extended** 模式 影响了原本网站的使用（比如你之前更偏爱 **缩略图** 这种模式），这里我提供了一种通过浏览器扩展来弥补的方法，可以调整画廊查询结果的展示：<a href="https://github.com/01Petard/E-Hentai-Bridger">配套扩展</a>

### 3. 按需开启隐私模式

在 **配置 → 浏览体验** 中开启，默认关闭。该偏好保存在当前浏览器。

搜索、详情、单页浏览、沉浸阅读与调试页中的内容图片会模糊；悬停 **500ms** 后显示，移开立即恢复。搜索标题和详情目录的悬浮预览会额外等待 **500ms** 再解除模糊。

## 本地运行

使用 Node.js **`^20.19.0` 或 `≥22.12.0`**，推荐 pnpm。

```sh
pnpm install
pnpm dev
```

打开 **[http://127.0.0.1:8765](http://127.0.0.1:8765)**；调试页为 `/debug`，开发记录为 `/development-log`。

```sh
node --test tests/*.test.js # 现有 Node 测试
pnpm build                 # 构建前端
pnpm start                 # 本地预览，包含 API 中间件
```

仅个人本地调试时，可在 `.env.local` 中设置 `EH_COOKIE`，供浏览器尚未配置 Cookie 时使用：

```dotenv
EH_COOKIE=your-cookie
```

公共或多用户部署不要配置共享 `EH_COOKIE`，否则未配置 Cookie 的访问者可能使用同一账号会话。

## 部署与更新

### Docker

在项目根目录执行：

```sh
./deploy-docker.sh
```

脚本构建镜像、替换同名容器，并复用快捷链接数据卷。默认只监听本机 **`127.0.0.1:8765`**，无需额外数据库。

```sh
./deploy-docker.sh 20261016       # 指定 YYYYMMDD 格式镜像标签
PORT=9000 ./deploy-docker.sh     # 自定义宿主机端口

docker logs --tail 100 -f e-hentai-fetcher
```

更新源码后重新执行脚本即可。构建失败会在替换前停止；替换容器时会短暂中断，脚本没有自动健康检查或回滚。需要远程访问时，按自己的部署环境配置反向代理与 HTTPS。

命名卷 **`e-hentai-fetcher-data`** 保存快捷链接，由该实例的访问者共享；Cookie 不写入此卷。更新时保留数据卷，快捷链接还可通过界面导出 JSON 备份。

### Vercel

导入**整个仓库**，使用 `pnpm build`，前端输出目录为 `dist`。`api/` 中的 Serverless Functions 提供代理、下载与数据增强接口，[vercel.json](vercel.json) 配置相关重写。

只上传 `dist` 到静态托管无法提供完整功能。线上环境不要配置个人调试用的共享 Cookie。

## 数据保存在哪里

| 数据 | 保存位置 |
| --- | --- |
| 用户 Cookie | 当前站点的 HttpOnly Cookie |
| 搜索状态 | 当前标签页会话 |
| 浏览偏好与隐私模式 | 浏览器本地存储 |
| 标签数据库 | 服务端缓存 + IndexedDB |
| 沉浸阅读图片缓存 | 浏览器缓存 |
| Docker 快捷链接 | `e-hentai-fetcher-data` 数据卷 |

## 常见问题

**Cookie 正确，为什么 ExHentai 仍然拒绝？** 源站会综合账号权限、会话、`igneous` 和网络出口决定是否允许访问。可从正常登录的浏览器重新复制完整 Cookie，检查网络后再试；项目不会绕过源站权限。

**封面能显示，目录缩略图却不行？** 不同图片可能来自不同节点，封面正常不能证明目录图片节点可达。查看具体失败资源和 `/debug`，区分网络、源站响应与解析问题。

**为什么搜索数量或浏览位置不完全准确？** 部分数据来自 HTML 解析和估算，不能等同于源站完整统计。

**源站更新后某项功能失效了？** 页面结构变化可能使解析逻辑需要调整。反馈时提供脱敏的请求信息和复现步骤，不提交 Cookie 或私人内容。

## 鸣谢与反馈

标签翻译、介绍与联想来自 [EhTagTranslation Database](https://github.com/EhTagTranslation/Database)，并参考 [EhSyringe](https://github.com/EhTagTranslation/EhSyringe) 与 [E-Hentai-Downloader](https://github.com/ccloli/E-Hentai-Downloader)。

欢迎通过 [Issues](https://github.com/01Petard/E-Hentai-Fetcher/issues) 反馈。当前仓库未提供 `LICENSE` 文件；源站内容和第三方数据的使用权限分别遵循其原有约定。
