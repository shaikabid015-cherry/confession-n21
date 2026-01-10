// Confession Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Check if user is logged in (for via ID confession) or anonymous
    const urlParams = new URLSearchParams(window.location.search);
    const confessionType = urlParams.get('type');
    
    if (confessionType === 'viaId') {
        const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
        
        if (!currentUser) {
            // Redirect to login if not logged in
            window.location.href = 'login.html?redirect=confess';
            return;
        }
    }
    
    // DOM Elements
    const directConfessionForm = document.getElementById('direct-confession-form');
    const directMessage = document.getElementById('direct-message');
    const directCharCount = document.getElementById('direct-char-count');
    const backToMessagesBtn = document.getElementById('back-to-messages');
    const goToMessagesBtn = document.getElementById('go-to-messages');
    const logoutBtn = document.getElementById('logout-btn');
    const successModal = document.getElementById('direct-success-modal');
    const closeModalBtns = document.querySelectorAll('.close-direct-modal');
    
    // Character counter
    if (directMessage) {
        directMessage.addEventListener('input', function() {
            const length = this.value.length;
            directCharCount.textContent = length;
            
            if (length > 1000) {
                directCharCount.style.color = '#e74c3c';
            } else if (length > 800) {
                directCharCount.style.color = '#f39c12';
            } else {
                directCharCount.style.color = '';
            }
        });
    }
    
    // Back to messages button
    if (backToMessagesBtn) {
        backToMessagesBtn.addEventListener('click', function() {
            const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
            
            if (currentUser) {
                window.location.href = 'messages.html';
            } else {
                window.location.href = 'index.html';
            }
        });
    }
    
    // Go to messages from success modal
    if (goToMessagesBtn) {
        goToMessagesBtn.addEventListener('click', function() {
            const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
            
            if (currentUser) {
                window.location.href = 'messages.html';
            } else {
                window.location.href = 'index.html';
            }
        });
    }
    
    // Modal controls
    closeModalBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            successModal.style.display = 'none';
        });
    });
    
    window.addEventListener('click', function(e) {
        if (e.target === successModal) {
            successModal.style.display = 'none';
        }
    });
    
    // Logout functionality
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            if (confirm('Are you sure you want to logout?')) {
                sessionStorage.removeItem('currentUser');
                window.location.href = 'index.html';
            }
        });
    }
    
    // Handle confession form submission
    if (directConfessionForm) {
        directConfessionForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const toId = document.getElementById('direct-to-id').value.trim().toUpperCase();
            const subject = document.getElementById('direct-subject').value.trim();
            const message = document.getElementById('direct-message').value.trim();
            const anonymous = document.getElementById('direct-anonymous').checked;
            const sendEmail = document.getElementById('direct-send-email').checked;
            
            // Get current user (if logged in)
            const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
            
            // Validate recipient ID format
            const idPattern = /^N\d{6}$/;
            if (!idPattern.test(toId)) {
                alert('Invalid recipient ID format. Please use N followed by 6 digits (e.g., N210001).');
                return;
            }
            
            // Check if recipient exists
            const users = JSON.parse(localStorage.getItem('confessionUsers')) || [];
            const recipient = users.find(u => u.id === toId);
            
            if (!recipient) {
                alert('Recipient ID not found. Please check the ID and try again.');
                return;
            }
            
            // Check if trying to send to self
            if (currentUser && toId === currentUser.id) {
                alert('You cannot send a confession to yourself.');
                return;
            }
            
            // Create message object
            const newMessage = {
                id: 'msg_' + Date.now(),
                from: anonymous ? 'anonymous' : (currentUser ? currentUser.id : 'anonymous'),
                to: toId,
                subject: subject,
                message: message,
                anonymous: anonymous || !currentUser, // Anonymous if not logged in
                read: false,
                favorite: false,
                timestamp: new Date().toISOString()
            };
            
            // Save to localStorage
            const messages = JSON.parse(localStorage.getItem('confessionMessages')) || [];
            messages.push(newMessage);
            localStorage.setItem('confessionMessages', JSON.stringify(messages));
            
            // Simulate email sending
            if (sendEmail) {
                simulateEmailSend(toId, recipient.email);
            }
            
            // Show success modal
            successModal.style.display = 'flex';
            
            // Reset form
            directConfessionForm.reset();
            directCharCount.textContent = '0';
        });
    }
    
    // Simulate email sending
    function simulateEmailSend(recipientId, recipientEmail) {
        console.log(`Simulating email send to: ${recipientEmail}`);
        
        const emailContent = `
            Subject: You received a confession!
            
            Hi ${recipientId},
            
            You have received a new confession on ConfessHub!
            
            Subject: ${document.getElementById('direct-subject').value}
            
            Click here to view your confession: https://yourwebsite.com/messages.html
            
            Best regards,
            ConfessHub Team
        `;
        
        console.log('Email content:', emailContent);
    }
});