<script>
  export let onBack; // callback to go back to main page

  let themeColor = "#ffffff";
  let fontSize = 16;
</script>


<style>
  .advanced-page {
    padding: 20px;
    background: #181818;
    color: white;
    min-height: 100vh;
  }

  .back-btn {
    background: #444;
    border: none;
    color: white;
    padding: 8px 12px;
    border-radius: 6px;
    cursor: pointer;
    margin-bottom: 20px;
  }

  label {
    display: block;
    margin-top: 12px;
  }

  input {
    margin-top: 6px;
    padding: 6px;
  }
</style>

<div class="advanced-page">
  <button class="back-btn" on:click={onBack}>← Back</button>

  <h2>Advanced Parameters</h2>

  <label>
    Theme color:
    <input type="color" bind:value={themeColor}>
  </label>

  <label>
    Font size:
    <input type="number" min="10" max="50" bind:value={fontSize}>
  </label>

  <!-- Add more settings here -->
</div>
