import { useState, useEffect } from "react";
import { journeyApi } from "../services/api";

export default function MyAlarmsModal({ isOpen, onClose, onOpenInTrainModal }) {
  const [alarms, setAlarms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAlarms = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await journeyApi.getAlarms();
      setAlarms(res?.data || []);
    } catch (err) {
      setError(err.message || "Failed to load alarms.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAlarms();
    }
  }, [isOpen]);

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this journey record?")) return;
    try {
      await journeyApi.deleteAlarm(id);
      setAlarms(alarms.filter((a) => a.id !== id));
    } catch (err) {
      alert("Failed to delete alarm: " + err.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="my-alarms-content" onClick={(e) => e.stopPropagation()}>
        <div className="my-alarms-header">
          <div>
            <h3>My Saved Journeys & Station Alarms</h3>
            <p className="subtitle">All active and historical destination wake-up alarms</p>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {loading ? (
          <div className="alarms-loading">
            <div className="spinner"></div>
            <p>Loading your journeys...</p>
          </div>
        ) : error ? (
          <div className="auth-error-banner">
            <span>⚠️</span> {error}
          </div>
        ) : alarms.length === 0 ? (
          <div className="no-alarms-card">
            <div className="no-alarms-icon">📭</div>
            <h4>No Saved Journeys Yet</h4>
            <p>
              When you travel on a train, turn on <strong>In-Train Mode</strong> to set an arrival alarm. All your trips and alerts will be securely saved here.
            </p>
            <button
              className="btn-primary-large"
              onClick={() => {
                onClose();
                onOpenInTrainModal();
              }}
            >
              🚆 Setup My First Alarm
            </button>
          </div>
        ) : (
          <div className="alarms-list">
            {alarms.map((alarm) => (
              <div key={alarm.id} className={`alarm-card status-${alarm.status}`}>
                <div className="alarm-card-header">
                  <span className="alarm-train-badge">
                    🚆 {alarm.train_number} {alarm.train_name ? `— ${alarm.train_name}` : ""}
                  </span>
                  <span className={`alarm-status-pill status-${alarm.status}`}>
                    {alarm.status.toUpperCase()}
                  </span>
                </div>

                <div className="alarm-card-body">
                  <div className="alarm-dest-row">
                    <span className="dest-label">Destination Station:</span>
                    <strong>{alarm.destination_station}</strong>
                    {alarm.destination_code && (
                      <span className="dest-code">({alarm.destination_code})</span>
                    )}
                  </div>

                  <div className="alarm-meta-row">
                    <span>Radius: {alarm.alarm_distance_km} km</span>
                    <span>•</span>
                    <span>
                      Created: {new Date(alarm.created_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>

                <div className="alarm-card-actions">
                  <button
                    className="btn-delete-alarm"
                    onClick={() => handleDelete(alarm.id)}
                    title="Delete record"
                  >
                    🗑 Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
