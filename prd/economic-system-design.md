# Economic System Design

## 1. Purpose
Design a scalable, fun, and balanced in-game economy that supports progression, player agency, and long-term engagement.

## 2. Design Goals
- Reward meaningful gameplay loops (combat, trade, exploration, missions).
- Keep the economy understandable for new players while allowing depth for advanced players.
- Prevent runaway inflation and degenerate exploit loops.
- Support both solo and group play styles.

## 3. Core Economic Loops
### 3.1 Trade Loop
- Buy low in surplus markets.
- Transport goods.
- Sell high in demand markets.

### 3.2 Mission Loop
- Complete contracts for credits and reputation.
- Unlock higher-tier mission payouts through faction standing.

### 3.3 Resource Acquisition Loop
- Gather salvage/minerals/components.
- Convert raw materials into processed goods.
- Sell directly or craft for higher value.

## 4. Currency Model
### 4.1 Primary Currency
- **Credits**: Main transactional currency for buying, selling, repairs, and fees.

### 4.2 Optional Secondary Currencies
- **Faction Tokens**: Earned via faction-specific activities, used for unique rewards.
- **Reputation** (non-spendable): Unlocks market access, mission tiers, and pricing modifiers.

## 5. Goods Taxonomy
- **Commodities**: Bulk goods with low margins and stable demand.
- **Industrial Goods**: Mid-tier crafted/processed items.
- **Luxury/High-Tech Goods**: High margin, high risk, volatile demand.
- **Illegal/Restricted Goods** (optional): High reward, enforcement risk.

## 6. Market System
### 6.1 Market Data per Station
- Supply level
- Demand level
- Base price
- Local modifiers (security, faction control, events)

### 6.2 Price Calculation (Conceptual)
Final price = Base price × Supply/Demand modifier × Reputation modifier × Event modifier

### 6.2.1 High-Level Pricing Algorithm (Proposed)
Use a two-stage model: calculate a target price from fundamentals, then apply smoothing/clamps to produce the quoted price.

1. **Build state signals** per commodity per market:
	 - Current stock ratio (`stock / target_stock`)
	 - Demand pressure (recent buy pressure vs expected demand)
	 - Replenishment expectation (incoming supply + local production forecast)
	 - Lead-time risk (time to refill if stock falls further)
	 - External pressure (ripple from system/region/galaxy)
2. **Compute target pressure index**:
	 - Increase pressure when stock is low and demand is high.
	 - Increase pressure when lead time is long and replenishment confidence is low.
	 - Reduce pressure when inbound logistics and local production are reliable.
3. **Convert pressure to target price**:
	 - `target_price = base_price * pressure_curve(pressure_index)`
	 - `pressure_curve` is non-linear so severe shortages move price faster than mild imbalance.
4. **Apply controls**:
	 - Per-tick change clamp (max up/down movement per tick).
	 - Smoothing (EMA or weighted blend with previous price).
	 - Volatility band by commodity class (essentials tighter, strategic goods wider).
5. **Publish price and confidence metadata**:
	 - Price, trend direction, volatility state, and supply confidence shown to clients.

### 6.2.2 Key Inputs and Their Pricing Impact
- **Supply down, demand up**: strongest upward pressure; effect amplified if lead-time is long.
- **Supply dries up**: price should accelerate toward upper band; hard cap prevents runaway spikes.
- **Known local production lead-time**:
	- Short and reliable lead-time dampens spikes (market expects relief).
	- Long or disrupted lead-time sustains high prices longer.
- **Import dependency**:
	- Price sensitivity increases when commodity depends on limited routes.
	- Route reliability directly modifies replenishment confidence.
- **Inventory health**:
	- Safety stock above threshold reduces sensitivity.
	- Below critical threshold enables scarcity premium.

### 6.2.3 Suggested Conceptual Formula
For high-level design only (not implementation-specific):

`pressure = w_stock * stock_gap + w_demand * demand_gap + w_lead * lead_risk + w_external * ripple_pressure - w_replenish * replenishment_confidence`

`target_price = base_price * exp(k * pressure)`

`final_price_t = clamp(min_price, max_price, alpha * target_price + (1 - alpha) * final_price_(t-1))`

Where:
- `stock_gap`: normalized shortage vs target stock.
- `demand_gap`: normalized excess demand vs baseline.
- `lead_risk`: normalized refill-time risk.
- `replenishment_confidence`: forecast confidence from local production + inbound routes.
- `alpha`: smoothing factor (lower = smoother, slower reaction).
- `k`: sensitivity scalar by commodity class.

### 6.2.4 Commodity-Class Pricing Behavior
- **Essentials (food/medical)**
	- Lower `k`, tighter clamps, stronger smoothing.
	- Goal: avoid extreme player pain while still reflecting scarcity.
- **Strategic imports (components/technology)**
	- Higher `k`, wider clamps, stronger ripple coupling.
	- Goal: create meaningful logistics gameplay and arbitrage windows.
- **Luxury goods**
	- Medium `k`, medium clamps, event-sensitive demand.
	- Goal: preserve volatility for advanced trading without destabilizing core economy.

### 6.2.5 Worked Example (Single Macro Tick)
Example using balanced profile defaults for a strategic component in one station market.

Assumptions:
- `base_price = 100`
- `final_price_(t-1) = 120`
- Strategic defaults: `k = 0.95`, `alpha = 0.35`
- Normalized signals for this tick:
	- `stock_gap = 0.60` (stock well below target)
	- `demand_gap = 0.40` (demand above baseline)
	- `lead_risk = 0.70` (long refill expectation)
	- `ripple_pressure = 0.30` (upstream system disruption)
	- `replenishment_confidence = 0.20` (weak inbound confidence)
- Strategic weights: `w_stock=0.26`, `w_demand=0.35`, `w_lead=0.35`, `w_external=0.28`, `w_replenish=0.22`

Step 1: pressure index

`pressure = 0.26*0.60 + 0.35*0.40 + 0.35*0.70 + 0.28*0.30 - 0.22*0.20 = 0.581`

Step 2: target price

`target_price = 100 * exp(0.95 * 0.581) = 173.7`

Step 3: smoothed price

`smoothed = 0.35*173.7 + 0.65*120 = 138.8`

Step 4: clamp

- Strategic macro clamp is +/-10% from previous price, so allowed range is `[108, 132]`.
- Final quoted price this macro tick = `132` (clamped).

