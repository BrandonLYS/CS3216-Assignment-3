"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { discoverAiModelsAction, removeAiConfigAction, saveAiConfigAction } from "@/server/modules/ai-config/actions";
import type { AiConfigSummary } from "@/server/modules/ai-config/service";
import type { AiProvider as AiProviderName } from "@/shared/domain";
import { ActionForm, Button, Panel, SelectField, TextField } from "@/shared/ui";

const providers = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google Gemini" },
  { value: "openai_compatible", label: "OpenAI-compatible" },
];

export function AiProvider({ config }: { config: AiConfigSummary | null }) {
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [provider, setProvider] = React.useState(config?.provider ?? "openai");
  const [model, setModel] = React.useState(config?.model ?? "");
  const [availableModels, setAvailableModels] = React.useState<string[]>([]);
  const [discovering, setDiscovering] = React.useState(false);
  const [discoveryError, setDiscoveryError] = React.useState<string | null>(null);
  const sameProvider = config?.provider === provider;

  const changeProvider = (next: AiProviderName) => {
    setProvider(next);
    setModel(config?.provider === next ? config.model : "");
    setAvailableModels([]);
    setDiscoveryError(null);
  };

  const discover = async () => {
    if (!formRef.current) return;
    setDiscovering(true);
    setDiscoveryError(null);

    const result = await discoverAiModelsAction(new FormData(formRef.current));
    setDiscovering(false);

    if (!result.ok) {
      setAvailableModels([]);
      setDiscoveryError(result.error);
      return;
    }

    const found = result.data;
    setAvailableModels(found);
    setModel((current) => (found.includes(current) ? current : (found[0] ?? "")));

    if (!found.length) {
      setDiscoveryError("The provider returned no text-generation models for this key.");
    }
  };

  const modelOptions = [
    ...(sameProvider && config && !availableModels.includes(config.model)
      ? [{ value: config.model, label: `${config.model} (saved - check availability)` }]
      : []),
    ...availableModels.map((value) => ({ value, label: value })),
  ];

  return (
    <div className="flex flex-col gap-3">
      <Panel className="p-5">
        <ActionForm
          action={saveAiConfigAction}
          submitLabel="Validate and save"
          onSuccess={() => router.refresh()}
          formRef={formRef}
          footerStart={
            <Button type="button" loading={discovering} onClick={() => void discover()}>
              Check available models
            </Button>
          }
        >
          <SelectField
            name="provider"
            label="Provider"
            options={providers}
            value={provider}
            onChange={(event) => changeProvider(event.target.value as AiProviderName)}
          />
          <SelectField
            name="model"
            label="Model"
            required
            value={model}
            onChange={(event) => setModel(event.target.value)}
            options={modelOptions}
            placeholder="Check the provider to load available models"
            hint="Loaded directly from the provider for this API key."
          />
          {provider === "openai_compatible" && (
            <TextField
              name="baseUrl"
              label="Base URL"
              type="url"
              required
              defaultValue={sameProvider ? (config?.baseUrl ?? "") : ""}
              placeholder="https://api.example.com/v1"
              hint="Public HTTPS only. Redirects and private network addresses are blocked."
            />
          )}
          <TextField
            name="apiKey"
            label="API key"
            type="password"
            autoComplete="new-password"
            required={!sameProvider}
            placeholder={sameProvider ? "Leave blank to keep the stored key" : "Required"}
            hint={sameProvider ? "A key is stored. Enter a new value only to replace it." : undefined}
          />
          <p className="text-caption text-ink-subtle">
            Checking models reads the provider&apos;s model catalog. Saving then makes a small generation request to
            validate access to the selected model, which may incur a minimal charge.
          </p>
          {discoveryError && (
            <p className="text-caption text-tag-red" role="alert">
              {discoveryError}
            </p>
          )}
        </ActionForm>
      </Panel>
      {config && (
        <Panel className="p-5">
          <ActionForm
            action={removeAiConfigAction}
            submitLabel="Remove personal configuration and use environment fallback"
            danger
            onSuccess={() => router.refresh()}
          >
            <p className="text-caption text-ink-subtle">
              Removal deletes your stored credential. The Assistant will use the deployment operator&apos;s environment
              configuration when available.
            </p>
          </ActionForm>
        </Panel>
      )}
    </div>
  );
}
