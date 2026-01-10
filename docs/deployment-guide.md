# Deployment Guide for ConfessHub

## Frontend Deployment (Vercel)

### Step 1: Prepare Your Code
1. Ensure all files are in the project structure
2. Test locally by opening `index.html` in browser
3. Fix any JavaScript errors in console

### Step 2: Deploy to Vercel
1. Create account on [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import your GitHub repository
4. Configure project:
   - Framework Preset: Other
   - Build Command: (leave empty)
   - Output Directory: . (dot)
   - Install Command: (leave empty)
5. Click "Deploy"

### Step 3: Get Your Frontend URL
After deployment, Vercel will provide:
- Production URL: `https://your-project.vercel.app`
- You can add custom domain if needed

## Backend Deployment (Render)

### Step 1: Prepare Backend
1. Navigate to `/backend` folder
2. Create `.env` file with your email credentials
3. Test locally: `npm start`

### Step 2: Deploy to Render
1. Create account on [render.com](https://render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure service:
   - Name: `confesshub-backend`
   - Environment: Node
   - Build Command: `npm install`
   - Start Command: `node server.js`
5. Add environment variables:
   - `EMAIL_USER`: Your Gmail address
   - `EMAIL_PASS`: App-specific password
   - `NODE_ENV`: `production`
   - `PORT`: `10000` (Render assigns port automatically)
6. Click "Create Web Service"

### Step 3: Get Your Backend URL
After deployment, Render will provide:
- Backend URL: `https://confesshub-backend.onrender.com`

## Email Configuration

### Gmail Setup:
1. Go to [Google Account](https://myaccount.google.com/)
2. Navigate to Security
3. Enable 2-Step Verification
4. Go to "App passwords"
5. Generate new app password for "Mail"
6. Use this password in your `.env` file

### Alternative Email Services:
You can also use:
- SendGrid (Recommended for production)
- Mailgun
- AWS SES

## Connect Frontend to Backend

### Update Frontend Configuration:
In `scripts/confess-enhanced.js`, update:
```javascript
// Change this URL to your Render backend URL
const BACKEND_URL = 'https://confesshub-backend.onrender.com'


##Update Email Template URLs:
##In the email template, update:


const FRONTEND_URL = 'https://your-project.vercel.app';