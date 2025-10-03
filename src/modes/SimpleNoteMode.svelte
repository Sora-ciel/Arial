<script>
  import { createEventDispatcher } from 'svelte';

  export let id;
  export let type;
  export let content = "";
  export let src = "";
  export let textColor = "#fff";
  export let bgColor = "#111";

  let editing = false;
  let textareaEl;

  const dispatch = createEventDispatcher();

  function autoResize() {
    if (!textareaEl) return;
    textareaEl.style.height = 'auto';
    textareaEl.style.height = textareaEl.scrollHeight + 'px';
  }

  $: if (textareaEl) {
    autoResize();
  }

  function toggleEditing() {
    editing = !editing;
  }

  function updateContent(e) {
    dispatch('update', { id, content: e.target.value });
  }

  function updateSrc(e) {
    dispatch('update', { id, src: e.target.value });
  }

  function deleteBlock() {
    dispatch('delete', { id });
  }

  function focusScroll() {
    // Small delay so keyboard has time to open before scrolling
    setTimeout(() => {
      textareaEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  }
</script>

<style>
.canvas {
  background: #00000041;
  border-radius: 8px;
  padding: 0; /* fixed typo '0x' */
  margin-bottom: 0px;
  max-width: 1080px;
  width: 100%;
  box-sizing: border-box;
  box-shadow: 0 0 10px rgba(0,0,0,0.25);

  
}

.container {
  background: var(--bg-color);
  color: var(--text-color);
  padding: 10px;
  width: 100%; /* ensure full width */
  box-sizing: border-box;
  border-radius: 40px;
  overflow: hidden; /* ensures children respect rounded corners */
  border: 2px solid var(--text-color);

}

textarea {
  width: 100%;
  min-height: 100px;
  border: none;
  border-radius: 30px; /* remove own rounding so it follows container's curve */
  resize: vertical;
  margin: 0;
  padding: 20px 10px 20px;
  background: transparent; /* so the container bg shows */
  color: var(--text-color);
  font-family: Arial, Helvetica, sans-serif;
  font-size: 1.1rem;
  box-sizing: border-box;
}

textarea:focus {
  color: var(--bg-color);
  outline: none;
  background: var(--text-color);
}

.container img {
  width: 100%;
  height: auto;
  max-height: 1080px;
  margin: 0; /* no extra space */
  object-fit: contain;
  display: block;
  border-radius: 80px; /* let container's border-radius handle corners */

}

input[type="text"] {
  width: 100%;
  border-radius: 6px;

  border: none;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 1rem;
  box-sizing: border-box;
}

button {
  padding: 0;
  margin-top: 12px;
  background: transparent;
  color: var(--text-color);
  border: none;
  cursor: pointer;
  font-size: 1.1rem;
  align-self: flex-start;
  line-height: 1;
  outline: none;
}



</style>

<div class="canvas">
  <div class="container" style="--bg-color: {bgColor}; --text-color: {textColor};">
    {#if type === 'text' || type === 'cleantext'}
      <textarea
        bind:this={textareaEl}
        spellcheck="false"
        bind:value={content}
        on:input="{() => { updateContent(event); autoResize(); }}"
        on:focus={focusScroll}
        placeholder="Type your note here..."
        rows="1" 
        style="overflow:hidden;"
      ></textarea>
    {:else if type === 'image'}
      <img src={src} alt="Image block" />
      <button on:click={toggleEditing} aria-label="Toggle editing">
        {editing ? 'Done' : 'Edit'}
      </button>
      {#if editing}
        <input
          type="text"
          placeholder="Image URL"
          bind:value={src}
          on:input={updateSrc}
          aria-label="Edit image URL"
        />
      {/if}
    {/if}

    <button on:click={deleteBlock} aria-label="Delete block">×</button>
  </div>
</div>


