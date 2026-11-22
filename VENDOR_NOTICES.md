# 美术来源与第三方许可

NinePalace 自有的源代码、文档及随仓库发布的自有 2D 美术采用 [MIT 许可证](./LICENSE)。第三方组件使用本页所列的各自条款。

## 项目 2D 美术

四套自然人手图集 `desktop/assets/ninepalace-hand-*.png` 于 2026-10-26 通过图像生成制作，以本项目既有人设和用户确认的手部预览为参考。每套包含伸手、合拢、握持、松开四个姿态。文件清单和绘图提示词保存在 `desktop/assets/HAND_ART.txt`。

2026-11-22 使用内置图像生成更新两位馬棋友的透明立绘。朱羽在原画上换成白色连裤袜，文件为 `desktop/assets/ninepalace-red-horse-white-tights.png`。玄芽参照原有银发、蓝色挑染和黑方馬徽章画成成年角色，穿黑色连裤袜和深色校服，文件为 `desktop/assets/ninepalace-black-horse-adult.png`。

校园背景 `desktop/assets/ninepalace-lobby-campus.png` 为本项目生成的场景插画。主界面棋子边纹由项目绘制，文件为 `desktop/assets/ninepalace-piece-border.svg`。

## xiangqi.js

- 来源：[lengyanyu258/xiangqi.js](https://github.com/lengyanyu258/xiangqi.js)
- 固定版本：Git commit `f9019ac2303d4b80ef0b82fd0515bfb55a80a62b`
- 许可证：BSD-2-Clause，版权及完整条款保存在 `vendor/xiangqi-js/LICENSE`。
- 本项目在 `vendor/xiangqi-js/xiangqi.js` 增加了「王车易位」和「揭棋」所需的走子规则。

## ws

- 来源：[websockets/ws](https://github.com/websockets/ws)，版本 `8.23.0`。
- MIT 许可证。Windows 客户端与远程中转使用此组件处理 WebSocket 连接。

## Electron

- Windows 桌面程序使用 Electron 44.4.5。构建产物附带 Electron 和 Chromium 的许可声明。[Electron 对应发行版与源码](https://github.com/electron/electron/releases/tag/v44.4.5)

## Pikafish

- 来源：[official-pikafish/Pikafish](https://github.com/official-pikafish/Pikafish)
- 引擎发行版为 2026-09-06 的 Windows x86-64 universal 版本，引擎采用 GPL-3.0。[上游发行版与源码下载](https://github.com/official-pikafish/Pikafish/releases/tag/Pikafish-2026-09-06) · [GPL-3.0 全文](./vendor/pikafish/Copying.txt)
- `pikafish.nnue` 适用独立许可，未经许可限非商业使用。[权重许可全文](./vendor/pikafish/NNUE-License.md)
- 原始发行说明保存在 `vendor/pikafish/README.md`。

## Fairy-Stockfish

- 来源：[Fairy-Stockfish-NNUE 象棋专用发行版](https://github.com/fairy-stockfish/Fairy-Stockfish-NNUE/releases/tag/xiangqi-c07e94a5c7cb)。发行仓库提交为 `5fbbb9e15fd882cec18a2a5c3d4bfa25dc07169b`；该发行工作流使用的引擎源码子模块固定在 [ianfab/Fairy-Stockfish commit `84dd49a4bd00b9959b07e1b917d362c46e6f6d75`](https://github.com/ianfab/Fairy-Stockfish/tree/84dd49a4bd00b9959b07e1b917d362c46e6f6d75)。
- 引擎代码许可证：GPL-3.0，完整文本随包保存在 `vendor/fairy-stockfish/Copying.txt`。
- 内置象棋网络：`xiangqi-c07e94a5c7cb.nnue`，适用 CC0；权重与引擎程序的许可证彼此独立。
- 二进制 SHA-256：`0284d80f8b1797927b5ff34a7303444d9c1beb9d3b0b236dbe5d5f814446d31f`。构建来源说明见 `vendor/fairy-stockfish/README.md`。

从源码构建时，引擎程序与权重由开发者从上游获取。再分发含引擎的构建时，请随发行版提供对应源码、构建信息和许可声明，并遵守所带权重的条款。[构建说明](./BUILD.md)
