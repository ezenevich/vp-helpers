const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { URL } = require('url');

const DATA_PATH = path.join(__dirname, 'data', 'tableData.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const PORT = process.env.PORT || 3000;

async function readData() {
  const content = await fsp.readFile(DATA_PATH, 'utf-8');
  return JSON.parse(content);
}

async function writeData(data) {
  await fsp.writeFile(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function sendJSON(res, statusCode, payload) {
  const data = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data)
  });
  res.end(data);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(text)
  });
  res.end(text);
}

function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.socket.destroy();
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function serveStatic(pathname, res) {
  const defaultFile = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, defaultFile));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  let finalPath = filePath;

  try {
    const stats = await fsp.stat(finalPath);
    if (stats.isDirectory()) {
      finalPath = path.join(finalPath, 'index.html');
    }
  } catch (error) {
    sendText(res, 404, 'Not Found');
    return;
  }

  try {
    const ext = path.extname(finalPath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
    const stream = fs.createReadStream(finalPath);
    stream.on('open', () => {
      res.writeHead(200, { 'Content-Type': mimeType });
    });
    stream.on('error', () => {
      if (!res.headersSent) {
        sendText(res, 500, 'Server error');
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  } catch (error) {
    sendText(res, 500, 'Server error');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);
    const segments = pathname.split('/').filter(Boolean);

    if (req.method === 'GET' && pathname === '/api/data') {
      const data = await readData();
      sendJSON(res, 200, data);
      return;
    }

    if (
      req.method === 'PATCH' &&
      segments.length === 5 &&
      segments[0] === 'api' &&
      segments[1] === 'rows' &&
      segments[3] === 'columns'
    ) {
      const rowId = segments[2];
      const columnKey = segments[4];
      const body = await getRequestBody(req);

      let value = '';
      if (body) {
        try {
          const payload = JSON.parse(body);
          if (typeof payload.value === 'string') {
            value = payload.value;
          }
        } catch (error) {
          sendJSON(res, 400, { error: 'Невалидный JSON в запросе' });
          return;
        }
      }

      const data = await readData();
      const column = data.columns.find(item => item.key === columnKey);
      if (!column) {
        sendJSON(res, 404, { error: 'Колонка не найдена' });
        return;
      }
      if (column.type !== 'checkbox') {
        sendJSON(res, 400, { error: 'Колонку нельзя обновить через этот метод' });
        return;
      }

      const row = data.rows.find(item => item.id === rowId);
      if (!row) {
        sendJSON(res, 404, { error: 'Строка не найдена' });
        return;
      }

      row[columnKey] = value;
      await writeData(data);
      sendJSON(res, 200, { success: true, row });
      return;
    }

    if (req.method === 'OPTIONS' && pathname.startsWith('/api/')) {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      res.end();
      return;
    }

    await serveStatic(pathname, res);
  } catch (error) {
    if (!res.headersSent) {
      sendText(res, 500, 'Server error');
    } else {
      res.end();
    }
  }
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
