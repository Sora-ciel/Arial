const BINARY_EXTS = new Set(['png','jpg','jpeg','gif','webp','svg','mp4','webm','ogg','bin']);

function isBinaryPath(path) {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return BINARY_EXTS.has(ext);
}

async function resolveDir(rootHandle, parts, create = true) {
  let dir = rootHandle;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create });
  }
  return dir;
}

async function getFileHandle(rootHandle, path, create = false) {
  const parts = path.split('/');
  const dirs = parts.slice(0, -1);
  const filename = parts[parts.length - 1];
  try {
    const dir = dirs.length ? await resolveDir(rootHandle, dirs, create) : rootHandle;
    return dir.getFileHandle(filename, { create });
  } catch {
    return null;
  }
}

async function walkDir(dirHandle, basePath, results) {
  for await (const [name, handle] of dirHandle.entries()) {
    const p = basePath ? `${basePath}/${name}` : name;
    if (handle.kind === 'directory') {
      await walkDir(handle, p, results);
    } else {
      results.push(p);
    }
  }
}

export class FileSystemDriver {
  constructor(rootHandle) {
    this._root = rootHandle;
  }

  get rootName() {
    return this._root?.name ?? '';
  }

  async read(path) {
    const fh = await getFileHandle(this._root, path, false);
    if (!fh) return null;
    try {
      const file = await fh.getFile();
      if (isBinaryPath(path)) {
        return new Blob([await file.arrayBuffer()], { type: file.type || 'application/octet-stream' });
      }
      const text = await file.text();
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  async write(path, value) {
    const fh = await getFileHandle(this._root, path, true);
    if (!fh) throw new Error(`Cannot create file at ${path}`);
    const writable = await fh.createWritable();
    if (value instanceof Blob) {
      await writable.write(value);
    } else {
      await writable.write(JSON.stringify(value));
    }
    await writable.close();
  }

  async delete(path) {
    const parts = path.split('/');
    const dirs = parts.slice(0, -1);
    const filename = parts[parts.length - 1];
    try {
      const dir = dirs.length ? await resolveDir(this._root, dirs, false) : this._root;
      await dir.removeEntry(filename);
    } catch {
      // file didn't exist — ignore
    }
  }

  async list(prefix) {
    const prefixDir = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
    const parts = prefixDir.split('/').filter(Boolean);
    const results = [];
    try {
      const dir = parts.length ? await resolveDir(this._root, parts, false) : this._root;
      await walkDir(dir, prefixDir, results);
    } catch {
      // directory doesn't exist yet
    }
    return results;
  }

  async deletePrefix(prefix) {
    const paths = await this.list(prefix);
    for (const p of paths) await this.delete(p);
  }
}
