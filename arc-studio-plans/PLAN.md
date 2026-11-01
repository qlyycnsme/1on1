# Implementation Plan: VoiceConsult — 一对一语音付费咨询 DApp

## Summary
一个基于 Arc Testnet + USDC 的去中心化实时语音咨询平台。用户浏览专家列表、预付 USDC 发起咨询请求，合约锁仓资金；双方通过 WebRTC P2P 语音通话；通话结束后合约按实际通话时长比例释放资金给专家，剩余部分退还给用户。任何人都可以注册成为专家（开放平台）。

## Architecture

- **Blockchain**: Arc Testnet — USDC 作为原生 gas token，无需 ETH，手续费低且稳定，非常适合小额 USDC 支付场景
- **Contract**: `VoiceConsult.sol` — 核心托管合约，管理专家注册、会话创建、资金锁仓与按比例释放
  - `registerExpert(ratePerMinute, profileIpfsHash)` — 任何人注册为专家
  - `requestSession(expertAddress, durationMinutes)` — 用户预付 USDC 创建会话，资金锁仓
  - `startSession(sessionId)` — 专家接受，记录开始时间戳
  - `endSession(sessionId)` — 任一方结束，按实际时长比例结算 USDC
  - `cancelSession(sessionId)` — 会话未开始时全额退款用户
- **Frontend**: React + Tailwind + wagmi + ConnectKit
  - 三个主视图：专家市场（浏览/注册）、会话请求流程、通话间（WebRTC）
  - WebRTC 信令通过轻量 WebSocket 中继（Vite 开发服务器插件）
- **Wallet**: ConnectKit（默认）

## Files to Create/Modify

1. `contracts/VoiceConsult.sol` — 核心托管合约：专家注册、会话生命周期、USDC 锁仓与按比例结算
2. `src/config.ts` — 添加合约地址常量（部署后填入）
3. `src/hooks/useVoiceConsult.ts` — wagmi hooks 封装：读写合约的所有交互逻辑
4. `src/hooks/useWebRTC.ts` — WebRTC P2P 语音通话逻辑（getUserMedia、RTCPeerConnection、信令）
5. `src/components/ExpertCard.tsx` — 专家卡片：头像、简介、每分钟费率、发起咨询按钮
6. `src/components/ExpertList.tsx` — 专家市场页：浏览所有注册专家
7. `src/components/RegisterExpert.tsx` — 专家注册表单：设置费率和简介
8. `src/components/SessionRequest.tsx` — 咨询请求：选择时长、USDC 授权 + 锁仓，等待专家接受
9. `src/components/CallRoom.tsx` — 通话间：WebRTC 语音控制（静音/结束）、实时计时器、结束结算按钮
10. `src/components/SessionHistory.tsx` — 我的历史会话（作为用户或专家）
11. `src/App.tsx` — 修改：顶层路由，整合 ConnectKit + 各视图切换

## Build Sequence

1. **写合约并部署** — 编写 `VoiceConsult.sol`（USDC `transferFrom` 锁仓、时间戳计算、按比例 `transfer` 结算），经过安全审查后部署到 Arc Testnet
2. **合约 hooks** — 实现 `useVoiceConsult.ts`：`useRegisterExpert`、`useRequestSession`（含 USDC approve 流程）、`useStartSession`、`useEndSession`、`useCancelSession`、`useGetExperts`、`useGetSession`
3. **WebRTC hook** — 实现 `useWebRTC.ts`：麦克风权限、RTCPeerConnection、ICE 候选交换（轻量 WebSocket 信令），仅音频
4. **专家市场 UI** — `ExpertList` + `ExpertCard` + `RegisterExpert` 页面
5. **咨询请求流程 UI** — `SessionRequest`：输入时长 → USDC approve → `requestSession` 合约调用 → 等待专家界面
6. **通话间 UI** — `CallRoom`：WebRTC 语音 + 实时计时器 + 静音/结束按钮 + 结算触发
7. **历史记录 & App 路由** — `SessionHistory` + 更新 `App.tsx` 整合所有视图
8. **测试 & 收尾** — faucet 提示、USDC 余额检测、错误边界

## Done When

- [ ] 任意钱包地址可注册为专家（设置每分钟费率）
- [ ] 用户可浏览专家列表，选择一位并预付 USDC 发起咨询请求
- [ ] 专家接受后，双方浏览器建立 WebRTC P2P 语音通话
- [ ] 任意一方点击"结束通话"后，合约按实际通话时长比例将 USDC 转给专家，剩余退回用户
- [ ] 会话未开始时可取消并全额退款
- [ ] 所有合约交互在 Arc Testnet 上使用真实 USDC（可从 faucet.circle.com 获取测试币）
- [ ] 合约通过安全审查，无未解决的高危漏洞

## Notes

- WebRTC 信令：P2P 连接需要一个信令通道交换 SDP offer/answer，使用轻量 WebSocket 中继（Vite 开发服务器插件），不依赖第三方 SDK。
- 合约安全：资金托管合约会经过平衡安全审查（Critical + High），确保 USDC 不会被锁死或被盗。
- 测试币：需要从 https://faucet.circle.com 获取 Arc Testnet USDC 才能测试完整支付流程。
