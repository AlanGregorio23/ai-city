let counter = 0;

export function createId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString().padStart(4, "0")}`;
}
