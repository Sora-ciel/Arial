// Capacitor filesystem driver — uses @capacitor/filesystem
// Only instantiated when running inside a Capacitor native shell.

const BINARY_EXTS = new Set(['png','jpg','jpeg','gif','webp','svg','mp4','webm','ogg','bin']);

function isBinaryPath(path) {
  return BINARY_EXTS.has(path.split('.').pop()?.toLowerCase() ?? '');
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(b64, mime = 'application/octet-stream') {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function cap() {
  const mod = await import(/* @vite-ignore */ '@capacitor/filesystem');
  return { Filesystem: mod.Filesystem, Directory: mod.Directory, Encoding: mod.Encoding };
}

export class CapacitorFileSystemDriver {
  constructor(rootDir = 'codex-data') {
    this._root = rootDir;
    this._dir = null; // resolved on first use
  }

  async _getDir() {
    if (!this._dir) {
      const { Directory } = await cap();
      this._dir = Directory.Documents;
    }
    return this._dir;
  }

  _path(path) { return `${this._root}/${path}`; }

  async read(path) {
    try {
      const { Filesystem, Encoding } = await cap();
      const directory = await this._getDir();
      if (isBinaryPath(path)) {
        const result = await Filesystem.readFile({ path: this._path(path), directory });
        return base64ToBlob(result.data);
      }
      const result = await Filesystem.readFile({ path: this._path(path), directory, encoding: Encoding.UTF8 });
      return JSON.parse(result.data);
    } catch {
      return null;
    }
  }

  async write(path, value) {
    const { Filesystem, Encoding } = await cap();
    const directory = await this._getDir();
    const dir = this._path(path).split('/').slice(0, -1).join('/');
    if (dir) {
      await Filesystem.mkdir({ path: dir, directory, recursive: true }).catch(() => {});
    }
    if (value instanceof Blob) {
      await Filesystem.writeFile({ path: this._path(path), data: await blobToBase64(value), directory });
    } else {
      await Filesystem.writeFile({ path: this._path(path), data: JSON.stringify(value), directory, encoding: Encoding.UTF8 });
    }
  }

  async delete(path) {
    try {
      const { Filesystem } = await cap();
      await Filesystem.deleteFile({ path: this._path(path), directory: await this._getDir() });
    } catch {}
  }

  async list(prefix) {
    const clean = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
    const results = [];
    try { await this._walk(this._path(clean), clean, results); } catch {}
    return results;
  }

  async _walk(dirPath, basePath, results) {
    const { Filesystem } = await cap();
    let files;
    try {
      const result = await Filesystem.readdir({ path: dirPath, directory: await this._getDir() });
      files = result.files;
    } catch { return; }
    for (const f of files) {
      const p = `${basePath}/${f.name}`;
      if (f.type === 'directory') await this._walk(`${dirPath}/${f.name}`, p, results);
      else results.push(p);
    }
  }

  async deletePrefix(prefix) {
    for (const p of await this.list(prefix)) await this.delete(p);
  }
}
