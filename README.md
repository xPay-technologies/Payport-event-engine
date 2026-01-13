# Payport Frontend Take-Home Assignment

## Welcome, Engineer 👋

You're about to build a **real-time payments dashboard** for Payport — a global payments platform processing millions of transactions across the world.

This is a **time-bound assignment**. You have **8 hours** from the moment you start.

---

## 🎯 Your Mission

Build a **live payments dashboard** that visualizes real-time payment activity happening across the globe.

Think of this as a screen that would hang in our office — always on, showing the pulse of our payments infrastructure.

---

## ⏱️ Time Limit

- **Duration**: 8 hours
- **Timer starts**: When you call `/start`
- **Timer ends**: When you call `/stop` or time runs out

Your session will expire automatically after 8 hours. Plan accordingly.

---

## 🚀 Getting Started

### Step 1: Start Your Assignment

curl -X POST https://YOUR_SERVER_URL/start \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Your Name",
    "email": "your.email@example.com",
    "github": "https://github.com/yourusername"
  }'**Response:**
{
  "message": "Assignment started",
  "endsAt": "2026-01-13T18:00:00.000Z"
}⚠️ **Important**: Each email can only be used once. Make sure you're ready before starting.

### Step 2: Connect to the Event Stream

The backend streams payment events via **Server-Sent Events (SSE)**:

const eventSource = new EventSource(
  'https://YOUR_SERVER_URL/events?email=your.email@example.com'
);

eventSource.onmessage = (event) => {
  const payment = JSON.parse(event.data);
  console.log('New payment:', payment);
};### Step 3: Build Your Dashboard

Use the streaming data to build a real-time dashboard. See requirements below.

### Step 4: Submit Your Work

When finished (or when time runs out):

curl -X POST https://YOUR_SERVER_URL/stop \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your.email@example.com",
    "githubRepo": "https://github.com/yourusername/payport-dashboard"
  }'---

## 📡 API Reference

### Base URL
