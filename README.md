# NinePalace · 中国象棋桌面原型

当前版本提供 Windows x64 桌面版和本机 Web/PWA 入口。支持单机人机、局域网好友房和凭五位房号加入的远程好友对局。

## 本机运行

要求 Node.js。

源码仓库不包含下载的引擎程序、NNUE 权重、构建产物、本地测试输出及已弃用的美术草稿。首次获取项目后，请按 [Pikafish 说明](./vendor/pikafish/README.md) 和 [Fairy-Stockfish 说明](./vendor/fairy-stockfish/README.md) 准备所需引擎文件；这些文件保留在本机，不提交到 Git。

准备好引擎后，在项目目录执行：

```powershell
npm install
npm start
```

运行前请确认 `vendor/pikafish` 中的引擎和 NNUE 权重文件完整。单机练习不需要账号或网络连接。

在人机对局开始前，可在大厅的“执棋方”选择“红方 · 先手”或“黑方 · 后手”。执黑时引擎执红先走，棋盘自动显示黑棋在下方，棋子文字保持正向；选择会保存在本机，并用于“再来一局”。悔棋保留引擎的开局着，结果页和复盘也会恢复你的阵营与视角。新手教学固定使用红方，不修改你的选边偏好。

## 本机 Web / PWA

```powershell
npm run web
```

保持这个终端运行，然后在本机浏览器打开 `http://127.0.0.1:4173/`。默认只监听本机回环地址。浏览器负责界面，NinePalace 本地服务负责规则状态与 Pikafish；首页出现“安装 NinePalace”后可安装为桌面应用。服务进程关闭时，缓存的应用外壳仍可打开，但对局功能需服务重新运行。

好友房可直接从 Windows EXE 点击“创建好友房”，选择执红或执黑后创建，再把界面显示的邀请链接发给同一局域网的朋友。朋友自动执另一方；红方始终先走，双方棋盘各自以己方在下方显示，刷新重连会保留原席位。使用本机 Web/PWA 时，需明确选择 LAN 监听：

```powershell
npm run web -- --host=0.0.0.0
```

然后从该设备的局域网地址打开应用并创建房间。房间只保存在主持设备的内存中；刷新页面可在服务仍运行时凭本机会话恢复，关闭主持应用后房间结束。当前链接使用 HTTP，只适合可信的局域网/互通私有网络，不支持任意互联网远程连接；不要公开转发。Windows 防火墙若询问，请只对可信的“专用网络”允许访问。

## 远程联机

两边打开桌面版的“好友对弈 → 远程联机”。房主选边并点击“开房”，应用会自动启动临时中转。好友输入五位房号，点击“加入房间”便可开局。对局期间房主保持应用在线，离开房间时应用会关闭中转。默认使用 Viaduct 的免费公网隧道，也支持自建中转。[中转说明](./relay/README.md)

## 对局复盘

对局结束后，从首页打开“最近棋谱”，选择一盘并点击“开始逐手复盘”。Pikafish 会检查双方每一步，标出正着、好棋、可改进、失误或严重失误，并给出当时的首选着法和短续着参考变化。点选某一步后，可切换查看实战落点或在棋盘上显示推荐路线。结果会保存在本机棋谱中，方便之后继续查看。

复盘使用较短的本地引擎搜索来控制等待时间，属于练习参考，不是官方裁定或完整 AI 教练讲解；较复杂的局面可能需要更深分析。

## 构建 Windows EXE

```powershell
npm run build:win
```

产物位于 `dist/NinePalace-0.1.0-win-x64.exe`，是 x64 便携版；无需安装，但首次启动会解包到本机临时目录。该文件目前未签名，Windows 可能显示未知发布者提示。

## 规则与已知限制

- `xiangqi.js` 负责校验用户和引擎着法；Pikafish 通过 UCI 子进程搜索着法。
- 本地休闲原型暂不按三次重复判和，也没有正式比赛裁定、计时或联网反作弊能力。
- Pikafish NNUE 权重有独立的非商业限制。请阅读 [VENDOR_NOTICES.md](./VENDOR_NOTICES.md) 和随包许可证。当前版本只用于本地验证，不能据此推出可商业使用或公开分发。
- NinePalace 自身的项目许可证尚未选定，当前仓库没有 `LICENSE` 文件；公开发布前还需处理 [公开发布检查清单](./PUBLIC_RELEASE_CHECKLIST.md) 中的许可证、引擎/权重和安全披露事项。

## 验证

```powershell
npm test
npm run web:smoke
npm start -- --friend-room-ui-smoke-test
$testProcess = Start-Process -FilePath (Resolve-Path '.\dist\NinePalace-0.1.0-win-x64.exe').Path -ArgumentList '--ui-smoke-test' -PassThru -Wait -WindowStyle Hidden
$testProcess.ExitCode
```

`npm run web:smoke` 会检查 PWA 应用外壳、双语和设置、鼠标/键盘棋盘操作、完整人机对局、逐手复盘、棋谱回放和新手教学；`npm start -- --friend-room-ui-smoke-test` 会自动打开两位访客，检查邀请、服务端走子校验、同步、刷新重连、认输和 PGN 分享。`ExitCode` 为 `0` 表示相应流程通过。要验收最终便携 EXE，可将 `--ui-smoke-test` 或 `--friend-room-ui-smoke-test` 参数传给生成的 EXE。

## 参与项目

当前仓库尚处本机验证阶段。准备中的 [贡献指南](./CONTRIBUTING.md)、[行为准则](./CODE_OF_CONDUCT.md)、[安全政策](./SECURITY.md) 和 [Issue/PR 模板](./.github) 不代表已开放外部协作；请先看 [公开发布检查清单](./PUBLIC_RELEASE_CHECKLIST.md)。版本变化记录在 [CHANGELOG.md](./CHANGELOG.md)。
