import type { MarketContext, TradingTwinProfile } from "../domain/types.js";

const now = "2026-09-02T08:00:00.000Z";

export const TWIN_A_ID = "00000000-0000-4000-8000-0000000000a1";
export const TWIN_B_ID = "00000000-0000-4000-8000-0000000000b2";

export const sameMarketStimulus: MarketContext = {
  symbol: "BTCUSDT",
  summary: "BTC +8% with rising open interest and elevated funding",
  metrics: {
    price_change_pct: 8.0,
    volatility_regime: "high",
    volume_change_pct: 42.0,
    open_interest_change_pct: 20.0,
    funding_rate: 0.0008,
    funding_elevated: true,
  },
  source: "demo_fixture",
};

export const twinAFixture: TradingTwinProfile = {
  id: TWIN_A_ID,
  user_id: null,
  display_name: "Trader A",
  version: 2,
  status: "demo_preset",
  created_at: now,
  updated_at: now,
  cold_start: {
    method: "demo_preset",
    completed: true,
    interview_turns: 0,
  },
  decision_tendencies: {
    momentum_preference: 78,
    patience: 25,
    fomo_tendency: 70,
    confirmation_need: 30,
    holding_preference: 28,
  },
  risk_preferences: {
    risk_tolerance: 72,
    drawdown_response: 22,
    size_aggression: 75,
    exposure_comfort: 85,
  },
  scenario_response_patterns: {
    same_market_demo: {
      reduce_risk: 70,
      chase_entry: 25,
      hold: 10,
    },
    rapid_pump: {
      reduce_risk: 65,
      chase_entry: 40,
      observe_wait: 20,
    },
    sharp_drop: {
      reduce_risk: 75,
      exit_bias: 40,
      hold: 15,
    },
    false_breakout: {
      trim: 60,
      observe_wait: 30,
      chase_entry: 25,
    },
  },
  confidence: {
    overall: 0.72,
    by_dimension: {
      momentum_preference: 0.7,
      patience: 0.55,
      fomo_tendency: 0.68,
      drawdown_response: 0.75,
    },
  },
  style_tags: ["high_exposure", "short_term", "low_drawdown_tolerance"],
  account_context_latest: {
    exposure: "high",
    concentration: "high",
    btc_allocation_pct: 80,
    position_summary: "BTC ~80% of portfolio, short-horizon book",
    horizon_hint: "short_term",
    captured_at: now,
  },
  evolution: {
    version: 2,
    memory_count: 0,
    last_memory_id: null,
    last_shift_summary: null,
    stability: 0.55,
    recent_delta_magnitudes: [],
  },
  memory_count: 0,
};

export const twinBFixture: TradingTwinProfile = {
  id: TWIN_B_ID,
  user_id: null,
  display_name: "Trader B",
  version: 2,
  status: "demo_preset",
  created_at: now,
  updated_at: now,
  cold_start: {
    method: "demo_preset",
    completed: true,
    interview_turns: 0,
  },
  decision_tendencies: {
    momentum_preference: 40,
    patience: 78,
    fomo_tendency: 22,
    confirmation_need: 65,
    holding_preference: 82,
  },
  risk_preferences: {
    risk_tolerance: 45,
    drawdown_response: 70,
    size_aggression: 25,
    exposure_comfort: 30,
  },
  scenario_response_patterns: {
    same_market_demo: {
      hold: 75,
      observe_wait: 55,
      reduce_risk: 15,
      chase_entry: 10,
    },
    rapid_pump: {
      observe_wait: 70,
      hold: 50,
      chase_entry: 15,
    },
    sharp_drop: {
      hold: 70,
      reduce_risk: 25,
      enter_small: 20,
    },
    false_breakout: {
      observe_wait: 75,
      trim: 20,
      chase_entry: 10,
    },
  },
  confidence: {
    overall: 0.74,
    by_dimension: {
      patience: 0.78,
      holding_preference: 0.8,
      confirmation_need: 0.7,
      fomo_tendency: 0.6,
    },
  },
  style_tags: ["low_exposure", "long_term_holder"],
  account_context_latest: {
    exposure: "low",
    concentration: "low",
    btc_allocation_pct: 10,
    position_summary: "BTC ~10% of portfolio, long-horizon hold",
    horizon_hint: "long_term",
    captured_at: now,
  },
  evolution: {
    version: 2,
    memory_count: 0,
    last_memory_id: null,
    last_shift_summary: null,
    stability: 0.55,
    recent_delta_magnitudes: [],
  },
  memory_count: 0,
};

export const marketScenarios = {
  rapid_pump: {
    scenario_id: "rapid_pump",
    market_stimulus: {
      symbol: "BTCUSDT",
      summary: "BTC +12% in <2h; volume and social heat spike",
      metrics: {
        price_change_pct: 12.0,
        volatility_regime: "extreme" as const,
        volume_change_pct: 95.0,
        open_interest_change_pct: 18.0,
        funding_rate: 0.0011,
        funding_elevated: true,
      },
      source: "demo_fixture" as const,
    },
  },
  sharp_drop: {
    scenario_id: "sharp_drop",
    market_stimulus: {
      symbol: "BTCUSDT",
      summary: "BTC -9%; liquidity stress; funding flips negative",
      metrics: {
        price_change_pct: -9.0,
        volatility_regime: "extreme" as const,
        volume_change_pct: 110.0,
        open_interest_change_pct: -12.0,
        funding_rate: -0.0004,
        funding_elevated: false,
      },
      source: "demo_fixture" as const,
    },
  },
  false_breakout: {
    scenario_id: "false_breakout",
    market_stimulus: {
      symbol: "BTCUSDT",
      summary: "Breakout fails reclaim; price back in range; OI elevated then stalls",
      metrics: {
        price_change_pct: 1.5,
        volatility_regime: "high" as const,
        volume_change_pct: 55.0,
        open_interest_change_pct: 14.0,
        funding_rate: 0.0005,
        funding_elevated: true,
      },
      source: "demo_fixture" as const,
    },
  },
} as const;
