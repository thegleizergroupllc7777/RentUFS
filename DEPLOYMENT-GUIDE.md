# RentUFS - Deployment Guide

## Important: Full-Stack Deployment

RentUFS is a **full-stack application** with:
- **Frontend**: React app (client folder)
- **Backend**: Node.js/Express API (server folder)

You need to deploy **BOTH parts** separately.

---

## ⚠️ Why You're Getting "Page Not Found" on Netlify

**Netlify only hosts static frontend apps** - it cannot run your Express backend server. You're seeing a 404 error because:

1. Netlify is only serving the React frontend
2. The backend API endpoints aren't available
3. React Router needs special configuration

---

## 🚀 Recommended Deployment Strategy

### Option 1: Netlify (Frontend) + Render (Backend) - FREE

**Best for beginners - both have free tiers**

#### Step A: Deploy Backend to Render

1. **Go to [Render.com](https://render.com)** and sign up
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository: `thegleizergroupllc7777/RentUFS`
4. Configure:
   - **Name**: `rentufs-api`
   - **Branch**: `claude/car-rental-marketplace-lisGl`
   - **Root Directory**: Leave empty
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server/index.js`
   - **Instance Type**: Free
5. **Add Environment Variables:**
   - `MONGODB_URI`: `mongodb+srv://Rentufs7777:Rentufs7777@rentufs.rnvf89v.mongodb.net/rentufs?appName=RentUFS`
   - `JWT_SECRET`: `your_secure_jwt_secret_key_change_this_in_production_8f7a9b4c2e1d6f3a`
   - `PORT`: `5000`
   - `NODE_ENV`: `production`
   - `CLIENT_URL`: `https://your-app-name.netlify.app` (we'll update this later)
6. Click **"Create Web Service"**
7. **Copy your backend URL** (e.g., `https://rentufs-api.onrender.com`)

#### Step B: Deploy Frontend to Netlify

1. **Update API URL in your code first**
   - The frontend needs to know where your backend is
   - We'll do this next

2. **Go to [Netlify.com](https://netlify.com)** and sign up
3. Click **"Add new site"** → **"Import an existing project"**
4. Connect to GitHub and select: `thegleizergroupllc7777/RentUFS`
5. Configure:
   - **Branch**: `claude/car-rental-marketplace-lisGl`
   - **Base directory**: `client`
   - **Build command**: `npm run build`
   - **Publish directory**: `client/build`
6. **Add Environment Variable:**
   - `REACT_APP_API_URL`: `https://rentufs-api.onrender.com` (your Render backend URL)
7. Click **"Deploy site"**
8. **Copy your Netlify URL** (e.g., `https://rentufs-marketplace.netlify.app`)

#### Step C: Update Backend with Frontend URL

1. Go back to your **Render dashboard**
2. Click on your web service
3. Go to **"Environment"**
4. Update `CLIENT_URL` to your Netlify URL
5. Save changes (this will redeploy)

---

### Option 2: Deploy Everything to Render - FREE & EASIER

**Single platform for both frontend and backend**

1. **Deploy Backend** (same as Option 1, Step A above)

2. **Deploy Frontend as Static Site:**
   - In Render, click **"New +"** → **"Static Site"**
   - Connect your repository
   - Configure:
     - **Name**: `rentufs-frontend`
     - **Branch**: `claude/car-rental-marketplace-lisGl`
     - **Root Directory**: `client`
     - **Build Command**: `npm install && npm run build`
     - **Publish Directory**: `build`
   - **Environment Variable:**
     - `REACT_APP_API_URL`: `https://rentufs-api.onrender.com`
   - Click **"Create Static Site"**

3. **Update Backend CORS:**
   - Add your frontend URL to the backend's `CLIENT_URL` environment variable

---

### Option 3: Vercel (Everything) - FREE

**Great alternative to Netlify**

1. Go to [Vercel.com](https://vercel.com)
2. Import your GitHub repository
3. Vercel will detect it's a monorepo
4. Follow similar steps to Netlify

---

## 🔧 Code Changes Needed

Before deploying, I need to create a proper API configuration for your frontend. Let me do that now.

---

## 📋 Quick Checklist

Before deploying:
- [ ] MongoDB Atlas Network Access configured (0.0.0.0/0 allowed)
- [ ] Backend deployed first (get the URL)
- [ ] Frontend updated with backend URL
- [ ] CORS configured on backend
- [ ] Environment variables set correctly

---

## 🆘 Troubleshooting

### "Page not found" on Netlify
- Make sure `_redirects` file exists in `client/public/`
- Check build logs for errors

### "Network Error" or "500 Error"
- Backend isn't deployed or crashed
- Check MongoDB Atlas Network Access
- Check Render logs for errors

### "CORS Error"
- Update `CLIENT_URL` in backend environment variables
- Make sure it matches your frontend URL exactly

---

## 💡 What I Recommend

**For the easiest setup:**

1. Use **Render for both** (Option 2)
   - Single dashboard
   - Free tier for both
   - Easy to manage

**OR**

2. Use **Netlify + Render** (Option 1)
   - Netlify is faster for frontend
   - Render handles backend well
   - Both have great free tiers

---

Let me know which option you'd like, and I'll help you through the specific steps!
