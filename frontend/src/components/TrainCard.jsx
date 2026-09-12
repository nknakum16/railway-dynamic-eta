function TrainCard() {
  return (
    <div className="train-card">

      <div className="train-header">
        <div>
          <h2>12951 — Mumbai Central Rajdhani</h2>
          <p>Mumbai Central → New Delhi</p>
        </div>

        <span className="status">● Running</span>
      </div>

      <div className="train-info">

        <div>
          <small>Current Station</small>
          <strong>Surat</strong>
        </div>

        <div>
          <small>Expected Arrival</small>
          <strong>18:42</strong>
        </div>

        <div>
          <small>Delay</small>
          <strong>12 min</strong>
        </div>

        <div>
          <small>Platform</small>
          <strong>3</strong>
        </div>

      </div>

      <button className="details-button">
        View Full Train Status
      </button>

    </div>
  )
}

export default TrainCard