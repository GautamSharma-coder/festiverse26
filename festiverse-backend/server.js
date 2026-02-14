require('dotenv').config(); // Load environment variables
const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// --- MONGODB CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("🔥 MongoDB Connected Successfully"))
    .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// --- SCHEMAS ---
const registrationSchema = new mongoose.Schema({
    name: String,
    universityId: String,
    interest: String,
    email: String,
    status: { type: String, default: 'Registered' },
    timestamp: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
    name: String,
    email: String,
    message: String,
    timestamp: { type: Date, default: Date.now }
});

const Registration = mongoose.model('Registration', registrationSchema);
const Message = mongoose.model('Message', messageSchema);

// --- MIDDLEWARE ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// --- AUTHENTICATION MIDDLEWARE ---
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];
    
    if (!token) return res.status(403).json({ success: false, message: "No token provided." });

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ success: false, message: "Unauthorized." });
        req.user = decoded;
        next(); 
    });
};

// --- API ROUTES ---

// 1. LOGIN ROUTE 
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    
    if (password === ADMIN_PASSWORD) {
        const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ success: true, token });
    } else {
        res.status(401).json({ success: false, message: "Invalid Password" });
    }
});

// 2. PUBLIC SUBMISSION ROUTES
app.post('/api/register', async (req, res) => {
    try {
        const { name, universityId, interest, email } = req.body;
        const newExplorer = new Registration({ name, universityId, interest, email });
        await newExplorer.save();
        res.status(201).json({ success: true, message: "Registration Confirmed!", ticketId: newExplorer._id });
    } catch (err) { res.status(500).json({ success: false, message: "Error" }); }
});

app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, message } = req.body;
        const newMessage = new Message({ name, email, message });
        await newMessage.save();
        res.status(200).json({ success: true, message: "Message Received." });
    } catch (err) { res.status(500).json({ success: false, message: "Error" }); }
});

// 3. PROTECTED ADMIN ROUTES
app.get('/api/admin/registrations', verifyToken, async (req, res) => {
    const data = await Registration.find().sort({ timestamp: -1 });
    res.json(data);
});

app.get('/api/admin/messages', verifyToken, async (req, res) => {
    const messages = await Message.find().sort({ timestamp: -1 });
    const formatted = messages.map(msg => ({
        id: msg._id,
        name: msg.name,
        email: msg.email,
        message: msg.message,
        date: msg.timestamp ? new Date(msg.timestamp).toLocaleString() : 'N/A' 
    }));
    res.json(formatted);
});

app.delete('/api/admin/registrations/:id', verifyToken, async (req, res) => {
    await Registration.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

app.delete('/api/admin/messages/:id', verifyToken, async (req, res) => {
    await Message.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

app.put('/api/admin/registrations/:id', verifyToken, async (req, res) => {
    const { status } = req.body;
    await Registration.findByIdAndUpdate(req.params.id, { status });
    res.json({ success: true });
});

// --- PAGE ROUTES (Clean URLs) ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/schedule', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'schedule.html'));
});

app.get('/team', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'team.html'));
});

app.get('/events', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'event.html'));
});

app.get('/contact', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Fallback: Redirect random URLs back to home
app.get(/(.*)/, (req, res) => {
    res.redirect('/');
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));