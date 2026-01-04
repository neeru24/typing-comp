# 🚀 Installation & Setup

## Prerequisites
- **Node.js** (v14 or higher)
- **MongoDB** (local or cloud via MongoDB Atlas)
- **npm** or **yarn**
- **Git** for version control

## Step 1: Clone & Navigate
```bash
git clone <repository-url>
cd typing-platform
```

## Step 2: Backend Setup
```bash
npm install
```

This will install all required dependencies.

## Step 3: Configure Environment

Create a `.env` file in the root directory:

```env
MONGODB_URI=mongodb://localhost:27017/typing-platform
PORT=3000
NODE_ENV=development
```

### For MongoDB Atlas (Cloud)
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/typing-platform
PORT=3000
NODE_ENV=development
```

## Step 4: Start Backend Server

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### Expected Output
```
✓ MongoDB connected to typing-platform
🚀 Server running on http://localhost:3000
Socket.io initialized
```

## Step 5: Access Frontend

Open your browser and navigate to:

- **Organizer Dashboard**: `http://localhost:3000/organizer`
- **Participant Interface**: `http://localhost:3000/`

## Verification Checklist

- [ ] Node.js installed (`node --version`)
- [ ] npm installed (`npm --version`)
- [ ] MongoDB running (local or Atlas connected)
- [ ] `.env` file created with correct credentials
- [ ] Dependencies installed (`npm install` completed)
- [ ] Server started without errors
- [ ] Can access http://localhost:3000
- [ ] Can access http://localhost:3000/organizer

## Troubleshooting Setup Issues

**MongoDB Connection Error**
```
Error: connect ECONNREFUSED 127.0.0.1:27017
```
- Ensure MongoDB is running
- Check MongoDB URI in `.env`
- Verify network access (for Atlas)

**Port Already in Use**
```
Error: listen EADDRINUSE :::3000
```
- Change PORT in `.env` to 3001, 3002, etc.
- Or kill process using port 3000

**Module Not Found**
```
Cannot find module 'express'
```
- Run `npm install` again
- Delete `node_modules` and `package-lock.json`
- Run `npm install` fresh

See TROUBLESHOOTING.md for more issues.
