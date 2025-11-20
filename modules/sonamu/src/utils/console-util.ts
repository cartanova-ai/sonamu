export function centerText(text: string): string {
  const margin = (process.stdout.columns - text.length) / 2;
  return " ".repeat(margin) + text + " ".repeat(margin);
}