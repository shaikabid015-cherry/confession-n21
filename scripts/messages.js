// Messages Page JavaScript
// Handles loading messages, user profile, and confession sending

document.addEventListener('DOMContentLoaded', function() {
    // Check if user is logged in
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    
    if (!currentUser) {
        // Redirect to login if not logged in
        window.location.href = 'login.html?redirect=messages';
        return;
    }
    
    // DOM Elements
    const profilePic = document.getElementById('profile-pic');
    const userName = document.getElementById('user-name');
    const userId = document.getElementById('user-id');
    const userEmail = document.getElementById('user-email');
    const logoutBtn = document.getElementById('logout-btn');
    const floatingWriteBtn = document.getElementById('floating-write-btn');
    const confessionModal = document.getElementById('confession-modal');
    const closeModalBtns = document.querySelectorAll('.close-modal');
    const closeSuccessModalBtns = document.querySelectorAll('.close-success-modal');
    const successModal = document.getElementById('success-modal');
    const confessionForm = document.getElementById('confession-form');
    const confessionMessage = document.getElementById('confession-message');
    const charCount = document.getElementById('char-count');
    const markAllReadBtn = document.getElementById('mark-all-read');
    const refreshMessagesBtn = document.getElementById('refresh-messages');
    const filterBtns = document.querySelectorAll('.filter-btn');
    const messagesList = document.getElementById('messages-list');
    
    // Statistics Elements
    const totalMessagesEl = document.getElementById('total-messages');
    const unreadMessagesEl = document.getElementById('unread-messages');
    const sentConfessionsEl = document.getElementById('sent-confessions');
    
    // Initialize user data
    function loadUserProfile() {
        userName.textContent = currentUser.name;
        userId.textContent = `ID: ${currentUser.id}`;
        userEmail.textContent = currentUser.email;
        
        // Set profile picture
        if (currentUser.profilePic) {
            profilePic.src = currentUser.profilePic;
        } else {
            // Default profile picture
            profilePic.src = 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + currentUser.id;
        }
    }
    
    // Initialize messages data
    function initializeMessages() {
        const messages = JSON.parse(localStorage.getItem('confessionMessages')) || [];
        
        // Filter messages for current user
        const userMessages = messages.filter(msg => msg.to === currentUser.id);
        
        // Count unread messages
        const unreadCount = userMessages.filter(msg => !msg.read).length;
        
        // Count sent confessions
        const sentCount = messages.filter(msg => msg.from === currentUser.id).length;
        
        // Update statistics
        totalMessagesEl.textContent = userMessages.length;
        unreadMessagesEl.textContent = unreadCount;
        sentConfessionsEl.textContent = sentCount;
        
        return userMessages;
    }
    
    // Display messages
    function displayMessages(messages = null) {
        const userMessages = messages || initializeMessages();
        
        // Clear current messages
        messagesList.innerHTML = '';
        
        if (userMessages.length === 0) {
            // Show empty state
            messagesList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <i class="fas fa-envelope-open-text"></i>
                    </div>
                    <h3>No messages yet</h3>
                    <p>When someone sends you a confession, it will appear here.</p>
                </div>
            `;
            return;
        }
        
        // Sort by date (newest first)
        userMessages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // Display each message
        userMessages.forEach(message => {
            const messageElement = document.createElement('div');
            messageElement.className = `message-item ${!message.read ? 'unread' : ''} ${message.favorite ? 'favorite' : ''}`;
            messageElement.dataset.id = message.id;
            
            // Format date
            const messageDate = new Date(message.timestamp);
            const formattedDate = messageDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
            
            // Determine sender display name
            let senderDisplay;
            if (message.anonymous) {
                senderDisplay = '<span class="message-sender">Anonymous</span>';
            } else {
                // Try to get sender name from users data
                const users = JSON.parse(localStorage.getItem('confessionUsers')) || [];
                const sender = users.find(u => u.id === message.from);
                senderDisplay = `<span class="message-sender">${sender ? sender.name : message.from}</span>`;
            }
            
            messageElement.innerHTML = `
                <div class="message-header">
                    <div>
                        ${senderDisplay}
                        <div class="message-time">${formattedDate}</div>
                    </div>
                </div>
                <div class="message-subject">${message.subject}</div>
                <div class="message-preview">${message.message.substring(0, 150)}${message.message.length > 150 ? '...' : ''}</div>
                <div class="message-actions">
                    <button class="message-action-btn favorite-btn ${message.favorite ? 'active' : ''}" title="Favorite">
                        <i class="fas fa-star"></i>
                    </button>
                    <button class="message-action-btn delete-btn" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            // Add click event to view message
            messageElement.addEventListener('click', function(e) {
                if (!e.target.closest('.message-actions')) {
                    viewMessage(message.id);
                }
            });
            
            messagesList.appendChild(messageElement);
        });
        
        // Add event listeners to action buttons
        document.querySelectorAll('.favorite-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const messageId = this.closest('.message-item').dataset.id;
                toggleFavorite(messageId);
            });
        });
        
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const messageId = this.closest('.message-item').dataset.id;
                deleteMessage(messageId);
            });
        });
    }
    
    // View a specific message
    function viewMessage(messageId) {
        // Mark as read
        const messages = JSON.parse(localStorage.getItem('confessionMessages')) || [];
        const messageIndex = messages.findIndex(msg => msg.id === messageId);
        
        if (messageIndex !== -1 && !messages[messageIndex].read) {
            messages[messageIndex].read = true;
            localStorage.setItem('confessionMessages', JSON.stringify(messages));
            
            // Update display
            initializeMessages();
            displayMessages();
        }
        
        // In a real app, you would show a detailed view modal
        // For now, just mark as read and refresh
        alert(`Message: ${messages[messageIndex].message}`);
    }
    
    // Toggle favorite status
    function toggleFavorite(messageId) {
        const messages = JSON.parse(localStorage.getItem('confessionMessages')) || [];
        const messageIndex = messages.findIndex(msg => msg.id === messageId);
        
        if (messageIndex !== -1) {
            messages[messageIndex].favorite = !messages[messageIndex].favorite;
            localStorage.setItem('confessionMessages', JSON.stringify(messages));
            displayMessages();
        }
    }
    
    // Delete a message
    function deleteMessage(messageId) {
        if (confirm('Are you sure you want to delete this message?')) {
            const messages = JSON.parse(localStorage.getItem('confessionMessages')) || [];
            const updatedMessages = messages.filter(msg => msg.id !== messageId);
            localStorage.setItem('confessionMessages', JSON.stringify(updatedMessages));
            displayMessages();
        }
    }
    
    // Mark all messages as read
    if (markAllReadBtn) {
        markAllReadBtn.addEventListener('click', function() {
            const messages = JSON.parse(localStorage.getItem('confessionMessages')) || [];
            const updatedMessages = messages.map(msg => {
                if (msg.to === currentUser.id && !msg.read) {
                    return { ...msg, read: true };
                }
                return msg;
            });
            
            localStorage.setItem('confessionMessages', JSON.stringify(updatedMessages));
            displayMessages();
        });
    }
    
    // Refresh messages
    if (refreshMessagesBtn) {
        refreshMessagesBtn.addEventListener('click', function() {
            // Add a spin animation to the refresh button
            this.querySelector('i').classList.add('fa-spin');
            setTimeout(() => {
                this.querySelector('i').classList.remove('fa-spin');
            }, 500);
            
            displayMessages();
        });
    }
    
    // Filter messages
    filterBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            // Update active button
            filterBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            const filter = this.dataset.filter;
            const allMessages = initializeMessages();
            
            let filteredMessages;
            switch(filter) {
                case 'unread':
                    filteredMessages = allMessages.filter(msg => !msg.read);
                    break;
                case 'read':
                    filteredMessages = allMessages.filter(msg => msg.read);
                    break;
                case 'favorite':
                    filteredMessages = allMessages.filter(msg => msg.favorite);
                    break;
                default:
                    filteredMessages = allMessages;
            }
            
            displayMessages(filteredMessages);
        });
    });
    
    // Character counter for confession message
    if (confessionMessage) {
        confessionMessage.addEventListener('input', function() {
            const length = this.value.length;
            charCount.textContent = length;
            
            if (length > 1000) {
                charCount.style.color = '#e74c3c';
            } else if (length > 800) {
                charCount.style.color = '#f39c12';
            } else {
                charCount.style.color = '';
            }
        });
    }
    
    // Modal controls
    if (floatingWriteBtn) {
        floatingWriteBtn.addEventListener('click', function() {
            confessionModal.style.display = 'flex';
        });
    }
    
    closeModalBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            confessionModal.style.display = 'none';
            confessionForm.reset();
            charCount.textContent = '0';
        });
    });
    
    closeSuccessModalBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            successModal.style.display = 'none';
        });
    });
    
    // Close modal when clicking outside
    window.addEventListener('click', function(e) {
        if (e.target === confessionModal) {
            confessionModal.style.display = 'none';
            confessionForm.reset();
            charCount.textContent = '0';
        }
        if (e.target === successModal) {
            successModal.style.display = 'none';
        }
    });
    
    // Handle confession form submission
    if (confessionForm) {
        confessionForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const toId = document.getElementById('to-id').value.trim().toUpperCase();
            const subject = document.getElementById('confession-subject').value.trim();
            const message = document.getElementById('confession-message').value.trim();
            const anonymous = document.getElementById('anonymous-send').checked;
            const sendEmail = document.getElementById('send-email').checked;
            
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
            if (toId === currentUser.id) {
                alert('You cannot send a confession to yourself.');
                return;
            }
            
            // Create message object
            const newMessage = {
                id: 'msg_' + Date.now(),
                from: anonymous ? 'anonymous' : currentUser.id,
                to: toId,
                subject: subject,
                message: message,
                anonymous: anonymous,
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
            
            // Close confession modal and show success
            confessionModal.style.display = 'none';
            successModal.style.display = 'flex';
            
            // Reset form
            confessionForm.reset();
            charCount.textContent = '0';
            
            // Refresh messages display
            displayMessages();
        });
    }
    
    // Simulate email sending (in a real app, this would call a backend API)
    function simulateEmailSend(recipientId, recipientEmail) {
        console.log(`Simulating email send to: ${recipientEmail}`);
        
        // In a real implementation, you would:
        // 1. Send a request to your backend
        // 2. Backend sends an actual email
        // 3. Email contains a link to view the confession
        // here we should upload our link
        // For now, just log to console
        const emailContent = `
            Subject: You received a confession!
            
            Hi ${recipientId},
            
            You have received a new confession on ConfessHub!
            
            Subject: ${document.getElementById('confession-subject').value}
            
            Click here to view your confession: https://yourwebsite.com/messages.html
            
            Best regards,
            ConfessHub Team
        `;
        
        console.log('Email content:', emailContent);
        
        // Show notification
        showNotification('Email sent to ' + recipientEmail);
    }
    
    // Show notification
    function showNotification(message) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        
        // Style the notification
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background-color: #2ecc71;
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 3000;
            animation: slideIn 0.3s ease;
        `;
        
        // Add animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }
    
    // Logout functionality
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            if (confirm('Are you sure you want to logout?')) {
                sessionStorage.removeItem('currentUser');
                window.location.href = 'index.html';
            }
        });
    }
    
    // Initialize page
    loadUserProfile();
    displayMessages();
    
    // Add some sample messages if none exist
    const messages = JSON.parse(localStorage.getItem('confessionMessages')) || [];
    if (messages.length === 0) {
        const sampleMessages = [
            {
                id: 'msg_1',
                from: 'anonymous',
                to: currentUser.id,
                subject: 'I admire you',
                message: 'I just wanted to say that I really admire how you handle things in class. You\'re always so calm and collected.',
                anonymous: true,
                read: false,
                favorite: false,
                timestamp: new Date(Date.now() - 86400000).toISOString() // 1 day ago
            },
            {
                id: 'msg_2',
                from: 'N210001',
                to: currentUser.id,
                subject: 'Your presentation was great',
                message: 'Hey, I really enjoyed your presentation today. You explained everything so clearly!',
                anonymous: false,
                read: true,
                favorite: true,
                timestamp: new Date(Date.now() - 172800000).toISOString() // 2 days ago
            }
        ];
        
        localStorage.setItem('confessionMessages', JSON.stringify(sampleMessages));
        displayMessages();
    }
});