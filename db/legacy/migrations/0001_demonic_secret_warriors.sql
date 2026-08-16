CREATE TABLE `agent_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at_ms` integer NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agent_version_events` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`agent_version_id` text NOT NULL,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`metadata_json` text,
	`created_at_ms` integer NOT NULL,
	CONSTRAINT "agent_version_events_action_check" CHECK("agent_version_events"."action" in ('create', 'edit', 'fork', 'confirm', 'activate', 'deactivate', 'retire', 'delete')),
	CONSTRAINT "agent_version_events_metadata_size_check" CHECK("agent_version_events"."metadata_json" is null or length("agent_version_events"."metadata_json") <= 4096)
);
--> statement-breakpoint
CREATE INDEX `agent_version_events_version_created_idx` ON `agent_version_events` (`agent_version_id`,`created_at_ms`);--> statement-breakpoint
CREATE TABLE `agent_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`parent_version_id` text,
	`display_name` text NOT NULL,
	`purpose` text NOT NULL,
	`role` text NOT NULL,
	`skill_id` text,
	`instructions` text NOT NULL,
	`provider` text NOT NULL,
	`model_id` text NOT NULL,
	`reasoning_effort` text NOT NULL,
	`max_turns` integer NOT NULL,
	`status` text NOT NULL,
	`is_active` integer NOT NULL,
	`revision` integer NOT NULL,
	`created_at_ms` integer NOT NULL,
	`updated_at_ms` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agent_definitions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_version_id`) REFERENCES `agent_versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "agent_versions_role_check" CHECK("agent_versions"."role" in ('manager', 'specialist')),
	CONSTRAINT "agent_versions_status_check" CHECK("agent_versions"."status" in ('draft', 'confirmed', 'retired')),
	CONSTRAINT "agent_versions_provider_check" CHECK("agent_versions"."provider" = 'openai'),
	CONSTRAINT "agent_versions_reasoning_check" CHECK("agent_versions"."reasoning_effort" in ('low', 'medium', 'high')),
	CONSTRAINT "agent_versions_role_skill_check" CHECK(("agent_versions"."role" = 'manager' and "agent_versions"."skill_id" is null and "agent_versions"."max_turns" between 1 and 2) or ("agent_versions"."role" = 'specialist' and "agent_versions"."skill_id" is not null and "agent_versions"."max_turns" = 1)),
	CONSTRAINT "agent_versions_positive_check" CHECK("agent_versions"."version_number" > 0 and "agent_versions"."revision" > 0),
	CONSTRAINT "agent_versions_retired_inactive_check" CHECK("agent_versions"."status" != 'retired' or "agent_versions"."is_active" = 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_versions_agent_number_unique` ON `agent_versions` (`agent_id`,`version_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_versions_active_manager_unique` ON `agent_versions` (`role`) WHERE "agent_versions"."is_active" = 1 and "agent_versions"."role" = 'manager';--> statement-breakpoint
CREATE UNIQUE INDEX `agent_versions_active_specialist_unique` ON `agent_versions` (`skill_id`) WHERE "agent_versions"."is_active" = 1 and "agent_versions"."role" = 'specialist';--> statement-breakpoint
CREATE UNIQUE INDEX `agent_versions_active_agent_unique` ON `agent_versions` (`agent_id`) WHERE "agent_versions"."is_active" = 1;--> statement-breakpoint
CREATE INDEX `agent_versions_agent_created_idx` ON `agent_versions` (`agent_id`,`created_at_ms`);--> statement-breakpoint
CREATE INDEX `agent_versions_skill_active_idx` ON `agent_versions` (`skill_id`,`is_active`);--> statement-breakpoint
CREATE INDEX `agent_versions_parent_idx` ON `agent_versions` (`parent_version_id`);--> statement-breakpoint
ALTER TABLE `model_calls` ADD `agent_definition_id` text REFERENCES agent_definitions(id);--> statement-breakpoint
ALTER TABLE `model_calls` ADD `agent_version_id` text REFERENCES agent_versions(id);--> statement-breakpoint
ALTER TABLE `model_calls` ADD `agent_config_snapshot_json` text;
--> statement-breakpoint
INSERT INTO `agent_definitions` (`id`, `created_at_ms`, `created_by`) VALUES
  ('00000000-0000-4000-8000-00000000a001', 1786752000000, 'local-admin'),
  ('00000000-0000-4000-8000-00000000a101', 1786752000000, 'local-admin'),
  ('00000000-0000-4000-8000-00000000a102', 1786752000000, 'local-admin'),
  ('00000000-0000-4000-8000-00000000a103', 1786752000000, 'local-admin'),
  ('00000000-0000-4000-8000-00000000a104', 1786752000000, 'local-admin'),
  ('00000000-0000-4000-8000-00000000a105', 1786752000000, 'local-admin'),
  ('00000000-0000-4000-8000-00000000a106', 1786752000000, 'local-admin'),
  ('00000000-0000-4000-8000-00000000a107', 1786752000000, 'local-admin')
ON CONFLICT(`id`) DO NOTHING;
--> statement-breakpoint
INSERT INTO `agent_versions` (`id`, `agent_id`, `version_number`, `parent_version_id`, `display_name`, `purpose`, `role`, `skill_id`, `instructions`, `provider`, `model_id`, `reasoning_effort`, `max_turns`, `status`, `is_active`, `revision`, `created_at_ms`, `updated_at_ms`, `created_by`, `updated_by`) VALUES
  ('00000000-0000-4000-8000-00000000b101', '00000000-0000-4000-8000-00000000a101', 1, NULL, 'Intake Readiness Specialist', 'Assess audience-profile readiness.', 'specialist', 'intake_readiness@1', 'You are a bounded Kids Booklet specialist. Author only the requested structured result from the supplied approved context and skill input. Use the story''s actual names, setting, actions, reading age, and continuity constraints; never replace them with generic placeholders. Keep reader-facing titles and text concise enough to fit their specified booklet page region. For Story Plan entity changes, use kind ''existing'' only with an ID supplied in the input; use kind ''new'' with a clientKey and never invent a persistent ID. For Page Plan drafts, never supply pageId values; the application assigns and preserves them. For Page Plan work, create professional single-scene comic lettering. Each page lettering array is the exact reading order and may contain title, narration, dialogue, thought, and sound_effect elements. Use dialogue or effects only when they strengthen the supplied beat. Dialogue and thought elements must name a supplied on-page character ID as speakerEntityId. Keep story pages to at most five elements and 45 total words. readerText must equal the lettering texts joined with one space. The input copyMode controls authorship: creative may rewrite the beat into concise age-appropriate comic copy; exact must preserve the supplied reader-facing wording and only classify or split it. Never ask the image model to invent story copy. For visual direction work, return only the result for the supplied stage. At visual-style return only visual_style. At visual-bible use the already selected style, define only supplied Story Plan entities, preserve their IDs when possible, and do not add incidental props or background subjects. The application owns final entity membership, IDs, reference requirement, and asset lineage. Do not write workflow state, issue approvals, access tools, or add prose outside the structured result.', 'openai', 'gpt-5.6-terra', 'medium', 1, 'confirmed', 1, 1, 1786752000000, 1786752000000, 'local-admin', 'local-admin')
ON CONFLICT(`id`) DO NOTHING;
--> statement-breakpoint
INSERT INTO `agent_versions` (`id`, `agent_id`, `version_number`, `parent_version_id`, `display_name`, `purpose`, `role`, `skill_id`, `instructions`, `provider`, `model_id`, `reasoning_effort`, `max_turns`, `status`, `is_active`, `revision`, `created_at_ms`, `updated_at_ms`, `created_by`, `updated_by`) VALUES
  ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000a001', 1, NULL, 'Kids Booklet Manager', 'Select one stage-valid registered specialist.', 'manager', NULL, 'Choose exactly one registered specialist tool. Never write data or perform workflow transitions.', 'openai', 'gpt-5.6-luna', 'low', 2, 'confirmed', 1, 1, 1786752000000, 1786752000000, 'local-admin', 'local-admin'),
  ('00000000-0000-4000-8000-00000000b101', '00000000-0000-4000-8000-00000000a101', 1, NULL, 'Intake Readiness Specialist', 'Assess audience-profile readiness.', 'specialist', 'intake_readiness@1', 'You are a bounded Kids Booklet specialist. Author only the requested structured result from the supplied approved context and skill input. Use the story''s actual names, setting, actions, reading age, and continuity constraints; never replace them with generic placeholders. Keep reader-facing titles and text concise enough to fit their specified booklet page region. For Story Plan entity changes, use kind ''existing'' only with an ID supplied in the input; use kind ''new'' with a clientKey and never invent a persistent ID. For Page Plan drafts, never supply pageId values; the application assigns and preserves them. For Page Plan work, create professional single-scene comic lettering. Each page lettering array is the exact reading order and may contain title, narration, dialogue, thought, and sound_effect elements. Use dialogue or effects only when they strengthen the supplied beat. Dialogue and thought elements must name a supplied on-page character ID as speakerEntityId. Keep story pages to at most five elements and 45 total words. readerText must equal the lettering texts joined with one space. The input copyMode controls authorship: creative may rewrite the beat into concise age-appropriate comic copy; exact must preserve the supplied reader-facing wording and only classify or split it. Never ask the image model to invent story copy. For visual direction work, return only the result for the supplied stage. At visual-style return only visual_style. At visual-bible use the already selected style, define only supplied Story Plan entities, preserve their IDs when possible, and do not add incidental props or background subjects. The application owns final entity membership, IDs, reference requirement, and asset lineage. Do not write workflow state, issue approvals, access tools, or add prose outside the structured result.', 'openai', 'gpt-5.6-terra', 'medium', 1, 'confirmed', 1, 1, 1786752000000, 1786752000000, 'local-admin', 'local-admin'),
  ('00000000-0000-4000-8000-00000000b102', '00000000-0000-4000-8000-00000000a102', 1, NULL, 'Story Planning Specialist', 'Draft and revise story plans.', 'specialist', 'story_planning_revision@1', (SELECT `instructions` FROM `agent_versions` WHERE `id` = '00000000-0000-4000-8000-00000000b101'), 'openai', 'gpt-5.6-terra', 'medium', 1, 'confirmed', 1, 1, 1786752000000, 1786752000000, 'local-admin', 'local-admin'),
  ('00000000-0000-4000-8000-00000000b103', '00000000-0000-4000-8000-00000000a103', 1, NULL, 'Story Quality Specialist', 'Review and repair story-plan quality.', 'specialist', 'quality_review_targeted_repair@1', (SELECT `instructions` FROM `agent_versions` WHERE `id` = '00000000-0000-4000-8000-00000000b101'), 'openai', 'gpt-5.6-sol', 'medium', 1, 'confirmed', 1, 1, 1786752000000, 1786752000000, 'local-admin', 'local-admin'),
  ('00000000-0000-4000-8000-00000000b104', '00000000-0000-4000-8000-00000000a104', 1, NULL, 'Visual Direction Specialist', 'Plan visual style and canonical references.', 'specialist', 'visual_direction_reference_planning@1', (SELECT `instructions` FROM `agent_versions` WHERE `id` = '00000000-0000-4000-8000-00000000b101'), 'openai', 'gpt-5.6-terra', 'medium', 1, 'confirmed', 1, 1, 1786752000000, 1786752000000, 'local-admin', 'local-admin'),
  ('00000000-0000-4000-8000-00000000b105', '00000000-0000-4000-8000-00000000a105', 1, NULL, 'Booklet Specification Specialist', 'Recommend booklet geometry and page count.', 'specialist', 'booklet_specification@1', (SELECT `instructions` FROM `agent_versions` WHERE `id` = '00000000-0000-4000-8000-00000000b101'), 'openai', 'gpt-5.6-terra', 'medium', 1, 'confirmed', 1, 1, 1786752000000, 1786752000000, 'local-admin', 'local-admin'),
  ('00000000-0000-4000-8000-00000000b106', '00000000-0000-4000-8000-00000000a106', 1, NULL, 'Page Planning Specialist', 'Create structured page plans and comic lettering.', 'specialist', 'page_planning_writing@1', (SELECT `instructions` FROM `agent_versions` WHERE `id` = '00000000-0000-4000-8000-00000000b101'), 'openai', 'gpt-5.6-terra', 'medium', 1, 'confirmed', 1, 1, 1786752000000, 1786752000000, 'local-admin', 'local-admin'),
  ('00000000-0000-4000-8000-00000000b107', '00000000-0000-4000-8000-00000000a107', 1, NULL, 'Image Prompt Specialist', 'Compile approved constraints into image prompts.', 'specialist', 'image_prompt_compilation@1', (SELECT `instructions` FROM `agent_versions` WHERE `id` = '00000000-0000-4000-8000-00000000b101'), 'openai', 'gpt-5.6-terra', 'medium', 1, 'confirmed', 1, 1, 1786752000000, 1786752000000, 'local-admin', 'local-admin')
ON CONFLICT(`id`) DO NOTHING;
--> statement-breakpoint
INSERT INTO `agent_version_events` (`id`, `agent_id`, `agent_version_id`, `action`, `actor`, `metadata_json`, `created_at_ms`)
SELECT '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000b001', 'create', 'local-admin', '{"schemaVersion":"1","seed":true}', 1786752000000 UNION ALL
SELECT '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000b001', 'confirm', 'local-admin', '{"schemaVersion":"1","seed":true}', 1786752000000 UNION ALL
SELECT '00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000b001', 'activate', 'local-admin', '{"schemaVersion":"1","seed":true}', 1786752000000;
--> statement-breakpoint
INSERT INTO `agent_version_events` (`id`, `agent_id`, `agent_version_id`, `action`, `actor`, `metadata_json`, `created_at_ms`) VALUES
  ('00000000-0000-4000-8000-00000000c101', '00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-00000000b101', 'create', 'local-admin', '{"schemaVersion":"1","seed":true}', 1786752000000),
  ('00000000-0000-4000-8000-00000000d101', '00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-00000000b101', 'confirm', 'local-admin', '{"schemaVersion":"1","seed":true}', 1786752000000),
  ('00000000-0000-4000-8000-00000000e101', '00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-00000000b101', 'activate', 'local-admin', '{"schemaVersion":"1","seed":true}', 1786752000000),
  ('00000000-0000-4000-8000-00000000c102', '00000000-0000-4000-8000-00000000a102', '00000000-0000-4000-8000-00000000b102', 'create', 'local-admin', '{"schemaVersion":"1","seed":true}', 1786752000000),
  ('00000000-0000-4000-8000-00000000d102', '00000000-0000-4000-8000-00000000a102', '00000000-0000-4000-8000-00000000b102', 'confirm', 'local-admin', '{"schemaVersion":"1","seed":true}', 1786752000000),
  ('00000000-0000-4000-8000-00000000e102', '00000000-0000-4000-8000-00000000a102', '00000000-0000-4000-8000-00000000b102', 'activate', 'local-admin', '{"schemaVersion":"1","seed":true}', 1786752000000),
  ('00000000-0000-4000-8000-00000000c103', '00000000-0000-4000-8000-00000000a103', '00000000-0000-4000-8000-00000000b103', 'create', 'local-admin', '{"schemaVersion":"1","seed":true}', 1786752000000),
  ('00000000-0000-4000-8000-00000000d103', '00000000-0000-4000-8000-00000000a103', '00000000-0000-4000-8000-00000000b103', 'confirm', 'local-admin', '{"schemaVersion":"1","seed":true}', 1786752000000),
  ('00000000-0000-4000-8000-00000000e103', '00000000-0000-4000-8000-00000000a103', '00000000-0000-4000-8000-00000000b103', 'activate', 'local-admin', '{"schemaVersion":"1","seed":true}', 1786752000000),
  ('00000000-0000-4000-8000-00000000c104', '00000000-0000-4000-8000-00000000a104', '00000000-0000-4000-8000-00000000b104', 'create', 'local-admin', '{"schemaVersion":"1","seed":true}', 1786752000000),
  ('00000000-0000-4000-8000-00000000d104', '00000000-0000-4000-8000-00000000a104', '00000000-0000-4000-8000-00000000b104', 'confirm', 'local-admin', '{"schemaVersion":"1","seed":true}', 1786752000000),
  ('00000000-0000-4000-8000-00000000e104', '00000000-0000-4000-8000-00000000a104', '00000000-0000-4000-8000-00000000b104', 'activate', 'local-admin', '{"schemaVersion":"1","seed":true}', 1786752000000),
  ('00000000-0000-4000-8000-00000000c105', '00000000-0000-4000-8000-00000000a105', '00000000-0000-4000-8000-00000000b105', 'create', 'local-admin', '{"schemaVersion":"1","seed":true}', 1786752000000),
  ('00000000-0000-4000-8000-00000000d105', '00000000-0000-4000-8000-00000000a105', '00000000-0000-4000-8000-00000000b105', 'confirm', 'local-admin', '{"schemaVersion":"1","seed":true}', 1786752000000),
  ('00000000-0000-4000-8000-00000000e105', '00000000-0000-4000-8000-00000000a105', '00000000-0000-4000-8000-00000000b105', 'activate', 'local-admin', '{"schemaVersion":"1","seed":true}', 1786752000000),
  ('00000000-0000-4000-8000-00000000c106', '00000000-0000-4000-8000-00000000a106', '00000000-0000-4000-8000-00000000b106', 'create', 'local-admin', '{"schemaVersion":"1","seed":true}', 1786752000000),
  ('00000000-0000-4000-8000-00000000d106', '00000000-0000-4000-8000-00000000a106', '00000000-0000-4000-8000-00000000b106', 'confirm', 'local-admin', '{"schemaVersion":"1","seed":true}', 1786752000000),
  ('00000000-0000-4000-8000-00000000e106', '00000000-0000-4000-8000-00000000a106', '00000000-0000-4000-8000-00000000b106', 'activate', 'local-admin', '{"schemaVersion":"1","seed":true}', 1786752000000),
  ('00000000-0000-4000-8000-00000000c107', '00000000-0000-4000-8000-00000000a107', '00000000-0000-4000-8000-00000000b107', 'create', 'local-admin', '{"schemaVersion":"1","seed":true}', 1786752000000),
  ('00000000-0000-4000-8000-00000000d107', '00000000-0000-4000-8000-00000000a107', '00000000-0000-4000-8000-00000000b107', 'confirm', 'local-admin', '{"schemaVersion":"1","seed":true}', 1786752000000),
  ('00000000-0000-4000-8000-00000000e107', '00000000-0000-4000-8000-00000000a107', '00000000-0000-4000-8000-00000000b107', 'activate', 'local-admin', '{"schemaVersion":"1","seed":true}', 1786752000000)
ON CONFLICT(`id`) DO NOTHING;
