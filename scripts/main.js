// Main JavaScript File
// Check if user is trying to access protected pages without login
function checkProtectedPages() {
    const protectedPages = ['messages.html', 'confess.html'];
    const currentPage = window.location.pathname.split('/').pop();
    
    if (protectedPages.includes(currentPage)) {
        const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
        
        if (!currentUser) {
            // Redirect to login page
            window.location.href = 'login.html?redirect=' + currentPage.replace('.html', '');
        }
    }
}
// This handles theme switching and page navigation

// Handle login/logout button updates across all pages
function updateAuthButtons() {
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    const userActions = document.getElementById('user-actions');
    
    if (userActions) {
        if (currentUser) {
            userActions.innerHTML = `
                <span class="user-greeting" style="margin-right: 1rem; color: var(--text-secondary);">
                    <i class="fas fa-user-circle"></i> ${currentUser.name}
                </span>
                <button id="logout-btn-nav" class="logout-btn" title="Logout">
                    <i class="fas fa-sign-out-alt"></i> Logout
                </button>
            `;
            
            // Add logout event listener
            document.getElementById('logout-btn-nav').addEventListener('click', function() {
                if (confirm('Are you sure you want to logout?')) {
                    sessionStorage.removeItem('currentUser');
                    window.location.href = 'index.html';
                }
            });
        } else {
            userActions.innerHTML = `
                <a href="login.html" class="action-btn">
                    <i class="fas fa-sign-in-alt"></i> Login
                </a>
            `;
        }
    }
}

// Call this in DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    // ... existing code ...
    
    // Update auth buttons
    updateAuthButtons();
    
    // ... rest of existing code ...
});

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Theme Toggle Functionality
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeIcon = themeToggleBtn ? themeToggleBtn.querySelector('i') : null;
    
    // Check for saved theme or prefer-color-scheme
    const getPreferredTheme = () => {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            return savedTheme;
        }
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    };
    
    // Apply theme
    const applyTheme = (theme) => {
        if (theme === 'dark') {
            document.body.classList.add('dark-mode');
            if (themeIcon) themeIcon.className = 'fas fa-sun';
        } else {
            document.body.classList.remove('dark-mode');
            if (themeIcon) themeIcon.className = 'fas fa-moon';
        }
        localStorage.setItem('theme', theme);
    };
    
    // Initialize theme
    const preferredTheme = getPreferredTheme();
    applyTheme(preferredTheme);
    
    // Toggle theme when button is clicked
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const currentTheme = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            applyTheme(newTheme);
        });
    }
    
    // Home Page Navigation Logic
    const messagesBtn = document.getElementById('messages-btn');
    const confessBtn = document.getElementById('confess-btn');
    const confessOptions = document.getElementById('confess-options');
    const confessIdBtn = document.getElementById('confess-id');
    const confessAnonBtn = document.getElementById('confess-anon');
    const backBtn = document.getElementById('back-btn');
    const optionsContainer = document.querySelector('.options-container');
    
    // Show confession sub-options when Confess button is clicked
    if (confessBtn && confessOptions) {
        confessBtn.addEventListener('click', () => {
            optionsContainer.style.display = 'none';
            confessOptions.style.display = 'grid';
        });
    }
    
    // Go back to main options
    if (backBtn && optionsContainer && confessOptions) {
        backBtn.addEventListener('click', () => {
            confessOptions.style.display = 'none';
            optionsContainer.style.display = 'grid';
        });
    }
    
    // Handle "Messages Received" button click
    if (messagesBtn) {
        messagesBtn.addEventListener('click', () => {
            // Redirect to login page for messages
            window.location.href = 'login.html?redirect=messages';
        });
    }
    
    // Handle "Confess via ID" button click
    if (confessIdBtn) {
        confessIdBtn.addEventListener('click', () => {
            // Redirect to login page for confession with ID
            window.location.href = 'login.html?redirect=confess';
        });
    }
    
    // Handle "Confess Anonymously" button click
    if (confessAnonBtn) {
        confessAnonBtn.addEventListener('click', () => {
            // Redirect directly to confession page
            window.location.href = 'confess.html?type=anonymous';
        });
    }
    
    // Add click animations to option cards
    const optionCards = document.querySelectorAll('.option-card, .sub-option');
    optionCards.forEach(card => {
        card.addEventListener('click', function() {
            // Add a quick "pressed" effect
            this.style.transform = 'scale(0.98)';
            setTimeout(() => {
                this.style.transform = '';
            }, 150);
        });
    });
});