Interpretation:
- Fundamentals want a sharp increase, but smoothing + clamp prevent one-tick spike.
- If pressure remains elevated for several ticks, price continues stepping upward toward target band.

### 6.3 Refresh Rules
- Prices and stock update on a fixed cadence.
- Significant player transactions can trigger immediate local adjustments.

### 6.4 Economic Scope Layers
- **Local (Station/Planet)**: Immediate impact from direct trades, dock activity, local events.
- **System (Star System)**: Aggregated production/consumption pressure across local markets.
- **Regional/Galaxy**: Slower-moving macro trends, trade lane pressure, faction logistics.

### 6.5 Specialization Model
- Each star system has baseline specialization weights (e.g., farming, heavy industry, technology, military).
- Specialization influences base production, base demand, and default volatility ranges.
- Player and NPC behavior can shift the active profile over time within bounded limits.

### 6.6 Adaptive Specialization Rules
- Systems start with a baseline identity, but adapt based on sustained behavior over macro ticks.
- Adaptation is commodity-class specific:
	- Locally produced essentials (e.g., food) should be more forecastable and slower to destabilize.
	- Imported strategic goods (e.g., ship technology) should be more sensitive to logistics disruption.
- Suggested adaptation signals:
	- Net exports/imports by commodity class
	- Production uptime vs disruption events
	- Infrastructure investment level
	- Trade lane reliability
- Adaptation should be bounded to preserve lore identity (e.g., max +/- 20-30% drift from baseline).

## 7. Tick-Based Simulation Model
### 7.1 Core Principle
Economic actions are ingested continuously, but market state is settled on deterministic server ticks.

### 7.2 Tick Pipeline (Per Tick)
1. **Ingest**: Collect validated player and NPC economic intents since the last tick (buy/sell/haul/produce/consume).
2. **Reserve/Match**: Resolve local inventory and order constraints to prevent double-spend.
3. **Apply Local Effects**: Update station-level stock, fulfilled demand, and immediate price pressure.
4. **Aggregate Upward**: Roll local deltas into system-level indicators.
5. **Propagate Ripple**: Apply dampened and delayed effects to connected systems/regions.
6. **Reprice**: Recalculate commodity prices using new stock, demand pressure, and modifiers.
7. **Persist**: Save authoritative post-tick state with a tick/version ID.
8. **Broadcast Deltas**: Push changed market snapshots/events to subscribed players.

### 7.3 Tick Cadence Strategy
- **Micro Tick (1-5s)**: Local order flow, reservations, near-real-time station updates.
- **Macro Tick (30-300s)**: Production/consumption cycles, inter-system logistics, global balancing.
- Cadence can vary by scope: local fast, galaxy slower.

### 7.4 Chosen Direction (Current)
- Use **micro + macro** cadence as the core model.
- Commodity classes can use different logic at each layer:
	- Essentials: stronger local forecasting, lower short-term volatility.
	- Strategic imports: stronger macro dependency, higher logistics sensitivity.
- Keep per-commodity rule sets in config so balancing can change without code redeploy.

### 7.5 Ripple Speed Model (Detailed)
Ripple speed controls how quickly a local shock affects system/regional/galaxy prices.

#### 7.5.1 Propagation Modes
- **Fast Propagation**
	- Impact reaches connected systems in 1 macro tick.
	- Pros: feels alive and reactive.
	- Risks: frequent global volatility and herd behavior.
- **Staged Propagation**
	- Impact spreads in steps with decay (e.g., 40% -> 20% -> 10% over 3 macro ticks).
	- Pros: readable trends, tradable windows, lower oscillation.
	- Risks: slightly less immediate realism.
- **Slow Propagation**
	- Impact requires multiple macro ticks before regional effect is visible.
	- Pros: high stability.
	- Risks: economy can feel static/delayed.

#### 7.5.2 Recommended Default
- Use **staged propagation with distance and route reliability modifiers**.
- Example conceptual weighting:
	- Same system: apply 100% of local shock on next macro tick.
	- Adjacent systems: apply 35-50% on next macro tick.
	- Regional hub neighbors: apply 15-25% on second macro tick.
	- Distant regions: apply 5-15% on later ticks only if shock persists.
- Add decay so one-off events fade quickly; sustained pressure should compound.

#### 7.5.3 Commodity-Specific Ripple Speeds
- **Food / Essentials**: slower galaxy propagation, stronger local smoothing.
- **Technology / Components**: faster network propagation along major trade lanes.
- **Luxury goods**: moderate propagation, high discretionary volatility.
- **Military goods (war-time)**: dynamic propagation speed tied to conflict state.

#### 7.5.4 Backend Impact by Ripple Speed
- Faster ripple => more cross-shard messages, higher compute, more player-visible volatility.
- Slower ripple => lower operational cost, but less responsive market gameplay.
- Staged ripple is typically best balance for scale + readability.

### 7.6 Why Not Process From Frontend At Tick Time?
- Frontend should submit intents immediately; backend queues and validates continuously.
- Tick execution should use backend-owned event queues, not pull from clients on demand.
- This improves anti-cheat, consistency, and recovery after disconnects.

## 8. High-Level Backend Architecture
### 8.1 Recommended Components
- **API Layer**: Accepts economic actions and returns immediate acceptance/rejection.
- **Intent Queue/Event Log**: Durable append-only stream for economic intents.
- **Simulation Workers**: Run deterministic tick computation per shard.
- **State Store**: Authoritative market tables (stock, prices, modifiers, tick version).
- **Pub/Sub Gateway**: Broadcasts market deltas to connected clients.
- **Telemetry Pipeline**: Tracks health metrics and balancing signals.

### 8.2 Scaling Pattern
- Partition simulation by region/system shards.
- Keep local shard ticks strongly consistent.
- Use async cross-shard messages for galaxy ripple effects (eventual consistency).

### 8.3 Consistency Model
- **Within shard**: Strong consistency per tick.
- **Across shards**: Eventual consistency with bounded propagation delay.
- Clients render latest known version and reconcile when newer ticks arrive.

### 8.4 Volume Assumptions Validation (Galaxy-Scale)
Given assumptions:
- 1,000 star systems
- 3 stations/system average -> 3,000 stations
- 10-15 commodity groups -> use 12 baseline (range 10-15)
- 1,000 players
- 10,000 NPCs
- 10% NPC traders active -> ~1,000 active NPC traders

