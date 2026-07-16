// Shared calendar helpers so the meal planner and swipe discovery agree on
// exactly which "week" a recipe belongs to.

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const startOfWeek = (d: Date): Date => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // shift so Monday = 0
  x.setDate(x.getDate() - day);
  return x;
};

export const addDays = (d: Date, n: number): Date => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const weekKey = (d: Date): string => startOfWeek(d).toISOString().slice(0, 10);

export const fmtDay = (d: Date): string => `${MONTHS[d.getMonth()]} ${d.getDate()}`;
