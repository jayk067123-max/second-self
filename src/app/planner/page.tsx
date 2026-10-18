import { TodayScreen } from "@/ui/composites/TodayScreen";

/**
 * /planner 与首页是同一个视图 —— 保留这条路径只为不打断已有链接与录像流程。
 * 真正的版面在 `src/ui/composites/TodayScreen.tsx`，避免两处各写一份布局。
 */
export default function PlannerPage() {
  return <TodayScreen />;
}