Derived market footprint:
- Market cells tracked = `stations * commodity_groups`
	- Baseline: `3,000 * 12 = 36,000`
	- Range: `30,000` to `45,000`

Validation notes:
- These assumptions are realistic for a medium-large MMO economy simulation.
- 10% active NPC traders is on the high side but still acceptable for stress-ready design.
- Primary scaling risk is not raw market cell count; it is intent throughput + fanout updates.

### 8.5 Per-Tick Processing Estimate (Using Current Cadence)
Using micro tick = 2s and macro tick = 60s.

Estimated active trade actors:
- NPC traders: ~1,000
- Player traders (assume 20-40% of players): ~200-400
- Total active traders: ~1,200-1,400

Assume each active trader emits 1-3 intents/minute (typical), with burst up to 2x.

Estimated intent ingestion:
- Typical intents/sec: ~20-70
- Burst intents/sec: ~140
- Typical per micro tick (2s): ~40-140 intents
- Typical per macro tick (60s): ~1,200-4,200 intents
- Burst per macro tick: up to ~8,400 intents

Macro tick computation workload (baseline):
- Reprice candidates: up to 36,000 market cells
- Full recalculation each macro tick is possible, but delta-driven recalculation is preferred.
- If 20-35% of cells changed materially, repricing set is ~7,200-12,600 cells/tick.

Update fanout guidance:
- Do not broadcast full galaxy market snapshots each tick.
- Use subscription scopes (local station/system + watchlist commodities) and send deltas only.
- With locality, expected player update messages per macro tick stay manageable (order of low thousands).

### 8.6 Initial Process/Worker Sizing (Starting Point)
Assume shard size = 20 systems -> `1,000 / 20 = 50` economy shards.

Recommended active workers:
- **Micro simulation workers**: 50 (1 per shard)
- **Macro simulation workers**: 50 (1 per shard)
- **Shard standby workers**: 10-20 shared hot standbys (not 1:1 required)
- **Intent ingest API instances**: 6-10
- **Queue partitions**: 100-150 (to smooth burst load and preserve ordering by market key)
- **State writer workers**: 8-16
- **Pub/Sub fanout workers**: 8-12
- **Simulation sandbox workers** (admin forecasting): 6-10

Operational rule of thumb:
- Scale out when p95 micro tick compute exceeds 50% of interval or macro exceeds 60% of interval.
- Re-shard before sustained macro tick budget usage crosses 70%.

### 8.7 Launch-Day Peak Sizing (3x Concurrency Scenario)
This section compares baseline assumptions vs a 3x player-concurrency event window.

Assumptions for peak scenario:
- Players: `1,000 -> 3,000`
- NPC count unchanged at `10,000`
- Active NPC traders remain ~`1,000` (or temporarily +20% under event scripts)
- Active player traders increase from ~`200-400` to ~`900-1,500`

#### 8.7.1 Baseline vs Peak Throughput
| Metric | Baseline | 3x Player Peak |
|---|---:|---:|
| Active traders (NPC + player) | 1,200-1,400 | 1,900-2,700 |
| Typical intents/sec | 20-70 | 45-150 |
| Burst intents/sec | 140 | 250-360 |
| Intents per micro tick (2s) | 40-140 | 90-300 |
| Intents per macro tick (60s) | 1,200-4,200 | 2,700-9,000 |
| Burst intents per macro tick | up to 8,400 | up to 15,000-21,000 |

Interpretation:
- 3x player concurrency does not 3x total load linearly because NPC activity dominates baseline.
- A realistic planning envelope is roughly 2x-2.5x intent pressure versus baseline.

#### 8.7.2 Repricing and State Update Impact
- Market cell count remains `30,000-45,000`; this does not scale with player count.
- What scales is changed-cell ratio and write pressure:
	- Baseline changed cells: ~20-35% (`7,200-12,600` at 36k baseline)
	- Peak changed cells: ~35-55% (`12,600-19,800` at 36k baseline)
- Delta-first repricing is mandatory at peak; full-market repricing should be reserved for recovery/reconciliation cycles.

#### 8.7.3 Fanout Impact (Player Updates)
- Baseline macro-tick update messages: low thousands with locality filters.
- Peak macro-tick update messages: mid-to-high thousands, potentially low tens of thousands during major events.
- Keep fanout bounded by:
	- Scope subscriptions (current station/system + watchlist)
	- Coalesced deltas per commodity class
	- Backpressure-aware publish queues

#### 8.7.4 Process Sizing: Baseline vs Peak Recommendation
| Component | Baseline | 3x Player Peak |
|---|---:|---:|
| Micro simulation workers | 50 | 60-75 |
| Macro simulation workers | 50 | 60-75 |
| Hot standbys | 10-20 | 20-30 |
| Intent ingest API instances | 6-10 | 12-18 |
| Queue partitions | 100-150 | 180-260 |
| State writer workers | 8-16 | 16-28 |
| Pub/Sub fanout workers | 8-12 | 16-24 |
| Simulation sandbox workers | 6-10 | 8-12 |

#### 8.7.5 Scale Triggers During Live Peak
- Trigger immediate horizontal scale-up if either condition holds for 5+ minutes:
	- p95 ingest queue lag > 1 micro tick interval.
	- p95 fanout latency exceeds 2x normal macro publish window.
- Trigger shard split campaign if sustained for 30+ minutes:
	- p95 macro tick compute > 70% interval on >20% shards.
	- changed-cell ratio >50% on >25% shards.

#### 8.7.6 Cost/Complexity Guidance
- For launch month, prefer overprovisioning ingest + fanout tiers rather than simulation tiers.
- Simulation workers are usually CPU-bound; fanout is often network/broker-bound.
- Most incidents at peak are delivery-latency issues, not pricing-model math limits.

### 8.8 Capacity Runbook Checklist (Pre-Launch / Launch-Day / Post-Launch)
#### 8.8.1 Pre-Launch (T-30 to T-1 days)
- Confirm shard map and failover ownership for all economy shards.
- Load test to at least `2.5x` baseline intent throughput with fanout enabled.
- Validate guardrail auto-rollback end-to-end in staging.
- Freeze v1 parameter sheet and sign off simulation pack pass report.
- Pre-warm broker partitions, caches, and connection pools.
- Establish on-call rotation with clear escalation matrix.

