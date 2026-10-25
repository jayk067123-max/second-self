export const LOADING_ANIMATIONS = [
  { id: "garden", label: "花园" },
  { id: "dawn", label: "晨光" },
  { id: "wisteria", label: "紫藤" },
  { id: "roses", label: "玫瑰" },
  { id: "koi", label: "锦鲤" },
  { id: "oranges", label: "橘子" },
] as const;
export type LoadingAnimation = (typeof LOADING_ANIMATIONS)[number];

/** Randomized rounds let every supplied painting appear, without adjacent repeats. */
export function createAnimationPicker(random: () => number = Math.random) {
  let remaining: LoadingAnimation[] = [];
  let previous: LoadingAnimation | undefined;
  return (): LoadingAnimation => {
    if (!remaining.length) {
      remaining = [...LOADING_ANIMATIONS];
      for (let index = remaining.length - 1; index > 0; index--) {
        const other = Math.floor(random() * (index + 1));
        [remaining[index], remaining[other]] = [remaining[other]!, remaining[index]!];
      }
      if (remaining.at(-1)?.id === previous?.id) {
        [remaining[0], remaining[remaining.length - 1]] = [remaining[remaining.length - 1]!, remaining[0]!];
      }
    }
    previous = remaining.pop()!;
    return previous;
  };
}
export const nextLoadingAnimation = createAnimationPicker();
