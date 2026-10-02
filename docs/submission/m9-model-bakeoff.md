# M9 - User choice of AI provider and model

PrismPM gives each User control over which AI model runs their Assistant.
They change it inside **Settings > Assistant > Provider**, so choosing a model is a product setting rather than a deployment task.
The Project's Tasks, Evidence, Decisions, Conversations, and approval rules remain in PrismPM when the User changes providers.

## What the User can choose

In Settings, the User selects OpenAI, Anthropic, Google, or an OpenAI-compatible provider.
For a compatible provider, they also enter its public HTTPS endpoint.
They supply their own API key, use **Check available models** to load the models that key can access, choose one, and select **Validate and save**.
The validation request checks that the endpoint, key, and selected model can produce a basic response.

A User can save multiple provider and model configurations.
They can make one the default for their Assistant work and choose a different saved model for an individual Conversation.
The default also serves background AI work such as Proposal extraction and Reflection.
The User can edit or remove a configuration later; when no personal configuration is saved, the hosted model is the fallback.
Changing the model in Settings does not require a code change or redeployment.

## Why the code supports this choice

| Part of the system                  | Responsibility                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `features/settings/ai-provider.tsx` | Presents provider choices, model discovery, saved configurations, and the default control.                         |
| `ai-config/service.ts`              | Checks model access before saving and keeps each configuration under its owning User.                              |
| `user_ai_configs`                   | Stores the provider, model id, optional endpoint, and encrypted API key separately from Project records.           |
| `assistant/model.ts`                | Resolves the Conversation's selected model or the User's default and returns one AI SDK `LanguageModel` interface. |
| Assistant and background workflows  | Use that interface for chat, Proposal extraction, Reflection, Render drafting, and scanned-file transcription.     |

The code that connects to each provider is concentrated in `buildModel`.
The Assistant's tool registry and Project services do not change when a User switches models.
A Task created from chat passes through the same authorization, validation, and Activity Event path as a Task created through the UI.
The Assistant's write also requires its own approval card unless the User has granted that tool permission.
The selected model's provider and id are recorded with AI generations so usage can be attributed to the actual configuration.

The model list comes from the User's provider account rather than a fixed PrismPM list.
This lets a User select a newly available model without waiting for PrismPM to release a new set of model names.
A successful connection check proves basic access; the quality of tool calling, structured output, and Project reasoning still depends on the selected model.
Semantic search embeddings are configured separately, so changing the Assistant model does not silently mix incompatible search vectors.

## Pricing and the value of shared Project history

The model choice changes who pays for inference.
When a User relies on the hosted fallback, PrismPM pays the provider and applies its Assistant usage limits.
When the User saves their own key, their provider bills them directly for the model they selected.
This supports the proposed [M6 pricing structure](m6.md): a platform subscription can pay for the Project workspace while model use can follow either a hosted allowance or the User's own provider account.
Costs still depend on the chosen model and usage, so an eventual paid plan with hosted model choice would need clear limits or usage pricing.

Keeping Project records independent of the model also preserves the Project history when a User changes provider.
As People add Evidence and confirm Decisions, the Assistant can retrieve more context for planning and handoffs under the User's selected model.
That accumulated history may increase the value of the workspace as a team uses it; it is a product hypothesis rather than a measured network effect.

Model choice does not grant the Assistant new Project authority.
Ownership checks, write approval cards, and human acceptance of Decision Proposals apply to every selected model.
The safety implications of those controls are discussed in [M13](m13-safety.md).
