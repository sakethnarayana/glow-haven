

---

# 🚀 GlowPrime Backend API

A secure, scalable **Node.js + Express + MongoDB backend** powering the GlowPrime beauty & wellness platform.
This API handles authentication, products, services, bookings, orders, reviews, user management, and more.

---

## 📌 Features

### ✅ Core System

* Express.js backend with modular routing
* Mongoose ODM + MongoDB database
* Secure CORS with multiple domain support
* Helmet for security headers
* Morgan for request logs (dev mode only)

### 🛒 E-Commerce

* Product listing & details
* Product reviews
* Orders & checkout API
* User address management

### 💆‍♀️ Beauty & Wellness Services

* Service list & details
* Service reviews
* Booking system
* Availability API

### 🔐 Authentication

* Secure JWT-based user login & registration
* Protected routes
* Password update routes

### ⚙️ Additional

* Global error handler
* 404 fallback
* Environment variable support via **dotenv**
* Health check API route (`/`)

---

## 📁 Folder Structure

```
backend/
│── routes/
│    ├── userRoutes.js
│    ├── addressRoutes.js
│    ├── productRoutes.js
│    ├── orderRoutes.js
│    ├── serviceRoutes.js
│    ├── bookingRoutes.js
│    ├── availabilityRoutes.js
│    ├── authRoutes.js
│    ├── serviceReview.js
│    └── productReviews.js
│
│── server.js
│── package.json
│── .env.example
│── README.md
```

---

## 🔧 Environment Variables (`.env`)

Create a `.env` file in the root:

```
PORT=8000
MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/glowprime
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173,https://glowprime.in

JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=7d
```

---

## 🚀 Installation & Setup

### 1️⃣ Clone the repo

```bash
git clone https://github.com/yourusername/glowprime-backend.git
cd glowprime-backend
```

### 2️⃣ Install dependencies

```bash
npm install
```

### 3️⃣ Add `.env` file

Copy from `.env.example` and fill values.

### 4️⃣ Run the server (dev mode)

```bash
npm run dev
```

Server runs at:
**[http://localhost:8000](http://localhost:8000)**

---

## 📡 API Endpoints

### 👤 Users

```
POST /api/auth/register
POST /api/auth/login
GET  /api/users/profile
PUT  /api/users/update
```

### 📦 Products

```
GET    /api/products
GET    /api/products/:id
POST   /api/products  (admin)
```

### 🛍 Product Reviews

```
POST /api/products/:id/reviews
GET  /api/products/:id/reviews
```

### 💇 Services

```
GET    /api/services
GET    /api/services/:id
```

### ⭐ Service Reviews

```
POST /api/services/:id/reviews
GET  /api/services/:id/reviews
```

### 📅 Bookings

```
POST /api/bookings
GET  /api/bookings/user
```

### 🛒 Orders

```
POST /api/orders
GET  /api/orders/user
```

### 🏥 Health Check

```
GET /
```

---

## 🛡️ Security

* **Helmet** for security headers
* **CORS** with domain whitelisting
* **JWT Authentication**
* **Rate limit (optional to add)**
* **Mongo sanitize & XSS clean (recommended to add)**

---

## 🧪 Production Deployment

You can deploy this backend to:

### ✔️ **Render.com (easy)**

### ✔️ **Railway.app**

### ✔️ **Vercel Serverless Functions**

### ✔️ **DigitalOcean Droplet**

### ✔️ **AWS EC2 / Lightsail**

Just set up:

* Node.js environment
* MongoDB connection
* Environment variables
* Reverse proxy (if using Nginx)

---

## ❤️ Developed For GlowPrime.in

This backend powers the entire GlowPrime beauty-salon and skincare e-commerce / booking platform.

Frontend repo: *(add your frontend link here)*
Website: **[https://glowprime.in](https://glowprime.in)**

---

## 📜 License

This project is licensed under the MIT License.

---
