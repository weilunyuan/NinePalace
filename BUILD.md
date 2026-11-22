# 从源码构建 NinePalace

桌面版和便携 EXE 的目标平台为 Windows x64。使用 Git、Node.js 24 LTS 和随 Node.js 安装的 npm。请在 PowerShell 中执行以下命令。

```powershell
git clone https://github.com/weilunyuan/NinePalace.git
Set-Location NinePalace
npm.cmd ci
```

## 准备人机引擎

揭棋的人机由项目自身实现。好友对局也可直接运行。标准象棋默认使用 Pikafish，也能在设置里切换到 Fairy-Stockfish。人机「王车易位」自动使用 Fairy-Stockfish。

| 引擎 | 下载和放置方法 |
| --- | --- |
| Fairy-Stockfish | 下载 `fairy-stockfish_x86-64.exe`，改名为 `fairy-stockfish.exe` 后放到 `vendor/fairy-stockfish/`。该版本内置象棋网络。仓库已提供同目录下的 `palace-castling.ini`。 [象棋专用发行版](https://github.com/fairy-stockfish/Fairy-Stockfish-NNUE/releases/tag/xiangqi-c07e94a5c7cb) |
| Pikafish | 解压 `Pikafish.2026-09-06.7z`，把 `Pikafish-Windows-x86-64-universal.exe` 改名为 `pikafish.exe`，与 `pikafish.nnue` 一起放到 `vendor/pikafish/`。 [Pikafish 2026-09-06](https://github.com/official-pikafish/Pikafish/releases/tag/Pikafish-2026-09-06) |

引擎二进制和权重由开发者从上述发行页获取。Fairy-Stockfish 的二进制校验值和源码版本记录在引擎目录，Pikafish 的权重另有随附条款。[Fairy-Stockfish 构建来源](./vendor/fairy-stockfish/README.md) · [Pikafish 权重许可](./vendor/pikafish/NNUE-License.md)

## 运行与打包

```powershell
npm.cmd start
```

关闭桌面窗口后执行打包命令。

```powershell
npm.cmd run build:win
```

构建产物为 `dist/NinePalace-0.1.0-win-x64.exe`，是未签名的 Windows x64 便携版。打包会带入已放入 `vendor/` 的引擎和权重，以及项目与第三方许可文件。对外分发引擎时请提供相应源码和许可声明。[第三方组件与许可](./VENDOR_NOTICES.md)

使用 `npm.cmd run web` 可启动本机 Web/PWA 版，默认地址为 `http://127.0.0.1:4173/`。

## 验证

```powershell
npm.cmd test
npm.cmd run web:smoke
npm.cmd start -- --ui-smoke-test
npm.cmd start -- --friend-room-ui-smoke-test
```

`npm.cmd test` 可在干净克隆后执行，检测到 Fairy-Stockfish 时也会检查其应手和短易位。完整人机界面测试需要上表中的两款引擎。好友房界面测试在本机启动两位玩家。也可以用 `--ui-smoke-test` 参数运行生成的 EXE，退出码 `0` 表示通过。
