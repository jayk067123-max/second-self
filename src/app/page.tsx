import { TodayScreen } from "@/ui/composites/TodayScreen";

/**
 * 首页 = 今日视图。
 * 只做装配：数据、判定、文案都在 domain / ui 里，这里不写业务。
 */
export default function HomePage() {
  return <TodayScreen />;
}
