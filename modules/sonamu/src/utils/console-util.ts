export function centerText(text: string): string {
  const margin = Math.max(0, Math.floor((process.stdout.columns - text.length) / 2));
  return " ".repeat(margin) + text + " ".repeat(margin);
}
