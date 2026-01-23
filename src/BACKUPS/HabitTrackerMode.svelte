<script>
  import { onMount } from "svelte";

  export let modeLabels = {};
  export let activeMode = "default";

  const STORAGE_KEY = "habitTrackerData";
  const DAYS_VISIBLE = 14;

  let habits = [];
  let newHabitName = "";

  const today = new Date();

  const formatDateKey = date =>
    date.toISOString().slice(0, 10);

  const formatDayLabel = date =>
    date.toLocaleDateString(undefined, {
      weekday: "short"
    });

  const formatDayNumber = date =>
    date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric"
    });

  const buildDays = () =>
    Array.from({ length: DAYS_VISIBLE }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() + index);
      return {
        key: formatDateKey(date),
        label: formatDayLabel(date),
        number: formatDayNumber(date)
      };
    });

  let days = buildDays();

  const saveHabits = updatedHabits => {
    habits = updatedHabits;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(habits));
  };

  const addHabit = () => {
    const trimmed = newHabitName.trim();
    if (!trimmed) return;
    const next = [
      ...habits,
      { id: crypto.randomUUID(), name: trimmed, log: {} }
    ];
    newHabitName = "";
    saveHabits(next);
  };

  const deleteHabit = habitId => {
    saveHabits(habits.filter(habit => habit.id !== habitId));
  };

  const toggleDay = (habitId, dayKey) => {
    const updated = habits.map(habit => {
      if (habit.id !== habitId) return habit;
      const current = habit.log?.[dayKey] || "none";
      const next =
        current === "none" ? "done" : current === "done" ? "missed" : "none";
      return {
        ...habit,
        log: { ...habit.log, [dayKey]: next }
      };
    });
    saveHabits(updated);
  };

  onMount(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          habits = parsed;
        }
      } catch {
        habits = [];
      }
    }
    days = buildDays();
  });
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

  .habit-form {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .habit-form input {
    flex: 1 1 240px;
    min-width: 200px;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(10, 16, 26, 0.7);
    color: inherit;
  }

  .habit-form button {
    padding: 10px 16px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(18, 28, 44, 0.8);
    color: inherit;
    cursor: pointer;
  }

  .habit-grid {
    display: grid;
    gap: 16px;
  }

  .habit-row {
    border-radius: 16px;
    padding: 16px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(12, 18, 30, 0.6);
    display: grid;
    grid-template-columns: minmax(160px, 220px) 1fr auto;
    gap: 16px;
    align-items: center;
  }

  .habit-name {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .habit-name strong {
    font-size: 1.05rem;
  }

  .calendar {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(70px, 1fr));
    gap: 8px;
  }

  .calendar-header {
    font-size: 0.8rem;
    opacity: 0.75;
    text-align: center;
  }

  .day-button {
    border-radius: 10px;
    padding: 8px 6px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(10, 14, 22, 0.6);
    color: inherit;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    cursor: pointer;
  }

  .day-button.done {
    background: rgba(80, 200, 140, 0.25);
    border-color: rgba(80, 200, 140, 0.6);
  }

  .day-button.missed {
    background: rgba(230, 90, 90, 0.25);
    border-color: rgba(230, 90, 90, 0.6);
  }

  .day-status {
    font-size: 1.1rem;
    font-weight: 600;
  }

  .habit-actions button {
    border-radius: 10px;
    padding: 8px 12px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(24, 32, 50, 0.7);
    color: inherit;
    cursor: pointer;
  }

  .empty-state {
    opacity: 0.7;
    padding: 16px;
    border-radius: 12px;
    border: 1px dashed rgba(255, 255, 255, 0.2);
  }
</style>

<section class="habit-tracker">
  <div class="habit-header">
    <h2>{modeLabels?.[activeMode] ?? "Habit Tracker"}</h2>
    <p>Create a habit, then check or cross each day starting from today.</p>
  </div>

  <div class="habit-form">
    <input
      type="text"
      placeholder="Add a new habit (e.g. Drink water)"
      bind:value={newHabitName}
      on:keydown={(event) => event.key === "Enter" && addHabit()}
    />
    <button on:click={addHabit}>Add habit</button>
  </div>

  {#if habits.length === 0}
    <div class="empty-state">No habits yet. Add one to start tracking.</div>
  {:else}
    <div class="habit-grid">
      {#each habits as habit}
        <div class="habit-row">
          <div class="habit-name">
            <strong>{habit.name}</strong>
            <span>Tap a day to mark ✓ or ✕.</span>
          </div>
          <div class="calendar">
            {#each days as day}
              <button
                class="day-button {habit.log?.[day.key] ?? 'none'}"
                on:click={() => toggleDay(habit.id, day.key)}
              >
                <span class="calendar-header">{day.label}</span>
                <span>{day.number}</span>
                <span class="day-status">
                  {habit.log?.[day.key] === "done"
                    ? "✓"
                    : habit.log?.[day.key] === "missed"
                    ? "✕"
                    : "•"}
                </span>
              </button>
            {/each}
          </div>
          <div class="habit-actions">
            <button on:click={() => deleteHabit(habit.id)}>Delete</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>