#### 8.8.2 Launch-Day (T0 to T+24h)
- Start with conservative ingest/fanout overprovisioning.
- Monitor every 5 minutes:
	- ingest queue lag
	- macro/micro tick budget utilization
	- fanout latency and dropped update count
	- stockout rate and essential price drift
- Enforce change policy: only low-risk tuning knobs by on-call, high-impact changes require two-person approval.
- Trigger auto-scale on threshold breach before player-facing degradation.
- Prefer temporary overrides with explicit expiry over permanent config edits.

#### 8.8.3 Post-Launch (T+1 day onward)
- Run daily simulation replay against previous 24h snapshots.
- Compare live outcomes vs forecast error by commodity class and region.
- Recalibrate one parameter family at a time (do not batch unrelated changes).
- Review incident postmortems and update runbook triggers.
- Re-assess shard boundaries weekly based on sustained hot regions.

## 9. Economic Sinks and Faucets
### 9.1 Faucets (Currency Inflow)
- Mission rewards
- NPC trade profits
- Bounties / event rewards

### 9.2 Sinks (Currency Outflow)
- Repairs and maintenance
- Fuel / transit costs
- Docking fees / taxes
- Insurance / ship replacement
- Crafting and upgrade costs

## 10. Progression & Balance
- Early game: low risk, low volatility, clear profits.
- Mid game: route optimization, faction bonuses, fleet management.
- Late game: high-capital trading, strategic specialization, dynamic events.

## 11. Anti-Exploit Safeguards
- Diminishing returns on repeated same-route trades.
- Transaction caps or soft taxes on extreme arbitrage.
- Cooldowns on high-yield mission categories.
- Server-side validation for market and reward calculations.

## 12. Telemetry & Tuning
Track:
- Currency creation vs destruction per day
- Median player wealth over time
- Top profitable goods/routes
- Price volatility by region
- New player retention vs early earnings

Tuning levers:
- Reward multipliers
- Sink costs
- Market refresh cadence
- Regional scarcity rules

### 12.1 Admin Tuning Controls (Design)
The economy service should expose controlled admin tuning without requiring deploys.

- **Scope of change**
	- Global defaults
	- Region/system overrides
	- Commodity-class overrides
- **Tunable parameters (examples)**
	- Micro/macro tick intervals
	- Ripple weights and decay rates
	- Price elasticity and volatility clamps
	- Specialization adaptation rate and drift caps
	- NPC production/consumption multipliers
- **Safety controls**
	- Role-based access control for economy-admin actions
	- Two-stage apply for high-impact changes (stage -> approve -> activate)
	- Time-boxed temporary overrides with auto-expiry
	- Full audit log with user, timestamp, old value, new value, reason

### 12.2 Simulation & Forecasting Mode (Design)
Before applying risky tuning changes in live economy, run scenario simulation.

- **Simulation input**
	- Latest snapshot tick/version
	- Proposed parameter changes
	- Time horizon (e.g., next 24 macro ticks)
	- Optional shock events (route outage, war, seasonal demand spike)
- **Simulation output**
	- Price trajectories by commodity and region
	- Stockout probability and recovery time
	- Inflation/deflation pressure indicators
	- Predicted player opportunity concentration (route profitability skew)
- **Operational model**
	- Run simulations in isolated workers against snapshot copies
	- Produce confidence bands from multiple seeded runs
	- Support `dry-run` compare view: baseline vs proposed config

### 12.3 LiveOps Workflow (Recommended)
1. Detect anomaly via telemetry alert.
2. Draft tuning candidate in admin console.
3. Run simulation against current snapshot.
4. Review impact thresholds and approve/reject.
5. Roll out gradually (e.g., 10% regions -> 50% -> 100%).
6. Monitor post-rollout KPIs and auto-rollback on breach.

### 12.4 V1 Admin Guardrail Policy (Concrete)
This policy defines when automatic rollback should trigger during or after economy tuning changes.

#### 12.4.1 Rollback Triggers (Hard)
- **Tick health**
	- Trigger rollback if p95 macro tick duration exceeds 70% of interval for 3 consecutive ticks.
	- Trigger rollback if any macro tick misses interval budget by >20% for 2 consecutive ticks.
- **Price stability**
	- Trigger rollback if median price change for any essential commodity exceeds +/-18% over 6 macro ticks without a declared world event.
	- Trigger rollback if any non-event commodity exceeds +/-35% over 6 macro ticks in more than 15% of systems.
- **Availability risk**
	- Trigger rollback if essential stockout rate exceeds 12% of active stations for 4 consecutive macro ticks.
	- Trigger rollback if projected recovery time for essentials exceeds 10 macro ticks in 3+ regions.
- **Economic health**
	- Trigger rollback if credit faucet/sink ratio leaves [0.85, 1.15] for 24 macro ticks after a tuning change.
	- Trigger rollback if top 5 routes capture >45% of all trade profit for 12 macro ticks (runaway concentration).

#### 12.4.2 Rollout Policy
- Stage A: apply config to 10% of regions for 12 macro ticks.
- Stage B: if no hard trigger breach, expand to 50% for 24 macro ticks.
- Stage C: global rollout only after simulation confidence and live KPIs remain within guardrails.
- Any hard trigger breach causes automatic rollback to previous signed config.

#### 12.4.3 Admin Permissions
- **On-call Economy Admin**
	- Can modify safe knobs within pre-approved bands (e.g., NPC multipliers +/-10%, temporary ripple decay +/-10%).
	- Cannot change tick intervals, drift caps, or elasticity clamps.
- **Design Lead / Senior Economy Owner**
	- Can modify high-impact knobs (tick cadence, volatility caps, specialization drift limits).
	- Requires two-person approval for global changes.

#### 12.4.4 Change Safety Requirements
- Every tuning set must include: reason, expected impact, expiry, owner, rollback target.
- All overrides must be reversible and idempotent.
- Temporary overrides must auto-expire by default unless explicitly renewed.

### 12.5 V1 Simulation Pack (Concrete)
Run these scenarios before any high-impact live tuning and as part of pre-release validation.

#### Scenario 1: Essential Supply Disruption (Food)
- **Setup**: Remove 30% food output from one farming hub for 8 macro ticks.
- **Expected behavior**:
	- Local price increases first; neighboring systems increase more slowly.
	- No cascading galaxy-wide spike beyond tuned ripple limits.
