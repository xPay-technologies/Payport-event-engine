export type PaymentMethod =
  | "CARD"
  | "APPLE_PAY"
  | "GOOGLE_PAY"
  | "KLARNA"
  | "AFTERPAY"
  | "PAYPAL"
  | "CARD_INSTALLMENT";

export type EventMode =
  | "normal"
  | "high_traffic"
  | "country_focus"
  | "payment_spike"
  | "chaos";

export type PaymentEvent = {
  eventId: string;
  timestamp: string;
  amount: number;
  currency: string;
  country: string;
  paymentMethod: PaymentMethod;
  source: "web" | "mobile" | "api";
  status: "success" | "failed";
};

export type Session = {
  email: string;
  name: string;
  endsAt: number;
  isActive: boolean;
  mode: EventMode;
};
