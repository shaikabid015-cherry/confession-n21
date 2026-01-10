// Enhanced Confession Page JavaScript - UPDATED VERSION
// Multi-step form with emoji selector and email integration

document.addEventListener('DOMContentLoaded', function() {
    // Check login status
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    const urlParams = new URLSearchParams(window.location.search);
    const confessionType = urlParams.get('type'); // 'viaId' or 'anonymous'
    
    // DOM Elements
    const userPanel = document.getElementById('user-panel');
    const userActions = document.getElementById('user-actions');
    const confessProfilePic = document.getElementById('confess-profile-pic');
    const confessUserName = document.getElementById('confess-user-name');
    const confessUserId = document.getElementById('confess-user-id');
    const confessionTypeEl = document.getElementById('confession-type');
    const sentCountEl = document.getElementById('sent-count');
    const receivedCountEl = document.getElementById('received-count');
    const viewMessagesBtn = document.getElementById('view-messages-btn');
    const logoutBtn = document.getElementById('logout-confess-btn');
    const floatingMessagesBtn = document.getElementById('floating-messages-btn');
    
    const confessionForm = document.getElementById('confession-form');
    const recipientIdInput = document.getElementById('recipient-id');
    const recipientPreview = document.getElementById('recipient-preview');
    const confessionMessage = document.getElementById('confession-message');
    const charCount = document.getElementById('char-count');
    const selectedEmoji = document.getElementById('selected-emoji');
    const moodText = document.getElementById('mood-text');
    const anonymousCheckbox = document.getElementById('anonymous');
    const sendEmailCheckbox = document.getElementById('send-email');
    const confirmSendCheckbox = document.getElementById('confirm-send');
    
    // Review elements
    const reviewTo = document.getElementById('review-to');
    const reviewFrom = document.getElementById('review-from');
    const reviewEmail = document.getElementById('review-email');
    const reviewEmoji = document.getElementById('review-emoji');
    const reviewMessage = document.getElementById('review-message');
    
    // Navigation buttons
    const nextBtn1 = document.getElementById('next-1');
    const nextBtn2 = document.getElementById('next-2');
    const backBtn2 = document.getElementById('back-2');
    const backBtn3 = document.getElementById('back-3');
    const sendConfessionBtn = document.getElementById('send-confession');
    
    // Progress steps
    const progressSteps = document.querySelectorAll('.progress-step');
    const formSteps = document.querySelectorAll('.form-step');
    
    // Modals
    const successModal = document.getElementById('success-modal');
    const errorModal = document.getElementById('error-modal');
    const closeModalBtns = document.querySelectorAll('.close-modal, .close-error-modal');
    const goToMessagesBtn = document.getElementById('go-to-messages-btn');
    
    // Current form state
    let currentStep = 1;
    let selectedMood = {
        emoji: '😊',
        text: 'Happy'
    };
    let recipientInfo = null;
    
    // Mood mapping
    const moodMap = {
        '😊': 'Happy',
        '❤️': 'Love',
        '😍': 'Adoring',
        '😢': 'Sad',
        '😎': 'Cool',
        '🤔': 'Thoughtful',
        '😇': 'Innocent',
        '🥰': 'Loving'
    };
    
    // Initialize page
    function initPage() {
        // Update user info if logged in
        if (currentUser) {
            // Show user panel
            userPanel.style.display = 'flex';
            
            // Update user info
            confessProfilePic.src = currentUser.profilePic || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.id}`;
            confessUserName.textContent = currentUser.name;
            confessUserId.textContent = currentUser.id;
            confessionTypeEl.textContent = 'Via ID Confession';
            
            // Show logout button in nav
            userActions.innerHTML = `
                <button id="logout-btn-nav" class="logout-btn" title="Logout">
                    <i class="fas fa-sign-out-alt"></i> Logout
                </button>
            `;
            
            // Show floating messages button
            floatingMessagesBtn.style.display = 'flex';
            
            // Load user stats
            updateUserStats();
            
            // Set anonymous checkbox based on confession type
            if (confessionType === 'viaId') {
                anonymousCheckbox.checked = false;
                anonymousCheckbox.disabled = false;
            }
        } else {
            // Anonymous user
            userPanel.style.display = 'none';
            confessionTypeEl.textContent = 'Anonymous Confession';
            anonymousCheckbox.checked = true;
            anonymousCheckbox.disabled = true;
            
            // Show login button in nav
            userActions.innerHTML = `
                <a href="login.html?redirect=confess" class="action-btn">
                    <i class="fas fa-sign-in-alt"></i> Login
                </a>
            `;
        }
        
        // Initialize emoji selection
        initEmojiSelection();
        
        // Initialize form steps
        updateFormSteps();
        
        // Set up event listeners
        setupEventListeners();
        
        // Auto-validate recipient ID if returning to step 1
        if (recipientIdInput.value) {
            validateRecipientId();
        }
    }
    
    // Update user statistics
    function updateUserStats() {
        if (!currentUser) return;
        
        const messages = JSON.parse(localStorage.getItem('confessionMessages')) || [];
        
        // Count sent confessions
        const sentCount = messages.filter(msg => msg.from === currentUser.id).length;
        sentCountEl.textContent = sentCount;
        
        // Count received confessions
        const receivedCount = messages.filter(msg => msg.to === currentUser.id).length;
        receivedCountEl.textContent = receivedCount;
    }
    
    // Initialize emoji selection
    function initEmojiSelection() {
        const emojiButtons = document.querySelectorAll('.emoji-btn');
        
        emojiButtons.forEach(button => {
            button.addEventListener('click', function() {
                // Remove active class from all buttons
                emojiButtons.forEach(btn => btn.classList.remove('active'));
                
                // Add active class to clicked button
                this.classList.add('active');
                
                // Update selected mood
                const emoji = this.dataset.emoji;
                selectedMood = {
                    emoji: emoji,
                    text: moodMap[emoji] || 'Mood'
                };
                
                // Update UI
                selectedEmoji.textContent = emoji;
                moodText.textContent = selectedMood.text;
                reviewEmoji.textContent = emoji;
            });
        });
        
        // Set default emoji as active
        const defaultEmojiBtn = document.querySelector('.emoji-btn[data-emoji="😊"]');
        if (defaultEmojiBtn) {
            defaultEmojiBtn.classList.add('active');
        }
    }
    
    // Set up event listeners
    function setupEventListeners() {
        // Recipient ID validation (real-time)
        recipientIdInput.addEventListener('input', validateRecipientId);
        
        // Character counter
        confessionMessage.addEventListener('input', updateCharCount);
        
        // Anonymous checkbox
        anonymousCheckbox.addEventListener('change', function() {
            updateReviewFrom();
        });
        
        // Send email checkbox
        sendEmailCheckbox.addEventListener('change', function() {
            reviewEmail.textContent = this.checked ? 'Yes' : 'No';
        });
        
        // Form navigation
        nextBtn1.addEventListener('click', goToStep2);
        nextBtn2.addEventListener('click', goToStep3);
        backBtn2.addEventListener('click', goToStep1);
        backBtn3.addEventListener('click', goToStep2);
        
        // Form submission
        confessionForm.addEventListener('submit', handleFormSubmit);
        
        // Buttons
        viewMessagesBtn.addEventListener('click', function() {
            if (currentUser) {
                window.location.href = 'messages.html';
            } else {
                window.location.href = 'login.html?redirect=messages';
            }
        });
        
        floatingMessagesBtn.addEventListener('click', function() {
            if (currentUser) {
                window.location.href = 'messages.html';
            }
        });
        
        goToMessagesBtn.addEventListener('click', function() {
            if (currentUser) {
                window.location.href = 'messages.html';
            } else {
                window.location.href = 'index.html';
            }
        });
        
        // Modal controls
        closeModalBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                successModal.style.display = 'none';
                errorModal.style.display = 'none';
            });
        });
        
        window.addEventListener('click', function(e) {
            if (e.target === successModal) successModal.style.display = 'none';
            if (e.target === errorModal) errorModal.style.display = 'none';
        });
        
        // Logout buttons
        document.addEventListener('click', function(e) {
            // Logout from panel button
            if (e.target.id === 'logout-confess-btn' || e.target.closest('#logout-confess-btn')) {
                handleLogout();
            }
            // Logout from nav button
            if (e.target.id === 'logout-btn-nav' || e.target.closest('#logout-btn-nav')) {
                handleLogout();
            }
        });
    }
    
    // Handle logout
    function handleLogout() {
        if (confirm('Are you sure you want to logout?')) {
            sessionStorage.removeItem('currentUser');
            window.location.href = 'index.html';
        }
    }
    
    // Validate recipient ID
    function validateRecipientId() {
        const id = recipientIdInput.value.trim().toUpperCase();
        const idPattern = /^N\d{6}$/;
        
        // Enable/disable next button based on validation
        nextBtn1.disabled = true;
        
        if (idPattern.test(id)) {
            // Check if recipient exists
            const users = JSON.parse(localStorage.getItem('confessionUsers')) || [];
            recipientInfo = users.find(user => user.id === id);
            
            if (recipientInfo) {
                // Check if trying to send to self
                if (currentUser && recipientInfo.id === currentUser.id) {
                    showRecipientError('You cannot send a confession to yourself.');
                    return false;
                }
                
                // Show recipient preview
                showRecipientPreview(recipientInfo);
                nextBtn1.disabled = false;
                return true;
            } else {
                // Recipient not found
                showRecipientError('User not found. Please check the ID.');
                return false;
            }
        } else if (id.length > 0) {
            // Invalid format
            showRecipientError('Invalid format. Use N followed by 6 digits (e.g., N210001).');
            return false;
        } else {
            // Empty input
            showRecipientPlaceholder();
            return false;
        }
    }
    
    // Show recipient preview
    function showRecipientPreview(recipient) {
        recipientPreview.innerHTML = `
            <div class="recipient-details">
                <img src="${recipient.profilePic || `https://api.dicebear.com/7.x/avataaars/svg?seed=${recipient.id}`}" 
                     alt="${recipient.name}" class="recipient-avatar">
                <div class="recipient-info">
                    <h4>${recipient.name}</h4>
                    <p>${recipient.id}</p>
                    <p>${recipient.email}</p>
                </div>
            </div>
        `;
        
        // Update review section
        reviewTo.textContent = `${recipient.name} (${recipient.id})`;
    }
    
    // Show recipient error
    function showRecipientError(message) {
        recipientPreview.innerHTML = `
            <div class="preview-placeholder">
                <i class="fas fa-exclamation-circle" style="color: #e74c3c;"></i>
                <p style="color: #e74c3c; margin-top: 0.5rem;">${message}</p>
            </div>
        `;
    }
    
    // Show recipient placeholder
    function showRecipientPlaceholder() {
        recipientPreview.innerHTML = `
            <div class="preview-placeholder">
                <i class="fas fa-user-circle"></i>
                <p>Enter a valid ID to see recipient details</p>
            </div>
        `;
    }
    
    // Update character count
    function updateCharCount() {
        const length = confessionMessage.value.length;
        charCount.textContent = length;
        
        // Color coding for character count
        if (length > 1000) {
            charCount.style.color = '#e74c3c';
            charCount.textContent += ' (Too long!)';
        } else if (length > 800) {
            charCount.style.color = '#f39c12';
        } else {
            charCount.style.color = '';
        }
        
        // Update review message
        reviewMessage.textContent = confessionMessage.value || 'Your confession message will appear here...';
    }
    
    // Update review from field
    function updateReviewFrom() {
        if (anonymousCheckbox.checked || !currentUser) {
            reviewFrom.textContent = 'Anonymous';
        } else {
            reviewFrom.textContent = currentUser.name;
        }
    }
    
    // Form step navigation
    function goToStep2() {
        if (!validateRecipientId()) {
            showError('Please enter a valid recipient ID.');
            return;
        }
        
        currentStep = 2;
        updateFormSteps();
    }
    
    function goToStep3() {
        const message = confessionMessage.value.trim();
        
        if (!message || message.length < 10) {
            showError('Please write a confession message (at least 10 characters).');
            return;
        }
        
        if (message.length > 1000) {
            showError('Message is too long. Maximum 1000 characters allowed.');
            return;
        }
        
        // Update review section
        updateReviewFrom();
        reviewEmail.textContent = sendEmailCheckbox.checked ? 'Yes' : 'No';
        reviewMessage.textContent = confessionMessage.value;
        
        currentStep = 3;
        updateFormSteps();
    }
    
    function goToStep1() {
        currentStep = 1;
        updateFormSteps();
    }
    
    function goToStep2From3() {
        currentStep = 2;
        updateFormSteps();
    }
    
    // Update form steps UI
    function updateFormSteps() {
        // Update progress steps
        progressSteps.forEach((step, index) => {
            const stepNumber = index + 1;
            
            if (stepNumber < currentStep) {
                step.classList.add('completed');
                step.classList.remove('active');
            } else if (stepNumber === currentStep) {
                step.classList.add('active');
                step.classList.remove('completed');
            } else {
                step.classList.remove('active', 'completed');
            }
        });
        
        // Update form steps visibility
        formSteps.forEach((step, index) => {
            if (index + 1 === currentStep) {
                step.classList.add('active');
            } else {
                step.classList.remove('active');
            }
        });
        
        // Scroll to top of form when changing steps
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    
    // Handle form submission
    async function handleFormSubmit(e) {
        e.preventDefault();
        
        if (!confirmSendCheckbox.checked) {
            showError('Please confirm that your confession is respectful and appropriate.');
            return;
        }
        
        // Disable submit button to prevent double submission
        sendConfessionBtn.disabled = true;
        sendConfessionBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
        
        try {
            // Create message object
            const newMessage = {
                id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                from: anonymousCheckbox.checked || !currentUser ? 'anonymous' : currentUser.id,
                fromName: anonymousCheckbox.checked || !currentUser ? 'Anonymous' : (currentUser ? currentUser.name : 'Anonymous'),
                to: recipientInfo.id,
                toName: recipientInfo.name,
                toEmail: recipientInfo.email,
                subject: `${selectedMood.emoji} ${selectedMood.text} Confession`,
                message: confessionMessage.value.trim(),
                mood: selectedMood,
                anonymous: anonymousCheckbox.checked || !currentUser,
                read: false,
                favorite: false,
                timestamp: new Date().toISOString(),
                sendEmail: sendEmailCheckbox.checked
            };
            
            // Save to localStorage
            const messages = JSON.parse(localStorage.getItem('confessionMessages')) || [];
            messages.push(newMessage);
            localStorage.setItem('confessionMessages', JSON.stringify(messages));
            
            // Send email if requested
            let emailSent = false;
            if (sendEmailCheckbox.checked) {
                emailSent = await sendEmailNotification(newMessage);
            }
            
            // Show success modal
            const emailStatus = document.getElementById('email-status');
            if (sendEmailCheckbox.checked && emailSent) {
                emailStatus.textContent = 'The recipient has been notified via email.';
            } else if (sendEmailCheckbox.checked && !emailSent) {
                emailStatus.textContent = 'Confession saved, but email notification failed. The recipient will see it when they check messages.';
            } else {
                emailStatus.textContent = 'The recipient will see this confession when they check their messages.';
            }
            
            successModal.style.display = 'flex';
            
            // Reset form for next confession
            setTimeout(() => {
                resetFormForNextConfession();
            }, 1500);
            
        } catch (error) {
            console.error('Error sending confession:', error);
            showError('Failed to send confession. Please try again.');
            
            // Re-enable submit button
            sendConfessionBtn.disabled = false;
            sendConfessionBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Confession';
        }
    }
    
    // Reset form for next confession
    function resetFormForNextConfession() {
        confessionForm.reset();
        currentStep = 1;
        updateFormSteps();
        showRecipientPlaceholder();
        charCount.textContent = '0';
        selectedEmoji.textContent = '😊';
        moodText.textContent = 'Happy';
        reviewEmoji.textContent = '😊';
        reviewMessage.textContent = 'Your confession message will appear here...';
        reviewFrom.textContent = 'Anonymous';
        reviewEmail.textContent = 'Yes';
        reviewTo.textContent = 'N210001';
        
        // Reset emoji selection
        const emojiButtons = document.querySelectorAll('.emoji-btn');
        emojiButtons.forEach(btn => btn.classList.remove('active'));
        document.querySelector('.emoji-btn[data-emoji="😊"]').classList.add('active');
        
        // Reset form state
        recipientInfo = null;
        selectedMood = { emoji: '😊', text: 'Happy' };
        
        // Re-enable submit button
        sendConfessionBtn.disabled = false;
        sendConfessionBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Confession';
        
        // Update user stats
        updateUserStats();
        
        // Auto-focus on recipient ID field
        recipientIdInput.focus();
    }
    
    // Send email notification - REAL IMPLEMENTATION
    async function sendEmailNotification(message) {
        // For now, we'll simulate email sending
        // In production, replace with actual API call
        
        try {
            // Simulate API delay
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Create email data
            const emailData = {
                to: message.toEmail,
                subject: `You received a confession! ${message.mood.emoji}`,
                html: createEmailHTML(message),
                confessionId: message.id,
                timestamp: new Date().toISOString()
            };
            
             //In production, make API call:
             const response = await fetch('https://confession-backend-g25a.onrender.com', {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify(emailData)
             });
            
            // For now, store in localStorage for demo
            //const emails = JSON.parse(localStorage.getItem('confessionEmails')) || [];
            /*emails.push({
                ...emailData,
                sentAt: new Date().toISOString(),
                status: 'sent',
                simulated: true // Remove in production
            });*/
            localStorage.setItem('confessionEmails', JSON.stringify(emails));
            
            console.log('Email sent (simulated):', emailData);
            return true;
            
        } catch (error) {
            console.error('Failed to send email:', error);
            
            // Store failed email attempt
            const failedEmails = JSON.parse(localStorage.getItem('failedEmails')) || [];
            failedEmails.push({
                message: message,
                error: error.message,
                timestamp: new Date().toISOString()
            });
            localStorage.setItem('failedEmails', JSON.stringify(failedEmails));
            
            return false;
        }
    }
    
    // Create HTML for email
    function createEmailHTML(message) {
        // Get current URL for the view button
        const currentUrl = window.location.origin || 'https://your-confesshub-site.com';
        const viewUrl = `${currentUrl}/messages.html`;
        
        // Get your website name
        const siteName = 'ConfessHub';
        const siteUrl = currentUrl;
        
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>You received a confession!</title>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #6a11cb, #2575fc); padding: 30px; text-align: center; color: white; border-radius: 10px 10px 0 0; }
                    .content { background-color: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
                    .confession-box { background: white; border-radius: 10px; padding: 20px; margin: 20px 0; border-left: 5px solid #6a11cb; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .btn { display: inline-block; background: linear-gradient(135deg, #6a11cb, #2575fc); color: white; padding: 15px 30px; text-decoration: none; border-radius: 30px; font-weight: bold; margin: 20px 0; }
                    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
                    .emoji-large { font-size: 40px; margin-bottom: 10px; }
                    .sender { color: #666; font-style: italic; margin-top: 10px; }
                    .preview { color: #666; font-style: italic; border-left: 3px solid #eee; padding-left: 15px; margin: 15px 0; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1 style="margin: 0; font-size: 28px;">You received a confession! ${message.mood.emoji}</h1>
                </div>
                
                <div class="content">
                    <p>Hello <strong>${message.toName}</strong>,</p>
                    
                    <p>Someone has sent you a confession on <strong>${siteName}</strong>!</p>
                    
                    <div class="confession-box">
                        <div class="emoji-large">${message.mood.emoji}</div>
                        <h3 style="margin: 10px 0; color: #6a11cb;">${message.mood.text} Confession</h3>
                        
                        <div class="preview">
                            "${message.message.substring(0, 200)}${message.message.length > 200 ? '...' : ''}"
                        </div>
                        
                        <div class="sender">
                            <strong>From:</strong> ${message.anonymous ? 'Someone anonymous' : message.fromName}
                        </div>
                    </div>
                    
                    <div style="text-align: center;">
                        <a href="${viewUrl}" class="btn">View Full Confession</a>
                    </div>
                    
                    <p style="text-align: center; color: #666; font-size: 14px;">
                        This message was sent from ${siteName}.<br>
                        Please do not reply to this email.
                    </p>
                </div>
                
                <div class="footer">
                    <p>&copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.</p>
                    <p><a href="${siteUrl}" style="color: #6a11cb;">Visit our website</a> | <a href="${siteUrl}/privacy" style="color: #6a11cb;">Privacy Policy</a></p>
                    <p>This is an automated message. If you didn't expect this email, please ignore it.</p>
                </div>
            </body>
            </html>
        `;
    }
    
    // Show error modal
    function showError(message) {
        const errorTitle = document.getElementById('error-title');
        const errorMessage = document.getElementById('error-message');
        
        errorTitle.textContent = 'Error';
        errorMessage.textContent = message;
        errorModal.style.display = 'flex';
        
        // Auto-close error modal after 5 seconds
        setTimeout(() => {
            if (errorModal.style.display === 'flex') {
                errorModal.style.display = 'none';
            }
        }, 5000);
    }
    
    // Initialize the page
    initPage();
    
    // Add keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + Enter to submit form on step 3
        if (currentStep === 3 && (e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            if (!sendConfessionBtn.disabled) {
                confessionForm.dispatchEvent(new Event('submit'));
            }
        }
        
        // Escape to go back
        if (e.key === 'Escape' && currentStep > 1) {
            if (currentStep === 3) goToStep2();
            if (currentStep === 2) goToStep1();
        }
    });

});
