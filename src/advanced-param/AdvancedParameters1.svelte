<script>
  import { createEventDispatcher } from "svelte";

  const defaultColors = {
    left: {
      panelBg: "#111111b0",
      textColor: "#ffffff",
      buttonBg: "#333333",
      buttonText: "#ffffff",
      borderColor: "#444444"
    },
    right: {
      panelBg: "#222222",
      textColor: "#ffffff",
      buttonBg: "#222222",
      buttonText: "#ffffff",
      borderColor: "#444444"
    }
  };

  export let controlColors = defaultColors;

  const dispatch = createEventDispatcher();

  let left = { ...defaultColors.left, ...(controlColors.left || {}) };
  let right = { ...defaultColors.right, ...(controlColors.right || {}) };

  $: left = { ...defaultColors.left, ...(controlColors.left || {}) };
  $: right = { ...defaultColors.right, ...(controlColors.right || {}) };

  const fields = [
    { key: "panelBg", label: "Panel background" },
    { key: "textColor", label: "Text color" },
    { key: "buttonBg", label: "Button background" },
    { key: "buttonText", label: "Button text" },
    { key: "borderColor", label: "Border color" }
  ];

  function handleColorChange(side, key, value) {
    if (side === "left") {
      left = { ...left, [key]: value };
    } else {
      right = { ...right, [key]: value };
    }

    dispatch("change", { side, key, value });
  }
</script>

<style>
  .advanced-wrapper {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .section {
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 12px;
  }

  .section h5 {
    margin: 0 0 8px;
    font-size: 0.95rem;
  }

  .section p {
    margin: 0 0 12px;
    font-size: 0.8rem;
    line-height: 1.4;
    color: rgba(255, 255, 255, 0.7);
  }

  .field-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 0.85rem;
  }

  label span {
    flex: 1 1 auto;
  }

  input[type="color"] {
    flex: 0 0 auto;
    width: 44px;
    height: 28px;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
  }
</style>

<div class="advanced-wrapper">
  <h4>🎨 Control Colors</h4>

  <div class="section">
    <h5>Left Controls</h5>
    <p>Update the toolbar that appears on the left side of the canvas.</p>
    <div class="field-list">
      {#each fields as field}
        <label>
          <span>{field.label}</span>
          <input
            type="color"
            bind:value={left[field.key]}
            on:input={(event) =>
              handleColorChange("left", field.key, event.target.value)}
          />
        </label>
      {/each}
    </div>
  </div>

  <div class="section">
    <h5>Right Controls</h5>
    <p>Customize the parameter dropdown shown on the right.</p>
    <div class="field-list">
      {#each fields as field}
        <label>
          <span>{field.label}</span>
          <input
            type="color"
            bind:value={right[field.key]}
            on:input={(event) =>
              handleColorChange("right", field.key, event.target.value)}
          />
        </label>
      {/each}
    </div>
  </div>
</div>
