# 参与 NinePalace

感谢你愿意帮助改进 NinePalace。欢迎提交可复现的问题报告、玩法反馈和代码改动。

## 本机开发

按 [构建说明](./BUILD.md) 安装依赖、配置引擎并运行 Windows 或本机 Web 版。

## 提交前检查

```powershell
npm test
npm run web:smoke
npm start -- --ui-smoke-test
```

Windows EXE 构建使用 `npm run build:win`。提交前请说明运行过的检查、未运行的检查及原因。UI 改动至少确认简体中文和英文、窄屏布局、键盘焦点与常见鼠标/触控操作；规则或引擎改动需覆盖合法性、终局和悔棋路径。

## 贡献内容约定

- 先搜索已有 Issue；较大的功能或架构改动请先开讨论，避免做出与路线图冲突的工作。
- 一个 PR 尽量聚焦一个问题，说明用户可观察到的变化、设计取舍和测试结果。
- 保持 Web 与 Electron 共用的 UI/API 行为一致；不要绕过服务端规则校验。
- 新增图片、音频、字体、引擎或数据时，列出来源、版本和许可证；未经确认不要复制其他棋类游戏的角色、UI、品牌或素材。
- 不要提交账号、密钥、个人棋谱、日志、`node_modules/`、`dist/` 或未经审查的引擎权重。
- 对规则不确定之处，请标注假设并提供局面/着法示例；当前休闲原型不等同正式 WXF 裁判。

## 许可证与贡献者

NinePalace 自有代码和文档采用 [MIT 许可证](./LICENSE)。如果贡献中含有第三方内容，请在 PR 中标明来源和许可。[第三方组件与许可](./VENDOR_NOTICES.md)

## 行为与安全

所有参与者遵守 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。安全漏洞请勿通过公开 Issue 发布利用细节；当前私密报告渠道尚未配置，见 [SECURITY.md](./SECURITY.md)。
