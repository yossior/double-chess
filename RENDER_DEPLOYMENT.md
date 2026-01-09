# Chess Application - Render Deployment Guide

## Prerequisites
- GitHub account with your chess repository
- MongoDB Atlas account (free tier works: https://www.mongodb.com/cloud/atlas)
- Render account (https://render.com)

## Step 1: Prepare Your GitHub Repository

### 1.1 Push Your Code to GitHub
```bash
# Initialize git if not already done
git init
git add .
git commit -m "Initial commit for Render deployment"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/chess.git
git push -u origin main
```

### 1.2 Verify Required Files Exist
Ensure these files are in your repository root:
- `render.yaml` ✓ (created)
- `.env.example` ✓ (created)
- `package.json` ✓ (updated)
- `chess-server/package.json` ✓ (updated)
- `chess-front/package.json` (existing)

## Step 2: Set Up MongoDB Atlas

### 2.1 Create a Free MongoDB Cluster
1. Go to https://www.mongodb.com/cloud/atlas
2. Create a free account
3. Click "Create a Deployment" → Select "Free" tier
4. Choose your region and cluster name
5. Create a database user:
   - Username: `chess_user`
   - Generate a secure password
6. Save your connection string (you'll need it in Step 3)

### 2.2 Get Your MongoDB Connection String
- In MongoDB Atlas, go to "Database" → "Connect"
- Copy the "Node.js" connection string
- It will look like: `mongodb+srv://chess_user:PASSWORD@cluster.mongodb.net/chess?retryWrites=true&w=majority`

## Step 3: Connect GitHub to Render and Deploy

### 3.1 Create New Service on Render
1. Go to https://render.com and sign in
2. Click "New +" → "Web Service"
3. Select "Build and deploy from a Git repository"
4. Click "Connect GitHub Account" if not already connected
5. Search for and select your `chess` repository
6. Configure the service:
   - **Name**: `chess-app` (or your preferred name)
   - **Environment**: `Node`
   - **Region**: Select closest to your users
   - **Branch**: `main`
   - **Build Command**: `npm run install:all && npm run build`
   - **Start Command**: `npm start`

### 3.2 Set Environment Variables
1. In the Render dashboard, go to your service
2. Click "Environment" tab
3. Add these environment variables:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `MONGO_URI` | Your MongoDB connection string (from Step 2.2) |
| `JWT_SECRET` | Generate a strong random string (e.g., use a UUID generator) |
| `GOOGLE_CLIENT_ID` | Your Google OAuth client ID |
| `VITE_API_URL` | `https://your-app-name.onrender.com` |

⚠️ **Security Note**: Use strong, random values for `JWT_SECRET`. Never commit `.env` files with real secrets to GitHub.

### 3.3 Deploy
1. Click "Create Web Service"
2. Render will automatically:
   - Clone your repository
   - Install dependencies
   - Build the frontend
   - Start the server
3. Monitor the deployment in the "Logs" tab
4. Once complete, your app will be available at: `https://your-app-name.onrender.com`

## Step 4: Configure CORS and API Endpoints

### 4.1 Update Your Frontend API Configuration
When building on Render, the frontend needs to know the backend URL.

In `chess-front/src/main.jsx` or your API client, ensure the API URL is set correctly:

```javascript
const API_URL = process.env.VITE_API_URL || 'http://localhost:5001';
```

Or check if there's already an API configuration file and update it to use the `VITE_API_URL` environment variable.

### 4.2 Verify CORS Settings
The server already has CORS enabled in `chess-server/index.js`:
```javascript
app.use(cors());
```

This allows requests from any origin. For production, you might want to restrict it:
```javascript
app.use(cors({ origin: 'https://your-app-name.onrender.com' }));
```

## Step 5: Verify the Deployment

### 5.1 Check Server Health
Visit: `https://your-app-name.onrender.com/health`

You should see:
```json
{
  "status": "ok",
  "timestamp": 1234567890
}
```

### 5.2 Check Frontend
Visit: `https://your-app-name.onrender.com`

The chess application should load.

### 5.3 Monitor Logs
In the Render dashboard:
1. Go to your service
2. Click "Logs" tab
3. Look for connection messages and errors

## Step 6: Continuous Deployment

### 6.1 Auto-Deploy on GitHub Push
By default, Render automatically deploys when you push to your main branch.

To push changes:
```bash
git add .
git commit -m "Your changes"
git push origin main
```

Render will automatically rebuild and redeploy.

### 6.2 Manual Redeploy
1. Go to your Render service dashboard
2. Click "Trigger deploy" button
3. Select "Deploy latest commit"

## Troubleshooting

### Issue: Build Fails
- Check the **Logs** tab for specific errors
- Ensure all `dependencies` in package.json are correct
- Verify `npm run install:all` works locally

### Issue: Frontend Can't Connect to Backend
- Verify `VITE_API_URL` environment variable is set correctly
- Check that your frontend's API client uses `VITE_API_URL`
- Ensure CORS is properly configured on the backend

### Issue: MongoDB Connection Error
- Verify `MONGO_URI` is correct (no typos)
- Check MongoDB Atlas IP whitelist includes Render's IP range (usually use 0.0.0.0/0 for all IPs)
- Ensure database user password is correct

### Issue: Port Issues
- Render assigns a dynamic PORT via the `PORT` environment variable
- Your server should use: `const PORT = process.env.PORT || 5001;` ✓ (already implemented)

### Issue: Static Files Not Loading
- Ensure Vite build output is properly configured
- Frontend should be built in `chess-front/dist/`
- Check that server serves static files: `app.use(express.static('public'));`

## Additional Resources

- [Render Docs](https://render.com/docs)
- [render.yaml Config Reference](https://render.com/docs/render-yaml)
- [MongoDB Atlas Docs](https://docs.atlas.mongodb.com/)
- [Vite Build Guide](https://vitejs.dev/guide/build.html)

## Next Steps (Optional)

### Add Custom Domain
1. In Render dashboard, go to Settings
2. Add your custom domain
3. Update DNS records as instructed

### Set Up SSL Certificate
- Render provides free SSL certificates automatically

### Monitor Performance
- Use Render's built-in monitoring
- Set up MongoDB Atlas monitoring
- Configure error tracking if needed
