# NinePalace 远程联机中转

房主在 Windows 客户端选择“好友对弈 → 远程联机 → 开房”，取得五位数字房间号。好友在另一个 Windows 客户端的同一窗口输入房间号并加入。房主选边，好友执另一方，红方先行。

双方客户端都主动连接同一个中转地址。中转分配房间号并转送走子消息，房主的 NinePalace 维护棋局、验证着法。房号和席位保存在中转进程的内存里，棋局保存在房主电脑上。短暂断线可在 60 秒内恢复原席位和棋局。任一方主动离开会结束当前房间。

## 本机验证

在项目目录用 Node.js 24 运行：

```powershell
npm ci
npm run relay
```

保持中转进程运行。在两份 NinePalace 中打开“远程联机”，分别填写 `http://127.0.0.1:4174`，然后开房、输入房号加入。客户端会保存成功连接时使用的地址。也可以在启动客户端前设置 `NINEPALACE_RELAY_URL`，用它填充首次使用的地址。

## 公网中转

项目提供 [Render Blueprint](../render.yaml)。在 Render 中创建 Blueprint，连接 NinePalace 仓库并应用配置。部署完成后，在两个客户端中填写该服务生成的 `https://` 地址。可访问服务的 `/health` 检查是否就绪。免费实例闲置后会休眠，首次开房或加入可能要等服务启动。[Blueprint 文档](https://render.com/docs/infrastructure-as-code) · [空闲休眠说明](https://render.com/docs/free)

也可以在自己的服务器上以 `HOST=0.0.0.0` 和指定的 `PORT` 运行 `npm ci --omit=dev`、`npm run relay`，由 HTTPS 反向代理转发 `/ninepalace/v1` 的 WebSocket 连接。中转运行一个实例，重启会清空房号。公网客户端要求 HTTPS 或 WSS。

五位房间号用于邀请，玩家加入后，独立的随机会话令牌保留各自席位。中转限制建房与加入频率、并发房间数和消息大小。正式扩大试用范围前，按[公开发布检查清单](../PUBLIC_RELEASE_CHECKLIST.md)复查部署。中转只处理对弈协议，安装包、引擎、模型和本机棋谱由各客户端自行保管。
