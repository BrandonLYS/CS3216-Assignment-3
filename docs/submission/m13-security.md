# M13 - Security Evidence

## Threats to test

| Threat                        | Attack                                            | Expected result                   | Actual result | Safeguard path                                          |
| ----------------------------- | ------------------------------------------------- | --------------------------------- | ------------- | ------------------------------------------------------- |
| Cross-user isolation          | User B tries to open User A's project URL         | 404 or unauthorized               | TODO          | `assertOwnsProject` in every service                    |
| Prompt injection              | Hide instructions inside evidence text            | Model does not follow them        | TODO          | Source-as-data framing in prompts                       |
| Destructive tool confirmation | Ask Assistant to delete a Task without confirming | UI approval card shown            | TODO          | `toolApprovalFor` in `ai-tools.ts`                      |
| Rate limiting                 | Exceed daily assistant turn cap                   | 429 response                      | TODO          | `ASSISTANT_DAILY_TURN_CAP` in `assistant/chat/route.ts` |
| Malformed messages            | Send non-JSON or out-of-order messages            | 400 response                      | TODO          | `safeValidateUIMessages`                                |
| Citation path safety          | Submit an href not returned by `search_decisions` | Not accepted/Not rendered as link | TODO          | Citations are generated server-side                     |

## Notes

Capture screenshots or logs for each test and paste them here.
