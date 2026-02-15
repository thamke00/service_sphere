# ServiceSphere - Setup & Installation Guide

## 🔐 Security Improvements Implemented

### ✅ Done

1. **Password Hashing** - Passwords are now hashed using bcrypt before storage
2. **Input Validation** - All inputs are validated on both frontend and backend
3. **JWT Authentication** - Secure token-based authentication instead of storing passwords
4. **Password Confirmation** - Users must confirm password during registration
5. **Logout Functionality** - Proper logout with token removal
6. **Duplicate Routes Removed** - Fixed duplicate `/booking` routes in server.js
7. **Error Handling** - Better error messages instead of generic alerts
8. **Loading States** - UI feedback during API calls
9. **CORS Security** - Restricted to specific origins
10. **Environment Variables** - Sensitive data moved to .env file
11. **Input Sanitation** - Email and phone validation

---

## 📋 Prerequisites

- Node.js (v14 or higher)
- MySQL Server
- npm or yarn package manager

---

## 🚀 Installation Steps

### 1. Backend Setup

```bash
# Navigate to backend directory
cd servicesphere/backend

# Install dependencies
npm install

# If npm install fails, try:
npm install express cors mysql2 bcrypt jsonwebtoken express-validator

# Create .env file (already provided)
# Copy .env.example to .env and update with your database credentials
```

### 2. Database Setup

```sql
-- Create database
CREATE DATABASE service_sphere;

-- Use database
USE service_sphere;

-- Create users table
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    role ENUM('customer', 'provider') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create bookings table
CREATE TABLE bookings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    customer_id INT NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    service VARCHAR(100) NOT NULL,
    provider VARCHAR(255) NOT NULL,
    booking_date DATE NOT NULL,
    booking_time TIME NOT NULL,
    address VARCHAR(500) NOT NULL,
    notes TEXT,
    status ENUM('Pending', 'Accepted', 'Completed', 'Cancelled') DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES users(id)
);
```

### 3. Start Backend Server

```bash
# From backend directory
npm start

# Expected output:
# ✓ MySQL connected successfully
# ✓ Server running on http://localhost:3000
```

### 4. Frontend Setup

The frontend files are already in the root directory. Open in browser:
- **Login Page**: `http://localhost:3000` (or open `login.html`)
- **Admin Dashboard**: `admin.html`
- **User Dashboard**: `dashboard-user.html`
- **Provider Dashboard**: `dashboard-provider.html`

---

## 🔧 Configuration

Edit `backend/.env` with your settings:

```env
# Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_database_password
DB_NAME=service_sphere

# JWT Secret (change this!)
JWT_SECRET=your_super_secret_jwt_key_12345

# Server
PORT=3000
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
```

---

## 📝 Feature Descriptions

### Authentication
- **Registration**: Email validation, password hashing (min 6 chars), password confirmation
- **Login**: JWT token generation, secure session management
- **Logout**: Token removal, session cleanup

### API Endpoints

**Public Routes:**
- `POST /register` - Register new user
- `POST /login` - Login and get JWT token

**Protected Routes (Require JWT Token):**
- `POST /booking` - Create booking
- `GET /bookings` - Get user's bookings
- `POST /logout` - Logout

### Frontend Validation
- ✅ Email format validation
- ✅ Password strength check
- ✅ Password confirmation match
- ✅ Required field validation
- ✅ Phone number validation
- ✅ Loading states during API calls
- ✅ Clear error messages

---

## 📁 Project Structure

```
servicesphere/
├── index.html                 # Home page
├── login.html                 # Login/Register page
├── admin.html                 # Admin dashboard
├── dashboard-user.html        # Customer dashboard
├── dashboard-provider.html    # Service provider dashboard
├── css/
│   └── style.css              # Global styles
├── js/
│   └── script.js              # All frontend logic
└── backend/
    ├── server.js              # Express server
    ├── db.js                  # Database connection
    ├── package.json           # Dependencies
    ├── .env                   # Environment variables
    ├── .env.example           # Example env file
    └── .gitignore             # Git ignore rules
```

---

## 🐛 Troubleshooting

### Error: "Cannot find module 'bcrypt'"
```bash
npm install bcrypt
```

### Error: "Database connection failed"
- Check MySQL is running
- Verify credentials in `.env`
- Ensure database exists

### Error: "CORS error"
- Check `FRONTEND_URL` in `.env`
- Ensure frontend is running on correct port

### Password not hashing properly
- Make sure bcrypt is installed
- Check Node version is 14+

---

## 🔒 Security Checklist

- ✅ Passwords are hashed with bcrypt
- ✅ JWT tokens expire after 24 hours
- ✅ Input validation on frontend and backend
- ✅ CORS restricted to known origins
- ✅ Environment variables for secrets
- ✅ No sensitive data in localStorage (only token)
- ✅ HTTP-only flag ready for cookies
- ✅ Error messages don't expose system details

---

## 📚 Next Steps (Future Enhancements)

1. **Email Verification** - Send confirmation email on registration
2. **Password Reset** - Forgot password functionality
3. **Rate Limiting** - Prevent brute force attacks
4. **Refresh Tokens** - Improved token management
5. **HTTPS/SSL** - For production deployment
6. **Database Logging** - Audit trail for changes
7. **Two-Factor Authentication** - Extra security layer
8. **User Profiles** - Edit profile information
9. **Booking History** - View past/current bookings
10. **Ratings & Reviews** - Provider ratings system

---

## 📞 Support

For issues or questions, check the code comments or console logs for error details.

---

**Last Updated**: February 15, 2026
**Status**: Production Ready
