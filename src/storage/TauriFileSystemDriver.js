// Tauri v2 filesystem driver — uses @tauri-apps/plugin-fs
// Only instantiated when running inside a Tauri shell.

const BINARY_EXTS = new Set(['png','jpg','jpeg','gif','webp','svg','mp4','webm','ogg','bin']);

function isBinaryPath(path) {
  return BINARY_EXTS.has(path.split('.').pop()?.toLowerCase() ?? '');
}

async function tauriFs() {
  return import(/* @vite-ignore */ '@tauri-apps/plugin-fs');
}

export class TauriFileSystemDriver {
  constructor(rootDir = 'codex-data') {
    this._root = rootDir;
  }

  _fp(path) { return `${this._root}/${path}`; }

  async read(path) {
    try {
      const fs = await tauriFs();
      const fp = this._fp(path);
      if (!await fs.exists(fp)) return null;
      if (isBinaryPath(path)) {
        const bytes = await fs.readFile(fp);
        return new Blob([bytes]);
      }
      const text = await fs.readTextFile(fp);
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  async write(path, value) {
    const fs = await tauriFs();
    const fp = this._fp(path);
    const dir = fp.split('/').slice(0, -1).join('/');
    if (dir) await fs.mkdir(dir, { recursive: true }).catch(() => {});
    if (value instanceof Blob) {
      await fs.writeFile(fp, new Uint8Array(await value.arrayBuffer()));
    } else {
      await fs.writeTextFile(fp, JSON.stringify(value));
    }
  }

  async delete(path) {
    try {
      const fs = await tauriFs();
      await fs.remove(this._fp(path));
    } catch {}
  }

  async list(prefix) {
    const clean = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
    const results = [];
    try { await this._walk(this._fp(clean), clean, results); } catch {}
    return results;
  }

  async _walk(dirPath, basePath, results) {
    const fs = await tauriFs();
    let entries;
    try { entries = await fs.readDir(dirPath); } catch { return; }
    for (const e of entries) {
      const p = `${basePath}/${e.name}`;
      if (e.isDirectory) await this._walk(`${dirPath}/${e.name}`, p, results);
      else results.push(p);
    }
  }

  async deletePrefix(prefix) {
    for (const p of await this.list(prefix)) await this.delete(p);
  }
}
