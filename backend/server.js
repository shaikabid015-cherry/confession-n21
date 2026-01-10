const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Email transporter configuration
let transporter;
try {
    transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        },
        tls: {
            rejectUnauthorized: false
        }
    });
} catch (error) {
    console.error('Failed to create email transporter:', error.message);
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        emailConfigured: !!transporter
    });
});

// Send confession email endpoint
app.post('/api/send-confession', async (req, res) => {
    try {
        const { to, subject, html, confessionId, fromName, toName } = req.body;
        
        if (!transporter) {
            return res.status(500).json({ 
                success: false, 
                message: 'Email service not configured' 
            });
        }
        
        // Email options
        const mailOptions = {
            from: `"ConfessHub" <${process.env.EMAIL_USER}>`,
            to: to,
            subject: subject || 'You received a confession!',
            html: html || `<p>Hello ${toName}, you received a confession from ${fromName || 'someone'}. Login to ConfessHub to view it.</p>`,
            replyTo: 'no-reply@confesshub.com'
        };
        
        // Send email
        const info = await transporter.sendMail(mailOptions);
        
        console.log('Email sent:', info.messageId);
        
        res.json({ 
            success: true, 
            message: 'Email sent successfully',
            messageId: info.messageId,
            confessionId: confessionId
        });
        
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send email',
            error: error.message 
        });
    }
});

// Authentication endpoint (mock for now)
app.post('/api/auth/login', (req, res) => {
    const { userId, password } = req.body;
    
    // Mock validation - replace with real database in production
    const validUsers = [
        { id: 'N210001', password: 'password123', name: 'John Doe', email: 'N210001@rguktn.ac.in' },
        { id: 'N210002', password: 'password123', name: 'Jane Smith', email: 'N210002@rguktn.ac.in' },
        { id: 'N210003', password: 'password123', name: 'Alex Johnson', email: 'N210003@rguktn.ac.in' }
    ];
    
    const user = validUsers.find(u => u.id === userId && u.password === password);
    
    if (user) {
        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                profilePic: `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`
            }
        });
    } else {
        res.status(401).json({
            success: false,
            message: 'Invalid credentials'
        });
    }
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
}

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Email service: ${transporter ? 'Configured' : 'Not configured'}`);
});