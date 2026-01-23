<script>
  export let modeUsage = {};
  export let modeDurations = {};
  export let modeLabels = {};
  export let modeOrder = [];
  export let activeMode = "default";

  const formatDuration = totalMs => {
    const totalSeconds = Math.max(0, Math.floor(totalMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  };
</script>

<style>
  .habit-tracker {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 30px;
    width: 100%;
    height: calc(100vh - var(--controls-height, 56px));
    overflow-y: auto;
    background: var(--canvas-inner-bg, #0b0f19);
    color: var(--mode-text-color, #ffffff);
  }

  .habit-header {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .habit-header h2 {
    font-size: 1.6rem;
    margin: 0;
  }

  .habit-header p {
    margin: 0;
    opacity: 0.8;
  }

  .habit-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
  }

  .habit-card {
    border-radius: 16px;
    padding: 16px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(12, 18, 30, 0.6);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .habit-card.active {
    border-color: rgba(127, 211, 255, 0.7);
    box-shadow: 0 0 0 1px rgba(127, 211, 255, 0.35), 0 12px 30px rgba(0, 0, 0, 0.35);
  }

  .habit-card h3 {
    margin: 0;
    font-size: 1.1rem;
  }

  .habit-stat {
    display: flex;
    justify-content: space-between;
    font-size: 0.95rem;
    opacity: 0.9;
  }

  .habit-stat span:last-child {
    font-weight: 600;
  }
</style>

<section class="habit-tracker">
  <div class="habit-header">
    <h2>Mode Habit Tracker</h2>
    <p>Keep an eye on how long you spend in each workspace mode.</p>
  </div>

  <div class="habit-grid">
    {#each modeOrder as modeName}
      <div class="habit-card {activeMode === modeName ? 'active' : ''}">
        <h3>{modeLabels?.[modeName] ?? modeName}</h3>
        <div class="habit-stat">
          <span>Time spent</span>
          <span>{formatDuration(modeDurations?.[modeName] ?? 0)}</span>
        </div>
        <div class="habit-stat">
          <span>Entries</span>
          <span>{modeUsage?.[modeName]?.switches ?? 0}</span>
        </div>
        <div class="habit-stat">
          <span>Status</span>
          <span>{activeMode === modeName ? "Active" : "Paused"}</span>
        </div>
      </div>
    {/each}
  </div>
</section>
