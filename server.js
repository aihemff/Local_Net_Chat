const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'your-secret-key-change-this-in-production';
const USERS_FILE = path.join(__dirname, 'users.json');

// Load or create users database
function loadUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading users:', e);
    }
    return {};
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

let users = loadUsers();

const server = http.createServer((req, res) => {
    // Parse URL
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    // Handle API routes
    if (url.pathname === '/api/register' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const { username, password } = JSON.parse(body);
                
                if (!username || !password) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Username and password required' }));
                    return;
                }
                
                if (users[username]) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Username already exists' }));
                    return;
                }
                
                // Hash password with bcrypt
                bcrypt.hash(password, 10, (err, hash) => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Server error' }));
                        return;
                    }
                    
                    users[username] = { passwordHash: hash };
                    saveUsers(users);
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ message: 'User registered successfully' }));
                });
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid request' }));
            }
        });
        return;
    }
    
    if (url.pathname === '/api/login' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const { username, password } = JSON.parse(body);
                
                if (!username || !password || !users[username]) {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid credentials' }));
                    return;
                }
                
                // Compare password with hash
                bcrypt.compare(password, users[username].passwordHash, (err, isMatch) => {
                    if (err || !isMatch) {
                        res.writeHead(401, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Invalid credentials' }));
                        return;
                    }
                    
                    // Generate JWT token
                    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ token, username }));
                });
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid request' }));
            }
        });
        return;
    }
    
    // Serve static files
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    
    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end('File not found');
            return;
        }
        
        // Set content type
        let contentType = 'text/html';
        if (filePath.endsWith('.css')) contentType = 'text/css';
        if (filePath.endsWith('.js')) contentType = 'text/javascript';
        
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    });
});

const wss = new WebSocket.Server({ server });
let userCount = 0;
const authenticatedUsers = new Map();

wss.on('connection', (ws, req) => {
    // Get token from URL query
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    
    if (!token) {
        ws.close(1008, 'Unauthorized');
        return;
    }
    
    // Verify JWT token
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            ws.close(1008, 'Invalid token');
            return;
        }
        
        const username = decoded.username;
        userCount++;
        authenticatedUsers.set(ws, username);
        
        console.log(`${username} connected. Total users: ${userCount}`);
        
        // Send welcome message
        ws.send(JSON.stringify({
            type: 'system',
            message: `${username} joined the chat!`,
            timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        }));
        
        // Broadcast user count
        broadcast({
            type: 'users',
            count: userCount,
            username: username
        });
        
        // Handle messages
        ws.on('message', (msg) => {
            try {
                const data = JSON.parse(msg);
                
                broadcast({
                    type: 'message',
                    text: data.text,
                    username: username,
                    timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                });
            } catch (e) {
                console.error('Error parsing message:', e);
            }
        });
        
        // Handle disconnect
        ws.on('close', () => {
            userCount--;
            authenticatedUsers.delete(ws);
            console.log(`${username} disconnected. Total users: ${userCount}`);
            
            broadcast({
                type: 'system',
                message: `${username} left the chat.`,
                timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
            });
            
            broadcast({
                type: 'users',
                count: userCount
            });
        });
        
        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
    });
});

// Broadcast function
function broadcast(data) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

const PORT = 9000;
server.listen(PORT, () => {
    console.log(`🚀 Secure Server running at http://localhost:${PORT}`);
    console.log(`🔐 Authentication enabled - Login required`);
    console.log(`💬 WebSocket server ready for authenticated chat`);
});
