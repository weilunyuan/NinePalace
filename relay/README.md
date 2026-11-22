# NinePalace 远程联机中转

房主在 Windows 客户端选择“好友对局 → 远程联机 → 开房”。应用通过 Viaduct 为房主的回环中转申请临时公网入口，验证连通后显示五位房号。好友用同一版本输入房号加入。双方分别选上方红席和下方黑席并点击“确定”，房主随后点“开始”。[Viaduct 临时入口说明](https://viaduct.sh/articles/name-your-tunnel/)

中转只转送对弈消息，由房主的 NinePalace 维护棋局和验证着法。房号、席位和棋局都保存在房主进程的内存里。对局中短暂断线可在 60 秒内恢复原席位和棋局。任一方主动离开会结束当前房间并释放临时公网入口。免费隧道供小范围试用，受第三方网络可用性和用量限制。[Viaduct 使用条款](https://viaduct.sh/terms/)

## 本机验证

在项目目录用 Node.js 24 运行：

```powershell
npm ci
npm run relay
```

保持中转进程运行。用以下环境变量启动两份测试客户端，分别开房和输入房号加入。设置该变量的客户端共用指定中转，适合本机测试或自建服务。

```powershell
$env:NINEPALACE_RELAY_URL = 'http://127.0.0.1:4174'
npm start
```

## 公网中转

项目提供 [Render Blueprint](../render.yaml)。在 Render 中创建 Blueprint，连接 NinePalace 仓库并应用配置。部署完成后，先在双方的启动环境中把 `NINEPALACE_RELAY_URL` 设为同一个 `https://` 地址，再启动客户端。可访问服务的 `/health` 检查是否就绪。免费实例闲置后会休眠，首次开房或加入可能要等服务启动。[Blueprint 文档](https://render.com/docs/infrastructure-as-code) · [空闲休眠说明](https://render.com/docs/free)

也可以在自己的服务器上以 `HOST=0.0.0.0` 和指定的 `PORT` 运行 `npm ci --omit=dev`、`npm run relay`，由 HTTPS 反向代理转发 `/ninepalace/v2` 的 WebSocket 连接。中转运行一个实例，重启会清空房号。公网客户端要求 HTTPS 或 WSS。

五位房间号用于邀请，玩家加入后，独立的随机会话令牌保留各自席位。中转限制建房与加入频率、并发房间数和消息大小。正式扩大试用范围前，按[公开发布检查清单](../PUBLIC_RELEASE_CHECKLIST.md)复查部署。中转只处理对弈协议，安装包、引擎、模型和本机棋谱由各客户端自行保管。
