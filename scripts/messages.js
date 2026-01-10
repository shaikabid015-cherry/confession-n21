// Messages Page JavaScript - FIXED VERSION
// Handles loading messages, user profile, and confession sending

document.addEventListener('DOMContentLoaded', function() {
    console.log('Messages page loading...');
    
    // Check if user is logged in
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    
    if (!currentUser) {
        console.log('No user found, redirecting to login');
        // Redirect to login if not logged in
        window.location.href = 'login.html?redirect=messages';
        return;
    }
    
    console.log('User logged in:', currentUser.id);
    
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
        console.log('Loading user profile for:', currentUser.name);
        
        userName.textContent = currentUser.name;
        userId.textContent = `ID: ${currentUser.id}`;
        userEmail.textContent = currentUser.email;
        
        // Set profile picture
        if (currentUser.profilePic) {
            profilePic.src = currentUser.profilePic;
            profilePic.onerror = function() {
                // Fallback if image fails to load
                this.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.id}`;
            };
        } else {
            // Default profile picture
            profilePic.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.id}`;
        }
    }
    
    // Initialize messages data - NO SAMPLE MESSAGES
    function initializeMessages() {
        const messages = JSON.parse(localStorage.getItem('confessionMessages')) || [];
        console.log('Total messages in storage:', messages.length);
        
        // Filter messages for current user
        const userMessages = messages.filter(msg => msg.to === currentUser.id);
        console.log('Messages for current user:', userMessages.length);
        
        // Filter messages sent by current user
        const sentMessages = messages.filter(msg => msg.from === currentUser.id);
        
        // Count unread messages
        const unreadCount = userMessages.filter(msg => !msg.read).length;
        
        // Update statistics
        totalMessagesEl.textContent = userMessages.length;
        unreadMessagesEl.textContent = unreadCount;
        sentConfessionsEl.textContent = sentMessages.length;
        
        return userMessages;
    }
    
    // Display messages
    function displayMessages(messages = null) {
        const userMessages = messages || initializeMessages();
        
        // Clear current messages
        messagesList.innerHTML = '';
        
        if (userMessages.length === 0) {
            // Show empty state - NO SAMPLE MESSAGES
            messagesList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <i class="fas fa-envelope-open-text"></i>
                    </div>
                    <h3>Your inbox is empty</h3>
                    <p>No confessions received yet.</p>
                    <p class="hint">Share your ID <strong>${currentUser.id}</strong> with friends to receive confessions!</p>
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
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            // Determine sender display name
            let senderDisplay;
            let senderId = '';
            
            if (message.anonymous) {
                senderDisplay = '<span class="message-sender message-anonymous">Anonymous</span>';
            } else {
                // Try to get sender name from users data
                const users = JSON.parse(localStorage.getItem('confessionUsers')) || [];
                const sender = users.find(u => u.id === message.from);
                if (sender) {
                    senderDisplay = `<span class="message-sender">${sender.name}</span>`;
                    senderId = `<span class="sender-id">(${sender.id})</span>`;
                } else {
                    senderDisplay = `<span class="message-sender">${message.fromName || 'Unknown User'}</span>`;
                    senderId = `<span class="sender-id">(${message.from})</span>`;
                }
            }
            
            messageElement.innerHTML = `
                <div class="message-header">
                    <div>
                        <div class="sender-info">
                            ${senderDisplay} ${senderId}
                        </div>
                        <div class="message-time">${formattedDate}</div>
                    </div>
                </div>
                <div class="message-subject">${message.subject || 'No subject'}</div>
                <div class="message-preview">${message.message.substring(0, 150)}${message.message.length > 150 ? '...' : ''}</div>
                <div class="message-actions">
                    <button class="message-action-btn favorite-btn ${message.favorite ? 'active' : ''}" title="Favorite">
                        <i class="fas fa-star"></i>
                    </button>
                    <button class="message-action-btn delete-btn" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                    ${!message.read ? '<button class="message-action-btn mark-read-btn" title="Mark as read"><i class="fas fa-check"></i></button>' : ''}
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
        addMessageActionListeners();
    }
    
    // Add event listeners to message action buttons
    function addMessageActionListeners() {
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
        
        document.querySelectorAll('.mark-read-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const messageId = this.closest('.message-item').dataset.id;
                markAsRead(messageId);
            });
        });
    }
    
    // View a specific message
    function viewMessage(messageId) {
        console.log('Viewing message:', messageId);
        
        const messages = JSON.parse(localStorage.getItem('confessionMessages')) || [];
        const messageIndex = messages.findIndex(msg => msg.id === messageId);
        
        if (messageIndex !== -1) {
            // Mark as read if not already read
            if (!messages[messageIndex].read) {
                messages[messageIndex].read = true;
                localStorage.setItem('confessionMessages', JSON.stringify(messages));
                
                // Update display
                initializeMessages();
                displayMessages();
            }
            
            // Show message details
            showMessageDetails(messages[messageIndex]);
        }
    }
    
    // Show message details in a modal
    function showMessageDetails(message) {
        // Create modal if it doesn't exist
        let detailModal = document.getElementById('message-detail-modal');
        
        if (!detailModal) {
            detailModal = document.createElement('div');
            detailModal.id = 'message-detail-modal';
            detailModal.className = 'modal';
            detailModal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h2><i class="fas fa-envelope"></i> Message Details</h2>
                        <button class="close-detail-modal">&times;</button>
                    </div>
                    <div class="modal-body" id="detail-modal-body">
                        <!-- Content will be inserted here -->
                    </div>
                    <div class="modal-footer">
                        <button class="ok-btn close-detail-modal">Close</button>
                    </div>
                </div>
            `;
            document.body.appendChild(detailModal);
            
            // Add close event
            detailModal.querySelector('.close-detail-modal').addEventListener('click', function() {
                detailModal.style.display = 'none';
            });
            
            // Close when clicking outside
            detailModal.addEventListener('click', function(e) {
                if (e.target === detailModal) {
                    detailModal.style.display = 'none';
                }
            });
        }
        
        // Format date
        const messageDate = new Date(message.timestamp);
        const formattedDate = messageDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Get sender info
        let senderInfo = 'Anonymous';
        if (!message.anonymous) {
            const users = JSON.parse(localStorage.getItem('confessionUsers')) || [];
            const sender = users.find(u => u.id === message.from);
            senderInfo = sender ? `${sender.name} (${sender.id})` : message.from;
        }
        
        // Populate modal
        document.getElementById('detail-modal-body').innerHTML = `
            <div class="message-detail-header">
                <div class="detail-sender">
                    <strong>From:</strong> ${senderInfo}
                </div>
                <div class="detail-time">
                    <strong>Received:</strong> ${formattedDate}
                </div>
            </div>
            <div class="message-detail-subject">
                <strong>Subject:</strong> ${message.subject || 'No subject'}
            </div>
            <div class="message-detail-content">
                ${message.message.replace(/\n/g, '<br>')}
            </div>
        `;
        
        // Show modal
        detailModal.style.display = 'flex';
    }
    
    // Toggle favorite status
    function toggleFavorite(messageId) {
        const messages = JSON.parse(localStorage.getItem('confessionMessages')) || [];
        const messageIndex = messages.findIndex(msg => msg.id === messageId);
        
        if (messageIndex !== -1) {
            messages[messageIndex].favorite = !messages[messageIndex].favorite;
            localStorage.setItem('confessionMessages', JSON.stringify(messages));
            
            // Show notification
            showNotification(`Message ${messages[messageIndex].favorite ? 'added to' : 'removed from'} favorites`);
            
            displayMessages();
        }
    }
    
    // Mark message as read
    function markAsRead(messageId) {
        const messages = JSON.parse(localStorage.getItem('confessionMessages')) || [];
        const messageIndex = messages.findIndex(msg => msg.id === messageId);
        
        if (messageIndex !== -1 && !messages[messageIndex].read) {
            messages[messageIndex].read = true;
            localStorage.setItem('confessionMessages', JSON.stringify(messages));
            
            showNotification('Message marked as read');
            displayMessages();
        }
    }
    
    // Delete a message
    function deleteMessage(messageId) {
        if (!confirm('Are you sure you want to delete this message? This action cannot be undone.')) {
            return;
        }
        
        const messages = JSON.parse(localStorage.getItem('confessionMessages')) || [];
        const updatedMessages = messages.filter(msg => msg.id !== messageId);
        localStorage.setItem('confessionMessages', JSON.stringify(updatedMessages));
        
        showNotification('Message deleted');
        displayMessages();
    }
    
    // Mark all messages as read
    if (markAllReadBtn) {
        markAllReadBtn.addEventListener('click', function() {
            const messages = JSON.parse(localStorage.getItem('confessionMessages')) || [];
            let updated = false;
            
            const updatedMessages = messages.map(msg => {
                if (msg.to === currentUser.id && !msg.read) {
                    updated = true;
                    return { ...msg, read: true };
                }
                return msg;
            });
            
            if (updated) {
                localStorage.setItem('confessionMessages', JSON.stringify(updatedMessages));
                showNotification('All messages marked as read');
                displayMessages();
            } else {
                showNotification('No unread messages');
            }
        });
    }
    
    // Refresh messages
    if (refreshMessagesBtn) {
        refreshMessagesBtn.addEventListener('click', function() {
            // Add a spin animation to the refresh button
            const icon = this.querySelector('i');
            icon.classList.add('fa-spin');
            
            // Refresh messages after a short delay
            setTimeout(() => {
                displayMessages();
                icon.classList.remove('fa-spin');
                showNotification('Messages refreshed');
            }, 500);
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
                charCount.innerHTML = `${length} <small>(Too long!)</small>`;
            } else if (length > 800) {
                charCount.style.color = '#f39c12';
                charCount.textContent = length;
            } else {
                charCount.style.color = '';
                charCount.textContent = length;
            }
        });
    }
    
    // Modal controls
    if (floatingWriteBtn) {
        floatingWriteBtn.addEventListener('click', function() {
            if (confessionModal) {
                confessionModal.style.display = 'flex';
                // Focus on first input
                document.getElementById('to-id')?.focus();
            }
        });
    }
    
    closeModalBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            if (confessionModal) confessionModal.style.display = 'none';
            if (confessionForm) {
                confessionForm.reset();
                if (charCount) charCount.textContent = '0';
            }
        });
    });
    
    closeSuccessModalBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            if (successModal) successModal.style.display = 'none';
        });
    });
    
    // Close modal when clicking outside
    window.addEventListener('click', function(e) {
        if (confessionModal && e.target === confessionModal) {
            confessionModal.style.display = 'none';
            if (confessionForm) {
                confessionForm.reset();
                if (charCount) charCount.textContent = '0';
            }
        }
        if (successModal && e.target === successModal) {
            successModal.style.display = 'none';
        }
    });
    
    // Handle confession form submission - FIXED VERSION
    if (confessionForm) {
        confessionForm.addEventListener('submit', function(e) {
            e.preventDefault();
            console.log('Confession form submitted from messages page');
            
            const toId = document.getElementById('to-id')?.value.trim().toUpperCase();
            const subject = document.getElementById('confession-subject')?.value.trim();
            const message = document.getElementById('confession-message')?.value.trim();
            const anonymous = document.getElementById('anonymous-send')?.checked || false;
            const sendEmail = document.getElementById('send-email')?.checked || false;
            
            console.log('Form data:', { toId, subject, message, anonymous, sendEmail });
            
            // Validate recipient ID format
            const idPattern = /^N\d{6}$/;
            if (!idPattern.test(toId)) {
                alert('❌ Invalid recipient ID format. Please use N followed by 6 digits (e.g., N210001).');
                return;
            }
            
            // Check if recipient exists
            const users = JSON.parse(localStorage.getItem('confessionUsers')) || [];
            const recipient = users.find(u => u.id === toId);
            
            if (!recipient) {
                alert('❌ Recipient ID not found. Please check the ID and try again.');
                return;
            }
            
            // Check if trying to send to self
            if (toId === currentUser.id) {
                alert('❌ You cannot send a confession to yourself.');
                return;
            }
            
            // Validate message
            if (!message || message.trim().length < 5) {
                alert('❌ Please write a confession message (at least 5 characters).');
                return;
            }
            
            if (message.length > 1000) {
                alert('❌ Message is too long. Maximum 1000 characters allowed.');
                return;
            }
            
            // Create message object
            const newMessage = {
                id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                from: anonymous ? 'anonymous' : currentUser.id,
                fromName: anonymous ? 'Anonymous' : currentUser.name,
                to: toId,
                toName: recipient.name,
                toEmail: recipient.email,
                subject: subject || 'A confession for you',
                message: message,
                anonymous: anonymous,
                read: false,
                favorite: false,
                timestamp: new Date().toISOString(),
                sendEmail: sendEmail
            };
            
            console.log('New message created:', newMessage);
            
            // Save to localStorage
            const messages = JSON.parse(localStorage.getItem('confessionMessages')) || [];
            messages.push(newMessage);
            localStorage.setItem('confessionMessages', JSON.stringify(messages));
            console.log('Message saved to localStorage');
            
            // Simulate email sending
            if (sendEmail) {
                simulateEmailSend(newMessage);
            }
            
            // Close confession modal and show success
            if (confessionModal) confessionModal.style.display = 'none';
            if (successModal) {
                // Update success message
                const emailStatus = successModal.querySelector('#email-status') || 
                    successModal.querySelector('p:nth-child(4)');
                if (emailStatus) {
                    if (sendEmail) {
                        emailStatus.textContent = 'The recipient has been notified via email.';
                    } else {
                        emailStatus.textContent = 'The recipient will see this confession when they check their messages.';
                    }
                }
                successModal.style.display = 'flex';
            }
            
            // Reset form
            confessionForm.reset();
            if (charCount) charCount.textContent = '0';
            
            // Refresh messages display
            displayMessages();
            
            // Update statistics
            initializeMessages();
        });
    }
    
    // Simulate email sending - FIXED VERSION
    function simulateEmailSend(message) {
        console.log(`📧 Simulating email send to: ${message.toEmail}`);
        
        // Create email log entry
        const emailData = {
            to: message.toEmail,
            subject: `You received a confession!`,
            body: `
                Hi ${message.toName},
                
                You have received a confession on ConfessHub!
                
                From: ${message.anonymous ? 'Someone anonymous' : message.fromName}
                ${message.subject ? `Subject: ${message.subject}` : ''}
                
                Message preview: "${message.message.substring(0, 100)}..."
                
                Click here to view: ${window.location.origin}/messages.html
                
                Best regards,
                ConfessHub Team
            `,
            timestamp: new Date().toISOString(),
            status: 'sent'
        };
        
        // Store email in localStorage (for demo)
        const emails = JSON.parse(localStorage.getItem('confessionEmails')) || [];
        emails.push(emailData);
        localStorage.setItem('confessionEmails', JSON.stringify(emails));
        
        console.log('Email logged:', emailData);
        showNotification(`📧 Email sent to ${message.toName}`);
    }
    
    // Show notification
    function showNotification(message) {
        // Check if notification function exists in main.js
        if (window.confessHub && window.confessHub.showNotification) {
            window.confessHub.showNotification(message, 'success');
            return;
        }
        
        // Fallback notification
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
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
        
        document.body.appendChild(notification);
        
        // Add animation style if not exists
        if (!document.querySelector('#notification-anim')) {
            const style = document.createElement('style');
            style.id = 'notification-anim';
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
        }
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    document.body.removeChild(notification);
                }
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
    
    // Initialize page - NO SAMPLE MESSAGES
    function initPage() {
        console.log('Initializing messages page...');
        loadUserProfile();
        displayMessages();
        
        // Show floating button for logged in users
        if (floatingWriteBtn) {
            floatingWriteBtn.style.display = 'flex';
        }
    }
    
    // Start the page
    initPage();
});
