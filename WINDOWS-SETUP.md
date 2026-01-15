# RentUFS - Windows Setup Guide

## Prerequisites

Before you start, make sure you have:

### 1. Node.js (Required)
- Download from: https://nodejs.org/
- Download the **LTS version** (recommended)
- Run the installer and follow the prompts
- **Restart your computer** after installation

### 2. Git (Required)
- Download from: https://git-scm.com/download/win
- Run the installer with default settings

---

## Quick Setup (Automated)

### Option A: Using the Setup Script (Easiest)

1. **Download this repository:**
   - Open Command Prompt or PowerShell
   - Navigate to where you want the project:
     ```cmd
     cd C:\Users\YourUsername\Documents
     ```
   - Clone the repository:
     ```cmd
     git clone https://github.com/thegleizergroupllc7777/RentUFS.git
     cd RentUFS
     git checkout claude/car-rental-marketplace-lisGl
     ```

2. **Run the setup script:**
   - Double-click `setup-windows.bat`
   - OR run in Command Prompt:
     ```cmd
     setup-windows.bat
     ```

3. **Start the application:**
   - Double-click `start-windows.bat`
   - OR run in Command Prompt:
     ```cmd
     start-windows.bat
     ```

4. **Open your browser:**
   - Go to: http://localhost:3000

---

## Manual Setup (If Scripts Don't Work)

### Step 1: Download the Code

```cmd
git clone https://github.com/thegleizergroupllc7777/RentUFS.git
cd RentUFS
git checkout claude/car-rental-marketplace-lisGl
```

### Step 2: Install Backend Dependencies

```cmd
npm install
```

### Step 3: Install Frontend Dependencies

```cmd
cd client
npm install
cd ..
```

### Step 4: Verify .env File

Make sure there's a `.env` file in the root folder with this content:

```env
MONGODB_URI=mongodb+srv://Rentufs7777:Rentufs7777@rentufs.rnvf89v.mongodb.net/rentufs?appName=RentUFS
JWT_SECRET=your_secure_jwt_secret_key_change_this_in_production_8f7a9b4c2e1d6f3a
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:3000
```

### Step 5: Start the Application

```cmd
npm run dev
```

### Step 6: Open in Browser

Go to: http://localhost:3000

---

## Troubleshooting

### "Node is not recognized"
- Node.js is not installed or not in PATH
- Restart your computer after installing Node.js
- Try reinstalling Node.js

### "Git is not recognized"
- Git is not installed or not in PATH
- Restart your computer after installing Git
- Try reinstalling Git

### Port Already in Use
If you see "Port 3000 or 5000 is already in use":

1. Find and kill the process:
   ```cmd
   netstat -ano | findstr :3000
   taskkill /PID <PID_NUMBER> /F
   ```

2. Or change the port in `.env`:
   ```env
   PORT=5001
   ```

### MongoDB Connection Error
- This is normal if MongoDB Atlas has network restrictions
- The UI will still load, but features requiring database won't work
- Make sure you configured MongoDB Atlas Network Access correctly

---

## What's Included

### Driver Features
- Browse available vehicles
- Search and filter cars
- View vehicle details
- Book vehicles
- Manage bookings
- Leave reviews

### Host Features
- Add vehicle listings
- Edit/delete vehicles
- Manage booking requests
- Track earnings and statistics
- Respond to renters

---

## Next Steps

1. **Register an account** at http://localhost:3000/register
2. **Choose your role**: Driver, Host, or Both
3. **Explore the marketplace!**

---

## Getting Help

If you encounter issues:
1. Check the troubleshooting section above
2. Make sure all prerequisites are installed
3. Restart your computer and try again
4. Check the terminal for error messages

---

## Stopping the Application

Press `Ctrl + C` in the terminal/command prompt where the app is running.

---

Enjoy your RentUFS marketplace! 🚗
