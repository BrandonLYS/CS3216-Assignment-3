import { AlertTriangle, Diamond, ListTodo } from "lucide-react";
import type { ConsequenceType } from "@/shared/domain";

/** Icon per item a Decision may lead to; shared by the Leads-to picker and the impact alert. */
export const CONSEQUENCE_ICON: Record<ConsequenceType, typeof ListTodo> = {
  task: ListTodo,
  milestone: Diamond,
  risk: AlertTriangle,
};
