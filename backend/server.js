const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware - IMPORTANT: Allow CORS from your Vercel frontend
app.use(cors({
    origin: ['https://confesshub.vercel.app', 'http://localhost:3000', 'http://localhost:5500'],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Email transporter configuration with better logging
let transporter = null;
let emailConfigured = false;

function initEmailTransporter() {
    try {
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            console.error('❌ Email credentials not found in environment variables');
            console.log('Please set EMAIL_USER and EMAIL_PASS in your .env file');
            return null;
        }

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

        // Verify transporter configuration
        transporter.verify(function(error, success) {
            if (error) {
                console.error('❌ Email transporter verification failed:', error.message);
                emailConfigured = false;
            } else {
                console.log('✅ Email transporter is ready to send messages');
                emailConfigured = true;
            }
        });

        return transporter;
    } catch (error) {
        console.error('❌ Failed to create email transporter:', error.message);
        return null;
    }
}

// Initialize email on startup
initEmailTransporter();

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        emailConfigured: emailConfigured,
        service: 'ConfessHub Backend API',
        version: '1.0.0'
    });
});

// Test email endpoint (for debugging)
app.post('/api/test-email', async (req, res) => {
    try {
        const { to, subject, message } = req.body;
        
        if (!transporter || !emailConfigured) {
            return res.status(500).json({ 
                success: false, 
                message: 'Email service not configured or verified' 
            });
        }
        
        const mailOptions = {
            from: `"ConfessHub" <${process.env.EMAIL_USER}>`,
            to: to || process.env.EMAIL_USER, // Send to self if no recipient
            subject: subject || 'Test Email from ConfessHub',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2 style="color: #6a11cb;">ConfessHub Test Email</h2>
                    <p>This is a test email sent from the ConfessHub backend.</p>
                    <p>If you receive this, email configuration is working!</p>
                    <p><strong>Message:</strong> ${message || 'No message provided'}</p>
                    <hr>
                    <p style="color: #666; font-size: 12px;">
                        Server Time: ${new Date().toISOString()}<br>
                        Email Service: ${emailConfigured ? 'Configured' : 'Not Configured'}
                    </p>
                </div>
            `
        };
        
        const info = await transporter.sendMail(mailOptions);
        
        console.log('✅ Test email sent:', info.messageId);
        
        res.json({ 
            success: true, 
            message: 'Test email sent successfully',
            messageId: info.messageId,
            to: mailOptions.to
        });
        
    } catch (error) {
        console.error('❌ Error sending test email:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send test email',
            error: error.message 
        });
    }
});

// Send confession email endpoint - FIXED VERSION
app.post('/api/send-confession', async (req, res) => {
    console.log('📧 Received confession email request:', {
        to: req.body.to,
        toName: req.body.toName,
        timestamp: new Date().toISOString()
    });
    
    try {
        const { to, subject, html, confessionId, fromName, toName } = req.body;
        
        // Validate required fields
        if (!to) {
            return res.status(400).json({ 
                success: false, 
                message: 'Recipient email is required' 
            });
        }
        
        if (!transporter || !emailConfigured) {
            console.error('Email service not ready. Configured:', emailConfigured);
            return res.status(503).json({ 
                success: false, 
                message: 'Email service is currently unavailable. Please try again later.' 
            });
        }
        
        // Create better email template if html not provided
        let emailHtml = html;
        if (!emailHtml) {
            emailHtml = createConfessionEmailTemplate({
                toName: toName || 'User',
                fromName: fromName || 'Someone',
                message: req.body.message || 'You have received a confession!',
                mood: req.body.mood || { emoji: '❤️', text: 'Confession' }
            });
        }
        
        // Email options
        const mailOptions = {
            from: `"ConfessHub" <${process.env.EMAIL_USER}>`,
            to: to,
            subject: subject || 'You received a confession! ❤️',
            html: emailHtml,
            replyTo: process.env.EMAIL_USER,
            headers: {
                'X-Confession-ID': confessionId || 'unknown',
                'X-Sender': 'ConfessHub System'
            }
        };
        
        console.log('📤 Sending email to:', to);
        
        // Send email
        const info = await transporter.sendMail(mailOptions);
        
        console.log('✅ Email sent successfully:', {
            messageId: info.messageId,
            to: to,
            timestamp: new Date().toISOString()
        });
        
        // Log successful email
        logEmailSent({
            to: to,
            messageId: info.messageId,
            confessionId: confessionId,
            status: 'sent'
        });
        
        res.json({ 
            success: true, 
            message: 'Confession email sent successfully',
            messageId: info.messageId,
            confessionId: confessionId,
            recipient: toName || to
        });
        
    } catch (error) {
        console.error('❌ Error sending confession email:', error);
        
        // Log failed email
        logEmailSent({
            to: req.body.to,
            confessionId: req.body.confessionId,
            status: 'failed',
            error: error.message
        });
        
        // Check for specific Gmail errors
        let errorMessage = 'Failed to send email';
        if (error.code === 'EAUTH') {
            errorMessage = 'Email authentication failed. Please check your email credentials.';
        } else if (error.code === 'EENVELOPE') {
            errorMessage = 'Invalid recipient email address.';
        }
        
        res.status(500).json({ 
            success: false, 
            message: errorMessage,
            error: error.message,
            code: error.code
        });
    }
});

// Helper function to create email template
function createConfessionEmailTemplate(data) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>You received a confession!</title>
            <style>
                body {
                    font-family: 'Arial', sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                    background-color: #f8f9fa;
                }
                .email-container {
                    background-color: white;
                    border-radius: 10px;
                    padding: 30px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                }
                .header {
                    background: linear-gradient(135deg, #6a11cb, #2575fc);
                    padding: 30px;
                    text-align: center;
                    color: white;
                    border-radius: 10px 10px 0 0;
                }
                .emoji-large {
                    font-size: 48px;
                    margin-bottom: 15px;
                }
                .content {
                    padding: 30px;
                }
                .confession-box {
                    background-color: #f8f9fa;
                    border-left: 4px solid #6a11cb;
                    padding: 20px;
                    margin: 20px 0;
                    border-radius: 0 8px 8px 0;
                }
                .button {
                    display: inline-block;
                    background: linear-gradient(135deg, #6a11cb, #2575fc);
                    color: white;
                    padding: 15px 30px;
                    text-decoration: none;
                    border-radius: 25px;
                    font-weight: bold;
                    margin: 20px 0;
                    text-align: center;
                }
                .footer {
                    text-align: center;
                    color: #666;
                    font-size: 12px;
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid #eee;
                }
                @media (max-width: 600px) {
                    .email-container {
                        padding: 15px;
                    }
                    .content {
                        padding: 15px;
                    }
                }
            </style>
        </head>
        <body>
            <div class="email-container">
                <div class="header">
                    <div class="emoji-large">${data.mood?.emoji || '❤️'}</div>
                    <h1>You received a confession!</h1>
                </div>
                
                <div class="content">
                    <p>Hello <strong>${data.toName}</strong>,</p>
                    
                    <p>Someone has sent you a confession on <strong>ConfessHub</strong>!</p>
                    
                    <div class="confession-box">
                        <h3>${data.mood?.text || 'Confession'}</h3>
                        <p><em>"${data.message?.substring(0, 200) || 'You have a new confession waiting for you...'}"</em></p>
                        <p><strong>From:</strong> ${data.fromName}</p>
                    </div>
                    
                    <div style="text-align: center;">
                        <a href="https://confesshub.vercel.app/messages.html" class="button">
                            View Your Confession
                        </a>
                    </div>
                    
                    <p style="text-align: center; color: #666; font-size: 14px;">
                        This message was sent from ConfessHub.<br>
                        Please do not reply to this email.
                    </p>
                </div>
                
                <div class="footer">
                    <p>&copy; ${new Date().getFullYear()} ConfessHub. All rights reserved.</p>
                    <p>This is an automated message. If you didn't expect this email, please ignore it.</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

// Helper function to log email attempts
function logEmailSent(data) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        ...data
    };
    
    console.log('📝 Email Log:', logEntry);
    
    // You could also save to a file or database here
    // For now, we just log to console
}

// Authentication endpoint
app.post('/api/auth/login', (req, res) => {
    console.log('🔐 Login attempt:', req.body.userId);
    
    const { userId, password } = req.body;
    
    // Mock validation - replace with real database in production
    const validUsers = [
        { id: 'N210001', password: 'password123', name: 'John Doe', email: 'N210001@rguktn.ac.in' },
        { id: 'N210002', password: 'password123', name: 'Jane Smith', email: 'N210002@rguktn.ac.in' },
        { id: 'N210003', password: 'password123', name: 'Alex Johnson', email: 'N210003@rguktn.ac.in' },
        { id: 'N210004', password: 'password123', name: 'Sarah Williams', email: 'N210004@rguktn.ac.in' },
        { id: 'N210005', password: 'password123', name: 'Michael Brown', email: 'N210005@rguktn.ac.in' }
    ];
    
    const user = validUsers.find(u => u.id === userId && u.password === password);
    
    if (user) {
        console.log('✅ Login successful for:', userId);
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
        console.log('❌ Login failed for:', userId);
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

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err.stack);
    res.status(500).json({
        success: false,
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`
    🚀 ConfessHub Backend Server Started!
    ====================================
    📍 Port: ${PORT}
    🌐 Environment: ${process.env.NODE_ENV || 'development'}
    📧 Email Service: ${emailConfigured ? '✅ Ready' : '❌ Not Configured'}
    
    📋 Available Endpoints:
    • GET  /api/health           - Health check
    • POST /api/send-confession  - Send confession email
    • POST /api/test-email       - Test email sending
    • POST /api/auth/login       - User authentication
    
    ⚠️  Email Configuration: ${emailConfigured ? 'READY' : 'NOT CONFIGURED'}
    ${!emailConfigured ? 'Please set EMAIL_USER and EMAIL_PASS in .env file' : ''}
    `);
});
