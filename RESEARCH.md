# OpenClaw Enterprise - Architecture Research

## 1. OpenClaw 原始碼分析

### 核心架構

OpenClaw 是一個 **本地優先 (local-first)** 的 AI 助理平台，核心是一個 WebSocket Gateway：

```
Gateway (ws://127.0.0.1:18789)
├── Sessions     → 每個對話獨立的狀態管理
├── Agents       → AI 代理實例 (Pi agent, 支援多模型)
├── Channels     → 訊息平台連接 (Telegram, WhatsApp, Slack, Discord 等 13+)
├── Tools        → 代理可調用的工具 (檔案操作, 瀏覽器控制, 終端機等)
├── Plugins      → 擴展系統 (npm 套件分發)
└── Secrets      → API Key 和認證管理
```

### 關鍵模組 (src/)

| 模組 | 檔案數 | 用途 |
|------|--------|------|
| `gateway/` | 197 | WebSocket 伺服器, 路由, 連線管理, 認證 |
| `agents/` | 449 | AI 代理引擎, 沙盒, 工具管理, 技能系統 |
| `config/` | 179 | 配置管理, Zod schema 驗證, 多供應商支援 |
| `channels/` | - | Discord, Slack, Telegram, WhatsApp 等 |
| `sessions/` | 8 | Session key, 權限覆蓋, 發送策略, 事件記錄 |
| `secrets/` | 15 | 憑證管理, 環境變數, 審計追蹤 |
| `plugins/` | - | 內建外掛集合 |

### Session 隔離模型

```
Session
├── session-key      → 唯一識別碼
├── level-overrides  → 權限等級覆蓋
├── model-overrides  → 模型配置覆蓋
├── send-policy      → 訊息發送策略
├── transcript       → 對話事件記錄
└── input-provenance → 輸入來源追蹤
```

### Secrets 管理

OpenClaw 的 secrets 系統有完整生命週期：
- `configure.ts` → 定義 secrets
- `apply.ts` → 部署 secrets
- `resolve.ts` → 運行時解析
- `audit.ts` → 存取審計
- `provider-env-vars.ts` → 供應商環境變數映射
- `ref-contract.ts` → 引用合約 (結構化引用)

### Docker 部署

```yaml
# docker-compose.yml 關鍵配置
services:
  openclaw-gateway:
    ports: [18789, 18790]
    volumes:
      - ${OPENCLAW_CONFIG_DIR}:/home/node/.openclaw        # 配置
      - ${OPENCLAW_WORKSPACE_DIR}:/home/node/.openclaw/workspace  # 工作區
    environment:
      - OPENCLAW_GATEWAY_TOKEN        # Gateway 認證
      - CLAUDE_AI_SESSION_KEY         # AI 模型 Key
```

**重點**: OpenClaw 原生設計是 **單用戶本地部署**, 不是多租戶雲端服務。

---

## 2. Affiora CDK 架構分析

### 核心模式

```
apps/
├── 00-core/                         # 共用基礎設施
│   ├── core-backend-basic-infra/    # RDS, DynamoDB, EventBridge, S3
│   └── core-platform-*-infra/      # 各平台整合
└── 30-secretary/                    # 業務系統
    ├── secretary-backend-basic-infra/
    ├── secretary-backend-*-infra/   # 各功能獨立部署
    └── ...
```

### Affiora 的關鍵設計模式

1. **SSM Parameter 跨 Stack 通訊** → 資源註冊表模式
2. **單一責任 Stack** → 每個 Stack 只管一種資源
3. **屬性級多租戶隔離** → DB query 都帶 clientId/userId
4. **Secrets Manager** → per-client 憑證, ARN 限定範圍
5. **EventBridge 事件匯流排** → 每個功能一個 Bus
6. **SOC 2/HIPAA 合規** → CloudTrail, GuardDuty, SecurityHub

---

## 3. OpenClaw Enterprise 架構設計

### 目標

把 OpenClaw 從「個人本地 AI 助理」改造成「企業級多用戶 AI 平台」：
- 每個用戶有自己的 OpenClaw 實例 (獨立 Gateway)
- 儲存隔離 (每人獨立的 workspace 和 config)
- API Key 可共享 (企業級別的 key pool)
- 管理員介面管理所有實例
- 企業共用空間 (團隊共享知識庫、技能、外掛)

### 3.1 整體架構

