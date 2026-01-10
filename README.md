# ConfessHub - Confidential Confession Platform

A secure web application for sending anonymous or identified confessions with email notifications.

## Features
- Multi-step confession form with emoji mood selection
- User authentication system
- Email notifications (when enabled)
- Dark/Light mode toggle
- Responsive design for all devices
- Real-time message preview
- User statistics tracking

## Tech Stack
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Backend**: Node.js, Express, Nodemailer
- **Database**: LocalStorage (Frontend), JSON files (Backend)
- **Deployment**: Vercel (Frontend), Render (Backend)

## Project Structure

confession-website/
│
├── index.html                    # Home page (Anonymous/Login options)
├── login.html                   # Login page
├── messages.html                # Messages received page
├── confess.html                 # Confession writing page (multi-step form)
│
├── styles/                      # All CSS files
│   ├── main.css                # Main stylesheet (common styles)
│   ├── dark-mode.css           # Dark mode specific styles
│   ├── auth.css                # Login page styles
│   ├── messages.css            # Messages page styles
│   └── confess.css             # Confession page styles
│
├── scripts/                     # All JavaScript files
│   ├── main.js                 # Common functions (theme, session)
│   ├── auth.js                 # Authentication logic
│   ├── messages.js             # Messages page functionality
│   └── confess-enhanced.js     # Enhanced confession page with multi-step form
│
├── assets/                      # Static assets
│   ├── images/
│   │   ├── logo.png            # Website logo
│   │   ├── heart-icon.png      # Favicon/icon
│   │   └── background-pattern.png # Optional background
│   └── icons/                  # SVG icons (if not using font-awesome)
│
├── backend/                     # Backend server (Node.js/Express)
│   ├── server.js               # Main server file
│   ├── package.json            # Dependencies
│   ├── package-lock.json       # Lock file
│   ├── .env                    # Environment variables (email credentials)
│   ├── .env.example            # Example env file
│   └── README.md               # Backend documentation
│
├── docs/                       # Documentation
│   ├── deployment-guide.md     # How to deploy
│   ├── user-manual.md         # User instructions
│   └── api-documentation.md   # API endpoints
│
├── data/                       # Mock data for development
│   ├── users.json             # Sample user data
│   ├── messages.json          # Sample messages
│   └── emails.json            # Sample email logs
│
├── public/                     # Files for production
│   ├── favicon.ico            # Browser favicon
│   ├── manifest.json          # PWA manifest
│   └── robots.txt             # Search engine instructions
│
├── vercel.json                 # Vercel deployment config
├── render.yaml                 # Render deployment config
├── .gitignore                  # Git ignore file
├── README.md                   # Project documentation
├── CHANGELOG.md               # Version history
└── LICENSE                     # Project license




## Setup Instructions

### Frontend Setup
1. Clone the repository
2. Open `index.html` in a browser for local testing
3. For deployment, upload all frontend files to Vercel

### Backend Setup
1. Navigate to `/backend` folder
2. Install dependencies: `npm install`
3. Create `.env` file with your email credentials
4. Start server: `npm start`
5. Deploy to Render for production

### Email Configuration
Create `.env` file in backend folder:


## Deployment

### Deploy Frontend to Vercel:
1. Push code to GitHub repository
2. Visit [vercel.com](https://vercel.com)
3. Import your repository
4. Deploy with default settings

### Deploy Backend to Render:
1. Push code to GitHub
2. Visit [render.com](https://render.com)
3. Create new Web Service
4. Connect your repository
5. Configure environment variables
6. Deploy

## API Endpoints
- `POST /api/send-confession` - Send confession email
- `GET /api/health` - Health check
- `POST /api/auth/login` - User authentication

## User IDs Format
All user IDs follow format: `N` followed by 6 digits
Example: N210001, N210002, etc.

## Testing Accounts
Use these test credentials:
- ID: N210001, Password: password123
- ID: N210002, Password: password123
- ID: N210003, Password: password123

## License
MIT License - See LICENSE file for details

## Support
For issues or questions, please contact: [Your Email]