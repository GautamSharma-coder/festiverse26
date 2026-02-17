require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_key";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

// --- MONGODB CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("🔥 MongoDB Connected Successfully"))
    .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// --- SCHEMAS ---

// 1. Event Registration Schema
const registrationSchema = new mongoose.Schema({
    name: String,
    college: String,
    universityId: String,
    email: String,
    phone: String,
    event: String,
    teamName: String,
    teamMembers: [String],
    status: { type: String, default: 'Registered' },
    timestamp: { type: Date, default: Date.now }
});

// 2. User Schema (For Dashboard Auth)
const userSchema = new mongoose.Schema({
    name: String,
    collegeId: String,
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    role: { type: String, default: 'student' },
    joinedAt: { type: Date, default: Date.now }
});

// 3. Message Schema (Contact Form)
const messageSchema = new mongoose.Schema({
    name: String,
    email: String,
    message: String,
    timestamp: { type: Date, default: Date.now }
});

const Registration = mongoose.model('Registration', registrationSchema);
const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);
const imageSchema = new mongoose.Schema({
    filename: String,
    url: String,
    title: String,
    category: String,
    uploadedAt: { type: Date, default: Date.now }
});
const Image = mongoose.model('Image', imageSchema);

// --- MIDDLEWARE ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// --- MULTER STORAGE ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, 'public/uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'));
    }
});
const upload = multer({ storage });

// --- AUTH MIDDLEWARE ---
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

// 1. ADMIN LOGIN
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '2h' });
        res.json({ success: true, token });
    } else {
        res.status(401).json({ success: false, message: "Invalid Admin Password" });
    }
});

// 2. USER AUTHENTICATION
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { name, collegeId, email, password } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ success: false, message: "Email already registered." });

        const newUser = new User({ name, collegeId, email, password });
        await newUser.save();

        const token = jwt.sign({ id: newUser._id, role: 'student' }, JWT_SECRET, { expiresIn: '24h' });
        res.status(201).json({ success: true, message: "Account created!", token, user: { name, email } });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user || user.password !== password) {
            return res.status(401).json({ success: false, message: "Invalid credentials." });
        }

        const token = jwt.sign({ id: user._id, role: 'student' }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, message: "Welcome back!", token, user: { name: user.name, email: user.email } });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// 3. EVENT REGISTRATION
app.post('/api/register', async (req, res) => {
    try {
        const { name, universityId, college, phone, email, event, interest, teamName, teamMembers } = req.body;

        const newReg = new Registration({
            name,
            universityId,
            college,
            email,
            phone,
            event: event || interest,
            teamName,
            teamMembers
        });

        await newReg.save();
        res.status(201).json({ success: true, message: "Registration Confirmed!", ticketId: newReg._id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Error processing registration." });
    }
});

// 4. CONTACT FORM
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, message } = req.body;
        const newMessage = new Message({ name, email, message });
        await newMessage.save();
        res.status(200).json({ success: true, message: "Transmission Received." });
    } catch (err) { res.status(500).json({ success: false, message: "Error" }); }
});

// 5. PROTECTED ADMIN DATA
app.get('/api/admin/registrations', verifyToken, async (req, res) => {
    try {
        const data = await Registration.find().sort({ timestamp: -1 });
        res.json(data);
    } catch (err) { res.status(500).json({ error: "Fetch error" }); }
});

app.get('/api/admin/messages', verifyToken, async (req, res) => {
    try {
        const messages = await Message.find().sort({ timestamp: -1 });
        const formatted = messages.map(msg => ({
            id: msg._id,
            name: msg.name,
            email: msg.email,
            message: msg.message,
            date: msg.timestamp ? new Date(msg.timestamp).toLocaleString() : 'N/A'
        }));
        res.json(formatted);
    } catch (err) { res.status(500).json({ error: "Fetch error" }); }
});

// Admin Actions (Delete/Update)
app.delete('/api/admin/registrations/:id', verifyToken, async (req, res) => {
    await Registration.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

app.put('/api/admin/registrations/:id', verifyToken, async (req, res) => {
    const { status } = req.body;
    await Registration.findByIdAndUpdate(req.params.id, { status });
    res.json({ success: true });
});

app.delete('/api/admin/messages/:id', verifyToken, async (req, res) => {
    await Message.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});


// 6. IMAGE MANAGEMENT ROUTES

// Public: Get all images
app.get('/api/images', async (req, res) => {
    try {
        const images = await Image.find().sort({ uploadedAt: -1 });
        res.json(images);
    } catch (err) { res.status(500).json({ error: "Fetch error" }); }
});

// 7. USER DATA: GET MY REGISTRATIONS
app.get('/api/my-registrations', verifyToken, async (req, res) => {
    try {
        // 1. Find the user based on the Token ID
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        // 2. Find registrations matching the user's email
        // (Using email links the Account to the Event Registration)
        const registrations = await Registration.find({ email: user.email }).sort({ timestamp: -1 });

        res.json({ success: true, registrations });
    } catch (err) {
        console.error("Fetch Error:", err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// Admin: Upload Image
app.post('/api/admin/images', verifyToken, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded." });

        const { title, category } = req.body;
        const newImage = new Image({
            filename: req.file.filename,
            url: `/uploads/${req.file.filename}`,
            title,
            category
        });
        await newImage.save();
        res.json({ success: true, image: newImage });
    } catch (err) { res.status(500).json({ success: false, message: "Upload error" }); }
});

// Admin: Delete Image
app.delete('/api/admin/images/:id', verifyToken, async (req, res) => {
    try {
        const image = await Image.findById(req.params.id);
        if (!image) return res.status(404).json({ success: false, message: "Image not found." });

        const filePath = path.join(__dirname, 'public/uploads', image.filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        await Image.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: "Delete error" }); }
});

// Admin: Update Image details
app.put('/api/admin/images/:id', verifyToken, async (req, res) => {
    try {
        const { title, category } = req.body;
        await Image.findByIdAndUpdate(req.params.id, { title, category });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: "Update error" }); }
});

// --- PAGE ROUTES (Clean URLs) ---

const pages = {
    '/': 'index.html',
    '/register': 'register.html',
    '/schedule': 'schedule.html',
    '/team': 'team.html',
    '/events': 'event.html',
    '/contact': 'contact.html',
    '/admin': 'admin.html',
    '/auth': 'auth.html',
    '/dashboard': 'dashboard.html',
    '/sponsors': 'sponsors.html',
    '/merch': 'merch.html',
    '/gallery': 'gallery.html'
};

Object.entries(pages).forEach(([route, file]) => {
    app.get(route, (req, res) => {
        res.sendFile(path.join(__dirname, 'public', file));
    });
});

// --- 404 HANDLER (FIXED) ---
// This middleware catches any request that wasn't handled by the routes above
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// --- START SERVER ---
app.listen(PORT, () => console.log(`🚀 Festiverse Server running on http://localhost:${PORT}`));