```
┌─────────────────────────────────────────────────────────┐
│                  Admin Dashboard (Angular)                │
│  用戶管理 | 實例監控 | API Key 管理 | 共用空間 | 計費     │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│              Enterprise Control Plane (Lambda)            │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ User Mgmt│  │Instance  │  │ Key Pool │  │ Shared  │ │
│  │ Service  │  │Lifecycle │  │ Manager  │  │ Space   │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│              Instance Layer (ECS Fargate / ECS EC2)       │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ User A      │  │ User B      │  │ User C      │     │
│  │ OpenClaw    │  │ OpenClaw    │  │ OpenClaw    │     │
│  │ Gateway     │  │ Gateway     │  │ Gateway     │     │
│  │ :18789      │  │ :18789      │  │ :18789      │     │
│  │             │  │             │  │             │     │
│  │ EFS Mount:  │  │ EFS Mount:  │  │ EFS Mount:  │     │
│  │ /user-a/    │  │ /user-b/    │  │ /user-c/    │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│                                                          │
│  共用 EFS Mount: /shared/enterprise/                     │
└─────────────────────────────────────────────────────────┘
```

### 3.2 儲存隔離策略

```
EFS (Elastic File System)
├── /users/
│   ├── user-a/
│   │   ├── .openclaw/           # OpenClaw 配置
│   │   │   ├── openclaw.json    # 個人配置 (模型偏好等)
│   │   │   └── secrets/         # 個人 API Keys (如果有)
│   │   └── workspace/           # 個人工作區
│   │       ├── AGENTS.md
│   │       ├── SOUL.md
│   │       └── skills/
│   ├── user-b/
│   │   └── ...
│   └── user-c/
│       └── ...
│
├── /shared/                     # 企業共用空間
│   ├── knowledge-base/          # 共用知識庫
│   ├── skills/                  # 共用技能
│   ├── plugins/                 # 共用外掛
│   ├── templates/               # 共用模板
│   └── tools/                   # 共用工具配置
│
└── /system/                     # 系統配置
    ├── enterprise-config.json   # 企業級配置
    └── key-pool/                # 共用 API Key Pool 參照
```

### 3.3 API Key Pool 架構

```
┌─────────────────────────────────────────┐
│          Secrets Manager                 │
│                                          │
│  /enterprise/{org-id}/keys/              │
│  ├── openai/                             │
│  │   ├── key-1  (rate: 500 RPM)         │
│  │   ├── key-2  (rate: 500 RPM)         │
│  │   └── key-3  (rate: 500 RPM)         │
│  ├── anthropic/                          │
│  │   ├── key-1                           │
│  │   └── key-2                           │
│  ├── google/                             │
│  │   └── key-1                           │
│  └── custom-provider/                    │
│      └── key-1                           │
└─────────────┬───────────────────────────┘
              │
┌─────────────▼───────────────────────────┐
│        Key Pool Proxy (Lambda)           │
│                                          │
│  - Round-robin / least-used 分配         │
│  - Rate limiting per key                 │
│  - Usage tracking per user               │
│  - Auto-rotation on quota exhaustion     │
│  - Cost allocation per user/team         │
│                                          │
│  OpenClaw 實例 → Proxy → AI Provider     │
│  (不直接持有 key, 透過 proxy 轉發)       │
└─────────────────────────────────────────┘
```

**Key Pool 運作方式**:
1. OpenClaw 的 `provider-env-vars` 被配置指向 Key Pool Proxy
2. Proxy 是一個 API Gateway + Lambda, 對外模擬 OpenAI/Anthropic API
3. Proxy 從 Secrets Manager 取得 key, round-robin 分配
4. 每次請求記錄 usage (DynamoDB), 用於計費和配額管理

### 3.4 Instance Lifecycle 管理

```typescript
// CDK: Instance Management Stack
enum InstanceState {
  PROVISIONING = 'provisioning',  // 正在創建
  RUNNING = 'running',            // 運行中
  SLEEPING = 'sleeping',          // 閒置休眠 (省錢)
  TERMINATED = 'terminated',      // 已終止
}

// ECS Task Definition per user
// 使用 Fargate Spot 降低成本 (休眠時 scale to 0)
```

**生命週期**:
1. Admin 創建用戶 → 建立 EFS 目錄 + 初始配置
2. 用戶登入 → 啟動 Fargate Task (OpenClaw container)
3. 閒置 30 分鐘 → Scale to 0 (休眠)
4. 用戶再次訪問 → 冷啟動 Fargate Task (~10s)
5. Admin 停用 → 終止 Task, 保留 EFS 資料