- **Pass criteria**:
	- Essential stockout rate remains below 10% of active stations.
	- Median essential price change remains within +/-15% outside affected region.
	- Recovery to pre-event band within 12 macro ticks after restoration.

#### Scenario 2: Strategic Import Choke (Technology Components)
- **Setup**: Disable one of two major component routes into a tech-dependent system for 10 macro ticks.
- **Expected behavior**:
	- Fast local and adjacent system price response for tech goods.
	- Staged regional spread with decay; no permanent uplift after route restore.
- **Pass criteria**:
	- Component stockout risk does not exceed 20% of stations in affected region.
	- Price overshoot decays by at least 50% within 8 macro ticks after route recovery.
	- Cross-shard propagation delay remains within configured bounds.

#### Scenario 3: Profit Concentration / Route Saturation
- **Setup**: Simulate high-volume coordinated trading on top 3 profitable routes for 20 macro ticks.
- **Expected behavior**:
	- Diminishing returns and soft taxes reduce dominant route margins.
	- Alternative routes become competitive within a bounded timeframe.
- **Pass criteria**:
	- Top 3 route profit share falls below 40% by tick window end.
	- New player accessible routes maintain positive margin in at least 70% of starter regions.
	- No exploit loop yields >2x intended margin for more than 4 macro ticks.

#### Scenario 4: Load + Event Concurrency
- **Setup**: Combine 1,000-player equivalent trade volume burst with a regional war event.
- **Expected behavior**:
	- Simulation remains deterministic and within tick budgets.
	- Price/ripple behavior remains bounded despite concurrent shocks.
- **Pass criteria**:
	- p95 macro tick runtime stays under 70% budget.
	- No duplicate intent application and no negative stock states.
	- Broadcast latency remains within live service target.

#### Scenario 5: Adaptive Specialization Drift and Reversion
- **Setup**: Sustain high component demand in neighboring systems for 30 macro ticks, then remove pressure.
- **Expected behavior**:
	- Nearby systems drift toward component output within configured cap.
	- Drift partially reverts after pressure is removed.
- **Pass criteria**:
	- Drift never exceeds configured cap (default +/-25%).
	- Reversion begins within 6 macro ticks after demand normalization.
	- No identity flip for lore-critical systems unless explicitly allowed.

### 12.6 V1 Tuning Profiles (Conservative / Balanced / Aggressive)
Use these presets as operating modes for simulation and rollout decisions.

#### 12.6.1 Conservative (Stability First)
- Use when economy is fragile, post-launch confidence is low, or after recent incidents.
- Target feel: predictable prices, fewer shocks, slower correction.
- Parameter envelope:
	- Price sensitivity `k`: low
	- Smoothing `alpha`: low (strong smoothing)
	- Per-macro clamp: tight (e.g., +/-4% essentials, +/-7% strategic)
	- Ripple decay: strong (faster fade)
	- Specialization drift rate: slow
	- Drift cap: +/-20%

#### 12.6.2 Balanced (Default Live Profile)
- Use as normal operating baseline for live service.
- Target feel: responsive but readable economy with controlled volatility.
- Parameter envelope:
	- Price sensitivity `k`: medium
	- Smoothing `alpha`: medium
	- Per-macro clamp: medium (e.g., +/-6% essentials, +/-10% strategic)
	- Ripple decay: medium
	- Specialization drift rate: medium
	- Drift cap: +/-25%

#### 12.6.3 Aggressive (Event / Stress Mode)
- Use during major narrative events or intentional high-volatility seasons.
- Target feel: fast reactions, larger opportunities, higher risk.
- Parameter envelope:
	- Price sensitivity `k`: high
	- Smoothing `alpha`: high (faster reaction)
	- Per-macro clamp: wider (e.g., +/-9% essentials, +/-14% strategic)
	- Ripple decay: slower (longer persistence)
	- Specialization drift rate: faster
	- Drift cap: +/-30%

#### 12.6.4 Profile Switching Rules
- Only switch profiles at macro tick boundaries.
- Require simulation pass on top 3 scenarios before switching to aggressive.
- Auto-fallback to balanced if any hard guardrail trigger breaches.
- Require explicit expiry for aggressive profile activation.

### 12.7 V1 Parameter Sheet (Numeric Defaults)
This sheet provides concrete starting values for implementation and simulation.

#### 12.7.1 Global Tick Defaults
- Micro tick interval: 2s
- Macro tick interval: 60s
- Price update cadence: every micro tick for local quote; authoritative settle on macro tick

#### 12.7.2 Balanced Profile Baseline by Commodity Class
| Parameter | Essentials (Food/Medical) | Strategic (Tech/Components) | Luxury Goods | Military Goods |
|---|---:|---:|---:|---:|
| Price sensitivity `k` | 0.55 | 0.95 | 0.80 | 1.05 |
| Smoothing `alpha` | 0.22 | 0.35 | 0.30 | 0.38 |
| Max up change per macro tick | +6% | +10% | +9% | +12% |
| Max down change per macro tick | -6% | -10% | -9% | -12% |
| Min/Max band vs base price | 0.65x / 1.60x | 0.50x / 2.20x | 0.55x / 1.90x | 0.50x / 2.40x |
| Safety stock target (days) | 6.0 | 3.5 | 2.5 | 3.0 |
| Critical stock threshold (% of target) | 30% | 22% | 18% | 20% |
| Lead-time risk weight `w_lead` | 0.20 | 0.35 | 0.28 | 0.40 |
| Demand weight `w_demand` | 0.28 | 0.35 | 0.33 | 0.34 |
| Stock weight `w_stock` | 0.34 | 0.26 | 0.27 | 0.24 |
| Replenishment weight `w_replenish` | 0.30 | 0.22 | 0.24 | 0.20 |
| External ripple weight `w_external` | 0.12 | 0.28 | 0.22 | 0.32 |

Notes:
- Essentials prioritize stability and recovery.
- Strategic and military goods are intentionally more sensitive to logistics shocks.

#### 12.7.3 Ripple Coefficients (Balanced)
Apply these as maximum transferable pressure before decay and reliability modifiers.

| Hop Scope | Essentials | Strategic | Luxury | Military |
|---|---:|---:|---:|---:|
| Same system (next macro tick) | 1.00 | 1.00 | 1.00 | 1.00 |
| Adjacent system (tick +1) | 0.30 | 0.50 | 0.40 | 0.55 |
| Regional neighbor (tick +2) | 0.15 | 0.25 | 0.20 | 0.30 |
| Distant region (tick +3+) | 0.05 | 0.12 | 0.10 | 0.15 |
| Per-tick decay factor | 0.55 | 0.70 | 0.65 | 0.72 |

