const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 465;

// Middleware - IMPORTANT: Allow CORS from your Vercel frontend
app.use(cors({
    origin: ['https://confesshub2.vercel.app', 'http://localhost:3000', 'http://localhost:5500'],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
// Email transporter configuration with better logging
let transporter = null;
let emailConfigured = false;

function initEmailTransporter() {
    try {
        // This checks if Render has successfully loaded your dashboard variables
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            console.error('❌ Email credentials not found. Check Render Environment tab.');
            return null;
        }

        transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465, // Using port 465 is more stable on Render
            secure: true, // SSL required for port 465
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

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
       { id: 'N210001', password: '$39a5c^', name: 'MANNEPURI CHANDRIKA', email: 'n210001@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210001.jpg' },
    { id: 'N210002', password: '!4b948!', name: 'KUNDA VENKATA SAI  SUBHASH', email: 'n210002@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210002.jpg' },
    { id: 'N210003', password: '*aeef0)', name: 'SINGAMPALLI SRI DEDEEPYA', email: 'n210003@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210003.jpg' },
    { id: 'N210004', password: '$10d4f!', name: 'RAVANAM V S M SESHA SURESH', email: 'n210004@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210004.jpg' },
    { id: 'N210005', password: '@0da45$', name: 'REDDY SRUTHIBHANU', email: 'n210005@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210005.jpg' },
    { id: 'N210006', password: '$a64f6*', name: 'CHITTURI DIVYA', email: 'n210006@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210006.jpg' },
    { id: 'N210007', password: '!00427)', name: 'NAMBURI VARSHITHA', email: 'n210007@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210007.jpg' },
    { id: 'N210008', password: '(56a16^', name: 'GOTHALA VENKATA KARTHIK', email: 'n210008@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210008.jpg' },
    { id: 'N210009', password: '!97738!', name: 'BALIJEPALLI SUDHARSHAN REDDY', email: 'n210009@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210009.jpg' },
    { id: 'N210010', password: '$3d6c7*', name: 'RAVUPALLI SAI PAVAN', email: 'n210010@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210010.jpg' },
    { id: 'N210011', password: '!54ffe!', name: 'ROUTHU DIVYA LAXMI', email: 'n210011@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210011.jpg' },
    { id: 'N210012', password: '*0e48c!', name: 'MUTTA DORATHI', email: 'n210012@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210012.jpg' },
    { id: 'N210013', password: '$62970$', name: 'CHALLAGUNDLA KARTHIK', email: 'n210013@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210013.jpg' },
    { id: 'N210014', password: '@bcc4c*', name: 'NARAMSHETTI PADMAJA', email: 'n210014@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210014.jpg' },
    { id: 'N210015', password: '(18dcd)', name: 'CHEKKA YOGESWARI', email: 'n210015@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210015.jpg' },
    { id: 'N210016', password: '@01ede(', name: 'KANAKALA MOHAN SURYA MANIKANTA', email: 'n210016@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210016.jpg' },
    { id: 'N210017', password: '*07e3c$', name: 'BELLAPUKONDA DIVIJA', email: 'n210017@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210017.jpg' },
    { id: 'N210018', password: '^4bc2b$', name: 'KALLURI ROSHANLAL', email: 'n210018@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210018.jpg' },
    { id: 'N210019', password: '^6d7fc*', name: 'DHAVALA ESWAR PAVAN TEJA', email: 'n210019@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210019.jpg' },
    { id: 'N210020', password: '*848b1!', name: 'BANDI HEMALATHA', email: 'n210020@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210020.jpg' },
    { id: 'N210021', password: '$c16ee(', name: 'AVVARU VAMSI KRISHNA SAI', email: 'n210021@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210021.jpg' },
    { id: 'N210023', password: '*76bba@', name: 'PANDI SRINIVAS SIDDARTHA', email: 'n210023@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210023.jpg' },
    { id: 'N210024', password: '*0f0e4^', name: 'ATLA ABHINAV', email: 'n210024@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210024.jpg' },
    { id: 'N210025', password: '^a478e)', name: 'GUTTI BHANU TEJA', email: 'n210025@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210025.jpg' },
    { id: 'N210026', password: '^eda0e*', name: 'BATTULA ARCHANA', email: 'n210026@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210026.jpg' },
    { id: 'N210028', password: '(3544e^', name: 'ALLU SREEKANTH', email: 'n210028@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210028.jpg' },
    { id: 'N210029', password: '*10138$', name: 'SODE VENKATA PRANEETH', email: 'n210029@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210029.jpg' },
    { id: 'N210030', password: '@6b7b0$', name: 'DEVANNAGARI NANDEESH', email: 'n210030@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210030.jpg' },
    { id: 'N210031', password: '*2812a$', name: 'VANA ROHINI', email: 'n210031@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210031.jpg' },
    { id: 'N210032', password: '!1f6ca^', name: 'YANDAMURI RAJESH', email: 'n210032@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210032.jpg' },
    { id: 'N210033', password: '!e5358$', name: 'BALINA VEERA RAGHAVENDRA', email: 'n210033@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210033.jpg' },
    { id: 'N210034', password: '^ea930^', name: 'NARRAVULA  KALYAN', email: 'n210034@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210034.jpg' },
    { id: 'N210035', password: '^ea9305', name: 'LEELABATHI CHOUDHURY', email: 'n210035@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210035.jpg' },
    { id: 'N210036', password: '@f14a2(', name: 'PULAKHANDAM PAVITRA LAXMI', email: 'n210036@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210036.jpg' },
    { id: 'N210037', password: '!d7ec3@', name: 'KANDREGULA VISHAL KARTHIK', email: 'n210037@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210037.jpg' },
    { id: 'N210038', password: '$7b760*', name: 'BARAM KOMALESWARA REDDY', email: 'n210038@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210038.jpg' },
    { id: 'N210039', password: '(1d5fa@', name: 'MORTHALA MAHENDRA REDDY', email: 'n210039@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210039.jpg' },
    { id: 'N210040', password: '!256fc)', name: 'KONATALA PAVANI', email: 'n210040@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210040.jpg' },
    { id: 'N210041', password: '@ada40*', name: 'KOTTHALI YERNI SAGAR', email: 'n210041@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210041.jpg' },
    { id: 'N210042', password: '^b3291*', name: 'YASARAPU HEMANTHKUMAR', email: 'n210042@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210042.jpg' },
    { id: 'N210043', password: '*058dd)', name: 'ANAKALA SAI RAM', email: 'n210043@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210043.jpg' },
    { id: 'N210044', password: '*be0c0$', name: 'ARISETTY KRISHNA GNANADEEP', email: 'n210044@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210044.jpg' },
    { id: 'N210046', password: '^b0bfc*', name: 'GOLI MANOJ KUMAR', email: 'n210046@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210046.jpg' },
    { id: 'N210047', password: '@4829c)', name: 'CHENNAMSETTY  MEGHA SRI', email: 'n210047@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210047.jpg' },
    { id: 'N210048', password: '^19d3a!', name: 'YEDURU DURGA PRASAD', email: 'n210048@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210048.jpg' },
    { id: 'N210049', password: '!866d4^', name: 'ATHOTA VINUTHNA SNEHA', email: 'n210049@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210049.jpg' },
    { id: 'N210050', password: '!c0aa8@', name: 'KARIMUNI TARUN', email: 'n210050@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210050.jpg' },
    { id: 'N210051', password: '*19294(', name: 'JAMPANA TEJA SRI', email: 'n210051@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210051.jpg' },
    { id: 'N210052', password: '!bf73e*', name: 'VIJAY KUMAR REDDY GANAPA', email: 'n210052@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210052.jpg' },
    { id: 'N210053', password: '!ad144)', name: 'CHIPPADA AKHILA', email: 'n210053@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210053.jpg' },
    { id: 'N210054', password: '^165e2)', name: 'AVULURI SRINIVASA REDDY', email: 'n210054@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210054.jpg' },
    { id: 'N210055', password: '!c177c*', name: 'ALLURU  SHANMUGA SHRUTHI', email: 'n210055@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210055.jpg' },
    { id: 'N210056', password: '*24dad^', name: 'MALAPALLI SURYAM', email: 'n210056@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210056.jpg' },
    { id: 'N210057', password: '(9bb36^', name: 'NISINAM KISHORE KUMAR', email: 'n210057@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210057.jpg' },
    { id: 'N210058', password: '$31eb0$', name: 'BELAMANA SATEESH', email: 'n210058@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210058.jpg' },
    { id: 'N210059', password: '!7f45a!', name: 'NIDUMUKKALA VISWADATTA', email: 'n210059@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210059.jpg' },
    { id: 'N210061', password: '*a14cd(', name: 'YAKA PRAVEEN', email: 'n210061@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210061.jpg' },
    { id: 'N210062', password: '$97056(', name: 'TADDI TIRUMALA', email: 'n210062@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210062.jpg' },
    { id: 'N210063', password: '*4988e^', name: 'RUGADA  JITHENDRA NADHU', email: 'n210063@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210063.jpg' },
    { id: 'N210064', password: '*7c471*', name: 'ANNABATHINA VENKATA MANIKANTA', email: 'n210064@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210064.jpg' },
    { id: 'N210065', password: '^7e4c8(', name: 'BONTHU DURGA BHAVANI', email: 'n210065@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210065.jpg' },
    { id: 'N210066', password: '$f36ab$', name: 'MENDA YAMINI', email: 'n210066@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210066.jpg' },
    { id: 'N210068', password: '^ab9a8*', name: 'SHAIK JUNAID JANI', email: 'n210068@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210068.jpg' },
    { id: 'N210069', password: '!54c36*', name: 'KONA KUSUMA KUMARI', email: 'n210069@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210069.jpg' },
    { id: 'N210070', password: '!0cd96$', name: 'CHEVURI SIVA NAGA SAI ABHI CHANDAR', email: 'n210070@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210070.jpg' },
    { id: 'N210071', password: '*a0b6b!', name: 'MADAKA DHANANJAYA', email: 'n210071@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210071.jpg' },
    { id: 'N210072', password: ')749c3*', name: 'KONDE GEETHIKA VYSHNAVI', email: 'n210072@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210072.jpg' },
    { id: 'N210073', password: ')e8a52$', name: 'ANGULURI VENKATA NAGA SAI HARSHAVARDHAN', email: 'n210073@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210073.jpg' },
    { id: 'N210074', password: '$13739!', name: 'NALI SATYAM', email: 'n210074@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210074.jpg' },
    { id: 'N210075', password: '^ea9fe@', name: 'SAMPATHARAO ROSHAN', email: 'n210075@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210075.jpg' },
    { id: 'N210076', password: '(be1ea@', name: 'LANKALAPALLI LAKSHMI NARAYANA SAI TEJA', email: 'n210076@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210076.jpg' },
    { id: 'N210077', password: '*b34d2*', name: 'MYLARI JAYANTH', email: 'n210077@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210077.jpg' },
    { id: 'N210078', password: '@c3884!', name: 'YAKKALA LAKSHMI CHARAN', email: 'n210078@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210078.jpg' },
    { id: 'N210079', password: '@1e89b^', name: 'CHALUVADI PAVAN VENKATA SAI', email: 'n210079@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210079.jpg' },
    { id: 'N210080', password: '*201ce*', name: 'BAGATI KARTHIK', email: 'n210080@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210080.jpg' },
    { id: 'N210081', password: '$0c980*', name: 'MUDUGANTI THRISHA DIVYA', email: 'n210081@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210081.jpg' },
    { id: 'N210082', password: '*98a42!', name: 'CHEEMALADINNE VEERA NARAYANA', email: 'n210082@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210082.jpg' },
    { id: 'N210083', password: '$674f1^', name: 'SURISETTY RAKESH MEHER SAI', email: 'n210083@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210083.jpg' },
    { id: 'N210084', password: '$542bc$', name: 'CHOULA MANIKANTA', email: 'n210084@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210084.jpg' },
    { id: 'N210085', password: '@90868(', name: 'ISHYA BOMMIREDDY', email: 'n210085@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210085.jpg' },
    { id: 'N210086', password: '^f4e9a(', name: 'AVULA NEERAJA', email: 'n210086@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210086.jpg' },
    { id: 'N210087', password: '*51dc3$', name: 'VELAGALA LOKESH', email: 'n210087@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210087.jpg' },
    { id: 'N210088', password: '$371b5*', name: 'SHABANA BEGUM', email: 'n210088@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210088.jpg' },
    { id: 'N210089', password: ')fb20b@', name: 'KANCHIPATI LOKESH', email: 'n210089@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210089.jpg' },
    { id: 'N210090', password: '*7a965*', name: 'NUKALA YASASRI', email: 'n210090@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210090.jpg' },
    { id: 'N210091', password: '$8e745$', name: 'BOMMINENI VINEELA', email: 'n210091@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210091.jpg' },
    { id: 'N210092', password: '$05090^', name: 'MOLLETI VASUDEV', email: 'n210092@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210092.jpg' },
    { id: 'N210093', password: ')4a5ad@', name: 'PADAMATI MONI KRISHNA PRIYA', email: 'n210093@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210093.jpg' },
    { id: 'N210094', password: '$09d99*', name: 'NARALA LAHARI', email: 'n210094@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210094.jpg' },
    { id: 'N210095', password: '@1acfb$', name: 'YERRA SHANMUKH SATYA SAI', email: 'n210095@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210095.jpg' },
    { id: 'N210096', password: '@0b25e^', name: 'MANNAM SEKHAR', email: 'n210096@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210096.jpg' },
    { id: 'N210097', password: '@0bfb7^', name: 'MEKA SIDDIRAMIREDDY', email: 'n210097@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210097.jpg' },
    { id: 'N210098', password: '!522fa(', name: 'SHAIK ARBAS', email: 'n210098@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210098.jpg' },
    { id: 'N210099', password: '*b6dd4^', name: 'BOBBALA AKHANKSHA', email: 'n210099@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210099.jpg' },
    { id: 'N210100', password: '^bc911$', name: 'HARIKA  AMUJURI', email: 'n210100@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210100.jpg' },
    { id: 'N210101', password: '(caf41@', name: 'MANNEMPALLI NAGAMANI', email: 'n210101@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210101.jpg' },
    { id: 'N210102', password: '(72979$', name: 'KATAM VIJAYA LAKSHMI', email: 'n210102@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210102.jpg' },
    { id: 'N210103', password: '@87c27!', name: 'KONA TANMAYI', email: 'n210103@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210103.jpg' },
    { id: 'N210104', password: '^92958!', name: 'ARANGI ANUSHA', email: 'n210104@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210104.jpg' },
    { id: 'N210105', password: '$6f7ae(', name: 'GANGIREDLA RUPAVATHI', email: 'n210105@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210105.jpg' },
    { id: 'N210106', password: '$c39ce(', name: 'BOURUBILLI MAHESWARA RAO', email: 'n210106@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210106.jpg' },
    { id: 'N210107', password: '^fd21e(', name: 'DULLA NAVYA SRI', email: 'n210107@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210107.jpg' },
    { id: 'N210108', password: '^311e9!', name: 'NANDULA JYOTHI ANJANI GANESH', email: 'n210108@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210108.jpg' },
    { id: 'N210109', password: '$b99fe!', name: 'GUMMALLA JHANSI VENKATA NAGADEVI', email: 'n210109@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210109.jpg' },
    { id: 'N210110', password: '(1e824^', name: 'LINGUDU HEMANTH VARMA', email: 'n210110@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210110.jpg' },
    { id: 'N210111', password: '^f1d19)', name: 'POTRU RENUSRI', email: 'n210111@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210111.jpg' },
    { id: 'N210112', password: '@69a71$', name: 'GEDELA SAI SHASHANK', email: 'n210112@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210112.jpg' },
    { id: 'N210113', password: '$7cc63*', name: 'TADDI SRIRAM', email: 'n210113@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210113.jpg' },
    { id: 'N210114', password: '!f52ef^', name: 'BOBBILI DHARANI', email: 'n210114@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210114.jpg' },
    { id: 'N210115', password: '!40c76(', name: 'MALLA KOMALA', email: 'n210115@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210115.jpg' },
    { id: 'N210116', password: '$7709b$', name: 'PALLI SAIKUMAR', email: 'n210116@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210116.jpg' },
    { id: 'N210117', password: '(102f0(', name: 'PAIDI SANDHYARANI', email: 'n210117@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210117.jpg' },
    { id: 'N210118', password: '^a8bc3(', name: 'KASU VYSHNAVI', email: 'n210118@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210118.jpg' },
    { id: 'N210119', password: '*e49dd$', name: 'GOVINDAM LAKSHMI', email: 'n210119@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210119.jpg' },
    { id: 'N210121', password: '@de65d*', name: 'BURE SHANMUKA VARDHAN', email: 'n210121@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210121.jpg' },
    { id: 'N210122', password: '^aca83*', name: 'KOTTU YNIZAM', email: 'n210122@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210122.jpg' },
    { id: 'N210123', password: '*ac114(', name: 'SINGAMSETTI KEERTHI', email: 'n210123@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210123.jpg' },
    { id: 'N210124', password: '!907e6^', name: 'PILLAKATHUPULA VENKATESWARA RAO', email: 'n210124@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210124.jpg' },
    { id: 'N210125', password: '!e41f3^', name: 'GOLI HEMANTH', email: 'n210125@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210125.jpg' },
    { id: 'N210126', password: '^7bb1c^', name: 'KARRA KARTHEEKESWARA REDDY', email: 'n210126@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210126.jpg' },
    { id: 'N210127', password: '@e4e41!', name: 'M YUKTHESH CHOWDARY', email: 'n210127@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210127.jpg' },
    { id: 'N210128', password: '@e94fe$', name: 'THADANA VENKATA PAVANI', email: 'n210128@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210128.jpg' },
    { id: 'N210129', password: '^33efa(', name: 'DANDUPROLU NAVYA VINEETHA', email: 'n210129@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210129.jpg' },
    { id: 'N210130', password: ')cda07(', name: 'RAMPATI NANI', email: 'n210130@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210130.jpg' },
    { id: 'N210131', password: '*8a918!', name: 'KEERTHANA  GORLE', email: 'n210131@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210131.jpg' },
    { id: 'N210132', password: '*fb27d*', name: 'PATNANA SAI KIRAN', email: 'n210132@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210132.jpg' },
    { id: 'N210133', password: '$b505a$', name: 'SHAIK MASTANBI', email: 'n210133@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210133.jpg' },
    { id: 'N210134', password: '$de665!', name: 'GADEPALLI RAJESWARI SRIKRUTHI VEDA', email: 'n210134@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210134.jpg' },
    { id: 'N210135', password: '(2441f^', name: 'LODARI VINEETHA', email: 'n210135@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210135.jpg' },
    { id: 'N210136', password: '@339df*', name: 'PALLA APARNA', email: 'n210136@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210136.jpg' },
    { id: 'N210137', password: '@5694e$', name: 'DODDA USHA SRI', email: 'n210137@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210137.jpg' },
    { id: 'N210138', password: '!d9403^', name: 'GUVVALA TEJESWARI', email: 'n210138@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210138.jpg' },
    { id: 'N210139', password: '@846a0(', name: 'GUNTURU GNANA ESWAR', email: 'n210139@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210139.jpg' },
    { id: 'N210140', password: '^2a3f7!', name: 'SIRIKI PRAVEEN KUMAR', email: 'n210140@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210140.jpg' },
    { id: 'N210141', password: '$bbff5(', name: 'SHAIK A FOUZIA TASLEEM', email: 'n210141@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210141.jpg' },
    { id: 'N210142', password: '@5c811*', name: 'MADDI AJAY SRINIVAS', email: 'n210142@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210142.jpg' },
    { id: 'N210143', password: '*3a50f$', name: 'PATHIVADA RANJITH KUMAR', email: 'n210143@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210143.jpg' },
    { id: 'N210144', password: ')25d2d*', name: 'PRUDHIVI GOWTHAMI', email: 'n210144@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210144.jpg' },
    { id: 'N210145', password: '*67939(', name: 'KANAKALA LAKSHMANA RAO', email: 'n210145@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210145.jpg' },
    { id: 'N210146', password: '$43e58)', name: 'BODDU AJAY', email: 'n210146@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210146.jpg' },
    { id: 'N210147', password: '*6b527(', name: 'EMMANI KAVYASRI', email: 'n210147@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210147.jpg' },
    { id: 'N210148', password: '@f47c2$', name: 'PATTIGILLI KARTHIK', email: 'n210148@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210148.jpg' },
    { id: 'N210149', password: '*28728$', name: 'SANAKA NIHARIKA SAI', email: 'n210149@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210149.jpg' },
    { id: 'N210150', password: '@9e6f7!', name: 'SHAIK SAMEENA ANJUM', email: 'n210150@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210150.jpg' },
    { id: 'N210151', password: '!e5f05)', name: 'GANJI NAGA JYOTHIKA', email: 'n210151@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210151.jpg' },
    { id: 'N210152', password: '^e6c34*', name: 'IMMADI CHENCHU HARSHAVARDHAN', email: 'n210152@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210152.jpg' },
    { id: 'N210153', password: '*2d241!', name: 'SULAKE NIKHILESWARA RAO', email: 'n210153@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210153.jpg' },
    { id: 'N210154', password: '@7b8b2*', name: 'SURLA SOWMYA NAGESWARI', email: 'n210154@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210154.jpg' },
    { id: 'N210155', password: '^78819*', name: 'GANTA UMA MAHESWARA RAO', email: 'n210155@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210155.jpg' },
    { id: 'N210156', password: '(5062e(', name: 'CHINTALA RAJESH', email: 'n210156@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210156.jpg' },
    { id: 'N210157', password: '^51588*', name: 'IMANDI PRASANNA', email: 'n210157@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210157.jpg' },
    { id: 'N210158', password: '@7eee4!', name: 'PALAGIRI MOHAMMED WAAFIQ', email: 'n210158@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210158.jpg' },
    { id: 'N210159', password: ')046b6(', name: 'TIYYAGURA VINEELA', email: 'n210159@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210159.jpg' },
    { id: 'N210160', password: '!63358$', name: 'SYED  KHAJA  RAMTHULLA', email: 'n210160@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210160.jpg' },
    { id: 'N210161', password: '$1bbc3*', name: 'NATAKARANI VENKATA SIDDHARDHA', email: 'n210161@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210161.jpg' },
    { id: 'N210162', password: '(4ffdb(', name: 'SINGIREDDY NAGA LIKHITA', email: 'n210162@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210162.jpg' },
    { id: 'N210163', password: '(5def7^', name: 'KONA NAGA MAHESH', email: 'n210163@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210163.jpg' },
    { id: 'N210165', password: '@e3549$', name: 'MUTTIREDDY JUSMITHA SRI', email: 'n210165@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210165.jpg' },
    { id: 'N210166', password: ')4a106)', name: 'MAHANTHI JNANESWARA RAO', email: 'n210166@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210166.jpg' },
    { id: 'N210167', password: '@3504c^', name: 'GUDIYA AJITH KUMAR', email: 'n210167@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210167.jpg' },
    { id: 'N210168', password: '!244c7@', name: 'KORIBILLI TEJASWINI', email: 'n210168@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210168.jpg' },
    { id: 'N210169', password: '@9de80^', name: 'POLURU SIVABALA SUBRAHMANYA CHARI', email: 'n210169@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210169.jpg' },
    { id: 'N210170', password: '(8c2af*', name: 'MULA VENKATA MAHESHWARA REDDY', email: 'n210170@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210170.jpg' },
    { id: 'N210171', password: '^903f6*', name: 'PEDDA NITHIN KUMAR', email: 'n210171@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210171.jpg' },
    { id: 'N210172', password: '^1ec2c!', name: 'DESILLA YASASWI', email: 'n210172@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210172.jpg' },
    { id: 'N210173', password: '*7c04d*', name: 'KOTTAPALLI SRAVANI', email: 'n210173@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210173.jpg' },
    { id: 'N210174', password: '^94be0)', name: 'THUMATI VENKATA BHAVITHA', email: 'n210174@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210174.jpg' },
    { id: 'N210175', password: ')7002b^', name: 'ARIGELA PRANATHI', email: 'n210175@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210175.jpg' },
    { id: 'N210176', password: '*cff26(', name: 'REDDYVARI UMESHCHANDRA REDDY', email: 'n210176@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210176.jpg' },
    { id: 'N210177', password: '*eaa43!', name: 'PETETI GURU TEJITA', email: 'n210177@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210177.jpg' },
    { id: 'N210178', password: '*2ca4a$', name: 'PAIDI GEETESH CHANDRA', email: 'n210178@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210178.jpg' },
    { id: 'N210179', password: '@cf4ed^', name: 'MANDAVA MADHUMITHA', email: 'n210179@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210179.jpg' },
    { id: 'N210180', password: '*4fb99(', name: 'NEELURI MANJUNATH', email: 'n210180@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210180.jpg' },
    { id: 'N210181', password: ')380df*', name: 'PUTREVU ADITYA', email: 'n210181@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210181.jpg' },
    { id: 'N210182', password: '!65ca2^', name: 'DAMA VENKATA YASWANTH BABU', email: 'n210182@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210182.jpg' },
    { id: 'N210183', password: '@33ebf@', name: 'BODDEPALLI DIVYA', email: 'n210183@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210183.jpg' },
    { id: 'N210184', password: '*5c99e!', name: 'PATNANA YASWANTH', email: 'n210184@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210184.jpg' },
    { id: 'N210185', password: '@55d4d$', name: 'AKUNDI ABHISHEK', email: 'n210185@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210185.jpg' },
    { id: 'N210186', password: '(8be53$', name: 'KAJA CHITTI THALLI', email: 'n210186@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210186.jpg' },
    { id: 'N210187', password: '*c3fae!', name: 'EMANI SURYA RISHIK', email: 'n210187@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210187.jpg' },
    { id: 'N210188', password: '@78a0b!', name: 'GEDDAVALASA RAM SAI ROHITH', email: 'n210188@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210188.jpg' },
    { id: 'N210189', password: '!0b97f^', name: 'BHEEMANA PRUDVI SIDHARDHA', email: 'n210189@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210189.jpg' },
    { id: 'N210190', password: '^6e728!', name: 'POLAVARAM NAVATEJ', email: 'n210190@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210190.jpg' },
    { id: 'N210191', password: '$65394(', name: 'BASWA HARSHA VARDHAN', email: 'n210191@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210191.jpg' },
    { id: 'N210192', password: '!18095*', name: 'JAJAM NAGA AKASH', email: 'n210192@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210192.jpg' },
    { id: 'N210193', password: '*d0cd1(', name: 'PULI SYAM VENKATA DATTU BABU', email: 'n210193@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210193.jpg' },
    { id: 'N210194', password: '!a6f44*', name: 'RATAVARAPU KEERTHI', email: 'n210194@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210194.jpg' },
    { id: 'N210195', password: '*1a541$', name: 'GOLI KOTESWAR', email: 'n210195@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210195.jpg' },
    { id: 'N210196', password: '*9efbf!', name: 'BHEEMA LINGAM SATYA HARINI', email: 'n210196@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210196.jpg' },
    { id: 'N210197', password: '@7d32b!', name: 'BANDLA DATTATREYA', email: 'n210197@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210197.jpg' },
    { id: 'N210198', password: ')b3bd1*', name: 'ALLAM YOHETHA REDDY', email: 'n210198@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210198.jpg' },
    { id: 'N210199', password: '!13750!', name: 'DODDI GOWTHAM BABU', email: 'n210199@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210199.jpg' },
    { id: 'N210200', password: '*7058d$', name: 'PITHANI SAI KRISHNA', email: 'n210200@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210200.jpg' },
    { id: 'N210201', password: '!9de68*', name: 'MUNAGA SHANMUKA SRAVANTH SANJEEVA SAI', email: 'n210201@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210201.jpg' },
    { id: 'N210202', password: '$5e26d*', name: 'RONGALA VAMSI KRISHNA', email: 'n210202@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210202.jpg' },
    { id: 'N210203', password: '@936e2!', name: 'CHINNI ROJA SRIYA AISWARYA LAKSHMI', email: 'n210203@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210203.jpg' },
    { id: 'N210204', password: '@abb8d!', name: 'MAHAMKALI GOPI JAGADHEESH', email: 'n210204@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210204.jpg' },
    { id: 'N210205', password: '@5fa13(', name: 'BATCHALA JEEVITHA', email: 'n210205@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210205.jpg' },
    { id: 'N210206', password: '@f9515$', name: 'MENTADA REVANTH KUMAR', email: 'n210206@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210206.jpg' },
    { id: 'N210207', password: '^ce538(', name: 'SIGATAPU GHYANAKAMESWARI', email: 'n210207@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210207.jpg' },
    { id: 'N210208', password: '^d4bf6*', name: 'CHENGA JYOTHI SWAROOP', email: 'n210208@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210208.jpg' },
    { id: 'N210209', password: ')1189f$', name: 'GANTA GOWRI SANKARA RAO', email: 'n210209@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210209.jpg' },
    { id: 'N210210', password: '!7ab3a(', name: 'LENKA BHARGAVI', email: 'n210210@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210210.jpg' },
    { id: 'N210211', password: ')87d9e^', name: 'BANDARU VENKATA SOMA NITHIN', email: 'n210211@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210211.jpg' },
    { id: 'N210212', password: '@46cc5$', name: 'VENGALASETTY SUSMITHA', email: 'n210212@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210212.jpg' },
    { id: 'N210213', password: '!ead61^', name: 'KOLLI RENU SRI', email: 'n210213@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210213.jpg' },
    { id: 'N210214', password: '!282c7(', name: 'KATRU RAMYA SRI', email: 'n210214@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210214.jpg' },
    { id: 'N210215', password: '^0fe7c$', name: 'BURIDI SRINU', email: 'n210215@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210215.jpg' },
    { id: 'N210216', password: '!f310d!', name: 'BOORA LAKSHMI', email: 'n210216@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210216.jpg' },
    { id: 'N210217', password: '*09dd3*', name: 'SHAIK AKHILA', email: 'n210217@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210217.jpg' },
    { id: 'N210218', password: '$e66e4$', name: 'KARRI ANUSHA', email: 'n210218@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210218.jpg' },
    { id: 'N210219', password: '*84878^', name: 'MAMIDI SWATHI', email: 'n210219@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210219.jpg' },
    { id: 'N210220', password: ')68fad$', name: 'KAMISETTI CHARAN TEJA', email: 'n210220@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210220.jpg' },
    { id: 'N210221', password: '*397c0!', name: 'KALAVATHULA NANDA KISHORE', email: 'n210221@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210221.jpg' },
    { id: 'N210222', password: '*53bfc^', name: 'DRONADULA SREE  SAI', email: 'n210222@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210222.jpg' },
    { id: 'N210223', password: '@e4011*', name: 'SAGINENI NANDHINI', email: 'n210223@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210223.jpg' },
    { id: 'N210224', password: '!c0d16$', name: 'BOJANKI SOHAN', email: 'n210224@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210224.jpg' },
    { id: 'N210225', password: ')2c23f)', name: 'YALAVARTHI  LOKESH VENKATA SAI', email: 'n210225@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210225.jpg' },
    { id: 'N210226', password: '^6f09e*', name: 'CHAVALI MYTHRESH CHANDRA', email: 'n210226@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210226.jpg' },
    { id: 'N210227', password: '*b4c43@', name: 'CHONGALI ARAVIND', email: 'n210227@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210227.jpg' },
    { id: 'N210228', password: '*dc20f@', name: 'MUSIDIPALLI BHAVYA SREE', email: 'n210228@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210228.jpg' },
    { id: 'N210229', password: '!b1b29$', name: 'PALADUGU SINDHU', email: 'n210229@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210229.jpg' },
    { id: 'N210230', password: '*24a5d)', name: 'LANDA GANESH', email: 'n210230@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210230.jpg' },
    { id: 'N210231', password: '*51082(', name: 'PEDASINGU VISHNU PRIYA', email: 'n210231@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210231.jpg' },
    { id: 'N210232', password: ')cb347$', name: 'MUNURU CHANDRA SIDDHARDHA', email: 'n210232@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210232.jpg' },
    { id: 'N210233', password: '^7fcb5!', name: 'MAVURI ANJALI', email: 'n210233@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210233.jpg' },
    { id: 'N210234', password: '*8610c@', name: 'VADDI PAVAN KUMAR', email: 'n210234@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210234.jpg' },
    { id: 'N210235', password: '^078a7$', name: 'PALAPARTHI AKSHITHA VIJAYA SAMEERAJA', email: 'n210235@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210235.jpg' },
    { id: 'N210236', password: '*8bbba@', name: 'GUMMALAVARAPU  JYOTHIRMAYEE', email: 'n210236@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210236.jpg' },
    { id: 'N210237', password: '!6f953*', name: 'KAKULA ROHITH', email: 'n210237@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210237.jpg' },
    { id: 'N210238', password: '!2996b*', name: 'SUBBA SANTHOSH AMBATI', email: 'n210238@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210238.jpg' },
    { id: 'N210239', password: '*82d12)', name: 'GODI MOHAN KRISHNA', email: 'n210239@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210239.jpg' },
    { id: 'N210241', password: '!37f75@', name: 'PASUPULETI SAI SADVIKA', email: 'n210241@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210241.jpg' },
    { id: 'N210242', password: ')58589*', name: 'SWARNA DIWAKAR', email: 'n210242@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210242.jpg' },
    { id: 'N210243', password: '^e6417@', name: 'SHAIK MAHABOOB SUBHANI', email: 'n210243@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210243.jpg' },
    { id: 'N210244', password: '$3d549@', name: 'GUNUPURAM SATYANNARAYANA', email: 'n210244@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210244.jpg' },
    { id: 'N210245', password: '*5ce83(', name: 'VAVILAPALLI HARISCHANDRA PRASAD', email: 'n210245@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210245.jpg' },
    { id: 'N210246', password: '$1d20c)', name: 'GODDUMURI RAGHU', email: 'n210246@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210246.jpg' },
    { id: 'N210247', password: '*436a3$', name: 'KOYA TANUJA', email: 'n210247@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210247.jpg' },
    { id: 'N210248', password: '(c66e0!', name: 'BANDI BHAVANA', email: 'n210248@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210248.jpg' },
    { id: 'N210249', password: '$4958e(', name: 'CHAKKA TEJA ABHINAYASRI', email: 'n210249@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210249.jpg' },
    { id: 'N210250', password: '*6954b(', name: 'BALUKULA JAYAPRAKASH', email: 'n210250@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210250.jpg' },
    { id: 'N210251', password: '*4adc2$', name: 'ARADHYULA MOHAN KRISHNA', email: 'n210251@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210251.jpg' },
    { id: 'N210252', password: ')6dfdf!', name: 'CHAPARAPU DHARANI', email: 'n210252@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210252.jpg' },
    { id: 'N210253', password: '^10494!', name: 'AMBALLA APPALA NAIDU', email: 'n210253@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210253.jpg' },
    { id: 'N210254', password: '!10bf5*', name: 'TANGETI KEERTHI', email: 'n210254@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210254.jpg' },
    { id: 'N210255', password: '@4592f^', name: 'GAVARA  YOGITHA SURYA VISWANADH', email: 'n210255@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210255.jpg' },
    { id: 'N210256', password: '(9d69a!', name: 'MADRI SUGANDHA', email: 'n210256@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210256.jpg' },
    { id: 'N210257', password: '(b930e$', name: 'PALLE BHARATH KUMAR REDDY', email: 'n210257@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210257.jpg' },
    { id: 'N210258', password: '$92d16@', name: 'KOTTANA DIWAKAR', email: 'n210258@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210258.jpg' },
    { id: 'N210259', password: '$1d750(', name: 'VASANA MOHAN SAI SANTOSH', email: 'n210259@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210259.jpg' },
    { id: 'N210260', password: '*de477!', name: 'VELAMALA BHARATHI', email: 'n210260@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210260.jpg' },
    { id: 'N210261', password: '$55600@', name: 'DODDI VENKATA BHARAT VENU', email: 'n210261@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210261.jpg' },
    { id: 'N210262', password: '$f7ade*', name: 'TATAPUDI BUNNY', email: 'n210262@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210262.jpg' },
    { id: 'N210263', password: '@ef27b$', name: 'TELAPROLU RADHA KRISHNA MURTHY', email: 'n210263@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210263.jpg' },
    { id: 'N210264', password: '*18531!', name: 'ALAPATI SREEHARSHA', email: 'n210264@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210264.jpg' },
    { id: 'N210265', password: '!084b3!', name: 'DUSI VENKATA RAMCHARAN', email: 'n210265@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210265.jpg' },
    { id: 'N210266', password: '^23e4d*', name: 'PARABATHINA NAGESWARI', email: 'n210266@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210266.jpg' },
    { id: 'N210267', password: '!b7366(', name: 'NAGALLA DINESH', email: 'n210267@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210267.jpg' },
    { id: 'N210268', password: '$710a1^', name: 'ELURI ESWAR', email: 'n210268@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210268.jpg' },
    { id: 'N210269', password: '*84d27*', name: 'ROUTHU DINESH BALAJI', email: 'n210269@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210269.jpg' },
    { id: 'N210270', password: '@fddc2)', name: 'KURAKULA VENKATA SIVA MANI', email: 'n210270@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210270.jpg' },
    { id: 'N210271', password: '$9aae6(', name: 'SHAIK MOHAMMED RIYAN', email: 'n210271@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210271.jpg' },
    { id: 'N210272', password: '$dc79a!', name: 'CHALLAKOLUSU PRAVALLIKA', email: 'n210272@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210272.jpg' },
    { id: 'N210273', password: '^ace16$', name: 'BANDI RITHWIKA', email: 'n210273@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210273.jpg' },
    { id: 'N210274', password: '$22a24!', name: 'KOLAKALETI SUSHANTH', email: 'n210274@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210274.jpg' },
    { id: 'N210275', password: '$3dce9(', name: 'CHIKKALA MANI SRICHARAN KAILASH', email: 'n210275@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210275.jpg' },
    { id: 'N210276', password: '!97ff5$', name: 'JUJJAVARAPU BHAVANA', email: 'n210276@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210276.jpg' },
    { id: 'N210277', password: '!0fc58!', name: 'VEMIREDDY MAHIJA', email: 'n210277@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210277.jpg' },
    { id: 'N210278', password: '*0ccd4)', name: 'IMANDI PRANEETHA', email: 'n210278@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210278.jpg' },
    { id: 'N210279', password: '!80efc^', name: 'YADAVALLI SAI SRAVAN', email: 'n210279@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210279.jpg' },
    { id: 'N210280', password: '@119db*', name: 'MEDISETTY CHAITANYA', email: 'n210280@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210280.jpg' },
    { id: 'N210281', password: ')aa159^', name: 'NALLAMILLI PARNIKA REDDY', email: 'n210281@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210281.jpg' },
    { id: 'N210282', password: '!df042^', name: 'RAYAVARAPU PREM KUMAR', email: 'n210282@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210282.jpg' },
    { id: 'N210283', password: '!850d3!', name: 'MADDIGUNTA BHAVANA', email: 'n210283@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210283.jpg' },
    { id: 'N210284', password: '*fb5c4*', name: 'DORA HEMALATHA', email: 'n210284@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210284.jpg' },
    { id: 'N210285', password: '(2a039$', name: 'ANNALURU HIMAJA', email: 'n210285@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210285.jpg' },
    { id: 'N210286', password: '!17697^', name: 'GUNDA GOPIKA SAI SAHITHI', email: 'n210286@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210286.jpg' },
    { id: 'N210287', password: '!59e5d$', name: 'NAIDANA VENU CHETAN', email: 'n210287@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210287.jpg' },
    { id: 'N210288', password: '*b48e8@', name: 'ADIREDDI SAILAJA', email: 'n210288@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210288.jpg' },
    { id: 'N210289', password: '^1787b@', name: 'MAJJI NAMITHA', email: 'n210289@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210289.jpg' },
    { id: 'N210290', password: '$648a7$', name: 'KALLA PRADEEP CHANDRA TRIDEV', email: 'n210290@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210290.jpg' },
    { id: 'N210291', password: '$bfa30!', name: 'VALIVETI DIVYASRI', email: 'n210291@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210291.jpg' },
    { id: 'N210292', password: '$4220e$', name: 'VANAMA GRISHMA GAYATRI', email: 'n210292@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210292.jpg' },
    { id: 'N210293', password: '^30c7c*', name: 'BATTULA SRINU', email: 'n210293@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210293.jpg' },
    { id: 'N210294', password: '!6bb89!', name: 'DASARI NAVYASREE', email: 'n210294@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210294.jpg' },
    { id: 'N210295', password: '*4bec8*', name: 'NANDIGAM KANAKESWARA RAO', email: 'n210295@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210295.jpg' },
    { id: 'N210296', password: '$9c57b(', name: 'MENTREDDI BALAVARDHAN', email: 'n210296@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210296.jpg' },
    { id: 'N210297', password: '^304fd$', name: 'KARRI VEERABHADRA SWAMI', email: 'n210297@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210297.jpg' },
    { id: 'N210298', password: '^cc81c!', name: 'TELUGU JAYANTH', email: 'n210298@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210298.jpg' },
    { id: 'N210299', password: '@f2aff^', name: 'SOMISETTY VENKATA BINDU SATHWIKA', email: 'n210299@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210299.jpg' },
    { id: 'N210300', password: '^ebb83*', name: 'CHATARAJUPALLI LAKSHMI JAHNAVI', email: 'n210300@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210300.jpg' },
    { id: 'N210301', password: '(9b9ec^', name: 'BODDU NAGESWARI', email: 'n210301@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210301.jpg' },
    { id: 'N210302', password: '!a2085*', name: 'MUKALLA MALLEESWARI', email: 'n210302@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210302.jpg' },
    { id: 'N210303', password: '$c7490$', name: 'MACHARA SAI MANIKANTA ESWAR', email: 'n210303@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210303.jpg' },
    { id: 'N210304', password: '*3d3dd*', name: 'PATIVADA JYOTHI', email: 'n210304@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210304.jpg' },
    { id: 'N210305', password: '(9c274$', name: 'KAMMA SATHWIK', email: 'n210305@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210305.jpg' },
    { id: 'N210306', password: '!5ed05@', name: 'MUDADLA MEGHANA', email: 'n210306@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210306.jpg' },
    { id: 'N210307', password: '@9f792)', name: 'ENIMIREDDY SRAVYA REDDY', email: 'n210307@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210307.jpg' },
    { id: 'N210308', password: '!0778c$', name: 'PERISWAMULA VEERA RAHUL JITENDARA', email: 'n210308@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210308.jpg' },
    { id: 'N210309', password: '^aa734@', name: 'BATHULA RAVITEJA', email: 'n210309@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210309.jpg' },
    { id: 'N210310', password: ')c7ff0(', name: 'MYLAVARAPU PAVITHRA', email: 'n210310@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210310.jpg' },
    { id: 'N210311', password: '!57b05^', name: 'MAVURI LAHARI', email: 'n210311@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210311.jpg' },
    { id: 'N210312', password: '^4a70c(', name: 'YALAMALA MOULI', email: 'n210312@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210312.jpg' },
    { id: 'N210313', password: '!5a683(', name: 'POTULA RUPA SRI', email: 'n210313@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210313.jpg' },
    { id: 'N210314', password: '@06bc4^', name: 'PARIMI VENKATA NAGESWARA RAO', email: 'n210314@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210314.jpg' },
    { id: 'N210315', password: ')2eb5d(', name: 'SANDAKA RATNA TEJASRI', email: 'n210315@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210315.jpg' },
    { id: 'N210316', password: '(51762^', name: 'SHAIK RABBANI', email: 'n210316@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210316.jpg' },
    { id: 'N210317', password: ')f4208*', name: 'POTLURI JAYADEEP', email: 'n210317@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210317.jpg' },
    { id: 'N210318', password: '^86151!', name: 'KUNALA SAI NIHAR', email: 'n210318@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210318.jpg' },
    { id: 'N210319', password: '$07711@', name: 'DANDU LOKESH', email: 'n210319@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210319.jpg' },
    { id: 'N210320', password: '$e6e3f!', name: 'SHAIK ABDUL JAHEER', email: 'n210320@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210320.jpg' },
    { id: 'N210321', password: '*8fc0c$', name: 'YENNE MADHU SRI', email: 'n210321@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210321.jpg' },
    { id: 'N210322', password: '*3aa4d)', name: 'KARRI JAYADHAR', email: 'n210322@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210322.jpg' },
    { id: 'N210323', password: ')c40ed*', name: 'PALUKURTHI BINDU SREE', email: 'n210323@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210323.jpg' },
    { id: 'N210324', password: '^84d30*', name: 'CHINTADA PADMASRI', email: 'n210324@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210324.jpg' },
    { id: 'N210325', password: '@8ec35$', name: 'NUKALA VINAY', email: 'n210325@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210325.jpg' },
    { id: 'N210326', password: '^f2ef7)', name: 'KAPA DURGA RAMA KRISHNA', email: 'n210326@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210326.jpg' },
    { id: 'N210327', password: '!bc923)', name: 'BHOGYAM RAJYALAKSHMI', email: 'n210327@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210327.jpg' },
    { id: 'N210328', password: '(042f5!', name: 'NAIDU HARIKA', email: 'n210328@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210328.jpg' },
    { id: 'N210329', password: '*89a29$', name: 'AMARA VENKATA SAI SUMA DEEPIKA', email: 'n210329@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210329.jpg' },
    { id: 'N210330', password: '^6c3a1@', name: 'MANCHI JYOTHI SRINIVAS', email: 'n210330@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210330.jpg' },
    { id: 'N210331', password: ')e75ae!', name: 'KUNA YASHASWINI', email: 'n210331@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210331.jpg' },
    { id: 'N210332', password: '(ac840*', name: 'DAGGUPATI TEJASWINI', email: 'n210332@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210332.jpg' },
    { id: 'N210333', password: '@aa044*', name: 'VEMURI VENNELA SIRI', email: 'n210333@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210333.jpg' },
    { id: 'N210334', password: '!4b5e8@', name: 'REPUDI ARISTOTLE', email: 'n210334@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210334.jpg' },
    { id: 'N210335', password: '$f2f82!', name: 'DASARI VENKATASIRISHA', email: 'n210335@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210335.jpg' },
    { id: 'N210336', password: '@a7627(', name: 'KORUPOLU CHARISHMA', email: 'n210336@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210336.jpg' },
    { id: 'N210337', password: '*2e2d9^', name: 'YENUGANTI HEMANTH KUMAR', email: 'n210337@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210337.jpg' },
    { id: 'N210338', password: '!e7366@', name: 'SUNKARA SRI VARSHITA', email: 'n210338@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210338.jpg' },
    { id: 'N210339', password: '^780f3(', name: 'PALLI AISHWARYA', email: 'n210339@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210339.jpg' },
    { id: 'N210340', password: '^33f14^', name: 'TADISETTI SOWMYASRI', email: 'n210340@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210340.jpg' },
    { id: 'N210342', password: '*732f7*', name: 'BALIVADA BALA SRI', email: 'n210342@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210342.jpg' },
    { id: 'N210343', password: '$95a96$', name: 'POTHURAJU MANI TEJA', email: 'n210343@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210343.jpg' },
    { id: 'N210344', password: '*df4f2$', name: 'MONDEDDU SAI NIKHIL REDDY', email: 'n210344@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210344.jpg' },
    { id: 'N210345', password: '$5cc5e*', name: 'BOLAGANI JAGADEESH SAI KRISHNA', email: 'n210345@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210345.jpg' },
    { id: 'N210346', password: '@9a7bc^', name: 'CHINTHA SRI SAI VENKATA KISHORE', email: 'n210346@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210346.jpg' },
    { id: 'N210347', password: '@cd564(', name: 'KAISARLA LAKSHMANA RAO', email: 'n210347@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210347.jpg' },
    { id: 'N210348', password: '*ec5ad^', name: 'VASIRAJU GOVINDA MARUTHI SAGAR', email: 'n210348@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210348.jpg' },
    { id: 'N210349', password: '$47084!', name: 'JAGARAPU DIVYA', email: 'n210349@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210349.jpg' },
    { id: 'N210350', password: '*ee2fa(', name: 'THOMMANDRU VARSHINI', email: 'n210350@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210350.jpg' },
    { id: 'N210351', password: '^0a7f9)', name: 'CHITIKELA DEEPTHI', email: 'n210351@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210351.jpg' },
    { id: 'N210352', password: '^e1513^', name: 'YERRA AKASH', email: 'n210352@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210352.jpg' },
    { id: 'N210353', password: '(8ed99*', name: 'PEMMANI DEVI SAI LAKSHMI PRAVALLIKA', email: 'n210353@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210353.jpg' },
    { id: 'N210354', password: '$731cd!', name: 'GADAMSETTY HEMANTH', email: 'n210354@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210354.jpg' },
    { id: 'N210355', password: '@e52c1^', name: 'CHOPPARAPU ARAVIND KUMAR', email: 'n210355@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210355.jpg' },
    { id: 'N210356', password: ')e113e(', name: 'MEDA SIVA RAMA KRISHNA', email: 'n210356@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210356.jpg' },
    { id: 'N210357', password: '(0e4af(', name: 'MANGAPATI YASHODHA', email: 'n210357@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210357.jpg' },
    { id: 'N210358', password: ')ce5f3^', name: 'PADI MAMATHA', email: 'n210358@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210358.jpg' },
    { id: 'N210359', password: '$40fb6*', name: 'VEMULA PADMAVATHI', email: 'n210359@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210359.jpg' },
    { id: 'N210360', password: ')69603!', name: 'MADHURA NIKHILESWAR KRISHNA MURTHY', email: 'n210360@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210360.jpg' },
    { id: 'N210361', password: '(70037@', name: 'SWAMIREDDY KEERTHANA', email: 'n210361@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210361.jpg' },
    { id: 'N210362', password: '*90822)', name: 'PAILA KOMAL KUMAR', email: 'n210362@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210362.jpg' },
    { id: 'N210363', password: '^44235(', name: 'SHAIK ABDUL NABI', email: 'n210363@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210363.jpg' },
    { id: 'N210364', password: '*b74ff(', name: 'Y NARESH YADAV', email: 'n210364@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210364.jpg' },
    { id: 'N210365', password: '$57ba5!', name: 'BETHAMCHERLA REVANTH SHIVAJI', email: 'n210365@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210365.jpg' },
    { id: 'N210366', password: ')e5c24!', name: 'PULAGAM MEGHANA', email: 'n210366@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210366.jpg' },
    { id: 'N210367', password: '@9bcdf!', name: 'SIMMA RAMPRASAD', email: 'n210367@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210367.jpg' },
    { id: 'N210368', password: '!7875a*', name: 'HANUMANTU YASVANTH', email: 'n210368@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210368.jpg' },
    { id: 'N210369', password: ')9bf99^', name: 'GARLAPATI VENKATA NAGA SAI YASWANTH', email: 'n210369@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210369.jpg' },
    { id: 'N210370', password: '^1fa9c)', name: 'DINDI SRI SIRISHA ANU', email: 'n210370@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210370.jpg' },
    { id: 'N210371', password: '@0cd01^', name: 'PEDHASINGU LEELA KRISHNA', email: 'n210371@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210371.jpg' },
    { id: 'N210372', password: '^4806d(', name: 'PADARTHI HANEESH', email: 'n210372@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210372.jpg' },
    { id: 'N210373', password: '*bfcc5$', name: 'KANTETI HANUMAN PRASAD', email: 'n210373@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210373.jpg' },
    { id: 'N210374', password: '@f23a2*', name: 'KONGALAVEETI YASWANTH REDDY', email: 'n210374@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210374.jpg' },
    { id: 'N210375', password: '@77886*', name: 'CHEEKATI UDAY KIRAN', email: 'n210375@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210375.jpg' },
    { id: 'N210376', password: '@475ae*', name: 'BALABHADRUNI AJITH', email: 'n210376@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210376.jpg' },
    { id: 'N210377', password: '^403bf!', name: 'KUNU MOKSHITH KALYAN', email: 'n210377@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210377.jpg' },
    { id: 'N210378', password: '^f95dc)', name: 'PATHAKAMURI VENKATA SRISHANTH', email: 'n210378@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210378.jpg' },
    { id: 'N210379', password: '^ca932^', name: 'GUDE HEMA VENKATA MARUTHI KUMAR', email: 'n210379@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210379.jpg' },
    { id: 'N210380', password: ')3a30b$', name: 'BANDARU SHYAM SUNDARA VENKATA SATYA SAI', email: 'n210380@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210380.jpg' },
    { id: 'N210381', password: '!580c3)', name: 'MORA VINAYASRI', email: 'n210381@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210381.jpg' },
    { id: 'N210382', password: '@1aa7a*', name: 'PAGIDELA NAVEEN', email: 'n210382@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210382.jpg' },
    { id: 'N210383', password: ')4413f^', name: 'ALLA VENKATA LAKSHMI NIKHILA', email: 'n210383@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210383.jpg' },
    { id: 'N210384', password: '@a99d8@', name: 'DHARMANA LAVANYA', email: 'n210384@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210384.jpg' },
    { id: 'N210385', password: '*26a7f*', name: 'VENNAPUSA SAI GREESHMA', email: 'n210385@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210385.jpg' },
    { id: 'N210386', password: ')92745$', name: 'BADUKONDA MOHANKUMAR', email: 'n210386@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210386.jpg' },
    { id: 'N210387', password: '*433a2)', name: 'SEGU HARSHA VARDHAN', email: 'n210387@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210387.jpg' },
    { id: 'N210388', password: '^8c2e3*', name: 'KOTHA PHANINDRA MANOJ KUMAR', email: 'n210388@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210388.jpg' },
    { id: 'N210389', password: '^53d41@', name: 'PAMARTHI POOJA SRI', email: 'n210389@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210389.jpg' },
    { id: 'N210390', password: '*454a3$', name: 'IKKURTHI UMA MANIKANTA', email: 'n210390@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210390.jpg' },
    { id: 'N210391', password: '^87b38)', name: 'KASIREDDY NAGA MANIKANTA DURGA PRASAD', email: 'n210391@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210391.jpg' },
    { id: 'N210392', password: ')6e3d8*', name: 'TANNEERU LAHARI', email: 'n210392@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210392.jpg' },
    { id: 'N210393', password: '^075b5^', name: 'MARTHALA SARAYUREDDY', email: 'n210393@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210393.jpg' },
    { id: 'N210394', password: '!b7763$', name: 'CHINTHAMREDDY GNAPIKA', email: 'n210394@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210394.jpg' },
    { id: 'N210395', password: '@f1982*', name: 'RUTTALA VARSHITHA', email: 'n210395@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210395.jpg' },
    { id: 'N210396', password: '*e5801(', name: 'DARUVURI MANEESHA', email: 'n210396@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210396.jpg' },
    { id: 'N210397', password: '^19ddc@', name: 'JILLA ABHINAYA LAKSHMI', email: 'n210397@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210397.jpg' },
    { id: 'N210398', password: '@b36d9!', name: 'KATIKE AMAN HEMAD', email: 'n210398@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210398.jpg' },
    { id: 'N210399', password: '(f11e1^', name: 'PEDAPUDI ANUSHKA', email: 'n210399@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210399.jpg' },
    { id: 'N210400', password: '!59c08^', name: 'KALIDINDI MANOJ KUMAR', email: 'n210400@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210400.jpg' },
    { id: 'N210401', password: '!e4669(', name: 'TAMMINAINA PARDHASARADHI', email: 'n210401@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210401.jpg' },
    { id: 'N210402', password: '*5bc0f)', name: 'PODALAKUR PRAVEEN KUMAR', email: 'n210402@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210402.jpg' },
    { id: 'N210403', password: '*7d648*', name: 'MANNEM PRAVALLIKA', email: 'n210403@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210403.jpg' },
    { id: 'N210404', password: '$eee26^', name: 'KOYYANA NARENDRA', email: 'n210404@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210404.jpg' },
    { id: 'N210405', password: '$eb6ed(', name: 'APPAPANTULA VENKATA SAI ESWAR', email: 'n210405@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210405.jpg' },
    { id: 'N210406', password: ')55a16$', name: 'BODA DEVIKA', email: 'n210406@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210406.jpg' },
    { id: 'N210407', password: '*b4286^', name: 'PRATHIVADHIBHAYANKARA KRISHNA ABHI SRI', email: 'n210407@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210407.jpg' },
    { id: 'N210408', password: '^9420c$', name: 'MADALA VENKATA SRI HARSHA', email: 'n210408@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210408.jpg' },
    { id: 'N210409', password: '$f5b07!', name: 'APPANA MADHAV NANDHI VARDHAN', email: 'n210409@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210409.jpg' },
    { id: 'N210410', password: '^5af2f*', name: 'AVVARU RAMYA VARSHINI', email: 'n210410@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210410.jpg' },
    { id: 'N210411', password: '(3a204*', name: 'SHAIK GOWSIYA', email: 'n210411@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210411.jpg' },
    { id: 'N210412', password: '*97369^', name: 'YECHURI AKSHAYA LAKSHMI', email: 'n210412@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210412.jpg' },
    { id: 'N210413', password: '$b4b44(', name: 'SIBBALA SIREESHA', email: 'n210413@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210413.jpg' },
    { id: 'N210414', password: '@4a0c7)', name: 'BALLEDA DEVIKA', email: 'n210414@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210414.jpg' },
    { id: 'N210415', password: '@48537$', name: 'NARRAVULA KARTHIK', email: 'n210415@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210415.jpg' },
    { id: 'N210416', password: '$0358e*', name: 'SHAIK IMRAN BASHA', email: 'n210416@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210416.jpg' },
    { id: 'N210417', password: '@30b78)', name: 'PUTTA SRI HARIKA', email: 'n210417@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210417.jpg' },
    { id: 'N210419', password: '$71d32$', name: 'REDDI MANIKANTA', email: 'n210419@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210419.jpg' },
    { id: 'N210420', password: '*2bbc8^', name: 'CHATTU KUMARA VISHNU', email: 'n210420@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210420.jpg' },
    { id: 'N210422', password: ')17942^', name: 'ARAVIND YEDURI', email: 'n210422@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210422.jpg' },
    { id: 'N210423', password: '!85910^', name: 'VEMULA LEELA MANOHAR', email: 'n210423@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210423.jpg' },
    { id: 'N210424', password: '$b4435$', name: 'BOBBARA NAGA GOWTHAMI', email: 'n210424@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210424.jpg' },
    { id: 'N210425', password: '*534a5!', name: 'CHOKKAKULA HITESH KIRAN', email: 'n210425@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210425.jpg' },
    { id: 'N210426', password: '#N/A', name: 'GUNDA SAI VINAY', email: 'n210426@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210426.jpg' },
    { id: 'N210427', password: ')540e6@', name: 'VIJJAPU RAMESH KUMAR', email: 'n210427@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210427.jpg' },
    { id: 'N210428', password: '!9b47a@', name: 'ANNEBOYINA RAVI TEJA', email: 'n210428@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210428.jpg' },
    { id: 'N210429', password: '^e93b4$', name: 'KURAPATI DEEPAK HARI GOPAL SRINIVAS', email: 'n210429@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210429.jpg' },
    { id: 'N210431', password: '^00db9$', name: 'GADE SATYA MANIKANTA', email: 'n210431@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210431.jpg' },
    { id: 'N210432', password: '!f53d2(', name: 'PATNALA ANIL', email: 'n210432@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210432.jpg' },
    { id: 'N210433', password: '*603f7!', name: 'YELIGINTI MAHENDRA SAI', email: 'n210433@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210433.jpg' },
    { id: 'N210434', password: '@38692^', name: 'KANDREGULA SATYA HARSHITH', email: 'n210434@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210434.jpg' },
    { id: 'N210435', password: '(a9c39(', name: 'GOPALASETTI ADITYA', email: 'n210435@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210435.jpg' },
    { id: 'N210436', password: '!62f74(', name: 'KOTIKALA AKASH', email: 'n210436@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210436.jpg' },
    { id: 'N210437', password: '$e01b1$', name: 'PINNAMANENI PINAKA PAANI PAVAN', email: 'n210437@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210437.jpg' },
    { id: 'N210438', password: '!ab7ff^', name: 'PONNURU VENKATESH', email: 'n210438@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210438.jpg' },
    { id: 'N210439', password: '!868fd^', name: 'KADIYAM DIGGI KASTURI NAGABHUSHAN', email: 'n210439@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210439.jpg' },
    { id: 'N210440', password: '!b4232*', name: 'GORAKALA SARITHA', email: 'n210440@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210440.jpg' },
    { id: 'N210441', password: '@3539a^', name: 'GIDIJALA KUSUMA', email: 'n210441@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210441.jpg' },
    { id: 'N210442', password: '^0e896$', name: 'KOVVURI LAKSHMI', email: 'n210442@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210442.jpg' },
    { id: 'N210443', password: '!38446^', name: 'TALABATTULA PAVAN KUMAR', email: 'n210443@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210443.jpg' },
    { id: 'N210444', password: '(761e1*', name: 'GALI VENKATA SWETHA', email: 'n210444@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210444.jpg' },
    { id: 'N210445', password: '$450b4^', name: 'BANDEPALLI VENKATA SAI KRISHNA', email: 'n210445@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210445.jpg' },
    { id: 'N210446', password: '$a1082!', name: 'ALLAM DURGA BHAVANI', email: 'n210446@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210446.jpg' },
    { id: 'N210447', password: '@7a34b$', name: 'NAGULA MUKESH', email: 'n210447@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210447.jpg' },
    { id: 'N210448', password: '*c77a7$', name: 'ANUMALAPUDI RAMASRI BHAVANI CHANDRIKA', email: 'n210448@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210448.jpg' },
    { id: 'N210449', password: '@f0271$', name: 'SWAMIREDDY PANDU RANGA', email: 'n210449@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210449.jpg' },
    { id: 'N210450', password: '^b97bb!', name: 'GUDE CHANDRA MOULI', email: 'n210450@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210450.jpg' },
    { id: 'N210451', password: '@cc39c^', name: 'PEDADA BHARATH KUMAR', email: 'n210451@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210451.jpg' },
    { id: 'N210452', password: '!30098(', name: 'RAVULA AASHRIITA SAEE', email: 'n210452@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210452.jpg' },
    { id: 'N210453', password: '^74b9f!', name: 'PADILAM ARCHANA', email: 'n210453@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210453.jpg' },
    { id: 'N210454', password: '*eebcc^', name: 'THANDRA DIVYA', email: 'n210454@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210454.jpg' },
    { id: 'N210455', password: '*cfd65@', name: 'NUNNA LAHARI', email: 'n210455@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210455.jpg' },
    { id: 'N210456', password: ')a822f!', name: 'MUDILI TIRUMALESH', email: 'n210456@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210456.jpg' },
    { id: 'N210457', password: '!b5205*', name: 'BOMMALI JANAKI', email: 'n210457@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210457.jpg' },
    { id: 'N210458', password: '*25a56*', name: 'MUDUNOORU ROHIT VARMA', email: 'n210458@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210458.jpg' },
    { id: 'N210459', password: '!95fa1!', name: 'SHAIK NOWSHIN  FARHANA', email: 'n210459@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210459.jpg' },
    { id: 'N210460', password: '(0c7b5*', name: 'SRIKALYANI  REDDI', email: 'n210460@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210460.jpg' },
    { id: 'N210461', password: '*37958^', name: 'GADDAM GUNA VARSHITH REDDY', email: 'n210461@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210461.jpg' },
    { id: 'N210462', password: '$1c25f!', name: 'MUNAGAPATI MANASA', email: 'n210462@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210462.jpg' },
    { id: 'N210463', password: ')3d46f!', name: 'SHAIK MUHAMMAD ANAS', email: 'n210463@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210463.jpg' },
    { id: 'N210464', password: '^4920b$', name: 'YAMALA GNANESHWAR', email: 'n210464@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210464.jpg' },
    { id: 'N210465', password: '*65650^', name: 'GOVADA MAHITHA', email: 'n210465@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210465.jpg' },
    { id: 'N210467', password: ')23b15!', name: 'GORLE HARI DARSHAN RAJ', email: 'n210467@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210467.jpg' },
    { id: 'N210468', password: '(ff68d^', name: 'VINEELA SHAIK', email: 'n210468@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210468.jpg' },
    { id: 'N210469', password: ')dc216!', name: 'CHINNI KOMALI', email: 'n210469@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210469.jpg' },
    { id: 'N210470', password: '$d70e2)', name: 'SIDDABATHUNI TANUSH', email: 'n210470@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210470.jpg' },
    { id: 'N210471', password: '^959b2*', name: 'GAMPA NAVANEETH', email: 'n210471@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210471.jpg' },
    { id: 'N210472', password: '*20a18(', name: 'GANIREDDY NUTHANA VARA PRADEEP', email: 'n210472@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210472.jpg' },
    { id: 'N210473', password: ')e8e89!', name: 'KOPPURAVURI V S G S SUBASH', email: 'n210473@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210473.jpg' },
    { id: 'N210474', password: '^a7d13^', name: 'TALLAM AMRUTH', email: 'n210474@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210474.jpg' },
    { id: 'N210475', password: '!90c6a^', name: 'DASARI MANASA', email: 'n210475@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210475.jpg' },
    { id: 'N210476', password: '(77ad4^', name: 'KILAPARTHI SURYA RAHUL', email: 'n210476@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210476.jpg' },
    { id: 'N210477', password: '!6ff1e*', name: 'RAMAGIRI PRANEETHA', email: 'n210477@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210477.jpg' },
    { id: 'N210478', password: '!7fddc^', name: 'SANAKA NANDINI SRIYA', email: 'n210478@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210478.jpg' },
    { id: 'N210479', password: '(0943e(', name: 'GEDELA LEELA PRASAD', email: 'n210479@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210479.jpg' },
    { id: 'N210480', password: '*3d8b1)', name: 'RAMYA PALLEBOINA', email: 'n210480@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210480.jpg' },
    { id: 'N210481', password: '*57b42^', name: 'SHAIK NYAHIDA PARVEEN', email: 'n210481@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210481.jpg' },
    { id: 'N210482', password: '!be158^', name: 'RAMINENI VARDHAN NAIDU', email: 'n210482@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210482.jpg' },
    { id: 'N210483', password: '!29004)', name: 'BHIMIREDDY MANASA', email: 'n210483@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210483.jpg' },
    { id: 'N210484', password: '(3e4e4(', name: 'SHAIK JAMEEL SHAHID RAZA', email: 'n210484@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210484.jpg' },
    { id: 'N210485', password: '$cff39!', name: 'UYYALA DURGA PRAKASH', email: 'n210485@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210485.jpg' },
    { id: 'N210486', password: '*bb5d0(', name: 'BAMMIDI  EMMANUYELU', email: 'n210486@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210486.jpg' },
    { id: 'N210487', password: '(a9691(', name: 'TEKU POOJA RATNA SAI SRI', email: 'n210487@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210487.jpg' },
    { id: 'N210488', password: '^c8e3b)', name: 'BODDETI DHEERAJ', email: 'n210488@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210488.jpg' },
    { id: 'N210489', password: '@c3849^', name: 'KOTAMSETTI SASHIDHAR', email: 'n210489@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210489.jpg' },
    { id: 'N210490', password: '@67ac6!', name: 'SURLA UMESH CHANDRA', email: 'n210490@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210490.jpg' },
    { id: 'N210491', password: '*34429^', name: 'PADAMATA BHAVYA DEEKSHITHA', email: 'n210491@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210491.jpg' },
    { id: 'N210492', password: '@834d9$', name: 'YANTRAPATI PREETHAM', email: 'n210492@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210492.jpg' },
    { id: 'N210493', password: '@8bd23@', name: 'RAJANA VIJAY SAMUEL', email: 'n210493@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210493.jpg' },
    { id: 'N210494', password: '^8b7ec@', name: 'NEELISETTY VENKATA LASYA PRIYA', email: 'n210494@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210494.jpg' },
    { id: 'N210495', password: '@3b56a^', name: 'SANGATI VENKATA POOJITHA', email: 'n210495@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210495.jpg' },
    { id: 'N210496', password: ')46f56@', name: 'KALVA VENNELA SRI', email: 'n210496@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210496.jpg' },
    { id: 'N210497', password: '@6dd55$', name: 'GUDAVILLI MANIKANTA SWAMY', email: 'n210497@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210497.jpg' },
    { id: 'N210498', password: '(a859d!', name: 'PEDDINA SARANYA', email: 'n210498@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210498.jpg' },
    { id: 'N210499', password: '(8bc5e*', name: 'ARAJA SHALINI', email: 'n210499@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210499.jpg' },
    { id: 'N210500', password: '!f8388(', name: 'VUMMITI NAGA VENKATA ROOP KARTHIK', email: 'n210500@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210500.jpg' },
    { id: 'N210501', password: '!6b207^', name: 'DODDY TANUJA PRIYA VARSHA', email: 'n210501@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210501.jpg' },
    { id: 'N210502', password: '$1b39a(', name: 'HARIDASU AKHILESWARI', email: 'n210502@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210502.jpg' },
    { id: 'N210503', password: '^7e8fc!', name: 'YADLA PUSHPA', email: 'n210503@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210503.jpg' },
    { id: 'N210504', password: ')c48d5*', name: 'GURRAM MUNI KUMAR', email: 'n210504@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210504.jpg' },
    { id: 'N210505', password: '!7e34b^', name: 'VARAKAPADRA USHARANI', email: 'n210505@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210505.jpg' },
    { id: 'N210506', password: '@32c48)', name: 'POTHINA GOWTHAMI', email: 'n210506@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210506.jpg' },
    { id: 'N210507', password: '!6df1a*', name: 'KARRI MAHESH', email: 'n210507@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210507.jpg' },
    { id: 'N210508', password: '$8c06b!', name: 'RAYANI SRI VENKATA NAGA LAKSHMI', email: 'n210508@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210508.jpg' },
    { id: 'N210509', password: '*2d33e^', name: 'POTHALA JAGADEESH', email: 'n210509@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210509.jpg' },
    { id: 'N210510', password: '!68f5b(', name: 'SINGARAPU GAYATRI', email: 'n210510@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210510.jpg' },
    { id: 'N210511', password: '^2a892(', name: 'PEDDAGOPU RUTHU RANI', email: 'n210511@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210511.jpg' },
    { id: 'N210513', password: '*e8686*', name: 'BOLLA SUHITHA', email: 'n210513@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210513.jpg' },
    { id: 'N210514', password: '^5fde7$', name: 'ROWTU NEELIMA', email: 'n210514@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210514.jpg' },
    { id: 'N210516', password: ')01328*', name: 'ARDHAKULA VAMSEE KRISHNA', email: 'n210516@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210516.jpg' },
    { id: 'N210517', password: '@7f4bf(', name: 'BALAGANI VENKATA GOWTHAM', email: 'n210517@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210517.jpg' },
    { id: 'N210518', password: '$ee53d(', name: 'TEKI SATYANARAYANA', email: 'n210518@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210518.jpg' },
    { id: 'N210519', password: '@2b132$', name: 'TATIKONDA MANOJ KUMAR', email: 'n210519@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210519.jpg' },
    { id: 'N210520', password: '^b041d(', name: 'GURIJALA ASWITHA', email: 'n210520@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210520.jpg' },
    { id: 'N210521', password: '!240f4*', name: 'PUNNA THANDAVA KRISHNAMURTHI', email: 'n210521@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210521.jpg' },
    { id: 'N210522', password: '^d7c25*', name: 'MANDRAJU SRI BABU', email: 'n210522@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210522.jpg' },
    { id: 'N210523', password: '$7a46f*', name: 'BUDIDA VARSHITHA', email: 'n210523@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210523.jpg' },
    { id: 'N210524', password: '^1f251@', name: 'VEMULA MOHAMMAD RIZWAN', email: 'n210524@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210524.jpg' },
    { id: 'N210526', password: '^ac5d4!', name: 'KONDURU SOWNDARYA DREAMCENT MURTHY', email: 'n210526@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210526.jpg' },
    { id: 'N210527', password: '^a009b!', name: 'GADDAM KEERTHANA', email: 'n210527@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210527.jpg' },
    { id: 'N210528', password: '*ff08a!', name: 'JERRIPOTHULA LAKSHMI NARAYANA', email: 'n210528@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210528.jpg' },
    { id: 'N210529', password: '$6339d(', name: 'SAMIREDDI NIKHILA', email: 'n210529@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210529.jpg' },
    { id: 'N210530', password: '^4a0de^', name: 'DUDEKULA DASTAGIRI', email: 'n210530@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210530.jpg' },
    { id: 'N210531', password: '^7112e$', name: 'THUMMALA NARENDRA REDDY', email: 'n210531@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210531.jpg' },
    { id: 'N210532', password: '!ff879^', name: 'KOTHAGUNDLA  TIRU VENKATA HARSHITH', email: 'n210532@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210532.jpg' },
    { id: 'N210533', password: '^47dbd^', name: 'VELICHETI NIKHITHA', email: 'n210533@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210533.jpg' },
    { id: 'N210534', password: '*944f7^', name: 'NAGELLA CHANDANA SAI', email: 'n210534@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210534.jpg' },
    { id: 'N210535', password: '!7de40!', name: 'GURUGUBELLI HEMANJALI', email: 'n210535@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210535.jpg' },
    { id: 'N210536', password: '@000f4(', name: 'NAYUDU RISHITHA MALLESWARI', email: 'n210536@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210536.jpg' },
    { id: 'N210537', password: '@ba88b$', name: 'LUGALAPU KISHORE', email: 'n210537@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210537.jpg' },
    { id: 'N210538', password: '^453c3!', name: 'GANDIKOTA PRAVEEN', email: 'n210538@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210538.jpg' },
    { id: 'N210539', password: '@75ab7*', name: 'VANNEMREDDY BHANU SREE', email: 'n210539@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210539.jpg' },
    { id: 'N210540', password: '$88709^', name: 'KASEY ANNIE HARSHINI', email: 'n210540@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210540.jpg' },
    { id: 'N210541', password: ')3ac29*', name: 'ALLAMSETTY OM PRAKASH', email: 'n210541@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210541.jpg' },
    { id: 'N210542', password: '@98ced!', name: 'RUPPA SAI CHAITANYA', email: 'n210542@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210542.jpg' },
    { id: 'N210544', password: '!2150a!', name: 'KUDUMULA VENKATA SAI LAHARI', email: 'n210544@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210544.jpg' },
    { id: 'N210545', password: '(ece99)', name: 'GOGADA YUGENDHAR', email: 'n210545@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210545.jpg' },
    { id: 'N210546', password: '*72583!', name: 'MOLAKA SATHISH KUMAR', email: 'n210546@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210546.jpg' },
    { id: 'N210547', password: '!91b74@', name: 'MADDU SAI GANESH', email: 'n210547@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210547.jpg' },
    { id: 'N210548', password: '*89511$', name: 'ANALA VENKATA HEMA NANDINI', email: 'n210548@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210548.jpg' },
    { id: 'N210549', password: '$7763e(', name: 'BODDU SAGAR', email: 'n210549@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210549.jpg' },
    { id: 'N210550', password: '$773dc^', name: 'GOPAVARAPU SAI BABU', email: 'n210550@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210550.jpg' },
    { id: 'N210551', password: '@d7c48$', name: 'CHANDRAGIRI SANATH KUMAR', email: 'n210551@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210551.jpg' },
    { id: 'N210552', password: '^2edf2^', name: 'POLUPARTHI ATCHUTHA', email: 'n210552@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210552.jpg' },
    { id: 'N210553', password: '$cf0ad^', name: 'VENKAM SETTY LAKSHMI MANIMALA', email: 'n210553@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210553.jpg' },
    { id: 'N210554', password: '(2de9e*', name: 'KAKUMANU PRANAY', email: 'n210554@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210554.jpg' },
    { id: 'N210555', password: '!409b8$', name: 'KANAPARTHI MANOJ KUMAR', email: 'n210555@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210555.jpg' },
    { id: 'N210556', password: '$b7afb$', name: 'NOUBATTULA NAGENDRA', email: 'n210556@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210556.jpg' },
    { id: 'N210557', password: '!0b04d!', name: 'KOVVADA SRI PRASANNA', email: 'n210557@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210557.jpg' },
    { id: 'N210558', password: '!5c167*', name: 'VUTUKURU SAIKUMAR', email: 'n210558@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210558.jpg' },
    { id: 'N210559', password: '@c2c2d)', name: 'TAMMINAINA PRAVEEN', email: 'n210559@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210559.jpg' },
    { id: 'N210560', password: '$ff006$', name: 'ALIGI CHATURVEDH', email: 'n210560@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210560.jpg' },
    { id: 'N210561', password: '*cc0c3*', name: 'BONAMSETTY PAVITHRA', email: 'n210561@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210561.jpg' },
    { id: 'N210562', password: '@8a7d9)', name: 'BELLAPU VENKATA KAVYA HIMABINDU', email: 'n210562@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210562.jpg' },
    { id: 'N210563', password: '$470fb*', name: 'MISHRA  SAKSHI PRIYA', email: 'n210563@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210563.jpg' },
    { id: 'N210564', password: '(53d4c(', name: 'PANAPANA DEEPAK', email: 'n210564@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210564.jpg' },
    { id: 'N210565', password: '(2435c)', name: 'TUMMALA LAKSHMI TEJA SRI', email: 'n210565@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210565.jpg' },
    { id: 'N210566', password: '^e7f9c*', name: 'NADUPURU KIRANMAYI', email: 'n210566@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210566.jpg' },
    { id: 'N210567', password: '^fe6bd^', name: 'DAKI DIVAKAR BABU', email: 'n210567@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210567.jpg' },
    { id: 'N210568', password: '!d2658!', name: 'SHAIK ABID', email: 'n210568@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210568.jpg' },
    { id: 'N210569', password: '!31c6f$', name: 'KOLLI YASWANTH', email: 'n210569@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210569.jpg' },
    { id: 'N210570', password: '$0ec9f$', name: 'ANDALURI JYOTHIRMAI', email: 'n210570@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210570.jpg' },
    { id: 'N210571', password: '!684ee!', name: 'SOMISETTI VARSHA', email: 'n210571@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210571.jpg' },
    { id: 'N210572', password: '!20cb5*', name: 'MAMIDI SAI KIRAN', email: 'n210572@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210572.jpg' },
    { id: 'N210573', password: '!f7227^', name: 'BOJJA SUVARSHA CHAKRAVARTHY', email: 'n210573@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210573.jpg' },
    { id: 'N210574', password: '@62974(', name: 'TUMMALACHERLA BALAVARDHAN', email: 'n210574@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210574.jpg' },
    { id: 'N210575', password: '@01d3b)', name: 'RAYALAPALLI GANESH MANIKANTA', email: 'n210575@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210575.jpg' },
    { id: 'N210576', password: ')339b4!', name: 'GOLLAPUDI VENKATA NAVADEEP', email: 'n210576@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210576.jpg' },
    { id: 'N210577', password: '*7c141!', name: 'VALLEPU SRAVANI', email: 'n210577@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210577.jpg' },
    { id: 'N210578', password: '(f9267!', name: 'VADDI SYAMALA', email: 'n210578@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210578.jpg' },
    { id: 'N210579', password: '^b69ea$', name: 'BOYINA MOHANA SRI', email: 'n210579@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210579.jpg' },
    { id: 'N210580', password: '^4c8f2*', name: 'GURUBELLI CHANDU', email: 'n210580@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210580.jpg' },
    { id: 'N210581', password: '!1e9b9!', name: 'MANDALAPU SRINIVASA', email: 'n210581@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210581.jpg' },
    { id: 'N210582', password: '!ac074!', name: 'KURAPATI JAYA DURGA HARSHITHA', email: 'n210582@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210582.jpg' },
    { id: 'N210583', password: '*69dc3*', name: 'SHAIK AMZAD', email: 'n210583@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210583.jpg' },
    { id: 'N210584', password: '@001f8)', name: 'VELAGALA DURGA LAKSHMI', email: 'n210584@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210584.jpg' },
    { id: 'N210585', password: ')0cc78$', name: 'KUNCHAM SAI GUPTHA', email: 'n210585@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210585.jpg' },
    { id: 'N210586', password: '@39e3b*', name: 'KAGITHA SRIVALLI', email: 'n210586@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210586.jpg' },
    { id: 'N210587', password: '*e9dfa(', name: 'DADI LALITHENDER', email: 'n210587@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210587.jpg' },
    { id: 'N210588', password: '^1081d$', name: 'SARVISETTI VENKATA KUMAR SARVAN', email: 'n210588@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210588.jpg' },
    { id: 'N210589', password: '!6e705$', name: 'PANGULURI SAI KEERTHANA', email: 'n210589@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210589.jpg' },
    { id: 'N210590', password: '^c234a*', name: 'ANNE DIVIJA', email: 'n210590@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210590.jpg' },
    { id: 'N210591', password: '$4dc0e*', name: 'KADEM HARI KRISHNA', email: 'n210591@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210591.jpg' },
    { id: 'N210592', password: '^865e2^', name: 'CHUKKAPALLI NAVYA', email: 'n210592@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210592.jpg' },
    { id: 'N210593', password: ')67bc2@', name: 'GUTTULA PREM SAGAR', email: 'n210593@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210593.jpg' },
    { id: 'N210594', password: '^10b2c$', name: 'INDUKURU TEJESH', email: 'n210594@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210594.jpg' },
    { id: 'N210595', password: '!fea2b!', name: 'GANTEDA VINAY', email: 'n210595@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210595.jpg' },
    { id: 'N210596', password: '@d416a!', name: 'ALLU JAYARAM', email: 'n210596@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210596.jpg' },
    { id: 'N210597', password: ')c0f8b*', name: 'PUTCHA KARTHIK', email: 'n210597@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210597.jpg' },
    { id: 'N210598', password: '*ce0f6$', name: 'CHIMIRALA NAGA SIVA SAI PRASANTH', email: 'n210598@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210598.jpg' },
    { id: 'N210599', password: '*a4a98$', name: 'VAVILAPALLI POOJITHA', email: 'n210599@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210599.jpg' },
    { id: 'N210600', password: '(84a09(', name: 'TEGADA RAKESH KUMAR', email: 'n210600@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210600.jpg' },
    { id: 'N210601', password: '^e7f36(', name: 'KAYALA RUPESH KUMAR', email: 'n210601@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210601.jpg' },
    { id: 'N210602', password: '@49e3d^', name: 'SHAIK MOHAMMAD HAMZA', email: 'n210602@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210602.jpg' },
    { id: 'N210603', password: '@b0c35*', name: 'BENDALAM SRIAKSHITA', email: 'n210603@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210603.jpg' },
    { id: 'N210604', password: '!8870f*', name: 'SAJJA SAI KISHORE KUMAR', email: 'n210604@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210604.jpg' },
    { id: 'N210605', password: '!27418^', name: 'CHUCHUKONDA AKHILA', email: 'n210605@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210605.jpg' },
    { id: 'N210606', password: '$bd5d1)', name: 'POLI SAI SREYASH REDDY', email: 'n210606@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210606.jpg' },
    { id: 'N210607', password: '(514bc(', name: 'NAGELLA RAKSHITHA', email: 'n210607@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210607.jpg' },
    { id: 'N210608', password: '@2b845!', name: 'JONNALAGADDA RAM SAI SUBRAMANYAM', email: 'n210608@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210608.jpg' },
    { id: 'N210609', password: '$43918(', name: 'MACHARLA HEMESWAR', email: 'n210609@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210609.jpg' },
    { id: 'N210610', password: '$c3206!', name: 'TEMPALLI HEMANTH', email: 'n210610@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210610.jpg' },
    { id: 'N210611', password: '*2bcb9^', name: 'POLISETTI NARESH', email: 'n210611@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210611.jpg' },
    { id: 'N210612', password: '$15f5e$', name: 'DONAPATI SRAVANTHI', email: 'n210612@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210612.jpg' },
    { id: 'N210613', password: '!8ba0d*', name: 'PALLI MEGHANA', email: 'n210613@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210613.jpg' },
    { id: 'N210614', password: '^5f5df(', name: 'KARRI VINAY', email: 'n210614@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210614.jpg' },
    { id: 'N210615', password: '*3c7da!', name: 'YELURI NAKSHATRA', email: 'n210615@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210615.jpg' },
    { id: 'N210616', password: '*a6166*', name: 'KARAMPUDI RENUKA', email: 'n210616@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210616.jpg' },
    { id: 'N210617', password: '@924fe(', name: 'DHAVALA SANJAY KUMAR', email: 'n210617@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210617.jpg' },
    { id: 'N210618', password: '*235ef!', name: 'PANDIRI BHANU SRI VENKATA VAMSI', email: 'n210618@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210618.jpg' },
    { id: 'N210619', password: '!3364a*', name: 'CHALLA POOJITHA', email: 'n210619@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210619.jpg' },
    { id: 'N210620', password: '*bb0c8$', name: 'PODILAPU SRAVANI', email: 'n210620@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210620.jpg' },
    { id: 'N210621', password: '!8e607^', name: 'ALALA CHUSMALATHA', email: 'n210621@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210621.jpg' },
    { id: 'N210622', password: '*3cda1@', name: 'CHALLA ASHOK', email: 'n210622@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210622.jpg' },
    { id: 'N210623', password: '!e8cc5)', name: 'SATTI RENU PRASANNA', email: 'n210623@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210623.jpg' },
    { id: 'N210624', password: '^3138d!', name: 'KOLA KANAKAMAHALAKSHMI', email: 'n210624@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210624.jpg' },
    { id: 'N210625', password: ')5377c!', name: 'KOTHAPALLI ANANTHALAKSHMI', email: 'n210625@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210625.jpg' },
    { id: 'N210626', password: '!f55aa^', name: 'POLI  SOMANADRY', email: 'n210626@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210626.jpg' },
    { id: 'N210627', password: '@43d90(', name: 'KONDRU RAMYA', email: 'n210627@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210627.jpg' },
    { id: 'N210628', password: '!553db*', name: 'BOGA CHENCHU VINAY', email: 'n210628@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210628.jpg' },
    { id: 'N210629', password: '(ddc4f!', name: 'GANGADI SARATH', email: 'n210629@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210629.jpg' },
    { id: 'N210630', password: '!70c4f@', name: 'BELLANA VENKATA CHAITANYA', email: 'n210630@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210630.jpg' },
    { id: 'N210631', password: '^20c0b*', name: 'BONAM NARASIMHA', email: 'n210631@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210631.jpg' },
    { id: 'N210632', password: '^beebe!', name: 'KARRI ABHIRAM', email: 'n210632@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210632.jpg' },
    { id: 'N210633', password: '^6db20!', name: 'VALUROUTU SANTOSH KUMAR', email: 'n210633@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210633.jpg' },
    { id: 'N210634', password: '!564c1*', name: 'KOLLATI LOKESH', email: 'n210634@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210634.jpg' },
    { id: 'N210635', password: '@343e7^', name: 'MARDAPI CHARITHA SRI', email: 'n210635@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210635.jpg' },
    { id: 'N210636', password: '!23e6c(', name: 'AKULA VENKATA GANESH', email: 'n210636@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210636.jpg' },
    { id: 'N210637', password: '@68674*', name: 'ALABONU NAGENDRA SIVA PRASAD', email: 'n210637@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210637.jpg' },
    { id: 'N210638', password: '!909cf$', name: 'PUSULURI ESWAR', email: 'n210638@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210638.jpg' },
    { id: 'N210639', password: '(684f5*', name: 'ILLA BHUVANA SRI', email: 'n210639@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210639.jpg' },
    { id: 'N210640', password: '$4679f$', name: 'CHAKKERA VEERA VENKATA SRINIVASA REDDY', email: 'n210640@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210640.jpg' },
    { id: 'N210641', password: '^6565f*', name: 'SANAPALA SRIDHAR YASWANTH', email: 'n210641@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210641.jpg' },
    { id: 'N210642', password: '*7c8e6(', name: 'YENUMULA VINOD BABU', email: 'n210642@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210642.jpg' },
    { id: 'N210643', password: '*e0718!', name: 'DODDI LAKSHMI SOWMYA', email: 'n210643@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210643.jpg' },
    { id: 'N210644', password: '@0004b!', name: 'ILLAPU VASANTHA LAKSHMI', email: 'n210644@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210644.jpg' },
    { id: 'N210645', password: ')f3614$', name: 'DEVIREDDY  VENKATA PAVAN SATHWIK', email: 'n210645@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210645.jpg' },
    { id: 'N210646', password: '^5cf4d*', name: 'NEELURI JASWANTH', email: 'n210646@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210646.jpg' },
    { id: 'N210647', password: '^71453^', name: 'YASWANTH GANGINENI', email: 'n210647@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210647.jpg' },
    { id: 'N210648', password: '!68723(', name: 'KURAPATI VENKATA SUBHASH', email: 'n210648@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210648.jpg' },
    { id: 'N210649', password: '!20c85@', name: 'GARINAPUDI SAI BALAJI', email: 'n210649@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210649.jpg' },
    { id: 'N210650', password: ')53cdf(', name: 'T PRANAV CHANDRA', email: 'n210650@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210650.jpg' },
    { id: 'N210651', password: '@d3e25$', name: 'PAIDI KATYAYANI', email: 'n210651@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210651.jpg' },
    { id: 'N210652', password: '$ac748!', name: 'KINTHALI CHANDRIKA', email: 'n210652@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210652.jpg' },
    { id: 'N210653', password: '*04c20!', name: 'GADIPILLI RAM PRASAD', email: 'n210653@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210653.jpg' },
    { id: 'N210654', password: '!d284d)', name: 'ALLU HIMA BINDU', email: 'n210654@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210654.jpg' },
    { id: 'N210655', password: '$e35ea$', name: 'MEESALA BHUVANESWARI', email: 'n210655@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210655.jpg' },
    { id: 'N210656', password: '@e8f35^', name: 'CHALLAPALLI SARAYU', email: 'n210656@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210656.jpg' },
    { id: 'N210657', password: '$df975(', name: 'DANDA VENKATA SHEKAR REDDY', email: 'n210657@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210657.jpg' },
    { id: 'N210658', password: '*3dc16!', name: 'SRIRAM PAVAN KUMAR SIKAKOLANU', email: 'n210658@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210658.jpg' },
    { id: 'N210659', password: '^377f9^', name: 'ARAVA MEGHA SYAM', email: 'n210659@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210659.jpg' },
    { id: 'N210660', password: '*a893b@', name: 'SHAIK NAZMA AFREEN', email: 'n210660@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210660.jpg' },
    { id: 'N210661', password: '*9aeef*', name: 'VELIDI VISHAL', email: 'n210661@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210661.jpg' },
    { id: 'N210662', password: '@9ca31$', name: 'CHUKKA BALAJI', email: 'n210662@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210662.jpg' },
    { id: 'N210663', password: '(aa954(', name: 'MENDA HARIBABU', email: 'n210663@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210663.jpg' },
    { id: 'N210664', password: '!e2d97@', name: 'PEDAGADI SAI SURESH', email: 'n210664@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210664.jpg' },
    { id: 'N210665', password: '(555f1$', name: 'CHERRI UDAY KIRAN', email: 'n210665@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210665.jpg' },
    { id: 'N210666', password: '!f1942(', name: 'PEDDIREDDY MADHUMATHI', email: 'n210666@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210666.jpg' },
    { id: 'N210667', password: '$aeb90$', name: 'KOLLI MANOHAR', email: 'n210667@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210667.jpg' },
    { id: 'N210668', password: '@50f0b$', name: 'BATHINI MANJU SAI', email: 'n210668@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210668.jpg' },
    { id: 'N210669', password: '*13c81)', name: 'EAGALA MAITHREYI', email: 'n210669@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210669.jpg' },
    { id: 'N210670', password: '*a9218)', name: 'MADINIDI SRAVANA SANDHYA', email: 'n210670@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210670.jpg' },
    { id: 'N210671', password: '$0cf91^', name: 'CHALLA SIREESHA', email: 'n210671@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210671.jpg' },
    { id: 'N210672', password: '@2a8a3!', name: 'THOTA PRANAV KOTI SUDHEER', email: 'n210672@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210672.jpg' },
    { id: 'N210673', password: '!07a77(', name: 'SURU YUVARAJ', email: 'n210673@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210673.jpg' },
    { id: 'N210674', password: '^9b1fc(', name: 'G PRATAP KUMAR', email: 'n210674@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210674.jpg' },
    { id: 'N210675', password: '*91955(', name: 'MANEM RAVI SANKAR', email: 'n210675@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210675.jpg' },
    { id: 'N210676', password: '$7eb7a$', name: 'BATTULA JOSU VISHWANADH', email: 'n210676@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210676.jpg' },
    { id: 'N210677', password: '$fe2de(', name: 'RONGALA ROOPCHAND', email: 'n210677@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210677.jpg' },
    { id: 'N210678', password: '$e8ed8!', name: 'SEERAPU MADHULATHA', email: 'n210678@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210678.jpg' },
    { id: 'N210679', password: '(8cc6b^', name: 'CHAMALLA PRIYAMVADHA', email: 'n210679@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210679.jpg' },
    { id: 'N210680', password: '^21448^', name: 'REDDIPALLI SRAVANI', email: 'n210680@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210680.jpg' },
    { id: 'N210681', password: '(c1f63$', name: 'POOJITHA   GEDDA', email: 'n210681@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210681.jpg' },
    { id: 'N210682', password: '(83e92!', name: 'PADALA SHANMUKHA SAI HARSHA', email: 'n210682@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210682.jpg' },
    { id: 'N210683', password: '^47582$', name: 'YAMMAJI UDAY VENKATA PAVAN', email: 'n210683@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210683.jpg' },
    { id: 'N210684', password: '$f690e@', name: 'SURA CHAITANYA', email: 'n210684@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210684.jpg' },
    { id: 'N210685', password: '*8d662$', name: 'NERELLA JAGADEESH', email: 'n210685@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210685.jpg' },
    { id: 'N210686', password: '*52498$', name: 'PRODDUTURU JANAKI RAM', email: 'n210686@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210686.jpg' },
    { id: 'N210687', password: '@851d4^', name: 'POTHALA RAGHU', email: 'n210687@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210687.jpg' },
    { id: 'N210688', password: '@e78e2)', name: 'KOMMOJU MANASA', email: 'n210688@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210688.jpg' },
    { id: 'N210689', password: '(d9614!', name: 'SHAIK SHILAR', email: 'n210689@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210689.jpg' },
    { id: 'N210690', password: '!8a5ff^', name: 'VANAMALA PAVANI', email: 'n210690@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210690.jpg' },
    { id: 'N210691', password: '^15a66)', name: 'MATTA YUGANDHARARAO', email: 'n210691@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210691.jpg' },
    { id: 'N210692', password: '!ea6b6(', name: 'PATHIVADA HEMANTH KUMAR', email: 'n210692@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210692.jpg' },
    { id: 'N210693', password: '$b91c3(', name: 'GANJI ADITYA', email: 'n210693@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210693.jpg' },
    { id: 'N210694', password: '*41a28(', name: 'PANCHUMARTHI NAGA SRAVYASRI', email: 'n210694@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210694.jpg' },
    { id: 'N210695', password: '$4aacb*', name: 'KATAM DIVYA', email: 'n210695@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210695.jpg' },
    { id: 'N210696', password: '@08838(', name: 'KATARU ANJALI', email: 'n210696@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210696.jpg' },
    { id: 'N210697', password: '$e1f87^', name: 'PILLI SHAHARSHA RAGHUVARDHAN', email: 'n210697@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210697.jpg' },
    { id: 'N210698', password: '*e6015*', name: 'RAMACHANDRULA THARANI SRI LALITHA', email: 'n210698@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210698.jpg' },
    { id: 'N210699', password: '^de9bf^', name: 'PULAPAKURA SRI MANIKANTA', email: 'n210699@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210699.jpg' },
    { id: 'N210700', password: '*eb7ba$', name: 'BALINENI VISHNUVARDHAN', email: 'n210700@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210700.jpg' },
    { id: 'N210701', password: '$3a8d9$', name: 'NEELAM KETHAM BABU', email: 'n210701@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210701.jpg' },
    { id: 'N210702', password: '(606a7$', name: 'BANDI ANUSHKA', email: 'n210702@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210702.jpg' },
    { id: 'N210703', password: '!4250a$', name: 'ALTHI JASWANTH', email: 'n210703@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210703.jpg' },
    { id: 'N210704', password: '@512b8$', name: 'KADARU JAGAN', email: 'n210704@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210704.jpg' },
    { id: 'N210705', password: '(bb4a8)', name: 'CHINTHALA VENKATA SUKUMAR REDDY', email: 'n210705@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210705.jpg' },
    { id: 'N210706', password: '@33c25@', name: 'MOYYI SANTHOSHI', email: 'n210706@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210706.jpg' },
    { id: 'N210707', password: '^21ca9!', name: 'BHEEMANA MEGHANA', email: 'n210707@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210707.jpg' },
    { id: 'N210708', password: '!4efd3*', name: 'MATTAPARTHI SWARNA SRI', email: 'n210708@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210708.jpg' },
    { id: 'N210709', password: '^b900e!', name: 'SIGALAPALLI PRAMEELA', email: 'n210709@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210709.jpg' },
    { id: 'N210710', password: '!507cf$', name: 'TEELA VIJAYA LAKSHMI', email: 'n210710@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210710.jpg' },
    { id: 'N210711', password: '!9b33d(', name: 'CHAPPIDI JEEVANA SANDHYA', email: 'n210711@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210711.jpg' },
    { id: 'N210712', password: '(ea03a!', name: 'VALLEPU DIVYA', email: 'n210712@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210712.jpg' },
    { id: 'N210713', password: ')715a3*', name: 'DUMMANI KESAVA SREE SHAMBHAVI', email: 'n210713@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210713.jpg' },
    { id: 'N210714', password: '*7b643!', name: 'BASAVA KIRAN LAKSHMI VENKATA SWAMINAIDU', email: 'n210714@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210714.jpg' },
    { id: 'N210715', password: '!1314e!', name: 'BANDI SATHVIC', email: 'n210715@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210715.jpg' },
    { id: 'N210716', password: '^5cb29^', name: 'AKURATHI  VENKATA LAKSHMI DURGA PAVANI', email: 'n210716@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210716.jpg' },
    { id: 'N210717', password: '^e46ca)', name: 'DORALA CHAITANYA DURGA PRASAD', email: 'n210717@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210717.jpg' },
    { id: 'N210718', password: '$bba6b!', name: 'SHAIK VAHIDHA', email: 'n210718@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210718.jpg' },
    { id: 'N210719', password: '$8f0db!', name: 'JONNA LALITHA DEVI', email: 'n210719@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210719.jpg' },
    { id: 'N210720', password: '@1db83@', name: 'BITTU TIRUMALA', email: 'n210720@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210720.jpg' },
    { id: 'N210721', password: '*6d0c8@', name: 'CHILAKA KUSUMA', email: 'n210721@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210721.jpg' },
    { id: 'N210722', password: '^23d1c$', name: 'DAMA KAVYA', email: 'n210722@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210722.jpg' },
    { id: 'N210723', password: '^cee0f@', name: 'AVUTAPALLI NANDA KISHORE', email: 'n210723@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210723.jpg' },
    { id: 'N210724', password: '@499a7!', name: 'GUTHI DEVEESWARA SAI PRADEEP', email: 'n210724@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210724.jpg' },
    { id: 'N210725', password: '@cc952$', name: 'BALLEDA SRIYA', email: 'n210725@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210725.jpg' },
    { id: 'N210726', password: '$3a84f*', name: 'KULLA SRI SAI SIVA DURGA RAMA ASHWANTH', email: 'n210726@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210726.jpg' },
    { id: 'N210727', password: '(6047d^', name: 'MUPPIDI PADMAVATHI', email: 'n210727@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210727.jpg' },
    { id: 'N210728', password: ')8293c*', name: 'CHUNDURU JYOSHNA', email: 'n210728@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210728.jpg' },
    { id: 'N210729', password: ')288f4^', name: 'VANGARA YASWANTH SAI', email: 'n210729@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210729.jpg' },
    { id: 'N210730', password: '@0a2ea$', name: 'RAVURI MEGHANA', email: 'n210730@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210730.jpg' },
    { id: 'N210731', password: '*8e41d$', name: 'GOLI NAVYA SREE', email: 'n210731@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210731.jpg' },
    { id: 'N210732', password: '*5761d!', name: 'VEMULA LAKSHMI SAI MIDHUNA', email: 'n210732@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210732.jpg' },
    { id: 'N210733', password: '$86644(', name: 'BUSAM KOTA NAGA JAHNAVI', email: 'n210733@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210733.jpg' },
    { id: 'N210734', password: '!9c15d)', name: 'PATI AKSHAYA SAI', email: 'n210734@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210734.jpg' },
    { id: 'N210735', password: '@24355)', name: 'MATSA SAI LAKSHMI', email: 'n210735@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210735.jpg' },
    { id: 'N210736', password: '$96384(', name: 'SALADI GANGA BHAVANI', email: 'n210736@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210736.jpg' },
    { id: 'N210737', password: '!1af46*', name: 'NAGAVOLU VENKATA SAI SWAROOP', email: 'n210737@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210737.jpg' },
    { id: 'N210738', password: '*32653@', name: 'MUTHINENI GUNASRI NAGA SAI SYAMALA', email: 'n210738@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210738.jpg' },
    { id: 'N210739', password: '!8c47a^', name: 'BASAVA PARAMESWARI', email: 'n210739@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210739.jpg' },
    { id: 'N210740', password: '$9f901(', name: 'TOLATI SIVA PARVATHI', email: 'n210740@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210740.jpg' },
    { id: 'N210741', password: '^cdc81!', name: 'PATTAN ZAHEER KHAN', email: 'n210741@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210741.jpg' },
    { id: 'N210742', password: '@cce44!', name: 'DODDIPATLA MAHESWARI', email: 'n210742@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210742.jpg' },
    { id: 'N210743', password: '^d28f5^', name: 'NASAKA HEMA CHANDRIKA', email: 'n210743@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210743.jpg' },
    { id: 'N210744', password: '$4f476*', name: 'SRINIVASAN ABISHEK', email: 'n210744@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210744.jpg' },
    { id: 'N210745', password: '!1c88a)', name: 'PAMARTHI KARTHIKEYA', email: 'n210745@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210745.jpg' },
    { id: 'N210746', password: '@bb612*', name: 'KURNOOL NIKHIL', email: 'n210746@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210746.jpg' },
    { id: 'N210747', password: '@4388a(', name: 'TAMMINEDI NICHALA ANURUD REDDY', email: 'n210747@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210747.jpg' },
    { id: 'N210748', password: ')9d10b)', name: 'NAIDU KARTHEEK', email: 'n210748@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210748.jpg' },
    { id: 'N210749', password: '*472f4)', name: 'SHAIK ABID PASHA', email: 'n210749@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210749.jpg' },
    { id: 'N210750', password: '!4c16d)', name: 'MEKA SURYA TEJ', email: 'n210750@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210750.jpg' },
    { id: 'N210751', password: ')20d77@', name: 'MACHA SONIA', email: 'n210751@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210751.jpg' },
    { id: 'N210752', password: '*58a42!', name: 'MANNEM VYSHNAVI', email: 'n210752@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210752.jpg' },
    { id: 'N210753', password: '$f66fd(', name: 'GUNDA VENKATA HARI KOWSHIK', email: 'n210753@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210753.jpg' },
    { id: 'N210754', password: '^ab6ca*', name: 'REDDI HARI SIVA SATYA PRAKASH', email: 'n210754@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210754.jpg' },
    { id: 'N210755', password: ')0636c(', name: 'CHINTHAKUNTLA YERUKALA NIRANJAN PAVANKUMAR', email: 'n210755@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210755.jpg' },
    { id: 'N210756', password: '*4cc5e)', name: 'GANGADHARA MOHANARAO', email: 'n210756@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210756.jpg' },
    { id: 'N210757', password: '$9c093$', name: 'HARINDRA BYRISETTI', email: 'n210757@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210757.jpg' },
    { id: 'N210758', password: '*6c2d7$', name: 'MANNEM BHEEMA SIDDARTHA', email: 'n210758@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210758.jpg' },
    { id: 'N210759', password: '$97a1a(', name: 'CHAPPIDI VYSHNAVI', email: 'n210759@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210759.jpg' },
    { id: 'N210760', password: '*ed714$', name: 'BANDA LEELA PARVATHI', email: 'n210760@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210760.jpg' },
    { id: 'N210761', password: '!c1a7b*', name: 'DHILLAN VENKATA BHAVANI KARTHIKAEYAN', email: 'n210761@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210761.jpg' },
    { id: 'N210762', password: '^31513!', name: 'THRIPURANJI CHANDANA', email: 'n210762@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210762.jpg' },
    { id: 'N210763', password: '^f92e0)', name: 'GONUGUNTLA VENKATA VAMSI HARIKRISHNA', email: 'n210763@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210763.jpg' },
    { id: 'N210764', password: '*5d8cc(', name: 'MOLABANTI VARSHITHA', email: 'n210764@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210764.jpg' },
    { id: 'N210765', password: '$2ee4b@', name: 'KONDETI MEGHANASRI', email: 'n210765@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210765.jpg' },
    { id: 'N210766', password: '!053cc$', name: 'MEKA NISSI CHRISOLITE', email: 'n210766@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210766.jpg' },
    { id: 'N210767', password: '!e7ab4(', name: 'RAVURI ARAVIND', email: 'n210767@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210767.jpg' },
    { id: 'N210768', password: '!bbd8b$', name: 'TALAGADADEEVI PUJITHA', email: 'n210768@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210768.jpg' },
    { id: 'N210769', password: '*ba561)', name: 'ANNALADASU SHAINY', email: 'n210769@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210769.jpg' },
    { id: 'N210770', password: '(f7fcd$', name: 'VEERA MOHAN BALANAGENDRA', email: 'n210770@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210770.jpg' },
    { id: 'N210771', password: '!6a428@', name: 'VELAVALI SHAIK ANWAAR HUSSAIN', email: 'n210771@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210771.jpg' },
    { id: 'N210772', password: '$a0d79!', name: 'KUNDURTHI SARASWATHI', email: 'n210772@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210772.jpg' },
    { id: 'N210773', password: '@143dc*', name: 'ARJI VENKAT  BHARGAV SAI', email: 'n210773@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210773.jpg' },
    { id: 'N210774', password: '$8f313*', name: 'ATTILI CHARISHMA', email: 'n210774@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210774.jpg' },
    { id: 'N210775', password: '$39553!', name: 'GURRAM MADHU VARSHINI', email: 'n210775@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210775.jpg' },
    { id: 'N210776', password: '^76d00*', name: 'KARATAPU NAVADEEP', email: 'n210776@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210776.jpg' },
    { id: 'N210777', password: '!3113f)', name: 'RAVUTLA VENKATA SAI SANDEEP SASTRY', email: 'n210777@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210777.jpg' },
    { id: 'N210778', password: '@7d131!', name: 'DONGA GANESH', email: 'n210778@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210778.jpg' },
    { id: 'N210779', password: '!110f1(', name: 'VETSA PHANEENDRA', email: 'n210779@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210779.jpg' },
    { id: 'N210780', password: '*67454*', name: 'MODALAVALASA HARSHITHA', email: 'n210780@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210780.jpg' },
    { id: 'N210781', password: '*3091a(', name: 'BUSAM LIKHITH VINAY KUMAR', email: 'n210781@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210781.jpg' },
    { id: 'N210782', password: '!3d06f)', name: 'AKAASAPU TILAK DEVI PRASANTH', email: 'n210782@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210782.jpg' },
    { id: 'N210783', password: '^95f11^', name: 'VANUM AKHILA', email: 'n210783@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210783.jpg' },
    { id: 'N210784', password: '@7f3b1!', name: 'ANANTHOJU ANANDAVARSHINI', email: 'n210784@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210784.jpg' },
    { id: 'N210785', password: '*e6569!', name: 'MURAPAKA BHARATH KUMAR', email: 'n210785@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210785.jpg' },
    { id: 'N210786', password: '!5badd*', name: 'PONNAGANTI TEJA', email: 'n210786@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210786.jpg' },
    { id: 'N210787', password: ')a46b0*', name: 'KOSURU TEJASWINI', email: 'n210787@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210787.jpg' },
    { id: 'N210788', password: '@a0c60!', name: 'PENDYALA BAPA RAO', email: 'n210788@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210788.jpg' },
    { id: 'N210789', password: '@14b5f*', name: 'BACHALA RAMA HIMASREE', email: 'n210789@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210789.jpg' },
    { id: 'N210790', password: '!53b32(', name: 'PANUGALLA PRUDHVI', email: 'n210790@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210790.jpg' },
    { id: 'N210791', password: '$3fcc4)', name: 'ARJI HASWANTH', email: 'n210791@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210791.jpg' },
    { id: 'N210792', password: '@9f9e3@', name: 'K CHARAN', email: 'n210792@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210792.jpg' },
    { id: 'N210793', password: '!a1a39!', name: 'MOHAMMAD SHAFIYA', email: 'n210793@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210793.jpg' },
    { id: 'N210794', password: '^32892@', name: 'UMMADISINGU DOLLY NAGA MYTHRI', email: 'n210794@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210794.jpg' },
    { id: 'N210795', password: '$ba661^', name: 'BODA SIDDHARDHA', email: 'n210795@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210795.jpg' },
    { id: 'N210796', password: '(8aeab(', name: 'PENUMALA KISHORE', email: 'n210796@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210796.jpg' },
    { id: 'N210797', password: '(38c68)', name: 'DHARANEESWAR REDDY AVULA', email: 'n210797@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210797.jpg' },
    { id: 'N210798', password: '^ace63)', name: 'MANCHALA VENKATA DHARANI', email: 'n210798@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210798.jpg' },
    { id: 'N210799', password: '$d2507$', name: 'SHAIK SHAHEEN', email: 'n210799@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210799.jpg' },
    { id: 'N210800', password: '$e315b)', name: 'YERUKALA RAHUL', email: 'n210800@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210800.jpg' },
    { id: 'N210801', password: '*79e5a^', name: 'UNDRASAPU NIHARIKA', email: 'n210801@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210801.jpg' },
    { id: 'N210802', password: '@c8166!', name: 'PANDURI NAGALAXMI', email: 'n210802@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210802.jpg' },
    { id: 'N210803', password: '*99661@', name: 'MANURU KARTHIK', email: 'n210803@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210803.jpg' },
    { id: 'N210804', password: ')90a78$', name: 'PITTI ASWARTH NARAYANA', email: 'n210804@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210804.jpg' },
    { id: 'N210805', password: '*0788a(', name: 'SEELAM KRUPAKEJIYA', email: 'n210805@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210805.jpg' },
    { id: 'N210806', password: '(ad7b0(', name: 'NANNAM SASI', email: 'n210806@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210806.jpg' },
    { id: 'N210807', password: '^26edd(', name: 'KANCHIPOGU KELVYN G MELCHEIZEDEK', email: 'n210807@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210807.jpg' },
    { id: 'N210808', password: '^84812(', name: 'VIVARAM HEMANTH KUMAR', email: 'n210808@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210808.jpg' },
    { id: 'N210809', password: '*30bb0*', name: 'MADDU VENKATA LAKSHMI', email: 'n210809@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210809.jpg' },
    { id: 'N210810', password: '*c6731^', name: 'SEELAM VENKATA SAI VARA PRASAD', email: 'n210810@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210810.jpg' },
    { id: 'N210811', password: '(ef257*', name: 'JONNAVARAM SRI HARI', email: 'n210811@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210811.jpg' },
    { id: 'N210812', password: '$3d659$', name: 'DASARI DIVYASRI', email: 'n210812@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210812.jpg' },
    { id: 'N210813', password: '@4cac6^', name: 'SHAIK AFREEN', email: 'n210813@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210813.jpg' },
    { id: 'N210814', password: '!5ed35$', name: 'SHAIK ARIFA', email: 'n210814@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210814.jpg' },
    { id: 'N210815', password: '^b043e(', name: 'KAMILLI HEMALATHA', email: 'n210815@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210815.jpg' },
    { id: 'N210816', password: '*cf8c8!', name: 'MASUPATRI ABHIRAM', email: 'n210816@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210816.jpg' },
    { id: 'N210817', password: ')dd9be*', name: 'BODAPATI SANJAY MANOHAR', email: 'n210817@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210817.jpg' },
    { id: 'N210818', password: '@fd04b@', name: 'ONTELA RUSHITHA', email: 'n210818@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210818.jpg' },
    { id: 'N210819', password: '(534c8$', name: 'GANDLA PALLI PEEYUSHA', email: 'n210819@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210819.jpg' },
    { id: 'N210820', password: '(4065f!', name: 'YAGATI JAGANMOHAN RAO', email: 'n210820@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210820.jpg' },
    { id: 'N210821', password: '!a1888^', name: 'RAJA VAISHNAVI', email: 'n210821@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210821.jpg' },
    { id: 'N210822', password: '@9a34a(', name: 'BORA SAI GANESH', email: 'n210822@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210822.jpg' },
    { id: 'N210823', password: '@987fa)', name: 'GONTUKOLU RAJESH BENARJEE', email: 'n210823@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210823.jpg' },
    { id: 'N210824', password: '(28bd9@', name: 'THALLAM VENKATA KARTHIK', email: 'n210824@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210824.jpg' },
    { id: 'N210825', password: '$20803@', name: 'MOHAMMAD NOORE RASOOL', email: 'n210825@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210825.jpg' },
    { id: 'N210826', password: ')38190(', name: 'SHEIKH RIA TAJEEM', email: 'n210826@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210826.jpg' },
    { id: 'N210827', password: '!0be97)', name: 'KARA RANJIT KUMAR', email: 'n210827@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210827.jpg' },
    { id: 'N210828', password: '@071e7*', name: 'KURRA SIVA NAIK', email: 'n210828@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210828.jpg' },
    { id: 'N210829', password: '$06624(', name: 'LAVETI TARUN', email: 'n210829@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210829.jpg' },
    { id: 'N210830', password: '^646dc^', name: 'KOVVURI GAYATRI', email: 'n210830@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210830.jpg' },
    { id: 'N210832', password: '*704a3^', name: 'CHIMALADINNE SOWJANYA', email: 'n210832@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210832.jpg' },
    { id: 'N210833', password: '$beb2d^', name: 'KASUDARI CHANDRA SEKHAR', email: 'n210833@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210833.jpg' },
    { id: 'N210834', password: '(296b4$', name: 'NAGARAM KARTHIKEYAN', email: 'n210834@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210834.jpg' },
    { id: 'N210835', password: '*c9512!', name: 'NETHAGANI VIJAYA SREE', email: 'n210835@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210835.jpg' },
    { id: 'N210836', password: '*e7cf0^', name: 'GANTA SUDHARSHAN PAUL', email: 'n210836@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210836.jpg' },
    { id: 'N210837', password: '@8ae68@', name: 'SODADASI INDHU JOY', email: 'n210837@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210837.jpg' },
    { id: 'N210838', password: '(c7203*', name: 'KOLANUKONDA JEEVAN', email: 'n210838@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210838.jpg' },
    { id: 'N210839', password: '@6c226*', name: 'MATANGI SANTOSH BABU', email: 'n210839@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210839.jpg' },
    { id: 'N210840', password: '$3d9f5*', name: 'GADDE MADHURI', email: 'n210840@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210840.jpg' },
    { id: 'N210841', password: '^56fb0*', name: 'DARA HASINEE SREEJA', email: 'n210841@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210841.jpg' },
    { id: 'N210842', password: '$a4e42^', name: 'NAGENDLA PEDDA BABU', email: 'n210842@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210842.jpg' },
    { id: 'N210843', password: '!0d4ff!', name: 'MAMILLAPALLI VENKATA NANDINI', email: 'n210843@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210843.jpg' },
    { id: 'N210844', password: '$9c38a$', name: 'GAJULA VISHNU PRIYA', email: 'n210844@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210844.jpg' },
    { id: 'N210845', password: '@4c06a(', name: 'DEBARIKI SNEHALATHA', email: 'n210845@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210845.jpg' },
    { id: 'N210847', password: ')484c7(', name: 'BHEEMA MAHESH', email: 'n210847@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210847.jpg' },
    { id: 'N210848', password: '*eaeb3!', name: 'MOHAMMAD RIYAJUDDIN', email: 'n210848@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210848.jpg' },
    { id: 'N210849', password: '^46b87*', name: 'ADDAGALLA NAGARAJU', email: 'n210849@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210849.jpg' },
    { id: 'N210850', password: '$45e13!', name: 'KASETTY ABHINANDU', email: 'n210850@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210850.jpg' },
    { id: 'N210851', password: '$ee092(', name: 'SATHRI NIKHITHA', email: 'n210851@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210851.jpg' },
    { id: 'N210852', password: '(25ac6!', name: 'BOYA MADHU', email: 'n210852@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210852.jpg' },
    { id: 'N210853', password: '$1e5f5^', name: 'PALURI SAMUEL SATYA SANDEEP', email: 'n210853@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210853.jpg' },
    { id: 'N210854', password: '$1e5f54', name: 'ABDUL SHABANA BEGUM', email: 'n210854@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210854.jpg' },
    { id: 'N210855', password: '$09840)', name: 'BESTA AJAYSURYA', email: 'n210855@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210855.jpg' },
    { id: 'N210856', password: '$c1572$', name: 'UNNAVA BOBBY', email: 'n210856@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210856.jpg' },
    { id: 'N210858', password: '!7b614*', name: 'FERNANDEZ NAVADEEP', email: 'n210858@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210858.jpg' },
    { id: 'N210859', password: '@80bf9!', name: 'SHAIK AHAMADULLA', email: 'n210859@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210859.jpg' },
    { id: 'N210860', password: '!13918)', name: 'MUSANALLI BUGUDE MANOJ KUMAR', email: 'n210860@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210860.jpg' },
    { id: 'N210861', password: ')6eae1!', name: 'SHAIK MUJAVAR KHAJA MOHIDDIN', email: 'n210861@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210861.jpg' },
    { id: 'N210862', password: '^3c7df$', name: 'PARRE SRIVARSHINI', email: 'n210862@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210862.jpg' },
    { id: 'N210863', password: '!06a02)', name: 'MANAM HARSHA VARDHAN', email: 'n210863@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210863.jpg' },
    { id: 'N210864', password: '*b606a)', name: 'GERA RAJYAM', email: 'n210864@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210864.jpg' },
    { id: 'N210865', password: '^519d5*', name: 'DUSARI PRASUNA SREE', email: 'n210865@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210865.jpg' },
    { id: 'N210866', password: '!6d44e(', name: 'BOMMU SATYA PRASANTH', email: 'n210866@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210866.jpg' },
    { id: 'N210867', password: '!ec1ed)', name: 'BOGGAVARAPU RAKESH BABU', email: 'n210867@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210867.jpg' },
    { id: 'N210868', password: '@28809$', name: 'TANGULA JAHNAVI', email: 'n210868@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210868.jpg' },
    { id: 'N210869', password: '$4f94b!', name: 'GUNDLURU YASHOVARDHAN', email: 'n210869@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210869.jpg' },
    { id: 'N210870', password: '*9ce62(', name: 'SHAIK KALESHA', email: 'n210870@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210870.jpg' },
    { id: 'N210871', password: '!ebd32!', name: 'INJAMURI SATYAPRAKASH', email: 'n210871@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210871.jpg' },
    { id: 'N210872', password: '@579a2(', name: 'CHILAKA MANJUSHA', email: 'n210872@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210872.jpg' },
    { id: 'N210873', password: '@618b1^', name: 'THOMMANDRU VARSHITHA', email: 'n210873@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210873.jpg' },
    { id: 'N210874', password: '!a6473$', name: 'SHAIK ABDUL VARIS', email: 'n210874@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210874.jpg' },
    { id: 'N210875', password: ')3f0c4!', name: 'SHAIK CHAND SHAHARA', email: 'n210875@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210875.jpg' },
    { id: 'N210876', password: ')f3444^', name: 'SHAIK AFROZ', email: 'n210876@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210876.jpg' },
    { id: 'N210877', password: '@1159e*', name: 'JAYAVARAM KARTHIK', email: 'n210877@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210877.jpg' },
    { id: 'N210878', password: '@9e4db$', name: 'BHEEMAVARAPU VENKATA RAKSHITHA', email: 'n210878@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210878.jpg' },
    { id: 'N210879', password: '!e9ca7^', name: 'SHAIK AFIYA BHANU', email: 'n210879@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210879.jpg' },
    { id: 'N210880', password: '$7095e*', name: 'SHAIK AAEESHA TASLEEM', email: 'n210880@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210880.jpg' },
    { id: 'N210881', password: '(f7683*', name: 'KILLADA CHARANYA', email: 'n210881@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210881.jpg' },
    { id: 'N210882', password: '!f54d4$', name: 'MALKARI RAMANAND RAO', email: 'n210882@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210882.jpg' },
    { id: 'N210883', password: '$dd1e0*', name: 'CHIRRA KARTHIK', email: 'n210883@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210883.jpg' },
    { id: 'N210884', password: '(849f9*', name: 'MADDALA HARSHITHA PRIYADARSHINI', email: 'n210884@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210884.jpg' },
    { id: 'N210885', password: '!630e2!', name: 'PUTTA AKHIL', email: 'n210885@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210885.jpg' },
    { id: 'N210886', password: '@52bb5@', name: 'VEERAIAH PAVITHRA', email: 'n210886@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210886.jpg' },
    { id: 'N210887', password: '^ea0d2^', name: 'CHILAKA EESWAR', email: 'n210887@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210887.jpg' },
    { id: 'N210888', password: '^acc53!', name: 'MALLIPUDI SUSI', email: 'n210888@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210888.jpg' },
    { id: 'N210889', password: '$c0467$', name: 'SHAIK JASMIN', email: 'n210889@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210889.jpg' },
    { id: 'N210890', password: '*13f91^', name: 'KUMBHA UDAY KUMAR', email: 'n210890@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210890.jpg' },
    { id: 'N210891', password: '@19adc^', name: 'BANDLA TEJA SRI', email: 'n210891@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210891.jpg' },
    { id: 'N210892', password: '*e350f!', name: 'SHAIK TASLEEM', email: 'n210892@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210892.jpg' },
    { id: 'N210893', password: '(12797^', name: 'SHAIK SAMEER', email: 'n210893@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210893.jpg' },
    { id: 'N210894', password: '(bd9c9^', name: 'JILUMUDI HARIKA', email: 'n210894@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210894.jpg' },
    { id: 'N210895', password: '$3233d(', name: 'SHAIK BAJEED VALI', email: 'n210895@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210895.jpg' },
    { id: 'N210896', password: '$c9c8b*', name: 'SYED REHANA RAHATH', email: 'n210896@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210896.jpg' },
    { id: 'N210897', password: '@2bc19!', name: 'SHAIK MOHAMMED ILYAS', email: 'n210897@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210897.jpg' },
    { id: 'N210898', password: '^73921^', name: 'PALEPU MAHITHA', email: 'n210898@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210898.jpg' },
    { id: 'N210899', password: '@61313@', name: 'KANKANALA AHALYA', email: 'n210899@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210899.jpg' },
    { id: 'N210900', password: '*61019*', name: 'MADUGUNDU JAGADEESH', email: 'n210900@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210900.jpg' },
    { id: 'N210901', password: '$b6ea2^', name: 'MATTAGUNJA SINDHU', email: 'n210901@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210901.jpg' },
    { id: 'N210902', password: '*fa0e6!', name: 'MALLU SUJITHA', email: 'n210902@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210902.jpg' },
    { id: 'N210903', password: '^595b8^', name: 'CHINTHAGINJALA SAI SOWMYA', email: 'n210903@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210903.jpg' },
    { id: 'N210904', password: '^f9262*', name: 'GANAGALA BHUVANESWARI', email: 'n210904@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210904.jpg' },
    { id: 'N210906', password: '^8ed6b*', name: 'GUNJI DANAIAH', email: 'n210906@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210906.jpg' },
    { id: 'N210907', password: '(2230a^', name: 'MEKALA SANDEEP', email: 'n210907@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210907.jpg' },
    { id: 'N210908', password: '^b54d1*', name: 'UPPU TEJA VENKATAKUMAR', email: 'n210908@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210908.jpg' },
    { id: 'N210909', password: '@f3104(', name: 'CHALLA SRAVAN KRISHNAMANAIDU', email: 'n210909@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210909.jpg' },
    { id: 'N210910', password: '!4885e$', name: 'SREERAM VIJITHA', email: 'n210910@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210910.jpg' },
    { id: 'N210911', password: '!fb2e7(', name: 'SHAIK SAMEENA', email: 'n210911@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210911.jpg' },
    { id: 'N210912', password: '^7fcc5$', name: 'MUCHHI BALLARI SUVARNA CHANDRIKA', email: 'n210912@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210912.jpg' },
    { id: 'N210913', password: '*9f5a2(', name: 'KANDRAKONDA VENKATA LAKSHMI', email: 'n210913@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210913.jpg' },
    { id: 'N210914', password: '@9423d!', name: 'YEDDU RAHUL RANADHEER', email: 'n210914@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210914.jpg' },
    { id: 'N210915', password: '^1f9fa^', name: 'NELLORE SAI KRISHNA', email: 'n210915@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210915.jpg' },
    { id: 'N210916', password: '!c8d04(', name: 'KOMBATHULA PAVITHRA', email: 'n210916@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210916.jpg' },
    { id: 'N210917', password: '^8de14)', name: 'DIRISIMI PRUDHVI', email: 'n210917@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210917.jpg' },
    { id: 'N210918', password: '$f83a4)', name: 'SHAIK BAJI', email: 'n210918@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210918.jpg' },
    { id: 'N210919', password: '@772e6(', name: 'DOMATHOTI JOHN JAMEESU', email: 'n210919@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210919.jpg' },
    { id: 'N210920', password: '!6d570)', name: 'MUDU GOPI', email: 'n210920@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210920.jpg' },
    { id: 'N210921', password: '*c50bf*', name: 'KAMPA DEVA SELVA RAJU', email: 'n210921@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210921.jpg' },
    { id: 'N210922', password: '$13c8f(', name: 'KATIKALA MANEESH MADHAV', email: 'n210922@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210922.jpg' },
    { id: 'N210923', password: '*9e509(', name: 'RAMAVATH SAI DURGA NAIK', email: 'n210923@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210923.jpg' },
    { id: 'N210924', password: '@e3919^', name: 'JEMIMA  POLSAPALLI', email: 'n210924@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210924.jpg' },
    { id: 'N210925', password: '*b94ad(', name: 'DAGGUMALLI SIRISHA', email: 'n210925@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210925.jpg' },
    { id: 'N210926', password: '!2d09b(', name: 'KONKA JESSY DEV', email: 'n210926@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210926.jpg' },
    { id: 'N210927', password: '^0c41e*', name: 'ALLURU SUMANVITHA', email: 'n210927@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210927.jpg' },
    { id: 'N210928', password: '$e39e7!', name: 'PUNAMALLI HARIKA', email: 'n210928@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210928.jpg' },
    { id: 'N210929', password: '!24ac6$', name: 'MUCHU HONEY', email: 'n210929@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210929.jpg' },
    { id: 'N210930', password: '^0df9f$', name: 'MEDIKONDA HEMANTH RISHI', email: 'n210930@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210930.jpg' },
    { id: 'N210931', password: '!42b80!', name: 'GORREMUTCHU  VISWANTH BHASKAR', email: 'n210931@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210931.jpg' },
    { id: 'N210932', password: '^f3fe6)', name: 'DARA HIMABINDU', email: 'n210932@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210932.jpg' },
    { id: 'N210933', password: '!72e8a^', name: 'BOOLA SHANMITHA', email: 'n210933@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210933.jpg' },
    { id: 'N210934', password: ')8a6fa$', name: 'VANABATHINA RUPESH BABU', email: 'n210934@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210934.jpg' },
    { id: 'N210935', password: '$4ea03(', name: 'CHOPPELLA LAKSHMI RAM', email: 'n210935@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210935.jpg' },
    { id: 'N210936', password: '!debd4!', name: 'BONELA GAYATRI HANSINI', email: 'n210936@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210936.jpg' },
    { id: 'N210937', password: '!4ff0f^', name: 'SHANKAR MOULIKA', email: 'n210937@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210937.jpg' },
    { id: 'N210939', password: '(b5789)', name: 'CHALLA SURYANARAYANA', email: 'n210939@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210939.jpg' },
    { id: 'N210940', password: '!4c2d7!', name: 'MALLARAPU ANUSHA', email: 'n210940@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210940.jpg' },
    { id: 'N210941', password: '*09f38*', name: 'SIYYADHULA PYDI SATYANARAYANA', email: 'n210941@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210941.jpg' },
    { id: 'N210942', password: '@16d2e@', name: 'NUTHALAPATI LIKHITHA', email: 'n210942@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210942.jpg' },
    { id: 'N210943', password: '$ac5df(', name: 'YEMPULURU SAI SATHWIK', email: 'n210943@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210943.jpg' },
    { id: 'N210944', password: '*08c22(', name: 'MOYYI DURGA PRASAD', email: 'n210944@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210944.jpg' },
    { id: 'N210945', password: '$5ec47*', name: 'YENDLURI NITHIN', email: 'n210945@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210945.jpg' },
    { id: 'N210946', password: '$e9b79!', name: 'BOLLARAPU TEJAS', email: 'n210946@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210946.jpg' },
    { id: 'N210947', password: '*fcb9a!', name: 'RUDRAPATI SRI PRIYA', email: 'n210947@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210947.jpg' },
    { id: 'N210948', password: ')9ba4d(', name: 'SHAIK NASEER ALI', email: 'n210948@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210948.jpg' },
    { id: 'N210949', password: '$2ecdb^', name: 'PYLI ARAVIND RAJU', email: 'n210949@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210949.jpg' },
    { id: 'N210950', password: '!459a7(', name: 'DEPAVATH ANJALI', email: 'n210950@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210950.jpg' },
    { id: 'N210951', password: '$0c8d0(', name: 'DONDAPATI ANUDEEP', email: 'n210951@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210951.jpg' },
    { id: 'N210952', password: '*878a3^', name: 'DAMALA  SASIKUMAR', email: 'n210952@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210952.jpg' },
    { id: 'N210954', password: '$17f49)', name: 'KATURI SATYA PRIYA', email: 'n210954@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210954.jpg' },
    { id: 'N210955', password: '!bdebe!', name: 'GOGU SANDEEP', email: 'n210955@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210955.jpg' },
    { id: 'N210956', password: '$318a1*', name: 'KALLURI DURGA BHAVANI', email: 'n210956@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210956.jpg' },
    { id: 'N210957', password: '@e2bcd*', name: 'CHINTAPALLI ADITYA', email: 'n210957@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210957.jpg' },
    { id: 'N210958', password: '*61a7c!', name: 'BURA GAYATHRI', email: 'n210958@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210958.jpg' },
    { id: 'N210959', password: '$ed491!', name: 'MUTHYALA PRIYANKA', email: 'n210959@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210959.jpg' },
    { id: 'N210960', password: '$8a64e)', name: 'TELLURI DILEEP', email: 'n210960@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210960.jpg' },
    { id: 'N210961', password: '!10863$', name: 'GOLLAMANDALA VIVEK', email: 'n210961@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210961.jpg' },
    { id: 'N210962', password: '*a903f)', name: 'PRADEEPTHI SRINIVAS EDARA', email: 'n210962@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210962.jpg' },
    { id: 'N210963', password: '!1f8a7(', name: 'PALTHI BHULAKSHMI BAI', email: 'n210963@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210963.jpg' },
    { id: 'N210964', password: '$bd2a5@', name: 'GANTA BINDU CHAITANYA', email: 'n210964@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210964.jpg' },
    { id: 'N210965', password: '$6bcce*', name: 'SAKILAY GRACE LIPIKA', email: 'n210965@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210965.jpg' },
    { id: 'N210966', password: ')1e006)', name: 'CHINTALA ENOSH', email: 'n210966@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210966.jpg' },
    { id: 'N210967', password: '(3da2e!', name: 'MOTRU SWARNA', email: 'n210967@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210967.jpg' },
    { id: 'N210968', password: '!67edd!', name: 'KUKKALA VARSHINI', email: 'n210968@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210968.jpg' },
    { id: 'N210969', password: ')a6b18(', name: 'PATETI CHANDU', email: 'n210969@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210969.jpg' },
    { id: 'N210970', password: '^9058b(', name: 'PRATHIPATI SNEHA', email: 'n210970@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210970.jpg' },
    { id: 'N210971', password: '^84280!', name: 'GALI SANDITHA', email: 'n210971@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210971.jpg' },
    { id: 'N210972', password: '$3e182$', name: 'TIRLANGI RAKESH', email: 'n210972@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210972.jpg' },
    { id: 'N210973', password: '$fd6f1$', name: 'SIKILE RAJEEV ANAND', email: 'n210973@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210973.jpg' },
    { id: 'N210974', password: ')71c61!', name: 'RAYI MOHAN VINAY RAJ', email: 'n210974@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210974.jpg' },
    { id: 'N210975', password: '@9ccc7$', name: 'NUKATHOTI LIKITHA SRI', email: 'n210975@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210975.jpg' },
    { id: 'N210977', password: '^ef0c2!', name: 'GOGULAMUDI LAKSHMI PRATHYUSHA', email: 'n210977@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210977.jpg' },
    { id: 'N210978', password: ')170eb*', name: 'GALI KARAN TEJA', email: 'n210978@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210978.jpg' },
    { id: 'N210979', password: '^36e72^', name: 'NARUBOINA NIKHILA', email: 'n210979@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210979.jpg' },
    { id: 'N210980', password: '*48e18@', name: 'GANDERLA CHAITHANYA', email: 'n210980@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210980.jpg' },
    { id: 'N210981', password: '!e5503^', name: 'PATTA RAHUL', email: 'n210981@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210981.jpg' },
    { id: 'N210982', password: '*b2339*', name: 'CHINTHAKAYALA MOUNIKA', email: 'n210982@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210982.jpg' },
    { id: 'N210983', password: '*dfeed!', name: 'MERUM LOKESH BABU', email: 'n210983@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210983.jpg' },
    { id: 'N210984', password: '!8cc4e$', name: 'JONNALAGADDA JEESESS', email: 'n210984@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210984.jpg' },
    { id: 'N210985', password: '$f276f)', name: 'PURNAGANTI PRAVALLIKA', email: 'n210985@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210985.jpg' },
    { id: 'N210986', password: '*12702)', name: 'KUMBHA SAGAR', email: 'n210986@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210986.jpg' },
    { id: 'N210988', password: '@fcbc4!', name: 'ENDLURU MANASA', email: 'n210988@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210988.jpg' },
    { id: 'N210989', password: '^2de4e^', name: 'MATCHA RAJESH', email: 'n210989@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210989.jpg' },
    { id: 'N210990', password: '!39fd9*', name: 'VUSURUPATI MANOHAR', email: 'n210990@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210990.jpg' },
    { id: 'N210991', password: '!c27e0^', name: 'PALAPARTHI ASWINI', email: 'n210991@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210991.jpg' },
    { id: 'N210992', password: '@17952(', name: 'BUDITHI HAMSA SAMUEL CHARLEE', email: 'n210992@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210992.jpg' },
    { id: 'N210993', password: '@8369c$', name: 'GUGULOTHU REVATHI', email: 'n210993@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210993.jpg' },
    { id: 'N210994', password: '$52c96!', name: 'POLEPALLI HARI HARANADH', email: 'n210994@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210994.jpg' },
    { id: 'N210995', password: '^9e491^', name: 'GOLLA  MAHESH  SAI', email: 'n210995@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210995.jpg' },
    { id: 'N210996', password: '(96dbe@', name: 'KATRAVATH HARI KRISHNA NAIK', email: 'n210996@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210996.jpg' },
    { id: 'N210997', password: '*0c12e(', name: 'SAMAREDDY REVANTH', email: 'n210997@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210997.jpg' },
    { id: 'N210998', password: ')d7f89@', name: 'MALLAVARAPU CHENCHU SRIRAM', email: 'n210998@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210998.jpg' },
    { id: 'N210999', password: '(2c36b(', name: 'RAMAVATH MALLIKARJUNA NAIK', email: 'n210999@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N210999.jpg' },
    { id: 'N211000', password: '!5e7e1(', name: 'PITTI SUNIL', email: 'n211000@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211000.jpg' },
    { id: 'N211001', password: '^ab430$', name: 'VADITHYA PRASANNA', email: 'n211001@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211001.jpg' },
    { id: 'N211002', password: '@69b18$', name: 'BANAVATH LAKSHMAN KUMAR NAIK', email: 'n211002@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211002.jpg' },
    { id: 'N211003', password: '^904e3*', name: 'DASARI NITHIN KUMAR', email: 'n211003@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211003.jpg' },
    { id: 'N211004', password: ')04864!', name: 'BAPATLA ANJALI', email: 'n211004@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211004.jpg' },
    { id: 'N211005', password: '^ce790$', name: 'GUTTIKONDA KAVYA', email: 'n211005@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211005.jpg' },
    { id: 'N211006', password: '*80d0a!', name: 'BANDANGI HEMENDRA CHARAN NAIDU', email: 'n211006@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211006.jpg' },
    { id: 'N211007', password: ')91812^', name: 'GORRELA CHIRU LAXMAN', email: 'n211007@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211007.jpg' },
    { id: 'N211008', password: '(5bc7c^', name: 'UGGINA LEELA PRASAD', email: 'n211008@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211008.jpg' },
    { id: 'N211009', password: '!510b6^', name: 'YEDDULA JAYA KUMAR', email: 'n211009@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211009.jpg' },
    { id: 'N211010', password: '(86dfe$', name: 'GUDIMETLA HRITIKA', email: 'n211010@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211010.jpg' },
    { id: 'N211011', password: '!150e7)', name: 'MADHIRA YESASWINI', email: 'n211011@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211011.jpg' },
    { id: 'N211012', password: '$ac5cb(', name: 'POTLURI SRI NAGA VENU', email: 'n211012@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211012.jpg' },
    { id: 'N211013', password: '$1cef3$', name: 'MANOJ  SAHU', email: 'n211013@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211013.jpg' },
    { id: 'N211014', password: '^38538)', name: 'DEVARAPALLI MANOJ KUMAR', email: 'n211014@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211014.jpg' },
    { id: 'N211015', password: '!0f2ab$', name: 'MEKA THOLISMONJALI', email: 'n211015@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211015.jpg' },
    { id: 'N211016', password: '@0c0f9*', name: 'M SUDHAKAR NAIK', email: 'n211016@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211016.jpg' },
    { id: 'N211017', password: '!7aa0f*', name: 'MERAVATH RAVINDRA NAIK', email: 'n211017@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211017.jpg' },
    { id: 'N211018', password: '$40cba(', name: 'LAVUDIYA BHAVANA SRI', email: 'n211018@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211018.jpg' },
    { id: 'N211019', password: '@ecad3!', name: 'RAMAVATH MANTHRU NAIK', email: 'n211019@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211019.jpg' },
    { id: 'N211020', password: '$bab7b*', name: 'KAVADI GAGAN', email: 'n211020@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211020.jpg' },
    { id: 'N211021', password: '$83896)', name: 'SUNKARI VIJAY', email: 'n211021@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211021.jpg' },
    { id: 'N211022', password: '^044fb$', name: 'BANAVATHU TARUN NAYAK', email: 'n211022@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211022.jpg' },
    { id: 'N211023', password: '^185bd(', name: 'ITLA SANTHOSH KUMAR', email: 'n211023@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211023.jpg' },
    { id: 'N211025', password: ')a22fd!', name: 'KUDA BRAHMESWARA VISHNU', email: 'n211025@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211025.jpg' },
    { id: 'N211026', password: '*e5597(', name: 'BHUKYA MOTHILAL NAIK', email: 'n211026@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211026.jpg' },
    { id: 'N211027', password: '$7084f(', name: 'DEVASOTH  NAGENDRA NAIK', email: 'n211027@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211027.jpg' },
    { id: 'N211029', password: '^28a68(', name: 'BANAVATHU SIREESHA BAI', email: 'n211029@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211029.jpg' },
    { id: 'N211030', password: ')509be$', name: 'SAGINA HINDU VARMA', email: 'n211030@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211030.jpg' },
    { id: 'N211031', password: '$63525(', name: 'AMASA SANKAR CHAITANYA', email: 'n211031@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211031.jpg' },
    { id: 'N211032', password: '$90908)', name: 'UYYALA MOUNIKA', email: 'n211032@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211032.jpg' },
    { id: 'N211033', password: '*02d2e^', name: 'KAVULURI TRIVENI', email: 'n211033@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211033.jpg' },
    { id: 'N211034', password: ')00c06)', name: 'POTLURI VINDHYA SAI', email: 'n211034@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211034.jpg' },
    { id: 'N211035', password: '$c18ee@', name: 'BANAVATH MAHESH NAIK', email: 'n211035@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211035.jpg' },
    { id: 'N211036', password: '!d9269^', name: 'AVULA MOUNIKA', email: 'n211036@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211036.jpg' },
    { id: 'N211037', password: '(cd9a9*', name: 'MUDE VARSHA', email: 'n211037@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211037.jpg' },
    { id: 'N211038', password: '@37ba4^', name: 'PASAM PAVAN KALYAN', email: 'n211038@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211038.jpg' },
    { id: 'N211039', password: '*5e894^', name: 'THOTAKURA ASISH', email: 'n211039@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211039.jpg' },
    { id: 'N211040', password: '-132', name: 'NAGAM CHARAN', email: 'n211040@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211040.jpg' },
    { id: 'N211041', password: '!a4a08*', name: 'MALLIKA VISHNU VARDHAN RAO', email: 'n211041@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211041.jpg' },
    { id: 'N211042', password: '@03bd8)', name: 'PATHAN AYUSHA', email: 'n211042@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211042.jpg' },
    { id: 'N211043', password: '^99fc9!', name: 'VUPPALA JAHNAVI', email: 'n211043@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211043.jpg' },
    { id: 'N211044', password: '$f3f72(', name: 'YUVA TEJA VALLABHANENI', email: 'n211044@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211044.jpg' },
    { id: 'N211045', password: '*2f8ba(', name: 'GADI SAI AKSHITHA', email: 'n211045@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211045.jpg' },
    { id: 'N211046', password: '*d2327^', name: 'PERAVALI INDHU', email: 'n211046@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211046.jpg' },
    { id: 'N211047', password: '@f971d(', name: 'ITRAJULA RAMJEE', email: 'n211047@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211047.jpg' },
    { id: 'N211050', password: '^65f74)', name: 'LANKA AVINASH KUMAR', email: 'n211050@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211050.jpg' },
    { id: 'N211051', password: '*70de0(', name: 'LANKA MARTHANDA KUMAR', email: 'n211051@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211051.jpg' },
    { id: 'N211052', password: '*18b0e^', name: 'SHAIK NAGOOR MEERAVALI', email: 'n211052@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211052.jpg' },
    { id: 'N211053', password: '!bfae4$', name: 'BUGATA PRAVALLIKA', email: 'n211053@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211053.jpg' },
    { id: 'N211054', password: '!54321*', name: 'GONAPA PRANATHI', email: 'n211054@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211054.jpg' },
    { id: 'N211055', password: '^f1bb7@', name: 'PALAGANI RAGHAVENDRA RAJU', email: 'n211055@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211055.jpg' },
    { id: 'N211056', password: '!630db^', name: 'PALLELA VENU', email: 'n211056@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211056.jpg' },
    { id: 'N211057', password: '^6e83e(', name: 'VANKA PRAM CHAND', email: 'n211057@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211057.jpg' },
    { id: 'N211058', password: '!550a2@', name: 'MAJJI HARINI', email: 'n211058@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211058.jpg' },
    { id: 'N211059', password: '*9a41a(', name: 'TALUPULA MANOJ KUMAR', email: 'n211059@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211059.jpg' },
    { id: 'N211060', password: '(3e1dd*', name: 'DAGGUPATI SAI BHAVITA', email: 'n211060@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211060.jpg' },
    { id: 'N211061', password: '^ab25c(', name: 'DUGGEPOGU AKSHITHA', email: 'n211061@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211061.jpg' },
    { id: 'N211062', password: '^44a0e*', name: 'SHAIK NOWSHIN', email: 'n211062@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211062.jpg' },
    { id: 'N211063', password: '$117f2^', name: 'AMBATI TARUN', email: 'n211063@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211063.jpg' },
    { id: 'N211064', password: ')5b3a6)', name: 'BATHULA RAJAVARDHAN', email: 'n211064@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211064.jpg' },
    { id: 'N211066', password: '*140e4$', name: 'MULLAPUDI DEENA', email: 'n211066@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211066.jpg' },
    { id: 'N211067', password: '(72785^', name: 'PEKETI MEGHANA', email: 'n211067@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211067.jpg' },
    { id: 'N211068', password: '$c83e5$', name: 'PEDIREDLA SAI SINDHUJA', email: 'n211068@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211068.jpg' },
    { id: 'N211069', password: '@6bc30$', name: 'NALLAMOTHU HANSON SUVARNA RAJU', email: 'n211069@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211069.jpg' },
    { id: 'N211070', password: '^573d7*', name: 'BONTHU GEETHIKAVENI', email: 'n211070@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211070.jpg' },
    { id: 'N211072', password: '@9009d$', name: 'SAMBANGI DHANUSREE', email: 'n211072@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211072.jpg' },
    { id: 'N211073', password: '$7abcd$', name: 'BURRA SESHAGIRI RAO', email: 'n211073@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211073.jpg' },
    { id: 'N211074', password: '*4bd53(', name: 'MATAM GAGAN', email: 'n211074@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211074.jpg' },
    { id: 'N211076', password: ')3e95f$', name: 'SHAIK AISHA APHASANA BEGUM', email: 'n211076@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211076.jpg' },
    { id: 'N211077', password: '*6617a^', name: 'ANNAPU REDDY SIVA TEJA REDDY', email: 'n211077@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211077.jpg' },
    { id: 'N211078', password: '!200e3(', name: 'JANNU AKSHITHA', email: 'n211078@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211078.jpg' },
    { id: 'N211079', password: '*b3596^', name: 'POOJARI HARSHAVARDHAN', email: 'n211079@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211079.jpg' },
    { id: 'N211080', password: '^26f8a!', name: 'MYLA PRATHYUSHA', email: 'n211080@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211080.jpg' },
    { id: 'N211082', password: '^45193*', name: 'ADIREDDY VISHNU GOWTHAM', email: 'n211082@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211082.jpg' },
    { id: 'N211083', password: '!6e06d(', name: 'KUNCHALA MANI KARTHIKEYEN', email: 'n211083@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211083.jpg' },
    { id: 'N211084', password: '@1783d(', name: 'RAVI TARUN', email: 'n211084@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211084.jpg' },
    { id: 'N211085', password: '(555ed^', name: 'KUNDAKARLA MEGHANA', email: 'n211085@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211085.jpg' },
    { id: 'N211086', password: '$99183!', name: 'DORA REVANTH', email: 'n211086@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211086.jpg' },
    { id: 'N211087', password: '*08174*', name: 'BURRI CHARAN KUMAR', email: 'n211087@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211087.jpg' },
    { id: 'N211088', password: '!902b7@', name: 'CHAGANTI SUDARSHAN REDDY', email: 'n211088@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211088.jpg' },
    { id: 'N211089', password: '(82123$', name: 'GANTA THARUN', email: 'n211089@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211089.jpg' },
    { id: 'N211090', password: '*4ef91)', name: 'TAMARANA TEJASWANI', email: 'n211090@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211090.jpg' },
    { id: 'N211091', password: '$063a2*', name: 'KOTHUDUMU MADHU SREE', email: 'n211091@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211091.jpg' },
    { id: 'N211092', password: '$cd92a(', name: 'MADEM NIKHILA', email: 'n211092@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211092.jpg' },
    { id: 'N211093', password: '$ea486(', name: 'SIGINAM SANDHYA', email: 'n211093@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211093.jpg' },
    { id: 'N211094', password: '*a3326(', name: 'DANDUPATI SRAVANI', email: 'n211094@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211094.jpg' },
    { id: 'N211095', password: '@39893!', name: 'SHAIK LALU BASHA', email: 'n211095@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211095.jpg' },
    { id: 'N211096', password: '$fc097*', name: 'LANKA MANASA', email: 'n211096@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211096.jpg' },
    { id: 'N211098', password: '(38d92^', name: 'PADAMATA DIVYANJALI', email: 'n211098@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211098.jpg' },
    { id: 'N211099', password: '$b8593^', name: 'UPPADA BHARATHI', email: 'n211099@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211099.jpg' },
    { id: 'N211100', password: '!7951a(', name: 'INTURI PRAVEEN KUMAR', email: 'n211100@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211100.jpg' },
    { id: 'N211101', password: '*af5a9(', name: 'DESHMUKH THAMAD KHAN', email: 'n211101@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211101.jpg' },
    { id: 'N211102', password: '@ee318$', name: 'SHAIK KHALIDA NIKIL', email: 'n211102@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211102.jpg' },
    { id: 'N211103', password: '!09e40$', name: 'VADITE ESTERI', email: 'n211103@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211103.jpg' },
    { id: 'N211104', password: '@44f7f@', name: 'GULIVINDALA LOKESH', email: 'n211104@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211104.jpg' },
    { id: 'N211105', password: '^0ff22^', name: 'MAKANI PURNIMA', email: 'n211105@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211105.jpg' },
    { id: 'N211106', password: '@44f7f@', name: 'PUTTU KAVYA', email: 'n211106@rguktn.ac.in', profilePic: 'https://intranet.rguktn.ac.in/SMS/usrphotos/user/N211106.jpg' }
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
/*
if (process.env.NODE_ENV === 'production') {
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'index.html'));
    });
}
*/
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







