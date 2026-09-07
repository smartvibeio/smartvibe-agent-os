PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS trading_twins (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  display_name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('cold_start', 'active', 'demo_preset')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  cold_start_method TEXT NOT NULL CHECK (
    cold_start_method IN ('trading_interview', 'account_context', 'demo_preset', 'mixed')
  ),
  cold_start_completed INTEGER NOT NULL DEFAULT 0,
  interview_turns INTEGER NOT NULL DEFAULT 0,

  -- decision tendencies (0-100)
  momentum_preference REAL NOT NULL,
  patience REAL NOT NULL,
  fomo_tendency REAL NOT NULL,
  confirmation_need REAL NOT NULL,
  holding_preference REAL NOT NULL,

  -- risk preferences (0-100)
  risk_tolerance REAL NOT NULL,
  drawdown_response REAL NOT NULL,
  size_aggression REAL NOT NULL,
  exposure_comfort REAL NOT NULL,

  scenario_patterns TEXT NOT NULL DEFAULT '{}',
  confidence_overall REAL NOT NULL,
  confidence_by_dimension TEXT NOT NULL DEFAULT '{}',
  style_tags TEXT NOT NULL DEFAULT '[]',

  -- latest account context (read-only snapshot fields)
  acct_exposure TEXT CHECK (acct_exposure IN ('low', 'medium', 'high') OR acct_exposure IS NULL),
  acct_concentration TEXT CHECK (
    acct_concentration IN ('low', 'medium', 'high') OR acct_concentration IS NULL
  ),
  acct_btc_allocation_pct REAL,
  acct_position_summary TEXT,
  acct_horizon_hint TEXT CHECK (
    acct_horizon_hint IN ('short_term', 'swing', 'long_term') OR acct_horizon_hint IS NULL
  ),
  acct_captured_at TEXT,

  evolution_stability REAL NOT NULL DEFAULT 0.2,
  evolution_last_memory_id TEXT,
  evolution_last_shift_summary TEXT,
  evolution_recent_deltas TEXT NOT NULL DEFAULT '[]',
  memory_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_trading_twins_status ON trading_twins(status);
CREATE INDEX IF NOT EXISTS idx_trading_twins_user_id ON trading_twins(user_id);

CREATE TABLE IF NOT EXISTS decision_memories (
  id TEXT PRIMARY KEY,
  twin_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  scenario_id TEXT,
  demo_tag TEXT,

  -- market context
  symbol TEXT NOT NULL,
  market_summary TEXT NOT NULL,
  price_change_pct REAL NOT NULL,
  volatility_regime TEXT CHECK (
    volatility_regime IN ('low', 'medium', 'high', 'extreme') OR volatility_regime IS NULL
  ),
  volume_change_pct REAL,
  oi_change_pct REAL,
  funding_rate REAL,
  funding_elevated INTEGER,
  market_source TEXT NOT NULL CHECK (
    market_source IN ('binance_mcp', 'demo_fixture', 'interview_scenario')
  ),

  -- account context snapshot
  acct_exposure TEXT CHECK (acct_exposure IN ('low', 'medium', 'high') OR acct_exposure IS NULL),
  acct_concentration TEXT CHECK (
    acct_concentration IN ('low', 'medium', 'high') OR acct_concentration IS NULL
  ),
  acct_btc_allocation_pct REAL,
  acct_position_summary TEXT,
  acct_horizon_hint TEXT CHECK (
    acct_horizon_hint IN ('short_term', 'swing', 'long_term') OR acct_horizon_hint IS NULL
  ),

  -- twin modeled response (AI state)
  twin_decision_pattern TEXT NOT NULL,
  twin_reasoning TEXT NOT NULL,
  twin_confidence REAL NOT NULL,
  twin_activated_dimensions TEXT NOT NULL DEFAULT '[]',
  twin_ui_headline TEXT,

  -- user reality
  user_actual_choice TEXT NOT NULL,
  user_explanation TEXT,
  user_choice_source TEXT NOT NULL CHECK (
    user_choice_source IN ('user_ui', 'interview', 'demo')
  ),

  -- learning
  diff_aligned INTEGER NOT NULL,
  diff_gap_type TEXT NOT NULL,
  diff_summary TEXT NOT NULL,
  learning_applied INTEGER NOT NULL,
  learning_deltas TEXT NOT NULL DEFAULT '{}',
  confidence_change TEXT NOT NULL DEFAULT '{}',
  learning_narrative TEXT NOT NULL,

  snapshot_before TEXT NOT NULL,
  snapshot_after TEXT NOT NULL,

  FOREIGN KEY (twin_id) REFERENCES trading_twins(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_decision_memories_twin_created
  ON decision_memories(twin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_decision_memories_scenario
  ON decision_memories(scenario_id);
