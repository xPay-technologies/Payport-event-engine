import { Session, EventMode } from "./types";
import logger from "./logger";

const sessions = new Map<string, Session>();

export function createSession(
  email: string,
  name: string,
  endsAt: number
) {
  const session: Session = {
    email,
    name,
    endsAt,
    isActive: true,
    mode: "normal"
  };
  sessions.set(email, session);
  logger.info("Session created", { 
    email, 
    name, 
    endsAt: new Date(endsAt).toISOString(),
    totalSessions: sessions.size 
  });
  return session;
}

export function getSession(email: string) {
  const s = sessions.get(email);
  if (!s) {
    logger.debug("Session not found", { email });
    return null;
  }

  if (Date.now() > s.endsAt) { 
    const wasActive = s.isActive;
    s.isActive = false;
    if (wasActive) {
      logger.info("Session expired", { email, endsAt: new Date(s.endsAt).toISOString() });
    }
  }
  return s;
}

export function stopSession(email: string) {
  const s = sessions.get(email);
  if (s) {
    s.isActive = false;
    logger.info("Session stopped", { email, name: s.name });
    
    // Schedule session cleanup after 5 minutes (allows for final logging/debugging)
    setTimeout(() => {
      sessions.delete(email);
      logger.debug("Session removed from memory", { email, remainingSessions: sessions.size });
    }, 5 * 60 * 1000);
  } else {
    logger.warn("Attempted to stop non-existent session", { email });
  }
}

export function updateMode(email: string, mode: EventMode) {
  const s = sessions.get(email);
  if (!s) {
    logger.error("Cannot update mode: session not found", { email, mode });
    throw new Error("Session not found");
  }
  const oldMode = s.mode;
  s.mode = mode;
  logger.info("Session mode updated", { email, oldMode, newMode: mode });
}

// ============== ADMIN FUNCTIONS ==============

// Resume an expired/stopped session for evaluation
export function resumeSession(email: string, durationMs: number): Session {
  const s = sessions.get(email);
  if (!s) {
    logger.error("Cannot resume session: not found", { email });
    throw new Error("Session not found");
  }
  
  s.isActive = true;
  s.endsAt = Date.now() + durationMs;
  logger.info("Session resumed (admin)", { 
    email, 
    newEndsAt: new Date(s.endsAt).toISOString(),
    durationMinutes: durationMs / 60000 
  });
  return s;
}

// Create a fresh evaluation session (doesn't require /start)
export function createEvalSession(email: string, durationMs: number, mode: EventMode = "normal"): Session {
  // Remove existing session if any
  if (sessions.has(email)) {
    sessions.delete(email);
    logger.debug("Removed existing session for eval", { email });
  }

  const session: Session = {
    email,
    name: "Evaluator",
    endsAt: Date.now() + durationMs,
    isActive: true,
    mode
  };
  sessions.set(email, session);
  logger.info("Evaluation session created (admin)", { 
    email, 
    mode,
    endsAt: new Date(session.endsAt).toISOString(),
    totalSessions: sessions.size 
  });
  return session;
}

// List all active sessions (for admin dashboard)
export function listSessions(): Session[] {
  return Array.from(sessions.values());
}