#### 12.7.4 Profile Multipliers
Use multipliers over the balanced baseline to derive conservative or aggressive behavior.

| Profile | `k` multiplier | `alpha` multiplier | Clamp multiplier | Drift-rate multiplier | Ripple multiplier |
|---|---:|---:|---:|---:|---:|
| Conservative | 0.80 | 0.85 | 0.75 | 0.80 | 0.80 |
| Balanced | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| Aggressive | 1.25 | 1.20 | 1.35 | 1.30 | 1.25 |

#### 12.7.5 Lead-Time Modeling Defaults
- Local production lead-time classes:
	- Short: 1-2 macro ticks
	- Medium: 3-5 macro ticks
	- Long: 6-10 macro ticks
- Lead-time risk score (normalized 0..1):
	- `lead_risk = clamp(0,1, expected_refill_ticks / 10)`
- Replenishment confidence score (normalized 0..1):
	- Combines local production uptime, inbound route reliability, and in-transit committed volume.

#### 12.7.6 Calibration Workflow (Practical)
1. Start all simulations with balanced profile and baseline table values.
2. Run Scenario 1 and Scenario 2 from the simulation pack.
3. If essentials overshoot, reduce `k` or tighten clamp for essentials first.
4. If strategic goods feel flat, increase strategic `w_external` or reduce smoothing.
5. Record all changes in one config version and rerun full top-5 scenario pack before promotion.

#### 12.7.7 Governance Rule
- V1 defaults are frozen for launch candidate.
- Any post-freeze change requires simulation evidence and explicit owner sign-off.

## 13. Risks and Mitigations
### 13.1 System Risks
- **Risk: Tick overruns under peak load**
	- Mitigation: shard boundaries, deterministic worker budgets, overflow queues.
- **Risk: Price oscillation/instability**
	- Mitigation: smoothing functions, rate-of-change caps, volatility bands.
- **Risk: Economic exploits and bot loops**
	- Mitigation: server validation, anomaly detection, per-route diminishing returns.
- **Risk: Cross-shard desync artifacts**
	- Mitigation: versioned events, idempotent replay, bounded lag dashboards.

### 13.2 Design Risks
- **Risk: Economy too opaque for players**
	- Mitigation: market trend hints, transparent ranges, readable UI feedback.
- **Risk: New players priced out by veterans**
	- Mitigation: starter market protection, tiered opportunities, beginner contracts.

## 14. Use Cases (Simulation Walkthroughs)
### 14.1 Local Market Shock
- 200 players buy medical supplies in one station during a war event.
- Local stock drops quickly; local price rises on micro ticks.
- Nearby stations in same system see delayed demand increase on macro tick.

### 14.2 System Specialization Shift
- Farming system is repeatedly raided, reducing output for several macro ticks.
- Regional food imports rise; transport profits increase.
- Tech-focused systems face higher food costs due to dependency.

### 14.2b Import Dependency Shock (Technology)
- A core manufacturing system loses two major incoming component routes.
- On the next macro tick, local ship-tech prices jump due to dependency.
- Staged ripple increases prices in downstream systems over subsequent macro ticks.
- If disruption continues, adaptive specialization shifts nearby systems toward component production.

### 14.3 Veteran Route Saturation
- High-volume players overuse a profitable route.
- Diminishing returns and rising taxes reduce margin.
- Players naturally redistribute toward alternative goods/routes.

### 14.4 Player Join Mid-Event
- Player enters while economy is at tick `T+4` during a supply crisis.
- Backend sends snapshot at latest stable version plus queued deltas.
- Client catches up without needing full market replay.

### 14.5 End-to-End Reference Scenario (Food vs Technology)
This scenario shows how local production and import dependency behave differently.

#### Setup
- System A: Agriculture-heavy, exports food.
- System B: Industrial/technology-heavy, imports food and ship components.
- System C: Component supplier connected to System B through two main trade routes.

#### Timeline
1. **Tick M0 (stable state)**
	- Food in System A is abundant and low-volatility.
	- Technology in System B is stable because imports from System C are healthy.
2. **Micro ticks (player activity surge)**
	- Players buy large volumes of components in System C.
	- Local stock in System C drops; local prices react immediately.
3. **Tick M1 (first macro settlement)**
	- System C exports decline, component prices rise.
	- System B receives first staged ripple: moderate tech price increase.
	- Food prices in System B stay mostly stable due to buffered local forecasts from System A imports.
4. **Tick M2 (route disruption event)**
	- One route from C to B is disrupted by conflict.
	- Technology ripple intensifies in B and nearby systems.
	- Admin simulation predicts 6-tick stockout risk for advanced components.
5. **Tick M3 (admin action)**
	- Economy admin stages a temporary NPC logistics boost for component hauling.
	- Runs `dry-run` simulation and confirms lower stockout probability.
	- Applies override for 12 macro ticks with auto-expiry.
6. **Tick M4-M8 (adaptive response)**
	- Nearby systems begin shifting specialization slightly toward component production.
	- Technology prices remain elevated but begin trending down.
	- Food remains relatively stable due to local production forecastability and slower essential ripple.
7. **Tick M9 (recovery)**
	- Route restored; staged ripple decays.
	- Admin override expires automatically.
	- Specialization drift partially reverts toward baseline.

#### Outcomes Observed
- Players experience meaningful short-term profit windows without permanent runaway prices.
- Strategic goods show stronger, faster inter-system coupling than essentials.
- Admin controls and simulation reduce live economy risk during disruptions.

## 15. Open Questions
- Should markets be fully shared globally, region-based, or per-instance?
- How much should player actions permanently impact local economies?
- Should faction warfare alter supply chains in real time?
- What level of price transparency should be exposed in UI?
- What are target ripple latency bounds per commodity class?
- What is the allowed specialization drift range before identity reset/rebalance?

## 16. Interactive Discussion Board
Use this section to drive design conversations before implementation.

### 16.1 Decisions To Make Next
- Confirm micro + macro tick timings for launch and for scale-up.
- Choose staged ripple profile values (percent + delay) per commodity class.
- Finalize adaptive specialization drift bounds and recovery speed.
- Define fairness policy for new players vs high-capital players.

