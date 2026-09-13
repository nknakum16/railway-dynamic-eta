import { useState, useEffect } from "react";
import { notificationApi } from "../services/api";

export default function NotificationCenter({
  isOpen,
  onClose,
  onNotificationRead,
  onOpenWatchModal,
}) {
  const [activeTab, setActiveTab] = useState("notifications"); // 'notifications' | 'watched'
  const [filterUnread, setFilterUnread] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [watchedJourneys, setWatchedJourneys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [notifsRes, watchedRes] = await Promise.all([
        notificationApi.getNotifications(50),
        notificationApi.getWatchedJourneys(),
      ]);

      if (notifsRes?.success && notifsRes?.data) {
        setNotifications(notifsRes.data.notifications || []);
        setUnreadCount(notifsRes.data.unread_count || 0);
        if (onNotificationRead) onNotificationRead(notifsRes.data.unread_count || 0);
      }

      if (watchedRes?.success && watchedRes?.data) {
        setWatchedJourneys(watchedRes.data || []);
      }
    } catch (err) {
      console.error("Error fetching notification data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAllData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleMarkAsRead = async (notifId, isRead) => {
    if (isRead) return;
    try {
      await notificationApi.markAsRead(notifId);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      if (onNotificationRead) onNotificationRead(Math.max(0, unreadCount - 1));
    } catch (err) {
      console.error("Error marking read:", err);
    }
  };

  const handleMarkAllRead = async () => {
    setActionLoading(true);
    try {
      await notificationApi.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      if (onNotificationRead) onNotificationRead(0);
    } catch (err) {
      console.error("Error marking all read:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnwatch = async (watchedId) => {
    if (!window.confirm("Stop watching this train journey?")) return;
    try {
      await notificationApi.unwatchJourney(watchedId);
      setWatchedJourneys((prev) => prev.filter((w) => w.id !== watchedId));
    } catch (err) {
      console.error("Error unwatching:", err);
    }
  };

  const filteredNotifs = filterUnread
    ? notifications.filter((n) => !n.is_read)
    : notifications;

  const formatRelativeTime = (isoString) => {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / (1000 * 60));
      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  const getSeverityBadge = (severity, type) => {
    switch (severity) {
      case "major":
        return <span className="notif-severity-badge severity-major">🔴 Major</span>;
      case "moderate":
        return <span className="notif-severity-badge severity-moderate">🟠 Moderate</span>;
      case "minor":
        return <span className="notif-severity-badge severity-minor">🟡 Minor</span>;
      case "on_time":
        return <span className="notif-severity-badge severity-ontime">🟢 On Time</span>;
      default:
        return <span className="notif-severity-badge severity-info">ℹ️ Update</span>;
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="notification-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="drawer-header">
          <div className="drawer-title-group">
            <span className="drawer-icon">🔔</span>
            <div>
              <h3>Notification Center</h3>
              <p className="drawer-subtitle">
                Real-time dynamic journey alerts
              </p>
            </div>
          </div>
          <div className="drawer-header-actions">
            {unreadCount > 0 && (
              <button
                className="btn-mark-all-read"
                onClick={handleMarkAllRead}
                disabled={actionLoading}
              >
                ✓ Mark all read
              </button>
            )}
            <button className="drawer-close-btn" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="drawer-tabs">
          <button
            className={`drawer-tab ${activeTab === "notifications" ? "active" : ""}`}
            onClick={() => setActiveTab("notifications")}
          >
            All Alerts ({notifications.length})
            {unreadCount > 0 && <span className="tab-unread-pill">{unreadCount}</span>}
          </button>
          <button
            className={`drawer-tab ${activeTab === "watched" ? "active" : ""}`}
            onClick={() => setActiveTab("watched")}
          >
            Watched Trains ({watchedJourneys.length})
          </button>
        </div>

        {/* Tab 1: Notifications List */}
        {activeTab === "notifications" && (
          <div className="drawer-content">
            <div className="drawer-filter-bar">
              <span className="filter-title">
                Showing {filteredNotifs.length} {filterUnread ? "unread" : "total"} updates
              </span>
              <button
                className={`btn-filter-pill ${filterUnread ? "active" : ""}`}
                onClick={() => setFilterUnread(!filterUnread)}
              >
                {filterUnread ? "Show All" : "Unread Only"}
              </button>
            </div>

            {loading ? (
              <div className="drawer-loading">Fetching journey alerts...</div>
            ) : filteredNotifs.length === 0 ? (
              <div className="drawer-empty-state">
                <span className="empty-emoji">🔕</span>
                <h4>No {filterUnread ? "unread" : ""} notifications</h4>
                <p>
                  Search for a train and click <strong>Watch This Journey</strong> to receive alerts about delays, ETA changes, and station approach!
                </p>
              </div>
            ) : (
              <div className="notifications-stream">
                {filteredNotifs.map((notif) => (
                  <div
                    key={notif.id}
                    className={`notif-card ${notif.is_read ? "read" : "unread"}`}
                    onClick={() => handleMarkAsRead(notif.id, notif.is_read)}
                  >
                    {!notif.is_read && <span className="unread-dot" title="Unread"></span>}
                    <div className="notif-top">
                      <span className="notif-train-pill">🚆 {notif.train_number}</span>
                      {getSeverityBadge(notif.severity, notif.notification_type)}
                      <span className="notif-time">{formatRelativeTime(notif.created_at)}</span>
                    </div>
                    <h5 className="notif-title">{notif.title}</h5>
                    <p className="notif-message">{notif.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Watched Trains */}
        {activeTab === "watched" && (
          <div className="drawer-content">
            {watchedJourneys.length === 0 ? (
              <div className="drawer-empty-state">
                <span className="empty-emoji">🚆</span>
                <h4>No active watched journeys</h4>
                <p>
                  Watch a train from the search results to get proactive notifications for delay jumps, ETA shifts, or destination arrival.
                </p>
              </div>
            ) : (
              <div className="watched-journeys-stream">
                {watchedJourneys.map((item) => (
                  <div key={item.id} className="watched-card">
                    <div className="watched-card-header">
                      <div>
                        <h4>
                          {item.train_number} — {item.train_name || "Express"}
                        </h4>
                        <span className="watched-route">
                          {item.origin_station || "Origin"} ➔ {item.destination_station || "Destination"}
                        </span>
                      </div>
                      <button
                        className="btn-unwatch"
                        onClick={() => handleUnwatch(item.id)}
                        title="Remove from watch list"
                      >
                        Stop Watching
                      </button>
                    </div>

                    <div className="watched-details">
                      {item.target_station_name && (
                        <div className="watched-detail-row">
                          <span>🎯 Target Station:</span>
                          <strong>{item.target_station_name}</strong>
                        </div>
                      )}
                      <div className="watched-tags">
                        {item.notify_significant_delay && (
                          <span className="pref-badge">⏱️ Delay ≥ {item.delay_threshold_mins}m</span>
                        )}
                        {item.notify_eta_changed && (
                          <span className="pref-badge">🕒 ETA Shift ≥ {item.eta_threshold_mins}m</span>
                        )}
                        {item.notify_departure && (
                          <span className="pref-badge">🚆 Departure</span>
                        )}
                        {item.notify_approaching && (
                          <span className="pref-badge">📍 Approaching</span>
                        )}
                        {item.notify_delay_severity && (
                          <span className="pref-badge">🚦 Severity</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