### 3.5 CDK Stack 設計 (參考 Affiora 模式)

```
apps/openclaw-enterprise/
├── 00-foundation/
│   ├── foundation-vpc-infra/           # VPC, Subnets, Security Groups
│   ├── foundation-efs-infra/           # EFS for user storage
│   ├── foundation-ecr-infra/           # ECR for OpenClaw Docker image
│   └── foundation-secrets-infra/       # Secrets Manager base setup
│
├── 10-cluster/
│   ├── cluster-ecs-infra/              # ECS Cluster (Fargate)
│   ├── cluster-alb-infra/              # ALB with path-based routing
│   ├── cluster-service-discovery-infra/ # Cloud Map for instance discovery
│   └── cluster-auto-scaling-infra/     # Scale to 0, scale up policies
│
├── 20-control-plane/
│   ├── control-cognito-infra/          # Admin + User authentication
│   ├── control-api-infra/              # Admin API (Lambda)
│   ├── control-instance-mgmt-infra/    # Instance lifecycle management
│   ├── control-key-pool-infra/         # API Key Pool Proxy
│   ├── control-usage-tracking-infra/   # Usage metering (DynamoDB)
│   └── control-eventbridge-infra/      # Event bus for system events
│
├── 30-shared-space/
│   ├── shared-knowledge-infra/         # S3 + EFS for knowledge base
│   ├── shared-skills-infra/            # Shared skills registry
│   └── shared-plugins-infra/           # Plugin marketplace
│
└── 40-admin/
    ├── admin-frontend-infra/           # Admin dashboard (S3 + CloudFront)
    └── admin-api-infra/                # Admin API endpoints
```

### 3.6 網路架構

```
Internet
    │
    ▼
┌───────────────┐
│  CloudFront   │ ── Admin Dashboard (S3 SPA)
└───────┬───────┘
        │
┌───────▼───────┐
│     ALB       │ ── WebSocket upgrade support
│  (Path-based) │
└───┬───┬───┬───┘
    │   │   │
    ▼   ▼   ▼
  /user-a  /user-b  /user-c     ← Path-based routing to ECS Tasks
    │       │       │
    ▼       ▼       ▼
  Fargate  Fargate  Fargate     ← Each runs OpenClaw Gateway
  Task A   Task B   Task C
    │       │       │
    ▼       ▼       ▼
  EFS      EFS     EFS          ← Shared filesystem, per-user directories
  /users/a /users/b /users/c
```

**替代方案: WebSocket 路由**
- 使用 API Gateway WebSocket API 而非 ALB
- 好處: 原生 WebSocket 支援, 按連線計費
- 壞處: 10 分鐘 idle timeout, 需要心跳

### 3.7 Admin Dashboard 功能

```
Admin Dashboard
├── 用戶管理
│   ├── CRUD 用戶
│   ├── 分配角色 (admin, manager, user)
│   ├── 查看用戶實例狀態
│   └── 強制停止/重啟實例
│
├── API Key 管理
│   ├── 添加/移除 API Keys
│   ├── 設定配額 (per key, per user)
│   ├── 查看使用量儀表板
│   └── 自動輪替設定
│
├── 共用空間管理
│   ├── 知識庫管理 (上傳/刪除文件)
│   ├── 技能管理 (啟用/停用共用技能)
│   ├── 外掛管理 (安裝/移除外掛)
│   └── 模板管理
│
├── 監控
│   ├── 實例健康狀態
│   ├── API 使用量 (per user, per provider)
│   ├── 成本分析
│   └── 錯誤日誌
│
└── 設定
    ├── 企業配置 (預設模型, 政策)
    ├── Channel 連接設定
    ├── 安全政策 (工具白名單等)
    └── 計費設定
```

---

## 4. 關鍵技術決策

### 4.1 容器 vs Lambda

| 方案 | 優點 | 缺點 |
|------|------|------|
| **ECS Fargate (推薦)** | 長連線 WebSocket, 完整 Node.js 環境, 直接跑 OpenClaw | 閒置成本, 冷啟動 ~10s |
| ECS EC2 | 更便宜 (Spot), 可 GPU | 需要管理 EC2 |
| Lambda | 按用計費, 無閒置成本 | 15 分鐘限制, 不支援 WebSocket |

**結論**: ECS Fargate + Scale to 0 是最佳平衡。

### 4.2 儲存方案

