# Spike 02：Pikafish UCI 接入验证

> 日期：2026-09-24
>
> 状态：UCI 协议验证通过；项目负责人同意仅用于本地流程验证

## 目标

验证 NinePalace 能否通过标准 UCI 文本协议调用 Pikafish，并确定 v0.1 的引擎运行边界。引擎计算棋步；NinePalace 负责界面、对局状态、玩家体验和未来 Coach 的解释层。

## 已确认

- 本机当前没有可调用的 Pikafish 程序，也没有 Emscripten `emcc` 编译器。
- Pikafish 官方最新发行版为 [2026-09-06](https://github.com/official-pikafish/Pikafish/releases)。GitHub Release API 提供单个 `Pikafish.2026-09-06.7z` 发行档，大小 53,603,424 字节，SHA-256 为 `41952bbfe2520faceb5902c69e6ab4845cc999841d2b49a95cc1be7867a25e5b`。
- 已校验发行档 SHA-256 与官方值一致。压缩包包含 Windows x86-64 universal 可执行文件、`pikafish.nnue`、GPL-3.0 `Copying.txt` 和独立的 `NNUE-License.md`；**发行包没有预编译 WebAssembly 文件**。
- 官方发行说明提到 WebAssembly 构建目标；官方 `src/Makefile` 支持 `ARCH=wasm32` 并输出 `pikafish.js`。在当前机器上直接构建浏览器版本需要 Emscripten，当前没有 `emcc`。
- Pikafish 使用 UCI；本项目已准备 Node.js 冒烟脚本，依次发送 `uci`、`isready`、`ucinewgame`、`position startpos`、`go depth 1`，并检查引擎返回 `bestmove` 后能正常退出：[pikafish-uci-smoke.mjs](./spikes/pikafish-uci-smoke.mjs)。

## 实际验证

使用已校验的官方 Windows x86-64 universal 构建，测试结果如下：

- UCI 握手成功：返回 `uciok` 和 `readyok`。
- 引擎成功加载随包 NNUE 权重并完成深度 1 搜索。
- `position startpos` 返回着法 `b2e2`；继续输入规则库生成的 `b2e2 b7e7` 历史后返回 `e2e6`。
- 发送 `quit` 后进程正常退出。

这证明 Node 子进程可以通过 UCI 驱动 Pikafish，且 NinePalace 原型使用的 ICCS 坐标序列可传给引擎。尚未测试移动设备性能、多人并发、完整对局时钟或生产部署。

## 技术结论

v0.1 的技术接口采用 `EngineAdapter`，本地开发和自托管版本可由 Node 服务启动本机 UCI 子进程；浏览器 PWA 只调用应用接口，不直接依赖平台专属可执行文件。官方发行包目前没有预编译 WASM；Worker/WASM 仅在后续能控制包体、启动时间和手机性能时再评估。

## 许可边界与待定事项

- 引擎源码随 `Copying.txt` 采用 GPL-3.0。
- `NNUE-License.md` 另行规定：任何使用 Pikafish 权重都构成对该权重许可的接受；未经许可不得商业使用。仓库关于训练数据采用 ODbL 的说明不能覆盖这项单独限制。
- 本次本地 UCI 技术验证实际加载并使用了该权重；在发现单独许可前未进行公开分发或商业使用。发现限制后曾暂停后续使用；项目负责人现已明确同意仅为本地流程验证继续使用，不包括托管、公开分发或商业使用。
- **已作出的范围决定：** 项目负责人同意先在本地验证版本使用 Pikafish，以跑通人机对局流程。这不等于允许公开分发、线上托管或商业使用。
- **应用集成验证：** Windows x64 便携 EXE 已在打包后启动随包引擎；规则库接受了红方测试着法与 Pikafish 的黑方应手。完整交付路径见项目根目录 `README.md`。
- **发布前限制：** 对外发布或商业化前，需完成 GPL-3.0 对应源码/构建材料义务审查，并处理 NNUE 权重的非商业条款；若项目需要商业使用，须取得权重许可或替换引擎/权重。
