const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const orderDate = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
});
const chartDate = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', timeZone: 'UTC',
});

export function money(cents: number): string {
  return currency.format(cents / 100);
}

export function dateLabel(date: string): string {
  return orderDate.format(new Date(date));
}

export function shortDate(date: string): string {
  return chartDate.format(new Date(`${date}T00:00:00Z`));
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}
