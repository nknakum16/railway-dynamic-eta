import { useState, useEffect } from "react";
import { notificationApi } from "../services/api";

export default function WatchJourneyModal({
  isOpen,
  onClose,
  train,
  onSuccess,
}) {
  const [targetStationCode, setTargetStationCode] = useState("");
  const [notifyDelay, setNotifyDelay] = useState(true);
  const [delayThreshold, setDelayThreshold] = useState(15);
  const [notifyEta, setNotifyEta] = useState(true);
  const [etaThreshold, setEtaThreshold] = useState(10);
  const [notifyDeparture, setNotifyDeparture] = useState(true);
  const [notifyApproaching, setNotifyApproaching] = useState(true);
  const [notifySeverity, setNotifySeverity] = useState(true);
  const [notifyPlatform, setNotifyPlatform] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const route = train?.route || [];

  useEffect(() => {
    if (train && route.length > 0) {
      // Default target station is the final destination stop
      const lastStop = route[route.length - 1];
      setTargetStationCode(lastStop.stationCode || lastStop.station);
    }
  }, [train]);

  if (!isOpen || !train) return null;

  const targetStationObj = route.find(
    (s) => (s.stationCode || s.station) === targetStationCode
  ) || route[route.length - 1];

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const payload = {
        train_number: String(train.number),
        train_name: train.name,
        origin_station: train.from,
        destination_station: train.to,
        target_station_code: targetStationObj?.stationCode || targetStationCode,
        target_station_name: targetStationObj?.station || train.to,
        preferences: {
          notify_significant_delay: notifyDelay,
          delay_threshold_mins: Number(delayThreshold) || 15,
          notify_eta_changed: notifyEta,
          eta_threshold_mins: Number(etaThreshold) || 10,
          notify_departure: notifyDeparture,
          notify_approaching: notifyApproaching,
          approaching_distance_km: 10.0,
          notify_delay_severity: notifySeverity,
          notify_platform: notifyPlatform,
        },
      };

      const result = await notificationApi.watchJourney(payload);

      if (result.success) {
        setSuccessMsg(`Now watching Train ${train.number}!`);
        if (onSuccess) onSuccess(result.data);
        setTimeout(() => {
          setSuccessMsg("");
          onClose();
        }, 1200);
      } else {
        throw new Error(result.error || "Failed to save watch preferences.");
      }
    } catch (err) {
      console.error("Watch journey error:", err);
      setErrorMsg(err.message || "Failed to watch journey. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-container watch-journey-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title-wrap">
            <span className="modal-badge-icon">🔔</span>
            <div>
              <h3>Watch Journey</h3>
              <p className="modal-subtitle">
                {train.number} — {train.name}
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="watch-form">
          <div className="watch-journey-info">
            <span className="route-endpoints">
              {train.from} ➔ {train.to}
            </span>
            <div className="target-picker-group">
              <label htmlFor="target-stop-select">
                🎯 Alert me for arrival at:
              </label>
              <select
                id="target-stop-select"
                value={targetStationCode}
                onChange={(e) => setTargetStationCode(e.target.value)}
                className="target-select"
              >
                {route.map((stop, idx) => (
                  <option
                    key={`${stop.stationCode || stop.station}-${idx}`}
                    value={stop.stationCode || stop.station}
                  >
                    {stop.station} ({stop.stationCode || "Stop"}
                    {stop.expected ? ` - ETA ${stop.expected}` : ""})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="preferences-list">
            <h4 className="preferences-heading">Notify me about:</h4>

            {/* 1. Significant Delay */}
            <div className="pref-item">
              <label className="pref-label">
                <input
                  type="checkbox"
                  checked={notifyDelay}
                  onChange={(e) => setNotifyDelay(e.target.checked)}
                />
                <span className="pref-title">⏱️ Significant Delay</span>
              </label>
              {notifyDelay && (
                <div className="pref-config">
                  <span>Notify when delay is ≥</span>
                  <input
                    type="number"
                    min="5"
                    max="180"
                    step="5"
                    value={delayThreshold}
                    onChange={(e) => setDelayThreshold(e.target.value)}
                    className="pref-input"
                  />
                  <span>mins</span>
                </div>
              )}
            </div>

            {/* 2. ETA Shift */}
            <div className="pref-item">
              <label className="pref-label">
                <input
                  type="checkbox"
                  checked={notifyEta}
                  onChange={(e) => setNotifyEta(e.target.checked)}
                />
                <span className="pref-title">🕒 ETA Changes Significantly</span>
              </label>
              {notifyEta && (
                <div className="pref-config">
                  <span>Notify if ETA shifts by ≥</span>
                  <input
                    type="number"
                    min="5"
                    max="60"
                    step="5"
                    value={etaThreshold}
                    onChange={(e) => setEtaThreshold(e.target.value)}
                    className="pref-input"
                  />
                  <span>mins</span>
                </div>
              )}
            </div>

            {/* 3. Train Departure */}
            <div className="pref-item">
              <label className="pref-label">
                <input
                  type="checkbox"
                  checked={notifyDeparture}
                  onChange={(e) => setNotifyDeparture(e.target.checked)}
                />
                <span className="pref-title">🚆 Train Departure</span>
              </label>
              <p className="pref-desc">
                Receive an alert when the train departs from its origin station.
              </p>
            </div>

            {/* 4. Approaching Destination */}
            <div className="pref-item">
              <label className="pref-label">
                <input
                  type="checkbox"
                  checked={notifyApproaching}
                  onChange={(e) => setNotifyApproaching(e.target.checked)}
                />
                <span className="pref-title">📍 Approaching My Station</span>
              </label>
              <p className="pref-desc">
                Proximity wake-up alert when within 10 km (GPS) or 1 stop before your destination.
              </p>
            </div>

            {/* 5. Major Delay Severity Tiers */}
            <div className="pref-item">
              <label className="pref-label">
                <input
                  type="checkbox"
                  checked={notifySeverity}
                  onChange={(e) => setNotifySeverity(e.target.checked)}
                />
                <span className="pref-title">🚦 Major Delay Severity Tiers</span>
              </label>
              <p className="pref-desc">
                Alerts on tier transitions: 🟢 On Time ➔ 🟡 Minor ➔ 🟠 Moderate ➔ 🔴 Major delay.
              </p>
            </div>

            {/* 6. Platform Change */}
            <div className="pref-item">
              <label className="pref-label">
                <input
                  type="checkbox"
                  checked={notifyPlatform}
                  onChange={(e) => setNotifyPlatform(e.target.checked)}
                />
                <span className="pref-title">🛤 Platform Change Alert</span>
              </label>
              <p className="pref-desc">
                Only notified if platform change data is confirmed by railway telemetry.
              </p>
            </div>
          </div>

          {errorMsg && <div className="modal-error-banner">{errorMsg}</div>}
          {successMsg && (
            <div className="modal-success-banner">✓ {successMsg}</div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "🔔 Save Watch Preferences"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
