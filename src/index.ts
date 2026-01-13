import "dotenv/config";
import express from "express";
import cors from "cors";
import logger from "./logger";
import { getDb } from "./db";
import {
  createSession,
  getSession,
  stopSession,
  updateMode,
  resumeSession,
  createEvalSession,
  listSessions
} from "./sessionStore";
import {
  generatePayment,
  intervalForMode
} from "./eventEngine";

const app = express();
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  logger.info("Incoming request", {
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip
  });

  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info("Request completed", {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    });
  });

  next();
});

const ASSIGNMENT_DURATION = 8 * 60 * 60 * 1000;

// Simple email validation
const isValidEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

// Simple GitHub URL validation
const isValidGithubUrl = (url: string): boolean => {
  return /^https?:\/\/(www\.)?github\.com\/[a-zA-Z0-9_-]+\/?$/i.test(url);
};

/* ---------------- HEALTH CHECK ---------------- */

app.get("/health", async (req, res) => {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    res.json({ 
      status: "healthy", 
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  } catch (error) {
    logger.error("Health check failed", { error: error instanceof Error ? error.message : String(error) });
    res.status(503).json({ 
      status: "unhealthy", 
      error: "Database connection failed" 
    });
  }
});

/* ---------------- START ---------------- */

app.post("/start", async (req, res) => {
  const { name, email, github } = req.body;
  
  logger.info("Assignment start requested", { name, email, github });

  if (!name || !email || !github) {
    logger.warn("Assignment start failed: missing required fields", { name: !!name, email: !!email, github: !!github });
    return res.status(400).json({ error: "Missing name, email, or github" });
  }

  if (!isValidEmail(email)) {
    logger.warn("Assignment start failed: invalid email format", { email });
    return res.status(400).json({ error: "Invalid email format" });
  }

  if (!isValidGithubUrl(github)) {
    logger.warn("Assignment start failed: invalid GitHub URL", { github });
    return res.status(400).json({ error: "Invalid GitHub profile URL. Expected format: https://github.com/username" });
  }

  try {
    const db = await getDb();

    // Check if email has ever been used (one attempt per email)
    const existingAssignment = await db
      .collection("assignments")
      .findOne({ email });

    if (existingAssignment) {
      const status = existingAssignment.status;
      if (status === "active") {
        logger.warn("Assignment start failed: already active", { email });
        return res.status(400).json({ error: "Assignment already in progress" });
      } else {
        logger.warn("Assignment start failed: email already used", { email, previousStatus: status });
        return res.status(400).json({ error: "Email already used. One attempt per candidate." });
      }
    }

    // Only create candidate record if this is their first (and only) attempt
    await db.collection("candidates").insertOne({
      name,
      email,
      github,
      createdAt: new Date()
    });
    logger.info("Candidate record created", { email, name });

    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + ASSIGNMENT_DURATION);

    await db.collection("assignments").insertOne({
      email,
      startedAt,
      endsAt,
      status: "active"
    });
    logger.info("Assignment record created", { email, startedAt, endsAt });

    createSession(email, name, endsAt.getTime());

    logger.info("Assignment started successfully", { email, endsAt });
    res.json({
      message: "Assignment started",
      endsAt
    });
  } catch (error) {
    logger.error("Assignment start failed: database error", { 
      email, 
      error: error instanceof Error ? error.message : String(error) 
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ---------------- TIME ---------------- */

app.get("/time-remaining", async (req, res) => {
  const email = req.query.email as string;
  
  logger.debug("Time remaining requested", { email });

  if (!email) {
    logger.warn("Time remaining failed: missing email", { query: req.query });
    return res.status(400).json({ error: "Missing email query parameter" });
  }

  try {
    const db = await getDb();

    const assignment = await db
      .collection("assignments")
      .findOne({ email, status: "active" });

    if (!assignment) {
      logger.warn("Time remaining failed: no active assignment", { email });
      return res.status(404).json({ error: "No active assignment" });
    }

    const remaining =
      assignment.endsAt.getTime() - Date.now();
    const remainingSeconds = Math.max(0, Math.floor(remaining / 1000));

    logger.debug("Time remaining retrieved", { email, remainingSeconds });
    res.json({
      remainingSeconds
    });
  } catch (error) {
    logger.error("Time remaining failed: database error", { 
      email, 
      error: error instanceof Error ? error.message : String(error) 
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ---------------- STOP ---------------- */

app.post("/stop", async (req, res) => {
  const { email, githubRepo } = req.body;
  
  logger.info("Assignment stop requested", { email, hasRepo: !!githubRepo });

  if (!email) {
    logger.warn("Assignment stop failed: missing email", { body: req.body });
    return res.status(400).json({ error: "Missing email" });
  }

  try {
    const db = await getDb();

    const updateResult = await db.collection("assignments").updateOne(
      { email, status: "active" },
      {
        $set: {
          status: "completed",
          endedAt: new Date()
        }
      }
    );

    if (updateResult.matchedCount === 0) {
      logger.warn("Assignment stop failed: no active assignment found", { email });
      return res.status(404).json({ error: "No active assignment found" });
    }

    logger.info("Assignment marked as completed", { email });

    if (githubRepo) {
      await db.collection("submissions").insertOne({
        email,
        githubRepo,
        submittedAt: new Date()
      });
      logger.info("Submission recorded", { email, githubRepo });
    }

    stopSession(email);
    logger.info("Assignment stopped successfully", { email });
    res.json({ message: "Assignment completed" });
  } catch (error) {
    logger.error("Assignment stop failed: database error", { 
      email, 
      error: error instanceof Error ? error.message : String(error) 
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ---------------- EVENTS (SSE) ---------------- */

app.get("/events", (req, res) => {
  const email = req.query.email as string;
  
  logger.info("SSE connection requested", { email });

  if (!email) {
    logger.warn("SSE connection failed: missing email", { query: req.query });
    return res.status(400).json({ error: "Missing email query parameter" });
  }

  const session = getSession(email);

  if (!session || !session.isActive) {
    logger.warn("SSE connection failed: no active session", { email, hasSession: !!session });
    return res.status(403).json({ error: "No active session. Start assignment first." });
  }

  logger.info("SSE connection established", { email, mode: session.mode });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: "connected", mode: session.mode })}\n\n`);

  let currentMode = session.mode;
  let eventCount = 0;
  let isConnectionClosed = false;
  let activeTimeout: NodeJS.Timeout | null = null;

  const sendEvent = () => {
    // Stop if connection was closed
    if (isConnectionClosed) {
      return;
    }

    const s = getSession(email);
    if (!s || !s.isActive) {
      logger.info("SSE stream ended: session inactive", { email, totalEvents: eventCount });
      res.write(`data: ${JSON.stringify({ type: "session_ended" })}\n\n`);
      res.end();
      return;
    }

    // Check if mode changed, adjust interval dynamically
    if (s.mode !== currentMode) {
      logger.info("SSE mode changed", { email, oldMode: currentMode, newMode: s.mode });
      currentMode = s.mode;
      res.write(`data: ${JSON.stringify({ type: "mode_changed", mode: currentMode })}\n\n`);
    }

    const event = generatePayment(s.mode);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    eventCount++;

    // Log every 100 events to avoid spam
    if (eventCount % 100 === 0) {
      logger.debug("SSE events streamed", { email, eventCount, mode: s.mode });
    }

    // Schedule next event with current mode's interval
    activeTimeout = setTimeout(sendEvent, intervalForMode(s.mode));
  };

  // Start the event loop
  activeTimeout = setTimeout(sendEvent, intervalForMode(session.mode));

  req.on("close", () => {
    logger.info("SSE connection closed by client", { email, totalEvents: eventCount });
    isConnectionClosed = true;
    if (activeTimeout) {
      clearTimeout(activeTimeout);
    }
  });
});

/* ---------------- TEST MODE (For Candidates) ---------------- */

const VALID_MODES = ["normal", "high_traffic", "country_focus", "payment_spike", "chaos"] as const;

// Candidates can use this to test their dashboard with different traffic modes
app.post("/test/mode", (req, res) => {
  const { email, mode } = req.body;
  
  logger.info("Test mode change requested", { email, mode });

  if (!email || !mode) {
    logger.warn("Test mode change failed: missing fields", { hasEmail: !!email, hasMode: !!mode });
    return res.status(400).json({ error: "Missing email or mode" });
  }
  
  if (!VALID_MODES.includes(mode)) {
    logger.warn("Test mode change failed: invalid mode", { email, mode, validModes: VALID_MODES });
    return res.status(400).json({ 
      error: "Invalid mode", 
      validModes: VALID_MODES 
    });
  }

  try {
    updateMode(email, mode);
    logger.info("Test mode changed successfully", { email, mode });
    res.json({ message: `Mode set to ${mode}` });
  } catch (e) {
    logger.error("Test mode change failed: session not found", { email, mode });
    res.status(404).json({ error: "Session not found" });
  }
});

/* ---------------- ADMIN (Evaluator Only) ---------------- */

// API Key authentication middleware for admin endpoints
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "fdc5764c6675d8cbbf68d94148453aec47b41d73d0039e2459b14cfd6ac64d74";

const requireAdminKey = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const providedKey = req.headers["x-admin-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
  
  if (!providedKey) {
    logger.warn("Admin endpoint accessed without API key", { path: req.path, ip: req.ip });
    return res.status(401).json({ error: "Missing API key. Provide X-Admin-API-Key header or Authorization: Bearer <key>" });
  }

  if (providedKey !== ADMIN_API_KEY) {
    logger.warn("Admin endpoint accessed with invalid API key", { path: req.path, ip: req.ip });
    return res.status(403).json({ error: "Invalid API key" });
  }

  logger.debug("Admin endpoint authenticated", { path: req.path });
  next();
};

// Resume an expired/completed session for evaluation
app.post("/admin/resume", requireAdminKey, (req, res) => {
  const { email, durationMinutes = 60 } = req.body;
  
  logger.info("Admin: resume session requested", { email, durationMinutes });

  if (!email) {
    return res.status(400).json({ error: "Missing email" });
  }

  try {
    const session = resumeSession(email, durationMinutes * 60 * 1000);
    res.json({ 
      message: "Session resumed for evaluation",
      email: session.email,
      mode: session.mode,
      expiresAt: new Date(session.endsAt).toISOString(),
      durationMinutes,
      connectWith: `/events?email=${encodeURIComponent(email)}`
    });
  } catch (e) {
    logger.error("Admin: resume failed - session not found", { email });
    res.status(404).json({ error: "Session not found. Use /admin/eval to create a new one." });
  }
});

// Create a fresh evaluation session (no /start required, bypasses email restriction)
app.post("/admin/eval", requireAdminKey, (req, res) => {
  const { email = "eval@payport.dev", durationMinutes = 60, mode = "normal" } = req.body;
  
  logger.info("Admin: eval session requested", { email, durationMinutes, mode });

  if (!VALID_MODES.includes(mode)) {
    return res.status(400).json({ error: "Invalid mode", validModes: VALID_MODES });
  }

  const session = createEvalSession(email, durationMinutes * 60 * 1000, mode);
  
  res.json({ 
    message: "Evaluation session created",
    email: session.email,
    mode: session.mode,
    expiresAt: new Date(session.endsAt).toISOString(),
    durationMinutes,
    connectWith: `/events?email=${encodeURIComponent(email)}`
  });
});

// List all active sessions
app.get("/admin/sessions", requireAdminKey, (req, res) => {
  logger.info("Admin: listing all sessions");
  
  const sessions = listSessions();
  const now = Date.now();
  
  res.json({
    total: sessions.length,
    sessions: sessions.map(s => ({
      email: s.email,
      name: s.name,
      mode: s.mode,
      isActive: s.isActive,
      expiresAt: new Date(s.endsAt).toISOString(),
      remainingMinutes: Math.max(0, Math.round((s.endsAt - now) / 60000))
    }))
  });
});

/* ---------------- DEMO (No Auth Required) ---------------- */

// Demo endpoint - streams events without requiring a session
// Use for quick testing or when evaluating without setting up a session
app.get("/demo/events", (req, res) => {
  const mode = (req.query.mode as string) || "normal";
  
  logger.info("Demo SSE connection requested", { mode });

  if (!VALID_MODES.includes(mode as typeof VALID_MODES[number])) {
    return res.status(400).json({ error: "Invalid mode", validModes: VALID_MODES });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.write(`data: ${JSON.stringify({ type: "demo_connected", mode })}\n\n`);

  let eventCount = 0;
  let isConnectionClosed = false;
  let activeTimeout: NodeJS.Timeout | null = null;

  const sendEvent = () => {
    if (isConnectionClosed) return;

    const event = generatePayment(mode as any);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    eventCount++;

    if (eventCount % 100 === 0) {
      logger.debug("Demo SSE events streamed", { eventCount, mode });
    }

    activeTimeout = setTimeout(sendEvent, intervalForMode(mode as any));
  };

  activeTimeout = setTimeout(sendEvent, intervalForMode(mode as any));

  req.on("close", () => {
    logger.info("Demo SSE connection closed", { totalEvents: eventCount, mode });
    isConnectionClosed = true;
    if (activeTimeout) clearTimeout(activeTimeout);
  });
});

/* ---------------- INFO ---------------- */

app.get("/info", (_, res) => {
    logger.debug("Service info requested");
  
    res.json({
      service: "Payport Event Engine",
      codename: "LIVEWIRE",
      purpose: "Simulate global payment chaos so frontend engineers can build calm, beautiful systems on top of it.",
  
      creator: {
        name: "Siddhant Patil",
        role: "Founding Engineer @ xPay",
        philosophy: [
          "Frontend is not just UI, it's systems thinking",
          "Real-time data exposes bad abstractions fast",
          "Great engineers optimize for clarity, not cleverness"
        ],
        reachOut: {
          linkedin: "https://www.linkedin.com/in/sidd0203/",
          email: "siddhant.patil@xpaycheckout.com",
          note: "If something feels confusing, unclear, or broken, that feedback is part of the assignment."
        }
      },
  
      assignment: {
        name: "Payport Live Dashboard",
        durationHours: 8,
        whatYouAreBuilding:
          "A real-time dashboard that shows live payment activity across the globe.",
        whatWeCareAbout: [
          "How you think about real-time data",
          "How you manage state under constant updates",
          "Performance and rendering discipline",
          "UX decisions for always-on screens",
          "Trade-offs you consciously make"
        ],
        whatWeDontCareAbout: [
          "Over-engineering",
          "Copy-paste architectures"
        ],
        mindset: "Build something you'd be proud to ship internally at a fast-moving fintech."
      },
  
      eventEngine: {
        realtime: true,
        transport: "Server-Sent Events (SSE)",
        persistence: "None. Events are ephemeral by design.",
        modes: [
          "normal",
          "high_traffic",
          "country_focus",
          "payment_spike",
          "chaos"
        ],
        warning:
          "If traffic spikes or events arrive faster than your UI can handle, that's intentional."
      },
  
      hints: [
        "You don't need to show everything, choose wisely",
        "Separating ingestion from rendering will save you",
        "Derived state > raw state",
        "If something feels noisy, it probably is"
      ],
  
      finalNote:
        "This assignment is meant to feel like real work. If you enjoyed building it, we'll probably enjoy working together."
    });
  });
  

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info("Server started", { 
    port: PORT, 
    environment: process.env.NODE_ENV || "development",
    nodeVersion: process.version
  });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  process.exit(0);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection", { reason, promise });
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception", { error: error.message, stack: error.stack });
  process.exit(1);
});

export default app;