### 16.4 Working Assumptions (Current)
- Tick model: **micro + macro**.
- Specialization: **adaptive within bounded drift**.
- Ripple: **staged propagation with decay** (pending exact percentages).

### 16.2 Architecture Options To Debate
- **Option A: Simpler MVP**
	- Single simulation service, single tick cadence, fewer moving parts.
	- Pros: faster implementation.
	- Cons: weaker scale and less realism.
- **Option B: Layered Scale Model**
	- Sharded simulation workers + micro/macro ticks + cross-shard propagation.
	- Pros: better scale and richer behavior.
	- Cons: more operational complexity.

### 16.3 Prompt Questions For Team Discussion
- What is the acceptable delay for players to feel economy changes?
- How volatile should prices feel before it becomes frustrating?
- How much should NPC activity drive markets vs player activity?
- Which failure is worse at launch: stale economy or unstable economy?

### 16.5 Next Conversation Topics
- Validate or adjust v1 rollback thresholds after first internal simulation run.
- Finalize which simulation scenarios are mandatory for patch-day changes.
- Set player-facing communication rules for admin interventions.
- Agree KPI dashboard layout for economy on-call operations.
- Confirm default launch profile (balanced) and profile-switch authority.

## 17. Milestones
1. Define MVP economy variables and station market schema.
2. Implement baseline pricing and refresh logic.
3. Implement tick pipeline with authoritative state versioning.
4. Add mission payout balancing pass.
5. Add telemetry dashboards and alert thresholds.
6. Run closed beta economy simulation and tune values.

## 18. Logical Architecture and System Integration
### 18.1 Recommended Architecture Pattern
Use an event-driven, shard-oriented simulation architecture with CQRS-style separation:
- **Command path (write)**: accept trade intents and validate quickly.
- **Simulation path**: deterministic micro/macro workers consume intents and compute market state.
- **Query path (read)**: serve current market snapshots and deltas optimized for player clients.

Key supporting patterns:
- **Outbox pattern** for reliable event publication after DB commit.
- **Idempotent consumers** for safe retries and at-least-once delivery.
- **Versioned snapshots + deltas** for client catch-up and reconciliation.
- **Config-as-data** for live tuning without redeploy.

### 18.2 Why This Pattern Fits Your Needs
- Handles high write bursts from many actors without locking read path.
- Preserves deterministic tick outcomes under concurrency.
- Scales horizontally by shard while keeping per-shard consistency strong.
- Supports ripple propagation and eventual consistency across galaxy scope.

### 18.3 Logical Components (Reference)
- **API Gateway / FastAPI layer**: receives player trade actions.
- **Intent Validator**: checks auth, schema, allowed actions, and anti-abuse rules.
- **Intent Store + Queue**: durable event log keyed by shard/market.
- **Micro Tick Workers**: reservation/match and local pressure updates.
- **Macro Tick Workers**: production/consumption, ripple, repricing, specialization updates.
- **Market State Store**: authoritative inventory, price, and version state.
- **Read API / Cache**: station/system market queries and delta feeds.
- **Pub/Sub Update Service**: distributes scoped updates to connected players.
- **Admin Tuning/Simulation Service**: parameter changes, dry-runs, and approvals.
- **Observability Stack**: metrics, traces, alerts, and audit logs.

### 18.4 Integration with Current Backend (Practical Mapping)
Current implementation already has a clean base:
- Existing endpoint in [backend/app/api/stations.py](backend/app/api/stations.py) directly mutates `StationInventory`.
- Existing models in [backend/app/models/world.py](backend/app/models/world.py) already include core entities (`StarSystem`, `Station`, `Commodity`, `StationInventory`).
- API composition is centralized in [backend/app/api/router.py](backend/app/api/router.py).

Recommended transition path:
1. **Phase 1 (Compatibility Mode)**
	 - Keep `POST /stations/{station_id}/trade` contract.
	 - Internally change handler to append a validated `TradeIntent` event instead of direct stock mutation.
	 - Return accepted status + intent id; immediate stock response becomes eventually consistent.
2. **Phase 2 (Tick Engine Introduction)**
	 - Add micro/macro worker services consuming intents by shard key.
	 - Write authoritative updates back to `station_inventory` (or derived market tables) with version increments.
3. **Phase 3 (Read/Push Separation)**
	 - Add dedicated read endpoint(s) for market snapshots/deltas keyed by tick version.
	 - Add pub/sub channel for station/system delta updates.
4. **Phase 4 (Admin and Simulation Integration)**
	 - Add admin config APIs for guarded tuning changes.
	 - Add simulation service consuming snapshot exports.

### 18.5 Data and Contract Evolution
- Add `trade_intents` table/topic with fields: `intent_id`, `actor_id`, `station_id`, `commodity_id`, `qty`, `direction`, `created_at`, `status`, `shard_key`.
- Keep `station_inventory.version` as authoritative optimistic concurrency token.
- Introduce `market_tick_state` metadata (tick id, shard id, applied intent range, checksum).
- Client contracts should move from “immediate remaining quantity” to “accepted + current version + subscribed delta stream”.

### 18.6 Integration Risks and Mitigations
- **Risk: Player UX confusion during eventual consistency transition**
	- Mitigation: show accepted/pending trade state and refresh on delta arrival.
- **Risk: Duplicate intent processing after retries**
	- Mitigation: idempotency key + unique constraint on `intent_id`.
- **Risk: Mixed old/new pricing paths**
	- Mitigation: feature flags per shard with canary rollout.
- **Risk: Operational complexity jump**
	- Mitigation: phase rollout, start with fewer shards, expand after SLO stability.

### 18.7 Decision Recommendation
- Adopt **event-driven shard simulation** as target architecture.
- Execute migration in four phases to preserve current API compatibility while adding tick determinism and scale.

### 18.8 Sharding Decision (Confirmed)
- Chosen direction: start with **10-20 economy shards** to de-risk scale early.
- Recommended initial target: **12 shards** for first production rollout, with capacity headroom to scale to 20.

Initial partitioning guidance:
- Use stable shard keys derived from `system_id` ranges or consistent hashing.
- Keep adjacent high-traffic systems from concentrating in the same shard when possible.
- Reserve 10-20% keyspace slack for hot-spot rebalancing.