| 方案 | 優點 | 缺點 |
|------|------|------|
| **EFS (推薦)** | 多 AZ, 可共享掛載, POSIX 兼容 | 成本較 S3 高, 延遲較高 |
| EBS | 低延遲 | 不可跨 Task 共享 |
| S3 + FUSE | 便宜, 無限容量 | 延遲高, 不完全 POSIX |

**結論**: EFS 用於 workspace/config, S3 用於知識庫大檔案。

### 4.3 API Key 共享方案

| 方案 | 優點 | 缺點 |
|------|------|------|
| **Proxy 模式 (推薦)** | Key 不暴露給用戶, 集中管理 | 增加延遲 (~10ms) |
| 環境變數注入 | 簡單, 無額外延遲 | Key 在容器中可見, 難以輪替 |
| Sidecar | 完全透明 | 複雜度高 |

**結論**: API Gateway + Lambda Proxy, 對外模擬 AI Provider API。

### 4.4 用戶隔離等級

| 等級 | 方案 | 適用場景 |
|------|------|----------|
| **L1: Container (推薦)** | 每用戶一個 Fargate Task | 大多數場景 |
| L2: Namespace | K8s namespace per user | 大規模部署 |
| L3: Account | 每用戶一個 AWS Account | 極端安全需求 |

**結論**: L1 Container 級別隔離, EFS 目錄級權限分隔。

---

## 5. OpenClaw 需要的改動

### 5.1 需要 Fork/修改的部分

1. **Config 系統** (`src/config/`)
   - 支援從 EFS 載入配置而非 `~/.openclaw/`
   - 支援企業配置覆蓋 (enterprise config overlay)
   - 支援共用空間路徑

2. **Secrets 系統** (`src/secrets/`)
   - 支援從 AWS Secrets Manager 讀取 (而非本地檔案)
   - 或透過 Key Pool Proxy 完全代理 API 請求

3. **Gateway 認證** (`src/gateway/auth.ts`)
   - 整合 Cognito Token 驗證
   - 支援企業 SSO

4. **Agent Workspace** (`src/agents/`)
   - 掛載共用技能目錄 (readonly)
   - 掛載共用知識庫 (readonly)
   - 個人 workspace 讀寫

5. **Channel 管理**
   - 企業級 channel 設定 (admin 控制)
   - 個人 channel 設定 (用戶控制)

### 5.2 不需要改動的部分

- Core Gateway WebSocket 協議
- Agent 執行引擎
- Tool 系統
- Plugin SDK
- UI/Canvas

---

## 6. MVP 實施路線圖

### Phase 1: Foundation (Week 1-2)
- [ ] Fork OpenClaw, 建立 enterprise branch
- [ ] CDK: VPC + EFS + ECR Stacks
- [ ] Docker image 修改 (EFS mount points)
- [ ] 基本 ECS Cluster

### Phase 2: Instance Management (Week 3-4)
- [ ] CDK: ECS Task Definition (per user)
- [ ] CDK: ALB + WebSocket routing
- [ ] Instance lifecycle Lambda (create/start/stop)
- [ ] Cognito 認證 (Admin + User)

### Phase 3: Key Pool (Week 5-6)
- [ ] CDK: API Gateway + Lambda Proxy
- [ ] Key Pool Manager (round-robin, usage tracking)
- [ ] DynamoDB usage table
- [ ] OpenClaw config 修改指向 Proxy

### Phase 4: Admin Dashboard (Week 7-8)
- [ ] Angular Admin Dashboard
- [ ] 用戶 CRUD
- [ ] 實例監控
- [ ] API Key 管理 UI

### Phase 5: Shared Space (Week 9-10)
- [ ] 企業知識庫 (S3 + EFS sync)
- [ ] 共用技能管理
- [ ] 共用外掛安裝

---

## 7. 成本估算 (10 用戶)

| 資源 | 月費 (USD) | 備註 |
|------|-----------|------|
| ECS Fargate (10 tasks, 0.5 vCPU, 1GB) | ~$73 | 假設 8hr/day 活躍 |
| EFS (50GB) | ~$15 | Standard class |
| ALB | ~$22 | + 資料傳輸 |
| API Gateway (Key Proxy) | ~$5 | 100K requests/month |
| Lambda (Control Plane) | ~$2 | |
| Secrets Manager (20 secrets) | ~$8 | |
| DynamoDB (Usage tracking) | ~$5 | On-demand |
| CloudFront + S3 (Admin Dashboard) | ~$2 | |
| **Total** | **~$132/month** | **~$13.2/user/month** |

Scale to 0 可再降低 ~40% Fargate 成本。
