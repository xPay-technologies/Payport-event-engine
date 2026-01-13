import { PaymentEvent, EventMode } from "./types";
import { countries, randomItem, randomAmount, generateId } from "./utils";
import logger from "./logger";

const methods = ["CARD", "APPLE_PAY", "GOOGLE_PAY", "KLARNA", "AFTERPAY", "PAYPAL", "CARD_INSTALLMENT"] as const;
const sources = ["web", "mobile", "api"] as const;

export function intervalForMode(mode: EventMode) {
  switch (mode) {
    case "high_traffic":
      return 50;
    case "payment_spike":
      return 300;
    case "chaos":
      return Math.random() > 0.7 ? 50 : 1500;
    default:
      return 1000;
  }
}

export function generatePayment(mode: EventMode): PaymentEvent {
  const country =
    mode === "country_focus"
      ? countries[0]
      : randomItem(countries);

  const big =
    mode === "payment_spike" && Math.random() > 0.85;

  const event: PaymentEvent = {
    eventId: generateId(),
    timestamp: new Date().toISOString(),
    amount: big
      ? randomAmount(5000, 20000)
      : randomAmount(),
    currency: country.currency,
    country: country.country,
    paymentMethod: randomItem([...methods]),
    source: randomItem([...sources]),
    status: Math.random() > 0.05 ? "success" : "failed"
  };

  logger.debug("Payment event generated", { 
    eventId: event.eventId, 
    mode, 
    amount: event.amount, 
    currency: event.currency,
    country: event.country,
    status: event.status
  });

  return event;
}
