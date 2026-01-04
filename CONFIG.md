## ⚙️ Configuration Guide

### Environment Variables

```env
# Required
MONGODB_URI=mongodb://localhost:27017/typing-platform
PORT=3000
NODE_ENV=development

# Optional
CORS_ORIGIN=*
ANTI_CHEAT_ENABLED=true
LEADERBOARD_UPDATE_INTERVAL=1000
MAX_CONCURRENT_USERS=100
```

### CSS Customization

**Change Primary Color (variables.css):**
```css
--color-primary: #2180a0;        /* Teal-500 */
--color-primary-hover: #1d7480;  /* Teal-600 */
```

**Change Font Size:**
```css
--font-size-base: 16px;  /* Default 14px */
--font-size-lg: 18px;
```

**Change Spacing:**
```css
--space-8: 8px;
--space-16: 16px;
--space-24: 24px;
```

### Socket.io Configuration

```javascript
const socket = io({
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: Infinity,
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 60000
});
```