Expansion triggers (increase shard count):
- p95 macro tick compute >70% interval on >20% shards for 30+ minutes.
- p95 ingest queue lag >1 micro tick for 10+ minutes despite ingest scale-out.
- changed-cell ratio >50% on >25% shards during sustained peak windows.

Operational tradeoff summary:
- Compared with single-shard start, 10-20 shards increase deployment complexity.
- In return, they substantially reduce launch risk around queue lag, fanout congestion, and hot-spot collapse.

### 18.9 Shard-Key Strategy (Concrete, Model-Aligned)
This strategy is tailored to current world model fields in `StarSystem` (`id`, `seed`, `position_x/y/z`).

#### 18.9.1 Recommended Keying Pattern
- Use **virtual shards + deterministic hash routing**.
- Route by `system_id` (not station id) so all stations in a system share one economy shard context.
- Keep mapping in a `shard_map` config table:
	- `virtual_shard_id -> physical_shard_id`
	- Enables rebalancing by moving virtual shards without changing key function.

Suggested routing function (conceptual):
- `virtual_shard_id = hash64(system_id + ':' + system_seed) % V`
- `physical_shard_id = shard_map[virtual_shard_id]`

Where:
- `system_seed` is from `StarSystem.seed` to improve distribution stability across generated worlds.
- `V` (virtual shard count) should be much larger than physical shards (e.g., 256 virtual shards for 12 physical).

#### 18.9.2 Why This Beats Simple Ranges
- Range sharding by `system_id` is simple but can create contiguous hot zones.
- Hash + virtual shards gives better balance and safer incremental scaling.
- Re-sharding becomes mostly a metadata operation (`shard_map` edits) instead of key rewrite.

#### 18.9.3 Locality and Ripple Awareness
- Compute still routes by `system_id`, but maintain adjacency metadata using `position_x/y/z`.
- Ripple propagation uses adjacency graph, independent of compute shard placement.
- This avoids forcing neighboring systems onto same shard while preserving simulation realism.

#### 18.9.4 Station and Commodity Routing Rules
- `StationInventory` updates route by parent `station.system_id`.
- Trade intents include denormalized routing fields at write time:
	- `system_id`
	- `virtual_shard_id`
	- `physical_shard_id`
- Commodity class does not affect shard assignment (prevents per-commodity cross-shard fragmentation).

#### 18.9.5 Rebalance Procedure (Zero-Downtime Target)
1. Mark selected virtual shards as `migrating` in control plane.
2. Dual-read phase for impacted virtual shards (old + new physical target).
3. Drain intent lag for those virtual shards on source shard.
4. Switch `shard_map` atomically at macro tick boundary.
5. Verify checksum (`market_tick_state`) and resume single-read path.
6. Keep rollback window open for N macro ticks (suggest 12) before finalizing.

#### 18.9.6 Hot-Shard Detection Signals
- p95 macro tick compute by shard
- ingest queue lag by shard
- changed-cell ratio by shard
- fanout latency by shard

If one shard exceeds cluster median by >2x for 15+ minutes, schedule virtual-shard rebalance.

#### 18.9.7 Initial Configuration Recommendation
- Physical shards at launch: 12
- Virtual shards: 256
- Max virtual shards per physical shard target: 18-24
- Rebalance batch size: 2-6 virtual shards per operation
- Limit to one rebalance wave per 30 minutes during peak windows

### 18.10 `shard_map` Schema and Example Records
#### 18.10.1 Control Table Schema (Suggested)
`economy_shard_map`

| Column | Type | Notes |
|---|---|---|
| `virtual_shard_id` | integer (PK) | Range `0..V-1` |
| `physical_shard_id` | integer | Current owner shard |
| `state` | text | `active`, `migrating`, `draining` |
| `target_physical_shard_id` | integer nullable | Used only during migration |
| `epoch` | bigint | Monotonic routing version |
| `updated_at` | timestamptz | Last change timestamp |
| `updated_by` | text | Admin/service identity |
| `reason` | text nullable | Change reason / ticket |

Indexes:
- PK on `virtual_shard_id`
- Secondary on `physical_shard_id`
- Secondary on (`state`, `target_physical_shard_id`)

#### 18.10.2 Intent/Event Routing Fields (Denormalized)
Add at write time to `trade_intents` (or equivalent event envelope):
- `system_id`
- `virtual_shard_id`
- `physical_shard_id`
- `routing_epoch`

Purpose:
- Guarantees deterministic worker routing at ingest time.
- Supports replay/debug when shard ownership changes later.

#### 18.10.3 Example Mapping (V=24 virtual, P=12 physical)
Small illustrative sample (real config uses V=256):

| virtual_shard_id | physical_shard_id | state | target_physical_shard_id | epoch |
|---:|---:|---|---:|---:|
| 0 | 0 | active | null | 1 |
| 1 | 1 | active | null | 1 |
| 2 | 2 | active | null | 1 |
| 3 | 3 | active | null | 1 |
| 4 | 4 | active | null | 1 |
| 5 | 5 | active | null | 1 |
| 6 | 6 | active | null | 1 |
| 7 | 7 | active | null | 1 |
| 8 | 8 | active | null | 1 |
| 9 | 9 | active | null | 1 |
| 10 | 10 | active | null | 1 |
| 11 | 11 | active | null | 1 |
| 12 | 0 | active | null | 1 |
| 13 | 1 | active | null | 1 |
| 14 | 2 | active | null | 1 |
| 15 | 3 | active | null | 1 |
| 16 | 4 | active | null | 1 |
| 17 | 5 | active | null | 1 |
| 18 | 6 | active | null | 1 |
| 19 | 7 | active | null | 1 |
| 20 | 8 | active | null | 1 |
| 21 | 9 | active | null | 1 |
| 22 | 10 | active | null | 1 |
| 23 | 11 | active | null | 1 |

#### 18.10.4 Example Migration Record (During Rebalance)
Move `virtual_shard_id=17` from physical shard `5` to `8`:
- Set row to `state=migrating`, `target_physical_shard_id=8`, `epoch=2`.
- After lag drain + boundary cutover, set `physical_shard_id=8`, `state=active`, `target_physical_shard_id=null`, keep `epoch=2`.

#### 18.10.5 Integration Notes for Current Stack
- Add an in-memory routing cache in API/process workers with short TTL (e.g., 5-15s).
- Include `routing_epoch` in worker logs/metrics for migration observability.
- Persist `market_tick_state` checksums per shard and epoch to verify cutover correctness.
