export const countries = [
    { country: "US", currency: "USD" },
    { country: "GB", currency: "GBP" },
    { country: "Canada", currency: "CAD" },
    { country: "Australia", currency: "AUD" },
    { country: "UAE", currency: "AED" },
    { country: "Germany", currency: "EUR" },
    { country: "India", currency: "INR" }
  ];
  
  export function randomItem<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  
  export function randomAmount(min = 10, max = 500): number {
    return Number((Math.random() * (max - min) + min).toFixed(2));
  }
  
  export function generateId(prefix = "evt") {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
  