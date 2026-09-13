import { useState, useRef, useEffect } from "react";
import trainImage from "./assets/train.jpg";
import LiveTrainStatus from "./components/LiveTrainStatus";
import TrainSchedule from "./components/TrainSchedule";
import AuthModal from "./components/AuthModal";
import InTrainAssistant from "./components/InTrainAssistant";
import MyAlarmsModal from "./components/MyAlarmsModal";
import WatchJourneyModal from "./components/WatchJourneyModal";
import NotificationCenter from "./components/NotificationCenter";
import trainApi, { authApi, notificationApi } from "./services/api";
import "./App.css";

function App() {
  const [searchType, setSearchType] = useState("number");
  const [search, setSearch] = useState("");
  const [selectedTrain, setSelectedTrain] = useState(null);
  const [language, setLanguage] = useState("English");
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const langDropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (langDropdownRef.current && !langDropdownRef.current.contains(event.target)) {
        setLangMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectLanguage = (selectedLang, langCode) => {
    setLanguage(selectedLang);
    setLangMenuOpen(false);
    const googleSelect = document.querySelector(".goog-te-combo");
    if (googleSelect) {
      googleSelect.value = langCode;
      googleSelect.dispatchEvent(new Event("change"));
    }
  };

  const [activePage, setActivePage] = useState("home");
  const resultRef = useRef(null);
  const timelineRef = useRef(null);
  const currentStationRef = useRef(null);
  const routeSectionRef = useRef(null);
  const [darkMode, setDarkMode] = useState(false);
  const [popularTrains, setPopularTrains] = useState([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Auth, In-Train, Alarm, and Notification Modals
  const [currentUser, setCurrentUser] = useState(authApi.getUser());
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [inTrainModalOpen, setInTrainModalOpen] = useState(false);
  const [myAlarmsModalOpen, setMyAlarmsModalOpen] = useState(false);
  const [watchModalOpen, setWatchModalOpen] = useState(false);
  const [notifCenterOpen, setNotifCenterOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Background check for notifications & live triggers
  useEffect(() => {
    const checkNotifications = async () => {
      try {
        let userCoords = null;
        if ("geolocation" in navigator) {
          try {
            const pos = await new Promise((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                timeout: 3000,
                maximumAge: 60000,
              });
            });
            if (pos?.coords) {
              userCoords = {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
              };
            }
          } catch {
            // Location permission not granted; backend will use schedule estimation fallback
          }
        }

        await notificationApi.evaluateNotifications(userCoords).catch(() => {});
        const res = await notificationApi.getNotifications(10);
        if (res?.success && res?.data) {
          setUnreadCount(res.data.unread_count || 0);
        }
      } catch (err) {
        console.debug("Notification poll err:", err);
      }
    };

    checkNotifications();
    const interval = setInterval(checkNotifications, 25000);
    return () => clearInterval(interval);
  }, []);

  const scrollToCurrentStation = () => {
    setTimeout(() => {
      // 1. Scroll window so the results card / route section is in view
      if (resultRef.current) {
        resultRef.current.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }

      // 2. Automatically scroll route timeline down to the current station
      if (currentStationRef.current && timelineRef.current) {
        const container = timelineRef.current;
        const currentEl = currentStationRef.current;
        const containerRect = container.getBoundingClientRect();
        const currentRect = currentEl.getBoundingClientRect();

        const targetScroll =
          container.scrollTop +
          (currentRect.top - containerRect.top) -
          container.clientHeight / 2 +
          currentRect.height / 2;

        container.scrollTo({
          top: Math.max(0, targetScroll),
          behavior: "smooth",
        });
      }
    }, 300);
  };

  useEffect(() => {
    if (selectedTrain) {
      scrollToCurrentStation();
    }
  }, [selectedTrain]);


  useEffect(() => {
    window.googleTranslateElementInit = () => {
      new window.google.translate.TranslateElement(
        {
          pageLanguage: "en",
          includedLanguages: "en,hi,gu",
          autoDisplay: false,
        },
        "google_translate_element"
      );
    };

    if (!document.getElementById("google-translate-script")) {
      const script = document.createElement("script");

      script.id = "google-translate-script";
      script.src =
        "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
      script.async = true;

      document.body.appendChild(script);
    }
  }, []);


  useEffect(() => {
    const fetchPopularTrains = async () => {
      try {
        const result = await trainApi.fetchPopularTrains();
        const rawList = result?.data || [];
        const cleaned = rawList.map((train) => {
          let num = String(train.number || "");
          if (num.includes("data") || num.includes("{") || num.includes('"')) {
            const match = num.match(/\d{4,5}/);
            num = match ? match[0] : num.replace(/[^\d]/g, "");
          }
          return { ...train, number: num };
        });
        setPopularTrains(cleaned);
      } catch (error) {
        console.error("Popular trains error:", error);
      }
    };

    fetchPopularTrains();
  }, []);

  // const trainData = {
  // "12951": {
  //     number: "12951",
  //     name: "Mumbai Rajdhani Express",
  //     from: "Mumbai Central",
  //     to: "New Delhi",
  //     currentStation: "Vadodara Junction",
  //     nextStation: "Ratlam Junction",
  //     delay: "12 min late",
  //     eta: "18:42",
  //     etd: "18:47",
  //     platform: "Platform 3",
  //     status: "Running",

  //     prediction: {
  //       scheduledArrival: "18:30",
  //       predictedArrival: "18:42",
  //       delayMinutes: 12,
  //       confidence: 92,
  //       reason: "Previous station delay + current route congestion"
  //     },

  //     route: [
  //       {
  //         station: "Mumbai Central",
  //         scheduled: "17:00",
  //         expected: "17:00",
  //         status: "completed"
  //       },
  //       {
  //         station: "Surat",
  //         scheduled: "19:10",
  //         expected: "19:15",
  //         status: "completed"
  //       },
  //       {
  //         station: "Vadodara Junction",
  //         scheduled: "20:35",
  //         expected: "20:47",
  //         status: "current"
  //       },
  //       {
  //         station: "Ratlam Junction",
  //         scheduled: "00:05",
  //         expected: "00:17",
  //         status: "upcoming"
  //       },
  //       {
  //         station: "Kota Junction",
  //         scheduled: "03:20",
  //         expected: "03:32",
  //         status: "upcoming"
  //       },
  //       {
  //         station: "New Delhi",
  //         scheduled: "08:30",
  //         expected: "08:42",
  //         status: "upcoming"
  //       }
  //     ]
  //   },

  //   "22222": {
  //     number: "22222",
  //     name: "CSMT Rajdhani Express",
  //     from: "Mumbai Central",
  //     to: "New Delhi",
  //     currentStation: "Surat",
  //     nextStation: "Vadodara Junction",
  //     delay: "8 min late",
  //     eta: "20:15",
  //     etd: "20:20",
  //     platform: "Platform 2",
  //     status: "Running"
  //   }
  // };

  const formatTime = (time) => {
    if (!time) return "--";
    if (typeof time === "string" && /^\d{1,2}:\d{2}$/.test(time)) return time;
    const date = new Date(time);
    if (Number.isNaN(date.getTime())) return time;
    return date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const handleSearch = async (value) => {
    const query = typeof value === "string" ? value.trim() : search.trim();

    if (!query) {
      alert(
        searchType === "number"
          ? "Please enter a train number"
          : "Please enter a train name"
      );
      return;
    }

    try {
      let targetTrainNumber = query;

      // If searching by train name, resolve train number first
      if (searchType === "name") {
        const searchResult = await trainApi.searchTrains(query);
        const trains = searchResult?.data || searchResult || [];

        if (!Array.isArray(trains) || trains.length === 0) {
          alert(`No train found matching "${query}".`);
          return;
        }

        targetTrainNumber =
          trains[0].train_number ||
          trains[0].trainNumber ||
          trains[0].number;

        if (!targetTrainNumber) {
          alert("Train number could not be resolved.");
          return;
        }
      }

      // Fetch dynamic ETA with ML inference from FastAPI backend
      const result = await trainApi.fetchDynamicETA(targetTrainNumber);

      if (!result?.success || !result?.data) {
        throw new Error("Unable to retrieve dynamic ETA for this train.");
      }

      const etaData = result.data;
      const route = etaData.route || [];
      const currentCode = etaData.currentLocation?.stationCode;

      const currentRouteIndex = route.findIndex(
        (s) =>
          (currentCode && s.stationCode && s.stationCode.toUpperCase() === currentCode.toUpperCase()) ||
          s.status === "current"
      );

      const currentStation =
        currentRouteIndex >= 0
          ? route[currentRouteIndex]?.stationName
          : route[0]?.stationName || "In Transit";

      const nextRoute =
        currentRouteIndex >= 0 && currentRouteIndex + 1 < route.length
          ? route[currentRouteIndex + 1]
          : null;

      const nextStation = nextRoute?.stationName || "Terminating Station";
      const currentRoute = currentRouteIndex >= 0 ? route[currentRouteIndex] : null;

      const convertedTrain = {
        number: etaData.trainNumber,
        name: etaData.trainName,
        from: route[0]?.stationName || "Origin",
        to: route[route.length - 1]?.stationName || "Destination",
        currentStation,
        nextStation,
        delay:
          etaData.overallDelayMinutes > 0
            ? `${Math.round(etaData.overallDelayMinutes)} min late`
            : "On time",
        overallDelayMinutes: etaData.overallDelayMinutes,
        eta: formatTime(nextRoute?.predictedArrival || nextRoute?.scheduledArrival),
        etd: formatTime(currentRoute?.predictedDeparture || currentRoute?.scheduledDeparture),
        platform: currentRoute?.platform || nextRoute?.platform || "1",
        status:
          etaData.status === "running"
            ? "Running"
            : etaData.status || "Running",
        lastUpdated: new Date().toISOString(),
        modelUsed: etaData.modelUsed || "lightgbm_baseline",
        festivalInfo: etaData.festivalInfo || etaData.festival_info || null,
        turnaroundInfo: etaData.turnaroundInfo || etaData.turnaround_info || null,
        weatherInfo: etaData.weatherInfo || etaData.weather_info || null,
        prediction: {
          scheduledArrival: formatTime(nextRoute?.scheduledArrival),
          predictedArrival: formatTime(nextRoute?.predictedArrival || nextRoute?.actualArrival),
          delayMinutes: Math.round(nextRoute?.predictedDelayMinutes ?? etaData.overallDelayMinutes),
          delayTrend: nextRoute?.delayTrend || "stable",
          modelUsed: etaData.modelUsed || "lightgbm_baseline",
          reason: "LightGBM ML inference with real-time telemetry",
        },
        route: route.map((station, index) => {
          let stopStatus = "upcoming";

          if (currentRouteIndex >= 0) {
            if (index < currentRouteIndex) {
              stopStatus = "completed";
            } else if (index === currentRouteIndex) {
              stopStatus = "current";
            } else {
              stopStatus = "upcoming";
            }
          } else {
            if (
              station.status === "departed" ||
              station.status === "completed" ||
              station.status === "passed"
            ) {
              stopStatus = "completed";
            } else if (station.status === "current") {
              stopStatus = "current";
            } else {
              stopStatus = "upcoming";
            }
          }

          return {
            station: station.stationName,
            stationCode: station.stationCode,
            scheduled:
              formatTime(station.scheduledArrival) !== "--"
                ? formatTime(station.scheduledArrival)
                : formatTime(station.scheduledDeparture),
            expected:
              formatTime(station.predictedArrival) !== "--"
                ? formatTime(station.predictedArrival)
                : formatTime(station.actualArrival) !== "--"
                ? formatTime(station.actualArrival)
                : formatTime(station.scheduledArrival),
            predictedDelay: station.predictedDelayMinutes,
            delayTrend: station.delayTrend,
            status: stopStatus,
            platform: station.platform,
            distance: station.distance,
            weatherInfo: station.weatherInfo || null,
          };
        }),
      };

      setSelectedTrain(convertedTrain);
      scrollToCurrentStation();
    } catch (error) {
      console.error("Search error:", error);
      alert(error.message || "Unable to find this train. Please verify the train number.");
    }
  };

  return (

    <div className={`website ${darkMode ? "dark-mode" : ""}`}>
      <div id="google_translate_element"></div>
      {/* ================= TOP HEADER ================= */}

      <header className="top-header">

        <div className="railway-ministry">
          <div className="emblem">
            <img
              src="/indian-emblem.png"
              alt="Government of India Emblem"
            />
          </div>

          <div>
            <h3>Ministry of Railways</h3>
            <p>Government of India</p>
          </div>
        </div>


        <div className="ntes-title">
          <h1>National Train Enquiry System</h1>
          <p>Indian Railways</p>
        </div>


        <div className="header-controls">

          <div className="g20">
            <img
              src="/g20-logo.png"
              alt="G20 India 2023"
            />
          </div>

          {/* Language Translator Icon Button */}
          <div className="language-dropdown-container" ref={langDropdownRef}>
            <button
              className={`btn-header-icon ${langMenuOpen ? "active" : ""}`}
              onClick={() => setLangMenuOpen(!langMenuOpen)}
              title={`Translate Language (${language})`}
              aria-label="Change Language"
            >
              🌐
            </button>

            {langMenuOpen && (
              <div className="language-dropdown-menu">
                <button
                  className={`lang-option ${language === "English" ? "active" : ""}`}
                  onClick={() => selectLanguage("English", "en")}
                >
                  <span>English</span>
                  {language === "English" && <span className="check">✓</span>}
                </button>
                <button
                  className={`lang-option ${language === "Hindi" ? "active" : ""}`}
                  onClick={() => selectLanguage("Hindi", "hi")}
                >
                  <span>हिन्दी</span>
                  {language === "Hindi" && <span className="check">✓</span>}
                </button>
                <button
                  className={`lang-option ${language === "Gujarati" ? "active" : ""}`}
                  onClick={() => selectLanguage("Gujarati", "gu")}
                >
                  <span>ગુજરાતી</span>
                  {language === "Gujarati" && <span className="check">✓</span>}
                </button>
              </div>
            )}
          </div>

          {/* Theme Toggle Button */}
          <button
            className={`btn-header-icon theme-toggle ${darkMode ? "dark" : ""}`}
            onClick={() => setDarkMode(!darkMode)}
            title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            aria-label="Toggle Dark Mode"
          >
            {darkMode ? "☀️" : "🌙"}
          </button>

          {/* In-Train Mode Button */}
          <button
            className="btn-header-icon btn-in-train-header"
            onClick={() => setInTrainModalOpen(true)}
            title="In-Train Assistant & Proximity Alarms"
            aria-label="In-Train Mode"
          >
            🚆
          </button>

          {/* Saved Alarms Button */}
          <button
            className="btn-header-icon btn-alarms-header"
            onClick={() => setMyAlarmsModalOpen(true)}
            title="My Destination Alarms"
            aria-label="My Destination Alarms"
          >
            ⏰
          </button>

          {/* Smart Notification Center Button */}
          <button
            className="btn-header-icon btn-notifications-header"
            onClick={() => setNotifCenterOpen(true)}
            title="Journey Alerts & Updates"
            aria-label="Notification Center"
          >
            🔔
            {unreadCount > 0 && (
              <span className="header-notif-badge">{unreadCount}</span>
            )}
          </button>

          {/* User Profile / Auth Button */}
          {currentUser ? (
            <div className="user-profile-pill">
              <span className="user-avatar">👤</span>
              <span className="user-name">{currentUser.full_name?.split(" ")[0]}</span>
              <button
                className="btn-logout-small"
                onClick={() => {
                  authApi.logout();
                  setCurrentUser(null);
                }}
                title="Sign Out"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button
              className="btn-auth-header"
              onClick={() => setAuthModalOpen(true)}
            >
              Sign In
            </button>
          )}

        </div>

      </header>


      <nav className={`main-nav ${mobileMenuOpen ? "mobile-open" : ""}`}>

        {/* Mobile Hamburger */}
        <button
          className="mobile-menu-btn"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Open navigation menu"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        <div className="nav-links">

          <button
            className={activePage === "home" ? "nav-active" : ""}
            onClick={() => {
              setActivePage("home");
              setMobileMenuOpen(false);
            }}
          >
            🏠 Home (Dynamic ETA)
          </button>

          <button
            className={`nav-gps-btn ${activePage === "live" ? "nav-active" : ""}`}
            onClick={() => {
              setActivePage("live");
              setMobileMenuOpen(false);
            }}
          >
            ⚡ Live GPS Assistant
          </button>

          <button
            className={`nav-schedule-btn ${activePage === "schedule" ? "nav-active" : ""}`}
            onClick={() => {
              setActivePage("schedule");
              setMobileMenuOpen(false);
            }}
          >
            📅 Train Schedule
          </button>

          <button
            className="nav-watch-btn"
            onClick={() => {
              setNotifCenterOpen(true);
              setMobileMenuOpen(false);
            }}
          >
            🔔 Journey Watch & Updates
          </button>

        </div>
      </nav>

      {/* ================= PAGE CONTENT ================= */}

      {activePage === "live" ? (
        <LiveTrainStatus
          initialTrainNumber={selectedTrain?.number || selectedTrain?.trainNumber || "12919"}
          onSetAlarm={(trainData) => {
            if (trainData) {
              setSelectedTrain(trainData);
            }
            setInTrainModalOpen(true);
          }}
        />
      ) : activePage === "schedule" || activePage === "between" ? (
        <TrainSchedule
          onSelectTrain={(trainData) => {
            if (trainData) {
              setSelectedTrain(trainData);
            }
            setActivePage("live");
          }}
        />
      ) : (
        <>


          {/* ================= HERO ================= */}

          <section className="hero">

            <div className="hero-text">

              <h2>Track Your Train</h2>

              <p>
                Get live status, expected time of arrival (ETA),
                delay, route and all stoppages.
              </p>

            </div>

            {/* SEARCH PANEL */}
            <div className="search-panel">
              <select
                className="mobile-search-type"
                value={searchType}
                onChange={(e) => setSearchType(e.target.value)}
              >
                <option value="number">By Train No.</option>
                <option value="name">By Train Name</option>
              </select>
              <div className="search-tabs">

                <button
                  className={searchType === "number" ? "selected" : ""}
                  onClick={() => setSearchType("number")}
                >
                  By Train No.
                </button>

                <button
                  className={searchType === "name" ? "selected" : ""}
                  onClick={() => setSearchType("name")}
                >
                  By Train Name
                </button>

              </div>


              <div className="search-row">

                <div className="search-input">

                  <span>🚆</span>

                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                    placeholder={
                      searchType === "number"
                        ? "Enter Train Number (e.g. 12951)"
                        : "Enter Train Name"
                    }
                  />

                </div>


                <button
                  className="search-btn"
                  onClick={handleSearch}
                >
                  Search
                </button>

              </div>


              {/* POPULAR TRAINS */}

              <div className="popular-trains">

                <span>Popular Trains :</span>

                {popularTrains.map((train) => (
                  <button
                    key={train.number}
                    onClick={() => {
                      setSearchType("number");
                      setSearch(train.number);
                      handleSearch(train.number);
                    }}
                  >
                    {train.number}
                  </button>
                ))}

              </div>

            </div>


            {/* TRAIN IMAGE */}

            <div className="train-image">
              <img src={trainImage} alt="Indian Railways Train" />
            </div>

          </section>


          {/* ================= SERVICES ================= */}

          <section className="services">

            <div className="service-card" onClick={() => setActivePage("live")}>
              <div className="service-icon">
                ⚡
              </div>
              <h3>Live GPS Assistant</h3>
              <p>Real-time OpenStreetMap tracking</p>
            </div>

            <div className="service-card" onClick={() => setActivePage("schedule")}>
              <div className="service-icon">
                📅
              </div>
              <h3>Train Schedule</h3>
              <p>Find trains running between stations</p>
            </div>

            <div className="service-card" onClick={() => setNotifCenterOpen(true)}>
              <div className="service-icon">
                🔔
              </div>
              <h3>Smart Journey Watch</h3>
              <p>{unreadCount > 0 ? `${unreadCount} new alerts` : "Proactive delay & route alerts"}</p>
            </div>

            <div className="service-card" onClick={() => {
              if (selectedTrain) scrollToCurrentStation();
              else alert("Please search for a train above to view station weather telemetry.");
            }}>
              <div className="service-icon">
                🌧️
              </div>
              <h3>Weather Intelligence</h3>
              <p>Open-Meteo rain & visibility risk</p>
            </div>

          </section>

          {/* ================= TRAIN STATUS ================= */}

          {selectedTrain && (
            <section ref={resultRef} className="train-status">

              <div className="status-header">

                <div className="train-heading">

                  <div className="status-top-row">
                    <button
                      className="btn-status-alarm"
                      onClick={() => setInTrainModalOpen(true)}
                      title="Set Destination Arrival Alarm"
                    >
                      ⏰ Set Alarm
                    </button>

                    <span className="status-badge">
                      ● LIVE
                    </span>

                    <span className="running-text">
                      {selectedTrain.status}
                    </span>

                    {selectedTrain.modelUsed && (
                      <span className="ml-badge" title="Dynamic ETA computed by LightGBM model">
                        ⚡ ML Model: {selectedTrain.modelUsed}
                      </span>
                    )}

                    {selectedTrain.turnaroundInfo && (
                      <span
                        className="turnaround-badge"
                        title={`Turnaround Telemetry: Inherited Delay +${selectedTrain.turnaroundInfo.previous_trip_delay}m (Turnaround Buffer: ${selectedTrain.turnaroundInfo.turnaround_time}m)`}
                      >
                        ⏱️ Previous Trip: {selectedTrain.turnaroundInfo.previous_trip_delay > 0 ? `+${Math.round(selectedTrain.turnaroundInfo.previous_trip_delay)}m delay` : "On Time"}
                      </span>
                    )}

                    {selectedTrain.weatherInfo && (
                      <span
                        className={`weather-badge severity-${selectedTrain.weatherInfo.weather_severity || 0}`}
                        title={`Open-Meteo: ${selectedTrain.weatherInfo.condition_description} | Rain: ${selectedTrain.weatherInfo.rain_mm}mm | Wind: ${selectedTrain.weatherInfo.wind_speed_kmh}km/h | Visibility: ${Math.round((selectedTrain.weatherInfo.visibility_m || 10000)/1000)}km`}
                      >
                        🌧️ Weather: {selectedTrain.weatherInfo.condition_description}
                        {selectedTrain.weatherInfo.weather_severity >= 2 && " (Risk Caution)"}
                      </span>
                    )}
                  </div>

                  <h2>
                    {selectedTrain.number} — {selectedTrain.name}
                  </h2>

                  <p>
                    {selectedTrain.from} <span>→</span> {selectedTrain.to}
                  </p>

                </div>

                <div className="delay-highlight">
                  <span>Current Delay</span>
                  <strong>{selectedTrain.delay}</strong>
                </div>

                <button
                  className="close-status"
                  onClick={() => setSelectedTrain(null)}
                >
                  ✕
                </button>

              </div>

              <div className="status-grid">

                <div className="status-box current-box">
                  <span>📍 Current Station</span>
                  <strong>{selectedTrain.currentStation}</strong>
                </div>

                <div className="status-box next-box">
                  <span>🚉 Next Station</span>
                  <strong>{selectedTrain.nextStation}</strong>
                </div>

                <div className="status-box delay-box">
                  <span>⏱ Delay</span>
                  <strong className="delay">
                    {selectedTrain.delay}
                  </strong>
                </div>

                <div className="status-box platform-box">
                  <span>🛤 Platform</span>
                  <strong>{selectedTrain.platform}</strong>
                </div>

              </div>

              <div className="last-updated">
                Last updated:{" "}
                {selectedTrain.lastUpdated
                  ? new Date(selectedTrain.lastUpdated).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false,
                  })
                  : "Updating..."}
              </div>

              <div className="route-section" ref={routeSectionRef}>

                <div className="route-title">
                  <h3>Train Route</h3>
                  <span>Scheduled vs Dynamic ML ETA</span>
                </div>

                <div className="route-timeline" ref={timelineRef}>

                  {selectedTrain.route.map((stop, index) => (

                    <div
                      className={`route-stop ${stop.status}`}
                      key={`${stop.stationCode || stop.station}-${index}`}
                      ref={stop.status === "current" ? currentStationRef : null}
                    >

                      <div className={`route-marker ${stop.status}`}>
                        {stop.status === "current" ? (
                          "●"
                        ) : stop.status === "completed" || stop.status === "departed" || stop.status === "passed" ? (
                          "✓"
                        ) : (
                          "○"
                        )}

                        {stop.status === "current" && (
                          <span className="train-indicator">🚆</span>
                        )}
                      </div>

                      <div className="route-line"></div>

                      <div className="station-info">

                        <div className="station-name">
                          {stop.station}

                          {stop.status === "current" && (
                            <span className="current-label">
                              CURRENT
                            </span>
                          )}
                        </div>

                        <div className="station-times">

                          <span className="time-badge scheduled-badge">
                            <span className="time-label">Scheduled:</span>
                            <strong className="time-val">{stop.scheduled}</strong>
                          </span>

                          <span className="time-badge predicted-badge">
                            <span className="time-label">Predicted ETA:</span>
                            <strong className="time-val predicted-time">{stop.expected}</strong>
                          </span>

                          {stop.status === "upcoming" && stop.delayTrend && (
                            <span className={`trend-badge trend-${stop.delayTrend}`}>
                              {stop.delayTrend === "improving" && "🟢 Delay Reducing"}
                              {stop.delayTrend === "increasing" && "🔴 Delay Increasing"}
                              {stop.delayTrend === "stable" && "🟡 Delay Stable"}
                              {stop.predictedDelay > 0 ? ` (+${Math.round(stop.predictedDelay)}m)` : ""}
                            </span>
                          )}

                          {stop.weatherInfo && stop.weatherInfo.weather_severity > 0 && (
                            <span
                              className={`station-weather-pill severity-${stop.weatherInfo.weather_severity}`}
                              title={`${stop.weatherInfo.condition_description} | Rain: ${stop.weatherInfo.rain_mm}mm | Wind: ${stop.weatherInfo.wind_speed_kmh}km/h`}
                            >
                              🌧️ {stop.weatherInfo.condition_description}
                            </span>
                          )}

                        </div>

                      </div>

                    </div>

                  ))}

                </div>

              </div>
            </section>
          )}
        </>
      )}

      {/* ================= FOOTER ================= */}
      <footer className="site-footer">
        <div className="footer-main">

          {/* Brand */}
          <div className="footer-brand">
            <h2>Indian Railways</h2>
            <h3>Railway Information System</h3>
            <p>
              A smart railway information platform for tracking trains,
              viewing schedules and accessing real-time journey information.
            </p>
          </div>

          {/* Quick Links */}
          <div className="footer-column">
            <h4>Quick Links</h4>
            <button onClick={() => setActivePage("home")}>Home (Dynamic ETA)</button>
            <button onClick={() => setActivePage("live")}>Live GPS Assistant</button>
            <button onClick={() => setActivePage("schedule")}>Train Schedule</button>
            <button onClick={() => setNotifCenterOpen(true)}>Smart Journey Watch</button>
          </div>

          {/* Railway Services */}
          <div className="footer-column">
            <h4>Railway Services</h4>
            <button onClick={() => setInTrainModalOpen(true)}>In-Train Mode</button>
            <button onClick={() => setActivePage("home")}>LightGBM Delay Predictor</button>
            <button onClick={() => setNotifCenterOpen(true)}>Live Delay Alert Center</button>
            <button onClick={() => setAuthModalOpen(true)}>Passenger Account Portal</button>
          </div>

          {/* Information */}
          <div className="footer-column">
            <h4>Information</h4>
            <button>About the System</button>
            <button>Help & Support</button>
            <button>Accessibility</button>
            <button>Feedback</button>
          </div>

        </div>

        {/* Footer Bottom */}
        <div className="footer-bottom">
          <div>
            © 2026 Railway Information System
          </div>

          <div className="footer-bottom-links">
            <span>Privacy Policy</span>
            <span>Terms of Use</span>
            <span>Accessibility</span>
          </div>

          <div>
            SIH 2026 Prototype
          </div>
        </div>
      </footer>

      {/* ================= MODALS & POPUPS ================= */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthSuccess={(user) => setCurrentUser(user)}
      />

      <InTrainAssistant
        isOpen={inTrainModalOpen}
        onClose={() => setInTrainModalOpen(false)}
        initialTrain={selectedTrain}
        currentUser={currentUser}
        onAlarmCreated={() => {}}
      />

      <MyAlarmsModal
        isOpen={myAlarmsModalOpen}
        onClose={() => setMyAlarmsModalOpen(false)}
        onOpenInTrainModal={() => setInTrainModalOpen(true)}
      />

      <WatchJourneyModal
        isOpen={watchModalOpen}
        onClose={() => setWatchModalOpen(false)}
        train={selectedTrain}
        onSuccess={() => {
          notificationApi.getNotifications(10).then((res) => {
            if (res?.success && res?.data) {
              setUnreadCount(res.data.unread_count || 0);
            }
          });
        }}
      />

      <NotificationCenter
        isOpen={notifCenterOpen}
        onClose={() => setNotifCenterOpen(false)}
        onNotificationRead={(newCount) => setUnreadCount(newCount)}
        onOpenWatchModal={() => setWatchModalOpen(true)}
      />
    </div>
  );
}

export default App;