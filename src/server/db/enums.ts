import { pgEnum } from "drizzle-orm/pg-core";
import {
  ACTIVITY_ACTIONS,
  DEPENDENCY_ITEM_TYPES,
  DEPENDENCY_TYPES,
  ENTITY_TYPES,
  EVIDENCE_KINDS,
  HEALTH_LEVELS,
  PRIORITIES,
  PROJECT_STATUSES,
  SCALE_LEVELS,
  STATUS_CATEGORIES,
  STATUS_SCOPES,
} from "@/shared/domain";

export const statusScopeEnum = pgEnum("status_scope", STATUS_SCOPES);
export const statusCategoryEnum = pgEnum("status_category", STATUS_CATEGORIES);
export const projectStatusEnum = pgEnum("project_status", PROJECT_STATUSES);
export const healthLevelEnum = pgEnum("health_level", HEALTH_LEVELS);
export const priorityEnum = pgEnum("priority", PRIORITIES);
export const scaleLevelEnum = pgEnum("scale_level", SCALE_LEVELS);
export const dependencyItemTypeEnum = pgEnum("dependency_item_type", DEPENDENCY_ITEM_TYPES);
export const dependencyTypeEnum = pgEnum("dependency_type", DEPENDENCY_TYPES);
export const evidenceKindEnum = pgEnum("evidence_kind", EVIDENCE_KINDS);
export const entityTypeEnum = pgEnum("entity_type", ENTITY_TYPES);
export const activityActionEnum = pgEnum("activity_action", ACTIVITY_ACTIONS);
