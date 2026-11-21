# 第三方组件与许可提示

## 项目手部美术来源记录

四套自然人手图集 `desktop/assets/ninepalace-hand-*.png` 于 2026-10-26 通过内置 image_gen 制作，以本项目既有人设和用户确认的手部预览为参考。每套包含伸手、合拢、握持、松开四个完整绘制姿态；原有角色立绘未被修改。文件清单和最终绘图提示词保存在 `desktop/assets/HAND_ART.txt`。此处仅记录制作来源，不替代项目的公开发布检查或许可证选择。

本地验证版会随程序使用以下第三方组件。这个构建仅用于本地流程验证；在公开发布、托管或商业使用之前，必须重新审查组件、引擎与权重的许可义务。

## xiangqi.js

- 来源：[lengyanyu258/xiangqi.js](https://github.com/lengyanyu258/xiangqi.js)
- 固定版本：Git commit `f9019ac2303d4b80ef0b82fd0515bfb55a80a62b`
- 许可证：BSD-2-Clause，版权及完整条款保存在 `vendor/xiangqi-js/LICENSE`。
- 本项目使用原版规则源文件 `vendor/xiangqi-js/xiangqi.js`。

## ws

- 来源：[websockets/ws](https://github.com/websockets/ws)，版本 `8.23.0`。
- MIT 许可证。Windows 客户端与远程中转使用此组件处理 WebSocket 连接。

## Pikafish

- 来源：[official-pikafish/Pikafish](https://github.com/official-pikafish/Pikafish)
- 引擎发行版：2026-09-06，Windows x86-64 universal。
- 引擎代码许可证：GPL-3.0，完整许可文本位于 `vendor/pikafish/Copying.txt`。
- 权重文件：`vendor/pikafish/pikafish.nnue`，适用独立的 `vendor/pikafish/NNUE-License.md`。该许可要求合法使用，并规定未经许可不得商业使用。
- 原始发行说明保存在 `vendor/pikafish/README.md`。

## Fairy-Stockfish（可选引擎）

- 来源：[Fairy-Stockfish-NNUE 象棋专用发行版](https://github.com/fairy-stockfish/Fairy-Stockfish-NNUE/releases/tag/xiangqi-c07e94a5c7cb)。发行仓库提交为 `5fbbb9e15fd882cec18a2a5c3d4bfa25dc07169b`；该发行工作流使用的引擎源码子模块固定在 [ianfab/Fairy-Stockfish commit `84dd49a4bd00b9959b07e1b917d362c46e6f6d75`](https://github.com/ianfab/Fairy-Stockfish/tree/84dd49a4bd00b9959b07e1b917d362c46e6f6d75)。
- 引擎代码许可证：GPL-3.0，完整文本随包保存在 `vendor/fairy-stockfish/Copying.txt`。
- 内置象棋网络：`xiangqi-c07e94a5c7cb.nnue`，适用 CC0；权重与引擎程序的许可证彼此独立。
- 二进制 SHA-256：`0284d80f8b1797927b5ff34a7303444d9c1beb9d3b0b236dbe5d5f814446d31f`。构建来源说明见 `vendor/fairy-stockfish/README.md`。

这个目录和便携版 EXE 仅用于用户明确要求的本地验证，不应上传、公开分发、用于商业服务或用于在线作弊。Pikafish 源码与构建信息可从其官方仓库取得；如需对外分发包含该 GPL 引擎的版本，先提供并核实相应源码、构建脚本、许可声明和发行义务。不要将“能打包运行”视为“已获商业或公开分发授权”。
