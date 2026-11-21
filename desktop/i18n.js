(function () {
  const messages = {
    zh: {
      pageTitle: "NinePalace · 九宫象棋",
      localBadge: "九宫 · 棋局", guest: "访客玩家",
      lobbyAria: "游戏大厅", lobbyPlay: "对弈", lobbySolo: "人机练习", lobbyFriends: "好友对弈", lobbyTools: "教学与棋谱",
      characterPickerAria: "选择你的红黑車馬棋友", characterPickerLabel: "同行棋友",
      redSideShort: "红方", blackSideShort: "黑方",
      chooseRedRook: "选择红方車棋友绯音", chooseRedHorse: "选择红方馬棋友朱羽", chooseBlackRook: "选择黑方車棋友墨铃", chooseBlackHorse: "选择黑方馬棋友玄芽",
      redRookName: "绯音", redHorseName: "朱羽", blackRookName: "墨铃", blackHorseName: "玄芽",
      redRookRole: "红方 · 車", redHorseRole: "红方 · 馬", blackRookRole: "黑方 · 車", blackHorseRole: "黑方 · 馬",
      redRookQuote: "“红方車阵在此，我来替你稳住主线。”", redHorseQuote: "“马走日！绕开正面，奇袭交给我。”", blackRookQuote: "“黑方車阵已经就位，请看我的守势。”", blackHorseQuote: "“我从斜线之外悄悄地跳过去啦！”",
      redRookAria: "红方車棋友：绯音", redHorseAria: "红方馬棋友：朱羽", blackRookAria: "黑方車棋友：墨铃", blackHorseAria: "黑方馬棋友：玄芽",
      heroCharacterLabel: "NINEPALACE · 象棋社棋友", heroCharacterQuote: "“和我一起下盘棋吧！”",
      companionLabel: "同行棋友",
      startGame: "开始对局", tutorial: "新手教学", install: "安装 NinePalace",
      playerSideTitle: "执棋方", playRed: "红方 · 先手", playBlack: "黑方 · 后手",
      createRoom: "创建好友房", joinRoom: "加入好友房", roomEyebrow: "好友对局", joinRoomTitle: "加入好友房",
      roomCreateHelp: "红方先行；好友加入后自动执另一方。", closeRoomDialog: "关闭房间窗口",
      roomCodeLabel: "房间码", roomJoinHelp: "输入朋友分享的 6 位房间码。加入后此设备会保存重连凭据。",
      roomInviteTitle: "邀请好友加入", roomLinkLabel: "邀请链接", copyInviteLink: "复制邀请链接",
      roomAddressLabel: "选择网络地址", roomNetworkNote: "仅限同一局域网或互通的私有网络；应用关闭后房间结束。不要把链接公开到互联网。",
      copySuccess: "已复制邀请链接", copyFailed: "复制失败，请手动选择链接复制。",
      roomCreateFailed: "好友房创建失败。", roomJoinFailed: "无法加入房间。",
      roomWaiting: "房间已创建，等待朋友加入。把邀请链接发给朋友即可。", roomWaitingTurn: "等待对方走棋…",
      roomReconnecting: "连接中断，正在尝试重连…",
      remoteTitle: "远程联机", remoteCreate: "开房", remoteJoin: "加入房间", remoteFiveDigitCode: "五位房间号",
      remoteCopyCode: "复制房间号", remoteCodeCopied: "已复制房间号", remoteLeave: "← 离开房间",
      remoteWaiting: "等待好友加入…", remoteSendCode: "把上方的房间号发给好友。", remoteConnecting: "正在查找房间…",
      remoteStarting: "正在启动中转并创建房间…", remoteTunnelUnavailable: "中转启动失败，请检查网络后重试。",
      remoteRelayRequired: "中转服务地址缺失。", remoteBadRelay: "中转服务地址配置无效。",
      remoteBadCode: "请输入五位房间号。", remoteBadSide: "请选择执红或执黑。",
      remoteUnavailable: "暂时无法连接房间，请检查网络后重试。",
      remoteBusy: "中转服务繁忙，请稍后再试。", remoteRoomMissing: "找不到房间，请核对房间号。",
      remoteRoomFull: "房间已满。", remoteHostOffline: "房主暂时离线，请稍后重试。",
      remoteRoomClosed: "房间已关闭，可返回大厅重新开房。", remoteBadState: "房间同步失败，请重新开房。",
      remoteMoveOffline: "连接中断后暂时无法落子。",
      roomYourTurn: "轮到你走", roomYourRed: "红方 · 你", roomYourBlack: "黑方 · 你",
      blackSide: "黑方",
      youAsRed: "你（红方）", youAsBlack: "你（黑方）", friendAsRed: "好友（红方）", friendAsBlack: "好友（黑方）",
      redPlayer: "红方玩家", blackPlayer: "黑方玩家", friendMeta: "好友对局 · 局域网",
      friendWin: "你赢了", friendLoss: "好友获胜", friendDraw: "本局和棋",
      friendScoreWin: "你获胜 · 好友", friendScoreLoss: "好友获胜 · 你", friendScoreDraw: "红方 · 和棋 · 黑方",
      resignRed: "红方认输", resignBlack: "黑方认输", sharePgn: "复制棋谱", pgnCopied: "棋谱已复制",
      boardInitial: "中国象棋初始局面",
      boardInstructions: "中国象棋棋盘。聚焦棋盘后使用方向键移动焦点，按 Enter 选中或落子",
      matchEyebrow: "练习 · 对阵 {engine}", matchTitle: "练习对局", returnHome: "← 返回大厅",
      engineMeta: "引擎 · 本地运行", noClock: "无计时", redSide: "红方", standardLocal: "标准象棋 · 本地练习",
      initialTurn: "红方 · 先行", userTurn: "你的回合", waitingEngine: "等待引擎", engineThinking: "引擎思考中",
      gameFinished: "本局已结束", gameStatus: "当前回合",
      helpCopy: "选择己方棋子查看合法落点。红方先行，执黑时由引擎先走；可在设置里调整难度。",
      undo: "悔棋", resign: "认输", retryEngine: "重试引擎", moveHistory: "着法记录",
      moveCount: "{count} 手", waiting: "尚未落子", helpTitle: "操作说明",
      variationStart: "推演", variationMode: "推演中 · 非实战", variationTitle: "推演路线", variationExit: "返回实战",
      variationBoardInstructions: "推演棋盘，红黑双方均由你操作。方向键移动焦点，Enter 选择或落子；推演不会改变实战局面。",
      variationBack: "退一步", variationForward: "重做", variationReset: "重置", variationAdopt: "采用首步", variationPlayFirst: "采用首步：{move}",
      variationHelp: "红黑双方都可试走；采用时只提交第一步。", variationEmpty: "在棋盘上试走下一步",
      variationTurn: "推演 · {side}走棋", variationCheck: "推演 · {side}需要应将", variationMate: "推演 · {side}已被将死", variationStalemate: "推演 · {side}无棋可走",
      variationChanged: "实战局面已变化，已退出推演。", variationUnavailable: "当前无法推演，请在轮到你走棋时使用。",
      helpText: "点击己方棋子查看可走位置；聚焦棋盘后，也可用方向键移动焦点，再按 Enter 选择或落子。觉得对手太强，可在设置里调低难度。",
      demoNote: "本地原型：规则由 xiangqi.js 校验，{engine} 负责搜索。暂不提供计时、网络对局或正式比赛裁定。",
      friendDemoNote: "好友房由主持端服务维护局面并校验每步棋；仅用于同一局域网或互通的私有网络，不提供公网连接。",
      resultEyebrow: "对局结束", resultDefault: "本局结束", resultWin: "你赢了",
      finalPosition: "终局", matingPattern: "终局杀法", reviewThisGame: "复盘本局", viewResult: "查看结果",
      redWins: "红方获胜", blackWins: "黑方获胜",
      mateSmothered: "闷宫", mateSmotheredDescription: "炮借底士作架，中士堵住将门，困住将帅。",
      mateIronBolt: "铁门闩", mateIronBoltDescription: "中炮控制中路，车兵配合封住将门。",
      mateDoubleChariot: "双车错", mateDoubleChariotDescription: "双车交错控线，一车封路，一车将杀。",
      mateDoubleCannon: "重炮", mateDoubleCannonDescription: "双炮同线，前炮作架，后炮完成将杀。",
      mateHorseCannon: "马后炮", mateHorseCannonDescription: "马封住逃路并作炮架，后炮隔马将杀。",
      mateGeneric: "将杀", mateGenericDescription: "对方将帅正被将军，且没有合法应对。",
      finishStalemate: "困毙", finishStalemateDescription: "对方虽未被将军，但已经无棋可走。",
      finishResignation: "本局以认输结束。",
      resultLoss: "{engine} 获胜", resultDraw: "本局和棋", playAgain: "再来一局",
      scoreWin: "访客玩家 <strong>获胜</strong> · {engine}", scoreLoss: "访客玩家 · <strong>{engine} 获胜</strong>",
      scoreDraw: "访客玩家 <strong>· 和棋 ·</strong> {engine}", footer: "NINEPALACE · 本地对弈验证版 · v0.1",
      switchToEnglish: "切换到英文", switchToChinese: "Switch to Simplified Chinese",
      settingsOpen: "打开设置", settingsEyebrow: "偏好设置", settingsTitle: "偏好设置",
      engineTitle: "对弈引擎", engineHelp: "Pikafish 为默认选项；切换后应用于新对局。Fairy-Stockfish 引擎为 GPLv3，内置象棋网络为 CC0。",
      enginePikafish: "Pikafish（默认）", engineFairy: "Fairy-Stockfish（引擎 GPLv3 / 网络 CC0）",
      difficultyTitle: "人机难度", difficultyHelp: "练习和轻松会主动选择较弱着法；标准与较强会尽量走好。默认从练习开始。",
      difficultyBeginner: "练习（明显放水）", difficultyEasy: "轻松（适度放水）", difficultyNormal: "标准（认真应对）", difficultyStrong: "较强（深入计算）",
      closeSettings: "关闭设置", motionTitle: "动画效果", motionHelp: "系统默认遵循设备的动态效果偏好。",
      motionSystem: "跟随系统", motionReduce: "减少动画", motionFull: "完整动画",
      soundTitle: "落子音效", soundHelp: "默认开启；双方每走一步都会播放轻微的木质落子声，可随时关闭。",
      settingsSaved: "这些偏好保存在本机。",
      statusHome: "开始一盘本地人机对局", statusRedTurn: "轮到你走（红方）",
      statusBlackTurn: "轮到你走（黑方）", statusUndoneBlack: "已悔棋，轮到你走（黑方）",
      statusThinking: "{engine} 正在思考…", statusUndone: "已悔棋，轮到你走（红方）",
      statusEngineError: "引擎暂时无法应手：", statusOffline: "本地游戏服务未连接。请先运行 npm run web。",
      statusOfflineStart: "无法连接本地游戏服务：", statusOfflineEnd: "。请先运行 npm run web。",
      reasonCapture: "将帅被吃", reasonCheckmate: "将死", reasonStalemate: "无棋可走",
      reasonDraw: "达到本地原型的和棋条件", reasonResign: "你选择认输",
      emptySquare: "空位",
      confirmResign: "确定认输并结束本局吗？", toastUndo: "目前没有可悔的完整回合", toastNoMove: "现在不能落子",
      toastIllegal: "这步棋不符合规则", toastNoEngine: "引擎暂时无法应手，请稍后重试。",
      tutorial1Progress: "入门教学 · 1 / 3", tutorial1Title: "先选中一枚红方棋子",
      tutorial1Copy: "红方先行。点击棋盘上的红炮 b2，看看它可以走到哪里。",
      tutorial2Progress: "入门教学 · 2 / 3", tutorial2Title: "选择一个合法落点",
      tutorial2Copy: "亮起的位置都符合象棋规则。炮沿直线行走；吃子时必须隔着恰好一枚棋子。点击 e2，让红炮走一步。",
      tutorial3Progress: "入门教学 · 3 / 3", tutorial3Title: "看看引擎如何应手",
      tutorial3Copy: "你的着法已提交，{engine} 正在自动应对。稍等片刻即可完成教学。",
      tutorialDoneProgress: "入门教学 · 已完成", tutorialDoneTitle: "现在可以自由对弈了",
      tutorialDoneCopy: "将死对方将帅即可获胜；对方无合法着法时也判负。着法会记录在右侧，悔棋会撤回一个完整回合。",
      skipTutorial: "跳过教学", finishTutorial: "结束教学",
      historyButton: "最近棋谱", historyEyebrow: "本地对局", historyTitle: "最近棋谱",
      historyEmpty: "还没有保存的对局。完成一盘后，棋谱会保存在这台设备上。",
      historyRecord: "{count} 手 · {date}", backToHistory: "← 返回棋谱",
      replayEyebrow: "复盘 · 本地棋谱", replayTitle: "棋谱回放", replayResult: "对局结果",
      replayMovesTitle: "着法", replayBoardLabel: "棋谱回放棋盘", replayFirst: "跳到开局",
      replayPrevious: "上一步", replayNext: "下一步", replayLast: "跳到结束",
      replayStart: "初始局面", replayPosition: "{current} / {total} 手", replayNoMoves: "这盘没有着法记录。",
      reviewTitle: "逐手复盘", reviewHelp: "本局所选引擎会逐手评估并给出推荐着法；这是快速估算，供练习参考。",
      reviewStart: "开始逐手复盘", reviewRerun: "重新分析", reviewProgress: "正在评估局面 {completed}/{total}…",
      reviewNoMoves: "这盘没有可分析的着法。", reviewSummary: "复盘完成 · {best} 步正着，{good} 步好棋，{inaccuracy} 处可改进，{mistake} 次失误，{blunder} 次严重失误。",
      reviewSelectMove: "点击一着，查看当时的评价与引擎推荐。", reviewPlayedMove: "实战着法", reviewBestMove: "引擎正招", reviewLineTitle: "引擎预想变化",
      reviewViewBest: "在棋盘上看正招", reviewViewPlayed: "回到实战走法", reviewBestPosition: "第 {move} 手 · 推荐着法",
      reviewQualityBest: "正着", reviewQualityGood: "好棋", reviewQualityInaccuracy: "可改进", reviewQualityMistake: "失误", reviewQualityBlunder: "严重失误", reviewQualityUnknown: "暂无判断",
      reviewFeedbackBest: "你走的正是 {engine} 在此局面的首选着法。",
      reviewFeedbackGood: "整体不错，与引擎首选着法的差距较小。",
      reviewFeedbackInaccuracy: "有更好的选择；看看引擎正招能否让局面更稳。",
      reviewFeedbackMistake: "这步让局面明显变差，建议对照引擎正招。",
      reviewFeedbackBlunder: "这步可能漏算了关键变化，局面因此明显落后。",
      reviewFeedbackUnknown: "引擎没有取得足够评估信息，暂时无法准确分级。",
      reviewFailed: "复盘失败：", reviewMoveLabel: "第 {move} 手",
      river: "楚 河     漢 界", fileRank: "{file}路{rank}线",
      pieceRedK: "红帅", pieceRedA: "红仕", pieceRedB: "红相", pieceRedN: "红马", pieceRedR: "红车", pieceRedC: "红炮", pieceRedP: "红兵",
      pieceBlackK: "黑将", pieceBlackA: "黑士", pieceBlackB: "黑象", pieceBlackN: "黑马", pieceBlackR: "黑车", pieceBlackC: "黑炮", pieceBlackP: "黑卒",
    },
    en: {
      pageTitle: "NinePalace · Xiangqi",
      localBadge: "Local practice", guest: "Guest player",
      lobbyAria: "Game lobby", lobbyPlay: "Play", lobbySolo: "SOLO PRACTICE", lobbyFriends: "Play with friends", lobbyTools: "Lessons and game records",
      characterPickerAria: "Choose a red or black rook or horse buddy", characterPickerLabel: "Companions",
      redSideShort: "RED", blackSideShort: "BLACK",
      chooseRedRook: "Choose Hina, the red rook buddy", chooseRedHorse: "Choose Akane, the red horse buddy", chooseBlackRook: "Choose Suzu, the black rook buddy", chooseBlackHorse: "Choose Nagi, the black horse buddy",
      redRookName: "Hina", redHorseName: "Akane", blackRookName: "Suzu", blackHorseName: "Nagi",
      redRookRole: "RED · CHARIOT", redHorseRole: "RED · HORSE", blackRookRole: "BLACK · CHARIOT", blackHorseRole: "BLACK · HORSE",
      redRookQuote: "“The red rook line is set. I'll hold the center.”", redHorseQuote: "“The horse moves in an L—I'll find a clever route!”", blackRookQuote: "“The black rook is in place. Let's keep our guard.”", blackHorseQuote: "“I'll hop in from beyond the diagonal!”",
      redRookAria: "Red rook buddy: Hina", redHorseAria: "Red horse buddy: Akane", blackRookAria: "Black rook buddy: Suzu", blackHorseAria: "Black horse buddy: Nagi",
      heroCharacterLabel: "YOUR XIANGQI CLUB BUDDY", heroCharacterQuote: "“Let's play a game together!”",
      companionLabel: "COMPANION",
      startGame: "Play vs engine", tutorial: "How to play", install: "Install NinePalace",
      playerSideTitle: "Your side", playRed: "Red · First", playBlack: "Black · Second",
      createRoom: "Create friend room", joinRoom: "Join friend room", roomEyebrow: "Friend match", joinRoomTitle: "Join a friend room",
      roomCreateHelp: "Red moves first. Your friend automatically takes the other side.", closeRoomDialog: "Close room dialog",
      roomCodeLabel: "Room code", roomJoinHelp: "Enter the 6-character code your friend shared. This device saves a reconnect token.",
      roomInviteTitle: "Invite a friend", roomLinkLabel: "Invite link", copyInviteLink: "Copy invite link",
      roomAddressLabel: "Choose network address", roomNetworkNote: "Same local or connected private network only. The room ends when the host app closes. Do not expose this link to the public internet.",
      copySuccess: "Invite link copied", copyFailed: "Could not copy. Select and copy the link manually.",
      roomCreateFailed: "Could not create the room.", roomJoinFailed: "Could not join the room.",
      roomWaiting: "Room created. Send the invite link to your friend.", roomWaitingTurn: "Waiting for your friend…",
      roomReconnecting: "Connection lost. Trying to reconnect…",
      remoteTitle: "Remote play", remoteCreate: "Create room", remoteJoin: "Join room", remoteFiveDigitCode: "Five-digit room code",
      remoteCopyCode: "Copy room code", remoteCodeCopied: "Room code copied", remoteLeave: "← Leave room",
      remoteWaiting: "Waiting for your friend…", remoteSendCode: "Send the room code above to your friend.", remoteConnecting: "Finding room…",
      remoteStarting: "Starting the relay and creating a room…", remoteTunnelUnavailable: "The relay could not start. Check your connection and try again.",
      remoteRelayRequired: "The relay address is missing.", remoteBadRelay: "The relay address configuration is invalid.",
      remoteBadCode: "Enter the five-digit room code.", remoteBadSide: "Choose Red or Black.",
      remoteUnavailable: "Cannot reach the room. Check your connection and try again.",
      remoteBusy: "The relay is busy. Try again shortly.", remoteRoomMissing: "Room not found. Check the code.",
      remoteRoomFull: "The room is full.", remoteHostOffline: "The host is offline. Try again shortly.",
      remoteRoomClosed: "The room has closed. Return to the lobby to start another game.", remoteBadState: "Could not sync the room. Create a new room to continue.",
      remoteMoveOffline: "Moves are paused while the connection is down.",
      roomYourTurn: "Your move", roomYourRed: "Red · You", roomYourBlack: "Black · You",
      blackSide: "Black",
      youAsRed: "You (Red)", youAsBlack: "You (Black)", friendAsRed: "Friend (Red)", friendAsBlack: "Friend (Black)",
      redPlayer: "Red player", blackPlayer: "Black player", friendMeta: "Friend match · local network",
      friendWin: "You win", friendLoss: "Your friend wins", friendDraw: "Draw",
      friendScoreWin: "You win · Friend", friendScoreLoss: "Friend wins · You", friendScoreDraw: "Red · Draw · Black",
      resignRed: "Red resigned", resignBlack: "Black resigned", sharePgn: "Copy game record", pgnCopied: "Game record copied",
      boardInitial: "Starting Xiangqi position",
      boardInstructions: "Xiangqi board. Focus the board, use arrow keys to move the cursor, then press Enter to select or move.",
      matchEyebrow: "Practice · vs {engine}", matchTitle: "Practice game", returnHome: "← Back to lobby",
      engineMeta: "Engine · runs locally", noClock: "No clock", redSide: "Red", standardLocal: "Standard Xiangqi · Local practice",
      initialTurn: "Red to move first", userTurn: "Your turn", waitingEngine: "Engine to move", engineThinking: "Engine thinking",
      gameFinished: "Game over", gameStatus: "CURRENT TURN",
      helpCopy: "Select your pieces to see legal moves. Red moves first; if you choose Black, the engine opens. Adjust difficulty in Settings.",
      undo: "Undo", resign: "Resign", retryEngine: "Retry engine", moveHistory: "Move history",
      moveCount: "{count} moves", waiting: "No moves yet", helpTitle: "Controls",
      variationStart: "Try moves", variationMode: "WHAT IF · NOT LIVE", variationTitle: "Practice line", variationExit: "Return to game",
      variationBoardInstructions: "Practice board. Play both sides with arrow keys and Enter. Practice moves do not change the live game.",
      variationBack: "Undo", variationForward: "Redo", variationReset: "Reset", variationAdopt: "Play first move", variationPlayFirst: "Play first: {move}",
      variationHelp: "Try both sides. Only the first move is played if you adopt it.", variationEmpty: "Try a move on the board",
      variationTurn: "What if · {side} to move", variationCheck: "What if · {side} is in check", variationMate: "What if · {side} is checkmated", variationStalemate: "What if · {side} has no legal move",
      variationChanged: "The live position changed. Practice mode was closed.", variationUnavailable: "Try moves when it is your turn in an active game.",
      helpText: "Select one of your pieces to see legal moves. You can also focus the board, move with the arrow keys, and press Enter to select or move. Lower the difficulty in Settings if the engine feels too strong.",
      demoNote: "Local prototype: xiangqi.js checks the rules and {engine} searches for moves. Clocks, online play, and official tournament adjudication are not included.",
      friendDemoNote: "The host service maintains the board and validates every move. For a local or connected private network only; public internet hosting is not included.",
      resultEyebrow: "GAME COMPLETE", resultDefault: "Game complete", resultWin: "You win",
      finalPosition: "Final position", matingPattern: "CHECKMATE PATTERN", reviewThisGame: "Review this game", viewResult: "View result",
      redWins: "RED WINS", blackWins: "BLACK WINS",
      mateSmothered: "Smothered cannon", mateSmotheredDescription: "An advisor screens the cannon while the central advisor blocks the general's escape.",
      mateIronBolt: "Iron bolt", mateIronBoltDescription: "A central cannon restricts the defense while a chariot or soldier closes the net.",
      mateDoubleChariot: "Double chariot", mateDoubleChariotDescription: "One chariot cuts off the escape route; the other delivers the final check.",
      mateDoubleCannon: "Double cannon", mateDoubleCannonDescription: "The front cannon acts as a screen for the rear cannon's final check.",
      mateHorseCannon: "Horse-cannon mate", mateHorseCannonDescription: "The horse blocks the exits and screens the cannon behind it.",
      mateGeneric: "Checkmate", mateGenericDescription: "The opposing general is in check with no legal response.",
      finishStalemate: "Stalemate win", finishStalemateDescription: "The opponent has no legal move. In Xiangqi, this is a loss, not a draw.",
      finishResignation: "This game ended by resignation.",
      resultLoss: "{engine} wins", resultDraw: "Draw", playAgain: "Play again",
      scoreWin: "<strong>Guest player wins</strong> · {engine}", scoreLoss: "Guest player · <strong>{engine} wins</strong>",
      scoreDraw: "Guest player <strong>· Draw ·</strong> {engine}", footer: "NINEPALACE · Local playtest · v0.1",
      switchToEnglish: "Switch to English", switchToChinese: "切换到简体中文",
      settingsOpen: "Open settings", settingsEyebrow: "Preferences", settingsTitle: "Preferences",
      engineTitle: "Playing engine", engineHelp: "Pikafish is the default; the choice applies to new games. Fairy-Stockfish is GPLv3; its bundled Xiangqi network is CC0.",
      enginePikafish: "Pikafish (default)", engineFairy: "Fairy-Stockfish (GPLv3 engine / CC0 network)",
      difficultyTitle: "AI difficulty", difficultyHelp: "Practice and Relaxed deliberately choose weaker moves; Standard and Strong aim for the best move. Start at Practice.",
      difficultyBeginner: "Practice (much weaker)", difficultyEasy: "Relaxed (some weaker moves)", difficultyNormal: "Standard (plays seriously)", difficultyStrong: "Strong (deeper search)",
      closeSettings: "Close settings", motionTitle: "Motion", motionHelp: "By default, NinePalace follows your device motion preference.",
      motionSystem: "Follow system", motionReduce: "Reduce motion", motionFull: "Full motion",
      soundTitle: "Piece-drop sound", soundHelp: "On by default. A soft wooden click plays after each player's move; you can turn it off any time.",
      settingsSaved: "These preferences are saved on this device.",
      statusHome: "Ready for a local engine game", statusRedTurn: "Your turn (Red)",
      statusBlackTurn: "Your turn (Black)", statusUndoneBlack: "Move undone. Your turn (Black)",
      statusThinking: "{engine} is thinking…", statusUndone: "Move undone. Your turn (Red)",
      statusEngineError: "Engine could not move: ", statusOffline: "Local game service is disconnected. Run npm run web first.",
      statusOfflineStart: "Could not connect to local game service: ", statusOfflineEnd: ". Run npm run web first.",
      reasonCapture: "General captured", reasonCheckmate: "Checkmate", reasonStalemate: "No legal moves",
      reasonDraw: "Prototype draw condition reached", reasonResign: "You resigned",
      emptySquare: "Empty square",
      confirmResign: "Resign and end this game?", toastUndo: "There is no complete turn to undo yet.", toastNoMove: "You cannot move right now.",
      toastIllegal: "That move is not legal.", toastNoEngine: "The engine could not move. Please try again.",
      tutorial1Progress: "Quick guide · 1 / 3", tutorial1Title: "Select a Red piece",
      tutorial1Copy: "Red moves first. Click the red cannon on b2 to see where it can move.",
      tutorial2Progress: "Quick guide · 2 / 3", tutorial2Title: "Choose a legal square",
      tutorial2Copy: "Highlighted squares are legal. Cannons move in straight lines and capture by jumping exactly one piece. Move the cannon to e2.",
      tutorial3Progress: "Quick guide · 3 / 3", tutorial3Title: "Watch the engine reply",
      tutorial3Copy: "Your move is in. {engine} is replying automatically; the guide will finish when it does.",
      tutorialDoneProgress: "Quick guide · Complete", tutorialDoneTitle: "You are ready to play",
      tutorialDoneCopy: "Checkmate the opposing general to win; a side with no legal moves also loses. Moves are recorded on the right, and Undo takes back a complete turn.",
      skipTutorial: "Skip guide", finishTutorial: "Finish guide",
      historyButton: "Recent games", historyEyebrow: "Local records", historyTitle: "Recent games",
      historyEmpty: "No saved games yet. Finish a game and its record will be saved on this device.",
      historyRecord: "{count} moves · {date}", backToHistory: "← Back to records",
      replayEyebrow: "Review · Local record", replayTitle: "Game replay", replayResult: "Game result",
      replayMovesTitle: "Moves", replayBoardLabel: "Game replay board", replayFirst: "Go to start",
      replayPrevious: "Previous move", replayNext: "Next move", replayLast: "Go to end",
      replayStart: "Starting position", replayPosition: "{current} / {total} moves", replayNoMoves: "This game has no recorded moves.",
      reviewTitle: "Move-by-move review", reviewHelp: "The selected engine evaluates each move and suggests an alternative. This is a quick estimate for practice.",
      reviewStart: "Review every move", reviewRerun: "Analyze again", reviewProgress: "Evaluating position {completed}/{total}…",
      reviewNoMoves: "There are no moves to analyze.", reviewSummary: "Review complete · {best} best, {good} good, {inaccuracy} improvable, {mistake} mistakes, {blunder} major mistakes.",
      reviewSelectMove: "Select a move to see its rating and the engine's recommendation.", reviewPlayedMove: "Played", reviewBestMove: "Engine's pick", reviewLineTitle: "Engine's continuation",
      reviewViewBest: "Show recommendation on board", reviewViewPlayed: "Show played move", reviewBestPosition: "Move {move} · recommended line",
      reviewQualityBest: "Best", reviewQualityGood: "Good", reviewQualityInaccuracy: "Inaccuracy", reviewQualityMistake: "Mistake", reviewQualityBlunder: "Major mistake", reviewQualityUnknown: "Unrated",
      reviewFeedbackBest: "You played {engine}'s top choice in this position.",
      reviewFeedbackGood: "Solid overall; it is close to the engine's top choice.",
      reviewFeedbackInaccuracy: "There was a better option; compare it with the engine's pick.",
      reviewFeedbackMistake: "This move noticeably worsens the position. Compare it with the engine's pick.",
      reviewFeedbackBlunder: "A key continuation may have been missed, leaving the position much worse.",
      reviewFeedbackUnknown: "The engine could not get enough evaluation data to grade this move.",
      reviewFailed: "Review failed: ", reviewMoveLabel: "Move {move}",
      river: "RIVER", fileRank: "{file}-file, rank {rank}",
      pieceRedK: "Red king", pieceRedA: "Red advisor", pieceRedB: "Red bishop", pieceRedN: "Red knight", pieceRedR: "Red rook", pieceRedC: "Red cannon", pieceRedP: "Red pawn",
      pieceBlackK: "Black king", pieceBlackA: "Black advisor", pieceBlackB: "Black bishop", pieceBlackN: "Black knight", pieceBlackR: "Black rook", pieceBlackC: "Black cannon", pieceBlackP: "Black pawn",
    },
  };

  let language = "zh";
  try {
    language = localStorage.getItem("ninepalace.preferences.language") === "en" ? "en" : "zh";
  } catch {}

  function t(key, values = {}) {
    const template = messages[language][key] ?? messages.zh[key] ?? key;
    return template.replace(/\{(\w+)\}/g, (_match, name) => String(values[name] ?? ""));
  }

  function applyStatic() {
    document.documentElement.lang = language === "en" ? "en" : "zh-CN";
    document.title = t("pageTitle");
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      node.textContent = t(node.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-html]").forEach((node) => {
      node.innerHTML = t(node.dataset.i18nHtml);
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((node) => {
      node.setAttribute("aria-label", t(node.dataset.i18nAria));
    });
    const toggle = document.querySelector("#language-toggle");
    if (toggle) {
      toggle.textContent = language === "zh" ? "EN" : "中文";
      toggle.setAttribute("aria-label", t(language === "zh" ? "switchToEnglish" : "switchToChinese"));
      toggle.setAttribute("title", t(language === "zh" ? "switchToEnglish" : "switchToChinese"));
    }
  }

  function setLanguage(nextLanguage) {
    language = nextLanguage === "en" ? "en" : "zh";
    try { localStorage.setItem("ninepalace.preferences.language", language); } catch {}
    applyStatic();
    window.dispatchEvent(new CustomEvent("ninepalace:language-change", { detail: { language } }));
  }

  function localizeStatus(message) {
    const fixedMessages = {
      "开始一盘本地人机对局": "statusHome",
      "轮到你走（红方）": "statusRedTurn",
      "轮到你走（黑方）": "statusBlackTurn",
      "已悔棋，轮到你走（红方）": "statusUndone",
      "已悔棋，轮到你走（黑方）": "statusUndoneBlack",
      "本地游戏服务未连接。请先运行 npm run web。": "statusOffline",
      "房间已创建，等待朋友加入": "roomWaiting",
      "等待对方走棋": "roomWaitingTurn",
      "轮到你走": "roomYourTurn",
      "黑方认输": "resignBlack",
      "红方认输": "resignRed",
      "目前没有可悔的完整回合": "toastUndo",
      "这步棋不符合规则": "toastIllegal",
      "现在不能落子": "toastNoMove",
      "远程房间暂时无法落子": "remoteMoveOffline",
    };
    const thinking = message.match(/^(Pikafish|Fairy-Stockfish) 正在思考…$/);
    if (thinking) return t("statusThinking", { engine: thinking[1] });
    if (fixedMessages[message]) return t(fixedMessages[message]);
    if (message.startsWith("引擎暂时无法应手：")) return `${t("statusEngineError")}${message.slice("引擎暂时无法应手：".length)}`;
    if (message.startsWith("无法连接本地游戏服务：")) {
      return `${t("statusOfflineStart")}${message.slice("无法连接本地游戏服务：".length).replace(/。请先运行 npm run web。$/, "")}${t("statusOfflineEnd")}`;
    }
    return message;
  }

  function pieceName(color, type) {
    const colorName = color === "r" ? "Red" : "Black";
    const key = `piece${colorName}${type.toUpperCase()}`;
    return t(key);
  }

  window.npI18n = { t, setLanguage, getLanguage: () => language, applyStatic, localizeStatus, pieceName };
  applyStatic();
  document.querySelector("#language-toggle").addEventListener("click", () => {
    setLanguage(language === "zh" ? "en" : "zh");
  });
})();
