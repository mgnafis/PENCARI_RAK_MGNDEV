import express from 'express';
import cookie from 'cookie';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { inventory } from './data/inventory.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const COOKIE_NAME = 'auth_token';
const COOKIE_MAX_AGE = 60 * 60; // 1 hour in seconds

let USERS = {};

function loadUsers() {
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    USERS = JSON.parse(raw);
    console.log(`Users loaded: ${Object.keys(USERS).length} user(s)`);
  } catch {
    USERS = { admin: 'warehouse123' };
    saveUsers();
    console.log('Users file created with default admin');
  }
}

function saveUsers() {
  fs.writeFileSync(USERS_FILE, JSON.stringify(USERS, null, 2));
}

loadUsers();

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(PUBLIC));

function parseCookies(req) {
  return cookie.parse(req.headers.cookie || '');
}

function requireAdmin(req, res, next) {
  if (req.user !== 'admin') {
    return res.status(403).json({ error: 'Akses ditolak. Hanya admin.' });
  }
  next();
}

function requireAuth(req, res, next) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    const age = (Date.now() - decoded.created) / 1000;
    if (age > COOKIE_MAX_AGE) {
      res.clearCookie(COOKIE_NAME);
      return res.status(401).json({ error: 'Session expired' });
    }
    req.user = decoded.user;
    next();
  } catch {
    res.clearCookie(COOKIE_NAME);
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/login', (req, res) => {
  const { username, password } = req.body ?? {};
  if (USERS[username] && USERS[username] === password) {
    const token = Buffer.from(JSON.stringify({ user: username, created: Date.now() })).toString('base64');
    res.setHeader('Set-Cookie', cookie.serialize(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'strict',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    }));
    return res.json({ ok: true, user: username });
  }
  res.status(401).json({ ok: false, error: 'Username atau password salah.' });
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', cookie.serialize(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  }));
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ── User Management ────────────────────────────────────────────────────────
app.get('/api/admin/users', requireAuth, requireAdmin, (_req, res) => {
  const users = Object.keys(USERS).map(u => ({ username: u }));
  res.json({ users });
});

app.post('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi.' });
  }
  const u = username.trim().toLowerCase();
  if (u.length < 3) {
    return res.status(400).json({ error: 'Username minimal 3 karakter.' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Password minimal 4 karakter.' });
  }
  if (USERS[u]) {
    return res.status(409).json({ error: 'Username sudah ada.' });
  }
  USERS[u] = password;
  saveUsers();
  res.json({ ok: true, user: { username: u } });
});

app.delete('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const { username } = req.body ?? {};
  if (!username) return res.status(400).json({ error: 'Username wajib diisi.' });
  if (username === 'admin') {
    return res.status(403).json({ error: 'User admin tidak bisa dihapus.' });
  }
  if (!USERS[username]) {
    return res.status(404).json({ error: 'User tidak ditemukan.' });
  }
  delete USERS[username];
  saveUsers();
  res.json({ ok: true });
});

// ── Search ──────────────────────────────────────────────────────────────────
app.post('/api/search', requireAuth, (req, res) => {
  const { codes } = req.body ?? {};
  if (!Array.isArray(codes)) {
    return res.status(400).json({ error: 'codes must be an array' });
  }

  const results = codes.map(code => {
    const key = String(code ?? '').trim().toUpperCase();
    const hits = inventory.get(key) ?? [];
    return {
      code: key,
      found: hits.length > 0,
      matches: hits.map(({ source, BinLocation, ItemName, UnitName, Unallocated, Stock, OsTransfer, OsSpb }) =>
        ({ source, BinLocation, ItemName, UnitName, Unallocated, Stock, OsTransfer, OsSpb })
      ),
    };
  });

  res.json({ results });
});

// Protect /admin.html — only admin can access it
app.get('/admin.html', (req, res) => {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return res.redirect('/');

  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    const age = (Date.now() - decoded.created) / 1000;
    if (age > COOKIE_MAX_AGE) {
      res.clearCookie(COOKIE_NAME);
      return res.redirect('/');
    }
    if (decoded.user !== 'admin') {
      return res.redirect('/home.html');
    }
    res.sendFile(path.join(PUBLIC, 'admin.html'));
  } catch {
    res.clearCookie(COOKIE_NAME);
    return res.redirect('/');
  }
});

app.use((req, res) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(PUBLIC, 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

app.listen(PORT, () => {
  console.log(`Warehouse Shelf Finder running at http://localhost:${PORT}`);
  console.log(`Inventory loaded: ${inventory.size} unique item codes`);
});
