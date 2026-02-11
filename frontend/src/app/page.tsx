"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://localhost:8000";

type AuthMode = "login" | "register";
type TradeDirection = "buy" | "sell";

type InventoryItem = {
  name: string;
  commodity_id: number;
  quantity: number;
  buy_price: number;
  sell_price: number;
};

export default function Home() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Ready for jump clearance.");
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [stationId, setStationId] = useState("1");
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [selectedCommodity, setSelectedCommodity] = useState<number | null>(null);
  const [tradeQty, setTradeQty] = useState("1");
  const [direction, setDirection] = useState<TradeDirection>("buy");
  const [tradeStatus, setTradeStatus] = useState("Awaiting market data.");
  const [tradeLoading, setTradeLoading] = useState(false);
  const [showAuthMenu, setShowAuthMenu] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("elite_token");
    const storedUser = window.localStorage.getItem("elite_user_id");
    if (stored) {
      setToken(stored);
    }
    if (storedUser) {
      setUserId(Number(storedUser));
    }
  }, []);

  useEffect(() => {
    void fetchInventory();
  }, [stationId]);

  const canSubmit = useMemo(() => {
    if (!email || !password) return false;
    if (mode === "register" && !username) return false;
    return !loading;
  }, [email, password, username, mode, loading]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setStatus("Contacting station control...");

    const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
    const payload =
      mode === "register"
        ? { email, username, password }
        : { email, password };

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        setStatus(data?.error?.message || data?.detail || "Auth failed.");
        setLoading(false);
        return;
      }

      setToken(data.token);
      setUserId(data.user_id);
      window.localStorage.setItem("elite_token", data.token);
      window.localStorage.setItem("elite_user_id", String(data.user_id));
      setStatus("Docking sequence green. Token stored.");
    } catch (error) {
      setStatus("Network failure. Check API availability.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUserId(null);
    window.localStorage.removeItem("elite_token");
    window.localStorage.removeItem("elite_user_id");
    setStatus("Login required to access market.");
    setShowAuthMenu(false);
  };

  const handleSwitchAccount = () => {
    handleLogout();
    setMode("login");
    setPassword("");
  };

  const fetchInventory = async (options?: { silent?: boolean }) => {
    if (!stationId.trim()) return;
    setTradeLoading(true);
    if (!options?.silent) {
      setTradeStatus("Polling station market feed...");
    }
    try {
      const response = await fetch(
        `${API_BASE}/api/stations/${stationId}/inventory`,
        {
          headers: token
            ? { Authorization: `Bearer ${token}` }
            : undefined,
        }
      );
      const data = await response.json();
      if (!response.ok) {
        if (!options?.silent) {
          setTradeStatus(
            data?.error?.message || data?.detail || "Inventory unavailable."
          );
        }
        setInventory([]);
        setTradeLoading(false);
        return;
      }
      setInventory(data);
      if (data.length && selectedCommodity === null) {
        setSelectedCommodity(data[0].commodity_id);
      }
      if (!options?.silent) {
        setTradeStatus("Market data locked.");
      }
    } catch (error) {
      if (!options?.silent) {
        setTradeStatus("Market uplink failed.");
      }
      setInventory([]);
    } finally {
      setTradeLoading(false);
    }
  };

  const handleTrade = async () => {
    if (!stationId.trim()) return;
    if (!selectedCommodity) {
      setTradeStatus("Select a commodity first.");
      return;
    }
    const qty = Number(tradeQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setTradeStatus("Quantity must be positive.");
      return;
    }

    setTradeLoading(true);
    setTradeStatus("Submitting trade order...");
    try {
      const response = await fetch(
        `${API_BASE}/api/stations/${stationId}/trade`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            commodity_id: selectedCommodity,
            qty,
            direction,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        setTradeStatus(data?.error?.message || data?.detail || "Trade failed.");
        setTradeLoading(false);
        return;
      }
      await fetchInventory({ silent: true });
      setTradeStatus(`Trade cleared. Remaining: ${data.remaining}`);
    } catch (error) {
      setTradeStatus("Trade uplink failed.");
    } finally {
      setTradeLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.hero}>
          <p className={styles.kicker}>Elite Chronicles</p>
          <h1>Command clearance console</h1>
          <p className={styles.subhead}>
            Authenticate, grab a token, and unlock the first end-to-end slice.
          </p>
          <div className={styles.signalRow}>
            <span>API</span>
            <code>{API_BASE}</code>
            <span className={styles.pulse} />
          </div>
        </section>

        {!token ? (
          <section className={styles.panel}>
            <div className={styles.modeSwitch}>
              <button
                type="button"
                className={mode === "login" ? styles.active : ""}
                onClick={() => setMode("login")}
              >
                Login
              </button>
              <button
                type="button"
                className={mode === "register" ? styles.active : ""}
                onClick={() => setMode("register")}
              >
                Register
              </button>
            </div>

            <div className={styles.form}>
              <label>
                <span>Email</span>
                <input
                  type="email"
                  placeholder="pilot@elite.local"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>

              {mode === "register" ? (
                <label>
                  <span>Callsign</span>
                  <input
                    type="text"
                    placeholder="Commander Nova"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </label>
              ) : null}

              <label>
                <span>Password</span>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                disabled={!canSubmit}
                onClick={handleSubmit}
              >
                {loading ? "Syncing..." : "Request clearance"}
              </button>
            </div>
          </section>
        ) : (
          <section className={styles.authChip}>
            <div>
              <p className={styles.label}>Authenticated</p>
              <p className={styles.chipTitle}>Commander {userId ?? "-"}</p>
            </div>
            <div className={styles.chipMeta}>
              <span>Token</span>
              <code>{token ? `${token.slice(0, 10)}...` : "-"}</code>
            </div>
            <button type="button" onClick={() => setShowAuthMenu(true)}>
              Switch account / logout
            </button>
          </section>
        )}

        {showAuthMenu ? (
          <div className={styles.authOverlay} role="dialog" aria-modal="true">
            <div className={styles.authDialog}>
              <div>
                <p className={styles.label}>Session Options</p>
                <h3>Commander {userId ?? "-"}</h3>
                <p className={styles.dialogSubhead}>
                  Choose to keep your current session or swap accounts.
                </p>
              </div>
              <div className={styles.dialogActions}>
                <button type="button" onClick={() => setShowAuthMenu(false)}>
                  Return to session
                </button>
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={handleSwitchAccount}
                >
                  Switch account
                </button>
                <button
                  type="button"
                  className={styles.danger}
                  onClick={handleLogout}
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {token ? (
          <section className={styles.tradePanel}>
            <div className={styles.tradeHeader}>
              <div>
                <p className={styles.label}>Station Market</p>
                <h2>Vega Tradeport</h2>
                <p className={styles.tradeSubhead}>Live station inventory</p>
              </div>
              <div className={styles.stationInput}>
                <label>
                  <span>Station ID</span>
                  <input
                    type="text"
                    value={stationId}
                    onChange={(event) => setStationId(event.target.value)}
                  />
                </label>
                <button type="button" onClick={fetchInventory}>
                  Refresh
                </button>
              </div>
            </div>

            <div className={styles.tradeGrid}>
              <div className={styles.inventoryList}>
                {inventory.length ? (
                  inventory.map((item) => (
                    <button
                      key={item.commodity_id}
                      type="button"
                      className={
                        selectedCommodity === item.commodity_id
                          ? styles.inventoryItemActive
                          : styles.inventoryItem
                      }
                      onClick={() => setSelectedCommodity(item.commodity_id)}
                    >
                      <div>
                        <p>{item.name}</p>
                        <span>{item.quantity} units</span>
                      </div>
                      <div>
                        <p>Buy {item.buy_price}</p>
                        <span>Sell {item.sell_price}</span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className={styles.emptyState}>No inventory loaded.</div>
                )}
              </div>

              <div className={styles.tradeControls}>
                <div className={styles.segmented}>
                  <button
                    type="button"
                    className={direction === "buy" ? styles.segmentActive : ""}
                    onClick={() => setDirection("buy")}
                  >
                    Buy
                  </button>
                  <button
                    type="button"
                    className={direction === "sell" ? styles.segmentActive : ""}
                    onClick={() => setDirection("sell")}
                  >
                    Sell
                  </button>
                </div>

                <label>
                  <span>Quantity</span>
                  <input
                    type="number"
                    min="1"
                    value={tradeQty}
                    onChange={(event) => setTradeQty(event.target.value)}
                  />
                </label>

                <button
                  type="button"
                  onClick={handleTrade}
                  disabled={tradeLoading}
                >
                  {tradeLoading ? "Submitting..." : "Execute trade"}
                </button>

                <div className={styles.tradeStatus}>
                  <p className={styles.label}>Market Status</p>
                  <p>{tradeStatus}</p>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className={styles.statusPanel}>
          <div>
            <p className={styles.label}>Status</p>
            <p className={styles.status}>{status}</p>
          </div>
          <div className={styles.meta}>
            <div>
              <p className={styles.label}>User</p>
              <p>{userId ?? "-"}</p>
            </div>
            <div>
              <p className={styles.label}>Token</p>
              <p className={styles.mono}>
                {token ? `${token.slice(0, 8)}...` : "-"}
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
