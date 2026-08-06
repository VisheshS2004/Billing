# AutoBilling System

A full-stack MERN (MongoDB, Express, React, Node.js) web application designed for fast, stylus-based billing. It allows shop operators to write item names naturally on a digital pad, instantly fuzzy-match them against the store's inventory, toggle between retail and wholesale pricing, and print a custom 3-part A4 receipt.

## 🌟 Features

*   **Stylus Input & Smart Suggestions:** HTML5 Canvas pad supporting stylus pressure, paired with Fuse.js for instantaneous, offline-first fuzzy searching of product names.
*   **Dual Pricing Model:** Instantly toggle the entire bill between "Retail" and "Wholesale" pricing modes.
*   **Laser Printer Optimized:** Custom CSS `@media print` layout that splits a standard A4 sheet horizontally into 3 identical receipts.
*   **Two-Tier Dashboard:**
    *   **Admin Panel:** Manage product inventory (CRUD) and Operator accounts.
    *   **Billing Panel:** Split-screen layout for writing items and managing the live bill.
*   **Double Authentication (2FA):** Admin login requires an email OTP alongside the standard password.
*   **Role-Based Access Control:** Secure JWT middleware protecting routes for Admins vs. Operators.

## 🛠️ Technology Stack

*   **Frontend:** React 18, Vite, React Router v6, Zustand (State Management), Fuse.js (Fuzzy Search), Lucide React (Icons), Custom Vanilla CSS.
*   **Backend:** Node.js, Express.js, Mongoose, JSON Web Tokens (JWT), Nodemailer (OTP via Email), Bcryptjs.
*   **Database:** MongoDB.

## 📋 Prerequisites

Before running the project, ensure you have the following installed:
*   [Node.js](https://nodejs.org/) (v16 or higher recommended)
*   [MongoDB](https://www.mongodb.com/) (running locally or a MongoDB Atlas URI)

## 🚀 Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone <your-repo-url>
    cd AutoBilling
    ```

2.  **Setup Backend:**
    ```bash
    cd server
    npm install
    ```
    *   Create a `.env` file in the `server` directory (see Environment Variables section below).
    *   Run the database seeder to create the initial admin account:
        ```bash
        node seeder.js
        ```

3.  **Setup Frontend:**
    ```bash
    cd ../client
    npm install
    ```

## ⚙️ Environment Variables

Create a `.env` file in the `server` directory with the following variables:

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/autobilling
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRES_IN=8h
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_gmail_app_password
ADMIN_EMAIL=admin@autobilling.com
CLIENT_URL=http://localhost:5173
```
*(Note: To enable Admin OTP emails, `EMAIL_USER` and `EMAIL_PASS` must be valid, typically requiring a Gmail App Password if using Gmail).*

## 🏃‍♂️ Running the Application

You can run the frontend and backend concurrently in separate terminals.

**Start Backend (Terminal 1):**
```bash
cd server
npm run dev
```
*(Server will start on http://localhost:5000)*

**Start Frontend (Terminal 2):**
```bash
cd client
npm run dev
```
*(Client will start on http://localhost:5173)*

## 🔐 Default Credentials

If you ran `node seeder.js`, the default admin account is:
*   **Email:** `admin@autobilling.com` (or whatever you set in `ADMIN_EMAIL`)
*   **Password:** `admin123`

*(You must have your mailer configured correctly in `.env` to receive the OTP to log in as admin).*

## 🖨️ Printing Configuration

The print layout is hardcoded to render 3 identical receipts stacked vertically. When printing from the browser (e.g., Chrome):
*   Set Paper Size to **A4**.
*   Disable "Headers and Footers" in browser print settings.
*   Set Margins to "None" or "Minimum" for the best result.
