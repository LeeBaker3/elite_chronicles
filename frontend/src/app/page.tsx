"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DataState } from "../components/ui/DataState";
import { useToast } from "../components/ui/ToastProvider";
import { Tooltip } from "../components/ui/Tooltip";
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

type CargoItem = {
  commodity_id: number;
  commodity_name: string;
  quantity: number;
};

type ShipCargoData = {
  ship_id: number;
  cargo_capacity: number;
  cargo_used: number;
  cargo_free: number;
  items: CargoItem[];
};

type StationOption = {
  id: number;
  name: string;
};

type StorySessionItem = {
  id: number;
  location_type: string;
  location_id: number;
  status: string;
};

export default function Home() {
  const { showToast } = useToast();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Ready for jump clearance.");
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [stationId, setStationId] = useState("1");
  const [stationOptions, setStationOptions] = useState<StationOption[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [selectedCommodity, setSelectedCommodity] = useState<number | null>(null);
  const [tradeQty, setTradeQty] = useState("1");
  const [shipId, setShipId] = useState("1");
  const [shipCargo, setShipCargo] = useState<ShipCargoData | null>(null);
  const [cargoLoading, setCargoLoading] = useState(false);
  const [cargoError, setCargoError] = useState<string | null>(null);
  const [direction, setDirection] = useState<TradeDirection>("buy");
  const [tradeStatus, setTradeStatus] = useState("Awaiting market data.");
  const [tradeLoading, setTradeLoading] = useState(false);
  const [showAuthMenu, setShowAuthMenu] = useState(false);
  const [storySessions, setStorySessions] = useState<StorySessionItem[]>([]);
  const [storyLoading, setStoryLoading] = useState(false);
  const [storyError, setStoryError] = useState<string | null>(null);

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
        const message = data?.error?.message || data?.detail || "Auth failed.";
        setStatus(message);
        showToast({ message, variant: "error" });
        setLoading(false);
        return;
      }

      setToken(data.token);
      setUserId(data.user_id);
      window.localStorage.setItem("elite_token", data.token);
      window.localStorage.setItem("elite_user_id", String(data.user_id));
      setStatus("Docking sequence green. Token stored.");
      showToast({ message: "Authentication successful.", variant: "success" });
    } catch {
      setStatus("Network failure. Check API availability.");
      showToast({ message: "Network failure. Check API availability.", variant: "error" });
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
    showToast({ message: "Logged out. Login required to access market.", variant: "info" });
    setShowAuthMenu(false);
    setShipCargo(null);
    setStorySessions([]);
    setStationOptions([]);
  };

  const handleSwitchAccount = () => {
    handleLogout();
    setMode("login");
    setPassword("");
  };

  const fetchInventory = useCallback(async (options?: { silent?: boolean }) => {
    if (!stationId.trim()) return;
    setInventoryLoading(true);
    setInventoryError(null);
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
        const message =
          data?.error?.message || data?.detail || "Inventory unavailable.";
        if (!options?.silent) {
          setTradeStatus(message);
          showToast({
            message,
            variant: "error",
            actionLabel: "Retry",
            onAction: () => {
              void fetchInventory({ silent: false });
            },
          });
        }
        setInventoryError(message);
        setInventory([]);
        return;
      }
      setInventory(data);
      if (data.length && selectedCommodity === null) {
        setSelectedCommodity(data[0].commodity_id);
      }
      if (!options?.silent) {
        setTradeStatus("Market data locked.");
      }
    } catch {
      setInventoryError("Market uplink failed.");
      if (!options?.silent) {
        setTradeStatus("Market uplink failed.");
        showToast({
          message: "Market uplink failed.",
          variant: "error",
          actionLabel: "Retry",
          onAction: () => {
            void fetchInventory({ silent: false });
          },
        });
      }
      setInventory([]);
    } finally {
      setInventoryLoading(false);
    }
  }, [selectedCommodity, showToast, stationId, token]);

  const fetchStations = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/stations`);
      const data = await response.json();
      if (!response.ok) {
        showToast({
          message: "Unable to load stations.",
          variant: "warning",
          actionLabel: "Retry",
          onAction: () => {
            void fetchStations();
          },
        });
        return;
      }
      setStationOptions(data);
      if (data.length && !data.some((station: StationOption) => String(station.id) === stationId)) {
        setStationId(String(data[0].id));
      }
    } catch {
      setStationOptions([]);
      showToast({
        message: "Unable to load stations.",
        variant: "warning",
        actionLabel: "Retry",
        onAction: () => {
          void fetchStations();
        },
      });
    }
  }, [showToast, stationId]);

  const fetchStorySessions = useCallback(async () => {
    if (!token) return;
    setStoryLoading(true);
    setStoryError(null);
    try {
      const response = await fetch(`${API_BASE}/api/story/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        setStorySessions([]);
        setStoryError("Unable to load story sessions.");
        showToast({
          message: "Unable to load story sessions.",
          variant: "warning",
          actionLabel: "Retry",
          onAction: () => {
            void fetchStorySessions();
          },
        });
        return;
      }
      setStorySessions(data);
    } catch {
      setStorySessions([]);
      setStoryError("Unable to load story sessions.");
      showToast({
        message: "Unable to load story sessions.",
        variant: "warning",
        actionLabel: "Retry",
        onAction: () => {
          void fetchStorySessions();
        },
      });
    } finally {
      setStoryLoading(false);
    }
  }, [showToast, token]);

  const handleStoryStart = async () => {
    if (!token || !stationId.trim()) return;
    try {
      const response = await fetch(`${API_BASE}/api/story/start/${stationId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        showToast({
          message: "Unable to start story session.",
          variant: "error",
          actionLabel: "Retry",
          onAction: () => {
            void handleStoryStart();
          },
        });
        return;
      }
      await fetchStorySessions();
      setStatus("Story session started.");
      showToast({ message: "Story session started.", variant: "success" });
    } catch {
      setStatus("Unable to start story session.");
      showToast({
        message: "Unable to start story session.",
        variant: "error",
        actionLabel: "Retry",
        onAction: () => {
          void handleStoryStart();
        },
      });
    }
  };

  const fetchShipCargo = useCallback(async (options?: { silent?: boolean }) => {
    const parsedShipId = Number(shipId);
    if (!Number.isInteger(parsedShipId) || parsedShipId <= 0) {
      setShipCargo(null);
      setCargoError("Ship ID must be a valid positive number.");
      return;
    }

    setCargoLoading(true);
    setCargoError(null);
    try {
      const response = await fetch(`${API_BASE}/api/ships/${parsedShipId}/cargo`);
      const data = await response.json();
      if (!response.ok) {
        const message =
          data?.error?.message || data?.detail || "Cargo unavailable.";
        if (!options?.silent) {
          setTradeStatus(message);
          showToast({
            message,
            variant: "warning",
            actionLabel: "Retry",
            onAction: () => {
              void fetchShipCargo({ silent: false });
            },
          });
        }
        setCargoError(message);
        setShipCargo(null);
        return;
      }
      setShipCargo(data);
    } catch {
      setCargoError("Cargo uplink failed.");
      if (!options?.silent) {
        setTradeStatus("Cargo uplink failed.");
        showToast({
          message: "Cargo uplink failed.",
          variant: "error",
          actionLabel: "Retry",
          onAction: () => {
            void fetchShipCargo({ silent: false });
          },
        });
      }
      setShipCargo(null);
    } finally {
      setCargoLoading(false);
    }
  }, [shipId, showToast]);

  useEffect(() => {
    void fetchInventory();
  }, [fetchInventory]);

  useEffect(() => {
    if (!token) {
      setStationOptions([]);
      setStorySessions([]);
      return;
    }
    void fetchStations();
    void fetchStorySessions();
  }, [fetchStations, fetchStorySessions, token]);

  useEffect(() => {
    if (!token) {
      setShipCargo(null);
      setCargoError(null);
      return;
    }
    void fetchShipCargo({ silent: true });
  }, [fetchShipCargo, token]);

  const handleTrade = async () => {
    if (!stationId.trim()) return;
    if (!selectedCommodity) {
      setTradeStatus("Select a commodity first.");
      return;
    }
    const qty = Number(tradeQty);
    const parsedShipId = Number(shipId);
    if (!Number.isFinite(qty) || qty <= 0) {
      setTradeStatus("Quantity must be positive.");
      return;
    }
    if (!Number.isInteger(parsedShipId) || parsedShipId <= 0) {
      setTradeStatus("Ship ID must be a valid positive number.");
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
            ship_id: parsedShipId,
            commodity_id: selectedCommodity,
            qty,
            direction,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        const message = data?.error?.message || data?.detail || "Trade failed.";
        setTradeStatus(message);
        showToast({
          message,
          variant: "error",
          actionLabel: "Retry",
          onAction: () => {
            void handleTrade();
          },
        });
        setTradeLoading(false);
        return;
      }
      await fetchInventory({ silent: true });
      await fetchShipCargo({ silent: true });
      setTradeStatus(`Trade cleared. Remaining: ${data.remaining}`);
      showToast({ message: "Trade cleared successfully.", variant: "success" });
    } catch {
      setTradeStatus("Trade uplink failed.");
      showToast({
        message: "Trade uplink failed.",
        variant: "error",
        actionLabel: "Retry",
        onAction: () => {
          void handleTrade();
        },
      });
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
                  <Tooltip
                    content="Choose a station to load its live market inventory."
                    placement="top"
                  >
                    <select
                      value={stationId}
                      onChange={(event) => setStationId(event.target.value)}
                    >
                      {stationOptions.length ? (
                        stationOptions.map((station) => (
                          <option key={station.id} value={station.id}>
                            {station.name} (#{station.id})
                          </option>
                        ))
                      ) : (
                        <option value={stationId || "1"}>Station #{stationId || "1"}</option>
                      )}
                    </select>
                  </Tooltip>
                </label>
                <Tooltip
                  content="Fetch the latest inventory and prices for the selected station."
                  placement="top"
                >
                  <button type="button" onClick={fetchInventory}>
                    Refresh
                  </button>
                </Tooltip>
              </div>
            </div>

            <div className={styles.tradeGrid}>
              <div className={styles.inventoryList}>
                {inventoryLoading ? (
                  <DataState
                    variant="loading"
                    title="Loading market inventory"
                    description="Syncing the selected station feed."
                  />
                ) : inventoryError ? (
                  <DataState
                    variant="error"
                    title="Inventory unavailable"
                    description={inventoryError}
                    actionLabel="Retry"
                    onAction={() => {
                      void fetchInventory({ silent: false });
                    }}
                  />
                ) : inventory.length ? (
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
                  <DataState
                    variant="empty"
                    title="No inventory loaded"
                    description="Select a station or refresh to pull market data."
                    actionLabel="Refresh"
                    onAction={() => {
                      void fetchInventory({ silent: false });
                    }}
                  />
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
                  <span>Ship ID</span>
                  <input
                    type="number"
                    min="1"
                    value={shipId}
                    onChange={(event) => setShipId(event.target.value)}
                  />
                </label>

                <label>
                  <span>Quantity</span>
                  <input
                    type="number"
                    min="1"
                    value={tradeQty}
                    onChange={(event) => setTradeQty(event.target.value)}
                  />
                </label>

                <Tooltip
                  content={
                    tradeLoading
                      ? "Trade request is in progress. Please wait."
                      : "Submit this trade using current station, ship, and quantity."
                  }
                  placement="top"
                >
                  <button
                    type="button"
                    onClick={handleTrade}
                    disabled={tradeLoading}
                  >
                    {tradeLoading ? "Submitting..." : "Execute trade"}
                  </button>
                </Tooltip>

                <div className={styles.cargoPanel}>
                  <div className={styles.cargoHeader}>
                    <p className={styles.label}>Ship Cargo</p>
                    {shipCargo ? (
                      <Tooltip
                        content={
                          shipCargo.cargo_capacity <= 0
                            ? "This ship has no cargo hold. Install one before buying goods."
                            : "Cargo hold is available and can store traded commodities."
                        }
                        placement="top"
                      >
                        <span
                          className={`${styles.cargoChip} ${shipCargo.cargo_capacity <= 0
                            ? styles.cargoChipNoHold
                            : styles.cargoChipReady
                            }`}
                        >
                          {shipCargo.cargo_capacity <= 0 ? "No Hold" : "Ready"}
                        </span>
                      </Tooltip>
                    ) : null}
                  </div>
                  {cargoLoading ? (
                    <DataState
                      variant="loading"
                      title="Loading cargo"
                      description="Syncing current hold usage."
                    />
                  ) : cargoError ? (
                    <DataState
                      variant="error"
                      title="Cargo unavailable"
                      description={cargoError}
                      actionLabel="Retry"
                      onAction={() => {
                        void fetchShipCargo({ silent: false });
                      }}
                    />
                  ) : shipCargo ? (
                    <>
                      <p>
                        {shipCargo.cargo_used}/{shipCargo.cargo_capacity} used
                      </p>
                      <p>{shipCargo.cargo_free} free</p>
                      <div className={styles.cargoItems}>
                        {shipCargo.cargo_capacity <= 0 ? (
                          <p>No cargo hold installed.</p>
                        ) : shipCargo.items.length ? (
                          shipCargo.items.map((item) => (
                            <p key={item.commodity_id}>
                              {item.commodity_name}: {item.quantity}
                            </p>
                          ))
                        ) : (
                          <p>Hold empty.</p>
                        )}
                      </div>
                    </>
                  ) : (
                    <DataState
                      variant="empty"
                      title="No cargo data"
                      description="Refresh cargo to load hold details for this ship."
                      actionLabel="Refresh"
                      onAction={() => {
                        void fetchShipCargo({ silent: false });
                      }}
                    />
                  )}
                </div>

                <div className={styles.tradeStatus}>
                  <p className={styles.label}>Market Status</p>
                  <p>{tradeStatus}</p>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {token ? (
          <section className={styles.storyPanel}>
            <div className={styles.storyHeader}>
              <div>
                <p className={styles.label}>Story Log</p>
                <h3>Session timeline</h3>
              </div>
              <Tooltip
                content="Creates a new story session at the selected station."
                placement="top"
              >
                <button type="button" onClick={handleStoryStart}>
                  Start story at station
                </button>
              </Tooltip>
            </div>
            <div className={styles.storyList}>
              {storyLoading ? (
                <DataState
                  variant="loading"
                  title="Loading sessions"
                  description="Retrieving your latest story timeline."
                />
              ) : storyError ? (
                <DataState
                  variant="error"
                  title="Story sessions unavailable"
                  description={storyError}
                  actionLabel="Retry"
                  onAction={() => {
                    void fetchStorySessions();
                  }}
                />
              ) : storySessions.length ? (
                storySessions.map((session) => (
                  <div key={session.id} className={styles.storyItem}>
                    <p>Session #{session.id}</p>
                    <span>
                      {session.location_type} {session.location_id} · {session.status}
                    </span>
                  </div>
                ))
              ) : (
                <DataState
                  variant="empty"
                  title="No story sessions yet"
                  description="Start a story at the selected station to begin your timeline."
                  actionLabel="Start story"
                  onAction={() => {
                    void handleStoryStart();
                  }}
                />
              )}
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
