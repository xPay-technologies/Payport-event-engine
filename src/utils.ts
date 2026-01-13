export const countries = [
    { country: "India", currency: "INR" },
    { country: "USA", currency: "USD" },
    { country: "Germany", currency: "EUR" },
    { country: "UK", currency: "GBP" },
    { country: "Singapore", currency: "SGD" }
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
  