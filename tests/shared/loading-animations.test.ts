import { describe, expect, it } from "vitest";
import { createAnimationPicker, LOADING_ANIMATIONS } from "@/shared/loadingAnimations";
describe("随机逐笔加载", () => {
  it("每轮六款全部出现，跨轮不紧挨重复", () => {
    const pick = createAnimationPicker(() => 0.5);
    let previous = "";
    for (let round = 0; round < 10; round++) {
      const ids = [];
      for (let index = 0; index < 6; index++) {
        const animation = pick();expect(animation.id).not.toBe(previous);previous = animation.id;ids.push(animation.id);
      }
      expect(new Set(ids)).toEqual(new Set(LOADING_ANIMATIONS.map(animation => animation.id)));
    }
  });
  it("不同随机序列改变抽取顺序，仍只返回已安装素材", () => {
    const first = createAnimationPicker(() => 0), second = createAnimationPicker(() => 0.999999);
    const a = Array.from({ length: 6 }, first), b = Array.from({ length: 6 }, second);
    expect(a.map(value => value.id)).not.toEqual(b.map(value => value.id));
    expect(a.every(value => LOADING_ANIMATIONS.includes(value))).toBe(true);
  });
});
