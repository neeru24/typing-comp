

# README.md

# ⚡ TechFest Typing Competition Platform

A **production-ready, full-stack typing competition platform** built with Node.js, Socket.io, MongoDB, and Vanilla JavaScript. Perfect for college techfests, typing competitions, and typing speed challenges with real-time scoring and anti-cheating measures.

## 📖 Documentation Structure

This documentation is organized into modular files for better navigation:

- **[FEATURES.md](./FEATURES.md)** - Complete feature list and capabilities
- **[SETUP.md](./SETUP.md)** - Installation and configuration guide
- **[QUICKSTART.md](./QUICKSTART.md)** - Quick start guide for organizers and participants
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Project structure and tech stack
- **[CSS_ARCHITECTURE.md](./CSS_ARCHITECTURE.md)** - CSS design system and modular styling
- **[SOCKET_API.md](./SOCKET_API.md)** - WebSocket events and communication protocol
- **[DATABASE.md](./DATABASE.md)** - MongoDB schema and data structure
- **[DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md)** - Color tokens, typography, spacing, animations
- **[REST_API.md](./REST_API.md)** - REST API endpoints and responses
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Deployment guides for Render and Railway
- **[TESTING.md](./TESTING.md)** - Testing checklist and edge cases
- **[CONFIG.md](./CONFIG.md)** - Configuration and customization options
- **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** - Common issues and solutions
- **[PERFORMANCE.md](./PERFORMANCE.md)** - Performance metrics and optimization

## 🚀 Quick Start

1. **Clone & Install**
   ```bash
   git clone <repository-url>
   cd typing-platform
   npm install
   ```

2. **Configure Database**
   ```bash
   # Create .env file
   MONGODB_URI=mongodb://localhost:27017/typing-platform
   PORT=3000
   NODE_ENV=development
   ```

3. **Start Server**
   ```bash
   npm start
   ```

4. **Access Application**
   - Organizer: `http://localhost:3000/organizer`
   - Participant: `http://localhost:3000/`

**Made with ❤️ for techfest typing competitions**

**Last Updated**: January 4, 2026  
**Version**: 1.0.0
